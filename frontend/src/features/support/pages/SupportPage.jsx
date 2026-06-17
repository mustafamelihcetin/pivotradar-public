// frontend/src/features/support/pages/SupportPage.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { api } from '@/core/api/client';
import { SearchableSelect } from '@/shared/components/SearchableSelect';

const FAQ = [
  { q: 'PivotRadar nedir?', a: 'BIST hisselerini algoritmik olarak analiz eden matematiksel karar destek yazılımıdır. Yatırım tavsiyesi vermez; SPK lisanslı değildir.' },
  { q: 'QRS Skoru nasıl hesaplanır?', a: 'RSI, EMA, ATR, hacim rasyo ve volatilite göstergelerinin profil ağırlıklarıyla birleştirilmesi + ML blend sonucu üretilir. 0–100 arası sayısal bir değerdir.' },
  { q: 'Veriler ne kadar gecikmeli?', a: 'Yahoo Finance altyapısı üzerinden yaklaşık 15 dakika gecikmeli BIST verileri kullanılmaktadır.' },
  { q: 'Profiller arasındaki fark nedir?', a: 'Her profil indikatör ağırlıklarını ve risk eşiklerini farklı kalibre eder. Örneğin "Dönüş Uzmanı" RSI>52 koşulunda skoru 62 ile tavanlayarak aşırı ısınmış hisseleri filtreler.' },
  { q: 'Hangi piyasaları destekliyor?', a: 'Ağırlıklı olarak BIST (Borsa İstanbul) hisselerini destekler. Temel döviz kurları ve emtia verileri de görüntülenebilir.' },
  { q: 'Portföy K/Z hesaplamaları doğru mu?', a: 'Girdiğiniz ortalama maliyet üzerinden anlık fiyatlarla hesaplanır. Aracı kurum komisyonları dahil değildir.' },
  { q: 'ML modeli ne zaman güncelleniyor?', a: 'Her Pazar günü HistGradientBoosting modeli otomatik yeniden eğitim döngüsüne girer. Son 3 model versiyonu saklanır.' },
];

export default function SupportPage() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: 'Teknik Destek', message: '' });
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [openFaq, setOpenFaq] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    try {
      await api.submitSupportMessage(formData);
      setStatus('success');
      setFormData({ name: '', email: '', subject: 'Teknik Destek', message: '' });
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Mesaj iletilemedi.');
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#05070a', color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Helmet>
        <title>Destek & İletişim | PivotRadar</title>
        <meta name="description" content="PivotRadar teknik destek, soru ve geri bildirim formu. Sıkça sorulan sorular." />
        <link rel="canonical" href="https://pivot-radar.com/support" />
      </Helmet>

      {/* Top nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(5,7,10,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 20px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 2, height: 16, borderRadius: 1, background: '#99f7ff', boxShadow: '0 0 6px rgba(153,247,255,0.5)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>Destek & İletişim</span>
          </div>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_back</span>
            Ana Sayfa
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 60px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}
        className="support-grid"
      >
        <style>{`@media (max-width: 860px) { .support-grid { grid-template-columns: 1fr !important; } }`}</style>

        {/* ── LEFT: Contact form ── */}
        <div>
          {/* Header */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'rgba(255,255,255,0.88)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>
              İletişim Formu
            </h1>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
              Teknik sorun, özellik önerisi veya geri bildiriminiz için mesaj gönderin.
            </p>
          </div>

          {/* Contact cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 16 }}>
            {[
              { icon: 'mail', label: 'Resmi E-Posta', value: 'info@pivotradar.net', color: '#99f7ff' },
              { icon: 'support_agent', label: 'Teknik Destek', value: 'destek@pivotradar.net', color: '#34d399' },
            ].map(item => (
              <div key={item.label} style={{ padding: '10px 12px', background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: item.color, flexShrink: 0 }}>{item.icon}</span>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 900, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>{item.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', fontFamily: "'Inter', sans-serif" }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Form */}
          <div style={{ background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(153,247,255,0.4), transparent)' }} />
            <div style={{ padding: '16px' }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 8, fontWeight: 900, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>Adınız Soyadınız</label>
                    <input
                      required
                      placeholder="Ad Soyad"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,0.75)', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                      onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.3)'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 8, fontWeight: 900, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>E-Posta</label>
                    <input
                      required
                      type="email"
                      placeholder="ornek@eposta.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,0.75)', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                      onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.3)'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 8, fontWeight: 900, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>Talep Konusu</label>
                  <SearchableSelect
                    value={formData.subject}
                    onChange={val => setFormData({ ...formData, subject: val })}
                    options={[
                      { value: 'Teknik Destek',   label: 'Teknik Destek',                icon: 'headphones' },
                      { value: 'Hata Bildirimi',  label: 'Sistem Hatası (Bug)',           icon: 'bug_report' },
                      { value: 'Özellik Talebi',  label: 'Yeni Özellik Önerisi',          icon: 'lightbulb' },
                      { value: 'Hukuki / Veri',   label: 'Hukuki Görüş / Veri Doğruluğu', icon: 'gavel' },
                    ]}
                    searchable={false}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 8, fontWeight: 900, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>Mesaj Detayı</label>
                  <textarea
                    required
                    rows={5}
                    placeholder="Sorununuzu veya önerinizi buraya detaylıca yazın..."
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,0.75)', outline: 'none', resize: 'none', fontFamily: "'Inter', sans-serif", lineHeight: 1.6, boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                    onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.3)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: status === 'loading' ? 'rgba(153,247,255,0.06)' : 'rgba(153,247,255,0.1)', border: '1px solid rgba(153,247,255,0.3)', borderRadius: 4, cursor: status === 'loading' ? 'not-allowed' : 'pointer', color: '#99f7ff', fontSize: 9, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.14em', textTransform: 'uppercase', transition: 'all 0.15s', opacity: status === 'loading' ? 0.6 : 1 }}
                    onMouseEnter={e => { if (status !== 'loading') e.currentTarget.style.background = 'rgba(153,247,255,0.16)'; }}
                    onMouseLeave={e => { if (status !== 'loading') e.currentTarget.style.background = 'rgba(153,247,255,0.1)'; }}
                  >
                    {status === 'loading' ? (
                      <div style={{ width: 12, height: 12, border: '2px solid rgba(153,247,255,0.2)', borderTopColor: '#99f7ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>send</span>
                    )}
                    Talebi İlet
                  </button>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

                  <AnimatePresence>
                    {status === 'success' && (
                      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 900, color: '#34d399', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                        Mesajınız Alındı
                      </motion.div>
                    )}
                    {status === 'error' && (
                      <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 900, color: '#f87171', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                        {errorMsg}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ── RIGHT: FAQ + Info cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Legal warning */}
          <div style={{ padding: '12px 14px', background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 4, display: 'flex', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f87171', flexShrink: 0, marginTop: 1 }}>gavel</span>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, color: 'rgba(248,113,113,0.8)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 3 }}>Hukuki Bildirim</div>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
                PivotRadar yatırım tavsiyesi vermez. Tüm analizler teknik ve matematiksel algoritmalara dayalıdır. SPK lisanslı değiliz.
              </p>
            </div>
          </div>

          {/* System status */}
          <div style={{ padding: '12px 14px', background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 10 }}>Sistem Bilgisi</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { icon: 'memory', label: 'Analiz Motoru',   value: 'PRISM Core v6',             color: '#a78bfa' },
                { icon: 'storage', label: 'Altyapı',        value: 'FastAPI · PostgreSQL · Redis', color: '#7dd3fc' },
                { icon: 'candlestick_chart', label: 'Veri', value: 'Yahoo Finance (~15dk)',       color: '#fbbf24' },
                { icon: 'model_training', label: 'ML Model', value: 'HistGradientBoosting',       color: '#34d399' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: row.color, flexShrink: 0, width: 16 }}>{row.icon}</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", width: 80, flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <div style={{ background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(153,247,255,0.3), transparent)' }} />
            <div style={{ padding: '12px 14px 6px' }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 10 }}>Sıkça Sorulanlar</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {FAQ.map(item => {
                  const isOpen = openFaq === item.q;
                  return (
                    <div
                      key={item.q}
                      style={{ borderRadius: 3, overflow: 'hidden', border: `1px solid ${isOpen ? 'rgba(153,247,255,0.12)' : 'rgba(255,255,255,0.04)'}`, transition: 'border-color 0.15s' }}
                    >
                      <button
                        onClick={() => setOpenFaq(isOpen ? null : item.q)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: isOpen ? 'rgba(153,247,255,0.04)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: isOpen ? 'rgba(153,247,255,0.9)' : 'rgba(255,255,255,0.55)', fontFamily: "'Inter', sans-serif", lineHeight: 1.4 }}>{item.q}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>expand_more</span>
                      </button>
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                            <div style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              <p style={{ paddingTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif", borderLeft: '2px solid rgba(153,247,255,0.2)', paddingLeft: 8, marginLeft: 2 }}>{item.a}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: '10px 14px 14px' }}>
              <Link
                to="/help"
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, color: 'rgba(153,247,255,0.5)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = '#99f7ff'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(153,247,255,0.5)'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>menu_book</span>
                Tam Dokümantasyon
              </Link>
            </div>
          </div>

          {/* Footer links */}
          <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
            <Link to="/legal/kvkk" style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>KVKK</Link>
            <Link to="/legal/terms" style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>Kullanım Şartları</Link>
            <Link to="/legal/privacy" style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>Gizlilik</Link>
          </div>
        </div>

      </div>
    </div>
  );
}
