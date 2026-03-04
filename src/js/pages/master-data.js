/**
 * Master Data Page — Manage Locations, Quantity Units, Product Groups
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  escapeHtml,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _activeTab = 'locations';
let _locations = [];
let _quantityUnits = [];
let _productGroups = [];

const TABS = [
  { id: 'locations', label: 'Locations', icon: '\uD83D\uDCCD' },
  { id: 'quantity_units', label: 'Quantity Units', icon: '\uD83D\uDCCF' },
  { id: 'product_groups', label: 'Product Groups', icon: '\uD83D\uDCE6' },
];

/* =================================================================
   Public
   ================================================================= */
export async function renderMasterData() {
  setHeader('Master Data', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const [locations, qus, pgs] = await Promise.all([
      api.getLocations(),
      api.getQuantityUnits(),
      api.getProductGroups(),
    ]);
    _locations = locations;
    _quantityUnits = qus;
    _productGroups = pgs;

    renderView();
    setRefreshHandler(renderMasterData);
  } catch (e) {
    renderPage(`<div class="empty-state"><div class="empty-state-title">Failed to load</div><div class="empty-state-text">${escapeHtml(e.message)}</div></div>`);
  }
}

/* =================================================================
   View
   ================================================================= */
function renderView() {
  const tabBarHtml = TABS.map(t => `
    <button class="tab-btn${_activeTab === t.id ? ' tab-btn-active' : ''}" data-tab="${t.id}">
      ${t.icon} ${t.label}
    </button>
  `).join('');

  let listHtml = '';
  if (_activeTab === 'locations') {
    listHtml = renderEntityList(_locations, 'location', '\uD83D\uDCCD');
  } else if (_activeTab === 'quantity_units') {
    listHtml = renderEntityList(_quantityUnits, 'quantity_unit', '\uD83D\uDCCF');
  } else if (_activeTab === 'product_groups') {
    listHtml = renderEntityList(_productGroups, 'product_group', '\uD83D\uDCE6');
  }

  renderPage(`
    <div class="section">
      <div class="tab-bar" style="display:flex;gap:6px;overflow-x:auto;padding:4px 0;margin-bottom:12px;">
        ${tabBarHtml}
      </div>
    </div>

    <div class="section" style="padding-top:0;">
      <div class="section-header">
        <h2 class="section-title">${TABS.find(t => t.id === _activeTab)?.label}</h2>
        <button class="section-action" id="btn-add-entity">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add
        </button>
      </div>
      ${listHtml}
    </div>
  `);

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      renderView();
    });
  });

  // Add
  document.getElementById('btn-add-entity')?.addEventListener('click', () => showEditModal(null));

  // Edit items
  document.querySelectorAll('.entity-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const entity = getActiveList().find(e => String(e.id) === String(id));
      if (entity) showEditModal(entity);
    });
  });

  // Delete buttons
  document.querySelectorAll('.btn-del-entity').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      confirmDelete(id);
    });
  });
}

/* =================================================================
   Entity list HTML
   ================================================================= */
function renderEntityList(items, entityType, icon) {
  if (items.length === 0) {
    return `
      <div class="empty-state" style="padding:24px 0;">
        <div class="empty-state-title">No items yet</div>
        <div class="empty-state-text">Tap Add to create one</div>
      </div>`;
  }

  return `<div class="product-list">${items.map(item => `
    <div class="product-item entity-item" data-id="${item.id}">
      <div class="product-icon">${icon}</div>
      <div class="product-info">
        <div class="product-name">${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="product-meta">${escapeHtml(item.description)}</div>` : ''}
      </div>
      <button class="btn-icon btn-del-entity" data-id="${item.id}" title="Delete" style="color:var(--color-error,#ff3b30);background:none;border:none;padding:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `).join('')}</div>`;
}

/* =================================================================
   Edit / Create modal
   ================================================================= */
function showEditModal(entity) {
  const isNew = !entity;
  const title = isNew ? `New ${getActiveLabel(true)}` : `Edit ${getActiveLabel(true)}`;

  const extraFields = _activeTab === 'locations' ? `
    <div class="form-group">
      <label class="form-label">Is Freezer</label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input type="checkbox" id="modal-freezer" ${entity?.is_freezer == 1 ? 'checked' : ''}>
        <span>This location is a freezer</span>
      </label>
    </div>
  ` : '';

  const nameRowLabel = _activeTab === 'quantity_units' ? 'Name (singular)' : 'Name';

  const quPluralField = _activeTab === 'quantity_units' ? `
    <div class="form-group">
      <label class="form-label">Name (plural)</label>
      <input type="text" id="modal-name-plural" class="form-input" value="${escapeHtml(entity?.name_plural || '')}" placeholder="e.g. Pieces">
    </div>
  ` : '';

  showModal(title, `
    <div class="form-group">
      <label class="form-label">${nameRowLabel} *</label>
      <input type="text" id="modal-name" class="form-input" value="${escapeHtml(entity?.name || '')}" placeholder="Name" autocomplete="off">
    </div>
    ${quPluralField}
    <div class="form-group">
      <label class="form-label">Description</label>
      <input type="text" id="modal-desc" class="form-input" value="${escapeHtml(entity?.description || '')}" placeholder="Optional description" autocomplete="off">
    </div>
    ${extraFields}
    <button class="btn btn-primary" style="width:100%;" id="modal-save">${isNew ? 'Create' : 'Save'}</button>
  `);

  document.getElementById('modal-save')?.addEventListener('click', async () => {
    const name = document.getElementById('modal-name')?.value?.trim();
    if (!name) { showToast('Name is required', 'error'); return; }

    const payload = { name, description: document.getElementById('modal-desc')?.value?.trim() || '' };

    if (_activeTab === 'locations') {
      payload.is_freezer = document.getElementById('modal-freezer')?.checked ? 1 : 0;
    }
    if (_activeTab === 'quantity_units') {
      payload.name_plural = document.getElementById('modal-name-plural')?.value?.trim() || name;
    }

    const btn = document.getElementById('modal-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

    try {
      if (isNew) {
        await createEntity(payload);
        showToast(`${getActiveLabel(true)} created`, 'success');
      } else {
        await updateEntity(entity.id, payload);
        showToast(`${getActiveLabel(true)} updated`, 'success');
      }
      closeModal();
      await reloadActiveData();
      renderView();
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  });
}

/* =================================================================
   Delete
   ================================================================= */
function confirmDelete(id) {
  const entity = getActiveList().find(e => String(e.id) === String(id));
  const name = entity ? entity.name : 'this item';

  showModal('Delete ' + getActiveLabel(true), `
    <p>Are you sure you want to delete <strong>${escapeHtml(name)}</strong>?</p>
    <div style="display:flex;gap:12px;margin-top:16px;">
      <button class="btn btn-secondary" id="del-cancel" style="flex:1;">Cancel</button>
      <button class="btn btn-danger" id="del-confirm" style="flex:1;">Delete</button>
    </div>
  `);

  document.getElementById('del-cancel')?.addEventListener('click', closeModal);
  document.getElementById('del-confirm')?.addEventListener('click', async () => {
    try {
      await deleteEntity(id);
      closeModal();
      showToast(`${getActiveLabel(true)} deleted`, 'success');
      await reloadActiveData();
      renderView();
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  });
}

/* =================================================================
   Helpers — CRUD proxies
   ================================================================= */
function getActiveList() {
  if (_activeTab === 'locations') return _locations;
  if (_activeTab === 'quantity_units') return _quantityUnits;
  return _productGroups;
}

function getActiveLabel(singular = false) {
  if (_activeTab === 'locations') return singular ? 'Location' : 'Locations';
  if (_activeTab === 'quantity_units') return singular ? 'Quantity Unit' : 'Quantity Units';
  return singular ? 'Product Group' : 'Product Groups';
}

async function createEntity(data) {
  if (_activeTab === 'locations') return api.createLocation(data);
  if (_activeTab === 'quantity_units') return api.createQuantityUnit(data);
  return api.createProductGroup(data);
}

async function updateEntity(id, data) {
  if (_activeTab === 'locations') return api.updateLocation(id, data);
  if (_activeTab === 'quantity_units') return api.updateQuantityUnit(id, data);
  return api.updateProductGroup(id, data);
}

async function deleteEntity(id) {
  if (_activeTab === 'locations') return api.deleteLocation(id);
  if (_activeTab === 'quantity_units') return api.deleteQuantityUnit(id);
  return api.deleteProductGroup(id);
}

async function reloadActiveData() {
  try {
    if (_activeTab === 'locations') _locations = await api.getLocations();
    else if (_activeTab === 'quantity_units') _quantityUnits = await api.getQuantityUnits();
    else _productGroups = await api.getProductGroups();
  } catch { /* keep stale data */ }
}
