// frontend/src/features/auth/pages/LoginPage.jsx
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { Turnstile } from '@marsidev/react-turnstile';
import { notify } from '@/shared/components/ToastNotifier';
import useAuthStore from '../../../store/useAuthStore';
import { cn } from '@/shared/utils/cn';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { PrismBadge } from '@/shared/components/PrismBadge';
import { TrendingUp, TrendingDown, Eye, EyeOff, LogIn, ShieldCheck, ArrowRight } from 'lucide-react';

const GOOGLE_ENABLED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAADJqA9fCDS2kBUGS';

/* ── Mini terminal mock (sol panel için) ─────────────────────────────────── */
const PANEL_ROWS = [
  { sym: 'ALPH', chg: '+5.63%', qrs: '94', pos: true },
  { sym: 'NEXG', chg: '+4.43%', qrs: '91', pos: true },
  { sym: 'VRTX', chg: '+5.81%', qrs: '88', pos: true },
  { sym: 'QNTM', chg: '+3.00%', qrs: '85', pos: true },
  { sym: 'CRON', chg: '-1.24%', qrs: '42', pos: false },
];

function MiniTerminal() {
  return (
    <div className="bg-[#0b0e16] border border-white/[0.08] rounded overflow-hidden font-mono text-[10px]">
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d1118] border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[8px] font-black tracking-widest text-primary">PRISM · ONLINE</span>
        </div>
        <span className="text-[8px] text-white/30">GÜVENLİ LİMAN</span>
      </div>
      <div className="flex text-[7px] font-black text-white/30 tracking-widest px-3 py-1.5 border-b border-white/[0.04]">
        <span className="w-2/5">SEMBOL</span>
        <span className="flex-1 text-right">DEĞİŞİM</span>
        <span className="w-12 text-right text-primary">QRS</span>
      </div>
      {PANEL_ROWS.map((r, i) => (
        <div key={r.sym} className={cn('flex items-center px-3 py-1.5 border-b border-white/[0.03]', i === 0 && 'bg-primary/[0.04] border-l-2 border-l-primary')}>
          <span className="w-2/5 font-black text-white/80">{r.sym}</span>
          <span className={cn('flex-1 text-right font-bold', r.pos ? 'text-[#34d399]' : 'text-[#f87171]')}>{r.chg}</span>
          <span className="w-12 text-right font-black text-primary">{r.qrs}</span>
        </div>
      ))}
      <div className="px-3 py-2 flex justify-between text-[7px] text-white/25">
        <span>287 hisse işlendi</span><span>23 sinyal</span>
      </div>
    </div>
  );
}

/* ── Google button ───────────────────────────────────────────────────────── */
const GoogleSVG = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

function GoogleLoginButton({ onError, disabled }) {
  const setAuth = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenResponse.access_token }),
        });
        const data = await res.json();
        if (res.ok) {
          setAuth({ email: data.email || '', settings: { has_accepted_legal: data.has_accepted_legal } }, data.access_token, data.refresh_token);
          if (data.change_password_required) navigate('/change-password');
          else navigate('/terminal');
        } else onError(data.detail || 'Google girişi başarısız.');
      } catch { onError('Google girişi sırasında bir hata oluştu.'); }
      finally { setLoading(false); }
    },
    onError: () => onError('Google girişi iptal edildi.'),
  });

  return (
    <button onClick={() => login()} disabled={loading || disabled}
      className="w-full flex items-center justify-center gap-2.5 bg-white/[0.06] border border-white/[0.1] text-white py-3 px-4 rounded font-bold text-sm hover:bg-white/[0.09] active:scale-[0.98] transition-all disabled:opacity-50">
      {loading
        ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        : <GoogleSVG />}
      <span className="text-[11px] font-black uppercase tracking-widest">{loading ? 'Doğrulanıyor...' : 'Google ile devam et'}</span>
    </button>
  );
}

/* ── Field wrapper ───────────────────────────────────────────────────────── */
function Field({ label, error, children, action, id }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block text-[9px] font-black uppercase tracking-[0.25em] text-white/35">{label}</label>
        {action}
      </div>
      {children}
      {error && <p className="text-[10px] text-red-400 font-medium flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400 inline-block" />{error}</p>}
    </div>
  );
}

const inputCls = (err) =>
  `w-full bg-[#0b0e16] border rounded px-3.5 py-2.5 text-sm text-white/90 font-mono placeholder:text-white/15 focus:outline-none transition-all ${err ? 'border-red-500/40 focus:border-red-400/60' : 'border-white/[0.08] focus:border-primary/40 focus:bg-[#0d1118]'}`;

/* ── Slider CAPTCHA ──────────────────────────────────────────────────────── */
const SliderCaptcha = memo(({ onVerify }) => {
  const [isVerified, setIsVerified] = useState(false);
  const [sliderPos, setSliderPos] = useState(0);
  const containerRef = useRef(null);

  const handleDrag = useCallback((e) => {
    if (isVerified || !containerRef.current) return;
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const containerRect = containerRef.current.getBoundingClientRect();
    let newPos = clientX - containerRect.left - 20;
    newPos = Math.max(0, Math.min(newPos, containerRect.width - 40));
    setSliderPos(newPos);
    if (newPos >= containerRect.width - 45) {
      setIsVerified(true);
      setSliderPos(containerRect.width - 40);
      onVerify(true);
    }
  }, [isVerified, onVerify]);

  const handleDragEnd = useCallback(() => {
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleDrag);
    document.removeEventListener('touchend', handleDragEnd);
    if (!isVerified) setSliderPos(0);
  }, [handleDrag, isVerified]);

  const handleDragStart = useCallback(() => {
    if (isVerified) return;
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
    document.addEventListener('touchmove', handleDrag);
    document.addEventListener('touchend', handleDragEnd);
  }, [handleDrag, handleDragEnd, isVerified]);

  useEffect(() => () => {
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleDrag);
    document.removeEventListener('touchend', handleDragEnd);
  }, [handleDrag, handleDragEnd]);

  return (
    <div ref={containerRef} className="relative w-full h-11 bg-[#0b0e16] border border-white/[0.08] rounded overflow-hidden flex items-center justify-center select-none touch-none">
      <div className={cn("absolute left-0 top-0 bottom-0 bg-primary/20 transition-all")} style={{ width: sliderPos + 20 }} />
      <span className={cn("text-[9px] font-black tracking-widest uppercase z-10", isVerified ? "text-primary" : "text-white/30")}>
        {isVerified ? '✓ Doğrulandı' : 'Güvenlik için kaydırın →'}
      </span>
      <div onMouseDown={handleDragStart} onTouchStart={handleDragStart}
        className={cn("absolute left-1 w-9 h-9 rounded flex items-center justify-center shadow-lg cursor-grab transition-colors",
          isVerified ? "bg-primary text-[#003d42]" : "bg-white/[0.07] border border-white/[0.1] text-white/50 hover:bg-white/[0.12]")}
        style={{ transform: `translateX(${sliderPos}px)` }}>
        <ArrowRight size={14} />
      </div>
    </div>
  );
});

/* ── Ana Login sayfası ───────────────────────────────────────────────────── */
export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('login');
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const setAuth = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); if (touched[k] || e.target.value.length > 3) touch(k)(); };
  const touch = (k) => () => setTouched(t => ({ ...t, [k]: true }));

  const errs = {
    email: touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'Geçerli bir e-posta girin.' : '',
    password: touched.password && form.password.length < 1 ? 'Şifre gereklidir.' : '',
  };

  const _finalizeLogin = (data, email) => {
    setAuth({ email, settings: { has_accepted_legal: data.has_accepted_legal } }, data.access_token, data.refresh_token);
    if (data.change_password_required) navigate('/change-password');
    else navigate('/terminal');
  };

  const handleTotpVerify = async (e) => {
    e.preventDefault();
    const code = totpCode.replace(/\s/g, '');
    if (code.length !== 6) { setError('6 haneli kodu girin.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ temp_token: tempToken, code }) });
      const data = await res.json();
      if (res.ok) { _finalizeLogin(data, form.email); }
      else { const msg = data.detail || 'Geçersiz kod.'; setError(msg); notify(msg, 'error'); setTotpCode(''); }
    } catch { const msg = 'Sunucuya erişilemiyor.'; setError(msg); notify(msg, 'error'); }
    finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (errs.email || !form.email || !form.password) return;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!captchaToken && !isLocal) { setError('Lütfen robot olmadığınızı doğrulayın.'); return; }
    const effectiveToken = isLocal ? 'local_bypass_token' : captchaToken;
    setError(''); setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const fd = new FormData();
      fd.append('username', form.email); fd.append('password', form.password);
      const res = await fetch('/api/auth/login', { method: 'POST', body: fd, headers: { 'X-Captcha-Token': effectiveToken }, signal: controller.signal });
      const data = await res.json();
      if (res.ok) {
        if (data.requires_2fa && data.temp_token) { setTempToken(data.temp_token); setStep('totp'); setLoading(false); clearTimeout(timer); return; }
        _finalizeLogin(data, form.email);
      } else { const msg = data.detail || 'E-posta veya şifre hatalı.'; setError(msg); notify(msg, 'error'); }
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Sunucu yanıt vermiyor.' : 'Sunucuya erişilemiyor.';
      setError(msg); notify(msg, err.name === 'AbortError' ? 'warn' : 'error');
    } finally { clearTimeout(timer); setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-[#05070a] text-white antialiased overflow-x-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── SOL PANEL ─────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex w-[44%] flex-col justify-between p-10 xl:p-14 relative overflow-hidden border-r border-white/[0.05]">
        {/* Grid bg */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.02) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-1/3 left-0 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse,rgba(34,211,238,0.06) 0%,transparent 70%)', filter: 'blur(40px)' }} />

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative z-10">
          <Link to="/" className="hover:opacity-75 transition-opacity">
            <BrandLogo size="lg" />
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl xl:text-5xl font-black tracking-tighter leading-[0.9] uppercase text-white mb-4">
              Analizi<br />
              <span className="text-transparent" style={{ WebkitTextStroke: '2px rgba(34,211,238,0.9)', filter: 'drop-shadow(0 0 16px rgba(34,211,238,0.25))' }}>algoritmaya</span><br />
              bırak.
            </h1>
            <p className="text-sm text-white/30 leading-relaxed max-w-xs">
              500+ BIST hissesini ML skoru, teknik indikatörler ve algoritmik analiz ile saniyeler içinde tara.
            </p>
          </div>

          {/* Mini terminal */}
          <MiniTerminal />

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: '500+', l: 'BIST Hissesi' },
              { v: '80+',  l: 'Teknik Gösterge' },
              { v: 'QRS',  l: 'ML Skorlama' },
              { v: '8',    l: 'Strateji Profili' },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.07 }}
                className="p-3 border border-white/[0.06] bg-white/[0.02] rounded">
                <p className="text-xl font-black text-white tracking-tighter font-mono">{s.v}</p>
                <p className="text-[9px] text-white/25 uppercase tracking-[0.15em] mt-0.5">{s.l}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="relative z-10 space-y-3">
          <PrismBadge className="opacity-60 hover:opacity-100 transition-opacity" />
          <div className="flex items-start gap-2 p-3 rounded bg-amber-400/5 border border-amber-400/15">
            <span className="text-amber-400/60 text-[11px] mt-0.5 shrink-0">⚠</span>
            <p className="text-[9px] text-amber-400/50 leading-snug font-mono">
              Algoritmik model çıktısı — yatırım tavsiyesi değildir. SPK lisanslı danışmanlık hizmeti değildir.
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── SAĞ PANEL (FORM) ───────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="w-full max-w-[380px] relative">

          {/* Mobilde logo */}
          <div className="lg:hidden text-center mb-10">
            <Link to="/"><BrandLogo size="md" /></Link>
          </div>

          {/* ── 2FA Adımı ── */}
          {step === 'totp' ? (
            <>
              <div className="mb-7">
                <div className="w-10 h-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                  <ShieldCheck size={18} className="text-primary" />
                </div>
                <h2 className="text-2xl font-black tracking-tighter uppercase">İki Faktörlü Doğrulama</h2>
                <p className="text-sm text-white/35 mt-1">Authenticator uygulamanızdaki 6 haneli kodu girin.</p>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[11px]">{error}</motion.div>
              )}

              <form onSubmit={handleTotpVerify} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-black uppercase tracking-[0.25em] text-white/35">Doğrulama Kodu</label>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))} autoFocus placeholder="000000"
                    className="w-full bg-[#0b0e16] border border-white/[0.08] rounded px-4 py-4 text-2xl text-center font-mono text-white tracking-[0.5em] placeholder:text-white/10 focus:outline-none focus:border-primary/40 transition-all" />
                  <p className="text-[9px] text-white/25 text-center font-mono">Kod 30 saniyede yenilenir.</p>
                </div>
                <button type="submit" disabled={loading || totpCode.length !== 6}
                  className="w-full py-3 rounded font-black uppercase tracking-widest text-sm bg-primary text-[#003d42] hover:bg-[#a5f3fc] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Doğrulanıyor...</> : 'Giriş Yap'}
                </button>
                <button type="button" onClick={() => { setStep('login'); setTempToken(''); setTotpCode(''); setError(''); setCaptchaToken(''); }}
                  className="w-full py-2 text-sm text-white/30 hover:text-white/60 transition-colors">← Geri dön</button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-7">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-primary/5 border border-primary/15 rounded text-[8px] font-black text-primary tracking-[0.25em] mb-4">
                  TERMINAL ERİŞİMİ
                </div>
                <h2 className="text-2xl font-black tracking-tighter uppercase">Hoş geldiniz</h2>
                <p className="text-sm text-white/35 mt-1">Terminale erişmek için giriş yapın.</p>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[11px]">{error}</motion.div>
              )}

              {GOOGLE_ENABLED && (
                <>
                  <GoogleLoginButton onError={setError} disabled={loading} />
                  <div className="relative flex items-center my-5">
                    <div className="flex-grow border-t border-white/[0.06]" />
                    <span className="px-3 text-[9px] text-white/20 uppercase tracking-widest font-black">veya e-posta ile</span>
                    <div className="flex-grow border-t border-white/[0.06]" />
                  </div>
                </>
              )}

              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <Field label="E-Posta" error={errs.email} id="login-email">
                  <input id="login-email" type="email" value={form.email} onChange={set('email')} onBlur={touch('email')}
                    className={inputCls(errs.email)} placeholder="ornek@eposta.com" required />
                </Field>

                <Field label="Şifre" error={errs.password} id="login-password"
                  action={<Link to="/forgot-password" className="text-[9px] text-primary/60 hover:text-primary transition-colors font-black tracking-widest">Şifremi Unuttum</Link>}>
                  <div className="relative">
                    <input id="login-password" type={showPassword ? 'text' : 'password'} value={form.password}
                      onChange={set('password')} onBlur={touch('password')}
                      className={cn(inputCls(errs.password), 'pr-10')} placeholder="••••••••" required />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors">
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                {!(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                  <div className="flex justify-center pt-1 pb-2">
                    <Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={(t) => setCaptchaToken(t)} options={{ theme: 'dark' }} />
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-[#003d42] rounded py-3 font-black uppercase tracking-widest text-sm hover:bg-[#a5f3fc] active:scale-[0.97] transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-60">
                  {loading
                    ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Giriş yapılıyor...</>
                    : <><LogIn size={15} />Giriş Yap</>}
                </button>
              </form>

              <footer className="mt-10 pt-5 border-t border-white/[0.04] flex flex-wrap justify-center gap-x-4 gap-y-2 opacity-25 text-[9px] font-black uppercase tracking-widest hover:opacity-60 transition-opacity">
                <Link to="/legal/terms" className="hover:text-primary transition-colors">Şartlar</Link>
                <Link to="/legal/kvkk" className="hover:text-primary transition-colors">KVKK</Link>
                <Link to="/legal/privacy" className="hover:text-primary transition-colors">Gizlilik</Link>
                <Link to="/legal/cookies" className="hover:text-primary transition-colors">Çerezler</Link>
              </footer>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
