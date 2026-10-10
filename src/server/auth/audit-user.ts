/**
 * Resolves the acting user id for audit rows. The real implementation lives in
 * the session module; this indirection keeps the ORM free of auth imports.
 */
let resolver: (() => Promise<number | null>) | null = null;

export function setAuditUserResolver(fn: () => Promise<number | null>) {
    resolver = fn;
}

export async function getAuditUserId(): Promise<number | null> {
    try {
        return resolver ? await resolver() : null;
    } catch {
        return null;
    }
}
