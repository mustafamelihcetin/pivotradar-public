/**
 * AnalyzeOverlay — Kişisel analiz sürecini görselleştiren tam ekran overlay.
 * Minimum 3 saniye animasyon gösterir. İki katman:
 *   1. SİSTEM (amber)  → KAYNAK + VERİ  — zaten hazır, hızlıca tamamlanıyor
 *   2. KİŞİSEL (cyan)  → ANALİZ + AI + SIRALAMA + SONUÇ — sırayla canlanıyor
 */
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const SYSTEM_STAGES = [
  { icon: 'cloud_download', label: 'Veri Kaynağı',  desc: 'BIST fiyat verileri hazır' },
  { icon: 'database',       label: 'Veri İşleme',   desc: 'OHLCV normalize edilmiş' },
];
const USER_STAGES = [
  { icon: 'analytics',          label: 'Teknik Analiz', desc: 'RSI · EMA · ATR hesaplanıyor' },
  { icon: 'psychology',         label: 'AI Motoru',     desc: 'ML skor üretiliyor (XGBoost)' },
  { icon: 'stacked_line_chart', label: 'Sıralama',      desc: 'QRS profil ağırlıkları uygulanıyor' },
  { icon: 'task_alt',           label: 'Sonuç',         desc: 'En yüksek skorlar seçiliyor' },
];

const PROFILE_COLORS = {
  Dengeli:    { from: '#22d3ee', to: '#67e8f9', glow: 'rgba(34,211,238,0.25)' },
  Swing:      { from: '#34d399', to: '#6ee7b7', glow: 'rgba(52,211,153,0.25)' },
  Trend:      { from: '#fbbf24', to: '#fde68a', glow: 'rgba(251,191,36,0.25)' },
  Scalper:    { from: '#fb923c', to: '#fdba74', glow: 'rgba(251,146,60,0.25)' },
  Kirilim:    { from: '#a855f7', to: '#d8b4fe', glow: 'rgba(168,85,247,0.25)' },
  Deger:      { from: '#22d3ee', to: '#a5f3fc', glow: 'rgba(34,211,238,0.2)'  },
  Konservatif:{ from: '#38bdf8', to: '#7dd3fc', glow: 'rgba(56,189,248,0.25)' },
  Agresif:    { from: '#f87171', to: '#fca5a5', glow: 'rgba(248,113,113,0.25)' },
};

export default function AnalyzeOverlay({ isOpen, profile = 'Dengeli', analyzeProgress = 0 }) {
  const [stageProgress, setStageProgress] = useState(0); // 0..6 (2 system + 4 user)
  const [systemDone, setSystemDone] = useState(false);
  const timerRef = useRef(null);
  const colors = PROFILE_COLORS[profile] || PROFILE_COLORS['Dengeli'];

  useEffect(() => {
    if (!isOpen) {
      setStageProgress(0);
      setSystemDone(false);
      return;
    }

    // System stages flash quickly (0→2 in 600ms)
    let sp = 0;
    const advance = () => {
      sp += 1;
      setStageProgress(sp);
      if (sp === 2) {
        setSystemDone(true);
        // Then user stages advance with analyzeProgress
      }
    };

    timerRef.current = setTimeout(() => { advance(); }, 200);
    const t2 = setTimeout(() => { advance(); }, 550);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(t2);
    };
  }, [isOpen]);

  // Map analyzeProgress (0-100) to user stage index (0-4)
  useEffect(() => {
    if (!isOpen || !systemDone) return;
    const userIdx = Math.floor((analyzeProgress / 100) * 4);
    setStageProgress(2 + Math.min(userIdx, 4));
  }, [analyzeProgress, isOpen, systemDone]);

  const currentUserStage = Math.max(0, stageProgress - 2);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="analyze-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,6,10,0.92)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }} />

          {/* Ambient glow */}
          <div style={{
            position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 600, height: 400, pointerEvents: 'none',
            background: `radial-gradient(ellipse, ${colors.glow} 0%, transparent 70%)`,
          }} />

          {/* Card */}
          <motion.div
            initial={{ scale: 0.88, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220, delay: 0.05 }}
            style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 720, margin: '0 24px' }}
          >
            <div
              className="rounded-[2rem] border border-white/[0.07] overflow-hidden"
              style={{
                background: 'linear-gradient(150deg, rgba(10,13,20,0.99) 0%, rgba(6,9,15,0.99) 100%)',
                boxShadow: `0 40px 120px rgba(0,0,0,0.9), 0 0 0 1px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
              }}
            >
              {/* Top glow strip */}
              <div style={{ height: 2, background: `linear-gradient(90deg, transparent 0%, ${colors.from}66 30%, ${colors.from} 50%, ${colors.from}66 70%, transparent 100%)` }} />

              <div className="p-7 space-y-6">

                {/* Header */}
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                    <motion.div
                      animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 rounded-full border border-primary/30"
                    />
                    <div className="w-14 h-14 rounded-2xl border border-primary/25 flex items-center justify-center"
                      style={{ background: `${colors.glow}` }}>
                      <span className="material-symbols-outlined text-primary text-[26px]">psychology</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary/40 mb-1">KİŞİSEL ANALİZ · PRISM CORE</p>
                    <h2 className="text-2xl font-black tracking-tighter text-white leading-none">
                      {profile} Profili
                      <span className="text-primary ml-2 animate-pulse">_</span>
                    </h2>
                    <p className="text-[11px] text-white/30 font-mono mt-1">
                      {USER_STAGES[Math.min(currentUserStage, USER_STAGES.length - 1)]?.desc}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border"
                      style={{ background: `${colors.glow}`, borderColor: `${colors.from}33` }}>
                      <span className="w-2 h-2 rounded-full animate-pulse shadow-lg"
                        style={{ background: colors.from, boxShadow: `0 0 8px ${colors.from}` }} />
                      <span className="text-xl font-black font-mono text-white tracking-tight">
                        {analyzeProgress < 100 ? `${Math.round(analyzeProgress)}%` : '✓'}
                      </span>
                    </div>
                    <span className="text-[8px] text-white/20 font-mono uppercase tracking-widest">TAMAMLANDI</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${colors.from}80, ${colors.from}, ${colors.to})`, boxShadow: `0 0 12px ${colors.from}80` }}
                    animate={{ width: `${Math.max(4, analyzeProgress)}%` }}
                    transition={{ duration: 0.2, ease: 'linear' }}
                  />
                </div>

                {/* Stages — two rows */}
                <div className="space-y-3">

                  {/* Sistem katmanı (amber) */}
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-amber-400/10 bg-amber-400/[0.04]">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-amber-400/40 shrink-0 w-14">SİSTEM</span>
                    <div className="flex items-center gap-2 flex-1">
                      {SYSTEM_STAGES.map((s, i) => {
                        const done = stageProgress > i;
                        return (
                          <React.Fragment key={s.icon}>
                            <div className="flex items-center gap-1.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all duration-500 ${done ? 'bg-amber-400/15 border-amber-400/40' : 'bg-white/[0.02] border-white/[0.05]'}`}>
                                <span className={`material-symbols-outlined text-[13px] ${done ? 'text-amber-400' : 'text-white/10'}`}
                                  style={done ? { fontVariationSettings: "'FILL' 1" } : {}}>
                                  {done ? 'check_circle' : s.icon}
                                </span>
                              </div>
                              <span className={`text-[9px] font-bold uppercase tracking-wide hidden sm:block ${done ? 'text-amber-400/70' : 'text-white/15'}`}>{s.label}</span>
                            </div>
                            {i < SYSTEM_STAGES.length - 1 && <div className="flex-1 h-px border-t border-dashed border-amber-400/15" />}
                          </React.Fragment>
                        );
                      })}
                      <div className="flex-1 h-px border-t border-dashed border-white/[0.05]" />
                      <span className="text-[8px] text-white/15 font-mono italic hidden sm:block">otomatik</span>
                    </div>
                  </div>

                  {/* Kullanıcı katmanı (cyan) */}
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/10 bg-primary/[0.03]">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-primary/40 shrink-0 w-14">KİŞİSEL</span>
                    <div className="flex items-center gap-2 flex-1">
                      {USER_STAGES.map((s, i) => {
                        const absIdx = i + 2;
                        const done   = stageProgress > absIdx;
                        const active = stageProgress === absIdx;
                        return (
                          <React.Fragment key={s.icon}>
                            <motion.div
                              animate={active ? { scale: [1, 1.08, 1] } : {}}
                              transition={{ duration: 1, repeat: Infinity }}
                              className="flex items-center gap-1.5"
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center border-2 transition-all duration-500 ${
                                active ? 'border-primary shadow-[0_0_16px_rgba(34,211,238,0.4)]' : done ? 'bg-emerald-400/10 border-emerald-400/30' : 'bg-white/[0.02] border-white/[0.05]'
                              }`}
                                style={active ? { background: `${colors.glow}` } : {}}
                              >
                                <span className={`material-symbols-outlined text-[13px] transition-all ${
                                  active ? 'text-primary animate-pulse' : done ? 'text-emerald-400' : 'text-white/10'
                                }`}
                                  style={done ? { fontVariationSettings: "'FILL' 1" } : {}}
                                >
                                  {done ? 'check_circle' : s.icon}
                                </span>
                              </div>
                              <span className={`text-[9px] font-bold uppercase tracking-wide hidden sm:block ${
                                active ? 'text-primary' : done ? 'text-white/60' : 'text-white/15'
                              }`}>{s.label}</span>
                            </motion.div>
                            {i < USER_STAGES.length - 1 && (
                              <div className={`flex-1 h-px border-t border-dashed transition-colors ${done ? 'border-primary/25' : 'border-white/[0.05]'}`} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-[9px] font-mono text-white/20 pt-1 border-t border-white/[0.04]">
                  <span>MOTOR: CORE · BIST Hisse Tarama</span>
                  <span className="text-primary/40 animate-pulse">■ İŞLENİYOR</span>
                </div>

              </div>
              {/* Bottom strip */}
              <div style={{ height: 1, background: `linear-gradient(90deg, transparent 0%, ${colors.from}30 50%, transparent 100%)` }} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
