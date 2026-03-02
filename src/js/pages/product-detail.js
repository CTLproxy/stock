/**
 * Product Detail Page — View and manage a single product
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { removeFromShoppingListIfNeeded } from './shopping.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  formatDate, formatDateFull, formatAmount, formatPrice,
  getProductEmoji, escapeHtml, getDueBadgeClass, todayStr, dateFromNow,
} from '../ui.js';

let _product = null;
let _stockEntries = [];
let _locations = [];
let _quantityUnits = [];

export async function renderProductDetail(params) {
  const productId = params.id;
  if (!productId) { location.hash = '/products'; return; }

  setHeader('Product', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const [productStock, products, locations, qus] = await Promise.all([
      api.getProductEntries(productId),
      api.getProducts(),
      api.getLocations(),
      api.getQuantityUnits(),
    ]);

    _product = products.find(p => String(p.id) === String(productId));
    _stockEntries = productStock;
    _locations = locations;
    _quantityUnits = qus;

    if (!_product) {
      renderPage(`<div class="empty-state"><div class="empty-state-title">Product not found</div></div>`);
      return;
    }

    setHeader(escapeHtml(_product.name), true);
    renderDetailPage();
  } catch (e) {
    showToast('Failed to load product', 'error');
    renderPage(`<div class="empty-state"><div class="empty-state-title">Error loading product</div><div class="empty-state-text">${escapeHtml(e.message)}</div></div>`);
  }
}

function renderDetailPage() {
  const p = _product;
  const emoji = getProductEmoji(p.name);
  const quStock = _quantityUnits.find(q => String(q.id) === String(p.qu_id_stock));
  const quUnit = quStock?.name || 'unit';
  const quUnitPlural = quStock?.name_plural || `${quUnit}s`;

  // Aggregate stock info
  const totalAmount = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const openedAmount = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount_opened || 0), 0);
  const earliestDate = _stockEntries
    .map(e => e.best_before_date)
    .filter(d => d && d !== '2999-12-31')
    .sort()[0];

  const locationMap = {};
  _locations.forEach(l => locationMap[l.id] = l.name);
  const defaultLocation = p.location_id ? locationMap[p.location_id] || 'Unknown' : 'Not set';

  renderPage(`
    <div class="detail-header">
      <div class="detail-hero">
        <span class="detail-emoji">${emoji}</span>
        <h1 class="detail-name">${escapeHtml(p.name)}</h1>
        ${p.product_group_id ? `<span class="detail-subtitle">${escapeHtml(store.get('productGroups')?.find(g => String(g.id) === String(p.product_group_id))?.name || '')}</span>` : ''}
      </div>
    </div>

    <div class="section">
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">${formatAmount(totalAmount)}</span>
          <span class="stat-label">${totalAmount === 1 ? quUnit : quUnitPlural}</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${formatAmount(openedAmount)}</span>
          <span class="stat-label">Opened</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${earliestDate ? formatDate(earliestDate) : '—'}</span>
          <span class="stat-label">Best Before</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${escapeHtml(defaultLocation)}</span>
          <span class="stat-label">Location</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Actions</h2>
      </div>
      <div class="quick-actions">
        <button class="quick-action" id="action-purchase">
          <div class="quick-action-icon stat-icon green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <span class="quick-action-label">Purchase</span>
        </button>
        <button class="quick-action" id="action-consume"${totalAmount <= 0 ? ' disabled' : ''}>
          <div class="quick-action-icon stat-icon orange">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <span class="quick-action-label">Consume</span>
        </button>
        <button class="quick-action" id="action-open"${(totalAmount - openedAmount) <= 0 ? ' disabled' : ''}>
          <div class="quick-action-icon stat-icon blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span class="quick-action-label">Open</span>
        </button>
        <button class="quick-action" id="action-inventory">
          <div class="quick-action-icon stat-icon purple">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            </svg>
          </div>
          <span class="quick-action-label">Inventory</span>
        </button>
      </div>
    </div>

    ${_stockEntries.length > 0 ? `
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Stock Entries</h2>
      </div>
      <div class="product-list" id="stock-entries-list"></div>
    </div>
    ` : ''}

    <div class="section" style="padding-bottom: 32px;">
      <div class="section-header">
        <h2 class="section-title">Info</h2>
      </div>
      <div class="settings-group">
        <div class="settings-item">
          <span>Location</span>
          <span class="text-secondary">${escapeHtml(defaultLocation)}</span>
        </div>
        <div class="settings-item">
          <span>Stock Unit</span>
          <span class="text-secondary">${escapeHtml(quUnit)}</span>
        </div>
        <div class="settings-item">
          <span>Min. Stock</span>
          <span class="text-secondary">${formatAmount(p.min_stock_amount || 0)} ${quUnitPlural}</span>
        </div>
        ${p.default_best_before_days > 0 ? `
          <div class="settings-item">
            <span>Default Shelf Life</span>
            <span class="text-secondary">${p.default_best_before_days} days</span>
          </div>
        ` : ''}
        ${p.description ? `
          <div class="settings-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">
            <span>Description</span>
            <span class="text-secondary" style="font-size: 13px;">${escapeHtml(p.description)}</span>
          </div>
        ` : ''}
        ${p.barcode ? `
          <div class="settings-item">
            <span>Barcode</span>
            <span class="text-secondary">${escapeHtml(p.barcode)}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `);

  renderStockEntries();
  setupActionButtons();
}

function renderStockEntries() {
  const container = document.getElementById('stock-entries-list');
  if (!container) return;

  const locationMap = {};
  _locations.forEach(l => locationMap[l.id] = l.name);

  container.innerHTML = _stockEntries.map((entry, idx) => {
    const loc = locationMap[entry.location_id] || 'Unknown';
    const amount = formatAmount(entry.amount);
    const opened = parseFloat(entry.amount_opened) > 0 ? ' (opened)' : '';
    const dueDate = entry.best_before_date;
    const badgeClass = getDueBadgeClass(dueDate);
    const badgeText = formatDate(dueDate);

    return `
      <div class="product-item">
        <div class="product-icon" style="font-size: 14px; min-width: 36px; height: 36px; border-radius: 10px;">
          #${idx + 1}
        </div>
        <div class="product-info">
          <div class="product-name">${amount}${opened}</div>
          <div class="product-meta">${escapeHtml(loc)} · Purchased ${formatDate(entry.purchased_date)}</div>
        </div>
        <span class="product-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}

function setupActionButtons() {
  const quStock = _quantityUnits.find(q => String(q.id) === String(_product.qu_id_stock));
  const quUnit = quStock?.name || 'unit';

  document.getElementById('action-purchase')?.addEventListener('click', () => {
    showModal('Purchase', `
      <div class="form-group">
        <label class="form-label">Amount</label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">−</button>
          <input type="number" id="modal-amount" class="stepper-value" value="1" min="0.01" step="1">
          <button class="stepper-btn" data-action="increment">+</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Best before</label>
        <input type="date" id="modal-date" class="form-input" value="${dateFromNow(_product.default_best_before_days || 0)}">
      </div>
      <div class="form-group">
        <label class="form-label">Price</label>
        <input type="number" id="modal-price" class="form-input" placeholder="Optional" step="0.01" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Location</label>
        <select id="modal-location" class="form-input">
          ${_locations.map(l => `<option value="${l.id}" ${String(l.id) === String(_product.location_id) ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Add to Stock</button>
    `);
    setupStepperAndConfirm('purchase');
  });

  document.getElementById('action-consume')?.addEventListener('click', () => {
    const totalAmount = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    showModal('Consume', `
      <div class="form-group">
        <label class="form-label">Amount (max ${formatAmount(totalAmount)})</label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">−</button>
          <input type="number" id="modal-amount" class="stepper-value" value="1" min="0.01" max="${totalAmount}" step="1">
          <button class="stepper-btn" data-action="increment">+</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="modal-spoiled"> Mark as spoiled
        </label>
      </div>
      <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Consume</button>
    `);
    setupStepperAndConfirm('consume');
  });

  document.getElementById('action-open')?.addEventListener('click', () => {
    const unopened = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0) - parseFloat(e.amount_opened || 0), 0);
    showModal('Mark as Opened', `
      <div class="form-group">
        <label class="form-label">Amount to open (max ${formatAmount(unopened)})</label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">−</button>
          <input type="number" id="modal-amount" class="stepper-value" value="1" min="0.01" max="${unopened}" step="1">
          <button class="stepper-btn" data-action="increment">+</button>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Mark Opened</button>
    `);
    setupStepperAndConfirm('open');
  });

  document.getElementById('action-inventory')?.addEventListener('click', () => {
    const totalAmount = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    showModal('Inventory Correction', `
      <div class="form-group">
        <label class="form-label">New amount</label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">−</button>
          <input type="number" id="modal-amount" class="stepper-value" value="${formatAmount(totalAmount)}" min="0" step="1">
          <button class="stepper-btn" data-action="increment">+</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Best before</label>
        <input type="date" id="modal-date" class="form-input" value="${dateFromNow(_product.default_best_before_days || 0)}">
      </div>
      <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Update Inventory</button>
    `);
    setupStepperAndConfirm('inventory');
  });
}

function setupStepperAndConfirm(action) {
  // Stepper buttons
  document.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('modal-amount');
      if (!input) return;
      const step = parseFloat(input.step) || 1;
      let val = parseFloat(input.value) || 0;
      if (btn.dataset.action === 'increment') val += step;
      else val = Math.max(parseFloat(input.min) || 0, val - step);
      if (input.max && val > parseFloat(input.max)) val = parseFloat(input.max);
      input.value = val;
    });
  });

  // Confirm button
  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('modal-amount')?.value || 0);
    if (amount <= 0 && action !== 'inventory') {
      showToast('Enter a valid amount', 'error');
      return;
    }

    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Working…';
    }

    try {
      switch (action) {
        case 'purchase': {
          const date = document.getElementById('modal-date')?.value || todayStr();
          const price = document.getElementById('modal-price')?.value;
          const locationId = document.getElementById('modal-location')?.value;
          await api.addProductToStock(_product.id, amount, date, price ? parseFloat(price) : undefined, locationId ? parseInt(locationId) : undefined);
          removeFromShoppingListIfNeeded(_product.id, amount);
          showToast(`Added ${formatAmount(amount)} to stock`, 'success');
          break;
        }
        case 'consume': {
          const spoiled = document.getElementById('modal-spoiled')?.checked || false;
          await api.consumeProduct(_product.id, amount, spoiled);
          showToast(`Consumed ${formatAmount(amount)}`, 'success');
          break;
        }
        case 'open': {
          await api.openProduct(_product.id, amount);
          showToast(`Opened ${formatAmount(amount)}`, 'success');
          break;
        }
        case 'inventory': {
          const date = document.getElementById('modal-date')?.value;
          await api.inventoryProduct(_product.id, amount, date || undefined);
          showToast('Inventory updated', 'success');
          break;
        }
      }

      closeModal();
      // Refresh
      const newEntries = await api.getProductEntries(_product.id);
      _stockEntries = newEntries;
      renderDetailPage();
    } catch (e) {
      showToast(e.message, 'error');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Retry';
      }
    }
  });
}
