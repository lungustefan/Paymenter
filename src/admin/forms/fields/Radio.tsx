import type { ReactNode } from 'react';
import { Field } from '../Field';
import { getPath, type RenderContext } from '../Component';
import { RadioControl } from '../controls-list';
import { normalizeOptions, type OptionsInput } from './Select';
import type { Fn } from '../../core/evaluate';
import { gridProps } from '../../ui/grid';
import { trans } from '../../context';
import type { Rule } from '@/server/validation';
import { cn } from '@themes/default/components/cn';

/** Filament\Forms\Components\Radio */
export class Radio extends Field {
    protected _options: Fn<OptionsInput | null> = [];
    protected _descriptions: Fn<Record<string, string>> = {};
    protected _inline: Fn<boolean> = false;
    protected _gridDirection: 'row' | 'col' = 'col';
    protected _disableOptionWhen?: (value: string, label: string) => boolean;

    options(v: Fn<OptionsInput | null>) { this._options = v; return this; }
    descriptions(v: Fn<Record<string, string>>) { this._descriptions = v; return this; }
    inline(v: Fn<boolean> = true) { this._inline = v; return this; }
    gridDirection(v: 'row' | 'col') { this._gridDirection = v; return this; }
    disableOptionWhen(fn: (value: string, label: string) => boolean) { this._disableOptionWhen = fn; return this; }
    boolean(trueLabel?: string, falseLabel?: string) {
        this._options = [['1', trueLabel ?? trans('filament-forms::components.radio.boolean.true')], ['0', falseLabel ?? trans('filament-forms::components.radio.boolean.false')]];
        return this;
    }

    private async pairs(rc: RenderContext) {
        return normalizeOptions(await this.ev(this._options, rc)).flatMap((e) => ('group' in e ? e.options : [e]));
    }

    protected override async implicitRules(rc: RenderContext): Promise<Rule[]> {
        const state = getPath(rc.state, this.getStatePath(rc));
        if (state === null || state === undefined || state === '') return [];
        const known = new Set((await this.pairs(rc)).filter((o) => !this._disableOptionWhen?.(o.value, o.label)).map((o) => o.value));
        return known.has(String(state)) ? [] : [(_v, fail) => fail(trans('validation.in', {}))];
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const inline = (await this.ev(this._inline, rc)) === true;
        const descriptions = (await this.ev(this._descriptions, rc)) ?? {};
        const grid = inline ? { className: '', style: {} } : gridProps((this.getColumns() as any) ?? undefined, this._gridDirection);
        const options = (await this.pairs(rc)).map((o) => ({ value: o.value, label: o.label, description: descriptions[o.value], disabled: this._disableOptionWhen?.(o.value, o.label) || undefined }));
        const control = (
            <div aria-labelledby={`${id}-label`} role="radiogroup" className={cn(grid.className, 'fi-fo-radio', inline && 'fi-inline')} style={grid.style}>
                <RadioControl path={path} id={id} options={options} disabled={await this.isDisabled(rc)} live={this._live} autoFocus={this._autofocus || undefined} />
            </div>
        );
        return this.wrap(rc, control, { labelTag: 'div' });
    }
}
