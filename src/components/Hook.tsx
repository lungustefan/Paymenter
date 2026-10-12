import { Fragment, isValidElement, type ReactNode } from 'react';
import { dispatch } from '@/server/events';

/**
 * `{!! hook('name') !!}` - renders whatever the listeners of the event return.
 * A listener result is `{ view, priority? }` where `view` is a React node (or
 * an HTML string, kept for extensions that pre-render markup).
 */
export async function Hook({ name }: { name: string }) {
    const raw = (await dispatch(name, {} as any)) as unknown[];
    const items = raw
        .flat(2)
        .filter((i): i is { view: ReactNode | string; priority?: number } => !!i && typeof i === 'object' && 'view' in (i as object))
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return (
        <>
            {items.map((item, i) =>
                typeof item.view === 'string' ? <div key={i} className="contents" dangerouslySetInnerHTML={{ __html: item.view }} /> : <Fragment key={i}>{isValidElement(item.view) ? item.view : (item.view as ReactNode)}</Fragment>,
            )}
        </>
    );
}
