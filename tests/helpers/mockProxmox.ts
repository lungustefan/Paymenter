import http from 'node:http';
import type { AddressInfo } from 'node:net';

type Bag = Record<string, any>;

export const MOCK_TOKEN = { username: 'root@pam', token_id: 'paymenter', token_secret: 'secret-uuid' };
export const MOCK_PASSWORD = 'pve-pass';

/**
 * In-memory imitation of the parts of the Proxmox VE API (`/api2/json`) the extension uses.
 * It is NOT a real Proxmox: it only mirrors the documented request/response shapes.
 */
export class MockProxmox {
    server!: http.Server;
    vms = new Map<number, Bag>();
    snapshots = new Map<number, Bag[]>();
    log: { method: string; path: string; body: Bag }[] = [];
    failNext: string | null = null; // path substring that answers 500 once
    nextVmid = 100;
    loginCount = 0;

    constructor() {
        this.vms.set(9000, { vmid: 9000, name: 'debian-template', template: 1, status: 'stopped', config: { cores: 1, memory: 512, scsi0: 'local-lvm:base-9000-disk-0,size=3G', ide2: 'local-lvm:vm-9000-cloudinit,media=cdrom' } });
    }

    get url() {
        return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    }
    get port() {
        return (this.server.address() as AddressInfo).port;
    }

    async start(port = 0) {
        this.server = http.createServer((req, res) => void this.handle(req, res));
        await new Promise<void>((r) => this.server.listen(port, '127.0.0.1', r));
        return this;
    }
    stop() {
        return new Promise<void>((r) => this.server.close(() => r()));
    }
    calls(method: string, re: RegExp) {
        return this.log.filter((l) => l.method === method && re.test(l.path));
    }

    private authorized(req: http.IncomingMessage, method: string): boolean {
        const a = req.headers.authorization;
        if (a) return a === `PVEAPIToken=${MOCK_TOKEN.username}!${MOCK_TOKEN.token_id}=${MOCK_TOKEN.token_secret}`;
        const cookie = /PVEAuthCookie=([^;]+)/.exec(String(req.headers.cookie ?? ''));
        if (!cookie || decodeURIComponent(cookie[1]) !== 'TICKET-' + this.loginCount) return false;
        return method === 'GET' || req.headers.csrfpreventiontoken === 'CSRF-' + this.loginCount;
    }

    private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const url = new URL(req.url!, 'http://x');
        const path = url.pathname.replace(/^\/api2\/json/, '');
        const method = req.method!;
        const body: Bag = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()).entries());
        for (const [k, v] of url.searchParams) body[k] = v;
        this.log.push({ method, path, body });
        const send = (status: number, payload: any) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payload));
        };
        const ok = (data: any = null) => send(200, { data });

        if (method === 'POST' && path === '/access/ticket') {
            if (body.username !== MOCK_TOKEN.username || body.password !== MOCK_PASSWORD) return send(401, { data: null });
            this.loginCount++;
            return ok({ ticket: 'TICKET-' + this.loginCount, CSRFPreventionToken: 'CSRF-' + this.loginCount, username: body.username });
        }
        if (!this.authorized(req, method)) return send(401, { data: null, message: 'no ticket' });
        if (this.failNext && path.includes(this.failNext)) {
            this.failNext = null;
            return send(500, { data: null, message: 'mock failure' });
        }

        let m: RegExpExecArray | null;
        if (method === 'GET' && path === '/nodes') return ok([{ node: 'pve1', status: 'online' }]);
        if (method === 'GET' && path === '/cluster/nextid') return ok(String(this.nextVmid));
        if (method === 'GET' && path === '/pools') return ok([{ poolid: 'customers' }]);
        if (method === 'GET' && path === '/nodes/pve1/storage') return ok([{ storage: 'local-lvm' }, { storage: 'ssd' }]);
        if (method === 'GET' && path === '/nodes/pve1/network') return ok([{ iface: 'vmbr0', type: 'bridge' }, { iface: 'eth0', type: 'eth' }]);
        if (method === 'GET' && path === '/nodes/pve1/qemu') return ok([...this.vms.values()].map((v) => ({ vmid: v.vmid, name: v.name, status: v.status, template: v.template ?? 0 })));
        if (method === 'GET' && (m = /^\/nodes\/pve1\/tasks\/([^/]+)\/status$/.exec(path))) return ok({ status: 'stopped', exitstatus: decodeURIComponent(m[1]).includes('fail') ? 'command failed' : 'OK' });

        if ((m = /^\/nodes\/pve1\/qemu\/(\d+)(\/.*)?$/.exec(path))) {
            const vmid = Number(m[1]);
            const sub = m[2] ?? '';
            const vm = this.vms.get(vmid);
            const upid = `UPID:pve1:0001:0002:0003:${sub.replace(/\W/g, '') || 'task'}:${vmid}:root@pam:`;
            if (method === 'POST' && sub === '/clone') {
                if (!vm) return send(500, { data: null, message: `Configuration file 'nodes/pve1/qemu-server/${vmid}.conf' does not exist` });
                const newid = Number(body.newid);
                if (this.vms.has(newid)) return send(500, { data: null, message: `VM ${newid} already exists` });
                this.vms.set(newid, { vmid: newid, name: body.name, status: 'stopped', clone: body, config: { ...vm.config, name: body.name } });
                return ok(upid);
            }
            if (!vm) return send(500, { data: null, message: `Configuration file 'nodes/pve1/qemu-server/${vmid}.conf' does not exist` });
            if (method === 'GET' && sub === '/status/current') return ok({ status: vm.status, uptime: vm.status === 'running' ? 3700 : 0, cpu: 0.02, cpus: vm.config.cores, mem: 300 * 1048576, maxmem: vm.config.memory * 1048576 });
            if (method === 'GET' && sub === '/config') return ok({ ...vm.config, name: vm.name });
            if (method === 'PUT' && sub === '/config') {
                Object.assign(vm.config, body);
                if (body.name) vm.name = body.name;
                return ok();
            }
            if (method === 'PUT' && sub === '/resize') {
                vm.config[body.disk] = String(vm.config[body.disk]).replace(/size=\w+/, `size=${body.size}`);
                return ok(upid);
            }
            if (method === 'POST' && (m = /^\/status\/(start|stop|shutdown|reboot|reset)$/.exec(sub))) {
                vm.status = m[1] === 'stop' || m[1] === 'shutdown' ? 'stopped' : 'running';
                return ok(upid);
            }
            if (method === 'DELETE' && sub === '') {
                if (vm.status === 'running') return send(500, { data: null, message: 'VM is running' });
                this.vms.delete(vmid);
                this.snapshots.delete(vmid);
                return ok(upid);
            }
            if (sub === '/snapshot') {
                const list = this.snapshots.get(vmid) ?? [];
                if (method === 'GET') return ok([...list, { name: 'current' }]);
                if (method === 'POST') {
                    list.push({ name: body.snapname, description: body.description ?? '', snaptime: 1700000000 });
                    this.snapshots.set(vmid, list);
                    return ok(upid);
                }
            }
            if ((m = /^\/snapshot\/([^/]+)(\/rollback)?$/.exec(sub))) {
                const list = this.snapshots.get(vmid) ?? [];
                if (method === 'DELETE') this.snapshots.set(vmid, list.filter((s) => s.name !== m![1]));
                return ok(upid);
            }
        }
        send(404, { data: null, message: `no mock for ${method} ${path}` });
    }
}
