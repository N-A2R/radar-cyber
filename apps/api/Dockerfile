FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages packages
RUN pnpm install --frozen-lockfile --filter @radar/api...

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app /app
COPY apps/api /app/apps/api
COPY packages /app/packages
USER app
EXPOSE 8080
CMD ["pnpm", "--filter", "@radar/api", "start"]
