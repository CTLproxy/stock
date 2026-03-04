# Changelog

## 1.0.4

- Add Settings actions to open app outside HA UI and copy full app URL
- Provide popup-blocker fallback by copying URL to clipboard/manual display

## 1.0.3

- Fix HA ingress API parsing when responses are compressed/encoded unexpectedly
- Prevent false connection failure with "The string did not match the expected pattern"

## 1.0.2

- Fix nginx root path for `nginx:stable-alpine` image to resolve Web UI 500 error on ingress open

## 1.0.1

- Remove legacy duplicate add-on folder that used s6-based startup
- Keep only `stock/` add-on definition to avoid slug conflict
- Force rebuild/update path for Home Assistant

## 1.0.0

- Initial release
- PWA client for Grocy with barcode scanning, shopping lists, stock management
- Home Assistant Ingress support
- Offline capable with Service Worker caching
