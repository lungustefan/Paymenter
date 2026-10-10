import type { ReactNode } from 'react';
import { Field } from '../Field';
import { getPath, setPath, type RenderContext } from '../Component';
import { TextInputControl } from '../controls';
import { Carbon } from '@/server/lib/carbon';
import type { Fn } from '../../core/evaluate';
import type { Rule } from '@/server/validation';

/**
 * Filament\Forms\Components\DateTimePicker (native mode: the browser's date / time inputs, which is
 * Filament's default). The state is kept in the internal format of the input, dehydrated with `format`.
 */
export class DateTimePicker extends Field {
    protected _hasDate = true;
    protected _hasTime = true;
    protected _seconds: Fn<boolean> = true;
    protected _format?: Fn<string | null>;
    protected _maxDate?: Fn<string | null>;
    protected _minDate?: Fn<string | null>;
    protected _step?: Fn<number | string | null>;
    protected _datalist?: Fn<string[] | null>;
    protected _native: Fn<boolean> = true;

    seconds(v: Fn<boolean> = true) { this._seconds = v; return this; }
    format(v: Fn<string | null>) { this._format = v; return this; }
    maxDate(v: Fn<string | null>) { this._maxDate = v; return this; }
    minDate(v: Fn<string | null>) { this._minDate = v; return this; }
    step(v: Fn<number | string | null>) { this._step = v; return this; }
    datalist(v: Fn<string[] | null>) { this._datalist = v; return this; }
    native(v: Fn<boolean> = true) { this._native = v; return this; }
    displayFormat(_v: string) { return this; }
    firstDayOfWeek(_v: number | null) { return this; }
    closeOnDateSelection(_v = true) { return this; }
    timezone(_v: string | null) { return this; }

    private hasSeconds = async (rc: RenderContext) => (await this.ev(this._seconds, rc)) === true;

    protected async storageFormat(rc: RenderContext): Promise<string> {
        const format = await this.ev(this._format, rc);
        if (format) return format;
        let f = this._hasDate ? 'Y-m-d' : '';
        if (!this._hasTime) return f;
        f = f ? `${f} H:i` : 'H:i';
        return (await this.hasSeconds(rc)) ? `${f}:s` : f;
    }

    /** the format of the browser input (`getInternalFormat()`) */
    protected async internalFormat(rc: RenderContext): Promise<string> {
        const seconds = await this.hasSeconds(rc);
        if (!this._hasTime) return 'Y-m-d';
        if (!this._hasDate) return seconds ? 'H:i:s' : 'H:i';
        return seconds ? 'Y-m-d H:i:s' : 'Y-m-d H:i';
    }

    protected inputType() {
        return !this._hasDate ? 'time' : !this._hasTime ? 'date' : 'datetime-local';
    }

    /** state (storage format) -> internal format */
    private async toInternal(rc: RenderContext, value: unknown): Promise<string | null> {
        if (value === null || value === undefined || value === '') return null;
        try {
            const raw = String(value);
            // a time-only value cannot be parsed as a date
            const parsed = this._hasDate ? Carbon.parse(raw) : Carbon.parse(`1970-01-01 ${raw}`);
            return parsed.format(await this.internalFormat(rc));
        } catch {
            return null;
        }
    }

    override async hydrateDefaults(rc: RenderContext, state: Record<string, any>, applyDefaults = true) {
        await super.hydrateDefaults(rc, state, applyDefaults);
        const path = this.getStatePath(rc);
        setPath(state, path, await this.toInternal(rc, getPath(state, path)));
    }

    override async dehydrate(rc: RenderContext, out: Record<string, any>) {
        await super.dehydrate(rc, out);
        const path = this.getStatePath(rc);
        const value = getPath(out, path);
        if (value === undefined) return;
        if (value === null || value === '') {
            setPath(out, path, null);
            return;
        }
        try {
            const raw = String(value);
            const parsed = this._hasDate ? Carbon.parse(raw) : Carbon.parse(`1970-01-01 ${raw}`);
            setPath(out, path, parsed.format(await this.storageFormat(rc)));
        } catch {
            setPath(out, path, null);
        }
    }

    protected override async implicitRules(): Promise<Rule[]> {
        return this._hasDate ? ['date'] : [];
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const prefix = await this.ev(this._prefix, rc);
        const prefixIcon = await this.ev(this._prefixIcon, rc);
        const suffix = await this.ev(this._suffix, rc);
        const suffixIcon = await this.ev(this._suffixIcon, rc);
        const hasInlinePrefix = this._inlinePrefix && (!!prefix || !!prefixIcon);
        const hasInlineSuffix = this._inlineSuffix && (!!suffix || !!suffixIcon);
        const list = await this.ev(this._datalist, rc);
        const maxDate = await this.ev(this._maxDate, rc);
        const minDate = await this.ev(this._minDate, rc);
        const step = (await this.ev(this._step, rc)) ?? (this._hasTime && !(await this.hasSeconds(rc)) ? undefined : undefined);
        const control = (
            <>
                <TextInputControl
                    path={path}
                    live={this._live}
                    id={id}
                    type={this.inputType()}
                    list={list?.length ? `${id}-list` : undefined}
                    max={this._hasTime ? (maxDate ?? undefined) : maxDate ? Carbon.parse(maxDate).format('Y-m-d') : undefined}
                    min={this._hasTime ? (minDate ?? undefined) : minDate ? Carbon.parse(minDate).format('Y-m-d') : undefined}
                    placeholder={(await this.ev(this._placeholder, rc)) || undefined}
                    readOnly={(await this.isReadOnly(rc)) || undefined}
                    required={((await this.isRequired(rc)) && !this.isConcealed()) || undefined}
                    disabled={(await this.isDisabled(rc)) || undefined}
                    step={step ?? (this._hasTime && (await this.hasSeconds(rc)) ? 1 : undefined)}
                    autoFocus={this._autofocus || undefined}
                    className={['fi-input', hasInlinePrefix ? 'fi-input-has-inline-prefix' : '', hasInlineSuffix ? 'fi-input-has-inline-suffix' : ''].filter(Boolean).join(' ')}
                />
                {list?.length ? (
                    <datalist id={`${id}-list`}>
                        {list.map((o) => (
                            <option key={o} value={o} />
                        ))}
                    </datalist>
                ) : null}
            </>
        );
        return this.wrap(rc, await this.wrapInput(rc, control, 'fi-fo-date-time-picker'), { verticalAlign: 'center' });
    }
}

/** Filament\Forms\Components\DatePicker */
export class DatePicker extends DateTimePicker {
    protected override _hasTime = false;
}

/** Filament\Forms\Components\TimePicker */
export class TimePicker extends DateTimePicker {
    protected override _hasDate = false;
}
