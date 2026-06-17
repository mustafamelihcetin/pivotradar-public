/**
 * useLiveTicker — Dashboard'daki hisse listesini periyodik olarak canlı verilerle günceller.
 * Sadece ilk 30-50 hisse için paralel güncelleme yapar (performans ve rate-limit dengesi).
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useScanStore } from '@/core/store/useScanStore';
import { api } from '@/core/api/client';

const TICKER_INTERVAL = 30000; // 30 saniye
const MAX_SYMBOLS = 40;        // Liste başında güncellenecek hisse sayısı

export function useLiveTicker() {
  const queryClient = useQueryClient();
  const results = useScanStore(s => s.results);
  const updateSymbolClose = useScanStore(s => s.updateSymbolClose);
  const isAnalyzing = useScanStore(s => s.isAnalyzing);
  const scanning = useScanStore(s => s.scanning);
  const selectedSymbol = useScanStore(s => s.selectedSymbol);
  const selectedSymbolRef = useRef(selectedSymbol);
  const timerRef = useRef(null);

  // Ref'i güncel tut — effect yeniden çalışmadan son değere erişim sağlar
  useEffect(() => { selectedSymbolRef.current = selectedSymbol; }, [selectedSymbol]);

  useEffect(() => {
    // Eğer analiz veya tarama devam ediyorsa canlı ticker'ı durdur
    if (isAnalyzing || scanning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const refreshPrices = async () => {
      if (!results || results.length === 0) return;
      // Piyasa kapalıysa (hafta sonu / tatil) fiyat güncelleme yapma
      const tickerCache = queryClient.getQueryData(['ticker']);
      const marketStatus = tickerCache?.market?.status;
      if (marketStatus && marketStatus !== 'OPEN') return;

      // Listenin başındaki en iyi X hisseyi al
      const topSymbols = results
        .slice(0, MAX_SYMBOLS)
        .map(r => r.symbol)
        .filter(Boolean);

      // Seçili hisse listede yoksa (sıra dışı) yine de ekle
      const selectedNorm = selectedSymbolRef.current ? selectedSymbolRef.current.toUpperCase().trim() : null;
      const alreadyIncluded = !selectedNorm || topSymbols.some(s => s.toUpperCase().trim() === selectedNorm);
      const symbolsToFetch = alreadyIncluded
        ? topSymbols
        : [...topSymbols, selectedNorm];

      if (symbolsToFetch.length === 0) return;

      try {
        const dataMap = await api.getLivePrices(symbolsToFetch);
        
        // Gelen verileri store'a işle (Fiyat + Değişim)
        Object.entries(dataMap).forEach(([symbol, data]) => {
          if (data && data.price !== null && data.price > 0) {
            updateSymbolClose(symbol, data.price, data.change_pct);
          }
        });
      } catch (err) {
        console.debug('[LiveTicker] Fetch failed:', err);
      }
    };

    // İlk çalıştırma (500ms gecikmeli, UI oturduktan hemen sonra)
    const initialId = setTimeout(refreshPrices, 500);
    
    // Periyodik çalıştırma
    timerRef.current = setInterval(refreshPrices, TICKER_INTERVAL);

    return () => {
      clearTimeout(initialId);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [results?.length, isAnalyzing, scanning, updateSymbolClose]);
}
