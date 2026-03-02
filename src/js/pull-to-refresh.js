/**
 * Pull-to-refresh for .page-container
 * Attach once — update the callback per-page via setRefreshHandler()
 */

let _refreshFn = null;
let _busy = false;
let _attached = false;

// Touch tracking
let _startY = 0;
let _currentY = 0;
let _pulling = false;

// DOM refs
let _container = null;
let _indicator = null;

const THRESHOLD = 70;   // px user must drag before refresh triggers
const MAX_PULL = 110;   // max visual pull distance

export function setRefreshHandler(fn) {
  _refreshFn = fn;
}

/**
 * Call once after app shell is visible.
 * Hooks into #page-container touch events.
 */
export function initPullToRefresh() {
  if (_attached) return;
  _container = document.getElementById('page-container');
  if (!_container) return;

  // Create indicator element
  _indicator = document.createElement('div');
  _indicator.className = 'ptr-indicator';
  _indicator.innerHTML = `
    <div class="ptr-spinner">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    </div>
  `;
  _container.parentElement.insertBefore(_indicator, _container);

  _container.addEventListener('touchstart', onTouchStart, { passive: true });
  _container.addEventListener('touchmove', onTouchMove, { passive: false });
  _container.addEventListener('touchend', onTouchEnd, { passive: true });
  _attached = true;
}

function onTouchStart(e) {
  if (_busy) return;
  // Only trigger when scrolled to top
  if (_container.scrollTop > 0) return;
  _startY = e.touches[0].clientY;
  _currentY = _startY;
  _pulling = true;
}

function onTouchMove(e) {
  if (!_pulling || _busy) return;

  _currentY = e.touches[0].clientY;
  const dy = _currentY - _startY;

  // Only pull down
  if (dy < 0) {
    resetVisual();
    return;
  }

  // If the container has scrolled (from momentum), abort
  if (_container.scrollTop > 0) {
    _pulling = false;
    resetVisual();
    return;
  }

  // Prevent native scroll while pulling
  if (dy > 10) e.preventDefault();

  const pull = Math.min(dy * 0.5, MAX_PULL); // damped
  const progress = Math.min(pull / THRESHOLD, 1);

  _indicator.style.transform = `translateY(${pull}px)`;
  _indicator.style.opacity = progress;
  _indicator.querySelector('.ptr-spinner').style.transform =
    `rotate(${progress * 270}deg)`;

  if (progress >= 1) {
    _indicator.classList.add('ptr-ready');
  } else {
    _indicator.classList.remove('ptr-ready');
  }
}

async function onTouchEnd() {
  if (!_pulling || _busy) return;
  _pulling = false;

  const dy = (_currentY - _startY) * 0.5;

  if (dy >= THRESHOLD && _refreshFn) {
    // Trigger refresh
    _busy = true;
    _indicator.classList.add('ptr-refreshing');
    _indicator.classList.remove('ptr-ready');
    _indicator.style.transform = `translateY(${THRESHOLD}px)`;
    _indicator.style.opacity = '1';

    try {
      await _refreshFn();
    } catch (e) {
      console.warn('Pull-to-refresh error:', e);
    }

    _busy = false;
    _indicator.classList.remove('ptr-refreshing');
    resetVisual();
  } else {
    resetVisual();
  }
}

function resetVisual() {
  _indicator.style.transform = 'translateY(0)';
  _indicator.style.opacity = '0';
  _indicator.classList.remove('ptr-ready', 'ptr-refreshing');
}
