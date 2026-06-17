import React from 'react';
import { motion } from 'framer-motion';

export const MalthenBadge = () => {
  return (
    <a 
      href="https://malthen.dev" 
      target="_blank" 
      rel="noopener noreferrer"
      className="inline-flex items-center gap-4 px-6 py-3 bg-[#07070f]/90 border border-white/10 rounded-full backdrop-blur-2xl transition-all duration-500 hover:border-cyan-400/30 hover:bg-[#0a0a19]/95 hover:shadow-[0_10px_50px_rgba(0,217,255,0.1),inset_0_0_15px_rgba(0,217,255,0.05)] group no-underline"
    >
      <div className="relative w-11 h-11 flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-105">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-2 border-transparent border-l-cyan-400 border-t-cyan-400 border-b-purple-500"
        />
        <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-[3px] h-2 bg-gradient-to-b from-cyan-400 to-purple-500 rounded-full" />
        <span className="text-[#ffffff] font-extrabold text-[19px] z-10 tracking-tighter font-jakarta">M</span>
      </div>
      
      <div className="flex flex-col justify-center leading-none">
        <span className="text-[9px] tracking-[0.35em] text-white/40 font-medium mb-1.5">SOFTWARE ENGINEERING</span>
        <span className="text-[18px] tracking-[2px] text-white font-extrabold font-outfit uppercase">MALTHEN.DEV</span>
      </div>
    </a>
  );
};
