import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  RadialBarChart, RadialBar, PolarAngleAxis,
  LineChart, Line, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts';
import { cn } from '@/shared/utils/cn';
import { aFetch, Spinner, SectionTitle, Btn, DirBadge, fmtElapsed, AnimatedNumber, ChartTooltip, T } from './shared';

// ── Design tokens ─────────────────────────────────────────────────────────────
const R = 5;

// ── Reusable metric gauge bar ─────────────────────────────────────────────────
function MetricBar({ value = 0, max = 100, color = '#99f7ff', height = 3 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height, borderRadius: 2, background: 'rgba(255,255,255,0.04)' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ height: '100%', borderRadius: 2, background: color, boxShadow: `0 0 6px ${color}55` }}
      />
    </div>
  );
}

// ── Small stat tile ───────────────────────────────────────────────────────────
function StatTile({ label, value, unit = '', color = 'rgba(255,255,255,0.65)', sub }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: R, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, color, margin: 0 }}>
        {value ?? '—'}<span style={{ fontSize: 9, marginLeft: 2, color: 'rgba(255,255,255,0.2)' }}>{unit}</span>
      </p>
      {sub && <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

function fmtUptime(secs) {
  if (!secs) return '—';
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}g ${h}sa ${m}dk`;
  if (h > 0) return `${h}sa ${m}dk`;
  return `${m}dk`;
}

// ── Latest Results Grid ───────────────────────────────────────────────────────
function LatestResultsGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ['a-latest-results'],
    queryFn: ({ signal }) => aFetch('/api/admin/predictions?per_page=12', { signal }),
    staleTime: 10_000, refetchInterval: 15_000, placeholderData: keepPreviousData,
  });
  if (isLoading) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <SectionTitle icon="ads_click" title="Son Üretilen Sinyaller" />
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 10px', lineHeight: 1.6 }}>
        En son tarama oturumunda üretilen sinyal kartları. Yeşil alt çizgi = değerlendirilmiş, mavi = beklemede.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {(data?.items || []).map(r => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ padding: '10px 12px', borderRadius: R, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)', cursor: 'default', position: 'relative', overflow: 'hidden' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(153,247,255,0.18)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: '#99f7ff' }}>{r.symbol}</span>
              <DirBadge d={r.target_direction} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.8)', margin: '0 0 4px' }}>%{r.qrs_score?.toFixed(1)}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{r.profile_name?.slice(0, 8)}</span>
              <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.1)' }}>{r.scan_date?.split('-').slice(1).join('/')}</span>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5, background: r.evaluated_at ? 'rgba(52,211,153,0.3)' : 'rgba(153,247,255,0.1)' }} />
          </motion.div>
        ))}
      </div>
      {!data?.items?.length && (
        <div style={{ padding: '48px 0', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: R, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.1)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Henüz sinyal üretilmedi. İlk tarama başlatıldıktan sonra kartlar burada görünecek.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Radial Gauge Card ─────────────────────────────────────────────────────────
function GaugeCard({ title, subtitle, icon, value = 0, color, history = [], children }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const gaugeData = [{ name: title, value: pct, fill: color }];
  return (
    <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.25)' }}>{title}</span>
          {subtitle && <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: '2px 0 0', lineHeight: 1.4 }}>{subtitle}</p>}
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: color + '88' }}>{icon}</span>
      </div>

      {/* Radial gauge with centered value */}
      <div style={{ position: 'relative', height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="72%" outerRadius="100%" data={gaugeData} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: 'rgba(255,255,255,0.04)' }} dataKey="value" cornerRadius={6} angleAxisId={0} fill={color} isAnimationActive />
          </RadialBarChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, color }}>
            <AnimatedNumber value={pct} decimals={pct % 1 === 0 ? 0 : 1} duration={0.8} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>%</span>
        </div>
      </div>

      {/* Live sparkline — last N samples */}
      {history.length > 1 && (
        <div style={{ height: 28, marginTop: -2 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 3, right: 2, bottom: 0, left: 2 }}>
              <RTooltip cursor={{ stroke: 'rgba(255,255,255,0.1)' }} content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `%${v}`} />} />
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function LiveTab() {
  const qc = useQueryClient();
  const { data: live, isPending: isLoading, error: liveError, dataUpdatedAt: liveUpdatedAt } = useQuery({
    queryKey: ['a-live'],
    queryFn: ({ signal }) => aFetch('/api/admin/live', { signal }),
    staleTime: 10_000, refetchInterval: 15_000, placeholderData: keepPreviousData,
  });
  const { data: prog } = useQuery({
    queryKey: ['a-progress'],
    queryFn: ({ signal }) => aFetch('/api/progress', { signal }),
    staleTime: 3_000, refetchInterval: 5_000, placeholderData: keepPreviousData,
  });
  const { data: logs } = useQuery({
    queryKey: ['a-logs'],
    queryFn: ({ signal }) => aFetch('/api/admin/logs?limit=100', { signal }),
    staleTime: 10_000, refetchInterval: 20_000, placeholderData: keepPreviousData,
  });

  const [killing, setKilling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [logFilter, setLogFilter] = useState('ALL');
  const [logSearch, setLogSearch] = useState('');

  const killScan = async () => {
    setKilling(true);
    try { await aFetch('/api/admin/scan/kill', { method: 'POST' }); qc.invalidateQueries({ queryKey: ['a-live'] }); }
    catch (err) { console.error('[Admin] Kill scan failed:', err); }
    setKilling(false);
  };

  const triggerScan = async () => {
    setStarting(true);
    try {
      await aFetch('/api/admin/trigger/scan', { method: 'POST' });
      qc.invalidateQueries({ queryKey: ['a-live'] });
      window.dispatchEvent(new CustomEvent('admin-notify', { detail: { msg: 'Manuel tarama kuyruğa eklendi.', type: 'success' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('admin-notify', { detail: { msg: 'Tarama başlatılamadı.', type: 'error' } }));
    }
    setStarting(false);
  };

  const scan   = live?.scan || {};
  const active = scan.active || {};
  const queue  = scan.queue || [];
  const proc   = live?.process || {};
  const sys    = live?.system || {};

  // ── Live telemetry history — append last N samples (max 20) ──────────────────
  // Synchronizes a rolling buffer with each poll of the external /live endpoint.
  const [hist, setHist] = useState({ cpu: [], ram: [], disk: [] });
  const lastTsRef = useRef(null);
  const cpuU = sys.cpu_usage, ramU = sys.ram_usage, diskU = sys.disk_usage;
  useEffect(() => {
    if (!liveUpdatedAt || liveUpdatedAt === lastTsRef.current) return;
    if (cpuU == null && ramU == null) return;
    lastTsRef.current = liveUpdatedAt;
    const t = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const push = (arr, v) => [...arr, { v: v != null ? +(+v).toFixed(1) : 0, label: t }].slice(-20);
    setHist(prev => ({
      cpu:  push(prev.cpu,  cpuU),
      ram:  push(prev.ram,  ramU),
      disk: push(prev.disk, diskU),
    }));
  }, [liveUpdatedAt, cpuU, ramU, diskU]);

  const cpuColor  = sys.cpu_usage  > 85 ? '#f87171' : sys.cpu_usage  > 60 ? '#fbbf24' : '#99f7ff';
  const ramColor  = sys.ram_usage  > 85 ? '#f87171' : sys.ram_usage  > 70 ? '#fbbf24' : '#34d399';
  const diskColor = sys.disk_usage > 90 ? '#f87171' : sys.disk_usage > 75 ? '#fbbf24' : '#a855f7';

  const logLevels   = ['ALL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'];
  const levelColor  = { ERROR: '#f87171', WARNING: '#fbbf24', INFO: 'rgba(255,255,255,0.45)', DEBUG: 'rgba(255,255,255,0.18)' };
  const levelBg     = { ERROR: 'rgba(248,113,113,0.04)', WARNING: 'rgba(251,191,36,0.03)' };
  const levelBorder = { ERROR: '2px solid rgba(248,113,113,0.3)', WARNING: '2px solid rgba(251,191,36,0.2)' };

  const filteredLogs = (logs?.items || []).filter(l => {
    if (logFilter !== 'ALL' && l.level !== logFilter) return false;
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      return (l.msg || '').toLowerCase().includes(q) || (l.name || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (liveError) return (
    <div style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#f87171' }}>cloud_off</span>
      <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#f87171' }}>Canlı Bağlantı Koptu</p>
      <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)' }}>{liveError.message}</p>
      <Btn onClick={() => qc.invalidateQueries({ queryKey: ['a-live'] })} style={{ marginTop: 8 }}>Yeniden Bağlan</Btn>
    </div>
  );

  if (isLoading && !live) return (
    <div style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Spinner />
      <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.2)' }}>Canlı Telemetri Bağlanıyor...</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ══ 1. ACTIVE SCAN ══════════════════════════════════════════════════════ */}
      <div style={{
        borderRadius: R,
        border: active.user_email ? '1px solid rgba(153,247,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
        background: active.user_email ? 'rgba(153,247,255,0.03)' : 'rgba(255,255,255,0.02)',
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: active.user_email ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: active.user_email ? '#99f7ff' : 'rgba(255,255,255,0.12)', boxShadow: active.user_email ? '0 0 8px rgba(153,247,255,0.6)' : 'none', flexShrink: 0, position: 'relative' }}>
              {active.user_email && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#99f7ff', animation: 'ping 1.2s ease-in-out infinite', opacity: 0.5 }} />}
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                {active.user_email ? `CANLI TARAMA · ${active.user_email}` : 'Aktif Tarama & Görev Kuyruğu'}
              </p>
              {!active.user_email && (
                <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: '2px 0 0' }}>Şu anda aktif tarama yok. Manuel tarama başlatmak için aşağıdaki butona basın.</p>
              )}
            </div>
          </div>
          {active.user_email && (
            <Btn variant="danger" onClick={killScan} disabled={killing} title="Devam eden taramayı zorla durdur">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>stop_circle</span>
              {killing ? 'Durduruluyor...' : 'Taramayı Zorla Durdur'}
            </Btn>
          )}
        </div>

        {active.user_email ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
              <StatTile label="Başlatan Kullanıcı"  value={active.user_email?.split('@')[0]} color="#99f7ff" sub={active.user_email} />
              <StatTile label="Geçen Süre"           value={fmtElapsed(active.elapsed)}        color="#fbbf24" sub="Tarama başlangıcından itibaren" />
              <StatTile label="Mevcut Aşama"         value={prog?.stage || '—'}                color="rgba(255,255,255,0.65)" sub="Pipeline adımı" />
              <StatTile label="Tamamlanma Yüzdesi"   value={`%${prog?.percent ?? 0}`}          color="#99f7ff" sub="İşlem ilerlemesi" />
            </div>
            <MetricBar value={prog?.percent || 0} color="#99f7ff" height={4} />
            {prog?.message && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 6 }}>{prog.message}</p>}
          </div>
        ) : (
          <div style={{ padding: '32px 0', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: R, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'rgba(255,255,255,0.06)' }}>radar</span>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', margin: '0 0 4px' }}>Sistem Boşta</p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', margin: 0 }}>Manuel bir tarama başlatmak için hazır. Tüm BIST sembolleri analiz edilecek.</p>
            </div>
            <Btn variant="primary" onClick={triggerScan} disabled={starting} title="Tüm BIST hisselerini şimdi tara">
              {starting ? <Spinner size={12} /> : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>TARAMAYI ŞIMDI BAŞLAT</>}
            </Btn>
          </div>
        )}
      </div>

      <LatestResultsGrid />

      {/* ══ 2. SERVER TELEMETRY ═════════════════════════════════════════════════ */}
      <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'rgba(153,247,255,0.35)' }}>monitoring</span>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.25)' }}>Sistem Kaynakları</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.5)', display: 'inline-block' }} />
            {sys.hostname || 'host'} · {sys.os || '—'}
          </div>
        </div>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Sunucu sağlığını gerçek zamanlı izleyin. Kırmızı değerler dikkat gerektirir.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
          <GaugeCard
            title="CPU İşlemci Kullanımı"
            subtitle="Yüksek kullanım tarama süresini uzatır"
            icon="memory"
            value={sys.cpu_usage ?? 0}
            color={cpuColor}
            history={hist.cpu}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4 }}>
              {[['Kullanıcı', sys.cpu_user_pct], ['Sistem', sys.cpu_system_pct], ['Boşta', sys.cpu_idle_pct]].map(([k, v]) => (
                <div key={k} style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', textTransform: 'uppercase', margin: '0 0 2px' }}>{k}</p>
                  <p style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.4)', margin: 0 }}>{v ?? 0}%</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', fontFamily: "'IBM Plex Mono', monospace" }}>
              {sys.cpu_count ?? '?'} çekirdek · {sys.cpu_freq_mhz ? `${sys.cpu_freq_mhz} MHz` : '—'}
            </p>
          </GaugeCard>

          <GaugeCard
            title="Bellek (RAM) Kullanımı"
            subtitle="Uygulama bellek tüketimi"
            icon="dns"
            value={sys.ram_usage ?? 0}
            color={ramColor}
            history={hist.ram}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <StatTile label="Kullanılan" value={sys.ram_used_gb ?? 0} unit=" GB" color="rgba(255,255,255,0.55)" />
              <StatTile label="Boş"        value={sys.ram_available_gb ?? 0} unit=" GB" color="rgba(255,255,255,0.55)" />
            </div>
          </GaugeCard>

          <GaugeCard
            title="Disk Kullanımı"
            subtitle="%90 üzeri kritik seviye"
            icon="hard_drive"
            value={sys.disk_usage ?? 0}
            color={diskColor}
            history={hist.disk}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <StatTile label="Kullanılan" value={sys.disk_used_gb ?? 0} unit=" GB" color="rgba(255,255,255,0.55)" />
              <StatTile label="Boş"        value={sys.disk_free_gb ?? 0}  unit=" GB" color="rgba(255,255,255,0.55)" />
            </div>
          </GaugeCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <StatTile label="Ağ — Gelen Trafik"  value={sys.net_recv_mb ?? '—'}  unit=" MB" color="#34d399" sub="Toplam indirilen veri" />
          <StatTile label="Ağ — Giden Trafik"  value={sys.net_sent_mb ?? '—'}  unit=" MB" color="#99f7ff" sub="Toplam yüklenen veri" />
          <StatTile label="Uygulama RAM"        value={proc.mem_mb}              unit=" MB" color="#fbbf24" sub={`${proc.threads ?? '?'} aktif thread`} />
          <StatTile label="Sistem Çalışma Süresi" value={fmtUptime(sys.uptime_sec)} color="rgba(255,255,255,0.5)" sub={`Süreç Kimliği (PID): ${proc.pid ?? '?'}`} />
        </div>
      </div>

      {/* ══ 3. QUEUE & COOLDOWNS ════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Queue */}
        <div>
          <SectionTitle icon="queue" title={`Görev Kuyruğu — Bekleyen ve Aktif İşlemler (${queue.length}/${scan.max_queue ?? 5})`} />
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', margin: '-4px 0 8px', lineHeight: 1.5 }}>
            Tarama başlatmak isteyen kullanıcıların sıra listesi. Maksimum {scan.max_queue ?? 5} kişi bekleyebilir.
          </p>
          {queue.length === 0 ? (
            <div style={{ padding: '20px', borderRadius: R, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'rgba(255,255,255,0.05)' }}>hourglass_empty</span>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.1)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>Kuyruk Boş — Bekleyen İşlem Yok</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {queue.map(q => (
                <div key={q.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: R, border: '1px solid rgba(153,247,255,0.1)', background: 'rgba(153,247,255,0.02)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(153,247,255,0.05)', border: '1px solid rgba(153,247,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 900, color: '#99f7ff', flexShrink: 0 }}>#{q.position}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase', margin: 0 }}>{q.user_email}</p>
                    <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace", margin: 0 }}>{fmtElapsed(q.wait_secs)} bekledi</p>
                  </div>
                  <Btn variant="danger" onClick={async () => { await aFetch(`/api/admin/queue/${q.user_id}`, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['a-live'] }); }} style={{ padding: '4px 8px' }} title="Bu kullanıcıyı kuyruktan çıkar">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>remove_circle</span>
                  </Btn>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cooldowns */}
        <div>
          <SectionTitle icon="timer_off" title="Bekleme Süresi Olan Kullanıcılar" />
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', margin: '-4px 0 8px', lineHeight: 1.5 }}>
            Yakın zamanda tarama yapan kullanıcıların kalan bekleme süreleri. Süre dolmadan yeni tarama başlatamazlar.
          </p>
          {(scan.user_cooldowns && Object.keys(scan.user_cooldowns).length > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(scan.user_cooldowns).map(([uid, secs]) => (
                <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: R, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'rgba(255,255,255,0.2)' }}>person</span>
                  <span style={{ flex: 1, fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis' }}>#{String(uid).slice(0, 8)}</span>
                  <p style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 900, color: '#fbbf24', margin: 0 }}>{secs}s</p>
                  <button onClick={async () => { await aFetch(`/api/admin/users/${uid}/reset-cooldown`, { method: 'POST' }); qc.invalidateQueries({ queryKey: ['a-live'] }); }}
                    style={{ width: 26, height: 26, borderRadius: 4, background: 'rgba(153,247,255,0.06)', border: '1px solid rgba(153,247,255,0.18)', color: '#99f7ff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    title="Bu kullanıcının bekleme süresini sıfırla — anında tarama yapabilir">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>restart_alt</span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px', borderRadius: R, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'rgba(255,255,255,0.05)' }}>check_circle</span>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.1)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', margin: 0 }}>Tüm Kullanıcılar Serbest</p>
            </div>
          )}
        </div>
      </div>

      {/* ══ 4. LOG CONSOLE ══════════════════════════════════════════════════════ */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
          <div>
            <SectionTitle icon="terminal" title="Sistem Log Konsolu" />
            <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', margin: '-4px 0 0', lineHeight: 1.5 }}>
              Gerçek zamanlı sistem logları. Hata veya uyarı varsa kırmızı/sarı satır olarak görünür.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>search</span>
              <input
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Log içinde ara..."
                style={{ paddingLeft: 26, paddingRight: 10, paddingTop: 5, paddingBottom: 5, borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.6)', outline: 'none', width: 160 }}
                onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.25)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
              />
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {logLevels.map(l => (
                <button key={l} onClick={() => setLogFilter(l)}
                  style={{ padding: '3px 8px', borderRadius: 3, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', border: '1px solid', transition: 'all 0.12s', background: logFilter === l ? 'rgba(153,247,255,0.08)' : 'rgba(255,255,255,0.02)', borderColor: logFilter === l ? 'rgba(153,247,255,0.3)' : 'rgba(255,255,255,0.06)', color: logFilter === l ? '#99f7ff' : 'rgba(255,255,255,0.25)', fontFamily: 'inherit' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', padding: '10px', height: 360, overflow: 'hidden' }}>
          <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }} className="custom-scrollbar">
            {filteredLogs.map((l, i) => {
              const msgText = l.msg || '';
              const matchIdx = logSearch.trim() ? msgText.toLowerCase().indexOf(logSearch.toLowerCase()) : -1;
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 6px', borderRadius: 3, borderLeft: levelBorder[l.level] || 'none', background: levelBg[l.level] || 'transparent' }}>
                  <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)', flexShrink: 0, userSelect: 'none' }}>
                    {new Date(l.ts * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 900, width: 52, flexShrink: 0, textAlign: 'center', color: levelColor[l.level] || 'rgba(255,255,255,0.2)' }}>
                    {l.level}
                  </span>
                  <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.18)', flexShrink: 0, width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.5)', flex: 1, wordBreak: 'break-all', lineHeight: 1.5 }}>
                    {matchIdx >= 0 ? (
                      <>{msgText.slice(0, matchIdx)}<mark style={{ background: 'rgba(153,247,255,0.2)', color: '#99f7ff', borderRadius: 2, padding: '0 2px' }}>{msgText.slice(matchIdx, matchIdx + logSearch.length)}</mark>{msgText.slice(matchIdx + logSearch.length)}</>
                    ) : msgText}
                  </span>
                </div>
              );
            })}
            {filteredLogs.length === 0 && (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.08)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em' }}>
                  {logSearch.trim() ? `"${logSearch}" için sonuç bulunamadı` : 'Henüz log kaydı yok'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
