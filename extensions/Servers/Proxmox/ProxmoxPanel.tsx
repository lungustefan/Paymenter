'use client';

import { useCallback, useEffect, useState } from 'react';
import { PrimaryButton, SecondaryButton, DangerButton } from '@themes/default/components/Button';
import { Input, Textarea } from '@themes/default/components/Form';
import { useConfirm, useNotify } from '@themes/default/components/Providers';

type Snapshot = { name: string; description: string; time: number | null };
export type PanelState = {
    status: string;
    uptime: number;
    cpu: number;
    cpus: number;
    mem: number;
    maxmem: number;
    ip: string | null;
    vmid: number;
    hostname: string;
    nameserver: string;
    searchdomain: string;
    sshKeysSet: boolean;
    snapshots: Snapshot[];
};

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
const duration = (s: number) => {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
};

/** Client area of a Proxmox service: status, power actions, console, reinstall, cloud-init and snapshots. */
export default function ProxmoxPanel({
    serviceId,
    initial,
    error,
    hostname,
    snapshotLimit,
    canEditNetwork,
    consoleUrl,
}: {
    serviceId: number;
    initial: PanelState | null;
    error: string | null;
    hostname: string;
    snapshotLimit: number;
    canEditNetwork: boolean;
    consoleUrl: string | null;
}) {
    const notify = useNotify();
    const confirm = useConfirm();
    const base = `/extensions/proxmox/${serviceId}`;
    const [state, setState] = useState<PanelState | null>(initial);
    const [loadError, setLoadError] = useState<string | null>(error);
    const [busy, setBusy] = useState<string | null>(null);
    const [ci, setCi] = useState({ password: '', ssh_keys: '', hostname, nameserver: initial?.nameserver ?? '', searchdomain: initial?.searchdomain ?? '' });
    const [reinstall, setReinstall] = useState({ password: '', ssh_key: '' });
    const [snap, setSnap] = useState({ name: '', description: '' });

    const call = useCallback(
        async (path: string, body?: Record<string, unknown>) => {
            const res = await fetch(base + path, {
                method: body ? 'POST' : 'GET',
                headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
            });
            const json = await res.json().catch(() => ({ ok: false, message: 'Unexpected response' }));
            if (!json.ok) throw new Error(json.message ?? 'Request failed');
            return json;
        },
        [base],
    );

    const refresh = useCallback(async () => {
        try {
            const json = await call('/state');
            setState(json.state);
            setLoadError(null);
        } catch (e: any) {
            setLoadError(e.message);
        }
    }, [call]);

    useEffect(() => {
        const id = setInterval(refresh, 5000);
        if (!initial) void refresh();
        return () => clearInterval(id);
    }, [refresh, initial]);

    async function act(key: string, path: string, body: Record<string, unknown>, success: string) {
        setBusy(key);
        try {
            await call(path, body);
            notify(success, 'success');
            await refresh();
        } catch (e: any) {
            notify(e.message, 'error');
        } finally {
            setBusy(null);
        }
    }

    const running = state?.status === 'running';
    const power = (action: string, label: string, text: string) =>
        confirm({ title: label, message: text, confirmText: label, callback: () => act('power-' + action, '/power', { action }, `${label} sent`) });

    return (
        <div className="bg-background-secondary border border-neutral p-6 rounded-lg space-y-6" data-testid="proxmox-panel">
            {loadError && <div className="bg-yellow-600/20 border-l-4 border-yellow-500 text-yellow-300 p-3 rounded" data-testid="proxmox-error">{loadError}</div>}

            {state && (
                <div>
                    <h4 className="text-lg font-semibold mb-2">Server</h4>
                    <div className="grid sm:grid-cols-2 gap-1 text-base">
                        <div>
                            Status:{' '}
                            <span data-testid="proxmox-status" className={running ? 'font-semibold text-green-500' : 'font-semibold text-orange-500'}>
                                {state.status}
                            </span>
                        </div>
                        <div>VM ID: <span className="text-base/50">{state.vmid}</span></div>
                        <div>Hostname: <span className="text-base/50">{state.hostname || '-'}</span></div>
                        <div>IP address: <span className="text-base/50">{state.ip ?? '-'}</span></div>
                        {running && (
                            <>
                                <div>Uptime: <span className="text-base/50">{duration(state.uptime)}</span></div>
                                <div>CPU: <span className="text-base/50">{(state.cpu * 100).toFixed(1)}% of {state.cpus} cores</span></div>
                                <div>Memory: <span className="text-base/50">{mb(state.mem)} / {mb(state.maxmem)}</span></div>
                            </>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                        <PrimaryButton disabled={running || busy !== null} onClick={() => act('power-start', '/power', { action: 'start' }, 'Start sent')}>Start</PrimaryButton>
                        <SecondaryButton disabled={!running || busy !== null} onClick={() => power('shutdown', 'Shutdown', 'Send an ACPI shutdown to the server?')}>Shutdown</SecondaryButton>
                        <SecondaryButton disabled={!running || busy !== null} onClick={() => power('reboot', 'Reboot', 'Reboot the server?')}>Reboot</SecondaryButton>
                        <DangerButton disabled={!running || busy !== null} onClick={() => power('stop', 'Stop', 'Force the server off? Unsaved data can be lost.')}>Stop</DangerButton>
                        {consoleUrl && (
                            <a href={consoleUrl} target="_blank" rel="noreferrer" className="inline-flex" data-testid="proxmox-console">
                                <SecondaryButton type="button">Console</SecondaryButton>
                            </a>
                        )}
                    </div>
                </div>
            )}

            {state && (
                <div>
                    <h4 className="text-lg font-semibold mb-2">Cloud-init settings</h4>
                    <div className="grid md:grid-cols-2 gap-3">
                        <Input name="proxmox_hostname" label="Hostname" value={ci.hostname} onChange={(e) => setCi({ ...ci, hostname: e.target.value })} />
                        <Input name="proxmox_password" label="New password" type="password" autoComplete="new-password" value={ci.password} onChange={(e) => setCi({ ...ci, password: e.target.value })} />
                        {canEditNetwork && (
                            <>
                                <Input name="proxmox_nameserver" label="DNS server(s)" value={ci.nameserver} onChange={(e) => setCi({ ...ci, nameserver: e.target.value })} />
                                <Input name="proxmox_searchdomain" label="Search domain" value={ci.searchdomain} onChange={(e) => setCi({ ...ci, searchdomain: e.target.value })} />
                            </>
                        )}
                        <Textarea name="proxmox_ssh_keys" label={state.sshKeysSet ? 'Replace SSH public keys' : 'SSH public keys'} divClass="md:col-span-2" value={ci.ssh_keys} onChange={(e) => setCi({ ...ci, ssh_keys: e.target.value })} />
                    </div>
                    <p className="text-sm text-base/50 mt-1">Changes are applied on the next reboot of the server.</p>
                    <div className="mt-3">
                        <PrimaryButton
                            disabled={busy !== null}
                            onClick={() =>
                                act('ci', '/cloud-init', { password: ci.password, ssh_keys: ci.ssh_keys, hostname: ci.hostname, ...(canEditNetwork ? { nameserver: ci.nameserver, searchdomain: ci.searchdomain } : {}) }, 'Settings saved').then(() => setCi((c) => ({ ...c, password: '', ssh_keys: '' })))
                            }
                        >
                            Save settings
                        </PrimaryButton>
                    </div>
                </div>
            )}

            {snapshotLimit > 0 && state && (
                <div>
                    <h4 className="text-lg font-semibold mb-2">Snapshots ({state.snapshots.length}/{snapshotLimit})</h4>
                    <ul className="space-y-2 mb-3" data-testid="proxmox-snapshots">
                        {state.snapshots.map((s) => (
                            <li key={s.name} className="flex flex-wrap items-center justify-between gap-2 border border-neutral rounded-md p-2">
                                <span>
                                    <span className="font-semibold">{s.name}</span> <span className="text-base/50">{s.description}</span>
                                </span>
                                <span className="flex gap-2">
                                    <SecondaryButton disabled={busy !== null} onClick={() => confirm({ title: 'Rollback', message: `Roll back to ${s.name}? Current data is lost.`, confirmText: 'Rollback', callback: () => act('rb', `/snapshots/${encodeURIComponent(s.name)}/rollback`, {}, 'Rollback started') })}>Rollback</SecondaryButton>
                                    <DangerButton disabled={busy !== null} onClick={() => confirm({ title: 'Delete', message: `Delete snapshot ${s.name}?`, confirmText: 'Delete', callback: () => act('del', `/snapshots/${encodeURIComponent(s.name)}/delete`, {}, 'Snapshot deleted') })}>Delete</DangerButton>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {state.snapshots.length < snapshotLimit && (
                        <div className="grid md:grid-cols-2 gap-3">
                            <Input name="proxmox_snap_name" label="Name" value={snap.name} onChange={(e) => setSnap({ ...snap, name: e.target.value })} />
                            <Input name="proxmox_snap_description" label="Description" value={snap.description} onChange={(e) => setSnap({ ...snap, description: e.target.value })} />
                            <div>
                                <PrimaryButton disabled={busy !== null || !snap.name} onClick={() => act('snap', '/snapshots', snap, 'Snapshot created').then(() => setSnap({ name: '', description: '' }))}>Create snapshot</PrimaryButton>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {state && (
                <div>
                    <h4 className="text-lg font-semibold mb-2">Reinstall</h4>
                    <p className="text-sm text-base/50 mb-2">Destroys the server including all data and installs the template again.</p>
                    <div className="grid md:grid-cols-2 gap-3">
                        <Input name="proxmox_re_password" label="Root password" type="password" autoComplete="new-password" value={reinstall.password} onChange={(e) => setReinstall({ ...reinstall, password: e.target.value })} />
                        <Textarea name="proxmox_re_key" label="SSH public key (optional)" value={reinstall.ssh_key} onChange={(e) => setReinstall({ ...reinstall, ssh_key: e.target.value })} />
                    </div>
                    <div className="mt-3">
                        <DangerButton
                            disabled={busy !== null || reinstall.password.length < 8}
                            onClick={() => confirm({ title: 'Reinstall', message: 'All data on the server will be lost. Continue?', confirmText: 'Reinstall', callback: () => act('reinstall', '/reinstall', reinstall, 'Server reinstalled').then(() => setReinstall({ password: '', ssh_key: '' })) })}
                        >
                            Reinstall
                        </DangerButton>
                    </div>
                </div>
            )}
        </div>
    );
}
