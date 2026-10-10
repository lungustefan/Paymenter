'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { adminDispatch } from '../dispatch';
import { useAdminNotify, Dropdown } from '../layout/client';
import type { AdminActionResult, AdminOp } from '../protocol';

/* -------------------------------------------------------------------------------------------------
 * The "livewire" connection of a page: where server actions are sent and what happens with the result
 * ----------------------------------------------------------------------------------------------- */

interface ModalEntry {
    key: string;
    node: ReactNode;
}

interface ActionsApi {
    /** `admin/currencies/1/edit?x=y` of the page the user is looking at */
    url: string;
    dispatch: (op: AdminOp) => Promise<AdminActionResult>;
    /** applies notifications / redirect / refresh of a result */
    apply: (result: AdminActionResult) => AdminActionResult;
    mount: (action: string, args?: Record<string, any>, records?: Array<string | number>, state?: Record<string, any>) => Promise<void>;
    call: (action: string, args?: Record<string, any>, records?: Array<string | number>, state?: Record<string, any>) => Promise<AdminActionResult>;
    openModal: (node: ReactNode) => void;
    closeModal: () => void;
    modals: ModalEntry[];
    busy: boolean;
}

const Ctx = createContext<ActionsApi | null>(null);

export function useAdminActions(): ActionsApi {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useAdminActions() needs an <ActionsProvider>');
    return ctx;
}

/** the selected rows of the table the action buttons are inside */
export interface SelectionApi {
    selected: Array<string | number>;
    clear: () => void;
}
export const SelectionContext = createContext<SelectionApi | null>(null);
/** gives the actions inside a form access to its current state */
export const FormStateContext = createContext<{ current: (() => Record<string, any>) | null }>({ current: null });

export function ActionsProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams().toString();
    const notify = useAdminNotify();
    const url = pathname + (search ? `?${search}` : '');
    const [modals, setModals] = useState<ModalEntry[]>([]);
    const [busy, setBusy] = useState(false);
    const counter = useRef(0);

    const apply = useCallback(
        (result: AdminActionResult) => {
            for (const n of result.notifications ?? []) notify(n);
            // `$set()` calls of an action: the form of the page takes the new values
            if (result.patches && Object.keys(result.patches).length) window.dispatchEvent(new CustomEvent('admin-form-patches', { detail: result.patches }));
            // a field action re-renders the whole form (a Livewire request morphs the component)
            if (result.schema !== undefined && !result.modal) window.dispatchEvent(new CustomEvent('admin-form-schema', { detail: result.schema }));
            if (result.redirect) router.push(result.redirect);
            else if (result.refresh) router.refresh();
            if (result.close) setModals((m) => m.slice(0, -1));
            return result;
        },
        [notify, router],
    );

    const dispatch = useCallback((op: AdminOp) => adminDispatch(url, op), [url]);

    const openModal = useCallback((node: ReactNode) => {
        counter.current++;
        setModals((m) => [...m, { key: `m${counter.current}`, node }]);
    }, []);
    const closeModal = useCallback(() => setModals((m) => m.slice(0, -1)), []);

    const mount = useCallback(
        async (action: string, args?: Record<string, any>, records?: Array<string | number>, state?: Record<string, any>) => {
            setBusy(true);
            try {
                const result = await dispatch({ type: 'mount', action, args, records, state });
                apply({ ...result, close: false });
                if (result.modal) openModal(result.modal);
            } finally {
                setBusy(false);
            }
        },
        [apply, dispatch, openModal],
    );

    const call = useCallback(
        async (action: string, args?: Record<string, any>, records?: Array<string | number>, state?: Record<string, any>) => {
            setBusy(true);
            try {
                return apply(await dispatch({ type: 'call', action, args, records, state }));
            } finally {
                setBusy(false);
            }
        },
        [apply, dispatch],
    );

    // a page change closes open modals
    useEffect(() => {
        setModals([]);
    }, [pathname]);

    return <Ctx.Provider value={{ url, dispatch, apply, mount, call, openModal, closeModal, modals, busy }}>{children}</Ctx.Provider>;
}

/** where the mounted action modals are rendered (`<div wire:partial="action-modals" style="height: 0">`) */
export function ModalHost() {
    const { modals } = useAdminActions();
    return (
        <div style={{ height: 0 }}>
            {modals.map((m) => (
                <ModalLayer key={m.key}>{m.node}</ModalLayer>
            ))}
        </div>
    );
}

const LayerCtx = createContext<{ close: () => void }>({ close: () => undefined });
export const useModalLayer = () => useContext(LayerCtx);

function ModalLayer({ children }: { children: ReactNode }) {
    const { closeModal } = useAdminActions();
    return <LayerCtx.Provider value={{ close: closeModal }}>{children}</LayerCtx.Provider>;
}

/* -------------------------------------------------------------------------------------------------
 * the button / link / dropdown item that triggers an action
 * ----------------------------------------------------------------------------------------------- */

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** mousetrap style key bindings (`mod+d`) */
function matchesBinding(event: KeyboardEvent, binding: string): boolean {
    const parts = binding.toLowerCase().split('+');
    const key = parts.pop()!;
    const want = { mod: parts.includes('mod'), shift: parts.includes('shift'), alt: parts.includes('alt'), ctrl: parts.includes('ctrl') };
    const mod = isMac() ? event.metaKey : event.ctrlKey;
    return event.key.toLowerCase() === key && (!want.mod || mod) && (!want.shift || event.shiftKey) && (!want.alt || event.altKey) && (!want.ctrl || event.ctrlKey);
}

export function ActionTrigger({
    tag,
    className,
    actionId,
    mode,
    args,
    bulk,
    href,
    newTab,
    disabled,
    title,
    ariaLabel,
    keyBindings,
    attrs,
    children,
}: {
    tag: 'a' | 'button';
    className: string;
    actionId: string;
    mode: 'link' | 'mount' | 'call';
    args?: Record<string, any>;
    bulk?: boolean;
    href?: string;
    newTab?: boolean;
    disabled?: boolean;
    title?: string;
    ariaLabel?: string;
    keyBindings?: string[];
    attrs?: Record<string, any>;
    children: ReactNode;
}) {
    const { mount, call, busy } = useAdminActions();
    const selection = useContext(SelectionContext);
    const ref = useRef<HTMLElement | null>(null);
    const formState = useContext(FormStateContext);

    const run = useCallback(() => {
        if (disabled || mode === 'link') return;
        const records = bulk ? (selection?.selected ?? []) : undefined;
        if (bulk && (!records || records.length === 0)) return;
        // actions inside a field send the state of the form along (`$get()` in their closures)
        const state = actionId.startsWith('field:') ? formState.current?.() : undefined;
        void (mode === 'mount' ? mount(actionId, args, records, state) : call(actionId, args, records, state));
    }, [actionId, args, bulk, call, disabled, mode, mount, selection]);

    useEffect(() => {
        if (!keyBindings || keyBindings.length === 0 || mode === 'link') return;
        const onKey = (e: KeyboardEvent) => {
            if (!ref.current || !document.body.contains(ref.current)) return;
            if (keyBindings.some((b) => matchesBinding(e, b))) {
                e.preventDefault();
                run();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [keyBindings, mode, run]);

    const common = { className, title, 'aria-label': ariaLabel, ...(attrs ?? {}) } as Record<string, any>;

    if (mode === 'link' && href) {
        if (newTab || /^https?:\/\//.test(href)) {
            return (
                <a ref={(el) => void (ref.current = el)} href={href} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined} {...common}>
                    {children}
                </a>
            );
        }
        return (
            <Link ref={(el) => void (ref.current = el)} href={href} {...(common as Omit<ComponentProps<typeof Link>, 'href'>)}>
                {children}
            </Link>
        );
    }

    return (
        <button ref={(el) => void (ref.current = el)} type="button" disabled={disabled || busy} onClick={run} {...common}>
            {children}
        </button>
    );
}

/** `x-filament::dropdown` of an action group */
export function ActionDropdown({ trigger, children, bulk }: { trigger: ReactNode; children: ReactNode; bulk?: boolean }) {
    const selection = useContext(SelectionContext);
    const hidden = bulk && (!selection || selection.selected.length === 0);
    return (
        <Dropdown trigger={trigger} placement="bottom-start" panelClassName="" wrapperProps={hidden ? { style: { display: 'none' } } : undefined}>
            {children}
        </Dropdown>
    );
}
