import PropTypes from 'prop-types';
import { useScanStore } from '../../../core/store/useScanStore';
import { useEffect, useState } from 'react';
import { InfoTip } from '@/shared/components/InfoTip';
import { cn } from '@/shared/utils/cn';
import { SkeletonTable } from '@/shared/components/Skeleton';
import { SearchableSelect } from '@/shared/components/SearchableSelect';

const TERM_TIPS = {
  ML:  'ML (Makine Öğrenmesi) Skoru: 86 teknik özellikle eğitilmiş yapay zeka modelinin yükseliş olasılığı tahmini. 0–100 arası. ≥70 güçlü sinyal.',
  QRS: 'QRS (Quant Ranking Score): Kural tabanlı puan ile ML skorunun ağırlıklı ortalaması. Tablonun ana sıralama kriteridir. Kalite filtreleri (RSI, Hacim, R/Ö) uygulanmıştır.',
  RSI: 'RSI (Göreceli Güç Endeksi): 0–100 arası momentum göstergesi. <30 aşırı satım (dönüş fırsatı), >70 aşırı alım (dikkat).',
};

// SPK uyumlu risk flag etiketleri ve renkleri
// Sistem asla "Al/Sat/Tut" yönlendirmesi yapmaz — matematiksel durum tespiti
const RISK_FLAG_MAP = {
  ASIRI_ISINMA:    { label: 'Aşırı Isınma', tip: 'RSI ≥90: Ortalamaya Dönüş (Mean Reversion) riski yüksek. Momentum sürdürülemez olabilir.', style: 'color:#f87171;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25)' },
  BOGA_TUZAGI_RISKI: { label: 'Boğa Tuzağı?', tip: 'Fiyat yukarı ama hacim onayı zayıf. Yükseliş sahte olabilir (Bull Trap riski).', style: 'color:#fb923c;background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.25)' },
  DUSUK_RISK_ODUL: { label: 'Düşük R/Ö', tip: 'Risk/Ödül oranı 1:2 altında. Teknik direnç projeksiyonu hedefi küçük kalmaktadır.', style: 'color:#facc15;background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.2)' },
  YUKSEK_VOLATILITE: { label: 'Yüksek Vola', tip: 'ATR bant genişliği seçilen profil için fazla. Konservatif stratejilerle uyumsuz.', style: 'color:#a78bfa;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2)' },
};

function RiskBadges({ flags, qualityLabel }) {
  if (!flags?.length && !qualityLabel) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
      {(flags || []).map(flag => {
        const meta = RISK_FLAG_MAP[flag];
        if (!meta) return null;
        return (
          <InfoTip key={flag} content={meta.tip} side="top">
            <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 5px', borderRadius: 4, cursor: 'help', letterSpacing: '0.02em', ...Object.fromEntries(meta.style.split(';').filter(Boolean).map(s => { const [k,v]=s.split(':'); return [k.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()), v?.trim()]; })) }}>
              {meta.label}
            </span>
          </InfoTip>
        );
      })}
    </div>
  );
}

RiskBadges.propTypes = {
  flags: PropTypes.arrayOf(PropTypes.string),
  qualityLabel: PropTypes.string,
};

export default function CandidateTable() {
  const {
    filterQuery, setFilterQuery,
    sortKey, sortDir, setSort,
    selectedSymbol, selectSymbol,
    prefilterEnabled, topN,
    scanning, results,
  } = useScanStore();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const isLoading = scanning;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterQuery]);

  let items = results || [];

  if (filterQuery) {
    items = items.filter(it => (it.Sembol || it.symbol || it.ticker || '').toLowerCase().includes(filterQuery.toLowerCase()));
  }

  if (prefilterEnabled && items.length > 0) {
    items = [...items].sort((a,b) => (Number(b.QRS || b.yzdsh || 0)) - (Number(a.QRS || a.yzdsh || 0))).slice(0, topN);
  }

  const allSorted = [...items].sort((a, b) => {
    const rawA = a[sortKey] !== undefined ? a[sortKey] : (sortKey === 'symbol' ? a.Sembol : (sortKey === 'close' ? a.Fiyat : (sortKey === 'ml' ? a.ML : a.QRS)));
    const rawB = b[sortKey] !== undefined ? b[sortKey] : (sortKey === 'symbol' ? b.Sembol : (sortKey === 'close' ? b.Fiyat : (sortKey === 'ml' ? b.ML : b.QRS)));

    if (sortKey === 'symbol') {
      return sortDir === 'asc' ? String(rawA).localeCompare(String(rawB)) : String(rawB).localeCompare(String(rawA));
    }
    const va = Number(rawA) || 0;
    const vb = Number(rawB) || 0;
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const totalItems = allSorted.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedItems = allSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <aside className="w-full h-full border-l border-outline-variant/10 flex flex-col shrink-0 bg-surface transition-all duration-300 overflow-hidden">
      <div className="p-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline text-sm font-bold tracking-tight uppercase">Aday Listesi</h2>
          <div className="flex gap-2 items-center">
            {scanning && (
              <span className="flex items-center gap-1.5 text-[9px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-full animate-pulse uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                TARANIYOR
              </span>
            )}
            <span className="text-[10px] text-on-surface-variant bg-[#141820] px-2 py-0.5 rounded font-mono">
              {totalItems} HİSSE
            </span>
          </div>
        </div>
        <div className="relative mb-4">
          <input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-[#141820]-low border border-outline-variant/20 rounded-lg px-4 py-2 text-xs focus:ring-1 focus:ring-primary focus:border-primary transition-all text-on-surface"
            placeholder="Hisse Ara..."
            type="text"
          />
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-xs text-outline">search</span>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto terminal-scroll px-6 relative">
        <table className="w-full text-left text-xs table-fixed min-w-[320px]">
          <thead className="sticky top-0 bg-surface z-10 border-b border-outline-variant/10 shadow-sm">
            <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest">
              <th className="py-3 px-1 w-[20%] font-bold cursor-pointer" onClick={() => setSort('symbol')}>Hisse</th>
              <th className="py-3 px-1 w-[20%] font-bold cursor-pointer text-[#00F2FF]" onClick={() => setSort('close')}>Fiyat</th>
              <th className="py-3 px-1 w-[15%] font-medium cursor-pointer hidden sm:table-cell" onClick={() => setSort('change_pct')}>% Değ.</th>
              <th className="py-3 px-1 w-[15%] font-medium hidden lg:table-cell">Hacim</th>
              <th className="py-3 px-1 w-[10%] font-medium hidden xl:table-cell cursor-pointer" onClick={() => setSort('rsi')}>
                <InfoTip content={TERM_TIPS.RSI} side="bottom">
                  <span className="underline decoration-dotted cursor-help">RSI</span>
                </InfoTip>
              </th>
              <th className="py-3 px-1 w-[15%] font-bold cursor-pointer text-right" onClick={() => setSort('ml')}>
                <InfoTip content={TERM_TIPS.ML} side="bottom">
                  <span className="underline decoration-dotted cursor-help">ML</span>
                </InfoTip>
              </th>
              <th className="py-3 px-1 w-[20%] font-bold cursor-pointer text-right" onClick={() => setSort('QRS')}>
                <InfoTip content={TERM_TIPS.QRS} side="bottom">
                  <span className="underline decoration-dotted cursor-help">QRS</span>
                </InfoTip>
              </th>
            </tr>
          </thead>
          {isLoading ? (
            <SkeletonTable rows={10} cols={7} />
          ) : (
          <tbody className="divide-y divide-outline-variant/5">
            {paginatedItems.map((item, idx) => {
              const sym = (item.Sembol || item.symbol || item.ticker || `SYM${idx}`).toString().trim().toUpperCase();
              const isSelected = selectedSymbol && selectedSymbol.toUpperCase() === sym;
              const price = Number(item.Fiyat || item.close || 0).toFixed(2);
              const change = Number(item.Değişim || item.change_pct || 0);
              const volume = Number(item.Hacim || item.volume || 0);
              const rsi = Number(item.RSI || item.rsi || 0).toFixed(1);
              const mlRaw = item.ML ?? item.ml_score ?? item.ml ?? null;
              // ML < 1 pratikte imkansız (model 0-100 üretir); 0 değeri "veri yok" anlamına gelir.
              const mlAvailable = mlRaw !== null && mlRaw !== undefined && Number(mlRaw) >= 1;
              const ml = mlAvailable ? Number(mlRaw) : null;
              const qrs = Number(item.QRS || item.yzdsh || 0);
              const riskFlags = item.risk_flags || [];
              const qualityLabel = item.quality_label || null;
              const trailingStop = item.trailing_stop || null;
              const teknikDirenc = item.teknik_direnc_projeksiyonu || item.target_price || null;
              const stopPrice = item.stop_price || null;
              const riskReward = item.risk_reward || null;
              const dataSource = item.data_source || null;

              return (
                <tr
                  key={sym}
                  onClick={() => selectSymbol(sym, item)}
                  className={`hover:bg-[#141820]-high/40 transition-colors group cursor-pointer border-b border-outline-variant/10 ${isSelected ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                >
                  <td className="py-4 px-1 w-[20%]">
                    <div className="font-bold text-on-surface text-sm truncate">{sym}</div>
                    <RiskBadges flags={riskFlags} qualityLabel={qualityLabel} />
                    {dataSource && (
                      <div className="text-[8px] text-on-surface-variant/30 font-mono mt-0.5 truncate">{dataSource}</div>
                    )}
                  </td>
                  <td className="py-4 px-1 w-[20%]">
                    <div className="font-mono text-[#00F2FF] text-sm">{price}</div>
                    {teknikDirenc && riskFlags.length === 0 && (
                      <InfoTip content={[
                        `Hedef: ₺${Number(teknikDirenc).toFixed(2)}`,
                        stopPrice ? `Stop: ₺${Number(stopPrice).toFixed(2)}` : (trailingStop ? `İz Süren Stop: ₺${Number(trailingStop).toFixed(2)}` : null),
                        riskReward ? `Risk/Ödül: 1:${Number(riskReward).toFixed(2)}` : null,
                      ].filter(Boolean).join(' · ')} side="right">
                        <div style={{ fontSize: 8, color: 'rgba(52,211,153,0.7)', fontWeight: 700, cursor: 'help', marginTop: 2 }}>
                          → ₺{Number(teknikDirenc).toFixed(2)}{riskReward ? ` (R:Ö ${Number(riskReward).toFixed(1)}x)` : ''}
                        </div>
                      </InfoTip>
                    )}
                  </td>
                  <td className={`py-4 px-1 font-mono text-[11px] w-[15%] hidden sm:table-cell ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                  </td>
                  <td className="py-4 px-1 font-mono text-[11px] text-outline-variant hidden lg:table-cell w-[15%]">
                    {volume > 1000000 ? (volume/1000000).toFixed(1)+'M' : volume > 1000 ? (volume/1000).toFixed(0)+'K' : volume}
                  </td>
                  <td className="py-4 px-1 font-mono text-outline hidden xl:table-cell text-[11px] w-[10%]">
                    {rsi > 0 ? rsi : '-'}
                  </td>
                  <td className="py-4 px-1 text-right w-[15%]">
                    {mlAvailable ? (
                      <InfoTip content="ML (Makine Öğrenmesi) Skoru: 86 teknik özellikle eğitilmiş model tahmini." side="top">
                        <span className={`${ml >= 70 ? 'bg-primary/20 text-primary' : ml >= 50 ? 'bg-yellow-400/10 text-yellow-500' : 'bg-surface-variant/40 text-on-surface-variant'} px-2 py-0.5 rounded text-[11px] font-bold font-mono cursor-help`}>
                          {ml.toFixed(1)}
                        </span>
                      </InfoTip>
                    ) : (
                      <InfoTip content="ML modeli bu tarama için kullanılmadı. Skor yalnızca teknik kurallardan türetildi." side="top">
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded text-[9px] font-bold font-mono cursor-help uppercase tracking-wider">
                          KURAL
                        </span>
                      </InfoTip>
                    )}
                  </td>
                  <td className="py-4 px-1 text-right w-[20%]">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`text-[12px] font-bold font-mono ${qrs >= 75 ? 'text-primary' : 'text-on-surface'}`}>
                        {qrs.toFixed(1)}
                      </span>
                      <div className="w-10 h-1.5 bg-[#141820]-highest rounded-full overflow-hidden hidden sm:block">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(qrs, 100)}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginatedItems.length === 0 && !isLoading && !scanning && (
              <tr>
                <td colSpan="7" className="py-10 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-outline-variant/20">radar</span>
                    <p className="text-outline-variant/50 font-mono text-[11px]">Henüz sonuç yok.</p>
                    <p className="text-outline-variant/30 text-[10px]">Terminal sayfasından "Analiz Et" butonuna tıklayın.</p>
                  </div>
                </td>
              </tr>
            )}
            {paginatedItems.length === 0 && scanning && (
              <tr><td colSpan="7" className="py-10 text-center text-primary/60 font-mono text-xs animate-pulse">Tarama sonuçları bekleniyor...</td></tr>
            )}
          </tbody>
          )}
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="p-4 border-t border-outline-variant/10 bg-surface flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-outline-variant/40 tracking-tighter">Satır</span>
            <SearchableSelect
              value={pageSize}
              onChange={val => {
                setPageSize(Number(val));
                setCurrentPage(1);
              }}
              options={[10, 20, 30].map(sz => ({ value: sz, label: String(sz) }))}
              compact={true}
              searchable={false}
              className="w-20"
            />
          </div>
          <span className="text-[10px] font-mono text-on-surface-variant/50">
            {totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, totalItems)} / {totalItems}
          </span>
        </div>

        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="w-8 h-8 rounded bg-[#141820] border border-outline-variant/10 flex items-center justify-center disabled:opacity-20 transition-colors hover:bg-primary/10 hover:text-primary"
            title="İlk Sayfa"
          >
            <span className="material-symbols-outlined text-sm">first_page</span>
          </button>
          
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="w-8 h-8 rounded bg-[#141820] border border-outline-variant/10 flex items-center justify-center disabled:opacity-20 transition-colors hover:bg-primary/10 hover:text-primary"
            title="Önceki"
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          
          <div className="flex gap-1">
            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 3) pageNum = i + 1;
              else if (currentPage === 1) pageNum = i + 1;
              else if (currentPage === totalPages) pageNum = totalPages - 2 + i;
              else pageNum = currentPage - 1 + i;

              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={cn(
                    "w-8 h-8 rounded text-[10px] font-bold border transition-colors",
                    currentPage === pageNum 
                      ? "bg-primary border-primary text-on-primary" 
                      : "bg-[#141820] border-outline-variant/10 hover:bg-[#1a1f28]"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="w-8 h-8 rounded bg-[#141820] border border-outline-variant/10 flex items-center justify-center disabled:opacity-20 transition-colors hover:bg-primary/10 hover:text-primary"
            title="Sonraki"
          >
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>

          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages || totalPages === 0}
            className="w-8 h-8 rounded bg-[#141820] border border-outline-variant/10 flex items-center justify-center disabled:opacity-20 transition-colors hover:bg-primary/10 hover:text-primary"
            title="Son Sayfa"
          >
            <span className="material-symbols-outlined text-sm">last_page</span>
          </button>
        </div>
      </div>

      {/* Compliance disclaimer */}
      <div className="px-4 py-2 border-t border-outline-variant/10 bg-[#0d1117]/60">
        <p className="text-[9px] text-on-surface-variant/30 font-mono leading-relaxed text-center">
          Bu tarama sonuçları yalnızca bilgilendirme amaçlıdır ve yatırım tavsiyesi değildir.
          Veriler gecikmeli olabilir. Tüm kararların sorumluluğu kullanıcıya aittir.
        </p>
      </div>
    </aside>
  );
}
