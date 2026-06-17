import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/shared/utils/cn';

export function LiveFeedStrip({ results, onSelect }) {
  const navigate = useNavigate();
  
  const top = useMemo(() => {
    if (!results.length) return [];
    return [...results]
      .sort((a, b) => (b.yzdsh || 0) - (a.yzdsh || 0))
      .slice(0, 14)
      .map(r => ({
        sym: (r.symbol || r.Sembol || '').replace('.IS', '').trim(),
        qrs: Math.round(r.yzdsh || 0),
        chg: Number(r.change_pct || 0),
      }))
      .filter(r => r.sym);
  }, [results]);

  if (!top.length) return null;

  // Duplicate for seamless loop
  const items = [...top, ...top];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-[#080a10]/60 backdrop-blur-sm h-9 flex items-center"
      style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)' }}>
      <div className="flex items-center gap-0 animate-marquee whitespace-nowrap">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={() => navigate(`/terminal/${item.sym}`)}
            className="flex items-center gap-2 px-4 hover:bg-white/[0.04] transition-colors h-9 flex-shrink-0 group"
          >
            <span className="text-[9px] font-black text-white/50 group-hover:text-white/80 transition-colors tracking-wider">{item.sym}</span>
            <span className={cn(
              "text-[9px] font-black font-mono tabular-nums",
              item.qrs >= 85 ? "text-primary" : item.qrs >= 70 ? "text-cyan-400/80" : "text-white/30"
            )}>{item.qrs}</span>
            <span className={cn("text-[8px] font-bold tabular-nums", item.chg >= 0 ? "text-emerald-400/70" : "text-red-400/70")}>
              {item.chg >= 0 ? '+' : ''}{item.chg.toFixed(1)}%
            </span>
            <span className="w-px h-3 bg-white/[0.07] ml-2" />
          </button>
        ))}
      </div>
    </div>
  );
}
