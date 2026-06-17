import React, { useState } from 'react';

const PALETTE = [
  { bg: '#0b2d3d', text: '#22d3ee' },
  { bg: '#0d2e1a', text: '#34d399' },
  { bg: '#2e1a0d', text: '#fb923c' },
  { bg: '#2e0d1a', text: '#f87171' },
  { bg: '#1e1030', text: '#a78bfa' },
  { bg: '#2e2508', text: '#fbbf24' },
  { bg: '#0d1e30', text: '#60a5fa' },
  { bg: '#10082e', text: '#818cf8' },
  { bg: '#1a2e0d', text: '#86efac' },
  { bg: '#2e0d2e', text: '#e879f9' },
];

function hashTicker(ticker) {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) {
    h = (Math.imul(31, h) + ticker.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const SIZE_MAP = {
  xs:  { box: 18, font: 7,  radius: 5 },
  sm:  { box: 22, font: 8,  radius: 6 },
  md:  { box: 28, font: 9,  radius: 7 },
  lg:  { box: 36, font: 11, radius: 9 },
  xl:  { box: 44, font: 13, radius: 11 },
};

// Sayfa açılır açılmaz ilk N ticker'ın logosunu preload et
const _preloaded = new Set();
export function preloadLogos(tickers) {
  if (typeof window === 'undefined') return;
  tickers.slice(0, 50).forEach(ticker => {
    const clean = (ticker || '').replace('.IS', '').toUpperCase().trim();
    if (!clean || _preloaded.has(clean)) return;
    _preloaded.add(clean);
    const link = document.createElement('link');
    link.rel  = 'preload';
    link.as   = 'image';
    link.href = `/logos/${clean}.webp`;
    document.head.appendChild(link);
  });
}

export function TickerLogo({ ticker, size = 'sm', className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  const dim    = SIZE_MAP[size] || SIZE_MAP.sm;
  const clean  = (ticker || '').replace('.IS', '').toUpperCase().trim();
  const initials = clean.slice(0, 2);
  const color  = PALETTE[hashTicker(clean) % PALETTE.length];

  const sharedStyle = {
    width:    dim.box,
    height:   dim.box,
    minWidth: dim.box,
    borderRadius: dim.radius,
    flexShrink: 0,
  };

  if (!failed && clean) {
    return (
      <img
        src={`/logos/${clean}.webp`}
        alt={clean}
        className={className}
        loading={eager ? 'eager' : 'lazy'}
        fetchpriority={eager ? 'high' : 'auto'}
        decoding="async"
        width={dim.box}
        height={dim.box}
        style={{ ...sharedStyle, objectFit: 'contain', background: 'transparent' }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        ...sharedStyle,
        background: color.bg,
        border: `1px solid ${color.text}22`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontWeight: 900,
        fontSize: dim.font,
        color: color.text,
        letterSpacing: '-0.02em',
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );
}
