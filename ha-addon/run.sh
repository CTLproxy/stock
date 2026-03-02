#!/usr/bin/with-contenv bashio

# Read config
GROCY_URL=$(bashio::config 'GROCY_URL' 2>/dev/null || echo "")
GROCY_API_KEY=$(bashio::config 'GROCY_API_KEY' 2>/dev/null || echo "")
GROCY_ADDON_SLUG=$(bashio::config 'GROCY_ADDON_SLUG' 2>/dev/null || echo "")

# --- Configure internal Grocy proxy ---
if [ -n "$GROCY_ADDON_SLUG" ]; then
  PROXY_TARGET="http://${GROCY_ADDON_SLUG}:80/"
  bashio::log.info "Enabling Grocy internal proxy → ${PROXY_TARGET}"
  sed -i "s|__GROCY_PROXY_TARGET__|${PROXY_TARGET}|g" /etc/nginx/nginx.conf
else
  # No slug — remove the proxy location block to avoid nginx errors
  sed -i '/__GROCY_PROXY_TARGET__/,/}/d' /etc/nginx/nginx.conf
  bashio::log.info "No GROCY_ADDON_SLUG set, internal proxy disabled"
fi

# --- Inject default connection config into the PWA ---
CONFIG_JSON="{}"

if [ -n "$GROCY_URL" ] && [ -n "$GROCY_API_KEY" ]; then
  # Direct mode with explicit URL + key
  CONFIG_JSON="{mode:\"direct\",url:\"${GROCY_URL}\",apiKey:\"${GROCY_API_KEY}\"}"
  bashio::log.info "Pre-configuring Direct mode: ${GROCY_URL}"
elif [ -n "$GROCY_ADDON_SLUG" ] && [ -n "$GROCY_API_KEY" ]; then
  # Internal proxy mode (Stock add-on proxies to Grocy add-on)
  CONFIG_JSON="{mode:\"proxy\",proxyBase:\"/proxy/grocy\",apiKey:\"${GROCY_API_KEY}\"}"
  bashio::log.info "Pre-configuring Proxy mode via slug: ${GROCY_ADDON_SLUG}"
fi

if [ "$CONFIG_JSON" != "{}" ]; then
  sed -i "s|</head>|<script>window.__GROCY_CONFIG__=${CONFIG_JSON};</script></head>|" /var/www/html/index.html
fi

bashio::log.info "Starting Stock PWA on port 80..."
exec nginx -g 'daemon off;'
