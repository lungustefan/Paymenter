import type { ReactNode } from 'react';
import { AdminPage } from '../core/Page';
import type { FormRef } from '../core/host';
import { Schema } from '../forms/Schema';
import { dehydrateForm, fillForm, makeRenderContext, normalizeInput, validateForm } from '../forms/process';
import type { RenderContext } from '../forms/Component';
import type { AdminActionResult } from '../protocol';
import { PageForm, type FormFooterAction } from './resource/formPage';

/**
 * A custom page that is one form (`Page implements HasForms`: Settings, ...). Subclasses give the schema,
 * the data to fill it with and what `save()` does.
 */
export abstract class FormPage extends AdminPage {
    protected abstract makeSchema(): Schema;
    protected abstract fillData(): Promise<Record<string, any>> | Record<string, any>;
    protected abstract save(data: Record<string, any>, rc: RenderContext): Promise<void>;
    protected formActions(): FormFooterAction[] {
        return [{ kind: 'submit', label: 'Save', binding: 'mod+s' }];
    }

    protected makeRc(state: Record<string, any> = {}): RenderContext {
        return makeRenderContext({ state, operation: 'edit', record: null, model: null as any, user: this.user, livewire: this });
    }

    override async getForm(_id: string, state?: Record<string, any>): Promise<FormRef | null> {
        return { schema: this.makeSchema(), rc: this.makeRc(state ? normalizeInput(state) : {}) };
    }

    /** the schema's markup; a page whose form *is* its content (`Form::make([...])`) renders it without the grid of the schema */
    protected renderSchema(schema: Schema, rc: RenderContext): Promise<ReactNode> {
        return schema.render(rc);
    }

    async render(): Promise<ReactNode> {
        const schema = this.makeSchema();
        const rc = this.makeRc();
        const state = await fillForm(schema, rc, await this.fillData());
        const node = await this.renderSchema(schema, this.makeRc(state));
        return <PageForm initialState={state} schema={node} target={{ kind: 'form', id: 'form' }} actions={this.formActions()} />;
    }

    override async submitForm(_id: string, input: Record<string, any>): Promise<AdminActionResult> {
        const schema = this.makeSchema();
        const rc = this.makeRc(normalizeInput(input));
        const errors = await validateForm(schema, rc);
        if (errors) return { ok: false, errors };
        await this.save(await dehydrateForm(schema, rc), rc);
        return { ok: true };
    }
}
