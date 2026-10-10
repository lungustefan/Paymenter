import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';
import { ToggleControl } from '../controls';
import { Icon } from '../../ui/Icon';
import { colorClass, type FilamentColorName } from '../../ui/colors';
import { cn } from '@themes/default/components/cn';
import type { Fn } from '../../core/evaluate';

/** Filament\Forms\Components\Toggle */
export class Toggle extends Field {
    protected _onColor?: FilamentColorName;
    protected _offColor?: FilamentColorName;
    protected _onIcon?: string;
    protected _offIcon?: string;
    protected _inline: Fn<boolean> = true;

    onColor(v: FilamentColorName) { this._onColor = v; return this; }
    offColor(v: FilamentColorName) { this._offColor = v; return this; }
    onIcon(v: string) { this._onIcon = v; return this; }
    offIcon(v: string) { this._offIcon = v; return this; }
    inline(v: Fn<boolean> = true) { this._inline = v; return this; }

    protected override emptyState(_rc: RenderContext) {
        return false;
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const control = (
            <ToggleControl
                path={path}
                live={this._live}
                id={id}
                disabled={(await this.isDisabled(rc)) || undefined}
                onClass={cn('fi-toggle-on', colorClass('toggle', this._onColor ?? 'primary'))}
                offClass={cn('fi-toggle-off', colorClass('toggle', this._offColor ?? 'gray'))}
                onIcon={this._onIcon ? <Icon icon={this._onIcon} size="xs" /> : undefined}
                offIcon={this._offIcon ? <Icon icon={this._offIcon} size="xs" /> : undefined}
            />
        );
        if ((await this.ev(this._inline, rc)) !== false) {
            return this.wrap(rc, null, { labelPrefix: control, verticalAlign: 'center' });
        }
        return this.wrap(rc, control, { verticalAlign: 'center' });
    }
}
