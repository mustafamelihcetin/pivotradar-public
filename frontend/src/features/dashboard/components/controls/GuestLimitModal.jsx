import React from 'react';
import { Zap } from 'lucide-react';

export function GuestLimitModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-8 max-w-sm text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Zap className="text-primary animate-pulse" size={32} />
        </div>
        <h2 className="text-white font-black text-xl mb-2 tracking-tight">Günlük limitine ulaştın</h2>
        <p className="text-white/40 text-sm mb-8">
          Ücretsiz hesap oluşturarak sınırsız analiz, kişisel takip listesi ve tam sonuçlara anında erişebilirsin.
        </p>
        <a href="/register" className="block w-full py-3.5 rounded-xl bg-primary text-black font-black text-sm mb-3 hover:scale-102 transition-transform shadow-[0_0_20px_rgba(34,211,238,0.2)]">
          Ücretsiz Kayıt Ol
        </a>
        <a href="/login" className="block w-full py-3.5 rounded-xl bg-white/5 text-white/60 text-sm font-bold hover:bg-white/10 transition-colors">
          Zaten üyeyim
        </a>
        <button onClick={onClose} className="mt-6 text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white/40">
          Belki daha sonra
        </button>
      </div>
    </div>
  );
}
