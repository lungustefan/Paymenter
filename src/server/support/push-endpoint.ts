// https://raw.githubusercontent.com/pushpad/known-push-services/refs/heads/master/whitelist
const WHITELIST = [
    'android.googleapis.com',
    'fcm.googleapis.com',
    'jmt17.google.com',
    'updates.push.services.mozilla.com',
    'updates-autopush.stage.mozaws.net',
    'updates-autopush.dev.mozaws.net',
    '*.notify.windows.com',
    '*.push.apple.com',
];

/** Port of App\Support\PushEndpoint::isAllowed() - only well-known push services may be contacted. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
    let u: URL;
    try {
        u = new URL(endpoint);
    } catch {
        return false;
    }
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    for (const allowed of WHITELIST) {
        if (allowed === host) return true;
        if (allowed.startsWith('*.')) {
            const suffix = allowed.slice(1); // ".notify.windows.com"
            if (host.endsWith(suffix) && host !== suffix.slice(1)) return true;
        }
    }
    return false;
}
