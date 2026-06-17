import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { WIZARD_QUESTIONS, DEFAULT_PROFILES } from './constants';

function computeRecommendation(answers, profiles) {
  const totals = {};
  profiles.forEach(p => { totals[p.name] = 0; });
  answers.forEach(ans => {
    if (!ans) return;
    Object.entries(ans.score).forEach(([k, v]) => { if (totals[k] !== undefined) totals[k] += v; });
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0][0];
}

export function WizardModal({ isOpen, onClose, onApply, profiles = DEFAULT_PROFILES }) {
  const [step, setStep] = useState('quiz');
  const [answers, setAnswers] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [recommendation, setRecommendation] = useState(null);

  useEffect(() => {
    if (isOpen) { setStep('quiz'); setAnswers([]); setCurrentQ(0); setRecommendation(null); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAnswer = (opt) => {
    const newAnswers = [...answers];
    newAnswers[currentQ] = opt;
    setAnswers(newAnswers);
    if (currentQ < WIZARD_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      const rec = computeRecommendation(newAnswers, profiles);
      setRecommendation(rec);
      setStep('result');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-[#0a0d14] border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative"
      >
        {step === 'quiz' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-black text-primary uppercase tracking-widest">YAPAY ZEKA PROFİL ASİSTANI</p>
              <button onClick={onClose} className="text-white/40 hover:text-white"><ArrowLeft size={16} /></button>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full mb-6 overflow-hidden">
               <motion.div animate={{ width: `${((currentQ) / WIZARD_QUESTIONS.length) * 100}%` }} className="h-full bg-primary" />
            </div>
            <h3 className="text-xl font-bold text-white mb-6">{WIZARD_QUESTIONS[currentQ].question}</h3>
            <div className="flex flex-col gap-3">
               {WIZARD_QUESTIONS[currentQ].options.map(opt => (
                 <button key={opt.value} onClick={() => handleAnswer(opt)}
                   className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all text-left text-sm font-medium text-white/80"
                 >
                   {opt.label}
                 </button>
               ))}
            </div>
          </div>
        )}

        {step === 'result' && (() => {
           const rec = profiles.find(p => p.name === recommendation);
           return (
             <div className="p-6 text-center">
                <Sparkles size={40} className="mx-auto mb-4 text-primary" style={{ color: rec?.color }} />
                <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-2">ÖNERİLEN PROFİLİNİZ</p>
                <h3 className="text-3xl font-black mb-2" style={{ color: rec?.color }}>{rec?.name}</h3>
                <p className="text-sm text-white/50 mb-8">{rec?.desc}</p>

                <div className="flex gap-4">
                  <button onClick={() => { setStep('quiz'); setAnswers([]); setCurrentQ(0); }}
                    className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 font-bold hover:text-white"
                  >Tekrar Çöz</button>
                  <button onClick={() => { onApply(rec?.name); onClose(); }} style={{ backgroundColor: rec?.color }}
                    className="flex-1 py-3 rounded-xl font-black text-[#003d42] hover:scale-105 transition-transform"
                  >Profili Uygula</button>
                </div>
             </div>
           );
        })()}
      </motion.div>
    </div>,
    document.body
  );
}
