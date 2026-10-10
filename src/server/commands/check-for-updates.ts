import { appCommit, appVersion } from '@/server/version';
import { Http } from '@/server/http';
import { NotificationHelper } from '@/server/helpers/NotificationHelper';
import { Setting } from '@/server/models/Setting';

/** Port of `app:check-for-updates`. */
export async function checkForUpdates(info: (m: string) => void = console.log): Promise<void> {
    const version = appVersion();
    if (version === 'development') {
        info('You are using the development version. No update check available.');
        return;
    }

    let data: any;
    if (version === 'beta') {
        data = (await Http.get('https://api.paymenter.org/version?beta')).json();
        await Setting.updateOrCreate({ key: 'latest_commit' }, { value: data.beta });
        if (appCommit() !== data.beta) {
            info(`A new version is available: ${data.beta}`);
            info('Latest version saved to database.');
        } else {
            info(`You are using the latest version: ${appCommit()}`);
        }
    } else {
        data = (await Http.get('https://api.paymenter.org/version')).json();
        if (version !== data.latest) {
            info(`A new version is available: ${data.latest}`);
            info('Latest version saved to database.');
        } else {
            info(`You are using the latest version: ${version}`);
        }
    }

    const setting = await Setting.query().where('key', 'latest_version').first();
    if (setting && setting.value !== data.latest && version !== data.latest) {
        info('New stable version detected, sending notification to system email address.');
        await NotificationHelper.sendSystemEmailNotification(
            'New stable version available',
            `A new stable version of Paymenter is available: ${data.latest}.<br>\nYou are currently using version: ${version}.<br>\nPlease update as soon as possible.`,
        );
    }
    await Setting.updateOrCreate({ key: 'latest_version' }, { value: data.latest });
    info('Update check completed.');
}
