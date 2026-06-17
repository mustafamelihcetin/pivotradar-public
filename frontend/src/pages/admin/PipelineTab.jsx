import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { api } from '@/core/api/client';
import { aFetch, Spinner, SectionTitle, T, notify, ProgressBar, ChartTooltip } from './shared';

const R = 8;

// ── Küçük yardımcılar ─────────────────────────────────────────────────────────
const ageLabel = (h) => {
  if (h == null) return '—';
  if (h < 1)  return `${Math.round(h * 60)} dk`;
  if (h < 24) return `${h.toFixed(1)} sa`;
  return `${Math.floor(h / 24)} gün`;
};
const fmtPct = (v, dec = 1) => v != null ? `%${Number(v).toFixed(dec)}` : '—';
const fmtNum = (v, d = 3)   => v != null ? Number(v).toFixed(d) : '—';

// ── Model sağlık skoru hesabı ─────────────────────────────────────────────────
function modelHealthScore(meta, modelExists) {
  if (!modelExists) return { label: 'Model Yok',  color: T.danger,  icon: 'sentiment_dissatisfied', score: 0 };
  const auc = meta?.val_auc;
  const ece = meta?.val_ece;
  if (auc == null) return { label: 'Ölçülmedi',  color: '#f59e0b', icon: 'help',                   score: 1 };
  if (auc >= 0.62 && (ece == null || ece < 0.10)) return { label: 'Mükemmel', color: '#34d399',    icon: 'sentiment_very_satisfied', score: 4 };
  if (auc >= 0.57 && (ece == null || ece < 0.13)) return { label: 'İyi',      color: T.success,    icon: 'sentiment_satisfied',      score: 3 };
  if (auc >= 0.54 && (ece == null || ece < 0.15)) return { label: 'Normal',   color: T.primary,    icon: 'sentiment_neutral',        score: 2 };
  return { label: 'Dikkat',   color: T.danger,  icon: 'sentiment_dissatisfied', score: 1 };
}

// ── Avg QRS trend chart ───────────────────────────────────────────────────────
function QrsTrendChart() {
  const { data: trend, isLoading } = useQuery({
    queryKey: ['a-qrs-trend-pipeline'],
    queryFn: ({ signal }) => aFetch('/api/admin/qrs-trend?limit=50', { signal }),
    staleTime: 120_000, placeholderData: keepPreviousData,
  });
  const data = useMemo(() => {
    const byDate = {};
    (trend || []).forEach(t => (t.history || []).forEach(h => {
      if (!byDate[h.date]) byDate[h.date] = { sum: 0, n: 0 };
      byDate[h.date].sum += h.qrs; byDate[h.date].n += 1;
    }));
    return Object.entries(byDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date: date.slice(5), avg: +(v.sum / v.n).toFixed(1) }));
  }, [trend]);

  return (
    <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: T.primary }}>trending_up</span>
          <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.35)' }}>Piyasa Ortalama QRS Trendi</span>
        </div>
        <span style={{ fontSize: 8, color: T.dim }}>Son 30 gün</span>
      </div>
      {isLoading && !trend ? (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
      ) : data.length < 2 ? (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, color: T.dim }}>Yeterli veri yok</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <defs>
              <linearGradient id="qrsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.primary} stopOpacity={0.3} />
                <stop offset="100%" stopColor={T.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.15)' }} axisLine={false} tickLine={false} width={28} />
            <RTooltip content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `%${v}`} />} />
            <Area type="monotone" dataKey="avg" stroke={T.primary} strokeWidth={2} fill="url(#qrsGrad)" isAnimationActive />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ── Model Pulse — kompakt sağlık şeridi ──────────────────────────────────────
function ModelPulse({ mlHealth, pipelineStatus }) {
  const files    = mlHealth?.model_files    || {};
  const summary  = mlHealth?.summary        || {};
  const readiness = mlHealth?.readiness     || {};
  const meta     = files.base_model_meta    || {};
  const modelExists = pipelineStatus?.model?.exists ?? false;
  const health   = modelHealthScore(meta, modelExists);

  const metrics = [
    {
      key: 'auc', label: 'AUC',
      value: fmtNum(meta.val_auc, 3),
      sub: 'Sınıflandırma gücü',
      color: meta.val_auc == null ? T.dim : meta.val_auc >= 0.60 ? '#34d399' : meta.val_auc >= 0.54 ? T.primary : T.danger,
      hint: meta.val_auc != null ? (meta.val_auc >= 0.60 ? '↑ İyi' : meta.val_auc >= 0.54 ? '~ Normal' : '↓ Zayıf') : null,
    },
    {
      key: 'ece', label: 'Olasılık Sapması',
      value: fmtNum(meta.val_ece, 3),
      sub: 'Kalibrasyon kalitesi',
      color: meta.val_ece == null ? T.dim : meta.val_ece < 0.10 ? '#34d399' : meta.val_ece < 0.15 ? T.primary : T.danger,
      hint: meta.val_ece != null ? (meta.val_ece < 0.10 ? '↑ İyi' : meta.val_ece < 0.15 ? '~ Kabul' : '↓ Yüksek') : null,
    },
    {
      key: 'dir', label: 'Yön Doğruluğu',
      value: fmtPct(summary.directional_hit_rate_pct),
      sub: `${(summary.n_directional_evaluated || 0).toLocaleString('tr-TR')} değerlendirme`,
      color: summary.directional_hit_rate_pct == null ? T.dim : summary.directional_hit_rate_pct >= 55 ? '#34d399' : summary.directional_hit_rate_pct >= 50 ? T.primary : T.danger,
      hint: summary.directional_hit_rate_pct != null ? (summary.directional_hit_rate_pct >= 55 ? '↑ Güçlü' : summary.directional_hit_rate_pct >= 50 ? '~ Dengeli' : '↓ Zayıf') : null,
    },
    {
      key: 'schema', label: 'Schema',
      value: meta.feature_schema_version ? `V${meta.feature_schema_version}` : '—',
      sub: meta.features_hash ? `#${meta.features_hash}` : 'Feature versiyonu',
      color: T.purple,
      hint: meta.n_train != null ? `${meta.n_train} eğitim` : null,
    },
    {
      key: 'age', label: 'Model Yaşı',
      value: ageLabel(files.base_model_age_hours),
      sub: 'Son güncelleme',
      color: files.base_model_age_hours == null ? T.dim : files.base_model_age_hours < 24 ? T.success : files.base_model_age_hours < 168 ? T.primary : '#f59e0b',
      hint: ageLabel(files.isotonic_model_age_hours) !== '—' ? `Kalibrasyon: ${ageLabel(files.isotonic_model_age_hours)}` : null,
    },
  ];

  return (
    <div style={{ borderRadius: R, border: `1px solid ${health.color}25`, background: `linear-gradient(135deg, ${health.color}06 0%, rgba(7,9,14,0) 60%), ${T.bg2}`, display: 'flex', alignItems: 'stretch' }}>
      {/* Sol: Sağlık durumu */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, width: 180, flexShrink: 0, padding: '14px 16px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${health.color}15`, border: `2px solid ${health.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 18px ${health.color}25` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: health.color }}>{health.icon}</span>
          </div>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', margin: '0 0 3px' }}>Model Durumu</p>
            <p style={{ fontSize: 17, fontWeight: 900, color: health.color, margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>{health.label}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: readiness.ready_for_retrain ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.08)', border: `1px solid ${readiness.ready_for_retrain ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.2)'}`, color: readiness.ready_for_retrain ? '#34d399' : T.danger }}>
            {readiness.ready_for_retrain ? '✓ Eğitime Hazır' : `✗ Min ${readiness.min_retrain_samples || 80} örnek`}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: readiness.ready_for_calibration ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.08)', border: `1px solid ${readiness.ready_for_calibration ? 'rgba(52,211,153,0.25)' : 'rgba(251,191,36,0.2)'}`, color: readiness.ready_for_calibration ? '#34d399' : '#f59e0b' }}>
            {readiness.ready_for_calibration ? '✓ Kalibrasyona Hazır' : '⏳ Kalibrasyon bekliyor'}
          </span>
        </div>
      </div>

      {/* Sağ: Metrik grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, minWidth: 0 }}>
        {metrics.map((m, i) => (
          <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 14px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', justifyContent: 'center' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'rgba(255,255,255,0.28)', margin: 0 }}>{m.label}</p>
            <p style={{ fontSize: 20, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: m.color, margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }}>{m.value}</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: 0 }}>{m.sub}</p>
              {m.hint && <span style={{ fontSize: 9, fontWeight: 900, color: m.color, opacity: 0.75 }}>{m.hint}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pipeline akışı ────────────────────────────────────────────────────────────
function PipelineFlow({ status, prog, isScanActive, forcing, retraining, onScan, onEval, onRetrain }) {
  const c   = status?.counts  || {};
  const m   = status?.model   || {};
  const acc = status?.accuracy || {};

  const stages = [
    {
      step: 1, icon: 'radar', label: 'Tarama',
      desc: 'BIST veri toplama',
      color: T.primary,
      isActive: isScanActive,
      isComplete: (c.total || 0) > 0,
      status: isScanActive ? 'AKTİF' : 'HAZIR',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Tarama Havuzu</span>
            <span style={{ fontSize: 22, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.9)' }}>{(c.total || 0).toLocaleString()}</span>
          </div>
          {isScanActive && <ProgressBar value={prog?.percent || 0} color={T.primary} height={3} />}
          <button onClick={onScan} disabled={isScanActive}
            style={{ width: '100%', padding: '8px', borderRadius: 5, background: isScanActive ? 'rgba(255,255,255,0.03)' : T.primary, border: 'none', color: isScanActive ? 'rgba(255,255,255,0.25)' : '#000', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: isScanActive ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
            {isScanActive ? 'TARANIYOR...' : 'TARA'}
          </button>
        </div>
      ),
    },
    {
      step: 2, icon: 'hourglass_empty', label: 'Bekleme',
      desc: 'Tahmin vadesi',
      color: '#f59e0b',
      isActive: !isScanActive && (c.matured_ready || 0) > 0,
      isComplete: (c.evaluated || 0) > 0,
      status: (c.matured_ready || 0) > 0 ? 'OLGUN' : 'BEKLİYOR',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div style={{ textAlign: 'center', padding: '8px 6px', borderRadius: 6, background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.12)' }}>
            <p style={{ fontSize: 20, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: '#34d399', margin: '0 0 1px' }}>{c.matured_ready ?? 0}</p>
            <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(52,211,153,0.5)', margin: 0 }}>Hazır</p>
          </div>
          <div style={{ textAlign: 'center', padding: '8px 6px', borderRadius: 6, background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.1)' }}>
            <p style={{ fontSize: 20, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: '#f59e0b', margin: '0 0 1px' }}>{c.still_maturing ?? 0}</p>
            <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(251,191,36,0.5)', margin: 0 }}>Bekliyor</p>
          </div>
        </div>
      ),
    },
    {
      step: 3, icon: 'fact_check', label: 'Analiz',
      desc: 'Sonuç değerlendirme',
      color: T.purple,
      isActive: forcing,
      isComplete: (c.evaluated || 0) > 0,
      status: forcing ? 'HESAPLANIYOR' : 'HAZIR',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ padding: '8px', borderRadius: 6, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.12)' }}>
              <p style={{ fontSize: 8, color: 'rgba(168,85,247,0.6)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>İsabet</p>
              <p style={{ fontSize: 18, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.purple, margin: 0 }}>{acc.hit_rate != null ? `%${acc.hit_rate}` : '—'}</p>
            </div>
            <div style={{ padding: '8px', borderRadius: 6, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)' }}>
              <p style={{ fontSize: 8, color: 'rgba(16,185,129,0.6)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Yön</p>
              <p style={{ fontSize: 18, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.success, margin: 0 }}>{acc.directional_hit_rate != null ? `%${acc.directional_hit_rate}` : '—'}</p>
            </div>
          </div>
          <button onClick={onEval} disabled={forcing || isScanActive}
            style={{ width: '100%', padding: '8px', borderRadius: 5, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: forcing ? 'rgba(255,255,255,0.25)' : T.purple, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: forcing || isScanActive ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', opacity: forcing || isScanActive ? 0.5 : 1 }}>
            {forcing ? 'DEĞERLENDİRİLİYOR...' : 'DEĞERLENDİR'}
          </button>
        </div>
      ),
    },
    {
      step: 4, icon: 'model_training', label: 'Eğitim',
      desc: 'ML model güncelleme',
      color: T.success,
      isActive: m.exists && !forcing,
      isComplete: m.exists,
      status: m.exists ? 'AKTİF MODEL' : 'MODEL YOK',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div style={{ padding: '8px', borderRadius: 6, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)' }}>
              <p style={{ fontSize: 8, color: 'rgba(16,185,129,0.6)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>AUC</p>
              <p style={{ fontSize: 18, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.success, margin: 0 }}>{m.metrics?.auc?.toFixed(3) ?? '—'}</p>
            </div>
            <div style={{ padding: '8px', borderRadius: 6, background: T.bg3, border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Eğitim</p>
              <p style={{ fontSize: 18, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.5)', margin: 0 }}>{(m.metrics?.n ?? 0).toLocaleString()}</p>
            </div>
          </div>
          <button onClick={onRetrain} disabled={retraining || isScanActive || forcing}
            style={{ width: '100%', padding: '8px', borderRadius: 5, background: retraining ? 'rgba(255,255,255,0.03)' : 'rgba(16,185,129,0.08)', border: `1px solid ${retraining ? 'rgba(255,255,255,0.06)' : 'rgba(16,185,129,0.25)'}`, color: retraining ? 'rgba(255,255,255,0.2)' : T.success, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: retraining || isScanActive ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: isScanActive ? 0.5 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>model_training</span>
            {retraining ? 'EĞİTİLİYOR...' : 'YENİDEN EĞİT'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderRadius: R, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
      {stages.map((s, idx) => (
        <div key={s.step} style={{ position: 'relative', background: s.isActive ? `${s.color}08` : T.bg2, borderRight: idx < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none', padding: '14px 14px 12px', transition: 'background 0.3s', boxShadow: s.isActive ? `inset 0 0 30px ${s.color}10` : 'none' }}>
          {/* Aktif glow bar */}
          {s.isActive && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${s.color}, transparent)`, borderRadius: '2px 2px 0 0' }} />
          )}
          {/* Başlık */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: `${s.color}${s.isActive ? '18' : '0c'}`, border: `1px solid ${s.color}${s.isActive ? '40' : '20'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: s.color }}>{s.icon}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.25)' }}>Adım {s.step}</span>
                <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 6px', borderRadius: 3, background: s.isActive ? `${s.color}20` : 'rgba(255,255,255,0.04)', border: `1px solid ${s.isActive ? s.color + '40' : 'rgba(255,255,255,0.07)'}`, color: s.isActive ? s.color : 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.status}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 900, color: s.isActive ? s.color : 'rgba(255,255,255,0.8)', margin: 0 }}>{s.label}</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0' }}>{s.desc}</p>
            </div>
          </div>
          {s.content}
        </div>
      ))}
    </div>
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function SchedulerStatus() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['a-scheduler-status'],
    queryFn: () => api.admin.getSchedulerStatus(),
    refetchInterval: 10_000, placeholderData: keepPreviousData,
  });
  if (isLoading && !status) return <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  const jobLabels = {
    'auto_scan':               { label: 'Otomatik Tarama',       icon: 'radar',          color: T.primary  },
    'ml_calibration':          { label: 'ML Kalibrasyon',         icon: 'model_training', color: T.success  },
    'ml_calibration_pipeline': { label: 'Kalibrasyon Boru Hattı', icon: 'account_tree',   color: T.purple   },
    'system_maintenance':      { label: 'Sistem Bakımı',          icon: 'build',          color: '#f59e0b'  },
    'db_maintenance':          { label: 'Veritabanı Bakımı',      icon: 'database',       color: '#f59e0b'  },
    'anomaly_check':           { label: 'Anomali Kontrol',        icon: 'warning',        color: T.danger   },
  };

  const jobs = status?.jobs || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {jobs.map(j => {
        const info = jobLabels[j.id] || { label: j.id, icon: 'task', color: T.dim };
        const nextRun = j.next_run ? new Date(/[Z+]/.test(j.next_run) ? j.next_run : j.next_run + 'Z') : null;
        return (
          <div key={j.id} style={{ borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', background: T.bg2, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: info.color, flexShrink: 0 }}>{info.icon}</span>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', flex: 1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.label}</p>
            <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
              {nextRun ? nextRun.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
          </div>
        );
      })}
      {jobs.length === 0 && <p style={{ fontSize: 9, color: T.dim, fontStyle: 'italic', margin: 0 }}>Görev bulunamadı.</p>}
    </div>
  );
}

// ── Canlı log / görev geçmişi ─────────────────────────────────────────────────
function SystemFlow({ history }) {
  const [logMode, setLogMode] = useState('history');
  const [technicalLogs, setTechnicalLogs] = useState([]);
  const terminalRef = React.useRef(null);

  React.useEffect(() => {
    if (logMode !== 'live') return;
    const fetchLogs = async () => {
      try { const res = await api.admin.getLogs(150); setTechnicalLogs(res.items || []); } catch {}
    };
    fetchLogs();
    const inv = setInterval(fetchLogs, 3000);
    return () => clearInterval(inv);
  }, [logMode]);

  React.useEffect(() => {
    if (logMode === 'live' && terminalRef.current)
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [technicalLogs, logMode]);

  const copyLogs = () => {
    const text = technicalLogs.map(l => `[${new Date(l.ts * 1000).toLocaleTimeString()}] ${l.level} ${l.msg}`).join('\n');
    navigator.clipboard.writeText(text).then(() => notify('Loglar kopyalandı.', 'success'));
  };

  const levelColor = { CRITICAL: T.danger, ERROR: T.danger, WARNING: '#f59e0b' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: T.primary }}>timeline</span>
          <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)' }}>Sistem Akışı</span>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 6 }}>
          {[['history', 'Geçmiş'], ['live', 'Canlı']].map(([mode, label]) => (
            <button key={mode} onClick={() => setLogMode(mode)}
              style={{ padding: '3px 8px', borderRadius: 4, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', border: 'none', transition: 'all 0.14s', fontFamily: 'inherit', background: logMode === mode ? (mode === 'live' ? T.success : T.primary) : 'transparent', color: logMode === mode ? '#000' : 'rgba(255,255,255,0.3)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg3, height: 280, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
          <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)' }}>
            {logMode === 'live' ? 'kernel.stream.live' : 'system.task.history'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {logMode === 'live' && (
              <button onClick={copyLogs} style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>content_copy</span>
              </button>
            )}
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: logMode === 'live' ? T.success : T.primary, boxShadow: `0 0 5px ${logMode === 'live' ? T.success : T.primary}80` }} />
          </div>
        </div>
        <div ref={terminalRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: logMode === 'history' ? 6 : 2 }} className="custom-scrollbar">
          {logMode === 'history' ? (
            (history?.items || []).map(h => (
              <div key={h.id} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12, color: h.task_name === 'auto_scan' ? T.primary : T.purple, flexShrink: 0 }}>
                  {h.task_name === 'auto_scan' ? 'radar' : h.task_name?.includes('calib') ? 'model_training' : 'task_alt'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: h.task_name === 'auto_scan' ? T.primary : T.purple, margin: 0 }}>{h.task_name}</p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.message || '—'}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: h.status === 'success' ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', color: h.status === 'success' ? T.success : T.danger }}>
                    {h.status === 'success' ? 'OK' : 'ERR'}
                  </span>
                  {h.duration != null && <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)' }}>{h.duration?.toFixed(1)}s</span>}
                </div>
              </div>
            ))
          ) : (
            technicalLogs.length === 0
              ? <p style={{ fontSize: 9, color: T.dim, fontStyle: 'italic' }}>Bekleniyor...</p>
              : technicalLogs.slice().reverse().map((l, i) => (
                  <div key={i} style={{ fontSize: 8, lineHeight: 1.6, borderLeft: `2px solid ${levelColor[l.level] || 'rgba(255,255,255,0.06)'}`, paddingLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                    <span style={{ color: T.primary, marginRight: 6 }}>[{new Date(l.ts * 1000).toLocaleTimeString('tr-TR')}]</span>
                    <span style={{ fontWeight: 900, marginRight: 6, color: levelColor[l.level] || `${T.success}90`, fontSize: 7 }}>{l.level}</span>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>{l.msg.replace(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2},\d{3}\s\w+\s/, '')}</span>
                  </div>
                ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Başarı matrisi ────────────────────────────────────────────────────────────
function CalibrationReport({ report }) {
  if (!report?.total) return (
    <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, border: '1px dashed rgba(255,255,255,0.06)', borderRadius: R }}>
      <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(255,255,255,0.05)' }}>dataset_blur</span>
      <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: T.dim, margin: 0 }}>Değerlendirilmiş Tahmin Yok</p>
      <p style={{ fontSize: 8, color: T.faint, maxWidth: 340, textAlign: 'center', margin: 0, lineHeight: 1.7 }}>İlk tahminlerin vadesi dolduğunda burada görünecek.</p>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, borderRadius: R, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { label: 'Değerlendirilen', value: report.total?.toLocaleString('tr-TR'), color: 'rgba(255,255,255,0.85)' },
          { label: 'İsabet Oranı',    value: `%${report.overall_hit_rate}`,          color: T.success },
          { label: 'Ortalama Getiri', value: `%${report.avg_return}`,                color: report.avg_return >= 0 ? T.primary : T.danger },
        ].map((m, i) => (
          <div key={i} style={{ padding: '10px 12px', background: T.bg2, borderRight: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', margin: '0 0 4px' }}>{m.label}</p>
            <p style={{ fontSize: 22, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: m.color, margin: 0, letterSpacing: '-0.02em' }}>{m.value}</p>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }} className="custom-scrollbar">
        {(report.bands || []).map(b => (
          <div key={b.band} style={{ padding: '6px 10px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.04)', background: T.bg2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.65)' }}>QRS {b.band}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>{b.count} sinyal</span>
                <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: b.avg_return >= 0 ? T.primary : T.danger }}>{b.avg_return >= 0 ? '+' : ''}{b.avg_return}%</span>
                <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 900, color: 'rgba(255,255,255,0.7)', minWidth: 40, textAlign: 'right' }}>%{b.hit_rate}</span>
              </div>
            </div>
            <div style={{ width: '100%', height: 2, borderRadius: 1, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${b.hit_rate}%` }}
                style={{ height: '100%', background: b.hit_rate >= 60 ? T.success : b.hit_rate >= 40 ? T.primary : `${T.danger}80` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ML Profil Matrisi ─────────────────────────────────────────────────────────
function ProfileModelStatus({ qc }) {
  const [triggering, setTriggering] = useState(false);
  const { data: status, isLoading } = useQuery({
    queryKey: ['a-model-status'],
    queryFn: () => aFetch('/api/admin/calibration/model-status'),
    refetchInterval: 30_000, placeholderData: keepPreviousData,
  });
  if (isLoading && !status) return <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await aFetch('/api/admin/trigger/calibrate-profiles', { method: 'POST' });
      notify('Profil kalibrasyonu başladı.', 'success');
      qc.invalidateQueries({ queryKey: ['a-model-status'] });
    } catch (err) {
      notify(`Hata: ${err.message}`, 'error');
    }
    setTriggering(false);
  };

  const profileEntries = Object.entries(status?.profiles || {});
  const profileMlModels = Object.entries(status?.profile_ml_models || {});
  const barData = profileEntries
    .filter(([, info]) => info.exists && info.metrics)
    .map(([name, info]) => ({ name, n: info.metrics.n ?? 0 }))
    .sort((a, b) => b.n - a.n);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: T.purple }}>model_training</span>
          <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.35)' }}>ML Profil Matrisi</span>
        </div>
        <button onClick={handleTrigger} disabled={triggering}
          style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: T.purple, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: triggering ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>refresh</span>
          {triggering ? 'KALİBRE EDİLİYOR...' : 'KALİBRE ET'}
        </button>
      </div>

      {/* ── Per-profil HistGBT Model Durumu ─────────────────────────────── */}
      {profileMlModels.length > 0 && (
        <div style={{ borderRadius: R, border: '1px solid rgba(99,102,241,0.18)', background: 'rgba(99,102,241,0.04)', padding: '10px 12px' }}>
          <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(99,102,241,0.55)', margin: '0 0 8px' }}>
            Per-Profil Zeka Modeli (HistGBT)
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 5 }}>
            {profileMlModels.map(([pk, info]) => {
              const alive = info.exists;
              const ll = info.val_log_loss;
              const llColor = ll == null ? 'rgba(255,255,255,0.2)' : ll < 0.55 ? '#34d399' : ll < 0.65 ? T.success : ll < 0.72 ? '#f59e0b' : T.danger;
              return (
                <div key={pk} style={{ padding: '7px 9px', borderRadius: 5, border: `1px solid ${alive ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)'}`, background: T.bg2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)' }}>{(info.display || pk).split(' ')[0]}</span>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: alive ? '#6366f1' : 'rgba(255,255,255,0.08)', boxShadow: alive ? '0 0 5px #6366f180' : 'none' }} />
                  </div>
                  {alive ? (
                    <div style={{ display: 'flex', gap: 7 }}>
                      <div>
                        <p style={{ fontSize: 6, color: 'rgba(255,255,255,0.15)', margin: '0 0 1px', textTransform: 'uppercase' }}>Log-Loss</p>
                        <p style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: llColor, margin: 0 }}>{ll != null ? ll.toFixed(3) : '—'}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 6, color: 'rgba(255,255,255,0.15)', margin: '0 0 1px', textTransform: 'uppercase' }}>N</p>
                        <p style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)', margin: 0 }}>{info.n_samples ?? '—'}</p>
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 7, color: T.dim, fontStyle: 'italic', margin: 0 }}>Henüz yok</p>
                  )}
                  {alive && info.age_hours != null && (
                    <p style={{ fontSize: 6, color: 'rgba(255,255,255,0.12)', margin: 0 }}>{ageLabel(info.age_hours)} önce</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {barData.length > 0 && (
        <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.05)', background: T.bg2, padding: '10px 12px' }}>
          <p style={{ fontSize: 7, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.2)', margin: '0 0 6px' }}>İzotonik Kalibrasyon — Profil Başına Eğitim</p>
          <ResponsiveContainer width="100%" height={Math.max(70, barData.length * 22)}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <XAxis type="number" tick={{ fontSize: 6, fill: 'rgba(255,255,255,0.2)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 7, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} width={80} />
              <RTooltip cursor={{ fill: 'rgba(168,85,247,0.06)' }} content={(p) => <ChartTooltip {...p} valueFormatter={(v) => `${v} örnek`} />} />
              <Bar dataKey="n" radius={[0, 3, 3, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={T.purple} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 5, maxHeight: 180, overflowY: 'auto' }} className="custom-scrollbar">
        {profileEntries.map(([name, info]) => (
          <div key={name} style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)' }}>{name.split(' ')[0]}</span>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: info.exists ? T.success : 'rgba(255,255,255,0.08)', boxShadow: info.exists ? `0 0 5px ${T.success}80` : 'none' }} />
            </div>
            {info.exists && info.metrics ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <div>
                  <p style={{ fontSize: 6, color: 'rgba(255,255,255,0.15)', margin: '0 0 1px', textTransform: 'uppercase' }}>RMSE</p>
                  <p style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.primary, margin: 0 }}>{info.metrics.rmse?.toFixed(2) ?? '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: 6, color: 'rgba(255,255,255,0.15)', margin: '0 0 1px', textTransform: 'uppercase' }}>N</p>
                  <p style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.35)', margin: 0 }}>{info.metrics.n ?? '—'}</p>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 7, color: T.dim, fontStyle: 'italic', margin: 0 }}>Yetersiz</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Veto frekans ──────────────────────────────────────────────────────────────
function VetoFrequency({ data }) {
  const veto = data?.veto_frequency_30d || {};
  const entries = Object.entries(veto).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const vetoLabels = {
    training_sample: { label: 'Eğitim Örneği', color: '#f59e0b' },
    ml_veto:         { label: 'ML Veto',        color: T.danger  },
    qrs_too_low:     { label: 'Düşük QRS',       color: T.danger  },
    low_volume:      { label: 'Düşük Hacim',     color: T.warning },
    system_safe_mode:{ label: 'Güvenli Mod',     color: T.warning },
    pattern_stale:   { label: 'Bayat Formasyon', color: T.dim     },
  };
  return (
    <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#f59e0b' }}>block</span>
        <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.3)' }}>Sinyal Engelleme — Son 30 Gün</span>
        <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: T.dim, marginLeft: 'auto' }}>{total.toLocaleString()} toplam</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {entries.map(([key, count]) => {
          const info = vetoLabels[key] || { label: key, color: T.dim };
          const pct  = total > 0 ? Math.round(count / total * 100) : 0;
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{info.label}</span>
                <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: info.color, fontWeight: 900 }}>{count.toLocaleString()}</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: info.color, borderRadius: 2, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ANA BİLEŞEN ───────────────────────────────────────────────────────────────
export function PipelineTab() {
  const qc = useQueryClient();

  const { data: status, isLoading: sL, error: sE } = useQuery({
    queryKey: ['a-pipeline-status'],
    queryFn: () => api.admin.getPipelineStatus(),
    refetchInterval: 15_000, staleTime: 5000, placeholderData: keepPreviousData,
  });
  const { data: history } = useQuery({
    queryKey: ['a-task-history'],
    queryFn: () => api.admin.getTaskHistory(),
    refetchInterval: 10_000, staleTime: 5000, placeholderData: keepPreviousData,
  });
  const { data: prog } = useQuery({
    queryKey: ['a-progress'],
    queryFn: () => api.admin.getProgress(),
    refetchInterval: 3_000, placeholderData: keepPreviousData,
  });
  const { data: report } = useQuery({
    queryKey: ['a-cal-report'],
    queryFn: () => aFetch('/api/admin/calibration/report'),
    staleTime: 60_000, placeholderData: keepPreviousData,
  });
  const { data: mlHealth } = useQuery({
    queryKey: ['a-ml-health'],
    queryFn: () => api.admin.getMlHealth(),
    refetchInterval: 60_000, placeholderData: keepPreviousData,
  });

  const [forcing,    setForcing]    = useState(false);
  const [scanning,   setScanning]   = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [runResult,  setRunResult]  = useState(null);

  const isScanActive = prog?.state === 'SCANNING' || prog?.state === 'QUEUED';

  const handleTriggerScan = async () => {
    if (isScanActive) return;
    setScanning(true);
    try {
      notify('Tarama kuyruğa alındı.', 'info');
      await api.admin.triggerScan();
      notify('Tarama başlatıldı.', 'success');
    } catch (e) { notify(`Tarama başlatılamadı: ${e.message}`, 'error'); }
    finally { setScanning(false); }
  };

  const handleForceEval = async () => {
    if (isScanActive) { notify('Aktif tarama devam ediyor.', 'warning'); return; }
    setForcing(true); setRunResult(null);
    try {
      notify('Değerlendirme başlatılıyor...', 'info');
      const res = await api.admin.triggerCalibrate();
      setRunResult({ type: 'calibrate', ...res });
      notify('Kalibrasyon pipeline\'ı başlatıldı.', 'success');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['a-pipeline-status'] });
        qc.invalidateQueries({ queryKey: ['a-task-history'] });
        qc.invalidateQueries({ queryKey: ['a-cal-report'] });
        qc.invalidateQueries({ queryKey: ['a-ml-health'] });
      }, 2000);
    } catch (e) {
      notify(`Hata: ${e.message}`, 'error');
      setRunResult({ type: 'calibrate', error: e.message });
    } finally { setForcing(false); }
  };

  const handleRetrain = async () => {
    if (isScanActive) { notify('Aktif tarama devam ediyor.', 'warning'); return; }
    setRetraining(true); setRunResult(null);
    try {
      notify('Model eğitimi başlatılıyor...', 'info');
      const res = await api.admin.triggerRetrain();
      setRunResult({ type: 'retrain', ...res });
      notify('Yeniden eğitim kuyruğa alındı.', 'success');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['a-ml-health'] });
        qc.invalidateQueries({ queryKey: ['a-pipeline-status'] });
      }, 5000);
    } catch (e) {
      notify(`Hata: ${e.message}`, 'error');
      setRunResult({ type: 'retrain', error: e.message });
    } finally { setRetraining(false); }
  };

  if (sL && !status && !sE) return (
    <div style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.06)', borderTopColor: T.primary, animation: 'spin 1s linear infinite' }} />
      <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(255,255,255,0.3)', margin: 0 }}>Yükleniyor</p>
    </div>
  );

  if (sE && !status) return (
    <div style={{ padding: '60px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'rgba(248,113,113,0.03)', borderRadius: R, border: '1px solid rgba(248,113,113,0.1)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 36, color: T.danger }}>warning</span>
      <p style={{ fontSize: 10, fontWeight: 900, color: T.danger, margin: 0 }}>{sE.message}</p>
      <button onClick={() => qc.invalidateQueries({ queryKey: ['a-pipeline-status'] })} style={{ padding: '6px 14px', borderRadius: 5, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: T.danger, fontSize: 9, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>Yeniden Bağlan</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.9)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: T.primary }}>hub</span>
            ML Orkestrasyon Boru Hattı
          </h2>
          <p style={{ fontSize: 8, color: T.dim, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', margin: 0 }}>Tarama → Değerlendirme → Kalibrasyon</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: isScanActive ? T.primary : T.success, boxShadow: `0 0 6px ${isScanActive ? T.primary : T.success}80` }} />
          <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}>{isScanActive ? 'AKTIF TARAMADA' : 'HAZIR'}</span>
        </div>
      </div>

      {/* Model Pulse */}
      <ModelPulse mlHealth={mlHealth} pipelineStatus={status} />

      {/* Run result banner */}
      <AnimatePresence>
        {runResult && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ padding: '10px 14px', borderRadius: R, border: `1px solid ${runResult.error ? 'rgba(248,113,113,0.2)' : 'rgba(52,211,153,0.2)'}`, background: runResult.error ? 'rgba(248,113,113,0.04)' : 'rgba(52,211,153,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: runResult.error ? T.danger : T.success }}>{runResult.error ? 'error' : 'check_circle'}</span>
              <div>
                <p style={{ fontSize: 9, fontWeight: 900, color: runResult.error ? T.danger : T.success, margin: '0 0 1px' }}>
                  {runResult.type === 'retrain' ? 'Yeniden Eğitim' : 'Kalibrasyon'} {runResult.error ? '— Hata' : '— Başlatıldı'}
                </p>
                <p style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)', margin: 0 }}>{runResult.error || runResult.message || 'Arka planda devam ediyor...'}</p>
              </div>
            </div>
            <button onClick={() => setRunResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pipeline adımları */}
      <PipelineFlow
        status={status} prog={prog} isScanActive={isScanActive}
        forcing={forcing} retraining={retraining}
        onScan={handleTriggerScan} onEval={handleForceEval} onRetrain={handleRetrain}
      />

      {/* Orta grid: Scheduler + Sistem Akışı */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: T.primary }}>schedule</span>
            <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.3)' }}>Zamanlanmış</span>
          </div>
          <SchedulerStatus />
        </div>
        <SystemFlow history={history} />
      </div>

      {/* QRS trendi */}
      <QrsTrendChart />

      {/* Başarı matrisi + Profil matrisi */}
      <div style={{ display: 'grid', gridTemplateColumns: report?.total > 0 ? 'minmax(0,1fr) 280px' : '1fr', gap: 10, alignItems: 'start' }}>
        {report?.total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: T.success }}>analytics</span>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.3)' }}>Başarı Matrisi</span>
            </div>
            <CalibrationReport report={report} />
          </div>
        )}
        <ProfileModelStatus qc={qc} />
      </div>

      {/* Veto frekansı */}
      <VetoFrequency data={mlHealth} />

    </div>
  );
}
