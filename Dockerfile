# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — Build (client + server bundles do React Router Framework Mode)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Runtime (apenas deps de produção + artefatos de build)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Apenas dependências de produção (devDeps como drizzle-kit/vite ficam de fora)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefatos gerados pelo `react-router build` (build/client + build/server)
COPY --from=build /app/build ./build

EXPOSE 3000

# Healthcheck usando a rota da API Hono no mesmo processo
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# O servidor Hono (criado pelo react-router-hono-server) serve assets,
# responde /api/* e delega o resto ao handler SSR do React Router.
CMD ["node", "build/server/index.js"]
