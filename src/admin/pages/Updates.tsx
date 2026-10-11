import { spawn } from 'node:child_process';
import type { ReactNode } from 'react';
import { AdminPage } from '../core/Page';
import { Action } from '../actions/Action';
import { Notification } from '../Notification';
import { hasPermission } from '@/server/policies';
import { setting } from '@/server/config';
import { appCommit, appVersion } from '@/server/version';
import { checkForUpdates, RELEASES_REPO } from '@/server/commands/check-for-updates';
import { buttonClass } from '../ui/classes';
import { UpdateRunner } from './updates-client';
import type { AdminActionResult } from '../protocol';
import type { User } from '@/server/models/User';

/** runs `app:upgrade` (update.sh) and returns what it printed */
function runUpgrade(): Promise<string> {
    return new Promise((resolve) => {
        const child = spawn('bash', ['update.sh', '--install'], { cwd: process.cwd() });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        child.on('close', () => resolve(out));
        child.on('error', (e) => resolve(out + String(e)));
    });
}

const Link = () => (
    <a href={`https://github.com/${RELEASES_REPO}#updating`}>
        https://github.com/{RELEASES_REPO}#updating
    </a>
);

/** App\Admin\Pages\Updates */
export class Updates extends AdminPage {
    static slug = 'updates';
    static title = 'Updates';
    static navigationGroup = 'System';
    static navigationIcon = 'ri-loop-left-line';
    static activeNavigationIcon = 'ri-loop-left-fill';

    static override async canAccess(user: User | null) {
        return !!user && (await hasPermission(user, 'admin.updates.update'));
    }

    override getHeaderActions() {
        return [
            Action.make('checkUpdates')
                .label('Check for updates')
                .action(async () => {
                    await checkForUpdates(() => undefined);
                }),
        ];
    }

    override async callMethod(method: string): Promise<AdminActionResult> {
        if (method !== 'update') return { ok: false };
        if (!(await Updates.canAccess(this.user))) return { ok: false };
        const output = await runUpgrade();
        await Notification.make().title('Update finished').success().send();
        return { ok: true, data: { output } };
    }

    render(): ReactNode {
        const version = appVersion();
        const beta = version === 'beta';
        const latestVersion = setting('latest_version');
        const upgradeButton = (
            <button type="button" data-update-button className={buttonClass({ color: 'primary', size: 'md', extra: 'fi-ac-btn-action' })}>
                Update
            </button>
        );
        const howTo = (
            <>
                <p>
                    See <Link /> on how to update
                </p>
                <p className="mt-2">OR try the web updater (This is a beta feature, use at your own risk)</p>
                <UpdateRunner>{upgradeButton}</UpdateRunner>
            </>
        );
        return (
            <>
                {beta && (
                    <div>
                        <strong>Warning:</strong> You are using a beta version of the application. This can cause problems
                    </div>
                )}
                {beta && setting('latest_commit') !== appCommit() ? (
                    <div className="flex flex-col gap-1">
                        <div>
                            <strong>Latest commit:</strong> {setting('latest_commit')}
                        </div>
                        <div>
                            <strong>Your commit:</strong> {appCommit()}
                        </div>
                        {howTo}
                    </div>
                ) : !beta && version !== latestVersion ? (
                    <div className="flex flex-col gap-1">
                        <div>
                            <strong>Latest version:</strong> {latestVersion}
                        </div>
                        <div>
                            <strong>Your version:</strong> {version}
                        </div>
                        {howTo}
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        <div>
                            <strong>Latest version:</strong> {latestVersion}
                        </div>
                        <div>
                            <strong>Your version:</strong> {version}
                        </div>
                        <p>You are up to date!</p>
                    </div>
                )}
            </>
        );
    }
}
