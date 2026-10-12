/** Laravel's default 403 page (`abort(403)` / Filament `canAccessPanel()`) */
export default function Forbidden() {
    return (
        <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#636b6f', background: '#f9fafb' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ padding: '0 1rem', fontSize: '1.125rem', letterSpacing: '0.05em', borderRight: '1px solid #9ca3af' }}>403</span>
                <span style={{ padding: '0 1rem', fontSize: '1.125rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Forbidden</span>
            </div>
        </main>
    );
}
