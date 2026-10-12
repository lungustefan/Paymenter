/**
 * Port of App\Support\Passport\ScopeRegistry: the OAuth scopes clients may request.
 * Extensions can register more with `ScopeRegistry.add('invoices', 'View your invoices')`
 * (first registration of a scope wins, like in PHP).
 */
export class ScopeRegistry {
    protected static scopes: Record<string, string> = {
        profile: 'View your profile',
    };

    static add(scope: string, description: string): void {
        if (!Object.prototype.hasOwnProperty.call(ScopeRegistry.scopes, scope)) ScopeRegistry.scopes[scope] = description;
    }

    static addMany(scopes: Record<string, string>): void {
        for (const [key, desc] of Object.entries(scopes)) ScopeRegistry.add(key, desc);
    }

    static getAll(): Record<string, string> {
        return { ...ScopeRegistry.scopes };
    }

    /** `Passport::hasScope()` (the wildcard is always known) */
    static has(id: string): boolean {
        return id === '*' || Object.prototype.hasOwnProperty.call(ScopeRegistry.scopes, id);
    }

    /** `Passport::scopesFor()`: unknown ids are dropped. */
    static scopesFor(ids: string[]): { id: string; description: string }[] {
        return ids.filter((id) => Object.prototype.hasOwnProperty.call(ScopeRegistry.scopes, id)).map((id) => ({ id, description: ScopeRegistry.scopes[id] }));
    }
}
