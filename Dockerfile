# Build context = repository root (needs both webApp/ and desktopApp/)
FROM node:22-alpine AS build
WORKDIR /app

COPY webApp/package.json webApp/package-lock.json ./webApp/
COPY desktopApp/src/renderer ./desktopApp/src/renderer
COPY webApp ./webApp

WORKDIR /app/webApp
RUN npm ci && npm run build

FROM nginx:alpine
COPY webApp/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/webApp/dist /usr/share/nginx/html
EXPOSE 80
