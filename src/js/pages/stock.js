/**
 * Stock Overview Page — Browse all stock with search/filter
 */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  renderPage, setHeader, showToast, formatDate, formatAmount,
  getProductEmoji, escapeHtml, getDueBadgeClass, debounce,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

export function renderStock() {
  setHeader('Stock', false);

  renderPage(`
    <div class="search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="stock-search" placeholder="Search products..." autocomplete="off" autocorrect="off" spellcheck="false">
    </div>

    <div class="chips" id="stock-filters">
      <button class="chip active" data-filter="all">All</button>
      <button class="chip" data-filter="due">Expiring Soon</button>
      <button class="chip" data-filter="expired">Expired</button>
      <button class="chip" data-filter="missing">Below Min.</button>
      <button class="chip" data-filter="opened">Opened</button>
    </div>

    <div id="stock-count" class="text-secondary mb-md" style="font-size: 13px; padding: 0 4px;"></div>

    <div class="product-list" id="stock-list">
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
    </div>
  `);

  loadStockData();
  setupStockListeners();
  setRefreshHandler(loadStockData);
}

let _allStock = [];
let _volatileStock = null;
let _currentFilter = 'all';

async function loadStockData() {
  try {
    const [stock, volatile] = await Promise.all([
      api.getStock(),
      api.getVolatileStock(5),
    ]);

    _allStock = stock;
    _volatileStock = volatile;
    store.set('stock', stock);
    store.set('volatileStock', volatile);

    applyFilters();
  } catch (e) {
    showToast('Failed to load stock', 'error');
    // Try offline
    const cached = await store.getCachedOffline('stock');
    if (cached) {
      _allStock = cached;
      applyFilters();
      showToast('Showing cached data', 'warning');
    }
  }
}

function setupStockListeners() {
  // Search
  const searchInput = document.getElementById('stock-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => applyFilters(), 200));
  }

  // Filter chips
  const filtersContainer = document.getElementById('stock-filters');
  if (filtersContainer) {
    filtersContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      _currentFilter = chip.dataset.filter;
      filtersContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyFilters();
    });
  }

  // Check for URL filter params
  const hash = window.location.hash;
  if (hash.includes('filter=due')) {
    _currentFilter = 'due';
    updateFilterChips();
  } else if (hash.includes('filter=expired')) {
    _currentFilter = 'expired';
    updateFilterChips();
  } else if (hash.includes('filter=missing')) {
    _currentFilter = 'missing';
    updateFilterChips();
  }
}

function updateFilterChips() {
  const filtersContainer = document.getElementById('stock-filters');
  if (filtersContainer) {
    filtersContainer.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', c.dataset.filter === _currentFilter);
    });
  }
}

function applyFilters() {
  const searchInput = document.getElementById('stock-search');
  const searchTerm = (searchInput?.value || '').toLowerCase().trim();

  let items = [..._allStock];

  // Apply search
  if (searchTerm) {
    items = items.filter(item =>
      (item.product?.name || '').toLowerCase().includes(searchTerm)
    );
  }

  // Apply filter
  switch (_currentFilter) {
    case 'due':
      if (_volatileStock?.due_products) {
        const dueIds = new Set(_volatileStock.due_products.map(p => p.product_id));
        items = items.filter(i => dueIds.has(i.product_id));
      }
      break;
    case 'expired': {
      const today = new Date().toISOString().split('T')[0];
      items = items.filter(i =>
        i.best_before_date && i.best_before_date !== '2999-12-31' && i.best_before_date < today
      );
      break;
    }
    case 'missing':
      if (_volatileStock?.missing_products) {
        const missingIds = new Set(_volatileStock.missing_products.map(p => p.id));
        items = items.filter(i => missingIds.has(i.product_id));
      }
      break;
    case 'opened':
      items = items.filter(i => parseFloat(i.amount_opened) > 0);
      break;
  }

  // Sort by due date, then name
  items.sort((a, b) => {
    const dateA = a.best_before_date || '2999-12-31';
    const dateB = b.best_before_date || '2999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.product?.name || '').localeCompare(b.product?.name || '');
  });

  renderStockList(items);
}

function renderStockList(items) {
  const listEl = document.getElementById('stock-list');
  const countEl = document.getElementById('stock-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = `${items.length} product${items.length !== 1 ? 's' : ''}`;
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <div class="empty-state-title">No products found</div>
        <div class="empty-state-text">Try adjusting your search or filter</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(item => {
    const product = item.product;
    const name = product?.name || 'Unknown';
    const emoji = getProductEmoji(name);
    const amount = formatAmount(item.amount);
    const opened = parseFloat(item.amount_opened) > 0 ? ` (${formatAmount(item.amount_opened)} open)` : '';
    const dueDate = item.best_before_date;
    const badgeClass = getDueBadgeClass(dueDate);
    const badgeText = formatDate(dueDate);

    return `
      <div class="product-item" onclick="location.hash='/product/${item.product_id}'">
        <div class="product-icon">${emoji}</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(name)}</div>
          <div class="product-meta">${amount}${opened}</div>
        </div>
        <span class="product-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}
