ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY . .
RUN npm run build

FROM ${BUILD_FROM}
RUN apk add --no-cache nginx

COPY --from=builder /app/dist /var/www/html
COPY ha-addon/nginx.conf /etc/nginx/http.d/default.conf
COPY ha-addon/run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
