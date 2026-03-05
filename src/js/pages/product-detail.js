/**
 * Product Detail Page - View, Edit, Create, and manage a single product
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { removeFromShoppingListIfNeeded } from './shopping.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  formatDate, formatDateFull, formatAmount, formatPrice,
  getProductEmoji, escapeHtml, getDueBadgeClass, todayStr, dateFromNow,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _product = null;
let _stockEntries = [];
let _locations = [];
let _quantityUnits = [];
let _productGroups = [];
let _barcodes = [];
let _editMode = false;
let _isNew = false;
let _currentTab = 'details';

/* =================================================================
   Public: Render product detail (view / edit existing product)
   ================================================================= */
export async function renderProductDetail(params) {
  const productId = params.id;
  if (!productId) { location.hash = '/products'; return; }

  _isNew = false;
  _editMode = false;
  _currentTab = 'details';

  setHeader('Product', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const [productStock, products, locations, qus, groups, barcodes] = await Promise.all([
      api.getProductEntries(productId),
      api.getProducts(),
      api.getLocations(),
      api.getQuantityUnits(),
      api.getProductGroups(),
      api.getProductBarcodes(),
    ]);

    _product = products.find(p => String(p.id) === String(productId));
    _stockEntries = productStock;
    _locations = locations;
    _quantityUnits = qus;
    _productGroups = groups;
    _barcodes = barcodes.filter(b => String(b.product_id) === String(productId));

    if (!_product) {
      renderPage(`<div class="empty-state"><div class="empty-state-title">Product not found</div></div>`);
      return;
    }

    setHeader(escapeHtml(_product.name), true);
    renderViewPage();
    setRefreshHandler(() => renderProductDetail(params));
  } catch (e) {
    showToast('Failed to load product', 'error');
    renderPage(`<div class="empty-state"><div class="empty-state-title">Error loading product</div><div class="empty-state-text">${escapeHtml(String(e.message || e))}</div></div>`);
  }
}

/* =================================================================
   Public: Render create-new-product form
   ================================================================= */
export async function renderProductCreate() {
  _isNew = true;
  _editMode = true;
  _currentTab = 'details';
  _product = {
    name: '', description: '', location_id: '', qu_id_stock: '',
    qu_id_purchase: '', product_group_id: '', min_stock_amount: 0,
    default_best_before_days: 0,
  };
  _stockEntries = [];
  _barcodes = [];

  setHeader('New Product', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const [locations, qus, groups] = await Promise.all([
      api.getLocations(),
      api.getQuantityUnits(),
      api.getProductGroups(),
    ]);
    _locations = locations;
    _quantityUnits = qus;
    _productGroups = groups;

    renderEditPage();
  } catch (e) {
    showToast('Failed to load form data', 'error');
    renderPage(`<div class="empty-state"><div class="empty-state-title">Error</div><div class="empty-state-text">${escapeHtml(String(e.message || e))}</div></div>`);
  }
}

/* =================================================================
   VIEW PAGE - show product info, stats, actions, stock entries
   ================================================================= */
function renderViewPage() {
  const p = _product;
  const emoji = getProductEmoji(p.name);
  const quStock = _quantityUnits.find(q => String(q.id) === String(p.qu_id_stock));
  const quUnit = quStock?.name || 'unit';
  const quUnitPlural = quStock?.name_plural || `${quUnit}s`;

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
        ${p.product_group_id ? `<span class="detail-subtitle">${escapeHtml(_productGroups.find(g => String(g.id) === String(p.product_group_id))?.name || '')}</span>` : ''}
      </div>
    </div>

    <!-- Tab bar -->
    <div class="section" style="padding-bottom:0;">
      <div class="segmented-control" id="detail-tabs">
        <button class="segmented-btn active" data-tab="details">Details</button>
        <button class="segmented-btn" data-tab="barcodes">Barcodes${_barcodes.length ? ` <span class="badge-count">${_barcodes.length}</span>` : ''}</button>
      </div>
    </div>

    <div id="tab-content"></div>

    <!-- Edit / Delete buttons -->
    <div class="section" style="padding-bottom:32px;">
      <button class="btn btn-primary" style="width:100%;" id="btn-edit-product">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit Product
      </button>
      <button class="btn btn-danger" style="width:100%;margin-top:12px;" id="btn-delete-product">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Delete Product
      </button>
    </div>
  `);

  // Tab switching
  document.getElementById('detail-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    _currentTab = btn.dataset.tab;
    document.querySelectorAll('#detail-tabs .segmented-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTabContent();
  });

  renderTabContent();

  // Edit button
  document.getElementById('btn-edit-product')?.addEventListener('click', () => {
    _editMode = true;
    renderEditPage();
  });

  // Delete button
  document.getElementById('btn-delete-product')?.addEventListener('click', showDeleteConfirmation);
}

/* =================================================================
   TAB CONTENT - Details / Barcodes
   ================================================================= */
function renderTabContent() {
  if (_currentTab === 'barcodes') {
    renderBarcodesTab();
  } else {
    renderDetailsTab();
  }
}

function renderDetailsTab() {
  const p = _product;
  const quStock = _quantityUnits.find(q => String(q.id) === String(p.qu_id_stock));
  const quUnit = quStock?.name || 'unit';
  const quUnitPlural = quStock?.name_plural || `${quUnit}s`;
  const totalAmount = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const openedAmount = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount_opened || 0), 0);
  const earliestDate = _stockEntries.map(e => e.best_before_date).filter(d => d && d !== '2999-12-31').sort()[0];
  const locationMap = {};
  _locations.forEach(l => locationMap[l.id] = l.name);
  const defaultLocation = p.location_id ? locationMap[p.location_id] || 'Unknown' : 'Not set';

  const container = document.getElementById('tab-content');
  if (!container) return;
  container.innerHTML = `
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
          <span class="stat-value">${earliestDate ? formatDate(earliestDate) : '\u2014'}</span>
          <span class="stat-label">Best Before</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${escapeHtml(defaultLocation)}</span>
          <span class="stat-label">Location</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2 class="section-title">Actions</h2></div>
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
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
        <button class="quick-action" id="action-transfer"${totalAmount <= 0 ? ' disabled' : ''}>
          <div class="quick-action-icon stat-icon teal">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </div>
          <span class="quick-action-label">Transfer</span>
        </button>
      </div>
    </div>

    ${_stockEntries.length > 0 ? `
    <div class="section">
      <div class="section-header"><h2 class="section-title">Stock Entries</h2></div>
      <div class="product-list" id="stock-entries-list"></div>
    </div>` : ''}

    <div class="section">
      <div class="section-header"><h2 class="section-title">Info</h2></div>
      <div class="settings-group">
        <div class="settings-item"><span>Location</span><span class="text-secondary">${escapeHtml(defaultLocation)}</span></div>
        <div class="settings-item"><span>Stock Unit</span><span class="text-secondary">${escapeHtml(quUnit)}</span></div>
        <div class="settings-item"><span>Min. Stock</span><span class="text-secondary">${formatAmount(p.min_stock_amount || 0)} ${quUnitPlural}</span></div>
        ${p.default_best_before_days > 0 ? `<div class="settings-item"><span>Default Shelf Life</span><span class="text-secondary">${p.default_best_before_days} days</span></div>` : ''}
        ${p.description ? `<div class="settings-item" style="flex-direction:column;align-items:flex-start;gap:4px;"><span>Description</span><span class="text-secondary" style="font-size:13px;">${escapeHtml(p.description)}</span></div>` : ''}
        ${p.barcode ? `<div class="settings-item"><span>Barcode</span><span class="text-secondary">${escapeHtml(p.barcode)}</span></div>` : ''}
      </div>
    </div>
  `;

  renderStockEntries();
  setupActionButtons();
}

/* =================================================================
   BARCODES TAB
   ================================================================= */
function renderBarcodesTab() {
  const container = document.getElementById('tab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Assigned Barcodes</h2>
        <button class="section-action" id="btn-add-barcode">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add
        </button>
      </div>
      <div class="product-list" id="barcodes-list">
        ${_barcodes.length === 0 ? `
          <div class="empty-state" style="padding:24px 0;">
            <div class="empty-state-title">No barcodes</div>
            <div class="empty-state-text">Add barcodes to identify this product when scanning</div>
          </div>
        ` : _barcodes.map(bc => {
          const qu = bc.qu_id ? _quantityUnits.find(q => String(q.id) === String(bc.qu_id))?.name : null;
          return `
            <div class="product-item" data-barcode-id="${bc.id}">
              <div class="product-icon" style="font-size:18px;min-width:36px;height:36px;border-radius:10px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="11" y1="8" x2="11" y2="16"/><line x1="15" y1="8" x2="15" y2="16"/></svg>
              </div>
              <div class="product-info">
                <div class="product-name" style="font-family:monospace;font-size:14px;">${escapeHtml(bc.barcode)}</div>
                <div class="product-meta">${qu ? escapeHtml(qu) : ''}${bc.amount ? ' \u00d7 ' + bc.amount : ''}${bc.note ? ' \u2013 ' + escapeHtml(bc.note) : ''}</div>
              </div>
              <button class="btn-icon btn-delete-barcode" data-id="${bc.id}" title="Delete barcode" style="color:var(--color-error,#ff3b30);background:none;border:none;padding:8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  // Add barcode
  document.getElementById('btn-add-barcode')?.addEventListener('click', showAddBarcodeModal);

  // Delete barcode buttons
  document.querySelectorAll('.btn-delete-barcode').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bcId = btn.dataset.id;
      const bc = _barcodes.find(b => String(b.id) === String(bcId));
      if (bc) showDeleteBarcodeConfirmation(bc);
    });
  });
}

function showAddBarcodeModal() {
  showModal('Add Barcode', `
    <div class="form-group">
      <label class="form-label">Barcode *</label>
      <input type="text" id="modal-barcode" class="form-input" placeholder="Enter or scan barcode" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">Quantity Unit (optional)</label>
      <select id="modal-qu" class="form-input">
        <option value="">-- Same as stock unit --</option>
        ${_quantityUnits.map(q => `<option value="${q.id}">${escapeHtml(q.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Amount (optional)</label>
      <input type="number" id="modal-amount" class="form-input" placeholder="1" step="0.01" min="0">
    </div>
    <div class="form-group">
      <label class="form-label">Note (optional)</label>
      <input type="text" id="modal-note" class="form-input" placeholder="e.g. 6-pack" autocomplete="off">
    </div>
    <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Add Barcode</button>
  `);

  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const barcode = document.getElementById('modal-barcode')?.value?.trim();
    if (!barcode) { showToast('Enter a barcode', 'error'); return; }

    const quId = document.getElementById('modal-qu')?.value || null;
    const amount = document.getElementById('modal-amount')?.value || null;
    const note = document.getElementById('modal-note')?.value?.trim() || null;

    const btn = document.getElementById('modal-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding\u2026'; }

    try {
      const data = { product_id: _product.id, barcode };
      if (quId) data.qu_id = parseInt(quId);
      if (amount) data.amount = parseFloat(amount);
      if (note) data.note = note;
      await api.addObject('product_barcodes', data);

      // Refresh barcodes
      const allBarcodes = await api.getProductBarcodes();
      _barcodes = allBarcodes.filter(b => String(b.product_id) === String(_product.id));

      closeModal();
      showToast('Barcode added', 'success');
      renderBarcodesTab();
      // Update badge count in tab
      const tabBtn = document.querySelector('[data-tab="barcodes"]');
      if (tabBtn) tabBtn.innerHTML = 'Barcodes' + (_barcodes.length ? ' <span class="badge-count">' + _barcodes.length + '</span>' : '');
    } catch (e) {
      showToast(String(e.message || e), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  });
}

function showDeleteBarcodeConfirmation(bc) {
  showModal('Delete Barcode', `
    <div style="text-align:center;padding:8px 0 16px;">
      <div style="font-size:32px;margin-bottom:12px;">\u26A0\uFE0F</div>
      <p style="margin:0 0 8px;">Delete barcode <strong style="font-family:monospace;">${escapeHtml(bc.barcode)}</strong>?</p>
      <p class="text-secondary" style="font-size:13px;margin:0;">This cannot be undone.</p>
    </div>
    <div style="display:flex;gap:12px;">
      <button class="btn" style="flex:1;" id="modal-cancel">Cancel</button>
      <button class="btn btn-danger" style="flex:1;" id="modal-confirm-delete">Delete</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-confirm-delete')?.addEventListener('click', async () => {
    const btn = document.getElementById('modal-confirm-delete');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting\u2026'; }
    try {
      await api.deleteProductBarcode(bc.id);
      _barcodes = _barcodes.filter(b => String(b.id) !== String(bc.id));
      closeModal();
      showToast('Barcode deleted', 'success');
      renderBarcodesTab();
      const tabBtn = document.querySelector('[data-tab="barcodes"]');
      if (tabBtn) tabBtn.innerHTML = 'Barcodes' + (_barcodes.length ? ' <span class="badge-count">' + _barcodes.length + '</span>' : '');
    } catch (e) {
      showToast(String(e.message || e), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  });
}

/* =================================================================
   EDIT PAGE - form for editing/creating a product
   ================================================================= */
function renderEditPage() {
  const p = _product;
  setHeader(_isNew ? 'New Product' : 'Edit ' + escapeHtml(p.name), true);

  renderPage(`
    <div class="section">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="edit-name" class="form-input" value="${escapeHtml(p.name || '')}" placeholder="Product name" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="edit-description" class="form-input" rows="3" placeholder="Optional description">${escapeHtml(p.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Location</label>
        <select id="edit-location" class="form-input">
          <option value="">-- None --</option>
          ${_locations.map(l => `<option value="${l.id}" ${String(l.id) === String(p.location_id) ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quantity Unit (Stock) *</label>
        <select id="edit-qu" class="form-input">
          <option value="">-- Select --</option>
          ${_quantityUnits.map(q => `<option value="${q.id}" ${String(q.id) === String(p.qu_id_stock) ? 'selected' : ''}>${escapeHtml(q.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Product Group</label>
        <select id="edit-group" class="form-input">
          <option value="">-- None --</option>
          ${_productGroups.map(g => `<option value="${g.id}" ${String(g.id) === String(p.product_group_id) ? 'selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Min. Stock Amount</label>
        <input type="number" id="edit-min-stock" class="form-input" value="${p.min_stock_amount || 0}" min="0" step="1">
      </div>
      <div class="form-group">
        <label class="form-label">Default Shelf Life (days)</label>
        <input type="number" id="edit-shelf-life" class="form-input" value="${p.default_best_before_days || 0}" min="0" step="1">
      </div>
    </div>

    <div class="section" style="padding-bottom:32px;">
      <div style="display:flex;gap:12px;">
        <button class="btn" style="flex:1;" id="btn-cancel">Cancel</button>
        <button class="btn btn-primary" style="flex:1;" id="btn-save">${_isNew ? 'Create Product' : 'Save Changes'}</button>
      </div>
    </div>
  `);

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    if (_isNew) {
      location.hash = '/products';
    } else {
      _editMode = false;
      setHeader(escapeHtml(_product.name), true);
      renderViewPage();
    }
  });

  document.getElementById('btn-save')?.addEventListener('click', saveProduct);
}

async function saveProduct() {
  const name = document.getElementById('edit-name')?.value?.trim();
  const description = document.getElementById('edit-description')?.value?.trim() || '';
  const locationId = document.getElementById('edit-location')?.value || null;
  const quId = document.getElementById('edit-qu')?.value;
  const groupId = document.getElementById('edit-group')?.value || null;
  const minStock = parseFloat(document.getElementById('edit-min-stock')?.value || 0);
  const shelfLife = parseInt(document.getElementById('edit-shelf-life')?.value || 0);

  if (!name) { showToast('Name is required', 'error'); return; }
  if (!quId) { showToast('Quantity unit is required', 'error'); return; }

  const btn = document.getElementById('btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

  const data = {
    name,
    description,
    location_id: locationId ? parseInt(locationId) : '',
    qu_id_stock: parseInt(quId),
    qu_id_purchase: parseInt(quId),
    product_group_id: groupId ? parseInt(groupId) : '',
    min_stock_amount: minStock,
    default_best_before_days: shelfLife,
  };

  try {
    if (_isNew) {
      const result = await api.createProduct(data);
      const newId = result?.created_object_id || result?.id;
      showToast('Product created', 'success');
      if (newId) {
        location.hash = '/product/' + newId;
      } else {
        location.hash = '/products';
      }
    } else {
      await api.updateProduct(_product.id, data);
      Object.assign(_product, data);
      _editMode = false;
      showToast('Product saved', 'success');
      setHeader(escapeHtml(_product.name), true);
      renderViewPage();
    }
  } catch (e) {
    showToast(String(e.message || e), 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

/* =================================================================
   DELETE PRODUCT
   ================================================================= */
function showDeleteConfirmation() {
  showModal('Delete Product', `
    <div style="text-align:center;padding:8px 0 16px;">
      <div style="font-size:48px;margin-bottom:12px;">${getProductEmoji(_product.name)}</div>
      <p style="margin:0 0 8px;">Delete <strong>${escapeHtml(_product.name)}</strong>?</p>
      <p class="text-secondary" style="font-size:13px;margin:0;">This will permanently delete the product and all its stock entries. This cannot be undone.</p>
    </div>
    <div style="display:flex;gap:12px;">
      <button class="btn" style="flex:1;" id="modal-cancel">Cancel</button>
      <button class="btn btn-danger" style="flex:1;" id="modal-confirm-delete">Delete</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-confirm-delete')?.addEventListener('click', async () => {
    const btn = document.getElementById('modal-confirm-delete');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting\u2026'; }
    try {
      await api.deleteProduct(_product.id);
      closeModal();
      showToast('Product deleted', 'success');
      location.hash = '/products';
    } catch (e) {
      showToast(String(e.message || e), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  });
}

/* =================================================================
   STOCK ENTRIES LIST
   ================================================================= */
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
        <div class="product-icon" style="font-size:14px;min-width:36px;height:36px;border-radius:10px;">#${idx + 1}</div>
        <div class="product-info">
          <div class="product-name">${amount}${opened}</div>
          <div class="product-meta">${escapeHtml(loc)} \u00b7 Purchased ${formatDate(entry.purchased_date)}</div>
        </div>
        <span class="product-badge ${badgeClass}">${badgeText}</span>
      </div>`;
  }).join('');
}

/* =================================================================
   ACTION BUTTONS (Purchase, Consume, Open, Inventory)
   ================================================================= */
function setupActionButtons() {
  const quStock = _quantityUnits.find(q => String(q.id) === String(_product.qu_id_stock));
  const quUnit = quStock?.name || 'unit';

  document.getElementById('action-purchase')?.addEventListener('click', () => {
    showModal('Purchase', `
      <div class="form-group">
        <label class="form-label">Amount</label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">\u2212</button>
          <input type="number" id="modal-amount" class="stepper-value" value="1" min="1" step="1">
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
    const locOptions = buildStockLocationOptions('amount');
    const hasMultipleLocations = locOptions.length > 1;
    showModal('Consume', `
      ${hasMultipleLocations ? `
      <div class="form-group">
        <label class="form-label">Location</label>
        <select id="modal-action-location" class="form-input">
          <option value="">All locations (${formatAmount(totalAmount)})</option>
          ${locOptions.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${formatAmount(l.amount)})</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">Amount <span id="action-max-label">(max ${formatAmount(totalAmount)})</span></label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">\u2212</button>
          <input type="number" id="modal-amount" class="stepper-value" value="1" min="1" max="${totalAmount}" step="1">
          <button class="stepper-btn" data-action="increment">+</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="modal-spoiled"> Mark as spoiled
        </label>
      </div>
      <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Consume</button>
    `);
    if (hasMultipleLocations) setupLocationMaxSync(totalAmount, 'amount');
    setupStepperAndConfirm('consume');
  });

  document.getElementById('action-open')?.addEventListener('click', () => {
    const unopened = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0) - parseFloat(e.amount_opened || 0), 0);
    const locOptions = buildStockLocationOptions('unopened');
    const hasMultipleLocations = locOptions.length > 1;
    showModal('Mark as Opened', `
      ${hasMultipleLocations ? `
      <div class="form-group">
        <label class="form-label">Location</label>
        <select id="modal-action-location" class="form-input">
          <option value="">All locations (${formatAmount(unopened)})</option>
          ${locOptions.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${formatAmount(l.amount)})</option>`).join('')}
        </select>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">Amount to open <span id="action-max-label">(max ${formatAmount(unopened)})</span></label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">\u2212</button>
          <input type="number" id="modal-amount" class="stepper-value" value="1" min="1" max="${unopened}" step="1">
          <button class="stepper-btn" data-action="increment">+</button>
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Mark Opened</button>
    `);
    if (hasMultipleLocations) setupLocationMaxSync(unopened, 'unopened');
    setupStepperAndConfirm('open');
  });

  document.getElementById('action-inventory')?.addEventListener('click', () => {
    const totalAmount = _stockEntries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
    showModal('Inventory Correction', `
      <div class="form-group">
        <label class="form-label">New amount</label>
        <div class="number-stepper">
          <button class="stepper-btn" data-action="decrement">\u2212</button>
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

  // Transfer action
  document.getElementById('action-transfer')?.addEventListener('click', () => {
    showTransferModal();
  });
}

/* =================================================================
   LOCATION HELPERS for Consume / Open modals
   ================================================================= */
function buildStockLocationOptions(mode) {
  const locationMap = {};
  _locations.forEach(l => locationMap[l.id] = l.name);

  const byLoc = {};
  _stockEntries.forEach(e => {
    const locId = e.location_id;
    if (!locId) return;
    if (mode === 'unopened') {
      const unopened = parseFloat(e.amount || 0) - parseFloat(e.amount_opened || 0);
      byLoc[locId] = (byLoc[locId] || 0) + unopened;
    } else {
      byLoc[locId] = (byLoc[locId] || 0) + parseFloat(e.amount || 0);
    }
  });

  return Object.entries(byLoc)
    .filter(([, amt]) => amt > 0)
    .map(([id, amt]) => ({ id, name: locationMap[id] || 'Unknown', amount: amt }));
}

function setupLocationMaxSync(totalMax, mode) {
  const locSelect = document.getElementById('modal-action-location');
  if (!locSelect) return;

  const locOptions = buildStockLocationOptions(mode);

  locSelect.addEventListener('change', () => {
    const selectedId = locSelect.value;
    let maxAmt = totalMax;
    if (selectedId) {
      const loc = locOptions.find(l => String(l.id) === String(selectedId));
      maxAmt = loc ? loc.amount : totalMax;
    }
    const amountInput = document.getElementById('modal-amount');
    if (amountInput) {
      amountInput.max = maxAmt;
      if (parseFloat(amountInput.value) > maxAmt) amountInput.value = Math.min(parseFloat(amountInput.value), maxAmt);
    }
    const maxLabel = document.getElementById('action-max-label');
    if (maxLabel) maxLabel.textContent = `(max ${formatAmount(maxAmt)})`;
  });
}

/* =================================================================
   TRANSFER MODAL
   ================================================================= */
function showTransferModal() {
  // Build "from" locations from stock entries (locations that actually have stock)
  const locationMap = {};
  _locations.forEach(l => locationMap[l.id] = l.name);

  const stockByLocation = {};
  _stockEntries.forEach(e => {
    const locId = e.location_id;
    if (!locId) return;
    stockByLocation[locId] = (stockByLocation[locId] || 0) + parseFloat(e.amount || 0);
  });

  const fromLocations = Object.entries(stockByLocation)
    .filter(([, amt]) => amt > 0)
    .map(([id, amt]) => ({ id, name: locationMap[id] || 'Unknown', amount: amt }));

  if (fromLocations.length === 0) {
    showToast('No stock to transfer', 'error');
    return;
  }

  const defaultFrom = fromLocations[0];

  showModal('Transfer', `
    <div class="form-group">
      <label class="form-label">From location</label>
      <select id="modal-from-location" class="form-input">
        ${fromLocations.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${formatAmount(l.amount)} in stock)</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">To location</label>
      <select id="modal-to-location" class="form-input">
        ${_locations.filter(l => String(l.id) !== String(defaultFrom.id)).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Amount <span id="transfer-max-label">(max ${formatAmount(defaultFrom.amount)})</span></label>
      <div class="number-stepper">
        <button class="stepper-btn" data-action="decrement">\u2212</button>
        <input type="number" id="modal-amount" class="stepper-value" value="1" min="1" max="${defaultFrom.amount}" step="1">
        <button class="stepper-btn" data-action="increment">+</button>
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Transfer</button>
  `);

  // Update "to" options and max when "from" changes
  const fromSelect = document.getElementById('modal-from-location');
  fromSelect?.addEventListener('change', () => {
    const selectedFromId = fromSelect.value;
    const fromLoc = fromLocations.find(l => String(l.id) === String(selectedFromId));
    const maxAmt = fromLoc ? fromLoc.amount : 1;

    // Update "to" dropdown — exclude selected "from"
    const toSelect = document.getElementById('modal-to-location');
    if (toSelect) {
      toSelect.innerHTML = _locations
        .filter(l => String(l.id) !== String(selectedFromId))
        .map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`)
        .join('');
    }

    // Update max amount
    const amountInput = document.getElementById('modal-amount');
    if (amountInput) {
      amountInput.max = maxAmt;
      if (parseFloat(amountInput.value) > maxAmt) amountInput.value = maxAmt;
    }
    const maxLabel = document.getElementById('transfer-max-label');
    if (maxLabel) maxLabel.textContent = `(max ${formatAmount(maxAmt)})`;
  });

  setupStepperAndConfirm('transfer');
}

function setupStepperAndConfirm(action) {
  const integerAmountActions = new Set(['purchase', 'consume', 'open', 'transfer']);
  const requiresIntegerAmount = integerAmountActions.has(action);

  document.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('modal-amount');
      if (!input) return;
      const step = parseFloat(input.step) || 1;
      let val = parseFloat(input.value) || 0;
      if (btn.dataset.action === 'increment') val += step;
      else val = Math.max(parseFloat(input.min) || 0, val - step);
      if (input.max && val > parseFloat(input.max)) val = parseFloat(input.max);
      if (requiresIntegerAmount) val = Math.floor(val);
      input.value = val;
    });
  });

  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const amountRaw = document.getElementById('modal-amount')?.value || '0';
    const amount = requiresIntegerAmount ? parseInt(amountRaw, 10) : parseFloat(amountRaw);
    if (!Number.isFinite(amount) || (amount <= 0 && action !== 'inventory')) { showToast('Enter a valid amount', 'error'); return; }
    if (requiresIntegerAmount && (!Number.isInteger(Number(amountRaw)) || amount < 1)) {
      showToast('Amount must be a whole number (minimum 1)', 'error');
      return;
    }

    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Working\u2026'; }

    try {
      switch (action) {
        case 'purchase': {
          const date = document.getElementById('modal-date')?.value || todayStr();
          const price = document.getElementById('modal-price')?.value;
          const locationId = document.getElementById('modal-location')?.value;
          await api.addProductToStock(_product.id, amount, date, price ? parseFloat(price) : undefined, locationId ? parseInt(locationId) : undefined);
          removeFromShoppingListIfNeeded(_product.id, amount);
          showToast('Added ' + formatAmount(amount) + ' to stock', 'success');
          break;
        }
        case 'consume': {
          const spoiled = document.getElementById('modal-spoiled')?.checked || false;
          const consumeLocId = document.getElementById('modal-action-location')?.value || null;
          await api.consumeProduct(_product.id, amount, spoiled, consumeLocId ? parseInt(consumeLocId) : null);
          showToast('Consumed ' + formatAmount(amount), 'success');
          break;
        }
        case 'open': {
          const openLocId = document.getElementById('modal-action-location')?.value || null;
          await api.openProduct(_product.id, amount, openLocId ? parseInt(openLocId) : null);
          showToast('Opened ' + formatAmount(amount), 'success');
          break;
        }
        case 'inventory': {
          const date = document.getElementById('modal-date')?.value;
          await api.inventoryProduct(_product.id, amount, date || undefined);
          showToast('Inventory updated', 'success');
          break;
        }
        case 'transfer': {
          const fromLoc = document.getElementById('modal-from-location')?.value;
          const toLoc = document.getElementById('modal-to-location')?.value;
          if (!fromLoc || !toLoc) { showToast('Select both locations', 'error'); return; }
          if (fromLoc === toLoc) { showToast('Locations must be different', 'error'); return; }
          await api.transferProduct(_product.id, amount, parseInt(fromLoc), parseInt(toLoc));
          showToast('Transferred ' + formatAmount(amount), 'success');
          break;
        }
      }

      closeModal();
      const newEntries = await api.getProductEntries(_product.id);
      _stockEntries = newEntries;
      _currentTab = 'details';
      renderViewPage();
    } catch (e) {
      showToast(String(e.message || e), 'error');
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Retry'; }
    }
  });
}
