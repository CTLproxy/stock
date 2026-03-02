/**
 * Main Entry Point — Initialise app, configure API, register routes
 */
import './css/app.css';
import { api } from './js/api.js';
import { store } from './js/store.js';
import { router } from './js/router.js';
import { setActiveNav, showToast } from './js/ui.js';

// Pages
import { renderDashboard } from './js/pages/dashboard.js';
import { renderStock } from './js/pages/stock.js';
import { renderProducts } from './js/pages/products.js';
import { renderProductDetail } from './js/pages/product-detail.js';
import { renderScanPage, cleanupScanPage } from './js/pages/scan.js';
import { renderShopping } from './js/pages/shopping.js';
import { renderSettings } from './js/pages/settings.js';

/* ---------- Boot ---------- */

function dismissLoading() {
  clearTimeout(window.__bootTimeout);
  const loading = document.getElementById('loading-screen');
  const appContainer = document.getElementById('app-container');
  if (appContainer) appContainer.style.display = 'flex';
  if (loading) {
    loading.style.opacity = '0';
    loading.style.pointerEvents = 'none';
    setTimeout(() => loading.remove(), 400);
  }
}

async function boot() {
  // Restore persisted connection settings
  try {
    await store.init();
  } catch (e) {
    console.warn('Store init failed, continuing with defaults:', e);
  }

  // Support Home Assistant add-on auto-config injection
  if (window.__GROCY_CONFIG__) {
    const cfg = window.__GROCY_CONFIG__;

    if (cfg.mode === 'direct' && cfg.url && cfg.apiKey && !store.get('serverUrl')) {
      store.set('connectionMode', 'direct');
      store.set('serverUrl', cfg.url);
      store.set('apiKey', cfg.apiKey);
    } else if (cfg.mode === 'proxy' && cfg.proxyBase && cfg.apiKey && !store.get('serverUrl')) {
      // Internal HA add-on proxy: proxyBase is a relative path like "/proxy/grocy"
      const origin = window.location.origin;
      store.set('connectionMode', 'direct');
      store.set('serverUrl', `${origin}${cfg.proxyBase}`);
      store.set('apiKey', cfg.apiKey);
    } else if (cfg.url && cfg.apiKey && !store.get('serverUrl')) {
      // Legacy format
      store.set('serverUrl', cfg.url);
      store.set('apiKey', cfg.apiKey);
    }
  }

  const connectionMode = store.get('connectionMode') || 'direct';
  const serverUrl = store.get('serverUrl');
  const apiKey = store.get('apiKey');
  const haUrl = store.get('haUrl');
  const haToken = store.get('haToken');
  const addonSlug = store.get('addonSlug');

  let isConfigured = false;

  if (connectionMode === 'ha_ingress' && haUrl && haToken && addonSlug) {
    api.configureHA(haUrl, haToken, addonSlug);
    isConfigured = true;
  } else if (connectionMode === 'direct' && serverUrl && apiKey) {
    api.configure(serverUrl, apiKey);
    isConfigured = true;
  }

  registerRoutes();
  setupNavigation();
  setupConnectivityBanner();

  // Show the app UI immediately
  dismissLoading();

  // If no server configured, send to settings
  if (!isConfigured) {
    location.hash = '/settings';
  }
  // Set default hash if empty
  else if (!location.hash || location.hash === '#' || location.hash === '#/') {
    location.hash = '/';
  }

  // Start router (attaches hashchange listener + handles current hash)
  router.init();
}

/* ---------- Routes ---------- */
function registerRoutes() {
  router.register('/', () => {
    setActiveNav('/');
    renderDashboard();
  });

  router.register('/stock', () => {
    setActiveNav('/stock');
    renderStock();
  });

  router.register('/products', () => {
    setActiveNav('/stock');
    renderProducts();
  });

  router.register('/product/new', () => {
    setActiveNav('/stock');
    // Redirect to Grocy for full product creation (too complex for mobile)
    const url = store.get('serverUrl');
    if (url) {
      window.open(`${url}/product/new`, '_blank');
      history.back();
    } else {
      showToast('Server not configured', 'error');
    }
  });

  router.register('/product/:id', (params) => {
    setActiveNav('/stock');
    renderProductDetail(params);
  });

  router.register('/scan', () => {
    setActiveNav('/scan');
    renderScanPage({ mode: 'purchase' });
  }, cleanupScanPage);

  router.register('/scan/:mode', (params) => {
    setActiveNav('/scan');
    renderScanPage(params);
  }, cleanupScanPage);

  router.register('/shopping', () => {
    setActiveNav('/shopping');
    renderShopping();
  });

  router.register('/settings', () => {
    setActiveNav('/settings');
    renderSettings();
  });

  // Fallback
  router.register('*', () => {
    location.hash = '/';
  });
}

/* ---------- Bottom Nav ---------- */
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.route;
      if (target) location.hash = target;
    });
  });

  // Back button
  const backBtn = document.getElementById('header-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        history.back();
      } else {
        location.hash = '/';
      }
    });
  }
}

/* ---------- Connectivity ---------- */
function setupConnectivityBanner() {
  const banner = document.getElementById('connection-bar');

  function updateOnlineStatus() {
    if (!navigator.onLine) {
      if (banner) {
        banner.style.display = 'flex';
        banner.textContent = 'You are offline — showing cached data';
      }
    } else {
      if (banner) banner.style.display = 'none';
    }
  }

  window.addEventListener('online', () => {
    updateOnlineStatus();
    showToast('Back online', 'success');
  });
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

/* ---------- Service Worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              showToast('App updated — reload for latest version', 'info');
            }
          });
        }
      });
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  });
}

/* ---------- Start ---------- */
boot().catch(err => {
  console.error('Boot error:', err);
  dismissLoading();
});
