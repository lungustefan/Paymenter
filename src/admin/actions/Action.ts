import type { ReactNode } from 'react';
import type { Schema } from '../forms/Schema';
import type { Model } from '@/server/orm';
import { can } from '@/server/policies';
import { evaluate, type EvalContext, type Fn } from '../core/evaluate';
import type { FilamentColorName } from '../ui/colors';
import { trans } from '../context';

export type ActionStyle = 'button' | 'link' | 'iconButton' | 'grouped' | 'badge';

/** thrown by `$action->halt()`: stop without finishing, the modal stays open */
export class Halt extends Error {
    constructor(public shouldRollBack = false) {
        super('halt');
    }
}

/** thrown by `$action->cancel()`: stop without success handling, the modal closes */
export class Cancel extends Error {
    constructor(public shouldRollBack = false) {
        super('cancel');
    }
}

export interface ActionContext extends EvalContext {
    action: Action;
    data?: Record<string, any>;
    arguments?: Record<string, any>;
    /** `$records` of a bulk action */
    records?: Model<any>[];
    /** model class of the table / resource the action belongs to */
    model?: any;
    /** the resource the action belongs to */
    resource?: any;
    /** the schema + render context of the modal form the action was submitted with */
    formSchema?: any;
    formRc?: any;
}

/** closures of an action receive the action context */
export type AFn<T> = Fn<T, ActionContext>;

/**
 * Port of Filament\Actions\Action: a button that runs a closure on the server, optionally behind a
 * confirmation modal and/or a form. Every option may be a closure (`fn (Product $record) => ...`).
 */
export class Action {
    protected _label?: AFn<string | null>;
    protected _icon?: AFn<string | null>;
    protected _tableIcon?: string;
    protected _groupedIcon?: string;
    protected _color?: AFn<FilamentColorName | null>;
    protected _defaultColor?: FilamentColorName;
    protected _url?: AFn<string | null>;
    protected _openUrlInNewTab = false;
    protected _tooltip?: AFn<string | null>;
    protected _visible: AFn<boolean> = true;
    protected _hidden: AFn<boolean> = false;
    protected _disabled: AFn<boolean> = false;
    protected _requiresConfirmation = false;
    protected _modalHeading?: AFn<string | null>;
    protected _modalDescription?: AFn<ReactNode | string | null>;
    protected _modalSubmitActionLabel?: AFn<string | null>;
    protected _modalCancelActionLabel?: string;
    protected _modalWidth?: string;
    protected _modalIcon?: string | null;
    protected _modalIconColor?: FilamentColorName | null;
    protected _modalContent?: AFn<ReactNode>;
    protected _modalFooterContent?: AFn<ReactNode>;
    protected _modalSubmitAction: boolean = true;
    protected _modalCancelAction: boolean = true;
    protected _modalFooterActionsAlignment: string | null = null;
    protected _slideOver = false;
    protected _form?: AFn<any[] | Schema>;
    protected _fillForm?: AFn<Record<string, any>>;
    protected _handler?: (ctx: ActionContext) => any;
    protected _before: Array<(ctx: ActionContext) => any> = [];
    protected _after: Array<(ctx: ActionContext) => any> = [];
    protected _successNotificationTitle?: AFn<string | null>;
    protected _failureNotificationTitle?: AFn<string | null>;
    protected _successRedirectUrl?: AFn<string | null>;
    protected _authorize?: AFn<boolean>;
    protected _ability: { ability: string; target?: 'record' | 'model' } | null = null;
    protected _style: ActionStyle | null = null;
    protected _outlined = false;
    protected _size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null = null;
    protected _badge?: AFn<string | null>;
    protected _badgeColor?: FilamentColorName;
    protected _iconPosition: 'before' | 'after' = 'before';
    protected _iconSize?: string | null;
    protected _labeledFrom?: string | null;
    protected _keyBindings: string[] = [];
    protected _arguments: Record<string, any> = {};
    protected _extraAttributes: Record<string, any> = {};
    protected _isBulk = false;
    protected _deselectRecordsAfterCompletion = false;
    protected _extraModalFooterActions: AFn<Action[]> = [];
    protected _mutateFormDataUsing?: (data: Record<string, any>, ctx: ActionContext) => Record<string, any> | Promise<Record<string, any>>;
    protected _disabledSchema = false;
    protected _closeModalByClickingAway = true;
    protected _labelHidden = false;
    protected _alpineClick?: string;

    constructor(public name: string) {
        this.setUp();
    }

    /** subclass hook (the Filament `setUp()`) */
    protected setUp(): void {}

    static getDefaultName(): string | null {
        return null;
    }

    static make<T extends Action>(this: new (name: string) => T, name?: string): T {
        return new this(name ?? (this as any).getDefaultName?.() ?? 'action');
    }

    /* ---- fluent configuration ---- */
    label(v: AFn<string | null>) { this._label = v; return this; }
    icon(v: AFn<string | null>) { this._icon = v; return this; }
    tableIcon(v: string) { this._tableIcon = v; return this; }
    groupedIcon(v: string) { this._groupedIcon = v; return this; }
    color(v: AFn<FilamentColorName | null>) { this._color = v; return this; }
    defaultColor(v: FilamentColorName) { this._defaultColor = v; return this; }
    url(v: AFn<string | null>, shouldOpenInNewTab = false) { this._url = v; this._openUrlInNewTab = shouldOpenInNewTab; return this; }
    openUrlInNewTab(v = true) { this._openUrlInNewTab = v; return this; }
    tooltip(v: AFn<string | null>) { this._tooltip = v; return this; }
    visible(v: AFn<boolean>) { this._visible = v; return this; }
    hidden(v: AFn<boolean> = true) { this._hidden = v; return this; }
    disabled(v: AFn<boolean> = true) { this._disabled = v; return this; }
    authorize(v: AFn<boolean>) { this._authorize = v; return this; }
    /** authorise through the policy of the record (or the model for create) */
    ability(ability: string, target: 'record' | 'model' = 'record') { this._ability = { ability, target }; return this; }
    requiresConfirmation(v = true) { this._requiresConfirmation = v; return this; }
    modalHeading(v: AFn<string | null>) { this._modalHeading = v; return this; }
    modalDescription(v: AFn<ReactNode | string | null>) { this._modalDescription = v; return this; }
    modalSubmitActionLabel(v: AFn<string | null>) { this._modalSubmitActionLabel = v; return this; }
    modalCancelActionLabel(v: string) { this._modalCancelActionLabel = v; return this; }
    modalWidth(v: string) { this._modalWidth = v; return this; }
    modalIcon(v: string | null) { this._modalIcon = v; return this; }
    modalIconColor(v: FilamentColorName | null) { this._modalIconColor = v; return this; }
    modalContent(v: AFn<ReactNode>) { this._modalContent = v; return this; }
    modalContentFooter(v: AFn<ReactNode>) { this._modalFooterContent = v; return this; }
    modalSubmitAction(v: boolean) { this._modalSubmitAction = v; return this; }
    modalCancelAction(v: boolean) { this._modalCancelAction = v; return this; }
    modalFooterActionsAlignment(v: string | null) { this._modalFooterActionsAlignment = v; return this; }
    closeModalByClickingAway(v = true) { this._closeModalByClickingAway = v; return this; }
    slideOver(v = true) { this._slideOver = v; return this; }
    extraModalFooterActions(v: AFn<Action[]>) { this._extraModalFooterActions = v; return this; }
    /** `->form([...components])` or `->schema(...)`: the fields of the modal */
    form(v: AFn<any[] | Schema>) { this._form = v; return this; }
    schema(v: AFn<any[] | Schema>) { return this.form(v); }
    fillForm(v: AFn<Record<string, any>>) { this._fillForm = v; return this; }
    action(handler: (ctx: ActionContext) => any) { this._handler = handler; return this; }
    before(handler: (ctx: ActionContext) => any) { this._before.push(handler); return this; }
    after(handler: (ctx: ActionContext) => any) { this._after.push(handler); return this; }
    mutateDataUsing(fn: (data: Record<string, any>, ctx: ActionContext) => Record<string, any> | Promise<Record<string, any>>) { return this.mutateFormDataUsing(fn); }
    mutateFormDataUsing(fn: (data: Record<string, any>, ctx: ActionContext) => Record<string, any> | Promise<Record<string, any>>) { this._mutateFormDataUsing = fn; return this; }
    successNotificationTitle(v: AFn<string | null>) { this._successNotificationTitle = v; return this; }
    failureNotificationTitle(v: AFn<string | null>) { this._failureNotificationTitle = v; return this; }
    successRedirectUrl(v: AFn<string | null>) { this._successRedirectUrl = v; return this; }
    button() { this._style = 'button'; return this; }
    link() { this._style = 'link'; return this; }
    iconButton() { this._style = 'iconButton'; return this; }
    badge(v: AFn<string | null>) { this._badge = v; if (this._style === null) return this; return this; }
    badgeColor(v: FilamentColorName) { this._badgeColor = v; return this; }
    outlined(v = true) { this._outlined = v; return this; }
    size(v: 'xs' | 'sm' | 'md' | 'lg' | 'xl') { this._size = v; return this; }
    iconPosition(v: 'before' | 'after') { this._iconPosition = v; return this; }
    iconSize(v: string | null) { this._iconSize = v; return this; }
    labeledFrom(v: string | null) { this._labeledFrom = v; return this; }
    hiddenLabel(v = true) { this._labelHidden = v; return this; }
    keyBindings(v: string[]) { this._keyBindings = v; return this; }
    arguments(v: Record<string, any>) { this._arguments = v; return this; }
    extraAttributes(v: Record<string, any>) { this._extraAttributes = v; return this; }
    deselectRecordsAfterCompletion(v = true) { this._deselectRecordsAfterCompletion = v; return this; }
    bulk(v = true) { this._isBulk = v; return this; }
    disabledSchema(v = true) { this._disabledSchema = v; return this; }

    /** inside a hook: stop without running the action (a notification usually explains why) */
    cancel(shouldRollBack = false): never {
        throw new Cancel(shouldRollBack);
    }
    halt(shouldRollBack = false): never {
        throw new Halt(shouldRollBack);
    }

    /* ---- evaluation (server) ---- */
    protected ev<T>(v: AFn<T> | undefined, ctx: ActionContext): Promise<T | undefined> {
        return evaluate<T, ActionContext>(v, { ...ctx, action: this });
    }

    getName() { return this.name; }
    getDefaultLabel(): string { return titleFromName(this.name); }
    async getLabel(ctx: ActionContext): Promise<string> { return (await this.ev(this._label, ctx)) ?? this.getDefaultLabel(); }
    async getIcon(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._icon, ctx)) ?? null; }
    getTableIcon(): string | null { return this._tableIcon ?? null; }
    getGroupedIcon(): string | null { return this._groupedIcon ?? null; }
    async getColor(ctx: ActionContext): Promise<FilamentColorName | null> {
        const color = await this.ev(this._color, ctx);
        return color === undefined ? (this._defaultColor ?? 'primary') : color;
    }
    async getUrl(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._url, ctx)) ?? null; }
    async getTooltip(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._tooltip, ctx)) ?? null; }
    async getBadge(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._badge, ctx)) ?? null; }
    getStyle(): ActionStyle | null { return this._style; }
    isOutlined() { return this._outlined; }
    getSize() { return this._size; }
    getBadgeColor() { return this._badgeColor ?? 'primary'; }
    getIconPosition() { return this._iconPosition; }
    getIconSize() { return this._iconSize ?? null; }
    getLabeledFrom() { return this._labeledFrom ?? null; }
    isLabelHidden() { return this._labelHidden; }
    shouldOpenUrlInNewTab() { return this._openUrlInNewTab; }
    getKeyBindings() { return this._keyBindings; }
    getExtraAttributes() { return this._extraAttributes; }
    getArguments() { return this._arguments; }
    isBulk() { return this._isBulk; }
    shouldDeselectRecordsAfterCompletion() { return this._deselectRecordsAfterCompletion; }
    isSchemaDisabled() { return this._disabledSchema; }
    hasUrl() { return this._url !== undefined; }
    hasSuccessRedirect() { return this._successRedirectUrl !== undefined; }

    async isAuthorized(ctx: ActionContext): Promise<boolean> {
        if (this._authorize !== undefined && !(await this.ev(this._authorize, ctx))) return false;
        if (this._ability) {
            const target = this._ability.target === 'model' ? ctx.model : (ctx.record ?? ctx.model);
            if (target && !(await can(ctx.user ?? null, this._ability.ability, target))) return false;
        }
        return true;
    }

    async isVisible(ctx: ActionContext): Promise<boolean> {
        if (!(await this.isAuthorized(ctx))) return false;
        if ((await this.ev(this._hidden, ctx)) === true) return false;
        return (await this.ev(this._visible, ctx)) !== false;
    }

    async isDisabled(ctx: ActionContext): Promise<boolean> {
        return (await this.ev(this._disabled, ctx)) === true;
    }

    hasForm(): boolean { return this._form !== undefined; }
    getFormDefinition() { return this._form; }
    /** the `form()` definition: component list, or a ready made `Schema` */
    async getFormComponents(ctx: ActionContext): Promise<any> { return (await this.ev(this._form, ctx)) ?? []; }
    async getFilledFormState(ctx: ActionContext): Promise<Record<string, any>> { return (await this.ev(this._fillForm, ctx)) ?? {}; }
    shouldOpenModal(): boolean {
        return this._requiresConfirmation || this._form !== undefined || this._modalContent !== undefined || this._modalHeading !== undefined || this._modalDescription !== undefined;
    }
    hasConfirmation() { return this._requiresConfirmation; }
    async getModalHeading(ctx: ActionContext): Promise<string> {
        return (await this.ev(this._modalHeading, ctx)) ?? (await this.getLabel(ctx));
    }
    async getModalDescription(ctx: ActionContext): Promise<ReactNode | string | null> {
        const description = await this.ev(this._modalDescription, ctx);
        if (description !== undefined) return description;
        return this._requiresConfirmation ? trans('filament-actions::modal.confirmation') : null;
    }
    async getModalSubmitActionLabel(ctx: ActionContext): Promise<string> {
        return (await this.ev(this._modalSubmitActionLabel, ctx)) ?? (this._requiresConfirmation ? trans('filament-actions::modal.actions.confirm.label') : trans('filament-actions::modal.actions.submit.label'));
    }
    getModalCancelActionLabel() { return this._modalCancelActionLabel ?? trans('filament-actions::modal.actions.cancel.label'); }
    getModalWidth() { return this._modalWidth ?? (this._requiresConfirmation ? 'md' : '4xl'); }
    getModalAlignment(): 'center' | 'start' {
        return this._requiresConfirmation || ['xs', 'sm'].includes(this.getModalWidth()) ? 'center' : 'start';
    }
    isSlideOver() { return this._slideOver; }
    getModalIcon() { return this._modalIcon ?? null; }
    async getModalIconColor(ctx: ActionContext): Promise<FilamentColorName> {
        if (this._modalIconColor) return this._modalIconColor;
        const color = await this.getColor(ctx);
        return !color || color === 'gray' ? 'primary' : color;
    }
    async getModalContent(ctx: ActionContext) { return this.ev(this._modalContent, ctx); }
    async getModalFooterContent(ctx: ActionContext) { return this.ev(this._modalFooterContent, ctx); }
    hasModalSubmitAction() { return this._modalSubmitAction !== false; }
    hasModalCancelAction() { return this._modalCancelAction !== false; }
    getModalFooterActionsAlignment() { return this._modalFooterActionsAlignment ?? (this._requiresConfirmation ? 'center' : null); }
    shouldCloseModalByClickingAway() { return this._closeModalByClickingAway; }
    async getExtraModalFooterActions(ctx: ActionContext): Promise<Action[]> { return (await this.ev(this._extraModalFooterActions, ctx)) ?? []; }
    async mutateFormData(data: Record<string, any>, ctx: ActionContext) {
        return this._mutateFormDataUsing ? this._mutateFormDataUsing(data, ctx) : data;
    }

    /** run the hooks and the handler; returns whatever the handler returned */
    async execute(ctx: ActionContext): Promise<{ halted: boolean; cancelled?: boolean; result?: any; failed?: boolean }> {
        const full: ActionContext = { ...ctx, action: this };
        try {
            for (const hook of this._before) await hook(full);
            const result = this._handler ? await this._handler(full) : undefined;
            for (const hook of this._after) await hook(full);
            // an action handler may return `false` to signal a failure (DeleteAction)
            if (result === false) {
                const failure = await this.ev(this._failureNotificationTitle, full);
                if (failure) {
                    const { Notification } = await import('../Notification');
                    await Notification.make().title(failure).danger().send();
                }
                return { halted: false, failed: true, result };
            }
            const title = await this.ev(this._successNotificationTitle, full);
            if (title) {
                const { Notification } = await import('../Notification');
                await Notification.make().title(title).success().send();
            }
            return { halted: false, result };
        } catch (e) {
            if (e instanceof Halt) return { halted: true };
            if (e instanceof Cancel) return { halted: false, cancelled: true };
            throw e;
        }
    }

    async getSuccessRedirectUrl(ctx: ActionContext): Promise<string | null> {
        return (await this.ev(this._successRedirectUrl, { ...ctx, action: this })) ?? null;
    }
}

export function titleFromName(name: string): string {
    const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** `ActionGroup`: a dropdown of actions */
export class ActionGroup {
    protected _label: string | null = null;
    protected _icon = 'heroicon-m-ellipsis-vertical';
    protected _color: FilamentColorName = 'gray';
    protected _tooltip: string | null = null;
    protected _button = false;
    protected _size: string | null = null;
    constructor(public actions: Array<Action | ActionGroup>) {}
    static make(actions: Array<Action | ActionGroup>): ActionGroup { return new ActionGroup(actions); }
    label(v: string) { this._label = v; return this; }
    icon(v: string) { this._icon = v; return this; }
    color(v: FilamentColorName) { this._color = v; return this; }
    tooltip(v: string | null) { this._tooltip = v; return this; }
    button(v = true) { this._button = v; return this; }
    size(v: string) { this._size = v; return this; }
    getLabel() { return this._label; }
    getIcon() { return this._icon; }
    getColor() { return this._color; }
    getTooltip() { return this._tooltip; }
    isButton() { return this._button; }
    getSize() { return this._size; }
    async isVisible(_ctx: ActionContext): Promise<boolean> {
        for (const a of this.actions) if (await a.isVisible(_ctx)) return true;
        return false;
    }
}

export class BulkActionGroup extends ActionGroup {
    constructor(actions: Array<Action | ActionGroup>) {
        super(actions);
        this._icon = 'heroicon-m-ellipsis-vertical';
    }
    static override make(actions: Array<Action | ActionGroup>): BulkActionGroup { return new BulkActionGroup(actions); }
}

/** `BulkAction`: runs for the selected records of a table */
export class BulkAction extends Action {
    protected override setUp() {
        super.setUp();
        this.bulk();
    }
}

/** an action (or one inside a group) by its name */
export function findByName(actions: Array<Action | ActionGroup>, name: string): Action | null {
    for (const a of actions) {
        if (a instanceof ActionGroup) {
            const found = findByName(a.actions, name);
            if (found) return found;
        } else if (a.getName() === name) return a;
    }
    return null;
}
