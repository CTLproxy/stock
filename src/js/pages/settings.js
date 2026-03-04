/**
 * Settings Page — Server config, connection test, cache management
 */
import { api } from '../api.js';
import { store } from '../store.js';
import { renderPage, setHeader, showToast, showModal, closeModal } from '../ui.js';
import { getAllSources } from '../barcode-lookup.js';
import { clear as clearIdb } from 'idb-keyval';

export function renderSettings() {
  setHeader('Settings', false);

  const connectionMode = store.get('connectionMode') || 'direct';
  const serverUrl = store.get('serverUrl') || '';
  const apiKey = store.get('apiKey') || '';
  const haUrl = store.get('haUrl') || '';
  const haToken = store.get('haToken') || '';
  const serverVersion = store.get('serverVersion') || '';

  renderPage(`
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Connection Mode</h2>
      </div>
      <div class="segmented-control" id="conn-mode-control">
        <button class="segmented-btn ${connectionMode === 'direct' ? 'active' : ''}" data-mode="direct">Direct</button>
        <button class="segmented-btn ${connectionMode === 'ha_ingress' ? 'active' : ''}" data-mode="ha_ingress">HA Ingress</button>
      </div>
    </div>

    <!-- Direct Connection -->
    <div class="section" id="direct-settings" style="display: ${connectionMode === 'direct' ? 'block' : 'none'};">
      <div class="section-header">
        <h2 class="section-title">Grocy Server</h2>
      </div>
      <div class="glass-card" style="padding: 16px;">
        <div class="form-group">
          <label class="form-label">Server URL</label>
          <input type="url" id="settings-url" class="form-input" value="${serverUrl}" placeholder="http://192.168.1.x:9283" autocomplete="url" autocapitalize="none" autocorrect="off" spellcheck="false">
          <div class="form-hint">Direct URL to your Grocy instance (including port)</div>
          <div style="margin-top: 8px;">
            <button class="btn btn-secondary" id="settings-use-internal-proxy" style="width: 100%;">Use Internal HA Grocy Proxy</button>
          </div>
          <div class="form-hint" style="margin-top: 6px;">When running inside Home Assistant add-on UI, this uses the internal add-on network path and requires only Grocy API key.</div>
        </div>
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input type="password" id="settings-apikey" class="form-input" value="${apiKey}" placeholder="Your Grocy API key" autocomplete="off">
          <div class="form-hint">Found in Grocy → Settings → Manage API keys</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" id="settings-save-direct" style="flex: 1;">Save & Connect</button>
          <button class="btn btn-secondary" id="settings-test-direct">Test</button>
        </div>
        <div id="connection-status-direct" style="margin-top: 12px; display: none;"></div>

        <details style="margin-top: 16px;">
          <summary style="cursor: pointer; font-size: 13px; color: var(--color-text-secondary);">How to expose Grocy's port in HA</summary>
          <div style="font-size: 13px; color: var(--color-text-secondary); margin-top: 8px; line-height: 1.5;">
            <ol style="padding-left: 20px; margin: 0;">
              <li>Go to HA → Settings → Add-ons → Grocy</li>
              <li>Click the <strong>Configuration</strong> tab, scroll to <strong>Network</strong></li>
              <li>Click <strong>"Show disabled ports"</strong></li>
              <li>In the <strong>"Web interface"</strong> field, type a port number (e.g. <code>9283</code>)</li>
              <li>Click <strong>Save</strong>, then restart the Grocy add-on</li>
              <li>Connect here with: <code>http://YOUR_HA_IP:9283</code></li>
            </ol>
            <p style="margin-top: 8px;">To get the Grocy API key: open Grocy → top-right menu → Manage API keys → Add.</p>
          </div>
        </details>
      </div>
    </div>

    <!-- HA Ingress Connection -->
    <div class="section" id="ha-settings" style="display: ${connectionMode === 'ha_ingress' ? 'block' : 'none'};">
      <div class="section-header">
        <h2 class="section-title">Home Assistant</h2>
      </div>
      <div class="glass-card" style="padding: 16px;">
        <div class="form-group">
          <label class="form-label">Home Assistant URL</label>
          <input type="url" id="settings-ha-url" class="form-input" value="${haUrl}" placeholder="http://192.168.1.x:8123" autocomplete="url" autocapitalize="none" autocorrect="off" spellcheck="false">
          <div class="form-hint">Your HA instance URL (e.g. http://192.168.50.5:8123)</div>
        </div>
        <div class="form-group">
          <label class="form-label">Long-Lived Access Token</label>
          <input type="password" id="settings-ha-token" class="form-input" value="${haToken}" placeholder="eyJhbGciOi..." autocomplete="off">
          <div class="form-hint">HA → Profile (bottom-left) → scroll down → Long-Lived Access Tokens → Create Token</div>
        </div>
        <div class="form-group">
          <label class="form-label">Grocy API Key</label>
          <input type="password" id="settings-grocy-apikey" class="form-input" value="${store.get('grocyApiKey') || ''}" placeholder="Paste Grocy API key…" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">
          <div class="form-hint">Grocy → top-right menu → Manage API keys → Add</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" id="settings-save-ha" style="flex: 1;">Save & Connect</button>
          <button class="btn btn-secondary" id="settings-test-ha">Test</button>
        </div>
        <div style="margin-top: 8px;">
          <button class="btn btn-secondary" id="settings-switch-internal-proxy" style="width: 100%;">Switch to Direct + Internal Grocy Proxy</button>
        </div>
        <div class="form-hint" style="margin-top: 6px;">Use this when app runs inside HA UI and you want Grocy API key only (no HA token).</div>

        <!-- Step-by-step progress area -->
        <div id="ha-test-steps" style="margin-top: 12px; display: none;">
          <div class="ha-step" data-step="1" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px;">
            <span class="step-icon">○</span>
            <span class="step-text" style="color: var(--color-text-secondary);">Verify HA token</span>
          </div>
          <div class="ha-step" data-step="2" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px;">
            <span class="step-icon">○</span>
            <span class="step-text" style="color: var(--color-text-secondary);">Detect Grocy add-on</span>
          </div>
          <div class="ha-step" data-step="3" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px;">
            <span class="step-icon">○</span>
            <span class="step-text" style="color: var(--color-text-secondary);">Create ingress session</span>
          </div>
          <div class="ha-step" data-step="4" style="display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px;">
            <span class="step-icon">○</span>
            <span class="step-text" style="color: var(--color-text-secondary);">Connect to Grocy</span>
          </div>
          <div class="ha-step" data-step="5" style="display: none; align-items: flex-start; gap: 8px; padding: 6px 0; font-size: 12px;">
            <span class="step-icon">ℹ</span>
            <span class="step-text" style="color: var(--color-text-tertiary); word-break: break-all;"></span>
          </div>
        </div>
        <div id="connection-status-ha" style="margin-top: 8px; display: none;"></div>

        <details style="margin-top: 16px;">
          <summary style="cursor: pointer; font-size: 13px; color: var(--color-text-secondary);">How does this work?</summary>
          <div style="font-size: 13px; color: var(--color-text-secondary); margin-top: 8px; line-height: 1.5;">
            <p style="margin: 0 0 8px;">This mode automatically detects your Grocy add-on and creates temporary ingress sessions using your HA token. Sessions are refreshed transparently every 5 minutes — no manual setup needed beyond URL + token.</p>
            <p style="margin: 0;"><strong>Alternative:</strong> You can expose Grocy's port in its add-on config (see Direct tab instructions) and use "Direct" mode instead — this is simpler and doesn't require an HA token.</p>
          </div>
        </details>
      </div>
    </div>

    ${serverVersion ? `
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Server Info</h2>
      </div>
      <div class="settings-list">
        <div class="settings-item">
          <span>Grocy Version</span>
          <span class="text-secondary">${serverVersion}</span>
        </div>
        <div class="settings-item">
          <span>Mode</span>
          <span class="text-secondary">${connectionMode === 'ha_ingress' ? 'HA Ingress' : 'Direct'}</span>
        </div>
      </div>
    </div>
    ` : ''}

    ${renderBarcodeSourcesSection()}

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Dashboard</h2>
      </div>
      <div class="settings-list">
        <div class="settings-item">
          <span>Show Chores widgets</span>
          <label class="toggle-switch">
            <input type="checkbox" id="settings-dash-chores" ${store.get('dashboardShowChores') ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">App</h2>
      </div>
      <div class="settings-list">
        <div class="settings-item" id="settings-open-external" style="cursor: pointer;">
          <span>Open Outside HA UI</span>
          <div class="settings-item-chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
        <div class="settings-item" id="settings-copy-app-url" style="cursor: pointer;">
          <span>Copy App URL</span>
          <div class="settings-item-chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
        <div class="settings-item" id="settings-clear-cache" style="cursor: pointer;">
          <span>Clear Offline Cache</span>
          <div class="settings-item-chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
        <div class="settings-item" id="settings-refresh-sw" style="cursor: pointer;">
          <span>Update App</span>
          <div class="settings-item-chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <h2 class="section-title">About</h2>
      </div>
      <div class="settings-list">
        <div class="settings-item">
          <span>Stock PWA</span>
          <span class="text-secondary">v1.0.0</span>
        </div>
        <div class="settings-item">
          <span>Built for</span>
          <span class="text-secondary">Grocy</span>
        </div>
        <a class="settings-item" href="https://github.com/CTLproxy/stock" target="_blank" rel="noopener" style="text-decoration: none; color: inherit;">
          <span>Source Code</span>
          <div class="settings-item-chevron">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </div>
        </a>
      </div>
    </div>

    <div style="text-align: center; padding: 24px 0 40px; opacity: 0.4; font-size: 12px;">
      Made with care for grocery management
    </div>
  `);

  setupSettingsListeners();
}

/* ================================================================
 *  Barcode Lookup Sources section
 * ================================================================ */
function renderBarcodeSourcesSection() {
  const sources = getAllSources();
  const config = store.get('barcodeSources') || { primary: 'off_se', enabled: sources.map(s => s.id) };
  const enabledIds = config.enabled || sources.map(s => s.id);
  const primaryId = config.primary || 'off_se';

  const items = sources.map(s => {
    const isEnabled = enabledIds.includes(s.id);
    const isPrimary = s.id === primaryId;
    return `
      <div class="source-item">
        <div class="source-item-info">
          <div class="source-item-name">
            ${s.region} ${s.name}${isPrimary ? '<span class="source-primary-badge">Primary</span>' : ''}
          </div>
          <div class="source-item-desc">${s.description}</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" data-source-id="${s.id}" ${isEnabled ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }).join('');

  return `
    <div class="section">
      <div class="section-header">
        <h2 class="section-title">Barcode Lookup</h2>
      </div>
      <div class="glass-card" style="padding: 16px;">
        <p class="text-secondary" style="font-size: 13px; margin-bottom: 12px;">
          When scanning an unknown barcode, these free databases are queried in order. The primary source is checked first.
        </p>
        <div class="form-group">
          <label class="form-label">Primary Source</label>
          <select id="barcode-primary-source" class="form-input" style="padding-right: 8px;">
            ${sources.map(s => `<option value="${s.id}" ${s.id === primaryId ? 'selected' : ''}>${s.region} ${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Enabled Sources</label>
          <div id="barcode-sources-list">
            ${items}
          </div>
        </div>
      </div>
    </div>
  `;
}

function setupBarcodeSourceListeners() {
  // Primary source selector
  document.getElementById('barcode-primary-source')?.addEventListener('change', (e) => {
    const config = store.get('barcodeSources') || {};
    config.primary = e.target.value;
    store.set('barcodeSources', { ...config });
    showToast('Primary source updated', 'success');
  });

  // Toggle switches
  document.getElementById('barcode-sources-list')?.addEventListener('change', (e) => {
    const checkbox = e.target.closest('input[data-source-id]');
    if (!checkbox) return;
    const sourceId = checkbox.dataset.sourceId;
    const config = store.get('barcodeSources') || {};
    const allSources = getAllSources();
    let enabled = config.enabled || allSources.map(s => s.id);

    if (checkbox.checked) {
      if (!enabled.includes(sourceId)) enabled.push(sourceId);
    } else {
      enabled = enabled.filter(id => id !== sourceId);
      // Don't allow disabling all
      if (enabled.length === 0) {
        checkbox.checked = true;
        showToast('At least one source must be enabled', 'warning');
        return;
      }
    }
    config.enabled = enabled;
    store.set('barcodeSources', { ...config });
  });
}

function setupSettingsListeners() {
  setupBarcodeSourceListeners();

  const getAppLaunchUrl = () => {
    const path = window.location.pathname || '/';
    return `${window.location.origin}${path}`;
  };

  const getInternalProxyUrl = () => {
    const path = (window.location.pathname || '/').replace(/\/+$/, '');
    return `${window.location.origin}${path}/proxy/grocy`;
  };

  const copyAppUrlToClipboard = async () => {
    const url = getAppLaunchUrl();
    if (!navigator.clipboard?.writeText) {
      showModal('App URL', `<div style="font-size: 13px; word-break: break-all; color: var(--color-text-secondary);">${url}</div>`);
      return false;
    }
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      showModal('App URL', `<div style="font-size: 13px; word-break: break-all; color: var(--color-text-secondary);">${url}</div>`);
      return false;
    }
  };

  document.getElementById('settings-open-external')?.addEventListener('click', async () => {
    const url = getAppLaunchUrl();
    let opened = false;
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      opened = !!win;
    } catch {
      opened = false;
    }

    if (opened) {
      showToast('Opened in new browser tab', 'success');
      return;
    }

    const copied = await copyAppUrlToClipboard();
    if (copied) {
      showToast('Popup blocked — URL copied to clipboard', 'warning');
    } else {
      showToast('Could not open automatically. Copy URL manually.', 'warning');
    }
  });

  document.getElementById('settings-copy-app-url')?.addEventListener('click', async () => {
    const copied = await copyAppUrlToClipboard();
    if (copied) {
      showToast('App URL copied', 'success');
    }
  });

  const applyInternalProxyDirectMode = () => {
    const modeControl = document.getElementById('conn-mode-control');
    const directBtn = modeControl?.querySelector('.segmented-btn[data-mode="direct"]');
    if (modeControl && directBtn) {
      modeControl.querySelectorAll('.segmented-btn').forEach(s => s.classList.remove('active'));
      directBtn.classList.add('active');
      document.getElementById('direct-settings').style.display = 'block';
      document.getElementById('ha-settings').style.display = 'none';
    }

    const urlInput = document.getElementById('settings-url');
    if (!urlInput) return;
    urlInput.value = getInternalProxyUrl();
    showToast('Switched to Direct mode with internal proxy URL. Enter Grocy API key and connect.', 'success');
  };

  document.getElementById('settings-use-internal-proxy')?.addEventListener('click', applyInternalProxyDirectMode);
  document.getElementById('settings-switch-internal-proxy')?.addEventListener('click', applyInternalProxyDirectMode);

  // Dashboard chores toggle
  document.getElementById('settings-dash-chores')?.addEventListener('change', (e) => {
    store.set('dashboardShowChores', e.target.checked ? 1 : 0);
  });

  // Mode switcher
  const modeControl = document.getElementById('conn-mode-control');
  if (modeControl) {
    modeControl.addEventListener('click', (e) => {
      const segment = e.target.closest('.segmented-btn');
      if (!segment) return;
      const mode = segment.dataset.mode;
      modeControl.querySelectorAll('.segmented-btn').forEach(s => s.classList.remove('active'));
      segment.classList.add('active');
      document.getElementById('direct-settings').style.display = mode === 'direct' ? 'block' : 'none';
      document.getElementById('ha-settings').style.display = mode === 'ha_ingress' ? 'block' : 'none';
    });
  }

  // --- Direct mode: Save ---
  document.getElementById('settings-save-direct')?.addEventListener('click', async () => {
    const url = document.getElementById('settings-url')?.value?.trim().replace(/\/$/, '');
    const key = document.getElementById('settings-apikey')?.value?.trim();

    if (!url || !key) {
      showToast('Enter both server URL and API key', 'error');
      return;
    }

    const saveBtn = document.getElementById('settings-save-direct');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Connecting…'; }

    try {
      api.configure(url, key);
      const info = await api.getSystemInfo();

      store.set('connectionMode', 'direct');
      store.set('serverUrl', url);
      store.set('apiKey', key);
      store.set('serverVersion', info.grocy_version?.Version || info.grocy_version || 'Unknown');

      showConnectionStatus('direct', 'success', `Connected to Grocy ${info.grocy_version?.Version || ''}`);
      showToast('Connected successfully!', 'success');
      preloadData();
    } catch (e) {
      showConnectionStatus('direct', 'error', e.message);
      showToast('Connection failed', 'error');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save & Connect'; }
    }
  });

  // --- Direct mode: Test ---
  document.getElementById('settings-test-direct')?.addEventListener('click', async () => {
    const url = document.getElementById('settings-url')?.value?.trim().replace(/\/$/, '');
    const key = document.getElementById('settings-apikey')?.value?.trim();

    if (!url || !key) {
      showToast('Enter both fields', 'error');
      return;
    }

    const testBtn = document.getElementById('settings-test-direct');
    if (testBtn) { testBtn.disabled = true; testBtn.textContent = 'Testing…'; }

    // Save current config so we can restore it after test
    const prevUrl = api.baseUrl;
    const prevKey = api.apiKey;
    const prevMode = api.mode;

    try {
      api.configure(url, key);
      const result = await api.testConnection();
      if (result.success) {
        showConnectionStatus('direct', 'success', `Connected — Grocy ${result.version || ''}`);
      } else {
        showConnectionStatus('direct', 'error', result.error || 'Connection failed');
      }
    } catch (e) {
      showConnectionStatus('direct', 'error', e.message);
    } finally {
      // Restore previous config (test shouldn't persist)
      if (prevUrl) {
        api.baseUrl = prevUrl;
        api.apiKey = prevKey;
        api.mode = prevMode;
      }
      if (testBtn) { testBtn.disabled = false; testBtn.textContent = 'Test'; }
    }
  });

  // --- HA Ingress mode: shared step-by-step runner ---
  async function runHATest(haUrl, haToken, { saveOnSuccess = false, grocyApiKey = '' } = {}) {
    const stepsEl = document.getElementById('ha-test-steps');
    if (stepsEl) stepsEl.style.display = 'block';

    // Reset steps
    stepsEl?.querySelectorAll('.ha-step').forEach((el) => {
      el.querySelector('.step-icon').textContent = '○';
      el.querySelector('.step-text').style.color = 'var(--color-text-secondary)';
    });

    const onStep = (step, status, message) => {
      const stepEl = stepsEl?.querySelector(`[data-step="${step}"]`);
      if (!stepEl) return;
      stepEl.style.display = 'flex';
      const icon = stepEl.querySelector('.step-icon');
      const text = stepEl.querySelector('.step-text');
      if (status === 'pending') {
        icon.textContent = '◌';
        text.textContent = message;
        text.style.color = 'var(--color-text-primary)';
      } else if (status === 'ok') {
        icon.textContent = '✓';
        text.textContent = message;
        text.style.color = 'var(--color-success)';
      } else {
        icon.textContent = '✕';
        text.textContent = message;
        text.style.color = 'var(--color-error)';
      }
    };

    try {
      const result = await api.testHAConnection(haUrl, haToken, onStep, grocyApiKey);

      if (saveOnSuccess && result.success) {
        // Persist and re-configure with detected slug
        api.configureHA(haUrl, haToken, result.slug, grocyApiKey);
        store.set('connectionMode', 'ha_ingress');
        store.set('haUrl', haUrl);
        store.set('haToken', haToken);
        store.set('grocyApiKey', grocyApiKey);
        store.set('addonSlug', result.slug);
        store.set('serverVersion', result.version || 'Unknown');

        showConnectionStatus('ha', 'success', `Connected to Grocy ${result.version} via HA (${result.slug})`);
        showToast('Connected via Home Assistant!', 'success');
        preloadData();
      } else {
        showConnectionStatus('ha', 'success', 'All steps passed!');
      }
    } catch (e) {
      showConnectionStatus('ha', 'error', e.message);
      if (saveOnSuccess) showToast('Connection failed — see details above', 'error');
    }
  }

  // --- HA Ingress mode: Save ---
  document.getElementById('settings-save-ha')?.addEventListener('click', async () => {
    const haUrl = document.getElementById('settings-ha-url')?.value?.trim().replace(/\/$/, '');
    const haToken = document.getElementById('settings-ha-token')?.value?.trim();
    const grocyApiKey = document.getElementById('settings-grocy-apikey')?.value?.trim();

    if (!haUrl || !haToken) {
      showToast('Enter both HA URL and token', 'error');
      return;
    }
    if (!grocyApiKey) {
      showToast('Enter a Grocy API key', 'error');
      return;
    }

    const saveBtn = document.getElementById('settings-save-ha');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Connecting…'; }

    try {
      await runHATest(haUrl, haToken, { saveOnSuccess: true, grocyApiKey });
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save & Connect'; }
    }
  });

  // --- HA Ingress mode: Test ---
  document.getElementById('settings-test-ha')?.addEventListener('click', async () => {
    const haUrl = document.getElementById('settings-ha-url')?.value?.trim().replace(/\/$/, '');
    const haToken = document.getElementById('settings-ha-token')?.value?.trim();
    const grocyApiKey = document.getElementById('settings-grocy-apikey')?.value?.trim();

    if (!haUrl || !haToken) {
      showToast('Enter both fields', 'error');
      return;
    }

    const testBtn = document.getElementById('settings-test-ha');
    if (testBtn) { testBtn.disabled = true; testBtn.textContent = 'Testing…'; }

    try {
      await runHATest(haUrl, haToken, { saveOnSuccess: false, grocyApiKey });
    } finally {
      if (testBtn) { testBtn.disabled = false; testBtn.textContent = 'Test'; }
    }
  });

  // Clear cache
  document.getElementById('settings-clear-cache')?.addEventListener('click', async () => {
    try {
      await clearIdb();
      // Re-save connection settings
      const mode = store.get('connectionMode');
      if (mode) store.set('connectionMode', mode);
      const url = store.get('serverUrl');
      const key = store.get('apiKey');
      if (url) store.set('serverUrl', url);
      if (key) store.set('apiKey', key);
      const haUrl = store.get('haUrl');
      const haToken = store.get('haToken');
      const slug = store.get('addonSlug');
      const grocyApiKey = store.get('grocyApiKey');
      if (haUrl) store.set('haUrl', haUrl);
      if (haToken) store.set('haToken', haToken);
      if (slug) store.set('addonSlug', slug);
      if (grocyApiKey) store.set('grocyApiKey', grocyApiKey);
      showToast('Offline cache cleared', 'success');
    } catch (e) {
      showToast('Failed to clear cache', 'error');
    }
  });

  // Update SW
  document.getElementById('settings-refresh-sw')?.addEventListener('click', async () => {
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length) {
          for (const reg of registrations) await reg.update();
          showToast('Checking for updates…', 'info');
          return;
        }
      }
    } catch (_) { /* SW not available (HTTP) — fall through */ }

    // Fallback: clear caches if available, then hard-reload
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (_) { /* ignore */ }

    showToast('Reloading app…', 'info');
    setTimeout(() => window.location.reload(), 400);
  });
}

function showConnectionStatus(panel, type, message) {
  const elId = panel === 'ha' ? 'connection-status-ha' : 'connection-status-direct';
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = 'block';
  const color = type === 'success' ? 'var(--color-success)' : 'var(--color-error)';
  const icon = type === 'success' ? '✓' : '✕';
  el.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: ${color}22; color: ${color}; font-size: 13px; font-weight: 500;">
      <span>${icon}</span>
      <span>${message}</span>
    </div>
  `;
}

async function preloadData() {
  try {
    const [products, locations, qus, groups] = await Promise.all([
      api.getProducts(),
      api.getLocations(),
      api.getQuantityUnits(),
      api.getProductGroups(),
    ]);
    store.set('products', products);
    store.set('locations', locations);
    store.set('quantityUnits', qus);
    store.set('productGroups', groups);

    // Cache offline
    store.cacheOffline('products', products);
    store.cacheOffline('locations', locations);
    store.cacheOffline('quantityUnits', qus);
    store.cacheOffline('productGroups', groups);
  } catch (_) {
    // Non-critical
  }
}
