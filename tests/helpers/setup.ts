import { afterAll, vi } from 'vitest';

// Server code reads cookies / headers through Next.js; tests provide them with `Browser` (tests/helpers/http.ts).
vi.mock('next/headers', async () => {
    const { nextHeadersMock } = await import('./http');
    return nextHeadersMock();
});

afterAll(async () => {
    const { closePool } = await import('@/server/db/connection');
    await closePool();
});
