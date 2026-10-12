import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useDatabase } from '../helpers/db';
import { Setting } from '@/server/models/Setting';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-lang-'));

vi.mock('@/generated/registry', async (orig) => ({
    ...(await orig<any>()),
    themeLangRegistry: { 'lang-test': dir, other: dir },
}));

describe('theme language namespace', () => {
    useDatabase();

    beforeAll(() => {
        fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'de'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'en', 'theme.json'), JSON.stringify({ hello: 'Hello :name', only_en: 'English only' }));
        fs.writeFileSync(path.join(dir, 'de', 'theme.json'), JSON.stringify({ hello: 'Hallo :name' }));
    });

    it('resolves the active theme namespace with locale fallback', async () => {
        await Setting.updateOrCreate({ key: 'theme' }, { value: 'lang-test' });
        const { t, flushTranslations, clientMessages } = await import('@/server/i18n');
        flushTranslations();
        expect(t('lang-test::theme.hello', { name: 'Bob' }, 'de')).toBe('Hallo Bob');
        expect(t('lang-test::theme.only_en', {}, 'de')).toBe('English only');
        expect(clientMessages('de')['lang-test::theme']).toEqual({ hello: 'Hallo :name', only_en: 'English only' });
        // core translations keep working
        expect(t('auth.failed')).not.toBe('auth.failed');
    });

    it('does not load the namespace of an inactive theme', async () => {
        const { t, flushTranslations } = await import('@/server/i18n');
        flushTranslations();
        expect(t('other::theme.hello', { name: 'Bob' }, 'en')).toBe('other::theme.hello');
    });
});
