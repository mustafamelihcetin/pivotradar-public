import React, { useState, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, Cell,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { aFetch, Spinner, T, ChartTooltip } from './shared';

const R = 6;

// Distinct line colors for multi-symbol trend chart
const LINE_COLORS = ['#99f7ff', '#34d399', '#fbbf24', '#a855f7', '#f87171', '#60a5fa', '#fb923c', '#f472b6'];

// QRS band açıklamaları
const QRS_BAND_DESC = {
  '90-100': 'Mükemmel — En güçlü sinyaller',
  '80-89':  'Güçlü — Yüksek kalite sinyaller',
  '70-79':  'Orta — Standart sinyaller',
  '60-69':  'Zayıf — Düşük güven sinyalleri',
  '50-59':  'Çok Zayıf — Dikkatli yaklaşın',
};

export function QrsAnalysisTab() {
  const [symSearch, setSymSearch] = useState('');
  const [selectedSym, setSelectedSym] = useState(null);

  const { data: trend, isLoading: trendLoading, error: trendError } = useQuery({
    queryKey: ['a-qrs-trend'],
    queryFn: () => aFetch('/api/admin/qrs-trend?limit=15'),
    staleTime: 60_000, placeholderData: keepPreviousData,
  });
  const { data: breadth, error: breadthError } = useQuery({
    queryKey: ['a-market-breadth'],
    queryFn: () => aFetch('/api/admin/market-breadth'),
    staleTime: 30_000,
  });
  const { data: performers, error: performersError } = useQuery({
    queryKey: ['a-top-performers'],
    queryFn: () => aFetch('/api/admin/top-performers'),
    staleTime: 120_000,
  });
  const { data: symHist, isLoading: histLoading, error: symHistError } = useQuery({
    queryKey: ['a-sym-hist', selectedSym],
    queryFn: () => aFetch(`/api/admin/symbol-history?symbol=${selectedSym}`),
    enabled: !!selectedSym, staleTime: 60_000,
  });

  const filteredTrend = useMemo(() => {
    if (!trend) return [];
    const s = symSearch.toUpperCase();
    return trend.filter(t => t.symbol.includes(s));
  }, [trend, symSearch]);

  const bullishPct = breadth?.total ? ((breadth.bullish / breadth.total) * 100).toFixed(0) : 0;
  const neutralPct = breadth?.total ? ((breadth.neutral / breadth.total) * 100).toFixed(0) : 0;
  const bearishPct = breadth?.total ? ((breadth.bearish / breadth.total) * 100).toFixed(0) : 0;

  // ── Top symbols for multi-line trend (top 6 of filtered) ──────────────────────
  const topSyms = useMemo(() => filteredTrend.slice(0, 6), [filteredTrend]);

  // Merge per-symbol histories into a single date-keyed series for the LineChart
  const trendLineData = useMemo(() => {
    const byDate = {};
    topSyms.forEach(t => {
      (t.history || []).forEach(h => {
        if (!byDate[h.date]) byDate[h.date] = { date: h.date };
        byDate[h.date][t.symbol] = h.qrs;
      });
    });
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, label: d.date.slice(5) }));
  }, [topSyms]);

  // Bar chart data — avg QRS per symbol
  const barData = useMemo(() => filteredTrend.map(t => ({
    symbol: t.symbol,
    qrs: t.avg_qrs,
    color: t.avg_qrs >= 75 ? T.success : t.avg_qrs >= 60 ? T.primary : T.warning,
  })), [filteredTrend]);

  // Symbol detail area chart data
  const symChartData = (symHist || []).slice(-30).map(r => ({
    date: r.scan_date?.slice(5),
    qrs: r.qrs_score != null ? +r.qrs_score.toFixed(1) : 0,
    hit: r.target_hit,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Başlık ── */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>QRS Sinyal Analizi ve Piyasa Genişliği</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
          QRS (Sinyal Güç Skoru) kalite dağılımı, piyasa duyarlılığı ve momentum lider hisseler. Bir hisseye tıklayarak detaylı tarihsel analizi görün.
        </p>
      </div>

      {/* ── Market sentiment HUD ── */}
      <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.25)', margin: '0 0 2px' }}>Piyasa Duyarlılığı</p>
            <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Son tarama seansında yükseliş beklentisiyle işaretlenen hisselerin oranı
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.9)' }}>%{breadth?.sentiment || 0}</span>
              <div style={{ display: 'flex', height: 6, width: 160, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.05)', gap: 1 }}>
                <div style={{ width: `${bullishPct}%`, background: T.success, boxShadow: `0 0 8px ${T.success}50` }} />
                <div style={{ width: `${neutralPct}%`, background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ width: `${bearishPct}%`, background: T.danger, boxShadow: `0 0 8px ${T.danger}50` }} />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: 24 }}>
            {[
              { label: 'Yükseliş Beklentili (Bullish)', value: breadth?.bullish || 0, color: T.success, desc: 'Pozitif momentum sinyali' },
              { label: 'Nötr',                           value: breadth?.neutral || 0, color: 'rgba(255,255,255,0.3)', desc: 'Belirsiz hareket' },
              { label: 'Düşüş Beklentili (Bearish)',    value: breadth?.bearish || 0, color: T.danger,  desc: 'Negatif momentum sinyali' },
            ].map(item => (
              <div key={item.label}>
                <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: `${item.color}80`, margin: '0 0 2px' }}>{item.label}</p>
                <p style={{ fontSize: 14, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: item.color, margin: '0 0 2px' }}>{item.value}</p>
                <p style={{ fontSize: 7, color: 'rgba(255,255,255,0.12)', margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', margin: 0 }}>Sembol ara:</p>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>search</span>
            <input
              value={symSearch}
              onChange={e => setSymSearch(e.target.value)}
              placeholder="Hisse kodu girin..."
              style={{ paddingLeft: 34, paddingRight: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 5, background: T.bg3, border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.7)', outline: 'none', width: 220 }}
              onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.3)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>
        </div>
      </div>

      {/* ── Recharts: QRS bar + multi-symbol trend line ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Avg QRS bar chart */}
        <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '16px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: T.primary }}>bar_chart</span>
            Ortalama QRS Skoru
          </p>
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', margin: '0 0 10px', lineHeight: 1.5 }}>
            Lider hisselerin son 30 günlük ortalama sinyal gücü. Bara tıklayarak detay açın.
          </p>
          {barData.length === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: T.faint }}>{trendLoading ? 'Yükleniyor...' : 'Veri Yok'}</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} onClick={(e) => { if (e?.activeLabel) setSelectedSym(e.activeLabel); }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="symbol" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} angle={-35} textAnchor="end" height={44} interval={0} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} width={30} />
                <RTooltip cursor={{ fill: 'rgba(153,247,255,0.05)' }} content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `%${v}`} />} />
                <Bar dataKey="qrs" radius={[3, 3, 0, 0]} isAnimationActive style={{ cursor: 'pointer' }}>
                  {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Multi-symbol trend line chart */}
        <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '16px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: T.success }}>show_chart</span>
            QRS Skor Trendi (Üst 6)
          </p>
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', margin: '0 0 10px', lineHeight: 1.5 }}>
            En yüksek skorlu 6 hissenin son 30 gündeki QRS değişimi. Her renk bir hisseyi temsil eder.
          </p>
          {trendLineData.length < 2 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: T.faint }}>{trendLoading ? 'Yükleniyor...' : 'Yeterli Trend Verisi Yok'}</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendLineData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} width={30} />
                <RTooltip content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `%${v}`} />} />
                <Legend wrapperStyle={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase' }} iconType="plainline" iconSize={10} />
                {topSyms.map((t, i) => (
                  <Line key={t.symbol} type="monotone" dataKey={t.symbol} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.8} dot={false} connectNulls isAnimationActive />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

        {/* Momentum Leaders table */}
        <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: T.primary, margin: '0 0 2px' }}>Momentum Liderleri</p>
              <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.2)', margin: 0 }}>
                En yüksek ortalama QRS skoruna sahip hisseler. Sıraya tıklayarak tarihsel analizi açın.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.success, animation: 'ping-soft 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: `${T.success}80` }}>Canlı</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.005)' }}>
                  {['#', 'Hisse Senedi', 'Ort. QRS Skoru (0–100)', 'Momentum Gücü'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trendLoading ? (
                  <tr><td colSpan={4} style={{ padding: '48px 0', textAlign: 'center' }}><Spinner /></td></tr>
                ) : trendError ? (
                  <tr><td colSpan={4} style={{ padding: '32px 0', textAlign: 'center', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(248,113,113,0.6)' }}>VERİ YÜKLENEMEDİ — {trendError.message}</td></tr>
                ) : filteredTrend.map((t, i) => (
                  <tr key={t.symbol} onClick={() => setSelectedSym(t.symbol)}
                    style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
                      {(i + 1).toString().padStart(2, '0')}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>{t.symbol.slice(0, 2)}</span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 900, color: 'rgba(255,255,255,0.8)' }}>{t.symbol}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, fontWeight: 900, color: T.primary }}>
                      %{t.avg_qrs?.toFixed(1)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', width: 120, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${t.avg_qrs}%` }}
                          style={{ height: '100%', background: t.avg_qrs >= 75 ? T.success : T.primary, boxShadow: `0 0 8px ${t.avg_qrs >= 75 ? T.success : T.primary}80` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top performers sidebar */}
        <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden', position: 'relative' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.4)', margin: '0 0 4px' }}>Hedef Fiyat İsabeti</p>
            <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.15)', margin: 0, lineHeight: 1.6 }}>
              En az 3 tarama yapılmış ve tahmin hedefine en çok ulaşan hisseler. Yüzde, hedef fiyat isabet oranını gösterir.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(!performers || performers.length === 0) ? (
              <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(255,255,255,0.05)' }}>analytics</span>
                <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: T.faint, textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
                  Henüz yeterli tahmin verisi birikmedi. En az 3 tarama yapılan hisseler için başarı sıralaması burada görünecek.
                </p>
              </div>
            ) : performers.slice(0, 10).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'opacity 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.12)' }}>#{(i + 1).toString().padStart(2, '0')}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.7)' }}>{p.symbol}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.success }}>%{p.accuracy}</span>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.success, boxShadow: `0 0 6px ${T.success}80` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Glow orb */}
          <div style={{ position: 'absolute', bottom: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: `${T.primary}08`, filter: 'blur(40px)', pointerEvents: 'none' }} />
        </div>
      </div>

      {/* ── Symbol detail modal ── */}
      <AnimatePresence>
        {selectedSym && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedSym(null)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
            />
            <motion.div initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
              style={{ position: 'relative', width: '100%', maxWidth: 900, background: T.bg2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '28px', overflow: 'hidden' }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: 'rgba(153,247,255,0.08)', border: '1px solid rgba(153,247,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: T.primary, fontFamily: "'IBM Plex Mono', monospace" }}>{selectedSym.slice(0, 2)}</span>
                  </div>
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.9)', margin: '0 0 4px' }}>{selectedSym} Detaylı Analiz</h2>
                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(255,255,255,0.2)', margin: 0 }}>QRS Sinyal Gücü Geçmişi ve Tahmin İsabet Oranı</p>
                  </div>
                </div>
                <button onClick={() => setSelectedSym(null)}
                  style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.14s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  title="Pencereyi kapat"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>

              {histLoading ? (
                <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              ) : symHistError ? (
                <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(248,113,113,0.3)' }}>error</span>
                  <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(248,113,113,0.5)', margin: 0 }}>Geçmiş yüklenemedi</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24 }}>
                  {/* QRS chart — recharts AreaChart */}
                  <div>
                    <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', margin: '0 0 8px', lineHeight: 1.5 }}>
                      Son 30 taramadaki QRS skoru değişimi. Çizgi alanı = QRS gücü. Nokta üzerine gelin.
                    </p>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={symChartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                        <defs>
                          <linearGradient id="symQrsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T.primary} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={T.primary} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} interval="preserveStartEnd" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} width={30} />
                        <RTooltip content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `%${v}`} />} />
                        <Area type="monotone" dataKey="qrs" stroke={T.primary} strokeWidth={2} fill="url(#symQrsGrad)" isAnimationActive
                          dot={(props) => {
                            const { cx, cy, payload, index } = props;
                            if (!payload?.hit) return <g key={index} />;
                            return <circle key={index} cx={cx} cy={cy} r={4} fill={T.success} stroke={T.bg2} strokeWidth={1.5} />;
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 14, height: 3, borderRadius: 1, background: T.primary }} />
                        <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>QRS Skoru</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.success, boxShadow: `0 0 8px ${T.success}` }} />
                        <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>Hedef Fiyata Ulaştı</span>
                      </div>
                    </div>
                  </div>

                  {/* History table */}
                  <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                      <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.3)' }}>Tarama Geçmişi</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {['Tarih', 'QRS Skoru', 'Hedef İsabeti'].map((h, i) => (
                            <th key={h} style={{ padding: '8px 12px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.15)', textAlign: i === 2 ? 'center' : i === 1 ? 'right' : 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {symHist?.slice(-8).reverse().map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '8px 12px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{r.scan_date}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 900, color: T.primary }}>%{r.qrs_score?.toFixed(1)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.target_hit ? T.success : 'rgba(255,255,255,0.06)', boxShadow: r.target_hit ? `0 0 8px ${T.success}80` : 'none', margin: '0 auto' }}
                                title={r.target_hit ? 'Hedef fiyata ulaştı' : 'Hedef fiyata ulaşamadı'}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Glow */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: 400, height: 400, borderRadius: '50%', background: `${T.primary}05`, filter: 'blur(80px)', pointerEvents: 'none' }} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
