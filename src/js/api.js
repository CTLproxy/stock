/**
 * Grocy API Client
 * Handles all communication with the Grocy REST API
 * Supports direct access and HA Ingress (with automatic session management)
 *
 * HA Ingress flow:
 *   1. Authenticate via WebSocket (ws://HA/api/websocket)
 *   2. Call Supervisor API over WS to detect Grocy add-on
 *   3. Create ingress session over WS
 *   4. Make Grocy HTTP calls via /api/hassio_ingress/<session>/api/...
 */

class GrocyAPI {
  constructor() {
    this.baseUrl = '';
    this.apiKey = '';
    this.mode = 'direct'; // 'direct' | 'ha_ingress'
    this.haUrl = '';
    this.haToken = '';
    this.addonSlug = '';          // e.g. "a0d7b954_grocy"
    this._ingressSession = '';    // temporary ingress session id
    this._ingressEntry = '';      // e.g. "/api/hassio_ingress/<token>"
    this._sessionExpiry = 0;      // timestamp (ms) when session expires
    this._sessionPromise = null;  // in-flight session creation
    this._ws = null;              // WebSocket instance
    this._wsId = 0;               // auto-incrementing WS message id
    this._wsDisconnectTimer = null;
    this._cache = new Map();
    this._cacheTimeout = 30000;
  }

  /* -------- Dev-proxy detection -------- */

  /** Returns true when running on the Vite dev server (ha-proxy middleware available) */
  get _useDevProxy() {
    try {
      return import.meta.env?.DEV === true;
    } catch {
      return false;
    }
  }

  /**
   * If we're in dev mode, rewrite a HA URL to go through /ha-proxy/ to avoid CORS.
   * Example: http://192.168.50.5:8123/api/foo → /ha-proxy/http%3A%2F%2F192.168.50.5%3A8123/api/foo
   */
  _proxyUrl(fullUrl) {
    if (!this._useDevProxy) return fullUrl;
    try {
      const u = new URL(fullUrl);
      const origin = u.origin;
      const rest = fullUrl.substring(origin.length);
      return `/ha-proxy/${encodeURIComponent(origin)}${rest}`;
    } catch {
      return fullUrl;
    }
  }

  /* -------- Configuration -------- */

  /** Configure for direct Grocy API access */
  configure(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.mode = 'direct';
    this._cache.clear();
    this._clearSession();
  }

  /**
   * Configure for HA Ingress access
   * @param {string} haUrl  - e.g. http://192.168.50.5:8123
   * @param {string} haToken - HA Long-Lived Access Token
   * @param {string} addonSlug - Grocy add-on slug (e.g. "a0d7b954_grocy")
   * @param {string} [grocyApiKey] - Grocy API key (required for API auth through ingress)
   */
  configureHA(haUrl, haToken, addonSlug, grocyApiKey = '') {
    this.haUrl = haUrl.replace(/\/+$/, '');
    this.haToken = haToken;
    this.addonSlug = addonSlug;
    this.mode = 'ha_ingress';
    this.apiKey = grocyApiKey || '';
    this._cache.clear();
    this._clearSession();
  }

  _clearSession() {
    this._ingressSession = '';
    this._ingressEntry = '';
    this._sessionExpiry = 0;
    this._sessionPromise = null;
    this._haWsDisconnect();
    // Clear the ingress cookie
    try {
      document.cookie = 'ingress_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch { /* */ }
  }

  get isConfigured() {
    if (this.mode === 'ha_ingress') {
      return !!(this.haUrl && this.haToken && this.addonSlug);
    }
    return !!(this.baseUrl && this.apiKey);
  }

  /* ================================================================
   *  HA WebSocket Client
   *  
   *  The Supervisor REST proxy (/api/hassio/*) returns 401 for
   *  long-lived access tokens. The WebSocket API works reliably:
   *    ws://HA/api/websocket → auth → supervisor/api commands
   * ================================================================ */

  /**
   * Connect to HA via WebSocket and authenticate.
   * Reuses an existing open connection.
   */
  async _haWsConnect() {
    // Reuse open connection
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._scheduleWsIdle();
      return;
    }

    return new Promise((resolve, reject) => {
      const wsUrl = this.haUrl.replace(/^http/, 'ws') + '/api/websocket';
      const ws = new WebSocket(wsUrl);
      this._wsId = 0;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout — is HA reachable at ' + this.haUrl + '?'));
      }, 12000);

      const onMessage = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.type === 'auth_required') {
          ws.send(JSON.stringify({
            type: 'auth',
            access_token: this.haToken,
          }));
        } else if (data.type === 'auth_ok') {
          clearTimeout(timeout);
          ws.removeEventListener('message', onMessage);
          this._ws = ws;
          this._scheduleWsIdle();
          resolve();
        } else if (data.type === 'auth_invalid') {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(data.message || 'Invalid access token'));
        }
      };

      ws.addEventListener('message', onMessage);

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket error — check HA URL and network'));
      };

      ws.onclose = () => {
        if (this._ws === ws) this._ws = null;
      };
    });
  }

  /**
   * Send a command over the authenticated WS connection and return the result.
   * Auto-connects if not already connected.
   */
  async _haWsCommand(type, payload = {}) {
    await this._haWsConnect();
    this._scheduleWsIdle();

    return new Promise((resolve, reject) => {
      const id = ++this._wsId;
      const msg = { id, type, ...payload };

      const timeout = setTimeout(() => {
        reject(new Error(`WS command "${type}" timed out`));
      }, 15000);

      const handler = (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }

        if (data.id === id) {
          clearTimeout(timeout);
          this._ws.removeEventListener('message', handler);
          if (data.type === 'result' && data.success) {
            resolve(data.result);
          } else {
            const errMsg = data.error?.message || data.error?.code || 'Command failed';
            reject(new Error(errMsg));
          }
        }
      };

      this._ws.addEventListener('message', handler);
      this._ws.send(JSON.stringify(msg));
    });
  }

  /** Disconnect the WebSocket. */
  _haWsDisconnect() {
    clearTimeout(this._wsDisconnectTimer);
    if (this._ws) {
      try { this._ws.close(); } catch { /* */ }
      this._ws = null;
    }
  }

  /** Auto-disconnect WS after 30 s of inactivity. */
  _scheduleWsIdle() {
    clearTimeout(this._wsDisconnectTimer);
    this._wsDisconnectTimer = setTimeout(() => {
      this._haWsDisconnect();
    }, 30000);
  }

  /* -------- Ingress Session Management -------- */

  /** Create (or refresh) a HA ingress session. Returns the session id. */
  async _ensureIngressSession() {
    // Return cached session if still valid (refresh 60 s before expiry)
    if (this._ingressSession && Date.now() < this._sessionExpiry - 60_000) {
      return this._ingressSession;
    }

    // Deduplicate concurrent callers
    if (this._sessionPromise) return this._sessionPromise;

    this._sessionPromise = this._createIngressSession();
    try {
      const session = await this._sessionPromise;
      return session;
    } finally {
      this._sessionPromise = null;
    }
  }

  /** Create an ingress session (prefer WS, fallback to REST). */
  async _createIngressSession() {
    try {
      return await this._createIngressSessionWS();
    } catch (wsErr) {
      console.warn(`[api] WS ingress/session failed: ${wsErr?.message || wsErr}. Trying REST fallback…`);
    }

    // REST fallback for environments where WS supervisor commands are blocked
    const url = this._proxyUrl(`${this.haUrl}/api/hassio/ingress/session`);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.haToken}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: '{}',
      });
    } catch (e) {
      throw new Error(`Ingress session request failed: ${e?.message || e}`);
    }

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).substring(0, 200); } catch {}
      throw new Error(`HA ingress/session returned ${res.status}${detail ? `: ${detail}` : ''}`);
    }

    const json = await this._parseJsonFromResponse(res);
    const session = json?.data?.session;
    if (!session) {
      throw new Error('HA did not return an ingress session (REST)');
    }

    if (!this._ingressEntry) {
      await this._fetchIngressEntry();
    }

    this._ingressSession = session;
    this._sessionExpiry = Date.now() + 5 * 60 * 1000;
    this._setIngressCookie(session);
    this.baseUrl = `${this.haUrl}${this._ingressEntry}`;
    return session;
  }

  /** Fallback: create ingress session via HA WebSocket `supervisor/api`. */
  async _createIngressSessionWS() {
    // POST /ingress/session with empty body — no addon field needed
    const result = await this._haWsCommand('supervisor/api', {
      endpoint: '/ingress/session',
      method: 'post',
    });

    const session = result?.session;
    if (!session) {
      throw new Error('HA did not return an ingress session (WS)');
    }

    // Fetch addon info to get the ingress entry path (if not already fetched)
    if (!this._ingressEntry) {
      await this._fetchIngressEntry();
    }

    this._ingressSession = session;
    this._sessionExpiry = Date.now() + 5 * 60 * 1000;
    this._setIngressCookie(session);
    this.baseUrl = `${this.haUrl}${this._ingressEntry}`;
    return session;
  }

  /**
   * Fetch addon info to discover the ingress entry path.
   * The Supervisor returns ingress_entry like "/api/hassio_ingress/<token>".
   */
  async _fetchIngressEntry() {
    const info = await this._haWsCommand('supervisor/api', {
      endpoint: `/addons/${this.addonSlug}/info`,
      method: 'get',
    });

    const entry = info?.ingress_entry;
    if (!entry) {
      throw new Error(`Addon ${this.addonSlug} does not expose ingress (no ingress_entry)`);
    }

    this._ingressEntry = entry;
    console.log(`[api] Ingress entry for ${this.addonSlug}: ${entry}`);
    return entry;
  }

  /**
   * Set the ingress session cookie so the browser includes it automatically.
   * HA Core ingress handler reads this from the Cookie header.
   */
  _setIngressCookie(session) {
    try {
      document.cookie = `ingress_session=${session}; path=/; SameSite=Lax`;
    } catch {
      // May fail in non-browser environments
    }
  }

  /* -------- HA Diagnostic Helpers -------- */

  /**
   * Step 1: Verify HA is reachable and the token is valid.
   * Uses the WS auth handshake — if it succeeds, the token is good.
   */
  async validateHAToken() {
    await this._haWsConnect();
    return { message: 'Token valid' };
  }

  /**
   * Step 2: List installed add-ons via Supervisor WS API and find Grocy.
   * Returns { slug, name, state, version } or null.
   */
  async detectGrocyAddon() {
    const result = await this._haWsCommand('supervisor/api', {
      endpoint: '/addons',
      method: 'get',
    });
    const addons = result?.addons || [];
    return addons.find(
      (a) =>
        a.slug?.toLowerCase().includes('grocy') ||
        a.name?.toLowerCase().includes('grocy'),
    ) || null;
  }

  /**
   * Full step-by-step connection test for HA Ingress.
   * Yields progress messages via the onStep callback:
   *   onStep(stepNumber, status, message)
   *   status: 'pending' | 'ok' | 'error'
   *
   * Returns { success: true, slug, version } or throws.
   */
  async testHAConnection(haUrl, haToken, onStep = () => {}, grocyApiKey = '') {
    // Temporarily set credentials for the test
    const prevHaUrl = this.haUrl;
    const prevHaToken = this.haToken;
    const prevAddonSlug = this.addonSlug;
    const prevMode = this.mode;
    const prevApiKey = this.apiKey;

    this.haUrl = haUrl.replace(/\/+$/, '');
    this.haToken = haToken;
    this.apiKey = grocyApiKey || '';
    this.mode = 'ha_ingress';
    this._haWsDisconnect(); // force a fresh WS for the test

    try {
      // Step 1 — Verify token via WebSocket auth handshake
      onStep(1, 'pending', 'Connecting to HA…');
      try {
        await this.validateHAToken();
        onStep(1, 'ok', 'Token is valid');
      } catch (e) {
        onStep(1, 'error', `Failed: ${e.message}`);
        throw new Error('Could not authenticate with HA. Check URL and token.');
      }

      // Step 2 — Detect Grocy add-on slug via Supervisor WS API
      onStep(2, 'pending', 'Looking for Grocy add-on…');
      let grocyAddon;
      try {
        grocyAddon = await this.detectGrocyAddon();
      } catch (e) {
        onStep(2, 'error', `Supervisor error: ${e.message}`);
        throw new Error('Could not query Supervisor. Is this HA OS / Supervised?');
      }

      if (!grocyAddon) {
        onStep(2, 'error', 'Grocy add-on not found');
        throw new Error('No add-on with "grocy" in its name/slug was found.');
      }

      const slug = grocyAddon.slug;
      onStep(2, 'ok', `Found "${grocyAddon.name}" (${slug}) — ${grocyAddon.state}`);

      if (grocyAddon.state !== 'started') {
        throw new Error(`Grocy add-on is ${grocyAddon.state}. Start it first.`);
      }

      // Step 3 — Create ingress session via WS
      this.addonSlug = slug;
      onStep(3, 'pending', 'Creating ingress session…');
      this._ingressSession = '';
      this._sessionExpiry = 0;
      this._sessionPromise = null;
      try {
        await this._createIngressSession();
        onStep(3, 'ok', 'Session created');
      } catch (e) {
        onStep(3, 'error', `Session failed: ${e.message}`);
        throw new Error(`Could not create ingress session for ${slug}: ${e.message}`);
      }

      // Step 4 — Hit Grocy API through ingress
      onStep(4, 'pending', 'Connecting to Grocy…');
      try {
        const infoUrl = this._proxyUrl(`${this.baseUrl}/api/system/info`);
        const res = await fetch(infoUrl, {
          method: 'GET',
          headers: this._getHeaders(),
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`API Error: ${res.status}`);
        }

        let version = '?';
        try {
          const info = await this._parseJsonFromResponse(res);
          version = info?.grocy_version?.Version || info?.grocy_version || '?';
        } catch {
          // Some reverse proxies mangle response encoding; status=200 is enough for connectivity check
          version = '?';
        }

        onStep(4, 'ok', `Grocy ${version} responding`);
        return { success: true, slug, version };
      } catch (e) {
        // Probe common path variants to help diagnose
        const probeBase = `${this.haUrl}${this._ingressEntry}`;
        const probePaths = [
          '/api/system/info',      // standard
          '/system/info',          // no /api prefix
          '/',                     // web root
        ];
        let probeResults = [];
        for (const pp of probePaths) {
          try {
            const pUrl = this._proxyUrl(`${probeBase}${pp}`);
            const pRes = await fetch(pUrl, {
              headers: this._getHeaders(),
              credentials: 'include',
            });
            probeResults.push(`${pp} → ${pRes.status}`);
          } catch (pe) {
            probeResults.push(`${pp} → ERR: ${pe.message}`);
          }
        }
        const diag = `base=${probeBase}, probes: ${probeResults.join('; ')}`;
        console.error(`[api] Grocy ingress probe:`, diag);
        onStep(4, 'error', `Grocy error: ${e.message}`);
        onStep(5, 'error', `Debug: ${diag}`);
        throw new Error(`Ingress session works but Grocy did not respond: ${e.message}. ${diag}`);
      }
    } finally {
      // Restore previous config
      this.haUrl = prevHaUrl;
      this.haToken = prevHaToken;
      this.addonSlug = prevAddonSlug;
      this.mode = prevMode;
      this.apiKey = prevApiKey;
      this._ingressSession = '';
      this._ingressEntry = '';
      this._sessionExpiry = 0;
      this._sessionPromise = null;
      this._haWsDisconnect();
    }
  }

  /* -------- Headers -------- */

  _getHeaders() {
    if (this.mode === 'ha_ingress') {
      const h = {
        'Authorization': `Bearer ${this.haToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      if (this.apiKey) h['GROCY-API-KEY'] = this.apiKey;
      return h;
    }
    return {
      'GROCY-API-KEY': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  // Keep for backward compat
  get headers() {
    return this._getHeaders();
  }

  _cacheKey(url) {
    return url;
  }

  _getCached(key) {
    const entry = this._cache.get(key);
    if (entry && Date.now() - entry.time < this._cacheTimeout) {
      return entry.data;
    }
    this._cache.delete(key);
    return null;
  }

  _setCache(key, data) {
    this._cache.set(key, { data, time: Date.now() });
  }

  async _parseJsonFromResponse(response) {
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return null;

    const bytes = new Uint8Array(buffer);
    const parseText = (text) => {
      const trimmed = (text || '').trim();
      if (!trimmed) return null;
      return JSON.parse(trimmed);
    };

    try {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return parseText(text);
    } catch {
      // Fallback below
    }

    const looksGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    const looksDeflate = bytes.length > 1 && bytes[0] === 0x78;

    if (typeof DecompressionStream !== 'undefined' && (looksGzip || looksDeflate)) {
      try {
        const algo = looksGzip ? 'gzip' : 'deflate';
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(algo));
        const text = await new Response(stream).text();
        return parseText(text);
      } catch {
        // Continue to final error
      }
    }

    const preview = Array.from(bytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    throw new Error(`Unable to parse API response as JSON (first bytes: ${preview})`);
  }

  invalidateCache(pattern) {
    if (!pattern) {
      this._cache.clear();
      return;
    }
    for (const key of this._cache.keys()) {
      if (key.includes(pattern)) {
        this._cache.delete(key);
      }
    }
  }

  async _request(method, path, body = null, useCache = false, _retried = false) {
    // For HA ingress, ensure we have a valid session before building the URL
    if (this.mode === 'ha_ingress') {
      await this._ensureIngressSession();
    }

    const rawUrl = `${this.baseUrl}/api${path}`;
    const url = this.mode === 'ha_ingress' ? this._proxyUrl(rawUrl) : rawUrl;

    if (useCache && method === 'GET') {
      const cached = this._getCached(rawUrl);
      if (cached) return cached;
    }

    const options = {
      method,
      headers: this._getHeaders(),
    };

    // HA Ingress requires the ingress_session cookie
    if (this.mode === 'ha_ingress') {
      options.credentials = 'include';
    }

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // On 401 in HA mode, the ingress session may have expired — refresh + retry once
    if (response.status === 401 && this.mode === 'ha_ingress' && !_retried) {
      this._clearSession();
      return this._request(method, path, body, useCache, true);
    }

    if (!response.ok) {
      let errorMsg = `API Error: ${response.status}`;
      try {
        const errData = await this._parseJsonFromResponse(response);
        errorMsg = errData.error_message || errData.message || errorMsg;
      } catch (_) {
        // ignore parse error
      }
      throw new Error(errorMsg);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    const data = await this._parseJsonFromResponse(response);

    if (useCache && method === 'GET') {
      this._setCache(rawUrl, data);
    }

    return data;
  }

  // --- System ---
  async getSystemInfo() {
    return this._request('GET', '/system/info');
  }

  async getDbChangedTime() {
    return this._request('GET', '/system/db-changed-time');
  }

  // --- Stock ---
  async getStock() {
    return this._request('GET', '/stock', null, true);
  }

  async getVolatileStock(dueSoonDays = 5) {
    return this._request('GET', `/stock/volatile?due_soon_days=${dueSoonDays}`);
  }

  async getProductDetails(productId) {
    return this._request('GET', `/stock/products/${productId}`, null, true);
  }

  async getProductLocations(productId) {
    return this._request('GET', `/stock/products/${productId}/locations`);
  }

  async getProductEntries(productId) {
    return this._request('GET', `/stock/products/${productId}/entries`);
  }

  async addProductToStock(productId, amount, bestBeforeDate, price, locationId, shoppingLocationId) {
    const body = {
      amount,
      transaction_type: 'purchase',
    };
    if (bestBeforeDate) body.best_before_date = bestBeforeDate;
    if (price) body.price = price;
    if (locationId) body.location_id = locationId;
    if (shoppingLocationId) body.shopping_location_id = shoppingLocationId;

    this.invalidateCache('/stock');
    return this._request('POST', `/stock/products/${productId}/add`, body);
  }

  async consumeProduct(productId, amount, spoiled = false, locationId = null) {
    const body = {
      amount,
      transaction_type: 'consume',
      spoiled,
    };
    if (locationId) body.location_id = locationId;

    this.invalidateCache('/stock');
    return this._request('POST', `/stock/products/${productId}/consume`, body);
  }

  async transferProduct(productId, amount, locationFrom, locationTo) {
    this.invalidateCache('/stock');
    return this._request('POST', `/stock/products/${productId}/transfer`, {
      amount,
      location_id_from: locationFrom,
      location_id_to: locationTo,
    });
  }

  async inventoryProduct(productId, newAmount, bestBeforeDate, price, locationId) {
    const body = { new_amount: newAmount };
    if (bestBeforeDate) body.best_before_date = bestBeforeDate;
    if (price) body.price = price;
    if (locationId) body.location_id = locationId;

    this.invalidateCache('/stock');
    return this._request('POST', `/stock/products/${productId}/inventory`, body);
  }

  async openProduct(productId, amount = 1, locationId = null) {
    const body = { amount };
    if (locationId) body.location_id = locationId;
    this.invalidateCache('/stock');
    return this._request('POST', `/stock/products/${productId}/open`, body);
  }

  // --- Stock by Barcode ---
  async getProductByBarcode(barcode) {
    return this._request('GET', `/stock/products/by-barcode/${encodeURIComponent(barcode)}`);
  }

  async addProductByBarcode(barcode, amount, bestBeforeDate, price, locationId) {
    const body = {
      amount,
      transaction_type: 'purchase',
    };
    if (bestBeforeDate) body.best_before_date = bestBeforeDate;
    if (price) body.price = price;
    if (locationId) body.location_id = locationId;

    this.invalidateCache('/stock');
    return this._request('POST', `/stock/products/by-barcode/${encodeURIComponent(barcode)}/add`, body);
  }

  async consumeProductByBarcode(barcode, amount = 1, spoiled = false) {
    this.invalidateCache('/stock');
    return this._request('POST', `/stock/products/by-barcode/${encodeURIComponent(barcode)}/consume`, {
      amount,
      transaction_type: 'consume',
      spoiled,
    });
  }

  // --- External Barcode Lookup ---
  async externalBarcodeLookup(barcode, addToDb = false) {
    return this._request('GET', `/stock/barcodes/external-lookup/${encodeURIComponent(barcode)}?add=${addToDb}`);
  }

  // --- Undo ---
  async undoBooking(bookingId) {
    this.invalidateCache('/stock');
    return this._request('POST', `/stock/bookings/${bookingId}/undo`);
  }

  async undoTransaction(transactionId) {
    this.invalidateCache('/stock');
    return this._request('POST', `/stock/transactions/${transactionId}/undo`);
  }

  // --- Generic Entity Operations ---
  async getObjects(entity, query = '') {
    const qs = query ? `?${query}` : '';
    return this._request('GET', `/objects/${entity}${qs}`, null, true);
  }

  async getObject(entity, id) {
    return this._request('GET', `/objects/${entity}/${id}`);
  }

  async addObject(entity, data) {
    this.invalidateCache(`/objects/${entity}`);
    return this._request('POST', `/objects/${entity}`, data);
  }

  async editObject(entity, id, data) {
    this.invalidateCache(`/objects/${entity}`);
    this.invalidateCache('/stock');
    return this._request('PUT', `/objects/${entity}/${id}`, data);
  }

  async deleteObject(entity, id) {
    this.invalidateCache(`/objects/${entity}`);
    return this._request('DELETE', `/objects/${entity}/${id}`);
  }

  // --- Convenience: Products ---
  async getProducts() {
    return this.getObjects('products');
  }

  async getProduct(id) {
    return this.getObject('products', id);
  }

  async createProduct(data) {
    return this.addObject('products', data);
  }

  async updateProduct(id, data) {
    return this.editObject('products', id, data);
  }

  async deleteProduct(id) {
    return this.deleteObject('products', id);
  }

  // --- Convenience: Locations ---
  async getLocations() {
    return this.getObjects('locations');
  }

  // --- Convenience: Quantity Units ---
  async getQuantityUnits() {
    return this.getObjects('quantity_units');
  }

  // --- Convenience: Product Groups ---
  async getProductGroups() {
    return this.getObjects('product_groups');
  }

  // --- Convenience: Product Barcodes ---
  async getProductBarcodes() {
    return this.getObjects('product_barcodes');
  }

  async addProductBarcode(productId, barcode, quId = null, amount = null) {
    const data = { product_id: productId, barcode };
    if (quId) data.qu_id = quId;
    if (amount) data.amount = amount;
    return this.addObject('product_barcodes', data);
  }

  async deleteProductBarcode(id) {
    return this.deleteObject('product_barcodes', id);
  }

  async editProductBarcode(id, data) {
    return this.editObject('product_barcodes', id, data);
  }

  // --- Shopping Lists ---
  async getShoppingLists() {
    return this.getObjects('shopping_lists');
  }

  async getShoppingListItems(listId = null) {
    let query = '';
    if (listId) {
      query = `query[]=${encodeURIComponent(`shopping_list_id=${listId}`)}`;
    }
    return this.getObjects('shopping_list', query);
  }

  async addProductToShoppingList(productId, amount = 1, listId = 1, note = '') {
    this.invalidateCache('shopping_list');
    return this._request('POST', '/stock/shoppinglist/add-product', {
      product_id: productId,
      list_id: listId,
      product_amount: amount,
      note,
    });
  }

  async removeProductFromShoppingList(productId, amount = 1, listId = 1) {
    this.invalidateCache('shopping_list');
    return this._request('POST', '/stock/shoppinglist/remove-product', {
      product_id: productId,
      list_id: listId,
      product_amount: amount,
    });
  }

  async addMissingProductsToShoppingList(listId = 1) {
    this.invalidateCache('shopping_list');
    return this._request('POST', '/stock/shoppinglist/add-missing-products', { list_id: listId });
  }

  async clearShoppingList(listId = 1, doneOnly = false) {
    this.invalidateCache('shopping_list');
    return this._request('POST', '/stock/shoppinglist/clear', { list_id: listId, done_only: doneOnly });
  }

  async addShoppingListItem(data) {
    this.invalidateCache('shopping_list');
    return this.addObject('shopping_list', data);
  }

  async editShoppingListItem(id, data) {
    this.invalidateCache('shopping_list');
    return this.editObject('shopping_list', id, data);
  }

  async deleteShoppingListItem(id) {
    this.invalidateCache('shopping_list');
    return this.deleteObject('shopping_list', id);
  }

  // --- Shopping Locations (Stores) ---
  async getShoppingLocations() {
    return this.getObjects('shopping_locations');
  }

  // --- Files ---
  getProductImageUrl(fileName) {
    if (!fileName) return null;
    const raw = `${this.baseUrl}/api/files/productpictures/${btoa(fileName)}?force_serve_as=picture&best_fit_width=200`;
    return this.mode === 'ha_ingress' ? this._proxyUrl(raw) : raw;
  }

  // --- Quantity Unit Conversions ---
  async getQuantityUnitConversions() {
    return this.getObjects('quantity_unit_conversions_resolved');
  }

  // --- Batteries ---
  async getBatteries() {
    return this.getObjects('batteries');
  }

  async getBatteryDetails(batteryId) {
    return this._request('GET', `/batteries/${batteryId}`, null, true);
  }

  async chargeBattery(batteryId, trackedTime = null) {
    const data = {};
    if (trackedTime) data.tracked_time = trackedTime;
    this.invalidateCache('/objects/batteries');
    return this._request('POST', `/batteries/${batteryId}/charge`, data);
  }

  async getBatteryChargeLog(batteryId) {
    return this.getObjects('battery_charge_cycle_entries', `query%5B%5D=battery_id%3D${batteryId}`);
  }

  async createBattery(data) {
    return this.addObject('batteries', data);
  }

  async updateBattery(id, data) {
    return this.editObject('batteries', id, data);
  }

  async deleteBattery(id) {
    return this.deleteObject('batteries', id);
  }

  // --- Chores ---
  async getChores() {
    return this.getObjects('chores');
  }

  async getChoreDetails(choreId) {
    return this._request('GET', `/chores/${choreId}`, null, true);
  }

  async trackChore(choreId, trackedTime = null, doneBy = null) {
    const data = {};
    if (trackedTime) data.tracked_time = trackedTime;
    if (doneBy) data.done_by = doneBy;
    this.invalidateCache('/objects/chores');
    return this._request('POST', `/chores/${choreId}/execute`, data);
  }

  async getChoreLog(choreId) {
    return this.getObjects('chores_log', `query%5B%5D=chore_id%3D${choreId}`);
  }

  async createChore(data) {
    return this.addObject('chores', data);
  }

  async updateChore(id, data) {
    return this.editObject('chores', id, data);
  }

  async deleteChore(id) {
    return this.deleteObject('chores', id);
  }

  // --- Tasks ---
  async getTasks() {
    return this._request('GET', '/tasks');
  }

  async completeTask(taskId) {
    return this._request('POST', `/tasks/${taskId}/complete`, {});
  }

  async undoTask(taskId) {
    return this._request('POST', `/tasks/${taskId}/undo`);
  }

  // --- Equipment ---
  async getEquipment() {
    return this.getObjects('equipment');
  }

  async createEquipment(data) {
    return this.addObject('equipment', data);
  }

  async updateEquipment(id, data) {
    return this.editObject('equipment', id, data);
  }

  async deleteEquipment(id) {
    return this.deleteObject('equipment', id);
  }

  // --- Recipes ---
  async getRecipes() {
    return this.getObjects('recipes');
  }

  async getRecipeDetails(recipeId) {
    return this.getObjects('recipes_pos', `query%5B%5D=recipe_id%3D${recipeId}`);
  }

  async getRecipeFulfillment(recipeId) {
    return this._request('GET', `/recipes/${recipeId}/fulfillment`, null, true);
  }

  async getAllRecipesFulfillment() {
    return this._request('GET', '/recipes/fulfillment', null, true);
  }

  async addRecipesToMealPlan(recipeId, servings = 1) {
    return this._request('POST', `/recipes/${recipeId}/add-not-fulfilled-products-to-shoppinglist`, { excludedProductIds: [] });
  }

  async consumeRecipe(recipeId) {
    return this._request('POST', `/recipes/${recipeId}/consume`);
  }

  async createRecipe(data) {
    return this.addObject('recipes', data);
  }

  async updateRecipe(id, data) {
    return this.editObject('recipes', id, data);
  }

  async deleteRecipe(id) {
    return this.deleteObject('recipes', id);
  }

  async createRecipeIngredient(data) {
    return this.addObject('recipes_pos', data);
  }

  async updateRecipeIngredient(id, data) {
    return this.editObject('recipes_pos', id, data);
  }

  async deleteRecipeIngredient(id) {
    return this.deleteObject('recipes_pos', id);
  }

  // --- Master Data ---
  async createLocation(data) {
    return this.addObject('locations', data);
  }

  async updateLocation(id, data) {
    return this.editObject('locations', id, data);
  }

  async deleteLocation(id) {
    return this.deleteObject('locations', id);
  }

  async createQuantityUnit(data) {
    return this.addObject('quantity_units', data);
  }

  async updateQuantityUnit(id, data) {
    return this.editObject('quantity_units', id, data);
  }

  async deleteQuantityUnit(id) {
    return this.deleteObject('quantity_units', id);
  }

  async createProductGroup(data) {
    return this.addObject('product_groups', data);
  }

  async updateProductGroup(id, data) {
    return this.editObject('product_groups', id, data);
  }

  async deleteProductGroup(id) {
    return this.deleteObject('product_groups', id);
  }

  // --- File Upload ---
  async uploadFile(group, fileName, fileBlob) {
    if (this.mode === 'ha_ingress') {
      await this._ensureIngressSession();
    }
    const encoded = btoa(unescape(encodeURIComponent(fileName)));
    const rawUrl = `${this.baseUrl}/api/files/${group}/${encoded}`;
    const url = this.mode === 'ha_ingress' ? this._proxyUrl(rawUrl) : rawUrl;
    const headers = this.mode === 'ha_ingress'
      ? { 'Authorization': `Bearer ${this.haToken}`, ...(this.apiKey ? { 'GROCY-API-KEY': this.apiKey } : {}) }
      : { 'GROCY-API-KEY': this.apiKey };
    headers['Content-Type'] = 'application/octet-stream';
    headers['Accept'] = 'application/json';
    const fetchOpts = { method: 'PUT', headers, body: fileBlob };
    if (this.mode === 'ha_ingress') fetchOpts.credentials = 'include';
    const res = await fetch(url, fetchOpts);
    if (!res.ok) {
      let msg = `Upload failed: ${res.status}`;
      try { const d = await res.json(); msg = d.error_message || msg; } catch {}
      throw new Error(msg);
    }
    return true;
  }

  async deleteFile(group, fileName) {
    if (this.mode === 'ha_ingress') {
      await this._ensureIngressSession();
    }
    const encoded = btoa(unescape(encodeURIComponent(fileName)));
    const rawUrl = `${this.baseUrl}/api/files/${group}/${encoded}`;
    const url = this.mode === 'ha_ingress' ? this._proxyUrl(rawUrl) : rawUrl;
    const headers = this.mode === 'ha_ingress'
      ? { 'Authorization': `Bearer ${this.haToken}`, ...(this.apiKey ? { 'GROCY-API-KEY': this.apiKey } : {}) }
      : { 'GROCY-API-KEY': this.apiKey };
    headers['Accept'] = 'application/json';
    const delOpts = { method: 'DELETE', headers };
    if (this.mode === 'ha_ingress') delOpts.credentials = 'include';
    const res = await fetch(url, delOpts);
    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new Error(`Delete file failed: ${res.status}`);
    }
    return true;
  }

  getFileUrl(group, fileName, forceAsPicture = false) {
    if (!fileName) return null;
    const encoded = btoa(unescape(encodeURIComponent(fileName)));
    const qs = forceAsPicture ? '?force_serve_as=picture' : '';
    const raw = `${this.baseUrl}/api/files/${group}/${encoded}${qs}`;
    return this.mode === 'ha_ingress' ? this._proxyUrl(raw) : raw;
  }

  /**
   * Fetch a file from Grocy with proper authentication and return a Blob.
   * This is needed because <img src> / <a href> cannot send API key headers.
   */
  async fetchFileAsBlob(group, fileName) {
    if (this.mode === 'ha_ingress') {
      await this._ensureIngressSession();
    }
    const encoded = btoa(unescape(encodeURIComponent(fileName)));
    const rawUrl = `${this.baseUrl}/api/files/${group}/${encoded}`;
    const url = this.mode === 'ha_ingress' ? this._proxyUrl(rawUrl) : rawUrl;
    const headers = this.mode === 'ha_ingress'
      ? { 'Authorization': `Bearer ${this.haToken}`, ...(this.apiKey ? { 'GROCY-API-KEY': this.apiKey } : {}) }
      : { 'GROCY-API-KEY': this.apiKey };
    const blobOpts = { method: 'GET', headers };
    if (this.mode === 'ha_ingress') blobOpts.credentials = 'include';
    const res = await fetch(url, blobOpts);
    if (!res.ok) throw new Error(`File fetch failed: ${res.status}`);
    return res.blob();
  }

  // --- Test Connection ---
  async testConnection() {
    try {
      const info = await this.getSystemInfo();
      return { success: true, version: info.grocy_version?.Version };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// Singleton
export const api = new GrocyAPI();
export default api;
