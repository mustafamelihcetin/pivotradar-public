import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/core/api/client';
import { useScanStore } from '@/core/store/useScanStore';
import {
  Newspaper, ExternalLink, RefreshCw, Search,
  Clock, TrendingUp, Globe, AlertCircle, Copy, Terminal, HelpCircle, Briefcase,
} from 'lucide-react';
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

// ── Design tokens (tema uyumu) ────────────────────────────────────────────────
const C = {
  bg:          '#020408',
  panel:       '#050709',
  card:        '#07090e',
  border:      'rgba(255,255,255,0.06)',
  borderHi:    'rgba(255,255,255,0.1)',
  primary:     '#99f7ff',
  primaryLo:   'rgba(153,247,255,0.06)',
  primaryBord: 'rgba(153,247,255,0.18)',
  green:       '#34d399',
  red:         '#f87171',
  yellow:      '#fbbf24',
  blue:        '#60a5fa',
  w70:         'rgba(255,255,255,0.7)',
  w50:         'rgba(255,255,255,0.5)',
  w30:         'rgba(255,255,255,0.3)',
  w18:         'rgba(255,255,255,0.18)',
  w12:         'rgba(255,255,255,0.12)',
  w06:         'rgba(255,255,255,0.06)',
  mono:        "'IBM Plex Mono', 'Fira Mono', monospace",
};

const LBL = {
  fontSize: 10, fontWeight: 700, color: C.w30,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  marginBottom: 5, fontFamily: C.mono, display: 'block',
};

const INP = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 3, color: C.w70, fontSize: 13,
  padding: '8px 10px', fontFamily: C.mono,
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

// ── Kaynak rengi (source badge) ────────────────────────────────────────────────
const SOURCE_COLORS = [
  '#60a5fa', '#34d399', '#fbbf24', '#f472b6',
  '#a78bfa', '#fb923c', '#99f7ff', '#f87171',
];
const _srcColorMap = {};
function sourceColor(src) {
  if (!_srcColorMap[src]) {
    const idx = Object.keys(_srcColorMap).length % SOURCE_COLORS.length;
    _srcColorMap[src] = SOURCE_COLORS[idx];
  }
  return _srcColorMap[src];
}

// ── Zaman formatlama ──────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}sa önce`;
  return `${Math.floor(diff / 86400)}g önce`;
}

// ── Tek haber kartı ────────────────────────────────────────────────────────────
function NewsItem({ item, idx, onCtx }) {
  const [hov, setHov] = useState(false);
  const sc = sourceColor(item.source);

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onContextMenu={e => onCtx?.(e, { _type: 'news', ...item })}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', gap: 12, padding: '12px 14px',
        borderBottom: `1px solid rgba(255,255,255,0.04)`,
        background: hov ? 'rgba(255,255,255,0.025)' : 'transparent',
        textDecoration: 'none', transition: 'background 0.12s',
        cursor: 'pointer', alignItems: 'flex-start',
      }}
    >
      {/* Numara */}
      <div style={{
        fontSize: 10, color: C.w18, fontFamily: C.mono,
        minWidth: 18, paddingTop: 2, textAlign: 'right', flexShrink: 0,
      }}>
        {idx + 1}
      </div>

      {/* İçerik */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: hov ? '#fff' : C.w70,
          fontFamily: C.mono, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          transition: 'color 0.12s',
        }}>
          {item.title}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.08em',
            color: sc, background: `${sc}18`,
            border: `1px solid ${sc}30`,
            borderRadius: 2, padding: '1px 6px', fontFamily: C.mono,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {item.source}
          </span>
          {item.published_at && (
            <span
              title={new Date(item.published_at).toLocaleString('tr-TR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
              style={{
                fontSize: 10, color: C.w30, fontFamily: C.mono,
                display: 'flex', alignItems: 'center', gap: 3, cursor: 'default',
              }}>
              <Clock size={9} />
              {timeAgo(item.published_at)}
            </span>
          )}
        </div>
      </div>

      {/* Link ikonu */}
      <ExternalLink
        size={11}
        style={{
          color: hov ? C.primary : C.w18,
          flexShrink: 0, marginTop: 3,
          transition: 'color 0.12s',
        }}
      />
    </a>
  );
}

// ── KAP butonu ────────────────────────────────────────────────────────────────
function KapButton({ url, symbol }) {
  const [hov, setHov] = useState(false);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '10px 14px', margin: '10px 14px',
        background: hov ? 'rgba(153,247,255,0.06)' : 'rgba(153,247,255,0.03)',
        border: `1px solid ${hov ? C.primaryBord : 'rgba(153,247,255,0.1)'}`,
        borderRadius: 3, textDecoration: 'none', transition: 'all 0.12s', cursor: 'pointer',
      }}
    >
      <Globe size={12} style={{ color: C.primary }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: C.mono, letterSpacing: '0.08em' }}>
        {symbol ? `${symbol} — KAP Resmi Bildirimleri` : 'KAP Bildirim Sorgula'} ↗
      </span>
    </a>
  );
}

// ── Ana sayfa ──────────────────────────────────────────────────────────────────
export default function NewsPage() {
  const navigate = useNavigate();
  const { menu: ctxMenu, open: openCtx, openAt, close: closeCtx } = useCtxMenu();

  const isMobile = useIsMobile();
  const { results } = useScanStore();
  const [symbol, setSymbol]   = useState('');
  const [input,  setInput]    = useState('');
  const [tab,    setTab]      = useState('news'); // 'news' | 'market'
  const [showSugg, setShowSugg] = useState(false);
  const [showPanel, setShowPanel] = useState(false); // mobilde sol panel toggle
  const inputRef = useRef(null);
  const suggRef  = useRef(null);

  // BIST sembol→isim haritası (bir kez çekilir, 1 saat cache)
  const { data: bistNames } = useQuery({
    queryKey: ['bistNames'],
    queryFn:  api.bistNames,
    staleTime: 3_600_000,
    retry: 1,
  });

  // Autocomplete: input'a göre filtrele (sembol veya isim eşleşmesi)
  const suggestions = (() => {
    if (!bistNames || input.length < 1) return [];
    const q = input.toUpperCase();
    const entries = Object.entries(bistNames);
    const bySymbol = entries.filter(([sym]) => sym.startsWith(q));
    const byName   = entries.filter(([sym, name]) => !sym.startsWith(q) && name.toUpperCase().includes(q));
    return [...bySymbol, ...byName].slice(0, 8);
  })();

  // Son taramadan gelen top hisseler (chip'ler)
  const topSymbols = [...new Set(
    (results || []).slice(0, 8).map(r => r.symbol).filter(Boolean)
  )];

  const activeSymbol = tab === 'market' ? '' : symbol;

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['news', activeSymbol],
    queryFn:  () => api.news(activeSymbol, 30),
    staleTime: 900_000,
    retry: 1,
  });

  const commitSymbol = (sym) => {
    const s = sym.trim().toUpperCase().replace(/\.IS$/i, '');
    setSymbol(s);
    setInput(s);
    setShowSugg(false);
    setTab('news');
  };

  const handleSearch = useCallback(() => {
    commitSymbol(input);
  }, [input]);

  const handleChip = (sym) => {
    commitSymbol(sym);
  };

  const items = (data?.items || []).slice().sort((a, b) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
    return tb - ta;
  });
  const kapUrl  = data?.kap_url || 'https://www.kap.org.tr/tr/bildirim-sorgu';

  const handleGeneralCtx = (e) => { e.preventDefault(); openAt(e.clientX, e.clientY, { _type: 'general' }); };

  return (
    <div onContextMenu={handleGeneralCtx} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 24 }}>

      {/* Sayfa başlığı */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: C.card,
        border: `1px solid ${C.border}`, borderRadius: 4,
      }}>
        <div style={{
          width: 3, height: 18, borderRadius: 2,
          background: C.blue, boxShadow: `0 0 8px ${C.blue}44`, flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: C.mono }}>
            Haber Akışı
          </div>
          <div style={{ fontSize: 11, color: C.w30, marginTop: 2, fontFamily: C.mono }}>
            Google News · BIST haber takibi
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          title="Yenile"
          style={{
            padding: '6px 10px', borderRadius: 3, cursor: 'pointer',
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
            color: C.w30, display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <RefreshCw size={11} style={{
            color: isFetching ? C.primary : C.w30,
            animation: isFetching ? 'spin 0.8s linear infinite' : 'none',
          }} />
          <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 700 }}>Yenile</span>
        </button>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* Mobilde filtre toggle butonu */}
      {isMobile && (
        <button
          onClick={() => setShowPanel(p => !p)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
            background: showPanel ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${showPanel ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.08)'}`,
            color: showPanel ? C.blue : C.w30,
            fontSize: 12, fontWeight: 700, marginBottom: 8, alignSelf: 'flex-start',
          }}
        >
          <Search size={12} />
          {showPanel ? 'Filtreyi Gizle' : 'Hisse Filtrele'}
        </button>
      )}

      {/* İçerik */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, minHeight: isMobile ? 'auto' : 'calc(100vh - 140px)' }}>

        {/* SOL — arama paneli */}
        {(!isMobile || showPanel) && (
        <div style={{
          width: isMobile ? '100%' : 260, flexShrink: 0, alignSelf: 'flex-start',
          position: isMobile ? 'relative' : 'sticky', top: 0,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 4, overflow: 'hidden',
        }}>
          {/* Sekme */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
            {[
              { id: 'news',   icon: <Newspaper size={10} />,  label: 'Hisse Haberi' },
              { id: 'market', icon: <TrendingUp size={10} />, label: 'Piyasa Genel' },
            ].map((t, i) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '9px 6px', cursor: 'pointer',
                  borderRight: i === 0 ? `1px solid ${C.border}` : 'none',
                  background: tab === t.id ? C.primaryLo : 'transparent',
                  borderBottom: `2px solid ${tab === t.id ? C.blue : 'transparent'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  transition: 'all 0.1s',
                }}
              >
                <span style={{ color: tab === t.id ? C.blue : C.w18 }}>{t.icon}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontFamily: C.mono,
                  color: tab === t.id ? C.w70 : C.w30,
                }}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>

          <div style={{ padding: '14px 14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Arama */}
            {tab === 'news' && (
              <>
                <div style={{ position: 'relative' }}>
                  <label style={LBL}>Hisse Kodu</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={e => { setInput(e.target.value.toUpperCase()); setShowSugg(true); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { handleSearch(); setShowSugg(false); }
                        if (e.key === 'Escape') setShowSugg(false);
                      }}
                      onFocus={() => setShowSugg(true)}
                      onBlur={e => { if (!suggRef.current?.contains(e.relatedTarget)) setShowSugg(false); }}
                      placeholder="AKBNK, THYAO…"
                      style={{ ...INP, flex: 1, color: C.primary, letterSpacing: '0.06em' }}
                    />
                    <button
                      onClick={handleSearch}
                      style={{
                        padding: '8px 10px', borderRadius: 3, cursor: 'pointer',
                        background: C.primaryLo, border: `1px solid ${C.primaryBord}`,
                        color: C.primary, display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Search size={12} />
                    </button>
                  </div>

                  {/* Autocomplete dropdown */}
                  {showSugg && suggestions.length > 0 && (
                    <div
                      ref={suggRef}
                      style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
                        background: '#0d1117', border: `1px solid ${C.primaryBord}`,
                        borderRadius: 3, overflow: 'hidden', marginTop: 2,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                      }}
                    >
                      {suggestions.map(([sym, name]) => (
                        <button
                          key={sym}
                          tabIndex={0}
                          onMouseDown={e => { e.preventDefault(); commitSymbol(sym); }}
                          style={{
                            width: '100%', textAlign: 'left', padding: '7px 10px',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            borderBottom: `1px solid ${C.border}`, display: 'flex',
                            alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(153,247,255,0.05)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontSize: 11, fontWeight: 900, color: C.primary, fontFamily: C.mono, minWidth: 56, letterSpacing: '0.05em' }}>
                            {sym}
                          </span>
                          <span style={{ fontSize: 10, color: C.w30, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Hızlı seçim chip'leri */}
                {topSymbols.length > 0 && (
                  <div>
                    <label style={LBL}>Son Tarama</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {topSymbols.map(sym => (
                        <button
                          key={sym}
                          onClick={() => handleChip(sym)}
                          style={{
                            fontSize: 10, padding: '3px 8px', borderRadius: 2,
                            fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
                            transition: 'all 0.1s',
                            background: symbol === sym ? C.primaryLo : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${symbol === sym ? C.primaryBord : C.border}`,
                            color: symbol === sym ? C.primary : C.w30,
                          }}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ height: 1, background: C.border }} />
              </>
            )}

            {/* KAP bilgi kutusu */}
            <div style={{
              padding: '8px 10px',
              background: 'rgba(153,247,255,0.02)',
              border: `1px solid rgba(153,247,255,0.07)`,
              borderRadius: 3,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(153,247,255,0.4)', marginBottom: 4, fontFamily: C.mono, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Resmi Bildirimler
              </div>
              <p style={{ fontSize: 10, color: C.w30, lineHeight: 1.6, margin: 0, fontFamily: C.mono }}>
                {tab === 'news' && symbol
                  ? `${symbol} hissesine ait KAP özel durum açıklamaları, finansal tablolar ve içeriden alım-satım bildirimleri.`
                  : 'Şirketlerin SPK zorunluluğuyla yaptığı tüm resmi kamuyu aydınlatma bildirimleri.'}
              </p>
            </div>

            <a
              href={kapUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 7, padding: '8px', borderRadius: 3, textDecoration: 'none',
                background: 'rgba(153,247,255,0.03)',
                border: `1px solid rgba(153,247,255,0.12)`,
                color: C.primary, fontFamily: C.mono, fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', cursor: 'pointer',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = C.primaryLo; e.currentTarget.style.borderColor = C.primaryBord; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(153,247,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(153,247,255,0.12)'; }}
            >
              <Globe size={11} />
              {symbol && tab === 'news' ? `${symbol} — KAP ↗` : 'KAP Bildirim Sorgula ↗'}
            </a>
          </div>
        </div>
        )}

        {/* SAĞ — haber listesi */}
        <div style={{
          flex: 1, minWidth: 0,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 4, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Liste başlığı */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <Newspaper size={12} style={{ color: C.blue }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.w30, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: C.mono }}>
              {tab === 'market'
                ? 'BIST Piyasa Haberleri'
                : symbol
                  ? `${symbol} Haberleri`
                  : 'Hisse Haberleri'}
            </span>
            {!isFetching && items.length > 0 && (
              <span style={{ fontSize: 10, color: C.w18, fontFamily: C.mono, marginLeft: 4 }}>
                {items.length} sonuç
              </span>
            )}
            {isFetching && (
              <span style={{ fontSize: 10, color: C.w30, fontFamily: C.mono, display: 'flex', alignItems: 'center', gap: 5 }}>
                <RefreshCw size={9} style={{ animation: 'spin 0.8s linear infinite', color: C.primary }} />
                Yükleniyor…
              </span>
            )}
          </div>

          {/* Boş / hata durumu */}
          {!isFetching && isError && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 }}>
              <AlertCircle size={22} style={{ color: C.red, opacity: 0.5 }} />
              <span style={{ fontSize: 11, color: C.w30, fontFamily: C.mono }}>Haberler yüklenemedi</span>
              <button onClick={() => refetch()} style={{ fontSize: 10, color: C.primary, background: 'none', border: `1px solid ${C.primaryBord}`, borderRadius: 3, padding: '4px 12px', cursor: 'pointer', fontFamily: C.mono }}>Tekrar Dene</button>
            </div>
          )}

          {!isFetching && !isError && items.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 }}>
              <Newspaper size={22} style={{ color: C.w18 }} />
              <span style={{ fontSize: 11, color: C.w30, fontFamily: C.mono, textAlign: 'center' }}>
                {tab === 'news' && !symbol
                  ? 'Sol panelden hisse kodu girin veya "Piyasa Genel" sekmesini seç'
                  : 'Bu arama için haber bulunamadı'}
              </span>
            </div>
          )}

          {/* Haber listesi */}
          {items.length > 0 && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {items.map((item, idx) => (
                <NewsItem key={idx} item={item} idx={idx} onCtx={openCtx} />
              ))}

              {/* Alt bilgi */}
              <div style={{
                padding: '10px 14px', borderTop: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Globe size={9} style={{ color: C.w18 }} />
                <span style={{ fontSize: 9, color: C.w18, fontFamily: C.mono }}>
                  Kaynak: Google News · 15 dakikada bir güncellenir · Haberler kaynağa aittir
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── GENEL CONTEXT MENU ── */}
      {ctxMenu?.data?._type === 'general' && (
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtx}
          header={<span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.12em' }}>HABERLER</span>}
        >
          <CtxItem icon={<RefreshCw size={11}/>} label="Haberleri yenile" onClick={() => { window.location.reload(); }} />
          <CtxDivider />
          <CtxItem icon={<Terminal size={11}/>} label="Terminal'e git" onClick={() => { navigate('/terminal'); closeCtx(); }} />
          <CtxItem icon={<Briefcase size={11}/>} label="Portföyüme git" onClick={() => { navigate('/portfolio'); closeCtx(); }} />
          <CtxDivider />
          <CtxItem icon={<HelpCircle size={11}/>} label="Yardım" onClick={() => { navigate('/help'); closeCtx(); }} />
        </CtxMenu>
      )}

      {/* ── NEWS CONTEXT MENU ── */}
      {ctxMenu?.data?._type === 'news' && (() => {
        const item = ctxMenu.data;
        const copy = (v) => { navigator.clipboard?.writeText(String(v)).catch(() => {}); closeCtx(); };
        // Başlıktan BIST ticker bul (THYAO, GARAN vb. — büyük harf 4-6 karakter)
        const tickerMatch = item.title?.match(/\b([A-Z]{3,6})\b/g)?.find(t =>
          (results || []).some(r => (r.symbol || '').replace('.IS','') === t)
        );
        return (
          <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={closeCtx}
            header={
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{item.source}</div>
              </div>
            }
          >
            <CtxItem icon={<Copy size={11}/>} label="Linki kopyala" onClick={() => copy(item.url)} />
            <CtxItem icon={<Copy size={11}/>} label="Başlığı kopyala" onClick={() => copy(item.title)} />
            <CtxItem icon={<ExternalLink size={11}/>} label="Yeni sekmede aç" onClick={() => { window.open(item.url, '_blank', 'noopener'); closeCtx(); }} />
            {tickerMatch && (
              <>
                <CtxDivider />
                <CtxItem icon={<Terminal size={11}/>} label={`Terminal'de aç  (${tickerMatch})`} accent="#22d3ee"
                  onClick={() => { navigate(`/terminal/${tickerMatch}`); closeCtx(); }} />
              </>
            )}
          </CtxMenu>
        );
      })()}
    </div>
  );
}
