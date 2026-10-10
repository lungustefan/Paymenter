'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Sortable from 'sortablejs';
import { useFormContext } from './runtime';
import { Icon } from '../ui/Icon';
import { gridProps } from '../ui/grid';
import { cn } from '@themes/default/components/cn';

export interface RepeaterItemProps {
    key: string;
    label: string | null;
    number: number | null;
    content: ReactNode;
}

interface Labels {
    move: string;
    clone: string;
    delete: string;
    collapse: string;
    expand: string;
    collapseAll: string;
    expandAll: string;
    moveUp: string;
    moveDown: string;
}

const linkClass = 'fi-ac-link-action fi-link fi-size-sm';
const iconBtn = 'fi-ac-icon-btn-action fi-icon-btn fi-size-sm';
const dangerBtn = 'fi-ac-icon-btn-action fi-icon-btn fi-size-sm fi-color fi-color-danger fi-text-color-600 hover:fi-text-color-500 dark:fi-text-color-400 dark:hover:fi-text-color-300';

/** the markup + behaviour of Filament's repeater: collapse, drag to reorder, add / clone / delete go through the server */
export function RepeaterControl({
    path,
    id,
    labelId,
    items,
    collapsible,
    collapsed,
    cloneable,
    deletable,
    reorderable,
    reorderWithButtons,
    canAdd,
    addLabel,
    grid,
    headers,
    labels,
}: {
    path: string;
    id: string;
    labelId: string;
    items: RepeaterItemProps[];
    collapsible: boolean;
    collapsed: boolean;
    cloneable: boolean;
    deletable: boolean;
    reorderable: boolean;
    reorderWithButtons: boolean;
    canAdd: boolean;
    addLabel: string;
    grid: number | Record<string, number> | null;
    headers: boolean;
    labels: Labels;
}) {
    const { mutate, pending } = useFormContext();
    const list = useRef<HTMLUListElement>(null);
    // keys of the collapsed items (items that appeared since the last render start collapsed when the repeater is `collapsed()`)
    const [closed, setClosed] = useState<Set<string>>(() => new Set(collapsed ? items.map((i) => i.key) : []));
    const seen = useRef<Set<string>>(new Set(items.map((i) => i.key)));

    useEffect(() => {
        const fresh = items.filter((i) => !seen.current.has(i.key));
        for (const i of items) seen.current.add(i.key);
        if (fresh.length && collapsed) setClosed((c) => new Set([...c, ...fresh.map((i) => i.key)]));
    }, [items, collapsed]);

    useEffect(() => {
        if (!reorderable || !list.current) return;
        const sortable = Sortable.create(list.current, {
            animation: 300,
            handle: '[data-sortable-handle]',
            draggable: '.fi-fo-repeater-item',
            onEnd: () => {
                const order = [...(list.current?.querySelectorAll<HTMLElement>(':scope > .fi-fo-repeater-item') ?? [])].map((el) => el.dataset.itemKey!);
                void mutate(path, { op: 'move', order });
            },
        });
        return () => sortable.destroy();
    }, [reorderable, mutate, path, items.length]);

    const toggle = (key: string) =>
        setClosed((c) => {
            const next = new Set(c);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const gridAttrs = gridProps(grid ?? undefined);

    return (
        <div aria-labelledby={labelId} id={id} role="group" className={cn('fi-fo-repeater', collapsible && 'fi-collapsible')}>
            {collapsible && (
                <div className={cn('fi-fo-repeater-actions', items.length < 2 && 'fi-hidden')}>
                    <span onClick={() => setClosed(new Set(items.map((i) => i.key)))}>
                        <button type="button" className={linkClass}>
                            <span className="fi-link-label">{labels.collapseAll}</span>
                        </button>
                    </span>
                    <span onClick={() => setClosed(new Set())}>
                        <button type="button" className={linkClass}>
                            <span className="fi-link-label">{labels.expandAll}</span>
                        </button>
                    </span>
                </div>
            )}
            {items.length > 0 && (
                <ul ref={list} className={cn(gridAttrs.className, 'fi-fo-repeater-items')} style={gridAttrs.style}>
                    {items.map((item, index) => {
                        const isClosed = closed.has(item.key);
                        const hasHeader = headers && (reorderable || reorderWithButtons || !!item.label || cloneable || deletable || collapsible);
                        return (
                            <li key={item.key} data-item-key={item.key} className={cn('fi-fo-repeater-item', hasHeader && 'fi-fo-repeater-item-has-header', isClosed && 'fi-collapsed')}>
                                {hasHeader && (
                                    <div className="fi-fo-repeater-item-header" onClick={collapsible ? () => toggle(item.key) : undefined}>
                                        {(reorderable || reorderWithButtons) && (
                                            <ul className="fi-fo-repeater-item-header-start-actions">
                                                {reorderable && (
                                                    <li onClick={(e) => e.stopPropagation()}>
                                                        <button title={labels.move} aria-label={labels.move} type="button" data-sortable-handle="" className={iconBtn}>
                                                            <Icon icon="heroicon-m-arrows-up-down" size="sm" />
                                                        </button>
                                                    </li>
                                                )}
                                                {reorderWithButtons && (
                                                    <>
                                                        <li onClick={(e) => e.stopPropagation()}>
                                                            <button title={labels.moveUp} aria-label={labels.moveUp} type="button" disabled={index === 0} className={iconBtn} onClick={() => void mutate(path, { op: 'moveUp', key: item.key })}>
                                                                <Icon icon="heroicon-m-arrow-up" size="sm" />
                                                            </button>
                                                        </li>
                                                        <li onClick={(e) => e.stopPropagation()}>
                                                            <button title={labels.moveDown} aria-label={labels.moveDown} type="button" disabled={index === items.length - 1} className={iconBtn} onClick={() => void mutate(path, { op: 'moveDown', key: item.key })}>
                                                                <Icon icon="heroicon-m-arrow-down" size="sm" />
                                                            </button>
                                                        </li>
                                                    </>
                                                )}
                                            </ul>
                                        )}
                                        {item.label ? (
                                            <h4 className="fi-fo-repeater-item-header-label">
                                                {item.label}
                                                {item.number !== null && ` ${item.number}`}
                                            </h4>
                                        ) : null}
                                        {(cloneable || deletable || collapsible) && (
                                            <ul className="fi-fo-repeater-item-header-end-actions">
                                                {cloneable && (
                                                    <li onClick={(e) => e.stopPropagation()}>
                                                        <button title={labels.clone} aria-label={labels.clone} type="button" disabled={pending} className={iconBtn} onClick={() => void mutate(path, { op: 'clone', key: item.key })}>
                                                            <Icon icon="heroicon-m-square-2-stack" size="sm" />
                                                        </button>
                                                    </li>
                                                )}
                                                {deletable && (
                                                    <li onClick={(e) => e.stopPropagation()}>
                                                        <button title={labels.delete} aria-label={labels.delete} type="button" disabled={pending} className={dangerBtn} onClick={() => void mutate(path, { op: 'delete', key: item.key })}>
                                                            <Icon icon="heroicon-m-trash" size="sm" />
                                                        </button>
                                                    </li>
                                                )}
                                                {collapsible && (
                                                    <li className="fi-fo-repeater-item-header-collapsible-actions" onClick={(e) => { e.stopPropagation(); toggle(item.key); }}>
                                                        <div className="fi-fo-repeater-item-header-collapse-action">
                                                            <button title={labels.collapse} aria-label={labels.collapse} type="button" className={iconBtn}>
                                                                <Icon icon="heroicon-m-chevron-up" size="sm" />
                                                            </button>
                                                        </div>
                                                        <div className="fi-fo-repeater-item-header-expand-action">
                                                            <button title={labels.expand} aria-label={labels.expand} type="button" className={iconBtn}>
                                                                <Icon icon="heroicon-m-chevron-down" size="sm" />
                                                            </button>
                                                        </div>
                                                    </li>
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                )}
                                <div className="fi-fo-repeater-item-content" style={isClosed ? { display: 'none' } : undefined}>
                                    {item.content}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {canAdd && (
                <div className="fi-fo-repeater-add">
                    <button type="button" disabled={pending} className="fi-ac-btn-action fi-btn fi-size-sm" onClick={() => void mutate(path, { op: 'add' })}>
                        <Icon icon="heroicon-m-plus" size="sm" />
                        {addLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
