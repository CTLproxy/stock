/**
 * UI Utility functions — toast, modal, helpers
 */

// --- Toast Notifications ---
let _toastTimeout = null;

export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// --- Modal ---
let _modalCloseHandler = null;

export function showModal(titleOrHtml, contentHtml, onClose) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) return;

  // Support both showModal(title, content, onClose) and showModal(content, onClose)
  let title = '';
  let body = '';
  let closeCb = null;
  if (typeof contentHtml === 'string') {
    title = titleOrHtml;
    body = contentHtml;
    closeCb = onClose;
  } else {
    title = '';
    body = titleOrHtml;
    closeCb = contentHtml; // second arg is the onClose callback
  }

  const titleBlock = title ? `<div class="modal-title">${title}</div>` : '';
  content.innerHTML = `<div class="modal-handle"></div>${titleBlock}${body}`;
  onClose = closeCb;
  overlay.style.display = 'flex';

  // Close on overlay click (not content)
  const handler = (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  };
  overlay.addEventListener('click', handler);
  _modalCloseHandler = () => {
    overlay.removeEventListener('click', handler);
    if (onClose) onClose();
  };

  // Swipe-down to dismiss — works from anywhere on the modal sheet
  setupModalSwipeToDismiss(content, overlay);
}

function setupModalSwipeToDismiss(content, overlay) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let allowDrag = false;

  const onTouchStart = (e) => {
    // Start dismiss drag only from the modal handle to avoid conflicts with list/input scrolling.
    const target = e.target;
    allowDrag = !!(target && target.closest && target.closest('.modal-handle'));
    if (!allowDrag) return;

    // Only initiate drag if the content is scrolled to the top (or near top)
    if (content.scrollTop > 5) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    content.style.transition = 'none';
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    // Prevent iOS/host app from dragging the whole webview when dismissing modal
    e.preventDefault();
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0) {
      // Dragging down — apply rubber-band translateY
      content.style.transform = `translateY(${deltaY}px)`;
      // Dim overlay proportionally
      const progress = Math.min(deltaY / 300, 1);
      overlay.style.background = `rgba(0, 0, 0, ${0.5 * (1 - progress * 0.6)})`;
    } else {
      // Dragging up — reset
      content.style.transform = '';
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    allowDrag = false;
    const deltaY = currentY - startY;

    if (deltaY > 100) {
      // Dismiss: animate out
      content.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
      content.style.transform = 'translateY(100%)';
      overlay.style.transition = 'background 0.25s ease';
      overlay.style.background = 'rgba(0, 0, 0, 0)';
      setTimeout(() => {
        content.style.transition = '';
        content.style.transform = '';
        overlay.style.transition = '';
        overlay.style.background = '';
        closeModal();
      }, 250);
    } else {
      // Snap back
      content.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
      content.style.transform = '';
      overlay.style.transition = 'background 0.2s ease';
      overlay.style.background = '';
      setTimeout(() => {
        content.style.transition = '';
        overlay.style.transition = '';
      }, 200);
    }
  };

  content.addEventListener('touchstart', onTouchStart, { passive: true });
  content.addEventListener('touchmove', onTouchMove, { passive: false });
  content.addEventListener('touchend', onTouchEnd, { passive: true });
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  if (_modalCloseHandler) {
    _modalCloseHandler();
    _modalCloseHandler = null;
  }
}

// --- Header ---
export function setHeader(title, showBack = false, actionHtml = null, onAction = null) {
  const titleEl = document.getElementById('header-title');
  const backBtn = document.getElementById('header-back');
  const actionBtn = document.getElementById('header-action');

  if (titleEl) titleEl.textContent = title;

  if (backBtn) {
    backBtn.style.display = showBack ? 'flex' : 'none';
  }

  if (actionBtn) {
    if (actionHtml) {
      actionBtn.style.display = 'flex';
      actionBtn.innerHTML = actionHtml;
      actionBtn.onclick = onAction;
    } else {
      actionBtn.style.display = 'none';
      actionBtn.onclick = null;
    }
  }
}

// --- Navigation ---
export function setActiveNav(route) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    const itemRoute = item.dataset.route;
    const isMatch = itemRoute === route ||
      (route !== '/' && itemRoute !== '/' && route.startsWith(itemRoute));
    item.classList.toggle('active', isMatch);
  });
}

// --- Render Page ---
export function renderPage(html) {
  const container = document.getElementById('page-container');
  if (container) {
    container.innerHTML = `<div class="page">${html}</div>`;
    container.scrollTop = 0;
  }
}

// --- Skeleton Loading ---
export function renderSkeleton(count = 5) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton skeleton-rect" style="height: 60px; margin-bottom: 8px;"></div>`;
  }
  return html;
}

// --- Date Formatting ---
export function formatDate(dateStr) {
  if (!dateStr || dateStr === '2999-12-31') return 'Never';
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateFull(dateStr) {
  if (!dateStr || dateStr === '2999-12-31') return 'No expiry';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getDueBadgeClass(dateStr) {
  if (!dateStr || dateStr === '2999-12-31') return 'badge-green';
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'badge-red';
  if (diffDays <= 5) return 'badge-orange';
  if (diffDays <= 14) return 'badge-yellow';
  return 'badge-green';
}

// --- Number Formatting ---
export function formatAmount(amount, decimals = 1) {
  const n = parseFloat(amount);
  if (isNaN(n)) return '0';
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(decimals);
}

export function formatPrice(price, currency = '€') {
  if (!price && price !== 0) return '';
  return `${currency}${parseFloat(price).toFixed(2)}`;
}

// --- Product Icon ---
export function getProductEmoji(name) {
  const lower = (name || '').toLowerCase();
  const emojiMap = {
    milk: '🥛', bread: '🍞', egg: '🥚', cheese: '🧀', butter: '🧈',
    apple: '🍎', banana: '🍌', orange: '🍊', tomato: '🍅', potato: '🥔',
    carrot: '🥕', onion: '🧅', garlic: '🧄', rice: '🍚', pasta: '🍝',
    chicken: '🍗', meat: '🥩', fish: '🐟', shrimp: '🦐', beer: '🍺',
    wine: '🍷', coffee: '☕', tea: '🍵', water: '💧', juice: '🧃',
    sugar: '🍬', salt: '🧂', oil: '🫒', flour: '🌾', honey: '🍯',
    yogurt: '🥛', cream: '🥛', cereal: '🥣', cookie: '🍪', cake: '🎂',
    chocolate: '🍫', ice: '🧊', pepper: '🌶', lemon: '🍋', strawberry: '🍓',
    grape: '🍇', peach: '🍑', pear: '🍐', watermelon: '🍉', pineapple: '🍍',
    mango: '🥭', avocado: '🥑', corn: '🌽', mushroom: '🍄', cucumber: '🥒',
    lettuce: '🥬', broccoli: '🥦', soap: '🧼', paper: '🧻', sponge: '🧽',
  };

  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (lower.includes(key)) return emoji;
  }
  return '📦';
}

// --- HTML Escaping ---
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// --- Debounce ---
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// --- Today's date in YYYY-MM-DD ---
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// --- Date input helper ---
export function dateFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
