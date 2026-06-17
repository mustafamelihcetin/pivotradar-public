import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api/client';
import { useScanStore } from '@/core/store/useScanStore';
import { Play, TrendingUp, TrendingDown, AlertTriangle, BarChart2, Clock, Activity, ChevronRight } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:          '#020408',
  panel:       '#050709',
  card:        '#07090e',
  border:      'rgba(255,255,255,0.06)',
  borderHi:    'rgba(255,255,255,0.1)',
  primary:     '#99f7ff',
  primaryLo:   'rgba(153,247,255,0.08)',
  primaryBord: 'rgba(153,247,255,0.22)',
  green:       '#34d399',
  red:         '#f87171',
  yellow:      '#fbbf24',
  w70:         'rgba(255,255,255,0.7)',
  w50:         'rgba(255,255,255,0.5)',
  w30:         'rgba(255,255,255,0.3)',
  w18:         'rgba(255,255,255,0.18)',
  w12:         'rgba(255,255,255,0.12)',
  w06:         'rgba(255,255,255,0.06)',
  mono:        "'IBM Plex Mono', 'Fira Mono', monospace",
};

const PROFILES = [
  ['Dengeli',     'Risk/ödül dengesi'],
  ['Momentum',    'Güçlü trend + hacim'],
  ['Swing',       'Salınım al-sat'],
  ['Trend',       'Uzun vadeli trend'],
  ['Scalper',     'Hızlı kısa vadeli'],
  ['Safe Harbor', 'Düşük risk'],
  ['Mean-Revert', 'Ortalamayla dönüş'],
  ['Breakout',    'Kırılım sinyali'],
];

// ── Utils ─────────────────────────────────────────────────────────────────────
const pct = (v, d = 2) => v == null ? '—' : (v >= 0 ? '+' : '') + parseFloat(v).toFixed(d) + '%';
const num = (v, d = 2) => v == null ? '—' : parseFloat(v).toFixed(d);
const col = v => v == null ? C.w30 : parseFloat(v) >= 0 ? C.green : C.red;

// ── Shared input style ────────────────────────────────────────────────────────
const INP = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 3,
  color: C.w70,
  fontSize: 13,
  padding: '8px 10px',
  fontFamily: C.mono,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};
const LBL = {
  fontSize: 10,
  fontWeight: 700,
  color: C.w30,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 5,
  fontFamily: C.mono,
  display: 'block',
};

// ── Canvas: Equity ────────────────────────────────────────────────────────────
function EquityChart({ equity = [], benchmark = [], h = 200 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!equity.length || !ref.current) return;
    const cvs = ref.current, ctx = cvs.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const R = cvs.getBoundingClientRect();
    cvs.width = R.width * dpr; cvs.height = R.height * dpr;
    ctx.scale(dpr, dpr);
    const W = R.width, H = R.height;
    ctx.clearRect(0, 0, W, H);
    const pad = { t: 10, b: 24, l: 58, r: 12 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    const eV = equity.map(e => e.equity);
    const bV = benchmark.map(e => e.equity);
    const all = [...eV, ...bV].filter(Boolean);
    const mn = Math.min(...all), mx = Math.max(...all), rng = mx - mn || 1;
    const tx = (i, len) => pad.l + (i / Math.max(len - 1, 1)) * cW;
    const ty = v => pad.t + cH - ((v - mn) / rng) * cH;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (cH / 4) * i;
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = C.w18; ctx.font = `9px ${C.mono}`; ctx.textAlign = 'right';
      ctx.fillText(Math.round(mx - (rng / 4) * i).toLocaleString('tr-TR'), pad.l - 4, y + 3);
    }
    ctx.textAlign = 'left';
    if (bV.length > 1) {
      ctx.beginPath();
      benchmark.forEach((e, i) => { const x = tx(i, benchmark.length), y = ty(e.equity); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.strokeStyle = 'rgba(251,191,36,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    const profit = eV[eV.length - 1] >= eV[0];
    const lc = profit ? C.green : C.red;
    const grd = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grd.addColorStop(0, profit ? 'rgba(52,211,153,0.14)' : 'rgba(248,113,113,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    equity.forEach((e, i) => { const x = tx(i, equity.length), y = ty(e.equity); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.lineTo(tx(equity.length - 1, equity.length), H - pad.b);
    ctx.lineTo(tx(0, equity.length), H - pad.b);
    ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath();
    equity.forEach((e, i) => { const x = tx(i, equity.length), y = ty(e.equity); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = lc; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    const step = Math.max(1, Math.floor(equity.length / 6));
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.font = `9px ${C.mono}`; ctx.textAlign = 'center';
    for (let i = 0; i < equity.length; i += step) ctx.fillText(equity[i].date?.slice(0, 7) || '', tx(i, equity.length), H - 5);
    ctx.textAlign = 'left';
  }, [equity, benchmark]);
  return <canvas ref={ref} style={{ width: '100%', height: h, display: 'block' }} />;
}

// ── Canvas: Drawdown ──────────────────────────────────────────────────────────
function DrawdownChart({ series = [], h = 64 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!series.length || !ref.current) return;
    const cvs = ref.current, ctx = cvs.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const R = cvs.getBoundingClientRect();
    cvs.width = R.width * dpr; cvs.height = R.height * dpr;
    ctx.scale(dpr, dpr);
    const W = R.width, H = R.height;
    ctx.clearRect(0, 0, W, H);
    const pad = { t: 4, b: 14, l: 38, r: 6 };
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    const vals = series.map(e => e.dd);
    const mxDD = Math.max(...vals, 1);
    const tx = i => pad.l + (i / Math.max(series.length - 1, 1)) * cW;
    const ty = v => pad.t + (v / mxDD) * cH;
    const grd = ctx.createLinearGradient(0, pad.t, 0, H - pad.b);
    grd.addColorStop(0, 'rgba(248,113,113,0.2)'); grd.addColorStop(1, 'rgba(248,113,113,0.02)');
    ctx.beginPath(); ctx.moveTo(tx(0), pad.t);
    series.forEach((e, i) => ctx.lineTo(tx(i), ty(e.dd)));
    ctx.lineTo(tx(series.length - 1), pad.t); ctx.closePath();
    ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath();
    series.forEach((e, i) => { const x = tx(i), y = ty(e.dd); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = 'rgba(248,113,113,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = C.w18; ctx.font = `9px ${C.mono}`;
    ctx.fillText(`-${mxDD.toFixed(1)}%`, 2, pad.t + 8);
  }, [series]);
  return <canvas ref={ref} style={{ width: '100%', height: h, display: 'block' }} />;
}

// ── Metric tile ───────────────────────────────────────────────────────────────
function Tile({ label, value, color, sub }) {
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.w30, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5, fontFamily: C.mono }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: color || C.w70, fontFamily: C.mono, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 10, color: C.w30, marginTop: 5, fontFamily: C.mono }}>{sub}</div>}
    </div>
  );
}

// ── CRT static noise canvas ───────────────────────────────────────────────────
function CrtNoise() {
  const ref = useRef(null);
  const rafRef = useRef(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let running = true;
    const resize = () => {
      const r = cvs.getBoundingClientRect();
      cvs.width = Math.round(r.width);
      cvs.height = Math.round(r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cvs.parentElement || cvs);
    const draw = () => {
      if (!running) return;
      const w = cvs.width, h = cvs.height;
      if (!w || !h) { rafRef.current = requestAnimationFrame(draw); return; }
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.random() < 0.012) {
          const v = Math.random() * 200 | 0;
          d[i] = d[i+1] = d[i+2] = v;
          d[i+3] = 38;
        }
      }
      ctx.putImageData(img, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { running = false; cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);
  return (
    <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', borderRadius: 4 }} />
  );
}

// ── Empty / loading state for right panel ─────────────────────────────────────
function EmptyPane({ loading, label }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.w18 }}>
      {loading
        ? <>
            <div style={{ width: 20, height: 20, border: `2px solid ${C.primaryBord}`, borderTopColor: C.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: 10, fontFamily: C.mono }}>Hesaplanıyor…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </>
        : <>
            <Activity size={24} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 10, fontFamily: C.mono }}>{label || 'Parametreleri ayarlayıp Simüle Et\'e bas'}</span>
          </>
      }
    </div>
  );
}

// ── Results right pane ────────────────────────────────────────────────────────
function ResultsPane({ data, type }) {
  const [tradeFilter, setTradeFilter] = useState('all');
  const m  = data?.metrics || {};
  const eq = data?.equity_curve    || [];
  const bm = data?.benchmark_curve || [];
  const dd = data?.drawdown_series || [];
  const tr = data?.trades          || [];
  const finalRet = m.total_return;
  const retColor = finalRet == null ? C.w50 : finalRet >= 0 ? C.green : C.red;

  // Benchmark toplam getirisi
  const benchReturn = bm.length >= 2
    ? ((bm[bm.length - 1].equity - bm[0].equity) / bm[0].equity * 100)
    : null;

  // CAGR güvenilirliği: PRISM için < 26 dönem (≈ 6 ay) yanıltıcı
  const cagrUnreliable = type === 'prism' && (m.num_periods || 0) < 26;

  // Sinyal filtresi: son 30 gün
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyStr = thirtyDaysAgo.toISOString().slice(0, 10);
  const filteredTrades = tradeFilter === 'recent'
    ? tr.filter(t => (t.date || t.entry_date || '') >= thirtyStr)
    : tr;
  const recentWins = filteredTrades.filter(t => (type === 'technical' ? t.pnl_pct : t.return_pct) > 0);
  const recentWinRate = filteredTrades.length > 0 ? (recentWins.length / filteredTrades.length * 100).toFixed(1) : null;
  const recentAvgRet  = filteredTrades.length > 0
    ? (filteredTrades.reduce((s, t) => s + (type === 'technical' ? t.pnl_pct : t.return_pct), 0) / filteredTrades.length).toFixed(2)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflowY: 'auto', paddingRight: 2 }}>

      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: C.card, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 3, flexShrink: 0, flexWrap: 'wrap' }}>
        {type === 'technical' && (
          <span style={{ fontSize: 13, fontWeight: 900, color: C.primary, fontFamily: C.mono, letterSpacing: '0.06em' }}>{data.symbol}</span>
        )}
        <span style={{ fontSize: 11, color: C.w50, fontFamily: C.mono }}>
          {type === 'technical' ? data.profile : `QRS ≥ ${data.params?.qrs_threshold} · Top ${data.params?.top_n}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {benchReturn != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.w30, fontFamily: C.mono }}>XU100:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: benchReturn >= 0 ? 'rgba(251,191,36,0.8)' : 'rgba(251,191,36,0.5)', fontFamily: C.mono }}>{pct(benchReturn)}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: C.w30, fontFamily: C.mono }}>Strateji:</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: retColor, fontFamily: C.mono }}>{pct(finalRet)}</span>
          </div>
          {benchReturn != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 2,
              background: (finalRet - benchReturn) >= 0 ? 'rgba(52,211,153,0.07)' : 'rgba(248,113,113,0.07)',
              border: `1px solid ${(finalRet - benchReturn) >= 0 ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
              <span style={{ fontSize: 9, color: C.w30, fontFamily: C.mono }}>Alpha:</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: (finalRet - benchReturn) >= 0 ? C.green : C.red, fontFamily: C.mono }}>
                {pct(finalRet - benchReturn)}
              </span>
            </div>
          )}
          <span style={{ fontSize: 11, color: C.w30, fontFamily: C.mono }}>
            ₺{(m.initial_capital || 10000).toLocaleString('tr-TR')} → ₺{(m.final_capital || 0).toLocaleString('tr-TR')}
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, flexShrink: 0 }}>
        <Tile label="Toplam Getiri"  value={pct(m.total_return)}  color={col(m.total_return)} />
        <Tile
          label="CAGR / Yıllık"
          value={cagrUnreliable ? 'N/A' : pct(m.cagr)}
          color={cagrUnreliable ? C.w30 : col(m.cagr)}
          sub={cagrUnreliable ? '⚠ kısa dönem' : 'Bileşik büyüme'}
        />
        <Tile label="Maks. Düşüş"    value={`-${num(m.max_drawdown)}%`} color={C.red}           sub="Zirveden dibe" />
        <Tile label="Sharpe"         value={num(m.sharpe)}
          color={m.sharpe >= 1 ? C.green : m.sharpe >= 0 ? C.yellow : C.red}
          sub={m.sharpe >= 2 ? '>2 mükemmel' : m.sharpe >= 1 ? '>1 iyi' : '<1 zayıf'} />
        <Tile label="Profit Factor"  value={num(m.profit_factor)}
          color={m.profit_factor >= 1.5 ? C.green : m.profit_factor >= 1 ? C.yellow : C.red}
          sub="Brüt K / Brüt Z" />
        <Tile label="Kazanma Oranı"  value={pct(m.win_rate, 1)}   color={m.win_rate >= 50 ? C.green : C.red} />
        <Tile label={type === 'technical' ? 'İşlem Sayısı' : 'Sinyal Sayısı'}
          value={type === 'technical' ? m.num_trades : m.num_signals} color={C.primary} />
        <Tile label={type === 'technical' ? 'Ort. Süre' : 'Ort. Getiri'}
          value={type === 'technical' ? `${num(m.avg_hold_days, 0)} gün` : pct(m.avg_return)}
          color={col(type === 'technical' ? null : m.avg_return)} />
      </div>

      {/* Equity chart */}
      <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, padding: '10px 12px 6px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.w30, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: C.mono }}>Sermaye Eğrisi</span>
          {bm.length > 0 && (
            <div style={{ display: 'flex', gap: 10, fontSize: 11, fontFamily: C.mono }}>
              <span style={{ color: C.green }}>— Strateji</span>
              <span style={{ color: 'rgba(251,191,36,0.5)' }}>-- XU100</span>
            </div>
          )}
        </div>
        <EquityChart equity={eq} benchmark={bm} h={190} />
      </div>

      {/* Drawdown */}
      {dd.length > 0 && (
        <div style={{ background: C.card, border: '1px solid rgba(248,113,113,0.1)', borderRadius: 3, padding: '8px 12px 4px', flexShrink: 0 }}>
          <span style={{ fontSize: 8, fontWeight: 900, color: 'rgba(248,113,113,0.4)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: C.mono, display: 'block', marginBottom: 5 }}>
            Drawdown — maks. -{num(m.max_drawdown)}%
          </span>
          <DrawdownChart series={dd} h={64} />
        </div>
      )}

      {/* Küçük örneklem uyarısı */}
      {type === 'prism' && m.num_signals != null && m.num_signals < 20 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 3, flexShrink: 0 }}>
          <AlertTriangle size={14} style={{ color: C.yellow, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.yellow, fontFamily: C.mono, marginBottom: 3 }}>
              Yetersiz Örneklem — {m.num_signals} sinyal
            </div>
            <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.6)', fontFamily: C.mono, lineHeight: 1.6 }}>
              İstatistiksel anlamlılık için en az 20 sinyal gerekir. QRS eşiğini düşür (70–80) ve Top N'yi artır.
            </div>
          </div>
        </div>
      )}

      {/* Trade / signal table */}
      {tr.length > 0 && (
        <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.w30, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: C.mono }}>
              {type === 'technical' ? 'İşlem Geçmişi' : 'Sinyal Geçmişi'} — {filteredTrades.length} kayıt
            </span>
            {type === 'prism' && (
              <>
                {/* Dönem filtresi */}
                <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
                  {[['all', 'Tüm Dönem'], ['recent', 'Son 30 Gün']].map(([id, lbl]) => (
                    <button key={id} onClick={() => setTradeFilter(id)} style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 2, cursor: 'pointer', fontFamily: C.mono, fontWeight: 700,
                      border: `1px solid ${tradeFilter === id ? C.primaryBord : C.border}`,
                      background: tradeFilter === id ? C.primaryLo : 'transparent',
                      color: tradeFilter === id ? C.primary : C.w30,
                    }}>{lbl}</button>
                  ))}
                </div>
                {/* Mini stats for filtered set */}
                {filteredTrades.length > 0 && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 10, fontFamily: C.mono }}>
                    <span style={{ color: C.w30 }}>
                      Kazanma: <span style={{ color: recentWinRate >= 50 ? C.green : C.red, fontWeight: 700 }}>{recentWinRate}%</span>
                    </span>
                    <span style={{ color: C.w30 }}>
                      Ort: <span style={{ color: recentAvgRet >= 0 ? C.green : C.red, fontWeight: 700 }}>{recentAvgRet >= 0 ? '+' : ''}{recentAvgRet}%</span>
                    </span>
                  </div>
                )}
                <span title="target_hit = fiyat geçici olarak hedefi vurdu ama holding süresi sonunda geri döndü." style={{ fontSize: 10, color: 'rgba(251,191,36,0.4)', cursor: 'help', fontFamily: C.mono }}>
                  ⚠ target_hit ≠ kâr
                </span>
              </>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: type === 'technical' ? '1fr 1fr 68px 68px 62px 46px' : '88px 68px 52px 62px 78px', padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 9, color: C.w30, fontFamily: C.mono, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {type === 'technical'
              ? <><span>Giriş</span><span>Çıkış</span><span>Alış</span><span>Satış</span><span>K/Z</span><span>Süre</span></>
              : <><span>Tarih</span><span>Hisse</span><span>QRS</span><span>Getiri</span><span>Sonuç</span></>
            }
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {filteredTrades.length === 0 && (
              <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 10, color: C.w18, fontFamily: C.mono }}>
                Son 30 günde kayıt yok
              </div>
            )}
            {filteredTrades.map((t, i) => {
              const v = type === 'technical' ? t.pnl_pct : t.return_pct;
              const c = v >= 0 ? C.green : C.red;
              const isConflicted = type === 'prism' && t.hit_status === 'target_hit' && v < 0;
              const statusColor = isConflicted
                ? C.yellow
                : t.hit_status === 'target_hit' ? C.green
                : t.hit_status === 'miss' ? C.red
                : C.yellow;
              const statusLabel = isConflicted ? 'hit→geri döndü' : t.hit_status || '—';
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: type === 'technical' ? '1fr 1fr 68px 68px 62px 46px' : '88px 68px 52px 62px 78px', padding: '5px 12px', borderBottom: '1px solid rgba(255,255,255,0.025)', fontSize: 10, fontFamily: C.mono, alignItems: 'center', background: isConflicted ? 'rgba(251,191,36,0.02)' : 'transparent' }}>
                  {type === 'technical'
                    ? <><span style={{ color: C.w30 }}>{t.entry_date}</span><span style={{ color: C.w30 }}>{t.exit_date}</span><span style={{ color: C.w50 }}>₺{t.entry_price?.toFixed(2)}</span><span style={{ color: C.w50 }}>₺{t.exit_price?.toFixed(2)}</span><span style={{ color: c, fontWeight: 700 }}>{v >= 0 ? '+' : ''}{v?.toFixed(2)}%</span><span style={{ color: C.w18 }}>{t.holding_days}g</span></>
                    : <><span style={{ color: C.w30 }}>{t.date}</span><span style={{ color: C.w70, fontWeight: 700 }}>{t.symbol}</span><span style={{ color: C.w30 }}>{t.qrs}</span><span style={{ color: c, fontWeight: 700 }}>{v >= 0 ? '+' : ''}{v?.toFixed(2)}%</span><span style={{ fontSize: 9, color: statusColor }}>{statusLabel}</span></>
                  }
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Left panel: Teknik controls ───────────────────────────────────────────────
function TechPanel({ topPicks, onResult, onLoading, onError }) {
  const [symbol,      setSymbol]      = useState('');
  const [profile,     setProfile]     = useState('Dengeli');
  const [capital,     setCapital]     = useState(10000);
  const [mode,        setMode]        = useState('profile');
  const [rsiBuy,      setRsiBuy]      = useState(35);
  const [rsiSell,     setRsiSell]     = useState(65);
  const [useEma,      setUseEma]      = useState(true);
  const [commission,  setCommission]  = useState(0.1);
  const [query,       setQuery]       = useState(null);
  const [bistSymbols, setBistSymbols] = useState([]);

  useEffect(() => {
    api.bistNames().then(d => {
      if (d && typeof d === 'object')
        setBistSymbols(Object.entries(d).map(([sym, name]) => ({ symbol: sym, name: name || '' })));
    }).catch(() => {});
  }, []);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['backtest', query],
    queryFn:  () => api.backtest(query.sym, query.params),
    enabled:  !!query,
    staleTime: 300_000, retry: 0,
  });

  useEffect(() => { onLoading?.(isFetching); }, [isFetching]);
  useEffect(() => { if (data) onResult?.(data); }, [data]);
  useEffect(() => { onError?.(isError); }, [isError]);

  const run = () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setQuery({ sym: s, params: { profile: mode === 'profile' ? profile : 'CUSTOM', rsi_buy: rsiBuy, rsi_sell: rsiSell, use_ema: useEma, use_bb: false, capital, commission_pct: commission } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Hisse */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={LBL}>Hisse Kodu</span>
        <SymbolAutocomplete
          value={symbol}
          onChange={v => setSymbol(v.toUpperCase())}
          onSelect={sym => setSymbol(sym)}
          placeholder="AKBNK, THYAO…"
          inputStyle={{ ...INP, fontSize: 12, padding: '8px 10px', color: C.primary, letterSpacing: '0.06em' }}
          symbols={bistSymbols}
          onKeyDown={e => e.key === 'Enter' && run()}
        />
        {topPicks.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {topPicks.slice(0, 6).map(p => (
              <button key={p.sym} onClick={() => setSymbol(p.sym)} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 2,
                background: C.primaryLo, border: `1px solid ${C.primaryBord}`,
                color: C.primary, cursor: 'pointer', fontFamily: C.mono, fontWeight: 700,
              }}>{p.sym}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: C.border }} />

      {/* Strateji */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={LBL}>Strateji</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[['profile', 'PRISM'], ['custom', 'RSI/EMA']].map(([id, lbl]) => (
            <button key={id} onClick={() => setMode(id)} style={{
              flex: 1, padding: '7px', fontSize: 11, fontWeight: 700, fontFamily: C.mono,
              letterSpacing: '0.06em', borderRadius: 3, cursor: 'pointer',
              border: `1px solid ${mode === id ? C.primaryBord : C.border}`,
              background: mode === id ? C.primaryLo : 'transparent',
              color: mode === id ? C.primary : C.w30, transition: 'all 0.1s',
            }}>{lbl}</button>
          ))}
        </div>

        {mode === 'profile' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {PROFILES.map(([name, desc]) => (
              <button key={name} onClick={() => setProfile(name)} title={desc} style={{
                padding: '8px 6px', fontSize: 11, fontWeight: 700, fontFamily: C.mono,
                borderRadius: 3, cursor: 'pointer', textAlign: 'center',
                border: `1px solid ${profile === name ? C.primaryBord : C.border}`,
                background: profile === name ? C.primaryLo : 'rgba(255,255,255,0.01)',
                color: profile === name ? C.primary : C.w50, transition: 'all 0.1s',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{name}</button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <label style={LBL}>RSI Alım</label>
                <input type="number" value={rsiBuy} onChange={e => setRsiBuy(+e.target.value)} min={10} max={50} style={INP} />
              </div>
              <div>
                <label style={LBL}>RSI Satım</label>
                <input type="number" value={rsiSell} onChange={e => setRsiSell(+e.target.value)} min={50} max={90} style={INP} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={useEma} onChange={e => setUseEma(e.target.checked)} style={{ accentColor: C.primary, width: 12, height: 12 }} />
              <span style={{ fontSize: 12, color: C.w50, fontFamily: C.mono }}>EMA 5/20 filtresi</span>
            </label>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: C.border }} />

      {/* Sermaye + Komisyon */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LBL}>Sermaye (₺)</label>
          <input type="number" value={capital} onChange={e => setCapital(+e.target.value)} min={100} style={INP} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LBL}>Komisyon (%)</label>
          <input type="number" value={commission} onChange={e => setCommission(+e.target.value)} min={0} max={1} step={0.01} style={INP} />
        </div>
      </div>

      <button onClick={run} disabled={isFetching || !symbol.trim()} style={{
        width: '100%', padding: '9px', borderRadius: 3, marginTop: 2,
        background: (isFetching || !symbol.trim()) ? 'rgba(255,255,255,0.02)' : C.primaryLo,
        border: `1px solid ${(isFetching || !symbol.trim()) ? C.border : C.primaryBord}`,
        color: (isFetching || !symbol.trim()) ? C.w18 : C.primary,
        cursor: symbol.trim() ? 'pointer' : 'not-allowed',
        fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', fontFamily: C.mono,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'all 0.12s',
      }}>
        <Play size={12} />
        {isFetching ? 'Hesaplanıyor…' : 'Simüle Et'}
      </button>

      {(isError || data?.status === 'error') && (
        <div style={{ padding: '9px 12px', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 3, fontSize: 11, color: C.red, fontFamily: C.mono, lineHeight: 1.5 }}>
          {data?.message || 'Hisse bulunamadı veya veri yetersiz.'}
        </div>
      )}
    </div>
  );
}

// ── Left panel: PRISM controls ────────────────────────────────────────────────
function PrismPanel({ onResult, onLoading }) {
  const [threshold, setThreshold] = useState(80);
  const [topN,      setTopN]      = useState(7);
  const [capital,   setCapital]   = useState(10000);
  const [triggered, setTriggered] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ['prism-replay', threshold, topN, capital],
    queryFn:  () => api.prismReplay({ qrs_threshold: threshold, top_n: topN, capital }),
    enabled:  triggered,
    staleTime: 300_000, retry: 0,
  });

  useEffect(() => { onLoading?.(isFetching); }, [isFetching]);
  useEffect(() => { if (data) onResult?.(data); }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      <div style={{ padding: '8px 10px', background: 'rgba(153,247,255,0.02)', border: `1px solid rgba(153,247,255,0.07)`, borderRadius: 3 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(153,247,255,0.5)', marginBottom: 5, fontFamily: C.mono, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Bu sekme ne yapar?</div>
        <p style={{ fontSize: 11, color: C.w50, lineHeight: 1.6, margin: 0, fontFamily: C.mono }}>
          PRISM'in geçmiş gerçek sinyallerini körü körüne takip ettiğini simüle eder. Her dönemde QRS eşiğini geçen en iyi N hisseye eşit ağırlıklı giriş yapıldığı varsayılır.
        </p>
      </div>

      <div style={{ height: 1, background: C.border }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ ...LBL, marginBottom: 0 }}>Min. QRS: <span style={{ color: C.primary }}>{threshold}</span></label>
          {threshold >= 80 && (
            <span style={{ fontSize: 9, fontWeight: 900, color: C.green, fontFamily: C.mono, letterSpacing: '0.08em', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 2, padding: '1px 5px' }}>
              ÖNERİLEN
            </span>
          )}
          {threshold < 80 && threshold >= 65 && (
            <span style={{ fontSize: 9, fontWeight: 900, color: C.yellow, fontFamily: C.mono, letterSpacing: '0.08em', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 2, padding: '1px 5px' }}>
              GÜRÜLTÜLÜ
            </span>
          )}
          {threshold < 65 && (
            <span style={{ fontSize: 9, fontWeight: 900, color: C.red, fontFamily: C.mono, letterSpacing: '0.08em', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 2, padding: '1px 5px' }}>
              DÜŞÜK KALİTE
            </span>
          )}
        </div>
        <input type="range" min={50} max={90} step={5} value={threshold}
          onChange={e => setThreshold(+e.target.value)}
          style={{ width: '100%', accentColor: threshold >= 80 ? C.green : threshold >= 65 ? C.yellow : C.red }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.w30, fontFamily: C.mono }}>
          <span>50 — geniş</span>
          <span style={{ color: C.green }}>80+ önerilen</span>
          <span>90 — seçici</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={LBL}>Dönem Başına Sinyal</label>
        <div style={{ display: 'flex', gap: 3 }}>
          {[3, 5, 7, 10].map(n => (
            <button key={n} onClick={() => setTopN(n)} style={{
              flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 700, fontFamily: C.mono,
              borderRadius: 3, cursor: 'pointer',
              border: `1px solid ${topN === n ? C.primaryBord : C.border}`,
              background: topN === n ? C.primaryLo : 'rgba(255,255,255,0.01)',
              color: topN === n ? C.primary : C.w50, transition: 'all 0.1s',
            }}>{n}</button>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: C.border }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={LBL}>Başlangıç Sermayesi (₺)</label>
        <input type="number" value={capital} onChange={e => setCapital(+e.target.value)} min={100} style={INP} />
      </div>

      <button onClick={() => setTriggered(true)} disabled={isFetching} style={{
        width: '100%', padding: '9px', borderRadius: 3, marginTop: 2,
        background: isFetching ? 'rgba(255,255,255,0.02)' : C.primaryLo,
        border: `1px solid ${isFetching ? C.border : C.primaryBord}`,
        color: isFetching ? C.w18 : C.primary,
        cursor: isFetching ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', fontFamily: C.mono,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transition: 'all 0.12s',
      }}>
        <Play size={12} />
        {isFetching ? 'Hesaplanıyor…' : 'Simüle Et'}
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BacktestPage() {
  const { results } = useScanStore();
  const [tab,     setTab]     = useState('technical');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const topPicks = (results || []).slice(0, 8).map(r => ({ sym: r.symbol }));

  const handleResult  = (d)  => { setResult(d); setLoading(false); };
  const handleLoading = (v)  => { setLoading(v); if (v) { setResult(null); setErrored(false); } };
  const handleError   = (v)  => { setErrored(v); };

  const switchTab = (id) => { setTab(id); setResult(null); setLoading(false); setErrored(false); };

  const showResults  = result?.status === 'ok';
  const showNoData   = result?.status === 'no_data';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 24 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: C.primary, boxShadow: `0 0 8px ${C.primary}44`, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: C.mono }}>Backtest Stüdyosu</div>
          <div style={{ fontSize: 11, color: C.w30, marginTop: 2, fontFamily: C.mono }}>BIST · Tarihsel strateji simülasyonu</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.1)', borderRadius: 3 }}>
          <AlertTriangle size={9} style={{ color: C.yellow, opacity: 0.6 }} />
          <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.5)', fontFamily: C.mono, fontWeight: 700, letterSpacing: '0.06em' }}>
            Eğitim amaçlı · Yatırım tavsiyesi değildir
          </span>
        </div>
      </div>

      {/* ── Split layout: yatay (desktop) / dikey (mobile) ── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 8,
        minHeight: isMobile ? 'auto' : 'calc(100vh - 100px)',
      }}>

        {/* LEFT — kontrol paneli */}
        <div style={{
          width: isMobile ? '100%' : 300,
          flexShrink: 0,
          alignSelf: isMobile ? 'auto' : 'flex-start',
          position: isMobile ? 'static' : 'sticky',
          top: 0,
          maxHeight: isMobile ? 'none' : 'calc(100vh - 100px)',
          overflowY: isMobile ? 'visible' : 'auto',
          background: '#07090e',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            {[
              { id: 'technical', icon: <BarChart2 size={11} />, label: 'Teknik Backtest' },
              { id: 'prism',     icon: <Clock size={11} />,     label: 'PRISM Sicili' },
            ].map((t, idx) => (
              <button key={t.id} onClick={() => switchTab(t.id)} style={{
                flex: 1, padding: '10px 8px', cursor: 'pointer',
                borderRight: idx === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                background: tab === t.id ? 'rgba(153,247,255,0.05)' : 'transparent',
                borderBottom: `2px solid ${tab === t.id ? C.primary : 'transparent'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.1s',
              }}>
                <span style={{ color: tab === t.id ? C.primary : C.w18 }}>{t.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: tab === t.id ? C.w70 : C.w30, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: C.mono }}>{t.label}</span>
              </button>
            ))}
          </div>
          {/* Kontroller */}
          <div style={{ padding: '14px 14px 18px', flex: 1, overflowY: isMobile ? 'visible' : 'auto' }}>
            {tab === 'technical'
              ? <TechPanel topPicks={topPicks} onResult={handleResult} onLoading={handleLoading} onError={handleError} />
              : <PrismPanel onResult={handleResult} onLoading={handleLoading} />
            }
          </div>
        </div>

        {/* RIGHT — sonuçlar */}
        <div style={{
          flex: 1, minWidth: 0,
          alignSelf: isMobile ? 'auto' : 'stretch',
          background: '#07090e',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
          padding: '14px',
          display: 'flex', flexDirection: 'column',
          minHeight: isMobile ? 'auto' : 0,
          position: 'relative',
        }}>

          {/* CRT karınca efekti — sadece boş/yükleme durumunda */}
          {!showResults && !showNoData && <CrtNoise />}

          {loading && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, position: 'relative', zIndex: 1 }}>
              <EmptyPane loading />
            </div>
          )}

          {!loading && !showResults && !showNoData && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, position: 'relative', zIndex: 1 }}>
              <EmptyPane label={isMobile ? 'Parametreleri ayarlayıp Simüle Et\'e bas' : 'Sol panelden parametreleri ayarlayıp Simüle Et\'e bas'} />
            </div>
          )}

          {showNoData && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: '32px 24px', minHeight: 200 }}>
              <AlertTriangle size={20} style={{ color: C.yellow, opacity: 0.6 }} />
              <div style={{ fontSize: 11, fontWeight: 900, color: C.w30, fontFamily: C.mono }}>Henüz Yeterli Veri Yok</div>
              <p style={{ fontSize: 10, color: C.w18, lineHeight: 1.6, maxWidth: 360, margin: 0, fontFamily: C.mono }}>{result.message}</p>
            </div>
          )}

          {showResults && <ResultsPane data={result} type={tab} />}

        </div>
      </div>
    </div>
  );
}
