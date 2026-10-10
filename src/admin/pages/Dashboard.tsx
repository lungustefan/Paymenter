import { AdminPage } from '../core/Page';
import { panelWidgets } from '../core/registry';
import { renderWidgets } from '../widgets/Widget';

export class Dashboard extends AdminPage {
    static slug = '';
    static title = 'Dashboard';
    static navigationIcon = 'ri-function-line';
    static activeNavigationIcon = 'ri-function-fill';
    static navigationSort = -2;

    static override getUrl() {
        return '/admin';
    }

    override getWidgetClasses() {
        return panelWidgets();
    }

    /** the widgets of the panel, two columns wide (`Dashboard::getColumns()`) */
    render() {
        return renderWidgets(panelWidgets(), { user: this.user, livewire: this }, 2);
    }
}
