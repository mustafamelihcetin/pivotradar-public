import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, ShieldCheck, Zap, Info, 
  Database, BrainCircuit, ShieldAlert, RotateCw,
  Activity, Cpu, Eye, Lock
} from 'lucide-react';

// --- Sahneye Özel Görsel Animasyon Bileşenleri ---

const IngestionVisual = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    {[...Array(12)].map((_, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, scale: 0.5, x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200 }}
        animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5], x: 0, y: 0 }}
        transition={{ repeat: Infinity, duration: 2, delay: i * 0.2 }}
        className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_cyan]"
      />
    ))}
    <motion.div animate={{ scale: [0.9, 1.1, 0.9] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-16 h-16 rounded-full border-2 border-cyan-500/30 flex items-center justify-center">
       <Database size={24} className="text-cyan-400" />
    </motion.div>
  </div>
);

const NeuralVisual = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 10, ease: "linear" }} className="absolute w-40 h-40 border border-dashed border-purple-500/20 rounded-full" />
    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="w-24 h-24 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
       <BrainCircuit size={40} className="text-purple-400 shadow-[0_0_15px_purple]" />
    </motion.div>
    {[...Array(4)].map((_, i) => (
      <motion.div key={i} animate={{ scale: [1, 2], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.5 }} className="absolute w-24 h-24 border border-purple-500/40 rounded-full" />
    ))}
  </div>
);

const VetoVisual = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-32 h-32 rounded-full border-4 border-amber-500/20 flex items-center justify-center">
       <ShieldAlert size={48} className="text-amber-400 shadow-[0_0_20px_amber]" />
    </motion.div>
    {[...Array(6)].map((_, i) => (
      <motion.div
        key={i}
        initial={{ x: 150, opacity: 0 }}
        animate={{ x: [150, 60, 150], opacity: [0, 1, 0] }}
        transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
        className="absolute w-2 h-2 rounded-full bg-red-500"
      />
    ))}
  </div>
);

const EvolutionVisual = () => (
  <div className="w-full h-full overflow-hidden flex flex-col items-center justify-center font-mono text-[8px] text-emerald-500/40">
    {[...Array(10)].map((_, i) => (
      <motion.div
        key={i}
        animate={{ y: [-20, 100] }}
        transition={{ repeat: Infinity, duration: 3, ease: "linear", delay: i * 0.3 }}
        className="whitespace-nowrap"
      >
        {Math.random().toString(16).repeat(3)}
      </motion.div>
    ))}
    <div className="absolute p-4 bg-black/80 border border-emerald-500/30 rounded-xl backdrop-blur-sm">
       <RotateCw size={32} className="text-emerald-400" />
    </div>
  </div>
);

// --- Sahne Tanımları ---

const SCENES = [
  {
    id: 'ingestion',
    visual: IngestionVisual,
    title: 'VERİ HASADI',
    desc: '300+ düğümden gelen ham veriler çapraz sorgulanarak "Temiz Veri Havuzu" oluşturuluyor.',
    color: 'cyan',
    stats: ['Latency: 12ms', 'Source: Hybrid']
  },
  {
    id: 'neural',
    visual: NeuralVisual,
    title: 'PRISM ANALİZ',
    desc: '80+ indikatör ve sinir ağları QRS skorunu belirlemek için eşzamanlı çalışıyor.',
    color: 'purple',
    stats: ['Threads: 128', 'Logic: Deep']
  },
  {
    id: 'veto',
    visual: VetoVisual,
    title: 'KRİZ KALKANI',
    desc: 'Yapay zeka veto algoritması, riskli piyasa koşullarında sinyalleri otomatik eliyor.',
    color: 'amber',
    stats: ['Status: Shielded', 'Veto: Active']
  },
  {
    id: 'evolution',
    visual: EvolutionVisual,
    title: 'OTONOM EVRİM',
    desc: 'Sistem her gece geçmişi analiz ederek kendi ağırlıklarını ve süzgeçlerini güncelliyor.',
    color: 'emerald',
    stats: ['State: Evolving', 'Epoch: 1024']
  }
];

export function StockSEOText({ symbol, data }) {
  const [activeScene, setActiveScene] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveScene((prev) => (prev + 1) % SCENES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  if (!symbol || !data) return null;
  const scene = SCENES[activeScene];

  return (
    <section className="mt-16 relative group">
      <div className="absolute -inset-4 bg-primary/5 rounded-[4rem] blur-3xl opacity-20" />
      
      <div className="relative p-12 rounded-[3rem] bg-[#05070a] border border-white/[0.05] shadow-2xl overflow-hidden min-h-[550px] flex flex-col">
        
        {/* Top HUD Bar */}
        <div className="flex items-center justify-between mb-10 border-b border-white/[0.05] pb-8">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
               <Activity size={28} className="text-primary animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white tracking-tighter uppercase italic">{symbol} NEURAL CORE</h3>
              <p className={`text-[10px] font-black tracking-[0.4em] uppercase transition-colors duration-500 ${
                  scene.color === 'cyan' ? 'text-cyan-400' :
                  scene.color === 'purple' ? 'text-purple-400' :
                  scene.color === 'amber' ? 'text-amber-400' :
                  'text-emerald-400'
                }`}>
                 System Phase: {scene.id}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {SCENES.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-700 ${i === activeScene ? 'w-10 bg-primary' : 'w-2 bg-white/10'}`} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 flex-1">
          
          {/* LEFT: THE SCREEN & CONTENT */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-white/[0.02] rounded-[2.5rem] p-8 border border-white/[0.03] relative overflow-hidden group/screen">
             
             {/* Scanline Effect */}
             <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none opacity-30" />

             {/* THE VISUAL SCREEN (SOLDAN GELEN EKRAN) */}
             <div className="h-64 rounded-3xl bg-black/40 border border-white/5 relative overflow-hidden shadow-inner">
                <AnimatePresence mode="wait">
                   <motion.div
                     key={scene.id}
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 1.1 }}
                     className="w-full h-full"
                   >
                      <scene.visual />
                   </motion.div>
                </AnimatePresence>
                {/* HUD Overlays on Screen */}
                <div className="absolute top-4 left-4 text-[8px] font-mono text-white/20 uppercase tracking-widest">
                   Live_Stream::PRISM_V4
                </div>
                <div className="absolute bottom-4 right-4 flex gap-1">
                   {[...Array(3)].map((_, i) => <div key={i} className="w-1 h-1 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: `${i*0.2}s` }} />)}
                </div>
             </div>

             {/* THE DESCRIPTION (EKRANIN YANINDAKI METİN) */}
             <div className="flex flex-col gap-6 relative z-10">
                <AnimatePresence mode="wait">
                   <motion.div
                     key={scene.id}
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -20 }}
                   >
                      <h4 className={`text-3xl font-black tracking-tighter uppercase italic mb-4 ${
                        scene.color === 'cyan' ? 'text-cyan-400' :
                        scene.color === 'purple' ? 'text-purple-400' :
                        scene.color === 'amber' ? 'text-amber-400' :
                        'text-emerald-400'
                      }`}>
                         {scene.title}
                      </h4>
                      <p className="text-lg text-white/60 font-medium leading-relaxed italic">
                         "{scene.desc}"
                      </p>
                      <div className="grid grid-cols-2 gap-3 mt-6">
                         {scene.stats.map((s, i) => (
                           <div key={i} className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-[10px] font-mono text-white/50">
                              {s}
                           </div>
                         ))}
                      </div>
                   </motion.div>
                </AnimatePresence>
             </div>
          </div>

          {/* RIGHT: PERSISTENT PANELS */}
          <div className="lg:col-span-4 flex flex-col gap-5">
             <div className="p-6 rounded-3xl bg-[#0a0d14] border border-white/[0.05] relative group/side hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                   <Lock size={16} className="text-primary/60" />
                   <span className="text-[10px] font-black text-primary/80 tracking-[0.2em] uppercase">Security</span>
                </div>
                <p className="text-[11px] text-white/30 leading-relaxed italic">
                   Rapor yatırım tavsiyesi değildir. PRISM-Deep algoritmik modelleme sonuçlarını içerir.
                </p>
             </div>
             
             <div className="p-6 rounded-3xl bg-[#0a0d14] border border-white/[0.05] relative group/side hover:border-amber-400/20 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                   <Cpu size={16} className="text-amber-400/60" />
                   <span className="text-[10px] font-black text-amber-400/80 tracking-[0.2em] uppercase">Methodology</span>
                </div>
                <p className="text-[11px] text-white/20 leading-relaxed font-medium">
                   80+ teknik indikatör ve otonom risk süzgeci katmanlarından oluşan hibrit mimari.
                </p>
             </div>

             <div className="mt-auto p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-between shadow-lg">
                <div className="flex flex-col">
                   <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">QRS VERDICT</span>
                   <span className="text-xl font-black text-white italic tracking-tighter">AUTHENTIC</span>
                </div>
                <div className="text-4xl font-black text-primary tracking-tighter drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">
                   {Math.round(data.yzdsh || 0)}
                </div>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}
