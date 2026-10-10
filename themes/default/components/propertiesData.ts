import type { CustomProperty } from '@/server/models/CustomProperty';

export interface CustomPropertyDef {
    key: string;
    name: string;
    type: string;
    required: boolean;
    non_editable: boolean;
    allowed_values: string[];
}

export function serializeProperties(list: CustomProperty[]): CustomPropertyDef[] {
    return list.map((p) => ({
        key: p.key as string,
        name: p.name as string,
        type: p.type as string,
        required: !!p.required,
        non_editable: !!p.non_editable,
        allowed_values: (p.allowed_values as string[] | null) ?? [],
    }));
}
