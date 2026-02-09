# syntax = docker/dockerfile:1
FROM oven/bun:1.1.45

WORKDIR /app

COPY . .

RUN bun install
RUN mkdir -p apps/api/node_modules && rm -rf apps/api/node_modules/hono && cp -R node_modules/hono apps/api/node_modules/hono
RUN mkdir -p apps/api/node_modules/@anime-op-quiz && rm -rf apps/api/node_modules/@anime-op-quiz/shared && cp -R packages/shared apps/api/node_modules/@anime-op-quiz/shared
RUN bun run build

EXPOSE 8080

CMD ["bun", "apps/api/src/index.ts"]
