import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api/client';
import useAuthStore from '@/store/useAuthStore';
import { SearchableSelect } from '@/shared/components/SearchableSelect';

// ── App icon used as default avatar ──────────────────────────────────────────
function AppIcon({ size = 32 }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size, display: 'block' }}>
      <defs>
        <linearGradient id="piG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#a5f3fc" />
          <stop offset="50%"  stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <g transform="skewX(-8) translate(8,0)">
        <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#piG)" />
        <rect x="32" y="10" width="4"  height="20" rx="2" fill="url(#piG)" />
        <rect x="32" y="70" width="4"  height="20" rx="2" fill="url(#piG)" />
        <path d="M 40 32 C 85 28 85 68 40 68"
          stroke="url(#piG)" strokeWidth="14" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

function Avatar({ src, size = 64 }) {
  const useAppIcon = !src || src === '/icon.svg';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(34,211,238,0.03))',
      border: '1.5px solid rgba(34,211,238,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {useAppIcon
        ? <AppIcon size={Math.round(size * 0.52)} />
        : <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      }
    </div>
  );
}

// ── Shared section card ───────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div style={{
      borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
      background: '#060810',
      boxShadow: '0 2px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(34,211,238,0.1)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: '#040609', borderRadius: '10px 10px 0 0',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#22d3ee' }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.6)' }}>{title}</span>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}

function Alert({ type, children }) {
  const cfg = {
    success: { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.2)', color: '#6ee7b7', icon: 'check_circle' },
    error:   { bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.2)', color: '#fca5a5', icon: 'error' },
    info:    { bg: 'rgba(34,211,238,0.06)',  border: 'rgba(34,211,238,0.2)',  color: '#22d3ee', icon: 'info' },
  }[type];
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 8,
        background: cfg.bg, border: `1px solid ${cfg.border}`, marginTop: 10 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16, color: cfg.color, marginTop: 1, flexShrink: 0 }}>{cfg.icon}</span>
      <span style={{ fontSize: 12, color: cfg.color, lineHeight: 1.5 }}>{children}</span>
    </motion.div>
  );
}

function InputField({ label, icon, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>{icon}</span>}
        <input {...props} style={{
          width: '100%', background: '#040609', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 8, padding: icon ? '10px 14px 10px 38px' : '10px 14px',
          fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s', ...props.style,
        }}
          onFocus={e => e.target.style.borderColor = 'rgba(34,211,238,0.3)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
        />
      </div>
    </div>
  );
}

function PrimaryBtn({ children, disabled, ...props }) {
  return (
    <button {...props} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '9px 18px', background: disabled ? 'rgba(34,211,238,0.3)' : '#22d3ee',
      color: '#003d42', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
      transition: 'filter 0.15s', ...props.style,
    }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.filter = 'brightness(1.1)')}
      onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
    >
      {children}
    </button>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────
function ProfileNameSection({ user }) {
  const qc = useQueryClient();
  const setAuth = useAuthStore(s => s.setAuth);
  const token = useAuthStore(s => s.token);
  const [name, setName] = useState(user?.full_name || '');
  const [msg, setMsg] = useState(null);

  const mut = useMutation({
    mutationFn: () => api.updateProfile({ full_name: name }),
    onSuccess: () => {
      setMsg({ type: 'success', text: 'İsminiz güncellendi.' });
      qc.invalidateQueries({ queryKey: ['me'] });
      setAuth({ ...user, full_name: name }, token);
    },
    onError: (e) => setMsg({ type: 'error', text: e.message }),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setMsg(null); mut.mutate(); }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <InputField label="Ad Soyad" icon="person" value={name} onChange={(e) => setName(e.target.value)} placeholder="Adınız Soyadınız" />
      <InputField label="E-Posta" icon="mail" value={user?.email || ''} disabled readOnly style={{ opacity: 0.45, cursor: 'not-allowed' }} />
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
      <div>
        <PrimaryBtn type="submit" disabled={mut.isPending || name === user?.full_name}>
          {mut.isPending
            ? <svg style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>}
          Kaydet
        </PrimaryBtn>
      </div>
    </form>
  );
}

const AVATAR_PRESETS = [
  '/icon.svg',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Pivot1&backgroundColor=0ea5e9',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Radar2&backgroundColor=8b5cf6',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Quant3&backgroundColor=ec4899',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Term4&backgroundColor=10b981',
];

function AvatarSection({ user }) {
  const qc = useQueryClient();
  const setAuth = useAuthStore(s => s.setAuth);
  const token = useAuthStore(s => s.token);
  const [selected, setSelected] = useState(user?.profile_picture || '');
  const [msg, setMsg] = useState(null);

  const mut = useMutation({
    mutationFn: (url) => api.updateProfile({ profile_picture: url }),
    onSuccess: (_, url) => {
      setMsg({ type: 'success', text: 'Profil resminiz güncellendi.' });
      qc.invalidateQueries({ queryKey: ['me'] });
      setAuth({ ...user, profile_picture: url }, token);
    },
    onError: (e) => setMsg({ type: 'error', text: e.message }),
  });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setMsg({ type: 'error', text: 'Dosya boyutu 2MB üzerinde olamaz.' });
    const reader = new FileReader();
    reader.onloadend = () => { setSelected(reader.result); mut.mutate(reader.result); };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Current avatar preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar src={selected || null} size={72} />
        <div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: 4 }}>
            {user?.username || user?.email?.split('@')[0] || 'Kullanıcı'}
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            {selected ? 'Özel resim' : 'Varsayılan uygulama ikonu'}
          </p>
        </div>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {AVATAR_PRESETS.map((p, i) => (
          <button key={i} onClick={() => { setSelected(p); mut.mutate(p); }}
            style={{
              width: 52, height: 52, borderRadius: 12, overflow: 'hidden', padding: 0,
              border: `2px solid ${selected === p ? '#22d3ee' : 'rgba(255,255,255,0.06)'}`,
              opacity: selected === p ? 1 : 0.55,
              cursor: 'pointer', transition: 'all 0.15s', background: '#040609',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => { if (selected !== p) e.currentTarget.style.opacity = '0.55'; }}
          >
            {p === '/icon.svg'
              ? <AppIcon size={30} />
              : <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            }
          </button>
        ))}
        <label style={{
          width: 52, height: 52, borderRadius: 12, border: '2px dashed rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'border-color 0.15s', gap: 2, background: 'transparent',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(34,211,238,0.3)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
        >
          <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleFileUpload} />
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,0.25)' }}>add_photo_alternate</span>
          <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>Gözat</span>
        </label>
      </div>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
    </div>
  );
}

const PwField = ({ field, label, showKey, form, setForm, show, setShow }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <label style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)' }}>{label}</label>
    <div style={{ position: 'relative' }}>
      <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>lock</span>
      <input
        type={show[showKey] ? 'text' : 'password'}
        value={form[field]}
        onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))}
        placeholder="••••••••"
        required
        style={{ width: '100%', background: '#040609', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 42px 10px 38px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => e.target.style.borderColor = 'rgba(34,211,238,0.3)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
      />
      <button type="button" onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))}
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', padding: 0 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{show[showKey] ? 'visibility_off' : 'visibility'}</span>
      </button>
    </div>
  </div>
);

function ChangePasswordSection({ user }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState({ current: false, next: false });
  const [msg, setMsg] = useState(null);

  const mut = useMutation({
    mutationFn: () => api.changePassword(form.current, form.next),
    onSuccess: (d) => { setMsg({ type: 'success', text: d.detail }); setForm({ current: '', next: '', confirm: '' }); },
    onError: (e) => setMsg({ type: 'error', text: e.message }),
  });

  const handleSubmit = (e) => {
    e.preventDefault(); setMsg(null);
    if (form.next !== form.confirm) return setMsg({ type: 'error', text: 'Yeni şifreler eşleşmiyor.' });
    if (form.next.length < 8) return setMsg({ type: 'error', text: 'Yeni şifre en az 8 karakter olmalıdır.' });
    mut.mutate();
  };

  const hasPassword = !!user?.hashed_password;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!hasPassword && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(34,211,238,0.04)', border: '1px solid rgba(34,211,238,0.15)', borderRadius: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#22d3ee', marginTop: 1 }}>lock_open</span>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>Google ile giriş yaptınız. Yerel bir giriş şifresi oluşturarak her iki yöntemi de kullanabilirsiniz.</p>
        </div>
      )}
      {hasPassword && <PwField field="current" label="Mevcut Şifre" showKey="current" form={form} setForm={setForm} show={show} setShow={setShow} />}
      <PwField field="next" label="Yeni Şifre" showKey="next" form={form} setForm={setForm} show={show} setShow={setShow} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)' }}>Yeni Şifre (Tekrar)</label>
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none' }}>lock</span>
          <input type="password" value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} placeholder="••••••••" required
            style={{ width: '100%', background: '#040609', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 14px 10px 38px', fontSize: 13, color: '#fff', outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = 'rgba(34,211,238,0.3)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
          />
        </div>
      </div>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
      <div>
        <PrimaryBtn type="submit" disabled={mut.isPending}>
          {mut.isPending
            ? <svg style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" /><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>key</span>}
          Şifreyi Güncelle
        </PrimaryBtn>
      </div>
    </form>
  );
}

const TIMEZONES = [
  { value: 'Europe/Istanbul',    label: 'İstanbul (UTC+3)' },
  { value: 'Europe/London',      label: 'Londra (UTC+0/+1)' },
  { value: 'America/New_York',   label: 'New York (UTC-5/-4)' },
  { value: 'America/Chicago',    label: 'Chicago (UTC-6/-5)' },
  { value: 'America/Los_Angeles',label: 'Los Angeles (UTC-8/-7)' },
  { value: 'Asia/Dubai',         label: 'Dubai (UTC+4)' },
  { value: 'Asia/Singapore',     label: 'Singapur (UTC+8)' },
  { value: 'Asia/Tokyo',         label: 'Tokyo (UTC+9)' },
  { value: 'UTC',                label: 'UTC (UTC+0)' },
];

const THEMES = [
  { value: 'dark', label: 'Karanlık (Varsayılan)' },
  { value: 'dim',  label: 'Soluk Karanlık' },
];

function PreferencesSection() {
  const [tz, setTz]       = useState(() => localStorage.getItem('pr_timezone') || 'Europe/Istanbul');
  const [theme, setTheme] = useState(() => localStorage.getItem('pr_theme') || 'dark');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('pr_timezone', tz);
    localStorage.setItem('pr_theme', theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const now = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz }).format(new Date());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)' }}>Saat Dilimi</label>
        <SearchableSelect value={tz} onChange={setTz} options={TIMEZONES} icon="schedule" placeholder="Saat dilimi seçin..." />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>Şu an: {now}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)' }}>
          Tema <span style={{ fontSize: 9, color: 'rgba(251,191,36,0.55)', marginLeft: 4 }}>Yakında</span>
        </label>
        <SearchableSelect value={theme} onChange={setTheme} options={THEMES} icon="palette" disabled searchable={false} />
      </div>
      {saved && <Alert type="success">Tercihler kaydedildi.</Alert>}
      <div>
        <PrimaryBtn onClick={handleSave}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>
          Kaydet
        </PrimaryBtn>
      </div>
    </div>
  );
}

function TwoFactorSection() {
  const [status, setStatus]   = useState(null);
  const [setupData, setSetup] = useState(null);
  const [code, setCode]       = useState('');
  const [disableCode, setDC]  = useState('');
  const [msg, setMsg]         = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDisable, setSDD] = useState(false);

  React.useEffect(() => { api.twofa.status().then(s => setStatus(s)).catch(() => {}); }, []);

  const handleSetup = async () => {
    setLoading(true); setMsg(null);
    try { setSetup(await api.twofa.setup()); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setLoading(false); }
  };

  const handleConfirm = async (e) => {
    e.preventDefault(); setLoading(true); setMsg(null);
    try {
      await api.twofa.confirm(code);
      setMsg({ type: 'success', text: '2FA başarıyla etkinleştirildi.' });
      setSetup(null); setCode('');
      setStatus(s => ({ ...s, enabled: true, confirmed: true }));
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setLoading(false); }
  };

  const handleDisable = async (e) => {
    e.preventDefault(); setLoading(true); setMsg(null);
    try {
      await api.twofa.disable(disableCode);
      setMsg({ type: 'success', text: '2FA devre dışı bırakıldı.' });
      setSDD(false); setDC('');
      setStatus(s => ({ ...s, enabled: false, confirmed: false }));
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setLoading(false); }
  };

  const enabled = status?.enabled && status?.confirmed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!enabled ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fbbf24', marginTop: 1, flexShrink: 0 }}>shield</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>İki Faktörlü Kimlik Doğrulama (2FA)</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>Google Authenticator veya Authy ile hesabınızı daha güvenli hale getirin.</p>
            </div>
          </div>
          {!setupData ? (
            <div>
              <button onClick={handleSetup} disabled={loading} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
                background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
                color: '#fbbf24', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                opacity: loading ? 0.5 : 1, transition: 'background 0.15s',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>qr_code_2</span>
                {loading ? 'Yükleniyor...' : '2FA Kurulumunu Başlat'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>QR kodu uygulamanızla tarayın</p>
                <img src={setupData.qr_code} alt="2FA QR" style={{ width: 140, height: 140, borderRadius: 10, background: '#fff', padding: 8 }} />
                <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', wordBreak: 'break-all', maxWidth: 280, textAlign: 'center' }}>Gizli Anahtar: {setupData.secret}</p>
              </div>
              {setupData.backup_codes?.length > 0 && (
                <div style={{ padding: '12px 14px', background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.18)', borderRadius: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 900, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Yedek Kodlar — Kaydedin!</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {setupData.backup_codes.map((c, i) => (
                      <code key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: 4 }}>{c}</code>
                    ))}
                  </div>
                </div>
              )}
              <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <InputField label="Doğrulama Kodu (6 hane)" icon="pin"
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000" maxLength={6} />
                <div>
                  <PrimaryBtn type="submit" disabled={loading || code.length !== 6}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                    {loading ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}
                  </PrimaryBtn>
                </div>
              </form>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6ee7b7' }}>verified_user</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#6ee7b7', marginBottom: 2 }}>2FA Aktif</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Hesabınız iki faktörlü kimlik doğrulama ile korunuyor.</p>
            </div>
          </div>
          {!showDisable ? (
            <div>
              <button onClick={() => setSDD(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
                background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)',
                color: '#fca5a5', borderRadius: 8, cursor: 'pointer',
                fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'background 0.15s',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>no_encryption</span>
                2FA'yı Devre Dışı Bırak
              </button>
            </div>
          ) : (
            <form onSubmit={handleDisable} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <InputField label="Mevcut 2FA Kodu (6 hane)" icon="pin"
                value={disableCode} onChange={e => setDC(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" maxLength={6} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={loading || disableCode.length !== 6} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px',
                  background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.2)',
                  color: '#fca5a5', borderRadius: 8, cursor: 'pointer',
                  fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: (loading || disableCode.length !== 6) ? 0.5 : 1,
                }}>{loading ? 'İşleniyor...' : 'Devre Dışı Bırak'}</button>
                <button type="button" onClick={() => { setSDD(false); setDC(''); }} style={{
                  padding: '9px 14px', border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.35)', borderRadius: 8, cursor: 'pointer', background: 'transparent',
                  fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>İptal</button>
              </div>
            </form>
          )}
        </div>
      )}
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
    </div>
  );
}

function ApiKeysSection() {
  const [keys, setKeys]       = useState([]);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey]   = useState(null);
  const [msg, setMsg]         = useState(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => { api.apiKeys.list().then(d => setKeys(Array.isArray(d) ? d : [])).catch(() => {}); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true); setMsg(null);
    try {
      const d = await api.apiKeys.create(newName.trim());
      setNewKey(d.key);
      setKeys(prev => [...prev, { id: d.id, name: d.name, key_prefix: d.key_prefix, created_at: d.created_at, is_active: true }]);
      setNewName('');
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    try { await api.apiKeys.delete(id); setKeys(prev => prev.filter(k => k.id !== id)); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
        API anahtarları ile uygulamalarınızı PivotRadar'a{' '}
        <code style={{ color: 'rgba(34,211,238,0.7)', background: 'rgba(34,211,238,0.07)', padding: '1px 5px', borderRadius: 3 }}>X-API-Key</code>
        {' '}başlığı üzerinden bağlayabilirsiniz.
      </p>

      {newKey && (
        <div style={{ padding: '12px 14px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 10, fontWeight: 900, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Yeni Anahtar — Şimdi Kopyalayın!</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Bu anahtar bir daha gösterilmeyecek.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, color: '#6ee7b7', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6, wordBreak: 'break-all' }}>{newKey}</code>
            <button onClick={() => navigator.clipboard?.writeText(newKey)}
              style={{ padding: 6, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', display: 'block' }}>content_copy</span>
            </button>
          </div>
          <button onClick={() => setNewKey(null)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>Gizle</button>
        </div>
      )}

      {keys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {keys.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{k.name}</p>
                <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.28)' }}>{k.key_prefix}••••••••</p>
              </div>
              <button onClick={() => handleDelete(k.id)} style={{ padding: '5px 8px', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 6, cursor: 'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fca5a5', display: 'block' }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Anahtar adı (ör. Algo Bot)"
          style={{ flex: 1, background: '#040609', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '9px 14px', fontSize: 12, color: '#fff', outline: 'none' }}
          onFocus={e => e.target.style.borderColor = 'rgba(34,211,238,0.3)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.07)'}
        />
        <PrimaryBtn type="submit" disabled={loading || !newName.trim()}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          Oluştur
        </PrimaryBtn>
      </form>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}
    </div>
  );
}

function DangerZoneSection() {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading]     = useState(false);
  const logout   = useAuthStore(s => s.logout);
  const navigate = useNavigate();

  const handleDelete = async () => {
    setLoading(true);
    try { await api.deleteAccount(); logout(); navigate('/'); }
    catch (err) { alert(`Silme hatası: ${err.message}`); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '14px 16px', background: 'rgba(248,113,113,0.03)', border: '1px solid rgba(248,113,113,0.1)', borderRadius: 8 }}>
        <p style={{ fontSize: 13, color: '#fca5a5', fontWeight: 700, marginBottom: 6 }}>Hesabı Kalıcı Olarak Sil</p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 14 }}>
          Verileriniz (portföy, takip listeleri) sunucularımızdan tamamen temizlenecektir.
        </p>
        <button onClick={() => setShowModal(true)} style={{
          padding: '8px 18px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
          color: '#fca5a5', borderRadius: 8, cursor: 'pointer',
          fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.18)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; }}
        >Hesabımı Sil</button>
      </div>
      {createPortal(
        <AnimatePresence>
          {showModal && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowModal(false)}
                style={{ position: 'absolute', inset: 0, background: 'rgba(2,4,10,0.85)', backdropFilter: 'blur(8px)' }} />
              <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
                style={{ position: 'relative', width: '100%', maxWidth: 340, background: '#0a0d14', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.8)' }}>
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', transform: 'rotate(3deg)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#f87171' }}>report</span>
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Hesabı Sil?</h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 24 }}>
                    Bu işlem <strong style={{ color: 'rgba(255,255,255,0.65)' }}>kalıcıdır</strong> ve geri alınamaz. Tüm portföy verileriniz anında silinir.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button onClick={handleDelete} disabled={loading} style={{ padding: '14px', borderRadius: 10, background: '#ef4444', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: loading ? 0.6 : 1 }}>
                      {loading ? 'SİLİNİYOR...' : 'EVET, KALICI OLARAK SİL'}
                    </button>
                    <button onClick={() => setShowModal(false)} style={{ padding: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em' }}>VAZGEÇ</button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

// ── Profile header ────────────────────────────────────────────────────────────
function ProfileHeader({ user }) {
  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      background: 'linear-gradient(135deg, #060c18 0%, #040812 100%)',
      border: '1px solid rgba(34,211,238,0.1)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      position: 'relative',
    }}>
      {/* top glow strip */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.35), transparent)' }} />
      <div style={{ padding: '24px 24px 20px', display: 'flex', alignItems: 'center', gap: 18 }}>
        <Avatar src={user?.profile_picture || null} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '0.02em', margin: 0 }}>
              {user?.full_name || user?.username || 'Kullanıcı'}
            </h1>
            {user?.is_superuser && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.18)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11, color: '#a78bfa' }}>shield</span>
                <span style={{ fontSize: 9, fontWeight: 900, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Admin</span>
              </div>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </p>
          {user?.username && user?.username !== user?.email?.split('@')[0] && (
            <p style={{ fontSize: 11, color: 'rgba(34,211,238,0.5)', marginTop: 2 }}>@{user.username}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const storeUser = useAuthStore(s => s.user);
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.ping().then(() => api.me()),
    staleTime: 60_000,
  });

  const user = me || storeUser;

  const sections = [
    { delay: 0.05, title: 'Hesap Ayarları',                icon: 'person',        content: <ProfileNameSection user={user} /> },
    { delay: 0.10, title: 'Profil Resmi',                  icon: 'account_circle', content: <AvatarSection user={user} /> },
    { delay: 0.15, title: 'Şifre Değiştir',                icon: 'key',           content: <ChangePasswordSection user={user} /> },
    { delay: 0.20, title: 'Tercihler',                     icon: 'tune',          content: <PreferencesSection /> },
    { delay: 0.25, title: 'İki Faktörlü Doğrulama',        icon: 'security',      content: <TwoFactorSection /> },
    { delay: 0.30, title: 'API Anahtarları',               icon: 'vpn_key',       content: <ApiKeysSection /> },
    { delay: 0.35, title: 'Tehlikeli Bölge',               icon: 'report',        content: <DangerZoneSection /> },
  ];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 4px 80px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        <ProfileHeader user={user} />
      </motion.div>

      {sections.map(({ delay, title, icon, content }) => (
        <motion.div key={title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.2 }}>
          <Section title={title} icon={icon}>{content}</Section>
        </motion.div>
      ))}
    </div>
  );
}
