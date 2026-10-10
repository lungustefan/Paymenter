import type { ReactNode } from 'react';
import { Field } from '../Field';
import type { RenderContext } from '../Component';

/** Filament\Forms\Components\Hidden: state only, nothing in the DOM */
export class Hidden extends Field {
    override async render(_rc: RenderContext): Promise<ReactNode> {
        return null;
    }
    override async isVisible(_rc: RenderContext): Promise<boolean> {
        return true;
    }
}
