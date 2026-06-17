// frontend/src/features/auth/pages/ResetPasswordPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';

function PasswordStrength({ password }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)];
  const score = checks.filter(Boolean).length;
  if (!password) return null;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-emerald-500'];
  const labels = ['Zayıf', 'Orta', 'İyi', 'Güçlü'];
  const textColors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-emerald-400'];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">{[0,1,2,3].map(i=><div key={i} className={`h-1 flex-1 rounded-full ${i<score?colors[score-1]:'bg-white/[0.06]'}`}/>)}</div>
      {score > 0 && <p className={`text-[10px] font-bold ${textColors[score-1]}`}>{labels[score-1]}</p>}
    </div>
  );
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const errs = {
    password: touched.password && form.password.length < 8 ? 'En az 8 karakter olmalıdır.' : '',
    confirm: touched.confirm && form.confirm !== form.password ? 'Şifreler eşleşmiyor.' : '',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    if (errs.password || errs.confirm || form.password.length < 8 || form.password !== form.confirm) return;
    if (!token) { setError('Geçersiz sıfırlama bağlantısı.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: form.password }),
      });
      const data = await res.json();
      if (res.ok) setDone(true);
      else setError(data.detail || 'Şifre sıfırlanamadı.');
    } catch { setError('Sunucuya erişilemiyor.'); }
    finally { setLoading(false); }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070a] font-body text-[#f0f2ff] p-6">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-red-400 text-[48px] block">link_off</span>
          <h2 className="text-lg font-black uppercase text-white">Geçersiz Bağlantı</h2>
          <p className="text-sm text-white/40">Bu sıfırlama bağlantısı geçersiz veya süresi dolmuş.</p>
          <Link to="/forgot-password" className="inline-flex items-center gap-2 text-primary font-bold hover:underline text-sm">
            Yeni bağlantı talep et
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070a] font-body text-[#f0f2ff] antialiased px-6">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-yellow-400/3 rounded-full blur-[120px]" />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.02) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>radar</span>
            <span className="font-black text-xl tracking-tighter uppercase">PIVOTRADAR</span>
          </Link>
        </div>

        {done ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-emerald-400 text-[32px]">check_circle</span>
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tighter uppercase text-white">Şifre Güncellendi</h2>
              <p className="text-sm text-white/40 mt-2 font-light">Yeni şifrenizle giriş yapabilirsiniz.</p>
            </div>
            <button onClick={() => navigate('/login')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-[#003d42] rounded-xl font-black text-sm uppercase tracking-wider hover:brightness-110 transition-all">
              <span className="material-symbols-outlined text-[16px]">login</span>Giriş Yap
            </button>
          </motion.div>
        ) : (
          <>
            <div className="mb-7">
              <h2 className="text-2xl font-black tracking-tighter uppercase text-white">Yeni Şifre Belirle</h2>
              <p className="text-sm text-white/35 mt-1 font-light">Güçlü bir şifre seçin.</p>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="mb-5 flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl">
                <span className="material-symbols-outlined text-red-400 text-[18px] mt-0.5 shrink-0">error</span>
                <p className="text-red-400 text-[11px] font-medium">{error}</p>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* New password */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Yeni Şifre</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 text-[18px]">lock</span>
                  <input type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                    onBlur={() => setTouched(t => ({ ...t, password: true }))}
                    className={`w-full bg-white/[0.04] border rounded-xl pl-10 pr-12 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all ${errs.password ? 'border-red-500/50 bg-red-500/5' : 'border-white/[0.08] focus:border-primary/40 focus:bg-white/[0.06]'}`}
                    placeholder="En az 8 karakter" required minLength={8} />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors">
                    <span className="material-symbols-outlined text-[18px]">{showPw ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
                {errs.password && <p className="flex items-center gap-1 text-[10px] text-red-400"><span className="material-symbols-outlined text-[13px]">error</span>{errs.password}</p>}
                <PasswordStrength password={form.password} />
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Şifre Tekrar</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 text-[18px]">lock</span>
                  <input type="password" value={form.confirm}
                    onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))}
                    onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
                    className={`w-full bg-white/[0.04] border rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none transition-all ${errs.confirm ? 'border-red-500/50 bg-red-500/5' : 'border-white/[0.08] focus:border-primary/40 focus:bg-white/[0.06]'}`}
                    placeholder="••••••••" required />
                </div>
                {errs.confirm && <p className="flex items-center gap-1 text-[10px] text-red-400"><span className="material-symbols-outlined text-[13px]">error</span>{errs.confirm}</p>}
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-[#003d42] rounded-xl py-3.5 font-black uppercase tracking-wider text-sm hover:brightness-110 active:scale-[0.97] transition-all shadow-[0_8px_24px_rgba(34,211,238,0.25)] disabled:opacity-60">
                {loading
                  ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg><span>Güncelleniyor...</span></>
                  : <><span className="material-symbols-outlined text-[16px]">key</span><span>Şifreyi Güncelle</span></>}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
