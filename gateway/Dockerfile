# ─── Stage 1: install deps ─────────────────────────────────────────────────
FROM oven/bun:1.3-slim AS deps
WORKDIR /app

# Gateway has no workspace deps (it doesn't import @mneme/sdk), so a flat
# install from gateway/package.json is enough.
COPY gateway/package.json ./
RUN bun install --production

# ─── Stage 2: runtime ──────────────────────────────────────────────────────
FROM oven/bun:1.3-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

COPY --from=deps /app/node_modules ./node_modules
COPY gateway/src ./src
COPY gateway/package.json ./

EXPOSE 8787

# Bun runs TypeScript directly — no build step needed.
CMD ["bun", "run", "src/index.ts"]
