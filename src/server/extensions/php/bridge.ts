import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

/**
 * The PHP bridge: one long-lived `php` CLI worker (php-bridge/bridge.php) that loads third-party
 * extensions written for the Laravel version of Paymenter. The protocol is newline-delimited JSON over
 * stdio. The panel sends `{id, method, params}`; the worker answers `{id, result|error}` and may call back
 * into the panel with `{hid, host, params}` (HTTP, settings, cache, payments ...).
 *
 * Security: the PHP code runs with the permissions of the panel process (same user, same filesystem,
 * same network). Only code below `extensions/` is ever loaded and the names that reach PHP are validated
 * against `[A-Za-z][A-Za-z0-9_]*`; no PHP source ever comes from request data.
 */

export class PhpBridgeError extends Error {
    constructor(message: string, public kind: 'unavailable' | 'unsupported' | 'exception' | 'http' | 'crashed' | 'timeout' = 'exception', public status?: number, public phpClass?: string) {
        super(message);
        this.name = 'PhpBridgeError';
    }
}

export type HostHandler = (params: any) => Promise<any> | any;

export interface PhpAvailability {
    ok: boolean;
    binary: string;
    version?: string;
    reason?: string;
}

const MIN_PHP = [8, 1];

let availability: PhpAvailability | null = null;

/** Is a usable `php` CLI installed? (cached; `PHP_BIN` overrides the binary, `PHP_EXTENSIONS=false` disables the bridge) */
export function phpAvailability(refresh = false): PhpAvailability {
    if (availability && !refresh) return availability;
    const binary = process.env.PHP_BIN || 'php';
    if (/^(0|false|off|no)$/i.test(process.env.PHP_EXTENSIONS ?? '')) {
        return (availability = { ok: false, binary, reason: 'PHP extension support is disabled (PHP_EXTENSIONS=false).' });
    }
    const r = spawnSync(binary, ['-r', 'echo PHP_VERSION;'], { encoding: 'utf8', timeout: 10_000 });
    if (r.error || r.status !== 0) {
        return (availability = { ok: false, binary, reason: `PHP extensions need the PHP CLI (>= ${MIN_PHP.join('.')}), but "${binary}" could not be run${r.error ? ` (${(r.error as any).code ?? r.error.message})` : ''}. Install php-cli or set PHP_BIN; the rest of the panel is unaffected.` });
    }
    const version = r.stdout.trim();
    const [maj, min] = version.split('.').map(Number);
    if (maj < MIN_PHP[0] || (maj === MIN_PHP[0] && min < MIN_PHP[1])) {
        return (availability = { ok: false, binary, version, reason: `PHP ${version} is too old for the extension bridge (>= ${MIN_PHP.join('.')} required).` });
    }
    return (availability = { ok: true, binary, version });
}

interface Pending {
    resolve: (v: any) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
}

export class PhpBridge {
    private proc: ChildProcessWithoutNullStreams | null = null;
    private nextId = 0;
    private pending = new Map<number, Pending>();
    private buffer = '';
    private hostHandlers = new Map<string, HostHandler>();
    /** `boot` params of every booted extension, replayed after the worker restarted */
    private bootParams = new Map<string, any>();
    private starting = false;

    constructor(private extensionsDir: string, private bridgeScript: string, private timeoutMs = Number(process.env.PHP_BRIDGE_TIMEOUT_MS) || 60_000) {}

    onHost(method: string, handler: HostHandler) {
        this.hostHandlers.set(method, handler);
    }

    get running() {
        return !!this.proc;
    }

    private start() {
        const a = phpAvailability();
        if (!a.ok) throw new PhpBridgeError(a.reason!, 'unavailable');
        const proc = spawn(a.binary, ['-d', 'memory_limit=256M', this.bridgeScript, this.extensionsDir], { stdio: ['pipe', 'pipe', 'pipe'], cwd: path.dirname(this.extensionsDir) });
        this.proc = proc;
        this.buffer = '';
        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (chunk: string) => this.onData(proc, chunk));
        proc.stderr.setEncoding('utf8');
        proc.stderr.on('data', (chunk: string) => {
            for (const line of chunk.split('\n')) if (line.trim()) console.warn(`[php] ${line}`);
        });
        proc.stdin.on('error', () => {
            /* worker died: handled by exit */
        });
        proc.on('error', (e) => this.onExit(proc, `could not start php: ${e.message}`));
        proc.on('exit', (code, signal) => this.onExit(proc, `php worker exited (${signal ?? code})`));
    }

    private onExit(proc: ChildProcessWithoutNullStreams, why: string) {
        if (this.proc !== proc) return;
        this.proc = null;
        for (const [id, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new PhpBridgeError(why, 'crashed'));
            this.pending.delete(id);
        }
    }

    private send(msg: unknown) {
        this.proc?.stdin.write(JSON.stringify(msg) + '\n');
    }

    private onData(proc: ChildProcessWithoutNullStreams, chunk: string) {
        this.buffer += chunk;
        let nl: number;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, nl).trim();
            this.buffer = this.buffer.slice(nl + 1);
            if (!line) continue;
            let msg: any;
            try {
                msg = JSON.parse(line);
            } catch {
                console.warn(`[php] unparsable bridge output: ${line.slice(0, 200)}`);
                continue;
            }
            if (msg.host !== undefined) void this.serveHost(proc, msg);
            else this.settle(msg);
        }
    }

    private settle(msg: any) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) {
            const e = msg.error;
            p.reject(new PhpBridgeError(e.message ?? String(e), e.kind ?? 'exception', e.status, e.class));
        } else p.resolve(msg.result);
    }

    private async serveHost(proc: ChildProcessWithoutNullStreams, msg: { hid: number; host: string; params: any }) {
        const handler = this.hostHandlers.get(msg.host);
        let reply: any;
        try {
            if (!handler) throw new Error(`Unsupported host call "${msg.host}"`);
            reply = { hid: msg.hid, result: (await handler(msg.params)) ?? null };
        } catch (e: any) {
            reply = { hid: msg.hid, error: e?.abort ? { kind: 'abort', status: e.status, message: e.message } : { message: String(e?.message ?? e) } };
        }
        if (this.proc === proc) this.send(reply);
    }

    /** one RPC to the worker (starts it on first use) */
    async call<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
        if (!this.proc) {
            this.start();
            if (method !== 'boot') await this.replayBoots();
        }
        return new Promise<T>((resolve, reject) => {
            const id = ++this.nextId;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new PhpBridgeError(`PHP extension call "${method}" timed out after ${Math.round(this.timeoutMs / 1000)}s`, 'timeout'));
                // a hung worker cannot be trusted any more
                this.proc?.kill('SIGKILL');
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.send({ id, method, params });
        });
    }

    private async replayBoots() {
        for (const params of this.bootParams.values()) {
            try {
                await this.call('boot', params);
            } catch (e: any) {
                console.warn(`[php] re-boot of ${params.name} failed: ${e.message}`);
            }
        }
    }

    async boot(params: { type: string; name: string; config: Record<string, any> }) {
        this.bootParams.set(params.name, params);
        if (!this.proc) this.start();
        return this.call('boot', params);
    }

    stop() {
        this.proc?.kill();
        this.proc = null;
    }
}
