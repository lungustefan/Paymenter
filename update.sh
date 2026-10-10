#!/bin/bash

URL='https://github.com/paymenter/paymenter/releases/latest/download/paymenter.tar.gz'

echo "Starting upgrade process..."

# Read config/app.php to check if someone is trying to ugprade to a major version.
if [ -f "config/app.php" ]; then
    if grep -q "marketplace" "config/app.php"; then
        echo -e "\x1b[31;1mCannot execute self-upgrade process. Please follow the upgrade instructions at https://paymenter.org/docs/guides/v0-migration to migrate your V0 to V1\x1b[0m"
        exit 1
    fi
fi

# Node.js >= 22 is required.
if ! command -v node >/dev/null 2>&1; then
    echo -e "\x1b[31;1mCannot execute self-upgrade process. Node.js is not installed, the minimum required version is 22.\x1b[0m"
    exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
    echo -e "\x1b[31;1mCannot execute self-upgrade process. The minimum required Node.js version is 22, you have [$(node -v)].\x1b[0m"
    exit 1
fi

# Exit if release URL is empty or underfined
if [[ $URL == "" ]]; then echo -e "\x1b[31;1mRelease URL not defined.\x1b[0m"; exit 1; fi

# Remember if this is an upgrade from the Laravel (PHP) release
FROM_PHP=0
PREV_VER=""
if [[ -f "config/app.php" ]]; then
  FROM_PHP=1
  # Read version from config/app.php
  PREV_VER="$(grep 'version' config/app.php | head -1 | sed -E "s/.*'version'\s*=>\s*'([^']+)'.*/\1/")"
elif [[ -f "package.json" ]]; then
  PREV_VER="$(node -p "require('./package.json').version" 2>/dev/null)"
fi

# Check if the previous version is 1.2.11 or lower, if so, check if extensions directory contains filament resources (except announcements/affiliates)
# Only run checks if version < 1.2.12
if [[ "$FROM_PHP" == 1 ]] && [[ "$PREV_VER" != *beta* ]] && [[ -n "${PREV_VER:-}" ]] && [[ "$(printf '%s\n%s\n' "$PREV_VER" "1.2.12" | sort -V | head -1)" != "1.2.12" ]]; then
    # Check extensions for admin folder
    if [[ -d extensions ]]; then
      found_admin=$(find extensions -type d -name Admin \
        ! -path "*/Announcements/*" \
        ! -path "*/Affiliates/*")
      if [[ -n "$found_admin" ]]; then
        echo -e "\x1b[31;1mExtensions that need to be removed (temporary):\x1b[0m"
        echo "$found_admin"
        echo -e "\x1b[31;1mCannot execute self-upgrade process. Please remove the given extensions, then re-run the upgrade process and add the (updated) extensions again after the upgrade is complete.\x1b[0m"
        exit 1
      fi
    fi
fi

for i in "$@"
do
case $i in
    -u=*|--user=*)
    PERMUSER="${i#*=}"
    shift # past argument=value
    ;;
    -g=*|--group=*)
    PERMGROUP="${i#*=}"
    shift # past argument=value
    ;;
    -i|--install)
    INSTALL=1
    shift # past argument=value
    ;;
    -r=*|--url=*)
    URL="${i#*=}"
    shift # past argument=value
    ;;
    -p=*|--package-manager=*)
    PM="${i#*=}"
    shift # past argument=value
    ;;
    *)
            # unknown option
    ;;
esac
done

# Detect the package manager (pnpm, npm or yarn): explicit option, then the lockfile of the current install, then what is installed.
if [ -z "$PM" ]; then
    if [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then PM=yarn
    elif [ -f package-lock.json ] && command -v npm >/dev/null 2>&1; then PM=npm
    elif command -v pnpm >/dev/null 2>&1; then PM=pnpm
    elif command -v npm >/dev/null 2>&1; then PM=npm
    elif command -v yarn >/dev/null 2>&1; then PM=yarn
    fi
fi
case "$PM" in
    pnpm|npm|yarn) ;;
    *) echo -e "\x1b[31;1mCannot execute self-upgrade process. No supported package manager (pnpm, npm or yarn) found.\x1b[0m"; exit 1 ;;
esac
if ! command -v "$PM" >/dev/null 2>&1; then
    echo -e "\x1b[31;1mCannot execute self-upgrade process. Package manager [$PM] is not installed.\x1b[0m"
    exit 1
fi

# Run a package.json script of the app: pm_run <script> [args...]
pm_run() {
    local script="$1"; shift
    case "$PM" in
        npm) npm run "$script" --silent -- "$@" ;;
        *) "$PM" run "$script" "$@" ;;
    esac
}

# Detect the folder permissions.
file=$(pwd)

if [ -t 0 ]; then
    # If $user is set, use that as the user
    if [ -z "$PERMUSER" ]; then
        USER2=$(stat -c '%U' "$file")
        read -p "Your webserver user has been detected as [$USER2]: is this correct? [Y/n]: " -r
        if [[ $REPLY =~ ^[Nn] ]]; then
            read -p "Please enter the name of the user running your webserver process. This varies from system to system, but is generally \"www-data\", \"nginx\", or \"apache\": " -r PERMUSER
        else
            PERMUSER=$USER2
        fi
    fi
    
    # If $group is set, use that as the group
    if [ -z "$PERMGROUP" ]; then
        GROUP2=$(stat -c '%G' "$file")
        read -p "Your webserver group has been detected as [$GROUP2]: is this correct? [Y/n]: " -r 
        if [[ $REPLY =~ ^[Nn] ]]; then
            read -p "Please enter the name of the group running your webserver process. Normally this is the same as your user: " -r PERMGROUP
        else 
            PERMGROUP=$GROUP2
        fi 
    fi
    
    if [ -z "$INSTALL" ]; then
        read -p "Are you sure you want to run the upgrade process for your Panel? [y/N]: " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Upgrade aborted."
            exit 1
        fi
    fi
fi

RUN() {
    echo -e "\x1b[34m\$\x1b[34;1mupgrader>\x1b[0m $*"
    "${@}"
}

# Fall back to the owner of the folder when running non-interactively
[ -z "$PERMUSER" ] && PERMUSER=$(stat -c '%U' "$file")
[ -z "$PERMGROUP" ] && PERMGROUP=$(stat -c '%G' "$file")

# Keep the configuration, the uploaded files and the themes/extensions you added.
RUN cp -p .env .env.update-backup 2>/dev/null || true

# Download the latest release from GitHub.
RUN curl -L -f -o paymenter.tar.gz "$URL" || { echo -e "\x1b[31;1mDownload failed.\x1b[0m"; exit 1; }

# Delete the previous build and sources (storage, .env, extensions and themes are kept)
RUN rm -rf src .next

# Remove the PHP files of the Laravel release
if [[ "$FROM_PHP" == 1 ]]; then
    RUN rm -rf app bootstrap config routes resources vendor database/migrations database/seeders database/factories public/index.php public/build artisan composer.json composer.lock phpunit.xml phpstan.neon pint.json vite.js package-lock.json
fi

# Extract the tarball (the release contains the pre-built application).
RUN tar -xzf paymenter.tar.gz --exclude='./.env' --exclude='.env'

# Remove the tarball.
RUN rm -f paymenter.tar.gz

# Make sure .env is untouched
if [ -f .env.update-backup ]; then RUN mv -f .env.update-backup .env; fi

# Setup correct permissions on the new files.
RUN mkdir -p storage/app/public storage/app/invoices storage/app/tickets storage/framework/cache storage/logs
RUN chmod -R 755 storage extensions

# Install the dependencies.
case "$PM" in
    pnpm) RUN pnpm install --frozen-lockfile || RUN pnpm install ;;
    yarn) RUN yarn install ;;
    npm) RUN npm install ;;
esac

# Run the database migrations.
RUN pm_run paymenter migrate --seed

# Change to default theme.
RUN pm_run paymenter app:settings:change theme default

# Rebuild when custom themes/extensions are installed (they are registered at build time) or the release shipped without a build.
CURRENT_HASH=$(find themes extensions -type f 2>/dev/null | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)
if [ ! -d .next ] || [ "$CURRENT_HASH" != "$(cat .registry-hash 2>/dev/null)" ]; then
    RUN pm_run build
else
    echo "Pre-built release found, skipping build."
fi

# Clear the cache.
RUN pm_run paymenter optimize:clear

# Remove the old log files.
RUN rm -rf storage/logs/*.log

# Setup correct permissions on the new files.
RUN chown -R "$PERMUSER":"$PERMGROUP" .

RUN pm_run paymenter app:check-for-updates

RUN pm_run paymenter queue:restart

echo "Upgrade completed."
if [[ "$FROM_PHP" == 1 ]]; then
    echo -e "\x1b[33;1mNote: you upgraded from the PHP release. Everyone has to log in again, drain/clear old queued jobs, and PHP based extensions/themes must be ported to TypeScript (see README).\x1b[0m"
fi
echo "Restart the web process and the worker now so they use the new version, e.g.:"
echo "  systemctl restart paymenter paymenter-worker   (or: pm2 restart paymenter paymenter-worker)"
echo "  Start manually: $PM start  and  $PM run worker"
