/**
 * Recipe Detail Page — View, edit, create, manage ingredients, consume, add to shopping list
 */
import { api } from '../api.js';
import {
  renderPage, setHeader, showToast, showModal, closeModal,
  escapeHtml, formatAmount,
} from '../ui.js';
import { setRefreshHandler } from '../pull-to-refresh.js';
import {
  MEAL_TYPE_OPTIONS,
  parseRecipeMealTypes,
  stripMealTypeMarker,
  buildDescriptionWithMealTypes,
} from '../recipe-meal-tags.js';

let _recipe = null;
let _ingredients = [];
let _products = [];
let _quantityUnits = [];
let _fulfillment = null;
let _stock = [];
let _editMode = false;
let _isNew = false;

/* =================================================================
   Public: Render recipe detail
   ================================================================= */
export async function renderRecipeDetail(params) {
  const recipeId = params.id;
  if (!recipeId) { location.hash = '/recipes'; return; }

  _isNew = false;
  _editMode = false;

  setHeader('Recipe', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:200px;"></div></div>`);

  try {
    const [recipes, ingredients, products, qus, stock] = await Promise.all([
      api.getRecipes(),
      api.getRecipeDetails(recipeId),
      api.getProducts(),
      api.getQuantityUnits(),
      api.getStock(),
    ]);

    _recipe = recipes.find(r => String(r.id) === String(recipeId));
    _ingredients = ingredients;
    _products = products;
    _quantityUnits = qus;
    _stock = stock;

    if (!_recipe) {
      renderPage(`<div class="empty-state"><div class="empty-state-title">Recipe not found</div></div>`);
      return;
    }

    // Try to load fulfillment (may fail on some Grocy versions)
    try {
      _fulfillment = await api.getRecipeFulfillment(recipeId);
    } catch { _fulfillment = null; }

    setHeader(escapeHtml(_recipe.name), true);
    renderView();
    setRefreshHandler(() => renderRecipeDetail(params));
  } catch (e) {
    renderPage(`<div class="empty-state"><div class="empty-state-title">Failed to load recipe</div><div class="empty-state-text">${escapeHtml(e.message)}</div></div>`);
  }
}

/* =================================================================
   Public: Create new recipe
   ================================================================= */
export async function renderRecipeCreate() {
  _recipe = null;
  _ingredients = [];
  _fulfillment = null;
  _isNew = true;
  _editMode = true;

  setHeader('New Recipe', true);
  renderPage(`<div class="section"><div class="skeleton skeleton-rect" style="height:100px;"></div></div>`);

  try {
    const [products, qus] = await Promise.all([
      api.getProducts(),
      api.getQuantityUnits(),
    ]);
    _products = products;
    _quantityUnits = qus;
  } catch { /* ignore */ }

  renderEditForm({
    name: '',
    description: '',
    base_servings: 1,
  });
}

/* =================================================================
   VIEW
   ================================================================= */
function renderView() {
  const fulfilled = _fulfillment?.recipe_fulfilled ?? null;
  const missingCount = _fulfillment?.missing_products_count ?? null;
  const recipeMealTypes = parseRecipeMealTypes(_recipe.description || '');

  renderPage(`
    <div class="detail-hero">
      <div class="detail-emoji">🍴</div>
      <div class="detail-name">${escapeHtml(_recipe.name)}</div>
      ${_recipe.base_servings ? `<div class="detail-subtitle">${_recipe.base_servings} serving${_recipe.base_servings != 1 ? 's' : ''}</div>` : ''}
      ${recipeMealTypes.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:8px;">${recipeMealTypes.map(type => `<span class="meal-type-chip">${type.charAt(0).toUpperCase() + type.slice(1)}</span>`).join('')}</div>` : ''}
    </div>

    ${fulfilled !== null ? `
    <div class="section">
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${_ingredients.length}</div>
          <div class="stat-label">Ingredients</div>
        </div>
        <div class="stat-card">
          <div class="stat-value stat-value-${fulfilled ? 'green' : 'red'}">${fulfilled ? 'Yes' : 'No'}</div>
          <div class="stat-label">In Stock</div>
        </div>
        ${missingCount !== null ? `
        <div class="stat-card">
          <div class="stat-value stat-value-${missingCount > 0 ? 'orange' : 'green'}">${missingCount}</div>
          <div class="stat-label">Missing</div>
        </div>` : ''}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div style="display:flex;gap:12px;">
        <button class="btn btn-primary" id="btn-consume-recipe" style="flex:1;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Consume
        </button>
        <button class="btn btn-secondary" id="btn-shop-recipe" style="flex:1;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          Add Missing to List
        </button>
      </div>
    </div>

    ${_recipe.description ? `
      <div class="section">
        <div class="section-title">Description</div>
        <div class="card" style="padding: 12px; white-space: pre-wrap;">${escapeHtml(stripMealTypeMarker(_recipe.description))}</div>
      </div>
    ` : ''}

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Ingredients</h2>
        <button class="section-action" id="btn-add-ingredient">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add
        </button>
      </div>
      <div class="product-list" id="ingredients-list">
        ${_ingredients.length === 0 ? `
          <div class="empty-state" style="padding:24px 0;">
            <div class="empty-state-title">No ingredients</div>
            <div class="empty-state-text">Add ingredients to this recipe</div>
          </div>
        ` : _ingredients.map(ing => {
          const product = _products.find(p => String(p.id) === String(ing.product_id));
          const qu = _quantityUnits.find(q => String(q.id) === String(ing.qu_id));
          // Check availability from fulfillment data or stock
          let availClass = '';
          let availIcon = '';
          let availNote = '';
          const fulfillPos = _fulfillment?.recipe_pos?.find(fp => String(fp.recipe_pos_id) === String(ing.id));
          if (fulfillPos) {
            if (fulfillPos.need_fulfilled == 1) {
              availClass = 'ingredient-ok';
              availIcon = '<span class="ingredient-badge ingredient-badge-ok" title="In stock">✓</span>';
            } else {
              const missing = fulfillPos.missing_amount != null ? formatAmount(fulfillPos.missing_amount) : '';
              availClass = 'ingredient-missing';
              availIcon = '<span class="ingredient-badge ingredient-badge-missing" title="Missing">✕</span>';
              if (missing) availNote = ` (need ${missing} more)`;
            }
          } else {
            // Fallback: check stock directly
            const stockEntry = _stock.find(s => String(s.product_id) === String(ing.product_id));
            const inStock = stockEntry ? parseFloat(stockEntry.amount) : 0;
            if (inStock >= parseFloat(ing.amount)) {
              availClass = 'ingredient-ok';
              availIcon = '<span class="ingredient-badge ingredient-badge-ok" title="In stock">✓</span>';
            } else if (inStock > 0) {
              availClass = 'ingredient-partial';
              availIcon = '<span class="ingredient-badge ingredient-badge-partial" title="Partial">½</span>';
              availNote = ` (have ${formatAmount(inStock)})`;
            } else {
              availClass = 'ingredient-missing';
              availIcon = '<span class="ingredient-badge ingredient-badge-missing" title="Missing">✕</span>';
            }
          }
          return `
            <div class="product-item ${availClass}" data-ingredient-id="${ing.id}">
              <div class="product-icon" style="position:relative;">📦${availIcon}</div>
              <div class="product-info">
                <div class="product-name">${product ? escapeHtml(product.name) : 'Product #' + ing.product_id}</div>
                <div class="product-meta">${formatAmount(ing.amount)} ${qu ? escapeHtml(qu.name) : ''}${availNote}${ing.note ? ' – ' + escapeHtml(ing.note) : ''}</div>
              </div>
              <button class="btn-icon btn-del-ingredient" data-id="${ing.id}" title="Remove" style="color:var(--color-error,#ff3b30);background:none;border:none;padding:8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>`;
        }).join('')}
      </div>
    </div>

    <div class="section" style="display:flex;gap:12px;margin-top:8px;">
      <button class="btn btn-secondary" id="btn-edit-recipe" style="flex:1;">Edit</button>
      <button class="btn btn-danger" id="btn-delete-recipe" style="flex:1;">Delete</button>
    </div>
  `);

  // Consume recipe
  document.getElementById('btn-consume-recipe')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-consume-recipe');
    if (btn) { btn.disabled = true; btn.textContent = 'Consuming\u2026'; }
    try {
      await api.consumeRecipe(_recipe.id);
      showToast('Recipe consumed!', 'success');
      renderRecipeDetail({ id: _recipe.id });
    } catch (e) {
      showToast('Consume failed: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Consume'; }
    }
  });

  // Add missing to shopping list
  document.getElementById('btn-shop-recipe')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-shop-recipe');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding\u2026'; }
    try {
      await api.addRecipesToMealPlan(_recipe.id);
      showToast('Missing items added to shopping list!', 'success');
      if (btn) { btn.disabled = false; btn.textContent = 'Add Missing to List'; }
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  });

  // Add ingredient
  document.getElementById('btn-add-ingredient')?.addEventListener('click', showAddIngredientModal);

  // Delete ingredient buttons
  document.querySelectorAll('.btn-del-ingredient').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ingId = btn.dataset.id;
      confirmDeleteIngredient(ingId);
    });
  });

  // Edit
  document.getElementById('btn-edit-recipe')?.addEventListener('click', () => {
    _editMode = true;
    renderEditForm(_recipe);
  });

  // Delete
  document.getElementById('btn-delete-recipe')?.addEventListener('click', confirmDelete);
}

/* =================================================================
   ADD INGREDIENT MODAL
   ================================================================= */
function showAddIngredientModal() {
  const quOptions = _quantityUnits
    .map(q => `<option value="${q.id}">${escapeHtml(q.name)}</option>`)
    .join('');

  showModal('Add Ingredient', `
    <div class="form-group">
      <label class="form-label">Product *</label>
      <div class="search-bar" style="margin-bottom: 0;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" id="modal-product-search" placeholder="Search products…" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
      </div>
      <div id="modal-product-list" style="max-height: 34vh; overflow-y: auto; -webkit-overflow-scrolling: touch; margin-top: 8px;"></div>
      <div id="modal-product-selected" style="display:none; margin-top:8px; padding:8px 10px; border-radius:var(--radius-md); background:var(--color-glass); font-size:13px;">
        Selected: <strong id="modal-product-selected-name"></strong>
        <button class="btn btn-secondary" id="modal-product-change" style="float:right; padding:4px 8px; min-height:auto;">Change</button>
      </div>
      <input type="hidden" id="modal-product">
    </div>
    <div class="form-group">
      <label class="form-label">Amount</label>
      <input type="number" id="modal-amount" class="form-input" value="1" min="0.01" step="0.01">
    </div>
    <div class="form-group">
      <label class="form-label">Quantity Unit</label>
      <select id="modal-qu" class="form-input">
        ${quOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Note (optional)</label>
      <input type="text" id="modal-note" class="form-input" placeholder="e.g. finely chopped" autocomplete="off">
    </div>
    <button class="btn btn-primary" style="width:100%;" id="modal-confirm">Add Ingredient</button>
  `);

  const sortedProducts = [..._products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const renderProductSelector = (filter = '') => {
    const listEl = document.getElementById('modal-product-list');
    if (!listEl) return;

    const q = (filter || '').toLowerCase().trim();
    const filtered = q
      ? sortedProducts.filter(p => (p.name || '').toLowerCase().includes(q))
      : sortedProducts;

    listEl.innerHTML = filtered.slice(0, 40).map(p => `
      <div class="product-item" data-product-id="${p.id}" style="cursor:pointer;">
        <div class="product-icon">📦</div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(p.name)}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.product-item').forEach(item => {
      item.addEventListener('click', () => {
        const productId = item.dataset.productId;
        const product = _products.find(p => String(p.id) === String(productId));
        if (!product) return;

        const productInput = document.getElementById('modal-product');
        const selectedWrap = document.getElementById('modal-product-selected');
        const selectedName = document.getElementById('modal-product-selected-name');
        const searchEl = document.getElementById('modal-product-search');
        if (productInput) productInput.value = productId;
        if (selectedName) selectedName.textContent = product.name;
        if (selectedWrap) selectedWrap.style.display = 'block';
        if (searchEl) searchEl.parentElement.style.display = 'none';
        listEl.style.display = 'none';

        if (product.qu_id_stock) {
          const quSel = document.getElementById('modal-qu');
          if (quSel) quSel.value = String(product.qu_id_stock);
        }
      });
    });
  };

  requestAnimationFrame(() => {
    renderProductSelector();
    const searchInput = document.getElementById('modal-product-search');
    if (searchInput) {
      const onSearch = () => renderProductSelector(searchInput.value);
      searchInput.addEventListener('input', onSearch);
      searchInput.addEventListener('keyup', onSearch);
      searchInput.focus();
    }
  });

  document.getElementById('modal-product-change')?.addEventListener('click', (e) => {
    e.preventDefault();
    const selectedWrap = document.getElementById('modal-product-selected');
    const searchEl = document.getElementById('modal-product-search');
    const listEl = document.getElementById('modal-product-list');
    const productInput = document.getElementById('modal-product');
    if (selectedWrap) selectedWrap.style.display = 'none';
    if (searchEl) {
      searchEl.parentElement.style.display = 'flex';
      searchEl.focus();
    }
    if (listEl) listEl.style.display = 'block';
    if (productInput) productInput.value = '';
  });

  document.getElementById('modal-confirm')?.addEventListener('click', async () => {
    const productId = document.getElementById('modal-product')?.value;
    if (!productId) { showToast('Select a product', 'error'); return; }

    const data = {
      recipe_id: _recipe.id,
      product_id: parseInt(productId),
      amount: parseFloat(document.getElementById('modal-amount')?.value) || 1,
      qu_id: parseInt(document.getElementById('modal-qu')?.value) || undefined,
      note: document.getElementById('modal-note')?.value?.trim() || '',
    };

    const btn = document.getElementById('modal-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding\u2026'; }

    try {
      await api.createRecipeIngredient(data);
      closeModal();
      showToast('Ingredient added', 'success');
      renderRecipeDetail({ id: _recipe.id });
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
    }
  });
}

function confirmDeleteIngredient(ingId) {
  showModal('Remove Ingredient', `
    <p>Remove this ingredient from the recipe?</p>
    <div style="display:flex;gap:12px;margin-top:16px;">
      <button class="btn btn-secondary" id="del-cancel" style="flex:1;">Cancel</button>
      <button class="btn btn-danger" id="del-confirm" style="flex:1;">Remove</button>
    </div>
  `);

  document.getElementById('del-cancel')?.addEventListener('click', closeModal);
  document.getElementById('del-confirm')?.addEventListener('click', async () => {
    try {
      await api.deleteRecipeIngredient(ingId);
      closeModal();
      showToast('Ingredient removed', 'success');
      renderRecipeDetail({ id: _recipe.id });
    } catch (e) {
      showToast('Failed: ' + e.message, 'error');
    }
  });
}

/* =================================================================
   EDIT FORM
   ================================================================= */
function renderEditForm(data) {
  setHeader(_isNew ? 'New Recipe' : 'Edit Recipe', true);
  const selectedMealTypes = parseRecipeMealTypes(data.description || '');
  const visibleDescription = stripMealTypeMarker(data.description || '');

  renderPage(`
    <div class="section">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" id="recipe-name" class="form-input" value="${escapeHtml(data.name || '')}" placeholder="e.g. Grandma's Pasta" required>
      </div>

      <div class="form-group">
        <label class="form-label">Description / Instructions</label>
        <textarea id="recipe-description" class="form-input" rows="6" placeholder="Recipe steps, notes...">${escapeHtml(visibleDescription)}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Meal Type Tags</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${MEAL_TYPE_OPTIONS.map(type => `
            <label class="btn btn-secondary btn-sm" style="gap:6px;cursor:pointer;">
              <input type="checkbox" class="recipe-meal-type" value="${type}" ${selectedMealTypes.includes(type) ? 'checked' : ''}>
              ${type.charAt(0).toUpperCase() + type.slice(1)}
            </label>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Base Servings</label>
        <input type="number" id="recipe-servings" class="form-input" value="${data.base_servings || 1}" min="1" step="1">
      </div>

      <div style="display:flex;gap:12px;margin-top:16px;">
        <button class="btn btn-secondary" id="btn-cancel" style="flex:1;">Cancel</button>
        <button class="btn btn-primary" id="btn-save" style="flex:1;">Save</button>
      </div>
    </div>
  `);

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    if (_isNew) {
      location.hash = '/recipes';
    } else {
      _editMode = false;
      renderView();
    }
  });

  document.getElementById('btn-save')?.addEventListener('click', saveRecipe);
}

async function saveRecipe() {
  const name = document.getElementById('recipe-name')?.value?.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  const payload = {
    name,
    description: '',
    base_servings: parseInt(document.getElementById('recipe-servings')?.value) || 1,
  };

  const selectedMealTypes = Array.from(document.querySelectorAll('.recipe-meal-type:checked'))
    .map(el => el.value);
  const description = document.getElementById('recipe-description')?.value?.trim() || '';
  payload.description = buildDescriptionWithMealTypes(description, selectedMealTypes);

  const btn = document.getElementById('btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving\u2026'; }

  try {
    if (_isNew) {
      const result = await api.createRecipe(payload);
      showToast('Recipe created!', 'success');
      const newId = result?.created_object_id;
      location.hash = newId ? `/recipe/${newId}` : '/recipes';
    } else {
      await api.updateRecipe(_recipe.id, payload);
      showToast('Recipe updated!', 'success');
      renderRecipeDetail({ id: _recipe.id });
    }
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

/* =================================================================
   DELETE RECIPE
   ================================================================= */
function confirmDelete() {
  showModal('Delete Recipe', `
    <p>Are you sure you want to delete <strong>${escapeHtml(_recipe.name)}</strong>? This cannot be undone.</p>
    <div style="display:flex;gap:12px;margin-top:16px;">
      <button class="btn btn-secondary" id="del-cancel" style="flex:1;">Cancel</button>
      <button class="btn btn-danger" id="del-confirm" style="flex:1;">Delete</button>
    </div>
  `);

  document.getElementById('del-cancel')?.addEventListener('click', closeModal);
  document.getElementById('del-confirm')?.addEventListener('click', async () => {
    try {
      await api.deleteRecipe(_recipe.id);
      closeModal();
      showToast('Recipe deleted', 'success');
      location.hash = '/recipes';
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    }
  });
}
