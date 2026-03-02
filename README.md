# Stock — Grocy PWA Client

A modern, task-oriented Progressive Web App for [Grocy](https://grocy.info/) — the self-hosted groceries & household management solution.

**Stock** talks directly to Grocy's REST API and provides a fast, mobile-first experience for everyday grocery workflows: scanning barcodes, purchasing, consuming, and managing your shopping list.

## Features

- **Barcode scanning** — Use your device camera to scan and look up products (EAN-13, EAN-8, UPC-A, UPC-E, CODE-128, QR, and more)
- **Quick purchase & consume** — Scan a barcode to instantly add or remove stock
- **Stock overview** — Browse all stock with search, filter by expiry, below-minimum, or opened status
- **Product details** — View stock entries, purchase, consume, open, or do inventory corrections
- **Shopping list** — Check off items, add products, auto-add missing stock
- **Offline resilience** — IndexedDB caching lets you browse cached data when offline
- **Installable PWA** — Add to Home Screen on iOS/Android for a native app experience
- **Liquid Glass design** — Frosted glass surfaces, smooth animations, dark/light mode
- **Home Assistant add-on** — Deployable as a Home Assistant add-on with zero configuration

## Tech Stack

- Vanilla JavaScript (ES Modules) — no framework dependency
- [Vite](https://vitejs.dev/) — fast build and dev server
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) — barcode scanning via camera
- [idb-keyval](https://github.com/nicedoc/idb-keyval) — lightweight IndexedDB persistence
- Service Worker — cache-first for assets, network-first for API
- CSS Custom Properties — Liquid Glass design system with dark/light mode

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- A running **Grocy** instance (v4.x+) with an API key

### Install & Run

```bash
# Clone
git clone https://github.com/CTLproxy/stock.git
cd stock

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:3000` on your phone or browser. Go to **Settings** and enter your Grocy server URL and API key.

### Build for Production

```bash
npm run build
```

The `dist/` folder contains static files ready to deploy on any web server (nginx, Caddy, Apache, etc.).

### Generate PWA Icons

```bash
npm install --save-dev sharp
node scripts/generate-icons.js
```

## Home Assistant Add-on

### Installation

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**
2. Click the overflow menu (⋮) → **Repositories**
3. Add: `https://github.com/CTLproxy/stock`
4. Find **Stock — Grocy PWA** and click **Install**
5. Configure your Grocy URL and API key in the add-on settings
6. Start the add-on — it appears as a panel in the sidebar

### Manual Docker Build

```bash
docker build -t stock-pwa -f ha-addon/Dockerfile .
docker run -p 8099:80 stock-pwa
```

## Project Structure

```
stock/
├── index.html              # App shell
├── package.json
├── vite.config.js
├── src/
│   ├── main.js             # Entry point — boot, routes, navigation
│   ├── css/
│   │   └── app.css         # Liquid Glass design system
│   └── js/
│       ├── api.js           # Grocy REST API client
│       ├── store.js         # Reactive state store + IndexedDB persistence
│       ├── router.js        # Hash-based SPA router
│       ├── scanner.js       # Camera barcode scanner (html5-qrcode)
│       ├── ui.js            # Shared UI utilities (toast, modal, formatting)
│       └── pages/
│           ├── dashboard.js     # Home — stats, expiring, quick actions
│           ├── stock.js         # Stock overview with search/filter
│           ├── products.js      # Product browser with groups
│           ├── product-detail.js # Product detail + actions
│           ├── scan.js          # Barcode scanner (purchase/consume/lookup)
│           ├── shopping.js      # Shopping list management
│           └── settings.js      # Server config, connection test
├── public/
│   ├── manifest.json        # Web App Manifest
│   ├── sw.js                # Service Worker
│   └── icons/               # PWA icons
├── ha-addon/
│   ├── config.yaml          # HA add-on configuration
│   ├── Dockerfile           # Multi-stage build
│   ├── nginx.conf           # Nginx config
│   └── run.sh               # Startup script
└── scripts/
    └── generate-icons.js    # SVG → PNG icon generator
```

## Configuration

On first launch, navigate to **Settings** and enter:

| Field | Description |
|-------|-------------|
| Server URL | Full URL to your Grocy instance, e.g. `https://grocy.example.com` |
| API Key | Found in Grocy → Settings → Manage API keys |

For the Home Assistant add-on, these can be pre-configured in the add-on settings panel.

## Supported Barcode Formats

EAN-13, EAN-8, UPC-A, UPC-E, CODE-128, CODE-39, CODE-93, CODABAR, ITF, QR Code, Data Matrix, Aztec, PDF417, MaxiCode, RSS-14

## License

MIT
