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
cp .env.example .env                 # edit DB_HOST, DB_DATABASE, DB_USERNAME, DB_PASSWORD and APP_URL
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
# 1. Get the code: a clone of this repository (or a release archive, which contains a pre-built app)
curl -L https://github.com/paymenter/paymenter/releases/latest/download/paymenter.tar.gz | tar -xz
# or: git clone https://github.com/lungustefan/Paymenter.git paymenter && cd paymenter

# 2. Install the dependencies
pnpm install            # npm install / yarn install work as well

# 3. Configure the environment
cp .env.example .env    # then set DB_*, APP_URL, CACHE_STORE and REDIS_* in .env
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

The image (`ghcr.io/lungustefan/paymenter`) is built from the `Dockerfile` (Node 22, multi-stage). It serves the panel on port **80** and runs the worker next to it (both supervised by supervisord). On start the entrypoint generates an `APP_KEY` (stored in `./.env` on the host when none exists), waits for the database, renews the bundled themes and extensions (set `PAYMENTER_SKIP_DEFAULT=true` to keep your changes) and runs `migrate --seed`. MariaDB and Redis are part of the compose file; `./themes`, `./extensions`, `./storage/logs` and `./storage/public` are mounted volumes.

Themes and extensions are compiled into the app. If the mounted `themes/` or `extensions/` differ from what the image was built with, the container rebuilds the app on start (this takes a few minutes the first time). Run commands inside the container with `docker compose exec paymenter pnpm paymenter app:user:create`.

Note: this image definition was written without access to a Docker daemon, so it has not been built end to end yet; the build steps it runs (`pnpm install`, `pnpm build`, `pnpm start`, `pnpm worker`, `migrate --seed`) were verified outside Docker. Test your first deployment.

#### Updating

```bash
cd /var/www/paymenter
bash update.sh          # or: pnpm paymenter app:upgrade
```

`update.sh` downloads the latest release archive, keeps your `.env`, `storage/`, `extensions/` and `themes/`, installs the dependencies with the package manager it detects (pnpm, npm or yarn; force one with `--package-manager=pnpm`), runs `paymenter migrate --seed`, rebuilds only when you have custom themes/extensions and finally clears the cache. Restart the web process and the worker afterwards. It refuses to upgrade Paymenter V0 installations (see the [V0 migration guide](https://paymenter.org/docs/guides/v0-migration)). With Docker, pull the new image: `docker compose pull && docker compose up -d`.

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
```

Scaffold one with `pnpm paymenter app:extension:create` or `pnpm paymenter app:theme:create`, and look at `extensions/Gateways/Stripe` (gateway), `extensions/Servers/Pterodactyl` (server), `extensions/Others/Announcements` (other) and `themes/default` for working examples. Select the active theme under Settings in the admin panel.

#### Differences from the Laravel version

This is a rewrite, not a patch release. Be aware of the following before you upgrade a production installation:

- **PHP extensions and themes do not work.** Third-party extensions (`.php`, Blade, Livewire, Filament) and themes (`.blade.php`) from the marketplace cannot run on Node.js; they have to be ported to TypeScript/React using the layout above. The bundled gateways (Stripe, PayPal, PayPal IPN, Mollie), servers (cPanel, Convoy, DirectAdmin, Enhance, Plesk, Pterodactyl, Virtfusion, Virtualizor) and the Affiliates, Announcements and Discord Notifications extensions are ported. `update.sh` leaves old PHP extension folders in place, but they are ignored.
- **Everyone has to log in again.** Sessions are stored differently (the PHP session files/rows are not read), so every user is logged out after the upgrade. The cart cookie and the "remember me" cookie use the same ULID/encryption scheme as the PHP version and are meant to keep working with the same `APP_KEY`, but treat that as best effort.
- **Drain the queue before upgrading.** Jobs queued by the PHP version (Redis or database) use PHP serialization and cannot be processed by the Node.js worker. Let the old `queue:work` finish its jobs first (or clear the queue); the new queue always uses the `jobs` table, whatever `QUEUE_CONNECTION` says (`sync` still runs jobs inline).
- **PHP-issued OAuth refresh tokens are not accepted.** Applications using the OAuth2 provider (Passport in the PHP version) have to sign in again to obtain new tokens. API keys live in the same table and are unaffected.
- **Same database.** The tables and migration names are unchanged, so an existing database is adopted in place by `pnpm paymenter migrate`. Take a backup before running it.
- **Same `.env` names** (`APP_KEY`, `DB_*`, `CACHE_STORE`, `REDIS_*`...). PHP-only variables (`REDIS_CLIENT`, `LOG_*`, `BROADCAST_CONNECTION`...) are ignored.
- **No `artisan`, no Composer.** Use `pnpm paymenter <command>`; the command names (`app:cron-job`, `app:user:create`, ...) are the same. Maintenance-mode commands (`down`/`up`) are kept for compatibility but do not block requests.
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
