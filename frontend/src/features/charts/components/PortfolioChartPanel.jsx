import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../core/api/client';
import { useScanStore } from '../../../core/store/useScanStore';
import { loadPlotly } from './ChartSection';
import { TickerLogo } from '@/shared/components/TickerLogo';

// ── TestTerminalPage ile aynı design tokens ──────────────────────────────────
const S = {
  bg0:     '#05070a',
  bg1:     '#07090e',
  border0: 'rgba(255,255,255,0.035)',
  border1: 'rgba(255,255,255,0.06)',
  positive:'#34d399',
  negative:'#f87171',
  primary: '#99f7ff',
  amber:   '#fbbf24',
  mono:    "'IBM Plex Mono', ui-monospace, monospace",
  sans:    "'Inter', system-ui, sans-serif",
};
const SP = { 1:4, 2:6, 3:10, 4:16, 5:26, 6:42 };
const FS = { micro:11, tiny:13, xs:14, sm:16, md:20, lg:26, xl:32 };

// ── Renk yardımcıları ─────────────────────────────────────────────────────────
const colML  = m => m >= 70 ? S.positive : m >= 50 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)';
const colQRS = q => q >= 85 ? S.primary  : q >= 70 ? 'rgba(255,255,255,0.85)' : q >= 50 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
const colRSI = r => r >= 70 ? S.negative : r >= 60 ? 'rgba(251,191,36,0.85)' : r >= 45 ? 'rgba(255,255,255,0.55)' : r >= 30 ? 'rgba(99,202,183,0.8)' : S.positive;

// ── Format yardımcıları ───────────────────────────────────────────────────────
const fmtPrc = v => v != null ? `₺${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtPct = v => v != null ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—';
const fmtVol = v => { const n = Number(v); if (!n) return '—'; if (n >= 1e9) return `${(n/1e9).toFixed(1)}B`; if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n/1e3).toFixed(0)}K`; return String(n); };
const fmtN   = (v, d = 1) => (v != null && !isNaN(v)) ? Number(v).toFixed(d) : '—';
const fmt2   = v => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Fibonacci metadata ────────────────────────────────────────────────────────
const FIB_META = [
  { ratio: 0.0,   color: '#6b7280' },
  { ratio: 0.236, color: '#3b82f6' },
  { ratio: 0.382, color: '#22d3ee' },
  { ratio: 0.5,   color: '#a78bfa' },
  { ratio: 0.618, color: '#f59e0b' },
  { ratio: 0.786, color: '#f87171' },
  { ratio: 1.0,   color: '#6b7280' },
];

// ── İndikatör chip listesi (TestTerminalPage OV_CHIPS ile aynı) ───────────────
const OV_CHIPS = [
  { key: 'ema', label: 'Hareketli Ortalama', short: 'EMA', color: '#22d3ee' },
  { key: 'bb',  label: 'Bollinger Bantları',  short: 'BB',  color: '#a855f7' },
  { key: 'frm', label: 'Formasyon Bölgeleri', short: 'FRM', color: '#f59e0b' },
  { key: 'vol', label: 'Hacim',               short: 'VOL', color: '#34d399' },
  { key: 'fib', label: 'Fibonacci',            short: 'FIB', color: '#f97316' },
];

// ── renderStatsGrid — TestTerminalPage ile aynı ───────────────────────────────
function renderStatsGrid(items, cols = 2) {
  const valid = items.filter(Boolean);
  if (!valid.length) return null;
  const half  = Math.ceil(valid.length / cols);
  const left  = valid.slice(0, half);
  const right  = cols > 1 ? valid.slice(half) : [];

  const renderItem = (it, key) => (
    <div key={key} style={{ marginBottom: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span style={{ fontSize: FS.micro, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.04em', whiteSpace: 'nowrap', lineHeight: 1.4, textTransform: 'uppercase' }}>
          {it.label}
        </span>
        <span style={{ fontSize: FS.micro, fontWeight: 900, color: it.color || 'rgba(255,255,255,0.7)', fontFamily: S.mono, whiteSpace: 'nowrap', lineHeight: 1.4, textAlign: 'right' }}>
          {it.value}
        </span>
      </div>
      {it.bar != null && (
        <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, it.bar * 100)}%`, background: it.barColor || it.color || S.primary, borderRadius: 2 }} />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: SP[3] }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {left.map((it, i) => renderItem(it, `l${i}`))}
      </div>
      {right.length > 0 && (
        <>
          <div style={{ width: 1, background: S.border0, alignSelf: 'stretch', margin: '0 4px', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {right.map((it, i) => renderItem(it, `r${i}`))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export function PortfolioChartPanel({ onClose, holding }) {
  const selectedSymbol = useScanStore(s => s.selectedSymbol);
  const selectedItem   = useScanStore(s => s.selectedItem);
  const results        = useScanStore(s => s.results);
  const activeProfile  = useScanStore(s => s.profile);

  const chartRef = useRef(null);

  const [ov, setOv]               = useState({ ema: true, bb: false, frm: false, vol: true, fib: false });
  const [period, setPeriod]       = useState('3A');
  const [chartType, setChartType] = useState('candle');
  const [plotlyReady, setPlotlyReady] = useState(!!window.Plotly);
  const [renderError, setRenderError] = useState(null);
  const [funData, setFunData]     = useState(null);

  const toggleOv = useCallback(key => setOv(prev => ({ ...prev, [key]: !prev[key] })), []);

  const PERIOD_MAP = { '3A': '3M', '6A': '6M' };
  const symbolToUse = selectedSymbol || 'XU100';

  // Şirket adı ve sektör
  const co     = selectedItem?.Şirket ?? selectedItem?.company ?? selectedItem?.short_name ?? null;
  const sector = selectedItem?.Sektör ?? selectedItem?.sector ?? null;

  // Tarama verisi
  const storeRow = results?.find(r =>
    (r.Sembol || r.symbol || '').toString().toUpperCase() === symbolToUse?.toUpperCase()
  );
  const ml   = storeRow?.ml_score ?? null;
  const qrs  = storeRow?.yzdsh    ?? null;
  const rsi  = storeRow?.RSI      ?? storeRow?.rsi ?? null;
  const vol  = storeRow?.Hacim    ?? storeRow?.volume ?? 0;
  const vrat = storeRow?.volume_ratio != null ? Number(storeRow.volume_ratio) : null;
  const w52  = storeRow?.w52_position != null ? Math.round(Number(storeRow.w52_position) * 100)
             : selectedItem?.w52_position != null ? Math.round(Number(selectedItem.w52_position) * 100) : null;
  const days = storeRow?.signal_age_days ?? selectedItem?.signal_age_days ?? null;

  // Chart API
  const { data: chartData, isLoading, isError } = useQuery({
    queryKey: ['chart', symbolToUse, chartType, PERIOD_MAP[period] || '6M', ml, qrs, activeProfile],
    queryFn: ({ signal }) => api.chart(symbolToUse, chartType, PERIOD_MAP[period] || '6M', ml, qrs, activeProfile, signal),
    enabled: !!symbolToUse && plotlyReady,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 3 * 60_000,
  });

  const last = chartData?.last_close ?? storeRow?.close ?? storeRow?.Fiyat ?? null;
  const chg  = chartData?.change_pct ?? storeRow?.change_pct ?? storeRow?.Değişim ?? 0;
  const pos  = Number(chg) >= 0;

  // Hedef / Destek — storeRow > selectedItem > ai_vision sıralamasıyla
  const av   = chartData?.ai_vision ?? {};
  const tgt  = storeRow?.target_price ?? selectedItem?.target_price ?? av?.setup?.target ?? null;
  const sup  = storeRow?.stop_price   ?? selectedItem?.stop_price   ?? av?.setup?.stop_loss ?? null;
  const rrRatio = (() => {
    if (tgt == null || sup == null || !last) return null;
    const risk = Math.abs(Number(last) - Number(sup));
    const reward = Math.abs(Number(tgt) - Number(last));
    return risk > 0 ? (reward / risk).toFixed(1) : null;
  })();

  // Fundamentals
  useEffect(() => {
    if (!symbolToUse) return;
    api.fundamentals(symbolToUse)
      .then(d => setFunData(d && !d.status ? d : null))
      .catch(() => {});
  }, [symbolToUse]);

  // Plotly yükleme
  useEffect(() => {
    if (window.Plotly) { setPlotlyReady(true); return; }
    loadPlotly().then(() => setPlotlyReady(true)).catch(e => setRenderError(e.message));
  }, []);

  // Grafik render
  const renderChart = useCallback(() => {
    const Plotly = window.Plotly;
    if (!chartRef.current || !Plotly || !chartData) return;
    Plotly.purge(chartRef.current);
    setRenderError(null);

    const fig = chartData.figure;
    if (!fig || !Array.isArray(fig.data) || !fig.data.length) return;

    const _av    = chartData.ai_vision ?? {};
    const _stale = _av.is_stale ?? false;
    const shapes = [];

    if (ov.frm) {
      (_av.patterns || []).forEach(p => {
        if (!p.x0 || !p.x1 || p.y0 == null || p.y1 == null) return;
        if (String(p.x0).includes('NaN') || String(p.x1).includes('NaN')) return;
        const isRes = (p.name || '').toLowerCase().includes('resistance') || (p.name || '').includes('direnç');
        shapes.push({ type: 'line', x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, xref: 'x', yref: 'y', line: { color: isRes ? '#FF2A6D' : '#05D9E8', width: _stale ? 1.5 : 2.5, dash: _stale ? 'dash' : 'solid' }, opacity: _stale ? 0.45 : 1.0 });
      });
    }

    if (ov.fib) {
      (_av.fibonacci_shapes || []).forEach(f => {
        if (f.fib_ratio == null) return;
        const m = FIB_META.find(x => Math.abs(x.ratio - f.fib_ratio) < 0.01);
        if (!m || !f.x0 || !f.x1 || f.y0 == null) return;
        shapes.push({ type: 'line', x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, xref: 'x', yref: 'y', line: { color: m.color, width: [0.382, 0.5, 0.618].includes(m.ratio) ? 2.5 : 1.5, dash: [0.382, 0.5, 0.618].includes(m.ratio) ? 'dash' : 'dot' }, opacity: 0.7 });
      });
    }

    const activeData = fig.data.map(t => {
      const name = t.name || '';
      let visible = true;
      if      (/EMA/i.test(name))    visible = ov.ema;
      else if (/BB\s/i.test(name))   visible = ov.bb;
      else if (/Hacim/i.test(name))  visible = ov.vol;
      else if (/RSI/i.test(name))    visible = false;
      else if (/MACD|Sinyal/i.test(name)) visible = false;
      return { ...t, visible };
    });

    const data = activeData.map(t => {
      if (t.type === 'candlestick') return { ...t, increasing: { line: { color: '#22d3ee', width: 1 }, fillcolor: 'rgba(34,211,238,0.9)' }, decreasing: { line: { color: '#f87171', width: 1 }, fillcolor: 'rgba(248,113,113,0.9)' }, whiskerwidth: 0.4, hoverinfo: 'none' };
      if (t.name === 'Fiyat' && t.type === 'scatter') return { ...t, fill: 'tozeroy', fillcolor: 'rgba(34,211,238,0.05)', line: { color: '#22d3ee', width: 1.5 }, hoverinfo: 'none' };
      return { ...t, hoverinfo: 'none' };
    });

    const xArr   = data[0]?.x || [];
    const total  = xArr.length;
    const lookback = period === '3A' ? 65 : 130;
    const startIdx = Math.max(0, total - lookback);
    const xRange   = total > 0 ? [xArr[startIdx], xArr[total - 1]] : undefined;

    let yRange = null;
    if (total > 0 && xRange) {
      let minV = Infinity, maxV = -Infinity;
      data.filter(t => t.type === 'candlestick' || t.name === 'Fiyat').forEach(t => {
        const vals = t.type === 'candlestick' ? [...(t.low || []), ...(t.high || [])] : (t.y || []);
        vals.slice(startIdx, total).filter(v => v != null && !isNaN(v)).forEach(v => { minV = Math.min(minV, v); maxV = Math.max(maxV, v); });
      });
      if (minV !== Infinity) { const pad = (maxV - minV) * 0.22; yRange = [minV - pad, maxV + pad]; }
    }

    const axisBase = { gridcolor: 'rgba(255,255,255,0.03)', linecolor: 'rgba(255,255,255,0.05)', tickcolor: 'rgba(0,0,0,0)', tickfont: { size: 9, color: 'rgba(255,255,255,0.18)', family: S.mono }, showspikes: true, spikemode: 'across', spikethickness: 1, spikecolor: 'rgba(255,255,255,0.12)', spikesnap: 'cursor', rangeslider: { visible: false } };

    const showVol = ov.vol;
    const layout = {
      paper_bgcolor: 'transparent',
      plot_bgcolor:  S.bg0,
      autosize: true,
      showlegend: false,
      margin: { t: 4, l: 0, r: 48, b: 2 },
      shapes,
      dragmode: false,
      hovermode: 'x',
      hoverlabel: { bgcolor: 'rgba(9,11,17,0.99)', bordercolor: 'rgba(255,255,255,0.1)', align: 'left', font: { size: 12, color: '#f3f4f6', family: S.mono } },
      annotations: [],
      yaxis:  { ...axisBase, side: 'right', autorange: !yRange, range: yRange || undefined, fixedrange: true, domain: showVol ? [0.22, 1.0] : [0, 1.0] },
      yaxis2: showVol ? { ...axisBase, side: 'right', autorange: true, fixedrange: true, domain: [0, 0.18], visible: true } : { visible: false },
      yaxis3: { visible: false }, yaxis4: { visible: false },
    };
    const masterAx = { ...axisBase, type: 'date', showticklabels: true, nticks: 5 };
    if (xRange) {
      layout.xaxis  = { ...masterAx, range: xRange, autorange: false, fixedrange: true, showticklabels: !showVol };
      layout.xaxis2 = showVol ? { ...masterAx, range: xRange, autorange: false, fixedrange: true, showticklabels: true } : { visible: false };
    }

    try {
      window.Plotly.newPlot(chartRef.current, data, layout, { responsive: true, displayModeBar: false, scrollZoom: true, displaylogo: false });
    } catch (e) { setRenderError(e.message); }

    const obs = new ResizeObserver(() => { if (chartRef.current && window.Plotly) window.Plotly.Plots.resize(chartRef.current); });
    if (chartRef.current) obs.observe(chartRef.current);
    return () => obs.disconnect();
  }, [chartData, chartType, period, ov, plotlyReady]);

  useEffect(() => { return renderChart(); }, [renderChart]);

  /* ── RENDER ──────────────────────────────────────────────────────────────── */
  return (
    <div data-pcp style={{ display: 'flex', flexDirection: 'column', background: S.bg1, border: `1px solid ${S.border0}`, borderRadius: 8, overflow: 'hidden', height: '100%' }}>
      <style>{`[data-pcp] button{outline:none!important;-webkit-appearance:none;appearance:none;box-shadow:none}`}</style>

      {/* ── Başlık ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: `${SP[2]}px ${SP[3]}px`, borderBottom: `1px solid ${S.border0}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: SP[2], minHeight: 42 }}>
        <TickerLogo ticker={symbolToUse} size="lg" />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1, gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: SP[2] }}>
            <span style={{ fontSize: FS.lg, fontWeight: 900, fontFamily: S.mono, color: '#fff', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              {symbolToUse}
            </span>
            {co && co !== symbolToUse && (
              <span style={{ fontSize: FS.xs, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co}</span>
            )}
          </div>
          {sector && (
            <span style={{ fontSize: FS.micro, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{sector}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP[2], flexShrink: 0 }}>
          <span style={{ fontSize: FS.xl, fontWeight: 900, fontFamily: S.mono, color: '#fff', lineHeight: 1 }}>
            {fmtPrc(last)}
          </span>
          <span style={{ fontSize: FS.sm, fontWeight: 800, fontFamily: S.mono, color: pos ? S.positive : S.negative, padding: `2px ${SP[2]}px`, borderRadius: 3, background: pos ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${pos ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`, whiteSpace: 'nowrap' }}>
            {fmtPct(chg)}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 4, border: `1px solid ${S.border0}`, background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: S.mono }}>
            ✕
          </button>
        )}
      </div>

      {/* ── Yasal uyarı banner ──────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: 'rgba(251,191,36,0.04)', borderBottom: '1px solid rgba(251,191,36,0.12)', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: FS.micro, color: 'rgba(251,191,36,0.45)', fontWeight: 900, letterSpacing: '0.1em', flexShrink: 0 }}>⚠</span>
        <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.03em', lineHeight: 1.4 }}>
          Bu platform yatırım danışmanlığı hizmeti vermez. Gösterilen tüm değerler algoritmik model çıktısıdır; yatırım kararı için kullanılamaz.
        </span>
      </div>

      {/* ── İndikatör toolbar ──────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, padding: `3px ${SP[3]}px`, borderBottom: `1px solid ${S.border0}`, background: S.bg0, overflowX: 'auto', overflowY: 'hidden' }}>
        {OV_CHIPS.map(({ key, label, short, color }) => {
          const on = ov[key];
          return (
            <button key={key} onClick={() => toggleOv(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0, border: `1px solid ${on ? color : 'rgba(255,255,255,0.10)'}`, background: on ? color + '1a' : 'transparent', transition: 'all 0.12s' }}>
              <span style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: on ? color : 'rgba(255,255,255,0.18)', boxShadow: on ? `0 0 4px ${color}` : 'none' }} />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', color: on ? color : 'rgba(255,255,255,0.28)', fontFamily: S.mono }}>{short}</span>
              <span style={{ fontSize: 10, fontWeight: 400, color: on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)', fontFamily: S.sans, whiteSpace: 'nowrap' }}>{label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* Grafik tipi */}
        <div style={{ display: 'flex', gap: 1, marginRight: 2 }}>
          {[{ k: 'candle', l: 'MUM' }, { k: 'line', l: 'ÇİZGİ' }].map(({ k, l }) => (
            <button key={k} onClick={() => setChartType(k)} style={{ padding: '2px 7px', borderRadius: 2, cursor: 'pointer', border: 'none', outline: 'none', WebkitAppearance: 'none', appearance: 'none', background: chartType === k ? 'rgba(153,247,255,0.08)' : 'transparent', fontSize: FS.micro, fontWeight: chartType === k ? 900 : 500, letterSpacing: '0.06em', fontFamily: S.mono, color: chartType === k ? S.primary : 'rgba(255,255,255,0.28)', transition: 'all 0.1s' }}>{l}</button>
          ))}
        </div>
        <span style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 2px', alignSelf: 'stretch', display: 'block' }} />
        {/* Periyot */}
        <div style={{ display: 'flex', gap: 1 }}>
          {['3A', '6A'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: '2px 5px', borderRadius: 2, cursor: 'pointer', border: 'none', outline: 'none', WebkitAppearance: 'none', appearance: 'none', background: period === p ? 'rgba(153,247,255,0.08)' : 'transparent', fontSize: FS.micro, fontWeight: period === p ? 900 : 500, letterSpacing: '0.06em', fontFamily: S.mono, color: period === p ? S.primary : 'rgba(255,255,255,0.28)', transition: 'all 0.1s' }}>{p}</button>
          ))}
        </div>
      </div>

      {/* ── Grafik alanı ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: S.bg0 }}>
        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, zIndex: 30 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(153,247,255,0.15)', borderTopColor: S.primary, animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <span style={{ fontSize: FS.micro, fontWeight: 900, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.3em', textTransform: 'uppercase' }}>Yükleniyor</span>
          </div>
        )}
        {isError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: FS.xs, color: 'rgba(255,255,255,0.25)' }}>Grafik yüklenemedi</span>
          </div>
        )}
        <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* ── Alt panel ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${S.border0}`, background: 'rgba(255,255,255,0.012)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>

          {/* TEKNİK */}
          <div style={{ borderRight: `1px solid ${S.border0}`, padding: '5px 8px' }}>
            <div style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)', marginBottom: 3 }}>TEKNİK</div>
            {renderStatsGrid([
              ml  != null ? { label: 'ML',       value: fmtN(ml),  color: colML(ml),  bar: ml  / 100, barColor: colML(ml)  } : null,
              qrs != null ? { label: 'QRS',      value: fmtN(qrs), color: colQRS(qrs), bar: qrs / 100, barColor: colQRS(qrs) } : null,
              rsi != null && rsi > 0 ? { label: 'RSI 14', value: fmtN(rsi), color: colRSI(rsi) } : null,
              days != null && days > 0 ? { label: 'Sinyal Yaşı', value: `~${days}g`, color: days <= 3 ? S.positive : days <= 7 ? S.amber : 'rgba(255,255,255,0.4)' } : null,
              vrat != null && vrat > 0 ? { label: 'Hac/Ort', value: `${vrat.toFixed(1)}x`, color: vrat >= 2 ? S.positive : vrat >= 1 ? S.amber : 'rgba(255,255,255,0.35)' } : null,
              w52  != null ? { label: '52H Poz', value: `%${w52}`, color: w52 >= 70 ? S.positive : w52 <= 30 ? S.negative : S.amber } : null,
            ], 2)}
          </div>

          {/* FİYAT & HACİM */}
          <div style={{ borderRight: `1px solid ${S.border0}`, padding: '5px 8px' }}>
            <div style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)', marginBottom: 3 }}>FİYAT & HACİM</div>
            {renderStatsGrid([
              funData?.prev_close > 0 ? { label: 'Ö.Kpn',   value: fmtPrc(funData.prev_close) } : null,
              funData?.day_low > 0 && funData?.day_high > 0 ? { label: 'Gün', value: `${fmtPrc(funData.day_low)}–${fmtPrc(funData.day_high)}` } : null,
              funData?.week52_low > 0 && funData?.week52_high > 0 ? { label: '52H', value: `${fmtPrc(funData.week52_low)}–${fmtPrc(funData.week52_high)}` } : null,
              vol > 0 ? { label: 'Hacim',   value: fmtVol(vol) } : null,
              funData?.avg_volume > 0 ? { label: 'Ort.Hcm', value: fmtVol(funData.avg_volume) } : null,
              tgt != null
                ? { label: 'Hedef',  value: `${fmtPrc(tgt)}${rrRatio ? ` · 1:${rrRatio}` : ''}`, color: S.positive }
                : sup != null
                  ? { label: 'Destek', value: fmtPrc(sup), color: S.negative }
                  : null,
            ], 2)}
          </div>

          {/* PORTFÖY */}
          <div style={{ padding: '5px 8px' }}>
            <div style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)', marginBottom: 3 }}>PORTFÖY</div>
            {holding
              ? renderStatsGrid([
                  { label: 'ADET',    value: `${holding.qty} lot` },
                  { label: 'MALİYET', value: fmtPrc(holding.avgCost) },
                  holding.pnlPct != null ? { label: 'K/Z', value: `${holding.pnlPct >= 0 ? '+' : ''}${holding.pnlPct.toFixed(2)}%`, color: holding.pnlPct >= 0 ? S.positive : S.negative } : null,
                  holding.pnl    != null ? { label: 'NET', value: `₺${fmt2(Math.abs(holding.pnl))}`, color: holding.pnl >= 0 ? S.positive : S.negative } : null,
                ].filter(Boolean), 1)
              : <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.15)', fontStyle: 'italic' }}>Portföyde değil</span>
            }
          </div>

        </div>
      </div>
    </div>
  );
}

export default PortfolioChartPanel;
