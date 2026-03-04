ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest

# ── Stage 1: Build PWA ──
FROM node:20-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
RUN git clone --depth 1 https://github.com/CTLproxy/stock.git .
RUN npm ci --ignore-scripts && npm run build

# ── Stage 2: Production image ──
FROM ${BUILD_FROM}

RUN apk add --no-cache nginx

COPY --from=builder /app/dist /var/www/html
COPY nginx.conf /etc/nginx/http.d/default.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
