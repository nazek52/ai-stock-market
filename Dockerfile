# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# No secrets or production preflight at build time. Root must enable output: 'standalone'.
RUN mkdir -p public && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts/validate-production.mjs ./scripts/validate-production.mjs
COPY --from=build --chown=node:node /app/src/server/production.ts ./src/server/production.ts
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/validate-production.mjs && exec node server.js"]
