/**
 * Products List Page — Browse and manage all product definitions
 */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  renderPage, setHeader, showToast, getProductEmoji,
  escapeHtml, debounce,
} from '../ui.js';

export function renderProducts() {
  setHeader('Products', false,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
    () => { location.hash = '/product/new'; }
  );

  renderPage(`
    <div class="search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="products-search" placeholder="Search products..." autocomplete="off" autocorrect="off" spellcheck="false">
    </div>

    <div class="chips" id="products-groups">
      <button class="chip active" data-group="all">All</button>
    </div>

    <div id="products-count" class="text-secondary mb-md" style="font-size: 13px; padding: 0 4px;"></div>

    <div class="product-list" id="products-list">
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
    </div>
  `);

  loadProductsData();
}

let _allProducts = [];
let _productGroups = [];
let _currentGroup = 'all';

async function loadProductsData() {
  try {
    const [products, groups] = await Promise.all([
      api.getProducts(),
      api.getProductGroups(),
    ]);

    _allProducts = products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    _productGroups = groups;
    store.set('products', products);
    store.set('productGroups', groups);

    renderGroupChips();
    applyProductFilters();
    setupProductListeners();
  } catch (e) {
    showToast('Failed to load products', 'error');
  }
}

function renderGroupChips() {
  const container = document.getElementById('products-groups');
  if (!container || _productGroups.length === 0) return;

  container.innerHTML = `
    <button class="chip active" data-group="all">All</button>
    ${_productGroups.map(g => `
      <button class="chip" data-group="${g.id}">${escapeHtml(g.name)}</button>
    `).join('')}
  `;
}

function setupProductListeners() {
  const searchInput = document.getElementById('products-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => applyProductFilters(), 200));
  }

  const groupsContainer = document.getElementById('products-groups');
  if (groupsContainer) {
    groupsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      _currentGroup = chip.dataset.group;
      groupsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyProductFilters();
    });
  }
}

function applyProductFilters() {
  const searchInput = document.getElementById('products-search');
  const searchTerm = (searchInput?.value || '').toLowerCase().trim();

  let items = [..._allProducts];

  if (searchTerm) {
    items = items.filter(p =>
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm)
    );
  }

  if (_currentGroup !== 'all') {
    items = items.filter(p => String(p.product_group_id) === String(_currentGroup));
  }

  renderProductsList(items);
}

function renderProductsList(items) {
  const listEl = document.getElementById('products-list');
  const countEl = document.getElementById('products-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = `${items.length} product${items.length !== 1 ? 's' : ''}`;
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
        </div>
        <div class="empty-state-title">No products found</div>
        <div class="empty-state-text">Create your first product or adjust your search</div>
      </div>
    `;
    return;
  }

  const groupMap = {};
  _productGroups.forEach(g => groupMap[g.id] = g.name);

  listEl.innerHTML = items.map(product => {
    const emoji = getProductEmoji(product.name);
    const groupName = product.product_group_id ? groupMap[product.product_group_id] || '' : '';

    return `
      <div class="product-item" onclick="location.hash='/product/${product.id}'">
        <div class="product-icon">${emoji}</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(product.name)}</div>
          <div class="product-meta">${groupName ? escapeHtml(groupName) : 'No group'}</div>
        </div>
        <div class="settings-item-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>
    `;
  }).join('');
}
