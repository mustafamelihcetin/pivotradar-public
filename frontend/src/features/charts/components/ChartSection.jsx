import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../../../core/api/client';
import { useScanStore } from '../../../core/store/useScanStore';
import { InfoTip } from '../../../shared/components/InfoTip';
import { SkeletonChart } from '../../../shared/components/Skeleton';
import { cn } from '@/shared/utils/cn';
import { motion } from 'framer-motion';
import { RefreshCw, TrendingUp, TrendingDown, Clock, Repeat } from 'lucide-react';

/* ── Lazy Plotly Loader ────────────────────────────────────────────
 * Plotly.js (1,074 KiB) yalnızca ChartSection render edildiğinde
 * dinamik olarak yüklenir. Landing page'de hiç indirilmez.
 * Bu sayede LCP, TBT ve FCP önemli ölçüde iyileşir.
 * ─────────────────────────────────────────────────────────────── */
let plotlyLoadPromise = null;
export function loadPlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (plotlyLoadPromise) return plotlyLoadPromise;
  plotlyLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/plotly.min.js';
    script.charset = 'utf-8';
    script.async = true;
    script.onload = () => resolve(window.Plotly);
    script.onerror = () => { plotlyLoadPromise = null; reject(new Error('Plotly yüklenemedi')); };
    document.head.appendChild(script);
  });
  return plotlyLoadPromise;
}

// Fibonacci level meta
const FIB_META = [
  { ratio: 0.0,   label: 'Tepe',      short: '0%',     color: '#6b7280' },
  { ratio: 0.236, label: 'Fib 23.6%', short: '23.6%',  color: '#3b82f6' },
  { ratio: 0.382, label: 'Fib 38.2%', short: '38.2%',  color: '#22d3ee' },
  { ratio: 0.5,   label: 'Fib 50.0%', short: '50.0%',  color: '#a78bfa' },
  { ratio: 0.618, label: 'Fib 61.8%', short: '61.8%',  color: '#f59e0b' },
  { ratio: 0.786, label: 'Fib 78.6%', short: '78.6%',  color: '#f87171' },
  { ratio: 1.0,   label: 'Dip',       short: '100%',   color: '#6b7280' },
];

const NONE_TYPE = 'Formasyon Yok';

// Toolbar actions
const TOOLBAR = [
  { id: 'zoom_in',    label: 'Yakınlaştır', icon: 'zoom_in' },
  { id: 'zoom_out',   label: 'Uzaklaştır',  icon: 'zoom_out' },
  { id: 'pan',        label: 'Kaydır',      icon: 'pan_tool' },
  { id: 'reset',      label: 'Sıfırla',     icon: 'fit_screen' },
  { id: 'fullscreen', label: 'Tam Ekran',   icon: 'fullscreen' },
];

const PERIODS = [
  { id: '3M',  label: '3 Ay' },
  { id: '6M',  label: '6 Ay' },
];

export const ChartSection = React.memo(function ChartSection() {
  const results           = useScanStore(s => s.results);
  const selectedSymbol    = useScanStore(s => s.selectedSymbol);
  const selectedItem      = useScanStore(s => s.selectedItem);  // scan row → authoritative price source
  const chartMode         = useScanStore(s => s.chartMode);
  const setChartMode      = useScanStore(s => s.setChartMode);
  const aiVisionOn        = useScanStore(s => s.aiVisionOn);
  const toggleAiVision    = useScanStore(s => s.toggleAiVision);
  const activeProfile     = useScanStore(s => s.profile);   // user's active strategy profile
  const updateSymbolClose = useScanStore(s => s.updateSymbolClose);

  const chartRef  = useRef(null);
  const sectionRef = useRef(null);
  const isClamping = useRef(false);
  const [renderError, setRenderError] = useState(null);
  const [toolbarMode, setToolbarMode] = useState(null); // 'pan' | null
  const [period, setPeriod] = useState('6M');
  const [plotlyReady, setPlotlyReady] = useState(!!window.Plotly);
  const [hoveredData, setHoveredData] = useState(null);

  // Lazy-load Plotly when ChartSection mounts
  useEffect(() => {
    if (window.Plotly) { setPlotlyReady(true); return; }
    loadPlotly()
      .then(() => setPlotlyReady(true))
      .catch(err => setRenderError(err.message));
  }, []);

  // Indicator filters (V7: Defaults improved for "it works" feel)
  const [activeFilters, setActiveFilters] = useState(['EMA', 'BB']);
  
  const toggleFilter = useCallback((id) => {
    setActiveFilters(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  // Fibonacci level toggles — golden-ratio trio (38.2, 50, 61.8) on by default
  const [fibEnabled, setFibEnabled] = useState(
    () => Object.fromEntries(FIB_META.map(f => [f.ratio, [0.382, 0.5, 0.618].includes(f.ratio)]))
  );

  const toggleFib = useCallback((ratio) => {
    setFibEnabled(prev => ({ ...prev, [ratio]: !prev[ratio] }));
  }, []);

  const symbolToUse = selectedSymbol || 'XU100';

  // 1. Find scan result row for this symbol — field is 'ml_score' and 'yzdsh' (not 'ML'/'QRS')
  const storeRow = results?.find(r =>
    (r.Sembol || r.symbol || '').toString().toUpperCase() === symbolToUse?.toUpperCase()
  );
  const storeMl  = storeRow?.ml_score ?? null;   // fixed: was storeRow?.ML (undefined)
  const storeQrs = storeRow?.yzdsh    ?? null;   // blended QRS score (0-100)

  // Stabilise ml/qrs for queryKey — null→value transition must not bust cache
  const stableMl  = useRef(storeMl);
  const stableQrs = useRef(storeQrs);
  if (storeMl  != null) stableMl.current  = storeMl;
  if (storeQrs != null) stableQrs.current = storeQrs;

  // 2. Fetch chart data.
  const { data: chartData, isLoading, isFetching, isError } = useQuery({
    queryKey: ['chart', symbolToUse, chartMode, period, stableMl.current, stableQrs.current, activeProfile],
    queryFn: ({ signal }) => api.chart(symbolToUse, chartMode, period, stableMl.current, stableQrs.current, activeProfile, signal),
    enabled: !!symbolToUse,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 3 * 60_000,
    placeholderData: keepPreviousData,
  });

  const mlScoreForSymbol  = storeMl;
  const qrsScoreForSymbol = storeQrs;

  const handleToolbar = useCallback((id) => {
    const Plotly = window.Plotly;
    const el = chartRef.current;
    if (!el || !Plotly || !el._fullLayout) return;

    if (id === 'zoom_in' || id === 'zoom_out') {
      const layout = el._fullLayout;
      if (!layout?.xaxis?.range) return;
      const xr = layout.xaxis.range;
      const t0 = new Date(xr[0]).getTime();
      const t1 = new Date(xr[1]).getTime();
      if (isNaN(t0) || isNaN(t1)) return;
      
      const mid   = (t0 + t1) / 2;
      const span  = t1 - t0;
      const factor = id === 'zoom_in' ? 0.7 : 1.4;
      const half  = (span * factor) / 2;
      
      Plotly.relayout(el, {
        'xaxis.range': [new Date(mid - half).toISOString().split('T')[0], new Date(mid + half).toISOString().split('T')[0]],
        'yaxis.autorange': true,
      });
    } else if (id === 'pan') {
      setToolbarMode(prev => {
        const next = prev === 'pan' ? null : 'pan';
        const isPan = next === 'pan';
        Plotly.relayout(el, { 
          dragmode: isPan ? 'pan' : false,
          'xaxis.fixedrange': !isPan,
          'yaxis.fixedrange': !isPan,
          'yaxis2.fixedrange': !isPan,
          'yaxis3.fixedrange': !isPan,
          'yaxis4.fixedrange': !isPan,
          'xaxis2.fixedrange': !isPan,
          'xaxis3.fixedrange': !isPan,
          'xaxis4.fixedrange': !isPan,
        });
        return next;
      });
    } else if (id === 'reset') {
      // Restore default zoom based on CURRENT period instead of hardcoded 6M
      const Plotly = window.Plotly;
      const el = chartRef.current;
      if (!el || !Plotly || !el._fullLayout) return;

      setToolbarMode(null);
      
      // Calculate bars from period
      const xArr = chartData?.figure?.data?.[0]?.x || [];
      const total = xArr.length;
      let lookback = period === '3M' ? 65 : 130;
      const startIdx = Math.max(0, total - lookback);
      const newRange = total > 0 ? [xArr[startIdx], xArr[total - 1]] : null;

      isClamping.current = true;
      const relayoutUpdate = { 
        'xaxis.autorange': false,
        'yaxis.autorange': true,
        dragmode: false,
        'xaxis.fixedrange': true,
        'yaxis.fixedrange': true,
        'yaxis2.fixedrange': true,
        'yaxis3.fixedrange': true,
        'yaxis4.fixedrange': true,
      };
      if (newRange) relayoutUpdate['xaxis.range'] = newRange;

      Plotly.relayout(el, relayoutUpdate).finally(() => {
        isClamping.current = false;
      });
    } else if (id === 'fullscreen') {
      const target = sectionRef.current;
      if (!target) return;
      if (!document.fullscreenElement) {
        target.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }
  }, []);

  const renderChart = useCallback(() => {
    const Plotly = window.Plotly;
    if (!chartRef.current || !Plotly) return;
    Plotly.purge(chartRef.current);
    setRenderError(null);

    if (!chartData || chartData.status === 'error') return;
    const fig = chartData.figure;
    if (!fig || !Array.isArray(fig.data) || !fig.data.length) return;

    const isMobile = window.innerWidth < 640;

    // ── Shapes: trendlines (pattern) ──
    const shapes = [];

    if (aiVisionOn) {
      const _aiV = chartData.ai_vision ?? {};
      const _isStaleChart = _aiV.is_stale ?? false;

      // Birincil formasyon çizgileri — bayatsa soluk + kesik
      const pats = _aiV.patterns || [];
      pats.forEach(p => {
        if (!p.x0 || !p.x1 || p.y0 == null || p.y1 == null) return;
        if (String(p.x0).includes('NaN') || String(p.x1).includes('NaN')) return;
        const isRes = (p.name || '').toLowerCase().includes('resistance') || (p.name || '').includes('direnç');
        const baseColor = isRes ? '#FF2A6D' : '#05D9E8';
        shapes.push({
          type: 'line', x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, xref: 'x', yref: 'y',
          line: {
            color: baseColor,
            width: _isStaleChart ? 1.5 : 2.5,
            dash: p.line?.dash || (_isStaleChart ? 'dash' : 'solid'),
          },
          opacity: _isStaleChart ? 0.45 : 1.0,
        });
      });

      // İkincil formasyon çizgileri (geometrik) — noktali hafif çizgi
      const secPats = _aiV.secondary_pattern?.patterns || [];
      secPats.forEach(p => {
        if (!p.x0 || !p.x1 || p.y0 == null || p.y1 == null) return;
        if (String(p.x0).includes('NaN') || String(p.x1).includes('NaN')) return;
        shapes.push({
          type: 'line', x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, xref: 'x', yref: 'y',
          line: { color: p.line?.color || '#6b7280', width: 1.2, dash: 'dot' },
          opacity: 0.55,
        });
      });

      // Fibonacci horizontal lines — fuzzy matching to handle float precision differences
      const KEY_FIB = new Set([0.382, 0.5, 0.618]);
      const fibShapes = chartData.ai_vision?.fibonacci_shapes || [];
      fibShapes.forEach(f => {
        if (f.fib_ratio == null) return;
        
        // Find matching ratio in state with 0.01 tolerance
        const matchedMeta = FIB_META.find(m => Math.abs(m.ratio - f.fib_ratio) < 0.01);
        if (!matchedMeta || !fibEnabled[matchedMeta.ratio]) return;

        if (!f.x0 || !f.x1 || f.y0 == null) return;
        if (String(f.x0).includes('NaN') || String(f.x1).includes('NaN')) return;
        const isKey = KEY_FIB.has(matchedMeta.ratio);
        shapes.push({
          type: 'line', x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, xref: 'x', yref: 'y',
          line: { 
            color: matchedMeta.color || '#94a3b8', 
            width: isKey ? 3 : 2, 
            dash: isKey ? 'dash' : 'dot' 
          },
          opacity: 0.7,  // Slightly pale as per user request
        });
      });
    }

    // ── V7: Use visibility instead of filtering to keep subplot containers stable ──
    const activeData = fig.data.map(t => {
      const name = t.name || '';
      let isVisible = true;
      if (name.includes('EMA')) isVisible = activeFilters.includes('EMA');
      else if (name.includes('BB'))  isVisible = activeFilters.includes('BB');
      else if (name.includes('Hacim') || name === 'Hacim') isVisible = activeFilters.includes('VOL');
      else if (name.includes('RSI') || name === 'RSI')   isVisible = activeFilters.includes('RSI');
      else if (name.includes('MACD') || name.includes('Sinyal')) isVisible = activeFilters.includes('MACD');
      
      // ── Smart Labeling (Turkish) ──
      let displayName = name;
      if (name.includes('BB Upper')) displayName = 'BOLL. ÜST';
      else if (name.includes('BB Mid'))   displayName = 'BOLL. ORTA';
      else if (name.includes('BB Lower')) displayName = 'BOLL. ALT';
      else if (name.includes('EMA 5'))    displayName = 'EMA 5 (Kısa)';
      else if (name.includes('EMA 20'))   displayName = 'EMA 20 (Orta)';
      else if (name.includes('Hacim'))    displayName = 'HACİM';
      else if (name === 'Sinyal')         displayName = 'SİNYAL';
      
      return { ...t, visible: isVisible, name: displayName };
    });

    // ── Style traces ──
    const data = activeData.map(trace => {
      if (trace.type === 'candlestick') {
        return {
          ...trace,
          increasing: { line: { color: '#22d3ee', width: 1 }, fillcolor: 'rgba(34,211,238,0.9)' },
          decreasing: { line: { color: '#f87171', width: 1 }, fillcolor: 'rgba(248,113,113,0.9)' },
          whiskerwidth: 0.4,
          hoverinfo: 'none',
        };
      }
      if (trace.name === 'Fiyat' && trace.type === 'scatter') {
        return {
          ...trace, fill: 'tozeroy', fillcolor: 'rgba(34,211,238,0.05)',
          line: { color: '#22d3ee', width: 1.5 },
          hoverinfo: 'none',
        };
      }
      if (trace.name === 'EMA 5')  return { ...trace, line: { color: 'rgba(148,163,184,0.5)', width: 1 }, hovertemplate: 'EMA5: %{y:.2f}<extra></extra>' };
      if (trace.name === 'EMA 20') return { ...trace, line: { color: 'rgba(251,191,36,0.6)',  width: 1 }, hovertemplate: 'EMA20: %{y:.2f}<extra></extra>' };
      // ── Default for all other tracers ──
      return { ...trace, hoverinfo: 'none' };
    });

    // ── V19: Dynamic Zoom Scale (Infinite History Support) ──
    const xArr = data[0]?.x || (fig?.data?.[0]?.x || []);
    const total = xArr.length;
    
    // Calculate range based on period (3M=~65, 6M=~130 trading days approx)
    let lookbackBars = 120; // Default fallback
    if (period === '3M')      lookbackBars = 65;
    else if (period === '6M') lookbackBars = 130;
    
    const startIdx = Math.max(0, total - lookbackBars);
    const xRange = total > 0 ? [xArr[startIdx], xArr[total - 1]] : undefined;

    // ── V29: Smart Y-Scale (Visible Auto-Scaling) ──
    // Calculate the best vertical range for the CURRENT window
    let yRange = null;
    if (total > 0 && xRange) {
        const visibleCandles = data.filter(t => t.type === 'candlestick' || t.name === 'Fiyat');
        let minVal = Infinity;
        let maxVal = -Infinity;
        
        visibleCandles.forEach(trace => {
            const vals = (trace.type === 'candlestick') 
                ? [...(trace.low || []), ...(trace.high || [])]
                : (trace.y || []);
            
            // Only look at values within the current startIdx to total range
            const windowVals = vals.slice(startIdx, total).filter(v => v != null && !isNaN(v));
            if (windowVals.length > 0) {
                minVal = Math.min(minVal, ...windowVals);
                maxVal = Math.max(maxVal, ...windowVals);
            }
        });

        // Fallback to EMAs if they are on chart to ensure they don't blow out the scale
        if (activeFilters.includes('EMA')) {
            data.forEach(t => {
                if (t.name?.includes('EMA')) {
                    const windowVals = (t.y || []).slice(startIdx, total).filter(v => v != null && !isNaN(v));
                    if (windowVals.length > 0) {
                        minVal = Math.min(minVal, ...windowVals);
                        maxVal = Math.max(maxVal, ...windowVals);
                    }
                }
            });
        }

        if (minVal !== Infinity && maxVal !== -Infinity) {
            // Expand range to include active Fibonacci levels
            if (aiVisionOn) {
              const fibShapes = chartData.ai_vision?.fibonacci_shapes || [];
              fibShapes.forEach(f => {
                const matchedMeta = FIB_META.find(m => Math.abs(m.ratio - f.fib_ratio) < 0.01);
                if (matchedMeta && fibEnabled[matchedMeta.ratio] && f.y0 != null) {
                  minVal = Math.min(minVal, f.y0);
                  maxVal = Math.max(maxVal, f.y0);
                }
              });
            }

            const padding = (maxVal - minVal) * 0.22; // 22% padding for institutional breathing room
            yRange = [minVal - padding, maxVal + padding];
        }
    }

    const axisBase = {
      gridcolor: 'rgba(255,255,255,0.02)',
      linecolor: 'rgba(255,255,255,0.04)',
      tickcolor: 'rgba(0,0,0,0)',
      tickfont: { size: 9, color: 'rgba(255,255,255,0.25)', family: '"IBM Plex Mono", monospace' },
      showspikes: true, spikemode: 'across', spikethickness: 1, spikecolor: 'rgba(255,255,255,0.15)', spikesnap: 'cursor',
      rangeslider: { visible: false },
    };
    
    const masterDateAxis = { 
      ...axisBase, 
      type: 'date', 
      showticklabels: true,
      tickangle: 0,
      nticks: 6,
    };

    // ── V15: Preserving Subplot layout indices (Prevent "Axis Soup") ──
    const layout = {
      template: 'plotly_dark',
      ...fig.layout, // Keep essential structure from backend
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      autosize: true,
      showlegend: false,
      margin: isMobile ? { t: 4, l: 0, r: 52, b: 32 } : { t: 8, l: 0, r: 60, b: 44 },
      shapes,
      dragmode: toolbarMode === 'pan' ? 'pan' : false,
      hovermode: 'x',
      hoverlabel: {
        bgcolor: 'rgba(9, 11, 17, 0.99)',
        bordercolor: 'rgba(255,255,255,0.1)',
        align: 'left',
        font: { size: 13, color: '#f3f4f6', family: '"IBM Plex Mono", monospace' },
        padding: { t: 10, b: 10, l: 15, r: 15 },
      },
      annotations: [],
    };

    // ── V17: Subplot Labels ──
    const labelStyle = {
      font: { size: 10, color: 'rgba(255,255,255,0.3)', family: '"IBM Plex Mono", monospace' },
      showarrow: false, x: 0, y: 1, xanchor: 'left', yanchor: 'top', xref: 'paper',
    };

    layout.annotations.push({ ...labelStyle, text: 'FİYAT / TREND', yref: 'paper', y: 0.98, x: 0.005 });

    // ── V16: Dynamic Domain Calculation (No Empty Containers) ──
    const activeSubplots = [];
    if (activeFilters.includes('VOL')) activeSubplots.push('yaxis2');
    if (activeFilters.includes('RSI')) activeSubplots.push('yaxis3');
    if (activeFilters.includes('MACD')) activeSubplots.push('yaxis4');

    const n = activeSubplots.length;
    const subHeight = 0.15;
    const subGap = 0.05;
    const totalSubHeight = n > 0 ? (n * subHeight) + (n * subGap) : 0;

    // Row 1 (Price) gets the remainder
    layout.yaxis = { 
      ...layout.yaxis, ...axisBase, side: 'right', autorange: !yRange, 
      range: yRange || undefined,
      fixedrange: toolbarMode !== 'pan',
      domain: [totalSubHeight, 1.0]
    };

    // Subplots stack from bottom upwards
    activeSubplots.forEach((yid, i) => {
      // Index i = 0 (first in list) is at bottom + whatever gap
      // Actually let's stack them as RSI/MACD at bottom
      const revIndex = n - 1 - i; 
      const start = revIndex * (subHeight + subGap);
        layout[yid] = { 
          ...layout[yid], ...axisBase, side: 'right', 
          autorange: true, 
          fixedrange: true, // Indicators always auto-scale their own range
          domain: [start, start + subHeight],
          visible: true
        };
      // Add text label inside subplot
      const name = yid === 'yaxis2' ? 'HACİM' : (yid === 'yaxis3' ? 'RSI' : 'MACD');
      layout.annotations.push({ ...labelStyle, text: name, yref: `${yid.replace('yaxis', 'y')} domain`, y: 0.95, x: 0.005 });
    });

    // Hide inactive axes to clear grid/labels
    ['yaxis2', 'yaxis3', 'yaxis4'].forEach(yid => {
      if (!activeSubplots.includes(yid)) {
        if (layout[yid]) layout[yid].visible = false;
      }
    });

    // Apply range + master axis styles
    if (xRange) {
      ['xaxis', 'xaxis2', 'xaxis3', 'xaxis4'].forEach(xid => {
        if (layout[xid]) {
          layout[xid] = {
            ...layout[xid], ...masterDateAxis, range: xRange, autorange: false,
            minallowed: xArr[0], maxallowed: xArr[total - 1],
            fixedrange: toolbarMode !== 'pan',
          };
          // X-axis label visibility: Only the very bottom active axis gets labels
          const myY = xid === 'xaxis' ? 'yaxis' : `yaxis${xid.slice(-1)}`;
          const isActive = xid === 'xaxis' || activeSubplots.includes(myY);
          
          // Only show tick labels on the lowest visible active axis
          const isLowest = n === 0 ? (xid === 'xaxis') : (myY === activeSubplots[n-1]);
          // Simplified: Always show on xaxis (top row) if n=0, OR if it's the bottom-most axis
          // Plotly's shared_xaxes handles synchronization, but we need to hide the ones in middle
          layout[xid].showticklabels = (xid === 'xaxis' && n === 0) || (xid === `xaxis${activeSubplots[n-1]?.slice(-1)}`);
        }
      });
    }
    // Special case for xaxis labels when stacked
    if (n > 0) {
      layout.xaxis.showticklabels = false;
      const bottomXid = `xaxis${activeSubplots[n-1].slice(-1)}`;
      if (layout[bottomXid]) layout[bottomXid].showticklabels = true;
    }

    try {
      window.Plotly.newPlot(chartRef.current, data, layout, {
        responsive: true,
        displayModeBar: false,
        scrollZoom: true,
        staticPlot: false,
        doubleClick: 'reset',
        showAxisDragHandles: isMobile,
        displaylogo: false,
        locale: 'tr',
        locales: {
          'tr': {
            module: 'locale',
            name: 'tr',
            dictionary: {
              'pan': 'Kaydır',
              'zoom_in': 'Yakınlaştır',
              'zoom_out': 'Uzaklaştır',
              'reset_scale': 'Sıfırla',
            },
            format: {
              months: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
              shortMonths: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
              days: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
              shortDays: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
            }
          }
        }
      }).then((el) => {
        if (el) {
          // ── V28: Dynamic HUD Synchronizer ──
          el.on('plotly_hover', (eventData) => {
            const points = eventData.points;
            if (!points || !points.length) return;
            
            const data = {
                date: points[0].x,
                price: {},
                indicators: []
            };

            points.forEach(p => {
                if (p.data.type === 'candlestick') {
                    data.price = { o: p.open, h: p.high, l: p.low, c: p.close };
                } else if (p.data.name && p.y != null) {
                    data.indicators.push({ name: p.data.name, val: p.y });
                }
            });
            setHoveredData(data);
          });

          el.on('plotly_unhover', () => {
             setHoveredData(null);
          });

          // ── V27: Absolute Panning Shield ──
          el.on('plotly_relayout', (event) => {
            if (isClamping.current || !el || !el._fullLayout) return;
            
            // Candidate ranges from the event
            const newX0 = event['xaxis.range[0]'] || event['xaxis.range']?.[0];
            const newX1 = event['xaxis.range[1]'] || event['xaxis.range']?.[1];
            const newY0 = event['yaxis.range[0]'] || event['yaxis.range']?.[0];
            const newY1 = event['yaxis.range[1]'] || event['yaxis.range']?.[1];
            
            if (!newX0 && !newX1 && !newY0 && !newY1) return;

            const dataX0 = new Date(xArr[0]).getTime();
            const dataX1 = new Date(xArr[total - 1]).getTime();

            // Y-Bound based on actual candlestick data
            const candle = data.find(t => t.type === 'candlestick');
            const dataYMin = Math.min(...(candle?.low || []).filter(v => v != null));
            const dataYMax = Math.max(...(candle?.high || []).filter(v => v != null));
            const ySpan = dataYMax - dataYMin;
            // Guardrail: Allow 1.5x vertical margin (Softer feel)
            const yMinB = dataYMin - (ySpan * 1.5);
            const yMaxB = dataYMax + (ySpan * 1.5);

            let needsClamp = false;
            let finalUpdate = { isCustomClamp: true };

            // X-Clamping (Prevent void)
            if (newX1 && new Date(newX1).getTime() > dataX1 + 43200000) {
               const diff = new Date(newX1).getTime() - dataX1;
               finalUpdate['xaxis.range'] = [new Date(new Date(newX0).getTime() - diff).toISOString(), xArr[total - 1]];
               needsClamp = true;
            } else if (newX0 && new Date(newX0).getTime() < dataX0 - 43200000) {
               const diff = dataX0 - new Date(newX0).getTime();
               finalUpdate['xaxis.range'] = [xArr[0], new Date(new Date(newX1).getTime() + diff).toISOString()];
               needsClamp = true;
            }

            // Y-Clamping (Prevent sky/floor escape)
            if (newY1 && newY1 > yMaxB) {
              const d = newY1 - yMaxB;
              finalUpdate['yaxis.range'] = [newY0 - d, yMaxB];
              needsClamp = true;
            } else if (newY0 && newY0 < yMinB) {
              const d = yMinB - newY0;
              finalUpdate['yaxis.range'] = [yMinB, newY1 + d];
              needsClamp = true;
            }

            if (needsClamp) {
              isClamping.current = true;
              window.Plotly.relayout(el, finalUpdate).finally(() => {
                isClamping.current = false;
              });
            }
          });
        }
      });
    } catch (e) {
      setRenderError(e.message);
    }

    let resizeRaf = null;
    const obs = new ResizeObserver((entries) => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (chartRef.current && window.Plotly) {
          window.Plotly.Plots.resize(chartRef.current);
        }
      });
    });
    if (chartRef.current) obs.observe(chartRef.current);

    const onFullscreenChange = () => {
      const el = chartRef.current;
      if (!el || !window.Plotly) return;
      requestAnimationFrame(() => {
        el.style.width = '100%';
        el.style.height = '100%';
        window.Plotly.Plots.resize(el);
        window.Plotly.relayout(el, { autosize: true });
      });
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      obs.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [chartData, chartMode, aiVisionOn, fibEnabled, activeFilters, period, plotlyReady]);

  useEffect(() => {
    const cleanup = renderChart();
    return cleanup;
  }, [renderChart]);

  const intelQueue = useScanStore(s => s.intelQueue);

  // ── Grafik fiyatını scan store'a geri yaz (tablo-grafik senkronizasyonu) ──
  // Grafik yüklenince canlı fiyatı tabloya yansıt; böylece tablo ve grafik aynı veriyi gösterir.
  useEffect(() => {
    if (chartData?.last_close && selectedItem?.symbol) {
      updateSymbolClose(
        selectedItem.symbol,
        chartData.last_close,
        chartData.change_pct ?? null,
      );
    }
  }, [chartData?.last_close, chartData?.change_pct, selectedItem?.symbol, updateSymbolClose]);

  // ── Derived ──
  // Chart header + Neural Report both use live chart data (last_close) so they are consistent.
  // Fallback to scan result if chart hasn't loaded yet.
  const scanClose  = selectedItem?.close ?? selectedItem?.Fiyat ?? null;
  const scanChgPct = selectedItem?.change_pct ?? selectedItem?.Değişim ?? null;
  const last = chartData?.last_close ?? scanClose;
  const chg  = chartData?.change_pct ?? scanChgPct ?? 0;
  const isUp = chg >= 0;
  const av    = chartData?.ai_vision ?? {};
  const hasPattern      = av.detected_type && av.detected_type !== NONE_TYPE;
  const isBreakout      = av.is_short_term_breakout;
  const confidence      = av.confidence ? Math.round(av.confidence * 100) : 0;
  const isStale         = av.is_stale ?? false;
  const formedBarsAgo   = av.formed_bars_ago ?? 0;
  const profileRelevance = av.profile_relevance ?? 'medium'; // 'high' | 'medium' | 'low'
  const secondaryPattern = av.secondary_pattern ?? null;

  const signalConfirmed = av.setup?.signal_confirmed ?? null;
  const patternConf     = hasPattern ? Math.round((av.confidence ?? 0) * 100) : 0;
  const fibData         = av.fibonacci ?? {};
  const hasFib          = (fibData.levels?.length ?? 0) > 0;

  const patternType  = (av.detected_type || '').toLowerCase();
  const isSupport    = patternType.includes('destek') || patternType.includes('support') || patternType.includes('kanal');
  const isResistance = patternType.includes('direnç') || patternType.includes('direnc') || patternType.includes('resistance') || patternType.includes('takoz') || patternType.includes('üçgen');
  const patternColor = isSupport ? '#22d3ee' : isResistance ? '#f87171'
    : av.setup?.direction === 'bullish' ? '#34d399'
    : av.setup?.direction === 'bearish' ? '#f87171'
    : '#a855f7';

  const RELEVANCE_LABELS = { high: '★ Profil Uyumu Yüksek', medium: '', low: '↓ Düşük Öncelik' };
  const RELEVANCE_COLORS = { high: '#34d399', medium: '', low: '#9ca3af' };

  // Formation card arc + age bar precomputed values
  const _arcR    = 18;
  const _arcC    = 2 * Math.PI * _arcR;
  const _arcFill = (confidence / 100) * _arcC;
  const _ageColor = formedBarsAgo <= 5 ? '#34d399' : formedBarsAgo <= 12 ? '#fbbf24' : '#f87171';
  const _agePct   = Math.min(100, (formedBarsAgo / 20) * 100);

  if (renderError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[2.5rem] border border-white/[0.05] bg-[#07090e] p-12 min-h-[300px] text-center gap-4">
        <span className="text-4xl">📡</span>
        <p className="text-white/60 text-sm font-semibold">Grafik motoru yüklenemedi</p>
        <p className="text-white/30 text-xs max-w-xs">İnternet bağlantınızı kontrol edin veya sayfayı yenileyin. (Plotly CDN erişilemez)</p>
        <button onClick={() => { plotlyLoadPromise = null; loadPlotly().then(() => { setRenderError(null); }); }}
          className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 transition-all">
          Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div ref={sectionRef} className="flex flex-col rounded-[2.5rem] border border-white/[0.05] bg-[#07090e] shadow-2xl overflow-hidden h-auto">

      {/* ─── TERMINAL HEADER ─── */}
      <div className="relative px-4 sm:px-6 py-4 sm:py-5 border-b border-white/[0.04] bg-white/[0.01]">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent opacity-50" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 sm:gap-6">
          
          <div className="flex flex-wrap items-center gap-3 sm:gap-5">
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                 <span className="text-xl sm:text-2xl md:text-3xl font-black tracking-tighter text-white uppercase leading-none">
                   {symbolToUse === 'XU100' ? 'BIST 100' : symbolToUse}
                 </span>
                 <div className="flex flex-wrap items-center gap-1.5">
                   {isBreakout && (
                     <span className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[8px] sm:text-[9px] font-black text-amber-400 uppercase tracking-widest animate-pulse">
                       ⚡ KIRILIM
                     </span>
                   )}
                   {signalConfirmed === true && (
                     <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] sm:text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                       ✓ ONAYLANDI
                     </span>
                   )}
                   {signalConfirmed === false && (
                     <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] sm:text-[9px] font-bold text-white/30 uppercase tracking-widest">
                       NÖTR
                     </span>
                   )}
                   {hasPattern && patternConf > 0 && (
                     <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[8px] sm:text-[9px] font-bold text-purple-400">
                       {patternConf}% GÜVEN
                     </span>
                   )}
                 </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                 <span className="text-lg font-black font-mono text-white/90 leading-none">
                    {Number(last || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                 </span>
                 <span className={cn("text-xs font-bold font-mono px-2 py-0.5 rounded-full", isUp ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                   {isUp ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%
                 </span>
                 {chartData?.data_date && (
                   <span className="text-[9px] font-mono text-white/20 uppercase tracking-wider flex items-center gap-1">
                     <Clock className="w-2.5 h-2.5" />
                     {chartData.data_date}
                   </span>
                 )}
               </div>
            </div>

            <div className="flex items-center gap-2">
               <ScoreChip label="ML" val={mlScoreForSymbol} color="text-purple-400" bg="bg-purple-500/10" tip="AI Confidence Score" />
               <ScoreChip label="QRS" val={qrsScoreForSymbol} color="text-primary" bg="bg-primary/10" tip="Quant Ranking Score" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="flex items-center bg-white/[0.03] border border-white/[0.05] rounded-xl sm:rounded-2xl p-1 shadow-inner">
               {PERIODS.map(p => (
                 <button key={p.id} onClick={() => setPeriod(p.id)}
                   className={cn("px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all", 
                     period === p.id ? "bg-primary text-black shadow-lg" : "text-white/30 hover:text-white/60")}
                 >{p.label}</button>
               ))}
            </div>
            <div className="flex items-center bg-white/[0.03] border border-white/[0.05] rounded-xl sm:rounded-2xl p-1">
               {['candle', 'line'].map(m => (
                 <button key={m} onClick={() => setChartMode(m)}
                   className={cn("px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all", 
                     chartMode === m ? "bg-white/10 text-white" : "text-white/20 hover:text-white/40")}
                 >{m === 'candle' ? 'MUM' : 'ÇİZGİ'}</button>
               ))}
            </div>
          </div>
        </div>
      </div>
       {/* ─── INTEGRATED CONTROL HUB ─── */}
      <div className="px-4 sm:px-6 py-3 border-b border-white/[0.03] bg-white/[0.015] flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0 scroll-smooth">
          {TOOLBAR.map(t => (
            <button key={t.id} onClick={() => handleToolbar(t.id)} title={t.label}
              className={cn("flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all border shrink-0",
                t.id === 'pan' && toolbarMode === 'pan' ? "bg-primary border-primary text-black" : "bg-white/[0.03] border-white/5 text-white/40 hover:bg-white/[0.06] hover:text-white")}
            >
              <span className="material-symbols-outlined text-[14px] sm:text-[16px]">{t.icon}</span>
              <span className="hidden xl:inline">{t.label}</span>
            </button>
          ))}
          <div className="w-px h-4 bg-white/5 mx-1.5 sm:mx-2" />
          <button onClick={toggleAiVision}
            className={cn("flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all border shrink-0",
              aiVisionOn ? "bg-purple-500/20 border-purple-500/40 text-purple-400" : "bg-white/[0.03] border-white/5 text-white/40")}
          >
            <span className="material-symbols-outlined text-[14px] sm:text-[16px]">visibility</span>
            <span>AI VIZ</span>
            {aiVisionOn && (hasPattern || hasFib) && <div className="w-1 h-1 rounded-full bg-purple-400 animate-pulse" />}
          </button>
        </div>
 
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 scroll-smooth">
           {[
             { id: 'EMA',  label: 'EMA5/20', color: '#fbbf24' },
             { id: 'BB',   label: 'BOLL',    color: '#a855f7' },
             { id: 'VOL',  label: 'HACİM',    color: '#22d3ee' },
             { id: 'RSI',  label: 'RSI',     color: '#f59e0b' },
             { id: 'MACD', label: 'MACD',    color: '#f87171' }
           ].map(opt => (
             <button key={opt.id} onClick={() => toggleFilter(opt.id)}
               className={cn("px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 sm:gap-2 shrink-0",
                 activeFilters.includes(opt.id) ? "bg-white/5 border-white/10 text-white" : "bg-transparent border-transparent text-white/20 hover:text-white/40")}
             >
               <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: activeFilters.includes(opt.id) ? opt.color : 'rgba(255,255,255,0.1)', color: opt.color }} />
               {opt.label}
             </button>
           ))}
        </div>
      </div>

      {/* ─── CHART CANVAS ─── */}
      <div className="relative bg-gradient-to-b from-[#07090e] via-[#07090e] to-[#040508] h-[400px] md:h-[520px]">
        {isLoading && !chartData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#07090e]/60 backdrop-blur-sm">
             <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Mapping Neural Nodes...</span>
             </div>
          </div>
        )}
        {isFetching && !!chartData && (
          <div className="absolute top-3 right-3 z-30 pointer-events-none">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" />
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 z-30 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <span className="material-icons text-red-400/60 text-4xl">wifi_off</span>
              <p className="text-sm text-white/40">Grafik yüklenemedi. Lütfen tekrar deneyin.</p>
            </div>
          </div>
        )}
        <div ref={chartRef} className="w-full h-full" />
        
        {/* HUD OVERLAY */}
        {!isLoading && !isError && (
          <div className="absolute top-6 left-8 z-20 pointer-events-none select-none">
             {hoveredData ? (
               <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                 className="flex flex-col gap-2 bg-[#0a0d14]/90 backdrop-blur-xl p-4 rounded-2xl border border-white/10 shadow-2xl"
               >
                  <div className="flex items-center gap-4 mb-1 border-b border-white/5 pb-2">
                     <span className="text-[11px] font-black text-white/40 font-mono tracking-tighter uppercase">
                        {new Date(hoveredData.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                     </span>
                     <div className="flex items-center gap-4">
                        <HUDItem label="O" val={hoveredData.price.o} color="text-white/60" />
                        <HUDItem label="H" val={hoveredData.price.h} color="text-emerald-400" />
                        <HUDItem label="L" val={hoveredData.price.l} color="text-red-400" />
                        <HUDItem label="C" val={hoveredData.price.c} color="text-primary font-black" />
                     </div>
                  </div>
                  <div className="flex flex-wrap gap-2 max-w-[240px]">
                     {hoveredData.indicators.map((ind, i) => (
                       <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                          <span className="text-[8px] font-black text-white/20 uppercase">{ind.name}</span>
                          <span className="text-[10px] font-mono font-bold text-white/50">{Number(ind.val).toFixed(2)}</span>
                       </div>
                     ))}
                  </div>
               </motion.div>
             ) : (
               <div className="px-3 py-1.5 opacity-30 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
                  <span className="text-[10px] font-black font-mono text-white/40 uppercase tracking-widest">Live Terminal Feed</span>
               </div>
             )}
          </div>
        )}
      </div>

      {/* ─── INTELLIGENCE REPORT ─── */}
      {aiVisionOn && (
        <div className="bg-[#0a0d14] border-t border-primary/20 p-6 lg:p-8 relative">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
           <div className="grid grid-cols-12 gap-6 lg:gap-10">
              
              {/* LEFT: Analysis Details */}
              <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                 <div className="space-y-4">
                    <div className="flex items-center gap-3">
                       <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: patternColor, boxShadow: `0 0 15px ${patternColor}` }} />
                       <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">Formasyon Analizi</h3>
                    </div>
                    {hasPattern ? (
                       <div className={cn("p-5 rounded-3xl relative overflow-hidden group border",
                         isStale ? "bg-white/[0.01] border-white/[0.03]" : "bg-white/[0.02] border-white/[0.05]")}>
                          {/* Breakout glow pulse ring */}
                          {isBreakout && (
                            <div className="absolute inset-0 rounded-3xl pointer-events-none animate-pulse"
                              style={{ boxShadow: `inset 0 0 0 1.5px ${patternColor}55, 0 0 28px ${patternColor}20` }} />
                          )}
                          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                             <span className="material-symbols-outlined text-4xl" style={{ color: isStale ? '#6b7280' : patternColor }}>analytics</span>
                          </div>
                          <div className="relative z-10">
                             {/* Başlık satırı: isim + confidence arc */}
                             <div className="flex items-start justify-between gap-2 mb-2">
                                <span className="text-[15px] font-black tracking-widest uppercase leading-tight pt-1"
                                  style={{ color: isStale ? '#6b7280' : patternColor }}>{av.detected_type}</span>
                                {/* Confidence Arc SVG */}
                                <svg width="44" height="44" className="shrink-0" viewBox="0 0 44 44">
                                  <circle cx="22" cy="22" r={_arcR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3"/>
                                  <circle cx="22" cy="22" r={_arcR} fill="none"
                                    stroke={isStale ? '#4b5563' : confidence >= 70 ? '#34d399' : confidence >= 45 ? '#fbbf24' : '#f87171'}
                                    strokeWidth="3" strokeLinecap="round"
                                    strokeDasharray={`${_arcFill} ${_arcC}`}
                                    transform="rotate(-90 22 22)"
                                    style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
                                  />
                                  <text x="22" y="26" textAnchor="middle" fontSize="9" fontWeight="900"
                                    fill={isStale ? '#6b7280' : 'rgba(255,255,255,0.85)'} fontFamily="monospace">
                                    {confidence}%
                                  </text>
                                </svg>
                             </div>
                             {/* Badge satırı: profil uyumu */}
                             <div className="flex flex-wrap items-center gap-1.5 mb-3">
                               {profileRelevance === 'high' && (
                                 <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-black text-emerald-400 uppercase tracking-widest">
                                   ★ Profil Uyumu
                                 </span>
                               )}
                               {profileRelevance === 'low' && (
                                 <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-black text-white/30 uppercase tracking-widest">
                                   ↓ Profil Dışı
                                 </span>
                               )}
                             </div>
                             <p className={cn("text-sm leading-relaxed font-medium", isStale ? "text-white/30" : "text-white/50")}>{av.detected_desc}</p>
                             {/* Formasyon Yaşı — her zaman görünür */}
                             <div className="mt-3 pt-3 border-t border-white/[0.04]">
                               <div className="flex items-center justify-between mb-1.5">
                                 <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Formasyon Yaşı</span>
                                 <span className="text-[8px] font-mono font-black" style={{ color: _ageColor }}>
                                   {formedBarsAgo === 0 ? 'Taze' : `${formedBarsAgo} bar önce`}
                                 </span>
                               </div>
                               <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                                 <div className="h-full rounded-full" style={{
                                   width: `${_agePct}%`,
                                   background: _ageColor,
                                   transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
                                   boxShadow: `0 0 6px ${_ageColor}90`
                                 }} />
                               </div>
                             </div>
                             {/* İkincil formasyon */}
                             {secondaryPattern && secondaryPattern.detected_type !== NONE_TYPE && (
                               <div className="mt-2 pt-2 border-t border-white/5">
                                 <div className="flex items-center justify-between">
                                   <span className="text-[10px] font-black text-white/25 uppercase tracking-widest">+ Destek Çizgisi</span>
                                   <span className="text-[10px] font-mono text-white/20">{secondaryPattern.detected_type}</span>
                                 </div>
                               </div>
                             )}
                          </div>
                       </div>
                    ) : (
                       <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-3xl">
                          <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Aktif Formasyon Tespit Edilmedi</span>
                       </div>
                    )}
                 </div>

                 {/* Fibonacci levels modernized */}
                 {hasFib && (
                    <div className="space-y-4">
                       <div className="flex items-center justify-between">
                          <h4 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em]">Fibonacci Matrix</h4>
                          <span className="text-[10px] font-mono text-primary/40 uppercase">{fibData.direction === 'up' ? 'Yükseliş' : 'Düşüş'} Projeksiyonu</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
                          {FIB_META.map(f => {
                             const lv = fibData.levels?.find(l => Math.abs(l.ratio - f.ratio) < 0.001);
                             if (!lv) return null;
                             const active = fibEnabled[f.ratio];
                             return (
                               <button key={f.ratio} onClick={() => toggleFib(f.ratio)}
                                 className={cn("flex flex-col gap-1.5 p-3 rounded-2xl transition-all border",
                                   active ? "bg-white/[0.02] border-white/10" : "bg-transparent border-transparent opacity-20 grayscale")}
                               >
                                  <div className="flex items-baseline justify-between">
                                     <span className="text-[9px] font-black uppercase text-white/30">{f.short}</span>
                                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                                  </div>
                                  <span className="text-[13px] font-mono font-black transition-colors" style={{ color: active ? f.color : 'rgba(255,255,255,0.9)' }}>{Number(lv.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                               </button>
                             );
                          })}
                       </div>
                    </div>
                 )}
              </div>

              {/* RIGHT: Expert Intelligence Dashboard */}
              <div className="col-span-12 lg:col-span-8">
                 {av.expert_report ? (
                    <div className="h-full flex flex-col gap-6 p-5 rounded-[2rem] bg-primary/[0.02] border border-primary/10">
                       
                       {/* Stats Grid */}
                       {/* Sinyal uyumu kontrolü: AI Viz formation yönü ile PRISM ML/QRS konsensüsü */}
                       {(() => {
                         const mlWeak  = mlScoreForSymbol  != null && mlScoreForSymbol  < 30;
                         const qrsWeak = qrsScoreForSymbol != null && qrsScoreForSymbol < 50;
                         const isConditional = mlWeak || qrsWeak;
                         const targetLabel = isConditional
                           ? 'KOŞ. SENARYO'  // ML/QRS teyit etmiyor — formasyon kırılırsa geçerli
                           : av.setup?.target_label;
                         const targetColor = isConditional ? 'text-amber-400' : (av.setup?.direction === 'bullish' ? 'text-emerald-400' : 'text-red-400');
                         const signalLabel = isConditional
                           ? '⚠ TEYIT BEKLENİYOR'
                           : (av.setup?.direction === 'bullish' ? '▲ LİSTEYE GİRİŞ' : '▼ LİSTEDEN ÇIKIŞ');
                         const signalStyle = isConditional
                           ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                           : (av.setup?.direction === 'bullish' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-red-500/20 border-red-500/40 text-red-400');
                         return (
                           <>
                       <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <MetricCard label="HEDEF SEVİYE" val={av.setup?.target} sub={targetLabel} icon="target"
                            color={targetColor}
                            pct={av.setup?.pct_move}
                          />
                          <MetricCard label="SİNYAL PENCERESİ" val={av.setup?.duration} sub="Teknik sinyal aralığı" icon="schedule" color={isConditional ? "text-amber-400" : "text-purple-400"} />
                          <MetricCard label="BİLEŞİK SKOR" val={av.setup?.composite_score} sub={av.setup?.quality_label} icon="shutter_speed"
                            color={(av.setup?.composite_score || 0) >= 65 ? "text-emerald-400" : "text-amber-400"}
                            isScore
                          />
                       </div>
                       {isConditional && (
                         <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300/80 font-medium">
                           <span className="material-symbols-outlined text-amber-400 text-base mt-0.5">warning</span>
                           <span>
                             Formasyon hedefi <strong className="text-amber-300">ML {mlScoreForSymbol ?? '–'} / QRS {qrsScoreForSymbol ?? '–'}</strong> skoru tarafından teyit edilmiyor.
                             Hedef seviye yalnızca kırılım + hacim onayı gerçekleşirse geçerlidir.
                           </span>
                         </div>
                       )}
                           </>
                         );
                       })()}

                        {/* Narrative Report Panel */}
                        <div className="flex-1 rounded-[2rem] bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] p-5 sm:p-8 lg:p-10 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] -translate-y-1/2 translate-x-1/2" />
                           <div className="relative z-10">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:mb-8">
                                 <div className="flex items-center gap-4">
                                   <div className="p-2.5 sm:p-3 rounded-2xl bg-primary/10 border border-primary/20 shrink-0">
                                      <span className="material-symbols-outlined text-primary text-xl sm:text-2xl animate-pulse">psychology</span>
                                   </div>
                                   <div className="min-w-0">
                                      <h4 className="text-xs sm:text-sm font-black text-primary uppercase tracking-[0.2em] sm:tracking-[0.3em] truncate">Neural Intelligence Report</h4>
                                      <p className="text-[8px] sm:text-[9px] font-mono text-white/20 uppercase tracking-widest mt-0.5 sm:mt-1">Pattern + PRISM Composite</p>
                                   </div>
                                 </div>
                                 {(() => {
                                   const mlWeak  = mlScoreForSymbol  != null && mlScoreForSymbol  < 30;
                                   const qrsWeak = qrsScoreForSymbol != null && qrsScoreForSymbol < 50;
                                   const isConditional = mlWeak || qrsWeak;
                                   const signalLabel = isConditional
                                     ? '⚠ TEYİT BEKLENİYOR'
                                     : (av.setup?.direction === 'bullish' ? '▲ LİSTEYE GİRİŞ' : '▼ LİSTEDEN ÇIKIŞ');
                                   const signalStyle = isConditional
                                     ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                     : (av.setup?.direction === 'bullish' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-red-500/20 border-red-500/40 text-red-400');
                                   return (
                                 <div className="sm:ml-auto flex items-center gap-3">
                                    <div className={cn("px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[11px] font-black uppercase tracking-widest border shadow-xl transition-transform hover:scale-105 whitespace-nowrap", signalStyle)}>
                                       {signalLabel}
                                    </div>
                                 </div>
                                   );
                                 })()}
                              </div>

                             <div className="text-[15px] md:text-[17px] text-white/70 leading-[1.8] font-medium selection:bg-primary/20">
                                {(() => {
                                  const segments = (av.expert_report || "").split(/(\*\*.*?\*\*)/g);
                                  return segments.map((seg, j) => 
                                    seg.startsWith('**') && seg.endsWith('**') 
                                      ? <strong key={j} className="text-white font-black px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/10 mx-0.5">{seg.slice(2, -2)}</strong>
                                      : seg
                                  );
                                })()}
                             </div>

                             <div className="mt-10 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                                <span>PRISM QUANT ENGINE</span>
                                <div className="flex items-center gap-4">
                                   <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary/40" /> {av.setup?.direction}</span>
                                   <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500/40" /> {av.setup?.duration}</span>
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>
                 ) : (
                    <div className="h-full flex items-center justify-center border border-white/5 rounded-[2rem] bg-white/[0.01]">
                       <div className="text-center opacity-20">
                          <span className="material-symbols-outlined text-5xl mb-4">analytics</span>
                          <p className="text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Deep Sync...</p>
                       </div>
                    </div>
                 )}
              </div>
           </div>

           {/* ─── FORMATION STRATEGIC CONTEXT ─── */}
           {/* ─── STRATEGIC INSIGHT HUD (MINIMAL) ─── */}
           {hasPattern && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               className="mt-6 p-5 md:p-6 rounded-3xl bg-gradient-to-br from-primary/[0.03] to-transparent border border-white/[0.06] relative overflow-hidden group shadow-lg"
             >
               <div className="absolute top-0 right-0 p-4 opacity-[0.02] pointer-events-none group-hover:opacity-[0.05] transition-all">
                 <span className="material-symbols-outlined text-[70px] rotate-12" style={{ color: patternColor }}>layers</span>
               </div>

               <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center">
                 {/* 1. Status Chip */}
                 <div className="flex items-center gap-4 shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-inner">
                      <span className="material-symbols-outlined text-lg" style={{ color: patternColor }}>explore</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none mb-1">Stratejik Bakış</span>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">{av.detected_type}</h3>
                    </div>
                 </div>

                 {/* 2. Divider */}
                 <div className="hidden md:block w-px h-8 bg-white/5" />

                 {/* 3. Concise Strategic Narrative */}
                 <div className="flex-1">
                    <p className="text-[13px] text-white/50 leading-relaxed font-medium">
                      <strong className="text-white font-black">{symbolToUse}</strong> için tespit edilen bu yapı, fiyatın mevcut trend döngüsü içindeki birikim fazını temsil eder. 
                      Teknik konfigürasyon, <span className="text-white/80 font-bold">{isResistance ? 'direnç hattına' : isSupport ? 'destek hattına' : 'denge koridoruna'}</span> yakınlaşmayı 
                      ve <span className="italic opacity-80">"{av.detected_desc}"</span> senaryosunu doğrulamaktadır.
                    </p>
                 </div>

                 {/* 4. Mini Confidence */}
                 <div className="shrink-0 flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex flex-col items-end">
                       <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Güven</span>
                       <span className="text-xs font-black font-mono text-white/80">{confidence}%</span>
                    </div>
                    <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: patternColor }} />
                 </div>
               </div>
             </motion.div>
           )}

           
           <div className="mt-10 text-center opacity-10">
              <p className="text-[10px] font-mono leading-relaxed">
                Tüm çıktılar algoritmik model verisidir, yatırım tavsiyesi değildir • Geçmiş veriye dayalı istatistiksel analiz, gelecek performansı garanti etmez • SPK lisanslı yatırım danışmanlığı hizmeti değildir
              </p>
           </div>
        </div>
      )}
    </div>
  );
});

const ScoreChip = ({ label, val, color, bg, tip }) => (
  <InfoTip side="bottom" content={tip}>
     <div className={cn("px-3 py-1.5 rounded-xl border border-white/5 shadow-inner flex items-center gap-2 cursor-help transition-colors hover:bg-white/[0.05]", bg)}>
        <span className={cn("text-[9px] font-black uppercase tracking-tighter", color)}>{label}</span>
        <span className="text-sm font-black font-mono text-white/90">{Math.round(val || 0)}</span>
     </div>
  </InfoTip>
);

const HUDItem = ({ label, val, color }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="text-[10px] font-black text-white/20">{label}</span>
    <span className={cn("text-[13px] font-mono font-bold tracking-tight", color)}>
        {Number(val || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  </div>
);

const MetricCard = ({ label, val, sub, icon, color, pct, isScore }) => (
  <div className="px-6 py-5 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-2 group transition-all hover:bg-white/[0.04]">
     <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{label}</span>
        <span className="material-symbols-outlined text-lg opacity-20 group-hover:opacity-40 transition-opacity" style={{ color: color.replace('text-', '') }}>{icon}</span>
     </div>
     <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-black font-mono tracking-tighter", color)}>
           {typeof val === 'number' ? val.toLocaleString('tr-TR', { minimumFractionDigits: isScore ? 1 : 2 }) : (val || '---')}
        </span>
        {isScore && <span className="text-xs font-black text-white/10 uppercase">/ 100</span>}
        {pct != null && (
          <span className={cn("text-xs font-bold font-mono", pct >= 0 ? "text-emerald-500" : "text-red-500")}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
          </span>
        )}
     </div>
     <span className="text-[10px] font-mono font-bold text-white/30 uppercase tracking-widest">{sub}</span>
  </div>
);

export default ChartSection;
