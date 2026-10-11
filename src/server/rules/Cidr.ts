import type { RuleFn } from '@/server/validation';
import { t } from '@/server/i18n';
import { isIPv4, isIPv6 } from 'node:net';

export interface CidrOptions {
    ipv4minbits?: number | null;
    ipv4maxbits?: number | null;
    ipv6minbits?: number | null;
    ipv6maxbits?: number | null;
    allowWildCard?: boolean | null;
}

const isInt = (s: string, min: number, max: number) => /^(0|[1-9][0-9]*)$/.test(s) && Number(s) >= min && Number(s) <= max;
const ip2long = (ip: string) => ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
const long2ip = (n: number) => [24, 16, 8, 0].map((shift) => (n >>> shift) & 255).join('.');

/** Port of App\Rules\Cidr (`new Cidr(...)`). */
export const Cidr =
    (options: CidrOptions = {}): RuleFn =>
    (raw, fail) => {
        // rule objects are not run on empty values
        if (raw === null || raw === undefined || raw === '') return;
        const { ipv4minbits = null, ipv4maxbits = null, ipv6minbits = null, ipv6maxbits = null, allowWildCard = false } = options;
        const hasBits = ipv4minbits !== null || ipv4maxbits !== null || ipv6minbits !== null || ipv6maxbits !== null;
        const message = () =>
            !hasBits
                ? t('The :attribute must be a valid IP address or CIDR subnet.')
                : t('The :attribute must be a valid CIDR subnet with a mask of %d-%d (IPv4) or %d-%d (IPv6) bits.')
                      .replace('%d', String(ipv4minbits ?? 0))
                      .replace('%d', String(ipv4maxbits ?? 32))
                      .replace('%d', String(ipv6minbits ?? 0))
                      .replace('%d', String(ipv6maxbits ?? 128));

        let value = String(raw ?? '');
        if (allowWildCard && value === '*') return;
        let mask: string | null = null;
        let validMask = true;

        if (value.includes('/')) {
            [value, mask] = value.split('/');
        } else if (hasBits) {
            // if we specify a bit constraint, assume the bits are required
            fail(message());
        }

        let validAddress: boolean;
        if (value.includes(':')) {
            // ipv6
            if (mask !== null) validMask = isInt(mask, ipv6minbits ?? 0, ipv6maxbits ?? 128);
            validAddress = isIPv6(value);
        } else {
            // ipv4
            validAddress = isIPv4(value);
            if (mask !== null) {
                validMask = isInt(mask, ipv4minbits ?? 0, ipv4maxbits ?? 32);
                if (validMask && validAddress) {
                    const bits = Number(mask);
                    const netmask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
                    validMask = long2ip((ip2long(value) & netmask) >>> 0) === value;
                }
            }
        }
        if (!validAddress || !validMask) fail(message());
    };
