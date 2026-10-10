import type { Model, ModelCtor } from '@/server/orm';
import type { Builder } from '@/server/orm';
import type { User } from '@/server/models/User';
import { can } from '@/server/policies';
import { slug as kebabSlug } from '@/server/lib/php';
import type { Schema } from '../forms/Schema';
import type { Table } from '../tables/Table';

export interface NavigationItemInfo {
    label: string;
    url: string;
    icon: string;
    activeIcon: string;
    group: string | null;
    sort: number | null;
    badge?: string | null;
    badgeColor?: string | null;
    isActive: boolean;
    /** the cluster / page / resource the item belongs to */
    cluster?: string | null;
}

/** `Cluster`: a group of pages and resources with their own sub navigation. */
export abstract class Cluster {
    static slug: string;
    static navigationIcon = 'heroicon-o-squares-2x2';
    static activeNavigationIcon: string | null = null;
    static navigationGroup: string | null = null;
    static navigationLabel: string | null = null;
    static navigationSort: number | null = null;
    static getNavigationBadge(): Promise<string | null> | string | null {
        return null;
    }
    static getNavigationBadgeColor(): string | null {
        return null;
    }
    static label(): string {
        return this.navigationLabel ?? titleCase(this.slug);
    }
}

export interface PageRoute {
    page: any;
    /** `/`, `/create`, `/{record}/edit` */
    path: string;
}

type AnyModel = ModelCtor<any>;

/** Port of Filament\Resources\Resource - static configuration, like the PHP classes. */
export abstract class Resource {
    static model: AnyModel;
    /** the URL segment: `Str::of(class)->beforeLast('Resource')->plural()->kebab()` unless set */
    static slug: string;
    static cluster: typeof Cluster | null = null;
    static navigationGroup: string | null = null;
    static navigationIcon = 'heroicon-o-rectangle-stack';
    static activeNavigationIcon: string | null = null;
    static navigationSort: number | null = null;
    static navigationLabel: string | null = null;
    static modelLabel: string | null = null;
    static pluralModelLabel: string | null = null;
    static recordTitleAttribute: string | null = null;
    static shouldRegisterNavigation = true;
    /** `$label` (singular label shortcut used by some resources) */
    static label: string | null = null;

    static form(schema: Schema): Schema {
        return schema;
    }

    static table(table: Table): Table {
        return table;
    }

    static getPages(): Record<string, PageRoute> {
        return {};
    }

    static getRelations(): any[] {
        return [];
    }

    static getWidgets(): any[] {
        return [];
    }

    /** `getEloquentQuery()` */
    static getEloquentQuery(): Builder<any, any> {
        return this.model.query();
    }

    static getNavigationBadge(): Promise<string | null> | string | null {
        return null;
    }

    static getNavigationBadgeColor(): string | null {
        return null;
    }

    /* ---- labels ---- */

    static getModelLabel(): string {
        return this.modelLabel ?? this.label ?? lcWords(modelBaseName(this.model));
    }

    static getPluralModelLabel(): string {
        return this.pluralModelLabel ?? plural(this.getModelLabel());
    }

    static getNavigationLabel(): string {
        return this.navigationLabel ?? titleCase(this.getPluralModelLabel());
    }

    static getTitleCaseModelLabel(): string {
        return titleCase(this.getModelLabel());
    }

    static getTitleCasePluralModelLabel(): string {
        return titleCase(this.getPluralModelLabel());
    }

    /** the breadcrumb of the resource's index page */
    static getBreadcrumb(): string {
        return this.getTitleCasePluralModelLabel();
    }

    static hasPage(name: string): boolean {
        return name in this.getPages();
    }

    /** `getRecordTitle($record)` */
    static getRecordTitle(record: Model<any> | null): string {
        if (!record) return titleCase(this.getModelLabel());
        const attr = this.recordTitleAttribute;
        if (attr && (record as any)[attr] !== undefined && (record as any)[attr] !== null) return String((record as any)[attr]);
        return titleCase(this.getModelLabel());
    }

    /* ---- authorization (policies) ---- */

    static canViewAny(user: User | null): Promise<boolean> {
        return can(user, 'viewAny', this.model);
    }
    static canCreate(user: User | null): Promise<boolean> {
        return can(user, 'create', this.model);
    }
    static canView(user: User | null, record: Model<any>): Promise<boolean> {
        return can(user, 'view', record);
    }
    static canEdit(user: User | null, record: Model<any>): Promise<boolean> {
        return can(user, 'update', record);
    }
    static canDelete(user: User | null, record: Model<any>): Promise<boolean> {
        return can(user, 'delete', record);
    }
    static canDeleteAny(user: User | null): Promise<boolean> {
        return can(user, 'deleteAny', this.model);
    }
    /** `canAccess()`: the resource may be used at all */
    static canAccess(user: User | null): Promise<boolean> | boolean {
        return this.canViewAny(user);
    }

    /* ---- urls ---- */

    static getSlug(): string {
        return this.slug;
    }

    /** `/admin/<cluster>/<slug>` */
    static basePath(): string {
        return `/admin/${this.cluster ? this.cluster.slug + '/' : ''}${this.getSlug()}`;
    }

    /** `Resource::getUrl('edit', ['record' => $id])` */
    static getUrl(page: string = 'index', params: { record?: string | number | Model<any> } = {}): string {
        const route = this.getPages()[page];
        if (!route) throw new Error(`Route [${page}] not defined for resource ${this.getSlug()}.`);
        const record = params.record && typeof params.record === 'object' ? (params.record as any).getKey() : params.record;
        const path = route.path.replace('{record}', String(record ?? '')).replace(/\/$/, '');
        return this.basePath() + path;
    }
}

/** `class_basename($model)` (class names do not survive minification, the morph name does) */
export const modelBaseName = (model: AnyModel): string => String((model as any).morphName ?? '').split('\\').pop() ?? '';

export const lcWords = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
export const titleCase = (s: string) => s.replace(/(^|[\s_-])([a-z])/g, (_m, p: string, c: string) => (p === '_' || p === '-' ? ' ' : p) + c.toUpperCase()).trim();

/** Laravel `Str::plural()` for the English words the resources use. */
export function plural(word: string): string {
    const w = word;
    if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es';
    if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies';
    return w + 's';
}

export { kebabSlug };
