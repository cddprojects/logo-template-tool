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
# Native modules (better-sqlite3) must match the final Node runtime (node:22-alpine).
RUN npm ci --omit=dev

FROM node:22-alpine
RUN apk add --no-cache nginx

COPY webApp/nginx.conf /etc/nginx/http.d/default.conf
COPY --from=build /app/webApp/dist /usr/share/nginx/html
COPY --from=server-deps /app/server/node_modules /app/server/node_modules
COPY server/package.json /app/server/package.json
COPY server/src /app/server/src
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh && mkdir -p /data /run/nginx

ENV DATA_DIR=/data
ENV PORT=8787
ENV NODE_ENV=production
ENV COOKIE_SECURE=true

EXPOSE 80
VOLUME ["/data"]
CMD ["/start.sh"]
