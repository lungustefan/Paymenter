/** Helpers for the IP pool and the cloud-init network strings. */

const ipv4ToInt = (ip: string): number | null => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
    if (!m) return null;
    const parts = m.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
};
const intToIpv4 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

/** One address per line, or a range `10.0.0.10-10.0.0.50` / `10.0.0.10-50` (max 4096 per range). */
export function parseIpPool(pool: string | null | undefined): string[] {
    const out: string[] = [];
    for (const raw of String(pool ?? '').split(/[\r\n,]+/)) {
        const line = raw.trim();
        if (!line) continue;
        const range = /^([^-\s]+)\s*-\s*([^-\s]+)$/.exec(line);
        if (range) {
            const from = ipv4ToInt(range[1]);
            let to = ipv4ToInt(range[2]);
            if (from === null) continue;
            if (to === null && /^\d{1,3}$/.test(range[2])) to = ((from & 0xffffff00) | Number(range[2])) >>> 0;
            if (to === null || to < from || to - from > 4096) continue;
            for (let n = from; n <= to; n++) out.push(intToIpv4(n));
        } else if (ipv4ToInt(line) !== null) {
            out.push(line);
        }
    }
    return out;
}

/** First pool address that is not in `used`; null when the pool is exhausted. */
export function pickFreeIp(pool: string | null | undefined, used: Iterable<string>): string | null {
    const taken = new Set(used);
    return parseIpPool(pool).find((ip) => !taken.has(ip)) ?? null;
}

/** `ipconfig0` value. */
export function ipConfig(ip: string | null | undefined, gateway?: string | null, prefix?: string | number | null): string {
    if (!ip || ip === 'dhcp') return 'ip=dhcp';
    const cidr = ip.includes('/') ? ip : `${ip}/${prefix || 24}`;
    return `ip=${cidr}` + (gateway ? `,gw=${gateway}` : '');
}

/** `net0` value. Proxmox generates a new MAC address when none is given. */
export function netConfig(o: { model?: string | null; bridge: string; vlan?: string | number | null; firewall?: boolean; rate?: string | number | null }): string {
    let s = `${o.model || 'virtio'},bridge=${o.bridge}`;
    if (o.vlan) s += `,tag=${Number(o.vlan)}`;
    s += `,firewall=${o.firewall ? 1 : 0}`;
    if (o.rate) s += `,rate=${Number(o.rate)}`;
    return s;
}

/** Proxmox expects `sshkeys` URL-encoded (and trailing newline separated). */
export const encodeSshKeys = (keys: string) =>
    encodeURIComponent(
        keys
            .split(/\r?\n/)
            .map((k) => k.trim())
            .filter(Boolean)
            .join('\n') + '\n',
    );

export function validSshKeys(keys: string): boolean {
    return keys
        .split(/\r?\n/)
        .map((k) => k.trim())
        .filter(Boolean)
        .every((k) => /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-[\w@.-]+) [A-Za-z0-9+/=]+( .*)?$/.test(k));
}
