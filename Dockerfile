# syntax=docker/dockerfile:1

# --- build stage ------------------------------------------------------------
# Builds the standalone Next.js server (ADR-014: Cloud Run runs .next/standalone).
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Pin the same pnpm version pinned in package.json's "packageManager" field.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- runtime stage -----------------------------------------------------------
# Only ffmpeg (brings ffprobe) is needed at runtime for media transcoding.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production

# .next/standalone already contains a pruned node_modules and server.js.
# .next/static is not included in standalone output and must be copied
# alongside it. public/ does not exist yet in this repo (T001 pruned the
# scaffold's placeholder assets), so there is nothing to copy for it.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 8080
CMD ["node", "server.js"]
