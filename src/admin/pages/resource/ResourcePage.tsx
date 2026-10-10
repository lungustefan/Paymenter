import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import type { Model } from '@/server/orm';
import { Host, type ActionRef } from '../../core/host';
import type { PageRoute, Resource } from '../../core/Resource';
import { Action, ActionGroup, findByName, type ActionContext } from '../../actions/Action';
import { renderActionsGroup } from '../../actions/render';
import { DeleteAction } from '../../actions/builtin';
import type { Breadcrumb } from '../../Header';
import { trans } from '../../context';
import { setPath } from '../../core/evaluate';

/**
 * Port of Filament\Resources\Pages\Page: a page of a resource (list, create, edit, view, ...).
 * Subclasses set `static resource` and implement `renderContent()`.
 */
export abstract class ResourcePage extends Host {
    static resource: typeof Resource;
    /** the kind of page, used for the DOM classes (`fi-resource-create-record-page`) */
    static kind: string = 'page';
    static navigationLabel: string | null = null;

    static route(path: string): PageRoute {
        return { page: this, path };
    }

    /** the record of the URL (`{record}`) */
    record: any = null;

    get resource(): typeof Resource {
        return (this.constructor as typeof ResourcePage).resource;
    }

    getModel() {
        return this.resource.model;
    }

    /* ---- titles ---- */
    abstract getTitle(): string;
    /** the last breadcrumb: `List`, `Create`, `Edit` */
    abstract getBreadcrumb(): string;

    getBreadcrumbs(): Breadcrumb[] {
        return [{ label: this.resource.getBreadcrumb(), url: this.resource.getUrl('index') }, { label: this.getBreadcrumb() }];
    }

    getSubheading(): string | null {
        return null;
    }

    getPageClasses(): string[] {
        return [`fi-resource-${(this.constructor as typeof ResourcePage).kind}-page`, `fi-resource-${this.resource.getSlug().replace('/', '-')}`];
    }

    getResourceUrl(page = 'index', params: { record?: string | number | Model<any> } = {}) {
        return this.resource.getUrl(page, params);
    }

    /* ---- actions ---- */
    getHeaderActions(): Array<Action | ActionGroup> {
        return [];
    }

    private headerActionsCache?: Array<Action | ActionGroup>;
    /** the header actions, configured once (`configureAction()` of the Filament page) */
    protected headerActions(): Array<Action | ActionGroup> {
        if (!this.headerActionsCache) {
            this.headerActionsCache = this.getHeaderActions();
            const walk = (list: Array<Action | ActionGroup>) => {
                for (const a of list) {
                    if (a instanceof ActionGroup) walk(a.actions);
                    else this.configureAction(a);
                }
            };
            walk(this.headerActionsCache);
        }
        return this.headerActionsCache;
    }

    /** what `Page::configureAction()` does to every action of the page */
    protected configureAction(action: Action) {
        // deleting the record of the page sends the user back to the list
        if (action instanceof DeleteAction && this.record && !action.hasSuccessRedirect()) action.successRedirectUrl(() => this.resource.getUrl('index'));
    }

    /** the context actions of this page run in */
    actionContext(extra: Partial<ActionContext> = {}): ActionContext {
        return {
            get: () => undefined,
            set: () => undefined,
            record: this.record,
            user: this.user,
            livewire: this,
            model: this.resource.model,
            resource: this.resource,
            action: undefined as any,
            ...extra,
        } as ActionContext;
    }

    /** `<div class="fi-header-actions-ctn">` content */
    async renderHeaderActions(): Promise<ReactNode> {
        return renderActionsGroup(this.headerActions(), this.actionContext(), 'header', { defaultStyle: 'button' });
    }

    override async findAction(id: string): Promise<ActionRef | null> {
        if (id.startsWith('table.')) return super.findAction(id);
        if (id.startsWith('header.')) {
            const found = findByName(this.headerActions(), id.slice('header.'.length));
            return found ? { action: found, ctx: this.actionContext({ action: found }) } : null;
        }
        return null;
    }

    /** the content below the header */
    abstract renderContent(): Promise<ReactNode>;

    /** `abort_unless($resource::canX(), 403)` */
    protected abortUnless(allowed: boolean) {
        if (!allowed) notFound();
    }

    /** `$record = $this->resolveRecord($key)` */
    protected async resolveRecord(key: string): Promise<Model<any>> {
        const model = this.resource.model;
        const record = await this.resource.getEloquentQuery().where(model.primaryKey ?? 'id', key).first();
        if (!record) notFound();
        return record;
    }

    protected t = trans;
}

export { setPath, findByName };
