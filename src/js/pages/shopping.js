/**
 * Shopping List Page — View and manage shopping list
 *
 *  • Swipe right→left to reveal red delete action (long swipe = instant delete)
 *  • Single tap = strikethrough (ordered, not delivered)
 *  • Double tap = Purchase card (amount + best-before → confirms + removes item)
 *  • Copy button copies product name to clipboard
 *  • Info (ⓘ) button shows product detail popup
 *  • "Select" toggle → multi-select mode with bulk delete
 *  • No checkboxes
 */
import { api } from '../api.js';
import { store } from '../store.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  getProductEmoji, escapeHtml, debounce, formatAmount,
  dateFromNow, todayStr,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _shoppingItems = [];
let _products = [];
let _quantityUnits = [];
let _locations = [];
let _selectMode = false;
let _selectedIds = new Set();

/* ================================================================
 *  Render entry point
 * ================================================================ */
export function renderShopping() {
  _selectMode = false;
  _selectedIds.clear();

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
        <button class="btn btn-secondary btn-sm" id="shopping-select-toggle" style="flex: 1;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
            <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <span>Select</span>
        </button>
      </div>

      <!-- Select-mode toolbar -->
      <div class="select-toolbar" id="select-toolbar">
        <span class="select-count" id="select-count">0 selected</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-secondary" id="select-unmark">Unmark</button>
          <button class="btn btn-sm btn-danger" id="select-delete">Delete</button>
        </div>
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
  setRefreshHandler(loadShoppingData);
}

/* ================================================================
 *  Data loading
 * ================================================================ */
async function loadShoppingData() {
  try {
    const [items, products, qus, locations] = await Promise.all([
      api.getShoppingListItems(),
      api.getProducts(),
      api.getQuantityUnits(),
      api.getLocations(),
    ]);

    _shoppingItems = items;
    _products = products;
    _quantityUnits = qus;
    _locations = locations;
    store.set('shoppingListItems', items);
    store.set('products', products);

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

/* ================================================================
 *  Top-level listeners
 * ================================================================ */
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

  // Select toggle
  document.getElementById('shopping-select-toggle')?.addEventListener('click', () => {
    _selectMode = !_selectMode;
    _selectedIds.clear();
    const btn = document.getElementById('shopping-select-toggle');
    if (btn) btn.querySelector('span').textContent = _selectMode ? 'Cancel' : 'Select';
    renderShoppingList();
    updateSelectToolbar();
  });

  // Delete selected
  document.getElementById('select-delete')?.addEventListener('click', async () => {
    if (_selectedIds.size === 0) { showToast('Select items first', 'warning'); return; }
    const ids = [..._selectedIds];
    try {
      await Promise.all(ids.map(id => api.deleteObject('shopping_list', id)));
      _shoppingItems = _shoppingItems.filter(i => !ids.includes(String(i.id)));
      _selectedIds.clear();
      renderShoppingList();
      updateSelectToolbar();
      showToast(`Removed ${ids.length} item${ids.length > 1 ? 's' : ''}`, 'info');
    } catch (e) {
      showToast('Failed to delete items', 'error');
    }
  });

  // Unmark selected (remove strikethrough / ordered status)
  document.getElementById('select-unmark')?.addEventListener('click', async () => {
    if (_selectedIds.size === 0) { showToast('Select items first', 'warning'); return; }
    const ids = [..._selectedIds];
    const toUnmark = _shoppingItems.filter(i => ids.includes(String(i.id)) && i.done == 1);
    if (toUnmark.length === 0) { showToast('No ordered items in selection', 'info'); return; }
    try {
      await Promise.all(toUnmark.map(i => api.editObject('shopping_list', i.id, { done: 0 })));
      toUnmark.forEach(i => i.done = 0);
      _selectedIds.clear();
      renderShoppingList();
      updateSelectToolbar();
      showToast(`Unmarked ${toUnmark.length} item${toUnmark.length > 1 ? 's' : ''}`, 'success');
    } catch (e) {
      showToast('Failed to unmark items', 'error');
    }
  });
}

function updateSelectToolbar() {
  const toolbar = document.getElementById('select-toolbar');
  if (toolbar) toolbar.classList.toggle('visible', _selectMode);
  const countEl = document.getElementById('select-count');
  if (countEl) countEl.textContent = `${_selectedIds.size} selected`;
}

/* ================================================================
 *  Render the list
 * ================================================================ */
function renderShoppingList() {
  const listEl = document.getElementById('shopping-list');
  const countEl = document.getElementById('shopping-count');
  if (!listEl) return;

  const productMap = {};
  _products.forEach(p => productMap[p.id] = p);
  const quMap = {};
  _quantityUnits.forEach(q => quMap[q.id] = q);

  // Sort: non-ordered first, then by name
  const sorted = [..._shoppingItems].sort((a, b) => {
    const doneA = a.done == 1 ? 1 : 0;
    const doneB = b.done == 1 ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    const nameA = a.product_id ? (productMap[a.product_id]?.name || '') : (a.note || '');
    const nameB = b.product_id ? (productMap[b.product_id]?.name || '') : (b.note || '');
    return nameA.localeCompare(nameB);
  });

  const orderedCount = sorted.filter(i => i.done == 1).length;
  const totalCount = sorted.length;
  if (countEl) {
    countEl.textContent = `${totalCount} item${totalCount !== 1 ? 's' : ''}${orderedCount > 0 ? ` (${orderedCount} ordered)` : ''}`;
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
    const ordered = item.done == 1;
    const note = item.note && product ? item.note : '';
    const isSelected = _selectedIds.has(String(item.id));

    return `
      <div class="shopping-item-wrapper" data-item-id="${item.id}">
        <div class="shopping-swipe-bg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </div>
        <div class="shopping-item${ordered ? ' ordered' : ''}${isSelected ? ' selected' : ''}" data-item-id="${item.id}" data-product-id="${item.product_id || ''}">
          <div class="select-check${isSelected ? ' checked' : ''}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="product-icon" style="font-size: 18px;">${emoji}</div>
          <div class="product-info" style="flex:1;min-width:0;">
            <div class="product-name">${escapeHtml(name)}</div>
            <div class="product-meta">${formatAmount(amount)} ${escapeHtml(unitName)}${note ? ` · ${escapeHtml(note)}` : ''}</div>
          </div>
          <div class="shopping-item-actions">
            <button class="shopping-btn-icon copy-btn" data-name="${escapeHtml(name)}" title="Copy name">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </button>
            ${product ? `
            <button class="shopping-btn-icon info-btn" data-product-id="${product.id}" title="Product info">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Keep select mode class in sync on re-render
  listEl.classList.toggle('select-mode-active', _selectMode);

  attachItemListeners(listEl, productMap, quMap);
}

/* ================================================================
 *  Per-item event handling: tap, double-tap, swipe, buttons
 * ================================================================ */
function attachItemListeners(listEl, productMap, quMap) {
  listEl.querySelectorAll('.shopping-item-wrapper').forEach(wrapper => {
    const itemEl = wrapper.querySelector('.shopping-item');
    const swipeBg = wrapper.querySelector('.shopping-swipe-bg');
    const itemId = wrapper.dataset.itemId;

    // --- Swipe-to-delete ---
    let startX = 0, currentX = 0, swiping = false;
    const SWIPE_THRESHOLD = 80;   // reveal delete
    const SWIPE_DELETE = 160;     // auto-delete

    itemEl.addEventListener('touchstart', (e) => {
      if (_selectMode) return;
      startX = e.touches[0].clientX;
      currentX = startX;
      swiping = true;
      itemEl.style.transition = 'none';
    }, { passive: true });

    itemEl.addEventListener('touchmove', (e) => {
      if (!swiping || _selectMode) return;
      currentX = e.touches[0].clientX;
      let dx = currentX - startX;
      if (dx > 0) dx = 0; // only left swipe
      itemEl.style.transform = `translateX(${dx}px)`;
      swipeBg.classList.toggle('visible', dx < -30);
    }, { passive: true });

    itemEl.addEventListener('touchend', () => {
      if (!swiping || _selectMode) return;
      swiping = false;
      const dx = currentX - startX;
      itemEl.style.transition = 'transform 0.25s ease';

      if (dx < -SWIPE_DELETE) {
        // Instant delete — slide off
        itemEl.style.transform = 'translateX(-120%)';
        deleteItem(itemId);
      } else {
        // Snap back
        itemEl.style.transform = 'translateX(0)';
        swipeBg.classList.remove('visible');
      }
    });

    // --- Copy button ---
    wrapper.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.dataset.name;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(name).then(() => showToast('Copied to clipboard', 'success'));
        } else {
          showToast('Clipboard not available', 'warning');
        }
      });
    });

    // --- Info button ---
    wrapper.querySelectorAll('.info-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.dataset.productId;
        showProductInfoPopup(pid, productMap, quMap);
      });
    });

    // --- Single tap ---
    itemEl.addEventListener('click', (e) => {
      // Ignore if swiped or button clicked
      if (Math.abs(currentX - startX) > 10) return;
      if (e.target.closest('.shopping-btn-icon')) return;

      // Select mode: toggle selection
      if (_selectMode) {
        toggleSelection(itemId, itemEl);
        return;
      }

      const item = _shoppingItems.find(i => String(i.id) === String(itemId));
      if (!item) return;

      if (item.done == 1) {
        // Already ordered → show purchase card
        showPurchaseCard(item, productMap, quMap);
      } else {
        // Not ordered → mark as ordered (strikethrough)
        toggleOrdered(item, itemEl);
      }
    });
  });
}

/* ================================================================
 *  Helpers: selection, delete, ordered toggle
 * ================================================================ */
function toggleSelection(itemId, itemEl) {
  const id = String(itemId);
  if (_selectedIds.has(id)) {
    _selectedIds.delete(id);
    itemEl.classList.remove('selected');
    itemEl.querySelector('.select-check')?.classList.remove('checked');
  } else {
    _selectedIds.add(id);
    itemEl.classList.add('selected');
    itemEl.querySelector('.select-check')?.classList.add('checked');
  }
  updateSelectToolbar();
}

async function deleteItem(itemId) {
  try {
    await api.deleteObject('shopping_list', itemId);
    _shoppingItems = _shoppingItems.filter(i => String(i.id) !== String(itemId));
    _selectedIds.delete(String(itemId));
    // Small delay for animation then re-render
    setTimeout(() => renderShoppingList(), 300);
    showToast('Item removed', 'info');
  } catch (e) {
    showToast('Failed to remove item', 'error');
    renderShoppingList(); // snap back
  }
}

async function toggleOrdered(item, itemEl) {
  const newDone = item.done == 1 ? 0 : 1;
  try {
    await api.editObject('shopping_list', item.id, { done: newDone });
    item.done = newDone;
    itemEl.classList.toggle('ordered', newDone === 1);
    // Update the product-name span directly for instant feedback
    const nameEl = itemEl.querySelector('.product-name');
    if (nameEl) {
      nameEl.style.textDecoration = newDone ? 'line-through' : 'none';
      nameEl.style.color = newDone ? 'var(--color-text-tertiary)' : '';
    }
  } catch (e) {
    showToast('Failed to update item', 'error');
  }
}

/* ================================================================
 *  Purchase card (double-tap)
 * ================================================================ */
function showPurchaseCard(item, productMap, quMap) {
  const product = item.product_id ? productMap[item.product_id] : null;
  const name = product ? product.name : (item.note || 'Unknown item');
  const emoji = product ? getProductEmoji(product.name) : '📝';
  const defaultAmount = parseFloat(item.amount) || 1;

  const locationOpts = _locations.map(l =>
    `<option value="${l.id}"${product && String(l.id) === String(product.location_id) ? ' selected' : ''}>${escapeHtml(l.name)}</option>`
  ).join('');

  const bbDays = product?.default_best_before_days || 0;

  showModal('Purchase', `
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
      <span style="font-size: 36px;">${emoji}</span>
      <div>
        <div style="font-weight: 600; font-size: 17px;">${escapeHtml(name)}</div>
        <div class="text-secondary">from shopping list</div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Amount</label>
      <div class="number-stepper">
        <button class="stepper-btn" data-action="decrement">−</button>
        <input type="number" id="modal-amount" class="stepper-value" value="${defaultAmount}" min="0.01" step="1">
        <button class="stepper-btn" data-action="increment">+</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Best before</label>
      <input type="date" id="modal-date" class="form-input" value="${dateFromNow(bbDays)}">
    </div>
    ${_locations.length ? `
    <div class="form-group">
      <label class="form-label">Location</label>
      <select id="modal-location" class="form-input">${locationOpts}</select>
    </div>
    ` : ''}
    <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Purchase & Remove from List</button>
  `);

  // Stepper
  setTimeout(() => {
    document.querySelectorAll('.modal-content .stepper-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('modal-amount');
        if (!input) return;
        let val = parseFloat(input.value) || 0;
        if (btn.dataset.action === 'increment') val += 1;
        else val = Math.max(0.01, val - 1);
        input.value = val;
      });
    });
  }, 50);

  // Confirm
  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('modal-amount')?.value || 1);
    const date = document.getElementById('modal-date')?.value || todayStr();
    const locationId = document.getElementById('modal-location')?.value;
    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Processing…'; }

    try {
      // Purchase into stock
      if (product) {
        await api.addProductToStock(product.id, amount, date, undefined, locationId ? parseInt(locationId) : undefined);
      }
      // Remove from shopping list
      await api.deleteObject('shopping_list', item.id);
      _shoppingItems = _shoppingItems.filter(i => String(i.id) !== String(item.id));

      showToast(`Purchased ${formatAmount(amount)} × ${name}`, 'success');
      closeModal();
      renderShoppingList();
    } catch (e) {
      showToast(e.message, 'error');
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Purchase & Remove from List'; }
    }
  });
}

/* ================================================================
 *  Product info popup (ⓘ button)
 * ================================================================ */
async function showProductInfoPopup(productId, productMap, quMap) {
  const product = productMap[productId];
  if (!product) return;

  const emoji = getProductEmoji(product.name);
  const qu = quMap[product.qu_id_stock];
  const quName = qu ? qu.name : '';
  let stockAmount = '…';

  try {
    const stockData = await api.getProductDetails(productId);
    stockAmount = formatAmount(stockData?.stock_amount ?? 0);
  } catch (_) {
    stockAmount = '—';
  }

  showModal(product.name, `
    <div style="text-align: center; margin-bottom: 16px;">
      <span style="font-size: 48px;">${emoji}</span>
    </div>
    <div class="settings-list" style="margin-bottom: 16px;">
      <div class="settings-item"><span>In Stock</span><span class="text-secondary">${stockAmount} ${escapeHtml(quName)}</span></div>
      ${product.min_stock_amount > 0 ? `<div class="settings-item"><span>Min. Stock</span><span class="text-secondary">${formatAmount(product.min_stock_amount)}</span></div>` : ''}
      ${product.default_best_before_days > 0 ? `<div class="settings-item"><span>Default Best Before</span><span class="text-secondary">${product.default_best_before_days} days</span></div>` : ''}
      ${product.location_id ? `<div class="settings-item"><span>Location</span><span class="text-secondary">${escapeHtml(_locations.find(l => l.id == product.location_id)?.name || '—')}</span></div>` : ''}
      ${product.description ? `<div class="settings-item"><span>Description</span><span class="text-secondary" style="max-width:200px;text-align:right;">${escapeHtml(product.description)}</span></div>` : ''}
    </div>
    <button class="btn btn-primary" style="width: 100%;" onclick="location.hash='/product/${product.id}'; document.querySelector('.modal-overlay')?.remove();">View Full Details</button>
  `);
}

/* ================================================================
 *  Add item modal (from header + button)
 * ================================================================ */
function showAddItemModal() {
  showModal('Add to Shopping List', `
    <div class="form-group">
      <label class="form-label">Product</label>
      <div class="search-bar" style="margin-bottom: 0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" id="add-item-search" placeholder="Search products…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
      </div>
      <div id="add-item-product-list" style="max-height: 40vh; overflow-y: auto; -webkit-overflow-scrolling: touch; margin-top: 8px;"></div>
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
      const q = filter.toLowerCase();
      filtered = _products.filter(p => (p.name || '').toLowerCase().includes(q));
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
        const searchBar = document.querySelector('#add-item-search')?.parentElement;
        if (searchBar) searchBar.style.display = 'none';
        document.getElementById('add-item-form').style.display = 'block';
      });
    });
  };

  // Render initial list after modal paints
  requestAnimationFrame(() => {
    renderProductSelector();
    const searchInput = document.getElementById('add-item-search');
    if (searchInput) {
      const onSearch = () => renderProductSelector(searchInput.value);
      searchInput.addEventListener('input', onSearch);
      searchInput.addEventListener('keyup', onSearch);
      searchInput.focus();
    }
  });

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

/* ================================================================
 *  Auto-remove helper — call after purchase in scan/product pages
 * ================================================================ */
export async function removeFromShoppingListIfNeeded(productId, purchasedAmount) {
  try {
    const items = store.get('shoppingListItems') || [];
    const match = items.find(i => String(i.product_id) === String(productId));
    if (!match) return;
    const neededAmount = parseFloat(match.amount) || 1;
    if (purchasedAmount >= neededAmount) {
      await api.deleteObject('shopping_list', match.id);
      // Update local store
      const updated = items.filter(i => String(i.id) !== String(match.id));
      store.set('shoppingListItems', updated);
    }
  } catch (_) {
    // Non-critical — ignore silently
  }
}
