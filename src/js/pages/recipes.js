/**
 * Recipes List Page — Browse and manage recipes
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, escapeHtml, debounce,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';

let _recipes = [];
let _fulfillmentMap = {};
let _activeFilter = 'all'; // 'all' | 'available' | 'missing'

export function renderRecipes() {
  setHeader('Recipes', false,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
    () => { location.hash = '/recipe/new'; }
  );

  renderPage(`
    <div class="search-bar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="recipes-search" placeholder="Search recipes..." autocomplete="off" autocorrect="off" spellcheck="false">
    </div>

    <div class="tab-bar" id="recipes-filter" style="margin-bottom:8px;">
      <button class="tab-btn tab-btn-active" data-filter="all">All</button>
      <button class="tab-btn" data-filter="available">✓ Can Cook</button>
      <button class="tab-btn" data-filter="missing">✕ Missing</button>
    </div>

    <div id="recipes-count" class="text-secondary mb-md" style="font-size: 13px; padding: 0 4px;"></div>

    <div class="product-list" id="recipes-list">
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
    </div>
  `);

  loadRecipesData();
  setRefreshHandler(loadRecipesData);
}

async function loadRecipesData() {
  try {
    const [recipes, fulfillmentList] = await Promise.all([
      api.getRecipes(),
      api.getAllRecipesFulfillment().catch(() => []),
    ]);
    _recipes = recipes
      .filter(r => r.type === 'normal' || !r.type)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Build fulfillment map keyed by recipe_id
    _fulfillmentMap = {};
    if (Array.isArray(fulfillmentList)) {
      for (const f of fulfillmentList) {
        _fulfillmentMap[f.recipe_id] = f;
      }
    }

    applyFilters();
    setupSearch();
    setupFilterButtons();
  } catch (e) {
    showToast('Failed to load recipes', 'error');
  }
}

function setupSearch() {
  const searchInput = document.getElementById('recipes-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(() => {
      applyFilters();
    }, 200));
  }
}

function setupFilterButtons() {
  document.querySelectorAll('#recipes-filter .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeFilter = btn.dataset.filter;
      document.querySelectorAll('#recipes-filter .tab-btn').forEach(b => b.classList.remove('tab-btn-active'));
      btn.classList.add('tab-btn-active');
      applyFilters();
    });
  });
}

function applyFilters() {
  const term = (document.getElementById('recipes-search')?.value || '').toLowerCase().trim();
  let filtered = _recipes;

  // Text search
  if (term) {
    filtered = filtered.filter(r =>
      (r.name || '').toLowerCase().includes(term) ||
      (r.description || '').toLowerCase().includes(term)
    );
  }

  // Availability filter
  if (_activeFilter === 'available') {
    filtered = filtered.filter(r => {
      const f = _fulfillmentMap[r.id];
      return f && (f.recipe_fulfilled == 1 || f.recipe_fulfilled === true);
    });
  } else if (_activeFilter === 'missing') {
    filtered = filtered.filter(r => {
      const f = _fulfillmentMap[r.id];
      return !f || (f.recipe_fulfilled != 1 && f.recipe_fulfilled !== true);
    });
  }

  renderRecipesList(filtered);
}

function getRecipeEmoji(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('salad') || n.includes('vegeta')) return '🥗';
  if (n.includes('soup') || n.includes('stew')) return '🍜';
  if (n.includes('pasta') || n.includes('spaghetti') || n.includes('noodle')) return '🍝';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('cake') || n.includes('dessert') || n.includes('sweet')) return '🍰';
  if (n.includes('bread') || n.includes('toast') || n.includes('bak')) return '🍞';
  if (n.includes('chicken') || n.includes('poultry')) return '🍗';
  if (n.includes('fish') || n.includes('seafood') || n.includes('shrimp')) return '🐟';
  if (n.includes('steak') || n.includes('beef') || n.includes('meat')) return '🥩';
  if (n.includes('rice')) return '🍚';
  if (n.includes('egg')) return '🍳';
  if (n.includes('smoothie') || n.includes('juice') || n.includes('drink')) return '🥤';
  if (n.includes('sandwich') || n.includes('burger')) return '🍔';
  if (n.includes('taco') || n.includes('burrito')) return '🌮';
  if (n.includes('curry')) return '🍛';
  return '🍴';
}

function renderRecipesList(items) {
  const listEl = document.getElementById('recipes-list');
  const countEl = document.getElementById('recipes-count');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = `${items.length} recipe${items.length !== 1 ? 's' : ''}`;
  }

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="empty-state-title">No recipes found</div>
        <div class="empty-state-text">Add your first recipe to start cooking</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(recipe => {
    const emoji = getRecipeEmoji(recipe.name);
    const servings = recipe.base_servings ? `${recipe.base_servings} servings` : '';
    const desc = recipe.description ? escapeHtml(recipe.description.substring(0, 60)) : '';
    const meta = [servings, desc].filter(Boolean).join(' \u00b7 ');

    // Fulfillment badge
    const f = _fulfillmentMap[recipe.id];
    let badge = '';
    if (f) {
      if (f.recipe_fulfilled == 1 || f.recipe_fulfilled === true) {
        badge = '<span class="ingredient-badge ingredient-badge-ok" style="position:static;display:inline-flex;margin-left:6px;width:20px;height:20px;font-size:11px;" title="All ingredients available">✓</span>';
      } else {
        const mc = f.missing_products_count || '!';
        badge = `<span class="ingredient-badge ingredient-badge-missing" style="position:static;display:inline-flex;margin-left:6px;width:20px;height:20px;font-size:11px;" title="${mc} missing">${mc}</span>`;
      }
    }

    return `
      <div class="product-item" onclick="location.hash='/recipe/${recipe.id}'">
        <div class="product-icon">${emoji}</div>
        <div class="product-info">
          <div class="product-name" style="display:flex;align-items:center;">${escapeHtml(recipe.name)}${badge}</div>
          <div class="product-meta">${meta}</div>
        </div>
        <div class="settings-item-chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    `;
  }).join('');
}
