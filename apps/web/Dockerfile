# syntax=docker/dockerfile:1.7
#
# Web (@radar/web) — build Vite puis serveur statique Node zéro dépendance.
# Le runtime ne contient ni vite, ni Storybook, ni Playwright, ni node_modules.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base
RUN apk add --no-cache tini
RUN corepack enable
WORKDIR /app
ENV CI=1

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-web-store,target=/root/.cache/pnpm \
    pnpm install --frozen-lockfile --store-dir /root/.cache/pnpm --filter @radar/web...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @radar/web build

FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache tini \
    && addgroup -g 10001 -S radar \
    && adduser -u 10001 -S -G radar -h /app -s /sbin/nologin radar
WORKDIR /app

COPY --from=build --chown=radar:radar /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=radar:radar /app/apps/web/serve.mjs ./apps/web/serve.mjs

USER radar
EXPOSE 4173
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/apps/web/serve.mjs"]
