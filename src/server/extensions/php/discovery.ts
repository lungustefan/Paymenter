import fs from 'node:fs';
import path from 'node:path';

export interface PhpExtensionInfo {
    type: 'gateway' | 'server' | 'other';
    typeDir: 'Gateways' | 'Servers' | 'Others';
    name: string;
    dir: string;
    /** things in the folder that exist for Laravel but cannot run on the Node.js panel */
    warnings: string[];
}

const TYPES: Record<string, PhpExtensionInfo['type']> = { Gateways: 'gateway', Servers: 'server', Others: 'other' };

const exists = (p: string) => fs.existsSync(p);

/** what an upstream-layout extension folder contains that the bridge cannot run */
export function diagnose(dir: string): string[] {
    const w: string[] = [];
    const has = (rel: string) => exists(path.join(dir, rel));
    const phpFiles = (rel: string) => {
        const d = path.join(dir, rel);
        try {
            return fs.readdirSync(d).filter((f) => f.endsWith('.php'));
        } catch {
            return [];
        }
    };
    if (has('Admin')) w.push('Filament admin resources (Admin/) are not rendered; manage the data with SQL or port the resource to an admin.ts');
    if (has('Livewire')) w.push('Livewire components (Livewire/) are not rendered by the React theme');
    if (has('resources/views')) w.push('Blade views (resources/views/) are not rendered; a pay() or route that returns view() fails with a clear error, redirects/JSON/strings work');
    if (phpFiles('database/migrations').length) w.push('PHP migrations (database/migrations/*.php) are not run; add equivalent .sql files (see docs/php-extensions.md)');
    if (has('Policies')) w.push('Policies are ignored (no Eloquent models of its own on the Node.js side)');
    if (has('Models')) w.push('The extension defines its own Eloquent models; they cannot read/write the database through the bridge');
    if (has('Http/Middleware') || has('Middleware')) w.push('Laravel middleware is ignored');
    return w;
}

/** Root of the extensions folder the bridge serves (no build step needed: PHP extensions are found at runtime). */
export function extensionsRoot(): string {
    if (process.env.PAYMENTER_EXTENSIONS_DIR) return path.resolve(process.env.PAYMENTER_EXTENSIONS_DIR);
    // turbopackIgnore: runtime-only path
    return path.join(/* turbopackIgnore: true */ process.cwd(), 'extensions');
}

/**
 * Upstream layout: `extensions/{Gateways,Servers,Others}/<Name>/<Name>.php`. Folders that also have a
 * TypeScript entry (`index.ts[x]`) are TypeScript extensions and are found by the build-time registry instead.
 */
export function discoverPhpExtensions(): PhpExtensionInfo[] {
    const out: PhpExtensionInfo[] = [];
    const root = extensionsRoot();
    for (const typeDir of Object.keys(TYPES)) {
        let names: string[] = [];
        try {
            names = fs.readdirSync(path.join(/* turbopackIgnore: true */ root, typeDir), { withFileTypes: true }).filter((d) => d.isDirectory() && /^[A-Za-z][A-Za-z0-9_]*$/.test(d.name)).map((d) => d.name).sort();
        } catch {
            continue;
        }
        for (const name of names) {
            const dir = path.join(/* turbopackIgnore: true */ root, typeDir, name);
            if (!exists(path.join(dir, `${name}.php`))) continue;
            if (['index.ts', 'index.tsx', 'index.js'].some((f) => exists(path.join(dir, f)))) continue;
            out.push({ type: TYPES[typeDir], typeDir: typeDir as PhpExtensionInfo['typeDir'], name, dir, warnings: diagnose(dir) });
        }
    }
    return out;
}

export interface LegacyPhpExtension {
    type: PhpExtensionInfo['type'];
    name: string;
    hooks: string[];
}

/**
 * Pre-1.0 extensions (the archived Paymenter/Extensions repository): `<Name>/index.php` with plain functions
 * `<Name>_getConfig()`, `<Name>_pay()`, `<Name>_createServer()` ... and no class. They target the 0.x data model
 * (`OrderProduct`, `ExtensionHelper::getConfig('Name', 'key')`) and cannot be loaded; they are reported, not ignored.
 */
export function discoverLegacyPhpExtensions(): LegacyPhpExtension[] {
    const out: LegacyPhpExtension[] = [];
    const root = extensionsRoot();
    for (const typeDir of Object.keys(TYPES)) {
        let names: string[] = [];
        try {
            names = fs.readdirSync(path.join(/* turbopackIgnore: true */ root, typeDir), { withFileTypes: true }).filter((d) => d.isDirectory() && /^[A-Za-z][A-Za-z0-9_]*$/.test(d.name)).map((d) => d.name).sort();
        } catch {
            continue;
        }
        for (const name of names) {
            const dir = path.join(/* turbopackIgnore: true */ root, typeDir, name);
            if (exists(path.join(dir, `${name}.php`)) || ['index.ts', 'index.tsx', 'index.js'].some((f) => exists(path.join(dir, f)))) continue;
            let src: string;
            try {
                src = fs.readFileSync(path.join(/* turbopackIgnore: true */ dir, 'index.php'), 'utf8');
            } catch {
                continue;
            }
            const hooks = [...src.matchAll(new RegExp(`^function\\s+${name}_([A-Za-z0-9]+)\\s*\\(`, 'gm'))].map((m) => m[1]);
            if (hooks.length) out.push({ type: TYPES[typeDir], name, hooks });
        }
    }
    return out;
}

/** Themes written for Blade/Livewire (no `theme.ts`): they are not usable and are reported instead of silently ignored. */
export function discoverPhpThemes(): { name: string; reason: string }[] {
    const out: { name: string; reason: string }[] = [];
    // turbopackIgnore: runtime-only path
    const root = path.join(/* turbopackIgnore: true */ process.cwd(), 'themes');
    let names: string[] = [];
    try {
        names = fs.readdirSync(/* turbopackIgnore: true */ root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);
    } catch {
        return out;
    }
    for (const name of names) {
        const dir = path.join(/* turbopackIgnore: true */ root, name);
        if (['theme.ts', 'theme.tsx', 'theme.js'].some((f) => exists(path.join(dir, f)))) continue;
        const blade = exists(path.join(dir, 'views')) || exists(path.join(dir, 'resources')) || exists(path.join(dir, 'theme.php')) || exists(path.join(dir, 'composer.json'));
        if (blade) out.push({ name, reason: 'This is a Blade/Livewire theme. Blade templates cannot be rendered by the React panel; the theme is ignored. See docs/php-extensions.md for the porting guide.' });
    }
    return out;
}
