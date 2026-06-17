/**
 * AppSidebar — tek kaynak sidebar bileşeni.
 * AppLayout ve TestTerminalPage bu dosyayı import eder; kod tekrarı yok.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Terminal as TerminalIcon, Wallet, Activity, ShieldCheck,
  FlaskConical, Pin, LogOut, LogIn, User, HelpCircle, MessageCircle, Newspaper, BarChart2, Wrench,
} from 'lucide-react';
import useAuthStore from '@/store/useAuthStore';
import { api } from '@/core/api/client';

export const SIDEBAR_C = 68;
export const SIDEBAR_E = 178;

export const MAIN_NAV = [
  { name: 'Terminal', href: '/terminal',  Icon: LayoutDashboard, color: '#22d3ee' },
  { name: 'Portföy',  href: '/portfolio', Icon: Wallet,          color: '#34d399' },
  { name: 'Piyasa',   href: '/market',    Icon: BarChart2,       color: '#a78bfa' },
  { name: 'Haberler', href: '/news',      Icon: Newspaper,       color: '#60a5fa' },
  { name: 'Backtest', href: '/backtest',  Icon: Activity,        color: '#fbbf24' },
  { name: 'Araçlar',  href: '/tools',     Icon: Wrench,          color: '#f97316' },
  { name: 'Loglar',   href: '/logs',      Icon: TerminalIcon,    color: '#a855f7' },
];

const _PSP_KEY = 'psp';

function _readPin() {
  try {
    const v = localStorage.getItem(_PSP_KEY);
    if (v !== null) return v === '1';
  } catch {}
  try {
    const m = document.cookie.match(/(?:^|;\s*)psp=([^;]*)/);
    if (m) return m[1] === '1';
  } catch {}
  return false;
}

function _writePin(v) {
  try { localStorage.setItem(_PSP_KEY, v ? '1' : '0'); } catch {}
  try {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    document.cookie = `psp=${v ? '1' : '0'}; path=/; expires=${d.toUTCString()}; SameSite=Lax`;
  } catch {}
}

function PhiNavItem({ href, Icon, label, color, expanded }) {
  const [hov, setHov] = useState(false);
  return (
    <NavLink to={href} title={label} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'block', textDecoration: 'none', marginBottom: 2 }}>
      {({ isActive }) => (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 36, borderRadius: 6,
          padding: '0 6px',
          justifyContent: expanded ? 'flex-start' : 'center',
          background: isActive ? `linear-gradient(90deg,${color}20 0%,${color}08 100%)` : hov ? 'rgba(255,255,255,0.05)' : 'transparent',
          boxShadow: isActive ? `inset 0 0 0 1px ${color}20` : 'none',
          position: 'relative', cursor: 'pointer', transition: 'all 0.15s ease',
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', left: 0, top: '15%', height: '70%', width: 2, background: isActive ? color : 'transparent', borderRadius: '0 2px 2px 0', boxShadow: isActive ? `0 0 8px ${color}` : 'none', transition: 'all 0.15s ease' }} />
          <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isActive ? `${color}22` : hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isActive ? color + '40' : hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`, boxShadow: isActive ? `0 0 10px ${color}25` : 'none', transition: 'all 0.15s ease' }}>
            <Icon size={13} strokeWidth={isActive ? 2.5 : 2} style={{ color: isActive ? color : hov ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)', filter: isActive ? `drop-shadow(0 0 4px ${color})` : 'none', transition: 'all 0.15s ease' }} />
          </div>
          {expanded && (
            <span style={{ fontSize: 13, fontWeight: isActive ? 900 : 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? '#fff' : hov ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)', textShadow: isActive ? `0 0 10px ${color}70` : 'none', transition: 'all 0.15s ease' }}>
              {label}
            </span>
          )}
        </div>
      )}
    </NavLink>
  );
}

/**
 * @param {object} props
 * @param {object} props.user          - auth store user nesnesi
 * @param {Array}  [props.extraItems]  - ANA MENÜ'den sonra superuser'a özel ek nav öğeleri
 */
export function AppSidebar({ user, extraItems }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [pinned, setPinned] = useState(_readPin);
  const [hovered, setHovered]     = useState(false);
  const [logoutHov, setLogoutHov] = useState(false);
  const [profileHov, setProfileHov] = useState(false);
  const hoverTimer = useRef(null);
  const sidebarRef = useRef(null);
  const navigate   = useNavigate();
  const expanded   = pinned || hovered;

  const togglePin = () => {
    const next = !pinned;
    _writePin(next);
    setPinned(next);
    if (isAuthenticated) api.saveSettings({ sidebar_pinned: next }).catch(() => {});
  };

  const handleMouseEnter = useCallback(() => {
    if (pinned) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(true), 120);
  }, [pinned]);

  const handleMouseLeave = useCallback(() => {
    if (pinned) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (!sidebarRef.current?.matches(':hover')) setHovered(false);
    }, 200);
  }, [pinned]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const handleLogout = () => { useAuthStore.getState().logout(); navigate('/login'); };

  return (
    <div
      ref={sidebarRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ width: expanded ? SIDEBAR_E : SIDEBAR_C, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#060810', borderRight: '1px solid rgba(255,255,255,0.07)', transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden', position: 'relative', zIndex: 10 }}
    >
      {/* Top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(153,247,255,0.5),transparent)', pointerEvents: 'none' }} />

      {/* Logo */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-start' : 'center', padding: expanded ? '0 12px' : 0, borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        {expanded ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, flexShrink: 0, transform: 'skewX(-10deg) translateX(2px)', filter: 'drop-shadow(0 0 8px #22d3ee99)' }}>
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <defs><linearGradient id="sG1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a5f3fc"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
                <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#sG1)"/>
                <rect x="32" y="10" width="4"  height="20" rx="2" fill="url(#sG1)"/>
                <rect x="32" y="70" width="4"  height="20" rx="2" fill="url(#sG1)"/>
                <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#sG1)" strokeWidth="14" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', transform: 'skewX(-10deg)', lineHeight: 1, whiteSpace: 'nowrap', marginTop: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.01em' }}>PIVOT</span>
              <span style={{ fontSize: 16, fontWeight: 300, color: '#94a3b8', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.01em' }}>RADAR</span>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px #22d3ee,0 0 16px #22d3ee', marginLeft: 4, marginBottom: 8, flexShrink: 0 }} />
            </div>
          </div>
        ) : (
          <div style={{ width: 46, height: 46, flexShrink: 0, background: 'linear-gradient(135deg,#0f172a 0%,#020617 100%)', borderRadius: 12, border: '1px solid rgba(34,211,238,0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.6),inset 0 1px 1px rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ width: '72%', height: '72%', transform: 'skewX(-10deg) translateX(2px)', filter: 'drop-shadow(0 0 5px #22d3eeaa)' }}>
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <defs><linearGradient id="sG2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a5f3fc"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
                <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#sG2)"/>
                <rect x="32" y="10" width="4"  height="20" rx="2" fill="url(#sG2)"/>
                <rect x="32" y="70" width="4"  height="20" rx="2" fill="url(#sG2)"/>
                <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#sG2)" strokeWidth="14" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
        {expanded ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 4px' }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.16)', textTransform: 'uppercase' }}>ANA MENÜ</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(255,255,255,0.07),transparent)' }} />
          </div>
        ) : (
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '6px 4px' }} />
        )}

        {MAIN_NAV.map(({ name, href, Icon, color }) => (
          <PhiNavItem key={href} href={href} Icon={Icon} label={name} color={color} expanded={expanded} />
        ))}

        {/* Superuser ek öğeleri */}
        {user?.is_superuser && extraItems && extraItems.length > 0 && (
          <>
            {expanded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 6px 4px' }}>
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.16)', textTransform: 'uppercase' }}>ARAÇLAR</span>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(255,255,255,0.07),transparent)' }} />
              </div>
            ) : (
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '6px 4px' }} />
            )}
            {extraItems.map(({ name, href, Icon, color }) => (
              <PhiNavItem key={href} href={href} Icon={Icon} label={name} color={color} expanded={expanded} />
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
        {user && (
          <NavLink to="/profile"
            onMouseEnter={() => setProfileHov(true)}
            onMouseLeave={() => setProfileHov(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: expanded ? '6px 10px' : '6px 0', justifyContent: expanded ? 'flex-start' : 'center', textDecoration: 'none', transition: 'background 0.15s', background: profileHov ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,rgba(153,247,255,0.18),rgba(153,247,255,0.04))', border: `1px solid ${profileHov ? 'rgba(153,247,255,0.35)' : 'rgba(153,247,255,0.18)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', transition: 'border-color 0.15s' }}>
              {user?.profile_picture && user.profile_picture !== '/icon.svg'
                ? <img src={user.profile_picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : user?.profile_picture === '/icon.svg'
                  ? <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 16 }}>
                      <defs><linearGradient id="sbG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a5f3fc"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
                      <g transform="skewX(-8) translate(8,0)">
                        <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#sbG)"/>
                        <rect x="32" y="10" width="4" height="20" rx="2" fill="url(#sbG)"/>
                        <rect x="32" y="70" width="4" height="20" rx="2" fill="url(#sbG)"/>
                        <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#sbG)" strokeWidth="14" strokeLinecap="round" fill="none"/>
                      </g>
                    </svg>
                  : <User size={12} style={{ color: profileHov ? '#99f7ff' : 'rgba(153,247,255,0.7)' }} />
              }
            </div>
            {expanded && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: profileHov ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em', transition: 'color 0.15s' }}>
                  {user.full_name || user.username || user.email?.split('@')[0] || 'Kullanıcı'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>
                  {user.email || ''}
                </div>
              </div>
            )}
          </NavLink>
        )}

        {expanded ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '6px 10px 8px' }}>
            <NavLink to="/help" style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 6, background: isActive ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.025)', border: `1px solid ${isActive ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <HelpCircle size={10} style={{ color: isActive ? '#22d3ee' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive ? '#22d3ee' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>Yardım</span>
                </div>
              )}
            </NavLink>
            <NavLink to="/support" style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 6, background: isActive ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.025)', border: `1px solid ${isActive ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <MessageCircle size={10} style={{ color: isActive ? '#22d3ee' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive ? '#22d3ee' : 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>Destek</span>
                </div>
              )}
            </NavLink>
            <button onClick={togglePin}
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 6, background: pinned ? 'rgba(153,247,255,0.08)' : 'rgba(255,255,255,0.025)', border: `1px solid ${pinned ? 'rgba(153,247,255,0.25)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', color: pinned ? '#99f7ff' : 'rgba(255,255,255,0.3)', transition: 'all 0.15s' }}>
              <Pin size={10} style={{ transform: pinned ? 'none' : 'rotate(45deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{pinned ? 'Bırak' : 'İğnele'}</span>
            </button>
            {user
              ? <button onClick={handleLogout}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 6, background: logoutHov ? 'rgba(248,113,113,0.08)' : 'rgba(255,255,255,0.025)', border: `1px solid ${logoutHov ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.06)'}`, cursor: 'pointer', color: logoutHov ? '#f87171' : 'rgba(255,255,255,0.3)', transition: 'all 0.15s' }}
                  onMouseEnter={() => setLogoutHov(true)} onMouseLeave={() => setLogoutHov(false)}>
                  <LogOut size={10} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Çıkış</span>
                </button>
              : <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 5, height: 26, padding: '0 8px', borderRadius: 6, background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', textDecoration: 'none', color: '#22d3ee', transition: 'all 0.15s' }}>
                  <LogIn size={10} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Giriş</span>
                </Link>
            }
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 0 8px' }}>
            {[
              { Icon: HelpCircle,    href: '/help',    title: 'Yardım' },
              { Icon: MessageCircle, href: '/support', title: 'Destek' },
            ].map(({ Icon, href, title }) => (
              <NavLink key={href} to={href} title={title} style={{ textDecoration: 'none' }}>
                {({ isActive }) => (
                  <div style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isActive ? 'rgba(34,211,238,0.06)' : 'transparent', border: `1px solid ${isActive ? 'rgba(34,211,238,0.2)' : 'rgba(255,255,255,0.04)'}`, transition: 'all 0.15s' }}>
                    <Icon size={10} style={{ color: isActive ? '#22d3ee' : 'rgba(255,255,255,0.22)' }} />
                  </div>
                )}
              </NavLink>
            ))}
            <button onClick={togglePin} title={pinned ? 'Bırak' : 'İğnele'}
              style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${pinned ? 'rgba(153,247,255,0.3)' : 'rgba(255,255,255,0.04)'}`, background: pinned ? 'rgba(153,247,255,0.1)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: pinned ? '#99f7ff' : 'rgba(255,255,255,0.22)', transition: 'all 0.15s' }}>
              <Pin size={10} style={{ transform: pinned ? 'none' : 'rotate(45deg)', transition: 'transform 0.15s' }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
