import type { ReactNode } from 'react';
import type { Model } from '@/server/orm';
import { evaluate, type EvalContext, type Fn } from '../core/evaluate';
import type { FilamentColorName } from '../ui/colors';

export type ActionStyle = 'button' | 'link' | 'iconButton' | 'grouped' | 'badge';

/** thrown by `$action->cancel()` / `halt()` to stop an action (hooks use it) */
export class Halt extends Error {
    constructor(public shouldRollBack = false) {
        super('halt');
    }
}

export interface ActionContext extends EvalContext {
    action: Action;
    data?: Record<string, any>;
    arguments?: Record<string, any>;
    records?: Model<any>[];
}

/**
 * Port of Filament\Actions\Action: a button that runs a closure on the server, optionally behind a
 * confirmation modal and/or a form. Every option may be a closure (`fn (Product $record) => ...`).
 */
export class Action {
    protected _label?: Fn<string | null>;
    protected _icon?: Fn<string | null>;
    protected _color?: Fn<FilamentColorName | null>;
    protected _url?: Fn<string | null>;
    protected _openUrlInNewTab = false;
    protected _tooltip?: Fn<string | null>;
    protected _visible: Fn<boolean> = true;
    protected _hidden: Fn<boolean> = false;
    protected _disabled: Fn<boolean> = false;
    protected _requiresConfirmation = false;
    protected _modalHeading?: Fn<string | null>;
    protected _modalDescription?: Fn<string | null>;
    protected _modalSubmitActionLabel?: Fn<string | null>;
    protected _modalCancelActionLabel?: string;
    protected _modalWidth?: string;
    protected _modalIcon?: string | null;
    protected _modalIconColor?: FilamentColorName | null;
    protected _modalContent?: Fn<ReactNode>;
    protected _modalSubmitAction: boolean | Action = true;
    protected _slideOver = false;
    protected _form?: Fn<any[]>;
    protected _fillForm?: Fn<Record<string, any>>;
    protected _handler?: (ctx: ActionContext) => any;
    protected _before: Array<(ctx: ActionContext) => any> = [];
    protected _after: Array<(ctx: ActionContext) => any> = [];
    protected _successNotificationTitle?: Fn<string | null>;
    protected _failureNotificationTitle?: Fn<string | null>;
    protected _successRedirectUrl?: Fn<string | null>;
    protected _authorize?: Fn<boolean>;
    protected _style: ActionStyle | null = null;
    protected _outlined = false;
    protected _size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | null = null;
    protected _badge?: Fn<string | null>;
    protected _badgeColor?: FilamentColorName;
    protected _iconPosition: 'before' | 'after' = 'before';
    protected _keyBindings: string[] = [];
    protected _arguments: Record<string, any> = {};
    protected _extraAttributes: Record<string, any> = {};
    protected _isBulk = false;
    protected _deselectRecordsAfterCompletion = false;
    protected _groupedIcon?: string;
    /** the name of an action nested in this action's modal footer (`extraModalFooterActions`) */
    protected _extraModalFooterActions: Action[] = [];

    constructor(public name: string) {}

    static make(name?: string): Action {
        return new this(name ?? (this as any).getDefaultName?.() ?? 'action');
    }

    /* ---- fluent configuration ---- */
    label(v: Fn<string | null>) { this._label = v; return this; }
    icon(v: Fn<string | null>) { this._icon = v; return this; }
    color(v: Fn<FilamentColorName | null>) { this._color = v; return this; }
    url(v: Fn<string | null>, shouldOpenInNewTab = false) { this._url = v; this._openUrlInNewTab = shouldOpenInNewTab; return this; }
    openUrlInNewTab(v = true) { this._openUrlInNewTab = v; return this; }
    tooltip(v: Fn<string | null>) { this._tooltip = v; return this; }
    visible(v: Fn<boolean>) { this._visible = v; return this; }
    hidden(v: Fn<boolean>) { this._hidden = v; return this; }
    disabled(v: Fn<boolean> = true) { this._disabled = v; return this; }
    authorize(v: Fn<boolean>) { this._authorize = v; return this; }
    requiresConfirmation(v = true) { this._requiresConfirmation = v; return this; }
    modalHeading(v: Fn<string | null>) { this._modalHeading = v; return this; }
    modalDescription(v: Fn<string | null>) { this._modalDescription = v; return this; }
    modalSubmitActionLabel(v: Fn<string | null>) { this._modalSubmitActionLabel = v; return this; }
    modalCancelActionLabel(v: string) { this._modalCancelActionLabel = v; return this; }
    modalWidth(v: string) { this._modalWidth = v; return this; }
    modalIcon(v: string | null) { this._modalIcon = v; return this; }
    modalIconColor(v: FilamentColorName | null) { this._modalIconColor = v; return this; }
    modalContent(v: Fn<ReactNode>) { this._modalContent = v; return this; }
    modalSubmitAction(v: boolean | Action) { this._modalSubmitAction = v; return this; }
    slideOver(v = true) { this._slideOver = v; return this; }
    extraModalFooterActions(v: Action[]) { this._extraModalFooterActions = v; return this; }
    /** `->form([...components])` or `->schema(...)`: the fields of the modal */
    form(v: Fn<any[]>) { this._form = v; return this; }
    schema(v: Fn<any[]>) { return this.form(v); }
    fillForm(v: Fn<Record<string, any>>) { this._fillForm = v; return this; }
    action(handler: (ctx: ActionContext) => any) { this._handler = handler; return this; }
    before(handler: (ctx: ActionContext) => any) { this._before.push(handler); return this; }
    after(handler: (ctx: ActionContext) => any) { this._after.push(handler); return this; }
    successNotificationTitle(v: Fn<string | null>) { this._successNotificationTitle = v; return this; }
    failureNotificationTitle(v: Fn<string | null>) { this._failureNotificationTitle = v; return this; }
    successRedirectUrl(v: Fn<string | null>) { this._successRedirectUrl = v; return this; }
    button() { this._style = 'button'; return this; }
    link() { this._style = 'link'; return this; }
    iconButton() { this._style = 'iconButton'; return this; }
    badge(v: Fn<string | null>) { this._badge = v; return this; }
    badgeColor(v: FilamentColorName) { this._badgeColor = v; return this; }
    outlined(v = true) { this._outlined = v; return this; }
    size(v: 'xs' | 'sm' | 'md' | 'lg' | 'xl') { this._size = v; return this; }
    iconPosition(v: 'before' | 'after') { this._iconPosition = v; return this; }
    keyBindings(v: string[]) { this._keyBindings = v; return this; }
    arguments(v: Record<string, any>) { this._arguments = v; return this; }
    extraAttributes(v: Record<string, any>) { this._extraAttributes = v; return this; }
    deselectRecordsAfterCompletion(v = true) { this._deselectRecordsAfterCompletion = v; return this; }

    /** inside a hook: stop without running the action (a notification usually explains why) */
    cancel(shouldRollBack = false): never {
        throw new Halt(shouldRollBack);
    }
    halt(shouldRollBack = false): never {
        throw new Halt(shouldRollBack);
    }

    /* ---- evaluation (server) ---- */
    protected ev<T>(v: Fn<T> | undefined, ctx: ActionContext): Promise<T | undefined> {
        return evaluate(v as any, { ...ctx, action: this }) as Promise<T | undefined>;
    }

    getName() { return this.name; }
    getDefaultLabel(): string { return titleFromName(this.name); }
    async getLabel(ctx: ActionContext): Promise<string> { return (await this.ev(this._label, ctx)) ?? this.getDefaultLabel(); }
    async getIcon(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._icon, ctx)) ?? null; }
    async getColor(ctx: ActionContext): Promise<FilamentColorName | null> { return (await this.ev(this._color, ctx)) ?? 'primary'; }
    async getUrl(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._url, ctx)) ?? null; }
    async getTooltip(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._tooltip, ctx)) ?? null; }
    async getBadge(ctx: ActionContext): Promise<string | null> { return (await this.ev(this._badge, ctx)) ?? null; }
    getStyle(): ActionStyle | null { return this._style; }
    isOutlined() { return this._outlined; }
    getSize() { return this._size; }
    getBadgeColor() { return this._badgeColor ?? 'primary'; }
    getIconPosition() { return this._iconPosition; }
    shouldOpenUrlInNewTab() { return this._openUrlInNewTab; }
    getKeyBindings() { return this._keyBindings; }
    getExtraAttributes() { return this._extraAttributes; }
    isBulk() { return this._isBulk; }
    shouldDeselectRecordsAfterCompletion() { return this._deselectRecordsAfterCompletion; }

    async isVisible(ctx: ActionContext): Promise<boolean> {
        if (this._authorize !== undefined && !(await this.ev(this._authorize, ctx))) return false;
        if ((await this.ev(this._hidden, ctx)) === true) return false;
        return (await this.ev(this._visible, ctx)) !== false;
    }

    async isDisabled(ctx: ActionContext): Promise<boolean> {
        return (await this.ev(this._disabled, ctx)) === true;
    }

    hasForm(): boolean { return this._form !== undefined; }
    getFormDefinition() { return this._form; }
    async getFormComponents(ctx: ActionContext): Promise<any[]> { return (await this.ev(this._form, ctx)) ?? []; }
    async getFilledFormState(ctx: ActionContext): Promise<Record<string, any>> { return (await this.ev(this._fillForm, ctx)) ?? {}; }
    shouldOpenModal(): boolean {
        return this._requiresConfirmation || this._form !== undefined || this._modalContent !== undefined || this._modalHeading !== undefined;
    }
    hasConfirmation() { return this._requiresConfirmation; }
    async getModalHeading(ctx: ActionContext): Promise<string> {
        return (await this.ev(this._modalHeading, ctx)) ?? (this._requiresConfirmation && !this._form ? await this.getLabel(ctx) : await this.getLabel(ctx));
    }
    async getModalDescription(ctx: ActionContext): Promise<string | null> {
        return (await this.ev(this._modalDescription, ctx)) ?? (this._requiresConfirmation ? 'Are you sure you would like to do this?' : null);
    }
    async getModalSubmitActionLabel(ctx: ActionContext): Promise<string> {
        return (await this.ev(this._modalSubmitActionLabel, ctx)) ?? (this._requiresConfirmation && !this._form ? 'Confirm' : 'Submit');
    }
    getModalCancelActionLabel() { return this._modalCancelActionLabel ?? 'Cancel'; }
    getModalWidth() { return this._modalWidth ?? (this._requiresConfirmation && !this._form ? 'md' : 'lg'); }
    isSlideOver() { return this._slideOver; }
    getModalIcon() { return this._modalIcon ?? null; }
    getModalIconColor() { return this._modalIconColor ?? null; }
    async getModalContent(ctx: ActionContext) { return this.ev(this._modalContent, ctx); }
    hasModalSubmitAction() { return this._modalSubmitAction !== false; }
    getExtraModalFooterActions() { return this._extraModalFooterActions; }

    /** run the hooks and the handler; returns whatever the handler returned */
    async execute(ctx: ActionContext): Promise<{ halted: boolean; result?: any }> {
        const full: ActionContext = { ...ctx, action: this };
        try {
            for (const hook of this._before) await hook(full);
            const result = this._handler ? await this._handler(full) : undefined;
            for (const hook of this._after) await hook(full);
            const title = await this.ev(this._successNotificationTitle, full);
            if (title) {
                const { Notification } = await import('../Notification');
                await Notification.make().title(title).success().send();
            }
            return { halted: false, result };
        } catch (e) {
            if (e instanceof Halt) return { halted: true };
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

/** `Action` within a `BulkActionGroup` / `ActionGroup` */
export class ActionGroup {
    protected _label: string | null = null;
    protected _icon = 'heroicon-m-ellipsis-vertical';
    protected _color: FilamentColorName = 'gray';
    protected _tooltip: string | null = null;
    protected _button = false;
    constructor(public actions: Array<Action | ActionGroup>) {}
    static make(actions: Array<Action | ActionGroup>): ActionGroup { return new ActionGroup(actions); }
    label(v: string) { this._label = v; return this; }
    icon(v: string) { this._icon = v; return this; }
    color(v: FilamentColorName) { this._color = v; return this; }
    tooltip(v: string | null) { this._tooltip = v; return this; }
    button(v = true) { this._button = v; return this; }
    getLabel() { return this._label; }
    getIcon() { return this._icon; }
    getColor() { return this._color; }
    getTooltip() { return this._tooltip; }
    isButton() { return this._button; }
}

export class BulkActionGroup extends ActionGroup {
    constructor(actions: Array<Action | ActionGroup>) {
        super(actions);
        this._icon = 'heroicon-m-ellipsis-vertical';
    }
    static override make(actions: Array<Action | ActionGroup>): BulkActionGroup { return new BulkActionGroup(actions); }
}
