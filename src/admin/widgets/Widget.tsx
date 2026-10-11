import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { User } from '@/server/models/User';
import { SchemaGrid } from '../forms/Schema';
import { WidgetPoll } from './client';
import { cn } from '@themes/default/components/cn';

/**
 * Port of Filament\Widgets\Widget: a block of a page (a stat, a chart, a table, or a view of its own).
 * `render()` returns the markup of the widget, whose root element is its cell in the widget grid.
 */
export abstract class Widget {
    /** the id of the widget in `widget` ops (class names do not survive minification) */
    static widgetId: string;
    static sort: number | null = null;
    static isLazy = true;
    /** `$columnSpan`: how many columns of the widget grid the widget takes */
    static columnSpan: number | 'full' = 1;
    /** `$pollingInterval` of the widget: `'20s'`, `'10m'` or `null` */
    static pollingInterval: string | null = null;
    /** `canView()` */
    static canView(user: User): boolean | Promise<boolean> {
        void user;
        return true;
    }

    /** the record of the page the widget is on (`$record`) */
    record: any = null;
    user!: User;
    livewire: any = null;

    abstract render(): Promise<ReactNode> | ReactNode;

    /** a method the browser calls through a `widget` op (chart filters) */
    async callMethod(_method: string, _args: any[]): Promise<any> {
        return null;
    }

    get ctor() {
        return this.constructor as typeof Widget;
    }

    /** the root element of a Filament widget: its cell of the widget grid (`fi-wi-widget fi-grid-col ...`) */
    protected root(className: string | null, children: ReactNode): ReactNode {
        const span = this.ctor.columnSpan === 'full' ? '1 / -1' : `span ${this.ctor.columnSpan} / span ${this.ctor.columnSpan}`;
        return (
            <div style={{ ['--col-span-lg' as any]: span } as CSSProperties} className={cn('fi-wi-widget fi-grid-col lg:fi-grid-col-span', className)}>
                {this.ctor.pollingInterval && <WidgetPoll interval={this.ctor.pollingInterval} />}
                {children}
            </div>
        );
    }
}

export type WidgetClass = (new () => Widget) & typeof Widget;

/**
 * `<x-filament-widgets::widgets>`: the widgets of a page in a grid (`schemaKey: 'headerWidgets'`), inside the
 * page content. `columns` is the number of columns of the grid on large screens.
 */
export async function renderWidgets(widgets: WidgetClass[], page: { record?: any; user: User; livewire?: any }, columns = 2): Promise<ReactNode> {
    const nodes: ReactNode[] = [];
    const sorted = widgets.map((w, i) => ({ w, i })).sort((a, b) => (a.w.sort ?? -1) - (b.w.sort ?? -1) || a.i - b.i).map((x) => x.w);
    for (const [index, Class] of sorted.entries()) {
        if (!(await Class.canView(page.user))) continue;
        const widget = new Class();
        widget.record = page.record ?? null;
        widget.user = page.user;
        widget.livewire = page.livewire ?? null;
        nodes.push(<Fragment key={index}>{await widget.render()}</Fragment>);
    }
    if (nodes.length === 0) return null;
    return (
        <SchemaGrid columns={{ default: 1 }}>
            <div className="fi-grid-col" style={{ ['--col-span-default' as any]: 'span 1 / span 1' }}>
                <div className="fi-sc-component">
                    <div>
                        <SchemaGrid columns={{ default: 1, lg: columns }}>{nodes}</SchemaGrid>
                    </div>
                </div>
            </div>
        </SchemaGrid>
    );
}
