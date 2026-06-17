import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { api } from '../../core/api/client';

export default function LegalNoticeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user, fetchUser, isAuthenticated } = useAuthStore();

  const publicPaths = ['/', '/login', '/register', '/help', '/support'];

  useEffect(() => {
    const isPublic = publicPaths.includes(location.pathname) || location.pathname.startsWith('/legal');
    const localAccepted = localStorage.getItem('pivot_legal_accepted') === 'true';
    const isBot = /bot|googlebot|crawler|spider|robot|crawling/i.test(navigator.userAgent);
    if (isBot) { setIsOpen(false); return; }
    if (isPublic || localAccepted) { setIsOpen(false); return; }
    const hasAccepted = user?.settings?.has_accepted_legal || localAccepted;
    setIsOpen(!hasAccepted);
  }, [location.pathname, user, isAuthenticated]);

  const handleAccept = async () => {
    setIsOpen(false);
    localStorage.setItem('pivot_legal_accepted', 'true');
    try {
      if (isAuthenticated) {
        await api.saveSettings({ has_accepted_legal: true });
        await fetchUser();
      }
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(2,3,6,0.88)', backdropFilter: 'blur(10px)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 460,
              background: '#07090e',
              border: '1px solid rgba(153,247,255,0.14)',
              borderRadius: 6,
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5), 0 32px 80px rgba(0,0,0,0.8), 0 0 60px rgba(153,247,255,0.04)',
            }}
          >
            {/* Top accent line */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(153,247,255,0.6), transparent)' }} />

            {/* Subtle glow top-left */}
            <div style={{ position: 'absolute', top: -40, left: -40, width: 140, height: 140, background: 'radial-gradient(circle, rgba(153,247,255,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ padding: '20px 22px 22px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(153,247,255,0.07)',
                  border: '1px solid rgba(153,247,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 14px rgba(153,247,255,0.1)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#99f7ff' }}>shield</span>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 2, height: 14, borderRadius: 1, background: '#99f7ff', boxShadow: '0 0 6px rgba(153,247,255,0.5)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'rgba(255,255,255,0.88)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Yasal Uyarı</span>
                  </div>
                  <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(153,247,255,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 3 }}>
                    Mevzuat Uyumluluk
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 16 }} />

              {/* Content rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {/* Row 1 */}
                <div style={{
                  display: 'flex', gap: 10, padding: '10px 12px',
                  background: 'rgba(153,247,255,0.03)',
                  border: '1px solid rgba(153,247,255,0.08)',
                  borderRadius: 4,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#99f7ff', flexShrink: 0, marginTop: 1 }}>bolt</span>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, fontFamily: "'Inter', sans-serif" }}>
                    PivotRadar, matematiksel ve algoritmik bir{' '}
                    <strong style={{ color: '#99f7ff', fontWeight: 700 }}>karar destek yazılımıdır.</strong>
                  </p>
                </div>

                {/* Row 2 */}
                <div style={{
                  display: 'flex', gap: 10, padding: '10px 12px',
                  background: 'rgba(248,113,113,0.03)',
                  border: '1px solid rgba(248,113,113,0.1)',
                  borderRadius: 4,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#f87171', flexShrink: 0, marginTop: 1 }}>gavel</span>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55, fontFamily: "'Inter', sans-serif" }}>
                    <strong style={{ color: 'rgba(248,113,113,0.85)', fontWeight: 900, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Yatırım Tavsiyesi Değildir: </strong>
                    Üretilen skorlar finansal danışmanlık teklifi niteliği taşımaz.
                  </p>
                </div>

                {/* Row 3 */}
                <div style={{
                  display: 'flex', gap: 10, padding: '10px 12px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 4,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginTop: 1 }}>verified</span>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.55, fontStyle: 'italic', fontFamily: "'Inter', sans-serif" }}>
                    SPK lisanslı değiliz. Tüm finansal riskler{' '}
                    <strong style={{ color: 'rgba(255,255,255,0.55)', fontStyle: 'normal' }}>kullanıcıya aittir.</strong>
                  </p>
                </div>
              </div>

              {/* Accept button */}
              <button
                onClick={handleAccept}
                style={{
                  width: '100%',
                  padding: '11px 0',
                  background: 'rgba(153,247,255,0.1)',
                  border: '1px solid rgba(153,247,255,0.35)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#99f7ff',
                  fontSize: 11,
                  fontWeight: 900,
                  fontFamily: "'IBM Plex Mono', monospace",
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 0 20px rgba(153,247,255,0.06)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(153,247,255,0.16)';
                  e.currentTarget.style.boxShadow = '0 0 28px rgba(153,247,255,0.14)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(153,247,255,0.1)';
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(153,247,255,0.06)';
                }}
              >
                Anladım, Onaylıyorum
              </button>

              {/* Footer note */}
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.14)', textAlign: 'center', marginTop: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}>
                Devam ederek yasal uyarıyı kabul etmiş sayılırsınız
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
