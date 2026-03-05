# Stock — Grocy PWA (Home Assistant Add-on)

Stock is a modern Progressive Web App frontend for Grocy, packaged as a Home Assistant add-on.

## What this add-on provides

- Responsive Grocy web UI optimized for phone and desktop
- Home Assistant ingress support (`ingress: true`)
- Optional direct port exposure (`8099`) for opening outside HA UI
- Internal proxy endpoint for Grocy API (`/proxy/grocy/`) used by app settings helper

## Installation

1. Add this repository in Home Assistant:
   - **Settings → Add-ons → Add-on Store → ⋮ → Repositories**
   - Repository URL: `https://github.com/CTLproxy/stock`
2. Install **Stock — Grocy PWA**.
3. Start the add-on.
4. Open Web UI.

## First-time app setup

Open **Settings** inside the Stock app and configure one of these modes:

- **Home Assistant mode** (recommended in HA UI)
  - Uses Home Assistant auth/session and ingress routing.
  - Enter your Grocy API key in app settings.
- **Direct mode**
  - Connect directly to Grocy API URL.
  - Enter Grocy API URL and Grocy API key.

You can also use **Use Internal HA Grocy Proxy** in app settings to auto-fill a Direct-mode API URL via this add-on proxy.

## Notes

- Scanner auto-start is configurable in app settings.
- Service worker caching is automatically limited in HA ingress contexts to avoid API routing conflicts.
- If you expose port `8099`, you can open the app directly outside Home Assistant.
- After installing new version, navigate to **Settings**, **App** and click **Update App** to refresh the PWA cache and load the latest code.

## Troubleshooting

- If the app cannot load data in HA mode, verify the Grocy API key in app settings.
- If direct access fails, ensure Grocy URL is reachable from your Home Assistant host/network.
- Restart the add-on after updating configuration.
- If you encounter other issues with the application, try clearing the app cache here: **Settings → App → Clear Offline Cache**.
