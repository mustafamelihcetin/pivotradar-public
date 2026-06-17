import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { aFetch } from './shared';

// ── Sabitler ─────────────────────────────────────────────────────────────────
const GROUP_ORDER    = ['ML', 'Altyapı', 'Veri', 'Uygulama', 'Ağ'];
const REFRESH_SECS   = 60; // otomatik yenileme aralığı

// ── Durum renk/ikon haritası ──────────────────────────────────────────────────
const statusMeta = {
  ok:      { color: '#22c55e', bg: 'rgba(34,197,94,.10)',  icon: '✓',  label: 'SAĞLIKLI'  },
  pass:    { color: '#22c55e', bg: 'rgba(34,197,94,.10)',  icon: '✓',  label: 'SAĞLIKLI'  },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,.10)', icon: '⚠',  label: 'DİKKAT'    },
  fail:    { color: '#ef4444', bg: 'rgba(239,68,68,.10)',  icon: '✕',  label: 'KRİTİK'    },
  error:   { color: '#ef4444', bg: 'rgba(239,68,68,.10)',  icon: '✕',  label: 'KRİTİK'    },
};
const sm = (s) => statusMeta[s] ?? { color: '#6b7280', bg: 'rgba(107,114,128,.10)', icon: '?', label: s?.toUpperCase() ?? '?' };

// ── Geri sayım kancası ────────────────────────────────────────────────────────
function useCountdown(updatedAt) {
  const [secs, setSecs] = useState(REFRESH_SECS);
  useEffect(() => {
    setSecs(REFRESH_SECS);
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [updatedAt]);
  return secs;
}

// ── Durum değişikliği takibi (localStorage) ───────────────────────────────────
function useStatusHistory(checks) {
  const [changes, setChanges] = useState({});

  useEffect(() => {
    if (!checks?.length) return;
    const storageKey = 'diag_last_status';
    let prev = {};
    try { prev = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}

    const now = Date.now();
    const newPrev = {};
    const newChanges = {};

    for (const c of checks) {
      newPrev[c.name] = c.status;
      if (prev[c.name] && prev[c.name] !== c.status) {
        newChanges[c.name] = { from: prev[c.name], to: c.status, at: now };
      }
    }

    try { localStorage.setItem(storageKey, JSON.stringify(newPrev)); } catch {}
    if (Object.keys(newChanges).length) setChanges(newChanges);
  }, [checks]);

  return changes;
}

// ── Özet çubuğu ───────────────────────────────────────────────────────────────
function SummaryBar({ summary, isFetching, countdown, onRefresh, updatedAt }) {
  if (!summary) return null;
  const { ok = 0, warning = 0, fail = 0, total = 0 } = summary;
  const okPct   = total ? (ok      / total * 100) : 0;
  const warnPct = total ? (warning / total * 100) : 0;
  const failPct = total ? (fail    / total * 100) : 0;
  const overall = fail > 0 ? 'fail' : warning > 0 ? 'warning' : 'ok';
  const { color, icon } = sm(overall);

  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      background: '#111', border: '1px solid #222',
      borderRadius: 10, padding: '12px 18px', marginBottom: 16,
    }}>
      {/* Genel durum ikonu */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: sm(overall).bg, border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color, flexShrink: 0,
        boxShadow: fail > 0 ? `0 0 12px ${color}60` : 'none',
      }}>{icon}</div>

      {/* Sayaçlar */}
      <div style={{ display: 'flex', gap: 14, flex: 1 }}>
        {[
          { n: ok,      label: 'SAĞLIKLI', c: '#22c55e' },
          { n: warning, label: 'DİKKAT',   c: '#f59e0b' },
          { n: fail,    label: 'KRİTİK',   c: '#ef4444' },
        ].map(({ n, label, c }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 }}>{n}</span>
            <span style={{ fontSize: 9, color: '#555', letterSpacing: 1, marginTop: 2 }}>{label}</span>
          </div>
        ))}
        {/* Çubuk */}
        <div style={{ flex: 1, alignSelf: 'center' }}>
          <div style={{ height: 6, borderRadius: 3, background: '#222', overflow: 'hidden', display: 'flex' }}>
            {okPct   > 0 && <div style={{ width: `${okPct}%`,   background: '#22c55e', transition: 'width .5s' }} />}
            {warnPct > 0 && <div style={{ width: `${warnPct}%`, background: '#f59e0b', transition: 'width .5s' }} />}
            {failPct > 0 && <div style={{ width: `${failPct}%`, background: '#ef4444', transition: 'width .5s' }} />}
          </div>
          <div style={{ fontSize: 9, color: '#444', marginTop: 3 }}>{total} kontrol</div>
        </div>
      </div>

      {/* Yenileme durumu */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {isFetching ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6366f1' }}>
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ display: 'inline-block', fontSize: 13 }}>⟳</motion.span>
            <span style={{ fontSize: 10 }}>Kontrol ediliyor…</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555' }}>
            <span style={{ fontSize: 10 }}>
              {countdown > 0 ? `${countdown}s sonra` : 'şimdi yenileniyor'}
            </span>
            <div style={{ width: 28, height: 4, borderRadius: 2, background: '#222', overflow: 'hidden' }}>
              <motion.div
                key={updatedAt}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: REFRESH_SECS, ease: 'linear' }}
                style={{ height: '100%', background: '#6366f1' }}
              />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {timeLabel && <span style={{ fontSize: 9, color: '#444' }}>Son: {timeLabel}</span>}
          <button onClick={onRefresh} disabled={isFetching} style={{
            padding: '3px 10px', borderRadius: 4, border: '1px solid #333',
            background: '#1a1a1a', color: '#aaa', cursor: 'pointer', fontSize: 10,
            opacity: isFetching ? 0.5 : 1,
          }}>Yenile</button>
        </div>
      </div>
    </div>
  );
}

// ── Tekil kontrol kartı ───────────────────────────────────────────────────────
function CheckCard({ check, changed }) {
  const [open, setOpen] = useState(false);
  const { color, bg, icon, label } = sm(check.status);
  const hasDetails = check.details && Object.keys(check.details).length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: open ? bg : '#0f0f0f',
        border: `1px solid ${open ? color + '50' : '#1f1f1f'}`,
        borderRadius: 7, marginBottom: 4, overflow: 'hidden',
        transition: 'background .2s, border-color .2s',
      }}
    >
      {/* Başlık satırı */}
      <button
        onClick={() => hasDetails && setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 12px', background: 'transparent', border: 'none',
          cursor: hasDetails ? 'pointer' : 'default', color: '#fff', textAlign: 'left',
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: '50%', background: bg, border: `1.5px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color, flexShrink: 0,
        }}>{icon}</span>

        <span style={{ fontSize: 12, fontWeight: 600, color: '#ddd', flex: 1, minWidth: 0 }}>
          {check.name}
        </span>

        {changed && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1,
              background: '#6366f1', color: '#fff',
              padding: '2px 5px', borderRadius: 3, flexShrink: 0,
            }}
          >
            DEĞIŞTI {sm(changed.from).icon}→{sm(changed.to).icon}
          </motion.span>
        )}

        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: .8, color, flexShrink: 0 }}>
          {label}
        </span>

        {check.ms != null && (
          <span style={{ fontSize: 9, color: '#444', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
            {check.ms}ms
          </span>
        )}

        {hasDetails && (
          <span style={{ color: '#444', fontSize: 10, flexShrink: 0 }}>
            {open ? '▲' : '▼'}
          </span>
        )}
      </button>

      {/* Mesaj */}
      <div style={{ padding: '0 12px 8px 44px', fontSize: 11, color: '#777' }}>
        {check.message}
      </div>

      {/* Detaylar */}
      <AnimatePresence initial={false}>
        {open && hasDetails && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              margin: '0 12px 10px 12px', padding: 10,
              background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 6,
            }}>
              {Object.entries(check.details).map(([k, v]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '2px 0', borderBottom: '1px solid #1a1a1a', fontSize: 10, gap: 8,
                }}>
                  <span style={{ color: '#555', fontFamily: 'monospace' }}>{k}</span>
                  <span style={{ color: '#bbb', fontFamily: 'monospace', textAlign: 'right' }}>
                    {typeof v === 'boolean' ? (v ? 'evet' : 'hayır') : String(v ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Grup bölümü ───────────────────────────────────────────────────────────────
function GroupSection({ name, checks, changes }) {
  const worst = checks.some(c => ['fail','error'].includes(c.status)) ? 'fail'
    : checks.some(c => c.status === 'warning') ? 'warning' : 'ok';
  const { color } = sm(worst);
  const sorted = [...checks].sort((a, b) => {
    const p = { fail: 0, error: 0, warning: 1, ok: 2, pass: 2 };
    return (p[a.status] ?? 3) - (p[b.status] ?? 3);
  });

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        paddingBottom: 5, borderBottom: `1px solid ${color}30`,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color, textTransform: 'uppercase' }}>
          {name}
        </span>
        <span style={{ fontSize: 9, color: '#444' }}>{checks.length} kontrol</span>
      </div>
      {sorted.map(c => (
        <CheckCard key={c.name} check={c} changed={changes[c.name]} />
      ))}
    </div>
  );
}

// ── Ham rapor ─────────────────────────────────────────────────────────────────
function RawReport({ data }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid #1f1f1f', paddingTop: 12 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'none', border: 'none', color: '#444', cursor: 'pointer',
        fontSize: 10, padding: 0, letterSpacing: .5,
      }}>
        {open ? '▲ Ham raporu gizle' : '▼ Ham raporu göster (JSON)'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginTop: 8 }}
          >
            <div style={{ position: 'relative' }}>
              <button onClick={copy} style={{
                position: 'absolute', top: 8, right: 8, zIndex: 1,
                background: '#1a1a1a', border: '1px solid #333', color: copied ? '#22c55e' : '#666',
                padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10,
              }}>{copied ? 'Kopyalandı ✓' : 'Kopyala'}</button>
              <pre style={{
                background: '#080808', border: '1px solid #1a1a1a', borderRadius: 6,
                padding: 14, fontSize: 10, color: '#555', overflowX: 'auto',
                maxHeight: 300, margin: 0, fontFamily: 'monospace',
              }}>{text}</pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export function DiagnosticsTab() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt, error } = useQuery({
    queryKey:             ['a-diagnostics'],
    queryFn:              ({ signal }) => aFetch('/api/admin/diagnostics', { signal }),
    staleTime:            60_000,
    gcTime:               300_000,
    refetchInterval:      60_000,
    refetchOnWindowFocus: false,
  });

  const countdown = useCountdown(dataUpdatedAt);
  const checks    = data?.checks ?? [];
  const changes   = useStatusHistory(checks);

  const grouped = {};
  for (const g of GROUP_ORDER) grouped[g] = [];
  for (const c of checks) {
    const g = c.group || 'Diğer';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(c);
  }
  const extraGroups = Object.keys(grouped).filter(g => !GROUP_ORDER.includes(g) && grouped[g].length > 0);

  if (error && !data) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#ef4444' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
      <div style={{ fontSize: 13 }}>Tanılama endpoint'ine ulaşılamadı.</div>
      <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{error?.message}</div>
      <button onClick={refetch} style={{
        marginTop: 12, padding: '6px 16px', borderRadius: 6,
        border: '1px solid #333', background: '#1a1a1a', color: '#aaa', cursor: 'pointer',
      }}>Tekrar Dene</button>
    </div>
  );

  return (
    <div style={{ padding: '0 2px' }}>

      <SummaryBar
        summary={data?.summary}
        isFetching={isFetching}
        countdown={countdown}
        onRefresh={refetch}
        updatedAt={dataUpdatedAt}
      />

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div key={i}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }}
              style={{ height: 44, borderRadius: 7, background: '#111' }}
            />
          ))}
        </div>
      )}

      {!isLoading && (
        <AnimatePresence>
          {[...GROUP_ORDER, ...extraGroups].map(g => {
            const gChecks = grouped[g];
            if (!gChecks?.length) return null;
            return (
              <motion.div key={g}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <GroupSection name={g} checks={gChecks} changes={changes} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}

      {data && <RawReport data={data} />}

      <div style={{
        marginTop: 16, fontSize: 9, color: '#333', textAlign: 'center', letterSpacing: .5,
      }}>
        Otomatik yenileme: her {REFRESH_SECS} saniye
        {data?.total_ms != null ? ` · Son çalışma: ${data.total_ms}ms` : ''}
        {' · 14 kontrol paralel'}
      </div>
    </div>
  );
}
