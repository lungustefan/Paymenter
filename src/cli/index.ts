import { loadEnv } from '@/server/env';
import { closePool } from '@/server/db/connection';
import { commands } from './registry';

loadEnv();

function parse(argv: string[]) {
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};
    for (const a of argv) {
        if (a.startsWith('--')) {
            const [k, ...v] = a.slice(2).split('=');
            flags[k] = v.length ? v.join('=') : true;
        } else {
            args.push(a);
        }
    }
    return { args, flags };
}

async function main() {
    const [name, ...rest] = process.argv.slice(2);

    // Command modules self-register on import
    await import('./commands');

    if (!name || name === 'list' || name === '--help') {
        console.log('Paymenter CLI\n\nAvailable commands:');
        const width = Math.max(...Object.keys(commands).map((c) => c.length));
        for (const [n, c] of Object.entries(commands).sort(([a], [b]) => a.localeCompare(b))) {
            console.log(`  ${n.padEnd(width + 2)}${c.description}`);
        }
        return;
    }

    const command = commands[name];
    if (!command) {
        console.error(`Command "${name}" is not defined.`);
        process.exitCode = 1;
        return;
    }
    const { args, flags } = parse(rest);
    await command.run(args, flags);
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        if (process.env.APP_DEBUG === 'true' && e instanceof Error) console.error(e.stack);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool();
        // Long-running commands (worker) never reach here; everything else should exit.
        if (!process.env.PAYMENTER_KEEP_ALIVE) process.exit(process.exitCode ?? 0);
    });
