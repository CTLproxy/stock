/**
 * Chore Detail Page — View, edit, track, and manage a single chore
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  escapeHtml, formatAmount,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _chore = null;
let _detail = null;
let _choreLog = [];
let _editMode = false;
let _isNew = false;
let _products = [];

const PERIOD_LABELS = {
  manually: 'Manual',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/* =================================================================
   Public: Render chore detail (view / edit)
   ================================================================= */
export async function renderChoreDetail(params) {
  const choreId = params.id;
  if (!choreId) { location.hash = '/chores'; return; }

  _isNew = false;
  _editMode = false;

  setHeader('Chore', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const [chores, detail, products] = await Promise.all([
      api.getChores(),
      api.getChoreDetails(choreId),
      api.getProducts().catch(() => []),
    ]);

    _chore = chores.find(c => String(c.id) === String(choreId));
    _detail = detail;
    _products = products;

    if (!_chore) {
      renderPage(`<div class="empty-state"><div class="empty-state-title">Chore not found</div></div>`);
      return;
    }

    // Load execution log
    try {
      _choreLog = await api.getChoreLog(choreId);
      _choreLog.sort((a, b) => (b.tracked_time || '').localeCompare(a.tracked_time || ''));
    } catch { _choreLog = []; }

    setHeader(escapeHtml(_chore.name), true);
    renderView();
    setRefreshHandler(() => renderChoreDetail(params));
  } catch (e) {
    renderPage(`<div class="empty-state"><div class="empty-state-title">Failed to load chore</div><div class="empty-state-text">${escapeHtml(e.message)}</div></div>`);
  }
}

/* =================================================================
   Public: Create new chore
   ================================================================= */
export async function renderChoreCreate() {
  _chore = null;
  _detail = null;
  _choreLog = [];
  _isNew = true;
  _editMode = true;

  setHeader('New Chore', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    _products = await api.getProducts();
  } catch { _products = []; }

  renderEditForm({
    name: '',
    description: '',
    period_type: 'manually',
    period_interval: 1,
    track_date_only: 1,
    consume_product_on_execution: 0,
    product_id: '',
    product_amount: 1,
  });
}

/* =================================================================
   VIEW MODE
   ================================================================= */
function renderView() {
  const nextDue = _detail?.next_estimated_execution_time;
  const lastTracked = _detail?.last_tracked;
  const totalCount = _detail?.track_count ?? _choreLog.length;
  const periodLabel = PERIOD_LABELS[_chore.period_type] || _chore.period_type || '\u2014';

  let statusText = '\u2014';
  let statusColor = 'neutral';

  if (_chore.period_type === 'manually') {
    statusText = 'Manual';
    statusColor = 'neutral';
  } else if (nextDue) {
    const now = new Date();
    const due = new Date(nextDue);
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const dueStr = `${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}-${String(due.getDate()).padStart(2,'0')}`;
    if (dueStr < todayStr) {
      const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
      statusText = `${diffDays}d overdue`; statusColor = 'red';
    }
    else if (dueStr === todayStr) { statusText = 'Due today'; statusColor = 'orange'; }
    else {
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
      if (diffDays <= 3) { statusText = `Due in ${diffDays}d`; statusColor = 'orange'; }
      else { statusText = `Due in ${diffDays}d`; statusColor = 'green'; }
    }
  }

  const periodInfo = _chore.period_type !== 'manually'
    ? `Every ${_chore.period_interval || 1} ${_chore.period_type?.replace('ly', '') || ''}(s)`
    : 'When needed';

  const consumeProduct = _chore.consume_product_on_execution == 1 && _chore.product_id
    ? _products.find(p => String(p.id) === String(_chore.product_id))
    : null;

  renderPage(`
    <div class="detail-hero">
      <div class="detail-emoji">\u2705</div>
      <div class="detail-name">${escapeHtml(_chore.name)}</div>
      <div class="detail-subtitle">${periodLabel} \u00b7 ${periodInfo}</div>
    </div>

    <div class="section">
      <div class="stats-grid stats-grid--detail">
        <div class="stat-card">
          <div class="stat-label">Times done</div>
          <div class="stat-value">${totalCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Last tracked</div>
          <div class="stat-value">${lastTracked ? formatDateTime(lastTracked) : 'Never'}</div>
          ${lastTracked ? `<div class="stat-sub">${formatRelativeTime(lastTracked)}</div>` : ''}
        </div>
        <div class="stat-card">
          <div class="stat-label">Next tracking</div>
          <div class="stat-value stat-value-${statusColor}">${nextDue ? formatDateTime(nextDue) : (_chore.period_type === 'manually' ? 'Manual' : '\u2014')}</div>
          ${nextDue ? `<div class="stat-sub stat-sub-${statusColor}">${formatRelativeTime(nextDue)}</div>` : ''}
        </div>
        <div class="stat-card">
          <div class="stat-label">Status</div>
          <div class="stat-value stat-value-${statusColor}">${statusText}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <button class="btn btn-primary btn-block" id="btn-track-chore">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Track Chore
      </button>
    </div>

    ${_chore.description ? `
      <div class="section">
        <div class="section-title">Description</div>
        <div class="card" style="padding: 12px;">${escapeHtml(_chore.description)}</div>
      </div>
    ` : ''}

    ${consumeProduct ? `
      <div class="section">
        <div class="section-title">Consumes on execution</div>
        <div class="product-item" style="background:var(--color-glass);border-radius:var(--radius-md);padding:12px;">
          <div class="product-icon">\u{1F4E6}</div>
          <div class="product-info">
            <div class="product-name">${escapeHtml(consumeProduct.name)}</div>
            <div class="product-meta">\u00d7 ${formatAmount(_chore.product_amount || 1)} per execution</div>
          </div>
        </div>
      </div>
    ` : ''}

    ${_choreLog.length > 0 ? `
      <div class="section">
        <div class="section-title">Execution log</div>
        <div class="product-list">
          ${_choreLog.slice(0, 20).map(entry => `
            <div class="product-item">
              <div class="product-icon">\u{1F4CB}</div>
              <div class="product-info">
                <div class="product-name">${formatDateTime(entry.tracked_time)}</div>
                <div class="product-meta">${entry.done_by_user_id ? 'User #' + entry.done_by_user_id : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="section" style="display:flex;gap:12px;margin-top:8px;">
      <button class="btn btn-secondary" id="btn-edit-chore" style="flex:1;">Edit</button>
      <button class="btn btn-danger" id="btn-delete-chore" style="flex:1;">Delete</button>
    </div>
  `);

  document.getElementById('btn-track-chore')?.addEventListener('click', showTrackModal);
  document.getElementById('btn-edit-chore')?.addEventListener('click', () => {
    _editMode = true;
    renderEditForm(_chore);
  });
  document.getElementById('btn-delete-chore')?.addEventListener('click', confirmDelete);
}

/* =================================================================
   TRACK MODAL
   ================================================================= */
function showTrackModal() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const localISO = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const trackDateOnly = _chore.track_date_only == 1;
  const consumeOnExec = _chore.consume_product_on_execution == 1;
  const linkedProduct = consumeOnExec && _chore.product_id
    ? _products.find(p => String(p.id) === String(_chore.product_id))
    : null;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">Track Chore</div>
    </div>
    <div class="modal-body" style="padding: 16px 0;">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" id="track-date" class="form-input" value="${todayStr}">
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="track-include-time" ${trackDateOnly ? '' : 'checked'}>
          Include time
        </label>
      </div>
      <div class="form-group" id="track-time-group" style="${trackDateOnly ? 'display:none;' : ''}">
        <label class="form-label">Time</label>
        <input type="time" id="track-time" class="form-input" value="${localISO.slice(11, 16)}">
      </div>
      ${consumeOnExec && linkedProduct ? `
        <div class="form-group" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--color-glass-border);">
          <div class="form-label" style="margin-bottom:4px;">Consume on execution</div>
          <div style="font-size:14px;color:var(--color-text-secondary);margin-bottom:8px;">${escapeHtml(linkedProduct.name)} \u00d7 ${formatAmount(_chore.product_amount || 1)}</div>
        </div>
      ` : ''}
    </div>
    <div class="modal-footer" style="display:flex;gap:12px;">
      <button class="btn btn-secondary" id="track-cancel" style="flex:1;">Cancel</button>
      <button class="btn btn-primary" id="track-confirm" style="flex:1;">Track</button>
    </div>
  `);

  // Toggle time input
  document.getElementById('track-include-time')?.addEventListener('change', (e) => {
    const tg = document.getElementById('track-time-group');
    if (tg) tg.style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('track-cancel')?.addEventListener('click', closeModal);
  document.getElementById('track-confirm')?.addEventListener('click', async () => {
    const dateVal = document.getElementById('track-date')?.value;
    const includeTime = document.getElementById('track-include-time')?.checked;
    const timeVal = document.getElementById('track-time')?.value;

    let trackedTime;
    if (dateVal && includeTime && timeVal) {
      trackedTime = `${dateVal} ${timeVal}:00`;
    } else if (dateVal) {
      trackedTime = `${dateVal} 00:00:00`;
    }

    const btn = document.getElementById('track-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Tracking\u2026'; }

    try {
      await api.trackChore(_chore.id, trackedTime);

      // Consume linked product if configured
      if (consumeOnExec && _chore.product_id) {
        try {
          await api.consumeProduct(_chore.product_id, _chore.product_amount || 1);
        } catch (ce) {
          showToast('Chore tracked but consume failed: ' + ce.message, 'error');
        }
      }

      closeModal();
      showToast('Chore tracked!', 'success');
      window.dispatchEvent(new Event('chores-changed'));
      renderChoreDetail({ id: _chore.id });
    } catch (e) {
      showToast('Failed to track: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  });
}

/* =================================================================
   EDIT FORM
   ================================================================= */
function renderEditForm(data) {
  const nameVal = data.name || '';
  const descVal = data.description || '';
  const periodType = data.period_type || 'manually';
  const periodInterval = data.period_interval ?? 1;
  const trackDateOnly = data.track_date_only ?? 1;
  const consumeOnExec = data.consume_product_on_execution ?? 0;
  const productId = data.product_id || '';
  const productAmount = data.product_amount ?? 1;
  const startDateRaw = data.start_date || '';
  const startDateVal = startDateRaw ? startDateRaw.split(' ')[0].split('T')[0] : '';
  const startTimeVal = startDateRaw && (startDateRaw.includes(' ') || startDateRaw.includes('T'))
    ? (startDateRaw.split(/[ T]/)[1] || '').substring(0, 5) : '';

  setHeader(_isNew ? 'New Chore' : 'Edit Chore', true);

  const productOptions = _products.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(p => `<option value="${p.id}" ${String(p.id) === String(productId) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');

  renderPage(`
    <div class="section">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="chore-name" class="form-input" value="${escapeHtml(nameVal)}" placeholder="e.g. Vacuum living room" required>
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="chore-description" class="form-input" rows="3" placeholder="Optional notes">${escapeHtml(descVal)}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Period type</label>
        <select id="chore-period-type" class="form-input">
          <option value="manually" ${periodType === 'manually' ? 'selected' : ''}>Manual</option>
          <option value="daily" ${periodType === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="weekly" ${periodType === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="monthly" ${periodType === 'monthly' ? 'selected' : ''}>Monthly</option>
          <option value="yearly" ${periodType === 'yearly' ? 'selected' : ''}>Yearly</option>
        </select>
      </div>

      <div class="form-group" id="interval-group" style="${periodType === 'manually' ? 'display:none;' : ''}">
        <label class="form-label">Period interval</label>
        <input type="number" id="chore-period-interval" class="form-input" min="1" value="${periodInterval}">
      </div>

      <div class="form-group" id="start-date-group" style="${periodType === 'manually' ? 'display:none;' : ''}">
        <label class="form-label">Start date</label>
        <input type="date" id="chore-start-date" class="form-input" value="${startDateVal}">
        <div style="font-size:12px;color:var(--color-text-tertiary);margin-top:4px;">First expected execution. Schedule is calculated from this date.</div>
      </div>

      <div class="form-group" id="start-time-group" style="${periodType === 'manually' || trackDateOnly ? 'display:none;' : ''}">
        <label class="form-label">Start time (optional)</label>
        <input type="time" id="chore-start-time" class="form-input" value="${startTimeVal}">
      </div>

      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="chore-track-date-only" ${trackDateOnly ? 'checked' : ''}>
          Track date only (no time)
        </label>
      </div>

      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--color-glass-border);">
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="chore-consume-product" ${consumeOnExec ? 'checked' : ''}>
            Consume product on execution
          </label>
        </div>

        <div id="consume-product-fields" style="${consumeOnExec ? '' : 'display:none;'}">
          <div class="form-group">
            <label class="form-label">Product</label>
            <select id="chore-product-id" class="form-input">
              <option value="">-- Select product --</option>
              ${productOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount to consume</label>
            <input type="number" id="chore-product-amount" class="form-input" min="0.01" step="1" value="${productAmount}">
          </div>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-top:16px;">
        <button class="btn btn-secondary" id="btn-cancel" style="flex:1;">Cancel</button>
        <button class="btn btn-primary" id="btn-save" style="flex:1;">Save</button>
      </div>
    </div>
  `);

  // Toggle interval group & start-date visibility
  document.getElementById('chore-period-type')?.addEventListener('change', (e) => {
    const isManual = e.target.value === 'manually';
    const ig = document.getElementById('interval-group');
    const sdg = document.getElementById('start-date-group');
    const stg = document.getElementById('start-time-group');
    if (ig) ig.style.display = isManual ? 'none' : '';
    if (sdg) sdg.style.display = isManual ? 'none' : '';
    if (stg) stg.style.display = isManual || document.getElementById('chore-track-date-only')?.checked ? 'none' : '';
  });

  // Toggle start-time visibility based on track-date-only
  document.getElementById('chore-track-date-only')?.addEventListener('change', (e) => {
    const stg = document.getElementById('start-time-group');
    if (stg) stg.style.display = e.target.checked || document.getElementById('chore-period-type')?.value === 'manually' ? 'none' : '';
  });

  // Toggle consume-product fields
  document.getElementById('chore-consume-product')?.addEventListener('change', (e) => {
    const cpf = document.getElementById('consume-product-fields');
    if (cpf) cpf.style.display = e.target.checked ? '' : 'none';
  });

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    if (_isNew) {
      location.hash = '/chores';
    } else {
      _editMode = false;
      renderView();
    }
  });

  document.getElementById('btn-save')?.addEventListener('click', saveChore);
}

async function saveChore() {
  const name = document.getElementById('chore-name')?.value?.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  const consumeOnExec = document.getElementById('chore-consume-product')?.checked ? 1 : 0;
  const productId = document.getElementById('chore-product-id')?.value || '';
  const productAmount = parseFloat(document.getElementById('chore-product-amount')?.value) || 1;

  const trackDateOnly = document.getElementById('chore-track-date-only')?.checked ? 1 : 0;
  const periodType = document.getElementById('chore-period-type')?.value || 'manually';
  const startDate = document.getElementById('chore-start-date')?.value || '';
  const startTime = document.getElementById('chore-start-time')?.value || '';
  let startDateStr = '';
  if (startDate && periodType !== 'manually') {
    startDateStr = trackDateOnly || !startTime
      ? `${startDate} 00:00:00`
      : `${startDate} ${startTime}:00`;
  }

  const payload = {
    name,
    description: document.getElementById('chore-description')?.value?.trim() || '',
    period_type: periodType,
    period_interval: parseInt(document.getElementById('chore-period-interval')?.value) || 1,
    track_date_only: trackDateOnly,
    consume_product_on_execution: consumeOnExec,
    product_id: consumeOnExec && productId ? parseInt(productId) : '',
    product_amount: consumeOnExec ? productAmount : 1,
  };
  if (startDateStr) payload.start_date = startDateStr;

  try {
    if (_isNew) {
      const result = await api.createChore(payload);
      showToast('Chore created!', 'success');
      const newId = result?.created_object_id;
      location.hash = newId ? `/chore/${newId}` : '/chores';
    } else {
      await api.updateChore(_chore.id, payload);
      showToast('Chore updated!', 'success');
      renderChoreDetail({ id: _chore.id });
    }
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}

/* =================================================================
   DELETE
   ================================================================= */
function confirmDelete() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Delete Chore</div>
    </div>
    <div class="modal-body" style="padding: 16px;">
      <p>Are you sure you want to delete <strong>${escapeHtml(_chore.name)}</strong>? This cannot be undone.</p>
    </div>
    <div class="modal-footer" style="display:flex;gap:12px;padding:16px;">
      <button class="btn btn-secondary" id="del-cancel" style="flex:1;">Cancel</button>
      <button class="btn btn-danger" id="del-confirm" style="flex:1;">Delete</button>
    </div>
  `);

  document.getElementById('del-cancel')?.addEventListener('click', closeModal);
  document.getElementById('del-confirm')?.addEventListener('click', async () => {
    try {
      await api.deleteChore(_chore.id);
      closeModal();
      showToast('Chore deleted', 'success');
      location.hash = '/chores';
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  });
}

/* =================================================================
   HELPERS
   ================================================================= */
function formatDateTime(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return dateStr; }
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = Math.abs(now - date);
  const isPast = now > date;

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  let unit;
  if (days === 0) {
    if (minutes < 1) return 'just now';
    if (minutes < 60) unit = minutes === 1 ? '1 min' : `${minutes} min`;
    else unit = hours === 1 ? '1 hour' : `${hours} hours`;
  } else if (days === 1) return isPast ? 'yesterday' : 'tomorrow';
  else if (days < 7) unit = `${days} days`;
  else if (days < 30) unit = weeks === 1 ? '1 week' : `${weeks} weeks`;
  else if (days < 365) unit = months === 1 ? '1 month' : `${months} months`;
  else {
    const years = Math.floor(days / 365);
    unit = years === 1 ? '1 year' : `${years} years`;
  }

  if (!unit) return '';
  return isPast ? `${unit} ago` : `in ${unit}`;
}
