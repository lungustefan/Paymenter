import { Action, BulkAction, type ActionContext } from './Action';
import { trans, transChoice } from '../context';
import { Notification } from '../Notification';
import { titleCase } from '../core/Resource';
import { attributesForForm } from '../core/attributes';

/** `$this->getRecordTitle()` / `getModelLabel()` of the resource the action belongs to */
const recordTitle = (ctx: ActionContext) => (ctx.resource ? ctx.resource.getRecordTitle(ctx.record ?? null) : '');
const modelLabel = (ctx: ActionContext) => (ctx.resource ? ctx.resource.getModelLabel() : '');
const titleCaseModelLabel = (ctx: ActionContext) => titleCase(modelLabel(ctx));
const titleCasePluralModelLabel = (ctx: ActionContext) => (ctx.resource ? titleCase(ctx.resource.getPluralModelLabel()) : '');

/** Filament\Actions\CreateAction */
export class CreateAction extends Action {
    static override getDefaultName() {
        return 'create';
    }
    protected override setUp() {
        super.setUp();
        this.label((ctx) => trans('filament-actions::create.single.label', { label: modelLabel(ctx) }));
        this.modalHeading((ctx) => trans('filament-actions::create.single.modal.heading', { label: titleCaseModelLabel(ctx) }));
        this.modalSubmitActionLabel(() => trans('filament-actions::create.single.modal.actions.create.label'));
        this.successNotificationTitle(() => trans('filament-actions::create.single.notifications.created.title'));
        this.groupedIcon('heroicon:plus');
        this.ability('create', 'model');
        this.extraModalFooterActions(() => [
            Action.make('createAnother')
                .label(() => trans('filament-actions::create.single.modal.actions.create_another.label'))
                .color('gray')
                .arguments({ another: true }),
        ]);
        this.action(async (ctx) => {
            const Model = ctx.model;
            const record = new Model();
            record.fill(ctx.data ?? {});
            await record.save();
            return record;
        });
    }
}

/** Filament\Actions\EditAction */
export class EditAction extends Action {
    static override getDefaultName() {
        return 'edit';
    }
    protected override setUp() {
        super.setUp();
        this.label(() => trans('filament-actions::edit.single.label'));
        this.modalHeading((ctx) => trans('filament-actions::edit.single.modal.heading', { label: recordTitle(ctx) }));
        this.modalSubmitActionLabel(() => trans('filament-actions::edit.single.modal.actions.save.label'));
        this.successNotificationTitle(() => trans('filament-actions::edit.single.notifications.saved.title'));
        this.defaultColor('primary');
        this.tableIcon('heroicon:pencil-square');
        this.groupedIcon('heroicon:pencil-square');
        this.ability('update');
        this.fillForm((ctx) => attributesForForm(ctx.record));
        this.action(async (ctx) => {
            await (ctx.record as any).update(ctx.data ?? {});
        });
    }
}

/** Filament\Actions\ViewAction */
export class ViewAction extends Action {
    static override getDefaultName() {
        return 'view';
    }
    protected override setUp() {
        super.setUp();
        this.label(() => trans('filament-actions::view.single.label'));
        this.modalHeading((ctx) => trans('filament-actions::view.single.modal.heading', { label: recordTitle(ctx) }));
        this.modalSubmitAction(false);
        this.modalCancelActionLabel(trans('filament-actions::view.single.modal.actions.close.label'));
        this.defaultColor('gray');
        this.tableIcon('heroicon:eye');
        this.groupedIcon('heroicon:eye');
        this.ability('view');
        this.disabledSchema();
        this.fillForm((ctx) => attributesForForm(ctx.record));
    }
}

/** Filament\Actions\DeleteAction */
export class DeleteAction extends Action {
    static override getDefaultName() {
        return 'delete';
    }
    protected override setUp() {
        super.setUp();
        this.label(() => trans('filament-actions::delete.single.label'));
        this.modalHeading((ctx) => trans('filament-actions::delete.single.modal.heading', { label: recordTitle(ctx) }));
        this.modalSubmitActionLabel(() => trans('filament-actions::delete.single.modal.actions.delete.label'));
        this.successNotificationTitle(() => trans('filament-actions::delete.single.notifications.deleted.title'));
        this.defaultColor('danger');
        this.tableIcon('heroicon:trash');
        this.groupedIcon('heroicon:trash');
        this.requiresConfirmation();
        this.modalIcon('heroicon-o-trash');
        this.keyBindings(['mod+d']);
        this.ability('delete');
        this.hidden((ctx) => (typeof ctx.record?.trashed === 'function' ? ctx.record.trashed() : false));
        this.action(async (ctx) => {
            const result = await (ctx.record as any).delete();
            return result ? undefined : false;
        });
    }
}

/** Filament\Actions\DeleteBulkAction */
export class DeleteBulkAction extends BulkAction {
    static override getDefaultName() {
        return 'delete';
    }
    protected override setUp() {
        super.setUp();
        this.label(() => trans('filament-actions::delete.multiple.label'));
        this.modalHeading((ctx) => trans('filament-actions::delete.multiple.modal.heading', { label: titleCasePluralModelLabel(ctx) }));
        this.modalSubmitActionLabel(() => trans('filament-actions::delete.multiple.modal.actions.delete.label'));
        this.defaultColor('danger');
        this.icon('heroicon:trash');
        this.requiresConfirmation();
        this.modalIcon('heroicon-o-trash');
        this.deselectRecordsAfterCompletion();
        this.ability('deleteAny', 'model');
        this.action(async (ctx) => {
            const records = ctx.records ?? [];
            let success = 0;
            for (const record of records) {
                try {
                    if (await (record as any).delete()) success++;
                } catch (e) {
                    console.error(e);
                }
            }
            const total = records.length;
            if (success === total) {
                await Notification.make().title(trans('filament-actions::delete.multiple.notifications.deleted.title')).success().send();
            } else if (success > 0) {
                await Notification.make()
                    .title(trans('filament-actions::delete.multiple.notifications.deleted_partial.title', { count: success, total }))
                    .body(transChoice('filament-actions::delete.multiple.notifications.deleted_partial.missing_processing_failure_message', total - success, { count: total - success }))
                    .danger()
                    .send();
            } else {
                await Notification.make()
                    .title(trans('filament-actions::delete.multiple.notifications.deleted_none.title'))
                    .body(transChoice('filament-actions::delete.multiple.notifications.deleted_none.missing_processing_failure_message', total, { count: total }))
                    .danger()
                    .send();
            }
        });
    }
}
