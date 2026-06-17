import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/core/api/client';
import { useScanStore } from '@/core/store/useScanStore';
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, ExternalLink, Copy, Star, Briefcase, Terminal, HelpCircle } from 'lucide-react';
import { useCtxMenu, CtxMenu, CtxItem, CtxDivider, CtxInfo } from '@/shared/components/ContextMenu';

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return m;
}

const mono = "'IBM Plex Mono','Fira Mono',monospace";
const G    = '#22c55e';
const R    = '#ef4444';
const CYAN = '#22d3ee';
const CARD = '#07090e';
const BD   = 'rgba(255,255,255,0.07)';
const w    = (a) => `rgba(255,255,255,${a})`;

const pctColor = (p) => p >= 0.05 ? G    : p <= -0.05 ? R    : w(0.35);
const pctBg    = (p) => p >= 0.05 ? 'rgba(34,197,94,0.08)'  : p <= -0.05 ? 'rgba(239,68,68,0.08)'  : 'transparent';
const pctBd    = (p) => p >= 0.05 ? 'rgba(34,197,94,0.28)'  : p <= -0.05 ? 'rgba(239,68,68,0.28)'  : BD;
const fmt      = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/* ── Sektör kartı ─────────────────────────────────────────── */
function SectorCard({ sector, active, onClick }) {
  const [hov, setHov] = useState(false);
  const p = sector.avg_change;

  return (
    <div
      onClick={() => onClick(sector)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:   active ? pctBg(p) : hov ? w(0.025) : CARD,
        border:       `1px solid ${active ? pctBd(p) : hov ? w(0.11) : BD}`,
        borderRadius: 6,
        padding:      '14px 16px',
        cursor:       'pointer',
        transition:   'all 0.12s ease',
        display:      'flex',
        flexDirection: 'column',
        gap:          10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: active ? w(0.65) : w(0.42), fontFamily: mono, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {sector.name}
          </div>
          <div style={{ fontSize: 9, color: w(0.2), fontFamily: mono, marginTop: 3 }}>
            {sector.count} hisse
          </div>
        </div>
        <div style={{ fontSize: 19, fontWeight: 900, color: pctColor(p), fontFamily: mono, lineHeight: 1 }}>
          {p > 0 ? '▲ ' : p < 0 ? '▼ ' : ''}{fmt(p)}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', gap: 1 }}>
          {sector.up   > 0 && <div style={{ flex: sector.up,   background: G, opacity: 0.65 }} />}
          {sector.flat > 0 && <div style={{ flex: sector.flat, background: w(0.1) }} />}
          {sector.down > 0 && <div style={{ flex: sector.down, background: R, opacity: 0.65 }} />}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 9, color: G,     fontFamily: mono }}>{sector.up}↑</span>
          <span style={{ fontSize: 9, color: w(0.2), fontFamily: mono }}>{sector.flat}→</span>
          <span style={{ fontSize: 9, color: R,     fontFamily: mono }}>{sector.down}↓</span>
        </div>
      </div>
    </div>
  );
}

/* ── Hisse satırı ─────────────────────────────────────────── */
function StockRow({ stock, navigate, onCtx }) {
  const [hov, setHov] = useState(false);
  const p = stock.change_pct;
  return (
    <div
      onClick={() => navigate(`/terminal/${stock.symbol}`)}
      onContextMenu={e => onCtx?.(e, { _type: 'stock', ...stock })}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 16px', cursor: 'pointer',
        background: hov ? w(0.03) : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: w(0.82), fontFamily: mono, minWidth: 60 }}>{stock.symbol}</span>
      <span style={{ fontSize: 12, fontWeight: 900, color: pctColor(p), fontFamily: mono, marginLeft: 'auto' }}>{p > 0 ? '▲ ' : p < 0 ? '▼ ' : ''}{fmt(p)}</span>
      <span style={{ fontSize: 10, color: w(0.28), fontFamily: mono, minWidth: 54, textAlign: 'right' }}>
        {stock.close > 0 ? `₺${stock.close.toFixed(2)}` : ''}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 800, fontFamily: mono,
        color: stock.qrs_score >= 70 ? CYAN : w(0.28),
        minWidth: 28, textAlign: 'right',
      }}>
        {stock.qrs_score}
      </span>
      <ExternalLink size={10} style={{ color: hov ? w(0.45) : w(0.14), flexShrink: 0 }} />
    </div>
  );
}

/* ── Sektör detay paneli ──────────────────────────────────── */
function SectorDetail({ sector, navigate, onClose, onCtx }) {
  const p = sector.avg_change;
  return (
    <div style={{
      background: CARD, border: `1px solid ${pctBd(p)}`,
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '13px 18px', borderBottom: `1px solid ${BD}`,
        background: pctBg(p),
      }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: w(0.85), fontFamily: mono, letterSpacing: '0.06em' }}>
          {sector.name}
        </span>
        <span style={{ fontSize: 20, fontWeight: 900, color: pctColor(p), fontFamily: mono }}>{fmt(p)}</span>
        <span style={{ fontSize: 10, color: w(0.28), fontFamily: mono }}>{sector.count} hisse</span>
        <div style={{ flex: 1 }} />
        {[
          { l: 'Yükselen', v: sector.up,      c: G    },
          { l: 'Yatay',    v: sector.flat,    c: w(0.3) },
          { l: 'Düşen',    v: sector.down,    c: R    },
          { l: 'Ort. QRS', v: sector.avg_qrs, c: CYAN },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ textAlign: 'center', minWidth: 52 }}>
            <div style={{ fontSize: 9, color: w(0.22), fontFamily: mono, letterSpacing: '0.09em', textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: c, fontFamily: mono }}>{v}</div>
          </div>
        ))}
        <button onClick={onClose} style={{
          marginLeft: 8, fontSize: 10, color: w(0.35), background: w(0.04),
          border: `1px solid ${BD}`, borderRadius: 4, padding: '5px 12px',
          cursor: 'pointer', fontFamily: mono,
        }}>Kapat</button>
      </div>

      <div style={{ display: 'flex' }}>
        {sector.top_gainers?.length > 0 && (
          <div style={{ flex: 1, borderRight: `1px solid ${BD}` }}>
            <div style={{ padding: '10px 16px 6px', fontSize: 9, fontWeight: 900, color: G, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: mono }}>
              Güçlü
            </div>
            {sector.top_gainers.map(s => <StockRow key={s.symbol} stock={s} navigate={navigate} onCtx={onCtx} />)}
          </div>
        )}
        {sector.top_losers?.length > 0 && (
          <div style={{ flex: 1 }}>
            <div style={{ padding: '10px 16px 6px', fontSize: 9, fontWeight: 900, color: R, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: mono }}>
              Zayıf
            </div>
            {sector.top_losers.map(s => <StockRow key={s.symbol} stock={s} navigate={navigate} onCtx={onCtx} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ana sayfa ────────────────────────────────────────────── */
export default function MarketPage() {
  const navigate        = useNavigate();
  const isMobile        = useIsMobile();
  const watchlist       = useScanStore(s => s.watchlist);
  const toggleWatchlist = useScanStore(s => s.toggleWatchlist);
  const { menu: ctxMenu, open: openCtx, openAt, close: closeCtx } = useCtxMenu();

  const [activeSector, setActiveSector] = useState(null);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey:  ['marketOverview'],
    queryFn:   api.marketOverview,
    staleTime: 300_000,
    retry:     1,
  });

  const sectors  = data?.sectors     || [];
  const breadth  = data?.breadth     || {};
  const gainers  = data?.top_gainers || [];
  const losers   = data?.top_losers  || [];
  const scanDate = data?.scan_date;

  const dir = (breadth.avg_change || 0) >=  0.1 ? { label: 'YÜKSELİŞ', c: G }
            : (breadth.avg_change || 0) <= -0.1 ? { label: 'DÜŞÜŞ',    c: R }
            : { label: 'YATAY', c: w(0.38) };

  const toggle = (s) => setActiveSector(prev => prev?.key === s.key ? null : s);

  const handleGeneralCtx = (e) => { e.preventDefault(); openAt(e.clientX, e.clientY, { _type: 'general' }); };

  return (
    <div onContextMenu={handleGeneralCtx} style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        padding: '11px 16px', background: CARD,
        border: `1px solid ${BD}`, borderRadius: 6,
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: w(0.85), letterSpacing: '0.1em', fontFamily: mono }}>
            PİYASA DURUMU
          </div>
          <div style={{ fontSize: 9, color: w(0.22), marginTop: 2, fontFamily: mono }}>
            {scanDate ? `Tarama: ${scanDate}` : 'Sektör nabzı · 5 dk cache'}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {data?.source === 'live' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: dir.c, boxShadow: `0 0 7px ${dir.c}` }} />
            <span style={{ fontSize: 10, fontWeight: 900, color: dir.c, fontFamily: mono, letterSpacing: '0.1em' }}>
              {dir.label}
            </span>
          </div>
        )}
        <button onClick={() => refetch()} disabled={isFetching} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
          borderRadius: 4, cursor: 'pointer', background: w(0.04), border: `1px solid ${BD}`,
          color: w(0.38), fontFamily: mono,
        }}>
          <RefreshCw size={11} style={{ animation: isFetching ? 'spin 0.8s linear infinite' : 'none' }} />
          <span style={{ fontSize: 10 }}>Yenile</span>
        </button>
      </div>

      {/* ── Hata ── */}
      {isError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: CARD, border: `1px solid ${BD}`, borderRadius: 6, flexShrink: 0 }}>
          <AlertCircle size={16} style={{ color: R, opacity: 0.6 }} />
          <span style={{ fontSize: 12, color: w(0.4), fontFamily: mono }}>Piyasa verisi yüklenemedi.</span>
          <button onClick={() => refetch()} style={{ fontSize: 10, color: CYAN, background: 'none', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 3, padding: '3px 10px', cursor: 'pointer', fontFamily: mono }}>
            Tekrar Dene
          </button>
        </div>
      )}

      {!isError && sectors.length === 0 && !isFetching && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, background: CARD, border: `1px solid ${BD}`, borderRadius: 6 }}>
          <span style={{ fontSize: 12, color: w(0.25), fontFamily: mono }}>Henüz tarama verisi yok.</span>
        </div>
      )}

      {sectors.length > 0 && (<>

        {/* ── 4 İstatistik ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 8, flexShrink: 0 }}>
          {[
            { label: 'YÜKSELEN',    value: breadth.up,   color: G,    sub: `${breadth.total} hisseden` },
            { label: 'DÜŞEN',      value: breadth.down, color: R,    sub: `%${Math.round((breadth.down / breadth.total) * 100)} düşüşte` },
            { label: 'ORT. DEĞİŞİM', value: fmt(breadth.avg_change || 0), color: pctColor(breadth.avg_change || 0), sub: 'tüm hisselerin ortalaması' },
            { label: 'ORT. QRS',   value: breadth.avg_qrs, color: breadth.avg_qrs >= 65 ? CYAN : w(0.72), sub: `Güçlü: ${breadth.qrs_strong} · Zayıf: ${breadth.qrs_weak}` },
          ].map(({ label, value, color, sub }) => (
            <div key={label} style={{ flex: 1, background: CARD, border: `1px solid ${BD}`, borderRadius: 6, padding: '13px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: w(0.26), letterSpacing: '0.13em', marginBottom: 7, fontFamily: mono }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1, fontFamily: mono }}>{value}</div>
              <div style={{ fontSize: 10, color: w(0.2), marginTop: 5, fontFamily: mono }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* ── Genel piyasa breadth barı ── */}
        <div style={{
          display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1, flexShrink: 0,
        }}>
          <div style={{ flex: breadth.up,   background: G, opacity: 0.55 }} />
          <div style={{ flex: breadth.flat, background: w(0.1) }} />
          <div style={{ flex: breadth.down, background: R, opacity: 0.55 }} />
        </div>

        {/* ── Sektörler ── */}
        <div style={{ background: CARD, border: `1px solid ${BD}`, borderRadius: 6, padding: '14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: w(0.26), letterSpacing: '0.15em', fontFamily: mono }}>
              SEKTÖRLER
            </span>
            {activeSector && (
              <button onClick={() => setActiveSector(null)} style={{
                marginLeft: 12, fontSize: 9, color: w(0.3), background: w(0.04),
                border: `1px solid ${BD}`, borderRadius: 3, padding: '2px 9px',
                cursor: 'pointer', fontFamily: mono,
              }}>× Seçimi Kaldır</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 9, color: w(0.15), fontFamily: mono }}>
              Tıkla → detay
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 6 }}>
            {sectors.map(s => (
              <SectorCard key={s.key} sector={s} active={activeSector?.key === s.key} onClick={toggle} />
            ))}
          </div>
        </div>

        {/* ── Sektör detayı ── */}
        {activeSector && (
          <SectorDetail
            sector={activeSector}
            navigate={navigate}
            onClose={() => setActiveSector(null)}
            onCtx={openCtx}
          />
        )}

        {/* ── Günün öne çıkanları ── */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, flex: 1, minHeight: isMobile ? 'auto' : 0 }}>
          {gainers.length > 0 && (
            <div style={{ flex: 1, background: CARD, border: `1px solid ${BD}`, borderRadius: 6, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
                <TrendingUp size={12} style={{ color: G }} />
                <span style={{ fontSize: 9, fontWeight: 900, color: G, letterSpacing: '0.15em', fontFamily: mono }}>
                  GÜNÜN YÜKSELENLERİ
                </span>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {gainers.map(s => <StockRow key={s.symbol} stock={s} navigate={navigate} onCtx={openCtx} />)}
              </div>
            </div>
          )}
          {losers.length > 0 && (
            <div style={{ flex: 1, background: CARD, border: `1px solid ${BD}`, borderRadius: 6, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
                <TrendingDown size={12} style={{ color: R }} />
                <span style={{ fontSize: 9, fontWeight: 900, color: R, letterSpacing: '0.15em', fontFamily: mono }}>
                  GÜNÜN DÜŞENLERİ
                </span>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {losers.map(s => <StockRow key={s.symbol} stock={s} navigate={navigate} onCtx={openCtx} />)}
              </div>
            </div>
          )}
        </div>

      </>)}

      {/* ── GENEL CONTEXT MENU ── */}
      {ctxMenu?.data?._type === 'general' && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtx}
          header={<span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.12em' }}>PİYASA</span>}
        >
          <CtxItem icon={<RefreshCw size={11}/>} label="Piyasa verisini yenile" onClick={() => { window.location.reload(); }} />
          <CtxDivider />
          <CtxItem icon={<Terminal size={11}/>} label="Terminal'e git" onClick={() => { navigate('/terminal'); closeCtx(); }} />
          <CtxItem icon={<Briefcase size={11}/>} label="Portföyüme git" onClick={() => { navigate('/portfolio'); closeCtx(); }} />
          <CtxDivider />
          <CtxItem icon={<HelpCircle size={11}/>} label="Yardım" onClick={() => { navigate('/help'); closeCtx(); }} />
        </CtxMenu>
      )}

      {/* ── STOCK CONTEXT MENU ── */}
      {ctxMenu?.data?._type === 'stock' && (() => {
        const s = ctxMenu.data;
        const isWatched = watchlist.includes(s.symbol);
        const copy = (v) => { navigator.clipboard?.writeText(String(v)).catch(() => {}); closeCtx(); };
        const fmtP = (v) => v > 0 ? `₺${v.toFixed(2)}` : null;
        return (
          <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtx}
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: mono, letterSpacing: '0.06em' }}>{s.symbol}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: pctColor(s.change_pct) }}>{fmt(s.change_pct)}</span>
                {s.close > 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: mono }}>{fmtP(s.close)}</span>}
              </div>
            }
          >
            <CtxItem icon={<Copy size={11}/>} label={`Ticker kopyala  (${s.symbol})`} onClick={() => copy(s.symbol)} />
            {s.close > 0 && <CtxItem icon={<Copy size={11}/>} label={`Fiyat kopyala  (${fmtP(s.close)})`} onClick={() => copy(s.close.toFixed(2))} />}
            <CtxDivider />
            <CtxItem icon={<Terminal size={11}/>} label="Terminal'de aç" onClick={() => { navigate(`/terminal/${s.symbol}`); closeCtx(); }} />
            <CtxItem icon={<Briefcase size={11}/>} label="Portföye ekle..." onClick={() => { navigate('/portfolio', { state: { addSymbol: s.symbol, addPrice: s.close > 0 ? s.close.toFixed(2) : '' } }); closeCtx(); }} />
            <CtxDivider />
            <CtxItem icon={<Star size={11} fill={isWatched ? '#fbbf24' : 'none'} color={isWatched ? '#fbbf24' : 'currentColor'}/>}
              label={isWatched ? 'İzlemeden çıkar' : 'İzleme listesine ekle'}
              accent={isWatched ? '#fbbf24' : null}
              onClick={() => { toggleWatchlist(s.symbol); closeCtx(); }} />
            {s.qrs_score > 0 && (
              <>
                <CtxDivider />
                <CtxInfo color={s.qrs_score >= 70 ? CYAN : 'rgba(255,255,255,0.4)'} label={`QRS ${s.qrs_score}`} sub={s.qrs_score >= 70 ? 'Güçlü sinyal' : 'Orta güç'} />
              </>
            )}
          </CtxMenu>
        );
      })()}
    </div>
  );
}
