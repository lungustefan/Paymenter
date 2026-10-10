import { AdminPage } from '../core/Page';

export class Dashboard extends AdminPage {
    static slug = '';
    static title = 'Dashboard';
    static navigationIcon = 'ri-function-line';
    static activeNavigationIcon = 'ri-function-fill';
    static navigationSort = -2;

    static override getUrl() {
        return '/admin';
    }

    render() {
        return null;
    }
}
