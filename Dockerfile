# Build context = repository root (needs webApp/, desktopApp/, server/)
FROM node:22-alpine AS build
WORKDIR /app

COPY webApp/package.json webApp/package-lock.json ./webApp/
COPY desktopApp/src/renderer ./desktopApp/src/renderer
COPY webApp ./webApp

WORKDIR /app/webApp
RUN npm ci && npm run build

FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Final image: official nginx:alpine (proven Coolify/Traefik path) + Node 22 binary for API
FROM nginx:alpine
RUN apk add --no-cache tini wget

COPY --from=node:22-alpine /usr/local/ /usr/local/
COPY webApp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/webApp/dist /usr/share/nginx/html
COPY --from=server-deps /app/server/node_modules /app/server/node_modules
COPY server/package.json /app/server/package.json
COPY server/src /app/server/src
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh && mkdir -p /data /run/nginx

ENV DATA_DIR=/data
ENV API_PORT=8787
ENV NODE_ENV=production
ENV COOKIE_SECURE=true

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1/api/health >/dev/null 2>&1 || exit 1

EXPOSE 80
VOLUME ["/data"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/start.sh"]
