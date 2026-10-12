import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { User } from '@/server/models/User';
import { SchemaGrid } from '../forms/Schema';
import { WidgetListener, WidgetPoll } from './client';
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
    /** `#[On('event')]`: browser event -> method of the widget, called with the parameters of the event */
    static listeners: Record<string, string> = {};
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

    private events: Array<{ name: string; params: Record<string, unknown> }> = [];

    /** a method the browser calls through a `widget` op (chart filters, `event`) */
    async callMethod(method: string, args: any[]): Promise<any> {
        // a browser event the widget listens to: handle it, then render the widget again
        if (method === 'event') {
            const listener = this.ctor.listeners[args[0]];
            if (!listener || typeof (this as any)[listener] !== 'function') return null;
            await (this as any)[listener](args[1] ?? {});
            return this.render();
        }
        return null;
    }

    /** `$this->dispatch()`: a browser event the other widgets of the page can listen to */
    protected dispatch(name: string, params: Record<string, unknown> = {}) {
        this.events.push({ name, params });
    }

    /** the events dispatched while handling a call */
    dispatchedEvents() {
        return this.events;
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
        const events = Object.keys(Class.listeners);
        const node = await widget.render();
        nodes.push(
            <Fragment key={index}>
                {events.length ? (
                    <WidgetListener widget={Class.widgetId} events={events}>
                        {node}
                    </WidgetListener>
                ) : (
                    node
                )}
            </Fragment>,
        );
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
