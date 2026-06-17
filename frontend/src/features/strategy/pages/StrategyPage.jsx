import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  Target,
  Settings2,
  Sparkles,
  Info,
  ChevronRight,
  ShieldCheck,
  Loader2,
  HelpCircle,
  BarChart3,
  TrendingUp,
  Zap
} from 'lucide-react';
import { useScanStore } from '@/core/store/useScanStore';
import { api } from '@/core/api/client';
import AnalyzeOverlay from '../../scanner/components/AnalyzeOverlay';
import { cn } from '@/shared/utils/cn';
import { StrategyAssistant } from '../components/StrategyAssistant';
import { ProfileSelector } from '../components/ProfileSelector';
import { FilterControls } from '../components/FilterControls';
import { PageBanner } from '@/shared/components/PageBanner';

export function StrategyPage() {
  const {
    profile, setProfile,
    expertMode, setExpertMode,
    prefilterEnabled, setPrefilter,
    setResults, setCacheMeta, setAnalyzing,
    topN
  } = useScanStore();
  
  const navigate = useNavigate();
  const [isSaved, setIsSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);

  // React Hook Form initialization
  const methods = useForm({
    defaultValues: {
      volThreshold: 500000,
      rsiThreshold: 30,
      prefilterEnabled: false,
      profile: profile || 'Dengeli',
      trendFilter: true,
      volBlast: 1.2,
      rsiPeriod: 14,
      signalMultiplier: 1.0,
      topN: 100
    }
  });

  const { watch, setValue, handleSubmit } = methods;
  const currentProfile = watch('profile');

  const onProfileSelect = (id) => {
    setValue('profile', id);
    setProfile(id);
  };

  const handleAssistantComplete = (result) => {
    onProfileSelect(result);
    setIsAssistantOpen(false);
  };

  const MIN_ANIMATE_MS = 3200; // minimum overlay görüntüleme süresi

  const onSubmit = async (data) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setAnalyzeError(null);

    const startTime = Date.now();

    // Overlay + store animasyonunu başlat
    setAnalyzing(true, 0);
    let prog = 0;
    const timer = setInterval(() => {
      prog = Math.min(prog + 2.5, 92);
      setAnalyzing(true, prog);
    }, 80);

    try {
      const overrides = expertMode
        ? { trendFilter: data.trendFilter, volBlast: data.volBlast, rsiMin: data.rsiThreshold }
        : null;

      // Profil tercihini hesaba kaydet (arka planda, bloklamadan)
      api.saveSettings({ profile_name: data.profile, topN: Number(topN) || 100 }).catch(() => {});

      const [res] = await Promise.all([
        api.analyzeResults(data.profile, Number(topN) || 100, overrides),
        new Promise(r => setTimeout(r, MIN_ANIMATE_MS)),
      ]);

      clearInterval(timer);
      setAnalyzing(true, 100);

      if (res.results?.length) {
        setResults(res.results);
        if (res.cache_meta) {
          setCacheMeta(res.cache_meta.age_minutes, res.cache_meta.symbol_count, res.cache_meta.data_age_hours, res.cache_meta.data_date);
        }
      }

      // Kısa "tamamlandı" anı
      await new Promise(r => setTimeout(r, 600));
      setAnalyzing(false, 0);
      navigate('/terminal');
    } catch (err) {
      clearInterval(timer);
      setAnalyzing(false, 0);
      setAnalyzeError('Analiz başlatılamadı. Lütfen tekrar deneyin.');
      setIsSubmitting(false);
    }
  };

  const isAnalyzing = useScanStore(s => s.isAnalyzing);
  const analyzeProgress = useScanStore(s => s.analyzeProgress);

  return (
    <FormProvider {...methods}>
      {/* Analiz overlay — isAnalyzing true olduğunda tüm ekranı kaplar */}
      <AnalyzeOverlay isOpen={isAnalyzing} profile={currentProfile} analyzeProgress={analyzeProgress} />

      <div className="space-y-8 sm:space-y-12">
        {analyzeError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <span className="material-icons text-base">wifi_off</span>
            {analyzeError}
          </div>
        )}
        {/* Assistant Modal via Portal - Forced Centering */}
        {createPortal(
          <AnimatePresence>
            {isAssistantOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-[#090b0f] flex items-center justify-center p-4 md:p-8 h-screen w-screen"
                style={{ top: 0, left: 0 }}
              >
                <div className="absolute inset-0 bg-[#111520] backdrop-blur-xl opacity-95" onClick={() => setIsAssistantOpen(false)} />
                <motion.div 
                  initial={{ scale: 0.9, y: 20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.9, y: 20, opacity: 0 }}
                  className="max-w-4xl w-full relative z-10"
                >
                  <StrategyAssistant 
                    onComplete={handleAssistantComplete} 
                    onClose={() => setIsAssistantOpen(false)} 
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* Toast Notification */}
        <AnimatePresence>
          {isSaved && (
            <motion.div 
              initial={{ opacity: 0, y: -20, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-24 right-8 z-[200]"
            >
              <div className="bg-primary text-[#003d42] px-8 py-5 rounded-3xl shadow-[0_20px_80px_rgba(34,211,238,0.5)] flex items-center gap-6 border border-white/20 ring-1 ring-primary/20">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse">
                  <Rocket strokeWidth={3} size={24} aria-hidden="true" />
                </div>
                <div>
                  <div className="font-black text-lg tracking-tight uppercase">ANALİZ TAMAMLANDI</div>
                  <div className="text-[10px] opacity-80 uppercase tracking-widest font-black text-on-primary/60">SONUÇLAR YÜKLENİYOR...</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── HEADER ── */}
        <PageBanner
          tag="Strateji Motoru"
          title="Algoritmik"
          accent="Yapılandırma"
          description="Piyasa tarama karakteristiğini belirleyerek analizi kişiselleştirin."
          color="cyan"
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => setIsAssistantOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}
              >
                <HelpCircle size={13} style={{ color: 'rgba(34,211,238,0.5)' }} />
                Kararsız mısınız?
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: expertMode ? '#22d3ee' : 'rgba(255,255,255,0.2)' }}>
                  {expertMode ? 'Expert Mod' : 'Standart Mod'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={expertMode}
                  aria-label="Expert modu aktifleştir"
                  onClick={() => { setExpertMode(!expertMode); setValue('expertMode', !expertMode); }}
                  style={{ width: 36, height: 20, borderRadius: 99, position: 'relative', background: expertMode ? 'rgba(34,211,238,0.25)' : 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0 }}
                >
                  <motion.div animate={{ x: expertMode ? 18 : 2 }} style={{ position: 'absolute', top: 2, left: 0, width: 16, height: 16, borderRadius: '50%', background: expertMode ? '#22d3ee' : 'rgba(255,255,255,0.3)' }} />
                </button>
              </div>
            </div>
          }
        />

        {/* ── MAIN CONTENT ── */}
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* PROFILE SELECTION */}
          {!expertMode && (
            <section aria-label="Profil Seçimi" className="xl:col-span-12 space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary" aria-hidden="true">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-on-surface leading-none">İŞLEM PROFİLİ SEÇİMİ</h2>
                  <span className="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">ALGORİTMA ÇALIŞMA KARAKTERİSTİĞİ</span>
                </div>
              </div>
              <ProfileSelector selectedProfile={currentProfile} onSelect={onProfileSelect} />
            </section>
          )}

          {/* CONFIGURATION SECTION — Conditional Visibility */}
          {expertMode && (
            <section 
              aria-label="Filtre Yapılandırması" 
              className="xl:col-span-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-tertiary/10 flex items-center justify-center text-tertiary" aria-hidden="true">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-on-surface leading-none">
                    MANUEL YAPILANDIRMA
                  </h2>
                  <span className="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">Gelişmiş Analiz Parametreleri</span>
                </div>
              </div>
  
              <div className="relative p-8 rounded-[2.5rem] border border-primary/15 bg-[#111520] backdrop-blur-xl shadow-2xl overflow-hidden transition-all hover:border-primary/20">
                 <div className="mb-8 p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-center gap-4 animate-in fade-in duration-500">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                       <Settings2 size={20} />
                    </div>
                    <div>
                       <p className="text-[11px] font-black text-primary uppercase tracking-widest">Expert Yapılandırma Aktif</p>
                       <p className="text-[10px] text-on-surface-variant/60 font-medium">Tüm filtre eşikleri manuel kontrolde. En iyi sonuçlar için hassas ayar yapın.</p>
                    </div>
                 </div>
                 <FilterControls expertMode={expertMode} />
              </div>
            </section>
          )}

          {/* Floating Action Button (FAB) via Portal — Restoration & Click Fix */}
          {createPortal(
            <AnimatePresence>
              <motion.button
                key="fab-scan"
                type="button"
                onClick={() => handleSubmit(onSubmit)()}
                disabled={isSubmitting}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                whileHover={!isSubmitting ? { scale: 1.04, y: -2 } : {}}
                whileTap={!isSubmitting ? { scale: 0.96 } : {}}
                className={cn(
                  "fixed bottom-16 right-8 z-[9998] flex items-center gap-3 px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-[13px] transition-all shadow-[0_16px_40px_rgba(34,211,238,0.25)] border overflow-hidden",
                  isSubmitting
                    ? "bg-[#141820] border-primary/20 text-primary/50 cursor-not-allowed"
                    : "bg-primary text-on-primary border-primary hover:shadow-[0_20px_50px_rgba(34,211,238,0.4)]"
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                {isSubmitting
                  ? <Loader2 className="animate-spin shrink-0" size={18} />
                  : <Zap size={18} className="shrink-0" />
                }
                <span>{isSubmitting ? 'Analiz ediliyor...' : 'Analiz Et'}</span>
                {!isSubmitting && <span className="w-1.5 h-1.5 rounded-full bg-on-primary/60 animate-ping absolute -top-1 -right-1" />}
              </motion.button>
            </AnimatePresence>,
            document.body
          )}

          {/* Spacer to avoid content being hidden under FAB footer area */}
          <div className="xl:col-span-12 h-40" />
        </form>
      </div>
    </FormProvider>
  );
}
