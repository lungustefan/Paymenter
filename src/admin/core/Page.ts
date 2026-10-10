import type { ReactNode } from 'react';
import type { User } from '@/server/models/User';
import { Cluster, titleCase } from './Resource';

/**
 * Port of Filament\Pages\Page: a custom admin page (Settings, Updates, ...). `render()` returns the
 * page content; the header (title, actions) is built by the admin shell from the static configuration.
 */
export abstract class AdminPage {
    static slug: string;
    static title: string | null = null;
    static navigationLabel: string | null = null;
    static navigationGroup: string | null = null;
    static navigationIcon = 'heroicon-o-document-text';
    static activeNavigationIcon: string | null = null;
    static navigationSort: number | null = null;
    static cluster: typeof Cluster | null = null;
    static shouldRegisterNavigation = true;
    /** `$maxContentWidth` of the page */
    static maxContentWidth: string | null = null;

    user!: User;
    params: Record<string, string> = {};
    searchParams: Record<string, string | string[] | undefined> = {};

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
    getHeaderActions(): any[] | Promise<any[]> {
        return [];
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

    /** `mount()` - load state; throw to abort */
    mount(): Promise<void> | void {}

    abstract render(): Promise<ReactNode> | ReactNode;

    getBreadcrumbs(): Record<string, string> | null {
        return null;
    }
}
