// Shared utilities, atoms, and helpers used across all admin tab components
// Theme: PivotRadar terminal dark — #07090e bg, #99f7ff cyan, sharp corners (4-6px)

import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { LineChart, Line, BarChart, Bar, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import useAuthStore from '@/store/useAuthStore';

// ── Design tokens ─────────────────────────────────────────────────────────────
export const T = {
  bg1:     '#07090e',
  bg2:     '#0b0e16',
  bg3:     '#0d1118',
  bg4:     '#111520',
  border0: 'rgba(255,255,255,0.035)',
  border1: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.10)',
  primary: '#99f7ff',
  success: '#34d399',
  warning: '#fbbf24',
  danger:  '#f87171',
  purple:  '#a855f7',
  muted:   'rgba(255,255,255,0.45)',
  dim:     'rgba(255,255,255,0.20)',
  faint:   'rgba(255,255,255,0.10)',
};

// ── Auth fetch with AbortSignal support ──────────────────────────────────────
export async function aFetch(path, opts = {}) {
  const { token } = useAuthStore.getState();
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      useAuthStore.getState().logout?.();
      window.location.href = '/login';
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

// ── Dispatch admin notification ───────────────────────────────────────────────
export function notify(msg, type = 'success') {
  window.dispatchEvent(new CustomEvent('admin-notify', { detail: { msg, type } }));
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 16 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `1.5px solid rgba(153,247,255,0.15)`,
      borderTopColor: T.primary,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      margin: '0 auto',
      flexShrink: 0,
    }} />
  );
}

// ── SectionTitle ──────────────────────────────────────────────────────────────
export function SectionTitle({ icon, title, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: 'rgba(153,247,255,0.06)',
        border: '1px solid rgba(153,247,255,0.14)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: T.primary }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', margin: 0 }}>{title}</p>
        <div style={{ width: 24, height: 1.5, background: 'rgba(153,247,255,0.25)', marginTop: 3, borderRadius: 1 }} />
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

// ── KCard — flat terminal metric card ─────────────────────────────────────────
export function KCard({ label, value, sub, color = T.primary, icon, badge, glow }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 6,
      border: '1px solid rgba(255,255,255,0.06)',
      background: T.bg2,
      display: 'flex', flexDirection: 'column', gap: 6,
      transition: 'border-color 0.15s',
      boxShadow: glow ? `0 0 20px ${glow}` : 'none',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(153,247,255,0.18)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)' }}>{label}</span>
        {icon && (
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.12)' }}>{icon}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '-0.02em', color: color ?? 'rgba(255,255,255,0.85)' }}>
          {value ?? '—'}
        </span>
        {badge && (
          <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {badge}
          </span>
        )}
      </div>
      {sub && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ── HitBar ────────────────────────────────────────────────────────────────────
export function HitBar({ rate }) {
  if (rate == null) return <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>—</span>;
  const color = rate >= 60 ? T.success : rate >= 40 ? T.warning : T.danger;
  const glow  = rate >= 60 ? 'rgba(52,211,153,0.4)' : rate >= 40 ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)' }}>
        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, rate)}%`, background: color, boxShadow: `0 0 6px ${glow}`, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.35)' }}>{rate}%</span>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_STYLES = {
  target_hit: { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)',  color: '#34d399', label: 'TUTTU'    },
  near_miss:  { bg: 'rgba(153,247,255,0.08)',border: 'rgba(153,247,255,0.2)', color: '#99f7ff', label: 'YAKLAŞTI' },
  partial:    { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)',  color: '#fbbf24', label: 'KISMEN'   },
  miss:       { bg: 'rgba(248,113,113,0.08)',border: 'rgba(248,113,113,0.2)', color: '#f87171', label: 'KAÇTI'    },
};

export function Badge({ status }) {
  const s = BADGE_STYLES[status] || { bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.25)', label: 'BEKL.' };
  return (
    <span style={{
      fontSize: 8, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 3,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>{s.label}</span>
  );
}

// ── DirBadge ──────────────────────────────────────────────────────────────────
export function DirBadge({ d }) {
  if (d === 'bullish') return (
    <span style={{ fontSize: 9, fontWeight: 900, color: T.success, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}>▲ YÜKSELİŞ</span>
  );
  return (
    <span style={{ fontSize: 9, fontWeight: 900, color: T.danger, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}>▼ DÜŞÜŞ</span>
  );
}

// ── Btn ───────────────────────────────────────────────────────────────────────
const BTN_VARIANTS = {
  default: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
    hoverBg: 'rgba(255,255,255,0.06)', hoverBorder: 'rgba(255,255,255,0.15)', hoverColor: 'rgba(255,255,255,0.8)',
  },
  primary: {
    background: 'rgba(153,247,255,0.1)', border: '1px solid rgba(153,247,255,0.3)', color: '#99f7ff',
    hoverBg: 'rgba(153,247,255,0.16)', hoverBorder: 'rgba(153,247,255,0.45)', hoverColor: '#99f7ff',
  },
  danger: {
    background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.18)', color: '#f87171',
    hoverBg: 'rgba(248,113,113,0.1)', hoverBorder: 'rgba(248,113,113,0.35)', hoverColor: '#f87171',
  },
  success: {
    background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.18)', color: '#34d399',
    hoverBg: 'rgba(52,211,153,0.1)', hoverBorder: 'rgba(52,211,153,0.35)', hoverColor: '#34d399',
  },
  warning: {
    background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.18)', color: '#fbbf24',
    hoverBg: 'rgba(251,191,36,0.1)', hoverBorder: 'rgba(251,191,36,0.35)', hoverColor: '#fbbf24',
  },
};

export function Btn({ children, onClick, variant = 'default', disabled, style = {} }) {
  const [hov, setHov] = React.useState(false);
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.default;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '6px 14px',
        borderRadius: 5,
        fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'all 0.14s',
        background: hov && !disabled ? v.hoverBg : v.background,
        border: hov && !disabled ? `1px solid ${v.hoverBorder}` : v.border,
        color: hov && !disabled ? v.hoverColor : v.color,
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── TabBtn ────────────────────────────────────────────────────────────────────
export function TabBtn({ id, label, icon, active, onClick }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={() => onClick(id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 10px',
        borderRadius: 5,
        border: active ? '1px solid rgba(153,247,255,0.2)' : `1px solid ${hov ? 'rgba(255,255,255,0.08)' : 'transparent'}`,
        background: active ? 'rgba(153,247,255,0.05)' : hov ? 'rgba(255,255,255,0.03)' : 'transparent',
        color: active ? T.primary : hov ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)',
        fontSize: 10, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase',
        cursor: 'pointer', transition: 'all 0.14s',
        flexShrink: 0, whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
    >
      <span className="material-symbols-outlined" style={{
        fontSize: 15,
        color: active ? T.primary : hov ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)',
        filter: active ? 'drop-shadow(0 0 6px rgba(153,247,255,0.7))' : 'none',
        transition: 'all 0.14s',
      }}>{icon}</span>
      <span>{label}</span>
      {active && (
        <div style={{
          position: 'absolute', bottom: 0, left: '20%', right: '20%',
          height: 1.5, borderRadius: 1,
          background: T.primary,
          boxShadow: '0 0 8px rgba(153,247,255,0.8)',
        }} />
      )}
    </button>
  );
}

// ── Relative time ─────────────────────────────────────────────────────────────
export function relTime(ts) {
  if (!ts) return '—';
  const d = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60)   return `${s}s önce`;
  if (s < 3600) return `${Math.floor(s / 60)}dk önce`;
  return `${Math.floor(s / 3600)}sa önce`;
}

export function fmtElapsed(secs) {
  if (!secs) return '0s';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m ? `${m}dk ${s}s` : `${s}s`;
}

// ── Stat tile (small inline metric) ──────────────────────────────────────────
export function StatTile({ label, value, unit = '', color = 'rgba(255,255,255,0.65)', sub }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', margin: '0 0 4px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1, color, margin: 0 }}>
        {value ?? '—'}<span style={{ fontSize: 9, marginLeft: 2, color: 'rgba(255,255,255,0.2)' }}>{unit}</span>
      </p>
      {sub && <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2, margin: '2px 0 0' }}>{sub}</p>}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ value = 0, max = 100, color = T.primary, height = 3 }) {
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

// ── Card wrapper ──────────────────────────────────────────────────────────────
export function Card({ children, style = {}, onClick }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 6,
        border: `1px solid ${hov ? 'rgba(153,247,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
        background: T.bg2,
        padding: '16px 18px',
        transition: 'border-color 0.15s',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function Empty({ icon = 'inbox', label = 'Veri Yok' }) {
  return (
    <div style={{ padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 6 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(255,255,255,0.05)' }}>{icon}</span>
      <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.1)', margin: 0 }}>{label}</p>
    </div>
  );
}

// ── Table wrapper ─────────────────────────────────────────────────────────────
export function TableWrap({ children }) {
  return (
    <div style={{ borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({ children, right }) {
  return (
    <th style={{ padding: '10px 14px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.2)', textAlign: right ? 'right' : 'left', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

export function Td({ children, right, mono, muted }) {
  return (
    <td style={{ padding: '9px 14px', fontSize: mono ? 10 : 11, fontFamily: mono ? "'IBM Plex Mono', monospace" : 'inherit', color: muted ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)', textAlign: right ? 'right' : 'left', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
      {children}
    </td>
  );
}

// ── Notification ──────────────────────────────────────────────────────────────
const NOTIF_STYLES = {
  success: { bg: 'rgba(52,211,153,0.06)',   border: 'rgba(52,211,153,0.22)',   color: '#34d399', icon: 'check_circle', label: 'İşlem Başarılı'  },
  error:   { bg: 'rgba(248,113,113,0.06)',  border: 'rgba(248,113,113,0.22)',  color: '#f87171', icon: 'error',        label: 'Sistem Hatası'   },
  warning: { bg: 'rgba(251,191,36,0.06)',   border: 'rgba(251,191,36,0.22)',   color: '#fbbf24', icon: 'warning',      label: 'Uyarı'           },
  info:    { bg: 'rgba(153,247,255,0.06)',  border: 'rgba(153,247,255,0.22)',  color: '#99f7ff', icon: 'info',         label: 'Bilgi'           },
};

export function Notification({ msg, type = 'success', onClose }) {
  const s = NOTIF_STYLES[type] || NOTIF_STYLES.success;
  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 16, x: 8 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        position: 'fixed', bottom: 80, right: 24, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        borderRadius: 6,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        minWidth: 260, maxWidth: 400,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16, flexShrink: 0 }}>{s.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.55, margin: 0 }}>{s.label}</p>
        <p style={{ fontSize: 11, fontWeight: 700, margin: '2px 0 0', color: 'rgba(255,255,255,0.8)', wordBreak: 'break-word' }}>{msg}</p>
      </div>
      <button
        onClick={onClose}
        style={{ padding: 4, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', flexShrink: 0, lineHeight: 1 }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
      </button>
    </motion.div>,
    document.body
  );
}

// ── AnimatedNumber — counts from 0 to target on mount (framer-motion spring) ───
export function AnimatedNumber({ value = 0, decimals = 0, prefix = '', suffix = '', duration = 1.2 }) {
  const target = Number.isFinite(+value) ? +value : 0;
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(spring, (v) =>
    `${prefix}${v.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
  );
  React.useEffect(() => { mv.set(target); }, [target, mv]);
  return <motion.span>{display}</motion.span>;
}

// ── Sparkline — tiny recharts line, no axes ────────────────────────────────────
export function Sparkline({ data = [], dataKey = 'v', color = T.primary, height = 32 }) {
  const series = (data || []).map((d, i) =>
    typeof d === 'number' ? { [dataKey]: d, i } : { ...d, i }
  );
  if (series.length < 2) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 8, color: T.faint, fontFamily: "'IBM Plex Mono', monospace" }}>—</span>
    </div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.6} dot={false} isAnimationActive />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── TrendBadge — "+5.2% ↑" / "-2.1% ↓" with color ──────────────────────────────
export function TrendBadge({ value, suffix = '%', invert = false, decimals = 1 }) {
  if (value == null || !Number.isFinite(+value)) {
    return <span style={{ fontSize: 9, fontWeight: 900, color: T.dim, fontFamily: "'IBM Plex Mono', monospace" }}>—</span>;
  }
  const v = +value;
  const positive = invert ? v < 0 : v > 0;
  const neutral = v === 0;
  const color = neutral ? T.muted : positive ? T.success : T.danger;
  const arrow = neutral ? '→' : v > 0 ? '↑' : '↓';
  const sign  = v > 0 ? '+' : '';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace",
      letterSpacing: '0.04em',
      padding: '2px 6px', borderRadius: 3,
      background: `${color}12`, border: `1px solid ${color}30`, color,
    }}>
      {sign}{v.toFixed(decimals)}{suffix} {arrow}
    </span>
  );
}

// ── ChartTooltip — dark themed recharts tooltip ────────────────────────────────
export function ChartTooltip({ active, payload, label, labelSuffix = '', valueFormatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'rgba(7,9,14,0.96)', border: '1px solid rgba(153,247,255,0.18)',
      borderRadius: 5, padding: '8px 10px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)', minWidth: 90,
    }}>
      {label != null && (
        <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.muted, margin: '0 0 4px', fontFamily: "'IBM Plex Mono', monospace" }}>
          {label}{labelSuffix}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: p.color || p.stroke || p.fill || T.primary, flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.85)' }}>
            {valueFormatter ? valueFormatter(p.value, p) : p.value}
          </span>
          {p.name && p.name !== p.dataKey && (
            <span style={{ fontSize: 8, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{p.name}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── MiniBarChart — small recharts bar chart with tooltip ───────────────────────
export function MiniBarChart({ data = [], xKey = 'x', yKey = 'y', color = T.primary, height = 80, tooltipLabelSuffix = '', tooltipValueFormatter }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <RTooltip
          cursor={{ fill: 'rgba(153,247,255,0.05)' }}
          content={(p) => <ChartTooltip {...p} labelSuffix={tooltipLabelSuffix} valueFormatter={tooltipValueFormatter} />}
        />
        <Bar dataKey={yKey} fill={color} radius={[2, 2, 0, 0]} isAnimationActive />
      </BarChart>
    </ResponsiveContainer>
  );
}
