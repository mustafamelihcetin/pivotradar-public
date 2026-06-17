import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('pivotradar_cookie_consent')) setIsVisible(true);
  }, []);

  const save = (analyticsVal) => {
    localStorage.setItem('pivotradar_cookie_consent', JSON.stringify({
      necessary: true, analytics: analyticsVal, timestamp: new Date().toISOString(),
    }));
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: 'fixed', bottom: 16, left: 16, right: 16,
          zIndex: 9999, maxWidth: 820, margin: '0 auto',
        }}
      >
        <div style={{
          background: '#07090e',
          border: '1px solid rgba(153,247,255,0.12)',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 20px 60px rgba(0,0,0,0.7)',
        }}>
          {/* Top accent */}
          <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(153,247,255,0.5), transparent)' }} />

          <div style={{ padding: '14px 16px' }}>
            {/* Main row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {/* Left: icon + text */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 4, flexShrink: 0,
                  background: 'rgba(153,247,255,0.06)',
                  border: '1px solid rgba(153,247,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#99f7ff' }}>cookie</span>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>
                    Çerez Tercihleri
                  </div>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, lineHeight: 1.5, fontFamily: "'Inter', sans-serif" }}>
                    Oturum ve analiz için çerezler kullanıyoruz.{' '}
                    <Link to="/legal/kvkk" style={{ color: 'rgba(153,247,255,0.6)', textDecoration: 'none' }}>Gizlilik Politikası</Link>
                  </p>
                </div>
              </div>

              {/* Right: buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => setShowDetails(v => !v)}
                  style={{
                    padding: '6px 12px', background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 4, cursor: 'pointer',
                    fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
                >
                  {showDetails ? 'Kapat' : 'Ayarlar'}
                </button>
                <button
                  onClick={() => save(true)}
                  style={{
                    padding: '6px 14px',
                    background: 'rgba(153,247,255,0.1)',
                    border: '1px solid rgba(153,247,255,0.3)',
                    borderRadius: 4, cursor: 'pointer',
                    fontSize: 9, fontWeight: 900, color: '#99f7ff',
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    transition: 'all 0.15s',
                    boxShadow: '0 0 12px rgba(153,247,255,0.06)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(153,247,255,0.16)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(153,247,255,0.1)'; }}
                >
                  Hepsini Kabul Et
                </button>
              </div>
            </div>

            {/* Expandable details */}
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 12, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Necessary */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 4,
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>Zorunlu</span>
                          <span style={{ fontSize: 8, fontWeight: 900, color: 'rgba(153,247,255,0.4)', background: 'rgba(153,247,255,0.06)', border: '1px solid rgba(153,247,255,0.1)', borderRadius: 2, padding: '1px 5px', letterSpacing: '0.1em', fontFamily: "'IBM Plex Mono', monospace" }}>DAİMA AKTİF</span>
                        </div>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>Oturum yönetimi ve güvenlik.</p>
                      </div>
                      {/* Locked toggle */}
                      <div style={{ width: 34, height: 18, borderRadius: 9, background: 'rgba(153,247,255,0.12)', border: '1px solid rgba(153,247,255,0.2)', display: 'flex', alignItems: 'center', padding: '0 3px', opacity: 0.5, cursor: 'not-allowed' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#99f7ff', marginLeft: 'auto' }} />
                      </div>
                    </div>

                    {/* Analytics */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                      onClick={() => setAnalytics(v => !v)}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    >
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>Analiz Çerezleri</span>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', marginTop: 2, fontFamily: "'Inter', sans-serif" }}>Kullanım istatistikleri ve sayfa analizleri.</p>
                      </div>
                      {/* Toggle */}
                      <div style={{
                        width: 34, height: 18, borderRadius: 9, padding: '0 3px',
                        background: analytics ? 'rgba(153,247,255,0.18)' : 'rgba(255,255,255,0.08)',
                        border: `1px solid ${analytics ? 'rgba(153,247,255,0.35)' : 'rgba(255,255,255,0.1)'}`,
                        display: 'flex', alignItems: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                      }}>
                        <div style={{
                          width: 12, height: 12, borderRadius: '50%',
                          background: analytics ? '#99f7ff' : 'rgba(255,255,255,0.25)',
                          marginLeft: analytics ? 'auto' : 0,
                          transition: 'all 0.2s',
                          boxShadow: analytics ? '0 0 6px rgba(153,247,255,0.5)' : 'none',
                        }} />
                      </div>
                    </div>

                    {/* Save row */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                      <button
                        onClick={() => save(analytics)}
                        style={{
                          padding: '6px 14px',
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 4, cursor: 'pointer',
                          fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.4)',
                          fontFamily: "'IBM Plex Mono', monospace",
                          letterSpacing: '0.12em', textTransform: 'uppercase',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                      >
                        Seçimleri Kaydet
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CookieConsent;
