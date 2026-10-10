import type { ReactNode } from 'react';
import { Widget } from './Widget';
import { StatChart } from './client';
import { Icon } from '../ui/Icon';
import { adminContext } from '../context';

type Color = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'gray';

/** `Number::format()`: up to 3 fraction digits with the thousands separators of the locale */
const formatNumber = (value: number) => new Intl.NumberFormat(adminContext().locale || 'en', { maximumFractionDigits: 3 }).format(value);

/** Filament\Widgets\StatsOverviewWidget\Stat */
export class Stat {
    private _description: ReactNode = null;
    private _descriptionIcon: string | null = null;
    private _descriptionColor: Color | null = null;
    private _color: Color = 'gray';
    private _chart: Array<number | string> | null = null;

    constructor(
        public label: string,
        public value: string | number | null,
    ) {}

    static make(label: string, value: string | number | null) {
        return new Stat(label, value);
    }

    description(v: ReactNode) { this._description = v; return this; }
    descriptionIcon(v: string | null) { this._descriptionIcon = v; return this; }
    descriptionColor(v: Color | null) { this._descriptionColor = v; return this; }
    color(v: Color) { this._color = v; return this; }
    chart(v: Array<number | string> | null) { this._chart = v; return this; }

    render(): ReactNode {
        const value = typeof this.value === 'number' || (typeof this.value === 'string' && this.value.trim() !== '' && !Number.isNaN(Number(this.value))) ? formatNumber(Number(this.value)) : this.value;
        const descriptionColor = this._descriptionColor ?? this._color;
        return (
            <div className="fi-wi-stats-overview-stat">
                <div className="fi-wi-stats-overview-stat-content">
                    <div className="fi-wi-stats-overview-stat-label-ctn">
                        <span className="fi-wi-stats-overview-stat-label">{this.label}</span>
                    </div>
                    <div className="fi-wi-stats-overview-stat-value">{value}</div>
                    {this._description !== null && this._description !== '' && (
                        <div className={`fi-color fi-color-${descriptionColor} fi-text-color-700 dark:fi-text-color-400 fi-wi-stats-overview-stat-description`}>
                            <span>{this._description}</span>
                            {this._descriptionIcon && <Icon icon={this._descriptionIcon} size="md" />}
                        </div>
                    )}
                </div>
                {this._chart && <StatChart color={this._color} values={this._chart} />}
            </div>
        );
    }
}

/** Filament\Widgets\StatsOverviewWidget: a row of figures with an optional description and sparkline */
export abstract class StatsOverviewWidget extends Widget {
    static override columnSpan = 'full' as const;

    abstract getStats(): Promise<Stat[]> | Stat[];

    /** `getColumns()`: three, or four when the stats do not fill rows of three */
    protected columns(count: number) {
        if (count < 3) return 3;
        return count % 3 !== 1 ? 3 : 4;
    }

    override async render() {
        const stats = await this.getStats();
        const columns = this.columns(stats.length);
        const grid = { ['--cols-cxl' as any]: `repeat(${columns}, minmax(0, 1fr))`, ['--cols-nclg' as any]: `repeat(${columns}, minmax(0, 1fr))`, ['--cols-default' as any]: 'repeat(1, minmax(0, 1fr))' };
        return this.root(
            'fi-wi-stats-overview',
            <div className="fi-grid fi-sc fi-sc-has-gap" style={{ ['--cols-default' as any]: 'repeat(1, minmax(0, 1fr))' }}>
                <div className="fi-grid-col" style={{ ['--col-span-default' as any]: 'span 1 / span 1' }}>
                    <div className="fi-sc-component fi-grid-ctn">
                        <div className="fi-sc-section">
                            <section className="fi-section fi-section-not-contained">
                                <div className="fi-section-content-ctn">
                                    <div className="fi-section-content fi-grid @xl:fi-grid-cols !@lg:fi-grid-cols fi-sc fi-sc-has-gap" style={grid}>
                                        {stats.map((stat, i) => (
                                            <div key={i} className="fi-grid-col" style={{ ['--col-span-default' as any]: 'span 1 / span 1' }}>
                                                <div className="fi-sc-component">{stat.render()}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>,
        );
    }
}
