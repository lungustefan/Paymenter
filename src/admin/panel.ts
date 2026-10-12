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
import { UserResource } from './resources/UserResource';
import { ServiceCancellationResource, ServiceResource, ServicesCluster } from './resources/ServiceResource';
import { AdjustmentNoteResource, InvoiceCluster, InvoiceResource, InvoiceTransactionResource } from './resources/InvoiceResource';
import { OrderResource } from './resources/OrderResource';
import { TicketResource } from './resources/TicketResource';
import { ActiveUsers, Overview, Revenue, Support } from './widgets/PanelWidgets';
import { OauthClientResource } from './resources/OauthClientResource';
import { AuditResource } from './resources/AuditResource';
import { Settings } from './pages/Settings';
import { Updates } from './pages/Updates';
import { Extension } from './pages/Extension';
import { CronStats } from './pages/CronStats';
import { TaxRateResource } from './resources/TaxRateResource';

/** Everything the admin panel is made of (the contents of `app/Admin`). */
let registered = false;
export function registerPanel() {
    if (registered) return;
    registered = true;
    registerCore({ widgets: [Overview, Revenue, Support, ActiveUsers], pages: [Dashboard, Extension, Settings, Updates, CronStats], clusters: [ExtensionsCluster, ServicesCluster, InvoiceCluster], resources: [OauthClientResource, AuditResource, UserResource, OrderResource, TicketResource, ServiceResource, ServiceCancellationResource, InvoiceResource, InvoiceTransactionResource, AdjustmentNoteResource, CategoryResource, ProductResource, ConfigOptionResource, CouponResource, NotificationTemplateResource, ExtensionResource, GatewayResource, ServerResource, ApiResource, CurrencyResource, CustomPropertyResource, EmailLogResource, ErrorLogResource, FailedJobResource, HttpLogResource, RoleResource, TaxRateResource] });
}
registerPanel();
