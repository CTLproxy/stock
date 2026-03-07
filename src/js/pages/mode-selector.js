/**
 * Mode Selector Page — Switch between app modes and access settings
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, escapeHtml,
} from '../ui.js';

const MODES = [
  {
    id: 'grocery',
    name: 'Grocery Management',
    description: 'Track stock, products, shopping lists and scan barcodes',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>`,
    color: 'green',
    route: '/',
  },
  {
    id: 'batteries',
    name: 'Battery Tracking',
    description: 'Monitor battery charge cycles and replacement schedules',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="1" y="6" width="18" height="12" rx="2" ry="2"/>
      <line x1="23" y1="13" x2="23" y2="11"/>
      <line x1="6" y1="10" x2="6" y2="14"/>
      <line x1="10" y1="10" x2="10" y2="14"/>
      <line x1="14" y1="10" x2="14" y2="14"/>
    </svg>`,
    color: 'yellow',
    route: '/batteries',
  },
  {
    id: 'chores',
    name: 'Household Chores',
    description: 'Track recurring chores and household tasks',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      <path d="M9 14l2 2 4-4"/>
    </svg>`,
    color: 'purple',
    route: '/chores',
  },
  {
    id: 'equipment',
    name: 'Equipment',
    description: 'Track equipment, manuals and instruction sheets',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>`,
    color: 'teal',
    route: '/equipment',
  },
  {
    id: 'recipes',
    name: 'Recipes',
    description: 'Manage recipes, ingredients and meal planning',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="8" y1="7" x2="16" y2="7"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>`,
    color: 'red',
    route: '/recipes',
  },
  {
    id: 'meal-planner',
    name: 'Meal Planner',
    description: 'Plan breakfast, lunch and dinner in list or calendar view',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>
    </svg>`,
    color: 'orange',
    route: '/meal-planner',
  },
  {
    id: 'master-data',
    name: 'Master Data',
    description: 'Manage locations, quantity units, and product groups',
    icon: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>`,
    color: 'gray',
    route: '/master-data',
  },
];

export function renderModeSelector() {
  setHeader('Mode', false);

  const modesHtml = MODES.map(mode => `
    <button class="mode-card" data-route="${mode.route}">
      <div class="mode-card-icon stat-icon ${mode.color}">
        ${mode.icon}
      </div>
      <div class="mode-card-info">
        <div class="mode-card-name">${escapeHtml(mode.name)}</div>
        <div class="mode-card-desc">${escapeHtml(mode.description)}</div>
      </div>
      <div class="settings-item-chevron">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </button>
  `).join('');

  renderPage(`
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Select Mode</h2>
      </div>
      <div class="mode-card-list">
        ${modesHtml}
      </div>
    </div>

    <div class="section" style="padding-top: 0;">
      <div class="section-header">
        <h2 class="section-title">System</h2>
      </div>
      <div class="mode-card-list">
        <button class="mode-card" data-route="/settings">
          <div class="mode-card-icon stat-icon" style="background: var(--color-glass-bg);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <div class="mode-card-info">
            <div class="mode-card-name">Settings</div>
            <div class="mode-card-desc">Server connection, app preferences and updates</div>
          </div>
          <div class="settings-item-chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </button>
      </div>
    </div>
  `);

  // Navigation
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const route = card.dataset.route;
      if (route) location.hash = route;
    });
  });

  // Load chore badge
  loadChoresBadge();
}

async function loadChoresBadge() {
  try {
    const chores = await api.getChores();
    const periodicChores = chores.filter(c => c.period_type !== 'manually');
    if (periodicChores.length === 0) return;

    const details = await Promise.all(
      periodicChores.map(c => api.getChoreDetails(c.id).catch(() => null))
    );

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    let dueCount = 0;
    let overdueCount = 0;

    for (const d of details.filter(Boolean)) {
      const next = d.next_estimated_execution_time;
      if (!next) continue;
      const dueDate = new Date(next);
      const dueStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}-${String(dueDate.getDate()).padStart(2,'0')}`;
      if (dueStr < todayStr) overdueCount++;
      else if (dueStr === todayStr) dueCount++;
    }

    const total = dueCount + overdueCount;
    if (total === 0) return;

    // Find the chores card
    const choresCard = document.querySelector('.mode-card[data-route="/chores"]');
    if (!choresCard) return;

    const badge = document.createElement('span');
    badge.className = overdueCount > 0 ? 'mode-card-badge mode-card-badge-overdue' : 'mode-card-badge mode-card-badge-due';
    badge.textContent = total;
    choresCard.style.position = 'relative';
    choresCard.appendChild(badge);
  } catch { /* ignore */ }
}
