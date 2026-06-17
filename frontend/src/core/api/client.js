/**
 * PivotRadar API Client
 * Tüm /api/* çağrıları buradan geçer.
 * Proxy (dev): Vite → http://127.0.0.1:8501
 * Prod: FastAPI static olarak serve eder
 */

import useAuthStore from "../../store/useAuthStore";

const BASE = ''; // Relative path for unified deployment

async function apiFetch(path, options = {}, _isRetry = false) {
  const { token } = useAuthStore.getState();

  const method = (options.method || 'GET').toUpperCase();
  const cacheBust = method === 'GET' ? `${path.includes('?') ? '&' : '?'}_=${Date.now()}` : '';
  const url = `${BASE}${path}${cacheBust}`;

  const headers = {
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-Guest'] = 'true';
  }

  try {
    const res = await fetch(url, { ...options, headers });

    // 401 → token yenile ve bir kez tekrar dene
    if (res.status === 401 && !_isRetry) {
      const newToken = await useAuthStore.getState().performRefresh();
      if (newToken) {
        return apiFetch(path, options, true);
      }
      // Refresh başarısız oldu — sessizce hata fırlat, logout zaten performRefresh içinde
      throw new Error(`HTTP 401: Oturum süresi doldu (${path})`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)} (${path})`);
    }

    return res.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new Error(`Bağlantı koptu veya CORS engeli. Adres: ${url}`);
    }
    throw err;
  }
}

export const api = {
  // Sistem durumu
  ping: () => apiFetch('/api/ping'),
  status: () => apiFetch('/api/status'),
  telemetry: () => apiFetch('/api/telemetry'),
  statusAlerts: (since = 0) => apiFetch(`/api/status/alerts?since=${since}`),

  // Feature flags (public)
  features: () => apiFetch('/api/features'),

  // Tarama
  startScan: (payload) =>
    apiFetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  stopScan: () => apiFetch('/api/stop', { method: 'POST' }),
  results: () => apiFetch('/api/results'),
  progress: () => apiFetch('/api/progress'),

  // Per-user instant analysis (no scan queue, reads cache)
  analyzeResults: (profile_name, top_n = 100, expert_overrides = null) =>
    apiFetch('/api/scan/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_name, top_n, expert_overrides }),
    }),
  getLivePrices: (symbols) =>
    apiFetch('/api/scan/live-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    }),
  getCacheStatus: () => apiFetch('/api/scan/cache-status'),
  getPatterns: (profile_name = 'Dengeli', pattern_type = null, min_confidence = 0.5, top_n = 50) => {
    let url = `/api/patterns?profile_name=${encodeURIComponent(profile_name)}&min_confidence=${min_confidence}&top_n=${top_n}`;
    if (pattern_type) url += `&pattern_type=${encodeURIComponent(pattern_type)}`;
    return apiFetch(url);
  },

  // Strategy profiles list (fetched from DB, no auth)
  profiles: () => fetch('/api/profiles').then(r => r.ok ? r.json() : []).catch(() => []),

  // Public (no auth) — landing page showcase
  showcase: () =>
    fetch('/api/scan/showcase').then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),

  // Public (no auth) — global macro signals (VIX, BIST100, USDTRY), 5 min cache on backend
  getMarketSignals: () =>
    fetch('/api/scanner/signals').then(r => r.ok ? r.json() : null).catch(() => null),

  // Authenticated — system alpha vs BIST100 performance summary
  performanceSummary: (days = 90) => apiFetch(`/api/scan/performance-summary?days=${days}`),

  // Grafik
  chart: (symbol, mode = 'candle', period = '6M', ml_score = null, qrs_score = null, profile_name = null, signal = null) => {
    let url = `/api/chart?symbol=${encodeURIComponent(symbol)}&mode=${mode}&period=${period}`;
    if (ml_score    != null) url += `&ml_score=${ml_score}`;
    if (qrs_score   != null) url += `&qrs_score=${qrs_score}`;
    if (profile_name != null) url += `&profile_name=${encodeURIComponent(profile_name)}`;
    return apiFetch(url, signal ? { signal } : {});
  },

  // İntraday grafik (1h/5m/30m)
  intradayChart: (symbol, period = '1D') =>
    apiFetch(`/api/chart/intraday?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`),

  // Temel veriler (yfinance .info — 1 saatlik cache)
  fundamentals: (symbol) =>
    apiFetch(`/api/chart/fundamentals?symbol=${encodeURIComponent(symbol)}`),

  // Katılım endeks bileşenleri (BIST KTMLM, statik JSON, 3 ayda 1 güncellenir)
  katilimList: () => apiFetch('/api/meta/katilim'),

  // Tüm BIST şirket adları (flat {symbol: name} map, backend bist_names.json'dan)
  bistNames: () => apiFetch('/api/meta/bist-names'),

  // Ticker (döviz/endeks)
  ticker: () => apiFetch('/api/ticker'),

  // Batch canlı fiyat (scan tablosu senkronizasyonu)
  batchPrices: (symbols) => {
    if (!symbols || symbols.length === 0) return Promise.resolve([]);
    const q = symbols.join(',');
    return apiFetch(`/api/scan/prices?symbols=${encodeURIComponent(q)}`);
  },

  // Backtest
  backtest: (symbol, params = {}) => {
    const p = new URLSearchParams({ symbol, ...params });
    return apiFetch(`/api/backtest?${p}`);
  },
  prismReplay: (params = {}) => {
    const p = new URLSearchParams(params);
    return apiFetch(`/api/backtest/prism-replay?${p}`);
  },

  // Haberler
  news: (symbol = '', maxItems = 25) =>
    apiFetch(`/api/news?symbol=${encodeURIComponent(symbol)}&max_items=${maxItems}`),

  // Piyasa Durumu
  marketOverview: () => apiFetch('/api/market/overview'),

  // Ayarlar
  uiState: () => apiFetch('/api/ui_state'),
  saveUiState: (payload) =>
    apiFetch('/api/ui_state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  // 2FA
  twofa: {
    status:  ()      => apiFetch('/api/auth/2fa/status'),
    setup:   ()      => apiFetch('/api/auth/2fa/setup',   { method: 'POST' }),
    confirm: (code)  => apiFetch('/api/auth/2fa/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }),
    disable: (code)  => apiFetch('/api/auth/2fa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }),
  },

  // API Keys
  apiKeys: {
    list:   ()     => apiFetch('/api/auth/api-keys'),
    create: (name) => apiFetch('/api/auth/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
    delete: (id)   => apiFetch(`/api/auth/api-keys/${id}`, { method: 'DELETE' }),
  },

  // Auth extras
  me: () => apiFetch('/api/users/me'),
  forgotPassword: (email) =>
    apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token, new_password) =>
    apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password }),
    }),
  verifyEmail: (token) => apiFetch(`/api/auth/verify-email?token=${token}`),
  resendVerification: () => apiFetch('/api/auth/resend-verification', { method: 'POST' }),

  // Profile
  saveSettings: (settings) =>
    apiFetch('/api/users/me/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),

  updateProfile: (payload) =>
    apiFetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  changePassword: (current_password, new_password) =>
    apiFetch('/api/users/me/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password, new_password }),
    }),
  deleteAccount: () => apiFetch('/api/users/me', { method: 'DELETE' }),

  // Portfolio
  getPortfolio: () => apiFetch('/api/users/me/portfolio'),
  savePortfolio: (holdings) =>
    apiFetch('/api/users/me/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings }),
    }),

  // Support
  submitSupportMessage: (payload) =>
    apiFetch('/api/support/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  submitReport: (payload) =>
    apiFetch('/api/support/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  admin: {
    stats: () => apiFetch('/api/admin/stats'),
    predictions: (params) => apiFetch(`/api/admin/predictions?${new URLSearchParams(params)}`),
    users: (params) => apiFetch(`/api/admin/users?${new URLSearchParams(params)}`),
    settings: {
      get: () => apiFetch('/api/admin/settings'),
      update: (payload) =>
        apiFetch('/api/admin/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
    },
    getMlHealth: () => apiFetch('/api/admin/ml-health'),
    runCalibration: (days = 14) => apiFetch(`/api/admin/calibration/run?eval_window_days=${days}`, { method: 'POST' }),
    getCalibrationReport: () => apiFetch('/api/admin/calibration/report'),
    triggerScan: () => apiFetch('/api/admin/trigger/scan', { method: 'POST' }),
    triggerCalibrate: () => apiFetch('/api/admin/trigger/calibrate', { method: 'POST' }),
    triggerRetrain: () => apiFetch('/api/admin/trigger/retrain', { method: 'POST' }),
    triggerCalibrateProfiles: () => apiFetch('/api/admin/trigger/calibrate-profiles', { method: 'POST' }),
    getCalibrationModelStatus: () => apiFetch('/api/admin/calibration/model-status'),
    getSchedulerStatus: () => apiFetch('/api/admin/scheduler/status'),
    getPipelineStatus: () => apiFetch('/api/admin/pipeline/status'),
    getTaskHistory: () => apiFetch('/api/admin/task-history'),
    getProgress: () => apiFetch('/api/progress'),
    getLogs: (limit = 100) => apiFetch(`/api/admin/logs?limit=${limit}`),
    live: () => apiFetch('/api/admin/live'),
    getDbStats: () => apiFetch('/api/admin/db/stats'),
    getDbTables: () => apiFetch('/api/admin/db/tables'),
    pruneDb: (mode, days) => apiFetch(`/api/admin/db/prune?mode=${mode}&older_than_days=${days}`, { method: 'POST' }),
  },
};
