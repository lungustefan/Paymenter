import { CustomProperty } from '@/server/models/CustomProperty';
import { Property } from '@/server/models/Property';
import type { Model } from '@/server/orm';
import type { Rules } from '@/server/validation';
import { dispatch } from '@/server/events';
import { Events } from '@/server/event-defs';
import { Carbon } from '@/server/lib/carbon';

/** Port of the property helpers of App\Livewire\ComponentWithProperties (custom registration / account fields). */

export interface PropertyState {
    customProperties: CustomProperty[];
    properties: Record<string, any>;
}

export async function initializeProperties(model: Model<any> | null, morphClass: string): Promise<PropertyState> {
    const customProperties = await CustomProperty.query().where('model', morphClass).get();
    let properties: Record<string, any> = {};
    if (model) {
        const existing = await Property.query().where('model_id', model.getKey()).where('model_type', (model.ctor as any).morphName).get();
        properties = Object.fromEntries(existing.map((p) => [p.key, p.value]));
    }
    for (const cp of customProperties) {
        // For select types, an empty string shows the placeholder
        if (!(cp.key in properties) && cp.type === 'select') properties[cp.key] = '';
    }
    return { customProperties, properties };
}

export function rulesForProperties(customProperties: CustomProperty[]): Rules {
    return Object.fromEntries(customProperties.map((p) => [`properties.${p.key}`, `${p.required ? 'required|' : 'nullable|'}${p.validation ?? ''}`]));
}

export function attributesForProperties(customProperties: CustomProperty[]): Record<string, string> {
    return Object.fromEntries(customProperties.map((p) => [`properties.${p.key}`, p.name as string]));
}

export async function updateProperties(model: Model<any>, values: Record<string, any>, customProperties: CustomProperty[]): Promise<void> {
    const morph = (model.ctor as any).morphName as string;
    const existing = await Property.query().where('model_id', model.getKey()).where('model_type', morph).get();
    const now = Carbon.now();
    const rows = Object.entries(values)
        .map(([key, value]) => {
            const cp = customProperties.find((c) => c.key === key);
            if (!cp) return null;
            if (cp.non_editable && existing.find((p) => p.key === key)) return null;
            return {
                key,
                value: value === undefined ? null : typeof value === 'boolean' ? (value ? '1' : '0') : value,
                model_id: model.getKey(),
                model_type: morph,
                name: cp.name,
                custom_property_id: cp.id,
                created_at: now,
                updated_at: now,
            };
        })
        .filter(Boolean) as Record<string, any>[];
    await Property.query().upsert(rows, ['key', 'model_id', 'model_type'], ['name', 'value', 'model_id', 'model_type', 'custom_property_id', 'updated_at']);
    await dispatch(Events.Properties.Updated, { model, properties: rows });
}
