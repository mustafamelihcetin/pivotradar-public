import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '@/store/useAuthStore';
import { aFetch, Spinner, SectionTitle, Btn, T, notify, relTime } from './shared';

const STRATEGY_MAP = {
  'Dengeli': 'Güvenli Liman',
  'Konservatif': 'Güvenli Liman',
  'Dengeli Strateji': 'Güvenli Liman',
  'Agresif': 'Agresif Atak',
  'Swing': 'Dönüş Uzmanı',
  'Trend': 'Trend Avcısı',
  'Deger': 'Değer Kaşifi',
  'Scalper': 'Anlık Fırsatçı',
  'Kirilim': 'Kırılım Dedektörü'
};

const STRATEGY_OPTIONS = ['Güvenli Liman', 'Agresif Atak', 'Dönüş Uzmanı', 'Trend Avcısı', 'Değer Kaşifi', 'Anlık Fırsatçı', 'Kırılım Dedektörü'];

const STRATEGY_COLORS = {
  'Güvenli Liman': '#22d3ee',
  'Agresif Atak': '#f87171',
  'Dönüş Uzmanı': '#34d399',
  'Trend Avcısı': '#fbbf24',
  'Değer Kaşifi': '#a5f3fc',
  'Anlık Fırsatçı': '#fb923c',
  'Kırılım Dedektörü': '#a855f7'
};

const R = 6;

// ── UserRow ───────────────────────────────────────────────────────────────────
function UserRow({ u, qc }) {
  const [open, setOpen]               = useState(false);
  const [delConfirm, setDelConfirm]   = useState(false);
  const [superConfirm, setSuperConfirm] = useState(false);
  const [tempPw, setTempPw]           = useState(null);
  const [busy, setBusy]               = useState(false);

  const rawStrategy = u.strategy_profile_name || u.settings?.profile_name || null;
  const strategy    = STRATEGY_MAP[rawStrategy] || rawStrategy;
  const stratColor  = STRATEGY_COLORS[strategy] || 'rgba(255,255,255,0.3)';

  const act = async (path, method = 'PATCH') => {
    setBusy(true);
    try {
      const res = await aFetch(path, { method });
      qc.invalidateQueries({ queryKey: ['a-users'] });
      qc.invalidateQueries({ queryKey: ['a-stats'] });
      return res;
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!delConfirm) { setDelConfirm(true); return; }
    try {
      await aFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['a-users'] });
      notify('Kullanıcı hesabı silindi.', 'success');
    } catch { notify('Hesap silinemedi.', 'error'); }
    setDelConfirm(false);
  };

  const handleResetPw = async () => {
    try {
      const res = await aFetch(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' });
      setTempPw(res.temp_password);
      if (res.email_sent) notify('Geçici şifre oluşturuldu ve kullanıcıya e-posta gönderildi.', 'success');
      else notify('Geçici şifre oluşturuldu (E-posta gönderilemedi).', 'warning');
    } catch { notify('Şifre sıfırlanamadı.', 'error'); }
  };

  const handleStrategy = async (s) => {
    await act(`/api/admin/users/${u.id}/strategy?strategy=${encodeURIComponent(s)}`);
    notify(`Tarama stratejisi "${s}" olarak güncellendi.`, 'success');
  };

  return (
    <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', overflow: 'hidden', transition: 'border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = `${stratColor}20`}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      {/* Main row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0, background: `${stratColor}08`, border: `1px solid ${stratColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: 'transform 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {u.profile_picture
              ? <img src={u.profile_picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 20, fontWeight: 900, color: stratColor }}>{(u.full_name || u.email || '?')[0].toUpperCase()}</span>
            }
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.01em' }}>{u.email}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {u.is_superuser && <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 7px', borderRadius: 5, background: 'rgba(168,85,247,0.1)', color: T.purple, border: '1px solid rgba(168,85,247,0.1)' }}>YÖNETİCİ</span>}
                {u.is_active
                  ? <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,211,153,0.08)', color: T.success, border: '1px solid rgba(52,211,153,0.12)' }}>AKTİF</span>
                  : <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 7px', borderRadius: 5, background: 'rgba(248,113,113,0.08)', color: T.danger, border: '1px solid rgba(248,113,113,0.12)' }}>ERİŞİM KAPALI</span>
                }
              </div>
              {strategy && (
                <span style={{ fontSize: 8, fontWeight: 900, padding: '2px 9px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.12em', background: `${stratColor}15`, color: stratColor, border: `1px solid ${stratColor}30` }}>
                  {strategy}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.1)', fontFamily: "'IBM Plex Mono', monospace" }}>#{String(u.id).slice(0, 8)}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.15)' }}>{u.full_name || 'İSİMSİZ'}</span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', fontFamily: "'IBM Plex Mono', monospace" }}>Kayıt: {u.created_at ? new Date(u.created_at).toLocaleDateString('tr-TR') : '—'}</span>
              <span style={{ fontSize: 8, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", padding: '2px 7px', borderRadius: 4, background: u.last_active_at ? 'rgba(153,247,255,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${u.last_active_at ? 'rgba(153,247,255,0.14)' : 'rgba(255,255,255,0.04)'}`, color: u.last_active_at ? 'rgba(153,247,255,0.6)' : 'rgba(255,255,255,0.2)' }}>
                Son Giriş: {u.last_active_at ? relTime(u.last_active_at) : 'Hiç'}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <Btn variant={u.is_active ? 'danger' : 'success'} disabled={busy}
              onClick={() => act(`/api/admin/users/${u.id}/active?value=${!u.is_active}`)}
              title={u.is_active ? 'Bu kullanıcının sisteme erişimini kapat' : 'Bu kullanıcıya tekrar erişim ver'}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{u.is_active ? 'block' : 'check_circle'}</span>
              <span style={{ fontSize: 9 }}>{u.is_active ? 'ERİŞİMİ KAPAT' : 'ERİŞİM VER'}</span>
            </Btn>

            {/* Icon buttons group */}
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, padding: 4, gap: 4 }}>
              <button disabled={busy} onClick={handleResetPw} title="Geçici şifre oluştur ve kullanıcıya gönder"
                style={{ width: 28, height: 28, borderRadius: 5, background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.color = T.warning; e.currentTarget.style.background = 'rgba(251,191,36,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'none'; }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>key</span>
              </button>

              {superConfirm ? (
                <button disabled={busy} onClick={() => {
                  act(`/api/admin/users/${u.id}/superuser?value=${!u.is_superuser}`);
                  setSuperConfirm(false);
                  notify(u.is_superuser ? 'Yönetici yetkisi kaldırıldı.' : 'Yönetici yetkisi verildi.', 'success');
                }}
                  style={{ height: 28, padding: '0 8px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4, color: T.purple, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                  Emin misiniz?
                </button>
              ) : (
                <button disabled={busy} onClick={() => setSuperConfirm(true)} title={u.is_superuser ? 'Yönetici yetkisini kaldır' : 'Yönetici yetkisi ver (admin paneline erişim)'}
                  style={{ width: 28, height: 28, borderRadius: 5, background: u.is_superuser ? 'rgba(168,85,247,0.1)' : 'none', border: 'none', color: u.is_superuser ? T.purple : 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                  onMouseEnter={e => { if (!u.is_superuser) { e.currentTarget.style.color = T.purple; e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; } }}
                  onMouseLeave={e => { if (!u.is_superuser) { e.currentTarget.style.color = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'none'; } }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>shield</span>
                </button>
              )}

              {delConfirm ? (
                <button disabled={busy} onClick={handleDelete}
                  style={{ height: 28, padding: '0 8px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 4, color: T.danger, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                  Kalıcı Sil
                </button>
              ) : (
                <button disabled={busy} onClick={handleDelete} title="Hesabı kalıcı olarak sil — geri alınamaz"
                  style={{ width: 28, height: 28, borderRadius: 5, background: 'none', border: 'none', color: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = T.danger; e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'none'; }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                </button>
              )}
            </div>

            <button onClick={() => { setOpen(o => !o); setDelConfirm(false); setSuperConfirm(false); setTempPw(null); }}
              title="Kullanıcı detaylarını ve ayarlarını göster/gizle"
              style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'all 0.14s' }}
              onMouseEnter={e => { e.currentTarget.style.color = T.primary; e.currentTarget.style.borderColor = 'rgba(153,247,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, transition: 'transform 0.25s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* Temp password reveal */}
      {tempPw && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
          style={{ margin: '0 24px 20px', display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 10, background: 'rgba(251,191,36,0.03)', border: '1px solid rgba(251,191,36,0.1)' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(251,191,36,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(251,191,36,0.1)', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.warning }}>key_visualizer</span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(251,191,36,0.4)', margin: '0 0 4px' }}>Geçici Şifre Oluşturuldu</p>
            <p style={{ fontSize: 15, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: '#fef08a', letterSpacing: '0.12em', margin: '0 0 2px' }}>{tempPw}</p>
            <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', margin: 0, lineHeight: 1.5 }}>Kullanıcı bu şifreyle giriş yapıp yeni şifre belirleyebilir.</p>
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(tempPw); notify('Şifre panoya kopyalandı.', 'success'); }}
            style={{ padding: '8px 14px', borderRadius: 5, background: T.warning, border: 'none', color: '#000', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
            KOPYALA
          </button>
        </motion.div>
      )}

      {/* Expandable config */}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Strategy selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.1)', margin: '0 0 4px' }}>Tarama Stratejisi Profili</p>
                    <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: '0 0 8px', lineHeight: 1.5 }}>
                      Kullanıcının hangi tarama profilini kullanacağını belirler. Her profil farklı hisse filtresi ve risk toleransı uygular.
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {STRATEGY_OPTIONS.map(s => {
                      const col    = STRATEGY_COLORS[s] || '#fff';
                      const active = (strategy || '') === s;
                      return (
                        <button key={s} onClick={() => handleStrategy(s)} disabled={busy}
                          style={{ padding: '7px 14px', borderRadius: 8, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: busy ? 'not-allowed' : 'pointer', background: active ? `${col}12` : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? col + '30' : 'rgba(255,255,255,0.04)'}`, color: active ? col : 'rgba(255,255,255,0.25)', fontFamily: 'inherit', transition: 'all 0.14s', position: 'relative', overflow: 'hidden' }}>
                          {active && <motion.div layoutId={`user-strat-${u.id}`} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: col }} />}
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Settings grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.1)', margin: '0 0 4px' }}>Kullanıcı Tercih Ayarları</p>
                    <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: '0 0 8px', lineHeight: 1.5 }}>
                      Kullanıcının kendi hesabında kaydettiği tercihler (salt okunur).
                    </p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      {
                        label: 'Uzman Modu',
                        value: u.settings?.expert_mode ? 'AÇIK' : 'KAPALI',
                        color: u.settings?.expert_mode ? T.primary : 'rgba(255,255,255,0.2)',
                        hint: 'Gelişmiş filtreler ve ham veri gösterimi etkinleştirir',
                      },
                      { label: 'Tema Tercihi',  value: u.settings?.theme?.toUpperCase() || 'DARK',      color: 'rgba(255,255,255,0.4)', hint: null },
                      { label: 'Bildirimler',   value: u.settings?.notifications ? 'AKTİF' : 'PASİF',  color: u.settings?.notifications ? T.success : 'rgba(255,255,255,0.2)', hint: null },
                      { label: 'Tarama Sonucu Limiti', value: String(u.settings?.topN || 'STANDART'), color: T.purple, hint: 'Gösterilecek maksimum hisse sayısı' },
                    ].map(row => (
                      <div key={row.label} style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                      >
                        <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.1)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 900, margin: '0 0 4px' }}>{row.label}</p>
                        <p style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: row.color, margin: 0 }}>{row.value}</p>
                        {row.hint && <p style={{ fontSize: 7, color: 'rgba(255,255,255,0.1)', margin: '2px 0 0', lineHeight: 1.4 }}>{row.hint}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                <button disabled={busy} onClick={() => act(`/api/admin/users/${u.id}/reset-cooldown`, 'POST')}
                  title="Kullanıcının tarama bekleme süresini sıfırla — hemen yeni tarama başlatabilir"
                  style={{ padding: '7px 14px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.14s' }}
                  onMouseEnter={e => { if (!busy) { e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restart_alt</span>
                  BEKLEME SÜRESİNİ SIFIRLA
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ReportCard ────────────────────────────────────────────────────────────────
const SRC_STYLES = {
  app_report: { label: 'Sorun Bildirimi', dotColor: '#fbbf24', pillBg: 'rgba(251,191,36,0.07)', pillBorder: 'rgba(245,158,11,0.2)', pillColor: '#fbbf24' },
  contact:    { label: 'İletişim Formu',  dotColor: '#38bdf8', pillBg: 'rgba(56,189,248,0.07)', pillBorder: 'rgba(14,165,233,0.2)',  pillColor: '#38bdf8' },
};

function ReportCard({ m, onRead }) {
  const [open, setOpen] = useState(false);
  const src = SRC_STYLES[m.source] || SRC_STYLES.contact;

  return (
    <motion.div layout style={{ borderRadius: R, border: `1px solid ${m.is_read ? 'rgba(255,255,255,0.04)' : 'rgba(245,158,11,0.15)'}`, background: m.is_read ? 'rgba(0,0,0,0.25)' : 'rgba(245,158,11,0.015)', overflow: 'hidden', transition: 'all 0.15s' }}>
      <button onClick={() => { setOpen(o => !o); if (!m.is_read) onRead(m.id); }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {!m.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: src.dotColor, flexShrink: 0 }} />}
        <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '3px 8px', borderRadius: 4, background: src.pillBg, border: `1px solid ${src.pillBorder}`, color: src.pillColor, flexShrink: 0 }}>
          {src.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: m.is_read ? 400 : 700, color: m.is_read ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 0 2px' }}>{m.subject}</p>
          <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email} · {relTime(m.created_at)}</p>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,0.15)', flexShrink: 0, transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '8px 20px 18px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', margin: 0 }}>{m.name} · {new Date(m.created_at).toLocaleString('tr-TR')}</p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{m.message}</p>
              {!m.is_read && (
                <button onClick={() => onRead(m.id)}
                  style={{ alignSelf: 'flex-start', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(153,247,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.color = T.primary}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(153,247,255,0.5)'}
                >
                  Okundu Olarak İşaretle
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── ReportsSection ────────────────────────────────────────────────────────────
function ReportsSection({ qc }) {
  const [srcFilter, setSrcFilter] = useState('all');

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ['admin-reports', srcFilter],
    queryFn: ({ signal }) => {
      const p = new URLSearchParams();
      if (srcFilter !== 'all') p.set('source', srcFilter);
      return aFetch(`/api/support/messages?${p}`, { signal });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id) => aFetch(`/api/support/messages/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  });

  const unread  = msgs.filter(m => !m.is_read).length;
  const FILTERS = [{ val: 'all', label: 'Tümü' }, { val: 'app_report', label: 'Sorun Bildirimi' }, { val: 'contact', label: 'İletişim' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: T.warning }}>flag</span>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>Kullanıcı Geri Bildirimleri</p>
            <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)', margin: 0 }}>
              {msgs.length} mesaj{unread > 0 && ` · ${unread} okunmamış`}
            </p>
          </div>
          {unread > 0 && (
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 9, fontWeight: 900, color: T.warning, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          {FILTERS.map(f => (
            <button key={f.val} onClick={() => setSrcFilter(f.val)}
              style={{ padding: '6px 14px', borderRadius: 7, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s', background: srcFilter === f.val ? 'rgba(255,255,255,0.07)' : 'none', border: srcFilter === f.val ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent', color: srcFilter === f.val ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : msgs.length === 0 ? (
        <div style={{ padding: '64px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, border: '1px dashed rgba(255,255,255,0.04)', borderRadius: R }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(255,255,255,0.06)' }}>inbox</span>
          <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.12)', margin: 0 }}>Henüz gelen kullanıcı bildirimi yok</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.map(m => <ReportCard key={m.id} m={m} onRead={(id) => markRead.mutate(id)} />)}
        </div>
      )}
    </div>
  );
}

// ── Pagination button ─────────────────────────────────────────────────────────
function PagBtn({ icon, disabled, onClick }) {
  return (
    <button disabled={disabled} onClick={onClick}
      style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.14s' }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)'; }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
    </button>
  );
}

// ── UsersTab ──────────────────────────────────────────────────────────────────
export function UsersTab() {
  const qc     = useQueryClient();
  const [page, setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['a-users', page, search],
    queryFn: ({ signal }) => aFetch(`/api/admin/users?page=${page}&per_page=50&q=${encodeURIComponent(search)}`, { signal }),
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });

  const { data: statsData } = useQuery({
    queryKey: ['a-stats'],
    queryFn: () => aFetch('/api/admin/stats'),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const u = statsData?.users || {};

  if (isLoading && !data) return (
    <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
      {error ? <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: T.danger }}>Hata: {error.message}</p> : <Spinner />}
    </div>
  );

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch('/api/admin/users/export', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'pivotradar_users.csv';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { notify('Dışa aktarma başarısız.', 'error'); }
    finally { setExporting(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Sayfa başlığı ── */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>Kullanıcı Yönetimi</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
          Sisteme kayıtlı tüm kullanıcıları görüntüleyin, yönetin ve yapılandırın.
        </p>
      </div>

      {/* ── Özet kartlar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div style={{ padding: '14px 16px', borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2 }}>
          <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', margin: '0 0 6px' }}>Toplam Üye</p>
          <p style={{ fontSize: 24, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.85)', margin: '0 0 2px' }}>{u.total ?? data?.total ?? '—'}</p>
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: 0 }}>Tüm kayıtlı hesaplar</p>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2 }}>
          <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', margin: '0 0 6px' }}>Aktif Üye</p>
          <p style={{ fontSize: 24, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.success, margin: '0 0 2px' }}>{u.active ?? '—'}</p>
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: 0 }}>Erişimi açık hesaplar</p>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2 }}>
          <p style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', margin: '0 0 6px' }}>Yönetici Sayısı</p>
          <p style={{ fontSize: 24, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.purple, margin: '0 0 2px' }}>{u.superusers ?? '—'}</p>
          <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: 0 }}>Admin paneline erişimi olan</p>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SectionTitle icon="group" title={`Kullanıcı Listesi (${data?.total ?? 0})`} />
          <button onClick={handleExport} disabled={exporting}
            style={{ padding: '7px 14px', borderRadius: 5, background: 'rgba(153,247,255,0.07)', border: '1px solid rgba(153,247,255,0.2)', color: T.primary, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.5 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.14s' }}
            onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = 'rgba(153,247,255,0.12)'; }}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(153,247,255,0.07)'}
            title="Tüm kullanıcı listesini CSV dosyası olarak indir"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, animation: exporting ? 'spin 1s linear infinite' : 'none' }}>{exporting ? 'sync' : 'download'}</span>
            {exporting ? 'İNDİRİLİYOR...' : 'CSV İNDİR'}
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 300, position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'rgba(255,255,255,0.2)', pointerEvents: 'none', transition: 'color 0.15s' }}>search</span>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="E-posta veya isimle ara..."
            style={{ width: '100%', height: 46, paddingLeft: 44, paddingRight: 16, borderRadius: R, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.8)', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.3)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
          />
        </div>
      </div>

      {/* User list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflowY: 'auto' }} className="custom-scrollbar">
        {data?.items?.map(u => <UserRow key={u.id} u={u} qc={qc} />)}
        {data?.items?.length === 0 && (
          <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, border: '1px dashed rgba(255,255,255,0.04)', borderRadius: R }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(255,255,255,0.04)' }}>person_off</span>
            <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.35em', color: 'rgba(255,255,255,0.08)', margin: 0 }}>Arama kriterine uyan kullanıcı bulunamadı</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingTop: 20 }}>
          <PagBtn icon="first_page"    disabled={page <= 1}          onClick={() => setPage(1)} />
          <PagBtn icon="chevron_left"  disabled={page <= 1}          onClick={() => setPage(p => p - 1)} />
          <div style={{ padding: '0 20px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', minWidth: 80, justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>{page} / {data.pages}</span>
          </div>
          <PagBtn icon="chevron_right" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} />
          <PagBtn icon="last_page"     disabled={page >= data.pages} onClick={() => setPage(data.pages)} />
        </div>
      )}

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }} />
        <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', color: 'rgba(255,255,255,0.1)', padding: '0 8px', whiteSpace: 'nowrap' }}>Kullanıcı Geri Bildirimleri & Raporları</span>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)' }} />
      </div>

      <ReportsSection qc={qc} />
    </div>
  );
}
