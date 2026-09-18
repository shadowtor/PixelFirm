FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@12.4.2 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

EXPOSE 3000

CMD ["pnpm", "--filter", "api", "start"]
