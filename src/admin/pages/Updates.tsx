import { spawn } from 'node:child_process';
import type { ReactNode } from 'react';
import { AdminPage } from '../core/Page';
import { Action } from '../actions/Action';
import { Notification } from '../Notification';
import { hasPermission } from '@/server/policies';
import { setting } from '@/server/config';
import { appCommit, appVersion, isNewerVersion } from '@/server/version';
import { checkForUpdates, RELEASES_REPO } from '@/server/commands/check-for-updates';
import { buttonClass } from '../ui/classes';
import { AddonFilters, SortHeader, UpdateRunner } from './updates-client';
import { Icon } from '../ui/Icon';
import { badgeClass } from '../ui/classes';
import { forgetExtensionUpdates, getInstalledAddons, type InstalledAddon } from '@/server/extensions/updates';
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
                    try {
                        await checkForUpdates(() => undefined);
                    } catch (e: any) {
                        console.error('Update check failed:', e.message);
                    }
                    await forgetExtensionUpdates();
                    await Notification.make().title('Update check completed').body('System and installed extension update statuses have been refreshed.').success().send();
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

    private async renderAddons(): Promise<ReactNode> {
        const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
        const q = first(this.searchParams.q).trim().toLowerCase();
        const usedOnly = first(this.searchParams.all) !== '1';
        const sort = ['name', 'type'].includes(first(this.searchParams.sort)) ? first(this.searchParams.sort) : '';
        const dir = first(this.searchParams.dir) === 'desc' ? 'desc' : 'asc';
        let addons: InstalledAddon[] = [];
        try {
            addons = await getInstalledAddons();
        } catch (e: any) {
            console.error('Could not list the installed extensions:', e.message);
        }
        const rows = addons
            .filter((a) => (!usedOnly || a.isUsed) && (!q || `${a.name} ${a.author ?? ''}`.toLowerCase().includes(q)))
            .sort((a, b) => (sort ? (sort === 'name' ? a.name : a.type).localeCompare(sort === 'name' ? b.name : b.type) * (dir === 'desc' ? -1 : 1) : 0));
        const ver = (v: string | null) => (v && /^\d/.test(v) ? `v${v}` : v);
        const statusColor = (s: string) => (s === 'Up to date' ? 'success' : s === 'Update available' ? 'warning' : s === 'Error' ? 'danger' : 'gray');
        const typeColor = (t: string) => (t.toLowerCase() === 'gateway' ? 'info' : t.toLowerCase() === 'server' ? 'warning' : 'success');
        const badge = (text: string, color: any, key?: string) => (
            <span key={key} className={badgeClass({ color })}>
                <span className="fi-badge-label-ctn">
                    <span className="fi-badge-label">{text}</span>
                </span>
            </span>
        );
        return (
            <div className="fi-ta mt-6" data-addons-table>
                <div className="fi-ta-ctn fi-ta-ctn-with-header">
                    <div className="fi-ta-main">
                        <div className="fi-ta-header-ctn">
                            <div className="fi-ta-header">
                                <div>
                                    <h3 className="fi-ta-header-heading">Installed Addons &amp; Extensions</h3>
                                    <p className="fi-ta-header-description">List of all installed addons, gateways, and server integrations with their version numbers and update status.</p>
                                </div>
                            </div>
                        </div>
                        <AddonFilters search={first(this.searchParams.q)} usedOnly={usedOnly} />
                        <div className="fi-ta-content-ctn">
                            <table className="fi-ta-table">
                                <thead>
                                    <tr>
                                        <th className="fi-ta-header-cell" />
                                        <th className="fi-ta-header-cell"><SortHeader column="name" label="Name" sort={sort} dir={dir} /></th>
                                        <th className="fi-ta-header-cell"><SortHeader column="type" label="Type" sort={sort} dir={dir} /></th>
                                        {['Installed Version', 'Latest Version', 'Status'].map((h) => (
                                            <th key={h} className="fi-ta-header-cell"><span className="fi-ta-header-cell-label">{h}</span></th>
                                        ))}
                                        <th className="fi-ta-header-cell" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((a) => (
                                        <tr key={a.id} className="fi-ta-row" data-addon={a.id}>
                                            <td className="fi-ta-cell">
                                                <div className="fi-ta-col">{a.icon ? <img src={a.icon} alt="" className="h-8 w-8 object-contain" /> : <Icon icon="ri-puzzle-fill" />}</div>
                                            </td>
                                            <td className="fi-ta-cell">
                                                <div className="fi-ta-col">
                                                    <div className="flex flex-col">
                                                        <span className="fi-ta-text fi-ta-text-item">{a.name}</span>
                                                        {a.author && <span className="text-xs text-gray-500 dark:text-gray-400">By {a.author}</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="fi-ta-cell"><div className="fi-ta-col">{badge(a.type, typeColor(a.type))}</div></td>
                                            <td className="fi-ta-cell"><div className="fi-ta-col">{badge(ver(a.version) ?? '', a.isBuiltin ? 'success' : 'gray')}</div></td>
                                            <td className="fi-ta-cell">
                                                <div className="fi-ta-col">{badge(ver(a.latestVersion) ?? 'Not available', a.status === 'Up to date' ? 'success' : 'warning')}</div>
                                            </td>
                                            <td className="fi-ta-cell">
                                                <div className="fi-ta-col" title={a.marketplaceUrl ? 'Visit extension page' : a.status === 'Builtin' ? 'This is a built-in extension and cannot be updated.' : undefined}>
                                                    {a.marketplaceUrl ? (
                                                        <a href={a.marketplaceUrl} target="_blank" rel="noopener noreferrer">{badge(a.status, statusColor(a.status))}</a>
                                                    ) : (
                                                        badge(a.status, statusColor(a.status))
                                                    )}
                                                </div>
                                            </td>
                                            <td className="fi-ta-cell fi-ta-actions-cell">
                                                {a.url && (
                                                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="fi-link fi-size-sm">
                                                        Visit Website
                                                    </a>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {rows.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="fi-ta-cell">
                                                <div className="fi-ta-empty-state-content">No records found</div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    async render(): Promise<ReactNode> {
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
                ) : !beta && isNewerVersion(latestVersion, version) ? (
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
                {await this.renderAddons()}
            </>
        );
    }
}
