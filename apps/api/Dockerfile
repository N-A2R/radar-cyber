# syntax=docker/dockerfile:1.7
#
# API Fastify (@radar/api) — runtime = `tsx src/server.ts`.
#
# tsx est une devDependency du package : l'installation n'est donc PAS élaguée
# (`--prod=false` implicite), sinon le conteneur ne démarre pas. On limite
# seulement le périmètre au workspace @radar/api (+ @radar/shared).
#
# L'image sert aussi au one-shot `migrate` (même code, `db/` embarqué).

FROM node:24-alpine AS base
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
    pnpm install --frozen-lockfile --filter @radar/api...

# Image finale : sources + node_modules, utilisateur non-root.
FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -g 10001 -S radar && adduser -u 10001 -S -G radar -h /app -s /sbin/nologin radar

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
COPY bench/fixtures/corpus-reference-na.json bench/fixtures/corpus-reference-na.json
COPY bench/results/couverture-2026-11-15-gazetteer4.json bench/results/couverture-2026-11-15-gazetteer4.json
COPY scripts/migrate.mts scripts/migrate.mts

USER radar
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "--filter", "@radar/api", "start"]
