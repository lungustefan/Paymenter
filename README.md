<br>
<p align="center">
  <a href="https://paymenter.org">
    <picture>
      <source media="(max-width: 768px)" srcset="https://paymenter.org/iso.svg" width="65px">
      <source media="(prefers-color-scheme: dark)" srcset="https://paymenter.org/iso.svg" width="80px">
      <source media="(prefers-color-scheme: light)" srcset="https://paymenter.org/iso.svg" width="80px">
      <img alt="Paymenter Isotype" src="https://paymenter.org/iso.svg">
    </picture>
  </a>
</p>
<h1 align="center">
  Paymenter
</h1>

<div align="center">
  <h3>Open-Source Billing, Built for Hosting</h3>
  <p>Automate subscriptions, eliminate billing chaos, and grow your hosting business – without vendor lock-ins or hidden costs.</p>
</div>

<h4 align="center">
  <a href="https://paymenter.org">Website</a> ·
  <a href="https://paymenter.org/docs/installation/install">Documentation</a> ·
  <a href="https://demo.paymenter.org">Live Demo</a> ·
  <a href="https://paymenter.org/marketplace">Extensions</a>
</h4>

 <div align="center">
   
  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Paymenter/paymenter/blob/master/LICENSE)
  [![Downloads](https://img.shields.io/github/downloads/lungustefan/Paymenter/total)]()
  [![GitHub release (latest by date)](https://img.shields.io/github/v/release/lungustefan/Paymenter)](https://github.com/lungustefan/Paymenter/releases)
    <br>
    <br>
  [![Discord](https://img.shields.io/discord/882318291014651924?logo=discord&labelColor=white&color=5865f2)](https://discord.gg/paymenter-882318291014651924)
  
</div>

<div align="center">
    <picture>
      <source media="(max-width: 768px)" srcset="https://upload.wikimedia.org/wikipedia/commons/c/ca/1x1.png">
      <source media="(prefers-color-scheme: dark)" srcset="https://paymenter.org/landing/screenshots/dark/dashboard.webp">
      <source media="(prefers-color-scheme: light)" srcset="https://paymenter.org/landing/screenshots/light/dashboard.webp">
      <img alt="Paymenter Dashboard" src="https://paymenter.org/landing/screenshots/dark/dashboard.webp">
    </picture>
    <br>
</div>

## Getting Started

> **This is an independent Next.js / TypeScript rewrite of Paymenter, maintained in [lungustefan/Paymenter](https://github.com/lungustefan/Paymenter). It is a separate project from the official [Paymenter](https://github.com/Paymenter/Paymenter) and is not affiliated with or supported by its authors; install it from this repository, not from theirs.** The rewrite is based on the Laravel (PHP) version 1.5.9 that keeps the database schema, the settings, the REST API and the look of the default theme. Read [Differences from the Laravel version](#differences-from-the-laravel-version) before upgrading an existing installation.

#### Quick install (TL;DR)

Needs Node.js 22+, pnpm and an empty MariaDB/MySQL database.

```bash
git clone https://github.com/lungustefan/Paymenter.git paymenter && cd paymenter
pnpm install
cp .env.example .env                 # edit DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD, APP_URL (and CACHE_STORE=file if you have no Redis)
pnpm paymenter key:generate
pnpm paymenter migrate --seed
pnpm paymenter app:init              # basic setup
pnpm paymenter app:user:create       # your first admin user
pnpm build && pnpm start             # http://localhost:3000  (admin at /admin)
pnpm worker                          # in a second terminal: queue worker + scheduler (required for emails, invoices, provisioning)
```

Prefer Docker? See [Docker](#docker). More detail below.

#### Installation & Documentation

For a detailed explanation of how to install and configure Paymenter, take a look at our [documentation here](https://paymenter.org/docs/getting-started/introduction/). The documentation still describes the PHP installation; the steps below are the ones that apply to this edition.

Or, get additional help via [Community Discord](https://discord.gg/xB4UUT3XQg).

#### Requirements

- Node.js 22 or higher
- A package manager: [pnpm](https://pnpm.io) (primary, recommended), npm or Yarn
- Database (MariaDB 11+ or MySQL 8+)
- Redis (optional, recommended for the cache; the queue lives in the database)
- A reverse proxy (Nginx, Caddy, Apache...) in front of the Node.js process for HTTPS

#### Installation

```bash
# 1. Get the code: a release archive (contains a pre-built app; the files are not in a sub folder, so extract into an empty folder)
#    Pick the newest release on https://github.com/lungustefan/Paymenter/releases (the "latest" link ignores pre-releases)
mkdir paymenter && cd paymenter
curl -L https://github.com/lungustefan/Paymenter/releases/download/<tag, e.g. v2.0.0-alpha.4>/paymenter.tar.gz | tar -xz
# or: git clone https://github.com/lungustefan/Paymenter.git paymenter && cd paymenter

# 2. Install the dependencies
pnpm install            # npm install / yarn install work as well

# 3. Configure the environment
cp .env.example .env    # then set DB_*, APP_URL in .env; without Redis set CACHE_STORE=file (the example defaults to redis)
pnpm paymenter key:generate

# 4. Create the database tables and the default data
pnpm paymenter migrate --seed

# 5. Basic setup and your first admin user
pnpm paymenter app:init
pnpm paymenter app:user:create

# 6. Build (not needed for a release archive, it ships pre-built) and start
pnpm build
pnpm start              # http://localhost:3000, set PORT=... to change the port
```

With npm, pass arguments to the CLI after `--`: `npm run paymenter -- migrate --seed`. With Yarn: `yarn paymenter migrate --seed`.

Point your reverse proxy at `http://127.0.0.1:3000` (forward `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`). Uploaded files live in `storage/app/public` and are served by the app itself at `/storage/*`, no symlink or web server alias is needed.

#### Queue worker and scheduler

Invoices, emails, server provisioning and the cronjob run in a separate process. Keep it running next to the web server:

```bash
pnpm worker             # queue worker + the scheduler (replaces `queue:work` and the `schedule:run` cron entry)
```

Example systemd units (adjust paths and user):

```ini
# /etc/systemd/system/paymenter.service
[Service]
WorkingDirectory=/var/www/paymenter
ExecStart=/usr/bin/pnpm start
Restart=always
User=www-data

# /etc/systemd/system/paymenter-worker.service
[Service]
WorkingDirectory=/var/www/paymenter
ExecStart=/usr/bin/pnpm worker
Restart=always
User=www-data
```

If you prefer cron, `* * * * * cd /var/www/paymenter && pnpm paymenter schedule:run` runs the scheduler and `pnpm paymenter queue:work` runs a queue worker.

#### Docker

```bash
cp docker-compose.example.yml docker-compose.yml   # set the passwords, then:
docker compose up -d
```

The image (`ghcr.io/lungustefan/paymenter`) is built from the `Dockerfile` (Node 22, multi-stage). It serves the panel on port **80** and runs the worker next to it (both supervised by supervisord). On start the entrypoint generates an `APP_KEY` (stored in `./.env` on the host when none exists), waits for the database, renews the bundled themes and extensions (set `PAYMENTER_SKIP_DEFAULT=true` to keep your changes) and runs `migrate --seed`. MariaDB and Redis are part of the compose file; `./themes`, `./extensions`, `./storage` and `./storage/public` are mounted volumes.

Themes and extensions are compiled into the app. If the mounted `themes/` or `extensions/` differ from what the image was built with, the container rebuilds the app on start (this takes a few minutes the first time). Run commands inside the container with `docker compose exec paymenter pnpm paymenter app:user:create`.

Once the containers are up, set the URL the panel is served at (the `app_url` setting in the database overrides `APP_URL`, its default is `http://localhost`, so without this every redirect, e.g. to the login page, points to port 80 of localhost): `docker compose exec -u node paymenter pnpm paymenter app:init "My Company" https://billing.example.com`. Then create your first admin user: `docker compose exec -u node paymenter pnpm paymenter app:user:create` (it asks for the name, email, password and role; role `1` is the admin role), then open `/admin`. Your `.env` (with the `APP_KEY`), `./storage` (ticket attachments, logs, uploads in `./storage/public`) and the database in `./database` live next to `docker-compose.yml`: back them up together, the `APP_KEY` is needed to read encrypted settings.

The image is published when a release is published (`:latest` only for stable releases, pre-releases like `v2.0.0-alpha.N` get just their tag; use `image: ghcr.io/lungustefan/paymenter:v2.0.0-alpha.N` until the first stable release) and by hand as `:master` (see `docker-compose.beta.yml`). It was built and run end to end with this compose file: restarts and re-creating the container keep the key, the data and the uploads, and the migrations are idempotent.

#### Updating

```bash
cd /var/www/paymenter
bash update.sh          # or: pnpm paymenter app:upgrade
```

`update.sh` downloads the newest release archive (pre-releases included, looked up through the GitHub API; pass `--version=v2.0.0-alpha.4` or `--url=<archive url>` to choose one), keeps your `.env`, `storage/`, `extensions/` and `themes/`, installs the dependencies with the package manager it detects (pnpm, npm or yarn; force one with `--package-manager=pnpm`), runs `paymenter migrate --seed`, rebuilds only when you have custom themes/extensions and finally clears the cache. Restart the web process and the worker afterwards. It refuses to upgrade Paymenter V0 installations (see the [V0 migration guide](https://paymenter.org/docs/guides/v0-migration)). With Docker, pull the new image: `docker compose pull && docker compose up -d`.

#### Upgrading from the Laravel (PHP) version 1.5.x

The `update.sh` that ships with the PHP release points at the official PHP project, so do not use it. Back up the database and the install folder first, then download this edition's script into the existing install and run it (Node.js >= 22 and pnpm or npm are required; you can drop PHP and Composer afterwards):

```bash
cd /var/www/paymenter
curl -fsSL -o update.sh https://raw.githubusercontent.com/lungustefan/Paymenter/master/update.sh
bash update.sh
```

It removes the PHP sources (`app`, `vendor`, `public/index.php`, ...), keeps `.env`, `storage/`, `extensions/` and `themes/`, migrates the database in place and tells you to restart. Then replace the PHP web server config (nginx/Apache + php-fpm) with a reverse proxy to `pnpm start` (port 3000) and run `pnpm worker` instead of `artisan queue:work`/the cron entry. Read [Differences from the Laravel version](#differences-from-the-laravel-version) first.

#### Development

```bash
pnpm install
cp .env.example .env && pnpm paymenter key:generate   # set DB_* for a local MariaDB
pnpm paymenter migrate --seed
pnpm dev                # http://localhost:3000 (regenerates the theme/extension registry first)
pnpm worker             # in a second terminal, for emails and background jobs
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build (registry, theme stylesheets, Next.js) and server |
| `pnpm worker` | Queue worker + scheduler in one process |
| `pnpm paymenter <command>` | The CLI, `pnpm paymenter list` shows every command (`migrate`, `migrate:status`, `migrate:fresh`, `db:seed`, `key:generate`, `app:user:create`, `app:user:password-reset`, `app:settings:change`, `app:cron-job`, `app:extension:create`, `app:theme:create`, `queue:work`, `schedule:run`...) |
| `pnpm migrate` | Shortcut for `pnpm paymenter migrate` |
| `pnpm registry` | Regenerate the theme/extension registry (done by `dev` and `build`) |
| `pnpm typecheck` | TypeScript check (`pnpm lint` is the same) |
| `pnpm test` | Vitest suite (needs a MariaDB/MySQL database, see below) |

**Tests.** `pnpm test` creates the schema in a dedicated database with the real CLI (`migrate:fresh --seed`) and empties it between tests. The default is database `paymenter_test` on `127.0.0.1:3306` as user `paymenter`/`paymenter`; override with `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` and `TEST_DB_DATABASE`. The database name must contain `test`; the tests refuse to run against anything else.

#### Extensions and themes

Extensions and themes are TypeScript modules that are discovered when the app is built, so **run `pnpm build` (or restart `pnpm dev`) after adding or changing one**.

```
extensions/<Gateways|Servers|Others>/<Name>/
    index.ts(x)      default export: a class extending Gateway, Server or Extension
    admin.ts(x)      optional: admin panel resources/pages
    middleware.ts    optional: runs for every client area request
    views.tsx        optional: pages/widgets rendered with the active theme
    database/migrations/   optional SQL migrations
    resources/lang/<locale>/*.json   optional translations

themes/<name>/
    theme.ts         name, author and the theme settings
    index.ts         layout + page views (see themes/default)
    css/app.css, admin/theme.css, views/, components/, layouts/
    lang/<locale>/<group>.json   optional translations (namespace = the theme's folder name)
```

**Theme translations.** A theme can ship its own strings in `themes/<name>/lang/<locale>/<group>.json` (same JSON format as `lang/`). While the theme is active they are available under a namespace that equals the theme's folder name: `themes/my-theme/lang/en/theme.json` containing `{"welcome": "Welcome, :name"}` is used as `t('my-theme::theme.welcome', { name })` on the server and `useT().t('my-theme::theme.welcome', { name })` in client components. Missing keys in the current locale fall back to the fallback locale (`en`) and then to the key itself. Namespaces of inactive themes are not loaded. The lang folder is discovered at build time (`pnpm registry`, run by `dev` and `build`), so restart `pnpm dev` after adding one (translations are cached per process, restart after editing them too). `themes/default/lang` is the reference. Note that `app:theme:create` copies the `lang` folder, so rename the namespace in the copied keys to the new theme's name.

Scaffold one with `pnpm paymenter app:extension:create` or `pnpm paymenter app:theme:create`, and look at `extensions/Gateways/Stripe` (gateway), `extensions/Servers/Pterodactyl` (server; see also [docs/proxmox.md](docs/proxmox.md) for the Proxmox VE extension), `extensions/Others/Announcements` (other) and `themes/default` for working examples. Select the active theme under Settings in the admin panel.

#### Differences from the Laravel version

This is a rewrite, not a patch release. Be aware of the following before you upgrade a production installation:

- **PHP themes do not work; PHP extensions run through a bridge.** Blade/Livewire themes (`.blade.php`) cannot be rendered by the React panel and are ignored with a warning. Third-party gateway/server/other extensions in the upstream layout (`extensions/<Type>/<Name>/<Name>.php`) run in a PHP CLI worker with a small Laravel compatibility shim when `php` (>= 8.1) is installed: config forms, server and gateway hooks, routes/webhooks and event listeners work; Blade views, Livewire, Filament resources and PHP migrations do not. They run with the panel's OS permissions, so only install trusted code. See [docs/php-extensions.md](docs/php-extensions.md) and `pnpm paymenter php:doctor`. The bundled gateways, servers and extensions are ported to TypeScript and need no PHP (Stripe and PayPal stay TypeScript). PHP is not installed in the Docker image by default and is not required by the release archive: install `php-cli` separately (on the host, or build the image with `--build-arg INSTALL_PHP=true`; `PHP_BIN` can point at another binary) to use PHP extensions, and check it with `pnpm paymenter php:doctor`. `php-bridge/` itself ships in both. The old function-style extensions of the archived Paymenter/Extensions repository (`<Name>/index.php` with `Name_pay()`, `Name_createServer()` ...) are **not** loadable (all 16 gateways/servers of that repository were tried); only class-based v1.5.x extensions are. See the compatibility table in docs/php-extensions.md; treat the bridge as experimental.
- **Everyone has to log in again.** Sessions are stored differently (the PHP session files/rows are not read), so every user is logged out after the upgrade. The cart cookie and the "remember me" cookie use the same ULID/encryption scheme as the PHP version and are meant to keep working with the same `APP_KEY`, but treat that as best effort.
- **Drain the queue before upgrading.** Jobs queued by the PHP version (Redis or database) use PHP serialization and cannot be processed by the Node.js worker. Let the old `queue:work` finish its jobs first (or clear the queue); the new queue always uses the `jobs` table, whatever `QUEUE_CONNECTION` says (`sync` still runs jobs inline).
- **PHP-issued OAuth refresh tokens are not accepted.** Applications using the OAuth2 provider (Passport in the PHP version) have to sign in again to obtain new tokens. API keys live in the same table and are unaffected.
- **Same database.** The tables and migration names are unchanged, so an existing database is adopted in place by `pnpm paymenter migrate`. Take a backup before running it.
- **Same `.env` names** (`APP_KEY`, `DB_*`, `CACHE_STORE`, `REDIS_*`...). PHP-only variables (`REDIS_CLIENT`, `LOG_*`, `BROADCAST_CONNECTION`...) are ignored.
- **No `artisan`, no Composer.** Use `pnpm paymenter <command>`; the command names (`app:cron-job`, `app:user:create`, ...) are the same. Maintenance-mode commands (`down`/`up`) are kept for compatibility but do not block requests.
- **Invoices default to `draft`.** As in upstream Paymenter after 1.5.9, the `invoices.status` column now defaults to `draft` (existing invoices keep their status; the cart, credits, upgrades, renewals and the admin order page still create `pending` invoices). Optional "Immutable Invoices" (Settings > Invoices) makes published invoices read-only; changes then go through credit/debit notes (Adjustment Notes) and refunds. Invoices of deleted users stay (`user_id` becomes `NULL`), drafts are not shown to clients (a deviation from upstream). Gateway refunds go through `supportsRefunds()`/`refund()` of the gateway extension; they were only verified against a mocked gateway, not against the live Stripe/PayPal/Mollie APIs. "Refund locally" only records the refund in the panel. The extension Updates page shows "Unknown" when the marketplace cannot be reached (offline).
- **Admin panel.** The Filament admin panel was re-implemented on top of the same stylesheets; a few pages behave differently (for example an authenticated non-admin gets a 404 instead of a 403 on `/admin`).

## What is Paymenter?

Paymenter is an open-source billing platform tailored for hosting companies. It simplifies the management of hosting services, providing a seamless experience for both providers and customers. Built on modern web technologies, Paymenter offers a flexible and robust solution for your hosting business needs.

### Key Features:
- User-Friendly Interface: Paymenter is designed with simplicity in mind, ensuring an intuitive experience for users of all technical levels.
- Open Source and Extensible: As an open-source platform, Paymenter encourages community contributions and customization. Its architecture allows for extensive modifications and integration with other tools.
- Efficient Management: Streamline your operations with Paymenter powerful admin panel, designed to enhance productivity and reduce overhead.
- Secure and Reliable: Built with security as a priority, Paymenter ensures the protection of your data and transactions.
- Community Driven: Join an engaged community of developers and hosting providers to collaborate and drive the future development of Paymenter.

Paymenter is available under the MIT license, offering you the freedom to adapt and evolve the platform to meet your specific requirements.

## Sponsors

Thanks to all sponsors for helping fund Paymenter's development. [Interested in becoming a sponsor?](https://github.com/sponsors/Paymenter)


<a href="https://www.kuroit.com/?rel=paymenter">
  <img src="https://github.com/user-attachments/assets/8d00b4bb-a66c-449f-94e4-cbb9ea1c0d11" width="400">
</a>

## License

Licensed under the [MIT License](https://github.com/Paymenter/Paymenter/blob/master/LICENSE).
