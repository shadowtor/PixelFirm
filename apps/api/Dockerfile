FROM node:22-alpine

RUN apk add --no-cache wget
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "api", "start"]
