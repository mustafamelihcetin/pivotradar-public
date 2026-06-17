import React, { useState, useEffect, useRef, memo } from 'react';
import { Menu, Bell, Globe, User as UserIcon, LogOut, ChevronDown, Settings2, KeyRound, Info } from 'lucide-react';
import { useScanStore } from '@/core/store/useScanStore';
import { APP_VERSION, APP_BUILD } from '@/core/config/version';
import { cn } from '@/shared/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '@/store/useAuthStore';
import { BrandLogo as PRBrandLogo } from '@/shared/components/BrandLogo';

const PROFILE_COLORS = {
  'Güvenli Liman':    { from: '#22d3ee', to: '#67e8f9', glow: 'rgba(34,211,238,0.25)', border: '#22d3ee' },
  'Dönüş Uzmanı':     { from: '#34d399', to: '#6ee7b7', glow: 'rgba(52,211,153,0.25)', border: '#34d399' },
  'Trend Avcısı':     { from: '#fbbf24', to: '#fde68a', glow: 'rgba(251,191,36,0.25)', border: '#fbbf24' },
  'Anlık Fırsatçı':   { from: '#fb923c', to: '#fdba74', glow: 'rgba(251,146,60,0.25)', border: '#fb923c' },
  'Kırılım Dedektörü': { from: '#a855f7', to: '#d8b4fe', glow: 'rgba(168,85,247,0.25)', border: '#a855f7' },
  'Değer Kaşifi':     { from: '#22d3ee', to: '#a5f3fc', glow: 'rgba(34,211,238,0.2)' , border: '#22d3ee' },
  'Agresif Atak':     { from: '#f87171', to: '#fca5a5', glow: 'rgba(248,113,113,0.25)', border: '#f87171' },
};

const Clock = memo(function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  const tz = localStorage.getItem('pr_timezone') || 'Europe/Istanbul';
  const tzLabel = tz === 'Europe/Istanbul' ? 'İST' : tz.split('/')[1]?.replace('_', ' ') || 'UTC';
  const timeStr = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: tz });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0d1017', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '4px 8px' }} className="scale-90 sm:scale-100 origin-right shrink-0">
      <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 6px rgba(34,211,238,0.7)', flexShrink: 0, animation: 'pulse 2s ease-in-out infinite' }} />
      <div className="flex flex-col">
        <span className="hidden sm:block" style={{ fontSize: 6, fontWeight: 900, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.2em', lineHeight: 1, marginBottom: 1 }}>BIST · {tzLabel}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 900, color: '#22d3ee', letterSpacing: '0.05em', display: 'block', lineHeight: 1 }}>{timeStr}</span>
      </div>
    </div>
  );
});


function NotificationPanel({ onClose, results }) {
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'general'
  const watchlist = useScanStore(s => s.watchlist);
  const selectSymbol = useScanStore(s => s.selectSymbol);
  const [holdings, setHoldings] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pr_dismissed_notifs') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    try { 
      const h = JSON.parse(localStorage.getItem('pr_portfolio_v1') || '[]');
      setHoldings(h.map(i => (i.symbol || '').toUpperCase()));
    } catch { setHoldings([]); }
  }, []);

  const clearAll = () => {
    const syms = (results || []).filter(r => (r.yzdsh || r.QRS || 0) >= 80).map(r => (r.symbol||r.Sembol||'').replace('.IS','').trim().toUpperCase());
    localStorage.setItem('pr_dismissed_notifs', JSON.stringify(syms));
    setDismissed(syms);
  };

  const allSignals = (results || [])
    .filter(r => (r.yzdsh || r.QRS || 0) >= 80)
    .map(r => {
      const sym = (r.symbol || r.Sembol || '').replace('.IS','').trim().toUpperCase();
      const isHolding = holdings.includes(sym);
      const isWatched = watchlist.includes(sym);
      return { ...r, sym, isHolding, isWatched, qrs: Math.round(r.yzdsh || r.QRS || 0) };
    })
    .filter(r => !dismissed.includes(r.sym));

  const personalSignals = allSignals.filter(s => s.isHolding || s.isWatched);
  const generalSignals  = allSignals.filter(s => !s.isHolding && !s.isWatched).slice(0, 10);

  const displayList = activeTab === 'personal' ? personalSignals : generalSignals;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 15, scale: 0.96 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="absolute right-0 top-full mt-4 w-[380px] bg-[#0c0f15]/95 backdrop-blur-3xl border border-white/[0.08] rounded-3xl overflow-hidden z-[9999] shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
    >
      {/* Safe Accent */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Bell size={14} className="text-primary" />
          </div>
          <span className="text-sm font-black text-white tracking-tight">İstihbarat Radarı</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors text-white/20 hover:text-white/60">
          <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 flex items-center gap-1 bg-black/20">
        {[
          { id: 'personal', label: 'KİŞİSEL', count: personalSignals.length },
          { id: 'general',  label: 'GENEL POTANSİYEL', count: generalSignals.length }
        ].map(t => (
          <button 
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
              activeTab === t.id ? "bg-primary/15 text-primary border border-primary/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]" : "text-white/20 hover:text-white/40"
            )}
          >
            {t.label}
            {t.count > 0 && <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* List content */}
      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
        {displayList.length === 0 ? (
          <div className="px-10 py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-2">
              <span className="material-symbols-outlined text-white/10 text-3xl">radar</span>
            </div>
            <div>
              <p className="text-xs font-bold text-white/30">Şu an aktif bildirim yok</p>
              <p className="text-[10px] text-white/10 mt-1 uppercase tracking-widest">Sistem taraması devam ediyor...</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {displayList.map((s, i) => (
              <motion.div 
                key={s.sym}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => { selectSymbol(s.sym, s); onClose(); }}
                className="flex items-center gap-4 p-4 hover:bg-white/[0.03] active:bg-white/[0.05] cursor-pointer transition-all group"
              >
                {/* Icon/Symbol Box */}
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500",
                  s.isHolding ? "bg-emerald-500/10 border-emerald-500/20" : s.isWatched ? "bg-amber-400/10 border-amber-400/20" : "bg-primary/5 border-primary/10"
                )}>
                  <span className={cn(
                    "text-[10px] font-black tracking-widest",
                    s.isHolding ? "text-emerald-400" : s.isWatched ? "text-amber-400" : "text-primary/70"
                  )}>{s.sym.slice(0,3)}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white group-hover:text-primary transition-colors">{s.sym}</span>
                    {s.isHolding ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[7px] font-black text-emerald-400 tracking-widest uppercase">Portföy</span>
                    ) : s.isWatched ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20 text-[7px] font-black text-amber-400 tracking-widest uppercase">Takip</span>
                    ) : null}
                  </div>
                  <p className="text-[10px] text-white/30 font-medium mt-1 truncate">
                    {s.isHolding ? "Pozisyonunuzda QRS tetiği aktif" : "Radardaki hisseniz güç kazanıyor"}
                  </p>
                </div>

                {/* Score Section */}
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black font-mono text-primary tracking-tighter">{s.qrs}</span>
                    <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">QRS</span>
                  </div>
                  <div className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[8px] font-black font-mono",
                    (s.change_pct || s.Değişim) >= 0 ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" : "bg-red-500/5 border-red-500/10 text-red-500"
                  )}>
                    { (s.change_pct || s.Değişim || 0).toFixed(2) }%
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-white/[0.05] bg-black/20 flex items-center justify-between">
        <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.2em]">QRS ≥ 80 Sinyalleri</span>
        <button 
          onClick={clearAll}
          className="text-[9px] font-black text-white/30 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-[10px]">done_all</span>
          TÜMÜNÜ TEMİZLE
        </button>
      </div>
    </motion.div>
  );
}

export function Topbar({ onMenuClick }) {
  const user = useAuthStore(state => state.user);
  const isGuest = useAuthStore(state => state.isGuest);
  const logout = useAuthStore(state => state.logout);
  const navigate = useNavigate();
  const results = useScanStore(s => s.results);
  const profile = useScanStore(s => s.profile);

  const [scrolled, setScrolled] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const signalCount = (results || []).filter(r => (r.yzdsh || r.QRS || 0) >= 80).length;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(event.target)) setIsNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    setIsProfileOpen(false);
    logout();
    navigate('/');
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-[60] flex h-16 w-full items-center justify-between border-b px-4 md:px-6 transition-all duration-300",
        scrolled
          ? "bg-[#070a10]/95 backdrop-blur-2xl border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          : "bg-transparent border-white/[0.04]"
      )}
    >
      {/* Subtle top accent */}
      {scrolled && <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent pointer-events-none" />}

      <div className="flex items-center gap-1 sm:gap-3 md:gap-4 overflow-hidden">
        {/* Mobile menu toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onMenuClick}
          className="relative group p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-primary/5 hover:bg-primary/10 text-primary/70 hover:text-primary border border-primary/20 hover:border-primary/40 transition-all lg:hidden flex items-center justify-center shrink-0"
        >
          <Menu size={14} className="sm:w-4 sm:h-4" strokeWidth={2.5} />
          <span className="absolute -top-0.5 -right-0.5 w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary rounded-full shadow-[0_0_8px_#22d3ee]" />
        </motion.button>

        {/* Brand Logo - Only visible on mobile/tablet (Sidebar has it on desktop) */}
        <div className="flex lg:hidden items-center">
          <PRBrandLogo size="xs" hideBadge={true} className="sm:scale-90 origin-left" />
        </div>

        {/* Desktop status badges */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/[0.07] border border-primary/15 shrink-0">
            <Globe size={11} className="text-primary/70" />
            <span className="text-[9px] font-black text-primary/70 uppercase tracking-[0.2em]">Sistem Aktif</span>
          </div>
          <div className="h-3.5 w-px bg-white/[0.08] hidden xl:block" />
          <div className="hidden xl:flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/10">
              <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-black text-emerald-400/60 uppercase tracking-wider">BIST</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-500/[0.05] border border-purple-500/10">
              <span className="material-symbols-outlined text-[10px] text-purple-400/60">psychology</span>
              <span className="text-[8px] font-black text-purple-400/60 uppercase tracking-wider">ML</span>
            </div>
            <div className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/[0.04] border border-amber-500/10">
              <span className="material-symbols-outlined text-[10px] text-amber-400/50">info</span>
              <span className="text-[8px] font-black text-amber-400/50 uppercase tracking-wider">Tavsiye Değildir</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-6">
        {/* Real-time Clock — isolated component, does not re-render Topbar */}
        <Clock />

        <div className="flex items-center gap-1.5 sm:gap-4">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setIsNotifOpen(o => !o); setIsProfileOpen(false); }}
              className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-[#12151e] hover:bg-[#131720] border border-transparent hover:border-white/[0.08] transition-all relative group"
            >
              <Bell size={18} className="text-on-surface-variant/60 group-hover:text-primary transition-colors sm:w-5 sm:h-5" />
              {signalCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 px-1 bg-primary rounded-full border-2 border-surface text-[7px] font-black text-[#003d42] flex items-center justify-center animate-pulse">
                  {signalCount > 9 ? '9+' : signalCount}
                </span>
              )}
            </button>
            <AnimatePresence>
              {isNotifOpen && <NotificationPanel onClose={() => setIsNotifOpen(false)} results={results} />}
            </AnimatePresence>
          </div>
          
          <div className="h-8 w-px bg-outline-variant/10 mx-0.5 sm:mx-1" />
          
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 pl-2 cursor-pointer group outline-none"
            >
               <div 
                 className="w-10 h-10 rounded-2xl flex items-center justify-center p-0.5 group-hover:scale-105 active:scale-95 transition-all"
                 style={{
                   background: (PROFILE_COLORS[profile] || PROFILE_COLORS['Güvenli Liman']).glow,
                   border: `1px solid ${(PROFILE_COLORS[profile] || PROFILE_COLORS['Güvenli Liman']).border}40`,
                   boxShadow: `0 0 12px ${(PROFILE_COLORS[profile] || PROFILE_COLORS['Güvenli Liman']).glow}`
                 }}
               >
                  <div className="w-full h-full rounded-2xl bg-surface flex items-center justify-center overflow-hidden">
                     {user?.profile_picture ? (
                        <img src={user.profile_picture} alt="" className="w-full h-full object-cover" />
                     ) : (
                        <UserIcon size={20} className="transition-colors" style={{ color: (PROFILE_COLORS[profile] || PROFILE_COLORS['Güvenli Liman']).border }} />
                     )}
                  </div>
               </div>
               <div className="hidden lg:flex flex-col items-start pr-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black uppercase tracking-tight leading-none text-white">
                       {user?.full_name || 'Kullanıcı'}
                    </span>
                    <ChevronDown size={12} className={cn("text-white/40 transition-transform duration-300", isProfileOpen && "rotate-180")} />
                  </div>
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.2em] leading-none mt-1 transition-colors"
                    style={{ color: (PROFILE_COLORS[profile] || PROFILE_COLORS['Güvenli Liman']).border }}
                  >
                     {profile || user?.settings?.profile_name || 'Bireysel'}
                  </span>
               </div>
            </button>

            {/* Profile Dropdown Menu */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute right-0 mt-4 w-64 bg-[#0c0f15] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden py-3 z-50 origin-top-right font-sans"
                >
                  <div className="px-5 py-4 border-b border-white/[0.1] flex flex-col gap-1 bg-white/[0.01]">
                    <span className="text-[10px] font-black text-primary/60 uppercase tracking-[0.2em]">
                      {isGuest ? 'Kısıtlı Erişim' : 'Kullanıcı Hesabı'}
                    </span>
                    <span className="text-sm font-bold text-white truncate">
                      {isGuest ? 'Misafir Modu' : `Merhaba, ${user?.full_name?.split(' ')[0] || 'Kullanıcı'}`}
                    </span>
                  </div>

                  {/* Profile info / Guest CTA */}
                  <div className="px-5 py-3">
                    {isGuest ? (
                      <div className="p-3.5 rounded-2xl bg-primary/[0.03] border border-primary/20 space-y-3">
                        <p className="text-[10px] text-primary/70 font-bold leading-relaxed">
                          Erken erişim süreci devam etmektedir. Giriş yaparak devam edebilirsiniz.
                        </p>
                        <button onClick={() => navigate('/login')} className="w-full py-2 bg-primary text-[#003d42] text-[10px] font-black uppercase tracking-wider rounded-xl transition-transform active:scale-95 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                          Giriş Yap
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-[#131720] border border-white/[0.12]">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          {user?.profile_picture
                            ? <img src={user.profile_picture} alt="" className="w-full h-full rounded-xl object-cover" />
                            : <UserIcon size={18} className="text-primary/60" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-white truncate">{user?.full_name || 'Kullanıcı'}</p>
                          <p className="text-[9px] text-on-surface-variant/40 truncate">{user?.email}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Settings section */}
                  <div className="p-2 space-y-0.5 border-t border-outline-variant/10 mt-1">
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant/30 px-3 py-1">Uygulama Bilgileri</p>

                    {!isGuest && (
                      <button onClick={() => { setIsProfileOpen(false); navigate('/profile'); }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-2xl text-on-surface-variant hover:bg-white/5 hover:text-white transition-all text-left group">
                        <div className="w-7 h-7 rounded-lg bg-[#161b23] flex items-center justify-center">
                          <UserIcon size={13} className="text-on-surface-variant/50 group-hover:text-primary transition-colors" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold leading-none">Profil Ayarları</span>
                          <span className="text-[9px] text-on-surface-variant/40 uppercase tracking-tighter">Hesap ve güvenlik</span>
                        </div>
                      </button>
                    )}

                    <div className="flex items-center gap-3 w-full px-4 py-2.5 rounded-2xl text-on-surface-variant/60 text-left select-none opacity-50">
                      <div className="w-7 h-7 rounded-lg bg-[#161b23] flex items-center justify-center">
                        <KeyRound size={13} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-bold leading-none">Versiyon</span>
                        <span className="text-[9px] uppercase tracking-tighter text-primary/80 font-black">Prism Core</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 border-t border-outline-variant/10 mt-2">
                    <button 
                      onClick={isGuest ? () => navigate('/') : handleLogout}
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-3 rounded-2xl transition-all text-left group",
                        isGuest ? "text-primary/70 hover:bg-primary/5" : "text-red-400 hover:bg-red-500/10"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                        isGuest ? "bg-primary/10 group-hover:bg-primary/20" : "bg-red-400/10 group-hover:bg-red-400/20"
                      )}>
                        {isGuest ? <LogOut size={16} className="rotate-180" /> : <LogOut size={16} />}
                      </div>
                      <span className="text-xs font-black uppercase tracking-widest">
                        {isGuest ? 'Giriş Sayfası' : 'Çıkış Yap'}
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
