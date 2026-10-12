/**
 * Barrel of every model. Importing it registers all classes in the morph map
 * (needed to resolve the polymorphic `*_type` columns that store the original
 * PHP class names, e.g. `App\Models\Service`).
 */
import { registerModel } from '@/server/orm/registry';
import { registerBladeClass, registerBladeStatic } from '@/server/blade';

import { ApiKey } from './ApiKey';
import { Audit } from './Audit';
import { BillingAgreement } from './BillingAgreement';
import { Cart } from './Cart';
import { CartItem } from './CartItem';
import { Category } from './Category';
import { ConfigOption } from './ConfigOption';
import { ConfigOptionProduct } from './ConfigOptionProduct';
import { Coupon } from './Coupon';
import { CouponProduct } from './CouponProduct';
import { Credit } from './Credit';
import { CronStat } from './CronStat';
import { Currency } from './Currency';
import { CustomProperty } from './CustomProperty';
import { DebugLog } from './DebugLog';
import { EmailLog } from './EmailLog';
import { Extension } from './Extension';
import { FailedJob } from './FailedJob';
import { Gateway } from './Gateway';
import { AdjustmentNote } from './AdjustmentNote';
import { Invoice } from './Invoice';
import { InvoiceItem } from './InvoiceItem';
import { InvoiceSnapshot } from './InvoiceSnapshot';
import { InvoiceTransaction } from './InvoiceTransaction';
import { Notification } from './Notification';
import { OauthAccessToken } from './OauthAccessToken';
import { OauthAuthCode } from './OauthAuthCode';
import { OauthClient } from './OauthClient';
import { OauthRefreshToken } from './OauthRefreshToken';
import { NotificationPreference } from './NotificationPreference';
import { NotificationSubscription } from './NotificationSubscription';
import { NotificationTemplate } from './NotificationTemplate';
import { Order } from './Order';
import { Plan } from './Plan';
import { PriceModel } from './Price';
import { Product } from './Product';
import { ProductUpgrade } from './ProductUpgrade';
import { Property } from './Property';
import { Role } from './Role';
import { Server } from './Server';
import { Service } from './Service';
import { ServiceCancellation } from './ServiceCancellation';
import { ServiceConfig } from './ServiceConfig';
import { ServiceUpgrade } from './ServiceUpgrade';
import { Setting } from './Setting';
import { TaxRate } from './TaxRate';
import { Ticket } from './Ticket';
import { TicketMailLog } from './TicketMailLog';
import { TicketMessage } from './TicketMessage';
import { TicketMessageAttachment } from './TicketMessageAttachment';
import { User } from './User';
import { UserAuthenticationLog } from './UserAuthenticationLog';
import { UserSession } from './UserSession';

export const models = {
    AdjustmentNote, ApiKey, Audit, BillingAgreement, Cart, CartItem, Category, ConfigOption, ConfigOptionProduct, Coupon, CouponProduct, Credit,
    CronStat, Currency, CustomProperty, DebugLog, EmailLog, Extension, FailedJob, Gateway, Invoice, InvoiceItem, InvoiceSnapshot,
    InvoiceTransaction, Notification, NotificationPreference, NotificationSubscription, NotificationTemplate, OauthAccessToken,
    OauthAuthCode, OauthClient, OauthRefreshToken, Order, Plan,
    Price: PriceModel, Product, ProductUpgrade, Property, Role, Server, Service, ServiceCancellation, ServiceConfig,
    ServiceUpgrade, Setting, TaxRate, Ticket, TicketMailLog, TicketMessage, TicketMessageAttachment, User,
    UserAuthenticationLog, UserSession,
};

for (const [name, ctor] of Object.entries(models)) {
    registerModel(ctor as any);
    // `Service::class`, `Invoice::class`, ... inside stored templates
    registerBladeClass(name, ctor);
}
registerBladeStatic('Service', {
    STATUS_PENDING: Service.STATUS_PENDING,
    STATUS_ACTIVE: Service.STATUS_ACTIVE,
    STATUS_CANCELLED: Service.STATUS_CANCELLED,
    STATUS_SUSPENDED: Service.STATUS_SUSPENDED,
});
registerBladeStatic('Invoice', {
    STATUS_DRAFT: Invoice.STATUS_DRAFT,
    STATUS_PENDING: Invoice.STATUS_PENDING,
    STATUS_PAID: Invoice.STATUS_PAID,
    STATUS_CANCELLED: Invoice.STATUS_CANCELLED,
});

export {
    AdjustmentNote, ApiKey, Audit, BillingAgreement, Cart, CartItem, Category, ConfigOption, ConfigOptionProduct, Coupon, CouponProduct, Credit,
    CronStat, Currency, CustomProperty, DebugLog, EmailLog, Extension, FailedJob, Gateway, Invoice, InvoiceItem, InvoiceSnapshot,
    InvoiceTransaction, Notification, NotificationPreference, NotificationSubscription, NotificationTemplate, OauthAccessToken,
    OauthAuthCode, OauthClient, OauthRefreshToken, Order, Plan,
    PriceModel, Product, ProductUpgrade, Property, Role, Server, Service, ServiceCancellation, ServiceConfig, ServiceUpgrade,
    Setting, TaxRate, Ticket, TicketMailLog, TicketMessage, TicketMessageAttachment, User, UserAuthenticationLog, UserSession,
};
