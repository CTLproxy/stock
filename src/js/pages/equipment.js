/**
 * Equipment List Page — Browse and manage equipment
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, escapeHtml, debounce,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _equipment = [];

export function renderEquipment() {
  setHeader('Equipment', false,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
    () => { location.hash = '/equipment/new'; }
  );

  renderPage(`
    <div class="search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="equip-search" placeholder="Search equipment..." autocomplete="off" autocorrect="off" spellcheck="false">
    </div>

    <div id="equip-count" class="text-secondary mb-md" style="font-size: 13px; padding: 0 4px;"></div>

    <div class="product-list" id="equip-list">
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
    </div>
  `);

  loadEquipmentData();
  setRefreshHandler(loadEquipmentData);
}

async function loadEquipmentData() {
  try {
    const equipment = await api.getEquipment();
    _equipment = equipment.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    renderEquipmentList(_equipment);
    setupSearch();
  } catch (e) {
    showToast('Failed to load equipment', 'error');
  }
}

function setupSearch() {
  const searchInput = document.getElementById('equip-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      const term = (searchInput.value || '').toLowerCase().trim();
      const filtered = term
        ? _equipment.filter(e => (e.name || '').toLowerCase().includes(term) || (e.description || '').toLowerCase().includes(term))
        : _equipment;
      renderEquipmentList(filtered);
    }, 200));
  }
}

function getEquipEmoji(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('drill') || n.includes('tool')) return '🔧';
  if (n.includes('vacuum') || n.includes('cleaner')) return '🧹';
  if (n.includes('washer') || n.includes('machine')) return '🧺';
  if (n.includes('fridge') || n.includes('refriger')) return '❄️';
  if (n.includes('oven') || n.includes('stove')) return '🍳';
  if (n.includes('tv') || n.includes('television') || n.includes('monitor')) return '📺';
  if (n.includes('computer') || n.includes('laptop') || n.includes('pc')) return '💻';
  if (n.includes('phone')) return '📱';
  if (n.includes('car') || n.includes('vehicle')) return '🚗';
  if (n.includes('camera')) return '📷';
  if (n.includes('printer')) return '🖨️';
  if (n.includes('light') || n.includes('lamp')) return '💡';
  if (n.includes('fan') || n.includes('air')) return '🌬️';
  return '🏭';
}

function renderEquipmentList(items) {
  const listEl = document.getElementById('equip-list');
  const countEl = document.getElementById('equip-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <div class="empty-state-title">No equipment found</div>
        <div class="empty-state-text">Add your first piece of equipment to start tracking</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(eq => {
    const emoji = getEquipEmoji(eq.name);
    return `
      <div class="product-item" onclick="location.hash='/equipment/${eq.id}'">
        <div class="product-icon">${emoji}</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(eq.name)}</div>
          <div class="product-meta">${eq.description ? escapeHtml(eq.description.substring(0, 80)) : ''}</div>
        </div>
        <div class="settings-item-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    `;
  }).join('');
}
