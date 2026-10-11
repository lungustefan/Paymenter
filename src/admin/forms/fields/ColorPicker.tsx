import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';
import { ColorPickerControl } from '../controls-color';
import { trans } from '../../context';

/** Filament\Forms\Components\ColorPicker */
export class ColorPicker extends Field {
    protected _format: 'hex' | 'hsl' | 'rgb' | 'rgba' = 'hex';
    hex() { this._format = 'hex'; return this; }
    hsl() { this._format = 'hsl'; return this; }
    rgb() { this._format = 'rgb'; return this; }
    rgba() { this._format = 'rgba'; return this; }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const prefix = await this.ev(this._prefix, rc);
        const suffix = await this.ev(this._suffix, rc);
        const hasInlinePrefix = this._inlinePrefix && (!!prefix || !!(await this.ev(this._prefixIcon, rc)));
        const hasInlineSuffix = this._inlineSuffix && (!!suffix || !!(await this.ev(this._suffixIcon, rc)));
        const control = (
            <ColorPickerControl
                path={path}
                id={id}
                format={this._format}
                disabled={(await this.isDisabled(rc)) || undefined}
                required={((await this.isRequired(rc)) && !this.isConcealed()) || undefined}
                placeholder={(await this.ev(this._placeholder, rc)) || undefined}
                className={['fi-input', hasInlinePrefix ? 'fi-input-has-inline-prefix' : '', hasInlineSuffix ? 'fi-input-has-inline-suffix' : ''].filter(Boolean).join(' ')}
                panelLabel={trans('filament-forms::components.color_picker.panel_label')}
                live={this._live}
                autoFocus={this._autofocus || undefined}
            />
        );
        return this.wrap(rc, await this.wrapInput(rc, control, 'fi-fo-color-picker'));
    }
}
