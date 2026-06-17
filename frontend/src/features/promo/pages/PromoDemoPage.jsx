import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion';
import { useScanStore } from '@/core/store/useScanStore';
import { BrandLogo } from '@/shared/components/BrandLogo';
import SystemFlow from '@/features/scanner/components/SystemFlow';
import { cn } from '@/shared/utils/cn';
import { TrendingUp, ArrowUpRight, Zap, Search, Binary, Database, Info } from 'lucide-react';

const COPY = [
  { 
    title: 'HAM VERİ AKIŞI', 
    highlight: 'MATEMATİĞE DÖNÜŞÜR',
    sub: 'Borsa İstanbul verisini milisaniyeler içinde işleme alıyoruz.'
  },
  { 
    title: 'OTONOM ANALİZ', 
    highlight: 'MİMARİSİ',
    sub: '540+ varlık, PRISM otonom kural motoruyla saniyeler içinde taranır.'
  },
  { 
    title: 'VERİDEN SİNYALE', 
    highlight: 'DÖNÜŞÜM',
    sub: 'Sayısal gürültü ayıklanır, geriye sadece kurumsal fırsatlar kalır.'
  },
  { 
    title: 'BİST ANALİZİNDE', 
    highlight: 'YENİ STANDART',
    sub: 'PivotRadar: Sayısal analiz süreçlerindeki otonom partneriniz.'
  }
];

const MOCK_RESULTS = [
  { s: 'THYAO', score: 9.64, trend: '+4.2%', tag: 'YÜKSEK GÜVEN' },
  { s: 'GARAN', score: 8.92, trend: '+2.1%', tag: 'MOMENTUM' },
  { s: 'SISE', score: 8.45, trend: '+1.8%', tag: 'TREND DÖNÜŞÜ' },
  { s: 'TUPRS', score: 8.12, trend: '+0.9%', tag: 'DESTEK BÖLGESİ' },
];

export default function PromoDemoPage() {
  const store = useScanStore();
  const progress = useMotionValue(0);
  const [activeStage, setActiveStage] = useState(0);

  useAnimationFrame((time) => {
    const loopTime = 30000; 
    const p = (time % loopTime) / loopTime;
    progress.set(p);

    let currentS = 0;
    if (p < 0.2) currentS = 0;
    else if (p < 0.45) currentS = 1;
    else if (p < 0.8) currentS = 2;
    else currentS = 3;

    if (currentS !== activeStage) setActiveStage(currentS);

    if (currentS === 1) {
       const pipelineP = ((p - 0.2) / 0.25); 
       if (pipelineP < 0.4) {
          store.setScanning(true);
          store.setScanStage(pipelineP < 0.2 ? 'KAYNAK' : 'İŞLEME', pipelineP * 250);
       } else {
          store.setScanning(false);
          store.setScanStage('TAMAMLANDI', 100);
          store.setAnalyzing(true, ((pipelineP - 0.4) / 0.6) * 100);
       }
    } else if (currentS === 2) {
       store.setScanning(false);
       store.setAnalyzing(true, 100);
    } else {
       store.setScanning(false);
       store.setAnalyzing(false, 0);
    }
  });

  return (
    <div className="fixed inset-0 bg-[#010308] text-white overflow-hidden font-sans select-none touch-none">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.06),transparent_80%)]" />
      
      {/* ── GLOBAL HUD ── */}
      <div className="absolute top-12 left-12 z-[100] opacity-30 flex items-center gap-3">
         <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
         <span className="text-[10px] font-mono font-black tracking-[0.5em] uppercase">PIPELINE_STATUS // TRANSFORM_ACTIVE</span>
      </div>

      {/* ── YTD DISCLAIMER (SMALL & CLEAN) ── */}
      <div className="absolute top-[12vh] right-12 z-[100] opacity-20 flex items-center gap-2">
         <Info size={10} className="text-white" />
         <span className="text-[8px] font-bold tracking-widest uppercase">Yatırım tavsiyesi değildir (YTD).</span>
      </div>

      <motion.div 
         className="absolute inset-0 flex items-center justify-center will-change-transform"
         style={{ scale: useTransform(progress, [0, 0.2, 0.5, 0.8, 1], [1, 1.05, 0.98, 1.02, 1]) }}
      >
         <Scene active={activeStage === 0}>
            <div className="relative w-full h-full flex items-center justify-center">
               <RawDataCloud active={activeStage === 0} />
               <div className="relative z-20 flex flex-col items-center text-center">
                  <BrandLogo size="lg" />
                  <div className="mt-12">
                     <AnimatedText text={COPY[0].title} highlight={COPY[0].highlight} sub={COPY[0].sub} active={activeStage === 0} />
                  </div>
               </div>
            </div>
         </Scene>

         <Scene active={activeStage === 1}>
            <div className="flex flex-col items-center gap-16 scale-110 md:scale-125">
               <div className="bg-[#05070a]/60 backdrop-blur-3xl p-12 rounded-[4rem] border border-white/5 shadow-2xl relative">
                  <SystemFlow ghostMode={activeStage !== 1} />
               </div>
               <AnimatedText text={COPY[1].title} highlight={COPY[1].highlight} sub={COPY[1].sub} active={activeStage === 1} />
            </div>
         </Scene>

         <Scene active={activeStage === 2}>
            <div className="w-full h-full flex flex-col items-center justify-center px-10">
               <div className="max-w-7xl w-full flex flex-col gap-12 relative">
                  <AnimatedText text={COPY[2].title} highlight={COPY[2].highlight} sub={COPY[2].sub} active={activeStage === 2} />
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                     {MOCK_RESULTS.map((res, i) => (
                        <motion.div key={res.s} initial={{ opacity: 0, scale: 0.8, rotateX: 45 }} animate={activeStage === 2 ? { opacity: 1, scale: 1, rotateX: 0 } : {}} transition={{ delay: 0.8 + i * 0.1, duration: 0.8 }} className="p-10 bg-[#0c111d]/60 border border-white/5 rounded-[2.5rem] flex flex-col gap-6 relative overflow-hidden group hover:bg-white/[0.04] transition-all">
                           <div className="flex items-center justify-between">
                              <span className="text-3xl font-black italic text-white tracking-tighter uppercase">{res.s}</span>
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20"><ArrowUpRight size={16} className="text-primary" /></div>
                           </div>
                           <div className="pt-4 border-t border-white/5">
                              <div className="flex items-baseline gap-2">
                                 <span className="text-5xl font-mono font-bold text-white tracking-tighter">{res.score}</span>
                                 <span className="text-[10px] font-black text-primary uppercase tracking-widest">PRISM</span>
                              </div>
                           </div>
                           <div className="mt-4 px-4 py-2 bg-white/5 rounded-xl border border-white/5 text-center">
                              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none">{res.tag}</span>
                           </div>
                        </motion.div>
                     ))}
                  </div>
                  <motion.div initial={{ left: '-20%' }} animate={activeStage === 2 ? { left: '120%' } : { left: '-20%' }} transition={{ duration: 2, ease: "linear" }} className="absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-primary/20 to-transparent blur-3xl z-[-1] pointer-events-none" />
               </div>
            </div>
         </Scene>

         <Scene active={activeStage === 3}>
            <div className="flex flex-col items-center gap-20 text-center">
               <BrandLogo size="lg" />
               <AnimatedText text={COPY[3].title} highlight={COPY[3].highlight} sub={COPY[3].sub} active={activeStage === 3} />
               <div className="text-2xl font-black tracking-[0.4em] text-white/20 font-mono uppercase italic">PIVOT-RADAR.COM</div>
               <div className="opacity-10 text-[8px] font-bold uppercase tracking-[0.5em] mt-10">Yatırım tavsiyesi değildir • Pivot Radar</div>
            </div>
         </Scene>
      </motion.div>

      {/* ── CINEMATIC BARS ── */}
      <div className="fixed inset-0 pointer-events-none z-[100]">
         <div className="absolute top-0 inset-x-0 h-[10vh] bg-black border-b border-white/5 shadow-2xl" />
         <div className="absolute bottom-0 inset-x-0 h-[10vh] bg-black border-t border-white/5 shadow-2xl" />
         
         {/* Footer Disclaimer (very subtle) */}
         <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-20 text-[7px] font-bold text-white uppercase tracking-[0.5em] whitespace-nowrap">
            Yasal Uyarı: Veriler simülasyon amaçlıdır. Yatırım tavsiyesi değildir.
         </div>
      </div>
    </div>
  );
}

function RawDataCloud({ active }) {
   const symbols = ['AKBNK', 'EREGL', 'SISE', 'ASELS', 'BIMAS', 'KCHOL', 'THYAO', 'GARAN'];
   return (
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
         {[...Array(40)].map((_, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight }} animate={active ? { opacity: [0, 0.15, 0], x: [null, Math.random() * window.innerWidth], y: [null, Math.random() * window.innerHeight], scale: [0.5, 1, 0.5] } : { opacity: 0 }} transition={{ duration: 5 + Math.random() * 5, repeat: Infinity, delay: Math.random() * 2 }} className="absolute font-mono text-[10px] text-white/20 flex gap-2">
               <span className="font-black">{symbols[Math.floor(Math.random() * symbols.length)]}</span>
               <span>{ (Math.random() * 100).toFixed(2) }</span>
               <Binary size={10} className="opacity-40" />
            </motion.div>
         ))}
      </div>
   );
}

function Scene({ children, active }) {
   return (
      <div className={cn("absolute inset-0 flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] transform-gpu", active ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-95 blur-xl pointer-events-none")}>{children}</div>
   );
}

function AnimatedText({ text, highlight, sub, active }) {
   return (
      <div className="space-y-6">
         <h2 className="text-5xl md:text-8xl font-black italic tracking-tighter uppercase leading-[0.9]">
            <motion.span initial={{ opacity: 0, y: 30 }} animate={active ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.8, delay: 0.3 }} className="block text-white">{text}</motion.span>
            <motion.span initial={{ opacity: 0, y: 30 }} animate={active ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.8, delay: 0.6 }} className="text-primary block NOT-italic">{highlight}</motion.span>
         </h2>
         <motion.p initial={{ opacity: 0 }} animate={active ? { opacity: 0.4 } : {}} transition={{ duration: 0.8, delay: 1 }} className="text-sm md:text-xl font-medium tracking-wide max-w-2xl mx-auto px-6">{sub}</motion.p>
      </div>
   );
}
