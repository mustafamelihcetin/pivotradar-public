// frontend/src/features/auth/pages/ForgotPasswordPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/shared/components/BrandLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const emailErr = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Geçerli bir e-posta girin.' : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (emailErr || !email) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) setSent(true);
      else setError(data.detail || 'Bir hata oluştu.');
    } catch { setError('Sunucuya erişilemiyor.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070a] font-body text-[#f0f2ff] antialiased px-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/4 rounded-full blur-[120px]" />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.02) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm relative">
        <div className="flex justify-center mb-10">
          <Link to="/" className="hover:scale-105 transition-transform">
            <BrandLogo size="lg" />
          </Link>
        </div>

        {sent ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-emerald-400 text-[32px]">mark_email_read</span>
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tighter uppercase text-white">E-Posta Gönderildi</h2>
              <p className="text-sm text-white/40 mt-2 leading-relaxed font-light">
                <strong className="text-white/60">{email}</strong> adresine şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.
              </p>
            </div>
            <p className="text-[11px] text-white/25">Bağlantı 1 saat geçerlidir.</p>
            <Link to="/login" className="inline-flex items-center gap-2 text-primary text-sm font-bold hover:underline">
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>Giriş sayfasına dön
            </Link>
          </motion.div>
        ) : (
          <>
            <div className="mb-7">
              <h2 className="text-2xl font-black tracking-tighter uppercase text-white">Şifremi Unuttum</h2>
              <p className="text-sm text-white/35 mt-1 font-light">E-posta adresinizi girin, sıfırlama bağlantısı göndereceğiz.</p>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="mb-5 flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <span className="material-symbols-outlined text-red-400 text-[18px] mt-0.5 shrink-0">error</span>
                <p className="text-red-400 text-[11px] font-medium">{error}</p>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">E-Posta</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 text-[18px]">mail</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)}
                    className={`w-full bg-white/[0.04] border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all ${emailErr ? 'border-red-500/50 bg-red-500/5 focus:border-red-400/60' : 'border-white/[0.08] focus:border-primary/40 focus:bg-white/[0.06]'}`}
                    placeholder="ornek@eposta.com" required />
                </div>
                {emailErr && (
                  <p className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                    <span className="material-symbols-outlined text-[13px]">error</span>{emailErr}
                  </p>
                )}
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-[#003d42] rounded-xl py-3.5 font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.97] transition-all shadow-[0_8px_24px_rgba(34,211,238,0.25)] disabled:opacity-60">
                {loading
                  ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span>Gönderiliyor...</span></>
                  : <><span className="material-symbols-outlined text-[16px]">send</span><span>Sıfırlama Bağlantısı Gönder</span></>}
              </button>
            </form>

            <p className="mt-6 text-center text-[11px] text-white/30">
              <Link to="/login" className="inline-flex items-center gap-1 text-white/40 hover:text-primary transition-colors font-bold">
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>Giriş sayfasına dön
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
