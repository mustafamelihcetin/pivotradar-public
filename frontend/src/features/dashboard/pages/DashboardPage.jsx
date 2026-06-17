import React, { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams } from 'react-router-dom';
import { Zap, Clock } from 'lucide-react';

import { useScanStore } from '@/core/store/useScanStore';
import useAuthStore from '@/store/useAuthStore';
import { api } from '@/core/api/client';
import { cn } from '@/shared/utils/cn';
import { notify } from '@/shared/components/ToastNotifier';

import { PageBanner } from '@/shared/components/PageBanner';
import { SEOFooter } from '../../../shared/components/SEOFooter';
import { ControlHeader } from '../components/controls/ControlHeader';
import { ScanningBar } from '../components/controls/ScanningBar';
import { LiveFeedStrip } from '../components/controls/LiveFeedStrip';
import { GuestLimitModal } from '../components/controls/GuestLimitModal';
import { StatsGrid } from '../components/StatsGrid';
import { TopSignalsHUD } from '../components/TopSignalsHUD';
import { TacticalHUD } from '../components/TacticalHUD';
import { StockSEOText } from '../components/StockSEOText';
import { DEFAULT_PROFILES } from '../components/controls/constants';
import { normaliseProfiles } from '../utils/dashboardHelpers';
import { useMarketStatus }  from '../hooks/useMarketStatus';

import { useAnalyze }      from '../hooks/useAnalyze';
import { useDataWatchdog } from '../hooks/useDataWatchdog';
import { useTopSignals }   from '../hooks/useTopSignals';
import { useGuestLimit }   from '../hooks/useGuestLimit';

const TickerTable  = lazy(() => import('../components/TickerTable').then(m => ({ default: m.TickerTable })));
const ChartSection = lazy(() => import('../../charts/components/ChartSection'));
const SystemFlow   = lazy(() => import('../../scanner/components/SystemFlow'));

export function DashboardPage() {
  const navigate = useNavigate();
  const { symbol: urlSymbol } = useParams();
  const [mobileView, setMobileView] = useState(() => urlSymbol ? 'chart' : 'table');

  const isAuthenticated   = useAuthStore(s => s.isAuthenticated);
  const isAuthResolved    = useAuthStore(s => s.isAuthResolved);
  const isGuest           = useAuthStore(s => s.isGuest);
  const actualIsGuest     = isGuest || !isAuthenticated;

  const [dynamicProfiles, setDynamicProfiles] = useState(DEFAULT_PROFILES);

  const {
    results, scanning, selectedSymbol,
    selectSymbol, scanStage, scanProgress, profile, setProfile,
    topN,
    setResults, setCacheMeta, isAnalyzing, analyzeProgress,
    setAnalyzing, hasPerformedInitialScan, setHasPerformedInitialScan,
    dataLabel, dataFreshness, cacheAge, ageLabel, dataLabel: _dl,
    cacheDataAgeHours, mlWarning, qrsWarning,
  } = useScanStore();

  // ── Minute tick (ageLabel güncellemesi için) ──────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Profile migration ─────────────────────────────────────────────────────
  useEffect(() => {
    if (['Konservatif', 'Dengeli'].includes(profile)) {
      setProfile('Güvenli Liman');
    }
  }, [profile, setProfile]);

  // ── Profil listesini backend'den çek ─────────────────────────────────────
  useEffect(() => {
    api.profiles().then(rows => {
      const normalised = normaliseProfiles(rows, DEFAULT_PROFILES);
      if (normalised.length > 0) setDynamicProfiles(normalised);
    }).catch(() => {});
  }, []);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { showModal: showGuestLimitModal, closeModal, checkLimit } = useGuestLimit(actualIsGuest);

  const { runAnalyze, analyzingRef } = useAnalyze({
    profile, topN, isAnalyzing, actualIsGuest, dynamicProfiles,
  });

  const runAnalyzeWithGuestCheck = useCallback(async (profileOverride, isAuto = false) => {
    if (!isAuto && checkLimit()) return;
    return runAnalyze(profileOverride, isAuto);
  }, [checkLimit, runAnalyze]);

  useDataWatchdog(runAnalyzeWithGuestCheck);

  const topSignals = useTopSignals(results);

  // ── Initial scan ──────────────────────────────────────────────────────────
  const prevScanning = useRef(scanning);
  useEffect(() => {
    if (prevScanning.current && !scanning) {
      const s = useScanStore.getState();
      if (!s.isAnalyzing && (Date.now() - (s.lastAnalyzeTs || 0)) > 300000) {
        runAnalyzeWithGuestCheck(null, true);
      }
    }
    prevScanning.current = scanning;
  }, [scanning, runAnalyzeWithGuestCheck]);

  const initialAnalyzeFired = useRef(false);
  useEffect(() => {
    if (!isAuthResolved) return;
    if (actualIsGuest && profile !== 'Güvenli Liman') setProfile('Güvenli Liman');
    if ((isAuthenticated || actualIsGuest) && !initialAnalyzeFired.current) {
      initialAnalyzeFired.current = true;
      if (!useScanStore.getState().isAnalyzing) {
        runAnalyzeWithGuestCheck(null, true);
        setHasPerformedInitialScan(true);
      }
    }
  }, [isAuthResolved, isAuthenticated, actualIsGuest,
      profile, setProfile, runAnalyzeWithGuestCheck, setHasPerformedInitialScan]);

  // ── Auto-select top symbol ────────────────────────────────────────────────
  useEffect(() => {
    if (results.length > 0 && !selectedSymbol && !urlSymbol) {
      const top = [...results].sort((a, b) => (b.yzdsh || 0) - (a.yzdsh || 0))[0];
      if (top) selectSymbol((top.symbol || '').replace('.IS', '').trim().toUpperCase(), top);
    }
  }, [results, selectedSymbol, urlSymbol, selectSymbol]);

  // ── URL symbol sync ───────────────────────────────────────────────────────
  useEffect(() => {
    if (urlSymbol && urlSymbol.toUpperCase() !== selectedSymbol?.toUpperCase()) {
      const row = results.find(
        r => (r.symbol || '').replace('.IS', '').trim().toUpperCase() === urlSymbol.toUpperCase()
      );
      selectSymbol(urlSymbol.toUpperCase(), row || null);
    }
  }, [urlSymbol, results, selectedSymbol, selectSymbol]);


  const handleSetProfile = useCallback((p) => {
    setProfile(p);
    notify(`${p} profili seçildi — analiz başlatılıyor...`, 'info');
    setTimeout(() => runAnalyzeWithGuestCheck(p), 50);
  }, [setProfile, runAnalyzeWithGuestCheck]);

  const bistStatus = useMarketStatus();

  const sentiment = useMemo(() => {
    if (!results.length) return 0;
    return Math.round((results.filter(r => (r.yzdsh || 0) > 60).length / results.length) * 100);
  }, [results]);

  if (!isAuthResolved) return null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 max-w-[1600px] mx-auto min-h-screen">
      <Helmet>
        <title>
          {selectedSymbol ? `${selectedSymbol} Analizi | PivotRadar` : 'Quant Dashboard | PivotRadar'}
        </title>
      </Helmet>

      <ScanningBar
        scanning={scanning && (scanStage === 'SIRA' || scanProgress > 5)}
        scanProgress={scanProgress} isAnalyze={isAnalyzing}
        analyzeProgress={analyzeProgress} profile={profile}
      />

      {/* QRS Dağılım Uyarısı */}
      {qrsWarning && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-[11px] font-mono">
          <span className="material-symbols-outlined text-base text-yellow-400">bar_chart</span>
          <span className="font-bold uppercase tracking-wider">QRS KALİBRASYON —</span>
          <span className="opacity-70">{qrsWarning}</span>
        </div>
      )}

      {/* ML Model Uyarısı */}
      {mlWarning && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-[11px] font-mono">
          <span className="material-symbols-outlined text-base text-orange-400">psychology_alt</span>
          <span className="font-bold uppercase tracking-wider">ML MOTOR DEVRE DIŞI —</span>
          <span className="opacity-70">Skorlar yalnızca teknik kural motoru ile üretildi. Model dosyası eksik veya yeniden eğitim gerekiyor.</span>
        </div>
      )}

      {/* Veri Tazeliği Uyarısı */}
      {dataFreshness?.status === 'stale_warning' && !mlWarning && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-[11px] font-mono">
          <span className="material-symbols-outlined text-base text-yellow-400">schedule</span>
          <span className="font-bold uppercase tracking-wider">VERİ BAYAT —</span>
          <span className="opacity-70">
            {cacheDataAgeHours != null ? `Son fiyat verisi ${Math.round(cacheDataAgeHours)} saat önce. ` : ''}
            Skorlar güncel olmayan veriye dayanıyor olabilir.
          </span>
        </div>
      )}

      {dataFreshness?.status === 'stale_critical' && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px] font-mono">
          <span className="material-symbols-outlined text-base text-red-400">warning</span>
          <span className="font-bold uppercase tracking-wider">KRİTİK VERİ YAŞI —</span>
          <span className="opacity-70">{dataFreshness?.message || `Veri ${Math.round((cacheDataAgeHours || 0) / 24)} günden eski. Lütfen tarama başlatın.`}</span>
        </div>
      )}

      <div className="relative z-40 rounded-[2rem] border border-white/[0.05] bg-gradient-to-br from-[#0c0f18] via-[#09090f] to-[#070a10] shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="relative z-10 px-6 py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2.5">
              <div className="flex items-center gap-3">
                <div className="w-0.5 h-7 rounded-full bg-primary shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
                <div className="flex flex-col">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-black uppercase tracking-tighter leading-none text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/50">
                    Quant Terminali
                  </h1>
                  <div className="flex items-center gap-2 mt-1.5 opacity-60">
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.05]">
                      <Clock size={10} className="text-primary" />
                      <span className="text-[9px] font-bold text-white/50 tracking-widest leading-none">
                        BIST QUANT TERMINAL
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {sentiment > 0 && (
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border backdrop-blur-md",
                  sentiment > 60
                    ? "border-emerald-500/25 text-emerald-400 bg-emerald-500/[0.07]"
                    : sentiment < 40
                    ? "border-red-500/25 text-red-400 bg-red-500/[0.07]"
                    : "border-amber-500/25 text-amber-400 bg-amber-500/[0.07]"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    sentiment > 60 ? "bg-emerald-400 animate-pulse"
                    : sentiment < 40 ? "bg-red-400 animate-pulse" : "bg-amber-400"
                  )} />
                  {sentiment > 60 ? 'BOĞA' : sentiment < 40 ? 'AYI' : 'NÖTR'} · {sentiment}%
                </div>
              )}
              <div className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                bistStatus.open
                  ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400/80"
                  : "border-white/[0.06] bg-white/[0.02] text-white/20"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  bistStatus.open ? "bg-emerald-400 animate-pulse" : "bg-white/20"
                )} />
                BIST {bistStatus.label}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-white/25">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {dataLabel || 'Canlı BIST Veri Analizi'}
              </span>
            </div>
          </div>
          <ControlHeader
            profile={profile} setProfile={handleSetProfile}
            isAnalyzing={isAnalyzing}
            isGuest={actualIsGuest} profiles={dynamicProfiles}
          />
        </div>
      </div>

      <LiveFeedStrip results={results} onSelect={(sym) => navigate(`/terminal/${sym}`)} />

      <div className="grid grid-cols-12 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#05070a] shadow-2xl items-stretch">
        <div className="col-span-12 2xl:col-span-8 flex flex-col border-b 2xl:border-b-0 2xl:border-r border-white/[0.08]">
          <Suspense fallback={<div className="flex-1 h-40 animate-pulse bg-white/[0.02] rounded-[2rem]" />}>
            <TacticalHUD className="flex-1" />
            <StatsGrid />
          </Suspense>
        </div>
        <div className="col-span-12 2xl:col-span-4 flex flex-col h-full">
          <TopSignalsHUD topSignals={topSignals} onSelect={(sym) => navigate(`/terminal/${sym}`)} />
        </div>
      </div>

      {/* ── Mobil layout (2xl altı) ── */}
      <div className="block 2xl:hidden">
        {mobileView === 'chart' ? (
          <div className="relative rounded-[2rem] overflow-hidden bg-[#07090e]" style={{ minHeight: '70vh' }}>
            <Suspense fallback={<div className="w-full animate-pulse bg-white/[0.02]" style={{ minHeight: '70vh' }} />}>
              <ChartSection />
            </Suspense>
          </div>
        ) : (
          <div className="bg-[#0a0d14] border border-white/[0.05] rounded-[2rem] overflow-hidden shadow-xl" style={{ minHeight: '60vh' }}>
            <Suspense fallback={<div className="animate-pulse bg-white/[0.02]" style={{ minHeight: '60vh' }} />}>
              <TickerTable />
            </Suspense>
          </div>
        )}
      </div>

      {/* ── Mobil FAB ── */}
      {(selectedSymbol || urlSymbol) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (mobileView === 'table') {
              const sym = selectedSymbol || urlSymbol;
              if (!urlSymbol && sym) navigate(`/terminal/${sym}`);
              else setMobileView('chart');
            } else {
              setMobileView('table');
            }
          }}
          className={cn(
            "fixed bottom-16 right-4 z-50 2xl:hidden",
            "flex items-center gap-2 px-4 py-3 rounded-2xl",
            "bg-primary text-black font-black text-[11px] uppercase tracking-widest",
            "shadow-[0_8px_32px_rgba(34,211,238,0.35)] active:scale-95 transition-transform"
          )}
        >
          <span className="material-symbols-outlined text-[16px]">
            {mobileView === 'table' ? 'candlestick_chart' : 'format_list_bulleted'}
          </span>
          {mobileView === 'table' ? (selectedSymbol || urlSymbol) : 'Listeye Dön'}
        </button>
      )}

      {/* ── Desktop layout (2xl+) ── */}
      <div className="hidden 2xl:grid 2xl:grid-cols-12 gap-4 flex-1 items-stretch 2xl:h-[950px]">
        <div className="2xl:col-span-8 flex flex-col h-full order-1 2xl:order-2">
          <div className="relative overflow-hidden flex-1">
            <Suspense fallback={<div className="min-h-[480px] animate-pulse bg-white/[0.02] rounded-[2rem] border border-white/[0.05]" />}>
              <ChartSection />
            </Suspense>
            {!selectedSymbol && (
              <div className="absolute inset-0 flex items-center justify-center backdrop-blur-[2px] bg-[#0a0d14]/40 z-10 rounded-[2.5rem]">
                <Zap size={26} className="text-primary/70 animate-pulse" />
              </div>
            )}
          </div>
        </div>
        <div className="2xl:col-span-4 flex flex-col gap-4 h-full order-2 2xl:order-1" style={{ minWidth: 0 }}>
          <div className="overflow-hidden">
            <Suspense fallback={<div className="h-20 animate-pulse bg-white/[0.02] rounded-[2rem]" />}>
              <SystemFlow />
            </Suspense>
          </div>
          <div className="flex-1 bg-[#0a0d14] border border-white/[0.05] rounded-[2rem] flex flex-col overflow-hidden shadow-xl min-h-[400px]">
            <Suspense fallback={<div className="h-full animate-pulse bg-white/[0.02]" />}>
              <TickerTable />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="mt-8 mb-12">
        {selectedSymbol && (
          <StockSEOText
            symbol={selectedSymbol}
            data={results.find(
              r => (r.symbol || '').replace('.IS', '').trim().toUpperCase() === selectedSymbol.toUpperCase()
            )}
          />
        )}
      </div>

      <GuestLimitModal isOpen={showGuestLimitModal} onClose={closeModal} />
    </div>
  );
}
