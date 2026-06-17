import PropTypes from 'prop-types';
import React, { useState } from 'react';
import {
  LayoutDashboard, Terminal, ChevronLeft, ChevronRight,
  ShieldCheck, Wallet, Activity, LifeBuoy, User as UserIcon,
  HelpCircle, FlaskConical, LogOut, Zap, Newspaper, BarChart2, Wrench,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useScanStore } from '@/core/store/useScanStore';
import useAuthStore from '@/store/useAuthStore';
import { BrandLogo as PRBrandLogo } from '@/shared/components/BrandLogo';

const MAIN_NAV = [
  { name: 'TERMİNAL', href: '/terminal',  icon: LayoutDashboard, accent: '#22d3ee' },
  { name: 'PORTFÖY',  href: '/portfolio', icon: Wallet,           accent: '#34d399' },
  { name: 'PİYASA',   href: '/market',    icon: BarChart2,        accent: '#a78bfa' },
  { name: 'HABERLER', href: '/news',      icon: Newspaper,        accent: '#60a5fa' },
  { name: 'BACKTEST', href: '/backtest',  icon: Activity,         accent: '#fbbf24' },
  { name: 'ARAÇLAR',  href: '/tools',     icon: Wrench,           accent: '#34d399' },
  { name: 'LOGLAR',   href: '/logs',      icon: Terminal,         accent: '#a855f7' },
];

const TOOL_NAV = [
  { name: 'TEST',   href: '/terminal', icon: FlaskConical, accent: '#f97316' },
  { name: 'ADMİN', href: '/admin',    icon: ShieldCheck,  accent: '#c084fc' },
];

function NavItem({ to, icon: Icon, name, accent, isOpen, badge }) {
  const [hov, setHov] = useState(false);

  return (
    <NavLink
      to={to}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'block', textDecoration: 'none', marginBottom: 3 }}
    >
      {({ isActive }) => {
        const bg = isActive
          ? `linear-gradient(90deg, ${accent}22 0%, ${accent}08 100%)`
          : hov
          ? 'rgba(255,255,255,0.06)'
          : 'transparent';

        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: isOpen ? '7px 10px 7px 12px' : '7px 0',
            justifyContent: isOpen ? 'flex-start' : 'center',
            borderRadius: 8,
            background: bg,
            boxShadow: isActive ? `inset 0 0 0 1px ${accent}25` : 'none',
            transition: 'all 0.15s ease',
            position: 'relative',
            cursor: 'pointer',
          }}>
            {/* Active left glow bar */}
            <div style={{
              position: 'absolute', left: 0, top: '15%', height: '70%', width: 3,
              background: isActive ? accent : 'transparent',
              borderRadius: '0 3px 3px 0',
              boxShadow: isActive ? `0 0 8px ${accent}` : 'none',
              transition: 'all 0.15s ease',
            }} />

            {/* Icon */}
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isActive
                ? `${accent}25`
                : hov
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isActive ? accent + '50' : hov ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
              boxShadow: isActive ? `0 0 12px ${accent}30` : 'none',
              transition: 'all 0.15s ease',
            }}>
              <Icon
                size={14}
                strokeWidth={isActive ? 2.5 : 2}
                style={{
                  color: isActive ? accent : hov ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.32)',
                  transition: 'color 0.15s ease',
                  filter: isActive ? `drop-shadow(0 0 4px ${accent})` : 'none',
                }}
              />
            </div>

            {isOpen && (
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
                color: isActive ? '#fff' : hov ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.32)',
                transition: 'color 0.15s ease',
                whiteSpace: 'nowrap', flex: 1,
                textShadow: isActive ? `0 0 12px ${accent}80` : 'none',
              }}>
                {name}
              </span>
            )}

            {isOpen && badge && (
              <span style={{
                fontSize: 8, fontWeight: 900, letterSpacing: '0.08em',
                color: accent,
                border: `1px solid ${accent}50`,
                background: `${accent}18`,
                borderRadius: 3, padding: '1px 5px',
                whiteSpace: 'nowrap', flexShrink: 0,
                boxShadow: `0 0 6px ${accent}30`,
              }}>
                {badge}
              </span>
            )}
          </div>
        );
      }}
    </NavLink>
  );
}

function SectionLabel({ label, isOpen }) {
  if (!isOpen) {
    return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '10px 8px' }} />;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', margin: '16px 0 5px' }}>
      <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.18)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.08), transparent)' }} />
    </div>
  );
}

function FooterItem({ to, icon: Icon, label, isOpen, danger, onClick }) {
  const [hov, setHov] = useState(false);
  const accent = danger ? '#f87171' : '#22d3ee';

  const inner = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: isOpen ? '6px 12px' : '6px 0',
        justifyContent: isOpen ? 'flex-start' : 'center',
        borderRadius: 7, marginBottom: 1,
        background: hov
          ? (danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.06)')
          : 'transparent',
        cursor: 'pointer', transition: 'all 0.15s ease',
      }}
    >
      <Icon
        size={13} strokeWidth={2}
        style={{
          color: hov ? (danger ? '#f87171' : 'rgba(255,255,255,0.65)') : 'rgba(255,255,255,0.25)',
          transition: 'color 0.15s ease', flexShrink: 0,
        }}
      />
      {isOpen && (
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          color: hov ? (danger ? 'rgba(248,113,113,0.9)' : 'rgba(255,255,255,0.65)') : 'rgba(255,255,255,0.25)',
          transition: 'color 0.15s ease',
        }}>
          {label}
        </span>
      )}
    </div>
  );

  if (onClick) return inner;

  return (
    <NavLink to={to} style={{ display: 'block', textDecoration: 'none' }}>
      {inner}
    </NavLink>
  );
}

export function Sidebar({ isOpen, setIsOpen }) {
  const user            = useAuthStore(state => state.user);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const logout  = useAuthStore(state => state.logout);
  const navigate = useNavigate();
  const { scanning } = useScanStore();
  const [collapseHov, setCollapseHov] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <>
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          className="lg:hidden"
        />
      )}

      <aside
        aria-label="Side Navigation"
        style={{
          width: isOpen ? 224 : 58,
          minWidth: isOpen ? 224 : 58,
          background: 'linear-gradient(180deg, #07091280 0%, #060810 30%)',
          backgroundColor: '#060810',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1), min-width 0.2s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden', flexShrink: 0,
          zIndex: 50,
        }}
        className="fixed inset-y-0 left-0 lg:relative"
      >
        {/* Top accent gradient */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5), transparent)',
        }} />

        {/* Logo */}
        <div style={{
          height: 58, display: 'flex', alignItems: 'center',
          justifyContent: isOpen ? 'flex-start' : 'center',
          padding: isOpen ? '0 14px' : '0',
          borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
        }}>
          {isOpen ? (
            <PRBrandLogo size="sm" />
          ) : (
            <div
              onClick={() => setIsOpen(true)}
              style={{
                width: 32, height: 32, borderRadius: 9, cursor: 'pointer',
                background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 10px rgba(34,211,238,0.15)',
              }}
            >
              <Zap size={14} style={{ color: '#22d3ee', filter: 'drop-shadow(0 0 4px #22d3ee)' }} />
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 8px 0' }}>
          <SectionLabel label="ANA MENÜ" isOpen={isOpen} />
          {MAIN_NAV.map(item => (
            <NavItem
              key={item.href}
              to={item.href}
              icon={item.icon}
              name={item.name}
              accent={item.accent}
              isOpen={isOpen}
            />
          ))}

          {isAuthenticated && user?.is_superuser === true && TOOL_NAV.length > 0 && (
            <>
              <SectionLabel label="ARAÇLAR" isOpen={isOpen} />
              {TOOL_NAV.map(item => (
                <NavItem
                  key={item.href}
                  to={item.href}
                  icon={item.icon}
                  name={item.name}
                  accent={item.accent}
                  isOpen={isOpen}
                  badge={item.name === 'TEST' && scanning ? 'AKTİF' : null}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: isOpen ? '8px 8px 10px' : '8px 4px 10px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.2)', flexShrink: 0,
        }}>
          <FooterItem to="/profile" icon={UserIcon}   label="PROFİL" isOpen={isOpen} />
          <FooterItem to="/help"    icon={HelpCircle} label="YARDIM"  isOpen={isOpen} />
          <FooterItem to="/support" icon={LifeBuoy}   label="DESTEK"  isOpen={isOpen} />

          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '6px 0' }} />

          <FooterItem icon={LogOut} label="ÇIKIŞ" isOpen={isOpen} danger onClick={handleLogout} />

          {/* Collapse button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            onMouseEnter={() => setCollapseHov(true)}
            onMouseLeave={() => setCollapseHov(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', height: 32, marginTop: 8, borderRadius: 7, cursor: 'pointer',
              background: collapseHov ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${collapseHov ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
              color: collapseHov ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            {isOpen ? (
              <><ChevronLeft size={12} /><span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em' }}>KAPAT</span></>
            ) : (
              <ChevronRight size={12} />
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

Sidebar.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  setIsOpen: PropTypes.func.isRequired,
};
