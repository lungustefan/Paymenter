import { register } from './registry';
import { dropAllTables, migrate, migrationStatus } from '@/server/db/migrate';

register('migrate', 'Run the database migrations', async (_args, flags) => {
    console.log('\n  INFO  Running migrations.\n');
    await migrate({ log: console.log });
    if (flags.seed) {
        const { seed } = await import('@/server/db/seed');
        await seed(console.log);
    }
});

register('migrate:status', 'Show the status of each migration', async () => {
    for (const m of await migrationStatus()) {
        console.log(`  ${m.batch === null ? 'Pending' : `Ran [${m.batch}]`}  ${m.name}`);
    }
});

register('migrate:fresh', 'Drop all tables and re-run all migrations', async (_args, flags) => {
    await dropAllTables();
    console.log('Dropped all tables successfully.');
    await migrate({ log: console.log });
    if (flags.seed) {
        const { seed } = await import('@/server/db/seed');
        await seed(console.log);
    }
});
