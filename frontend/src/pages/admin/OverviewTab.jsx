import React, { useState, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  aFetch, Spinner, SectionTitle, relTime, T,
  AnimatedNumber, Sparkline, TrendBadge, ChartTooltip,
} from './shared';

// ── Hero metric card — big animated number + trend ─────────────────────────────
function HeroCard({ label, value, decimals = 0, prefix = '', suffix = '', icon, color = T.primary, trend, trendInvert = false, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        position: 'relative', overflow: 'hidden',
        borderRadius: 8, border: `1px solid ${color}22`,
        background: `linear-gradient(135deg, ${color}0a 0%, ${T.bg2} 60%)`,
        padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>{label}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: `${color}99` }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 34, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '-0.03em', lineHeight: 1, color }}>
          <AnimatedNumber value={value ?? 0} decimals={decimals} prefix={prefix} suffix={suffix} />
        </span>
        {trend != null && <TrendBadge value={trend} invert={trendInvert} />}
      </div>
      {sub && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: 0, lineHeight: 1.5 }}>{sub}</p>}
      <div style={{ position: 'absolute', bottom: -28, right: -28, width: 90, height: 90, borderRadius: '50%', background: `${color}10`, filter: 'blur(34px)', pointerEvents: 'none' }} />
    </motion.div>
  );
}

export function OverviewTab() {
  const [selectedSym, setSelectedSym] = useState(null);

  const { data: stats, isLoading: sL, error: sE } = useQuery({
    queryKey: ['a-stats'],
    queryFn: ({ signal }) => aFetch('/api/admin/stats', { signal }),
    staleTime: 30_000, refetchInterval: 30_000, placeholderData: keepPreviousData,
  });
  const { data: live, isPending: lL, error: lE } = useQuery({
    queryKey: ['a-live'],
    queryFn: ({ signal }) => aFetch('/api/admin/live', { signal }),
    staleTime: 10_000, refetchInterval: 15_000, placeholderData: keepPreviousData,
  });
  const { data: hourly } = useQuery({
    queryKey: ['a-hourly'],
    queryFn: ({ signal }) => aFetch('/api/admin/activity/hourly', { signal }),
    staleTime: 60_000, refetchInterval: 60_000, placeholderData: keepPreviousData,
  });
  const { data: breadth } = useQuery({
    queryKey: ['a-market-breadth'],
    queryFn: ({ signal }) => aFetch('/api/admin/market-breadth', { signal }),
    staleTime: 30_000, placeholderData: keepPreviousData,
  });
  const { data: performers } = useQuery({
    queryKey: ['a-top-performers'],
    queryFn: ({ signal }) => aFetch('/api/admin/top-performers', { signal }),
    staleTime: 120_000, placeholderData: keepPreviousData,
  });
  // QRS trend gives per-symbol history (last 30d) — used for sparklines
  const { data: trend } = useQuery({
    queryKey: ['a-qrs-trend-overview'],
    queryFn: ({ signal }) => aFetch('/api/admin/qrs-trend?limit=30', { signal }),
    staleTime: 120_000, placeholderData: keepPreviousData,
  });
  const { data: symHist, isLoading: histLoading } = useQuery({
    queryKey: ['a-sym-hist', selectedSym],
    queryFn: ({ signal }) => aFetch(`/api/admin/symbol-history?symbol=${selectedSym}`, { signal }),
    enabled: !!selectedSym, staleTime: 60_000,
  });
  const { data: profilePerf } = useQuery({
    queryKey: ['a-profile-perf'],
    queryFn: ({ signal }) => aFetch('/api/admin/profile-performance?days=30', { signal }),
    staleTime: 120_000, refetchInterval: 120_000, placeholderData: keepPreviousData,
  });
  const { data: riskMetrics } = useQuery({
    queryKey: ['a-risk-metrics'],
    queryFn: ({ signal }) => aFetch('/api/admin/risk-metrics?days=30', { signal }),
    staleTime: 120_000, refetchInterval: 120_000, placeholderData: keepPreviousData,
  });

  // Map symbol -> last-7d qrs history for sparkline
  const histBySym = useMemo(() => {
    const m = {};
    (trend || []).forEach(t => { m[t.symbol] = (t.history || []).slice(-7).map(h => ({ v: h.qrs })); });
    return m;
  }, [trend]);

  if ((sL && !stats) || (lL && !live)) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {sE || lE ? (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: T.danger }}>cloud_off</span>
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: T.danger, margin: 0 }}>Veri Senkronizasyon Hatası</p>
            <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: T.dim, margin: 0 }}>{(sE || lE)?.message}</p>
          </>
        ) : (
          <>
            <Spinner />
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: T.dim, margin: 0 }}>Terminal Senkronize Ediliyor...</p>
          </>
        )}
      </div>
    );
  }

  const s = stats?.scans || {};
  const c = stats?.calibration || {};
  const u = stats?.users || {};

  // Market breadth donut
  const breadthData = [
    { name: 'Yükseliş', key: 'bullish', value: breadth?.bullish || 0, color: T.success },
    { name: 'Nötr', key: 'neutral', value: breadth?.neutral || 0, color: 'rgba(255,255,255,0.18)' },
    { name: 'Düşüş', key: 'bearish', value: breadth?.bearish || 0, color: T.danger },
  ].filter(d => d.value > 0);
  const breadthTotal = breadth?.total || 0;
  const sentiment = breadth?.sentiment ?? 0;

  // Hourly bar chart data
  const hourlyData = (hourly?.hours || []).map(h => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    rawHour: h.hour,
    count: h.count,
    isNow: h.hour === new Date().getHours(),
  }));

  // Symbol detail area chart
  const symChartData = (symHist || []).slice(-30).map(r => ({
    date: r.scan_date?.slice(5),
    qrs: r.qrs_score != null ? +r.qrs_score.toFixed(1) : 0,
    hit: r.target_hit,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Sayfa başlığı ── */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>Performans Genel Bakış</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
          PivotRadar sisteminin anlık performansı, piyasa duyarlılığı ve en iyi performans gösteren semboller. Veriler otomatik yenilenir.
        </p>
      </div>

      {/* ── HERO: 3 büyük animasyonlu kart ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <HeroCard
          label="Bugün Taranan Sinyal"
          value={live?.scans_today ?? 0}
          icon="radar"
          color={T.primary}
          sub="Bugün başlatılan tarama oturumu sayısı"
        />
        <HeroCard
          label="30 Günlük İsabet Oranı"
          value={c.hit_rate ?? 0}
          decimals={1}
          suffix="%"
          icon="target"
          color={c.hit_rate >= 60 ? T.success : c.hit_rate >= 40 ? T.warning : T.danger}
          sub={`${(c.total_hits ?? 0).toLocaleString('tr-TR')} hedef isabeti · ${(c.total_evaluated ?? 0).toLocaleString('tr-TR')} değerlendirildi`}
        />
        <HeroCard
          label="Ortalama QRS Skoru"
          value={s.avg_qrs ?? 0}
          decimals={1}
          icon="score"
          color={T.warning}
          sub="Tüm kayıtların ortalama sinyal kalite puanı (0–100)"
        />
      </div>

      {/* ── Row: Breadth donut | Saatlik aktivite ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 14 }}>

        {/* Market breadth donut */}
        <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '16px 18px' }}>
          <SectionTitle icon="donut_large" title="Piyasa Genişliği" />
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 8px', lineHeight: 1.5 }}>
            Son tarama seansındaki yükseliş / düşüş beklentili sembol oranı.
          </p>
          {breadthTotal === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'rgba(255,255,255,0.06)' }}>data_usage</span>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: T.faint, margin: 0 }}>Veri Yok</p>
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={breadthData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={78} paddingAngle={2} stroke="none" isAnimationActive>
                      {breadthData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <RTooltip content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `${v} sembol`} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ fontSize: 26, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: sentiment >= 50 ? T.success : T.danger, lineHeight: 1 }}>
                    <AnimatedNumber value={sentiment} decimals={0} suffix="%" />
                  </span>
                  <span style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: T.muted, marginTop: 3 }}>Yükseliş</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {[
                  { label: 'Yükseliş', value: breadth?.bullish || 0, color: T.success },
                  { label: 'Nötr', value: breadth?.neutral || 0, color: 'rgba(255,255,255,0.3)' },
                  { label: 'Düşüş', value: breadth?.bearish || 0, color: T.danger },
                ].map(it => (
                  <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>{it.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: it.color }}>{it.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Saatlik aktivite — recharts BarChart */}
        <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '16px 18px' }}>
          <SectionTitle icon="bar_chart" title="Saatlik Tarama Aktivitesi" />
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 8px', lineHeight: 1.5 }}>
            Bugünün saatlerine göre tarama yoğunluğu. Aydınlık bar = şimdiki saat. Üzerine gelin.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace" }} interval={2} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} allowDecimals={false} width={34} />
              <RTooltip cursor={{ fill: 'rgba(153,247,255,0.05)' }} content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `${v} sinyal`} />} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive>
                {hourlyData.map((d, i) => <Cell key={i} fill={d.isNow ? T.primary : 'rgba(153,247,255,0.22)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── GSC-style: En İyi Performans Gösteren Semboller ── */}
      <div>
        <SectionTitle icon="leaderboard" title="En İyi Performans Gösteren Semboller" />
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 10px', lineHeight: 1.6 }}>
          Son 30 günde tahmin hedefine en çok ulaşan semboller (en az 3 tarama). Bir sembole tıklayarak QRS trend detayını açın.
        </p>
        <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
                  {[
                    { h: 'Sembol', a: 'left' },
                    { h: 'Toplam Tarama', a: 'right' },
                    { h: 'Hedef İsabeti', a: 'right' },
                    { h: 'İsabet Oranı', a: 'left' },
                    { h: 'Ort. QRS', a: 'right' },
                    { h: 'Son 7 Gün', a: 'center' },
                  ].map((col, i) => (
                    <th key={i} style={{ padding: '11px 16px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.22)', textAlign: col.a, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!performers || performers.length === 0) ? (
                  <tr><td colSpan={6} style={{ padding: '48px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: T.faint, margin: 0 }}>Henüz yeterli performans verisi birikmedi</p>
                  </td></tr>
                ) : performers.map((p, i) => {
                  const trendObj = (trend || []).find(t => t.symbol === p.symbol);
                  const accColor = p.accuracy >= 60 ? T.success : p.accuracy >= 40 ? T.warning : T.danger;
                  return (
                    <tr key={p.symbol} onClick={() => setSelectedSym(p.symbol)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.12s', background: selectedSym === p.symbol ? 'rgba(153,247,255,0.04)' : 'transparent' }}
                      onMouseEnter={e => { if (selectedSym !== p.symbol) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                      onMouseLeave={e => { if (selectedSym !== p.symbol) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)', width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: T.primary, fontFamily: "'IBM Plex Mono', monospace" }}>{p.symbol}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.5)' }}>{p.total_scans}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 900, color: T.success }}>{p.hits}</td>
                      <td style={{ padding: '12px 16px', minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, p.accuracy)}%` }} transition={{ duration: 0.8 }}
                              style={{ height: '100%', borderRadius: 2, background: accColor, boxShadow: `0 0 6px ${accColor}60` }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: accColor, width: 40, textAlign: 'right' }}>%{p.accuracy}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 900, color: trendObj ? T.warning : 'rgba(255,255,255,0.3)' }}>
                        {trendObj?.avg_qrs != null ? `%${trendObj.avg_qrs}` : '—'}
                      </td>
                      <td style={{ padding: '8px 16px', width: 110 }}>
                        <div style={{ width: 90, marginLeft: 'auto', marginRight: 'auto' }}>
                          <Sparkline data={histBySym[p.symbol] || []} color={accColor} height={28} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detay kartı — seçili sembol için AreaChart */}
        <AnimatePresence>
          {selectedSym && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ borderRadius: 8, border: '1px solid rgba(153,247,255,0.14)', background: T.bg2, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 7, background: 'rgba(153,247,255,0.08)', border: '1px solid rgba(153,247,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: T.primary, fontFamily: "'IBM Plex Mono', monospace" }}>{selectedSym.slice(0, 2)}</span>
                    </div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 900, color: 'rgba(255,255,255,0.9)', margin: 0 }}>{selectedSym}</p>
                      <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: T.muted, margin: 0 }}>Son 30 Günlük QRS Trendi</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedSym(null)}
                    style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Kapat">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>
                {histLoading ? (
                  <div style={{ padding: '48px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
                ) : symChartData.length < 2 ? (
                  <div style={{ padding: '48px 0', textAlign: 'center' }}>
                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: T.faint, margin: 0 }}>Yeterli geçmiş veri yok</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={symChartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="qrsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.primary} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={T.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} width={30} />
                      <RTooltip content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `%${v}`} />} />
                      <Area type="monotone" dataKey="qrs" stroke={T.primary} strokeWidth={2} fill="url(#qrsGrad)" isAnimationActive />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Profil Performans Tablosu ── */}
      {profilePerf && profilePerf.length > 0 && (
        <div>
          <div style={{ paddingBottom: 6, marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.primary }}>psychology</span>
            <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Profil Bazlı Performans (Son 30 Gün)</p>
          </div>
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 10px', lineHeight: 1.6 }}>
            Her tarama profilinin yönsel isabet oranı ve ortalama getirisi. Negatif getirili profiller uyarı rozeti ile işaretlenir.
          </p>
          <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
                    {[
                      { h: 'Profil', a: 'left' },
                      { h: 'Toplam Sinyal', a: 'right' },
                      { h: 'Değerlendirilen', a: 'right' },
                      { h: 'İsabet Oranı', a: 'left' },
                      { h: 'Brüt Getiri', a: 'right' },
                      { h: 'Net Getiri*', a: 'right' },
                      { h: 'Durum', a: 'center' },
                    ].map((col, i) => (
                      <th key={i} style={{ padding: '11px 16px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.22)', textAlign: col.a, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>{col.h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profilePerf.map((p, i) => {
                    const hasReturn  = p.avg_return != null;
                    const isNeg      = hasReturn && p.avg_return < 0;
                    const isWarn     = hasReturn && p.avg_return < 0.5 && p.avg_return >= 0;
                    const retColor   = isNeg ? T.danger : isWarn ? T.warning : T.success;
                    const winColor   = (p.win_rate ?? 0) >= 55 ? T.success : (p.win_rate ?? 0) >= 40 ? T.warning : T.danger;
                    const noData     = p.evaluated === 0;
                    return (
                      <tr key={p.profile_name}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)', width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                            <span style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.8)' }}>{p.profile_name}</span>
                            {isNeg && (
                              <span title="Bu profil negatif ortalama getiri üretiyor" style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 7px', borderRadius: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: T.danger }}>
                                UYARI
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.total.toLocaleString('tr-TR')}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.evaluated.toLocaleString('tr-TR')}</td>
                        <td style={{ padding: '12px 16px', minWidth: 160 }}>
                          {noData ? (
                            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, p.win_rate ?? 0)}%` }} transition={{ duration: 0.8 }}
                                  style={{ height: '100%', borderRadius: 2, background: winColor, boxShadow: `0 0 6px ${winColor}60` }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: winColor, width: 44, textAlign: 'right' }}>%{p.win_rate?.toFixed(1) ?? '—'}</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 900, color: hasReturn ? retColor : 'rgba(255,255,255,0.2)' }}>
                          {hasReturn ? `${p.avg_return >= 0 ? '+' : ''}${p.avg_return.toFixed(2)}%` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 900 }}>
                          {p.avg_return_net != null ? (
                            <span style={{ color: p.avg_return_net >= 0 ? T.success : T.danger }}>
                              {p.avg_return_net >= 0 ? '+' : ''}{p.avg_return_net.toFixed(2)}%
                            </span>
                          ) : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {noData ? (
                            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.12)', fontFamily: "'IBM Plex Mono', monospace" }}>Bekliyor</span>
                          ) : isNeg ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.danger }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>trending_down</span>
                              Negatif Getiri
                            </span>
                          ) : (p.win_rate ?? 0) >= 55 ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.success }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>check_circle</span>
                              Sağlıklı
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.warning }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                              İzleniyor
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.12)', margin: '6px 2px 0', lineHeight: 1.5 }}>
            * Net Getiri: brüt getiriden BIST komisyon (%0.16) ve spread (%0.10) maliyeti düşülmüş değerdir. Gerçek maliyet aracıya ve hisse likiditesine göre farklılık gösterebilir.
          </p>
        </div>
      )}

      {/* ── Row: Kalibrasyon + Kullanıcı + Son oturumlar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 14 }}>

        {/* Son oturumlar */}
        <div>
          <SectionTitle icon="history" title="Sistem Operasyon Günlüğü" />
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 10px', lineHeight: 1.6 }}>
            En son tarama oturumları. Her satır bir tarama döngüsünü temsil eder.
          </p>
          {live?.recent_sessions?.length > 0 ? (
            <div style={{ maxHeight: 280, overflowY: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2 }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
                    {['Başlangıç', 'Sembol', 'Ort. QRS', 'Profil'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'sticky', top: 0, background: T.bg3 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {live.recent_sessions.map(r => (
                    <tr key={r.session_id}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      style={{ transition: 'background 0.1s' }}>
                      <td style={{ padding: '9px 14px', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{relTime(r.started_at)}</td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}><span style={{ fontWeight: 900, color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{r.symbol_count}</span></td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: r.avg_qrs >= 70 ? T.primary : T.warning }}>{r.avg_qrs != null ? `%${r.avg_qrs}` : '—'}</span>
                          <div style={{ width: 44, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${r.avg_qrs || 0}%`, background: r.avg_qrs >= 70 ? T.primary : T.warning }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>{r.profile || 'Standart'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '40px 0', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 8, textAlign: 'center' }}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: T.faint, margin: 0 }}>Henüz oturum kaydı yok</p>
            </div>
          )}
        </div>

        {/* Kalibrasyon + Kullanıcı sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '14px 16px' }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>Kalibrasyon Özeti</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Ağırlıklı Doğruluk', value: c.blended_rate != null ? `%${c.blended_rate}` : '—', color: c.blended_rate >= 60 ? T.primary : T.warning },
                { label: 'Hedefe Ulaşan', value: (c.total_hits ?? 0).toLocaleString('tr-TR'), color: T.success },
                { label: 'Hedefe Yaklaşan', value: (c.near_misses ?? 0).toLocaleString('tr-TR'), color: T.primary },
                { label: 'Değerlendirildi', value: (c.total_evaluated ?? 0).toLocaleString('tr-TR'), color: 'rgba(255,255,255,0.5)' },
              ].map(it => (
                <div key={it.label}>
                  <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', margin: '0 0 3px' }}>{it.label}</p>
                  <p style={{ fontSize: 16, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: it.color, margin: 0 }}>{it.value}</p>
                </div>
              ))}
            </div>
          </div>
          {riskMetrics && riskMetrics.n > 0 && (
            <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '14px 16px' }}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>Risk Metrikleri (Son 30 Gün)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Sharpe (Proxy)', value: riskMetrics.sharpe_proxy != null ? riskMetrics.sharpe_proxy.toFixed(2) : '—', color: (riskMetrics.sharpe_proxy ?? 0) >= 0.5 ? T.success : (riskMetrics.sharpe_proxy ?? 0) >= 0 ? T.warning : T.danger, title: 'Ort. getiri / std sapma × √N (proxy)' },
                  { label: 'Benchmark Alpha', value: riskMetrics.avg_alpha != null ? `${riskMetrics.avg_alpha >= 0 ? '+' : ''}${riskMetrics.avg_alpha.toFixed(2)}%` : '—', color: (riskMetrics.avg_alpha ?? 0) >= 0 ? T.success : T.danger, title: 'BIST100\'e göre ortalama fazla getiri' },
                  { label: 'Max Kayıp (Avg)', value: riskMetrics.avg_max_loss != null ? `${riskMetrics.avg_max_loss.toFixed(1)}%` : '—', color: T.danger, title: 'Vade penceresi içindeki ortalama max kayıp' },
                  { label: 'BIST100 Üstü', value: riskMetrics.benchmark_win_rate != null ? `%${riskMetrics.benchmark_win_rate}` : '—', color: (riskMetrics.benchmark_win_rate ?? 0) >= 50 ? T.success : T.warning, title: 'BIST100\'i geçen tahmin oranı' },
                ].map(it => (
                  <div key={it.label} title={it.title}>
                    <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', margin: '0 0 3px' }}>{it.label}</p>
                    <p style={{ fontSize: 15, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: it.color, margin: 0 }}>{it.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '14px 16px' }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>Kullanıcı İstatistikleri</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Toplam', value: u.total ?? 0, color: 'rgba(255,255,255,0.8)' },
                { label: 'Aktif', value: u.active ?? 0, color: T.success },
                { label: 'Admin', value: u.superusers ?? 0, color: T.purple },
              ].map(it => (
                <div key={it.label}>
                  <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', margin: '0 0 3px' }}>{it.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: it.color, margin: 0 }}>
                    <AnimatedNumber value={it.value} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
