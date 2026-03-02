/**
 * Shopping List Page — View and manage shopping list
 */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  getProductEmoji, escapeHtml, debounce, formatAmount,
} from '../ui.js';

let _shoppingItems = [];
let _products = [];
let _quantityUnits = [];

export function renderShopping() {
  setHeader('Shopping List', false,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
    showAddItemModal
  );

  renderPage(`
    <div class="section">
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <button class="btn btn-secondary btn-sm" id="shopping-add-missing" style="flex: 1;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
          Add Missing
        </button>
        <button class="btn btn-secondary btn-sm" id="shopping-clear-done" style="flex: 1;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Clear Done
        </button>
      </div>

      <div id="shopping-count" class="text-secondary mb-md" style="font-size: 13px; padding: 0 4px;"></div>

      <div class="product-list" id="shopping-list">
        <div class="skeleton skeleton-rect"></div>
        <div class="skeleton skeleton-rect"></div>
        <div class="skeleton skeleton-rect"></div>
      </div>
    </div>
  `);

  loadShoppingData();
  setupShoppingListeners();
}

async function loadShoppingData() {
  try {
    const [items, products, qus] = await Promise.all([
      api.getShoppingListItems(),
      api.getProducts(),
      api.getQuantityUnits(),
    ]);

    _shoppingItems = items;
    _products = products;
    _quantityUnits = qus;
    store.set('shoppingListItems', items);

    renderShoppingList();
  } catch (e) {
    showToast('Failed to load shopping list', 'error');
    const cached = await store.getCachedOffline('shoppingListItems');
    if (cached) {
      _shoppingItems = cached;
      renderShoppingList();
      showToast('Showing cached data', 'warning');
    }
  }
}

function setupShoppingListeners() {
  document.getElementById('shopping-add-missing')?.addEventListener('click', async () => {
    try {
      await api.addMissingProductsToShoppingList();
      showToast('Missing products added', 'success');
      loadShoppingData();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  document.getElementById('shopping-clear-done')?.addEventListener('click', async () => {
    try {
      await api.clearShoppingList(true); // done_only
      showToast('Cleared done items', 'success');
      loadShoppingData();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}

function renderShoppingList() {
  const listEl = document.getElementById('shopping-list');
  const countEl = document.getElementById('shopping-count');
  if (!listEl) return;

  const productMap = {};
  _products.forEach(p => productMap[p.id] = p);

  const quMap = {};
  _quantityUnits.forEach(q => quMap[q.id] = q);

  // Sort: undone first, then by product name
  const sorted = [..._shoppingItems].sort((a, b) => {
    const doneA = a.done == 1 ? 1 : 0;
    const doneB = b.done == 1 ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    const nameA = a.product_id ? (productMap[a.product_id]?.name || '') : (a.note || '');
    const nameB = b.product_id ? (productMap[b.product_id]?.name || '') : (b.note || '');
    return nameA.localeCompare(nameB);
  });

  const doneCount = sorted.filter(i => i.done == 1).length;
  const totalCount = sorted.length;
  if (countEl) {
    countEl.textContent = `${totalCount} item${totalCount !== 1 ? 's' : ''}${doneCount > 0 ? ` (${doneCount} done)` : ''}`;
  }

  if (sorted.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
            <line x1="3" y1="6" x2="21" y2="6"/>
            <path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <div class="empty-state-title">Shopping list is empty</div>
        <div class="empty-state-text">Add products or tap "Add Missing" to fill from stock</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = sorted.map(item => {
    const product = item.product_id ? productMap[item.product_id] : null;
    const name = product ? product.name : (item.note || 'Unknown item');
    const emoji = product ? getProductEmoji(product.name) : '📝';
    const qu = item.qu_id ? quMap[item.qu_id] : (product ? quMap[product.qu_id_stock] : null);
    const unitName = qu ? qu.name : '';
    const amount = parseFloat(item.amount) || 1;
    const done = item.done == 1;
    const note = item.note && product ? item.note : '';

    return `
      <div class="shopping-item ${done ? 'done' : ''}" data-item-id="${item.id}">
        <label class="shopping-checkbox">
          <input type="checkbox" ${done ? 'checked' : ''} data-item-id="${item.id}">
          <span class="checkmark"></span>
        </label>
        <div class="product-icon" style="font-size: 18px;">${emoji}</div>
        <div class="product-info">
          <div class="product-name" style="${done ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${escapeHtml(name)}</div>
          <div class="product-meta">${formatAmount(amount)} ${escapeHtml(unitName)}${note ? ` · ${escapeHtml(note)}` : ''}</div>
        </div>
        <button class="btn-icon delete-shopping-item" data-item-id="${item.id}" title="Remove" style="opacity: 0.5; padding: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Checkbox listeners
  listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const itemId = e.target.dataset.itemId;
      const done = e.target.checked;
      try {
        await api.editObject('shopping_list', itemId, { done: done ? 1 : 0 });
        // Update local state
        const item = _shoppingItems.find(i => String(i.id) === String(itemId));
        if (item) item.done = done ? 1 : 0;
        renderShoppingList();
      } catch (err) {
        showToast('Failed to update item', 'error');
        e.target.checked = !done;
      }
    });
  });

  // Delete listeners
  listEl.querySelectorAll('.delete-shopping-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const itemId = btn.dataset.itemId;
      try {
        await api.deleteObject('shopping_list', itemId);
        _shoppingItems = _shoppingItems.filter(i => String(i.id) !== String(itemId));
        renderShoppingList();
        showToast('Item removed', 'info');
      } catch (err) {
        showToast('Failed to remove item', 'error');
      }
    });
  });
}

function showAddItemModal() {
  showModal('Add to Shopping List', `
    <div class="form-group">
      <label class="form-label">Product</label>
      <div class="search-bar" style="margin-bottom: 0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" id="add-item-search" placeholder="Search products..." autocomplete="off">
      </div>
      <div class="product-list" id="add-item-product-list" style="max-height: 40vh; overflow-y: auto; margin-top: 8px;"></div>
    </div>
    <div id="add-item-form" style="display: none;">
      <input type="hidden" id="add-item-product-id">
      <div class="form-group">
        <label class="form-label" id="add-item-product-name" style="font-weight: 600; font-size: 15px;"></label>
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">−</button>
          <input type="number" id="add-item-amount" class="stepper-value" value="1" min="0.01" step="1">
          <button class="stepper-btn" data-action="increment">+</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input type="text" id="add-item-note" class="form-input" placeholder="e.g. organic">
      </div>
      <button class="btn btn-primary" style="width: 100%;" id="add-item-confirm">Add to List</button>
    </div>
  `);

  const renderProductSelector = (filter = '') => {
    const listEl = document.getElementById('add-item-product-list');
    if (!listEl) return;
    let filtered = _products;
    if (filter) {
      filtered = _products.filter(p => (p.name || '').toLowerCase().includes(filter.toLowerCase()));
    }
    listEl.innerHTML = filtered.slice(0, 30).map(p => `
      <div class="product-item" data-product-id="${p.id}" style="cursor: pointer;">
        <div class="product-icon">${getProductEmoji(p.name)}</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(p.name)}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.product-item').forEach(item => {
      item.addEventListener('click', () => {
        const productId = item.dataset.productId;
        const product = _products.find(p => String(p.id) === String(productId));
        if (!product) return;

        document.getElementById('add-item-product-id').value = productId;
        document.getElementById('add-item-product-name').textContent = product.name;
        document.getElementById('add-item-product-list').style.display = 'none';
        document.querySelector('#add-item-search')?.parentElement && (document.querySelector('#add-item-search').parentElement.style.display = 'none');
        document.getElementById('add-item-form').style.display = 'block';
      });
    });
  };

  renderProductSelector();

  document.getElementById('add-item-search')?.addEventListener('input', debounce((e) => {
    renderProductSelector(e.target.value);
  }, 200));

  // Stepper
  setTimeout(() => {
    document.querySelectorAll('.modal-content .stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('add-item-amount');
        if (!input) return;
        let val = parseFloat(input.value) || 0;
        if (btn.dataset.action === 'increment') val += 1;
        else val = Math.max(0.01, val - 1);
        input.value = val;
      });
    });
  }, 50);

  // Confirm
  document.getElementById('add-item-confirm')?.addEventListener('click', async () => {
    const productId = document.getElementById('add-item-product-id')?.value;
    const amount = parseFloat(document.getElementById('add-item-amount')?.value || 1);
    const note = document.getElementById('add-item-note')?.value || '';

    if (!productId) {
      showToast('Select a product', 'error');
      return;
    }

    try {
      await api.addProductToShoppingList(parseInt(productId), amount, note || undefined);
      showToast('Added to shopping list', 'success');
      closeModal();
      loadShoppingData();
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
}
