FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages packages
RUN pnpm install --frozen-lockfile --filter @radar/web...
COPY apps/web apps/web
RUN pnpm --filter @radar/web build

FROM caddy:2-alpine
COPY --from=build /app/apps/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
