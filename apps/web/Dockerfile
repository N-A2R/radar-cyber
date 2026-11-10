# syntax=docker/dockerfile:1.7
#
# Web (@radar/web) — build Vite puis `vite preview` (cf.
# scripts/systemd/preview.config.mjs, qui proxifie /api vers l'API).
#
# `vite` est une devDependency : le runtime garde donc les devDeps installées
# pour le périmètre @radar/web. Le build ne dépend pas de l'API.

FROM node:24-alpine AS base
RUN apk add --no-cache tini
RUN corepack enable
WORKDIR /app
ENV CI=1

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-web-store,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --filter @radar/web...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @radar/web build

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -g 10001 -S radar && adduser -u 10001 -S -G radar -h /app -s /sbin/nologin radar

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/web/vite.config.ts ./apps/web/vite.config.ts
COPY scripts/systemd/preview.config.mjs ./scripts/systemd/preview.config.mjs

USER radar
EXPOSE 4173
ENTRYPOINT ["/sbin/tini", "--"]
# WEB_PORT / API_PROXY_TARGET sont lus par scripts/systemd/preview.config.mjs ;
# les flags CLI priment sur le fichier (host/port y valent 127.0.0.1:5173).
CMD ["pnpm", "--filter", "@radar/web", "exec", "vite", "preview", \
     "--host", "0.0.0.0", "--port", "4173", "--strictPort", \
     "--config", "/app/scripts/systemd/preview.config.mjs"]
