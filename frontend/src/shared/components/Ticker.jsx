import React, { memo, useMemo, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../core/api/client';
import { cn } from '@/shared/utils/cn';

// Yön bazlı flash renkleri
const FLASH_UP = '#22d3ee'; // cyan — artış
const FLASH_DOWN = '#f87171'; // red  — düşüş

/**
 * Değer değiştiğinde yön bazlı renk flash'ı uygular.
 * direction: 'up' | 'down' | 'neutral'
 */
const AnimatedValue = ({ children, value, direction, className }) => {
  const flashColor = direction === 'up' ? FLASH_UP : direction === 'down' ? FLASH_DOWN : '#ffffff';
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={value}
        initial={false}
        animate={{ color: ['#ffffff00', 'inherit'] }}
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={cn("transition-colors duration-500", className)}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
};

const TickerItem = memo(({ item }) => {
  const isUp = item.change > 0;
  const isDown = item.change < 0;
  const direction = isUp ? 'up' : isDown ? 'down' : 'neutral';

  const prevValueRef = useRef(item.value);
  const valueDirection = item.value > prevValueRef.current ? 'up'
    : item.value < prevValueRef.current ? 'down' : direction;
  prevValueRef.current = item.value;

  return (
    <div className="flex items-center gap-4 px-8 h-full border-r border-outline-variant/10 cursor-default">
      <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black drop-shadow-sm">
        {item.symbol}
      </span>

      <AnimatedValue
        value={item.value}
        direction={valueDirection}
        className="text-[11px] font-mono font-black text-on-surface drop-shadow-sm"
      >
        {Number(item.value) === 0
          ? '—'
          : Number(item.value).toLocaleString('tr-TR', {
            minimumFractionDigits: item.value < 100 ? 3 : 2,
            maximumFractionDigits: item.value < 100 ? 4 : 2,
          })}
      </AnimatedValue>

      <div className={cn(
        'flex items-center gap-1 font-mono font-bold text-[9px] drop-shadow-sm',
        isUp ? 'text-primary' : isDown ? 'text-error' : 'text-on-surface-variant'
      )}>
        <span>{isUp ? '▲' : isDown ? '▼' : '—'}</span>
        <AnimatedValue value={item.change} direction={direction}>
          {Number(item.change) === 0
            ? '%0.00'
            : `${isUp ? '+' : ''}${Number(item.change).toFixed(2)}%`}
        </AnimatedValue>
      </div>
    </div>
  );
});

const TickerBranding = memo(() => (
  <div className="flex items-center gap-2.5 px-8 shrink-0 group">
    <div style={{ width: 13, height: 13, flexShrink: 0, transform: 'skewX(-8deg)', filter: 'drop-shadow(0 0 3px rgba(34,211,238,0.45))', opacity: 0.55, transition: 'opacity 0.2s' }} className="group-hover:!opacity-80">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
        <defs><linearGradient id="tkG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a5f3fc"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
        <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#tkG)"/>
        <rect x="32" y="10" width="4" height="20" rx="2" fill="url(#tkG)"/>
        <rect x="32" y="70" width="4" height="20" rx="2" fill="url(#tkG)"/>
        <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#tkG)" strokeWidth="14" strokeLinecap="round" fill="none"/>
      </svg>
    </div>
    <div className="flex items-center" style={{ transform: 'skewX(-8deg)' }}>
      <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/25 group-hover:text-white/45 transition-colors">PIVOT</span>
      <span className="text-[9px] font-light uppercase tracking-[0.28em] text-white/10 group-hover:text-white/25 transition-colors">RADAR</span>
    </div>
  </div>
));

export default function Ticker() {
  const { data: rawData, isLoading } = useQuery({
    queryKey: ['ticker'],
    queryFn: api.ticker,
    refetchInterval: 90_000,
    staleTime: 85_000,
    placeholderData: keepPreviousData,
  });

  const items = useMemo(() => rawData?.data || [], [rawData]);

  const market = rawData?.market || { status: 'UNKNOWN' };

  // İlk yüklemede (henüz hiç veri yok) skeleton göster
  if (isLoading && items.length === 0) {
    return (
      <div className="h-full flex items-center px-8 gap-12 opacity-30">
        {['BTC/TRY', 'ETH/TRY', 'BIST 100', 'DOLAR', 'EURO', 'ALTIN', 'GÜMÜŞ'].map(s => (
          <div key={s} className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">{s}</span>
            <span className="text-[11px] font-mono font-black text-on-surface/40">— — —</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex items-center overflow-hidden relative ticker-container group">
      {/* Market Status Indicator */}
      <div className="absolute right-0 top-0 bottom-0 z-10 bg-[#05070a]/90 backdrop-blur-md px-3 flex items-center gap-2 border-l border-white/5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <div className={cn(
          "w-1.5 h-1.5 rounded-full",
          market.status === 'OPEN' ? 'bg-primary animate-pulse' :
            market.status === 'PRE-MARKET' ? 'bg-orange-400' : 'bg-white/20'
        )} />
        <span className="text-[8px] font-bold uppercase tracking-widest text-white/40">
          {market.message || 'PİYASA DURUMU'}
        </span>
      </div>

      <div className="animate-marquee flex items-center h-full whitespace-nowrap">
        {/* Set 1 */}
        <div className="flex items-center h-full">
          <TickerBranding />
          {items.map((item, idx) => <TickerItem key={`a-${item.symbol}-${idx}`} item={item} />)}
        </div>
        {/* Set 2 (Duplicate for seamless loop) */}
        <div className="flex items-center h-full">
          <TickerBranding />
          {items.map((item, idx) => <TickerItem key={`b-${item.symbol}-${idx}`} item={item} />)}
        </div>
      </div>
    </div>
  );
}
