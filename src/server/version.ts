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
    return process.env.APP_COMMIT ?? '';
}
