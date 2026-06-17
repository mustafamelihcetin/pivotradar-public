import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  HelpCircle,
  Zap,
  TrendingUp,
  ShieldCheck,
  Timer,
  BarChart3,
  Flame
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

const QUESTIONS = [
  {
    id: 'timeframe',
    title: 'Hangi zaman diliminde işlem yaparsınız?',
    description: 'Ekran başında ne kadar süre geçiriyorsunuz?',
    options: [
      { id: 'short', label: 'Çok Kısa (Scalping)', desc: 'Dakikalık ve saatlik hareketler', icon: Timer },
      { id: 'medium', label: 'Orta Vade (Swing)', desc: 'Günlük ve haftalık trendler', icon: TrendingUp },
      { id: 'long', label: 'Uzun Vade', desc: 'Aylık ve çeyreklik yatırımlar', icon: BarChart3 },
    ]
  },
  {
    id: 'risk',
    title: 'Risk toleransınız nedir?',
    description: 'Anlık fiyat dalgalanmalarına karşı ne kadar sabırlısınız?',
    options: [
      { id: 'low', label: 'Düşük', desc: 'Ana parayı korumak önceliğim', icon: ShieldCheck },
      { id: 'med', label: 'Orta', desc: 'Kontrollü risk alabilirim', icon: CheckCircle2 },
      { id: 'high', label: 'Yüksek', desc: 'Yüksek getiri için yüksek riske hazırım', icon: Flame },
    ]
  },
  {
    id: 'goal',
    title: 'Piyasa beklentiniz nedir?',
    description: 'Hangi tür fırsatları kovalamayı seversiniz?',
    options: [
      { id: 'momentum', label: 'Hız & Momentum', desc: 'Yükselen trendi yakalamak', icon: Zap },
      { id: 'stable', label: 'İstikrar & Değer', desc: 'Dengeli ve tutarlı yükseliş', icon: TrendingUp },
      { id: 'bottom', label: 'Dip Dönüşü', desc: 'Düşmüş ama toparlanacak hisseler', icon: ShieldCheck },
    ]
  }
];

export function StrategyAssistant({ onComplete, onClose }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [recommendation, setRecommendation] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const handleSelect = (optionId) => {
    const newAnswers = { ...answers, [QUESTIONS[step].id]: optionId };
    setAnswers(newAnswers);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      calculateResult(newAnswers);
    }
  };

  const calculateResult = (finalAnswers) => {
    let result = { id: 'Dengeli', name: 'Dengeli', desc: 'Sizin için en güvenli başlangıç noktası.' };

    const { timeframe, risk, goal } = finalAnswers;

    if (timeframe === 'short') {
      if (risk === 'high') result = { id: 'Scalper', name: 'Scalper', desc: 'Hızlı hareketler ve yüksek oynaklık sizin oyun alanınız.' };
      else result = { id: 'Agresif', name: 'Agresif Büyüme', desc: 'Kısa vadeli momentum fırsatlarını kovalayan dinamik bir yapı.' };
    } else if (timeframe === 'medium') {
      if (risk === 'high') result = { id: 'Agresif', name: 'Agresif Büyüme', desc: 'Orta vadede yüksek getiri hedefleyen güçlü bir profil.' };
      else if (risk === 'med') result = { id: 'Swing', name: 'Swing Trader', desc: 'Dönüş noktalarını ve dalga boylarını yakalamak için ideal.' };
      else result = { id: 'Trend', name: 'Trend Takibi', desc: 'Güvenli ve istikrarlı yükseliş trendlerini takip eder.' };
    } else if (timeframe === 'long') {
        result = { id: 'Konservatif', name: 'Konservatif', desc: 'Sermaye koruma odaklı, düşük riskli uzun vadeli analiz.' };
    }

    // Goal based overrides
    if (goal === 'momentum' && timeframe !== 'long') result = { id: 'Kirilim', name: 'Kırılım Avcısı', desc: 'Hacimli fiyat kırılımlarını hedefleyen teknik odaklı seçim.' };
    if (goal === 'bottom') result = { id: 'Deger', name: 'Değer Yatırımı', desc: 'Aşırı satılmış, toparlanma bekleyen "ucuz" hisseler.' };

    setRecommendation(result);
    setShowResult(true);
  };

  return (
    <div className="bg-surface/80 backdrop-blur-2xl border border-outline-variant/10 rounded-[2.5rem] p-8 md:p-12 shadow-[0_40px_120px_rgba(0,0,0,0.6)] relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-tertiary/10 blur-[100px] -ml-32 -mb-32" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <HelpCircle size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight uppercase">Strateji Rehberi</h3>
              <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest leading-none mt-1">İşlem karakteristiğinizi belirleyelim</p>
            </div>
          </div>
          {!showResult && (
            <div className="flex items-center gap-1">
               {QUESTIONS.map((_, i) => (
                 <div 
                   key={i} 
                   className={cn(
                     "h-1.5 rounded-full transition-all duration-300",
                     i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/40" : "w-1.5 bg-outline-variant/20"
                   )} 
                 />
               ))}
            </div>
          )}
        </div>

        <AnimatePresence>
          {!showResult ? (
            <motion.div
              key={`step-${step}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-black tracking-tight text-white">{QUESTIONS[step].title}</h2>
                <p className="text-on-surface-variant font-medium">{QUESTIONS[step].description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {QUESTIONS[step].options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    className="p-6 rounded-3xl border border-outline-variant/10 bg-surface-variant/10 hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 text-left group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-on-surface-variant group-hover:text-primary transition-colors">
                      <opt.icon size={24} />
                    </div>
                    <div className="font-black text-sm uppercase tracking-wider mb-2">{opt.label}</div>
                    <p className="text-xs text-on-surface-variant font-medium leading-relaxed">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result-screen"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', damping: 20, stiffness: 100 }}
              className="py-6 text-center space-y-10"
            >
              <div className="space-y-4">
                <div className="w-20 h-20 rounded-[2rem] bg-primary/10 flex items-center justify-center text-primary mx-auto shadow-inner">
                  <CheckCircle2 size={40} className="animate-in zoom-in duration-500 delay-200 fill-primary/10" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-primary uppercase tracking-[0.3em] mb-2">SİZE UYGUN STRATEJİ</h2>
                  <div className="text-4xl md:text-5xl font-black tracking-tighter text-white uppercase">{recommendation.name}</div>
                </div>
                <p className="text-lg text-on-surface-variant font-medium max-w-xl mx-auto leading-relaxed">
                  {recommendation.desc} Seviyeniz ve tercihleriniz doğrultusunda algoritmalarımız bu profili öneriyor.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => onComplete(recommendation.id)}
                  className="w-full sm:w-auto px-10 py-5 rounded-[2rem] bg-primary text-on-primary font-black uppercase tracking-widest shadow-[0_20px_60px_rgba(34,211,238,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  <Zap size={20} />
                  BU PROFİLİ UYGULA
                </button>
                <button
                  onClick={() => {
                    setShowResult(false);
                    setStep(0);
                    setAnswers({});
                  }}
                  className="w-full sm:w-auto px-10 py-5 rounded-[2rem] bg-surface-variant/20 border border-outline-variant/10 text-on-surface-variant font-black uppercase tracking-widest hover:bg-surface-variant/40 transition-all"
                >
                  BAŞTAN BAŞLA
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        {!showResult && (
          <div className="flex items-center justify-between mt-12 pt-8 border-t border-outline-variant/10">
            <button 
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface disabled:opacity-0 transition-all"
            >
              <ChevronLeft size={16} /> Geri Dön
            </button>
            
            <button 
              onClick={onClose}
              className="text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-error transition-all"
            >
              Vazgeç
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
