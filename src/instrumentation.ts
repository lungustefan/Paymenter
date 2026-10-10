/**
 * Runs once when the server starts (like Laravel's service providers booting):
 * loads settings, registers listeners and boots the enabled extensions.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { boot } = await import('./server/bootstrap');
        try {
            await boot();
        } catch (e) {
            console.error('[paymenter] boot failed:', e);
        }
    }
}
