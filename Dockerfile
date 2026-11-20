# syntax=docker/dockerfile:1
#
# Single image that both builds and serves the app. Not the smallest possible image, but the
# simplest reliable one: the same full node_modules tree is used to build, to run database
# migrations (tsx) and to serve (next start), so nothing can be missing at runtime.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ---- Install dependencies (its own layer so `pnpm install` is only re-run when deps change) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---- Build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time-only placeholders so `next build` can run without a real database or real secrets;
# the container reads the real values from its environment when it actually starts.
ENV DATABASE_URL="postgres://build:build@localhost:5432/build" \
    AUTH_SECRET="build_time_placeholder_must_be_at_least_32_chars" \
    QR_SIGNING_SECRET="build_time_placeholder_must_be_at_least_32c" \
    CRON_SECRET="build_time_placeholder_must_be_at_least_32char" \
    NODE_ENV="production"
RUN pnpm build

# ---- Runtime ----
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME="0.0.0.0"
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
