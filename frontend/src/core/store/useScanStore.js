/**
 * PivotRadar Global Store (Zustand)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useScanStore = create(
  persist(
    (set, get) => ({
      // --- Tarama ayarları ---
      profile: 'Güvenli Liman',
      prefilterEnabled: false,
      topN: 1000,
      expertMode: false,
      autoscanEnabled: false,
      autoscanMinutes: 15,
      hasPerformedInitialScan: false, // Start with false for every session
      isProfileSynced: false,         // Becomes true once user profile is loaded

      // --- Sonuçlar ---
      results: [],
      scanning: false,
      scanStage: 'BEKLEMEDE',
      scanProgress: 0,
      lastScanTime: null,
      lastAnalyzeProfile: null,  // Tracked for smart re-scan avoidance
      lastAnalyzeDataTime: null, // ISO string of data source timestamp
      lastAnalyzeTs: 0,          // Timestamp of last local analysis completion
      // Grace period için: scan başladığı zaman damgası (persist edilmez)
      scanStartedAt: 0,

      // --- Seçili sembol ---
      selectedSymbol: null,
      selectedItem: null,

      // --- Grafik ---
      chartMode: 'candle',
      aiVisionOn: true,
      miniChartType: 'candle',   // 'candle'|'ohlc'|'ha'|'hollow'|'line'|'area'
      miniChartPeriod: '3A',     // '1S'|'6S'|'1G'|'1H'|'1A'|'3A'|'6A'
      miniChartOv: { ema: true, bb: false, frm: false, vol: true, fib: false },

      // --- Filtre ---
      filterQuery: '',
      sortKey: 'QRS',
      sortDir: 'desc',

      // --- Görünüm Modları & Filtreler ---
      viewMode: 'list', // 'list' | 'patterns'
      patternFilter: null, // null | 'Daralan Üçgen' | etc.

      // --- Cache meta ---
      cacheAge: null,          // minutes since cache write (internal)
      cacheDataAgeHours: null, // hours since price data date (display)
      cacheDataDate: null,     // ISO date string of price data
      cacheDataTime: null,     // ISO timestamp string of price data (exact time)
      cacheSymbolCount: 0,
      dataFreshness: null,     // { status: 'fresh'|'stale_warning'|'stale_critical', message }
      cacheReceivedAt: null,   // timestamp when cache meta was last received
      refreshTriggered: false, // background scan was triggered, auto-reanalyze pending
      mlWarning: null,         // string | null — ML model unavailable warning from backend
      qrsWarning: null,        // string | null — QRS distribution anomaly warning from backend
      timeoutWarning: false,   // boolean — last scan ended with watchdog timeout
      mlTrainedAt: null,       // ISO string — ML model training date from backend

      // --- Analyze animation ---
      isAnalyzing: false,
      analyzeProgress: 0,   // 0-100
      scanError: null,       // string | null — last scan error message

      // --- Queue States ---
      scannerQueue: 0,    // scanning queue
      intelQueue: 0,      // intelligent analysis (chart/report) queue

      // --- Ticker ---
      tickerData: [],

      // --- Watchlist ---
      watchlist: [],  // persisted via Zustand persist middleware (see partialize)

      // --- Telemetri ---
      telemetry: {},

      sidebarOpen: true,

      // --- Actions ---
      setProfile: (profile) => {
        set({ profile });
        
        // [V30] INSTANT PROFILE SWITCHING
        // Update current results in-memory using the strategy snapshot
        const { results } = get();
        if (results && results.length > 0) {
          const updatedResults = results.map(item => {
            if (item.strategy_snapshot) {
              try {
                const snapshot = typeof item.strategy_snapshot === 'string' 
                  ? JSON.parse(item.strategy_snapshot) 
                  : item.strategy_snapshot;
                
                const profData = snapshot[profile];
                if (profData && typeof profData === 'object') {
                  return {
                    ...item,
                    yzdsh: profData.qrs ?? item.yzdsh,
                    QRS: profData.qrs ?? item.QRS,
                    qrs: profData.qrs ?? item.qrs,
                    target_price: profData.target ?? item.target_price,
                    target_direction: profData.direction ?? item.target_direction,
                    predicted_days: profData.days ?? item.predicted_days,
                    quality_label: profData.label ?? item.quality_label,
                    risk_flags: profData.reasons ?? item.risk_flags ?? []
                  };
                }
              } catch (e) { console.warn("Snapshot parse error", e); }
            }
            return item;
          });
          
          // Re-sort results based on the new QRS scores
          const sortKey = get().sortKey || 'yzdsh';
          const sortDir = get().sortDir || 'desc';
          updatedResults.sort((a, b) => {
            const va = a[sortKey] ?? 0;
            const vb = b[sortKey] ?? 0;
            return sortDir === 'asc' ? va - vb : vb - va;
          });
          
          set({ results: updatedResults });
        }

        // Partially sync to backend & authStore
        import('../api/client').then(({ api }) => {
          api.saveSettings({ profile_name: profile }).then(res => {
            if (res.ok && res.strategy_profile_name) {
              import('@/store/useAuthStore').then(({ default: useAuthStore }) => {
                const curUser = useAuthStore.getState().user;
                if (curUser) {
                  useAuthStore.getState().setAuth({
                    ...curUser,
                    strategy_profile_name: res.strategy_profile_name,
                    strategy_profile_id: res.strategy_profile_id
                  }, useAuthStore.getState().token);
                }
              });
            }
          }).catch(() => {});
        });
      },
      initFromUser: (userData) => {
        if (!userData) return;
        const profile = userData.strategy_profile_name || userData.settings?.profile_name;
        const autoEnabled = userData.settings?.auto_scan_enabled;
        const autoMinutes = userData.settings?.auto_scan_interval;

        const updates = { isProfileSynced: true };
        if (profile && profile !== get().profile) updates.profile = profile;
        if (autoEnabled !== undefined) updates.autoscanEnabled = autoEnabled;
        if (autoMinutes !== undefined) updates.autoscanMinutes = autoMinutes;
        
        set(updates);
      },
      setHasPerformedInitialScan: (val) => set({ hasPerformedInitialScan: val }),
      setTopN: (topN) => set({ topN }),
      setPrefilter: (enabled) => set({ prefilterEnabled: enabled }),
      setExpertMode: (expertMode) => set({ expertMode }),
      setAutoscan: (enabled, minutes) => {
        const nextEnabled = enabled;
        const nextMinutes = minutes ?? get().autoscanMinutes;
        set({ autoscanEnabled: nextEnabled, autoscanMinutes: nextMinutes });
        
        // Sync to backend
        import('../api/client').then(({ api }) => {
          api.saveSettings({ 
            auto_scan_enabled: nextEnabled, 
            auto_scan_interval: nextMinutes 
          }).catch(() => {});
        });
      },

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      setScanning: (scanning) => set((s) => ({
        scanning,
        // scan başladığında zaman damgasını kaydet (race condition önleyici)
        scanStartedAt: scanning && !s.scanning ? Date.now() : s.scanStartedAt,
      })),

      setQueueDepths: (scannerQueue, intelQueue) => set({ scannerQueue, intelQueue }),

      setScanStage: (stage, progress = 0) =>
        set({ scanStage: stage, scanProgress: progress }),

      resetScanState: () => set({
        scanning: true,
        scanProgress: 1,
        scanStage: 'HAZIRLANIYOR',
        scanStartedAt: Date.now(),
        scanError: null,
      }),
      setScanError: (msg) => set({ scanError: msg, scanning: false, isAnalyzing: false }),

      setResults: (results, meta = {}) => {
        // ── Deduplication & Sanitization ──
        const uniqueItems = [];
        const seenSymbols = new Set();
        
        for (const item of results) {
          // Robust symbol detection: Check multiple common keys
          const rawSym = item.Sembol || item.symbol || item.ticker || item.Hisse || '';
          const sym = rawSym.toString().toUpperCase().trim();
          
          if (!sym || seenSymbols.has(sym)) continue;
          seenSymbols.add(sym);
          uniqueItems.push(item);
        }

        const sorted = [...uniqueItems].sort((a, b) => {
          const key = get().sortKey || 'QRS';
          const dir = get().sortDir || 'desc';
          const valA = a[key] ?? 0;
          const valB = b[key] ?? 0;
          return dir === 'asc' ? valA - valB : valB - valA;
        });

        // ── Busy Guard: Prevent background pulses from interrupting a foreground analysis ──
        // Bypass guard if meta.isForeground is TRUE (manual analysis)
        if (get().isAnalyzing && !meta.cacheDataTime && !meta.isForeground) {
          return;
        }

        // Sync selectedItem with fresh data from new results
        const curSym = get().selectedSymbol;
        const freshSelected = curSym
          ? sorted.find(r => (r.symbol || r.Sembol || '').toUpperCase().trim() === curSym.toUpperCase().trim()) ?? get().selectedItem
          : get().selectedItem;

        set({
          results: sorted,
          lastScanTime: Date.now(),
          scanning: false,
          lastAnalyzeProfile: meta.analyzedProfile || get().profile,
          lastAnalyzeDataTime: meta.cacheDataTime || get().lastAnalyzeDataTime,
          lastAnalyzeTs: Date.now(),
          selectedItem: freshSelected,
          mlTrainedAt: meta.ml_trained_at || get().mlTrainedAt,
        });
      },

      selectSymbol: (symbol, item) => {
        if (!symbol) return;
        set({ selectedSymbol: symbol, selectedItem: item ?? null });
      },

      // Grafik canlı verisinden gelen fiyatı liste satırına yansıtır (cache stale sorununu giderir)
      updateSymbolClose: (symbol, close, changePct) => {
        const sym = (symbol || '').toUpperCase().trim();
        if (!sym || !close) return;
        set(s => ({
          results: s.results.map(r => {
            const rSym = (r.symbol || r.Sembol || '').toUpperCase().trim();
            if (rSym !== sym) return r;
            const safeChg = (changePct != null && changePct !== 0) ? changePct : (r.change_pct ?? r.Değişim ?? null);
            return {
              ...r,
              close: close,
              Fiyat: close,
              change_pct: safeChg,
              Değişim: safeChg,
            };
          }),
          selectedItem: s.selectedItem && (s.selectedItem.symbol || s.selectedItem.Sembol || '').toUpperCase().trim() === sym
            ? (() => {
                const si = s.selectedItem;
                const safeChg = (changePct != null && changePct !== 0) ? changePct : (si.change_pct ?? si.Değişim ?? null);
                return { ...si, close, Fiyat: close, change_pct: safeChg, Değişim: safeChg };
              })()
            : s.selectedItem,
        }));
      },

      setChartMode: (chartMode) => set({ chartMode }),
      toggleAiVision: () => set((s) => ({ aiVisionOn: !s.aiVisionOn })),
      setMiniChartType: (t) => set({ miniChartType: t }),
      setMiniChartPeriod: (p) => set({ miniChartPeriod: p }),
      setMiniChartOv: (ov) => set({ miniChartOv: ov }),

      setFilterQuery: (q) => set({ filterQuery: q }),
      setSort: (key) =>
        set((s) => ({
          sortKey: key,
          sortDir: s.sortKey === key && s.sortDir === 'desc' ? 'asc' : 'desc',
        })),

      setViewMode: (mode) => set({ viewMode: mode }),
      setPatternFilter: (filter) => set({ patternFilter: filter }),

      setCacheMeta: (age, count, dataAgeHours, dataDate, freshness, refreshTriggered, dataTime, mlWarning, qrsWarning) => {
        set({
          cacheAge: age,
          cacheSymbolCount: count,
          cacheDataAgeHours: dataAgeHours ?? null,
          cacheDataDate: dataDate || null,
          cacheDataTime: dataTime || null,
          dataFreshness: freshness ?? null,
          refreshTriggered: refreshTriggered ?? false,
          cacheReceivedAt: Date.now(),
          mlWarning: mlWarning || null,
          qrsWarning: qrsWarning || null,
        });
      },
      setTimeoutWarning: (val) => set({ timeoutWarning: !!val }),

      updateResultData: (symbol, data) => set((s) => ({
        results: s.results.map(r => 
          r.symbol === symbol ? { ...r, ...data } : r
        ),
        // sync selectedItem too if it's the same symbol
        selectedItem: (s.selectedSymbol === symbol && s.selectedItem)
          ? { ...s.selectedItem, ...data }
          : s.selectedItem
      })),
      setAnalyzing: (isAnalyzing, analyzeProgress = 0) => set({ isAnalyzing, analyzeProgress }),

      setTickerData: (data) => set({ tickerData: data }),
      setTelemetry: (tel) => set({ telemetry: tel }),

      toggleWatchlist: (symbol) => set((s) => {
        const sym = symbol.toUpperCase();
        const has = s.watchlist.includes(sym);
        const next = has ? s.watchlist.filter(w => w !== sym) : [...s.watchlist, sym];
        // Watchlist is persisted via zustand's partialize — no manual localStorage needed
        return { watchlist: next };
      }),
      resetStore: () => {
        set({
          profile: 'Güvenli Liman',
          prefilterEnabled: false,
          topN: 1000,
          expertMode: false,
          autoscanEnabled: false,
          hasPerformedInitialScan: false,
          isProfileSynced: false,
          results: [],
          scanning: false,
          scanStage: 'BEKLEMEDE',
          scanProgress: 0,
          lastScanTime: null,
          selectedSymbol: null,
          viewMode: 'list',
          patternFilter: null,
          selectedItem: null,
          watchlist: [],
        });
      },
    }),
    {
      name: 'pivotradar-state-v3',
      merge: (persisted, current) => ({
        ...current,
        ...persisted,
        // Runtime-only state: never restore these from storage
        scanning: false,
        isAnalyzing: false,
        analyzeProgress: 0,
        scanError: null,
        isProfileSynced: false,
      }),
      partialize: (s) => ({
        profile: s.profile,
        topN: s.topN,
        prefilterEnabled: s.prefilterEnabled,
        expertMode: s.expertMode,
        chartMode: s.chartMode,
        aiVisionOn: s.aiVisionOn,
        miniChartType: s.miniChartType,
        miniChartPeriod: s.miniChartPeriod,
        miniChartOv: s.miniChartOv,
        autoscanEnabled: s.autoscanEnabled,
        autoscanMinutes: s.autoscanMinutes,
        hasPerformedInitialScan: s.hasPerformedInitialScan,
        lastAnalyzeTs: s.lastAnalyzeTs,
        lastAnalyzeProfile: s.lastAnalyzeProfile,
        lastAnalyzeDataTime: s.lastAnalyzeDataTime,
        results: s.results?.slice(0, 300) || [],
        watchlist: s.watchlist,
        // scanStartedAt persist EDİLMİYOR — kasıtlı
      }),
    }
  )
);
