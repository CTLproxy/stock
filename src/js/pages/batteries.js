/**
 * Batteries List Page — Browse and manage all batteries
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, escapeHtml, debounce,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _batteries = [];
let _batteryDetails = [];

export function renderBatteries() {
  setHeader('Batteries', false,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
    () => { location.hash = '/battery/new'; }
  );

  renderPage(`
    <div class="search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="batteries-search" placeholder="Search batteries..." autocomplete="off" autocorrect="off" spellcheck="false">
    </div>

    <div id="batteries-count" class="text-secondary mb-md" style="font-size: 13px; padding: 0 4px;"></div>

    <div class="product-list" id="batteries-list">
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
    </div>
  `);

  loadBatteriesData();
  setRefreshHandler(loadBatteriesData);
}

async function loadBatteriesData() {
  try {
    const batteries = await api.getBatteries();
    _batteries = batteries.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Try to get details for each battery (includes last_tracked_time)
    _batteryDetails = [];
    try {
      const details = await Promise.all(
        _batteries.map(b => api.getBatteryDetails(b.id).catch(() => null))
      );
      _batteryDetails = details.filter(Boolean);
    } catch { /* ignore */ }

    renderBatteriesList(_batteries);
    setupSearch();
  } catch (e) {
    showToast('Failed to load batteries', 'error');
  }
}

function setupSearch() {
  const searchInput = document.getElementById('batteries-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      const term = (searchInput.value || '').toLowerCase().trim();
      const filtered = term
        ? _batteries.filter(b => (b.name || '').toLowerCase().includes(term) || (b.description || '').toLowerCase().includes(term))
        : _batteries;
      renderBatteriesList(filtered);
    }, 200));
  }
}

function getBatteryIcon(battery) {
  const detail = _batteryDetails.find(d => String(d.battery?.id) === String(battery.id));
  const chargeCount = detail?.charge_cycles_count || 0;
  if (chargeCount === 0) return '\u{1F50B}'; // full battery emoji
  return '\u{1F50B}';
}

function getLastCharged(battery) {
  const detail = _batteryDetails.find(d => String(d.battery?.id) === String(battery.id));
  if (!detail?.last_charged) return null;
  return detail.last_charged;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function getChargeBadgeClass(dateStr) {
  if (!dateStr) return 'badge-neutral';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return 'badge-ok';
  if (diffDays <= 30) return 'badge-warning';
  return 'badge-overdue';
}

function renderBatteriesList(items) {
  const listEl = document.getElementById('batteries-list');
  const countEl = document.getElementById('batteries-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = `${items.length} batter${items.length !== 1 ? 'ies' : 'y'}`;
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="6" width="18" height="12" rx="2" ry="2"/>
            <line x1="23" y1="13" x2="23" y2="11"/>
          </svg>
        </div>
        <div class="empty-state-title">No batteries found</div>
        <div class="empty-state-text">Add your first battery to start tracking</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(battery => {
    const icon = getBatteryIcon(battery);
    const lastCharged = getLastCharged(battery);
    const badgeClass = getChargeBadgeClass(lastCharged);
    const badgeText = formatRelativeDate(lastCharged);
    const chargeCycles = battery.charge_cycles_count || _batteryDetails.find(d => String(d.battery?.id) === String(battery.id))?.charge_cycles_count || 0;

    return `
      <div class="product-item" onclick="location.hash='/battery/${battery.id}'">
        <div class="product-icon">${icon}</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(battery.name)}</div>
          <div class="product-meta">${chargeCycles} cycle${chargeCycles !== 1 ? 's' : ''}${battery.description ? ' \u00b7 ' + escapeHtml(battery.description) : ''}</div>
        </div>
        <span class="product-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}
