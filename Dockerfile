# syntax=docker/dockerfile:1

# Stage 1: install dependencies (cached as long as the lockfile does not change)
FROM node:22-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: build the application (registers the bundled themes/extensions and compiles Next.js)
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build \
    && find themes extensions -type f | sort | xargs sha256sum | sha256sum | cut -d' ' -f1 > .registry-hash

# Stage 3: production image. Serves the panel with `next start` and runs the queue
# worker + scheduler (`pnpm worker`) next to it, both supervised by supervisord.
FROM node:22-alpine AS production
WORKDIR /app

RUN apk add --no-cache ca-certificates curl supervisor tar netcat-openbsd \
    && npm install -g pnpm@10

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=80

# node_modules is kept complete (not pruned) so the entrypoint can rebuild when custom themes/extensions are added.
# --chown here instead of a `chown -R` afterwards, which would store all of /app a second time in its own layer.
COPY --from=build --chown=node:node /app /app

# Copy themes and extensions to default locations for renewal on startup
RUN cp -r /app/themes /app/themes_default \
    && cp -r /app/extensions /app/extensions_default \
    && mkdir -p storage/app/public storage/app/invoices storage/app/tickets storage/framework/cache storage/logs /var/log/supervisord \
    && chown node:node /app \
    && chown -R node:node /app/themes_default /app/extensions_default /app/storage

# Environment variable to skip default themes/extensions renewal
# Set PAYMENTER_SKIP_DEFAULT=true to keep any custom modifications to defaults
ENV PAYMENTER_SKIP_DEFAULT=false

COPY .github/docker/supervisord.conf /etc/supervisord.conf

EXPOSE 80
ENTRYPOINT [ "/bin/ash", ".github/docker/entrypoint.sh" ]
CMD [ "supervisord", "-n", "-c", "/etc/supervisord.conf" ]
