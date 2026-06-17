import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, FlaskConical, Wrench, ArrowLeft, Lock, BarChart2 } from 'lucide-react';

const C = {
  bg:    '#020408',
  mono:  "'IBM Plex Mono', 'Fira Mono', monospace",
  primary: '#99f7ff',
  primaryLo: 'rgba(153,247,255,0.06)',
  primaryBord: 'rgba(153,247,255,0.18)',
  w70:   'rgba(255,255,255,0.7)',
  w50:   'rgba(255,255,255,0.5)',
  w30:   'rgba(255,255,255,0.3)',
  w18:   'rgba(255,255,255,0.18)',
  w08:   'rgba(255,255,255,0.08)',
  w04:   'rgba(255,255,255,0.04)',
};

// CRT karınca gürültüsü — BacktestPage versiyonu (ResizeObserver)
function CrtNoise() {
  const ref = useRef(null);
  const rafRef = useRef(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let running = true;
    const resize = () => {
      const r = cvs.getBoundingClientRect();
      cvs.width  = Math.round(r.width);
      cvs.height = Math.round(r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cvs.parentElement || cvs);
    const draw = () => {
      if (!running) return;
      const w = cvs.width, h = cvs.height;
      if (!w || !h) { rafRef.current = requestAnimationFrame(draw); return; }
      const img = ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.random() < 0.014) {
          const v = Math.random() * 210 | 0;
          d[i] = d[i+1] = d[i+2] = v;
          d[i+3] = 36;
        }
      }
      ctx.putImageData(img, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { running = false; cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);
  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0,
    }} />
  );
}

// Yüzen parçacıklar
function FloatingParticles() {
  const ref = useRef(null);
  const rafRef = useRef(null);
  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let running = true;
    cvs.width  = window.innerWidth;
    cvs.height = window.innerHeight;
    const onResize = () => {
      cvs.width  = window.innerWidth;
      cvs.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const N = 38;
    const pts = Array.from({ length: N }, () => ({
      x:   Math.random() * cvs.width,
      y:   Math.random() * cvs.height,
      r:   0.6 + Math.random() * 1.4,
      vx:  (Math.random() - 0.5) * 0.18,
      vy:  -0.08 - Math.random() * 0.18,
      a:   Math.random() * Math.PI * 2,
      da:  (Math.random() - 0.5) * 0.008,
      opacity: 0.04 + Math.random() * 0.14,
    }));

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      for (const p of pts) {
        p.x  += p.vx;
        p.y  += p.vy;
        p.a  += p.da;
        if (p.y < -10) { p.y = cvs.height + 10; p.x = Math.random() * cvs.width; }
        if (p.x < -10) p.x = cvs.width + 10;
        if (p.x > cvs.width + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(153,247,255,${p.opacity})`;
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { running = false; cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', onResize); };
  }, []);
  return (
    <canvas ref={ref} style={{
      position: 'fixed', inset: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 0,
    }} />
  );
}

const PAGE_CONFIG = {
  terminal: {
    Icon: LayoutDashboard,
    title: 'Terminal',
    badge: 'ERKEN ERİŞİM',
    description: 'Gelişmiş analiz terminali, derinlemesine grafik araçları ve gerçek zamanlı sinyal motoru şu an son geliştirme aşamasında. Çok yakında tüm kullanıcılara açılacak.',
    features: [
      'Gerçek zamanlı teknik analiz',
      'Çok zaman dilimli grafik desteği',
      'Anlık sinyal bildirimleri',
      'Hisse derinlik ekranı',
    ],
    color: '#22d3ee',
  },
  portfolio: {
    Icon: Wallet,
    title: 'Portföy Yönetimi',
    badge: 'YAKINDA',
    description: 'Akıllı portföy takibi, risk ölçümü ve getiri analizi özellikleri geliştirme aşamasında. PRISM sinyalleriyle entegre çalışacak.',
    features: [
      'Anlık PnL ve getiri takibi',
      'Risk/ödül analizi',
      'PRISM sinyal geçmişi',
      'Sektör dağılım görünümü',
    ],
    color: '#34d399',
  },
  market: {
    Icon: BarChart2,
    title: 'Piyasa Tarayıcı',
    badge: 'YAKINDA',
    description: 'BIST hisselerini tarayan PRISM sinyal motoru ve ML skorlama sistemi son geliştirme aşamasında. Kısa süre içinde tüm kullanıcılara açılacak.',
    features: [
      'PRISM sinyal taraması',
      'ML tabanlı fırsat skorlaması',
      'Teknik filtreler ve profiller',
      'Anlık tarama sonuçları',
    ],
    color: '#a78bfa',
  },
  backtest: {
    Icon: FlaskConical,
    title: 'Backtest Stüdyosu',
    badge: 'YAKINDA',
    description: 'Strateji simülasyon motoru ve PRISM geçmiş sicili üzerinde çalışmalar devam ediyor.',
    features: [
      'Teknik strateji simülasyonu',
      'PRISM geçmiş sicili',
      'Equity curve ve drawdown analizi',
      'Benchmark karşılaştırması',
    ],
    color: '#a78bfa',
  },
  default: {
    Icon: Wrench,
    title: 'Yakında',
    badge: 'YAPIM AŞAMASINDA',
    description: 'Bu özellik üzerinde çalışıyoruz.',
    features: [],
    color: C.primary,
  },
};

export default function ComingSoonPage({
  page = 'default',
  title,
  description,
  standalone = false,
}) {
  const navigate = useNavigate();
  const cfg   = PAGE_CONFIG[page] || PAGE_CONFIG.default;
  const Icon  = cfg.Icon;
  const lbl   = title       || cfg.title;
  const desc  = description || cfg.description;
  const color = cfg.color;

  const containerStyle = standalone
    ? { position: 'fixed', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
    : { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 120px)', padding: '40px 24px', position: 'relative', overflow: 'hidden' };

  return (
    <div style={containerStyle}>
      {/* Arkaplan: karıncalanma + parçacıklar */}
      <FloatingParticles />
      <div style={{ position: standalone ? 'fixed' : 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        <CrtNoise />
      </div>

      {/* Radyal ışıma */}
      <div style={{
        position: standalone ? 'fixed' : 'absolute',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(ellipse at center, ${color}08 0%, transparent 70%)`,
        pointerEvents: 'none', zIndex: 1,
      }} />

      {/* İçerik */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center', maxWidth: 520, width: '100%', padding: '0 16px' }}>

        {/* Geri butonu (standalone modda) */}
        {standalone && (
          <button onClick={() => navigate('/market')} style={{
            position: 'fixed', top: 20, left: 20,
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 3,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            color: C.w30, cursor: 'pointer', fontSize: 11, fontFamily: C.mono,
            letterSpacing: '0.06em',
          }}>
            <ArrowLeft size={12} />
            Geri
          </button>
        )}

        {/* İkon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `${color}0a`,
          border: `1px solid ${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 40px ${color}10`,
        }}>
          <Icon size={28} style={{ color: `${color}99` }} />
        </div>

        {/* Başlık + badge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 10px',
            background: `${color}08`, border: `1px solid ${color}18`, borderRadius: 2,
          }}>
            <Lock size={9} style={{ color: `${color}88` }} />
            <span style={{ fontSize: 10, fontWeight: 900, color: `${color}88`, fontFamily: C.mono, letterSpacing: '0.12em' }}>
              {cfg.badge}
            </span>
          </div>

          <div style={{ fontSize: 22, fontWeight: 900, color: C.w70, fontFamily: C.mono, letterSpacing: '0.06em' }}>
            {lbl}
          </div>

          <div style={{ fontSize: 13, color: C.w30, fontFamily: C.mono, lineHeight: 1.75, maxWidth: 400 }}>
            {desc}
          </div>
        </div>

        {/* Özellik listesi */}
        {cfg.features.length > 0 && (
          <div style={{
            width: '100%', padding: '16px 20px',
            background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: C.w18, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: C.mono, marginBottom: 2 }}>
              Planlanan Özellikler
            </div>
            {cfg.features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: `${color}55`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.w30, fontFamily: C.mono }}>{f}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pulse badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 16px',
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: `${color}66`,
            animation: 'cspulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, color: C.w18, fontFamily: C.mono, letterSpacing: '0.1em' }}>
            GELİŞTİRME DEVAM EDİYOR
          </span>
        </div>

      </div>

      <style>{`
        @keyframes cspulse { 0%,100%{opacity:.25;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
      `}</style>
    </div>
  );
}
