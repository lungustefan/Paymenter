import { Widget } from './Widget';
import { ChartWithFilter, type ChartData } from './client';
import { trans } from '../context';

/** Filament\Widgets\ChartWidget: a Chart.js chart with an optional filter */
export abstract class ChartWidget extends Widget {
    /** `$heading` */
    static heading: string | null = null;
    /** `$filter`: the filter the widget starts with */
    static defaultFilter: string | null = null;
    static maxHeight: string | null = null;

    abstract getType(): string;
    abstract getData(filter: string | null): Promise<ChartData> | ChartData;
    getFilters(): Record<string, string> | null {
        return null;
    }
    getOptions(): Record<string, any> | null {
        return null;
    }

    override async callMethod(method: string, args: any[]) {
        if (method === 'getData') return this.getData(args[0] ?? null);
        return null;
    }

    override async render() {
        const filters = this.getFilters();
        const filter = (this.ctor as typeof ChartWidget).defaultFilter;
        const data = await this.getData(filter);
        const heading = (this.ctor as typeof ChartWidget).heading;
        return this.root(
            'fi-wi-chart',
            <ChartWithFilter
                widget={this.ctor.widgetId}
                type={this.getType()}
                initial={data}
                options={this.getOptions() ?? {}}
                label={heading ?? ''}
                maxHeight={(this.ctor as typeof ChartWidget).maxHeight}
                filters={filters ? Object.entries(filters).map(([value, label]) => ({ value, label })) : null}
                filter={filter}
                filterLabel={trans('filament-widgets::chart.filter.label')}
                heading={heading}
            />,
        );
    }
}
