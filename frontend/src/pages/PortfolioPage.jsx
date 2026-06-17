// frontend/src/pages/PortfolioPage.jsx
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PageBanner } from '@/shared/components/PageBanner';
import { InfoTip } from '@/shared/components/InfoTip';
import { useScanStore } from '@/core/store/useScanStore';
import useAuthStore from '@/store/useAuthStore';
import { api } from '@/core/api/client';
import { cn } from '@/shared/utils/cn';
import { PortfolioChartPanel } from '@/features/charts/components/PortfolioChartPanel';
import { TrendingUp, TrendingDown, Plus, Trash2, RefreshCw, Star, StarOff, BarChart2, Pencil, Copy, Terminal, ExternalLink, HelpCircle } from 'lucide-react';
import { GuestLockOverlay } from '@/shared/components/GuestLockOverlay';
import { useCtxMenu, CtxMenu, CtxItem, CtxDivider, CtxInfo } from '@/shared/components/ContextMenu';

const STORAGE_KEY = 'pr_portfolio_v1';

// Fallback static BIST symbol list — used when scan results are not yet available
const BIST_SYMBOLS = [
  'THYAO','GARAN','AKBNK','EREGL','ASELS','KCHOL','SISE','TTKOM','BIMAS','SAHOL',
  'TOASO','FROTO','ARCLK','TUPRS','PGSUS','YKBNK','HALKB','VAKBN','ISCTR','ENKAI',
  'TKFEN','PETKM','KOZAL','SASA','DOHOL','AGHOL','BRSAN','CEMTS','CIMSA','CLEBI',
  'DOAS','EKGYO','ENJSA','EREGL','EUPWR','GESAN','GLAXO','GOLTS','GOODY','GSDHO',
  'GUBRF','HEKTS','HMECK','IHLAS','INDES','IPEKE','ISGSY','ISGYO','ISDMR','JANTS',
  'KARSN','KATMR','KERVT','KLNMA','KNFRT','KONYA','KORDS','KRDMD','LOGO','LYKHO',
  'MAVI','MGROS','MPARK','NETAS','NTHOL','ODAS','OTKAR','OYAKC','PARSN','POLHO',
  'PRKAB','QUAGR','RBAY','RGYAS','RYSAS','SELEC','SMRTG','SOKM','TAVHL','TCELL',
  'TKNSA','TMSN','TRCAS','TRGYO','TSKB','TTRAK','TURSG','ULKER','USDTR','VESTL',
  'WINTE','YEOTK','YGYO','YKSLN','ZRGYO','ASUZU','BERA','BRKO','BTCIM','BUCIM',
  'EGEEN','EKIZ','EMKEL','EMNIS','ESCOM','FENER','FMIZP','FORMT','FORTE','FVORI',
  'GEREL','GLDTR','GMTAS','GRSEL','GSRAY','GTHOL','GWIND','HLGYO','HOROZ','IDAS',
  'INTEM','IPMAT','ISATR','ISBIR','ISFIN','ISGSY','ISKUR','ISLTR','ISYAT','IZTAR',
  'KARSN','KERVN','KIMMR','KLSER','KMPUR','KONKA','KOPOL','KOTON','KRDMA','KRDMB',
  'KUTPO','LKMNH','LRSHO','LUKSK','MAGEN','MAKIM','MANAS','MARKA','MEGMT','METUR',
  'MNDRS','MNVRL','MOBTL','MRGYO','MRPAS','MRSHL','NUGYO','NUHCM','OLMIP','ONCSM',
  'ORCAY','ORGE','OSMEN','OSTIM','OTKAR','OYLUM','OZGYO','OZKGY','PARSN','PENGD',
  'PETUN','PGSUS','PINSU','PKART','PLTUR','PMUM','PNLSN','POLHO','POLTK','PRKME',
];


function loadHoldings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveHoldings(h) { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); }

const fmtPrice = v => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct   = v => { const n = Number(v); return `${n >= 0 ? '▲ +' : '▼ '}${n.toFixed(2)}%`; };
const qrsColor = q => q >= 80 ? '#22d3ee' : q >= 65 ? '#67e8f9' : q >= 50 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)';

/* ── Symbol autocomplete input ─────────────────────────────────── */
function SymbolInput({ value, onChange, results }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const suggestions = useMemo(() => {
    if (!value || value.length < 1) return [];
    const q = value.toUpperCase();

    // Build a map from scan results (sym → qrs)
    const qrsMap = {};
    (results || []).forEach(r => {
      const sym = (r.symbol || r.Sembol || '').replace('.IS','').trim().toUpperCase();
      if (sym) qrsMap[sym] = Number(r.yzdsh || r.QRS || 0);
    });

    // Merge: scan result symbols + static list, deduplicated
    const scanSyms = Object.keys(qrsMap);
    const allSyms = [...new Set([...scanSyms, ...BIST_SYMBOLS])];

    return allSyms
      .filter(sym => sym.startsWith(q))
      .map(sym => ({ sym, qrs: qrsMap[sym] || 0 }))
      .sort((a, b) => b.qrs - a.qrs || a.sym.localeCompare(b.sym))
      .slice(0, 10);
  }, [value, results]);

  useEffect(() => {
    const fn = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const pick = useCallback(sym => { onChange(sym); setOpen(false); }, [onChange]);

  const handleKeyDown = e => {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); pick(suggestions[active]?.sym); }
    if (e.key === 'Escape')    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="THYAO"
        value={value}
        onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={{ width: '100%', background: '#0b0e16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '9px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box', letterSpacing: '0.05em', fontWeight: 700 }}
        required
      />
      {open && suggestions.length > 0 && (
        <div className="pr-autocomplete">
          {suggestions.map((s, i) => (
            <div key={s.sym} className={`pr-autocomplete-item${i === active ? ' active' : ''}`}
              onMouseDown={() => pick(s.sym)}>
              <span style={{ fontWeight: 900, letterSpacing: '0.04em' }}>{s.sym}</span>
              {s.qrs > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'monospace', color: qrsColor(s.qrs), fontWeight: 900 }}>QRS {s.qrs.toFixed(0)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Add Holding Modal ──────────────────────────────────────────── */
function EditHoldingModal({ holding, onUpdate, onClose }) {
  const [qty,  setQty]  = useState(String(holding.qty));
  const [cost, setCost] = useState(String(holding.avgCost));

  const handleSubmit = e => {
    e.preventDefault();
    if (!qty || !cost) return;
    onUpdate(holding.id, Number(qty), Number(cost));
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(3,5,9,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, background: '#07090e', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, overflow: 'visible', boxShadow: '0 32px 64px rgba(0,0,0,0.7)' }}
      >
        <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(34,211,238,0.5),transparent)', borderRadius: '20px 20px 0 0' }} />
        <div style={{ padding: '24px 24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 34, height: 34, borderRadius: 4, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#34d399' }}>{holding.symbol.slice(0,2)}</span>
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>{holding.symbol} — Düzenle</h3>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Adet ve ortalama maliyeti güncelleyin.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Adet</label>
              <input type="number" placeholder="100" value={qty} onChange={e => setQty(e.target.value)}
                style={{ width: '100%', background: '#0b0e16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '9px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} required />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Ortalama Maliyet (₺)</label>
              <input type="number" step="0.01" placeholder="35.50" value={cost} onChange={e => setCost(e.target.value)}
                style={{ width: '100%', background: '#0b0e16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '9px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: '8px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                İptal
              </button>
              <button type="submit"
                style={{ flex: 2, padding: '8px', borderRadius: 3, border: 'none', background: '#a78bfa', color: '#1e0a5e', fontSize: 11, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Kaydet
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddHoldingModal({ onAdd, onClose, results, preFill }) {
  const [sym,  setSym]  = useState(preFill?.sym  || '');
  const [qty,  setQty]  = useState('');
  const [cost, setCost] = useState(preFill?.cost ? String(preFill.cost) : '');

  // Auto-fill cost from results
  useEffect(() => {
    if (!sym || sym.length < 2) return;
    const match = (results || []).find(r =>
      (r.symbol || r.Sembol || '').replace('.IS','').trim().toUpperCase() === sym.toUpperCase()
    );
    if (match && !cost) {
      const price = Number(match.close || match.Fiyat || 0);
      if (price > 0) setCost(price.toFixed(2));
    }
  }, [sym, results, cost]); // cost dependency intentional: only fill when empty

  const handleSubmit = e => {
    e.preventDefault();
    const symbol = sym.trim().toUpperCase().replace('.IS', '');
    if (!symbol || !qty || !cost) return;
    onAdd({ id: Date.now(), symbol, qty: Number(qty), avgCost: Number(cost) });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(3,5,9,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, background: '#07090e', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, overflow: 'visible', boxShadow: '0 32px 64px rgba(0,0,0,0.7)' }}
      >
        <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,rgba(34,211,238,0.5),transparent)', borderRadius: '20px 20px 0 0' }} />
        <div style={{ padding: '24px 24px 20px' }}>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', marginBottom: 4 }}>Hisse Ekle</h3>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>BIST sembolü ve pozisyon bilgilerini girin.</p>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Symbol with autocomplete */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <label style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)' }}>Sembol</label>
                <InfoTip content="BIST hisse kodu (örn. THYAO, GARAN). Yazdıkça mevcut sonuçlardan öneri gelir." side="top">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', cursor: 'help' }}>ⓘ</span>
                </InfoTip>
              </div>
              <SymbolInput value={sym} onChange={setSym} results={results} />
            </div>
            {/* Qty */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <label style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)' }}>Adet</label>
                <InfoTip content="Sahip olduğunuz hisse adedi." side="top">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', cursor: 'help' }}>ⓘ</span>
                </InfoTip>
              </div>
              <input type="number" placeholder="100" value={qty} onChange={e => setQty(e.target.value)}
                style={{ width: '100%', background: '#0b0e16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '9px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} required />
            </div>
            {/* Avg Cost */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <label style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)' }}>Ortalama Maliyet (₺)</label>
                <InfoTip content="Hisseyi aldığınız ortalama fiyat. Terminalde taranan son kapanış otomatik doldurulur." side="top">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', cursor: 'help' }}>ⓘ</span>
                </InfoTip>
              </div>
              <input type="number" step="0.01" placeholder="35.50" value={cost} onChange={e => setCost(e.target.value)}
                style={{ width: '100%', background: '#0b0e16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '9px 12px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }} required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: '8px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}>
                İptal
              </button>
              <button type="submit"
                style={{ flex: 2, padding: '8px', borderRadius: 3, border: 'none', background: '#34d399', color: '#003d1f', fontSize: 11, fontWeight: 900, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Portföye Ekle
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function PortfolioPage() {
  const navigate        = useNavigate();
  const { menu: ctxMenu, open: openCtx, openAt, close: closeCtx } = useCtxMenu();

  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const actualIsGuest   = useAuthStore(s => s.isGuest) || !isAuthenticated;
  const results         = useScanStore(s => s.results);
  const watchlist       = useScanStore(s => s.watchlist);
  const toggleWatchlist = useScanStore(s => s.toggleWatchlist);
  const selectSymbol    = useScanStore(s => s.selectSymbol);
  const selectedSymbol  = useScanStore(s => s.selectedSymbol);
  const isAnalyzing     = useScanStore(s => s.isAnalyzing);
  const setAnalyzing    = useScanStore(s => s.setAnalyzing);
  const setResults      = useScanStore(s => s.setResults);
  const setCacheMeta    = useScanStore(s => s.setCacheMeta);
  const profile         = useScanStore(s => s.profile);
  const topN            = useScanStore(s => s.topN);
  
  const hasPerformedInitialScan    = useScanStore(s => s.hasPerformedInitialScan);
  const setHasPerformedInitialScan = useScanStore(s => s.setHasPerformedInitialScan);
  const isProfileSynced            = useScanStore(s => s.isProfileSynced);

  const chartRef        = useRef(null);
  const timerRef        = useRef(null);
  const [deletedItem, setDeletedItem] = useState(null);
  const deletedTimerRef = useRef(null);

  const location = useLocation();

  // Sağ-tık "Portföye ekle" → location.state'ten senkron olarak oku
  const initPreFill = location.state?.addSymbol
    ? { sym: location.state.addSymbol, cost: location.state.addPrice || '' }
    : null;

  const [holdings, setHoldings]   = useState(loadHoldings);
  const [showAdd, setShowAdd]     = useState(!!initPreFill);
  const [addPreFill, setAddPreFill] = useState(initPreFill);
  const [showChart, setShowChart] = useState(false); // Default to false as requested
  const [editTarget, setEditTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('holdings');
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);
  const saveTimerRef = useRef(null);

  // State'i temizle — geri dönünce tekrar açılmasın
  useEffect(() => {
    if (location.state?.addSymbol) {
      window.history.replaceState({}, '');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Replicate analyze logic from DashboardPage
  const runAnalyze = useCallback(async () => {
    if (isAnalyzing) return;
    setAnalyzing(true, 0);
    let prog = 0;
    const tick = () => {
      const inc   = prog < 20 ? 2.5 : prog < 40 ? 1.0 : prog < 60 ? 0.35 : prog < 78 ? 0.18 : 0.08;
      const delay = prog < 20 ? 80  : prog < 40 ? 180 : prog < 60 ? 500  : prog < 78 ? 900  : 1600;
      prog = Math.min(prog + inc, 95);
      setAnalyzing(true, prog);
      if (prog < 95) timerRef.current = setTimeout(tick, delay);
    };
    timerRef.current = setTimeout(tick, 80);
    try {
      const res = await api.analyzeResults(profile, Number(topN) || 100, null);
      if (res.results?.length) {
        setResults(res.results);
        if (res.cache_meta) setCacheMeta(
            res.cache_meta.age_minutes, 
            res.cache_meta.symbol_count, 
            res.cache_meta.data_age_hours, 
            res.cache_meta.data_date,
            res.data_freshness ?? null,
            res.refresh_triggered ?? false,
            res.cache_meta.data_time
        );
      }
    } catch {}
    finally {
      clearTimeout(timerRef.current);
      setAnalyzing(true, 100);
      setTimeout(() => setAnalyzing(false, 0), 600);
    }
  }, [profile, topN, isAnalyzing, setResults, setCacheMeta, setAnalyzing]);

  // AUTO-STABILIZATION: Trigger scan on mount if results are empty
  useEffect(() => {
    // Stage 1: If we have results, we are done
    if (results.length > 0 || hasPerformedInitialScan) return;

    // Stage 2: Trigger if profile is ready (logged in) or if guest
    const isAuthResolved = useAuthStore.getState().isAuthResolved;
    const isAuthenticated = useAuthStore.getState().isAuthenticated;

    if (!isAuthResolved) return;

    if (isAuthenticated) {
        if (isProfileSynced && !hasPerformedInitialScan) {
            runAnalyze();
            setHasPerformedInitialScan(true);
        }
    } else {
        if (!hasPerformedInitialScan) {
            runAnalyze();
            setHasPerformedInitialScan(true);
        }
    }
  }, [results.length, hasPerformedInitialScan, isProfileSynced, runAnalyze, setHasPerformedInitialScan]);

  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(deletedTimerRef.current); }, []);

  // Load portfolio from backend on mount; fallback to localStorage
  useEffect(() => {
    if (actualIsGuest) {
        setPortfolioLoaded(true);
        return;
    }
    api.getPortfolio().then(res => {
      const remote = res?.holdings;
      if (Array.isArray(remote) && remote.length > 0) {
        setHoldings(remote);
        saveHoldings(remote); // sync localStorage too
      }
    }).catch(() => {}).finally(() => setPortfolioLoaded(true));
  }, [actualIsGuest]); // eslint-disable-next-line react-hooks/exhaustive-deps — intentional: only refetch on guest status change

  // Debounced save to backend whenever holdings change (after initial load)
  useEffect(() => {
    saveHoldings(holdings); // always keep localStorage in sync
    if (!portfolioLoaded || actualIsGuest) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.savePortfolio(holdings).catch(() => {});
    }, 1200);
  }, [holdings, portfolioLoaded, actualIsGuest]);

  // Auto-select first holding's symbol for chart — runs once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (holdings.length > 0) {
      selectSymbol(holdings[0].symbol);
    }
  }, []);

  const addHolding = h => {
    setHoldings(prev => {
      const next = [...prev, h];
      // If this is the first holding, select it for chart
      if (prev.length === 0) selectSymbol(h.symbol);
      return next;
    });
  };
  const removeHolding = id => {
    setHoldings(prev => {
      const next = prev.filter(h => h.id !== id);
      if (next.length > 0) selectSymbol(next[0].symbol);
      return next;
    });
  };

  const handleRemove = useCallback((id) => {
    const idx  = holdings.findIndex(h => h.id === id);
    const item = holdings[idx];
    if (!item) return;
    removeHolding(id);
    clearTimeout(deletedTimerRef.current);
    setDeletedItem({ ...item, _idx: idx });
    deletedTimerRef.current = setTimeout(() => setDeletedItem(null), 4500);
  }, [holdings]);

  const handleUndoDelete = useCallback(() => {
    if (!deletedItem) return;
    clearTimeout(deletedTimerRef.current);
    const { _idx, ...item } = deletedItem;
    setHoldings(prev => {
      const next = [...prev];
      next.splice(Math.min(_idx, next.length), 0, item);
      return next;
    });
    setDeletedItem(null);
  }, [deletedItem]);
  const updateHolding = (id, qty, avgCost) => {
    setHoldings(prev => prev.map(h => h.id === id ? { ...h, qty, avgCost } : h));
  };

  const handleSelectAndScroll = useCallback((sym) => {
    selectSymbol(sym);
    setShowChart(true); // Open chart when a symbol is selected
    setTimeout(() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [selectSymbol]);

  // Enrich holdings
  const enriched = useMemo(() => holdings.map(h => {
    const match = results.find(r => (r.symbol || r.Sembol || '').replace('.IS','').trim().toUpperCase() === h.symbol);
    const currentPrice = match ? Number(match.close || match.Fiyat || 0) : null;
    const qrs  = match ? Number(match.yzdsh || match.QRS || 0) : null;
    const rsi  = match ? Number(match.rsi  || match.RSI || 0) : null;
    const pnl  = currentPrice != null ? (currentPrice - h.avgCost) * h.qty : null;
    const pnlPct = currentPrice != null ? ((currentPrice - h.avgCost) / h.avgCost) * 100 : null;
    const value  = currentPrice != null ? currentPrice * h.qty : null;
    return { ...h, currentPrice, qrs, rsi, pnl, pnlPct, value, cost: h.avgCost * h.qty };
  }), [holdings, results]);

  // Watchlist enriched
  const watchlistItems = useMemo(() => watchlist.map(sym => {
    const match = results.find(r => (r.symbol || r.Sembol || '').replace('.IS','').trim().toUpperCase() === sym);
    const price = match ? Number(match.close || match.Fiyat || 0) : null;
    const qrs   = match ? Number(match.yzdsh || match.QRS || 0) : null;
    const chg   = match ? Number(match.change_pct || match.Değişim || 0) : null;
    const rsi   = match ? Number(match.rsi || match.RSI || 0) : null;
    return { sym, price, qrs, chg, rsi };
  }), [watchlist, results]);

  const totals = useMemo(() => {
    const totalCost  = enriched.reduce((s, h) => s + h.cost, 0);
    const totalValue = enriched.reduce((s, h) => s + (h.value ?? h.cost), 0);
    const totalPnl   = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    return { totalCost, totalValue, totalPnl, pnlPct };
  }, [enriched]);

  const dataAvailable = enriched.some(h => h.currentPrice != null && h.currentPrice > 0);

  const handleGeneralCtx = (e) => { e.preventDefault(); openAt(e.clientX, e.clientY, { _type: 'general' }); };

  return (
    <div onContextMenu={handleGeneralCtx} style={{ display:'flex', flexDirection:'column', gap:12, paddingBottom:32, minHeight:'calc(100vh - 80px)', position:'relative' }}>
      {actualIsGuest && (
        <GuestLockOverlay
          title="Kişisel Portföy Takibi"
          description="Kendi favori listenizi oluşturmak ve kâr/zarar durumunuzu anlık takip etmek için ücretsiz üye olun."
        />
      )}

      {/* ── PAGE HEADER ── */}
      <div style={{ background:'#07090e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:4, padding:'14px 18px', display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:12, position:'relative', zIndex:9500 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:3, height:20, borderRadius:2, background:'#34d399', boxShadow:'0 0 8px #34d39966', flexShrink:0 }} />
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, fontWeight:900, color:'#fff', letterSpacing:'0.08em', textTransform:'uppercase' }}>Portföyüm</span>
              {enriched.length > 0 && (
                <span style={{ fontSize:9, fontWeight:900, color:'#34d399', border:'1px solid rgba(52,211,153,0.25)', borderRadius:3, padding:'1px 6px', letterSpacing:'0.1em' }}>{enriched.length} POZİSYON</span>
              )}
            </div>
            <p style={{ fontSize:10, fontFamily:'monospace', color:'rgba(255,255,255,0.2)', marginTop:2 }}>
              {dataAvailable ? `${results.length} hisse verisi aktif — K/Z hesabı çalışıyor` : 'Terminal taraması sonrası fiyat ve K/Z verileri görünür'}
            </p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={() => setShowChart(!showChart)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:3, border:`1px solid ${showChart ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}`, background: showChart ? 'rgba(34,211,238,0.08)' : 'transparent', color: showChart ? '#22d3ee' : 'rgba(255,255,255,0.35)', fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.1em', cursor:'pointer', transition:'all 0.12s' }}>
            <BarChart2 size={12} />
            {showChart ? 'Grafiği Gizle' : 'Grafik'}
          </button>
          <button onClick={() => setShowAdd(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:3, border:'none', background:'#34d399', color:'#003d1f', fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.1em', cursor:'pointer' }}>
            <Plus size={12} />
            Hisse Ekle
          </button>
        </div>
      </div>

      {/* ── SPLIT LAYOUT: chart left / content right (or single col when no chart) ── */}
      <div style={showChart && holdings.length > 0 ? {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 380px',
        gap: 12,
        alignItems: 'start',
      } : {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>

        {/* ── LEFT: sticky chart panel ── */}
        {showChart && holdings.length > 0 && (
          <motion.div
            key="chart-panel"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            ref={chartRef}
            style={{ position: 'sticky', top: 8 }}
          >
            <PortfolioChartPanel
              onClose={() => setShowChart(false)}
              holding={enriched.find(h => h.symbol === selectedSymbol?.toUpperCase())}
            />
          </motion.div>
        )}

        {/* ── RIGHT (or full-width when no chart): summary + tabs + list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

          {/* SUMMARY METRICS */}
          {enriched.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns: showChart ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))', gap:8 }}>
              {[
                { label: 'Toplam Maliyet', value: `₺${fmtPrice(totals.totalCost)}`, color: 'rgba(255,255,255,0.45)' },
                { label: 'Güncel Değer',   value: dataAvailable ? `₺${fmtPrice(totals.totalValue)}` : '—', color: '#22d3ee', tip: 'Son kapanış fiyatına göre portföy değeri.' },
                { label: 'Toplam K/Z',
                  value: dataAvailable ? fmtPct(totals.pnlPct) : '—',
                  sub: dataAvailable ? `₺${fmtPrice(Math.abs(totals.totalPnl))} ${totals.totalPnl >= 0 ? 'kâr' : 'zarar'}` : 'Tarama gerekli',
                  color: totals.totalPnl >= 0 ? '#34d399' : '#f87171',
                  tip: 'Tüm pozisyonların toplam K/Z.' },
                { label: 'Pozisyon', value: `${enriched.length}`, color: '#22d3ee' },
              ].map(c => (
                <div key={c.label} style={{ display:'flex', flexDirection:'column', gap:4, padding:'12px 14px', background:'#07090e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:4 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:2 }}>
                    <span style={{ fontSize:8, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.18em', color:'rgba(255,255,255,0.2)' }}>{c.label}</span>
                    {c.tip && <InfoTip content={c.tip} side="top"><span style={{ fontSize:10, color:'rgba(255,255,255,0.15)', cursor:'help' }}>ⓘ</span></InfoTip>}
                  </div>
                  <p style={{ fontSize:16, fontWeight:900, color:c.color, letterSpacing:'-0.02em' }}>{c.value}</p>
                  {c.sub && <p style={{ fontSize:8, color:'rgba(255,255,255,0.2)', fontFamily:'monospace' }}>{c.sub}</p>}
                </div>
              ))}
            </div>
          )}

          {/* DATA STATUS BANNER */}
          {holdings.length > 0 && !dataAvailable && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, padding:'12px 16px', background:'rgba(251,191,36,0.03)', border:'1px solid rgba(251,191,36,0.12)', borderRadius:4, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:4, background:'rgba(251,191,36,0.07)', border:'1px solid rgba(251,191,36,0.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize:15, color:'#fbbf24' }}>info</span>
                </div>
                <div>
                  <p style={{ fontSize:12, fontWeight:900, color:'rgba(255,255,255,0.75)', marginBottom:2 }}>Güncel fiyat verisi yok</p>
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>K/Z ve QRS verileri terminal taraması sonrası görünür.</p>
                </div>
              </div>
              <button onClick={runAnalyze} disabled={isAnalyzing}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:3, border:'none', background: isAnalyzing ? 'rgba(251,191,36,0.1)' : '#fbbf24', color: isAnalyzing ? 'rgba(251,191,36,0.4)' : '#422006', fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.1em', cursor: isAnalyzing ? 'not-allowed' : 'pointer', flexShrink:0 }}>
                <RefreshCw size={12} style={{ animation: isAnalyzing ? 'spin 1s linear infinite' : 'none' }} />
                {isAnalyzing ? 'Analiz ediliyor…' : 'Analiz Et'}
              </button>
            </div>
          )}

          {/* TABS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#05070a', padding: 3, borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)', width: 'fit-content' }}>
            {[
              { id: 'holdings', label: `Portföy (${enriched.length})` },
              { id: 'watchlist', label: `Takip (${watchlist.length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ padding: '5px 14px', borderRadius: 3, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: activeTab === t.id ? '#34d399' : 'transparent',
                  color: activeTab === t.id ? '#003d1f' : 'rgba(255,255,255,0.3)' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* HOLDINGS TABLE */}
          {activeTab === 'holdings' && (
            <div style={{ padding: enriched.length === 0 ? 0 : 4 }}>
              {enriched.length === 0 ? (
                <div style={{ background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 20px' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 4, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(52,211,153,0.4)' }}>account_balance_wallet</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Portföyünüz boş</p>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>Hisse ekleyerek K/Z takibine başlayın.</p>
                    </div>
                    <button onClick={() => setShowAdd(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 3, border: '1px solid rgba(52,211,153,0.22)', background: 'rgba(52,211,153,0.06)', color: '#34d399', fontSize: 10, fontWeight: 900, cursor: 'pointer', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                      <Plus size={12} />
                      İlk Hisseyi Ekle
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: showChart ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  <AnimatePresence>
                    {enriched.map((h, idx) => {
                      const isSel  = selectedSymbol?.toUpperCase() === h.symbol;
                      const inWatch = watchlist.includes(h.symbol);
                      const pnlColor = h.pnl == null ? 'rgba(255,255,255,0.2)' : h.pnl >= 0 ? '#34d399' : '#f87171';

                      return (
                        <motion.div
                          key={h.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ delay: idx * 0.04 }}
                          onClick={() => handleSelectAndScroll(h.symbol)}
                          onContextMenu={e => openCtx(e, { _type: 'holding', holding: h, inWatch })}
                          style={{
                            position:'relative', display:'flex', flexDirection:'column', gap:12,
                            padding:'14px 16px', borderRadius:4, cursor:'pointer',
                            border: `1px solid ${isSel ? 'rgba(34,211,238,0.35)' : 'rgba(255,255,255,0.07)'}`,
                            background: isSel ? '#0d1320' : '#07090e',
                            transition:'border-color 0.15s, background 0.15s',
                          }}
                        >
                          {/* Top row: symbol + star */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ width:36, height:36, borderRadius:3, background: isSel ? 'rgba(34,211,238,0.08)' : 'rgba(255,255,255,0.03)', border:`1px solid ${isSel ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <span style={{ fontSize:10, fontWeight:900, letterSpacing:'0.08em', color: isSel ? '#22d3ee' : 'rgba(255,255,255,0.5)' }}>{h.symbol.slice(0,3)}</span>
                              </div>
                              <div>
                                <p style={{ fontSize:15, fontWeight:900, color:'#fff', letterSpacing:'-0.01em' }}>{h.symbol}</p>
                                <p style={{ fontSize:9, color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', marginTop:2 }}>{h.qty} ADET · ₺{fmtPrice(h.avgCost)}</p>
                              </div>
                            </div>
                            <div onClick={e => e.stopPropagation()}>
                              <button onClick={() => toggleWatchlist(h.symbol)}
                                style={{ width:28, height:28, borderRadius:3, border:`1px solid ${inWatch ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.07)'}`, background: inWatch ? 'rgba(251,191,36,0.08)' : 'transparent', color: inWatch ? '#fbbf24' : 'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                                <Star size={12} fill={inWatch ? "currentColor" : "none"} />
                              </button>
                            </div>
                          </div>

                          {/* Metric row */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                            <div style={{ padding:'10px 12px', borderRadius:3, background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.04)' }}>
                              <p style={{ fontSize:8, fontWeight:900, color:'rgba(255,255,255,0.2)', textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:4 }}>GÜNCEL DEĞER</p>
                              <p style={{ fontSize:15, fontWeight:900, fontFamily:'monospace', color:'#22d3ee', letterSpacing:'-0.02em' }}>
                                {h.currentPrice != null ? `₺${fmtPrice(h.currentPrice)}` : '—'}
                              </p>
                            </div>
                            <div style={{ padding:'10px 12px', borderRadius:3, background: h.pnl == null ? 'rgba(0,0,0,0.25)' : h.pnl >= 0 ? 'rgba(52,211,153,0.05)' : 'rgba(248,113,113,0.05)', border:`1px solid ${h.pnl == null ? 'rgba(255,255,255,0.04)' : h.pnl >= 0 ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)'}` }}>
                              <p style={{ fontSize:8, fontWeight:900, color:'rgba(255,255,255,0.2)', textTransform:'uppercase', letterSpacing:'0.18em', marginBottom:4 }}>KÂR / ZARAR</p>
                              <p style={{ fontSize:15, fontWeight:900, fontFamily:'monospace', color: h.pnl == null ? 'rgba(255,255,255,0.2)' : h.pnl >= 0 ? '#34d399' : '#f87171', letterSpacing:'-0.02em' }}>
                                {h.pnlPct != null ? fmtPct(h.pnlPct) : '—'}
                              </p>
                            </div>
                          </div>

                          {/* Footer: badges + actions */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              {h.qrs != null && (
                                <span style={{ fontSize:9, fontWeight:900, fontFamily:'monospace', color:'#22d3ee', border:'1px solid rgba(34,211,238,0.18)', borderRadius:3, padding:'1px 6px', letterSpacing:'0.08em' }}>QRS {h.qrs.toFixed(0)}</span>
                              )}
                              {h.rsi != null && (
                                <span style={{ fontSize:9, fontWeight:900, fontFamily:'monospace', color: h.rsi > 70 ? '#f87171' : h.rsi < 30 ? '#34d399' : 'rgba(255,255,255,0.45)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:3, padding:'1px 6px', letterSpacing:'0.08em' }}>RSI {Math.round(h.rsi)}</span>
                              )}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:4 }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => setEditTarget(h)} style={{ width:26, height:26, borderRadius:3, border:'1px solid rgba(255,255,255,0.06)', background:'transparent', color:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleRemove(h.id)} style={{ width:26, height:26, borderRadius:3, border:'1px solid rgba(255,255,255,0.06)', background:'transparent', color:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }} title="Portföyden çıkar">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* WATCHLIST TAB */}
          {activeTab === 'watchlist' && (
            <div style={{ padding: watchlist.length === 0 ? 0 : 4 }}>
              {watchlist.length === 0 ? (
                <div style={{ background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '48px 20px' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 4, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Star size={18} style={{ color: 'rgba(251,191,36,0.4)' }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>Takip listeniz boş</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>Terminal'de ya da portföyde ★ ikonuna tıklayarak hisse ekleyin.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: showChart ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  <AnimatePresence>
                    {watchlistItems.map((w, i) => {
                      const isSel = selectedSymbol?.toUpperCase() === w.sym;
                      return (
                        <motion.div key={w.sym} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                          style={{
                            display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 4,
                            border: `1px solid ${isSel ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.07)'}`,
                            background: isSel ? '#100e05' : '#07090e', cursor: 'pointer', transition: 'border-color 0.15s',
                          }}
                          onClick={() => handleSelectAndScroll(w.sym)}>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 3, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Star size={14} style={{ color: '#fbbf24' }} fill="#fbbf24" />
                              </div>
                              <div>
                                <p style={{ fontSize: 14, fontWeight: 900, color: isSel ? '#fbbf24' : '#fff' }}>{w.sym}</p>
                                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2, letterSpacing:'0.08em' }}>TAKİP LİSTESİ</p>
                              </div>
                            </div>
                            <button onClick={e => { e.stopPropagation(); toggleWatchlist(w.sym); }}
                              style={{ width: 26, height: 26, borderRadius: 3, border: '1px solid rgba(251,191,36,0.18)', background: 'rgba(251,191,36,0.05)', color: '#fbbf24', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              title="Takipten Çıkar">
                              <StarOff size={12} />
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6 }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 3, padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(255,255,255,0.04)' }}>
                              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Güncel</span>
                              <span style={{ fontSize: 13, fontWeight: 900, fontFamily: 'monospace', color: '#22d3ee' }}>{w.price ? `₺${fmtPrice(w.price)}` : '—'}</span>
                            </div>
                            {w.chg != null && (
                              <div style={{ background: w.chg >= 0 ? 'rgba(52,211,153,0.07)' : 'rgba(248,113,113,0.07)', borderRadius: 3, padding: '8px 12px', border: `1px solid ${w.chg >= 0 ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 12, fontWeight: 900, fontFamily: 'monospace', color: w.chg >= 0 ? '#34d399' : '#f87171' }}>{fmtPct(w.chg)}</span>
                              </div>
                            )}
                          </div>

                          {w.qrs != null && (
                            <div style={{ background: 'rgba(34,211,238,0.04)', borderRadius: 3, padding: '7px 10px', border: '1px solid rgba(34,211,238,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>QRS</span>
                              <span style={{ fontSize: 13, fontWeight: 900, fontFamily: 'monospace', color: qrsColor(w.qrs) }}>{w.qrs.toFixed(0)}</span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

        </div>{/* end right column */}
      </div>{/* end split layout */}

      {/* ── GENEL CONTEXT MENU (boş alan) ── */}
      {ctxMenu?.data?._type === 'general' && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtx}
          header={<span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.12em' }}>PORTFÖY</span>}
        >
          <CtxItem icon={<Plus size={11}/>} label="Hisse ekle" accent="#34d399" onClick={() => { setShowAdd(true); closeCtx(); }} />
          <CtxDivider />
          <CtxItem icon={<Terminal size={11}/>} label="Terminal'e git" onClick={() => { navigate('/terminal'); closeCtx(); }} />
          <CtxItem icon={<RefreshCw size={11}/>} label="Sayfayı tazele" onClick={() => { window.location.reload(); }} />
          <CtxDivider />
          <CtxItem icon={<HelpCircle size={11}/>} label="Yardım" onClick={() => { navigate('/help'); closeCtx(); }} />
        </CtxMenu>
      )}

      {/* ── HOLDING CONTEXT MENU ── */}
      {ctxMenu?.data?._type === 'holding' && (() => {
        const { holding: h, inWatch } = ctxMenu.data;
        const copy = (v) => { navigator.clipboard?.writeText(String(v)).catch(() => {}); closeCtx(); };
        const fmt  = (v) => v != null ? `₺${Number(v).toFixed(2)}` : null;
        const pnlLabel = h.pnlPct != null
          ? `${h.pnlPct >= 0 ? '+' : ''}${h.pnlPct.toFixed(2)}% K/Z`
          : null;
        return (
          <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtx}
            header={
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: 'monospace', letterSpacing: '0.06em' }}>{h.symbol}</span>
                  {pnlLabel && <span style={{ fontSize: 10, fontWeight: 700, color: h.pnlPct >= 0 ? '#34d399' : '#f87171' }}>{pnlLabel}</span>}
                  {h.currentPrice != null && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>{fmt(h.currentPrice)}</span>}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{h.qty} adet · maliyet {fmt(h.avgCost)}</div>
              </div>
            }
          >
            <CtxItem icon={<Copy size={11}/>} label={`Ticker kopyala  (${h.symbol})`} onClick={() => copy(h.symbol)} />
            {h.currentPrice != null && <CtxItem icon={<Copy size={11}/>} label={`Fiyatı kopyala  (${fmt(h.currentPrice)})`} onClick={() => copy(h.currentPrice.toFixed(2))} />}
            <CtxDivider />
            <CtxItem icon={<Terminal size={11}/>} label="Terminal'de aç" onClick={() => { navigate(`/terminal/${h.symbol}`); closeCtx(); }} />
            <CtxDivider />
            <CtxItem icon={<Star size={11} fill={inWatch ? '#fbbf24' : 'none'} color={inWatch ? '#fbbf24' : 'currentColor'}/>}
              label={inWatch ? 'İzlemeden çıkar' : 'İzleme listesine ekle'}
              accent={inWatch ? '#fbbf24' : null}
              onClick={() => { toggleWatchlist(h.symbol); closeCtx(); }} />
            <CtxDivider />
            <CtxItem icon={<Pencil size={11}/>} label="Pozisyonu düzenle" onClick={() => { setEditTarget(h); closeCtx(); }} />
            <CtxItem icon={<Trash2 size={11}/>} label="Portföyden çıkar" danger onClick={() => { handleRemove(h.id); closeCtx(); }} />
            {(h.qrs != null || h.rsi != null) && (
              <>
                <CtxDivider />
                {h.qrs  != null && <CtxInfo color="#22d3ee" label={`QRS ${h.qrs.toFixed(0)}`} sub="Kalite & relatif güç skoru" />}
                {h.rsi  != null && <CtxInfo color={h.rsi > 70 ? '#f87171' : h.rsi < 30 ? '#34d399' : '#94a3b8'} label={`RSI ${Math.round(h.rsi)}`} sub={h.rsi > 70 ? 'Aşırı alım' : h.rsi < 30 ? 'Aşırı satım' : 'Nötr'} />}
              </>
            )}
          </CtxMenu>
        );
      })()}

      {/* ── SİLME GERİ AL TOAST ── */}
      <AnimatePresence>
        {deletedItem && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#0d1118', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.7)', whiteSpace: 'nowrap' }}
          >
            <Trash2 size={13} style={{ color: '#f87171', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
              <b style={{ color: '#fff' }}>{deletedItem.symbol}</b> portföyden çıkarıldı
            </span>
            <button onClick={handleUndoDelete}
              style={{ padding: '4px 12px', borderRadius: 5, border: '1px solid rgba(34,211,238,0.35)', background: 'rgba(34,211,238,0.08)', color: '#22d3ee', fontSize: 11, fontWeight: 900, cursor: 'pointer', letterSpacing: '0.06em', flexShrink: 0 }}>
              GERİ AL
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ADD MODAL ── */}
      <AnimatePresence>
        {showAdd && <AddHoldingModal onAdd={addHolding} onClose={() => { setShowAdd(false); setAddPreFill(null); }} results={results} preFill={addPreFill} />}
      </AnimatePresence>

      {/* ── EDIT MODAL ── */}
      <AnimatePresence>
        {editTarget && (
          <EditHoldingModal
            holding={editTarget}
            onUpdate={updateHolding}
            onClose={() => setEditTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
