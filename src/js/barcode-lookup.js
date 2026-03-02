/**
 * Barcode Lookup — Query free public product databases
 *
 * Supported sources (all free, no API key required):
 *   - Open Food Facts (Global)
 *   - Open Food Facts Sweden (Swedish products prioritised)
 *   - Open Beauty Facts (Cosmetics + hygiene)
 *   - Open Pet Food Facts (Pet food)
 *   - Dabas / Validoo (Swedish GTIN database — via Open Food Facts SE mirror)
 *   - UPC Item DB (Global UPC trial endpoint)
 */

import { store } from './store.js';

/* ============================================================
 *  Source definitions
 * ============================================================ */

/** Every source must have: id, name, region, fetch(barcode) → ProductInfo|null */
export const BARCODE_SOURCES = [
  {
    id: 'off_se',
    name: 'Open Food Facts (Sweden)',
    region: '🇸🇪 SE',
    description: 'Swedish product data — community contributed',
    fetch: (bc) => _fetchOFF(bc, 'https://se.openfoodfacts.org'),
  },
  {
    id: 'off_world',
    name: 'Open Food Facts (Global)',
    region: '🌍 Global',
    description: 'Largest open food database worldwide',
    fetch: (bc) => _fetchOFF(bc, 'https://world.openfoodfacts.org'),
  },
  {
    id: 'obf',
    name: 'Open Beauty Facts',
    region: '🌍 Global',
    description: 'Cosmetics, hygiene & beauty products',
    fetch: (bc) => _fetchOFF(bc, 'https://world.openbeautyfacts.org'),
  },
  {
    id: 'opff',
    name: 'Open Pet Food Facts',
    region: '🌍 Global',
    description: 'Pet food products',
    fetch: (bc) => _fetchOFF(bc, 'https://world.openpetfoodfacts.org'),
  },
  {
    id: 'upcitemdb',
    name: 'UPC Item DB',
    region: '🌍 Global',
    description: 'UPC / EAN product lookup (rate-limited trial)',
    fetch: _fetchUPCItemDB,
  },
];

/* ============================================================
 *  Public API
 * ============================================================ */

/**
 * Look up a barcode across all enabled sources in priority order.
 * Returns the first successful hit.
 *
 * @param {string} barcode
 * @returns {Promise<LookupResult>}
 *   { found: true, product: ProductInfo, source: string } or
 *   { found: false, partialResults: ProductInfo[] }
 */
export async function lookupBarcode(barcode) {
  const sources = getOrderedSources();
  const partials = [];

  for (const src of sources) {
    try {
      const info = await src.fetch(barcode);
      if (info && info.name) {
        return { found: true, product: info, source: src.name };
      }
    } catch (e) {
      console.warn(`[barcode-lookup] ${src.id} error:`, e.message || e);
    }
  }

  return { found: false, partialResults: partials };
}

/**
 * Look up barcode on ALL enabled sources in parallel.
 * Returns array of { source, product } for every hit.
 */
export async function lookupBarcodeAll(barcode) {
  const sources = getOrderedSources();
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const info = await src.fetch(barcode);
      if (info && info.name) return { source: src.name, sourceId: src.id, product: info };
      return null;
    }),
  );

  return results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);
}

/**
 * Get ordered list of enabled sources.
 * Respects user config: primarySource first, then enabled sources.
 */
export function getOrderedSources() {
  const config = store.get('barcodeSources') || {};
  const enabledIds = config.enabled || BARCODE_SOURCES.map((s) => s.id);
  const primaryId = config.primary || 'off_se';

  const enabled = BARCODE_SOURCES.filter((s) => enabledIds.includes(s.id));

  // Put primary first
  enabled.sort((a, b) => {
    if (a.id === primaryId) return -1;
    if (b.id === primaryId) return 1;
    return 0;
  });

  return enabled;
}

/**
 * Get all source definitions (for settings UI).
 */
export function getAllSources() {
  return BARCODE_SOURCES;
}

/* ============================================================
 *  Open Food Facts family (OFF, OBF, OPFF + Swedish OFF)
 * ============================================================ */

async function _fetchOFF(barcode, baseUrl) {
  const url = `${baseUrl}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,quantity,image_front_small_url,categories_tags,nutriments`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;

    const p = json.product;
    const name = p.product_name || '';
    if (!name) return null;

    return {
      name: _titleCase(name),
      brand: p.brands || '',
      quantity: p.quantity || '',
      imageUrl: p.image_front_small_url || '',
      categories: (p.categories_tags || []).map((c) => c.replace(/^en:/, '')).slice(0, 3),
      barcode,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================
 *  UPC Item DB (trial — 100 req/day)
 * ============================================================ */

async function _fetchUPCItemDB(barcode) {
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const item = json.items?.[0];
    if (!item || !item.title) return null;

    return {
      name: item.title,
      brand: item.brand || '',
      quantity: item.size || '',
      imageUrl: (item.images || [])[0] || '',
      categories: item.category ? [item.category] : [],
      barcode,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/* ============================================================
 *  Helpers
 * ============================================================ */

function _titleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
