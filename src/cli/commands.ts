import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { register } from './registry';
import { dropAllTables, migrate, migrationStatus } from '@/server/db/migrate';
import { generateAppKey, hashPassword } from '@/server/lib/crypto';
import { randomPassword } from '@/server/lib/ids';

/**
 * Port of the artisan command set. Names are unchanged so the documentation and
 * ops tooling keep working: `pnpm paymenter app:user:create ...`.
 */

async function boot() {
    const { boot } = await import('@/server/bootstrap');
    await boot();
}

async function ask(question: string, hidden = false): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        void hidden;
        return (await rl.question(`${question} `)).trim();
    } finally {
        rl.close();
    }
}

async function confirm(question: string, def = false): Promise<boolean> {
    if (!process.stdin.isTTY) return def;
    const a = (await ask(`${question} (yes/no) [${def ? 'yes' : 'no'}]`)).toLowerCase();
    return a === '' ? def : ['y', 'yes'].includes(a);
}

/* ------------------------------ database ------------------------------ */

register('migrate', 'Run the database migrations', async (_a, flags) => {
    console.log('\n  INFO  Running migrations.\n');
    await migrate({ log: console.log });
    if (flags.seed) {
        await boot();
        await (await import('@/server/db/seed')).seed(console.log);
    }
});

register('migrate:status', 'Show the status of each migration', async () => {
    for (const m of await migrationStatus()) console.log(`  ${m.batch === null ? 'Pending' : `Ran [${m.batch}]`}  ${m.name}`);
});

register('migrate:fresh', 'Drop all tables and re-run all migrations', async (_a, flags) => {
    await dropAllTables();
    console.log('Dropped all tables successfully.');
    await migrate({ log: console.log });
    if (flags.seed) {
        await boot();
        await (await import('@/server/db/seed')).seed(console.log);
    }
});

register('db:seed', 'Seed the database with records', async () => {
    await boot();
    await (await import('@/server/db/seed')).seed(console.log);
});

register('key:generate', 'Set the application key', async (_a, flags) => {
    const key = generateAppKey();
    if (flags.show) return void console.log(key);
    const envFile = path.join(process.cwd(), '.env');
    let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    if (/^APP_KEY=.+$/m.test(content) && !flags.force) {
        console.log('Application key already set. Use --force to overwrite.');
        return;
    }
    content = /^APP_KEY=.*$/m.test(content) ? content.replace(/^APP_KEY=.*$/m, `APP_KEY=${key}`) : `${content}${content.endsWith('\n') || !content ? '' : '\n'}APP_KEY=${key}\n`;
    fs.writeFileSync(envFile, content);
    console.log('Application key set successfully.');
});

/* ------------------------------ application ------------------------------ */

register('app:init', 'Show the application initialization steps', async (args) => {
    await boot();
    const { Setting } = await import('@/server/models/Setting');
    const name = args[0] ?? (await ask('What is the name of your company?'));
    const url = args[1] ?? (await ask('What is the URL of your application?'));
    console.log('Thanks for installing Paymenter!');
    if (!url.startsWith('http')) return void console.error('The URL must start with http or https.');
    await Setting.updateOrCreate({ key: 'company_name' }, { value: name });
    await Setting.updateOrCreate({ key: 'app_url' }, { value: url.replace(/\/+$/, '') });
    console.log(`Now you're all set up!\nVisit Paymenter at ${url}`);
});

register('app:cron-job', 'Run automated tasks', async () => {
    await boot();
    await (await import('@/server/commands/cron-job')).cronJob();
});

register('app:fetch-emails', 'Import ticket emails using IMAP', async () => {
    await boot();
    await (await import('@/server/commands/fetch-emails')).fetchEmails();
});

register('app:check-for-updates', 'Check whether a newer version is available', async () => {
    await boot();
    await (await import('@/server/commands/check-for-updates')).checkForUpdates();
});

register('app:telemetry', 'Sends telemetry data', async (_a, flags) => {
    await boot();
    await (await import('@/server/commands/telemetry')).telemetry(!!flags.simulate);
});

register('app:schedule-heartbeat-command', 'Heartbeat command to indicate the scheduler is running', async () => {
    await boot();
    await (await import('@/server/commands/heartbeat')).scheduleHeartbeat();
});

register('app:logs', 'Post application logs', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(process.cwd(), 'storage', 'logs', `paymenter-${today}.log`);
    if (!fs.existsSync(file)) return void console.log('No log file found for today.');
    const text = fs.readFileSync(file, 'utf8');
    const matches = [...text.matchAll(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\].*?\.ERROR:[\s\S]*?(?=\n\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]|$)/g)];
    if (!matches.length) return void console.log('No error message found.');
    const last = matches[matches.length - 1][0].trim();
    console.log('Here is the last error message:');
    console.log(last);
});

register('app:settings:change', 'Change a setting', async (args) => {
    await boot();
    const { Setting } = await import('@/server/models/Setting');
    const { Settings } = await import('@/server/classes/Settings');
    const key = args[0] ?? (await ask('Which setting would you like to change?'));
    let value = args[1];
    if (value === undefined) {
        const def = await Settings.getSetting(key);
        value = await ask(`What value should the setting have?${def.value ? ` [${def.value}]` : ''}`);
    }
    const { setAuditConsole } = await import('@/server/orm/audit');
    setAuditConsole(true);
    await Setting.updateOrCreate({ key }, { value });
});

register('app:user:create', 'Create a new user', async (args) => {
    await boot();
    const { User } = await import('@/server/models/User');
    const { Role } = await import('@/server/models/Role');
    const { setAuditConsole } = await import('@/server/orm/audit');
    const first_name = args[0] ?? (await ask("What is the user's first name?"));
    const last_name = args[1] ?? (await ask("What is the user's last name?"));
    const email = args[2] ?? (await ask("What is the user's email address?"));
    const password = args[3] ?? (await ask("What is the user's password?", true));
    let role = args[4];
    if (role === undefined) {
        const roles = await Role.all<InstanceType<typeof Role>>();
        role = await ask(`What is the user's role? (0 = None, ${roles.map((r) => `${r.id} = ${r.name}`).join(', ')})`);
    }
    setAuditConsole(true);
    await User.create({ first_name, last_name, email, password, role_id: Number(role) || null });
});

register('app:user:password-reset', "Reset a user's password and show the new password in the console", async (args) => {
    await boot();
    const { User } = await import('@/server/models/User');
    const email = args[0] ?? (await ask("What is the user's email address?"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return void console.error('Invalid email format');
    const user = await User.query().where('email', email).first();
    if (!user) return void console.error(`User with email '${email}' not found`);
    if (!(await confirm(`Are you sure you want to reset the password for user with email '${email}'?`))) return void console.log('Operation cancelled.');
    const password = randomPassword(16);
    user.forceFill({ password: hashPassword(password) });
    await user.save();
    // Revoke all existing sessions
    await user.relation('sessions').delete();
    console.log(`Password for user with email '${email}' has been reset.`);
    console.log(`New password: \x1b[1;31m${password}\x1b[0m`);
});

/* ------------------------------ extensions & themes ------------------------------ */

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

register('app:extension:create', 'Create a new extension', async (args, flags) => {
    const name = args[0] ?? (await ask('What is the name of the extension?'));
    const type = args[1] ?? (await ask('What type of extension? (server, gateway, other)'));
    if (!['server', 'gateway', 'other'].includes(type)) return void console.error('Invalid extension type. Valid types are: server, gateway, other');
    const dir = path.join(process.cwd(), 'extensions', `${upper(type)}s`, upper(name));
    if (fs.existsSync(dir) && !flags.force) {
        return void console.error('Extension already exists\nRerun the command with a different name or use --force to overwrite');
    }
    fs.mkdirSync(dir, { recursive: true });
    const { extensionStub } = await import('./stubs');
    fs.writeFileSync(path.join(dir, 'index.ts'), extensionStub(type, upper(name)));
    console.log(`Extension created at: ${path.join(dir, 'index.ts')}`);
    console.log('Run "pnpm build" (or restart "pnpm dev") so the new extension is registered.');
});

register('app:extension:disable', 'Disable a extension if it causes issues', async (args) => {
    await boot();
    const { Extension } = await import('@/server/models/Extension');
    const name = args[0] ?? (await ask('Which extension do you want to disable?'));
    const ext = await Extension.query().where('extension', name).first();
    if (!ext) return void console.error('Extension not found');
    await ext.update({ enabled: false });
    console.log('Extension disabled');
});

register('app:extension:install', 'Internal command used to call install on an extension', async (args) => {
    await boot();
    const { ExtensionHelper } = await import('@/server/extensions/helper');
    try {
        const instance = await ExtensionHelper.getExtension(args[0], args[1]);
        await instance.installed?.();
    } catch (e: any) {
        console.error(`An error occurred while installing the extension: ${e?.message ?? e}`);
    }
});

register('app:extension:upgrade', 'Internal command used to call upgrade on an extension', async (args) => {
    await boot();
    const { ExtensionHelper } = await import('@/server/extensions/helper');
    try {
        const instance = await ExtensionHelper.getExtension(args[0], args[1]);
        await instance.upgraded?.(args[2] ?? null);
    } catch (e: any) {
        console.error(`An error occurred while upgrading the extension: ${e?.message ?? e}`);
    }
});

register('app:theme:create', 'Create a new theme from the default theme', async (args) => {
    const name = (args[0] ?? (await ask("What should be the Theme's name?"))).toLowerCase().replaceAll(' ', '-');
    const author = args[1] ?? (await ask('Who is the author of this theme?'));
    const dest = path.join(process.cwd(), 'themes', name);
    if (fs.existsSync(dest)) return void console.error(`Theme "${name}" already exists.`);
    fs.cpSync(path.join(process.cwd(), 'themes', 'default'), dest, { recursive: true });
    console.log('[1/3] Copied files from `default` theme.');
    const file = path.join(dest, 'theme.ts');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace("name = 'Default'", `name = '${name}'`).replace("author = 'Paymenter'", `author = '${author}'`));
    console.log('[2/3] Replaced variables in `theme.ts`.');
    console.log(`[3/3] Theme "${name}" created successfully.\n`);
    console.log('Select it in the admin panel under Settings > Theme, then run `pnpm build` to include it.');
});

register('app:upgrade', 'Upgrade the website to the latest version (or --version=<tag> / --url=<archive url>).', async (_a, flags) => {
    console.log('Starting upgrade process...');
    const options = (['url', 'version'] as const).filter((k) => typeof flags[k] === 'string').map((k) => `--${k}=${flags[k]}`);
    const child = spawn('bash', ['update.sh', '--install', ...options], { stdio: 'inherit' });
    process.exitCode = await new Promise<number>((resolve) => child.on('close', (code) => resolve(code ?? 1)));
});

/* ------------------------------ queue / schedule ------------------------------ */

register('queue:work', 'Start processing jobs on the queue', async (_a, flags) => {
    await boot();
    const { work } = await import('@/server/queue');
    process.env.PAYMENTER_KEEP_ALIVE = '1';
    await work({ queue: typeof flags.queue === 'string' ? flags.queue : 'default', stopWhenEmpty: !!flags['stop-when-empty'], sleep: Number(flags.sleep ?? 3) });
});

register('queue:restart', 'Restart queue worker daemons after their current job', async () => {
    console.log('Broadcasting queue restart signal.');
});

register('queue:retry', 'Retry a failed queue job (id = uuid or "all")', async (args) => {
    await boot();
    const { retryFailedJob } = await import('@/server/queue');
    const { FailedJob } = await import('@/server/models/FailedJob');
    const uuids = args[0] === 'all' ? (await FailedJob.all<InstanceType<typeof FailedJob>>()).map((f) => f.uuid) : args;
    for (const id of uuids) console.log((await retryFailedJob(id)) ? `The failed job [${id}] has been pushed back onto the queue!` : `No failed job matches the given ID: ${id}`);
});

register('schedule:run', 'Run the scheduled commands', async () => {
    await boot();
    await (await import('@/server/schedule')).runScheduledTasks();
});

register('worker', 'Run the queue worker and the scheduler in one process (used by Docker)', async () => {
    await boot();
    process.env.PAYMENTER_KEEP_ALIVE = '1';
    const { work } = await import('@/server/queue');
    const { runScheduledTasks } = await import('@/server/schedule');
    const { Carbon } = await import('@/server/lib/carbon');
    const { ensureSettings } = await import('@/server/settings/store');
    console.log('[worker] started (queue + scheduler)');
    const controller = new AbortController();
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => controller.abort());
    // scheduler: align to the start of every minute
    const tick = async () => {
        if (controller.signal.aborted) return;
        try {
            await ensureSettings();
            await runScheduledTasks(Carbon.now());
        } catch (e: any) {
            console.error('[worker] scheduler error:', e?.message ?? e);
        }
        setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    await work({ signal: controller.signal });
    process.exit(0);
});

register('app:import-from-whmcs', 'Import data from a WHMCS database (usage: <dbname> [username] [host] [port])', async (args) => {
    const required = async (question: string, hidden = false) => {
        for (;;) {
            const v = await ask(question, hidden);
            if (v !== '') return v;
            console.log('Required.');
        }
    };
    const { importFromWhmcs, ImportFailedException } = await import('@/server/commands/import-from-whmcs');
    try {
        await importFromWhmcs(
            { dbname: args[0], username: args[1], host: args[2], port: args[3] },
            {
                text: (question, placeholder) => required(placeholder ? `${question} [${placeholder}]` : question),
                password: (question) => required(question, true),
            },
        );
    } catch (e) {
        if (e instanceof ImportFailedException) {
            console.error(e.message);
            process.exitCode = 1;
            return;
        }
        throw e;
    }
});

/* ------------------------------ compat no-ops ------------------------------ */

for (const [name, description] of [
    ['optimize:clear', 'Remove the cached bootstrap files'],
    ['config:clear', 'Remove the configuration cache file'],
    ['cache:clear', 'Flush the application cache'],
    ['view:clear', 'Clear all compiled view files'],
    ['icons:cache', 'Cache the icon sets'],
    ['down', 'Put the application into maintenance mode'],
    ['up', 'Bring the application out of maintenance mode'],
] as const) {
    register(name, `${description} (kept for compatibility)`, async () => {
        if (name === 'cache:clear' || name === 'optimize:clear') {
            const { cacheFlush } = await import('@/server/cache');
            await cacheFlush();
        }
        if (name === 'down') fs.writeFileSync(path.join(process.cwd(), 'storage', 'framework', 'down'), '');
        if (name === 'up') fs.rmSync(path.join(process.cwd(), 'storage', 'framework', 'down'), { force: true });
        console.log(`${name} done.`);
    });
}

register('php:doctor', 'Check the PHP bridge: php binary, PHP extensions found, Blade themes that cannot run', async () => {
    const { phpAvailability } = await import('@/server/extensions/php/bridge');
    const { discoverPhpExtensions, discoverPhpThemes, discoverLegacyPhpExtensions } = await import('@/server/extensions/php/discovery');
    const a = phpAvailability(true);
    console.log(a.ok ? `php ${a.version} (${a.binary}): OK` : `php: UNAVAILABLE - ${a.reason}`);
    const exts = discoverPhpExtensions();
    console.log(`${exts.length} PHP extension(s) in extensions/`);
    for (const e of exts) {
        console.log(` - ${e.type}/${e.name}`);
        for (const w of e.warnings) console.log(`     ! ${w}`);
    }
    for (const l of discoverLegacyPhpExtensions()) {
        console.log(` - ${l.type}/${l.name}: LEGACY pre-1.0 function-style extension (${l.hooks.slice(0, 6).join(', ')}${l.hooks.length > 6 ? ', ...' : ''}); not loadable, it needs a ${l.name}/${l.name}.php class written for v1.5.x (see docs/php-extensions.md)`);
    }
    const themes = discoverPhpThemes();
    for (const t of themes) console.log(` theme ${t.name}: ${t.reason}`);
    if (a.ok && exts.length) {
        const { getPhpBridge, stopPhpBridge } = await import('@/server/extensions/php/runtime');
        for (const e of exts) {
            try {
                const d = await getPhpBridge().call('describe', { type: e.type, name: e.name });
                console.log(`   ${e.name}: loads, ${d.methods.length} public method(s)`);
            } catch (err: any) {
                console.log(`   ${e.name}: FAILED to load - ${err.message}`);
            }
        }
        stopPhpBridge();
    }
});
