'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { getPath, setPath } from '../core/evaluate';
import { useAdminActions, FormStateContext } from '../actions/client';
import type { AdminActionResult, FormTarget } from '../protocol';

export type { AdminActionResult };

type Live = { onBlur?: boolean; debounce?: number } | false | undefined;

interface FormCtx {
    formId: string;
    state: Record<string, any>;
    errors: Record<string, string[]>;
    node: ReactNode;
    getValue: (path: string) => any;
    setValue: (path: string, value: unknown, live?: Live) => void;
    /** `wire:model.blur`: run the live refresh of a field after it lost focus */
    blur: (path: string, live?: Live) => void;
    /** submit the form (optionally with extra arguments for the action) */
    submit: (extraArgs?: Record<string, any>) => void;
    pending: boolean;
    /** options of a lazy select */
    options: (path: string, search?: string, values?: Array<string | number>) => Promise<NonNullable<AdminActionResult['options']>>;
    /** a repeater action (add / clone / delete / move): runs on the server, which answers with the new state + schema */
    mutate: (path: string, m: { op: 'add' | 'clone' | 'delete' | 'move' | 'moveUp' | 'moveDown'; key?: string; order?: string[]; afterItem?: string }) => Promise<void>;
}

const Ctx = createContext<FormCtx | null>(null);
export const useFormContext = () => useContext(Ctx)!;

export function useFieldValue(path: string): [any, (value: unknown, live?: Live) => void] {
    const ctx = useFormContext();
    return [getPath(ctx.state, path), (value, live) => ctx.setValue(path, value, live)];
}

/** where the (replaceable) schema of the form is rendered */
export function SchemaSlot() {
    return <>{useFormContext().node}</>;
}

export function FormProvider({
    formId = 'form',
    initialState,
    schema,
    target,
    children,
    className = 'fi-sc-form',
    formProps,
    submitUrl,
    onSubmitLocal,
    as = 'form',
}: {
    formId?: string;
    initialState: Record<string, any>;
    schema: ReactNode;
    target: FormTarget;
    /** rendered inside the <form>; use <SchemaSlot /> to place the schema */
    children?: ReactNode;
    className?: string;
    formProps?: Record<string, any>;
    submitUrl?: string;
    /** the form never talks to the server: submitting hands the state to this callback (table filters) */
    onSubmitLocal?: (state: Record<string, any>) => void;
    as?: 'form' | 'div';
}) {
    void submitUrl;
    const { dispatch, apply } = useAdminActions();
    const [state, setState] = useState<Record<string, any>>(initialState);
    const [node, setNode] = useState<ReactNode>(schema);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [pending, startTransition] = useTransition();
    const stateRef = useRef(state);
    stateRef.current = state;
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const targetRef = useRef(target);
    targetRef.current = target;

    // the page re-rendered (e.g. after saving): take its schema
    useEffect(() => {
        setNode(schema);
    }, [schema]);

    const mergePatches = useCallback((patches?: Record<string, any>, replace?: Record<string, any>) => {
        if (replace) {
            setState(replace);
            stateRef.current = replace;
        } else if (patches && Object.keys(patches).length) {
            setState((s) => {
                const next = structuredClone(s);
                for (const [p, v] of Object.entries(patches)) setPath(next, p, v);
                stateRef.current = next;
                return next;
            });
        }
    }, []);

    const runRefresh = useCallback(
        (changedPath: string | null) => {
            startTransition(async () => {
                const sent = structuredClone(stateRef.current);
                const result = await dispatch({ type: 'refresh', target: targetRef.current, state: sent, changed: changedPath });
                mergePatches(result.patches);
                if (result.schema !== undefined) setNode(result.schema);
            });
        },
        [dispatch, mergePatches],
    );

    const mutate = useCallback<FormCtx['mutate']>(
        (path, m) =>
            new Promise<void>((resolve) => {
                startTransition(async () => {
                    const result = await dispatch({ type: 'refresh', target: targetRef.current, state: structuredClone(stateRef.current), changed: null, mutate: { path, ...m } });
                    mergePatches(result.patches, result.state);
                    if (result.schema !== undefined) setNode(result.schema);
                    resolve();
                });
            }),
        [dispatch, mergePatches],
    );

    const setValue = useCallback<FormCtx['setValue']>(
        (path, value, live) => {
            setState((s) => {
                const next = structuredClone(s);
                setPath(next, path, value);
                stateRef.current = next;
                return next;
            });
            setErrors((e) => {
                if (!e[path]) return e;
                const { [path]: _gone, ...rest } = e;
                return rest;
            });
            if (live && !live.onBlur) {
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => runRefresh(path), live.debounce ?? 0);
            }
        },
        [runRefresh],
    );

    const blur = useCallback<FormCtx['blur']>(
        (path, live) => {
            if (live && live.onBlur) runRefresh(path);
        },
        [runRefresh],
    );

    const submit = useCallback(
        (extraArgs?: Record<string, any>) => {
            if (onSubmitLocal) {
                onSubmitLocal(stateRef.current);
                return;
            }
            startTransition(async () => {
                const base = targetRef.current;
                const t: FormTarget = extraArgs ? { ...base, args: { ...(base.args ?? {}), ...extraArgs } } : base;
                const result = await dispatch({ type: 'submit', target: t, state: structuredClone(stateRef.current) });
                apply(result);
                setErrors(result.errors ?? {});
                mergePatches(result.patches, result.state);
                if (result.schema !== undefined) setNode(result.schema);
                if (result.errors && Object.keys(result.errors).length) {
                    requestAnimationFrame(() => document.querySelector('[data-validation-error]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
                }
            });
        },
        [apply, dispatch, mergePatches, onSubmitLocal],
    );

    const options = useCallback<FormCtx['options']>(
        async (path, search, values) => {
            const result = await dispatch({ type: 'options', target: targetRef.current, state: structuredClone(stateRef.current), path, search, values });
            return result.options ?? [];
        },
        [dispatch],
    );

    // patches of the actions of the page (`$set()` in a hint action)
    useEffect(() => {
        if (formId !== 'form') return;
        const onPatches = (e: Event) => mergePatches((e as CustomEvent).detail);
        window.addEventListener('admin-form-patches', onPatches);
        return () => window.removeEventListener('admin-form-patches', onPatches);
    }, [formId, mergePatches]);
    const formStateRef = useRef<{ current: (() => Record<string, any>) | null }>({ current: null });
    formStateRef.current.current = () => structuredClone(stateRef.current);

    const ctx = useMemo<FormCtx>(() => ({ formId, state, errors, node, getValue: (p) => getPath(state, p), setValue, blur, submit, pending, options, mutate }), [formId, state, errors, node, setValue, blur, submit, pending, options, mutate]);

    return (
        <Ctx.Provider value={ctx}>
            <FormStateContext.Provider value={formStateRef.current}>
            {as === 'div' ? (
                <div id={formId} className={className} {...formProps}>
                    {children ?? <SchemaSlot />}
                </div>
            ) : (
                <form
                    id={formId}
                    className={className}
                    {...formProps}
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                >
                    {children ?? <SchemaSlot />}
                </form>
            )}
            </FormStateContext.Provider>
        </Ctx.Provider>
    );
}

/** the error message(s) of a field (`$errors->first($statePath)`) */
export function FieldErrors({ path, wrapInCol }: { path: string; wrapInCol?: boolean }) {
    const { errors } = useFormContext();
    const list = errors[path];
    if (!list || list.length === 0) return null;
    const content =
        list.length === 1 ? (
            <p data-validation-error="" className="fi-fo-field-wrp-error-message">
                {list[0]}
            </p>
        ) : (
            <ul data-validation-error="" className="fi-fo-field-wrp-error-list">
                {list.map((m) => (
                    <li key={m} className="fi-fo-field-wrp-error-message">
                        {m}
                    </li>
                ))}
            </ul>
        );
    return wrapInCol ? <div className="fi-fo-field-content-col">{content}</div> : content;
}

/** `fi-invalid` on the input wrapper while the field has errors */
export function useInvalidClass(path: string): string {
    const { errors } = useFormContext();
    return errors[path]?.length ? ' fi-invalid' : '';
}

