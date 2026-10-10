import type { ReactNode } from 'react';
import { Field } from '../Field';
import { getPath, setPath, type RenderContext } from '../Component';
import { truthy } from '@/server/lib/php';
import { CheckboxControl } from '../controls';
import type { Fn } from '../../core/evaluate';

/** Filament\Forms\Components\Checkbox */
export class Checkbox extends Field {
    protected _inline: Fn<boolean> = true;
    inline(v: Fn<boolean> = true) { this._inline = v; return this; }

    protected override emptyState(_rc: RenderContext) {
        return false;
    }

    /** `BooleanStateCast`: the state is a boolean (`1` -> `true`) */
    override async runAfterStateHydrated(rc: RenderContext): Promise<void> {
        await super.runAfterStateHydrated(rc);
        const path = this.getStatePath(rc);
        setPath(rc.state, path, truthy(getPath(rc.state, path)));
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const path = this.getStatePath(rc);
        const id = `${rc.formId}.${path}`;
        const input = (
            <CheckboxControl path={path} live={this._live} id={id} disabled={(await this.isDisabled(rc)) || undefined} required={((await this.isRequired(rc)) && !this.isConcealed()) || undefined} autoFocus={this._autofocus || undefined} className="fi-checkbox-input" />
        );
        if ((await this.ev(this._inline, rc)) !== false) return this.wrap(rc, null, { labelPrefix: input, verticalAlign: 'center' });
        return this.wrap(rc, input, { verticalAlign: 'center' });
    }
}
