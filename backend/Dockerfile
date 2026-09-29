# ── Build stage ──────────────────────────────────────────────
# Build context is the REPO ROOT (npm workspaces keep the lockfile there,
# and backend/src imports ../../../shared/types.js). See docker-compose.yml.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY shared ./shared
RUN npm ci --workspace backend

COPY backend/tsconfig.json backend/eslint.config.js backend/jest.config.js backend/
COPY backend/src backend/src
COPY backend/tests backend/tests

RUN npm run build --workspace backend

# ── Runtime stage ────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci --workspace backend --omit=dev

COPY --from=build /app/backend/dist backend/dist

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=15s \
    CMD wget -qO- http://127.0.0.1:5000/health || exit 1

CMD ["node", "backend/dist/backend/src/index.js"]
