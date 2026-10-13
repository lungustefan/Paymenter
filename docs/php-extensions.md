# PHP extensions and themes (compatibility)

The Node.js panel can run **gateway, server and "other" extensions written for the Laravel version (v1.5.x)** through a PHP bridge. It cannot render **Blade/Livewire themes**. This page says exactly what works.

## How it works

* `extensions/{Gateways,Servers,Others}/<Name>/<Name>.php` (upstream layout, namespace `Paymenter\Extensions\<Type>\<Name>`) without a TypeScript `index.ts` is a PHP extension. It is found at **runtime**: no rebuild, a restart is enough.
* The panel starts one long-lived `php php-bridge/bridge.php extensions/` worker (JSON lines over stdio) the first time a PHP extension is used. `php-bridge/shim.php` provides the part of Laravel extensions use. The worker calls back into the panel for HTTP, settings, cache, routes, payments and events, so the HTTP client, the debug log and the settings are the panel's own.
* PHP extensions appear in Admin > Extensions (Others), in the gateway and server type selects, with a `[PHP bridge]` tag, their `#[ExtensionMeta]`, and a list of parts that cannot run. `pnpm paymenter php:doctor` prints the same diagnostics.
* A TypeScript extension with the same name always wins (the bundled ports shadow the bundled PHP ones).

Requirements: PHP CLI >= 8.1 (`PHP_BIN` overrides the binary; `PHP_EXTENSIONS=false` disables the bridge; `PHP_BRIDGE_TIMEOUT_MS` sets the per-call timeout, default 60 s; `PAYMENTER_EXTENSIONS_DIR` points the bridge at another folder). Without PHP the panel works as before; PHP extensions are listed with the reason ("PHP CLI not found...") and fail with that message when used.

## Supported

| Area | Status |
| --- | --- |
| `getConfig()` / `getProductConfig()` / `getCheckoutConfig()` field arrays | yes, passed to the admin form DSL (same shape as Filament `FilamentInput`; `HtmlString` hints become `hintHtml`) |
| Server hooks: `createServer`, `suspendServer`, `unsuspendServer`, `terminateServer`, `upgradeServer`, `getActions`, `getView` (data), `testConfig`, `installed/uninstalled/upgraded` | yes |
| Gateway hooks: `pay`, `canUseGateway`, `supportsBillingAgreements`, `createBillingAgreement`, `cancelBillingAgreement`, `charge`, `cancelSubscription`, webhooks | yes |
| `boot()` + `routes.php` (`Route::get/post/...`, `->name()`, `->middleware('auth')`, groups); controller or closure; returns string, array, `response()->json()`, `redirect()`, `abort()` | yes |
| `Event::listen(...)` for panel events (`App\Events\...`), listener closures/classes | yes |
| `Http`, `Cache`, `Log`, `Config`, `URL`, `Auth::user()`, `route()`, `config()`, `settings()`, `__()`, `now()`, `collect()`, `Str`, `Arr`, `Carbon` (common methods) | yes |
| `ExtensionHelper::addPayment/addProcessingPayment/addFailedPayment/addPaymentFee/makeBillingAgreement` | yes |
| Models passed to hooks (`Service`, `Invoice`, `User`, ...) incl. `->user`, `->product`, `->items` and lazy relations, `getChanges()`; `Model::find()` / `where('col', v)->first()/get()` (read-only, equality) | yes |
| `App\Admin\Resources\XResource::getUrl()/getModelLabel()` | yes |
| Raw SQL migrations in `database/migrations/*.sql` | yes (run by the panel, like TS extensions) |

## Not supported (reported, not faked)

* **Blade views / Livewire / Filament resources of an extension.** `view()` returned from `pay()` or a route fails with "returned the Blade view X; Blade views cannot be rendered". Return a redirect URL or HTML instead. Extension admin resources (`Admin/`) and Livewire pages (`Livewire/`) do not appear; port them to `admin.ts` / `pages()` in TypeScript.
* **PHP migrations** (`Schema::create`): not executed. Ship equivalent `.sql` files.
* **Eloquent models owned by the extension, writes through models, `DB::`, queues, mail, notifications, Storage, validation `FormRequest`s, policies, middleware**: the shim does not provide them; using one gives "Class ... not found" / "not supported by the shim" errors naming the missing piece.
* **Themes.** A Blade theme (`views/`, `resources/`, `theme.php`, no `theme.ts`) is ignored and logged at start and by `php:doctor`. Blade templates and Livewire components are server-rendered PHP; the panel renders React. There is no sound way to translate them mechanically.

### Porting a Blade theme

Create `themes/<name>/theme.ts` (config + settings) and `index.tsx` (layout and page views) following `themes/default`. Map each Blade view to a React component with the same name, each `@livewire` component to a server action or client component, `settings()`/`config()` to the theme settings. Copy the CSS (Tailwind classes work as is) and run `node scripts/build-themes.mjs`.

## Compatibility test: archived Paymenter/Extensions repository

The archived `Paymenter/Extensions` repository (deprecated upstream; its extensions ship inside Paymenter since 1.0) was run through the bridge unmodified, copied to a scratch `extensions/` folder, with PHP running as an unprivileged user (`open_basedir` restricted, no secrets, no network: the only HTTP path is the panel's `host('http')` callback). Result: **none of the 16 extensions can be loaded, and the reason is the extension API generation, not a missing shim facade.**

Those extensions are the pre-1.0 (0.x) kind: `<Name>/index.php` containing plain functions (`Mollie_pay($total, $products, $orderId)`, `Pterodactyl_createServer($user, $parameters, $order, $product, $configurableOptions)`, `Name_getConfig()`, `Name_webhook($request)` ...) plus a `routes.php`, no class, no `#[ExtensionMeta]`. They are written against the 0.x data model (`OrderProduct`, `$products` lists, `ExtensionHelper::getConfig('Name', 'key')`, `ExtensionHelper::getCurrency()`, `ExtensionHelper::setOrderProductConfig(...)`, `route('clients.invoice.show', $orderId)`), which no longer exists in 1.5.x and not in this panel's schema. The bridge looks for `<Name>/<Name>.php` with class `Paymenter\Extensions\<Type>\<Name>\<Name>`, so these folders are not found (`php:doctor` now lists them as "LEGACY pre-1.0 function-style extension"). Loading `index.php` inside the shim does work for `getConfig()` (the form arrays), but the hooks fail on the missing `ExtensionHelper::getConfig()` and the 0.x models, and there is no 1.5.x call that maps to `Name_pay($total, $products, $orderId)`. A function-to-class adapter was deliberately not built: it would have to emulate the whole 0.x model.

| Extension | Type | Hooks found | Loads in bridge | Why |
| --- | --- | --- | --- | --- |
| LitePay, Mollie, PayPal, PayPal_IPN, PayU, Stripe, StripeSofort, Xendit | gateway | `getConfig`, `pay`, `webhook` (+ `getUrl`/`success` in some) | no | legacy function style, no class; Stripe/StripeSofort also need the `stripe/stripe-php` SDK (`StripeClient`) which is not part of the bridge |
| CyberPanel, DirectAdmin, ISPConfig, Plesk, Proxmox, Pterodactyl, VirtFusion, Virtualizor | server | `getConfig`, `getProductConfig`, `createServer`, `suspendServer`, `unsuspendServer`, `terminateServer` (+ `getUserConfig`, `getCustomPages`) | no | legacy function style, no class; `ExtensionHelper::getConfig()` and `OrderProduct` missing (0.x model); Proxmox/others render Blade views (`views/*.blade.php`) |

What does work is the class-based v1.5.x format. The bridge test suite (`tests/Unit/PhpBridge.test.ts`) runs unmodified v1.5.9 Pterodactyl, Mollie and PayPal_IPN classes plus a Discord notifier against a local mock HTTP server. To use a 0.x extension, port it to a v1.5.x class (`extends Gateway` / `extends Server`), or use the bundled TypeScript versions of the same gateways and servers.

## Security

PHP extensions run **as the panel's operating system user** with its filesystem, database credentials (`.env`) and network access. They are as trusted as the panel's own code: install only extensions you trust. The bridge only loads files below `extensions/`; extension and function names that reach PHP are validated (`[A-Za-z][A-Za-z0-9_]*`, no `__` magic methods); PHP source is never taken from requests; the HTTP builder methods PHP may use are a whitelist; relation/query access works only on registered models and only reads. Run the panel as an unprivileged user (and consider a container) if you load third-party code.

## Behaviour notes

* Each call builds a fresh extension instance with the saved settings, as Laravel did per request. Listeners registered in `boot()` are re-booted when the saved settings changed.
* Stray `echo`/warnings from PHP go to the panel log (`[php]`), they cannot corrupt the protocol.
* A crashed or hung worker (timeout) is killed and restarted on the next call; booted extensions are re-booted.
* Tests: `tests/Unit/PhpBridge.test.ts` runs the unmodified upstream v1.5.9 Pterodactyl, Mollie and DiscordNotifications extensions (`tests/fixtures/php-extensions`) against a stub HTTP server and asserts the requests are identical to the TypeScript ports.
