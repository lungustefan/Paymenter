'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ri } from '@/components/icons/Ri';
import { PrimaryButton, DangerButton } from './Button';
import { cn } from './cn';

/* ---------------------------------------------------------------- i18n */

type Messages = Record<string, any>;
const I18nContext = createContext<{ messages: Messages; locale: string; availableLocales: Record<string, string> }>({ messages: {}, locale: 'en', availableLocales: {} });

function lookup(messages: Messages, key: string): string | undefined {
    const [group, ...rest] = key.split('.');
    let cur: any = messages[group];
    if (cur === undefined) return typeof messages.__json?.[key] === 'string' ? messages.__json[key] : undefined;
    for (const part of rest) {
        if (cur === undefined || cur === null) return undefined;
        cur = cur[part];
    }
    return typeof cur === 'string' ? cur : undefined;
}

function replaceTokens(line: string, replace: Record<string, unknown>): string {
    for (const k of Object.keys(replace).sort((a, b) => b.length - a.length)) {
        const v = String(replace[k] ?? '');
        line = line
            .replaceAll(`:${k.toUpperCase()}`, v.toUpperCase())
            .replaceAll(`:${k.charAt(0).toUpperCase()}${k.slice(1)}`, v.charAt(0).toUpperCase() + v.slice(1))
            .replaceAll(`:${k}`, v);
    }
    return line;
}

/** `__('key', {replace})` for client components. */
export function useT() {
    const { messages, locale } = useContext(I18nContext);
    return useMemo(
        () => ({
            locale,
            t: (key: string, replace: Record<string, unknown> = {}) => replaceTokens(lookup(messages, key) ?? key, replace),
        }),
        [messages, locale],
    );
}

export function useLocaleInfo() {
    const { locale, availableLocales } = useContext(I18nContext);
    return { locale, availableLocales };
}

/* ---------------------------------------------------------------- toasts */

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | string;
    show: boolean;
    timeout?: number;
}

const ToastContext = createContext<{ notify: (message: string, type?: string, timeout?: number) => void }>({ notify: () => {} });

export function useNotify() {
    return useContext(ToastContext).notify;
}

/** Port of the `notifications` Alpine store + components/notification.blade.php */
function ToastHost({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
    return (
        <div>
            {toasts
                .filter((t) => t.show)
                .map((n, index) => (
                    <div
                        key={n.id}
                        onClick={() => remove(n.id)}
                        className={cn('fixed text-white px-4 py-2 rounded shadow-md mb-4 z-50', n.type === 'success' ? 'bg-secondary' : 'bg-red-500')}
                        style={{ top: `${20 + index * 60}px`, left: '50%', transform: 'translateX(-50%)' }}
                    >
                        <p>{n.message}</p>
                    </div>
                ))}
        </div>
    );
}

/* ---------------------------------------------------------------- confirmation */

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    callback?: () => Promise<void> | void;
}

const ConfirmContext = createContext<{ confirm: (o: ConfirmOptions) => void }>({ confirm: () => {} });

export function useConfirm() {
    return useContext(ConfirmContext).confirm;
}

/* ---------------------------------------------------------------- theme mode */

export type ThemeMode = 'light' | 'dark' | 'system';
const ThemeModeContext = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void; isDark: boolean }>({ mode: 'system', setMode: () => {}, isDark: false });

export function useThemeMode() {
    return useContext(ThemeModeContext);
}

const STORAGE_KEY = '_x_theme_mode'; // Alpine's `$persist(...).as('theme_mode')` key, so existing preferences carry over

function readMode(): ThemeMode {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return 'system';
        const parsed = JSON.parse(raw);
        return parsed === 'light' || parsed === 'dark' || parsed === 'system' ? parsed : 'system';
    } catch {
        return 'system';
    }
}

/** Inline script applied before paint to avoid a flash of the wrong theme. */
export const themeInitScript = `(function(){try{var m=JSON.parse(localStorage.getItem('${STORAGE_KEY}')||'"system"');var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.body&&document.body.classList.toggle('dark',d)}catch(e){}})()`;

/* ---------------------------------------------------------------- provider */

export function Providers({
    messages,
    locale,
    availableLocales,
    flash,
    children,
}: {
    messages: Messages;
    locale: string;
    availableLocales: Record<string, string>;
    flash?: { id: number; message: string; type: string } | null;
    children: ReactNode;
}) {
    // toasts
    const [toasts, setToasts] = useState<Toast[]>([]);
    const seq = useRef(0);
    const removeToast = useCallback((id: number) => {
        setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, show: false } : t)).filter((t) => t.show));
    }, []);
    const notify = useCallback(
        (message: string, type = 'success', timeout = 5000) => {
            const id = Date.now() + Math.floor(Math.random() * 1000) + seq.current++;
            setToasts((ts) => [...ts, { id, message, type, show: true }]);
            setTimeout(() => removeToast(id), timeout);
        },
        [removeToast],
    );

    // `$this->notify(..., redirect: true)`: the server leaves the message in a short-lived cookie
    const lastFlash = useRef<number | null>(null);
    useEffect(() => {
        if (!flash || lastFlash.current === flash.id) return;
        lastFlash.current = flash.id;
        notify(flash.message, flash.type);
        document.cookie = 'paymenter_flash=; Max-Age=0; path=/';
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flash?.id]);

    // confirmation
    const [confirmState, setConfirmState] = useState<(ConfirmOptions & { show: boolean; loading: boolean }) | null>(null);
    const confirm = useCallback((o: ConfirmOptions) => setConfirmState({ ...o, show: true, loading: false }), []);
    const closeConfirm = () => setConfirmState((s) => (s && !s.loading ? null : s));
    const executeConfirm = async () => {
        if (!confirmState || confirmState.loading) return;
        setConfirmState({ ...confirmState, loading: true });
        try {
            await confirmState.callback?.();
            setConfirmState(null);
        } catch (e) {
            console.error('Callback failed:', e);
            setConfirmState(null);
        }
    };

    // push notifications: the service worker hands over notifications that should show up inside the page
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/service-worker.js').catch((error) => console.log('Service Worker registration failed:', error));
        const onMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'SHOW_NOTIFICATION') window.dispatchEvent(new CustomEvent('new-notification'));
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, []);

    // dark mode
    const [mode, setModeState] = useState<ThemeMode>('system');
    const [systemDark, setSystemDark] = useState(false);
    useEffect(() => {
        setModeState(readMode());
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemDark(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    const isDark = mode === 'dark' || (mode === 'system' && systemDark);
    useEffect(() => {
        document.body.classList.toggle('dark', isDark);
        document.documentElement.classList.toggle('dark', isDark);
    }, [isDark]);
    const setMode = useCallback((m: ThemeMode) => {
        setModeState(m);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
        } catch {
            /* ignore */
        }
    }, []);

    return (
        <I18nContext.Provider value={{ messages, locale, availableLocales }}>
            <ToastContext.Provider value={{ notify }}>
                <ConfirmContext.Provider value={{ confirm }}>
                    <ThemeModeContext.Provider value={{ mode, setMode, isDark }}>
                        {children}
                        <ToastHost toasts={toasts} remove={removeToast} />
                        {confirmState?.show && (
                            <div
                                className="fixed inset-0 z-30 flex items-center justify-center overflow-hidden bg-black/50"
                                onKeyDown={(e) => e.key === 'Escape' && closeConfirm()}
                            >
                                <div className="px-6 py-4 w-full mx-2 md:mx-auto text-left bg-background-secondary rounded shadow-lg max-h-screen overflow-y-auto mb-8 mt-8 max-w-2xl">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-2xl font-semibold text-primary-100">{confirmState.title}</h2>
                                        <button type="button" onClick={closeConfirm} className={cn('text-primary-100', confirmState.loading && 'opacity-50 cursor-not-allowed')}>
                                            <Ri name="close-fill" className="size-6" />
                                        </button>
                                    </div>
                                    <div className="mt-4">{confirmState.message}</div>
                                    <div className="mt-5 sm:mt-4 flex-col sm:flex-row flex sm:flex-row-reverse gap-2">
                                        <PrimaryButton type="button" onClick={executeConfirm} disabled={confirmState.loading}>
                                            {confirmState.loading && (
                                                <div className="mr-2">
                                                    <Ri name="loader-5-fill" className="size-4 animate-spin" />
                                                </div>
                                            )}
                                            <span>{confirmState.loading ? 'Loading...' : (confirmState.confirmText ?? 'Confirm')}</span>
                                        </PrimaryButton>
                                        <DangerButton type="button" onClick={closeConfirm} disabled={confirmState.loading}>
                                            {confirmState.cancelText ?? 'Cancel'}
                                        </DangerButton>
                                    </div>
                                </div>
                            </div>
                        )}
                    </ThemeModeContext.Provider>
                </ConfirmContext.Provider>
            </ToastContext.Provider>
        </I18nContext.Provider>
    );
}
