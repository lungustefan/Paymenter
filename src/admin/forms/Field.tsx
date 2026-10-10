import type { ReactNode } from 'react';
import { getTableName } from 'drizzle-orm';
import { Component, type RenderContext, getPath, setPath } from './Component';
import type { Fn } from '../core/evaluate';
import type { Rule } from '@/server/validation';
import { Icon } from '../ui/Icon';
import { colorClass, type FilamentColorName } from '../ui/colors';
import { cn } from '@themes/default/components/cn';
import { FieldErrors } from './runtime';
import { Wrp } from './controls';
import { Action } from '../actions/Action';
import { renderActionItem } from '../actions/render';

/** the SQL table name of a model class (`Currency::class`) or a table name */
export function tableName(table: any): string {
    if (typeof table === 'string') return table;
    return getTableName(table.table ?? table);
}

/** a rule that needs the rendering context to be built (`unique(..., ignoreRecord: true)`) */
export class RuleFactory {
    constructor(public make: (rc: RenderContext) => Rule | Promise<Rule>) {}
}

/** `helperText` / `hint` content: plain text or markup */
export type FieldText = string | ReactNode;

/**
 * `<div class="fi-sc fi-inline ... fi-sc-dense"><div><div class="fi-sc-component"><span class="fi-sc-text">…`:
 * the child schema Filament renders the helper text and the hint with.
 */
export function SchemaText({ children, align, color, icon, html, actions }: { children?: ReactNode; align?: 'end'; color?: FilamentColorName | null; icon?: string | null; html?: boolean; actions?: ReactNode }) {
    return (
        <div className={`fi-sc fi-inline${align === 'end' ? ' fi-align-end' : ''} fi-sc-has-gap fi-sc-dense`}>
            {children !== undefined && children !== null && children !== '' && (
                <div>
                    <div className="fi-sc-component">
                        <span className={`fi-sc-text${color ? ' ' + colorClass('schemaText', color) : ''}`}>
                            {icon && <Icon icon={icon} className={color ? colorClass('schemaIcon', color) : undefined} />}
                            {html && typeof children === 'string' ? <span dangerouslySetInnerHTML={{ __html: children }} /> : children}
                        </span>
                    </div>
                </div>
            )}
            {actions}
        </div>
    );
}

/** `<x-filament-forms::field-wrapper>` */
export function FieldWrapper({
    id,
    path,
    label,
    labelTag = 'label',
    labelSrOnly,
    required,
    disabled,
    afterLabel,
    helper,
    htmlHelper,
    className,
    inlineLabel,
    verticalAlign = 'start',
    labelPrefix,
    labelSuffix,
    children,
}: {
    id: string;
    path: string;
    label: ReactNode;
    labelTag?: 'label' | 'div';
    labelSrOnly?: boolean;
    required?: boolean;
    disabled?: boolean;
    /** the hint (text + actions) */
    afterLabel?: ReactNode;
    helper?: ReactNode;
    htmlHelper?: boolean;
    className?: string;
    inlineLabel?: boolean;
    verticalAlign?: 'start' | 'center' | 'end';
    labelPrefix?: ReactNode;
    labelSuffix?: ReactNode;
    children?: ReactNode;
}) {
    const hasLabel = !!label && !labelSrOnly;
    const Tag = labelTag;
    const labelProps = labelTag === 'label' ? { htmlFor: id } : { id: `${id}-label` };
    const showLabelCol = hasLabel || inlineLabel || !!afterLabel || !!labelPrefix || !!labelSuffix;
    return (
        <div data-field-wrapper="" className={cn(className, 'fi-fo-field', inlineLabel && 'fi-fo-field-has-inline-label')}>
            {!!label && labelSrOnly && (
                <Tag {...(labelProps as any)} className="fi-fo-field-label fi-sr-only">
                    {label}
                </Tag>
            )}
            {showLabelCol && (
                <div className={cn('fi-fo-field-label-col', inlineLabel && `fi-vertical-align-${verticalAlign}`)}>
                    <div className="fi-fo-field-label-ctn">
                        {(hasLabel || labelPrefix || labelSuffix) && (
                            <Tag {...(labelProps as any)} className="fi-fo-field-label">
                                {labelPrefix}
                                {hasLabel && (
                                    <span className="fi-fo-field-label-content">
                                        {label}
                                        {required && !disabled ? <sup className="fi-fo-field-label-required-mark">*</sup> : null}
                                    </span>
                                )}
                                {labelSuffix}
                            </Tag>
                        )}
                        {afterLabel}
                    </div>
                </div>
            )}
            {children || helper ? (
                <div className="fi-fo-field-content-col">
                    {children}
                    {helper && <SchemaText html={htmlHelper}>{helper as any}</SchemaText>}
                    <FieldErrors path={path} />
                </div>
            ) : (
                <FieldErrors path={path} wrapInCol />
            )}
        </div>
    );
}

/**
 * Base of the form inputs: state path, default state, validation rules and the common
 * `required / helperText / hint / placeholder / rules` options.
 */
export abstract class Field extends Component {
    protected _required: Fn<boolean> = false;
    protected _helperText?: Fn<FieldText | null>;
    protected _hint?: Fn<FieldText | null>;
    protected _hintIcon?: Fn<string | null>;
    protected _hintColor?: Fn<FilamentColorName | null>;
    protected _hintActions: Action[] = [];
    protected _prefixActions: Action[] = [];
    protected _suffixActions: Action[] = [];
    protected _placeholder?: Fn<string | null>;
    protected _default?: Fn<any>;
    protected _rules: Array<Rule | RuleFactory> = [];
    protected _validationAttribute?: string;
    protected _validationMessages: Record<string, string> = {};
    protected _markAsRequired?: Fn<boolean>;
    protected _autofocus = false;
    protected _readOnly: Fn<boolean> = false;
    protected _prefix?: Fn<string | null>;
    protected _suffix?: Fn<string | null>;
    protected _prefixIcon?: Fn<string | null>;
    protected _suffixIcon?: Fn<string | null>;
    protected _prefixIconColor?: FilamentColorName;
    protected _suffixIconColor?: FilamentColorName;
    protected _inlinePrefix = false;
    protected _inlineSuffix = false;
    protected _inlineLabel = false;
    protected _htmlHelper = false;
    protected _formatStateUsing?: (ctx: any) => any;

    static make(name?: string): any {
        return new (this as any)(name);
    }

    override hasStatePath() {
        return true;
    }

    required(v: Fn<boolean> = true) { this._required = v; return this; }
    markAsRequired(v: Fn<boolean>) { this._markAsRequired = v; return this; }
    helperText(v: Fn<FieldText | null>) { this._helperText = v; return this; }
    hint(v: Fn<FieldText | null>) { this._hint = v; return this; }
    hintIcon(v: Fn<string | null>) { this._hintIcon = v; return this; }
    hintColor(v: Fn<FilamentColorName | null>) { this._hintColor = v; return this; }
    hintAction(a: Action) { this._hintActions.push(a); return this; }
    hintActions(a: Action[]) { this._hintActions.push(...a); return this; }
    prefixAction(a: Action) { this._prefixActions.push(a); return this; }
    suffixAction(a: Action) { this._suffixActions.push(a); return this; }
    placeholder(v: Fn<string | null>) { this._placeholder = v; return this; }
    default(v: Fn<any>) { this._default = v; return this; }
    rules(v: Array<Rule | RuleFactory>) { this._rules.push(...v); return this; }
    rule(v: Rule | RuleFactory) { this._rules.push(v); return this; }
    validationAttribute(v: string) { this._validationAttribute = v; return this; }
    validationMessages(v: Record<string, string>) { this._validationMessages = v; return this; }
    autofocus(v = true) { this._autofocus = v; return this; }
    readOnly(v: Fn<boolean> = true) { this._readOnly = v; return this; }
    readonly(v: Fn<boolean> = true) { return this.readOnly(v); }
    prefix(v: Fn<string | null>) { this._prefix = v; return this; }
    suffix(v: Fn<string | null>) { this._suffix = v; return this; }
    prefixIcon(v: Fn<string | null>) { this._prefixIcon = v; return this; }
    suffixIcon(v: Fn<string | null>) { this._suffixIcon = v; return this; }
    prefixIconColor(v: FilamentColorName) { this._prefixIconColor = v; return this; }
    suffixIconColor(v: FilamentColorName) { this._suffixIconColor = v; return this; }
    inlinePrefix(v = true) { this._inlinePrefix = v; return this; }
    inlineSuffix(v = true) { this._inlineSuffix = v; return this; }
    inlineLabel(v = true) { this._inlineLabel = v; return this; }
    formatStateUsing(fn: (ctx: any) => any) { this._formatStateUsing = fn; return this; }
    allowHtmlHelper(v = true) { this._htmlHelper = v; return this; }

    /** `->unique(table, column, ignorable, ignoreRecord)` */
    unique(table: any, column?: string | null, ignorable?: any, ignoreRecord = false, modifyRule?: (q: any) => any) {
        void modifyRule;
        this._rules.push(
            new RuleFactory((rc) => {
                const t = tableName(table);
                const col = column ?? this.getName();
                let rule = `unique:${t},${col}`;
                const ignore = ignorable ?? (ignoreRecord ? rc.record : null);
                if (ignore && typeof ignore === 'object') rule += `,${ignore.getKey()},${ignore.ctor.primaryKey ?? 'id'}`;
                else if (ignore !== null && ignore !== undefined) rule += `,${ignore}`;
                return rule;
            }),
        );
        return this;
    }

    /** `->exists(table, column)` */
    exists(table: any, column?: string | null) {
        this._rules.push(`exists:${tableName(table)},${column ?? this.getName()}`);
        return this;
    }

    isMarkedRequired = async (rc: RenderContext): Promise<boolean> => {
        const marked = await this.ev(this._markAsRequired, rc);
        if (marked !== undefined) return marked;
        return (await this.ev(this._required, rc)) === true;
    };

    isRequired = async (rc: RenderContext) => (await this.ev(this._required, rc)) === true;
    isReadOnly = async (rc: RenderContext) => (await this.ev(this._readOnly, rc)) === true;

    /** the value shown / saved when nothing was filled in */
    override async hydrateDefaults(rc: RenderContext, state: Record<string, any>, applyDefaults = true) {
        const path = this.getStatePath(rc);
        if (getPath(state, path) !== undefined) return;
        if (applyDefaults && this._default !== undefined) setPath(state, path, await this.ev(this._default, rc));
        else setPath(state, path, await this.emptyState(rc));
    }

    /** `null` for most inputs, `false` for toggles/checkboxes, `[]` for multi-selects */
    protected emptyState(_rc: RenderContext): any {
        return null;
    }

    /** rules the field itself implies (before `required`/custom) */
    protected implicitRules(_rc: RenderContext): Promise<Rule[]> | Rule[] {
        return [];
    }

    override async saveRelationships(_rc: RenderContext, _record: any, _data: Record<string, any>): Promise<void> {}

    override async collectRules(rc: RenderContext, rules: Record<string, any[]>, attributes: Record<string, string>) {
        if (!(await this.isVisible(rc))) return;
        const path = this.getStatePath(rc);
        const list: any[] = [];
        if ((await this.ev(this._required, rc)) === true) list.push('required');
        else list.push('nullable');
        list.push(...(await this.implicitRules(rc)));
        for (const r of this._rules) list.push(r instanceof RuleFactory ? await r.make(rc) : r);
        rules[path] = [...(rules[path] ?? []), ...list];
        const label = (await this.getLabel(rc)) ?? path;
        attributes[path] = this._validationAttribute ?? label.charAt(0).toLowerCase() + label.slice(1);
        await this.collectChildRules(rc, rules, attributes);
    }

    protected async collectChildRules(_rc: RenderContext, _rules: Record<string, any[]>, _attributes: Record<string, string>) {}

    /** the visible inline actions of a kind (`hint`, `prefix`, `suffix`) with their DOM ids */
    inlineActions(kind: 'hint' | 'prefix' | 'suffix'): Action[] {
        return kind === 'hint' ? this._hintActions : kind === 'prefix' ? this._prefixActions : this._suffixActions;
    }

    protected actionId(rc: RenderContext, kind: string, action: Action) {
        return `field:${this.getStatePath(rc)}:${kind}:${action.getName()}`;
    }

    private async renderInlineActions(rc: RenderContext, kind: 'hint' | 'prefix' | 'suffix'): Promise<ReactNode[]> {
        const out: ReactNode[] = [];
        for (const action of this.inlineActions(kind)) {
            const ctx = { ...this.evalCtx(rc), action } as any;
            if (!(await action.isVisible(ctx))) continue;
            out.push(
                <div key={action.getName()} className="fi-sc-action">
                    {await renderActionItem(action, ctx, this.actionId(rc, kind, action), { defaultStyle: kind === 'hint' ? 'link' : 'iconButton', defaultSize: kind === 'hint' ? 'sm' : 'md' })}
                </div>,
            );
        }
        return out;
    }

    /** the hint next to the label (text + actions) */
    protected async renderHint(rc: RenderContext): Promise<ReactNode> {
        const hint = await this.ev(this._hint, rc);
        const actions = await this.renderInlineActions(rc, 'hint');
        if (!hint && actions.length === 0) return null;
        return (
            <SchemaText align="end" color={await this.ev(this._hintColor, rc)} icon={await this.ev(this._hintIcon, rc)} html actions={actions.length ? <>{actions}</> : undefined}>
                {hint as any}
            </SchemaText>
        );
    }

    /** wrap the control in the standard field markup */
    protected async wrap(
        rc: RenderContext,
        control: ReactNode,
        options: { className?: string; labelTag?: 'label' | 'div'; labelPrefix?: ReactNode; labelSuffix?: ReactNode; verticalAlign?: 'start' | 'center' | 'end' } = {},
    ): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        return (
            <FieldWrapper
                id={id}
                path={path}
                label={await this.getLabel(rc)}
                labelTag={options.labelTag}
                labelSrOnly={this.isLabelHidden()}
                required={await this.isMarkedRequired(rc)}
                disabled={await this.isDisabled(rc)}
                afterLabel={await this.renderHint(rc)}
                helper={await this.ev(this._helperText, rc)}
                htmlHelper={this._htmlHelper}
                className={options.className}
                inlineLabel={this._inlineLabel}
                verticalAlign={options.verticalAlign}
                labelPrefix={options.labelPrefix}
                labelSuffix={options.labelSuffix}
            >
                {control}
            </FieldWrapper>
        );
    }

    /** `wrapInputHtml`: `<div class="fi-input-wrp">` with the prefix / suffix */
    protected async wrapInput(rc: RenderContext, slot: ReactNode, className: string): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const prefix = await this.ev(this._prefix, rc);
        const suffix = await this.ev(this._suffix, rc);
        const prefixIcon = await this.ev(this._prefixIcon, rc);
        const suffixIcon = await this.ev(this._suffixIcon, rc);
        const prefixActions = await this.renderInlineActions(rc, 'prefix');
        const suffixActions = await this.renderInlineActions(rc, 'suffix');
        const hasPrefix = prefixActions.length > 0 || !!prefixIcon || !!prefix;
        const hasSuffix = suffixActions.length > 0 || !!suffixIcon || !!suffix;
        return (
            <Wrp path={path} className={cn(className, 'fi-input-wrp')} disabled={await this.isDisabled(rc)}>
                {hasPrefix && (
                    <div className={cn('fi-input-wrp-prefix', 'fi-input-wrp-prefix-has-content', this._inlinePrefix && 'fi-inline', !!prefix && 'fi-input-wrp-prefix-has-label')}>
                        {prefixActions.length > 0 && <div className="fi-input-wrp-actions">{prefixActions}</div>}
                        {prefixIcon && <Icon icon={prefixIcon} className={colorClass('inputWrapperIcon', this._prefixIconColor ?? 'gray')} />}
                        {prefix && <span className="fi-input-wrp-label">{prefix}</span>}
                    </div>
                )}
                <div className="fi-input-wrp-content-ctn">{slot}</div>
                {hasSuffix && (
                    <div className={cn('fi-input-wrp-suffix', this._inlineSuffix && 'fi-inline', !!suffix && 'fi-input-wrp-suffix-has-label')}>
                        {suffix && <span className="fi-input-wrp-label">{suffix}</span>}
                        {suffixIcon && <Icon icon={suffixIcon} className={colorClass('inputWrapperIcon', this._suffixIconColor ?? 'gray')} />}
                        {suffixActions.length > 0 && <div className="fi-input-wrp-actions">{suffixActions}</div>}
                    </div>
                )}
            </Wrp>
        );
    }

    protected hasInlinePrefix(hasPrefix: boolean) {
        return this._inlinePrefix && hasPrefix;
    }
}
