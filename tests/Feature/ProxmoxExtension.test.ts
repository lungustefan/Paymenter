import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../helpers/db';
import { createProduct, createService, createUser } from '../helpers/factories';
import { MOCK_TOKEN, MockProxmox } from '../helpers/mockProxmox';
import Proxmox from '@extensions/Servers/Proxmox';
import { ExtensionHelper, settingsToArray } from '@/server/extensions/helper';
import { Service } from '@/server/models/Service';
import { Server } from '@/server/models/Server';

describe('Proxmox server extension (against the mock API)', () => {
    useDatabase();
    const mock = new MockProxmox();
    beforeAll(() => mock.start());
    afterAll(() => mock.stop());

    const settings = {
        node: 'pve1',
        template_vmid: '9000',
        clone_mode: 'full',
        storage: 'ssd',
        pool: 'customers',
        cores: '2',
        sockets: '1',
        memory: '2048',
        disk: '20',
        disk_device: 'scsi0',
        bridge: 'vmbr0',
        nic_model: 'virtio',
        vlan: '30',
        firewall: '1',
        ip_mode: 'pool',
        ip_pool: '10.0.0.10-10.0.0.11',
        gateway: '10.0.0.1',
        prefix: '24',
        nameserver: '1.1.1.1',
        searchdomain: 'example.com',
        ci_user: 'debian',
        ssh_keys: 'ssh-ed25519 AAAAdefault admin',
        ci_upgrade: '1',
        start_on_create: '1',
        snapshot_limit: '2',
        client_edit_network: '1',
    };
    const ext = () => new Proxmox({ host: mock.url, auth_type: 'token', ...MOCK_TOKEN, verify_ssl: '1' });
    let service: Service;
    let user: Awaited<ReturnType<typeof createUser>>;

    beforeEach(async () => {
        mock.vms.forEach((_v, id) => id !== 9000 && mock.vms.delete(id));
        mock.snapshots.clear();
        mock.log.length = 0;
        mock.nextVmid = 100;
        user = await createUser();
        const server = await Server.create({ name: 'pve', extension: 'Proxmox', type: 'server' });
        const { product } = await createProduct({ server_id: server.id });
        service = await createService({ user_id: user.id, product_id: product.id });
    });

    const props = async () => ExtensionHelper.getServiceProperties((await Service.find<Service>(service.id as number))!);
    const create = (extra: Record<string, any> = {}) => ext().createServer(service, settings, { hostname: 'web1.example.com', password: 'Sup3rSecret!', ssh_key: 'ssh-rsa AAAAclient me', ...extra });

    it('lists nodes, storages, bridges and templates for the product form', async () => {
        const fields = await ext().getProductConfig({});
        const f = (n: string) => fields.find((x) => x.name === n) as any;
        expect(f('node').options).toEqual({ pve1: 'pve1' });
        expect(Object.keys(f('storage').options)).toEqual(['local-lvm', 'ssd']);
        expect(Object.keys(f('bridge').options)).toEqual(['vmbr0']);
        expect(f('template_vmid').options).toEqual({ 9000: '9000 - debian-template' });
        expect(f('pool').options).toEqual({ customers: 'customers' });
    });

    it('tests the connection', async () => {
        expect(await ext().testConfig()).toBe(true);
        expect(await new Proxmox({ host: mock.url, auth_type: 'token', ...MOCK_TOKEN, token_secret: 'bad' }).testConfig()).toMatch(/401/);
    });

    it('creates a VM from the template with cloud-init, network and disk', async () => {
        const result = await create();
        expect(result).toMatchObject({ vmid: 100, ip_address: '10.0.0.10' });

        const vm = mock.vms.get(100)!;
        expect(vm.clone).toMatchObject({ newid: '100', name: 'web1-example-com', full: '1', storage: 'ssd', pool: 'customers' });
        expect(vm.status).toBe('running');
        expect(vm.config).toMatchObject({
            cores: '2',
            memory: '2048',
            net0: 'virtio,bridge=vmbr0,tag=30,firewall=1',
            ipconfig0: 'ip=10.0.0.10/24,gw=10.0.0.1',
            nameserver: '1.1.1.1',
            searchdomain: 'example.com',
            ciuser: 'debian',
            cipassword: 'Sup3rSecret!',
            ciupgrade: '1',
            sshkeys: encodeURIComponent('ssh-ed25519 AAAAdefault admin\nssh-rsa AAAAclient me\n'),
        });
        expect(vm.config.scsi0).toContain('size=20G');
        expect(await props()).toMatchObject({ vmid: '100', node: 'pve1', ip_address: '10.0.0.10', vm_hostname: 'web1.example.com' });
    });

    it('uses a linked clone without a target storage', async () => {
        await ext().createServer(service, { ...settings, clone_mode: 'linked', ip_mode: 'dhcp' }, { hostname: 'a', password: 'longenough1' });
        expect(mock.vms.get(100)!.clone).toMatchObject({ full: '0' });
        expect(mock.vms.get(100)!.clone.storage).toBeUndefined();
        expect(mock.vms.get(100)!.config.ipconfig0).toBe('ip=dhcp');
    });

    it('hands out different pool addresses and reports an exhausted pool', async () => {
        await create();
        const second = await createService({ user_id: user.id, product_id: service.product_id });
        mock.nextVmid = 101;
        expect((await ext().createServer(second, settings, { hostname: 'b', password: 'longenough1' })).ip_address).toBe('10.0.0.11');
        const third = await createService({ user_id: user.id, product_id: service.product_id });
        mock.nextVmid = 102;
        await expect(ext().createServer(third, settings, { hostname: 'c', password: 'longenough1' })).rejects.toThrow(/exhausted/);
    });

    it('surfaces API errors when the template is missing', async () => {
        await expect(ext().createServer(service, { ...settings, template_vmid: '4242' }, { hostname: 'x', password: 'longenough1' })).rejects.toThrow(/does not exist/);
    });

    it('suspends, unsuspends and terminates', async () => {
        await create();
        const p = await props();
        await ext().suspendServer(service, settings, p);
        expect(mock.vms.get(100)!.status).toBe('stopped');
        expect(mock.vms.get(100)!.config.onboot).toBe('0');
        await ext().unsuspendServer(service, settings, p);
        expect(mock.vms.get(100)!.status).toBe('running');
        expect(mock.vms.get(100)!.config.onboot).toBe('1');
        await ext().terminateServer(service, settings, p);
        expect(mock.vms.has(100)).toBe(false);
        expect(mock.calls('DELETE', /qemu\/100$/)[0].body).toMatchObject({ purge: '1', 'destroy-unreferenced-disks': '1' });
        expect(await props()).not.toHaveProperty('vmid');
        // a second termination is a no-op for a VM that is gone already
        await expect(ext().terminateServer(service, settings, { vmid: '100', node: 'pve1' })).resolves.toBeUndefined();
    });

    it('upgrades cores, memory and grows the disk (never shrinks)', async () => {
        await create();
        const p = await props();
        await ext().upgradeServer(service, { ...settings, cores: '4', memory: '4096', disk: '40' }, p);
        expect(mock.vms.get(100)!.config).toMatchObject({ cores: '4', memory: '4096' });
        expect(mock.vms.get(100)!.config.scsi0).toContain('size=40G');
        await ext().upgradeServer(service, { ...settings, disk: '10' }, p);
        expect(mock.vms.get(100)!.config.scsi0).toContain('size=40G');
        // configurable options (service properties) win over the product settings
        await ext().upgradeServer(service, settings, { ...p, cores: '8' });
        expect(mock.vms.get(100)!.config.cores).toBe('8');
    });

    it('supports power actions, status, reinstall and cloud-init changes', async () => {
        await create();
        const p = await props();
        const e = ext();
        await e.power(service, p, 'reboot');
        expect(mock.calls('POST', /status\/reboot/)).toHaveLength(1);
        await expect(e.power(service, p, 'destroy')).rejects.toThrow(/Unknown/);
        await e.power(service, p, 'stop');
        const st = await e.state(service, settings, p);
        expect(st).toMatchObject({ status: 'stopped', ip: '10.0.0.10', vmid: 100 });

        await e.cloudInit(service, settings, p, { password: 'NewPassw0rd', hostname: 'new-host', ssh_keys: 'ssh-ed25519 AAAAnew k', nameserver: '9.9.9.9' });
        expect(mock.vms.get(100)!.config).toMatchObject({ cipassword: 'NewPassw0rd', nameserver: '9.9.9.9' });
        expect(mock.vms.get(100)!.name).toBe('new-host');
        expect((await props())['vm_hostname']).toBe('new-host');
        await expect(e.cloudInit(service, settings, p, { ssh_keys: 'garbage' })).rejects.toThrow(/Invalid SSH/);
        await expect(e.cloudInit(service, settings, p, { password: 'short' })).rejects.toThrow(/8 to 64/);
        await expect(e.cloudInit(service, settings, p, {})).rejects.toThrow(/Nothing/);

        mock.vms.get(100)!.config.marker = 'old install';
        await e.reinstall(service, settings, await props(), { password: 'Another1Pass', ssh_key: '' });
        expect(mock.vms.get(100)!.config.marker).toBeUndefined();
        expect(mock.vms.get(100)!.config.cipassword).toBe('Another1Pass');
        expect(mock.vms.get(100)!.config.ipconfig0).toBe('ip=10.0.0.10/24,gw=10.0.0.1');
        expect(mock.vms.get(100)!.status).toBe('running');
        await expect(e.reinstall(service, settings, p, { password: 'x' })).rejects.toThrow(/8 to 64/);
    });

    it('manages snapshots within the limit', async () => {
        await create();
        const p = await props();
        const e = ext();
        await e.snapshotCreate(service, settings, p, 'before-upgrade', 'desc');
        await e.snapshotCreate(service, settings, p, 'second');
        await expect(e.snapshotCreate(service, settings, p, 'third')).rejects.toThrow(/limit/);
        await expect(e.snapshotCreate(service, settings, p, '1bad name')).rejects.toThrow(/Invalid snapshot/);
        expect((await e.state(service, settings, p)).snapshots.map((s: any) => s.name)).toEqual(['before-upgrade', 'second']);
        await e.snapshotAction(service, settings, p, 'rollback', 'second');
        await e.snapshotAction(service, settings, p, 'delete', 'second');
        await expect(e.snapshotAction(service, settings, p, 'delete', 'nope')).rejects.toThrow(/not found/);
        await expect(e.snapshotCreate(service, { ...settings, snapshot_limit: '0' }, p, 'x')).rejects.toThrow(/not enabled/);
    });

    it('builds a console link from the node and VM id', async () => {
        expect(ext().consoleUrl({ vmid: '100', node: 'pve1' })).toBe(`${mock.url}/?console=kvm&novnc=1&vmid=100&node=pve1&resize=off`);
        expect(ext().consoleUrl({})).toBeNull();
    });

    it('only lets the owner use the client routes', async () => {
        await create();
        const e = ext();
        expect((await e.loadOwned(user, String(service.id))).properties['vmid']).toBe('100');
        const other = await createUser({ email: 'other@example.com' });
        await expect(e.loadOwned(other, String(service.id))).rejects.toThrow(/Not found/);
        void settingsToArray;
    });
});
