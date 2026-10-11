import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import type { Model } from '@/server/orm';
import { ResourcePage } from './ResourcePage';
import { PageForm, type FormFooterAction } from './formPage';
import { Schema } from '../../forms/Schema';
import { fillForm, makeRenderContext, normalizeInput, validateForm, dehydrateForm } from '../../forms/process';
import type { RenderContext } from '../../forms/Component';
import type { FormRef } from '../../core/host';
import { Notification } from '../../Notification';
import { trans } from '../../context';
import { titleCase } from '../../core/Resource';
import type { AdminActionResult } from '../../protocol';
import { Halt } from '../../actions/Action';
import { relativeUrl } from '@/server/routes';

/** Port of Filament\Resources\Pages\CreateRecord */
export class CreateRecord extends ResourcePage {
    static override kind = 'resource-create-record';
    static canCreateAnother = true;

    getTitle() {
        return trans('filament-panels::resources/pages/create-record.title', { label: titleCase(this.resource.getModelLabel()) });
    }
    getBreadcrumb() {
        return trans('filament-panels::resources/pages/create-record.breadcrumb');
    }
    override getPageClasses() {
        return ['fi-resource-create-record-page', `fi-resource-${this.resource.getSlug().replace('/', '-')}`];
    }

    override async mount() {
        this.abortUnless(await this.resource.canCreate(this.user));
    }

    /* ---- hooks (override in the resource's page) ---- */
    protected beforeFill(): Promise<void> | void {}
    protected afterFill(): Promise<void> | void {}
    protected beforeValidate(): Promise<void> | void {}
    protected afterValidate(): Promise<void> | void {}
    protected beforeCreate(): Promise<void> | void {}
    protected afterCreate(): Promise<void> | void {}
    protected mutateFormDataBeforeCreate(data: Record<string, any>): Promise<Record<string, any>> | Record<string, any> {
        return data;
    }
    protected async handleRecordCreation(data: Record<string, any>): Promise<Model<any>> {
        const Model = this.getModel();
        const record = new Model();
        record.fill(data);
        await record.save();
        return record;
    }
    protected getCreatedNotificationTitle(): string | null {
        return trans('filament-panels::resources/pages/create-record.notifications.created.title');
    }
    protected getRedirectUrl(): string {
        const resource = this.resource;
        const pages = resource.getPages();
        if (pages.view && this.record) return resource.getUrl('view', { record: this.record });
        if (pages.edit && this.record) return resource.getUrl('edit', { record: this.record });
        return resource.getUrl('index');
    }
    protected preserveFormDataWhenCreatingAnother(_data: Record<string, any>): Record<string, any> {
        return {};
    }
    protected getFormActions(): FormFooterAction[] {
        const actions: FormFooterAction[] = [{ kind: 'submit', label: trans('filament-panels::resources/pages/create-record.form.actions.create.label'), binding: 'mod+s' }];
        if ((this.constructor as typeof CreateRecord).canCreateAnother) {
            actions.push({ kind: 'extra', label: trans('filament-panels::resources/pages/create-record.form.actions.create_another.label'), binding: 'mod+shift+s', args: { another: true } });
        }
        actions.push({ kind: 'cancel', label: trans('filament-panels::resources/pages/create-record.form.actions.cancel.label'), url: this.resource.getUrl('index') });
        return actions;
    }

    /* ---- the form ---- */
    protected makeSchema(): Schema {
        const schema = Schema.make().operation('create').model(this.getModel());
        if (!schema.hasCustomColumns()) schema.columns(2);
        return this.resource.form(schema);
    }

    protected makeRc(state: Record<string, any> = {}): RenderContext {
        return makeRenderContext({ state, operation: 'create', record: this.record, model: this.getModel(), user: this.user, livewire: this });
    }

    override async getForm(_id: string, state?: Record<string, any>): Promise<FormRef | null> {
        return { schema: this.makeSchema(), rc: this.makeRc(state ? normalizeInput(state) : {}) };
    }

    async renderContent(): Promise<ReactNode> {
        const schema = this.makeSchema();
        const rc = this.makeRc();
        await this.beforeFill();
        const state = await fillForm(schema, rc, null);
        await this.afterFill();
        const node = await schema.render(rc);
        return <PageForm initialState={state} schema={node} target={{ kind: 'form', id: 'form' }} actions={this.getFormActions()} />;
    }

    override async submitForm(_id: string, input: Record<string, any>, args: Record<string, any> = {}): Promise<AdminActionResult> {
        this.abortUnless(await this.resource.canCreate(this.user));
        const another = args.another === true;
        const schema = this.makeSchema();
        const rc = this.makeRc(normalizeInput(input));
        const raw = structuredClone(rc.state);
        try {
            await this.beforeValidate();
            const errors = await validateForm(schema, rc);
            if (errors) return { ok: false, errors };
            await this.afterValidate();
            let data = await dehydrateForm(schema, rc);
            data = await this.mutateFormDataBeforeCreate(data);
            await this.beforeCreate();
            this.record = await this.handleRecordCreation(data);
            rc.record = this.record;
            await schema.saveRelationships(rc, this.record, data);
            await this.afterCreate();
        } catch (e) {
            if (e instanceof Halt) return { ok: true, halted: true };
            throw e;
        }

        const title = this.getCreatedNotificationTitle();
        if (title) await Notification.make().success().title(title).send();

        if (another) {
            const fresh = this.makeRc();
            fresh.record = null;
            const state = await fillForm(schema, fresh, null);
            const kept = this.preserveFormDataWhenCreatingAnother(raw);
            Object.assign(state, kept);
            this.record = null;
            return { ok: true, state, schema: await schema.render({ ...fresh, state }) };
        }
        return { ok: true, redirect: relativeUrl(this.getRedirectUrl()) };
    }
}

export { redirect };
