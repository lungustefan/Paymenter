export { Entry } from './Entry';
export { TextEntry } from './TextEntry';
export { ViewEntry, View } from './ViewEntry';
import { TextEntry } from './TextEntry';
import type { Fn } from '../core/evaluate';
import type { ReactNode } from 'react';

/** Filament\Forms\Components\Placeholder (deprecated alias of a TextEntry with `content()`) */
export class Placeholder extends TextEntry {
    content(v: Fn<ReactNode | string | null>) {
        return this.state((ctx: any) => (typeof v === 'function' ? (v as any)(ctx) : v));
    }
}
