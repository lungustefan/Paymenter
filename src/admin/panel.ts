import { registerCore } from './core/registry';
import { Dashboard } from './pages/Dashboard';
import { CurrencyResource } from './resources/CurrencyResource';
import { ApiResource } from './resources/ApiResource';
import { CustomPropertyResource } from './resources/CustomPropertyResource';
import { EmailLogResource, ErrorLogResource, FailedJobResource, HttpLogResource } from './resources/LogResources';
import { ExtensionResource, ExtensionsCluster, GatewayResource, ServerResource } from './resources/ExtensionResources';
import { NotificationTemplateResource } from './resources/NotificationTemplateResource';
import { CouponResource } from './resources/CouponResource';
import { ConfigOptionResource } from './resources/ConfigOptionResource';
import { CategoryResource } from './resources/CategoryResource';
import { ProductResource } from './resources/ProductResource';
import { RoleResource } from './resources/RoleResource';
import { TaxRateResource } from './resources/TaxRateResource';

/** Everything the admin panel is made of (the contents of `app/Admin`). */
let registered = false;
export function registerPanel() {
    if (registered) return;
    registered = true;
    registerCore({ pages: [Dashboard], clusters: [ExtensionsCluster], resources: [CategoryResource, ProductResource, ConfigOptionResource, CouponResource, NotificationTemplateResource, ExtensionResource, GatewayResource, ServerResource, ApiResource, CurrencyResource, CustomPropertyResource, EmailLogResource, ErrorLogResource, FailedJobResource, HttpLogResource, RoleResource, TaxRateResource] });
}
registerPanel();
