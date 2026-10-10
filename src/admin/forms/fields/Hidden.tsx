import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';

/** Filament\Forms\Components\Hidden: state only; its cell is hidden (`columnSpan(['default' => 'hidden'])`) */
export class Hidden extends Field {
    constructor(key?: string | null) {
        super(key);
        this.columnSpan({ default: 'hidden' });
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        return <input id={`${rc.formId}.${this.getStatePath(rc)}`} type="hidden" className="fi-fo-hidden" />;
    }
    override async isVisible(_rc: RenderContext): Promise<boolean> {
        return true;
    }
}
