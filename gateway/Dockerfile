# ─── Stage 1: install deps ─────────────────────────────────────────────────
# NOTE: build context is the gateway/ directory (DO App Platform sets it from
# the configured Source Directory). Paths are relative to that.
FROM oven/bun:1.3-slim AS deps
WORKDIR /app

COPY package.json ./
RUN bun install --production

# ─── Stage 2: runtime ──────────────────────────────────────────────────────
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

EXPOSE 8787

# Bun runs TypeScript directly — no build step needed.
CMD ["bun", "run", "src/index.ts"]
