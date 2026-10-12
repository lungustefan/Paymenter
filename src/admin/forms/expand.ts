'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** dispatched after a validation error: collapsed sections / repeater items / inactive tabs holding an error open up */
export const EXPAND_EVENT = 'expand-concealing-component';

/**
 * `x-on:expand-concealing-component.window`: when this element contains a validation error, `open()` reveals it.
 * Only the component holding the very first error scrolls itself into view.
 */
export function useExpandConcealing(ref: RefObject<HTMLElement | null>, open: () => void) {
    const openRef = useRef(open);
    openRef.current = open;
    useEffect(() => {
        const handler = () => {
            const el = ref.current;
            const error = el?.querySelector('[data-validation-error]');
            if (!el || !error) return;
            openRef.current();
            if (document.body.querySelector('[data-validation-error]') !== error) return;
            setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' }), 200);
        };
        window.addEventListener(EXPAND_EVENT, handler);
        return () => window.removeEventListener(EXPAND_EVENT, handler);
    }, [ref]);
}
