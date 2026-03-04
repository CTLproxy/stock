/**
 * Battery Detail Page — View, edit, charge, and manage a single battery
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  escapeHtml,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _battery = null;
let _detail = null;
let _chargeLog = [];
let _editMode = false;
let _isNew = false;

/* =================================================================
   Public: Render battery detail
   ================================================================= */
export async function renderBatteryDetail(params) {
  const batteryId = params.id;
  if (!batteryId) { location.hash = '/batteries'; return; }

  _isNew = false;
  _editMode = false;

  setHeader('Battery', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const [batteries, detail] = await Promise.all([
      api.getBatteries(),
      api.getBatteryDetails(batteryId),
    ]);

    _battery = batteries.find(b => String(b.id) === String(batteryId));
    _detail = detail;

    if (!_battery) {
      renderPage(`<div class="empty-state"><div class="empty-state-title">Battery not found</div></div>`);
      return;
    }

    // Load charge log
    try {
      _chargeLog = await api.getBatteryChargeLog(batteryId);
      _chargeLog.sort((a, b) => (b.tracked_time || '').localeCompare(a.tracked_time || ''));
    } catch { _chargeLog = []; }

    setHeader(escapeHtml(_battery.name), true);
    renderViewPage();
    setRefreshHandler(() => renderBatteryDetail(params));
  } catch (e) {
    showToast('Failed to load battery', 'error');
    renderPage(`<div class="empty-state"><div class="empty-state-title">Error</div><div class="empty-state-text">${escapeHtml(String(e.message || e))}</div></div>`);
  }
}

/* =================================================================
   Public: Render create-new-battery form
   ================================================================= */
export async function renderBatteryCreate() {
  _isNew = true;
  _editMode = true;
  _battery = { name: '', description: '', used_in: '', charge_interval_days: 0 };
  _detail = null;
  _chargeLog = [];

  setHeader('New Battery', true);
  renderEditPage();
}

/* =================================================================
   VIEW PAGE
   ================================================================= */
function renderViewPage() {
  const b = _battery;
  const lastCharged = _detail?.last_charged;
  const cycleCount = _detail?.charge_cycles_count || _chargeLog.length;

  let nextChargeDue = null;
  if (lastCharged && b.charge_interval_days > 0) {
    const d = new Date(lastCharged);
    d.setDate(d.getDate() + b.charge_interval_days);
    nextChargeDue = d;
  }

  const now = new Date();
  let statusText = 'OK';
  let statusClass = 'green';
  if (nextChargeDue) {
    const daysUntil = Math.ceil((nextChargeDue - now) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) {
      statusText = `${Math.abs(daysUntil)} days overdue`;
      statusClass = 'red';
    } else if (daysUntil === 0) {
      statusText = 'Due today';
      statusClass = 'orange';
    } else if (daysUntil <= 7) {
      statusText = `Due in ${daysUntil}d`;
      statusClass = 'orange';
    } else {
      statusText = `Due in ${daysUntil}d`;
      statusClass = 'green';
    }
  } else if (!lastCharged) {
    statusText = 'Never charged';
    statusClass = 'neutral';
  }

  renderPage(`
    <div class="detail-header">
      <div class="detail-hero">
        <span class="detail-emoji">\u{1F50B}</span>
        <h1 class="detail-name">${escapeHtml(b.name)}</h1>
        ${b.used_in ? `<span class="detail-subtitle">Used in: ${escapeHtml(b.used_in)}</span>` : ''}
      </div>
    </div>

    <div class="section">
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">${cycleCount}</span>
          <span class="stat-label">Charge Cycles</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${lastCharged ? formatShortDate(lastCharged) : '\u2014'}</span>
          <span class="stat-label">Last Charged</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${b.charge_interval_days > 0 ? b.charge_interval_days + 'd' : '\u2014'}</span>
          <span class="stat-label">Interval</span>
        </div>
        <div class="stat-card">
          <span class="stat-value stat-value-${statusClass}">${statusText}</span>
          <span class="stat-label">Status</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header"><h2 class="section-title">Actions</h2></div>
      <div class="quick-actions">
        <button class="quick-action" id="action-charge">
          <div class="quick-action-icon stat-icon green">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg>
          </div>
          <span class="quick-action-label">Charge</span>
        </button>
      </div>
    </div>

    ${_chargeLog.length > 0 ? `
    <div class="section">
      <div class="section-header"><h2 class="section-title">Charge History</h2></div>
      <div class="product-list" id="charge-log-list"></div>
    </div>` : ''}

    ${b.description ? `
    <div class="section">
      <div class="section-header"><h2 class="section-title">Description</h2></div>
      <div class="settings-group">
        <div class="settings-item" style="flex-direction:column;align-items:flex-start;gap:4px;">
          <span class="text-secondary" style="font-size:13px;">${escapeHtml(b.description)}</span>
        </div>
      </div>
    </div>` : ''}

    <div class="section" style="padding-bottom:32px;">
      <button class="btn btn-primary" style="width:100%;" id="btn-edit-battery">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit Battery
      </button>
      <button class="btn btn-danger" style="width:100%;margin-top:12px;" id="btn-delete-battery">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Delete Battery
      </button>
    </div>
  `);

  renderChargeLog();
  setupViewActions();
}

function renderChargeLog() {
  const container = document.getElementById('charge-log-list');
  if (!container || _chargeLog.length === 0) return;

  container.innerHTML = _chargeLog.slice(0, 20).map((entry, idx) => {
    const date = entry.tracked_time ? formatFullDate(entry.tracked_time) : 'Unknown';
    return `
      <div class="product-item">
        <div class="product-icon" style="font-size:14px;min-width:36px;height:36px;border-radius:10px;">#${idx + 1}</div>
        <div class="product-info">
          <div class="product-name">Charged</div>
          <div class="product-meta">${date}</div>
        </div>
      </div>`;
  }).join('');
}

function setupViewActions() {
  document.getElementById('action-charge')?.addEventListener('click', () => {
    showModal('Charge Battery', `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:48px;margin-bottom:12px;">\u26A1</div>
        <p style="margin:0 0 8px;">Mark <strong>${escapeHtml(_battery.name)}</strong> as charged?</p>
      </div>
      <div class="form-group">
        <label class="form-label">Tracked time (optional)</label>
        <input type="datetime-local" id="modal-tracked-time" class="form-input">
      </div>
      <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Mark Charged</button>
    `);

    document.getElementById('modal-confirm')?.addEventListener('click', async () => {
      const btn = document.getElementById('modal-confirm');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }
      try {
        const trackedTime = document.getElementById('modal-tracked-time')?.value || null;
        await api.chargeBattery(_battery.id, trackedTime || undefined);
        closeModal();
        showToast('Battery charged', 'success');
        renderBatteryDetail({ id: _battery.id });
      } catch (e) {
        showToast(String(e.message || e), 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
      }
    });
  });

  document.getElementById('btn-edit-battery')?.addEventListener('click', () => {
    _editMode = true;
    renderEditPage();
  });

  document.getElementById('btn-delete-battery')?.addEventListener('click', () => {
    showModal('Delete Battery', `
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:48px;margin-bottom:12px;">\u{1F50B}</div>
        <p style="margin:0 0 8px;">Delete <strong>${escapeHtml(_battery.name)}</strong>?</p>
        <p class="text-secondary" style="font-size:13px;margin:0;">This will permanently delete the battery and its charge history. This cannot be undone.</p>
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
        await api.deleteBattery(_battery.id);
        closeModal();
        showToast('Battery deleted', 'success');
        location.hash = '/batteries';
      } catch (e) {
        showToast(String(e.message || e), 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
      }
    });
  });
}

/* =================================================================
   EDIT PAGE
   ================================================================= */
function renderEditPage() {
  const b = _battery;
  setHeader(_isNew ? 'New Battery' : 'Edit ' + escapeHtml(b.name), true);

  renderPage(`
    <div class="section">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="edit-name" class="form-input" value="${escapeHtml(b.name || '')}" placeholder="Battery name" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="edit-description" class="form-input" rows="3" placeholder="Optional description">${escapeHtml(b.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Used in</label>
        <input type="text" id="edit-used-in" class="form-input" value="${escapeHtml(b.used_in || '')}" placeholder="e.g. TV Remote, Smoke Detector" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="form-label">Charge interval (days)</label>
        <input type="number" id="edit-interval" class="form-input" value="${b.charge_interval_days || 0}" min="0" step="1" placeholder="0 = no reminder">
      </div>
    </div>

    <div class="section" style="padding-bottom:32px;">
      <div style="display:flex;gap:12px;">
        <button class="btn" style="flex:1;" id="btn-cancel">Cancel</button>
        <button class="btn btn-primary" style="flex:1;" id="btn-save">${_isNew ? 'Create Battery' : 'Save Changes'}</button>
      </div>
    </div>
  `);

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    if (_isNew) {
      location.hash = '/batteries';
    } else {
      _editMode = false;
      setHeader(escapeHtml(_battery.name), true);
      renderViewPage();
    }
  });

  document.getElementById('btn-save')?.addEventListener('click', saveBattery);
}

async function saveBattery() {
  const name = document.getElementById('edit-name')?.value?.trim();
  const description = document.getElementById('edit-description')?.value?.trim() || '';
  const usedIn = document.getElementById('edit-used-in')?.value?.trim() || '';
  const interval = parseInt(document.getElementById('edit-interval')?.value || 0);

  if (!name) { showToast('Name is required', 'error'); return; }

  const btn = document.getElementById('btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

  const data = {
    name,
    description,
    used_in: usedIn,
    charge_interval_days: interval,
  };

  try {
    if (_isNew) {
      const result = await api.createBattery(data);
      const newId = result?.created_object_id || result?.id;
      showToast('Battery created', 'success');
      location.hash = newId ? `/battery/${newId}` : '/batteries';
    } else {
      await api.updateBattery(_battery.id, data);
      Object.assign(_battery, data);
      _editMode = false;
      showToast('Battery saved', 'success');
      setHeader(escapeHtml(_battery.name), true);
      renderViewPage();
    }
  } catch (e) {
    showToast(String(e.message || e), 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

/* =================================================================
   HELPERS
   ================================================================= */
function formatShortDate(dateStr) {
  if (!dateStr) return '\u2014';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
