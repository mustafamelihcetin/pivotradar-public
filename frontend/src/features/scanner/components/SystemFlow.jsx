import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Database, Cpu, Brain, BarChart3, Zap, 
  ShieldCheck
} from 'lucide-react';
import { useScanStore } from '../../../core/store/useScanStore';
import useAuthStore from '@/store/useAuthStore';
import { cn } from '@/shared/utils/cn';

const SCAN_GRACE_MS = 7000;

const STEPS = [
  { id: 'source',  label: 'KAYNAK',  icon: Database,  color: 'amber' },
  { id: 'process', label: 'İŞLEME',  icon: Cpu,       color: 'amber' },
  { id: 'analyze', label: 'ANALİZ',  icon: BarChart3, color: 'primary' },
  { id: 'ai',      label: 'ZEKA MERKEZİ', icon: Brain,     color: 'primary' },
];

function StepNode({ icon: Icon, label, state, color }) {
  const isPrimary = color === 'primary';
  const isActive = state === 'active';
  const isDone = state === 'done';
  const colorHex = isPrimary ? '#05D9E8' : '#fbbf24';
  
  return (
    <div className="flex flex-col items-center gap-2.5 relative">
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.4, 0], scale: [0.8, 1.4, 1.6] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute top-6 w-12 h-12 rounded-full border border-current blur-[2px] pointer-events-none"
            style={{ color: colorHex }}
          />
        )}
      </AnimatePresence>

      <motion.div
        whileHover={{ scale: 1.05 }}
        className={cn(
          "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all duration-700 relative z-10",
          "border-[0.5px] backdrop-blur-xl overflow-hidden",
          isActive 
            ? "bg-white/[0.03] border-current"
            : isDone
              ? "bg-white/[0.01] border-current opacity-60"
              : "bg-transparent border-white/5 opacity-20"
        )}
        style={{ color: (isActive || isDone) ? colorHex : 'rgba(255,255,255,0.1)' }}
      >
        {isActive && (
          <motion.div 
            animate={{ y: [-48, 48] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-transparent via-current to-transparent opacity-10"
          />
        )}
        
        {isDone ? (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
            <ShieldCheck size={18} strokeWidth={2.5} className="text-current" />
          </motion.div>
        ) : (
          <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className={cn("transition-colors", isActive ? "animate-pulse" : "")} />
        )}

        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-current opacity-40" />
        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-current opacity-40" />
      </motion.div>

      <div className="flex flex-col items-center gap-1">
        <span className={cn(
          "text-[9px] font-black font-mono tracking-[0.25em] transition-all duration-500",
          isActive ? "text-white" : isDone ? "opacity-60" : "opacity-10"
        )} style={{ color: (isActive || isDone) ? colorHex : '' }}>
          {label}
        </span>
        <div className={cn("h-[1px] transition-all duration-700", isActive ? "w-4" : "w-0")} style={{ backgroundColor: colorHex }} />
      </div>
    </div>
  );
}

function Connector({ done, color }) {
  const isPrimary = color === 'primary';
  const colorHex = isPrimary ? '#05D9E8' : '#fbbf24';
  
  return (
    <div className="flex-1 min-w-[20px] h-[1px] mb-8 relative opacity-20 group-hover:opacity-40 transition-opacity">
       <div className={cn("absolute inset-0 border-t transition-all duration-700", done ? "border-current" : "border-white/10")} style={{ color: done ? colorHex : '' }} />
       <AnimatePresence>
         {done && (
           <motion.div 
             initial={{ x: '-100%', opacity: 0 }} 
             animate={{ x: '100%', opacity: [0, 1, 0] }} 
             transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} 
             className="absolute inset-0 h-[1px]" 
             style={{ background: `linear-gradient(90deg, transparent, ${colorHex}, transparent)` }}
           />
         )}
       </AnimatePresence>
    </div>
  );
}

export default function SystemFlow() {
  const {
    setScanning, setScanStage, scanStage, scanning, scanStartedAt,
    isAnalyzing, analyzeProgress, cacheAge,
  } = useScanStore();
  const token = useAuthStore(s => s.token);
  const esRef = useRef(null);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!token) return;
    function connect() {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      const url = `/api/progress/stream`;
      const es = new EventSource(url, { withCredentials: false });
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Backend 5dk timeout'u — sessizce yeniden bağlan
          if (data?.state === 'STREAM_TIMEOUT') {
            es.close(); esRef.current = null; setTimeout(connect, 1000); return;
          }
          setProgress(data);
        } catch (_) {}
      };
      es.onerror = () => { es.close(); esRef.current = null; setTimeout(connect, 5000); };
    }
    connect();
    return () => { if (esRef.current) esRef.current.close(); };
  }, [token]);

  const pState = progress?.state;
  const isScanning = pState === 'SCANNING';
  const isQueued = pState === 'QUEUED';
  const isDone = pState === 'DONE';

  useEffect(() => {
    if (window.location.pathname === '/promo') return;
    if (!progress) return;
    if (isQueued) { setScanning(true); setScanStage('SIRA', 0); return; }
    if (isScanning) {
      setScanning(true); setScanStage((progress.stage || '').toUpperCase(), progress.percent || 0);
    } else if (isDone) {
      if (scanning) { setScanning(false); setScanStage('TAMAMLANDI', 100); }
    } else if (pState === 'FAILED') {
      setScanning(false); setScanStage('HATA', 0);
    } else {
      const elapsed = Date.now() - (scanStartedAt || 0);
      if (scanning && elapsed > SCAN_GRACE_MS) { setScanning(false); setScanStage('BEKLEMEDE', 0); }
    }
  }, [progress, isScanning, isDone, scanning, scanStartedAt, setScanning, setScanStage, isQueued, pState]);

  const ageLabel = (() => {
    if (cacheAge == null) return 'SİSTEM::SENKRON';
    const mins = Math.max(0, cacheAge);
    if (mins < 1) return 'VERİ::TAZE';
    if (mins < 60) return `${Math.round(mins)} DK ÖNCE`;
    const hrs = mins / 60;
    return hrs < 48 ? `${Math.round(hrs)} SAAT ÖNCE` : `${Math.round(hrs / 24)} GÜN ÖNCE`;
  })();

  const getStepState = (id) => {
    if (id === 'source' || id === 'process') {
       if (!scanning) return cacheAge != null ? 'done' : 'idle';
       const stage = (scanStage || '').toUpperCase();
       if (id === 'source') return (stage === 'SIRA' || stage === 'KAYNAK') ? 'active' : 'done';
       return (stage === 'TAMAMLANDI') ? 'done' : (stage && stage !== 'KAYNAK' && stage !== 'SIRA') ? 'active' : 'idle';
    }
    if (!isAnalyzing && analyzeProgress === 0) return 'idle';
    if (analyzeProgress >= 100) return 'done';
    const idx = id === 'analyze' ? 0 : 1;
    const next = (idx + 1) * 50, threshold = idx * 50;
    return analyzeProgress >= next ? 'done' : analyzeProgress >= threshold ? 'active' : 'idle';
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto p-1 group">
      <div className="relative bg-[#05070a] rounded-[2rem] border border-white/10 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5),inset_0_0_20px_rgba(255,255,255,0.02)]">
        <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.03]" 
          style={{ backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 2px, 3px 100%' }} 
        />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/[0.03] via-transparent to-transparent pointer-events-none z-40" />
        <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.01)_0%,transparent_70%)] pointer-events-none z-40" />
        <div className="absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] pointer-events-none z-40" />

        <div className="absolute top-4 left-6 z-50 flex items-center gap-4 opacity-20 select-none">
           <motion.span 
             animate={{ opacity: [0.15, 0.4, 0.15] }} 
             transition={{ duration: 4, repeat: Infinity }}
             className="text-[6px] font-mono font-black tracking-[0.4em] text-white uppercase"
           >
             Sektör::Alpha-7
           </motion.span>
           <div className="w-1 h-1 rounded-full bg-primary animate-ping" />
           <motion.span 
             animate={{ opacity: [0.15, 0.3, 0.15] }} 
             transition={{ duration: 5, repeat: Infinity, delay: 1 }}
             className="text-[6px] font-mono font-black tracking-[0.4em] text-white uppercase"
           >
             Hafıza::0x88FF
           </motion.span>
        </div>
        <div className="absolute top-4 right-6 z-50 opacity-20 select-none">
           <motion.span 
             animate={{ opacity: [0.15, 0.4, 0.15] }} 
             transition={{ duration: 6, repeat: Infinity, delay: 2 }}
             className="text-[6px] font-mono font-black tracking-[0.4em] text-white uppercase"
           >
             Koord::41.0082 / 28.9784
           </motion.span>
        </div>

        <div className="flex flex-col gap-4 sm:gap-8 relative z-10 p-4 sm:p-8 pt-10 sm:pt-12">
          <div className="flex items-center justify-between gap-1 px-1 sm:px-4 relative">
              <div className="absolute inset-x-0 -top-4 overflow-hidden h-4 opacity-[0.03] pointer-events-none">
                 <motion.div 
                   animate={{ x: isAnalyzing || scanning ? [-2000, 0] : [-1000, 0] }} 
                   transition={{ duration: isAnalyzing || scanning ? 10 : 30, repeat: Infinity, ease: 'linear' }} 
                   className="whitespace-nowrap text-[8px] font-mono font-black uppercase text-white tracking-[1.5em]"
                 >
                    {isAnalyzing ? "ANALİZ_SÜRECİ_AKTİF_010101" : scanning ? "VERİ_AKTARIMI_DEVAM_EDİYOR_010101" : "SİSTEM_BEKLEME_MODU_STABLE_000000"} 01010011 01011001 01010011 01010100 01000101 01001101
                 </motion.div>
              </div>

              {STEPS.map((s, i) => {
                const state = getStepState(s.id);
                return (
                  <React.Fragment key={s.id}>
                    <StepNode icon={s.icon} label={s.label} state={state} color={s.color} />
                    {i < STEPS.length - 1 && (
                      <React.Fragment>
                        {i === 1 ? (
                          <div className="flex-1 flex items-center justify-center mb-10 px-2 opacity-10">
                             <motion.div 
                               animate={{ x: [-2, 2, -2], opacity: [0.3, 1, 0.3] }} 
                               transition={{ duration: 4, repeat: Infinity }}
                               className="flex items-center gap-1 text-primary"
                             >
                               <Zap size={10} strokeWidth={3} />
                             </motion.div>
                          </div>
                        ) : (
                          <Connector done={state === 'done'} color={s.color} />
                        )}
                      </React.Fragment>
                    )}
                  </React.Fragment>
                );
              })}
          </div>

          <div className="pt-6 border-t border-white/[0.04] flex items-center justify-between px-4 relative">
             <div className="absolute top-0 left-0 w-4 h-[1px] bg-white/10" />
             <div className="absolute top-0 right-0 w-4 h-[1px] bg-white/10" />

             <div className="flex items-center gap-8">
                <div className="flex flex-col gap-1.5">
                   <div className="flex items-center gap-1">
                      <div className="w-[3px] h-[3px] bg-white/20 rotate-45" />
                      <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em]">SİSTEM_DURUMU</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-1 h-1 rounded-full",
                        isAnalyzing ? "bg-primary animate-pulse" : scanning ? "bg-amber-400 animate-pulse" : "bg-white/10"
                      )} />
                      <motion.span 
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className={cn(
                          "text-[10px] font-black font-mono tracking-[0.2em] transition-colors",
                          isAnalyzing ? "text-primary drop-shadow-[0_0_8px_rgba(5,217,232,0.4)]" : scanning ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" : "text-white/20"
                        )}
                      >
                        {isAnalyzing ? "İŞLEME::MERKEZ" : scanning ? "VERİ::SENKRON" : "SİSTEM::HAZIR"}
                      </motion.span>
                   </div>
                </div>

                <div className="hidden sm:flex flex-col gap-1.5 border-l border-white/5 pl-8">
                   <div className="flex items-center gap-1">
                      <div className="w-[3px] h-[3px] bg-white/20 rotate-45" />
                      <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em]">MODÜL_BİLGİSİ</span>
                   </div>
                   <motion.span 
                     animate={{ opacity: [0.3, 0.6, 0.3] }}
                     transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
                     className="text-[10px] font-black font-mono text-white/40 tracking-tight"
                   >
                      {isAnalyzing ? `GÖREV_YÜKÜ >> %${Math.round(analyzeProgress)}` : scanning ? `VERİ_AKIŞI >> AKTİF` : 'PRISM_MOTORU >> STABLE'}
                   </motion.span>
                </div>
             </div>

             <div className="flex flex-col items-end gap-1.5">
                <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.3em]">SENKRONİZASYON</span>
                <motion.span 
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 5, repeat: Infinity }}
                  className="text-[10px] font-black font-mono text-white/40 tabular-nums bg-white/[0.02] px-2 py-0.5 rounded-sm border border-white/5"
                >
                  {ageLabel}
                </motion.span>
             </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent z-50" />
      </div>
    </div>
  );
}
