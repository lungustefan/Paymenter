import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint } from '@/server/support/push-endpoint';

describe('PushEndpoint', () => {
    it.each([
        'https://fcm.googleapis.com/fcm/send/abc',
        'https://updates.push.services.mozilla.com/wpush/v2/abc',
        'https://foo.notify.windows.com/wpush/v2/abc',
        'https://foo.push.apple.com/3/device/abc',
    ])('allows %s', (endpoint) => {
        expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    });

    it.each([
        'http://fcm.googleapis.com/fcm/send/abc',
        'https://example.com/push',
        'https://fcm.googleapis.com:443/fcm/send/abc',
        'https://push.apple.com/3/device/abc',
        'https://foo.push.apple.com:8443/3/device/abc',
        'https://user:password@fcm.googleapis.com/fcm/send/abc',
        'https://user@fcm.googleapis.com/fcm/send/abc',
    ])('rejects %s', (endpoint) => {
        expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    });
});
