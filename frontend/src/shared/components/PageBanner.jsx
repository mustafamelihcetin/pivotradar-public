import React from 'react';
import { motion } from 'framer-motion';

/**
 * Shared elite page banner for all inner pages.
 *
 * Props:
 *  tag         — small uppercase label  e.g. "YÖNETİM PANELİ"
 *  title       — white part of heading  e.g. "Admin"
 *  accent      — colored part of heading e.g. "Merkezi"
 *  description — short subtitle text
 *  color       — 'cyan' | 'purple' | 'amber' | 'emerald'  (default 'cyan')
 *  right       — optional JSX rendered on the right side
 */
const PALETTES = {
  cyan:    { bar: '#22d3ee', glow: 'rgba(34,211,238,0.04)',  lineGlow: 'rgba(34,211,238,0.15)',  text: '#22d3ee' },
  purple:  { bar: '#a78bfa', glow: 'rgba(167,139,250,0.04)', lineGlow: 'rgba(167,139,250,0.15)', text: '#a78bfa' },
  amber:   { bar: '#fbbf24', glow: 'rgba(251,191,36,0.04)',  lineGlow: 'rgba(251,191,36,0.15)',  text: '#fbbf24' },
  emerald: { bar: '#34d399', glow: 'rgba(52,211,153,0.04)',  lineGlow: 'rgba(52,211,153,0.15)',  text: '#34d399' },
};

export function PageBanner({ tag, title, accent, description, color = 'cyan', right }) {
  const p = PALETTES[color] ?? PALETTES.cyan;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '2rem',
        border: '1px solid rgba(255,255,255,0.05)',
        background: 'linear-gradient(135deg, #0c0f18 0%, #09090f 50%, #070a10 100%)',
      }}
    >
      {/* Glow blob */}
      <div style={{
        position: 'absolute',
        top: '-40px',
        right: 0,
        width: 320,
        height: 120,
        background: p.glow.replace('0.04', '0.06'),
        filter: 'blur(70px)',
        pointerEvents: 'none',
      }} />
      {/* Top accent line */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        background: `linear-gradient(to right, transparent, ${p.lineGlow}, transparent)`,
      }} />

      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 p-5 sm:p-6 md:p-8">
        {/* Left */}
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {/* Title row with accent bar */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-0.5 h-6 sm:h-8 rounded-full shrink-0" style={{ background: p.bar, boxShadow: `0 0 10px ${p.bar}cc` }} />
            <div>
              {tag && (
                <div className="text-[7px] sm:text-[8px] font-black uppercase tracking-[0.3em] opacity-50 mb-0.5 sm:mb-1" style={{ color: p.text }}>
                  {tag}
                </div>
              )}
              <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tighter leading-none m-0 bg-gradient-to-b from-white via-white to-white/45 bg-clip-text text-transparent">
                {title}
                {accent && (
                  <> <span style={{ color: p.text, WebkitTextFillColor: p.text }}>{accent}</span></>
                )}
              </h1>
            </div>
          </div>

          {description && (
            <p className="text-[9px] sm:text-[10px] text-white/20 font-medium max-w-lg leading-relaxed m-0 font-mono ml-3.5 sm:ml-5">
              {description}
            </p>
          )}
        </div>

        {/* Right slot */}
        {right && (
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-end sm:self-center">
            {right}
          </div>
        )}
      </div>
    </motion.div>
  );
}
