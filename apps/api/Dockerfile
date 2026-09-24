FROM node:22-alpine

RUN apk add --no-cache wget
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN chown -R node:node /app
USER node

EXPOSE 3000

# Third CEO_DEV_AUTH_BYPASS guard: env.ts refuses to boot with the bypass on
# when NODE_ENV is production. Set after install so devDependencies (tsx, used
# by the start script) are still installed.
ENV NODE_ENV=production

CMD ["pnpm", "--filter", "api", "start"]
