# ── Stage 1: install production dependencies only ──────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

RUN npm ci --workspace=backend --omit=dev

# ── Stage 2: build TypeScript -> JavaScript ─────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

RUN npm ci --workspace=backend

COPY backend/tsconfig.json   ./backend/
COPY backend/drizzle.config.ts ./backend/
COPY backend/src               ./backend/src/

RUN npm run build --workspace=backend

# ── Stage 3: minimal production runtime ────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S fintrack && adduser -S fintrack -G fintrack

COPY --from=deps   /app/node_modules         ./node_modules
COPY --from=deps   /app/backend/node_modules ./backend/node_modules
COPY --from=build  /app/backend/dist         ./backend/dist
COPY --from=build  /app/backend/package.json ./backend/
COPY package.json ./

USER fintrack

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "--import", "./backend/dist/src/shared/telemetry/tracing.js", "backend/dist/src/server.js"]
