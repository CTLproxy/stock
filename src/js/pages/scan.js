/**
 * Scanner Page — Barcode scan with mode selection (Purchase / Consume / Lookup)
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { scanner } from '../scanner.js';
import { lookupBarcode } from '../barcode-lookup.js';
import { removeFromShoppingListIfNeeded } from './shopping.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  formatAmount, getProductEmoji, escapeHtml, dateFromNow, todayStr,
} from '../ui.js';

let _scanMode = 'purchase';

export function renderScanPage(params) {
  const mode = params?.mode || 'purchase';
  _scanMode = mode;

  setHeader('Scan', true);

  // Always show camera UI — mobile Safari may not expose mediaDevices until
  // a user gesture triggers the permission prompt. We let the html5-qrcode
  // library request permission when the user taps \"Start Camera\", and show
  // a helpful error if it truly isn't supported.
  const showCamera = true;

  renderPage(`
    <div class="segmented-control" id="scan-mode-control">
      <button class="segmented-btn ${mode === 'purchase' ? 'active' : ''}" data-mode="purchase">Purchase</button>
      <button class="segmented-btn ${mode === 'consume' ? 'active' : ''}" data-mode="consume">Consume</button>
      <button class="segmented-btn ${mode === 'lookup' ? 'active' : ''}" data-mode="lookup">Lookup</button>
    </div>

    ${showCamera ? `
    <div class="scanner-container" id="scanner-container">
      <div id="scanner-video"></div>
      <div class="scanner-overlay">
        <div class="scan-line"></div>
      </div>
    </div>

    <div style="text-align: center; margin-top: 12px;">
      <button class="btn btn-secondary" id="scan-toggle-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px;">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <span>Start Camera</span>
      </button>
    </div>
    ` : `
    <div class="empty-state" style="margin-top: 40px;">
      <div class="empty-state-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>
      <div class="empty-state-title">Camera not available</div>
      <div class="empty-state-text">Your browser does not support camera access. Ensure you are using HTTPS. Use manual entry below.</div>
    </div>
    `}

    <div class="section" style="margin-top: 16px;">
      <div class="search-bar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="7" y1="8" x2="7" y2="16"/><line x1="11" y1="8" x2="11" y2="16"/>
          <line x1="15" y1="8" x2="15" y2="16"/>
        </svg>
        <input type="text" id="manual-barcode" placeholder="Enter barcode manually..." inputmode="numeric" autocomplete="off">
        <button class="btn btn-primary btn-sm" id="manual-lookup-btn" style="margin-left: 4px; white-space: nowrap;">Go</button>
      </div>
    </div>

    <div id="scan-result" class="section" style="display: none;"></div>
  `);

  setupScanListeners();

  if (showCamera && store.get('scanAutoStartCamera')) {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (!scanner.isScanning) toggleScanner();
      }, 80);
    });
  }
}

function setupScanListeners() {
  // Mode switching
  const modeControl = document.getElementById('scan-mode-control');
  if (modeControl) {
    modeControl.addEventListener('click', (e) => {
      const segment = e.target.closest('.segmented-btn');
      if (!segment) return;
      _scanMode = segment.dataset.mode;
      modeControl.querySelectorAll('.segmented-btn').forEach(s => s.classList.remove('active'));
      segment.classList.add('active');
      // Update URL without triggering page reload
      history.replaceState(null, '', `#/scan/${_scanMode}`);
    });
  }

  // Toggle camera button
  const toggleBtn = document.getElementById('scan-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleScanner);
  }

  // Manual barcode entry
  const manualInput = document.getElementById('manual-barcode');
  const manualBtn = document.getElementById('manual-lookup-btn');

  if (manualInput) {
    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleBarcode(manualInput.value.trim());
    });
  }
  if (manualBtn) {
    manualBtn.addEventListener('click', () => {
      const val = document.getElementById('manual-barcode')?.value?.trim();
      if (val) handleBarcode(val);
    });
  }
}

async function toggleScanner() {
  const toggleBtn = document.getElementById('scan-toggle-btn');
  const videoEl = document.getElementById('scanner-video');

  if (scanner.isScanning) {
    await stopScanner();
    if (toggleBtn) toggleBtn.querySelector('span').textContent = 'Start Camera';
    return;
  }

  if (toggleBtn) toggleBtn.querySelector('span').textContent = 'Starting…';

  try {
    await scanner.start('scanner-video', (barcode) => {
      handleBarcode(barcode);
    });

    if (toggleBtn) toggleBtn.querySelector('span').textContent = 'Stop Camera';
  } catch (e) {
    console.error('Scanner error:', e);
    const msg = (e && (e.message || e.toString())) || 'Camera permission denied or not available';
    showToast('Could not start camera: ' + msg, 'error');
    if (toggleBtn) toggleBtn.querySelector('span').textContent = 'Start Camera';
  }
}

async function stopScanner() {
  await scanner.stop();
}

// Debounce scans
let _lastScanTime = 0;
let _lastBarcode = '';

async function handleBarcode(barcode) {
  if (!barcode) return;

  // Debounce: ignore same barcode within 3s
  const now = Date.now();
  if (barcode === _lastBarcode && (now - _lastScanTime) < 3000) return;
  _lastBarcode = barcode;
  _lastScanTime = now;

  const resultEl = document.getElementById('scan-result');
  if (resultEl) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="glass-card" style="text-align: center; padding: 20px;">
        <div class="skeleton skeleton-rect" style="height: 60px;"></div>
        <p class="text-secondary" style="margin-top: 8px;">Looking up ${escapeHtml(barcode)}…</p>
      </div>
    `;
  }

  try {
    // Try Grocy known barcode lookup
    const productData = await api.getProductByBarcode(barcode);

    if (productData && productData.product) {
      await handleKnownProduct(barcode, productData);
    } else {
      await handleUnknownBarcode(barcode);
    }
  } catch (e) {
    // 400 = not found
    if (e.message?.includes('No product') || e.message?.includes('400')) {
      await handleUnknownBarcode(barcode);
    } else {
      showScanResult(`
        <div class="glass-card" style="text-align: center; padding: 20px;">
          <div class="empty-state-icon" style="margin-bottom: 8px;">❌</div>
          <div class="empty-state-title">Lookup Failed</div>
          <div class="empty-state-text">${escapeHtml(e.message)}</div>
          <button class="btn btn-secondary" onclick="location.hash='/scan/${_scanMode}'" style="margin-top: 12px;">Try Again</button>
        </div>
      `);
    }
  }
}

async function handleKnownProduct(barcode, productData) {
  const product = productData.product;
  const stockAmount = productData.stock_amount || 0;
  const emoji = getProductEmoji(product.name);

  switch (_scanMode) {
    case 'purchase':
      showScanResult(`
        <div class="glass-card" style="padding: 20px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <span style="font-size: 36px;">${emoji}</span>
            <div>
              <div style="font-weight: 600; font-size: 17px;">${escapeHtml(product.name)}</div>
              <div class="text-secondary">${formatAmount(stockAmount)} in stock</div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Amount</label>
            <div class="number-stepper">
              <button class="stepper-btn" data-action="decrement">−</button>
              <input type="number" id="scan-amount" class="stepper-value" value="1" min="1" step="1">
              <button class="stepper-btn" data-action="increment">+</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Best before</label>
            <input type="date" id="scan-date" class="form-input" value="${dateFromNow(product.default_best_before_days || 0)}">
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" style="flex: 1;" id="scan-confirm">Add to Stock</button>
            <button class="btn btn-secondary" onclick="location.hash='/product/${product.id}'">Details</button>
          </div>
        </div>
      `);
      setupScanStepper();
      document.getElementById('scan-confirm')?.addEventListener('click', async () => {
        const amountRaw = document.getElementById('scan-amount')?.value || '1';
        const amount = parseInt(amountRaw, 10);
        if (!Number.isInteger(Number(amountRaw)) || !Number.isFinite(amount) || amount < 1) {
          showToast('Amount must be a whole number (minimum 1)', 'error');
          return;
        }
        const date = document.getElementById('scan-date')?.value || todayStr();
        try {
          await api.addProductToStock(product.id, amount, date);
          removeFromShoppingListIfNeeded(product.id, amount);
          showToast(`Added ${formatAmount(amount)} × ${product.name}`, 'success');
          clearScanResult();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      break;

    case 'consume':
      try {
        await api.consumeProductByBarcode(barcode, 1);
        showToast(`Consumed 1 × ${product.name}`, 'success');
        showScanResult(`
          <div class="glass-card" style="padding: 20px; text-align: center;">
            <span style="font-size: 48px;">✅</span>
            <h3 style="margin-top: 8px;">${escapeHtml(product.name)}</h3>
            <p class="text-secondary">Consumed 1 — ${formatAmount(stockAmount - 1)} remaining</p>
            <button class="btn btn-secondary" onclick="location.hash='/product/${product.id}'" style="margin-top: 12px;">View Product</button>
          </div>
        `);
      } catch (err) {
        showToast(err.message, 'error');
      }
      break;

    case 'lookup':
      showScanResult(`
        <div class="glass-card" style="padding: 20px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <span style="font-size: 36px;">${emoji}</span>
            <div>
              <div style="font-weight: 600; font-size: 17px;">${escapeHtml(product.name)}</div>
              <div class="text-secondary">${formatAmount(stockAmount)} in stock</div>
            </div>
          </div>
          <button class="btn btn-primary" style="width: 100%;" onclick="location.hash='/product/${product.id}'">View Product</button>
        </div>
      `);
      break;
  }
}

async function handleUnknownBarcode(barcode) {
  // --- Step 1: Try external barcode lookup ---
  let lookupData = null;
  let lookupSource = '';

  showScanResult(`
    <div class="glass-card" style="padding: 20px; text-align: center;">
      <span style="font-size: 36px;">🔍</span>
      <h3 style="margin-top: 8px;">Looking up barcode…</h3>
      <p class="text-secondary" style="margin-top: 4px;">${escapeHtml(barcode)}</p>
      <p class="text-secondary" style="font-size: 13px; margin-top: 8px;">Checking public product databases…</p>
    </div>
  `);

  try {
    const result = await lookupBarcode(barcode);
    if (result.found) {
      lookupData = result.product;
      lookupSource = result.source;
    }
  } catch (_) { /* ignore lookup failures */ }

  // --- Step 2: Show result card ---
  const hasLookup = lookupData && lookupData.name;

  showScanResult(`
    <div class="glass-card" style="padding: 20px;">
      <div style="text-align: center; margin-bottom: 16px;">
        <span style="font-size: 36px;">${hasLookup ? '📦' : '🔍'}</span>
        <h3 style="margin-top: 8px;">${hasLookup ? 'Product Found' : 'Unknown Barcode'}</h3>
        <p class="text-secondary" style="margin-top: 4px;">${escapeHtml(barcode)}</p>
      </div>

      ${hasLookup ? `
        <div class="lookup-result">
          ${lookupData.imageUrl ? `<img src="${escapeHtml(lookupData.imageUrl)}" alt="" onerror="this.style.display='none'">` : ''}
          <div class="lookup-result-info">
            <div class="lookup-result-name">${escapeHtml(lookupData.name)}</div>
            ${lookupData.brand ? `<div class="lookup-result-meta">${escapeHtml(lookupData.brand)}${lookupData.quantity ? ' · ' + escapeHtml(lookupData.quantity) : ''}</div>` : ''}
            <div class="lookup-result-source">via ${escapeHtml(lookupSource)}</div>
          </div>
        </div>
      ` : `
        <p class="text-secondary" style="font-size: 13px; text-align: center; margin-bottom: 12px;">
          This barcode is not linked to any product in Grocy and was not found in public databases.
        </p>
      `}

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="btn btn-primary" id="scan-create-product" style="width: 100%;">
          ${hasLookup ? 'Create Product in Grocy' : 'Create New Product'}
        </button>
        <button class="btn btn-secondary" id="scan-assign-barcode" style="width: 100%;">
          Assign to Existing Product
        </button>
      </div>
    </div>
  `);

  // --- "Create Product" flow ---
  document.getElementById('scan-create-product')?.addEventListener('click', () => {
    showCreateProductModal(barcode, lookupData);
  });

  // --- "Assign to Existing Product" flow ---
  document.getElementById('scan-assign-barcode')?.addEventListener('click', () => {
    showAssignProductModal(barcode, lookupData);
  });
}

/* ================================================================
 *  Assign to existing product — modal with search
 * ================================================================ */
async function showAssignProductModal(barcode, lookupData) {
  let products = [];
  try {
    products = await api.getProducts();
    store.set('products', products);
  } catch (e) {
    const cached = store.get('products');
    if (Array.isArray(cached) && cached.length) products = cached;
    else { showToast('Failed to load products', 'error'); return; }
  }

  showModal('Select Product', `
    <div class="search-bar" style="margin-bottom: 12px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="assign-search" placeholder="Search products…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
    </div>
    <div id="assign-product-list" style="max-height: 50vh; overflow-y: auto; -webkit-overflow-scrolling: touch;"></div>
  `);

  // Render filtered list + attach click handlers
  const renderList = (filter = '') => {
    const listEl = document.getElementById('assign-product-list');
    if (!listEl) return;
    let filtered = products;
    if (filter) {
      const q = filter.toLowerCase();
      filtered = products.filter(p => (p.name || '').toLowerCase().includes(q));
    }
    listEl.innerHTML = filtered.length === 0
      ? '<p class="text-secondary" style="text-align:center; padding:16px;">No matching products</p>'
      : filtered.slice(0, 50).map(p => `
          <div class="product-item" data-product-id="${p.id}" style="cursor: pointer;">
            <div class="product-icon">${getProductEmoji(p.name)}</div>
            <div class="product-info">
              <div class="product-name">${escapeHtml(p.name)}</div>
            </div>
          </div>
        `).join('');

    listEl.querySelectorAll('.product-item').forEach(item => {
      item.addEventListener('click', async () => {
        const productId = item.dataset.productId;
        try {
          await api.addObject('product_barcodes', {
            product_id: parseInt(productId),
            barcode: barcode,
            note: lookupData?.name || undefined,
          });
          showToast('Barcode assigned successfully', 'success');
          closeModal();
          _lastBarcode = '';
          handleBarcode(barcode);
        } catch (err) {
          showToast('Failed to assign barcode: ' + err.message, 'error');
        }
      });
    });
  };

  // Initial render (wait one frame for DOM paint)
  requestAnimationFrame(() => {
    renderList();
    const searchInput = document.getElementById('assign-search');
    if (searchInput) {
      // Use both 'input' and 'keyup' for maximum compatibility (iOS Safari)
      const onSearch = () => renderList(searchInput.value);
      searchInput.addEventListener('input', onSearch);
      searchInput.addEventListener('keyup', onSearch);
      searchInput.focus();
    }
  });
}

/* ================================================================
 *  Create new product — modal with form (pre-filled from lookup)
 * ================================================================ */
async function showCreateProductModal(barcode, lookupData) {
  // Fetch locations & quantity units for dropdowns
  let locations = store.get('locations') || [];
  let qus = store.get('quantityUnits') || [];

  try {
    if (!locations.length) {
      locations = await api.getLocations();
      store.set('locations', locations);
    }
    if (!qus.length) {
      qus = await api.getQuantityUnits();
      store.set('quantityUnits', qus);
    }
  } catch (_) { /* use whatever we have */ }

  const prefillName = lookupData?.name || '';
  const prefillBrand = lookupData?.brand || '';
  const prefillQty = lookupData?.quantity || '';
  const prefillDesc = [prefillBrand, prefillQty].filter(Boolean).join(' · ');

  const locationOpts = locations.map(l =>
    `<option value="${l.id}">${escapeHtml(l.name)}</option>`
  ).join('');

  const quOpts = qus.map(q =>
    `<option value="${q.id}"${q.name.toLowerCase().includes('piece') ? ' selected' : ''}>${escapeHtml(q.name)}</option>`
  ).join('');

  showModal('Create Product', `
    ${lookupData?.imageUrl ? `
      <div style="text-align: center; margin-bottom: 12px;">
        <img src="${escapeHtml(lookupData.imageUrl)}" alt="" style="width: 72px; height: 72px; object-fit: contain; border-radius: 8px; background: #fff;" onerror="this.style.display='none'">
      </div>
    ` : ''}

    <div class="form-group">
      <label class="form-label">Product Name *</label>
      <input type="text" id="create-name" class="form-input" value="${escapeHtml(prefillName)}" placeholder="e.g. Oat Milk" autocomplete="off">
    </div>

    <div class="form-group">
      <label class="form-label">Description</label>
      <input type="text" id="create-desc" class="form-input" value="${escapeHtml(prefillDesc)}" placeholder="Brand, size, notes…" autocomplete="off">
    </div>

    <div style="display: flex; gap: 8px;">
      <div class="form-group" style="flex: 1;">
        <label class="form-label">Location</label>
        <select id="create-location" class="form-input" style="padding-right: 8px;">
          <option value="">— Default —</option>
          ${locationOpts}
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label class="form-label">Quantity Unit</label>
        <select id="create-qu" class="form-input" style="padding-right: 8px;">
          ${quOpts}
        </select>
      </div>
    </div>

    <div style="display: flex; gap: 8px;">
      <div class="form-group" style="flex: 1;">
        <label class="form-label">Min. Stock</label>
        <input type="number" id="create-min-stock" class="form-input" value="0" min="0" step="1" inputmode="numeric">
      </div>
      <div class="form-group" style="flex: 1;">
        <label class="form-label">Default Best Before (days)</label>
        <input type="number" id="create-bb-days" class="form-input" value="0" min="0" step="1" inputmode="numeric">
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-top: 4px;">
      <button class="btn btn-primary" id="create-save" style="flex: 1;">Create & Assign Barcode</button>
      <button class="btn btn-secondary" id="create-cancel">Cancel</button>
    </div>
  `);

  // Cancel
  document.getElementById('create-cancel')?.addEventListener('click', closeModal);

  // Save
  document.getElementById('create-save')?.addEventListener('click', async () => {
    const name = document.getElementById('create-name')?.value?.trim();
    if (!name) { showToast('Product name is required', 'error'); return; }

    const saveBtn = document.getElementById('create-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Creating…'; }

    try {
      const desc = document.getElementById('create-desc')?.value?.trim() || '';
      const locationId = document.getElementById('create-location')?.value || undefined;
      const quId = document.getElementById('create-qu')?.value || undefined;
      const minStock = parseInt(document.getElementById('create-min-stock')?.value) || 0;
      const bbDays = parseInt(document.getElementById('create-bb-days')?.value) || 0;

      const productData = { name, description: desc };
      if (locationId) productData.location_id = parseInt(locationId);
      if (quId) {
        productData.qu_id_purchase = parseInt(quId);
        productData.qu_id_stock = parseInt(quId);
        productData.qu_id_consume = parseInt(quId);
      }
      if (minStock > 0) productData.min_stock_amount = minStock;
      if (bbDays > 0) productData.default_best_before_days = bbDays;

      // Create product
      const result = await api.createProduct(productData);
      const newProductId = result?.created_object_id;

      if (!newProductId) {
        showToast('Product created but could not retrieve ID', 'warning');
        closeModal();
        return;
      }

      // Add barcode link
      await api.addProductBarcode(newProductId, barcode);

      showToast(`Created "${name}" and linked barcode`, 'success');
      closeModal();

      // Refresh products cache
      try {
        const products = await api.getProducts();
        store.set('products', products);
      } catch (_) {}

      // Re-scan to show the now-known product
      _lastBarcode = '';
      handleBarcode(barcode);
    } catch (err) {
      showToast('Failed: ' + err.message, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Create & Assign Barcode'; }
    }
  });
}

function showScanResult(html) {
  const resultEl = document.getElementById('scan-result');
  if (resultEl) {
    resultEl.style.display = 'block';
    resultEl.innerHTML = html;
  }
}

function clearScanResult() {
  const resultEl = document.getElementById('scan-result');
  if (resultEl) {
    resultEl.style.display = 'none';
    resultEl.innerHTML = '';
  }
}

function setupScanStepper() {
  document.querySelectorAll('#scan-result .stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('scan-amount');
      if (!input) return;
      const step = parseFloat(input.step) || 1;
      let val = parseFloat(input.value) || 0;
      if (btn.dataset.action === 'increment') val += step;
      else val = Math.max(parseFloat(input.min) || 0, val - step);
      input.value = val;
    });
  });
}

// Cleanup on page leave
export function cleanupScanPage() {
  stopScanner();
}
