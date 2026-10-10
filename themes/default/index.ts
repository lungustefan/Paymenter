import type { ThemeModule } from '@/server/theme-module';
import * as theme from './theme';
import { Head } from './layouts/Head';
import { AppLayout } from './layouts/AppLayout';

/** Default theme: chrome + page views (one lazily loaded module per page). */
const module: ThemeModule = {
    ...theme,
    Head,
    AppLayout,
    views: {
        home: () => import('./views/Home'),
        'products.index': () => import('./views/products/Index'),
        'products.show': () => import('./views/products/Show'),
        'products.checkout': () => import('./views/products/Checkout'),
        'services.show': () => import('./views/services/Show'),
        'services.upgrade': () => import('./views/services/Upgrade'),
        'invoices.show': () => import('./views/invoices/Show'),
        'tickets.show': () => import('./views/tickets/Show'),
        'tickets.create': () => import('./views/tickets/Create'),
        'account.index': () => import('./views/account/Account'),
        'account.security': () => import('./views/account/Security'),
        'account.credits': () => import('./views/account/Credits'),
        'account.payment-methods': () => import('./views/account/PaymentMethods'),
        'account.notifications': () => import('./views/account/Notifications'),
        'errors.404': () => import('./views/errors/NotFound'),
        dashboard: () => import('./views/Dashboard'),
        'services.index': () => import('./views/ServicesIndex'),
        'invoices.index': () => import('./views/InvoicesIndex'),
        'tickets.index': () => import('./views/TicketsIndex'),
        cart: () => import('./views/Cart'),
        'auth.login': () => import('./views/auth/Login'),
        'auth.register': () => import('./views/auth/Register'),
        'auth.2fa': () => import('./views/auth/Tfa'),
        'auth.verify-email': () => import('./views/auth/VerifyEmail'),
        'auth.password.request': () => import('./views/auth/PasswordRequest'),
        'auth.password.reset': () => import('./views/auth/PasswordReset'),
        'vendor.passport.authorize': () => import('./views/vendor/passport/Authorize'),
    },
};

export const { name, author, url, settings, views } = module;
export { Head, AppLayout };
