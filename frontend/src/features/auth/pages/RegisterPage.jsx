// frontend/src/features/auth/pages/RegisterPage.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { Turnstile } from '@marsidev/react-turnstile';
import useAuthStore from '../../../store/useAuthStore';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { PrismBadge } from '@/shared/components/PrismBadge';
import { ChevronDown, ChevronUp, Eye, EyeOff, ArrowRight, Check } from 'lucide-react';
import { notify } from '@/shared/components/ToastNotifier';

const GOOGLE_ENABLED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

const KVKK_TEXT = `KİŞİSEL VERİLERİN KORUNMASI HAKKINDA AYDINLATMA METNİ

6698 sayılı KVKK uyarınca, veri sorumlusu sıfatıyla PivotRadar olarak kişisel verilerinizi aşağıda açıklanan amaç ve kapsamda işlemekteyiz.

İŞLENEN VERİLER: Ad-soyad, e-posta adresi, IP adresi, oturum bilgileri ve platform kullanım verileri.

İŞLEME AMAÇLARI: Hesap oluşturma ve kimlik doğrulama, Platform hizmetlerinin sunulması ve iyileştirilmesi, yasal yükümlülüklerin yerine getirilmesi.

VERİ AKTARIMI: Kişisel verileriniz yasal zorunluluklar dışında üçüncü kişilerle ticari amaçla paylaşılmaz.

HAKLARINIZ (KVKK Madde 11): Verilerinize erişim, düzeltme, silme, işleme itiraz etme ve taşınabilirlik haklarına sahipsiniz. Başvuru: info@pivotradar.net

Detaylı metin için: pivot-radar.com/legal/kvkk`;

const TERMS_TEXT = `PİVOTRADAR KULLANIM KOŞULLARI VE SORUMLULUK REDDİ

Son Güncelleme: Nisan 2025

1. HİZMETİN NİTELİĞİ
PivotRadar ("Platform"), Borsa İstanbul (BIST) hisselerine ilişkin matematiksel ve istatistiksel analiz araçları sunan bir yazılım uygulamasıdır. Platform; fiyat, hacim ve teknik gösterge verilerini algoritmik yöntemlerle işleyerek QRS (Quant Ranking Score) adı verilen bir puanlama mekanizması üretir.

2. VERİ GÜNCELLIĞI VE DOĞRULUĞU
Platform, güncel, eksiksiz veya gerçek zamanlı piyasa verisi sunma garantisi vermez. Kullanılan veriler gecikmeli olabilir, eksik olabilir ya da teknik nedenlerle hatalı işlenmiş olabilir. Kullanıcı, verilerin anlık doğruluğuna ilişkin herhangi bir güvence olmadığını kabul eder.

3. YATIRIM TAVSİYESİ DEĞİLDİR
PivotRadar tarafından üretilen tüm analizler, skorlar, sinyaller, grafikler ve raporlar, yatırım tavsiyesi, portföy yönetimi tavsiyesi, finansal danışmanlık veya alım/satım teklifi niteliği taşımaz.

4. KULLANICININ SORUMLULUĞU
Kullanıcı, Platform çıktılarını yatırım kararlarında tek veya birincil dayanak olarak kullanamaz. Platform çıktılarından hareketle gerçekleştirilen her türlü alım/satım işleminin sonuçlarından yalnızca kullanıcı sorumludur.

5. SERMAYE PİYASASI MEVZUATI
Platform, Sermaye Piyasası Kurulu (SPK) nezdinde yatırım danışmanlığı veya portföy yönetimi lisansına sahip değildir.

6. RİSK UYARISI
Borsa yatırımları önemli finansal riskler içerir. Geçmiş performans gelecekteki sonuçların garantisi değildir.`;

/* ── Google SVG ──────────────────────────────────────────────────────────── */
const GoogleSVG = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

function GoogleRegisterButton({ onError, disabled }) {
  const setAuth = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenResponse.access_token }) });
        const data = await res.json();
        if (res.ok) { setAuth({ email: data.email || '' }, data.access_token, data.refresh_token); navigate('/terminal'); }
        else onError(data.detail || 'Google girişi başarısız.');
      } catch { onError('Google girişi sırasında bir hata oluştu.'); }
      finally { setLoading(false); }
    },
    onError: () => onError('Google girişi iptal edildi.'),
  });

  return (
    <button onClick={() => login()} disabled={loading || disabled}
      className="w-full flex items-center justify-center gap-2.5 bg-white/[0.06] border border-white/[0.1] text-white py-3 px-4 rounded font-bold text-sm hover:bg-white/[0.09] active:scale-[0.98] transition-all disabled:opacity-50">
      {loading ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <GoogleSVG />}
      <span className="text-[11px] font-black uppercase tracking-widest">{loading ? 'Doğrulanıyor...' : 'Google ile kayıt ol'}</span>
    </button>
  );
}

/* ── Şifre güç göstergesi ────────────────────────────────────────────────── */
function PasswordStrength({ password }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)];
  const score = checks.filter(Boolean).length;
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-[#34d399]'];
  const labels = ['Zayıf', 'Orta', 'İyi', 'Güçlü'];
  const textColors = ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-[#34d399]'];
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => <div key={i} className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${i < score ? colors[score-1] : 'bg-white/[0.06]'}`} />)}
      </div>
      {score > 0 && <p className={`text-[9px] font-black ${textColors[score-1]}`}>{labels[score-1]}</p>}
    </div>
  );
}

/* ── Field wrapper ───────────────────────────────────────────────────────── */
function Field({ label, error, children, id }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[9px] font-black uppercase tracking-[0.25em] text-white/35">{label}</label>
      {children}
      {error && <p className="text-[10px] text-red-400 font-medium flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-red-400 inline-block" />{error}</p>}
    </div>
  );
}

const inputCls = (err) =>
  `w-full bg-[#0b0e16] border rounded px-3.5 py-2.5 text-sm text-white/90 font-mono placeholder:text-white/15 focus:outline-none transition-all ${err ? 'border-red-500/40 focus:border-red-400/60' : 'border-white/[0.08] focus:border-primary/40 focus:bg-[#0d1118]'}`;

/* ── Sözleşme accordion ──────────────────────────────────────────────────── */
function ConsentAccordion({ icon, title, text, accepted, onChange, linkTo, linkLabel }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-2">
      <div className="border border-white/[0.07] bg-[#0b0e16] rounded overflow-hidden">
        <button type="button" onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-[11px]">{icon}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/50">{title}</span>
          </div>
          {expanded ? <ChevronUp size={12} className="text-white/25 shrink-0" /> : <ChevronDown size={12} className="text-white/25 shrink-0" />}
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
              <div className="px-3 pb-3 border-t border-white/[0.05]">
                <div className="text-[9px] text-white/30 leading-relaxed font-mono whitespace-pre-wrap max-h-36 overflow-y-auto pr-2 pt-3" style={{ scrollbarWidth: 'thin' }}>{text}</div>
                {linkTo && (
                  <a href={linkTo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-[9px] text-primary/60 hover:text-primary/90 transition-colors">
                    <span style={{ fontSize: 10 }}>↗</span>{linkLabel}
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <label className={`flex items-start gap-3 cursor-pointer group p-3 rounded border transition-all ${accepted ? 'border-[#34d399]/25 bg-[#34d399]/5' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
        <div className="relative mt-0.5 shrink-0">
          <input type="checkbox" checked={accepted} onChange={e => onChange(e.target.checked)} className="sr-only" />
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${accepted ? 'bg-[#34d399] border-[#34d399]' : 'border-white/20 bg-white/[0.03] group-hover:border-white/35'}`}>
            {accepted && <Check size={10} className="text-[#003d42]" strokeWidth={3} />}
          </div>
        </div>
        <div className="flex-1 text-[10px] text-white/50 leading-relaxed">
          {accepted
            ? <span className="font-black text-[#34d399]/80">Kabul edildi ✓</span>
            : <span>Okudum, <span className="font-black text-white/70">{title}</span>'nı kabul ediyorum.</span>}
        </div>
      </label>
    </div>
  );
}

/* ── Ana Register sayfası ────────────────────────────────────────────────── */
export default function RegisterPage() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [kvkkAccepted, setKvkkAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore(s => s.setAuth);
  const navigate = useNavigate();

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); if (touched[k] || e.target.value.length > 2) touch(k)(); };
  const touch = (k) => () => setTouched(t => ({ ...t, [k]: true }));

  const errs = {
    fullName: touched.fullName && !form.fullName.trim() ? 'Ad soyad gereklidir.' : '',
    email: touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'Geçerli bir e-posta girin.' : '',
    password: touched.password && form.password.length < 8 ? 'Şifre en az 8 karakter olmalıdır.' : '',
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setTouched({ fullName: true, email: true, password: true });
    if (!termsAccepted || !kvkkAccepted) { setTermsError(true); return; }
    setTermsError(false);
    if (Object.values(errs).some(Boolean) || !form.fullName || !form.email || !form.password) return;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!captchaToken && !isLocal) { setError('Lütfen robot olmadığınızı doğrulayın.'); return; }
    const effectiveToken = isLocal ? 'local_bypass_token' : captchaToken;
    setError(''); setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Captcha-Token': effectiveToken },
        body: JSON.stringify({ email: form.email, full_name: form.fullName, password: form.password }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.ok) {
        setAuth({ email: form.email, full_name: form.fullName, settings: { has_accepted_legal: data.has_accepted_legal } }, data.access_token, data.refresh_token);
        navigate('/terminal');
      } else { const msg = data.detail || 'Kayıt başarısız.'; setError(msg); notify(msg, 'error'); }
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
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(34,211,238,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.02) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-1/3 left-0 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse,rgba(34,211,238,0.06) 0%,transparent 70%)', filter: 'blur(40px)' }} />

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative z-10">
          <Link to="/" className="hover:opacity-75 transition-opacity"><BrandLogo size="lg" /></Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl xl:text-5xl font-black tracking-tighter leading-[0.9] uppercase text-white mb-4">
              BIST'in en<br />
              <span className="text-transparent" style={{ WebkitTextStroke: '2px rgba(34,211,238,0.9)', filter: 'drop-shadow(0 0 16px rgba(34,211,238,0.25))' }}>akıllı</span><br />
              terminali.
            </h1>
            <p className="text-sm text-white/30 leading-relaxed max-w-xs">
              Algoritmik tarama, ML skorlama ve backtest araçlarına saniyeler içinde eriş. Ücretsiz.
            </p>
          </div>

          {/* Avantajlar listesi */}
          <div className="space-y-2.5">
            {[
              'Ücretsiz hesap, sınırsız tarama',
              'ML destekli QRS skorlama sistemi',
              'Formasyon & Fibonacci analizi',
              'Gerçek zamanlı piyasa akışı',
              'Portföy K/Z takibi',
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.06 }}
                className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Check size={9} className="text-primary" strokeWidth={3} />
                </div>
                <span className="text-[11px] text-white/55 font-mono">{item}</span>
              </motion.div>
            ))}
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: '500+', l: 'BIST Hissesi' },
              { v: '80+',  l: 'Teknik Gösterge' },
              { v: 'PRISM', l: 'Analiz Motoru' },
              { v: '8',    l: 'Strateji Profili' },
            ].map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.06 }}
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
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative overflow-y-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="w-full max-w-[380px] relative py-8">

          <div className="lg:hidden text-center mb-10">
            <Link to="/"><BrandLogo size="md" /></Link>
          </div>

          <div className="mb-7">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-primary/5 border border-primary/15 rounded text-[8px] font-black text-primary tracking-[0.25em] mb-4">
              ÜCRETSİZ HESAP
            </div>
            <h2 className="text-2xl font-black tracking-tighter uppercase">Hesap Oluştur</h2>
            <p className="text-sm text-white/35 mt-1">Terminale anında eriş, ücretsiz.</p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[11px]">{error}</motion.div>
          )}

          {GOOGLE_ENABLED && (
            <>
              <GoogleRegisterButton onError={setError} disabled={loading} />
              <div className="relative flex items-center my-5">
                <div className="flex-grow border-t border-white/[0.06]" />
                <span className="px-3 text-[9px] text-white/20 uppercase tracking-widest font-black">veya e-posta ile</span>
                <div className="flex-grow border-t border-white/[0.06]" />
              </div>
            </>
          )}

          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            <Field label="Ad Soyad" error={errs.fullName} id="reg-fullname">
              <input id="reg-fullname" type="text" value={form.fullName} onChange={set('fullName')} onBlur={touch('fullName')}
                className={inputCls(errs.fullName)} placeholder="Adınız Soyadınız" required />
            </Field>

            <Field label="E-Posta" error={errs.email} id="reg-email">
              <input id="reg-email" type="email" value={form.email} onChange={set('email')} onBlur={touch('email')}
                className={inputCls(errs.email)} placeholder="ornek@eposta.com" required />
            </Field>

            <Field label="Şifre" error={errs.password} id="reg-password">
              <div className="relative">
                <input id="reg-password" type={showPassword ? 'text' : 'password'} value={form.password}
                  onChange={set('password')} onBlur={touch('password')}
                  className={`${inputCls(errs.password)} pr-10`} placeholder="En az 8 karakter" required minLength={8} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <PasswordStrength password={form.password} />
            </Field>

            {/* Sözleşmeler */}
            <div className="pt-1 space-y-3">
              <ConsentAccordion
                icon="⚖" title="Kullanım Koşulları" text={TERMS_TEXT}
                accepted={termsAccepted} onChange={(v) => { setTermsAccepted(v); if (v && kvkkAccepted) setTermsError(false); }}
                linkTo="/legal/terms" linkLabel="Tam metni oku"
              />
              <ConsentAccordion
                icon="🔐" title="KVKK Aydınlatma" text={KVKK_TEXT}
                accepted={kvkkAccepted} onChange={(v) => { setKvkkAccepted(v); if (v && termsAccepted) setTermsError(false); }}
                linkTo="/legal/kvkk" linkLabel="Tam metni oku"
              />
              <AnimatePresence>
                {termsError && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-[10px] text-red-400 font-medium flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-red-400 inline-block" />
                    Devam etmek için tüm onay kutularını işaretlemelisiniz.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {!(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <div className="flex justify-center pt-1 pb-2">
                <Turnstile siteKey={TURNSTILE_SITE_KEY} onSuccess={(t) => setCaptchaToken(t)} options={{ theme: 'dark' }} />
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-[#003d42] rounded py-3 font-black uppercase tracking-widest text-sm hover:bg-[#a5f3fc] active:scale-[0.97] transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-60">
              {loading
                ? <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Hesap oluşturuluyor...</>
                : <><ArrowRight size={15} />Hesabı Oluştur</>}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] text-white/30">
            Zaten hesabınız var mı?{' '}
            <Link to="/login" className="text-primary font-black hover:underline">Giriş yapın</Link>
          </p>

          <p className="mt-4 text-center text-[9px] text-white/15 leading-relaxed px-2 font-mono">
            Bu platform yatırım tavsiyesi vermez ve SPK lisanslı danışmanlık hizmeti değildir.
            Tüm yatırım kararlarının sorumluluğu kullanıcıya aittir.
          </p>

          <footer className="mt-10 pt-5 border-t border-white/[0.04] flex flex-wrap justify-center gap-x-4 gap-y-2 opacity-25 text-[9px] font-black uppercase tracking-widest hover:opacity-60 transition-opacity">
            <Link to="/legal/terms" className="hover:text-primary transition-colors">Şartlar</Link>
            <Link to="/legal/kvkk" className="hover:text-primary transition-colors">KVKK</Link>
            <Link to="/legal/privacy" className="hover:text-primary transition-colors">Gizlilik</Link>
            <Link to="/legal/cookies" className="hover:text-primary transition-colors">Çerezler</Link>
          </footer>
        </motion.div>
      </div>
    </div>
  );
}
