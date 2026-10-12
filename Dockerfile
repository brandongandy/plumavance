FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json eslint.config.js ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY apps apps
COPY packages packages
RUN npm run build
RUN npm prune --omit=dev --workspaces

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production DATA_DIR=/data STATIC_ROOT=/app/public CHROMIUM_PATH=/usr/bin/chromium PANDOC_PATH=/usr/bin/pandoc HOME=/home/pluma
RUN apt-get update && apt-get install -y --no-install-recommends chromium pandoc sqlite3 curl dumb-init fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/web/dist ./public
RUN groupadd --system pluma && useradd --system --gid pluma --create-home --home-dir /home/pluma pluma && mkdir -p /data && chown pluma:pluma /data
USER pluma
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD curl --fail --silent http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/server/dist/main.js"]
