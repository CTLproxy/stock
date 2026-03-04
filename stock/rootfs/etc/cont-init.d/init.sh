#!/usr/bin/with-contenv bashio
# One-time initialization: patch nginx config for proxy placeholder

bashio::log.info "Stock PWA: initializing…"

# Remove the proxy placeholder from nginx config (no addon-level proxy needed;
# the PWA handles Grocy connection via HA Ingress or direct mode in the browser)
if grep -q '__GROCY_PROXY_TARGET__' /etc/nginx/http.d/default.conf 2>/dev/null; then
  sed -i '/__GROCY_PROXY_TARGET__/,/}/d' /etc/nginx/http.d/default.conf
  bashio::log.info "Removed unused proxy block from nginx config"
fi

bashio::log.info "Stock PWA: init complete"
