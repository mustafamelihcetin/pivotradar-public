import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '@/store/useAuthStore';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { cn } from '@/shared/utils/cn';

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);

  const handleReset = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 8) return setError('Şifre en az 8 karakter olmalıdır.');
    if (form.newPassword !== form.confirmPassword) return setError('Şifreler eşleşmiyor.');

    setLoading(true);
    setError('');
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: '', // Should be allowed if force_password_change is true, or we skip it
          new_password: form.newPassword
        })
      });

      const data = await res.json();
      if (res.ok) {
        // After successful change, we should probably re-login or just navigate
        // The backend needs to clear the force_password_change flag!
        navigate('/terminal');
      } else {
        setError(data.detail || 'Şifre değiştirilemedi.');
      }
    } catch {
      setError('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#05070a] font-body text-[#f0f2ff]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md p-8 rounded-[2.5rem] border border-white/[0.08] bg-[#090b10] shadow-2xl space-y-8 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary-dark" />
        
        <div className="text-center space-y-4">
          <BrandLogo size="lg" className="mx-auto" />
          <div className="space-y-1">
            <h2 className="text-2xl font-black uppercase tracking-tighter">Şifrenizi Yenileyin</h2>
            <p className="text-sm text-white/40">Güvenliğiniz için geçici şifrenizi kalıcı bir şifre ile değiştirin.</p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold flex items-center gap-3">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleReset} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 px-1">Yeni Şifre</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/20">lock</span>
              <input 
                type="password"
                required
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm focus:border-primary/50 focus:bg-white/[0.05] transition-all"
                placeholder="En az 8 karakter"
                value={form.newPassword}
                onChange={e => setForm({ ...form, newPassword: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/30 px-1">Şifre Onayı</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/20">verified_user</span>
              <input 
                type="password"
                required
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm focus:border-primary/50 focus:bg-white/[0.05] transition-all"
                placeholder="Aynı şifreyi tekrar girin"
                value={form.confirmPassword}
                onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
              />
            </div>
          </div>

          <button 
            disabled={loading}
            className="w-full bg-primary text-[#003d42] font-black uppercase py-4 rounded-2xl shadow-[0_8px_32px_rgba(34,211,238,0.2)] hover:brightness-110 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#003d42]/30 border-t-[#003d42] rounded-full animate-spin" />
            ) : (
              <>
                <span>Şifreyi Güncelle</span>
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </>
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-white/20 uppercase tracking-widest">
          PivotRadar Güvenlik Sistemi
        </p>
      </motion.div>
    </div>
  );
}
