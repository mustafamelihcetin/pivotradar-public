import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CheckCircle, HelpCircle, Lock, Info, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { notify } from '@/shared/components/ToastNotifier';
import { WizardModal } from './WizardModal';
import { DEFAULT_PROFILES } from './constants';
import { useScanStore } from '@/core/store/useScanStore';

export function ControlHeader({
  profile,
  setProfile,
  isAnalyzing,
  isGuest,
  profiles: profilesProp
}) {
  const profiles = profilesProp || DEFAULT_PROFILES;
  const [open, setOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const ref = useRef(null);
  const profileColor = profiles.find(p => p.name === profile)?.color || '#22d3ee';
  const lastAnalyzeTs = useScanStore(s => s.lastAnalyzeTs);

  const lastAnalyzeLabel = lastAnalyzeTs
    ? new Date(lastAnalyzeTs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : null;

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 relative z-50">

        {/* ── Son analiz saati / analyzing spinner ── */}
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-[10px] font-mono whitespace-nowrap",
          isAnalyzing
            ? "border-white/10 bg-white/[0.03] text-white/40"
            : "border-white/[0.06] bg-white/[0.02] text-white/30"
        )}>
          <RefreshCw size={11} className={isAnalyzing ? "animate-spin text-primary/60" : "text-white/20"} />
          {isAnalyzing
            ? <span>Analiz...</span>
            : lastAnalyzeLabel
              ? <span>Son: {lastAnalyzeLabel}</span>
              : <span>Yükleniyor...</span>
          }
        </div>

        {/* ── Profile Dropdown ── */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => !isAnalyzing && setOpen(!open)}
            aria-label="Strateji profili seç"
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={isAnalyzing}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
            title={isAnalyzing ? 'Analiz devam ediyor, bekleyin...' : undefined}
            className={cn(
              "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all",
              isAnalyzing
                ? "border-white/[0.04] bg-white/[0.01] opacity-50 cursor-not-allowed"
                : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer"
            )}
          >
            <div className="flex flex-col items-start mr-1">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25 leading-none mb-0.5 whitespace-nowrap">STRATEJİ PROFİLİ</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-white leading-none">{profile}</span>
              </div>
            </div>
            <ChevronDown size={12} className={cn("text-white/30 transition-transform ml-1", open && "rotate-180")} />
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-60 bg-[#0b0e15] border border-white/[0.08] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] z-[100]"
              >
                <div className="p-2 flex flex-col gap-0.5">
                  {profiles.map(p => {
                    const isLocked = isGuest && p.name !== 'Güvenli Liman';
                    return (
                      <button key={p.name}
                        onClick={isLocked ? () => notify("Özel stratejiler için ücretsiz üye olmalısın.", "info") : () => { setProfile(p.name); setOpen(false); }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all relative overflow-hidden",
                          profile === p.name ? "bg-white/[0.05]" : "hover:bg-white/[0.03]",
                          isLocked && "opacity-60 cursor-help"
                        )}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 shadow-[0_0_6px_currentColor]" style={{ backgroundColor: p.color, color: p.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                             <span className="block text-[11px] font-black text-white/90">{p.name}</span>
                             {isLocked && <Info size={10} className="text-white/20" />}
                          </div>
                          <span className="block text-[9px] text-white/25 truncate">{p.desc}</span>
                        </div>
                        {profile === p.name ? (
                          <CheckCircle size={13} className="text-primary/70 flex-shrink-0" />
                        ) : isLocked ? (
                          <div className="w-6 h-6 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-center">
                             <Lock size={10} className="text-white/20" />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                  <div className="mx-2 mt-1 mb-1.5 border-t border-white/[0.05]" />
                  <button
                    onClick={() => { setWizardOpen(true); setOpen(false); }}
                    className="flex items-center justify-center gap-2 py-2.5 bg-primary/[0.07] hover:bg-primary/[0.12] text-primary rounded-xl transition-all font-black text-[10px] uppercase tracking-widest border border-primary/20"
                  >
                    <HelpCircle size={13} /> Kararsızım, Yardım Et
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>


      </div>

      <WizardModal 
        isOpen={wizardOpen} 
        onClose={() => setWizardOpen(false)} 
        onApply={setProfile} 
        profiles={profiles}
      />
    </>
  );
}
