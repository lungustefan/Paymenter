import type { ReactNode } from 'react';
import type { NotificationData } from './Notification';

/** the form a server action refers to: the page's own form, or the form inside an action's modal */
export type FormTarget = { kind: 'form'; id: string; args?: Record<string, any> } | { kind: 'action'; action: string; args?: Record<string, any>; records?: Array<string | number> };

export type AdminOp =
    /** `afterStateUpdated` + re-render of a form after a live field changed */
    | { type: 'refresh'; target: FormTarget; state: Record<string, any>; changed: string | null; old?: unknown; mutate?: { path: string; op: 'add' | 'clone' | 'delete' | 'move' | 'moveUp' | 'moveDown'; key?: string; order?: string[]; afterItem?: string } }
    /** submit a form: validate + save (page form) or run the action (modal form) */
    | { type: 'submit'; target: FormTarget; state: Record<string, any> }
    /** mount an action: returns its modal */
    | { type: 'mount'; action: string; args?: Record<string, any>; records?: Array<string | number>; state?: Record<string, any> }
    /** run an action that has no modal */
    | { type: 'call'; action: string; args?: Record<string, any>; records?: Array<string | number>; state?: Record<string, any> }
    /** options of a searchable / lazy select */
    | { type: 'options'; target: FormTarget; state: Record<string, any>; path: string; search?: string; values?: Array<string | number> }
    /** table interactions that change data (toggle columns, inline inputs, reorder) */
    | { type: 'table'; table: string; action: 'toggle' | 'input' | 'reorder' | 'allKeys'; record?: string | number; column?: string; value?: unknown; order?: Array<string | number> }
    /** a page-defined livewire method (`wire:click="method"`) */
    | { type: 'page'; method: string; args?: any[]; state?: Record<string, any> };

/** result of a server action of the admin panel */
export interface AdminActionResult {
    ok: boolean;
    errors?: Record<string, string[]>;
    notifications?: NotificationData[];
    redirect?: string | null;
    /** reload the current page's data */
    refresh?: boolean;
    /** replace the schema (a live refresh) */
    schema?: ReactNode;
    /** leaf state changes made by hooks (`$set`) */
    patches?: Record<string, any>;
    /** replaces the whole state of the form (after saving / `fill()`) */
    state?: Record<string, any>;
    /** a modal to open (mount) */
    modal?: ReactNode;
    /** the action was cancelled / halted: keep the modal open */
    halted?: boolean;
    /** close the open modal */
    close?: boolean;
    /** options of a select */
    options?: Array<{ value: string | number; label: string; group?: string }>;
    data?: any;
}
