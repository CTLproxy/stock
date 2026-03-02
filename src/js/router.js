/**
 * Simple hash-based SPA router
 */

class Router {
  constructor() {
    this._routes = new Map();
    this._currentRoute = null;
    this._currentCleanup = null;
    this._beforeNavigate = null;
  }

  /**
   * Register a route
   * @param {string} path - Route path (supports :param syntax)
   * @param {Function} handler - Handler function that returns HTML or renders content
   * @param {Function} [cleanup] - Optional cleanup function called when leaving this route
   */
  register(path, handler, cleanup) {
    this._routes.set(path, { handler, cleanup: cleanup || null });
  }

  onBeforeNavigate(callback) {
    this._beforeNavigate = callback;
  }

  init() {
    window.addEventListener('hashchange', () => this._onRouteChange());
    // Initial route
    this._onRouteChange();
  }

  handleRoute() {
    this._onRouteChange();
  }

  navigate(path) {
    window.location.hash = path;
  }

  back() {
    history.back();
  }

  get currentPath() {
    const hash = window.location.hash.slice(1) || '/';
    // Strip query string for route matching
    return hash.split('?')[0];
  }

  _onRouteChange() {
    const path = this.currentPath;

    // Cleanup previous route
    if (this._currentCleanup) {
      try {
        this._currentCleanup();
      } catch (e) {
        console.warn('Route cleanup error:', e);
      }
      this._currentCleanup = null;
    }

    // Find matching route
    let params = {};

    let routeEntry = null;
    for (const [pattern, entry] of this._routes) {
      const match = this._matchRoute(pattern, path);
      if (match) {
        routeEntry = entry;
        params = match;
        break;
      }
    }

    if (!routeEntry) {
      // 404 — navigate to home
      this.navigate('/');
      return;
    }

    this._currentRoute = path;

    if (this._beforeNavigate) {
      this._beforeNavigate(path, params);
    }

    // Store cleanup from route definition
    if (routeEntry.cleanup) {
      this._currentCleanup = routeEntry.cleanup;
    }

    // Execute handler
    const result = routeEntry.handler(params);

    // If handler also returns a cleanup function, prefer it
    if (typeof result === 'function') {
      this._currentCleanup = result;
    }
  }

  _matchRoute(pattern, path) {
    // Exact match
    if (pattern === path) return {};

    // Pattern matching with :params
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) return null;

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (patternParts[i] !== pathParts[i]) {
        return null;
      }
    }

    return params;
  }
}

export const router = new Router();
export default router;
