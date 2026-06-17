import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/utils/cn';
import { api } from '@/core/api/client';
import { useScanStore } from '@/core/store/useScanStore';
import useAuthStore from '@/store/useAuthStore';
import { GuestLockOverlay } from '@/shared/components/GuestLockOverlay';
import { PageBanner } from '@/shared/components/PageBanner';

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function fmtRelative(ts) {
  if (!ts) return null;
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Az önce';
  if (m < 60) return `${m} dakika önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return fmtTime(ts);
}

let _actId = 0;
function mkActivity(type, title, detail = null) {
  return { id: _actId++, ts: Date.now(), type, title, detail };
}

const ACT_STYLES = {
  done:    { icon: 'check_circle',    color: 'text-emerald-400', bg: 'bg-emerald-400/[0.07] border-emerald-500/15' },
  scan:    { icon: 'radar',           color: 'text-primary',     bg: 'bg-primary/[0.07] border-primary/15' },
  warn:    { icon: 'warning',         color: 'text-amber-400',   bg: 'bg-amber-400/[0.07] border-amber-500/15' },
  error:   { icon: 'error',           color: 'text-red-400',     bg: 'bg-red-400/[0.07] border-red-500/15' },
  info:    { icon: 'info',            color: 'text-sky-400',     bg: 'bg-sky-400/[0.07] border-sky-500/15' },
  system:  { icon: 'settings',        color: 'text-white/25',    bg: 'bg-white/[0.02] border-white/[0.05]' },
};

// ── Sorun Bildir Modal ─────────────────────────────────────────────────────────
const REPORT_SUBJECTS = [
  'Sayfa açılmıyor / yüklenmiyor',
  'Tarama sonuçları görünmüyor',
  'Hatalı veya eksik veri',
  'Performans / yavaşlık sorunu',
  'Grafik / teknik analiz hatası',
  'Hesap / oturum sorunu',
  'Diğer',
];

function SubjectDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-[11px] transition-colors text-left',
          open
            ? 'bg-white/[0.05] border-primary/40 text-white'
            : 'bg-white/[0.03] border-white/[0.08] text-white/50 hover:border-white/[0.14]'
        )}>
        <span className={value ? 'text-white' : 'text-white/30'}>{value || 'Konu seçin...'}</span>
        <span className={cn('material-symbols-outlined text-[16px] text-white/30 transition-transform shrink-0', open && 'rotate-180')}>
          expand_more
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.1 }}
            className="absolute z-10 top-full mt-1 w-full bg-[#0b0e16] border border-white/[0.10] overflow-hidden shadow-2xl" style={{ borderRadius:4 }}
          >
            {REPORT_SUBJECTS.map(opt => (
              <button key={opt} type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-[11px] transition-colors',
                  value === opt
                    ? 'bg-primary/10 text-primary font-black'
                    : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                )}>
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportModal({ onClose }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errDetail, setErrDetail] = useState('');
  const isAuth = useAuthStore(s => s.isAuthenticated);
  const user    = useAuthStore(s => s.user);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setStatus('loading');
    setErrDetail('');
    try {
      await api.submitSupportMessage({
        name:    user?.full_name || user?.email || 'Uygulama Kullanıcısı',
        email:   user?.email    || 'noreply@pivotradar.net',
        subject: subject.trim(),
        message: message.trim(),
        source:  'app_report',
      });
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrDetail(err?.message ? err.message.slice(0, 80) : '');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md bg-[#07090e] border border-white/[0.09] shadow-2xl flex flex-col" style={{ borderRadius: 6, maxHeight: 'calc(100vh - 2rem)' }}
      >
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-amber-400">flag</span>
            <span className="text-sm font-black text-white">Sorun Bildir</span>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {status === 'success' ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10">
              <span className="material-symbols-outlined text-[40px] text-emerald-400">check_circle</span>
              <p className="text-sm font-black text-white">Raporunuz alındı</p>
              <p className="text-xs text-white/40 text-center">En kısa sürede inceleyeceğiz. Teşekkür ederiz.</p>
              <button onClick={onClose}
                className="mt-2 px-6 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all">
                Kapat
              </button>
            </div>
          ) : !isAuth ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10">
              <span className="material-symbols-outlined text-[40px] text-white/20">lock</span>
              <p className="text-sm font-black text-white/60">Sorun bildirmek için giriş yapın</p>
              <p className="text-xs text-white/30 text-center max-w-[220px]">Ücretsiz hesap yeterli — raporun doğrudan ekibimize ulaşır.</p>
              <a href="/login"
                className="mt-2 w-full text-center px-6 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all">
                Giriş Yap
              </a>
              <a href="/register"
                className="w-full text-center px-6 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-white/[0.07] transition-all">
                Ücretsiz Kayıt Ol
              </a>
              <button onClick={onClose}
                className="mt-1 text-[9px] font-black uppercase tracking-widest text-white/15 hover:text-white/35 transition-colors">
                Belki Daha Sonra
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Konu</label>
                <SubjectDropdown value={subject} onChange={setSubject} />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">Açıklama</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} required
                  rows={4} placeholder="Sorunu kısaca açıklayın..."
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[11px] text-white/80 placeholder-white/20 focus:outline-none focus:border-primary/40 transition-colors resize-none" />
              </div>
              {status === 'error' && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
                  <p className="text-[10px] text-red-400 font-bold">Rapor gönderilemedi</p>
                  {errDetail && <p className="text-[9px] text-red-400/60 font-mono mt-0.5 break-all">{errDetail}</p>}
                </div>
              )}
              <div className="flex gap-2 pt-1 pb-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl border border-white/[0.07] text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-white/[0.04] transition-all">
                  Vazgeç
                </button>
                <button type="submit" disabled={status === 'loading' || !subject || !message}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  {status === 'loading' ? 'Gönderiliyor...' : 'Gönder'}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Metric Card ────────────────────────────────────────────────────────────────
function MetricCard({ icon, label, value, color = 'text-primary', colorHex = '#22d3ee' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:4, border:'1px solid rgba(255,255,255,0.06)', background:'#07090e' }}>
      <div style={{ width:30, height:30, borderRadius:3, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span className={cn('material-symbols-outlined text-[15px]', color)}>{icon}</span>
      </div>
      <div>
        <p style={{ fontSize:8, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.18em', color:'rgba(255,255,255,0.2)', marginBottom:3 }}>{label}</p>
        <p className={cn('text-sm font-black font-mono leading-none', color)}>{value}</p>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LogsPage() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isGuest = useAuthStore(s => s.isGuest) || !isAuthenticated;
  const results = useScanStore(s => s.results);
  const lastScanTime = useScanStore(s => s.lastScanTime);

  // Live scan state (polled from backend)
  const [scanState, setScanState] = useState({ state: 'IDLE', percent: 0, stage: '', message: '' });
  const prevStateRef = useRef(null);
  const prevPctRef   = useRef(null);
  const prevStageRef = useRef('');
  const netErrRef    = useRef(false);

  // Activity feed
  const [activities, setActivities] = useState(() => [
    mkActivity('system', 'Sistem günlüğü başlatıldı', 'PivotRadar izleniyor'),
  ]);

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);

  // Alert severity label mapping
  const alertSeenTsRef = useRef((Date.now() / 1000) - 300); // last 5 min on first load

  const push = useCallback((type, title, detail = null) => {
    setActivities(prev => {
      const next = [mkActivity(type, title, detail), ...prev];
      return next.length > 30 ? next.slice(0, 30) : next;
    });
  }, []);

  // Poll /api/progress every 2s
  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      if (cancelled) return;
      try {
        const data = await api.progress();
        if (cancelled) return;
        netErrRef.current = false;

        const state   = data?.state   ?? 'UNKNOWN';
        const pct     = data?.percent ?? 0;
        const stage   = data?.stage   ?? '';
        const msg     = data?.message ?? '';

        setScanState({ state, percent: pct, stage, message: msg });

        useScanStore.getState().setQueueDepths(
          data?.queue_depth || 0,
          data?.intel_queue_depth || 0
        );

        // State transition events — ERROR yalnızca aktif tarama varken anlamlıdır
        if (state !== prevStateRef.current && prevStateRef.current !== null) {
          if (state === 'SCANNING') {
            prevStageRef.current = '';
            prevPctRef.current = null;
            push('scan', 'Algoritmik tarama başlatıldı', 'Tüm BIST hisseleri taranıyor');
          } else if (state === 'DONE') {
            // msg = "X hisse tarandı." — sayıyı çıkar
            const countFromMsg = parseInt((msg || '').match(/\d+/)?.[0]) || 0;
            const r = useScanStore.getState().results || [];
            const cnt = countFromMsg || r.length;
            const signals = r.filter(x => (x.yzdsh || 0) >= 75);
            const top3 = [...r].sort((a, b) => (b.yzdsh || 0) - (a.yzdsh || 0)).slice(0, 3);
            const topStr = top3.length > 0 ? top3.map(x => `${x.symbol} (${Math.round(x.yzdsh || 0)})`).join(' · ') : null;
            push('done',
              cnt > 0 ? `${cnt} hisse tarandı` : 'Tarama tamamlandı',
              topStr || (signals.length > 0 ? `${signals.length} güçlü sinyal` : 'Sonuçlar terminalde hazır')
            );
            // 4sn sonra store yüklenmiş olabilir, sinyal özeti pushla
            setTimeout(() => {
              const r2 = useScanStore.getState().results || [];
              if (r2.length > 0) {
                const sig2 = r2.filter(x => (x.yzdsh || 0) >= 75);
                const top5 = [...r2].sort((a, b) => (b.yzdsh || 0) - (a.yzdsh || 0)).slice(0, 5);
                if (sig2.length > 0) {
                  push('info',
                    `${sig2.length} güçlü sinyal tespit edildi`,
                    top5.map(x => `${x.symbol} ${Math.round(x.yzdsh || 0)}`).join(' · ')
                  );
                }
              }
            }, 4000);
          } else if (state === 'ERROR' && prevStateRef.current === 'SCANNING') {
            push('error', 'Tarama sırasında bir sorun oluştu', msg || 'Sistem otomatik olarak kurtarılmaya çalışılıyor');
          } else if (state === 'IDLE' && prevStateRef.current === 'SCANNING') {
            push('warn', 'Tarama kullanıcı tarafından durduruldu', null);
          }
        }

        // Aşama değişimlerini yaz (25% milestones yerine gerçek stage değişimi)
        if (state === 'SCANNING') {
          const STAGE_LABELS = {
            'KAYNAK':     'Veri kaynağına bağlanılıyor',
            'VERİ':       'Fiyat & hacim verisi çekiliyor',
            'ANALİZ':     'Teknik göstergeler hesaplanıyor',
            'YAPAY ZEKA': 'ML modeli skorlama yapıyor',
            'SONUÇ':      'Sonuçlar hazırlanıyor',
          };
          if (stage && stage !== prevStageRef.current) {
            prevStageRef.current = stage;
            const label = STAGE_LABELS[stage] || stage;
            push('scan', label, pct > 0 ? `%${pct} tamamlandı` : null);
          }
          prevPctRef.current = pct;
        }

        // First load: show idle status message
        if (prevStateRef.current === null && state === 'IDLE' && lastScanTime) {
          push('info', `Son tarama: ${fmtRelative(lastScanTime)}`, null);
        }

        // ERROR'ı IDLE olarak izle — stale progress.json geçişlerini gizler
        prevStateRef.current = state === 'ERROR' ? 'IDLE' : state;

      } catch (err) {
        if (cancelled) return;
        if (!netErrRef.current) {
          netErrRef.current = true;
          push('warn', 'Sunucuya bağlanılamadı', 'Yeniden deneniyor...');
        }
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    }

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [push, lastScanTime]);

  // Poll /api/status/alerts every 15s — surface ERROR/WARNING to feed
  useEffect(() => {
    let cancelled = false;
    let timer;

    async function pollAlerts() {
      if (cancelled) return;
      try {
        const data = await api.statusAlerts(alertSeenTsRef.current);
        if (cancelled) return;
        const items = data?.items ?? [];
        // Process oldest-first so feed order is chronological top-to-bottom
        const sorted = [...items].sort((a, b) => a.ts - b.ts);
        sorted.forEach(item => {
          if (item.ts <= alertSeenTsRef.current) return;
          alertSeenTsRef.current = Math.max(alertSeenTsRef.current, item.ts);
          const isErr = item.level === 'ERROR';
          push(
            isErr ? 'error' : 'warn',
            isErr ? 'Sistem hatası tespit edildi' : 'Sistem uyarısı',
            item.msg ? item.msg.slice(0, 100) : null,
          );
        });
      } catch {
        // silently ignore — alert feed is best-effort
      }
      if (!cancelled) timer = setTimeout(pollAlerts, 15_000);
    }

    pollAlerts();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [push]);

  // Derived metrics
  const scanCount = results.length;
  const signals   = results.filter(r => (r.yzdsh || 0) >= 75).length;
  const topQrs    = scanCount ? Math.max(...results.map(r => r.yzdsh || 0)).toFixed(1) : null;
  const isScanning = scanState.state === 'SCANNING';

  return (
    <div style={{ position:'relative', display:'flex', flexDirection:'column', gap:12, paddingBottom:32, minHeight:'calc(100vh - 80px)' }}>
      {isGuest && (
        <GuestLockOverlay
          title="Sistem İzleyici"
          description="Tarama motorunun durumunu ve geçmişini görmek için ücretsiz üye olun."
        />
      )}

      {/* ── STATUS CARD ── */}
      <div style={{ background:'#07090e', border:`1px solid ${isScanning ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius:4, padding:'14px 18px', display:'flex', flexWrap:'wrap', alignItems:'center', gap:14, transition:'border-color 0.3s' }}>
        {/* Status indicator */}
        <div style={{ width:36, height:36, borderRadius:4, background: isScanning ? 'rgba(34,211,238,0.07)' : 'rgba(255,255,255,0.03)', border:`1px solid ${isScanning ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.07)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span className="material-symbols-outlined" style={{ fontSize:18, color: isScanning ? '#22d3ee' : 'rgba(255,255,255,0.25)' }}>
            {isScanning ? 'radar' : 'check_circle'}
          </span>
        </div>

        {/* Status text */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:13, fontWeight:900, color:'#fff', letterSpacing:'0.04em' }}>
              {isScanning ? 'Tarama Devam Ediyor' : 'Sistem Hazır'}
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:9, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.12em', border:`1px solid ${isScanning ? 'rgba(34,211,238,0.22)' : 'rgba(52,211,153,0.18)'}`, borderRadius:3, padding:'1px 6px', color: isScanning ? '#22d3ee' : '#34d399' }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background: isScanning ? '#22d3ee' : '#34d399', flexShrink:0 }} />
              {isScanning ? 'Aktif' : 'Beklemede'}
            </span>
          </div>

          {isScanning ? (
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <p style={{ fontSize:10, color:'rgba(255,255,255,0.35)', fontFamily:'monospace' }}>
                {scanState.stage || 'Hazırlanıyor...'} — %{scanState.percent}
              </p>
              <div style={{ height:2, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden', maxWidth:220 }}>
                <motion.div
                  style={{ height:'100%', background:'#22d3ee', opacity:0.7 }}
                  animate={{ width: `${scanState.percent}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          ) : (
            <p style={{ fontSize:10, color:'rgba(255,255,255,0.25)', fontFamily:'monospace' }}>
              {lastScanTime
                ? `Son tarama ${fmtRelative(lastScanTime)} · ${fmtTime(lastScanTime)}`
                : 'Henüz tarama yapılmadı'}
            </p>
          )}
        </div>

        {/* Sorun Bildir */}
        <button onClick={() => setReportOpen(true)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:3, border:'1px solid rgba(255,255,255,0.07)', background:'transparent', color:'rgba(255,255,255,0.3)', fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.1em', cursor:'pointer', flexShrink:0 }}>
          <span className="material-symbols-outlined" style={{ fontSize:13 }}>flag</span>
          Sorun Bildir
        </button>
      </div>

      {/* ── METRICS ROW ── */}
      {scanCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard icon="radar"       label="Taranan Hisse"  value={scanCount}              color="text-primary" />
          <MetricCard icon="trending_up" label="Güçlü Sinyal"   value={`${signals} hisse`}     color="text-emerald-400" />
          <MetricCard icon="emoji_events"label="En Yüksek QRS"  value={topQrs ? `${topQrs}` : '—'} color="text-primary" />
          <MetricCard icon="schedule"    label="Son Tarama"     value={fmtTime(lastScanTime)}  color="text-white/50" />
        </div>
      )}

      {/* ── ACTIVITY FEED ── */}
      <div style={{ background:'#07090e', border:'1px solid rgba(255,255,255,0.06)', borderRadius:4, display:'flex', flexDirection:'column', overflow:'hidden', flex:1, minHeight:360 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span className="material-symbols-outlined" style={{ fontSize:14, color:'rgba(255,255,255,0.2)' }}>history</span>
            <span style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.15em', color:'rgba(255,255,255,0.35)' }}>Aktivite Geçmişi</span>
            <span style={{ fontSize:9, fontFamily:'monospace', color:'rgba(255,255,255,0.15)' }}>{activities.length}</span>
          </div>
          <button
            onClick={() => setActivities([mkActivity('system', 'Günlük temizlendi', null)])}
            style={{ fontSize:9, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.12em', color:'rgba(255,255,255,0.2)', background:'transparent', border:'none', cursor:'pointer', padding:'3px 8px', borderRadius:3 }}
          >
            Temizle
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 custom-scrollbar min-h-0">
          <AnimatePresence initial={false}>
            {activities.map(act => {
              const s = ACT_STYLES[act.type] || ACT_STYLES.system;
              const isAlert = act.type === 'error' || act.type === 'warn';
              const ts = new Date(act.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <motion.div
                  key={act.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:3, border:`1px solid ${act.type === 'error' ? 'rgba(248,113,113,0.15)' : act.type === 'warn' ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)'}`, background: act.type === 'error' ? 'rgba(248,113,113,0.04)' : act.type === 'warn' ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)' }}
                >
                  {/* Icon */}
                  <div style={{ width:24, height:24, borderRadius:3, background:'rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span className={cn('material-symbols-outlined text-[13px]', s.color)}>{s.icon}</span>
                  </div>

                  {/* Text */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <p className={cn('text-[11px] font-bold leading-snug truncate', s.color)}>{act.title}</p>
                      {isAlert && (
                        <span style={{ fontSize:7, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.15em', padding:'1px 4px', borderRadius:2, border:`1px solid ${act.type === 'error' ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}`, color: act.type === 'error' ? 'rgba(248,113,113,0.8)' : 'rgba(251,191,36,0.8)', flexShrink:0 }}>
                          {act.type === 'error' ? 'HATA' : 'UYARI'}
                        </span>
                      )}
                    </div>
                    {act.detail && (
                      <p style={{ fontSize:9, color:'rgba(255,255,255,0.35)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{act.detail}</p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span style={{ fontSize:9, fontFamily:'monospace', color:'rgba(255,255,255,0.25)', flexShrink:0 }}>{ts}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {activities.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <span className="material-symbols-outlined text-[32px] text-white/10">history</span>
              <p className="text-[9px] uppercase tracking-widest text-white/15">Henüz aktivite yok</p>
            </div>
          )}
        </div>

        <div style={{ padding:'8px 16px', borderTop:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:8, fontFamily:'monospace', color:'rgba(255,255,255,0.15)', textTransform:'uppercase', letterSpacing:'0.15em' }}>
            {activities.length} aktivite
          </span>
          <span style={{ fontSize:8, fontFamily:'monospace', color:'rgba(255,255,255,0.1)', textTransform:'uppercase', letterSpacing:'0.15em' }}>
            Son 30 kayıt saklanır
          </span>
        </div>
      </div>

      {/* ── REPORT MODAL ── */}
      <AnimatePresence>
        {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
