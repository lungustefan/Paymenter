import type { ModelCtor } from './builder';

/**
 * Morph map: the database stores fully-qualified PHP class names
 * (e.g. `App\Models\Service`) in `*_type` columns. Models register under
 * that exact string so existing polymorphic rows keep resolving.
 */
const byMorph = new Map<string, ModelCtor<any>>();

export function registerModel(ctor: ModelCtor<any>) {
    if (ctor.morphName) byMorph.set(ctor.morphName, ctor);
}

export function resolveMorph(name: string): ModelCtor<any> | undefined {
    return byMorph.get(name);
}

export function allModels(): ModelCtor<any>[] {
    return [...byMorph.values()];
}
