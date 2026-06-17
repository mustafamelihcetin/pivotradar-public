import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Lock, ArrowRight, UserPlus } from 'lucide-react';

export const GuestLockOverlay = ({
  title = 'Giriş Gerekli',
  description = 'Bu bölümü kullanmak için ücretsiz hesap oluşturun.',
  className = '',
  fixed = false,
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className={`${fixed ? 'fixed' : 'absolute'} inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-[#040609]/60 ${className}`}
    style={{ borderRadius: fixed ? 0 : 'inherit' }}
  >
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.15 }}
      style={{
        maxWidth: 340, width: '100%',
        background: '#06080d',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '28px 24px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 16,
      }}>
        <Lock size={16} color="#22d3ee" opacity={0.7} />
      </div>

      <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 20 }}>
        {description}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <Link to="/register" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 16px', borderRadius: 10,
          background: '#22d3ee', color: '#003d42',
          fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
          textDecoration: 'none', transition: 'opacity 0.15s',
        }}>
          <UserPlus size={12} />
          Ücretsiz Kayıt Ol
        </Link>
        <Link to="/login" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.08em', textDecoration: 'none',
        }}>
          Giriş Yap <ArrowRight size={11} />
        </Link>
      </div>
    </motion.div>
  </motion.div>
);
