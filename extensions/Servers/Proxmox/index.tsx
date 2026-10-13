import { Server } from '@/server/extensions/Server';
import type { ConfigDefinition, ExtensionRoute } from '@/server/extensions/types';
import { randomPassword } from '@/server/lib/ids';
import { truthy } from '@/server/lib/php';
import { Property } from '@/server/models/Property';
import type { Product } from '@/server/models/Product';
import { Service } from '@/server/models/Service';
import { Hostname } from '../Convoy/Rules/Hostname';
import { ProxmoxClient, ProxmoxError } from './ProxmoxClient';
import { encodeSshKeys, ipConfig, netConfig, pickFreeIp, validSshKeys } from './network';
import ProxmoxPanel from './ProxmoxPanel';

type Bag = Record<string, any>;

const toInt = (v: unknown) => Number.parseInt(String(v ?? ''), 10) || 0;
/** checkout option / service property first, then the product setting */
const pick = (properties: Bag, settings: Bag, key: string) => (properties[key] !== undefined && properties[key] !== null && properties[key] !== '' ? properties[key] : settings[key]);
const opts = (list: string[]) => Object.fromEntries(list.map((v) => [v, v]));
const POWER_ACTIONS = ['start', 'stop', 'shutdown', 'reboot'] as const;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/;

export default class Proxmox extends Server {
    static meta = {
        name: 'Proxmox',
        description: 'Proxmox VE server extension: provisions QEMU virtual machines by cloning a cloud-init template',
        version: 'builtin',
        author: 'Paymenter',
        url: 'https://pve.proxmox.com/wiki/Proxmox_VE_API',
        extensionId: 'unknown',
    };

    private _client?: ProxmoxClient;

    /** API client for the saved extension settings */
    get client(): ProxmoxClient {
        return (this._client ??= new ProxmoxClient({
            host: this.config('host') ?? '',
            port: this.config('port'),
            auth_type: this.config('auth_type') ?? 'token',
            username: this.config('username'),
            token_id: this.config('token_id'),
            token_secret: this.config('token_secret'),
            password: this.config('password'),
            verify_ssl: this.config('verify_ssl') ?? true,
        }));
    }

    /* ------------------------------------------------------------------ settings */

    getConfig(_values: Bag = {}): ConfigDefinition[] {
        return [
            { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'https://pve.example.com', description: 'URL or IP address of the Proxmox VE server (https:// is assumed when no scheme is given)' },
            { name: 'port', label: 'Port', type: 'number', default: 8006, required: true },
            {
                name: 'auth_type',
                label: 'Authentication',
                type: 'select',
                default: 'token',
                required: true,
                live: true,
                options: { token: 'API token', ticket: 'Username and password (ticket)' },
                description: 'An API token is recommended; ticket authentication logs in with a password and renews the ticket automatically',
            },
            { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'root@pam', description: 'User including the realm, e.g. root@pam or billing@pve' },
            { name: 'token_id', label: 'Token ID', type: 'text', placeholder: 'paymenter', description: 'API token authentication: the token name (the part after the "!")', required: (get) => get('auth_type') !== 'ticket' },
            { name: 'token_secret', label: 'Token secret', type: 'password', encrypted: true, description: 'API token authentication: the secret of the token', required: (get) => get('auth_type') !== 'ticket' },
            { name: 'password', label: 'Password', type: 'password', encrypted: true, description: 'Ticket authentication: the password of the user', required: (get) => get('auth_type') === 'ticket' },
            { name: 'verify_ssl', label: 'Verify TLS certificate', type: 'checkbox', default: true, description: 'Disable for the self-signed certificate of a default Proxmox installation' },
            { name: 'console_url', label: 'Console base URL', type: 'text', required: false, placeholder: 'https://pve.example.com:8006', description: 'Optional public URL of the Proxmox web interface used for the console link (defaults to the host above)' },
        ];
    }

    async testConfig(): Promise<boolean | string> {
        try {
            await this.client.nodes();
            return true;
        } catch (e: any) {
            return e.message;
        }
    }

    async getProductConfig(values: Bag = {}): Promise<ConfigDefinition[]> {
        const nodes = ((await this.client.nodes()) ?? []).map((n) => String(n.node)).sort();
        const node = values['node'] && nodes.includes(values['node']) ? values['node'] : nodes[0];

        let storages: string[] = [];
        let bridges: string[] = [];
        let templates: Record<string, string> = {};
        let pools: string[] = [];
        if (node) {
            const safe = async <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
            const [st, net, vms, pl] = await Promise.all([
                safe(this.client.get<Bag[]>(`/nodes/${node}/storage`, { content: 'images' }), []),
                safe(this.client.get<Bag[]>(`/nodes/${node}/network`), []),
                safe(this.client.get<Bag[]>(`/nodes/${node}/qemu`), []),
                safe(this.client.get<Bag[]>('/pools'), []),
            ]);
            storages = st.map((s) => String(s.storage));
            bridges = net.filter((n) => n.type === 'bridge' || n.type === 'OVSBridge').map((n) => String(n.iface));
            templates = Object.fromEntries(vms.filter((v) => truthy(v.template)).map((v) => [String(v.vmid), `${v.vmid} - ${v.name ?? 'template'}`]));
            pools = pl.map((p) => String(p.poolid));
        }

        return [
            { name: 'node', label: 'Node', type: 'select', required: true, live: true, options: opts(nodes), description: 'Node the virtual machines are created on (save to refresh the lists below)' },
            { name: 'template_vmid', label: 'Template', type: 'select', required: true, options: templates, description: 'Template VM (with a cloud-init drive and the QEMU guest agent) that is cloned for every order' },
            { name: 'clone_mode', label: 'Clone mode', type: 'select', default: 'full', required: true, options: { full: 'Full clone', linked: 'Linked clone' }, description: 'A linked clone needs a storage that supports it and stays tied to the template' },
            { name: 'storage', label: 'Storage', type: 'select', required: false, options: opts(storages), description: 'Target storage of a full clone (empty: same storage as the template)' },
            { name: 'pool', label: 'Resource pool', type: 'select', required: false, options: opts(['', ...pools].filter(Boolean)), description: 'Optional resource pool' },
            { name: 'cores', label: 'CPU cores', type: 'number', required: true, default: 1 },
            { name: 'sockets', label: 'CPU sockets', type: 'number', required: false, default: 1 },
            { name: 'memory', label: 'Memory (MB)', type: 'number', required: true, default: 1024 },
            { name: 'disk', label: 'Disk (GB)', type: 'number', required: true, default: 10, description: 'The boot disk is grown to this size (never shrunk)' },
            { name: 'disk_device', label: 'Boot disk', type: 'text', required: false, default: 'scsi0', description: 'Device of the disk in the template that is resized, e.g. scsi0, virtio0, sata0' },
            { name: 'bridge', label: 'Bridge', type: 'select', required: true, options: opts(bridges.length ? bridges : ['vmbr0']), default: 'vmbr0' },
            { name: 'nic_model', label: 'Network model', type: 'select', default: 'virtio', options: { virtio: 'VirtIO', e1000: 'Intel E1000', rtl8139: 'Realtek RTL8139', vmxnet3: 'VMware VMXNET3' } },
            { name: 'vlan', label: 'VLAN tag', type: 'number', required: false },
            { name: 'rate', label: 'Network rate limit (MB/s)', type: 'number', required: false },
            { name: 'firewall', label: 'Enable the Proxmox firewall on the NIC', type: 'checkbox', required: false },
            { name: 'ip_mode', label: 'IP address', type: 'select', default: 'dhcp', required: true, live: true, options: { dhcp: 'DHCP', pool: 'Assign from IP pool' } },
            { name: 'ip_pool', label: 'IP pool', type: 'textarea', required: false, placeholder: "10.0.0.10-10.0.0.50\n10.0.1.5", description: 'IPv4 addresses, one per line (ranges like 10.0.0.10-10.0.0.50 or 10.0.0.10-50 allowed)' },
            { name: 'gateway', label: 'Gateway', type: 'text', required: false },
            { name: 'prefix', label: 'Netmask (CIDR prefix)', type: 'number', required: false, default: 24 },
            { name: 'nameserver', label: 'DNS server(s)', type: 'text', required: false, placeholder: '1.1.1.1 8.8.8.8', description: 'Space separated; empty uses the host settings' },
            { name: 'searchdomain', label: 'Search domain', type: 'text', required: false },
            { name: 'ci_user', label: 'Cloud-init user', type: 'text', required: false, default: '', description: 'Default user of the image (empty: keep the template value)' },
            { name: 'ssh_keys', label: 'Default SSH public keys', type: 'textarea', required: false, description: 'Added to every VM, one key per line' },
            { name: 'ci_upgrade', label: 'Upgrade packages on first boot', type: 'checkbox', required: false },
            { name: 'start_on_create', label: 'Start after creation', type: 'checkbox', default: true, required: false },
            { name: 'snapshot_limit', label: 'Snapshots per client', type: 'number', required: false, default: 0, description: '0 disables snapshots in the client area' },
            { name: 'client_edit_network', label: 'Clients may change DNS and search domain', type: 'checkbox', required: false },
        ];
    }

    async getCheckoutConfig(_product: Product, _values: Bag = {}, _settings: Bag = {}): Promise<ConfigDefinition[]> {
        return [
            { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'server.example.com', validation: ['required', 'string', 'max:63', Hostname()] as any },
            { name: 'password', label: 'Root password', type: 'password', required: true, validation: 'required|string|min:8|max:64' },
        ];
    }

    /* ------------------------------------------------------------------ helpers */

    private vmName(hostname: string, service: Service): string {
        const name = String(hostname || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
        return SAFE_NAME.test(name) ? name : `vm-${service.id}`;
    }

    private async usedIps(): Promise<string[]> {
        const rows = await Property.query().where('key', 'ip_address').where('model_type', Service.morphName).get();
        return rows.map((r: any) => String(r.value));
    }

    private ciOptions(settings: Bag, properties: Bag, ip: string | null): Bag {
        const out: Bag = {
            ipconfig0: ipConfig(ip, settings['gateway'], settings['prefix']),
        };
        const ns = String(pick(properties, settings, 'nameserver') ?? '').trim();
        if (ns) out['nameserver'] = ns;
        const sd = String(pick(properties, settings, 'searchdomain') ?? '').trim();
        if (sd) out['searchdomain'] = sd;
        if (settings['ci_user']) out['ciuser'] = settings['ci_user'];
        if (truthy(settings['ci_upgrade'])) out['ciupgrade'] = 1;
        return out;
    }

    private combinedKeys(settings: Bag, properties: Bag): string {
        return [settings['ssh_keys'], properties['ssh_key']].filter((k) => k && String(k).trim()).map((k) => String(k).trim()).join('\n');
    }

    private async setProperty(service: Service, key: string, name: string, value: string) {
        await service.relation('properties').updateOrCreate({ key }, { name, value });
    }

    /** Clones the template to `vmid` and applies cores/memory/network/cloud-init/disk. Does not start it. */
    private async provision(node: string, vmid: number, hostname: string, ip: string | null, settings: Bag, properties: Bag, password: string, service: Service) {
        const c = this.client;
        const template = toInt(settings['template_vmid']);
        if (!template) throw new Error('No template VM is configured for this product');
        const linked = settings['clone_mode'] === 'linked';
        const clone: Bag = { newid: vmid, name: this.vmName(hostname, service), full: linked ? 0 : 1, description: `Paymenter service #${service.id}` };
        if (!linked && settings['storage']) clone['storage'] = settings['storage'];
        if (settings['pool']) clone['pool'] = settings['pool'];
        if (node !== settings['node']) clone['target'] = node;
        await c.waitForTask(node, await c.post(`/nodes/${settings['node']}/qemu/${template}/clone`, clone), { timeoutMs: 600_000 });

        await this.applyResources(node, vmid, settings, properties);
        const config: Bag = {
            net0: netConfig({ model: settings['nic_model'], bridge: settings['bridge'] || 'vmbr0', vlan: settings['vlan'], firewall: truthy(settings['firewall']), rate: settings['rate'] }),
            agent: 1,
            onboot: 1,
            cipassword: password,
            ...this.ciOptions(settings, properties, ip),
        };
        const keys = this.combinedKeys(settings, properties);
        if (keys) config['sshkeys'] = encodeSshKeys(keys);
        await c.setConfig(node, vmid, config);
    }

    /** cores / sockets / memory / disk size */
    private async applyResources(node: string, vmid: number, settings: Bag, properties: Bag) {
        const c = this.client;
        const cores = toInt(pick(properties, settings, 'cores'));
        const memory = toInt(pick(properties, settings, 'memory'));
        const sockets = toInt(pick(properties, settings, 'sockets'));
        const conf: Bag = {};
        if (cores) conf['cores'] = cores;
        if (memory) conf['memory'] = memory;
        if (sockets) conf['sockets'] = sockets;
        if (Object.keys(conf).length) await c.setConfig(node, vmid, conf);

        const disk = toInt(pick(properties, settings, 'disk'));
        const device = String(settings['disk_device'] || 'scsi0');
        if (disk) {
            const current = await c.config(node, vmid);
            const m = /size=(\d+(?:\.\d+)?)([MGT])/.exec(String(current?.[device] ?? ''));
            const currentGb = m ? Number(m[1]) / (m[2] === 'M' ? 1024 : m[2] === 'T' ? 1 / 1024 : 1) : 0;
            if (!m || disk > currentGb) await c.waitForTask(node, await c.put(`${c.vm(node, vmid)}/resize`, { disk: device, size: `${disk}G` }));
        }
    }

    private async vmOf(service: Service, properties: Bag): Promise<{ node: string; vmid: number }> {
        if (!properties['vmid'] || !properties['node']) throw new Error('Server does not exist');
        return { node: String(properties['node']), vmid: Number(properties['vmid']) };
    }

    /* ------------------------------------------------------------------ lifecycle */

    async createServer(service: Service, settings: Bag, properties: Bag) {
        if (properties['vmid']) throw new Error('Server already exists');
        const node = String(settings['node'] ?? '');
        if (!node) throw new Error('No node is configured for this product');
        const hostname = String(properties['hostname'] ?? '');
        const password = String(properties['password'] ?? '') || randomPassword(16);

        let ip: string | null = null;
        if (settings['ip_mode'] === 'pool') {
            ip = pickFreeIp(settings['ip_pool'], await this.usedIps());
            if (!ip) throw new Error('The IP pool is exhausted');
        }

        const vmid = await this.client.nextId();
        // remember the id first so a failed provisioning can be cleaned up by terminating the service
        await this.setProperty(service, 'vmid', 'Proxmox VM ID', String(vmid));
        await this.setProperty(service, 'node', 'Proxmox node', node);
        await this.provision(node, vmid, hostname, ip, settings, properties, password, service);
        if (ip) await this.setProperty(service, 'ip_address', 'IP address', ip);
        if (hostname) await this.setProperty(service, 'vm_hostname', 'Hostname', hostname);
        if (properties['start_on_create'] === undefined ? truthy(settings['start_on_create'] ?? true) : truthy(properties['start_on_create'])) {
            await this.client.waitForTask(node, await this.client.power(node, vmid, 'start'));
        }

        return { vmid, node, ip_address: ip, hostname, password };
    }

    async upgradeServer(service: Service, settings: Bag, properties: Bag) {
        const { node, vmid } = await this.vmOf(service, properties);
        await this.applyResources(node, vmid, settings, properties);
        return { vmid };
    }

    async suspendServer(service: Service, _settings: Bag, properties: Bag) {
        const { node, vmid } = await this.vmOf(service, properties);
        await this.client.setConfig(node, vmid, { onboot: 0 });
        await this.stopAndWait(node, vmid);
    }

    async unsuspendServer(service: Service, _settings: Bag, properties: Bag) {
        const { node, vmid } = await this.vmOf(service, properties);
        await this.client.setConfig(node, vmid, { onboot: 1 });
        const st = await this.client.status(node, vmid);
        if (st?.status !== 'running') await this.client.waitForTask(node, await this.client.power(node, vmid, 'start'));
    }

    async terminateServer(service: Service, _settings: Bag, properties: Bag) {
        const { node, vmid } = await this.vmOf(service, properties);
        await this.destroy(node, vmid);
        await service.relation('properties').whereIn('key', ['vmid', 'node', 'ip_address', 'vm_hostname']).delete();
    }

    private async stopAndWait(node: string, vmid: number) {
        const st = await this.client.status(node, vmid);
        if (st?.status === 'stopped') return;
        await this.client.waitForTask(node, await this.client.power(node, vmid, 'stop'));
    }

    private async destroy(node: string, vmid: number) {
        try {
            await this.stopAndWait(node, vmid);
        } catch (e) {
            // a VM that does not exist (any more) only needs its properties removed
            if (e instanceof ProxmoxError && /does not exist|no such/i.test(e.message)) return;
            throw e;
        }
        try {
            await this.client.waitForTask(node, await this.client.delete(this.client.vm(node, vmid), { purge: 1, 'destroy-unreferenced-disks': 1 }), { timeoutMs: 300_000 });
        } catch (e) {
            if (!(e instanceof ProxmoxError && /does not exist/i.test(e.message))) throw e;
        }
    }

    /* ------------------------------------------------------------------ client area */

    getActions(_service: Service) {
        return [{ type: 'view' as const, label: 'Server', name: 'overview' }];
    }

    async getView(service: Service, settings: Bag, properties: Bag, _view: string) {
        let initial: Bag | null = null;
        let error: string | null = null;
        try {
            initial = await this.state(service, settings, properties);
        } catch (e: any) {
            error = e.message;
        }
        return (
            <ProxmoxPanel
                serviceId={Number(service.id)}
                initial={initial as any}
                error={error}
                hostname={String(properties['vm_hostname'] ?? '')}
                snapshotLimit={toInt(settings['snapshot_limit'])}
                canEditNetwork={truthy(settings['client_edit_network'])}
                consoleUrl={this.consoleUrl(properties)}
            />
        );
    }

    consoleUrl(properties: Bag): string | null {
        if (!properties['vmid'] || !properties['node']) return null;
        const base = String(this.config('console_url') || this.client.baseUrl).replace(/\/+$/, '');
        return `${base}/?console=kvm&novnc=1&vmid=${encodeURIComponent(properties['vmid'])}&node=${encodeURIComponent(properties['node'])}&resize=off`;
    }

    async state(service: Service, settings: Bag, properties: Bag): Promise<Bag> {
        const { node, vmid } = await this.vmOf(service, properties);
        const [st, conf] = await Promise.all([this.client.status(node, vmid), this.client.config(node, vmid)]);
        const snaps = toInt(settings['snapshot_limit']) > 0 ? ((await this.client.get<Bag[]>(`${this.client.vm(node, vmid)}/snapshot`)) ?? []).filter((s) => s.name !== 'current') : [];
        return {
            status: st?.status ?? 'unknown',
            uptime: st?.uptime ?? 0,
            cpu: st?.cpu ?? 0,
            cpus: st?.cpus ?? toInt(conf?.cores),
            mem: st?.mem ?? 0,
            maxmem: st?.maxmem ?? 0,
            ip: properties['ip_address'] ?? null,
            vmid,
            hostname: conf?.name ?? properties['vm_hostname'] ?? '',
            nameserver: conf?.nameserver ?? '',
            searchdomain: conf?.searchdomain ?? '',
            sshKeysSet: !!conf?.sshkeys,
            snapshots: snaps.map((s) => ({ name: s.name, description: s.description ?? '', time: s.snaptime ?? null })),
        };
    }

    async power(service: Service, properties: Bag, action: string) {
        if (!(POWER_ACTIONS as readonly string[]).includes(action)) throw new Error('Unknown power action');
        const { node, vmid } = await this.vmOf(service, properties);
        await this.client.power(node, vmid, action as (typeof POWER_ACTIONS)[number]);
    }

    /** Destroys the VM and clones the template again under the same VM ID. */
    async reinstall(service: Service, settings: Bag, properties: Bag, input: Bag) {
        const { node, vmid } = await this.vmOf(service, properties);
        const password = String(input['password'] ?? '');
        if (password.length < 8 || password.length > 64) throw new Error('The password must be 8 to 64 characters long');
        const keys = String(input['ssh_key'] ?? '').trim();
        if (keys && !validSshKeys(keys)) throw new Error('Invalid SSH public key');
        await this.destroy(node, vmid);
        const hostname = String(properties['vm_hostname'] ?? '');
        // the saved properties keep the original checkout keys, the new ones win
        const merged = { ...properties, ssh_key: keys };
        await this.provision(String(settings['node']), vmid, hostname, properties['ip_address'] ?? null, settings, merged, password, service);
        await this.client.waitForTask(String(settings['node']), await this.client.power(String(settings['node']), vmid, 'start'));
    }

    async cloudInit(service: Service, settings: Bag, properties: Bag, input: Bag) {
        const { node, vmid } = await this.vmOf(service, properties);
        const conf: Bag = {};
        if (input['password']) {
            const p = String(input['password']);
            if (p.length < 8 || p.length > 64) throw new Error('The password must be 8 to 64 characters long');
            conf['cipassword'] = p;
        }
        if (input['ssh_keys'] !== undefined && input['ssh_keys'] !== null && String(input['ssh_keys']).trim() !== '') {
            if (!validSshKeys(String(input['ssh_keys']))) throw new Error('Invalid SSH public key');
            conf['sshkeys'] = encodeSshKeys(String(input['ssh_keys']));
        }
        if (input['hostname']) {
            const host = String(input['hostname']);
            if (!SAFE_NAME.test(host)) throw new Error('Invalid hostname');
            conf['name'] = host;
        }
        if (truthy(settings['client_edit_network'])) {
            for (const k of ['nameserver', 'searchdomain']) {
                if (input[k] === undefined) continue;
                const v = String(input[k]).trim();
                if (v && !/^[A-Za-z0-9.: _-]+$/.test(v)) throw new Error(`Invalid ${k}`);
                if (v) conf[k] = v;
            }
        }
        if (!Object.keys(conf).length) throw new Error('Nothing to change');
        await this.client.setConfig(node, vmid, conf);
        if (conf['name']) await this.setProperty(service, 'vm_hostname', 'Hostname', conf['name']);
    }

    async snapshotCreate(service: Service, settings: Bag, properties: Bag, name: string, description = '') {
        const limit = toInt(settings['snapshot_limit']);
        if (limit <= 0) throw new Error('Snapshots are not enabled for this product');
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(name)) throw new Error('Invalid snapshot name (letters, digits, - and _; must start with a letter)');
        const { node, vmid } = await this.vmOf(service, properties);
        const existing = ((await this.client.get<Bag[]>(`${this.client.vm(node, vmid)}/snapshot`)) ?? []).filter((s) => s.name !== 'current');
        if (existing.length >= limit) throw new Error(`Snapshot limit reached (${limit})`);
        await this.client.waitForTask(node, await this.client.post(`${this.client.vm(node, vmid)}/snapshot`, { snapname: name, description: description.slice(0, 200) }), { timeoutMs: 120_000 });
    }

    async snapshotAction(service: Service, settings: Bag, properties: Bag, action: 'delete' | 'rollback', name: string) {
        if (toInt(settings['snapshot_limit']) <= 0) throw new Error('Snapshots are not enabled for this product');
        const { node, vmid } = await this.vmOf(service, properties);
        const snaps = ((await this.client.get<Bag[]>(`${this.client.vm(node, vmid)}/snapshot`)) ?? []).map((s) => s.name);
        if (!snaps.includes(name) || name === 'current') throw new Error('Snapshot not found');
        const path = `${this.client.vm(node, vmid)}/snapshot/${encodeURIComponent(name)}`;
        await this.client.waitForTask(node, action === 'delete' ? await this.client.delete(path) : await this.client.post(`${path}/rollback`), { timeoutMs: 120_000 });
    }

    /* ------------------------------------------------------------------ routes */

    routes(): ExtensionRoute[] {
        const run = (fn: (ext: Proxmox, service: Service, settings: Bag, properties: Bag, body: Bag, params: Record<string, string>) => Promise<any>): ExtensionRoute['handler'] =>
            async (ctx) => {
                try {
                    const ext = await ctx.instance<Proxmox>();
                    const { service, settings, properties } = await ext.loadOwned(ctx.user!, ctx.params['service']);
                    const body = ctx.request.method === 'GET' ? {} : await ctx.all();
                    const result = await fn(ext, service, settings, properties, body, ctx.params);
                    return Response.json({ ok: true, ...(result ?? {}) });
                } catch (e: any) {
                    const status = e instanceof AccessError ? e.status : 422;
                    return Response.json({ ok: false, message: e?.message ?? 'Request failed' }, { status });
                }
            };
        const base = '/extensions/proxmox/{service}';
        const where = { service: '\\d+' };
        return [
            { name: 'extensions.proxmox.state', method: 'GET', path: `${base}/state`, auth: true, where, handler: run(async (e, s, st, p) => ({ state: await e.state(s, st, p) })) },
            { name: 'extensions.proxmox.power', method: 'POST', path: `${base}/power`, auth: true, where, handler: run(async (e, s, _st, p, b) => void (await e.power(s, p, String(b['action'])))) },
            { name: 'extensions.proxmox.reinstall', method: 'POST', path: `${base}/reinstall`, auth: true, where, handler: run(async (e, s, st, p, b) => void (await e.reinstall(s, st, p, b))) },
            { name: 'extensions.proxmox.cloudinit', method: 'POST', path: `${base}/cloud-init`, auth: true, where, handler: run(async (e, s, st, p, b) => void (await e.cloudInit(s, st, p, b))) },
            { name: 'extensions.proxmox.snapshot.create', method: 'POST', path: `${base}/snapshots`, auth: true, where, handler: run(async (e, s, st, p, b) => void (await e.snapshotCreate(s, st, p, String(b['name'] ?? ''), String(b['description'] ?? '')))) },
            {
                name: 'extensions.proxmox.snapshot.action',
                method: 'POST',
                path: `${base}/snapshots/{snapshot}/{action}`,
                auth: true,
                where: { ...where, action: 'delete|rollback' },
                handler: run(async (e, s, st, p, _b, params) => void (await e.snapshotAction(s, st, p, params['action'] as 'delete' | 'rollback', params['snapshot']))),
            },
        ];
    }

    /** The service must belong to the user, be active and use this extension. */
    async loadOwned(user: { id: unknown }, id: string) {
        const service = await Service.find<Service>(Number(id));
        if (!service || service.user_id !== user.id) throw new AccessError('Not found', 404);
        if (service.status !== Service.STATUS_ACTIVE) throw new AccessError('The service is not active', 403);
        const product = (await service.rel('product'))!;
        const server = await product.rel('server');
        if (!server || server.extension !== 'Proxmox') throw new AccessError('Not found', 404);
        const { settingsToArray } = await import('@/server/extensions/helper');
        const { ExtensionHelper } = await import('@/server/extensions/helper');
        return {
            service,
            settings: settingsToArray(await product.rel('settings')),
            properties: await ExtensionHelper.getServiceProperties(service),
        };
    }
}

class AccessError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}
