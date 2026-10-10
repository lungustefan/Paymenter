import { Carbon } from '@/server/lib/carbon';
import { CronStat } from '@/server/models/CronStat';
import { Setting } from '@/server/models/Setting';

/** `app:schedule-heartbeat-command`: lets the admin panel show that the scheduler is running. */
export async function scheduleHeartbeat() {
    await Setting.updateOrCreate({ key: 'last_scheduler_run', settingable_type: CronStat.morphName }, { value: Carbon.now().toDateTimeString() });
}
