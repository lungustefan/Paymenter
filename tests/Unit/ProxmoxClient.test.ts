import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProxmoxClient, ProxmoxError, formEncode } from '@extensions/Servers/Proxmox/ProxmoxClient';
import { encodeSshKeys, ipConfig, netConfig, parseIpPool, pickFreeIp, validSshKeys } from '@extensions/Servers/Proxmox/network';
import { MOCK_PASSWORD, MOCK_TOKEN, MockProxmox } from '../helpers/mockProxmox';

describe('Proxmox API client (mock server)', () => {
    const mock = new MockProxmox();
    beforeAll(() => mock.start());
    afterAll(() => mock.stop());
    const base = () => ({ host: mock.url, ...MOCK_TOKEN });

    it('authenticates with an API token', async () => {
        const c = new ProxmoxClient({ ...base(), auth_type: 'token' });
        expect((await c.nodes())[0].node).toBe('pve1');
    });

    it('rejects a wrong token with a readable error', async () => {
        const c = new ProxmoxClient({ ...base(), auth_type: 'token', token_secret: 'nope' });
        await expect(c.nodes()).rejects.toThrow(/Proxmox API error 401/);
    });

    it('logs in with a ticket, sends the CSRF token on writes and re-logs in after a 401', async () => {
        const c = new ProxmoxClient({ host: mock.url, auth_type: 'ticket', username: MOCK_TOKEN.username, password: MOCK_PASSWORD });
        await c.nodes();
        await c.put('/nodes/pve1/qemu/9000/config', { cores: 2 });
        const logins = mock.loginCount;
        mock.loginCount++; // invalidates the cached ticket on the server
        await c.nodes();
        expect(mock.loginCount).toBe(logins + 2);
    });

    it('fails ticket login with a wrong password', async () => {
        const c = new ProxmoxClient({ host: mock.url, auth_type: 'ticket', username: MOCK_TOKEN.username, password: 'x' });
        await expect(c.nodes()).rejects.toThrow(/login failed/);
    });

    it('sends form encoded bodies and exposes the task result', async () => {
        const c = new ProxmoxClient(base());
        const upid = await c.post('/nodes/pve1/qemu/9000/clone', { newid: 150, name: 'a b', full: true });
        expect(mock.calls('POST', /clone/).pop()!.body).toMatchObject({ newid: '150', name: 'a b', full: '1' });
        await c.waitForTask('pve1', upid, { intervalMs: 1 });
        await expect(c.waitForTask('pve1', 'UPID:fail', { intervalMs: 1 })).rejects.toThrow(/command failed/);
        mock.vms.delete(150);
    });

    it('reports an unreachable host', async () => {
        const c = new ProxmoxClient({ host: 'http://127.0.0.1:1', ...MOCK_TOKEN });
        await expect(c.nodes()).rejects.toBeInstanceOf(ProxmoxError);
    });

    it('defaults to https and port 8006', () => {
        expect(new ProxmoxClient({ host: 'pve.example.com' }).baseUrl).toBe('https://pve.example.com:8006');
        expect(new ProxmoxClient({ host: 'http://10.0.0.1/', port: 8007 }).baseUrl).toBe('http://10.0.0.1:8007');
    });
});

describe('Proxmox helpers', () => {
    it('encodes forms', () => expect(formEncode({ a: 1, b: true, c: null, d: 'x y' })).toBe('a=1&b=1&d=x+y'));
    it('parses an IP pool with ranges', () => {
        expect(parseIpPool('10.0.0.1\n10.0.0.5-10.0.0.7, 10.0.1.250-252\nbogus\n10.0.0.9-10.0.0.1')).toEqual(['10.0.0.1', '10.0.0.5', '10.0.0.6', '10.0.0.7', '10.0.1.250', '10.0.1.251', '10.0.1.252']);
    });
    it('picks the first free address', () => {
        expect(pickFreeIp('10.0.0.1-10.0.0.3', ['10.0.0.1', '10.0.0.2'])).toBe('10.0.0.3');
        expect(pickFreeIp('10.0.0.1', ['10.0.0.1'])).toBeNull();
    });
    it('builds ipconfig / net strings', () => {
        expect(ipConfig(null)).toBe('ip=dhcp');
        expect(ipConfig('10.0.0.5', '10.0.0.1', 24)).toBe('ip=10.0.0.5/24,gw=10.0.0.1');
        expect(netConfig({ bridge: 'vmbr0', vlan: 20, firewall: true, rate: 10 })).toBe('virtio,bridge=vmbr0,tag=20,firewall=1,rate=10');
    });
    it('url-encodes ssh keys and validates them', () => {
        expect(encodeSshKeys('ssh-ed25519 AAAA x@y\n')).toBe('ssh-ed25519%20AAAA%20x%40y%0A');
        expect(validSshKeys('ssh-ed25519 AAAAC3Nza comment')).toBe(true);
        expect(validSshKeys('hello')).toBe(false);
    });
});
