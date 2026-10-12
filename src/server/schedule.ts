import { setting } from './config';
import { cacheGet, cachePut } from './cache';
import { Settings } from './classes/Settings';
import { cronJob } from './commands/cron-job';
import { fetchEmails } from './commands/fetch-emails';
import { scheduleHeartbeat } from './commands/heartbeat';
import { telemetry } from './commands/telemetry';
import { Carbon } from './lib/carbon';
import { flushTerminating } from './terminating';
import { config } from './config';

/**
 * Port of routes/console.php: the task schedule. `runScheduledTasks()` is what
 * `schedule:run` (cron) and the long-running `worker` execute once per minute.
 */
interface Task {
    name: string;
    description: string;
    due: (now: Carbon) => boolean | Promise<boolean>;
    run: () => Promise<void>;
    /** `withoutOverlapping` / `onOneServer` */
    lockSeconds?: number;
}

function tasks(): Task[] {
    const list: Task[] = [
        { name: 'heartbeat', description: 'Updates the last scheduler run time', due: () => true, run: () => scheduleHeartbeat() },
        {
            name: 'cron-job',
            description: 'Runs daily to send out invoices, suspend servers, etc.',
            due: (now) => now.format('H:i') === String(setting('cronjob_time', '00:00')).slice(0, 5),
            run: () => cronJob(),
            lockSeconds: 3600,
        },
        { name: 'fetch-emails', description: 'Import ticket emails using IMAP', due: (now) => now.minute % 5 === 0, run: () => fetchEmails(), lockSeconds: 300 },
    ];
    return list;
}

async function telemetryTask(): Promise<Task | null> {
    if (!config('app.telemetry_enabled')) return null;
    const { hour, minute } = await Settings.getTelemetry();
    return {
        name: 'telemetry',
        description: 'Sends telemetry data',
        due: (now) => now.hour === hour && now.minute === minute,
        run: () => telemetry(false),
        lockSeconds: 3600,
    };
}

export async function runScheduledTasks(now: Carbon = Carbon.now(), log: (m: string) => void = console.log): Promise<void> {
    const all = [...tasks()];
    const tele = await telemetryTask();
    if (tele) all.push(tele);

    for (const task of all) {
        if (!(await task.due(now))) continue;
        if (task.lockSeconds) {
            const lock = `schedule:${task.name}:${now.format('YmdHi')}`;
            if (await cacheGet(lock)) continue; // another process already runs this minute's task
            await cachePut(lock, 1, task.lockSeconds);
        }
        log(`  Running [${task.name}] ${task.description}`);
        try {
            await task.run();
        } catch (e: any) {
            console.error(`[schedule] ${task.name} failed:`, e?.message ?? e);
        } finally {
            await flushTerminating();
        }
    }
}
