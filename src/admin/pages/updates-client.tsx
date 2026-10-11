'use client';

import { useState, type ReactNode } from 'react';
import { useAdminActions } from '../actions/client';

/** the web updater: the "Update" button (confirmed) and the console output (`ansi_up`) */
export function UpdateRunner({ children }: { children: ReactNode }) {
    const { dispatch, apply } = useAdminActions();
    const [output, setOutput] = useState('');
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (!window.confirm('Are you sure?')) return;
        setBusy(true);
        try {
            const result = apply(await dispatch({ type: 'page', method: 'update' }));
            const text = String((result.data as any)?.output ?? '');
            if (!(window as any).AnsiUp) {
                await new Promise<void>((resolve) => {
                    const s = document.createElement('script');
                    s.src = '/js/ansi_up/ansi_up.min.js';
                    s.onload = () => resolve();
                    document.head.appendChild(s);
                });
            }
            setOutput(new (window as any).AnsiUp().ansi_to_html(text));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="mt-2" onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest('[data-update-button]')) {
                    e.preventDefault();
                    if (!busy) void run();
                }
            }}>
                {children}
            </div>
            <code>
                <pre id="update-result" className="mt-2" dangerouslySetInnerHTML={{ __html: output }} />
            </code>
        </>
    );
}
