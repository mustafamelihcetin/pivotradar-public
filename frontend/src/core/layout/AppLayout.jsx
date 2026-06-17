import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, BarChart2, Newspaper, Activity, Wrench,
  Terminal as TerminalIcon, ShieldCheck,
} from 'lucide-react';
import useAuthStore from '@/store/useAuthStore';
import useFeatureFlags from '@/store/useFeatureFlags';
import { loadPlotly } from '@/features/charts/components/ChartSection';
import Ticker from '@/shared/components/Ticker';
import { ToastNotifier } from '@/shared/components/ToastNotifier';
import { GuestLockOverlay } from '@/shared/components/GuestLockOverlay';
import { AppSidebar } from './AppSidebar';

// Mobil bottom nav — sadece en kritik 5 sayfa
const MOBILE_NAV = [
  { name: 'Terminal', href: '/terminal',  Icon: LayoutDashboard, color: '#22d3ee' },
  { name: 'Piyasa',   href: '/market',    Icon: BarChart2,       color: '#a78bfa' },
  { name: 'Haberler', href: '/news',      Icon: Newspaper,       color: '#60a5fa' },
  { name: 'Araçlar',  href: '/tools',     Icon: Wrench,          color: '#34d399' },
  { name: 'Portföy',  href: '/portfolio', Icon: Wallet,          color: '#34d399' },
];

function MobileBottomNav() {
  return (
    <div className="lg:hidden" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9500 }}>
      <nav style={{
        height: 56,
        background: 'rgba(6,8,16,0.97)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'stretch',
      }}>
        {MOBILE_NAV.map(({ name, href, Icon, color }) => (
          <NavLink key={href} to={href} style={{ flex: 1, textDecoration: 'none' }}>
            {({ isActive }) => (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 3,
                borderTop: `2px solid ${isActive ? color : 'transparent'}`,
                transition: 'border-color 0.15s',
              }}>
                <Icon size={18} style={{ color: isActive ? color : 'rgba(255,255,255,0.3)', filter: isActive ? `drop-shadow(0 0 6px ${color})` : 'none', transition: 'color 0.15s' }} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: isActive ? color : 'rgba(255,255,255,0.28)', textTransform: 'uppercase', lineHeight: 1, transition: 'color 0.15s' }}>{name}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

const GUEST_LOCKED = {
  '/market': { title: 'Piyasa Durumu', description: 'Sektör analizleri, günlük yükselen/düşen hisseler ve piyasa genişliği verilerine erişmek için ücretsiz üye olun.' },
};

const ADMIN_EXTRA = [
  { name: 'Admin', href: '/admin', Icon: ShieldCheck, color: '#a855f7' },
];

export default function AppLayout({ children }) {
  const { pathname } = useLocation();
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isGuest = useAuthStore(s => s.isGuest) || !isAuthenticated;
  const flags = useFeatureFlags();
  const tickerVisible = flags.ticker_bar_enabled;
  const guestLock = isGuest ? GUEST_LOCKED[pathname] : null;

  useEffect(() => { loadPlotly().catch(() => {}); }, []);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100dvh', background: '#05070a', overflow: 'hidden', color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <ToastNotifier />

      {/* Sidebar — sadece desktop */}
      <div className="hidden lg:flex" style={{ position: 'relative', zIndex: 9500 }}>
        <AppSidebar user={user} extraItems={user?.is_superuser ? ADMIN_EXTRA : []} />
      </div>

      {/* Mobil alt navigasyon */}
      <MobileBottomNav />

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div
          id="main-scroll-container"
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
          className="custom-scrollbar touch-pan-y px-3 pt-3 pb-[70px] lg:p-3"
        >
          {children}
          {guestLock && (
            <GuestLockOverlay title={guestLock.title} description={guestLock.description} />
          )}
        </div>

        {tickerVisible && (
          <div style={{ height: 30, flexShrink: 0, background: '#05070a', borderTop: '1px solid rgba(255,255,255,0.035)', overflow: 'hidden', position: 'relative', zIndex: 9500 }}
               className="hidden lg:block">
            <Ticker />
          </div>
        )}
      </main>
    </div>
  );
}
