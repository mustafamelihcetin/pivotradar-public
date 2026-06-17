import React from 'react';
import { cn } from '@/shared/utils/cn';

const SIZES = {
  xs: { h: 20 },
  sm: { h: 26 },
  md: { h: 34 },
  lg: { h: 44 },
  xl: { h: 60 },
};

let _id = 0;

export function BrandLogo({ className, showText = true, size = 'md' }) {
  const h   = (SIZES[size] || SIZES.md).h;
  const uid = React.useRef(`bl${++_id}`).current;

  // viewBox kurgusu:
  //   icon görsel sağ kenar ≈ 100
  //   metin başı: 108  (ikon ile 8px gap)
  //   "PIVOTRADAR" @52px SpaceGrotesk ≈ 320 birim
  //   metin sağ kenar ≈ 108 + 320 = 428
  //   nokta merkezi: 440  (12px boşluk)
  //   viewBox genişliği: 460  (sağda 13px pay)
  const vw = showText ? 460 : 100;

  return (
    <svg
      viewBox={`0 0 ${vw} 100`}
      height={h}
      width={showText ? Math.round(h * vw / 100) : h}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('select-none pointer-events-none', className)}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#a5f3fc" />
          <stop offset="50%"  stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
        <filter id={`${uid}g`}>
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── İkon ── */}
      <g transform="skewX(-10) translate(6 0)" filter={`url(#${uid}g)`}>
        <rect x="25" y="25" width="18" height="50" rx="3" fill={`url(#${uid})`} />
        <rect x="32" y="10" width="4"  height="20" rx="2" fill={`url(#${uid})`} />
        <rect x="32" y="70" width="4"  height="20" rx="2" fill={`url(#${uid})`} />
        <path d="M 40 32 C 85 28 85 68 40 68"
              stroke={`url(#${uid})`} strokeWidth="14" strokeLinecap="round" />
      </g>

      {/* ── Metin + nokta — ikon ile 8px gap ── */}
      {showText && (
        <g transform="skewX(-10) translate(4 0)">
          <text x="108" y="76" fontSize="52"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
            letterSpacing="1">
            <tspan fontWeight="700" fill="#ffffff">PIVOT</tspan>
            <tspan fontWeight="300" fill="#94a3b8">RADAR</tspan>
          </text>
          {/* nokta: metnin hemen yanında, baseline'dan hafif yukarıda */}
          <circle cx="440" cy="68" r="7" fill="#22d3ee"
            style={{ filter: 'drop-shadow(0 0 6px #22d3ee) drop-shadow(0 0 12px #22d3ee)' }} />
        </g>
      )}
    </svg>
  );
}
