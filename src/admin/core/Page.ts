import type { ReactNode } from 'react';
import type { User } from '@/server/models/User';
import { Cluster, titleCase } from './Resource';
import { Host, type ActionRef } from './host';
import { findByName, type Action, type ActionContext, type ActionGroup } from '../actions/Action';
import { renderActionsGroup } from '../actions/render';

/**
 * Port of Filament\Pages\Page: a custom admin page (Settings, Updates, ...). `render()` returns the
 * page content; the header (title, actions) is built by the admin shell from the static configuration.
 */
export abstract class AdminPage extends Host {
    static slug: string;
    static title: string | null = null;
    static navigationLabel: string | null = null;
    static navigationGroup: string | null = null;
    static navigationIcon = 'heroicon-o-document-text';
    static activeNavigationIcon: string | null = null;
    static navigationSort: number | null = null;
    static cluster: typeof Cluster | null = null;
    static shouldRegisterNavigation(): boolean | Promise<boolean> {
        return true;
    }
    /** `$maxContentWidth` of the page */
    static maxContentWidth: string | null = null;

    static getTitle(): string {
        return this.title ?? titleCase(this.slug.replace(/-/g, ' '));
    }

    static getNavigationLabel(): string {
        return this.navigationLabel ?? this.getTitle();
    }

    static canAccess(_user: User | null): Promise<boolean> | boolean {
        return true;
    }

    static getUrl(): string {
        return `/admin/${this.cluster ? this.cluster.slug + '/' : ''}${this.slug}`;
    }

    /** `getHeaderActions()` */
    getHeaderActions(): Array<Action | ActionGroup> {
        return [];
    }

    getHeading(): string {
        return (this.constructor as typeof AdminPage).getTitle();
    }

    getPageClasses(): string[] {
        return [];
    }

    actionContext(extra: Partial<ActionContext> = {}): ActionContext {
        return { get: () => undefined, set: () => undefined, user: this.user, livewire: this, action: undefined as any, ...extra } as ActionContext;
    }

    async renderHeaderActions(): Promise<ReactNode> {
        return renderActionsGroup(this.getHeaderActions(), this.actionContext(), 'header', { defaultStyle: 'button' });
    }

    override async findAction(id: string, state?: Record<string, any>): Promise<ActionRef | null> {
        if (!id.startsWith('header.')) return super.findAction(id, state);
        if (id.startsWith('header.')) {
            const found = findByName(this.getHeaderActions(), id.slice('header.'.length));
            return found ? { action: found, ctx: this.actionContext({ action: found }) } : null;
        }
        return null;
    }

    getHeaderWidgets(): any[] {
        return [];
    }

    getFooterWidgets(): any[] {
        return [];
    }

    getSubheading(): string | null | Promise<string | null> {
        return null;
    }

    abstract render(): Promise<ReactNode> | ReactNode;

    getBreadcrumbs(): Record<string, string> | null {
        const cluster = (this.constructor as typeof AdminPage).cluster;
        return cluster ? { '': cluster.label() } : null;
    }
}
