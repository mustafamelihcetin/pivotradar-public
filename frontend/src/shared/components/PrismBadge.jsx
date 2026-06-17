import React from 'react';
import { motion } from 'framer-motion';

export function PrismBadge({ className = '', variant = 'default' }) {
  if (variant === 'small') {
    return (
      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-primary/20 bg-primary/5 backdrop-blur-md shadow-[inset_0_0_10px_rgba(34,211,238,0.05)] ${className}`}>
        <div className="flex gap-[1px]">
          <div className="w-[3px] h-[3px] rounded-full bg-primary/40" />
          <div className="w-[3px] h-[3px] rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
        </div>
        <span className="text-[9px] font-black tracking-[0.2em] text-primary/80 uppercase">
          PRISM CORE
        </span>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      className={`inline-flex flex-col items-center gap-2 ${className}`}
    >
      <div className="flex items-center gap-4">
        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-primary/40 to-primary/10" />
        <div className="flex flex-col items-center">
           <span className="text-[10px] font-black tracking-[0.5em] text-white/30 mb-0.5">NEURAL ARCHITECTURE</span>
           <span className="text-[14px] font-black tracking-[0.4em] text-transparent bg-clip-text bg-gradient-to-r from-white via-primary to-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">PRISM ENGINE</span>
        </div>
        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent via-primary/40 to-primary/10" />
      </div>
      <div className="px-3 py-0.5 rounded-full border border-white/5 bg-white/[0.02] text-[8px] font-mono tracking-[0.3em] text-white/20 backdrop-blur-sm">
        ANALYTICAL RESEARCH PROTOCOL ACTIVE
      </div>
    </motion.div>
  );
}
