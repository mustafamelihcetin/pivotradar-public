import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Star, Search, ChevronLeft, ChevronRight, Activity, Sparkles, 
  LayoutGrid, List, Triangle, TrendingUp, Target, Zap, Info, ChevronDown
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api/client';
import { useScanStore } from '@/core/store/useScanStore';
import { InfoTip } from '@/shared/components/InfoTip';
import { TickerLogo, preloadLogos } from '@/shared/components/TickerLogo';
import { cn } from '@/shared/utils/cn';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '@/store/useAuthStore';

const GUEST_LIMIT = 10;

const fmtPrice = v => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVol = v => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Milyar` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} Milyon` : v >= 1e3 ? `${(v / 1e3).toFixed(0)} Bin` : String(v);
const fmtPct = v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

const PATTERN_CATEGORIES = [
  { id: null, label: 'Tümü', icon: Zap },
  { id: 'Üçgen', label: 'Üçgenler', icon: Triangle },
  { id: 'Takoz', label: 'Takozlar', icon: TrendingUp },
  { id: 'Kanal', label: 'Kanallar', icon: Target },
  { id: 'Bayrak/Flama', label: 'Formasyonlar', icon: Sparkles },
];

const PATTERN_COLORS = {
  // Kanallar
  "Yükselen Kanal":   { bg: "bg-cyan-500/10",     text: "text-cyan-400",    icon: "∥" },
  "Alçalan Kanal":    { bg: "bg-orange-500/10",   text: "text-orange-400",  icon: "∥" },
  // Takozlar
  "Alçalan Takoz":    { bg: "bg-emerald-500/10",  text: "text-emerald-400", icon: "⋁" },
  "Yükselen Takoz":   { bg: "bg-rose-500/10",     text: "text-rose-400",    icon: "⋀" },
  // Üçgenler
  "Daralan Üçgen":    { bg: "bg-amber-500/10",    text: "text-amber-400",   icon: "△" },
  "Yükselen Üçgen":   { bg: "bg-cyan-500/10",     text: "text-cyan-400",    icon: "△" },
  "Alçalan Üçgen":    { bg: "bg-orange-500/10",   text: "text-orange-400",  icon: "▽" },
  "Genişleyen Üçgen": { bg: "bg-purple-500/10",   text: "text-purple-400",  icon: "◇" },
  // Baş-omuz
  "Baş Omuz":         { bg: "bg-red-500/10",      text: "text-red-400",     icon: "⌒" },
  "Ters Baş Omuz":    { bg: "bg-emerald-500/10",  text: "text-emerald-400", icon: "⌣" },
  // Çift / Üçlü
  "Çift Tepe":        { bg: "bg-red-500/10",      text: "text-red-400",     icon: "⌢" },
  "Çift Dip":         { bg: "bg-emerald-500/10",  text: "text-emerald-400", icon: "⌣" },
  "Üçlü Tepe":        { bg: "bg-rose-500/10",     text: "text-rose-400",    icon: "⌣" },
  "Üçlü Dip":         { bg: "bg-green-500/10",    text: "text-green-400",   icon: "⌣" },
  // Destek / Direnç
  "Destek Hattı":     { bg: "bg-green-500/10",    text: "text-green-400",   icon: "—" },
  "Direnç Hattı":     { bg: "bg-red-500/10",      text: "text-red-400",     icon: "—" },
  // Konsolidasyon
  "Range/Kutu":       { bg: "bg-slate-500/10",    text: "text-slate-400",   icon: "☐" },
  // Devam formasyonları
  "Bayrak":           { bg: "bg-yellow-500/10",   text: "text-yellow-400",  icon: "⚑" },
  "Flama":            { bg: "bg-yellow-500/10",   text: "text-yellow-400",  icon: "⚑" },
  "Kupa Sap":         { bg: "bg-cyan-500/10",     text: "text-cyan-400",    icon: "∪" },
};

const PATTERN_EXPLANATIONS = {
  "Daralan Üçgen":    "Fiyatın giderek daralan bir bantta sıkıştığını gösteren bu formasyon, piyasadaki kararsızlığın sonuna gelindiğine işaret eder.",
  "Yükselen Üçgen":   "Yatay direnç altında yükselen diplerle oluşan yapı. Üst bandın aşılması güçlü kırılım sinyalidir.",
  "Alçalan Üçgen":    "Yatay destek üzerinde alçalan tepelerle oluşan yapı. Alt bandın kırılması düşüş sinyalidir.",
  "Genişleyen Üçgen": "Genişleyen volatilite koridoru. Yüksek belirsizlik ve sert hareketler beklenir.",
  "Alçalan Takoz":    "Düşüş trendinin sonlarında görülen bu yapı, ayıların güç kaybettiğini temsil eder.",
  "Yükselen Takoz":   "Yükseliş trendinin yorulduğunu ve alıcıların yeni zirveler yapmakta zorlandığını simgeler.",
  "Yükselen Kanal":   "Fiyatın iki paralel yükselen hat arasında ilerlediği yapıdır.",
  "Alçalan Kanal":    "Fiyatın sistematik bir düşüş baskısı altında olduğunu gösterir.",
  "Baş Omuz":         "Üç tepeden oluşan klasik dönüş formasyonu. Boyun çizgisi kırılımı güçlü satış sinyalidir.",
  "Ters Baş Omuz":    "Üç dipten oluşan dönüş formasyonu. Boyun çizgisi kırılımı güçlü alım sinyalidir.",
  "Çift Tepe":        "İki yakın zirve ile oluşan dönüş formasyonu. Destek kırılımı düşüşü teyit eder.",
  "Çift Dip":         "İki yakın dip ile oluşan dönüş formasyonu. Direnç kırılımı yükselişi teyit eder.",
  "Üçlü Tepe":        "Üç başarısız zirve girişimi. Çift Tepeden daha güçlü direnç bölgesi.",
  "Üçlü Dip":         "Üç başarılı destek savunması. Çift Dipten daha güçlü birikim bölgesi.",
  "Range/Kutu":       "Piyasanın yön tayin edemediği, fiyatın yatay bir akümülasyon bölgesinde olduğu durumdur.",
  "Direnç Hattı":     "Satıcıların yoğunlaştığı bir 'psikolojik tavan' seviyesidir.",
  "Destek Hattı":     "Alıcıların fiyatın daha fazla düşmesine izin vermediği hattır.",
  "Bayrak":           "Güçlü hareketten sonra kısa konsolidasyon. Devam formasyonu, kırılım beklenir.",
  "Flama":            "Güçlü hareketten sonra küçük simetrik üçgen. Devam formasyonu.",
  "Kupa Sap":         "U-şeklinde birikim (kupa) ve küçük geri çekilme (sap). Bullish kırılım beklenir.",
};

function PatternBadge({ name, score, desc, compact = false }) {
  if (!name || name === "Formasyon Yok") return null;
  const style = PATTERN_COLORS[name] || { bg: "bg-slate-500/10", text: "text-slate-400", icon: "◇" };
  const confidence = score ? Math.round(score) : null;
  const explanation = PATTERN_EXPLANATIONS[name];

  const content = (
    <div className={cn(
      "flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border border-white/5 transition-all hover:border-white/10 shrink-0",
      style.bg, style.text
    )}>
      <span className="text-[11px] font-black">{style.icon}</span>
      <span className="text-[10px] font-black uppercase tracking-widest">{name}</span>
      {confidence && <span className="text-[9px] font-mono opacity-40 ml-1">{confidence}%</span>}
    </div>
  );

  const tooltipContent = (
    <div className="flex flex-col gap-2.5">
       {desc && <p className="font-bold border-b border-white/5 pb-2">{desc}</p>}
       {explanation && (
         <div className="bg-primary/5 p-2.5 rounded-lg border border-primary/10">
            <p className="text-[11px] leading-relaxed italic text-white/90">{explanation}</p>
         </div>
       )}
    </div>
  );

  if (compact) {
    return (
      <div className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded-md border border-white/5 transition-all hover:scale-110",
        style.bg, style.text
      )}>
        <span className="text-[11px] font-bold leading-none">{style.icon}</span>
      </div>
    );
  }

  return (
    <div className="inline-block">
      <InfoTip content={tooltipContent} side="top">{content}</InfoTip>
    </div>
  );
}

const COLS = [
  { key: 'symbol', label: 'HİSSE', align: 'left', sortable: true, tip: 'Varlık ve QRS Isısı' },
  { key: 'price', label: 'PİYASA', align: 'right', sortable: true, tip: 'Fiyat & Günlük Değişim' },
  { key: 'rsi', label: 'TEKNİK', align: 'right', sortable: true, tip: 'Hacim & Doygunluk (RSI)' },
  { key: 'qrs', label: 'QRS', align: 'right', sortable: true, tip: 'Quant Skor' },
];

function SortArrow({ active, dir }) {
  if (!active) return <span className="opacity-10 text-[7px] ml-1.5 grayscale">↕</span>;
  return (
    <motion.span 
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-[8px] ml-1.5 text-primary"
    >
      {dir === 'asc' ? '▲' : '▼'}
    </motion.span>
  );
}

function TH({ col, sort, onSort }) {
  const isActive = sort.col === col.key;
  const className = cn(
    "text-[8px] font-black uppercase tracking-[0.3em] px-3 py-4 sticky top-0 bg-[#090c12]/95 backdrop-blur-3xl z-30 transition-all border-b border-white/[0.02] text-left",
    isActive ? "text-primary" : "text-white/20",
    col.align === 'right' && "text-right",
    col.sortable ? "cursor-pointer select-none group" : "cursor-default",
    col.key === 'rsi' && "hidden sm:table-cell"
  );

  const inner = (
    <div className={cn("inline-flex items-center gap-2", col.align === 'right' && "flex-row-reverse")}>
      <span>{col.label}</span>
      {col.sortable && <SortArrow active={isActive} dir={sort.dir} />}
    </div>
  );

  return (
    <th className={className} onClick={col.sortable ? () => onSort(col.key) : undefined}>
       {col.tip ? (
         <InfoTip content={<div className="text-[10px] font-medium leading-relaxed">{col.tip}</div>} side="bottom">
            {inner}
         </InfoTip>
       ) : inner}
    </th>
  );
}

function normalizeStr(str) {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/Ç/g, 'c')
    .toLowerCase();
}

export const TickerTable = React.memo(function TickerTable() {
  const navigate = useNavigate();
  const results = useScanStore(s => s.results);
  const scanning = useScanStore(s => s.scanning);
  const hasPerformedInitialScan = useScanStore(s => s.hasPerformedInitialScan);
  const prefilterEnabled = useScanStore(s => s.prefilterEnabled);
  const topN = useScanStore(s => s.topN);
  const filterQuery = useScanStore(s => s.filterQuery);
  const setFilterQuery = useScanStore(s => s.setFilterQuery);
  const selectedSymbol = useScanStore(s => s.selectedSymbol);
  const watchlist = useScanStore(s => s.watchlist);
  const toggleWatchlist = useScanStore(s => s.toggleWatchlist);
  const viewMode = useScanStore(s => s.viewMode);
  const setViewMode = useScanStore(s => s.setViewMode);
  const patternFilter = useScanStore(s => s.patternFilter);
  const setPatternFilter = useScanStore(s => s.setPatternFilter);
  const isGuest = useAuthStore(s => s.isGuest);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const actualIsGuest = isGuest || !isAuthenticated;

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [sort, setSort] = useState({ col: 'qrs', dir: 'desc' });
  const isAnalyzing = useScanStore(s => s.isAnalyzing);
  const scanError = useScanStore(s => s.scanError);
  const isLoading = scanning || isAnalyzing;
  
  useEffect(() => { setPage(1); }, [filterQuery, sort]);

  // Görünür satırlar hazır olduğunda logolarını preload et
  useEffect(() => {
    if (results && results.length > 0) {
      const tickers = results.slice(0, 50).map(it => (it.Sembol || it.symbol || '').replace('.IS', '').trim().toUpperCase());
      preloadLogos(tickers);
    }
  }, [results]);

  const onSort = useCallback((col) => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' });
  }, []);

  const getVal = useCallback((item, col) => {
    switch (col) {
      case 'symbol': return (item.Sembol || item.symbol || '').toLowerCase();
      case 'price': return Number(item.Fiyat || item.close || 0);
      case 'rsi': return Number(item.RSI || item.rsi || 0);
      case 'qrs': return Number(item.QRS || item.yzdsh || 0);
      default: return 0;
    }
  }, []);

  let items = (results || []).filter(it => {
    if (filterQuery) {
      const q = normalizeStr(filterQuery);
      const sym = normalizeStr(it.Sembol || it.symbol || '');
      const name = normalizeStr(it.name || '');
      if (!sym.includes(q) && !name.includes(q)) return false;
    }
    if (viewMode === 'patterns') {
      const pName = (it.pattern_name || '').toLowerCase();
      if (patternFilter) {
        if (!pName.includes(patternFilter.toLowerCase())) return false;
      } else if (!pName || pName === "formasyon yok") return false;
    }
    return true;
  });

  if (prefilterEnabled) items = items.slice(0, Number(topN) || 50);

  items = [...items].sort((a, b) => {
    const va = getVal(a, sort.col), vb = getVal(b, sort.col);
    const primary = sort.dir === 'asc' ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
    if (primary !== 0) return primary;
    return (a.Sembol || a.symbol || '') < (b.Sembol || b.symbol || '') ? -1 : 1;
  });

  const total = items.length;
  const rows = items.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col w-full h-full">
      {/* ── MINIMALIST HUD COMMAND BAR ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 sm:py-2 bg-white/[0.01] border-b border-white/[0.02]">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center p-0.5 bg-black/40 rounded border border-white/5">
            {[
              ['list', List, 'Liste Görünümü'], 
              ['patterns', LayoutGrid, 'Formasyon Radarı']
            ].map(([mode, Icon, tip]) => (
              <InfoTip key={mode} content={tip} side="bottom">
                <button
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "p-1.5 rounded transition-all",
                    viewMode === mode ? "bg-white/10 text-white" : "text-white/15 hover:text-white/30"
                  )}
                >
                  <Icon size={12} />
                </button>
              </InfoTip>
            ))}
          </div>
          <div className="hidden sm:block h-4 w-[1px] bg-white/5 mx-1" />
          <div className="px-3 py-1 rounded-full bg-primary/5 border border-primary/20 text-[9px] font-black text-primary tabular-nums whitespace-nowrap">
            {items.filter(it => it.pattern_name && it.pattern_name !== 'Formasyon Yok').length} <span className="opacity-40 uppercase">AKTİF SİNYAL</span>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
           <div className="relative group flex-1 sm:min-w-[180px]">
             <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/20" />
             <input
               value={filterQuery || ''}
               onChange={e => setFilterQuery(e.target.value)}
               placeholder="HİSSE ARA..."
               className="w-full pl-7 pr-2 py-1.5 bg-white/[0.02] border border-white/5 rounded-lg text-[10px] font-bold text-white/50 outline-none focus:border-primary/30 transition-all focus:bg-white/[0.05]"
             />
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-3 min-h-0 relative">
        {isAnalyzing && rows.length > 0 && (
          <div className="sticky top-2 z-40 flex justify-end pointer-events-none mb-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#090c12]/90 border border-primary/20 text-[8px] font-black text-primary/70 uppercase tracking-widest backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Yenileniyor
            </div>
          </div>
        )}
        {viewMode === 'patterns' ? (
           <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {rows.map((item, idx) => {
                  const sym = (item.Sembol || item.symbol || '').replace('.IS', '').trim().toUpperCase();
                  const isSel = selectedSymbol?.toUpperCase() === sym;
                  return (
                    <motion.div
                      key={sym || idx}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => navigate(`/terminal/${sym}`)}
                      className={cn(
                        "group relative p-3 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col gap-3 h-full overflow-hidden",
                        isSel ? "bg-primary/[0.04] border-primary/40 shadow-[0_0_40px_rgba(34,211,238,0.1)] ring-1 ring-primary/20" : "bg-white/[0.01] border-white/5 hover:border-white/20 hover:bg-white/[0.03]"
                      )}
                    >
                      <div className="flex items-start justify-between flex-wrap gap-2 relative z-10">
                         <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <TickerLogo ticker={sym} size="md" />
                            <div className="flex flex-col min-w-0">
                               <span className={cn("text-[15px] font-black tracking-tight leading-none", isSel ? "text-primary" : "text-white/90")}>{sym}</span>
                               <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em] mt-1 truncate">{item.name || "BIST TERMINAL"}</span>
                            </div>
                         </div>
                         <div className="flex flex-col items-end shrink-0 ml-auto">
                            {Number(item.Fiyat || item.close || 0) > 0 ? (
                              <>
                                <span className="text-[12px] font-black font-mono text-white/80 tabular-nums">₺{fmtPrice(Number(item.Fiyat || item.close || 0))}</span>
                                <span className={cn("text-[9px] font-black font-mono mt-0.5", (item.Değişim || item.change_pct || 0) > 0 ? "text-emerald-400" : "text-red-400")}>{fmtPct(item.Değişim || item.change_pct || 0)}</span>
                              </>
                            ) : (
                              <div className="w-16 h-4 bg-white/5 animate-pulse rounded" />
                            )}
                         </div>
                      </div>
                      <PatternBadge name={item.pattern_name} score={item.pattern_score} desc={item.pattern_desc} />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
           </div>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {COLS.map(col => <TH key={col.key} col={col} sort={sort} onSort={onSort} />)}
              </tr>
            </thead>
                                    <tbody>
              {isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={COLS.length} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative w-10 h-10 flex items-center justify-center">
                        <span className="absolute inset-0 rounded-full bg-primary/[0.06] animate-ping" style={{ animationDuration: '1.6s' }} />
                        <Activity size={20} className="text-primary/50 relative z-10" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-black text-white/40 uppercase tracking-widest">Yükleniyor</p>
                        <p className="text-[9px] text-white/15 font-mono">Veriler hazırlanıyor...</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {scanError && rows.length === 0 && !isLoading && (
                <tr key="scan-error">
                  <td colSpan={COLS.length} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-red-500/[0.07] border border-red-500/15 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px] text-red-400/60">wifi_off</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-black text-red-400/50 uppercase tracking-widest">Bağlantı Hatası</p>
                        <p className="text-[9px] text-white/20 max-w-[180px] mx-auto text-center leading-relaxed">{scanError}</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {rows.length === 0 && !isLoading && !scanError && !hasPerformedInitialScan && (
                <tr key="awaiting">
                  <td colSpan={COLS.length} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px] text-white/15">radar</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-black text-white/25 uppercase tracking-widest">Analiz Bekleniyor</p>
                        <p className="text-[9px] text-white/12 font-mono">Tarama başlatıldığında sonuçlar burada görünür</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {rows.length === 0 && !isLoading && !scanError && hasPerformedInitialScan && (
                <tr key="no-results">
                  <td colSpan={COLS.length} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px] text-white/15">search_off</span>
                      </div>
                      <p className="text-[11px] font-black text-white/20 uppercase tracking-widest">Veri Bulunamadı</p>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((item, idx) => {
                const sym = (item.Sembol || item.symbol || '').replace('.IS', '').trim().toUpperCase();
                const isSel = selectedSymbol?.toUpperCase() === sym;
                const inWatch = watchlist.includes(sym);
                const qrs = Number(item.QRS || item.yzdsh || 0);
                const pName = item.pattern_name || item.pattern;
                const pStyle = (!pName || pName === 'Formasyon Yok') ? null : PATTERN_COLORS[pName];

                return (
                  <tr
                    key={sym || idx}
                    onClick={() => navigate(`/terminal/${sym}`)}
                    className={cn(
                      "group cursor-pointer transition-all duration-300 relative h-14",
                      isSel ? "bg-white/[0.04] z-10 shadow-[0_0_50px_rgba(0,0,0,0.5)] scale-[1.01]" : "hover:bg-white/[0.02]"
                    )}
                  >
                    <td className="px-4 py-0 pl-6 text-left">
                      <div className="relative flex items-center gap-4">
                        <div className={cn(
                          "absolute -left-6 inset-y-0 w-1 transition-all", 
                          isSel ? "bg-primary shadow-[0_0_20px_#22d3ee]" : (pStyle ? pStyle.bg.replace('/10', '/30') : "bg-white/5 group-hover:bg-white/10")
                        )} />
                        <div className="relative flex items-center gap-2.5">
                          {/* DYNAMIC HEATMAP GLOW (PATTERN AWARE) */}
                          <div className={cn(
                             "absolute inset-0 blur-xl opacity-10 transition-all duration-1000",
                             pStyle ? pStyle.bg.replace('bg-', 'bg-').split('/')[0] : (qrs >= 85 ? "bg-primary" : qrs >= 70 ? "bg-cyan-500/50" : "bg-transparent")
                          )} />
                          <TickerLogo ticker={sym} size="sm" className="relative z-10 opacity-80 group-hover:opacity-100 transition-opacity" />
                          <div className="relative flex flex-col items-start text-left">
                             <span className={cn("text-[13px] font-black tracking-tighter leading-none transition-colors", isSel ? "text-primary" : "text-white/90 group-hover:text-white")}>{sym}</span>
                             <div className="flex items-center gap-1.5 mt-1">
                                <button onClick={e=>{e.stopPropagation();if(!actualIsGuest)toggleWatchlist(sym);}}><Star size={8} className={cn(inWatch ? "text-amber-400 fill-amber-400" : "text-white/10")} /></button>
                                {(item.pattern_name || item.pattern) && (() => {
                                   const pName = item.pattern_name || item.pattern;
                                   const isNone = !pName || pName === 'Formasyon Yok';
                                   if (isNone) return <span className="text-[7.5px] font-black text-white/10 uppercase tracking-[0.2em]">{pName}</span>;

                                   const pStyle = PATTERN_COLORS[pName] || { text: "text-primary", bg: "bg-primary/10" };
                                   return (
                                      <div className="flex items-center gap-2">
                                         <div className={cn("w-1 h-1 rounded-full animate-pulse", pStyle.text.replace('text-', 'bg-'))} />
                                         <span className={cn("text-[7.5px] font-black uppercase tracking-[0.2em]", pStyle.text)}>
                                            {pName}
                                         </span>
                                      </div>
                                   );
                                })()}
                             </div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-0 text-right">
                       <div className="flex flex-col items-end gap-0.5">
                          {Number(item.Fiyat || item.close || 0) > 0 ? (
                            <>
                              <span className="text-[12px] font-black font-mono tracking-tighter text-white/90 tabular-nums">{fmtPrice(Number(item.Fiyat || item.close || 0))}</span>
                              <span className={cn("text-[9px] font-bold font-mono leading-none tabular-nums", (item.change_pct || item.Değişim || 0) > 0 ? "text-emerald-400" : "text-red-400")}>{fmtPct(item.change_pct || item.Değişim || 0)}</span>
                            </>
                          ) : (
                            <div className="w-14 h-3.5 bg-white/5 animate-pulse rounded" />
                          )}
                       </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-0 text-right">
                       <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] font-bold font-mono text-white/20 uppercase">{fmtVol(Number(item.Hacim || item.volume || 0))}</span>
                          <div className="flex items-center gap-2">
                             <div className="w-10 h-1 bg-white/5 rounded-full overflow-hidden flex items-center px-0.5">
                                <div className={cn("h-0.5 rounded-full", (item.RSI || item.rsi) >= 70 ? "bg-red-500 shadow-[0_0_4px_#ef4444]" : (item.RSI || item.rsi) <= 30 ? "bg-emerald-500 shadow-[0_0_4px_#10b981]" : "bg-white/20")} style={{ width: `${Math.min(item.RSI || item.rsi || 0, 100)}%` }} />
                             </div>
                             <span className="text-[8px] font-black text-white/20 font-mono">{(item.RSI || item.rsi || 0).toFixed(0)}</span>
                          </div>
                       </div>
                    </td>
                    <td className="px-4 py-0 text-right pr-6">
                       <div className="flex flex-col items-end gap-1 relative">
                          {item.is_ai_verified && <Sparkles size={8} className="absolute -top-1 -right-2 text-primary animate-pulse" />}
                          <span className={cn(
                            "text-[14px] font-black font-mono tracking-tighter leading-none",
                            "text-transparent bg-clip-text",
                            qrs >= 85
                              ? "bg-gradient-to-b from-cyan-300 via-primary to-cyan-500/60 drop-shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                              : qrs >= 70
                              ? "bg-gradient-to-b from-white via-white to-white/40"
                              : "bg-gradient-to-b from-white/50 via-white/40 to-white/20"
                          )}>{qrs.toFixed(1)}</span>
                          <div className="flex items-center gap-1 flex-wrap justify-end">
                            {item.stop_price != null && (
                              <span className="text-[7px] font-black font-mono px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/15 leading-none whitespace-nowrap">
                                ⊘ ₺{fmtPrice(item.stop_price)}
                              </span>
                            )}
                            {item.position_size_pct != null && (
                              <span className="text-[7px] font-black font-mono px-1 py-0.5 rounded bg-white/[0.04] text-white/30 border border-white/5 leading-none whitespace-nowrap">
                                {item.position_size_pct}%
                              </span>
                            )}
                          </div>
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-1.5 border-t border-white/[0.03]">
        <p className="text-[8px] text-white/10 font-mono leading-tight">
          Bu veriler yalnızca bilgilendirme amaçlıdır. Yatırım tavsiyesi değildir. Geçmiş performans gelecek getiriyi garanti etmez.
        </p>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.04] bg-white/[0.01] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-white/15 tabular-nums">
            {total > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} / {total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page === 1} className="p-1.5 rounded-lg disabled:opacity-15 text-white/25 hover:text-white/60 hover:bg-white/[0.04] text-[9px] font-black transition-all">«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg disabled:opacity-15 text-white/25 hover:text-white/60 hover:bg-white/[0.04] transition-all"><ChevronLeft size={13} /></button>
          <div className="hidden sm:flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pg = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
              return (
                <button key={pg} onClick={() => setPage(pg)} className={cn("w-6 h-6 rounded-md text-[9px] font-black transition-all tabular-nums", page === pg ? "bg-primary/15 text-primary border border-primary/25" : "text-white/20 hover:text-white/50 hover:bg-white/[0.04]")}>{pg}</button>
              );
            })}
          </div>
          <button onClick={() => setPage(p => p * pageSize < total ? p + 1 : p)} disabled={page * pageSize >= total} className="p-1.5 rounded-lg disabled:opacity-15 text-white/25 hover:text-white/60 hover:bg-white/[0.04] transition-all"><ChevronRight size={13} /></button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-1.5 rounded-lg disabled:opacity-15 text-white/25 hover:text-white/60 hover:bg-white/[0.04] text-[9px] font-black transition-all">»</button>
        </div>
      </div>
    </div>
  );
});

