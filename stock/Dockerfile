ARG BUILD_FROM
# We only serve static files, so use plain nginx — no s6-overlay needed.
FROM node:20-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app
RUN git clone --depth 1 https://github.com/CTLproxy/stock.git .
RUN npm ci --ignore-scripts && npm run build

# ── Production image ──
FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
