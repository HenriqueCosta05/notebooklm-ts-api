FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev


FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./

RUN npm ci

COPY src ./src
COPY locales ./locales

RUN npx tsc --project tsconfig.json


FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs appuser

WORKDIR /app

COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --chown=appuser:nodejs locales ./locales
COPY --chown=appuser:nodejs package.json ./

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "-r", "dotenv/config", "-r", "tsconfig-paths/register", "dist/infrastructure/framework/server.js"]
