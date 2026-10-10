import { Widget } from './Widget';
import { Table } from '../tables/Table';
import { titleCase } from '../core/Resource';

/** Filament\Widgets\TableWidget: a table of records (no search, filters or toolbar unless it asks for them) */
export abstract class TableWidget extends Widget {
    /** `$heading`: the class name in words by default */
    static heading: string | null = null;
    static model: any;

    abstract table(table: Table): Table;

    override async render() {
        const table = new Table();
        table.id = 'table';
        table.livewire = this.livewire;
        table.user = this.user;
        table.model = (this.ctor as typeof TableWidget).model;
        table.heading((this.ctor as typeof TableWidget).heading ?? titleCase(this.ctor.widgetId.replace(/[-_]/g, ' ')));
        table.headingTag('h2');
        this.table(table);
        return this.root('fi-wi-table', await table.render({ pathname: this.livewire?.pathname ?? '', searchParams: {}, user: this.user }));
    }
}
