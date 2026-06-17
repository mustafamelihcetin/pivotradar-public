import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Radar } from 'lucide-react';

const ANALYZE_STAGES = [
  { max: 45,  label: 'Veri taraması bekleniyor...',         sub: 'Piyasa verileri çekiliyor' },
  { max: 68,  label: 'Teknik göstergeler hesaplanıyor...', sub: 'RSI · EMA · MACD · Bollinger' },
  { max: 85,  label: 'ML modeli çalıştırılıyor...',        sub: 'PRISM ML Analiz Motoru' },
  { max: 95,  label: 'QRS skorları üretiliyor...',         sub: 'Tam evren taraması' },
  { max: 100, label: 'Sonuçlar derleniyor...',             sub: 'Sıralama & filtreleme' },
];

export function ScanningBar({ scanning, scanProgress, isAnalyze, analyzeProgress, profile }) {
  const bgScanPct  = Math.max(0, scanProgress || 0);
  const analyzePct = Math.max(0, analyzeProgress || 0);
  const isVisible  = scanning || isAnalyze;
  const pct        = isAnalyze ? analyzePct : bgScanPct;

  const stage = isAnalyze
    ? ANALYZE_STAGES.find(s => analyzePct <= s.max) ?? ANALYZE_STAGES[ANALYZE_STAGES.length - 1]
    : null;

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="scan-bar"
          initial={{ opacity: 0, y: 40, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="fixed bottom-20 md:bottom-24 left-1/2 z-[8500] w-full max-w-[480px] px-4 pointer-events-auto"
        >
          <div className="bg-[#07090e]/95 border border-primary/20 rounded-2xl overflow-hidden backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.7),_0_0_0_1px_rgba(34,211,238,0.06)]">
            <div className="h-[2px] bg-white/5 w-full">
              <motion.div
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: 'linear' }}
                className="h-full bg-gradient-to-r from-primary to-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
              />
            </div>
            <div className="flex items-center gap-4 p-4">
              <div className="relative flex-shrink-0">
                <motion.div animate={{ scale: [1, 1.8, 1], opacity: [0.25, 0, 0.25] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 rounded-full border border-primary/40" />
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Radar size={20} className="text-primary" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1">
                  {isAnalyze ? 'PRISM Analiz Motoru' : 'QL-7 Arka Plan Veri Senkronizasyonu'}
                </p>
                <div className="flex items-center gap-2">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={stage?.label || 'bg'}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: [1, 0.5, 1] }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-xs font-black text-white"
                    >
                      {isAnalyze 
                        ? (analyzeProgress < 30 ? `${profile} stratejisi analiz ediliyor...` : stage?.label) 
                        : 'Arka plan senkronizasyonu aktif...'}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-xs font-mono font-bold text-primary">{Math.round(pct)}%</span>
                </div>
                {isAnalyze && stage?.sub && (
                  <p className="text-[9px] text-white/25 mt-0.5 font-mono truncate">{stage.sub}</p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
