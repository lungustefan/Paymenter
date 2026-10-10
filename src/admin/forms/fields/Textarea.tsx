import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';
import { TextareaControl } from '../controls';
import type { Fn } from '../../core/evaluate';
import type { Rule } from '@/server/validation';

/** Filament\Forms\Components\Textarea */
export class Textarea extends Field {
    protected _rows?: Fn<number | null>;
    protected _cols?: Fn<number | null>;
    protected _maxLength?: Fn<number | null>;
    protected _minLength?: Fn<number | null>;
    protected _autosize: Fn<boolean> = false;

    rows(v: Fn<number | null>) { this._rows = v; return this; }
    cols(v: Fn<number | null>) { this._cols = v; return this; }
    maxLength(v: Fn<number | null>) { this._maxLength = v; return this; }
    minLength(v: Fn<number | null>) { this._minLength = v; return this; }
    autosize(v: Fn<boolean> = true) { this._autosize = v; return this; }

    protected override async implicitRules(rc: RenderContext): Promise<Rule[]> {
        const rules: Rule[] = [];
        const max = await this.ev(this._maxLength, rc);
        if (max !== null && max !== undefined) rules.push(`max:${max}`);
        const min = await this.ev(this._minLength, rc);
        if (min !== null && min !== undefined) rules.push(`min:${min}`);
        return rules;
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const rows = await this.ev(this._rows, rc);
        const autosize = (await this.ev(this._autosize, rc)) === true;
        const initialHeight = (rows ?? 2) * 1.5 + 0.75;
        const slot = (
            <div style={{ height: `${initialHeight}rem` }}>
                <TextareaControl
                    path={path}
                    live={this._live}
                    autosize={autosize}
                    id={id}
                    autoComplete={undefined}
                    autoFocus={this._autofocus || undefined}
                    cols={(await this.ev(this._cols, rc)) ?? undefined}
                    disabled={(await this.isDisabled(rc)) || undefined}
                    maxLength={(await this.ev(this._maxLength, rc)) ?? undefined}
                    minLength={(await this.ev(this._minLength, rc)) ?? undefined}
                    placeholder={(await this.ev(this._placeholder, rc)) || undefined}
                    readOnly={(await this.isReadOnly(rc)) || undefined}
                    required={(await this.isRequired(rc)) || undefined}
                    rows={rows ?? undefined}
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                />
            </div>
        );
        return this.wrap(rc, await this.wrapInput(rc, slot, `fi-fo-textarea${autosize ? ' fi-autosizable' : ''}`), { className: 'fi-fo-textarea-wrp' });
    }
}
