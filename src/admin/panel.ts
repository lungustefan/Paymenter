import { registerCore } from './core/registry';
import { Dashboard } from './pages/Dashboard';
import { CurrencyResource } from './resources/CurrencyResource';

/** Everything the admin panel is made of (the contents of `app/Admin`). */
let registered = false;
export function registerPanel() {
    if (registered) return;
    registered = true;
    registerCore({ pages: [Dashboard], resources: [CurrencyResource] });
}
registerPanel();
