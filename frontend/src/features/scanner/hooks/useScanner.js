import { useScanStore } from '@/core/store/useScanStore';
import { api } from '@/core/api/client';
import { notify } from '@/shared/components/ToastNotifier';
import { useCallback } from 'react';

/**
 * Custom hook to manage scanning lifecycle within features.
 * Decouples API calls from components.
 */
export function useScanner() {
  const {
    setScanning,
    setScanStage,
    setResults,
    resetScanState,
    updateSymbolClose,
    profile,
    topN,
    prefilterEnabled,
    expertMode,
    aiVisionOn
  } = useScanStore();

  const startScan = useCallback(async (customParams = {}) => {
    try {
      const isSilent = customParams.silent === true;
      
      if (!isSilent) {
        resetScanState();
      } else {
        // Just set the flag for the background progress bar
        setScanning(true);
        setScanStage('HAZIRLANIYOR', 1);
      }
      
      const payload = {
        profile_name: customParams.profile || profile || 'Güvenli Liman',
        prefilter_top_n: (customParams.prefilterEnabled ?? prefilterEnabled) ? (Number(customParams.topN || topN) || 100) : 100,
        max_symbols: 500,
        expert_mode: customParams.expertMode ?? expertMode,
        ai_vision_enabled: customParams.aiVisionEnabled ?? aiVisionOn,
        ...customParams
      };
      // Ensure 'silent' property isn't sent to API if it doesn't support it
      delete payload.silent;

      const response = await api.startScan(payload);
      
      if (response && response.results) {
        setResults(response.results);
        // Scan sonuçları cache'den gelebilir (eski fiyatlar). Batch çağrıyla tabloyu güncelle.
        const symbols = response.results
          .map(r => r.symbol || r.Sembol)
          .filter(Boolean)
          .map(s => s.toString().toUpperCase().replace('.IS', ''));
        if (symbols.length > 0) {
          api.batchPrices(symbols)
            .then(prices => {
              if (Array.isArray(prices)) {
                prices.forEach(p => {
                  if (p.symbol && p.close) updateSymbolClose(p.symbol, p.close, p.change_pct ?? null);
                });
              }
            })
            .catch(() => {}); // fiyat güncellemesi kritik değil, sessizce geç
        }
      }

      return response;
    } catch (error) {
      console.error("[useScanner] Scan failed:", error);
      setScanning(false);
      const status = error?.response?.status || error?.status;
      if (status === 429) {
        notify('Çok fazla istek. Lütfen bekleyin ve tekrar deneyin.', 'warn');
      } else if (status === 403) {
        notify('Bu işlem için yetkiniz bulunmuyor.', 'error');
      } else if (status >= 500) {
        notify('Sunucu hatası. Lütfen daha sonra tekrar deneyin.', 'error');
      } else {
        notify('Tarama başlatılamadı. Bağlantınızı kontrol edin.', 'warn');
      }
      setScanStage('HATA', 0);
      throw error;
    }
  }, [profile, topN, prefilterEnabled, expertMode, aiVisionOn, resetScanState, setResults, updateSymbolClose, setScanStage, setScanning]);

  // Durdur (Stop) functionality removed as per user request.

  return {
    startScan
  };
}
