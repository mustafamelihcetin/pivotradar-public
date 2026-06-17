/**
 * TacticalHUD — PivotRadar multimedia showcase panel.
 *
 * Durum makinesi:
 *   IDLE      → döngüsel marka filmi (tagline · brand · feature sahneleri)
 *   SCANNING  → arka plan taraması görselleştirmesi
 *   ANALYZING → 2-3 saniyelik veri işleme animasyonu
 *   RESULTS   → sinyal sayısı "reveal", 3s sonra IDLE'a döner
 *
 * Hedef yükseklik: ~168px (h-42 equiv.) — kompakt, boşluğa tam sığar.
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useScanStore } from '@/core/store/useScanStore';
import { cn } from '@/shared/utils/cn';
import { BrandLogo as PRBrandLogo } from '@/shared/components/BrandLogo';
import { ChevronRight } from 'lucide-react';

/* ─────────────────────────── constants ─────────────────────────────────── */
const ST = { IDLE: 'idle', SCAN: 'scan', ANALYZE: 'analyze', RESULTS: 'results' };
const SCENE_MS = 6000;   // idle scene duration (slowed down for focus)
const SCENES = ['tagline', 'brand', 'feature'];

/* ─────────────────────────── logo mark SVG ─────────────────────────────── */
export function RadarMark({ size = 36, color = '#22d3ee', opacity = 1 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 40 40" fill="none"
      style={{ opacity }}
    >
      {/* Center dot */}
      <circle cx="20" cy="20" r="2.8" fill={color} />
      {/* Arc 1 */}
      <path
        d="M 20 20 m -7 0 a 7 7 0 0 1 7 -7"
        stroke={color} strokeWidth="2" strokeLinecap="round"
        opacity="0.9"
      />
      {/* Arc 2 */}
      <path
        d="M 20 20 m -12 0 a 12 12 0 0 1 12 -12"
        stroke={color} strokeWidth="1.2" strokeLinecap="round"
        opacity="0.5"
      />
      {/* Arc 3 */}
      <path
        d="M 20 20 m -17 0 a 17 17 0 0 1 17 -17"
        stroke={color} strokeWidth="0.7" strokeLinecap="round"
        opacity="0.22"
      />
      {/* Sweep line — animated via parent */}
      <line
        x1="20" y1="20" x2="27" y2="13"
        stroke={color} strokeWidth="1" opacity="0.6"
      />
    </svg>
  );
}

/* ─────────────────────────── ambient canvas ────────────────────────────── */
function AmbientCanvas({ state }) {
  const ref = useRef(null);
  const rAF = useRef(null);
  const tick = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      tick.current += 1;
      const t = tick.current;
      const pulse = (Math.sin(t * 0.05) + 1) / 2;

      ctx.clearRect(0, 0, W, H);

      /* ── base ── */
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // 1. Base dark background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
      ctx.fillRect(0, 0, W, H);

      /* ── scan mode: sweeping horizontal line ── */
      if (state === ST.SCAN || state === ST.ANALYZE) {
        const sy = ((t * 0.9) % H);
        const sg = ctx.createLinearGradient(0, sy - 20, 0, sy + 2);
        sg.addColorStop(0, 'rgba(34,211,238,0)');
        sg.addColorStop(1, `rgba(34,211,238,${0.18 + pulse * 0.08})`);
        ctx.fillStyle = sg;
        ctx.fillRect(0, sy - 20, W, 22);
        ctx.fillStyle = `rgba(34,211,238,${0.45 + pulse * 0.1})`;
        ctx.fillRect(0, sy, W, 1);
      }

      /* ── analyze mode: fast data particles ── */
      if (state === ST.ANALYZE) {
        ctx.font = '8px "Courier New"';
        for (let i = 0; i < 18; i++) {
          const px = (i * 67 + t * (1 + i * 0.15)) % W;
          const py = (i * 37 + t * 0.5) % H;
          const v = (Math.floor(t * 0.3 + i) % 10).toString();
          ctx.fillStyle = `rgba(34,211,238,${0.1 + (i % 3) * 0.07})`;
          ctx.fillText(v, px, py);
        }
      }

      /* ── dot grid (very subtle) ── */
      ctx.fillStyle = 'rgba(34,211,238,0.035)';
      for (let x = 24; x < W; x += 30) {
        for (let y = 24; y < H; y += 30) {
          ctx.beginPath();
          ctx.arc(x, y, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rAF.current = requestAnimationFrame(draw);
    };

    rAF.current = requestAnimationFrame(draw);
    return () => {
      if (rAF.current) cancelAnimationFrame(rAF.current);
      if (ro) ro.disconnect();
    };
  }, [state]); // re-init when state changes to pick up alpha changes

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}/* ─────────────────────────── component: hud bracket ────────────────────── */
function HudBracket() {
  return (
    <div className="absolute inset-0 pointer-events-none opacity-20">
      <div className="absolute top-2 left-2 md:top-4 md:left-4 w-3 md:h-4 md:w-4 h-3 border-l-2 border-t-2 border-cyan-400" />
      <div className="absolute top-2 right-2 md:top-4 md:right-4 w-3 md:h-4 md:w-4 h-3 border-r-2 border-t-2 border-cyan-400" />
      <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4 w-3 md:h-4 md:w-4 h-3 border-l-2 border-b-2 border-cyan-400" />
      <div className="absolute bottom-2 right-2 md:bottom-4 md:right-4 w-3 md:h-4 md:w-4 h-3 border-r-2 border-b-2 border-cyan-400" />
    </div>
  );
}

/* ─────────────────────────── visual: quantum scanner (flashy) ────────────── */
function QuantumScanner() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative w-48 h-32 flex items-center justify-center opacity-70"
    >
      {/* Dynamic Rings */}
      {[1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-cyan-400/20"
          animate={{
            rotate: i % 2 === 0 ? 360 : -360,
            scale: [1, 1.1, 1],
            opacity: [0.1, 0.4, 0.1]
          }}
          transition={{ duration: 10 / i, repeat: Infinity, ease: 'linear' }}
          style={{ width: i * 35, height: i * 35 }}
        />
      ))}

      {/* Scanning Sweep */}
      <motion.div
        className="absolute w-[120px] h-[120px] border-t-2 border-cyan-400/60 rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        style={{ background: 'conic-gradient(from 0deg, rgba(34,211,238,0.2) 0%, transparent 25%)' }}
      />

      {/* Center Core */}
      <div className="relative group">
        <motion.div
          className="w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_20px_#22d3ee]"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <div className="absolute -inset-4 border border-cyan-400/10 rounded-full animate-ping" />
      </div>

      {/* Crosshair accents */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── visual: neural flow (flashy) ──────────────── */
function NeuralFlow() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative w-56 h-32 flex items-center justify-around px-4 opacity-60"
    >
      {[1, 2, 3].map(col => (
        <div key={col} className="flex flex-col gap-4">
          {[1, 2, 3].map(row => (
            <motion.div
              key={row}
              className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]"
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.8, 1.4, 0.8]
              }}
              transition={{
                duration: 2 + Math.random(),
                repeat: Infinity,
                delay: (col + row) * 0.2
              }}
            />
          ))}
        </div>
      ))}

      {/* Connection Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
        <motion.path
          d="M 40 40 Q 100 60 160 40 M 40 80 Q 100 60 160 80"
          stroke="rgba(34,211,238,0.15)"
          strokeWidth="1"
          fill="none"
          animate={{ strokeDashoffset: [0, -100] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
          strokeDasharray="5,10"
        />
      </svg>

      {/* Data Bursts */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-px w-8 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
            initial={{ x: -50, y: Math.random() * 100 }}
            animate={{ x: 250 }}
            transition={{
              duration: 0.8 + Math.random(),
              repeat: Infinity,
              delay: i * 0.4,
              ease: 'linear'
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
/* ─────────────────────────── visual: orbital radar ──────────────────────── */
function OrbitalScanner({ size = 100 }) {
  return (
    <div className="relative flex-shrink-0 flex items-center justify-center opacity-40 ml-auto mr-4" style={{ width: size, height: size }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-cyan-400/20"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.4], opacity: [0.3, 0] }}
          transition={{ duration: 4, repeat: Infinity, delay: i * 1.3, ease: 'linear' }}
          style={{ width: '100%', height: '100%' }}
        />
      ))}
      <motion.div
        className="w-full h-full border border-white/5 rounded-full relative"
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-cyan-400 rounded-full shadow-[0_0_12px_#22d3ee]" />
        <div className="absolute inset-[20%] border border-cyan-400/10 rounded-full border-dashed" />
      </motion.div>
    </div>
  );
}

function TerminalIdentity() {
  return (
    <div className="hidden lg:flex flex-col gap-1.5 opacity-20 border-l border-cyan-400/30 pl-6 h-16 justify-center">
      <div className="flex items-center gap-2">
        <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse" />
        <span className="text-[8px] font-black tracking-[0.3em] text-white uppercase">TR_IST_NOD_01</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-1 h-1 bg-cyan-400 rounded-full opacity-40" />
        <span className="text-[8px] font-mono text-white/60 uppercase">SECURE_HANDSHAKE_OK</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── visual: data mesh ─────────────────────────── */
function DataMesh() {
  return (
    <div className="flex-shrink-0 flex items-center gap-1 opacity-20 ml-auto mr-12 h-16">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <motion.div
          key={i}
          className="w-0.5 bg-cyan-400"
          animate={{ height: [10, 40, 15, 30, 10] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

/* ─────────────────────────── scene: tagline ────────────────────────────── */
const TAGLINES = [
  { top: 'Piyasa', bottom: 'Analiz Terminali', sub: 'PRISM Strategic Intel Veri Tarama Motoru' },
  { top: 'Sektörel', bottom: 'Alpha Zekası', sub: 'Göreceli Güç (Relative Strength) Analizi Aktif' },
  { top: 'PRISM', bottom: 'Karar Desteği', sub: 'Risk/Reward Optimizasyonu ve Skor Analizi' },
];

function SceneTagline({ index = 0 }) {
  const t = TAGLINES[index % TAGLINES.length];
  return (
    <motion.div
      key={index}
      className="absolute inset-0 flex items-center px-4 md:px-10 gap-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Left: Terminal ID */}
      <TerminalIdentity />

      {/* Center/Main: big text */}
      <div className="flex-1 flex flex-col justify-center h-full pt-1">
        <motion.p
          className="text-[9px] font-black uppercase tracking-[0.35em] text-cyan-400/80 mb-0.5 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          {t.sub}
        </motion.p>
        <div className="overflow-hidden">
          <motion.h2
            className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black uppercase tracking-tighter leading-tight text-white/50"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {t.top}
          </motion.h2>
        </div>
        <div className="overflow-hidden">
          <motion.h2
            className="text-xl sm:text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tighter leading-none text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ delay: 0.28, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {t.bottom}
          </motion.h2>
        </div>
      </div>

      {/* Right: Functional Visual */}
      <div className="hidden lg:block ml-auto">
        <OrbitalScanner />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── scene: brand ──────────────────────────────── */
function SceneBrand() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <PRBrandLogo size="lg" />
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────── scene: feature ────────────────────────────── */
const FEATURES = [
  { num: '300+', label: 'Aktif Analiz', sub: 'Filtrelenmiş ve işleme uygun BIST verisi' },
  { num: 'ALPHA', label: 'Sektörel Zeka', sub: 'Hisseler sektördaşlarına göre normalize edilir' },
  { num: 'PRISM', label: 'Core Engine', sub: 'Strategic Intel Kalibre Sinerji Hattı' },
];

function SceneFeature({ index = 0 }) {
  const f = FEATURES[index % FEATURES.length];
  return (
    <motion.div
      key={index}
      className="absolute inset-0 flex items-center px-6 md:px-12 gap-4 md:gap-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Big number */}
      <div className="flex-shrink-0">
        <motion.p
          className="text-4xl md:text-6xl font-black font-mono leading-none text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.6)]"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {f.num}
        </motion.p>
      </div>

      {/* Vertical divider */}
      <motion.div
        className="w-px h-16 bg-gradient-to-b from-transparent via-cyan-400/80 to-transparent"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.25, duration: 0.4 }}
      />

      {/* Text */}
      <div className="flex-1">
        <motion.p
          className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-white leading-none mb-1 md:mb-3 drop-shadow-[0_0_12px_rgba(255,255,255,0.3)]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {f.label}
        </motion.p>
        <div className="flex items-center gap-4">
          <motion.p
            className="text-[11px] text-white/60 font-mono tracking-tight font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            {f.sub}
          </motion.p>
          <div className="h-px bg-white/10 flex-1" />
          <span className="text-[8px] text-cyan-400 font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border border-cyan-400/20 bg-cyan-400/5 backdrop-blur-sm">PRISM</span>
        </div>
      </div>

      {/* Right visual for features */}
      <div className="hidden lg:block">
        <DataMesh />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── scene: PRISM REVEAL (Marvel Style) ──────────── */
const PRISM_WORDS = [
  { l: 'P', w: 'PIVOT' },
  { l: 'R', w: 'RADAR' },
  { l: 'I', w: 'INTELLIGENCE' },
  { l: 'S', w: 'SIGNAL' },
  { l: 'M', w: 'MONITOR' }
];

function ScenePrism() {
  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } }
  };

  const itemAnim = {
    hidden: { scale: 0.8, opacity: 0 },
    show: { scale: 1, opacity: 1, transition: { type: 'spring', damping: 12 } }
  };

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center py-8 md:py-10 overflow-hidden"
      variants={container}
      initial="hidden"
      animate="show"
      exit="hidden"
    >
      {/* Background Cinematic Flare */}
      <div className="absolute inset-0 bg-primary/[0.02] pointer-events-none" />
      
      {/* ── Main Focused PRISM Layer (Higher Z-index & Padding) ── */}
      <div className="relative z-10 flex items-start justify-center gap-3 md:gap-8 lg:gap-12 pb-2">
        {PRISM_WORDS.map((item, i) => (
          <motion.div 
            key={i} 
            className="flex flex-col items-center min-w-[25px] sm:min-w-[45px] md:min-w-[65px]"
            variants={itemAnim}
          >
             <div className="relative mb-1">
                <motion.span 
                  className="text-lg sm:text-2xl md:text-3xl lg:text-5xl font-black text-white block leading-none tracking-tighter drop-shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                  animate={{ opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 4, repeat: Infinity, delay: i * 0.1 }}
                >
                  {item.l}
                </motion.span>
                <div className="h-0.5 w-full bg-cyan-400/80 mt-1" />
             </div>

             <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 + (i * 0.1) }}
                className="text-[5px] sm:text-[7px] md:text-[8px] lg:text-[10px] font-black text-white/90 tracking-[0.1em] uppercase text-center"
              >
                {item.w}
              </motion.span>
          </motion.div>
        ))}
      </div>

      {/* ── Global Brand Identity (Lifted away from border) ── */}
      <motion.div 
        className="mt-4 md:mt-6 flex items-center gap-3 px-10 opacity-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ delay: 1.2 }}
      >
        <div className="h-px w-3 md:w-8 bg-white/20" />
        <span className="text-[7px] md:text-[8px] font-black tracking-[0.7em] text-white uppercase whitespace-nowrap">
          PIVOT RADAR · PRISM STRATEGIC INTEL
        </span>
        <div className="h-px w-3 md:w-8 bg-white/20" />
      </motion.div>

      {/* Subtle Technical Mesh */}
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle, #22d3ee 0.5px, transparent 0.5px)', backgroundSize: '40px 40px' }} />
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── state: scanning ───────────────────────────── */
function StateScan({ profile, progress }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center px-8 gap-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Pulsing radar rings */}
      <div className="relative flex-shrink-0 w-14 h-14 flex items-center justify-center">
        {[1, 1.6, 2.2].map((scale, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-cyan-400/30"
            style={{ width: 20, height: 20 }}
            animate={{ scale: [scale, scale + 0.7, scale], opacity: [0.5, 0.1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.5, ease: 'easeOut' }}
          />
        ))}
        <motion.div
          className="w-3 h-3 rounded-full bg-cyan-400"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{ boxShadow: '0 0 12px rgba(34,211,238,0.8)' }}
        />
      </div>

      <div className="flex-1">
        <motion.p
          className="text-[8px] font-black uppercase tracking-[0.35em] text-cyan-400/50 mb-1"
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          PRISM Strategic Intel Arka Plan Taraması
        </motion.p>
        <p className="text-lg md:text-xl font-black uppercase tracking-tight text-white leading-none mb-2">
          TARAMA YAPILIYOR
        </p>
        <p className="text-[8px] md:text-[9px] font-mono text-white/30 truncate">{profile} · 300+ ANALİZ</p>

        {/* Progress bar */}
        <div className="mt-3 h-px bg-white/[0.06] rounded-full overflow-hidden w-4/5">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(to right, #22d3ee, #67e8f9)' }}
            initial={{ width: '0%' }}
            animate={{ width: `${progress || 5}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Right: percent */}
      <motion.p
        className="flex-shrink-0 text-3xl font-black font-mono text-cyan-400/60"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      >
        {Math.round(progress || 0)}
        <span className="text-sm">%</span>
      </motion.p>
    </motion.div>
  );
}

/* ─────────────────────────── state: analyzing ──────────────────────────── */
const ANALYZE_LINES = [
  'Teknik göstergeler hesaplanıyor…',
  'ML modeli devreye alınıyor…',
  'QRS skorları üretiliyor…',
  'Sonuçlar derleniyor…',
];

function StateAnalyze({ progress }) {
  const lineIdx = Math.min(
    Math.floor((progress / 100) * ANALYZE_LINES.length),
    ANALYZE_LINES.length - 1,
  );

  return (
    <motion.div
      className="absolute inset-0 flex items-center px-8 gap-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Spinning ring */}
      <div className="relative flex-shrink-0 w-12 h-12">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{ borderTopColor: '#22d3ee', borderRightColor: 'rgba(34,211,238,0.2)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-[6px] rounded-full border border-amber-400/30"
          animate={{ rotate: -360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.p
            className="text-[9px] font-black font-mono text-cyan-400"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          >
            {Math.round(progress)}
          </motion.p>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <motion.p
          className="text-[8px] font-black uppercase tracking-[0.35em] text-amber-400/60 mb-1"
        >
          PRISM Strategic Intel Analiz Motoru
        </motion.p>
        <p className="text-lg md:text-xl font-black uppercase tracking-tight text-white leading-none mb-2">
          ANALİZ EDİLİYOR
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={lineIdx}
            className="text-[9px] font-mono text-white/35 truncate"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
          >
            {ANALYZE_LINES[lineIdx]}
          </motion.p>
        </AnimatePresence>

        {/* Progress */}
        <div className="mt-3 h-px bg-white/[0.06] overflow-hidden rounded-full w-4/5">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(to right, #fbbf24, #22d3ee)' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'linear' }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────── state: results reveal ─────────────────────── */
function StateResults({ count, profile, patternSummary, onPatternClick }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Big number reveal */}
      <div>
        <motion.p
          className="text-[8px] font-black uppercase tracking-[0.35em] text-cyan-400/50 mb-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {profile} · Analiz Tamamlandı
        </motion.p>

        <div className="flex items-center gap-6">
          <div className="flex items-baseline gap-3">
            <motion.span
              className="text-5xl font-black font-mono leading-none text-white"
              style={{ textShadow: '0 0 40px rgba(34,211,238,0.6)' }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 18 }}
            >
              {count}
            </motion.span>
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <p className="text-sm font-black uppercase tracking-tight text-white/60 leading-none">
                sinyal
              </p>
              <p className="text-[9px] font-black uppercase tracking-wider text-cyan-400/60">
                TESPİT EDİLDİ
              </p>
            </motion.div>
          </div>

          {/* Pattern Summary Banner */}
          {patternSummary && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onPatternClick}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col gap-1 py-1.5 px-3 bg-amber-500/10 border-l-4 border-amber-500 hover:bg-amber-500/20 transition-all text-left cursor-pointer shadow-[0_4px_20px_rgba(245,158,11,0.1)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-amber-400 font-bold animate-pulse">△</span>
                <span className="text-[9px] font-black text-amber-200 uppercase tracking-widest whitespace-nowrap">
                  {patternSummary.count} FORMASYON TESPİT EDİLDİ
                </span>
                <ChevronRight size={10} className="text-amber-500/50" />
              </div>
              <p className="text-[8px] font-mono text-white/50 uppercase tracking-tight">
                DOMİNANT: {patternSummary.topPattern} ({patternSummary.topCount}×)
              </p>
            </motion.button>
          )}
        </div>

        {/* Flash line */}
        <motion.div
          className="h-px mt-3 w-40"
          style={{ background: 'linear-gradient(to right, #22d3ee, rgba(34,211,238,0))' }}
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        />
      </div>

      {/* Right: brand lockup */}
      <motion.div
        className="flex items-center gap-2.5"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <RadarMark size={38} />
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-white leading-none">
            PivotRadar
          </p>
          <p className="text-[7px] font-black uppercase tracking-[0.3em] text-cyan-400/50 mt-0.5">
            Quant Terminal
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ══════════════════════════ Main component ══════════════════════════════ */
export function TacticalHUD({ className }) {
  /* ── store state ── */
  const results = useScanStore(s => s.results);
  const scanning = useScanStore(s => s.scanning);
  const isAnalyzing = useScanStore(s => s.isAnalyzing);
  const analyzeProgress = useScanStore(s => s.analyzeProgress);
  const scanProgress = useScanStore(s => s.scanProgress);
  const profile = useScanStore(s => s.profile);
  const setViewMode = useScanStore(s => s.setViewMode);

  /* ── HUD state machine ── */
  const [hudState, setHudState] = useState(ST.IDLE);
  const [sceneIdx, setSceneIdx] = useState(0); // cycles tagline scenes
  const [featureIdx, setFeatureIdx] = useState(0);
  const [taglineIdx, setTaglineIdx] = useState(0);
  const resultsFlashTimer = useRef(null);
  const prevAnalyzing = useRef(false);

  /* ── Active signal count ── */
  const activeSignals = useMemo(
    () => results.filter(r => (r.QRS || r.yzdsh || 0) > 70).length,
    [results],
  );

  const patternSummary = useMemo(() => {
    if (!results?.length) return null;
    const withPattern = results.filter(r => r.pattern_name && r.pattern_name !== "Formasyon Yok");
    if (!withPattern.length) return null;

    // Count frequencies
    const counts = {};
    withPattern.forEach(r => {
      const name = r.pattern_name;
      counts[name] = (counts[name] || 0) + 1;
    });

    // Pick top pattern
    const topPattern = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    return {
      count: withPattern.length,
      topPattern: topPattern[0],
      topCount: topPattern[1]
    };
  }, [results]);

  /* ── State machine: tek effect, sıralı geçiş ──────────────────────────
   * isAnalyzing: false→true  → ANALYZE
   * isAnalyzing: true→false  → RESULTS (3.5s) → IDLE
   * Her geçiş önceki timeout'u iptal eder, race condition yok.
   */
  useEffect(() => {
    if (isAnalyzing && !prevAnalyzing.current) {
      // Analiz başladı
      clearTimeout(resultsFlashTimer.current);
      setHudState(ST.ANALYZE);
    } else if (!isAnalyzing && prevAnalyzing.current) {
      // Analiz bitti
      clearTimeout(resultsFlashTimer.current);
      if (results.length > 0) {
        setHudState(ST.RESULTS);
        resultsFlashTimer.current = setTimeout(() => setHudState(ST.IDLE), 3500);
      } else {
        setHudState(ST.IDLE);
      }
    }
    prevAnalyzing.current = isAnalyzing;
  }, [isAnalyzing, results.length]);

  /* ── Idle scene cycling ── */
  useEffect(() => {
    if (hudState !== ST.IDLE) return;
    const SCENE_ORDER = ['tagline', 'feature', 'prism', 'brand'];
    let si = 0;
    const iv = setInterval(() => {
      si = (si + 1) % SCENE_ORDER.length;
      setSceneIdx(prev => {
        setTaglineIdx(t => t + 1);
        setFeatureIdx(f => f + 1);
        return si;
      });
    }, SCENE_MS);
    return () => clearInterval(iv);
  }, [hudState]);

  const SCENE_ORDER = ['tagline', 'feature', 'prism', 'brand'];
  const currentScene = SCENE_ORDER[sceneIdx % SCENE_ORDER.length];

  return (
    <div
      className={cn("relative overflow-hidden border-b border-white/[0.08]", className)}
      style={{ background: 'transparent' }}
    >
      <div className="min-h-[100px] md:h-[130px]" />
      <HudBracket />
      {/* ── Ambient canvas (always running) ── */}
      <AmbientCanvas state={hudState} />

      {/* ── Main Layout Container ── */}
      <div className="absolute inset-0">
        {/* Layer 1: Hero Scenes (Always centered) */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence mode="wait">
            {hudState === ST.IDLE && currentScene === 'tagline' && (
              <SceneTagline key={`tag-${taglineIdx}`} index={taglineIdx} />
            )}
            {hudState === ST.IDLE && currentScene === 'brand' && (
              <SceneBrand key="brand" />
            )}
            {hudState === ST.IDLE && currentScene === 'prism' && (
              <ScenePrism key="prism" />
            )}
            {hudState === ST.IDLE && currentScene === 'feature' && (
              <SceneFeature key={`feat-${featureIdx}`} index={featureIdx} />
            )}
            {hudState === ST.ANALYZE && (
              <StateAnalyze key="analyze" progress={analyzeProgress} />
            )}
            {hudState === ST.RESULTS && (
              <StateResults
                count={activeSignals}
                profile={profile}
                patternSummary={patternSummary}
                onPatternClick={() => setViewMode('patterns')}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Layer 2: Secondary Visuals (Right-aligned, non-shifting) */}
        {hudState === ST.IDLE && (
          <div className="absolute right-0 top-0 bottom-0 hidden lg:flex items-center pr-8 pointer-events-none">
            <AnimatePresence mode="wait">
              {currentScene === 'tagline' && (
                <QuantumScanner key="vis-tagline" />
              )}
              {currentScene === 'feature' && (
                <NeuralFlow key="vis-feature" />
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Bottom ticker: subtle status line ── */}
      <div className="absolute bottom-0 inset-x-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent, rgba(251,191,36,0.15) 50%, transparent)' }} />

      {/* ── State indicator dot (top-right inside brackets) ── */}
      <motion.div
        className="absolute top-[18px] right-[22px] w-1.5 h-1.5 rounded-full pointer-events-none"
        style={{
          background: hudState === ST.ANALYZE ? '#fbbf24'
            : hudState === ST.SCAN ? '#22d3ee'
              : hudState === ST.RESULTS ? '#34d399'
                : 'rgba(255,255,255,0.12)',
        }}
        animate={{
          boxShadow: hudState === ST.IDLE
            ? ['0 0 3px rgba(255,255,255,0.1)', '0 0 3px rgba(255,255,255,0.1)']
            : hudState === ST.ANALYZE
              ? ['0 0 4px rgba(251,191,36,0.4)', '0 0 12px rgba(251,191,36,0.9)', '0 0 4px rgba(251,191,36,0.4)']
              : ['0 0 4px rgba(34,211,238,0.4)', '0 0 12px rgba(34,211,238,0.9)', '0 0 4px rgba(34,211,238,0.4)'],
          scale: hudState === ST.IDLE ? 1 : [1, 1.3, 1],
        }}
        transition={{ duration: 1.8, repeat: Infinity }}
      />
    </div>
  );
}
