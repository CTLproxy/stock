# Changelog

## 1.0.10

- Accept HA ingress connection test when probe confirms `/api/system/info` returns 200
- Fix internal proxy upstream hostname to docker-safe Grocy add-on host format
- Update Settings About version label

## 1.0.9

- Add HA Ingress section action to switch directly to Direct mode + internal Grocy proxy URL
- Ensure add-on builder fetches latest repo commit by busting Docker git-clone cache

## 1.0.8

- Fix add-on startup crash when Grocy hostname is not resolvable at nginx boot
- Use request-time DNS resolution for `/proxy/grocy/` upstream

## 1.0.7

- Add internal add-on proxy route `/proxy/grocy/` from Stock to Grocy inside HA network
- Add Settings action "Use Internal HA Grocy Proxy" for API-key-only connection setup

## 1.0.6

- Reuse current browser HA ingress context when creating new ingress session fails
- Prevent HA Ingress setup failure with "Session failed: Load failed" on custom-domain/Nabu Casa paths

## 1.0.5

- Prefer WebSocket-based ingress session creation, with REST fallback
- Handle fetch/network failures in ingress session creation more clearly
- Make HA test step 4 resilient when `/api/system/info` returns 200 but JSON parsing is proxy-mangled

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
