# Static web image: the office route (/) and the CEO dashboard (/ceo).
# Build context is the repo root: docker build -f apps/web/Dockerfile .
# No ARG/ENV here on purpose: VITE_* values are baked into a public bundle, so the
# browser token must never be passed in (Phase 7 owns the stream route).
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@12.4.2 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM nginx:1.27-alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
