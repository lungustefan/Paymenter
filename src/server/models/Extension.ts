import { Model, morphMany } from '@/server/orm';
import type { RelationDef } from '@/server/orm';
import { extensions } from '@/server/db/schema';
import type { Row } from './_types';
import { Setting } from './Setting';

export interface Extension extends Row<typeof extensions> {}

export class Extension extends Model<{ settings: Setting[] }> {
    static table = extensions;
    static morphName = 'App\\Models\\Extension';
    static guarded: string[] = [];
    static softDeletes = true;
    static auditable = true;
    static accessors = ['path', 'namespace'];

    static relations: Record<string, RelationDef> = {
        settings: morphMany(() => Setting, 'settingable'),
    };

    /** `Gateways/Stripe` - folder of the extension relative to ./extensions */
    path(): string {
        return `${ucfirst(this.type)}s/${ucfirst(this.extension)}`;
    }

    /** The PHP namespace; kept so identifiers shown to admins stay recognisable. */
    namespace(): string {
        return `Paymenter\\Extensions\\${ucfirst(this.type)}s\\${ucfirst(this.extension)}`;
    }

    /** settings as `{ key: value }` (what `->settings->pluck('value', 'key')` returned) */
    async settingsMap(): Promise<Record<string, any>> {
        const out: Record<string, any> = {};
        for (const s of await this.rel('settings')) out[s.key] = s.value;
        return out;
    }
}

function ucfirst(s: string) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
