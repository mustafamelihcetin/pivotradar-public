/**
 * useAnalyze — Tüm analiz çalıştırma mantığını kapsüller.
 */
import { useRef, useCallback } from 'react';
import { useScanStore } from '@/core/store/useScanStore';
import { api } from '@/core/api/client';
import { notify } from '@/shared/components/ToastNotifier';
import { getGuestAnalysisCount, incrementGuestCount } from '../utils/dashboardHelpers';

const GUEST_DAILY_LIMIT = 3;

export function useAnalyze({ profile, topN, isAnalyzing, actualIsGuest, dynamicProfiles }) {
  const { setResults, setCacheMeta, setAnalyzing, scanning, setScanError, setTimeoutWarning } = useScanStore();
  const timerRef = useRef(null);
  const analyzingRef = useRef(false);
  const abortCtrlRef = useRef(null);
  const MIN_MS = 300;

  const runAnalyze = useCallback(async (profileOverride, isAuto = false) => {
    const storeAnalyzing = useScanStore.getState().isAnalyzing;
    // Auto: skip if anything is running. Manual: skip only if another foreground analyze is running.
    if (isAuto && (analyzingRef.current || storeAnalyzing)) return;
    if (!isAuto && storeAnalyzing) return;

    if (actualIsGuest && !isAuto) {
      if (getGuestAnalysisCount() >= GUEST_DAILY_LIMIT) return 'guest_limit';
      incrementGuestCount();
    }

    analyzingRef.current = true;
    if (abortCtrlRef.current) abortCtrlRef.current.abort();
    abortCtrlRef.current = new AbortController();
    const signal = abortCtrlRef.current.signal;

    const activeProfileName = profileOverride || profile;
    const activeProfileId = dynamicProfiles.find(p => p.name === activeProfileName)?.id || activeProfileName;

    try {
      // Devam eden scan varsa bekle
      try {
        const prog0 = await api.progress();
        if (signal.aborted) return;

        const isActiveScan = ['SCANNING', 'PROCESSING'].includes(prog0?.state);
        const isZombie = prog0?.ts && (Date.now() - prog0.ts * 1000) > 300000;

        if (isActiveScan && !isZombie) {
          if (!isAuto) setAnalyzing(true, 0);
          let waitAttempts = 0, lastPct = prog0?.percent ?? 0, lastPctChangeTime = Date.now();
          let displayFloor = 0;
          while (waitAttempts < 120) {
            if (signal.aborted) return;
            await new Promise(r => setTimeout(r, 1500));
            let pCheck = null;
            try { pCheck = await api.progress(); } catch (pErr) {
              if (!isAuto) setScanError(`İlerleme kontrolü başarısız: ${pErr?.message || pErr}`);
              break;
            }
            const scanPct = pCheck?.percent ?? 0;
            displayFloor = Math.max(displayFloor, Math.min(scanPct * 0.45, 45));
            if (!isAuto) setAnalyzing(true, displayFloor);
            if (!pCheck || ['DONE', 'IDLE', 'FAILED', 'ERROR'].includes(pCheck.state)) break;
            if (scanPct !== lastPct) { lastPct = scanPct; lastPctChangeTime = Date.now(); }
            else if (Date.now() - lastPctChangeTime > 30000) break;
            waitAttempts++;
          }
        }
      } catch (_) {}

      // Cache stale kontrolü — sadece otomatik arka plan çağrılarında atla
      // Manuel tıklamalarda (isAuto=false) her zaman yeniden analiz et
      if (isAuto) {
        try {
          const status = await api.getCacheStatus();
          if (signal.aborted) return;
          const s = useScanStore.getState();
          const storeHasResults = s.results?.length > 0;
          if (storeHasResults && s.lastAnalyzeProfile === activeProfileName && s.lastAnalyzeDataTime === status?.data_time) {
            return;
          }
        } catch (_) {}
      }

      if (!isAuto) setAnalyzing(true, 46);
      const startTime = Date.now();
      let prog = 46, apiDone = false;

      const animTick = () => {
        if (apiDone || isAuto) return;
        const inc = prog < 55 ? 1.2 : prog < 68 ? 0.7 : prog < 78 ? 0.35 : prog < 85 ? 0.18 : 0.06;
        prog = Math.min(prog + inc, 90);
        setAnalyzing(true, prog);
        if (prog < 90 && !signal.aborted) timerRef.current = setTimeout(animTick, 200);
      };
      if (!isAuto) timerRef.current = setTimeout(animTick, 80);

      let apiResult = null, apiError = null;
      try {
        const fetchPromise = api.analyzeResults(activeProfileName, Number(topN) || 1000, null);
        const timeoutMs = isAuto ? 25000 : 60000;
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs));
        apiResult = await Promise.race([fetchPromise, timeout]);
      } catch (err) {
        if (err?.name === 'AbortError' || signal.aborted || err?.message === 'timeout') return;
        apiError = err;
      }

      apiDone = true;
      clearTimeout(timerRef.current);
      if (!isAuto) {
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_MS) await new Promise(r => setTimeout(r, MIN_MS - elapsed));
      }

      try {
        const lastProg = await api.progress();
        if (lastProg?.stage === 'TIMEOUT') {
          setTimeoutWarning(true);
          if (!isAuto) notify('Tarama zaman aşımına uğradı — kısmi sonuçlar gösteriliyor.', 'warn');
        } else {
          setTimeoutWarning(false);
        }
      } catch (_) {}

      if (apiResult?.results?.length) {
        setResults(apiResult.results, { ...apiResult.cache_meta, isForeground: true, analyzedProfile: activeProfileName });
        if (apiResult.cache_meta) {
          setCacheMeta(
            apiResult.cache_meta.age_minutes, apiResult.cache_meta.symbol_count,
            apiResult.cache_meta.data_age_hours, apiResult.cache_meta.data_date,
            apiResult.data_freshness, apiResult.refresh_triggered, apiResult.cache_meta.data_time,
            apiResult.cache_meta.ml_warning ?? apiResult.ml_warning,
            apiResult.qrs_warning ?? null
          );
        }
        if (!isAuto) {
          notify(`${activeProfileName} stratejisi ile analiz tamamlandı.`, 'success');
          setAnalyzing(true, 100);
          setTimeout(() => setAnalyzing(false, 0), 700);
        }
      } else if (!isAuto) {
        if (apiError) {
          const errorMsg = apiError.message || 'Bilinmeyen hata';
          if (errorMsg.includes('429')) notify('Çok fazla istek yaptınız. Lütfen bir dakika bekleyin.', 'warn');
          else notify(`Hata: ${errorMsg}`, 'warn');
          setScanError(`Sistem Hatası: ${errorMsg}`);
        } else if (apiResult?.cache_meta?.error) {
          notify(apiResult.cache_meta.error, 'warn');
        } else if (apiResult && !apiResult.results?.length) {
          notify('Henüz tarama verisi yok. Lütfen önce tarama başlatın.', 'info');
        }
        setAnalyzing(true, prog);
        setTimeout(() => setAnalyzing(false, 0), 400);
      }
    } finally {
      // Her durumda temizle
      analyzingRef.current = false;
      if (!isAuto) setAnalyzing(false, 0);
    }
  }, [profile, topN, setResults, setCacheMeta, setAnalyzing, actualIsGuest, dynamicProfiles]);

  return { runAnalyze, analyzingRef };
}
