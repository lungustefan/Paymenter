import type { ReactNode } from 'react';
import type { Model } from '@/server/orm';
import { ResourcePage } from './ResourcePage';
import { ContentCell, PageForm, type FormFooterAction } from './formPage';
import { Schema } from '../../forms/Schema';
import { fillForm, makeRenderContext, normalizeInput, validateForm, dehydrateForm } from '../../forms/process';
import type { RenderContext } from '../../forms/Component';
import type { FormRef } from '../../core/host';
import { Notification } from '../../Notification';
import { trans } from '../../context';
import type { AdminActionResult } from '../../protocol';
import { Halt } from '../../actions/Action';
import { relativeUrl } from '@/server/routes';
import { attributesForForm } from '../../core/attributes';

/** Port of Filament\Resources\Pages\EditRecord */
export class EditRecord extends ResourcePage {
    static override kind = 'resource-edit-record';

    static override getNavigationLabel() {
        return this.navigationLabel ?? trans('filament-panels::resources/pages/edit-record.breadcrumb');
    }
    static override getNavigationIcon() {
        return this.navigationIcon ?? 'heroicon-o-pencil-square';
    }

    getTitle() {
        return trans('filament-panels::resources/pages/edit-record.title', { label: this.resource.getRecordTitle(this.record) });
    }
    getBreadcrumb() {
        return trans('filament-panels::resources/pages/edit-record.breadcrumb');
    }
    override getPageClasses() {
        return ['fi-resource-edit-record-page', `fi-resource-${this.resource.getSlug().replace('/', '-')}`, `fi-resource-record-${this.record?.getKey()}`];
    }

    override async mount() {
        this.record = await this.resolveRecord(this.params.record);
        this.abortUnless(await this.resource.canEdit(this.user, this.record));
        await this.relationManagers();
    }

    /* ---- hooks (override in the resource's page) ---- */
    protected beforeFill(): Promise<void> | void {}
    protected afterFill(): Promise<void> | void {}
    protected beforeValidate(): Promise<void> | void {}
    protected afterValidate(): Promise<void> | void {}
    protected beforeSave(): Promise<void> | void {}
    protected afterSave(): Promise<void> | void {}
    protected mutateFormDataBeforeFill(data: Record<string, any>): Promise<Record<string, any>> | Record<string, any> {
        return data;
    }
    protected mutateFormDataBeforeSave(data: Record<string, any>): Promise<Record<string, any>> | Record<string, any> {
        return data;
    }
    protected async handleRecordUpdate(record: Model<any>, data: Record<string, any>): Promise<Model<any>> {
        await record.update(data);
        return record;
    }
    protected getSavedNotificationTitle(): string | null {
        return trans('filament-panels::resources/pages/edit-record.notifications.saved.title');
    }
    protected getRedirectUrl(): string | null {
        return null;
    }
    protected getFormActions(): FormFooterAction[] {
        return [
            { kind: 'submit', label: trans('filament-panels::resources/pages/edit-record.form.actions.save.label'), binding: 'mod+s' },
            { kind: 'cancel', label: trans('filament-panels::resources/pages/edit-record.form.actions.cancel.label'), url: this.resource.getUrl('index') },
        ];
    }

    /* ---- the form ---- */
    protected makeSchema(): Schema {
        const schema = Schema.make().operation('edit').model(this.record!);
        if (!schema.hasCustomColumns()) schema.columns(2);
        return this.resource.form(schema);
    }

    protected makeRc(state: Record<string, any> = {}): RenderContext {
        return makeRenderContext({ state, operation: 'edit', record: this.record, model: this.getModel(), user: this.user, livewire: this });
    }

    override async getForm(_id: string, state?: Record<string, any>): Promise<FormRef | null> {
        return { schema: this.makeSchema(), rc: this.makeRc(state ? normalizeInput(state) : {}) };
    }

    protected async renderBelowForm(): Promise<ReactNode> {
        return null;
    }

    async renderContent(): Promise<ReactNode> {
        const schema = this.makeSchema();
        const rc = this.makeRc();
        await this.beforeFill();
        const data = await this.mutateFormDataBeforeFill(attributesForForm(this.record!));
        const state = await fillForm(schema, rc, data);
        await this.afterFill();
        const node = await schema.render(rc);
        return (
            <>
                <PageForm initialState={state} schema={node} target={{ kind: 'form', id: 'form' }} actions={this.getFormActions()} after={(await this.renderRelationManagers()) ?? <ContentCell hidden />} />
                {await this.renderBelowForm()}
            </>
        );
    }

    override async submitForm(_id: string, input: Record<string, any>): Promise<AdminActionResult> {
        this.abortUnless(await this.resource.canEdit(this.user, this.record!));
        const schema = this.makeSchema();
        const rc = this.makeRc(normalizeInput(input));
        try {
            await this.beforeValidate();
            const errors = await validateForm(schema, rc);
            if (errors) return { ok: false, errors };
            await this.afterValidate();
            await this.beforeSave();
            let data = await dehydrateForm(schema, rc);
            data = await this.mutateFormDataBeforeSave(data);
            await this.handleRecordUpdate(this.record!, data);
            await schema.saveRelationships(rc, this.record, data);
            await this.afterSave();
        } catch (e) {
            if (e instanceof Halt) return { ok: true, halted: true };
            throw e;
        }
        const title = this.getSavedNotificationTitle();
        if (title) await Notification.make().success().title(title).send();
        const redirect = this.getRedirectUrl();
        return redirect ? { ok: true, redirect: relativeUrl(redirect) } : { ok: true, refresh: true };
    }
}
