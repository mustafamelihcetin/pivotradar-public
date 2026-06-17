import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Zap, Activity } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

/**
 * AmbientCanvas — 1:1 Pixel Match with TacticalHUD
 */
function AmbientCanvas() {
  const canvasRef = useRef(null);
  const rAF = useRef(null);
  const tick = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    const draw = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      tick.current += 1;
      const t = tick.current;

      ctx.clearRect(0, 0, W, H);
      
      // 1. Base dark background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // 4. Dot grid (Precise 30px spacing from TacticalHUD)
      ctx.fillStyle = 'rgba(34,211,238,0.035)';
      for (let x = 24; x < W; x += 30) {
        for (let y = 24; y < H; y += 30) {
          ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill();
        }
      }

      rAF.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (rAF.current) cancelAnimationFrame(rAF.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.96 }} />;
}

const SignalSegment = ({ card, index, onSelect }) => {
  const isUp = Number(card.change) >= 0;
  
  return (
    <div 
      onClick={() => onSelect(card.sym)}
      className={cn(
        "relative flex flex-col justify-between p-4 sm:p-5 group cursor-pointer transition-all duration-500",
        index < 2 ? "border-b border-white/[0.03]" : ""
      )}
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${index === 0 ? '#22d3ee' : index === 1 ? 'rgba(34,211,238,0.7)' : 'rgba(34,211,238,0.4)'}, transparent 70%)` }}
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className={cn(
                  "w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]",
                  index === 0 ? "text-primary bg-primary" : index === 1 ? "text-primary/70 bg-primary/70" : "text-primary/40 bg-primary/40"
                )}
              />
              <h4 className="text-[17px] font-black text-white tracking-tighter uppercase group-hover:text-primary transition-colors">{card.sym}</h4>
            </div>
            <div className={cn(
              "px-2 py-0.5 rounded text-[9px] font-black border w-fit",
              isUp ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-red-500/5 border-red-500/20 text-red-400"
            )}>
              {isUp ? '+' : ''}{card.change}%
            </div>
          </div>

          <div className="flex flex-col items-end">
             <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-2xl font-black font-mono leading-none tracking-tighter",
                  index === 0 ? "text-primary" : index === 1 ? "text-primary/70" : "text-primary/40"
                )}>
                  {card.score}
                </span>
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">QRS</span>
             </div>
             <div className="mt-1 text-[8px] font-black text-white/10 uppercase tracking-widest tabular-nums">
               RSI: <span className={cn(card.rsi > 70 ? "text-amber-400" : card.rsi < 35 ? "text-emerald-400" : "text-white/30")}>{card.rsi}</span>
             </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
           <span className="text-[11px] font-bold text-white/80 tabular-nums">₺{Number(card.price).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
           <div className="h-2.5 w-px bg-white/5" />
           <span className="text-[9px] font-bold text-white/20 uppercase">
             {card.volume >= 1e9 ? `${(card.volume/1e9).toFixed(1)} Milyar` : card.volume >= 1e6 ? `${(card.volume/1e6).toFixed(1)} Milyon` : card.volume >= 1e3 ? `${(card.volume/1e3).toFixed(0)} Bin` : card.volume} HACİM
           </span>
        </div>

        <div className="mt-auto">
           <div className="flex items-center gap-2 mb-2 opacity-20">
              <div className="h-px flex-1 bg-white" />
              <span className="text-[6px] font-black text-white uppercase tracking-[0.4em]">LIVE_AI</span>
              <div className="h-px flex-1 bg-white" />
           </div>
           <p className="text-[10px] font-medium text-white/40 leading-relaxed italic group-hover:text-white/70 transition-colors">
              "{card.desc}"
           </p>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0">
        <ArrowUpRight size={12} className={cn(index === 0 ? "text-primary" : index === 1 ? "text-primary/70" : "text-primary/40")} />
      </div>
    </div>
  );
};

export const TopSignalsHUD = ({ topSignals = [], onSelect }) => {
  if (!topSignals || topSignals.length === 0) {
    return (
      <div className="flex-1 min-h-[480px] bg-black relative overflow-hidden flex flex-col items-center justify-center gap-4">
        <AmbientCanvas />
        <Zap size={24} className="text-white/5 animate-pulse" />
        <span className="text-[10px] font-black text-white/10 uppercase tracking-[0.5em]">SYSTEM_BOOTING</span>
      </div>
    );
  }

  const [visibleIdx, setVisibleIdx] = React.useState(0);
  
  useEffect(() => {
    if (topSignals.length <= 3) return;
    const iv = setInterval(() => {
      setVisibleIdx(prev => (prev + 1) % topSignals.length);
    }, 8000);
    return () => clearInterval(iv);
  }, [topSignals.length]);

  const displayedSignals = React.useMemo(() => {
    if (topSignals.length <= 3) return topSignals;
    const result = [];
    for (let i = 0; i < 3; i++) {
      result.push(topSignals[(visibleIdx + i) % topSignals.length]);
    }
    return result;
  }, [topSignals, visibleIdx]);

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden transition-all duration-700 h-full">
      <div className="flex flex-col h-full relative z-10">
        <AnimatePresence mode="popLayout">
          {displayedSignals.map((card, i) => (
            <motion.div
              key={card.sym}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex-1"
            >
              <SignalSegment card={card} index={i} onSelect={onSelect} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
