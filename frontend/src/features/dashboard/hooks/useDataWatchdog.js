/**
 * useDataWatchdog — Sunucuda yeni veri çıktığında otomatik analiz tetikler.
 *
 * Üç tetikleyici:
 *   1. data_time değişimi — backend yeni scan tamamladığında (1dk cooldown)
 *   2. 30 dakika fallback  — data_time hiç değişmese bile taze kalır
 *   3. noResults           — tablo boşsa 2dk'da bir tekrar dener
 *
 * Not: dataChanged için sadece 1dk cooldown var; deploy sonrası yeni data_time
 * gelince MIN_INTERVAL_MS (5dk) beklemeden anında tetiklenir.
 */
import { useEffect, useRef } from 'react';
import { useScanStore } from '@/core/store/useScanStore';
import { api } from '@/core/api/client';

const DATA_CHANGE_COOLDOWN_MS = 1  * 60 * 1000;  // dataChanged tetikleyicisi için: 1 dk
const MIN_INTERVAL_MS         = 5  * 60 * 1000;  // stale fallback cooldown: 5 dk
const STALE_REFRESH_MS        = 30 * 60 * 1000;  // hard stale fallback: 30 dk
const NO_RESULTS_RETRY_MS     = 2  * 60 * 1000;  // boş tablo retry: 2 dk

export function useDataWatchdog(runAnalyze) {
  // Tracks last ATTEMPT time independently of store's lastAnalyzeTs,
  // so empty-result runs don't reset the retry clock to "never tried".
  const lastAttemptRef = useRef(0);

  useEffect(() => {
    const check = async () => {
      try {
        const status = await api.getCacheStatus();
        const s = useScanStore.getState();
        const now = Date.now();
        const sinceLastAnalyze = now - (s.lastAnalyzeTs || 0);
        const sinceLastAttempt = now - lastAttemptRef.current;
        const noResults = !s.results?.length;

        const dataChanged = status?.data_time && s.lastAnalyzeDataTime !== status.data_time;
        const staleTimeout = sinceLastAnalyze > STALE_REFRESH_MS;

        if (s.isAnalyzing || s.scanning) return;

        if (noResults) {
          // Empty table: retry every 2 min until we have data
          if (sinceLastAttempt > NO_RESULTS_RETRY_MS) {
            lastAttemptRef.current = now;
            runAnalyze(null, true);
          }
        } else if (dataChanged && sinceLastAttempt > DATA_CHANGE_COOLDOWN_MS) {
          // Backend has new data_time → re-analyze quickly (1 min cooldown prevents rapid fire)
          // This fires after deploy once cache warms, regardless of how recent lastAnalyzeTs is
          lastAttemptRef.current = now;
          runAnalyze(null, true);
        } else if (staleTimeout && sinceLastAnalyze > MIN_INTERVAL_MS) {
          // Hard stale fallback when data_time never changes
          lastAttemptRef.current = now;
          runAnalyze(null, true);
        }
      } catch (_) {}
    };

    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [runAnalyze]);
}
