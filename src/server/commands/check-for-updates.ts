import { appCommit, appVersion, isNewerVersion } from '@/server/version';
import { Http } from '@/server/http';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { Setting } from '@/server/models/Setting';

/** This edition is released on GitHub; api.paymenter.org reports the releases of the PHP version. */
export const RELEASES_REPO = 'lungustefan/Paymenter';

/**
 * The version update.sh installs: the newest stable release, or the newest pre-release
 * while a pre-release is installed or no stable release exists yet.
 */
async function latestRelease(version: string): Promise<string> {
    const releases: any[] = (await Http.get(`https://api.github.com/repos/${RELEASES_REPO}/releases`)).throw().json() ?? [];
    const usable = releases.filter((r) => !r.draft && r.assets?.some((a: any) => a.name === 'paymenter.tar.gz'));
    const release = usable.find((r) => version.includes('-') || !r.prerelease) ?? usable[0];
    if (!release) throw new Error(`No release found in ${RELEASES_REPO}.`);
    return String(release.tag_name).replace(/^v/, '');
}

/** Port of `app:check-for-updates`. */
export async function checkForUpdates(info: (m: string) => void = console.log): Promise<void> {
    const version = appVersion();
    if (version === 'development') {
        info('You are using the development version. No update check available.');
        return;
    }

    const latest = await latestRelease(version);
    if (version === 'beta') {
        const commit = (await Http.get(`https://api.github.com/repos/${RELEASES_REPO}/commits/master`)).throw().json('sha');
        await Setting.updateOrCreate({ key: 'latest_commit' }, { value: commit });
        if (appCommit() !== commit) {
            info(`A new version is available: ${commit}`);
            info('Latest version saved to database.');
        } else {
            info(`You are using the latest version: ${appCommit()}`);
        }
    } else {
        if (isNewerVersion(latest, version)) {
            info(`A new version is available: ${latest}`);
            info('Latest version saved to database.');
        } else {
            info(`You are using the latest version: ${version}`);
        }
    }

    const setting = await Setting.query().where('key', 'latest_version').first();
    if (setting && setting.value !== latest && isNewerVersion(latest, version)) {
        info('New version detected, sending notification to system email address.');
        await NotificationHelper.sendSystemEmailNotification(
            'New version available',
            `A new version of Paymenter is available: ${latest}.<br>\nYou are currently using version: ${version}.<br>\nPlease update as soon as possible.`,
        );
    }
    await Setting.updateOrCreate({ key: 'latest_version' }, { value: latest });
    info('Update check completed.');
}
