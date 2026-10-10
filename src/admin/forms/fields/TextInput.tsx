import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';
import { TextInputControl } from '../controls';
import { MoneyInput } from '../controls-extra';
import type { Fn } from '../../core/evaluate';
import type { Rule } from '@/server/validation';

/** Filament\Forms\Components\TextInput */
export class TextInput extends Field {
    protected _type?: Fn<string | null>;
    protected _email: Fn<boolean> = false;
    protected _numeric: Fn<boolean> = false;
    protected _integer: Fn<boolean> = false;
    protected _password: Fn<boolean> = false;
    protected _revealable = false;
    protected _tel: Fn<boolean> = false;
    protected _url: Fn<boolean> = false;
    protected _maxLength?: Fn<number | null>;
    protected _minLength?: Fn<number | null>;
    protected _maxValue?: Fn<number | string | null>;
    protected _minValue?: Fn<number | string | null>;
    protected _step?: Fn<number | string | null>;
    protected _inputMode?: Fn<string | null>;
    protected _autocomplete?: Fn<string | false | null>;
    protected _datalist?: Fn<string[] | null>;
    protected _money?: { decimal: string; thousands: string; precision: number };
    protected _trim = true;

    email(v: Fn<boolean> = true) { this._email = v; return this; }
    numeric(v: Fn<boolean> = true) { this._numeric = v; return this; }
    integer(v: Fn<boolean> = true) { this._integer = v; this._numeric = v; return this; }
    password(v: Fn<boolean> = true) { this._password = v; return this; }
    revealable(v = true) { this._revealable = v; return this; }
    tel(v: Fn<boolean> = true) { this._tel = v; return this; }
    url(v: Fn<boolean> = true) { this._url = v; return this; }
    type(v: Fn<string | null>) { this._type = v; return this; }
    maxLength(v: Fn<number | null>) { this._maxLength = v; return this; }
    minLength(v: Fn<number | null>) { this._minLength = v; return this; }
    maxValue(v: Fn<number | string | null>) { this._maxValue = v; return this; }
    minValue(v: Fn<number | string | null>) { this._minValue = v; return this; }
    step(v: Fn<number | string | null>) { this._step = v; return this; }
    inputMode(v: Fn<string | null>) { this._inputMode = v; return this; }
    autocomplete(v: Fn<string | false | null>) { this._autocomplete = v; return this; }
    datalist(v: Fn<string[] | null>) { this._datalist = v; return this; }
    /** `->mask(RawJs::make('$money($input, ".", "", 2)'))` */
    moneyMask(decimal = '.', thousands = '', precision = 2) { this._money = { decimal, thousands, precision }; return this; }
    mask(_v: unknown) { return this.moneyMask(); }
    trim(v = true) { this._trim = v; return this; }

    protected async resolveType(rc: RenderContext): Promise<string> {
        const explicit = await this.ev(this._type, rc);
        if (explicit) return explicit;
        if (await this.ev(this._email, rc)) return 'email';
        if (await this.ev(this._numeric, rc)) return 'number';
        if (await this.ev(this._password, rc)) return 'password';
        if (await this.ev(this._tel, rc)) return 'tel';
        if (await this.ev(this._url, rc)) return 'url';
        return 'text';
    }

    protected override async implicitRules(rc: RenderContext): Promise<Rule[]> {
        const rules: Rule[] = [];
        if (await this.ev(this._email, rc)) rules.push('email');
        if (await this.ev(this._numeric, rc)) rules.push('numeric');
        if (await this.ev(this._integer, rc)) rules.push('integer');
        if (await this.ev(this._url, rc)) rules.push('url');
        const max = await this.ev(this._maxLength, rc);
        if (max !== null && max !== undefined) rules.push(`max:${max}`);
        const min = await this.ev(this._minLength, rc);
        if (min !== null && min !== undefined) rules.push(`min:${min}`);
        const maxValue = await this.ev(this._maxValue, rc);
        if (maxValue !== null && maxValue !== undefined && maxValue !== '') rules.push(`max:${maxValue}`);
        const minValue = await this.ev(this._minValue, rc);
        if (minValue !== null && minValue !== undefined && minValue !== '') rules.push(`min:${minValue}`);
        return rules;
    }

    /** `NumberStateCast` */
    isNumeric = async (rc: RenderContext) => (await this.ev(this._numeric, rc)) === true;

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const disabled = await this.isDisabled(rc);
        const type = await this.resolveType(rc);
        const numeric = await this.ev(this._numeric, rc);
        const integer = await this.ev(this._integer, rc);
        const concealed = this.isConcealed();
        const maxLength = !concealed ? await this.ev(this._maxLength, rc) : null;
        const minLength = !concealed ? await this.ev(this._minLength, rc) : null;
        const max = !concealed ? await this.ev(this._maxValue, rc) : null;
        const min = !concealed ? await this.ev(this._minValue, rc) : null;
        const placeholder = await this.ev(this._placeholder, rc);
        const datalist = await this.ev(this._datalist, rc);
        const live = this._live;
        const explicitInputMode = await this.ev(this._inputMode, rc);
        const explicitStep = await this.ev(this._step, rc);
        const inputMode = explicitInputMode ?? (integer ? 'numeric' : numeric ? 'decimal' : undefined);
        const step = explicitStep ?? (integer ? 1 : numeric ? 'any' : undefined);
        const autocomplete = await this.ev(this._autocomplete, rc);
        const hasInlinePrefix = this._inlinePrefix && (!!(await this.ev(this._prefix, rc)) || !!(await this.ev(this._prefixIcon, rc)) || this._prefixActions.length > 0);
        const hasInlineSuffix = this._inlineSuffix && (!!(await this.ev(this._suffix, rc)) || !!(await this.ev(this._suffixIcon, rc)) || this._suffixActions.length > 0);
        const required = (await this.ev(this._required, rc)) === true && !concealed;
        const attrs = {
            id,
            autoComplete: autocomplete === false ? 'off' : (autocomplete ?? undefined),
            autoFocus: this._autofocus || undefined,
            disabled: disabled || undefined,
            inputMode: inputMode ?? undefined,
            list: datalist ? `${id}-list` : undefined,
            max: max ?? undefined,
            maxLength: maxLength ?? undefined,
            min: min ?? undefined,
            minLength: minLength ?? undefined,
            placeholder: placeholder || undefined,
            readOnly: (await this.isReadOnly(rc)) || undefined,
            required: required || undefined,
            step: step ?? undefined,
            type: this._money ? 'text' : this._revealable ? undefined : type,
            className: ['fi-input', hasInlinePrefix ? 'fi-input-has-inline-prefix' : '', hasInlineSuffix ? 'fi-input-has-inline-suffix' : '', this._revealable ? 'fi-revealable' : ''].filter(Boolean).join(' '),
        };
        const slot = (
            <>
                {this._money ? (
                    <MoneyInput path={path} live={live} money={this._money} {...(attrs as any)} />
                ) : (
                    <TextInputControl path={path} live={live} {...(attrs as any)} />
                )}
                {datalist && (
                    <datalist id={`${id}-list`}>
                        {datalist.map((o) => (
                            <option key={o} value={o} />
                        ))}
                    </datalist>
                )}
            </>
        );
        return this.wrap(rc, await this.wrapInput(rc, slot, 'fi-fo-text-input'));
    }

    /** `NumberStateCast`: the state of a numeric input is a number (`'49.90'` is shown as `49.9`) */
    override async runAfterStateHydrated(rc: RenderContext): Promise<void> {
        await super.runAfterStateHydrated(rc);
        if (!(await this.ev(this._numeric, rc))) return;
        const { getPath, setPath } = await import('../Component');
        const path = this.getStatePath(rc);
        const value = getPath(rc.state, path);
        if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) setPath(rc.state, path, Number(value));
    }

    override async dehydrate(rc: RenderContext, out: Record<string, any>): Promise<void> {
        await super.dehydrate(rc, out);
        const { getPath, setPath } = await import('../Component');
        const path = this.getStatePath(rc);
        let value = getPath(out, path);
        if (typeof value === 'string') {
            if (this._trim) value = value.trim();
            if (value === '') value = null;
            else if ((await this.ev(this._numeric, rc)) && /^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
            setPath(out, path, value);
        }
    }
}
