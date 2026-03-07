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
import { renderProductDetail, renderProductCreate } from './js/pages/product-detail.js';
import { renderScanPage, cleanupScanPage } from './js/pages/scan.js';
import { renderShopping } from './js/pages/shopping.js';
import { renderSettings } from './js/pages/settings.js';
import { renderModeSelector } from './js/pages/mode-selector.js';
import { renderBatteries } from './js/pages/batteries.js';
import { renderBatteryDetail, renderBatteryCreate } from './js/pages/battery-detail.js';
import { renderChores } from './js/pages/chores.js';
import { renderChoreDetail, renderChoreCreate } from './js/pages/chore-detail.js';
import { renderEquipment } from './js/pages/equipment.js';
import { renderEquipmentDetail, renderEquipmentCreate } from './js/pages/equipment-detail.js';
import { renderRecipes } from './js/pages/recipes.js';
import { renderRecipeDetail, renderRecipeCreate } from './js/pages/recipe-detail.js';
import { renderMealPlanner } from './js/pages/meal-planner.js';
import { renderMasterData } from './js/pages/master-data.js';
import { initPullToRefresh } from './js/pull-to-refresh.js';

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
  const grocyApiKey = store.get('grocyApiKey');

  let isConfigured = false;

  if (connectionMode === 'ha_ingress' && haUrl && haToken && addonSlug) {
    api.configureHA(haUrl, haToken, addonSlug, grocyApiKey || '');
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
  initPullToRefresh();

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

  // Update chore badge after boot
  if (isConfigured) {
    setTimeout(updateChoreBadge, 800);
    window.addEventListener('chores-changed', () => updateChoreBadge());
  }
}

/* ---------- Chore Badge ---------- */
async function updateChoreBadge() {
  try {
    const badge = document.getElementById('chore-badge');
    if (!badge) return;

    const chores = await api.getChores();
    const periodicChores = chores.filter(c => c.period_type !== 'manually');

    if (periodicChores.length === 0) {
      badge.style.display = 'none';
      return;
    }

    const details = await Promise.all(
      periodicChores.map(c => api.getChoreDetails(c.id).catch(() => null))
    );

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    let dueCount = 0;
    let overdueCount = 0;

    for (const d of details.filter(Boolean)) {
      const next = d.next_estimated_execution_time;
      if (!next) continue;
      const dueDate = new Date(next);
      const dueStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}-${String(dueDate.getDate()).padStart(2,'0')}`;
      if (dueStr < todayStr) overdueCount++;
      else if (dueStr === todayStr) dueCount++;
    }

    const total = dueCount + overdueCount;
    if (total > 0) {
      badge.textContent = total;
      badge.className = overdueCount > 0 ? 'nav-badge nav-badge-overdue' : 'nav-badge nav-badge-due';
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch { /* ignore */ }
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
    renderProductCreate();
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
    setActiveNav('/mode');
    renderSettings();
  });

  router.register('/mode', () => {
    setActiveNav('/mode');
    renderModeSelector();
  });

  router.register('/batteries', () => {
    setActiveNav('/mode');
    renderBatteries();
  });

  router.register('/battery/new', () => {
    setActiveNav('/mode');
    renderBatteryCreate();
  });

  router.register('/battery/:id', (params) => {
    setActiveNav('/mode');
    renderBatteryDetail(params);
  });

  router.register('/chores', () => {
    setActiveNav('/mode');
    renderChores();
  });

  router.register('/chore/new', () => {
    setActiveNav('/mode');
    renderChoreCreate();
  });

  router.register('/chore/:id', (params) => {
    setActiveNav('/mode');
    renderChoreDetail(params);
  });

  router.register('/equipment', () => {
    setActiveNav('/mode');
    renderEquipment();
  });

  router.register('/equipment/new', () => {
    setActiveNav('/mode');
    renderEquipmentCreate();
  });

  router.register('/equipment/:id', (params) => {
    setActiveNav('/mode');
    renderEquipmentDetail(params);
  });

  router.register('/recipes', () => {
    setActiveNav('/mode');
    renderRecipes();
  });

  router.register('/meal-planner', () => {
    setActiveNav('/mode');
    renderMealPlanner();
  });

  router.register('/recipe/new', () => {
    setActiveNav('/mode');
    renderRecipeCreate();
  });

  router.register('/recipe/:id', (params) => {
    setActiveNav('/mode');
    renderRecipeDetail(params);
  });

  router.register('/master-data', () => {
    setActiveNav('/mode');
    renderMasterData();
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
const isHAIngressContext = (location.pathname || '').includes('/api/hassio_ingress/');

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', async () => {
    try {
      if (isHAIngressContext) {
        // In HA ingress mode, SW can interfere with API routes and cause "Failed to load".
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys
            .filter((k) => k.startsWith('stock-pwa-'))
            .map((k) => caches.delete(k)));
        }
        return;
      }

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
