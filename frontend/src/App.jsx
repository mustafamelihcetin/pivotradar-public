// frontend/src/App.jsx — lazy-loaded routes for performance (cache buster)
import React, { Suspense, lazy, useEffect, useState, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import AppLayout from './core/layout/AppLayout';
import AuthGuard from './features/auth/components/AuthGuard';
import LegalNoticeModal from './shared/components/LegalNoticeModal';
import useAuthStore from './store/useAuthStore';

try { localStorage.removeItem('pr-theme'); localStorage.removeItem('pivotradar-theme'); } catch (_) {}

const CookieConsent = lazy(() => import('./shared/components/CookieConsent'));
const GravityField = lazy(() => import('./shared/components/GravityField'));

// Lazy-load every page so the initial bundle stays small
const LandingPage  = lazy(() => import('./features/landing/pages/LandingPage'));
const LoginPage    = lazy(() => import('./features/auth/pages/LoginPage'));
const RegisterPage        = lazy(() => import('./features/auth/pages/RegisterPage'));
const ForgotPasswordPage  = lazy(() => import('./features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage   = lazy(() => import('./features/auth/pages/ResetPasswordPage'));
const ChangePasswordPage  = lazy(() => import('./features/auth/pages/ChangePasswordPage'));
const VerifyEmailPage     = lazy(() => import('./features/auth/pages/VerifyEmailPage'));
const LegalPage           = lazy(() => import('./features/legal/pages/LegalPage'));
const SupportPage         = lazy(() => import('./features/support/pages/SupportPage'));
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const StrategyPage = lazy(() => import('./pages/StrategyPage'));
const BacktestPage  = lazy(() => import('./pages/ComingSoonPage'));
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'));
const NewsPage     = lazy(() => import('./pages/NewsPage'));
const MarketPage   = lazy(() => import('./pages/MarketPage'));
const ToolsPage    = lazy(() => import('./pages/ToolsPage'));
const LogsPage     = lazy(() => import('./pages/LogsPage'));
const HelpPage     = lazy(() => import('./pages/HelpPage'));
const AdminPage    = lazy(() => import('./pages/AdminPage'));
const ProfilePage  = lazy(() => import('./pages/ProfilePage'));
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const AboutPage    = lazy(() => import('./pages/AboutPage'));
const TestTerminalPage = lazy(() =>
  Promise.all([
    import('./features/testterminal/pages/TestTerminalPage'),
    new Promise(r => setTimeout(r, 600)),
  ]).then(([m]) => m)
);
const PromoDemoPage = lazy(() => import('./features/promo/pages/PromoDemoPage'));
const StockIndexPage = lazy(() => import('./features/seo/pages/StockIndexPage'));

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

function GoogleProvider({ children }) {
  if (!GOOGLE_CLIENT_ID) return children;
  return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{children}</GoogleOAuthProvider>;
}


function AppPageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(34,211,238,0.12)', borderTopColor: '#22d3ee', animation: 'appSpin 0.8s linear infinite' }} />
      <style>{`@keyframes appSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function TerminalLoader() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05070a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes termPulse { 0%,100% { filter:drop-shadow(0 0 8px #22d3ee66); } 50% { filter:drop-shadow(0 0 20px #22d3eecc); } }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'termPulse 1.8s ease-in-out infinite' }}>
        <div style={{ width: 40, height: 40, flexShrink: 0, transform: 'skewX(-10deg) translateX(3px)' }}>
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
            <defs><linearGradient id="tlG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a5f3fc"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
            <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#tlG)"/>
            <rect x="32" y="10" width="4" height="20" rx="2" fill="url(#tlG)"/>
            <rect x="32" y="70" width="4" height="20" rx="2" fill="url(#tlG)"/>
            <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#tlG)" strokeWidth="14" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', transform: 'skewX(-10deg)', marginTop: 3 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.01em', lineHeight: 1 }}>PIVOT</span>
          <span style={{ fontSize: 22, fontWeight: 300, color: '#94a3b8', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '0.01em', lineHeight: 1 }}>RADAR</span>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 10px #22d3ee,0 0 20px #22d3ee', marginLeft: 5, marginBottom: 10, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}

// Redirects logged-in users away from purely public pages (Landing, Login, etc.)
function PublicRoute({ children }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const user = useAuthStore(state => state.user);
  if (!isAuthenticated) return children;
  return <Navigate to={user?.is_superuser ? '/terminal' : '/market'} replace />;
}

// Restricts a route to superusers only; non-admins are sent to /market
function AdminGuard({ children }) {
  const user            = useAuthStore(state => state.user);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const isAuthResolved  = useAuthStore(state => state.isAuthResolved);
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (!isAuthResolved || user === null) return null;
  if (!user.is_superuser) return <Navigate to="/market" replace />;
  return children;
}

// Terminal: admin → gerçek terminal (standalone), değilse → AppLayout içinde coming soon
function TerminalRoute() {
  const user           = useAuthStore(state => state.user);
  const isAuthResolved = useAuthStore(state => state.isAuthResolved);

  // Auth henüz çözülmediyse minimal loader göster
  if (!isAuthResolved) return <TerminalLoader />;

  // Admin: tam ekran standalone terminal
  if (user?.is_superuser) {
    return (
      <Suspense fallback={<TerminalLoader />}>
        <PageErrorBoundary><TestTerminalPage /></PageErrorBoundary>
      </Suspense>
    );
  }

  // Normal kullanıcı: sidebar korunarak coming soon göster
  return (
    <AppLayout>
      <Suspense fallback={null}>
        <ComingSoonPage page="terminal" />
      </Suspense>
    </AppLayout>
  );
}

// Portföy: admin → gerçek sayfa, değilse → AppLayout içinde coming soon
function PortfolioRoute() {
  const user           = useAuthStore(state => state.user);
  const isAuthResolved = useAuthStore(state => state.isAuthResolved);
  if (!isAuthResolved) return null;
  if (user?.is_superuser) {
    return (
      <Suspense fallback={null}>
        <PageErrorBoundary><PortfolioPage /></PageErrorBoundary>
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <ComingSoonPage page="portfolio" />
    </Suspense>
  );
}


// Piyasa: admin → gerçek sayfa, değilse → coming soon
function MarketRoute() {
  const user           = useAuthStore(state => state.user);
  const isAuthResolved = useAuthStore(state => state.isAuthResolved);
  if (!isAuthResolved) return null;
  if (user?.is_superuser) {
    return (
      <Suspense fallback={null}>
        <PageErrorBoundary><MarketPage /></PageErrorBoundary>
      </Suspense>
    );
  }
  return (
    <Suspense fallback={null}>
      <ComingSoonPage page="market" />
    </Suspense>
  );
}

function AuthRedirectHandler() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const publicPaths = ['/', '/login', '/register'];
    if (isAuthenticated && publicPaths.includes(location.pathname)) {
      const user = useAuthStore.getState().user;
      navigate(user?.is_superuser ? '/terminal' : '/market', { replace: true });
    }
  }, [isAuthenticated, location.pathname, navigate]);

  return null;
}

class GravityErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

class RootErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { this.setState({ info }); }
  render() {
    const { error, info } = this.state;
    if (error) {
      return (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#05070a', color: '#fff', padding: 32, gap: 16, fontFamily: 'monospace', zIndex: 99999 }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <p style={{ fontSize: 14, color: '#f87171', fontWeight: 700, margin: 0 }}>Uygulama başlatılamadı</p>
          <pre style={{ fontSize: 11, color: '#94a3b8', background: '#0f172a', padding: 16, borderRadius: 8, maxWidth: 600, overflow: 'auto', maxHeight: 300 }}>{error.message}{info?.componentStack}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 20px', borderRadius: 8, background: '#22d3ee22', border: '1px solid #22d3ee44', color: '#22d3ee', cursor: 'pointer', fontSize: 13 }}>Sayfayı Yenile</button>
        </div>
      );
    }
    return this.props.children;
  }
}

class PageErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'40vh', gap:16, padding:32, textAlign:'center' }}>
          <div style={{ fontSize:32 }}>⚠️</div>
          <p style={{ fontSize:13, fontWeight:700, color:'#f87171', margin:0 }}>Bu sayfa yüklenirken beklenmedik bir hata oluştu.</p>
          <pre style={{ fontSize:11, color:'#94a3b8', background:'#0f172a', padding:12, borderRadius:8, maxWidth:700, overflow:'auto', textAlign:'left', maxHeight:200, margin:0 }}>{String(this.state.error)}</pre>
          <button
            style={{ padding:'6px 18px', borderRadius:8, background:'rgba(34,211,238,0.15)', border:'1px solid rgba(34,211,238,0.3)', color:'#22d3ee', cursor:'pointer', fontSize:13, fontWeight:700 }}
            onClick={() => this.setState({ error: null })}
          >
            Tekrar Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function DeferredGravity() { return null; }


function App() {
  return (
    <RootErrorBoundary>
    <BrowserRouter>
      <AuthRedirectHandler />
      {/* ── PREMIUM GRAVITY PARTICLE FIELD — deferred 3.5s so it doesn't block LCP/TBT ── */}
      <DeferredGravity />

      {/* ── MANDATORY LEGAL DEFENSE LAYER ── */}
      <LegalNoticeModal />
      
      <Suspense fallback={null}>
        <Routes>
          {/* Public (Hidden if Authenticated) */}
          <Route path="/"                  element={<PublicRoute><LandingPage /></PublicRoute>} />
          <Route path="/login"             element={<PublicRoute><GoogleProvider><LoginPage /></GoogleProvider></PublicRoute>} />
          <Route path="/register"          element={<Navigate to="/" replace />} />
          
          {/* Always Public */}
          <Route path="/verify-email"      element={<VerifyEmailPage />} />
          <Route path="/forgot-password"   element={<ForgotPasswordPage />} />
          <Route path="/reset-password"    element={<ResetPasswordPage />} />
          <Route path="/change-password"   element={<ChangePasswordPage />} />
          <Route path="/legal/:doc"        element={<LegalPage />} />
          <Route path="/legal"             element={<LegalPage />} />
          <Route path="/support"           element={<SupportPage />} />
          <Route path="/help"              element={<HelpPage />} />
          <Route path="/promo"             element={<PromoDemoPage />} />
          <Route path="/hisse-merkezi"     element={<StockIndexPage />} />
          <Route path="/about"             element={<AboutPage />} />

          {/* /testterminal → /terminal redirect (backward compat) */}
          <Route path="/testterminal" element={<Navigate to="/terminal" replace />} />

          {/* Standalone — no AppLayout wrapper */}
          <Route path="/terminal"         element={<AuthGuard><TerminalRoute /></AuthGuard>} />
          <Route path="/terminal/:symbol" element={<AuthGuard><TerminalRoute /></AuthGuard>} />

          {/* Protected */}
          <Route
            path="/*"
            element={
              <AuthGuard>
                <AppLayout>
                  <Suspense fallback={<AppPageLoader />}>
                    <Routes>
                      <Route path="/dashboard"         element={<Navigate to="/terminal-classic" replace />} />
                      <Route path="/terminal-classic"  element={<AdminGuard><PageErrorBoundary><Dashboard /></PageErrorBoundary></AdminGuard>} />
                      <Route path="/strategy"  element={<PageErrorBoundary><StrategyPage /></PageErrorBoundary>} />
                      <Route path="/news"      element={<PageErrorBoundary><NewsPage /></PageErrorBoundary>} />
                      <Route path="/market"    element={<MarketRoute />} />
                      <Route path="/backtest"  element={<PageErrorBoundary><BacktestPage page="backtest" /></PageErrorBoundary>} />
                      <Route path="/tools"     element={<PageErrorBoundary><ToolsPage /></PageErrorBoundary>} />
                      <Route path="/logs"      element={<PageErrorBoundary><LogsPage /></PageErrorBoundary>} />
                      <Route path="/admin"     element={<PageErrorBoundary><AdminPage /></PageErrorBoundary>} />
                      <Route path="/portfolio" element={<PortfolioRoute />} />
                      <Route path="/profile"   element={<PageErrorBoundary><ProfilePage /></PageErrorBoundary>} />
                      <Route path="*"          element={<Navigate to="/terminal" replace />} />
                    </Routes>
                  </Suspense>
                </AppLayout>
              </AuthGuard>
            }
          />
        </Routes>
      </Suspense>
      <Suspense fallback={null}><CookieConsent /></Suspense>
    </BrowserRouter>
    </RootErrorBoundary>
  );
}

export default App;
