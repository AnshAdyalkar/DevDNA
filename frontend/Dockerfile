# ── Build stage ──────────────────────────────────────────────
# Build context is the REPO ROOT (npm workspaces keep the lockfile there,
# and frontend/src imports ../../shared/types). See docker-compose.yml.
FROM node:22-alpine AS build

WORKDIR /app

# Vite env vars are baked in at build time
ARG VITE_API_URL=http://localhost:5000/api
ARG VITE_SOCKET_URL=http://localhost:5000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY shared ./shared
RUN npm ci --workspace frontend

COPY frontend/ frontend/

RUN npm run build --workspace frontend

# ── Runtime stage ────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
