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
        cart: () => import('./views/Cart'),
        'auth.login': () => import('./views/auth/Login'),
        'auth.register': () => import('./views/auth/Register'),
        'auth.2fa': () => import('./views/auth/Tfa'),
        'auth.verify-email': () => import('./views/auth/VerifyEmail'),
        'auth.password.request': () => import('./views/auth/PasswordRequest'),
        'auth.password.reset': () => import('./views/auth/PasswordReset'),
    },
};

export const { name, author, url, settings, views } = module;
export { Head, AppLayout };
