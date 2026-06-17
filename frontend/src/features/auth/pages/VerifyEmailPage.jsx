import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/core/api/client';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading'); // loading | success | error | no_token

  useEffect(() => {
    if (!token) { setStatus('no_token'); return; }
    api.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  const icons = { loading: '⏳', success: '✅', error: '❌', no_token: '⚠️' };
  const titles = {
    loading:  'Doğrulanıyor...',
    success:  'E-posta Doğrulandı!',
    error:    'Doğrulama Başarısız',
    no_token: 'Geçersiz Bağlantı',
  };
  const descs = {
    loading:  'Lütfen bekleyin.',
    success:  'Hesabınız aktif. Giriş yapabilirsiniz.',
    error:    'Token geçersiz veya süresi dolmuş. Yeni doğrulama maili isteyin.',
    no_token: 'Doğrulama tokeni bulunamadı.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full rounded-3xl border border-white/10 bg-surface p-10 text-center space-y-5 shadow-2xl">
        <div className="text-5xl">{icons[status]}</div>
        <h1 className="text-xl font-black text-on-surface uppercase tracking-widest">{titles[status]}</h1>
        <p className="text-sm text-on-surface-variant/60">{descs[status]}</p>
        {status !== 'loading' && (
          <Link to="/login" className="inline-block mt-2 px-6 py-3 rounded-2xl bg-primary text-on-primary font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all">
            Giriş Yap
          </Link>
        )}
      </div>
    </div>
  );
}
