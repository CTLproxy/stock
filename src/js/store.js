/**
 * Simple reactive state store with persistence via IndexedDB
 */
import { get, set, del, keys } from 'idb-keyval';

class Store {
  constructor() {
    this._state = {};
    this._listeners = new Map();
    this._ready = false;
  }

  async init() {
    // Load persisted state
    try {
      const serverUrl = await get('grocy_server_url');
      const apiKey = await get('grocy_api_key');
      const serverVersion = await get('grocy_server_version');
      const connectionMode = await get('grocy_connection_mode');
      const haUrl = await get('grocy_ha_url');
      const haToken = await get('grocy_ha_token');
      const addonSlug = await get('grocy_addon_slug');
      const grocyApiKey = await get('grocy_grocy_api_key');
      const barcodeSources = await get('grocy_barcode_sources');
      const dashboardShowChores = await get('grocy_dashboard_show_chores');
      const scanAutoStartCamera = await get('grocy_scan_auto_start_camera');

      this._state = {
        serverUrl: serverUrl || '',
        apiKey: apiKey || '',
        serverVersion: serverVersion || '',
        connectionMode: connectionMode || 'direct', // 'direct' | 'ha_ingress'
        haUrl: haUrl || '',
        haToken: haToken || '',
        addonSlug: addonSlug || 'a0d7b954_grocy',
        grocyApiKey: grocyApiKey || '',
        barcodeSources: barcodeSources || { primary: 'off_se', enabled: ['off_se', 'off_world', 'obf', 'opff', 'upcitemdb'] },
        dashboardShowChores: dashboardShowChores || 0,
        scanAutoStartCamera: scanAutoStartCamera == null ? 1 : scanAutoStartCamera,
        isConnected: false,
        isOnline: navigator.onLine,

        // Data caches
        products: [],
        stock: [],
        volatileStock: null,
        locations: [],
        quantityUnits: [],
        productGroups: [],
        shoppingListItems: [],
        shoppingLists: [],
        shoppingLocations: [],

        // UI State
        currentRoute: '/',
        isLoading: false,
        scanMode: 'purchase', // 'purchase', 'consume', 'lookup'
        lastScanResult: null,
      };
    } catch (e) {
      console.warn('Failed to load persisted state:', e);
      this._state = {
        serverUrl: '',
        apiKey: '',
        serverVersion: '',
        connectionMode: 'direct',
        haUrl: '',
        haToken: '',
        addonSlug: 'a0d7b954_grocy',
        grocyApiKey: '',
        barcodeSources: { primary: 'off_se', enabled: ['off_se', 'off_world', 'obf', 'opff', 'upcitemdb'] },
        dashboardShowChores: 0,
        scanAutoStartCamera: 1,
        isConnected: false,
        isOnline: navigator.onLine,
        products: [],
        stock: [],
        volatileStock: null,
        locations: [],
        quantityUnits: [],
        productGroups: [],
        shoppingListItems: [],
        shoppingLists: [],
        shoppingLocations: [],
        currentRoute: '/',
        isLoading: false,
        scanMode: 'purchase',
        lastScanResult: null,
      };
    }

    // Listen for online/offline
    window.addEventListener('online', () => this.set('isOnline', true));
    window.addEventListener('offline', () => this.set('isOnline', false));

    this._ready = true;
    return this._state;
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;

    // Persist certain keys
    const persistMap = {
      serverUrl: 'grocy_server_url',
      apiKey: 'grocy_api_key',
      serverVersion: 'grocy_server_version',
      connectionMode: 'grocy_connection_mode',
      haUrl: 'grocy_ha_url',
      haToken: 'grocy_ha_token',
      addonSlug: 'grocy_addon_slug',
      grocyApiKey: 'grocy_grocy_api_key',
      barcodeSources: 'grocy_barcode_sources',
      dashboardShowChores: 'grocy_dashboard_show_chores',
      scanAutoStartCamera: 'grocy_scan_auto_start_camera',
    };
    if (persistMap[key]) {
      set(persistMap[key], value).catch(console.warn);
    }

    // Notify listeners
    if (old !== value) {
      this._notify(key, value, old);
    }
  }

  // Set multiple keys at once
  setMany(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.set(key, value);
    }
  }

  subscribe(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      this._listeners.get(key)?.delete(callback);
    };
  }

  _notify(key, value, old) {
    const listeners = this._listeners.get(key);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(value, old);
        } catch (e) {
          console.error('Store listener error:', e);
        }
      }
    }

    // Also notify wildcard listeners
    const wildcardListeners = this._listeners.get('*');
    if (wildcardListeners) {
      for (const cb of wildcardListeners) {
        try {
          cb(key, value, old);
        } catch (e) {
          console.error('Store wildcard listener error:', e);
        }
      }
    }
  }

  // Cache product data offline
  async cacheOffline(key, data) {
    try {
      await set(`cache_${key}`, { data, timestamp: Date.now() });
    } catch (e) {
      console.warn('Failed to cache offline data:', e);
    }
  }

  async getCachedOffline(key, maxAge = 3600000) { // 1 hour default
    try {
      const cached = await get(`cache_${key}`);
      if (cached && (Date.now() - cached.timestamp) < maxAge) {
        return cached.data;
      }
    } catch (e) {
      console.warn('Failed to read offline cache:', e);
    }
    return null;
  }

  async clearCache() {
    try {
      const allKeys = await keys();
      for (const key of allKeys) {
        if (typeof key === 'string' && key.startsWith('cache_')) {
          await del(key);
        }
      }
    } catch (e) {
      console.warn('Failed to clear cache:', e);
    }
  }
}

export const store = new Store();
export default store;
