# ── Stage 1: deps ──────────────────────────────────────────────────────────────
# Install production + dev dependencies in a throw-away layer so the final image
# only carries the compiled dist and prod node_modules.
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
# ci is deterministic; prune dev deps in the next stage
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Prune dev dependencies so only production modules are copied forward
RUN npm prune --omit=dev

# ── Stage 3: production runtime ───────────────────────────────────────────────
# Use tini as PID 1:
#   • Correctly forwards SIGTERM to the Node process (without it, docker stop
#     sends SIGTERM to pid 1 = Node kernel daemon and the process ignores it,
#     forcing a 10-second SIGKILL after the stop timeout).
#   • Reaps zombie child processes left by cluster workers.
FROM node:20-alpine AS production

# Install tini — tiny but valid init for containers
RUN apk add --no-cache tini

WORKDIR /app

# Copy only what we need — no src, no test, no config tooling
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# ── Security: run as the built-in non-root node user (uid 1000) ───────────────
# node:20-alpine ships with a `node` user/group already created.
# chown dist + node_modules so the process can write nothing outside /tmp.
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# ── Health check — used by Docker Compose, ECS, and K8s liveness probes ───────
# Probe the /health endpoint every 30 s. Fail after 3 consecutive misses.
# Initial 15-second delay gives the app time to connect to DB + Redis at startup.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/v1/health || exit 1

# tini is the init process; it execs node as PID > 1 so signals work correctly
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/main"]
