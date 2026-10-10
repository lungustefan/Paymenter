import type { ReactNode } from 'react';
import { ResourcePage } from './ResourcePage';
import { ContentCell, ContentGrid } from './formPage';
import { Schema } from '../../forms/Schema';
import { fillForm, makeRenderContext } from '../../forms/process';
import type { RenderContext } from '../../forms/Component';
import { trans } from '../../context';
import { attributesForForm } from '../../core/attributes';

/** Port of Filament\Resources\Pages\ViewRecord */
export class ViewRecord extends ResourcePage {
    static override kind = 'resource-view-record';

    static override getNavigationLabel() {
        return this.navigationLabel ?? trans('filament-panels::resources/pages/view-record.breadcrumb');
    }
    static override getNavigationIcon() {
        return this.navigationIcon ?? 'heroicon-o-eye';
    }

    getTitle() {
        return trans('filament-panels::resources/pages/view-record.title', { label: this.resource.getRecordTitle(this.record) });
    }
    getBreadcrumb() {
        return trans('filament-panels::resources/pages/view-record.breadcrumb');
    }
    override getPageClasses() {
        return ['fi-resource-view-record-page', `fi-resource-${this.resource.getSlug().replace('/', '-')}`, `fi-resource-record-${this.record?.getKey()}`];
    }

    override async mount() {
        this.record = await this.resolveRecord(this.params.record);
        this.abortUnless(await this.resource.canView(this.user, this.record));
        await this.relationManagers();
    }

    /** the infolist (the resource's `infolist()`, two columns by default) */
    protected makeSchema(): Schema {
        const schema = Schema.make().operation('view').model(this.record!);
        if (!schema.hasCustomColumns()) schema.columns(2);
        return this.resource.infolist(schema);
    }

    protected makeRc(): RenderContext {
        return makeRenderContext({ state: {}, operation: 'view', record: this.record, model: this.getModel(), user: this.user, livewire: this, formId: 'infolist' });
    }

    async renderContent(): Promise<ReactNode> {
        const schema = this.makeSchema();
        const rc = this.makeRc();
        // infolists read the record; a form based infolist (the default) is filled and disabled
        rc.extra.disabledSchema = true;
        const state = await fillForm(schema, rc, attributesForForm(this.record!));
        rc.state = state;
        const node = await schema.render(rc);
        return (
            <ContentGrid>
                <ContentCell>{node}</ContentCell>
                {(await this.relationManagers()).length ? await this.renderRelationManagers() : <ContentCell hidden />}
            </ContentGrid>
        );
    }
}
