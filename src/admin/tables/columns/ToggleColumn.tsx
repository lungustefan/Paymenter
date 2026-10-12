import type { ReactNode } from 'react';
import { Column, type CFn, type ColumnContext } from './Column';
import { ToggleCell, TextInputCell } from './client';
import { Icon } from '../../ui/Icon';
import { colorClass, type FilamentColorName } from '../../ui/colors';
import { cn } from '@themes/default/components/cn';
import { validate, ValidationError } from '@/server/validation';
import { adminContext } from '../../context';
import type { Rule } from '@/server/validation';

const alignmentClass = (a: string | null) => (a ? (['start', 'center', 'end', 'left', 'right', 'justify', 'between'].includes(a) ? `fi-align-${a}` : a) : '');

/** shared by the columns that edit the record in place */
abstract class EditableColumn extends Column {
    protected _disabled: CFn<boolean> = false;
    protected _rules: Rule[] = [];
    protected _beforeStateUpdated: Array<(ctx: ColumnContext) => any> = [];
    protected _afterStateUpdated: Array<(ctx: ColumnContext) => any> = [];

    disabled(v: CFn<boolean> = true) { this._disabled = v; return this; }
    rules(v: Rule[]) { this._rules = [...this._rules, ...v]; return this; }
    beforeStateUpdated(fn: (ctx: ColumnContext) => any) { this._beforeStateUpdated.push(fn); return this; }
    afterStateUpdated(fn: (ctx: ColumnContext) => any) { this._afterStateUpdated.push(fn); return this; }

    async isDisabled(record: any) {
        return (await this.ev(this._disabled, this.ctx(record))) === true;
    }

    protected rulesFor(): Rule[] {
        return this._rules;
    }

    /** `updateState()`: validates and saves the new value */
    async updateState(record: any, value: unknown): Promise<void> {
        if (await this.isDisabled(record)) throw new ValidationError({ [this.name]: ['Disabled'] } as any);
        const { tr } = adminContext();
        await validate({ [this.name]: value }, { [this.name]: [this._rules.some((r) => r === 'required') ? 'required' : 'nullable', ...this.rulesFor()] } as any, { locale: tr.locale, attributes: { [this.name]: this.getLabel().toLowerCase() } });
        for (const fn of this._beforeStateUpdated) await fn(this.ctx(record, { state: value, oldState: await this.getState(record) }));
        const column = this.name.split('.').pop() as string;
        const target = this.name.includes('.') ? await this.resolveAttribute(record, this.name.split('.').slice(0, -1).join('.')) : record;
        await target.update({ [column]: value });
        for (const fn of this._afterStateUpdated) await fn(this.ctx(record, { state: value }));
    }
}

/** Filament\Tables\Columns\ToggleColumn */
export class ToggleColumn extends EditableColumn {
    protected _onColor?: FilamentColorName;
    protected _offColor?: FilamentColorName;
    protected _onIcon?: string;
    protected _offIcon?: string;

    constructor(name: string) {
        super(name);
        this._clickDisabled = true;
        this._rules = ['boolean'];
    }

    onColor(v: FilamentColorName) { this._onColor = v; return this; }
    offColor(v: FilamentColorName) { this._offColor = v; return this; }
    onIcon(v: string) { this._onIcon = v; return this; }
    offIcon(v: string) { this._offIcon = v; return this; }

    protected override rulesFor(): Rule[] {
        return this._rules;
    }

    override async updateState(record: any, value: unknown): Promise<void> {
        await super.updateState(record, value === true || value === 1 || value === '1' || value === 'true');
    }

    override async render(record: any, rc: { recordKey: string; rowLoop: ColumnContext['rowLoop'] }): Promise<ReactNode> {
        const state = !!(await this.getState(record));
        const alignment = await this.getAlignment(record);
        const label = this.getLabel().replace(/<[^>]*>/g, '').trim();
        return (
            <ToggleCell
                tableId={this.table.id}
                column={this.name}
                recordKey={rc.recordKey}
                state={state}
                disabled={await this.isDisabled(record)}
                label={label}
                onClass={cn('fi-toggle-on', colorClass('toggle', this._onColor ?? 'primary'))}
                offClass={cn('fi-toggle-off', colorClass('toggle', this._offColor ?? 'gray'))}
                onIcon={this._onIcon ? <Icon icon={this._onIcon} size="xs" /> : undefined}
                offIcon={this._offIcon ? <Icon icon={this._offIcon} size="xs" /> : undefined}
                className={cn('fi-ta-toggle', alignmentClass(alignment), this._inline && 'fi-inline')}
                tooltip={await this.getTooltip(record, state)}
            />
        );
    }
}

/** Filament\Tables\Columns\TextInputColumn */
export class TextInputColumn extends EditableColumn {
    protected _type: string | null = null;
    protected _step?: string | number;
    protected _prefixLabel?: string;
    protected _suffixLabel?: string;
    protected _inlinePrefix = false;
    protected _inlineSuffix = false;
    protected _inputMode?: string;

    type(v: string) { this._type = v; return this; }
    numeric() { this._type = 'number'; this._inputMode = 'decimal'; return this; }
    step(v: string | number) { this._step = v; return this; }
    prefix(v: string) { this._prefixLabel = v; return this; }
    suffix(v: string) { this._suffixLabel = v; return this; }
    inlinePrefix(v = true) { this._inlinePrefix = v; return this; }
    inlineSuffix(v = true) { this._inlineSuffix = v; return this; }
    inputMode(v: string) { this._inputMode = v; return this; }

    override async render(record: any, rc: { recordKey: string; rowLoop: ColumnContext['rowLoop'] }): Promise<ReactNode> {
        const state = await this.getState(record);
        const alignment = (await this.getAlignment(record)) ?? 'start';
        const placeholder = await this.ev(this._placeholder, this.ctx(record));
        const type = this._type ?? 'text';
        const hasPrefix = !!this._prefixLabel;
        const hasSuffix = !!this._suffixLabel;
        return (
            <TextInputCell
                tableId={this.table.id}
                column={this.name}
                recordKey={rc.recordKey}
                state={state}
                label={this.getLabel()}
                disabled={await this.isDisabled(record)}
                className={cn('fi-ta-text-input', this._inline && 'fi-inline')}
                wrapperClass="fi-input-wrp"
                inputClass={cn('fi-input', alignmentClass(alignment))}
                inputProps={{ type, inputMode: this._inputMode, placeholder: placeholder ?? undefined, step: this._step }}
                prefix={hasPrefix ? <div className={cn('fi-input-wrp-prefix', 'fi-input-wrp-prefix-has-content', this._inlinePrefix && 'fi-inline', 'fi-input-wrp-prefix-has-label')}><span className="fi-input-wrp-label">{this._prefixLabel}</span></div> : undefined}
                suffix={hasSuffix ? <div className={cn('fi-input-wrp-suffix', this._inlineSuffix && 'fi-inline', 'fi-input-wrp-suffix-has-label')}><span className="fi-input-wrp-label">{this._suffixLabel}</span></div> : undefined}
            />
        );
    }
}
