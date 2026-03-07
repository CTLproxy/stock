/**
 * Meal Planner Page — List + Calendar overview for planned recipe meals
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  escapeHtml, formatDate, todayStr, debounce,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';
import { MEAL_TYPE_OPTIONS, parseRecipeMealTypes, buildDescriptionWithMealTypes } from '../recipe-meal-tags.js';

let _recipes = [];
let _entries = [];
let _viewMode = 'list'; // list | calendar
let _mealFilter = 'all';
let _monthCursor = new Date();

const mealTypeLabel = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export function renderMealPlanner() {
  setHeader('Meal Planner', false,
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>`,
    () => showPlanMealModal(todayStr())
  );

  renderPage(`
    <div class="segmented-control" id="meal-view-toggle">
      <button class="segmented-btn ${_viewMode === 'list' ? 'active' : ''}" data-view="list">List</button>
      <button class="segmented-btn ${_viewMode === 'calendar' ? 'active' : ''}" data-view="calendar">Calendar</button>
    </div>

    <div class="tab-bar" id="meal-type-filter" style="margin-top:10px;">
      <button class="tab-btn ${_mealFilter === 'all' ? 'tab-btn-active' : ''}" data-filter="all">All Types</button>
      ${MEAL_TYPE_OPTIONS.map(type => `
        <button class="tab-btn ${_mealFilter === type ? 'tab-btn-active' : ''}" data-filter="${type}">${mealTypeLabel[type]}</button>
      `).join('')}
    </div>

    <div class="section" style="margin-top:-6px;">
      <button class="btn btn-secondary btn-sm" id="meal-copy-week">Copy Week Plan</button>
    </div>

    <div id="meal-planner-content" class="section">
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
      <div class="skeleton skeleton-rect"></div>
    </div>
  `);

  setupControls();
  loadPlannerData();
  setRefreshHandler(loadPlannerData);
}

async function loadPlannerData() {
  try {
    const [recipes, entries] = await Promise.all([
      api.getRecipes(),
      api.getMealPlanEntries(),
    ]);

    _recipes = (recipes || [])
      .filter(r => r.type === 'normal' || !r.type)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    _entries = (entries || []).map(entry => normalizeEntry(entry));

    renderPlannerView();
  } catch (e) {
    showToast('Failed to load meal planner', 'error');
    const content = document.getElementById('meal-planner-content');
    if (content) {
      content.innerHTML = `<div class="empty-state"><div class="empty-state-title">Could not load planner</div><div class="empty-state-text">${escapeHtml(e.message || 'Unknown error')}</div></div>`;
    }
  }
}

function normalizeEntry(entry) {
  const normalizedDay = String(entry.day || entry.date || '').slice(0, 10);
  const mealType = normalizeMealType(entry.type || entry.note || '');
  return {
    ...entry,
    day: normalizedDay,
    type: mealType,
    recipe_id: entry.recipe_id != null ? parseInt(entry.recipe_id, 10) : null,
  };
}

function normalizeMealType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (MEAL_TYPE_OPTIONS.includes(raw)) return raw;
  return '';
}

function setupControls() {
  document.getElementById('meal-view-toggle')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    _viewMode = btn.dataset.view || 'list';
    document.querySelectorAll('#meal-view-toggle .segmented-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    renderPlannerView();
  });

  document.getElementById('meal-type-filter')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    _mealFilter = btn.dataset.filter || 'all';
    document.querySelectorAll('#meal-type-filter .tab-btn').forEach(el => el.classList.remove('tab-btn-active'));
    btn.classList.add('tab-btn-active');
    renderPlannerView();
  });

  document.getElementById('meal-copy-week')?.addEventListener('click', () => {
    showCopyWeekHelperModal();
  });
}

function renderPlannerView() {
  const content = document.getElementById('meal-planner-content');
  if (!content) return;

  const filtered = getFilteredEntries();

  if (_viewMode === 'calendar') {
    renderCalendarView(content, filtered);
    return;
  }

  renderListView(content, filtered);
}

function getFilteredEntries() {
  return _entries
    .filter(e => e.day)
    .filter(e => _mealFilter === 'all' || e.type === _mealFilter)
    .sort((a, b) => {
      if (a.day === b.day) return mealTypeSort(a.type) - mealTypeSort(b.type);
      return a.day.localeCompare(b.day);
    });
}

function mealTypeSort(type) {
  return Math.max(0, MEAL_TYPE_OPTIONS.indexOf(type));
}

function renderListView(container, entries) {
  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No planned meals</div>
        <div class="empty-state-text">Use + to add breakfast, lunch or dinner plans</div>
      </div>
    `;
    return;
  }

  const recipeMap = Object.fromEntries(_recipes.map(r => [String(r.id), r]));
  const grouped = new Map();

  for (const entry of entries) {
    const key = entry.day;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  }

  container.innerHTML = [...grouped.entries()].map(([day, dayEntries]) => {
    const dayHeader = getDaySectionHeader(day);
    return `
    <div class="meal-day-group">
      <div class="meal-day-header">
        <div>
          <div class="meal-day-title">${escapeHtml(dayHeader.absolute)}</div>
          <div class="meal-day-meta">${escapeHtml(dayHeader.relative)}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-add-day="${day}">Add</button>
      </div>
      <div class="product-list">
        ${dayEntries.map(entry => {
          const recipe = recipeMap[String(entry.recipe_id)];
          const recipeName = recipe?.name || entry.note || `Recipe #${entry.recipe_id || '?'}`;
          return `
            <div class="product-item" style="cursor:default;">
              <div class="product-icon">🍽️</div>
              <div class="product-info">
                <div class="product-name">${escapeHtml(recipeName)}</div>
                <div class="product-meta"><span class="meal-type-chip">${escapeHtml(mealTypeLabel[entry.type] || 'Meal')}</span></div>
              </div>
              <button class="btn-icon" data-delete-entry="${entry.id}" title="Delete plan" style="color:var(--color-red);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
  }).join('');

  container.querySelectorAll('[data-add-day]').forEach(btn => {
    btn.addEventListener('click', () => showPlanMealModal(btn.dataset.addDay || todayStr()));
  });

  container.querySelectorAll('[data-delete-entry]').forEach(btn => {
    btn.addEventListener('click', () => deletePlanEntry(btn.dataset.deleteEntry));
  });
}

function renderCalendarView(container, entries) {
  const month = _monthCursor.getMonth();
  const year = _monthCursor.getFullYear();
  const first = new Date(year, month, 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Mon-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map();
  for (const entry of entries) {
    if (!byDay.has(entry.day)) byDay.set(entry.day, []);
    byDay.get(entry.day).push(entry);
  }

  const monthLabel = _monthCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const cells = [];

  for (let i = 0; i < firstWeekday; i++) {
    cells.push('<div class="meal-cal-day meal-cal-day-empty"></div>');
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDate = new Date(year, month, day);
    const dayKey = toDateKey(dayDate);
    const dayEntries = byDay.get(dayKey) || [];
    const counts = {
      breakfast: dayEntries.filter(e => e.type === 'breakfast').length,
      lunch: dayEntries.filter(e => e.type === 'lunch').length,
      dinner: dayEntries.filter(e => e.type === 'dinner').length,
    };

    cells.push(`
      <button class="meal-cal-day" data-day="${dayKey}">
        <div class="meal-cal-date">${day}</div>
        <div class="meal-cal-badges">
          ${MEAL_TYPE_OPTIONS.map(type => counts[type] > 0
            ? `<span class="meal-cal-badge">${type.charAt(0).toUpperCase()}${counts[type] > 1 ? counts[type] : ''}</span>`
            : ''
          ).join('')}
        </div>
      </button>
    `);
  }

  container.innerHTML = `
    <div class="meal-cal-header">
      <button class="btn btn-secondary btn-sm" id="meal-cal-prev">◀</button>
      <div class="meal-cal-month">${escapeHtml(monthLabel)}</div>
      <button class="btn btn-secondary btn-sm" id="meal-cal-next">▶</button>
    </div>
    <div class="meal-cal-weekdays">
      <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
    </div>
    <div class="meal-cal-grid">
      ${cells.join('')}
    </div>
  `;

  document.getElementById('meal-cal-prev')?.addEventListener('click', () => {
    _monthCursor = new Date(year, month - 1, 1);
    renderPlannerView();
  });
  document.getElementById('meal-cal-next')?.addEventListener('click', () => {
    _monthCursor = new Date(year, month + 1, 1);
    renderPlannerView();
  });

  container.querySelectorAll('.meal-cal-day[data-day]').forEach(btn => {
    btn.addEventListener('click', () => showDayPlansModal(btn.dataset.day));
  });
}

function showDayPlansModal(dayKey) {
  const recipeMap = Object.fromEntries(_recipes.map(r => [String(r.id), r]));
  const dayEntries = getFilteredEntries().filter(e => e.day === dayKey);

  showModal(`Planned · ${formatDate(dayKey)}`, `
    <div class="product-list" id="meal-day-modal-list">
      ${dayEntries.length === 0
        ? '<div class="empty-state" style="padding:18px 0;"><div class="empty-state-text">No meals planned for this day</div></div>'
        : dayEntries.map(entry => {
          const recipe = recipeMap[String(entry.recipe_id)];
          const recipeName = recipe?.name || entry.note || `Recipe #${entry.recipe_id || '?'}`;
          return `
            <div class="product-item" style="cursor:default;">
              <div class="product-icon">🍽️</div>
              <div class="product-info">
                <div class="product-name">${escapeHtml(recipeName)}</div>
                <div class="product-meta">${escapeHtml(mealTypeLabel[entry.type] || 'Meal')}</div>
              </div>
              <button class="btn-icon" data-delete-entry="${entry.id}" style="color:var(--color-red);" title="Delete plan">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          `;
        }).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn btn-primary" id="meal-day-add" style="flex:1;">Add Meal</button>
      <button class="btn btn-secondary" id="meal-day-copy" style="flex:1;">Copy this day to…</button>
      <button class="btn btn-secondary" id="meal-day-close">Close</button>
    </div>
  `);

  document.getElementById('meal-day-add')?.addEventListener('click', () => {
    closeModal();
    showPlanMealModal(dayKey);
  });
  document.getElementById('meal-day-copy')?.addEventListener('click', () => {
    closeModal();
    showCopyDayHelperModal(dayKey);
  });
  document.getElementById('meal-day-close')?.addEventListener('click', closeModal);

  document.querySelectorAll('#meal-day-modal-list [data-delete-entry]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deletePlanEntry(btn.dataset.deleteEntry);
      closeModal();
      showDayPlansModal(dayKey);
    });
  });
}

function showPlanMealModal(defaultDay = todayStr(), options = {}) {
  const preselectedRecipeId = options.preselectedRecipeId ? String(options.preselectedRecipeId) : '';
  const prefilledMealType = options.prefilledMealType || (_mealFilter !== 'all' ? _mealFilter : 'dinner');
  const prefilledSearch = options.prefilledSearch || '';

  const selected = {
    recipeId: preselectedRecipeId,
    mealType: prefilledMealType,
  };

  const renderRecipeOptions = (term = '') => {
    const listEl = document.getElementById('meal-plan-recipe-list');
    if (!listEl) return;

    const q = term.toLowerCase().trim();
    const filtered = _recipes.filter(recipe => {
      const typeTags = parseRecipeMealTypes(recipe.description || '');
      const matchesType = selected.mealType ? typeTags.includes(selected.mealType) : true;
      if (!matchesType) return false;
      if (!q) return true;
      return (recipe.name || '').toLowerCase().includes(q)
        || (recipe.description || '').toLowerCase().includes(q)
        || typeTags.some(tag => tag.includes(q));
    });

    listEl.innerHTML = filtered.length === 0
      ? '<div class="empty-state" style="padding:16px 0;"><div class="empty-state-text">No recipes match this meal type/filter</div></div>'
      : filtered.slice(0, 60).map(recipe => {
        const tags = parseRecipeMealTypes(recipe.description || '');
        return `
          <div class="product-item ${selected.recipeId === String(recipe.id) ? 'selected' : ''}" data-recipe-id="${recipe.id}" style="cursor:pointer;">
            <div class="product-icon">🍴</div>
            <div class="product-info">
              <div class="product-name">${escapeHtml(recipe.name)}</div>
              <div class="product-meta">${tags.map(tag => mealTypeLabel[tag] || tag).join(' · ') || 'No meal tags'}</div>
            </div>
          </div>
        `;
      }).join('');

    listEl.querySelectorAll('[data-recipe-id]').forEach(item => {
      item.addEventListener('click', () => {
        selected.recipeId = String(item.dataset.recipeId || '');
        listEl.querySelectorAll('[data-recipe-id]').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });
    });
  };

  showModal('Plan Meal', `
    <div class="form-group">
      <label class="form-label">Date</label>
      <input type="date" id="meal-plan-day" class="form-input" value="${escapeHtml(defaultDay || todayStr())}">
    </div>
    <div class="form-group">
      <label class="form-label">Meal Type</label>
      <select id="meal-plan-type" class="form-input">
        ${MEAL_TYPE_OPTIONS.map(type => `<option value="${type}" ${selected.mealType === type ? 'selected' : ''}>${mealTypeLabel[type]}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Select Recipe</label>
      <div class="search-bar" style="margin-bottom:8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" id="meal-plan-search" placeholder="Search recipes…" value="${escapeHtml(prefilledSearch)}" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
      </div>
      <div id="meal-plan-recipe-list" style="max-height:38vh;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-secondary" id="meal-plan-create-recipe" style="flex:1;">Create Recipe</button>
      <button class="btn btn-primary" id="meal-plan-save" style="flex:1;">Save Plan</button>
      <button class="btn btn-secondary" id="meal-plan-cancel">Cancel</button>
    </div>
  `);

  renderRecipeOptions(prefilledSearch);

  document.getElementById('meal-plan-type')?.addEventListener('change', (e) => {
    selected.mealType = e.target.value;
    selected.recipeId = '';
    renderRecipeOptions(document.getElementById('meal-plan-search')?.value || '');
  });

  document.getElementById('meal-plan-search')?.addEventListener('input', debounce((e) => {
    renderRecipeOptions(e.target.value || '');
  }, 120));

  document.getElementById('meal-plan-cancel')?.addEventListener('click', closeModal);

  document.getElementById('meal-plan-create-recipe')?.addEventListener('click', () => {
    const day = document.getElementById('meal-plan-day')?.value || todayStr();
    const mealType = document.getElementById('meal-plan-type')?.value || selected.mealType;
    closeModal();
    showCreateRecipeFromPlanModal({
      defaultDay: day,
      defaultMealType: mealType,
      onCreated: (recipe) => {
        showPlanMealModal(day, {
          preselectedRecipeId: recipe.id,
          prefilledMealType: mealType,
          prefilledSearch: recipe.name || '',
        });
      },
    });
  });

  document.getElementById('meal-plan-save')?.addEventListener('click', async () => {
    const day = document.getElementById('meal-plan-day')?.value || todayStr();
    const type = document.getElementById('meal-plan-type')?.value || 'dinner';

    if (!selected.recipeId) {
      showToast('Select a recipe', 'warning');
      return;
    }

    const recipe = _recipes.find(r => String(r.id) === String(selected.recipeId));

    const btn = document.getElementById('meal-plan-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await api.createMealPlanEntry({
        day,
        recipe_id: parseInt(selected.recipeId, 10),
        type,
        note: recipe?.name || '',
      });
      closeModal();
      showToast('Meal plan saved', 'success');
      await loadPlannerData();
    } catch (e) {
      showToast(`Failed to save: ${e.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Plan'; }
    }
  });
}

function showCreateRecipeFromPlanModal({ defaultDay, defaultMealType = 'dinner', onCreated }) {
  showModal('Create Recipe', `
    <div class="form-group">
      <label class="form-label">Recipe Name *</label>
      <input type="text" id="meal-new-recipe-name" class="form-input" placeholder="e.g. Chicken Bowl" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">Description (optional)</label>
      <textarea id="meal-new-recipe-description" class="form-input" rows="4" placeholder="Quick notes or instructions..."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Meal Type Tags</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${MEAL_TYPE_OPTIONS.map(type => `
          <label class="btn btn-secondary btn-sm" style="gap:6px;cursor:pointer;">
            <input type="checkbox" class="meal-new-recipe-tag" value="${type}" ${type === defaultMealType ? 'checked' : ''}>
            ${mealTypeLabel[type]}
          </label>
        `).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" id="meal-new-recipe-save" style="flex:1;">Create</button>
      <button class="btn btn-secondary" id="meal-new-recipe-cancel">Cancel</button>
    </div>
  `);

  document.getElementById('meal-new-recipe-cancel')?.addEventListener('click', () => {
    closeModal();
    showPlanMealModal(defaultDay, { prefilledMealType: defaultMealType });
  });

  document.getElementById('meal-new-recipe-save')?.addEventListener('click', async () => {
    const name = document.getElementById('meal-new-recipe-name')?.value?.trim();
    if (!name) {
      showToast('Recipe name is required', 'warning');
      return;
    }

    const description = document.getElementById('meal-new-recipe-description')?.value?.trim() || '';
    const selectedTags = Array.from(document.querySelectorAll('.meal-new-recipe-tag:checked'))
      .map(el => el.value)
      .filter(Boolean);

    const saveBtn = document.getElementById('meal-new-recipe-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Creating…'; }

    try {
      const payload = {
        name,
        description: buildDescriptionWithMealTypes(description, selectedTags),
        base_servings: 1,
      };
      const result = await api.createRecipe(payload);
      const newId = result?.created_object_id;
      if (!newId) throw new Error('Recipe created but no ID returned');

      const recipe = {
        id: newId,
        name,
        description: payload.description,
      };
      _recipes = [..._recipes, recipe].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      closeModal();
      showToast('Recipe created', 'success');
      if (typeof onCreated === 'function') onCreated(recipe);
    } catch (e) {
      showToast(`Create failed: ${e.message}`, 'error');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Create'; }
    }
  });
}

function showCopyWeekHelperModal() {
  const today = new Date();
  const sourceStart = startOfWeekMonday(today);
  const targetStart = addDays(sourceStart, 7);

  showModal('Copy Week Plan', `
    <div class="form-group">
      <label class="form-label">Source Week (Monday)</label>
      <input type="date" id="meal-copy-source" class="form-input" value="${toDateKey(sourceStart)}">
    </div>
    <div class="form-group">
      <label class="form-label">Target Week (Monday)</label>
      <input type="date" id="meal-copy-target" class="form-input" value="${toDateKey(targetStart)}">
    </div>
    <div class="form-group">
      <label class="form-label" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="meal-copy-overwrite">
        Replace existing target entries
      </label>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" id="meal-copy-confirm" style="flex:1;">Copy Week</button>
      <button class="btn btn-secondary" id="meal-copy-cancel">Cancel</button>
    </div>
  `);

  document.getElementById('meal-copy-cancel')?.addEventListener('click', closeModal);

  document.getElementById('meal-copy-confirm')?.addEventListener('click', async () => {
    const sourceRaw = document.getElementById('meal-copy-source')?.value;
    const targetRaw = document.getElementById('meal-copy-target')?.value;
    const overwrite = !!document.getElementById('meal-copy-overwrite')?.checked;

    if (!sourceRaw || !targetRaw) {
      showToast('Select both source and target week', 'warning');
      return;
    }

    const sourceMonday = startOfWeekMonday(new Date(sourceRaw));
    const targetMonday = startOfWeekMonday(new Date(targetRaw));

    if (toDateKey(sourceMonday) === toDateKey(targetMonday)) {
      showToast('Source and target week cannot be the same', 'warning');
      return;
    }

    const confirmBtn = document.getElementById('meal-copy-confirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Copying…'; }

    try {
      const createdCount = await copyWeekEntries(sourceMonday, targetMonday, overwrite);
      closeModal();
      showToast(`Copied ${createdCount} meal${createdCount !== 1 ? 's' : ''}`, 'success');
      await loadPlannerData();
    } catch (e) {
      showToast(`Copy failed: ${e.message}`, 'error');
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Copy Week'; }
    }
  });
}

async function copyWeekEntries(sourceMonday, targetMonday, overwrite = false) {
  const sourceStart = toDateKey(sourceMonday);
  const sourceEnd = toDateKey(addDays(sourceMonday, 6));
  const targetStart = toDateKey(targetMonday);
  const targetEnd = toDateKey(addDays(targetMonday, 6));

  const sourceEntries = _entries.filter(entry => entry.day >= sourceStart && entry.day <= sourceEnd);
  const targetEntries = _entries.filter(entry => entry.day >= targetStart && entry.day <= targetEnd);

  if (sourceEntries.length === 0) {
    throw new Error('No meals found in source week');
  }

  if (overwrite && targetEntries.length > 0) {
    await Promise.all(targetEntries.map(entry => api.deleteMealPlanEntry(entry.id)));
  }

  const existingKey = new Set(
    (overwrite ? [] : targetEntries).map(entry => `${entry.day}|${entry.recipe_id}|${entry.type}`)
  );

  let created = 0;

  for (const source of sourceEntries) {
    const sourceDate = new Date(`${source.day}T00:00:00`);
    const offsetDays = Math.round((sourceDate - sourceMonday) / (1000 * 60 * 60 * 24));
    const targetDay = toDateKey(addDays(targetMonday, offsetDays));
    const key = `${targetDay}|${source.recipe_id}|${source.type}`;
    if (existingKey.has(key)) continue;

    await api.createMealPlanEntry({
      day: targetDay,
      recipe_id: source.recipe_id,
      type: source.type || 'dinner',
      note: source.note || '',
    });
    existingKey.add(key);
    created++;
  }

  return created;
}

function showCopyDayHelperModal(sourceDay) {
  const defaultTarget = toDateKey(addDays(new Date(`${sourceDay}T00:00:00`), 1));

  showModal('Copy this day to…', `
    <div class="form-group">
      <label class="form-label">Source Day</label>
      <input type="date" id="meal-copy-day-source" class="form-input" value="${escapeHtml(sourceDay)}" disabled>
    </div>
    <div class="form-group">
      <label class="form-label">Target Day</label>
      <input type="date" id="meal-copy-day-target" class="form-input" value="${escapeHtml(defaultTarget)}">
    </div>
    <div class="form-group">
      <label class="form-label" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="meal-copy-day-overwrite">
        Replace existing target day entries
      </label>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" id="meal-copy-day-confirm" style="flex:1;">Copy Day</button>
      <button class="btn btn-secondary" id="meal-copy-day-cancel">Cancel</button>
    </div>
  `);

  document.getElementById('meal-copy-day-cancel')?.addEventListener('click', closeModal);

  document.getElementById('meal-copy-day-confirm')?.addEventListener('click', async () => {
    const targetDay = document.getElementById('meal-copy-day-target')?.value;
    const overwrite = !!document.getElementById('meal-copy-day-overwrite')?.checked;
    if (!targetDay) {
      showToast('Select a target day', 'warning');
      return;
    }
    if (targetDay === sourceDay) {
      showToast('Source and target day cannot be the same', 'warning');
      return;
    }

    const btn = document.getElementById('meal-copy-day-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Copying…'; }

    try {
      const created = await copyDayEntries(sourceDay, targetDay, overwrite);
      closeModal();
      showToast(`Copied ${created} meal${created !== 1 ? 's' : ''}`, 'success');
      await loadPlannerData();
    } catch (e) {
      showToast(`Copy failed: ${e.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Copy Day'; }
    }
  });
}

async function copyDayEntries(sourceDay, targetDay, overwrite = false) {
  const sourceEntries = _entries.filter(entry => entry.day === sourceDay);
  const targetEntries = _entries.filter(entry => entry.day === targetDay);

  if (sourceEntries.length === 0) {
    throw new Error('No meals found on source day');
  }

  if (overwrite && targetEntries.length > 0) {
    await Promise.all(targetEntries.map(entry => api.deleteMealPlanEntry(entry.id)));
  }

  const existingKey = new Set(
    (overwrite ? [] : targetEntries).map(entry => `${entry.recipe_id}|${entry.type}`)
  );

  let created = 0;
  for (const source of sourceEntries) {
    const key = `${source.recipe_id}|${source.type}`;
    if (existingKey.has(key)) continue;

    await api.createMealPlanEntry({
      day: targetDay,
      recipe_id: source.recipe_id,
      type: source.type || 'dinner',
      note: source.note || '',
    });
    existingKey.add(key);
    created++;
  }

  return created;
}

async function deletePlanEntry(id) {
  if (!id) return;
  try {
    await api.deleteMealPlanEntry(id);
    _entries = _entries.filter(entry => String(entry.id) !== String(id));
    renderPlannerView();
    showToast('Meal removed from plan', 'info');
  } catch (e) {
    showToast(`Delete failed: ${e.message}`, 'error');
  }
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getDaySectionHeader(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  const absolute = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date - today) / (1000 * 60 * 60 * 24));
  let relative = '';
  if (diffDays === 0) relative = 'Today';
  else if (diffDays === 1) relative = 'Tomorrow';
  else if (diffDays > 1) relative = `In ${diffDays} days`;
  else if (diffDays === -1) relative = 'Yesterday';
  else relative = `${Math.abs(diffDays)} days ago`;

  return { absolute, relative };
}
