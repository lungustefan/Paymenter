import fs from 'node:fs';
import path from 'node:path';

/**
 * The application version. Release builds stamp it into package.json (or pass
 * APP_VERSION); a checkout from git reports `development`, like the PHP release.
 */
let cached: string | undefined;

export function appVersion(): string {
    if (cached) return cached;
    if (process.env.APP_VERSION) return (cached = process.env.APP_VERSION);
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
        cached = !pkg.version || pkg.version === '0.0.0-development' ? 'development' : pkg.version;
    } catch {
        cached = 'development';
    }
    return cached!;
}

export function appCommit(): string {
    if (process.env.APP_COMMIT) return process.env.APP_COMMIT;
    // release/beta builds stamp the commit into package.json
    try {
        return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).commit ?? '';
    } catch {
        return '';
    }
}

/** True when `latest` is a higher version than `current` (prereleases sort below the release; non-numeric input is never newer). */
export function isNewerVersion(latest: string | undefined, current: string): boolean {
    const parse = (v: string) => {
        const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v ?? '').trim());
        return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] } : null;
    };
    const a = parse(latest ?? '');
    const b = parse(current);
    if (!a || !b) return !!latest && latest !== current;
    for (let i = 0; i < 3; i++) if (a.n[i] !== b.n[i]) return a.n[i] > b.n[i];
    if (a.pre === b.pre) return false;
    if (!a.pre) return true;
    if (!b.pre) return false;
    return a.pre.localeCompare(b.pre, undefined, { numeric: true }) > 0;
}
