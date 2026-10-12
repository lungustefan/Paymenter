#!/bin/ash -e
cd /app

mkdir -p /var/log/supervisord/

## the directory of docker-compose.yml is mounted at /var/lib/paymenter, its .env keeps the APP_KEY.
## It is mounted outside /app so that the rebuild below never reads the database files next to it;
## /app/var is where older compose files mount it, keep using that when it is there.
VAR_DIR=/var/lib/paymenter
if [ -d /app/var ]; then
  VAR_DIR=/app/var
  echo "Using the .env of /app/var, mount the directory at /var/lib/paymenter instead (see docker-compose.example.yml)."
fi

## check for .env file and generate app keys if missing
if [ -f $VAR_DIR/.env ]; then
  echo "external vars exist."
  rm -rf /app/.env
  ln -s $VAR_DIR/.env /app/.env
else
  echo "external vars don't exist."
  rm -rf /app/.env
  mkdir -p $VAR_DIR
  touch $VAR_DIR/.env

  ## manually generate a key because key generate --force fails
  if [ -z $APP_KEY ]; then
     echo -e "Generating key."
     APP_KEY=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
     echo -e "Generated an app key, saved in $VAR_DIR/.env (the .env next to docker-compose.yml)."
     echo -e "APP_KEY=$APP_KEY" > $VAR_DIR/.env
  else
    echo -e "APP_KEY exists in environment, using that."
    echo -e "APP_KEY=$APP_KEY" > $VAR_DIR/.env
  fi

  ln -s $VAR_DIR/.env /app/.env
fi

if [[ -z $DB_PORT ]]; then
  echo -e "DB_PORT not specified, defaulting to 3306"
  DB_PORT=3306
  export DB_PORT
fi

## check for DB up before starting the panel
echo "Checking database status."
until nc -z -w30 $DB_HOST $DB_PORT 2>/dev/null
do
  echo "Waiting for database connection..."
  # wait for 1 seconds before check again
  sleep 1
done

## the public disk (storage/app/public) is served by the app itself at /storage, no symlink needed
mkdir -p /app/storage/app/public /app/storage/app/invoices /app/storage/app/tickets /app/storage/framework/cache /app/storage/logs

## renew default themes and extensions unless PAYMENTER_SKIP_DEFAULT is set
if [ -z "$PAYMENTER_SKIP_DEFAULT" ] || [ "$PAYMENTER_SKIP_DEFAULT" != "true" ]; then
  echo -e "Renewing default themes and extensions..."

  # Renew default themes
  if [ -d /app/themes_default ] && [ -d /app/themes ]; then
    echo -e "Renewing themes from defaults..."
    for item in /app/themes_default/*; do
      if [ -e "$item" ]; then
        item_name=$(basename "$item")
        rm -rf "/app/themes/$item_name"
        cp -rp "$item" "/app/themes/"
        echo -e "  Renewed: $item_name"
      fi
    done
  fi

  # Renew default extensions - only those that already exist
  if [ -d /app/extensions_default ] && [ -d /app/extensions ]; then
    echo -e "Renewing extensions from defaults..."
    updated_any=0
    for item in /app/extensions_default/*; do
      if [ -e "$item" ]; then
        item_name=$(basename "$item")
        # Only update if extension category exists in /app/extensions
        if [ -d "/app/extensions/$item_name" ]; then
          # Check if any extensions in this category exist
          if [ "$(ls -A /app/extensions/$item_name 2>/dev/null)" ]; then
            # Renew extensions in this category
            for ext_dir in "/app/extensions/$item_name"/*; do
              if [ -d "$ext_dir" ]; then
                ext_name=$(basename "$ext_dir")
                default_ext="/app/extensions_default/$item_name/$ext_name"
                if [ -d "$default_ext" ]; then
                  rm -rf "$ext_dir"
                  cp -rp "$default_ext" "$ext_dir"
                  echo -e "  Renewed: $item_name/$ext_name"
                  updated_any=1
                fi
              fi
            done
          fi
        fi
      fi
    done
    if [ $updated_any -eq 0 ]; then
      echo -e "  No extensions to renew."
    fi
  fi

  echo -e "Default themes and extensions renewed."
else
  echo -e "PAYMENTER_SKIP_DEFAULT is set, skipping renewal of default themes and extensions."
fi

## copy default themes if themes directory is empty or doesn't exist
if [ ! -d /app/themes ] || [ -z "$(ls -A /app/themes 2>/dev/null)" ]; then
  echo -e "Themes directory is empty, copying default themes..."
  mkdir -p /app/themes
  if [ -d /app/themes_default ]; then
    cp -rp /app/themes_default/. /app/themes/
    echo -e "Default themes copied."
  fi
else
  echo -e "Themes directory already populated."
fi

## copy default extensions if extensions directory is empty or doesn't exist
if [ ! -d /app/extensions ] || [ -z "$(ls -A /app/extensions 2>/dev/null)" ]; then
  echo -e "Extensions directory is empty, copying default extensions..."
  mkdir -p /app/extensions
  if [ -d /app/extensions_default ]; then
    cp -rp /app/extensions_default/. /app/extensions/
    echo -e "Default extensions copied."
  fi
else
  echo -e "Extensions directory already populated."
fi

## set permissions for themes and extensions
echo -e "Setting themes and extensions permissions."
chown -R node:node /app/themes /app/extensions
chmod -R 755 /app/themes /app/extensions

## Themes and extensions are registered at build time. If they differ from what the image was
## built with (custom themes/extensions mounted into the container), rebuild the app.
CURRENT_HASH=$(find themes extensions -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1)
if [ "$CURRENT_HASH" != "$(cat /app/.registry-hash 2>/dev/null)" ]; then
  echo -e "Themes/extensions changed, rebuilding (this can take a few minutes)..."
  # a failed build leaves no usable app behind: stop here (and retry on the next start) instead of starting it
  if ! su node -s /bin/ash -c "cd /app && pnpm build"; then
    echo -e "Rebuilding failed, see the errors above. Fix or remove the custom theme/extension and restart the container."
    exit 1
  fi
  echo "$CURRENT_HASH" > /app/.registry-hash
else
  echo -e "Themes/extensions unchanged, using the prebuilt app."
fi

## set storage permissions to 777 and user node:node
echo -e "Setting storage permissions."
chmod -R 777 /app/storage/*
chown -R node:node /app/storage /app/.next /app/src/generated
chown node:node $VAR_DIR/.env 2>/dev/null || true

## make sure the db is set up
echo -e "Migrating and Seeding D.B"
if ! su node -s /bin/ash -c "cd /app && pnpm paymenter migrate --seed"; then
  echo -e "Migrating the database failed, see the errors above."
  exit 1
fi

echo -e "Starting supervisord."
exec "$@"
