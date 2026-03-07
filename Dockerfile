# syntax=docker/dockerfile:1.4
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock .npmrc ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/.output .output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
