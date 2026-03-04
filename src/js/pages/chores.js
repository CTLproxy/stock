/**
 * Chores List Page — Browse and manage all household chores
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, escapeHtml, debounce,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _chores = [];
let _choreDetails = [];

const PERIOD_LABELS = {
  manually: 'Manual',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function renderChores() {
  setHeader('Chores', false,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
    () => { location.hash = '/chore/new'; }
  );

  renderPage(`
    <div class="search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="chores-search" placeholder="Search chores..." autocomplete="off" autocorrect="off" spellcheck="false">
    </div>

    <div id="chores-count" class="text-secondary mb-md" style="font-size: 13px; padding: 0 4px;"></div>

    <div class="product-list" id="chores-list">
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
    </div>
  `);

  loadChoresData();
  setRefreshHandler(loadChoresData);
}

async function loadChoresData() {
  try {
    const chores = await api.getChores();
    _chores = chores.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    _choreDetails = [];
    try {
      const details = await Promise.all(
        _chores.map(c => api.getChoreDetails(c.id).catch(() => null))
      );
      _choreDetails = details.filter(Boolean);
    } catch { /* ignore */ }

    renderChoresList(_chores);
    setupSearch();
  } catch (e) {
    showToast('Failed to load chores', 'error');
  }
}

function setupSearch() {
  const searchInput = document.getElementById('chores-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      const term = (searchInput.value || '').toLowerCase().trim();
      const filtered = term
        ? _chores.filter(c => (c.name || '').toLowerCase().includes(term) || (c.description || '').toLowerCase().includes(term))
        : _chores;
      renderChoresList(filtered);
    }, 200));
  }
}

function getChoreEmoji(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('vacuum') || n.includes('mop') || n.includes('floor')) return '\u{1F9F9}';
  if (n.includes('dish') || n.includes('wash')) return '\u{1F37D}\uFE0F';
  if (n.includes('laundry') || n.includes('cloth')) return '\u{1F9FA}';
  if (n.includes('trash') || n.includes('garbage') || n.includes('bin')) return '\u{1F5D1}\uFE0F';
  if (n.includes('clean') || n.includes('wipe')) return '\u2728';
  if (n.includes('cook') || n.includes('meal')) return '\u{1F373}';
  if (n.includes('garden') || n.includes('plant') || n.includes('water')) return '\u{1F331}';
  if (n.includes('iron')) return '\u{1F455}';
  if (n.includes('bed') || n.includes('sheet')) return '\u{1F6CF}\uFE0F';
  if (n.includes('bath') || n.includes('toilet') || n.includes('shower')) return '\u{1F6BF}';
  if (n.includes('window')) return '\u{1FA9F}';
  if (n.includes('pet') || n.includes('dog') || n.includes('cat') || n.includes('feed')) return '\u{1F43E}';
  return '\u2705';
}

function getLastTracked(chore) {
  const detail = _choreDetails.find(d => String(d.chore?.id) === String(chore.id));
  return detail?.last_tracked || null;
}

function getNextDue(chore) {
  const detail = _choreDetails.find(d => String(d.chore?.id) === String(chore.id));
  return detail?.next_estimated_execution_time || null;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return 'Never';
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

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDueBadgeClass(dateStr) {
  if (!dateStr) return 'badge-neutral';
  const date = new Date(dateStr);
  const now = new Date();
  const dueStr = localDateStr(date);
  const todayStr = localDateStr(now);
  if (dueStr < todayStr) return 'badge-overdue';
  if (dueStr === todayStr) return 'badge-warning';
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  if (diffDays <= 3) return 'badge-warning';
  return 'badge-ok';
}

function formatDue(dateStr) {
  if (!dateStr) return '\u2014';
  const date = new Date(dateStr);
  const now = new Date();
  const dueStr = localDateStr(date);
  const todayStr = localDateStr(now);
  if (dueStr < todayStr) {
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    return `${diffDays}d overdue`;
  }
  if (dueStr === todayStr) return 'Due today';
  const diffDays = Math.ceil((date - now) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderChoresList(items) {
  const listEl = document.getElementById('chores-list');
  const countEl = document.getElementById('chores-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = `${items.length} chore${items.length !== 1 ? 's' : ''}`;
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            <path d="M9 14l2 2 4-4"/>
          </svg>
        </div>
        <div class="empty-state-title">No chores found</div>
        <div class="empty-state-text">Add your first chore to start tracking</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(chore => {
    const emoji = getChoreEmoji(chore.name);
    const nextDue = getNextDue(chore);
    const lastTracked = getLastTracked(chore);
    const badgeClass = chore.period_type === 'manually' ? 'badge-neutral' : getDueBadgeClass(nextDue);
    const badgeText = chore.period_type === 'manually' ? 'Manual' : formatDue(nextDue);
    const period = PERIOD_LABELS[chore.period_type] || chore.period_type || '';

    // Determine item-level highlight class
    let highlightClass = '';
    if (chore.period_type !== 'manually' && nextDue) {
      const now = new Date();
      const due = new Date(nextDue);
      const dStr = localDateStr(due);
      const tStr = localDateStr(now);
      if (dStr < tStr) highlightClass = 'chore-item-overdue';
      else if (dStr === tStr) highlightClass = 'chore-item-due-today';
    }

    const lastTrackedStr = lastTracked ? `Last: ${formatRelativeDate(lastTracked)}` : '';
    const metaParts = [period, lastTrackedStr].filter(Boolean).join(' \u00b7 ');

    return `
      <div class="product-item ${highlightClass}" onclick="location.hash='/chore/${chore.id}'">
        <div class="product-icon">${emoji}</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(chore.name)}</div>
          <div class="product-meta">${metaParts}${chore.description ? ' \u00b7 ' + escapeHtml(chore.description) : ''}</div>
        </div>
        <span class="product-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');
}
