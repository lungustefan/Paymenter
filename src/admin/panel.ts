import { registerCore } from './core/registry';
import { Dashboard } from './pages/Dashboard';
import { CurrencyResource } from './resources/CurrencyResource';
import { ApiResource } from './resources/ApiResource';
import { CustomPropertyResource } from './resources/CustomPropertyResource';
import { RoleResource } from './resources/RoleResource';
import { TaxRateResource } from './resources/TaxRateResource';

/** Everything the admin panel is made of (the contents of `app/Admin`). */
let registered = false;
export function registerPanel() {
    if (registered) return;
    registered = true;
    registerCore({ pages: [Dashboard], resources: [ApiResource, CurrencyResource, CustomPropertyResource, RoleResource, TaxRateResource] });
}
registerPanel();
