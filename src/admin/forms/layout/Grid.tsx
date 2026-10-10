import type { ReactNode } from 'react';
import { Layout } from './Layout';
import type { RenderContext } from '../Component';

/** Filament\Schemas\Components\Grid */
export class Grid extends Layout {
    static make(columns: number | Record<string, number> | null = 2): Grid {
        const g = new Grid();
        g.columns(columns);
        return g;
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        const inner = await this.renderSchema(rc);
        return (
            <div id={this._id ?? this.getKey() ?? undefined} {...(this._extraAttributes as any)}>
                {inner}
            </div>
        );
    }
}

/** Filament\Schemas\Components\Group: renders its children without a wrapper of its own */
export class Group extends Layout {
    static make(schema: any[] = []): Group {
        const g = new Group();
        g.schema(schema);
        return g;
    }

    override async render(rc: RenderContext): Promise<ReactNode> {
        return <div {...(this._extraAttributes as any)}>{await this.renderSchema(rc)}</div>;
    }
}
