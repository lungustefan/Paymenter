import { ListRecords } from './ListRecords';
import { Action } from '../../actions/Action';
import { CreateAction, EditAction, ViewAction } from '../../actions/builtin';
import { Schema } from '../../forms/Schema';
import { trans } from '../../context';

/**
 * Port of Filament\Resources\Pages\ManageRecords: a list page whose create / edit / view actions
 * are modals with the resource's form, so the resource has no pages of its own for them.
 */
export class ManageRecords extends ListRecords {
    static override kind = 'resource-manage-records';

    override getBreadcrumb() {
        return trans('filament-panels::resources/pages/list-records.breadcrumb');
    }

    /** `hasResourceBreadcrumbs()` is false: only the (empty) breadcrumb of the page itself */
    override getBreadcrumbs() {
        return [{ label: '' }];
    }

    private makeFormSchema(operation: string): Schema {
        const schema = Schema.make().operation(operation).model(this.getModel());
        if (!schema.hasCustomColumns()) schema.columns(2);
        return this.resource.form(schema);
    }

    protected override configureTableAction(a: Action) {
        if (a.hasUrl()) return;
        if (a instanceof EditAction || a instanceof ViewAction || a instanceof CreateAction) {
            if (!a.hasForm()) a.form(() => this.makeFormSchema(a.getName()));
        }
    }

    protected override configureAction(action: Action) {
        super.configureAction(action);
        if (action instanceof CreateAction && !action.hasUrl() && !action.hasForm()) action.form(() => this.makeFormSchema('create'));
    }
}
