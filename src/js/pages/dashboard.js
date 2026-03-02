/**
 * Dashboard Page — Home view with overview stats and quick actions
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { router } from '../router.js';
import {
  renderPage, setHeader, showToast, formatDate, formatAmount,
  getProductEmoji, escapeHtml, getDueBadgeClass,
} from '../ui.js';

export function renderDashboard() {
  setHeader('Dashboard', false);

  renderPage(`
    <div class="section">
      <div class="stats-grid" id="dash-stats">
        <div class="stat-card skeleton" style="height: 100px;"></div>
        <div class="stat-card skeleton" style="height: 100px;"></div>
        <div class="stat-card skeleton" style="height: 100px;"></div>
        <div class="stat-card skeleton" style="height: 100px;"></div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Quick Actions</h2>
      </div>
      <div class="quick-actions">
        <button class="quick-action" onclick="location.hash='/scan/purchase'">
          <div class="quick-action-icon stat-icon green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span class="quick-action-label">Purchase</span>
        </button>
        <button class="quick-action" onclick="location.hash='/scan/consume'">
          <div class="quick-action-icon stat-icon orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span class="quick-action-label">Consume</span>
        </button>
        <button class="quick-action" onclick="location.hash='/scan/lookup'">
          <div class="quick-action-icon stat-icon blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <span class="quick-action-label">Lookup</span>
        </button>
        <button class="quick-action" onclick="location.hash='/products'">
          <div class="quick-action-icon stat-icon purple">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
          </div>
          <span class="quick-action-label">Products</span>
        </button>
      </div>
    </div>

    <div class="section" id="dash-due-section" style="display:none;">
      <div class="section-header">
        <h2 class="section-title">Expiring Soon</h2>
        <button class="section-action" onclick="location.hash='/stock'">See All</button>
      </div>
      <div class="product-list" id="dash-due-list"></div>
    </div>

    <div class="section" id="dash-expired-section" style="display:none;">
      <div class="section-header">
        <h2 class="section-title">Expired</h2>
      </div>
      <div class="product-list" id="dash-expired-list"></div>
    </div>

    <div class="section" id="dash-missing-section" style="display:none;">
      <div class="section-header">
        <h2 class="section-title">Below Min. Stock</h2>
        <button class="section-action" id="dash-add-missing-btn">Add to List</button>
      </div>
      <div class="product-list" id="dash-missing-list"></div>
    </div>
  `);

  loadDashboardData();
}

async function loadDashboardData() {
  try {
    const [stock, volatileData] = await Promise.all([
      api.getStock(),
      api.getVolatileStock(5),
    ]);

    store.set('stock', stock);
    store.set('volatileStock', volatileData);

    // Cache offline
    store.cacheOffline('stock', stock);
    store.cacheOffline('volatileStock', volatileData);

    renderStats(stock, volatileData);
    renderDueProducts(volatileData.due_products || []);
    renderExpiredProducts(volatileData.expired_products || []);
    renderMissingProducts(volatileData.missing_products || []);

    // Bind add missing button
    const addMissingBtn = document.getElementById('dash-add-missing-btn');
    if (addMissingBtn) {
      addMissingBtn.onclick = async () => {
        try {
          await api.addMissingProductsToShoppingList();
          showToast('Missing products added to shopping list', 'success');
        } catch (e) {
          showToast(e.message, 'error');
        }
      };
    }
  } catch (e) {
    console.error('Dashboard load error:', e);
    // Try offline cache
    const cachedStock = await store.getCachedOffline('stock');
    const cachedVolatile = await store.getCachedOffline('volatileStock');
    if (cachedStock && cachedVolatile) {
      renderStats(cachedStock, cachedVolatile);
      renderDueProducts(cachedVolatile.due_products || []);
      renderExpiredProducts(cachedVolatile.expired_products || []);
      renderMissingProducts(cachedVolatile.missing_products || []);
      showToast('Showing cached data', 'warning');
    } else {
      showToast('Failed to load data. Check connection.', 'error');
    }
  }
}

function renderStats(stock, volatile) {
  const totalProducts = stock.length;
  const expiringSoon = (volatile.due_products || []).length;
  const expired = (volatile.expired_products || []).length + (volatile.overdue_products || []).length;
  const missing = (volatile.missing_products || []).length;

  const statsEl = document.getElementById('dash-stats');
  if (!statsEl) return;

  statsEl.innerHTML = `
    <div class="stat-card" onclick="location.hash='/stock'">
      <div class="stat-icon green">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
          <line x1="3" y1="6" x2="21" y2="6"/>
        </svg>
      </div>
      <span class="stat-value">${totalProducts}</span>
      <span class="stat-label">In Stock</span>
    </div>
    <div class="stat-card" onclick="location.hash='/stock?filter=due'">
      <div class="stat-icon orange">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <span class="stat-value">${expiringSoon}</span>
      <span class="stat-label">Expiring Soon</span>
    </div>
    <div class="stat-card" onclick="location.hash='/stock?filter=expired'">
      <div class="stat-icon red">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>
      <span class="stat-value">${expired}</span>
      <span class="stat-label">Expired</span>
    </div>
    <div class="stat-card" onclick="location.hash='/stock?filter=missing'">
      <div class="stat-icon yellow">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <span class="stat-value">${missing}</span>
      <span class="stat-label">Below Min.</span>
    </div>
  `;
}

function renderProductList(items, containerId, isStock = true) {
  const container = document.getElementById(containerId);
  const section = container?.parentElement;
  if (!container) return;

  if (items.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';

  container.innerHTML = items.slice(0, 10).map(item => {
    const product = isStock ? item.product : item;
    const name = product?.name || item.name || 'Unknown';
    const emoji = getProductEmoji(name);
    const amount = isStock ? formatAmount(item.amount) : formatAmount(item.amount_missing);
    const dueDate = isStock ? item.best_before_date : null;
    const badgeClass = dueDate ? getDueBadgeClass(dueDate) : 'badge-blue';
    const badgeText = dueDate ? formatDate(dueDate) : `Need ${amount}`;
    const productId = product?.id || item.id;

    return `
      <div class="product-item" onclick="location.hash='/product/${productId}'">
        <div class="product-icon">${emoji}</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(name)}</div>
          <div class="product-meta">${isStock ? `${amount} in stock` : 'Below minimum'}</div>
        </div>
        <span class="product-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}

function renderDueProducts(items) {
  renderProductList(items, 'dash-due-list', true);
}

function renderExpiredProducts(items) {
  renderProductList(items, 'dash-expired-list', true);
}

function renderMissingProducts(items) {
  renderProductList(items, 'dash-missing-list', false);
}
