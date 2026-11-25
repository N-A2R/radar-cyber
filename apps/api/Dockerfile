# syntax=docker/dockerfile:1.7
#
# API Fastify (@radar/api) — runtime = `tsx src/server.ts`.
#
# tsx est une dépendance runtime explicite; les devDependencies (TypeScript,
# types, ajv) sont élaguées. L'image sert aussi au one-shot `migrate`.

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
RUN apk add --no-cache tini
RUN corepack enable
WORKDIR /app
ENV CI=1

# Dépendances : lockfile obligatoire, store pnpm en cache BuildKit.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm-api-store,target=/root/.cache/pnpm \
    pnpm install --prod --frozen-lockfile --store-dir /root/.cache/pnpm --filter @radar/api...

# Image finale : sources + node_modules, utilisateur non-root.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache tini \
    && addgroup -g 10001 -S radar \
    && adduser -u 10001 -S -G radar -h /app -s /sbin/nologin radar
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json
COPY --from=deps /app/packages/shared/package.json ./packages/shared/package.json

COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
COPY packages/shared/src packages/shared/src
COPY db db
COPY bench/couverture bench/couverture
COPY bench/results/couverture-mesuree.json bench/results/couverture-mesuree.json
COPY scripts/migrate.mts scripts/migrate.mts

USER radar
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/apps/api/node_modules/.bin/tsx", "/app/apps/api/src/server.ts"]
