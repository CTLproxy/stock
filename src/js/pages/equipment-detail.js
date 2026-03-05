/**
 * Equipment Detail Page — View, edit, create, and delete equipment
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  escapeHtml,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _item = null;
let _editMode = false;
let _isNew = false;
let _attachedFiles = []; // { name, url, isImage } — files associated with this equipment

/* =================================================================
   Public: Render equipment detail
   ================================================================= */
export async function renderEquipmentDetail(params) {
  const itemId = params.id;
  if (!itemId) { location.hash = '/equipment'; return; }

  _isNew = false;
  _editMode = false;

  setHeader('Equipment', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const items = await api.getEquipment();
    _item = items.find(e => String(e.id) === String(itemId));

    if (!_item) {
      renderPage(`<div class="empty-state"><div class="empty-state-title">Equipment not found</div></div>`);
      return;
    }

    setHeader(escapeHtml(_item.name), true);
    renderView();
    setRefreshHandler(() => renderEquipmentDetail(params));
  } catch (e) {
    renderPage(`<div class="empty-state"><div class="empty-state-title">Failed to load</div><div class="empty-state-text">${escapeHtml(e.message)}</div></div>`);
  }
}

/* =================================================================
   Public: Create new equipment
   ================================================================= */
export function renderEquipmentCreate() {
  _item = null;
  _isNew = true;
  _editMode = true;

  setHeader('New Equipment', true);
  renderEditForm({
    name: '',
    description: '',
    instruction_manual_file_name: '',
  });
}

/* =================================================================
   VIEW
   ================================================================= */
function renderView() {
  const manualFile = _item.instruction_manual_file_name || '';
  const hasManual = !!manualFile;
  const isImage = hasManual && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(manualFile);
  const isPdf = hasManual && /\.pdf$/i.test(manualFile);
  const isText = hasManual && /\.(txt|md)$/i.test(manualFile);

  renderPage(`
    <div class="detail-hero">
      <div class="detail-emoji">🏭</div>
      <div class="detail-name">${escapeHtml(_item.name)}</div>
    </div>

    ${_item.description ? `
      <div class="section">
        <div class="section-title">Description</div>
        <div class="card" style="padding: 12px; white-space: pre-wrap;">${escapeHtml(_item.description)}</div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Instructions / Manual</h2>
      </div>
      ${hasManual ? `
        <div class="card" style="padding:12px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <span style="font-size:24px;">${isImage ? '🖼️' : isPdf ? '📕' : isText ? '📝' : '📄'}</span>
            <span style="flex:1;word-break:break-all;font-size:14px;font-weight:500;">${escapeHtml(manualFile)}</span>
          </div>
          <div id="manual-preview-container" style="margin-bottom:10px;text-align:center;min-height:40px;">
            <div class="skeleton skeleton-rect" style="height:80px;"></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="btn-open-file" style="flex:1;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open File
            </button>
            <button class="btn btn-danger" id="btn-remove-manual" style="flex:0 0 auto;padding:0 16px;">Remove</button>
          </div>
        </div>
      ` : `
        <div class="card" style="padding:16px;text-align:center;">
          <div style="color:var(--color-text-secondary);margin-bottom:12px;">No instructions attached</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
            <label class="btn btn-secondary" style="cursor:pointer;flex:1;min-width:120px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              Upload File
              <input type="file" id="file-upload" accept="image/*,.pdf,.txt,.md" style="display:none;">
            </label>
            <label class="btn btn-secondary" style="cursor:pointer;flex:1;min-width:120px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Take Photo
              <input type="file" id="camera-capture" accept="image/*" capture="environment" style="display:none;">
            </label>
          </div>
        </div>
      `}
    </div>

    <div class="section" style="display:flex;gap:12px;margin-top:8px;">
      <button class="btn btn-secondary" id="btn-edit-equip" style="flex:1;">Edit</button>
      <button class="btn btn-danger" id="btn-delete-equip" style="flex:1;">Delete</button>
    </div>
  `);

  // File upload handler
  const fileUploadHandler = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadManualFile(file);
  };

  document.getElementById('file-upload')?.addEventListener('change', fileUploadHandler);
  document.getElementById('camera-capture')?.addEventListener('change', fileUploadHandler);

  // If there's a manual file, load it as a blob for preview and open
  let _blobUrl = null;
  if (hasManual) {
    loadFilePreview(manualFile, isImage, isPdf, isText).then(blobUrl => {
      _blobUrl = blobUrl;
    });
  }

  // Open file in new tab / external app
  document.getElementById('btn-open-file')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-open-file');
    const openFileUrl = (url) => {
      const win = window.open(url, '_blank');
      if (win) return;
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = manualFile;
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch {
        window.location.href = url;
      }
    };

    if (_blobUrl) {
      openFileUrl(_blobUrl);
      return;
    }
    // If blob not loaded yet, fetch now
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      const blob = await api.fetchFileAsBlob('equipmentmanuals', manualFile);
      _blobUrl = URL.createObjectURL(blob);
      openFileUrl(_blobUrl);
    } catch (e) {
      showToast('Could not open file: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Open File'; }
    }
  });

  // Remove manual
  document.getElementById('btn-remove-manual')?.addEventListener('click', () => {
    showModal('Remove File', `
      <p>Remove the instruction file?</p>
      <div style="display:flex;gap:12px;margin-top:16px;">
        <button class="btn btn-secondary" id="rm-cancel" style="flex:1;">Cancel</button>
        <button class="btn btn-danger" id="rm-confirm" style="flex:1;">Remove</button>
      </div>
    `);
    document.getElementById('rm-cancel')?.addEventListener('click', closeModal);
    document.getElementById('rm-confirm')?.addEventListener('click', async () => {
      try {
        await api.deleteFile('equipmentmanuals', manualFile);
        await api.updateEquipment(_item.id, { instruction_manual_file_name: '' });
        closeModal();
        if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
        showToast('File removed', 'success');
        renderEquipmentDetail({ id: _item.id });
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    });
  });

  document.getElementById('btn-edit-equip')?.addEventListener('click', () => {
    _editMode = true;
    renderEditForm(_item);
  });
  document.getElementById('btn-delete-equip')?.addEventListener('click', confirmDelete);
}

/**
 * Fetch the file via authenticated API call and show preview.
 * Returns the blob URL for reuse by the Open button.
 */
async function loadFilePreview(fileName, isImage, isPdf, isText) {
  const container = document.getElementById('manual-preview-container');
  if (!container) return null;

  try {
    const blob = await api.fetchFileAsBlob('equipmentmanuals', fileName);
    const blobUrl = URL.createObjectURL(blob);

    if (isImage) {
      container.innerHTML = `<img src="${blobUrl}" alt="Manual" style="max-width:100%;max-height:400px;border-radius:var(--radius-md);cursor:pointer;" id="manual-preview-img">`;
      // Tap to view fullscreen in modal
      document.getElementById('manual-preview-img')?.addEventListener('click', () => {
        showModal('Manual Preview', `
          <div style="text-align:center;">
            <img src="${blobUrl}" alt="Manual" style="max-width:100%;border-radius:var(--radius-md);">
          </div>
          <button class="btn btn-primary" style="width:100%;margin-top:12px;" id="modal-open-ext">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open in New Tab
          </button>
        `);
        document.getElementById('modal-open-ext')?.addEventListener('click', () => {
          window.open(blobUrl, '_blank');
        });
      });
    } else if (isPdf) {
      container.innerHTML = `<iframe src="${blobUrl}" title="PDF preview" style="width:100%;height:320px;border:0;border-radius:var(--radius-md);background:#fff;"></iframe>`;
    } else if (isText) {
      const text = await blob.text();
      const safe = escapeHtml(text.length > 20000 ? `${text.slice(0, 20000)}\n\n…(truncated)` : text);
      container.innerHTML = `
        <div style="background:var(--color-glass);border-radius:var(--radius-md);padding:12px;max-height:320px;overflow:auto;">
          <pre style="margin:0;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;font-size:12px;line-height:1.45;color:var(--color-text-primary);">${safe}</pre>
        </div>`;
    } else {
      container.innerHTML = `
        <div style="background:var(--color-glass);border-radius:var(--radius-md);padding:16px;">
          <div style="font-size:36px;margin-bottom:4px;">📄</div>
          <div style="font-size:13px;color:var(--color-text-secondary);">File ready to open</div>
        </div>`;
    }

    return blobUrl;
  } catch (e) {
    container.innerHTML = `<div style="color:var(--color-text-secondary);font-size:13px;">Could not load preview: ${escapeHtml(e.message)}</div>`;
    return null;
  }
}

/* =================================================================
   FILE UPLOAD
   ================================================================= */
async function uploadManualFile(file) {
  const ext = file.name.split('.').pop() || 'jpg';
  const sanitizedName = (_item?.name || 'equipment').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  const fileName = `${sanitizedName}_${Date.now()}.${ext}`;

  showToast('Uploading\u2026', 'info', 10000);

  try {
    await api.uploadFile('equipmentmanuals', fileName, file);
    await api.updateEquipment(_item.id, { instruction_manual_file_name: fileName });
    showToast('File uploaded!', 'success');
    renderEquipmentDetail({ id: _item.id });
  } catch (e) {
    showToast('Upload failed: ' + e.message, 'error');
  }
}

/* =================================================================
   EDIT FORM
   ================================================================= */
function renderEditForm(data) {
  setHeader(_isNew ? 'New Equipment' : 'Edit Equipment', true);

  const hasManual = !_isNew && !!data.instruction_manual_file_name;

  renderPage(`
    <div class="section">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="equip-name" class="form-input" value="${escapeHtml(data.name || '')}" placeholder="e.g. Vacuum Cleaner" required>
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea id="equip-description" class="form-input" rows="4" placeholder="Model, serial number, notes...">${escapeHtml(data.description || '')}</textarea>
      </div>

      ${!_isNew ? `
      <div class="form-group">
        <label class="form-label">Instructions / Manual</label>
        ${hasManual ? `
          <div class="card" style="padding:8px 12px;display:flex;align-items:center;gap:8px;">
            <span>📄</span>
            <span style="flex:1;word-break:break-all;font-size:13px;">${escapeHtml(data.instruction_manual_file_name)}</span>
          </div>
          <div style="margin-top:8px;font-size:13px;color:var(--color-text-secondary);">To change the file, remove it from the view and upload a new one.</div>
        ` : `
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label class="btn btn-secondary" style="cursor:pointer;flex:1;min-width:120px;text-align:center;">
              📎 Upload File
              <input type="file" id="edit-file-upload" accept="image/*,.pdf,.txt,.md" style="display:none;">
            </label>
            <label class="btn btn-secondary" style="cursor:pointer;flex:1;min-width:120px;text-align:center;">
              📷 Take Photo
              <input type="file" id="edit-camera-capture" accept="image/*" capture="environment" style="display:none;">
            </label>
          </div>
          <div id="edit-file-preview" style="margin-top:8px;font-size:13px;color:var(--color-text-secondary);"></div>
        `}
      </div>
      ` : ''}

      <div style="display:flex;gap:12px;margin-top:16px;">
        <button class="btn btn-secondary" id="btn-cancel" style="flex:1;">Cancel</button>
        <button class="btn btn-primary" id="btn-save" style="flex:1;">Save</button>
      </div>
    </div>
  `);

  // Track pending file upload
  let _pendingFile = null;
  const editFileHandler = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _pendingFile = file;
    const preview = document.getElementById('edit-file-preview');
    if (preview) preview.textContent = `Selected: ${file.name}`;
  };
  document.getElementById('edit-file-upload')?.addEventListener('change', editFileHandler);
  document.getElementById('edit-camera-capture')?.addEventListener('change', editFileHandler);

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    if (_isNew) {
      location.hash = '/equipment';
    } else {
      _editMode = false;
      renderView();
    }
  });

  document.getElementById('btn-save')?.addEventListener('click', () => saveEquipment(_pendingFile));
}

async function saveEquipment(pendingFile = null) {
  const name = document.getElementById('equip-name')?.value?.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  const payload = {
    name,
    description: document.getElementById('equip-description')?.value?.trim() || '',
  };

  const btn = document.getElementById('btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

  try {
    let equipId;
    if (_isNew) {
      const result = await api.createEquipment(payload);
      showToast('Equipment created!', 'success');
      equipId = result?.created_object_id;
    } else {
      await api.updateEquipment(_item.id, payload);
      equipId = _item.id;
    }

    // If there's a pending file, upload it now
    if (pendingFile && equipId) {
      const ext = pendingFile.name.split('.').pop() || 'jpg';
      const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
      const fileName = `${sanitizedName}_${Date.now()}.${ext}`;
      try {
        await api.uploadFile('equipmentmanuals', fileName, pendingFile);
        await api.updateEquipment(equipId, { instruction_manual_file_name: fileName });
      } catch (e) {
        showToast('Saved, but file upload failed: ' + e.message, 'warning');
      }
    }

    if (_isNew) {
      showToast('Equipment created!', 'success');
      location.hash = equipId ? `/equipment/${equipId}` : '/equipment';
    } else {
      showToast('Equipment updated!', 'success');
      renderEquipmentDetail({ id: _item.id });
    }
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

/* =================================================================
   DELETE
   ================================================================= */
function confirmDelete() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Delete Equipment</div>
    </div>
    <div class="modal-body" style="padding: 16px;">
      <p>Are you sure you want to delete <strong>${escapeHtml(_item.name)}</strong>? This cannot be undone.</p>
    </div>
    <div class="modal-footer" style="display:flex;gap:12px;">
      <button class="btn btn-secondary" id="del-cancel" style="flex:1;">Cancel</button>
      <button class="btn btn-danger" id="del-confirm" style="flex:1;">Delete</button>
    </div>
  `);

  document.getElementById('del-cancel')?.addEventListener('click', closeModal);
  document.getElementById('del-confirm')?.addEventListener('click', async () => {
    try {
      await api.deleteEquipment(_item.id);
      closeModal();
      showToast('Equipment deleted', 'success');
      location.hash = '/equipment';
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  });
}
