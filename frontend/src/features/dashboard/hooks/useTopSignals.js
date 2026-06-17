/**
 * useTopSignals — Sonuç listesinden en iyi 3 sinyali türetir.
 * TopSignalsHUD ve ilerideki feature'lar tarafından tüketilir.
 */
import { useMemo } from 'react';

export function useTopSignals(results) {
  return useMemo(() => {
    return [...results]
      .sort((a, b) => (b.yzdsh || 0) - (a.yzdsh || 0))
      .slice(0, 3)
      .map(r => {
        const sym    = (r.symbol || r.Sembol || '').replace('.IS', '').trim();
        const score  = Math.round(r.yzdsh || r.QRS || 0);
        const pattern = r.pattern_name && r.pattern_name !== 'Formasyon Yok' ? r.pattern_name : null;
        const change = (r.change_pct || r.Değişim || 0).toFixed(2);
        const rsi    = Math.round(r.rsi || 0);
        const volume = r.volume || r.Volume || r.Hacim || 0;
        const price  = r.close || r.last || r.Fiyat || 0;

        let desc = 'Stabil momentum ve hacim desteği.';
        
        if (pattern) {
          desc = `${pattern} formasyonu ile güçleniyor.`;
        } else if (Number(change) > 4 && Number(r.volume_change > 1.5)) {
          desc = 'Yüksek hacimli güçlü momentum sinyali.';
        } else if (rsi > 70) {
          desc = 'RSI aşırı alım bölgesinde, momentum izleniyor.';
        } else if (rsi < 35) {
          desc = 'RSI aşırı satım bölgesinde teknik destek.';
        } else if (score > 85) {
          desc = 'Çok güçlü teknik ve temel mutabakat.';
        } else if (Number(change) < 0 && score > 60) {
          desc = 'Geri çekilmede dirençli QRS yapısı.';
        } else if (Number(change) > 0) {
          desc = 'Pozitif trend kanalı içerisinde seyir.';
        }

        return { sym, score, desc, change, rsi, volume, price, pattern };
      });
  }, [results]);
}
