import { useEffect, useRef, useCallback } from 'react';

/**
 * GravityField — Premium interactive canvas background.
 *
 * Mouse etkisi: REPULSION (itme) — parçacıklar imlecin etrafında ÖBEKLEŞMEDEN akar.
 * Başlangıç: ızgara tabanlı homojen dağılım → tüm ekranı kapsar.
 * Mobil: mouse yok, daha az parçacık, daha yavaş hareket.
 */

const PRIMARY = { r: 34, g: 211, b: 238 };

function isTouchDevice() {
  return window.matchMedia('(hover: none)').matches;
}

function getConfig() {
  const touch = isTouchDevice();
  const w = window.innerWidth;
  const small = w < 640;
  return {
    PARTICLE_COUNT:    touch ? (small ? 24 : 45) : 110,
    CONNECTION_DIST:   touch ? 80 : 150,
    // Mouse — REPULSION yalnızca, çekim yok
    MOUSE_RADIUS:      touch ? 0 : 160,
    REPULSE_STRENGTH:  0.12,   // iç bölge: güçlü itme
    SWIRL_STRENGTH:    0.018,  // teğetsel sapma — öbeklenmeyi önler
    BASE_SPEED:        touch ? 0.07 : 0.16,
    FRICTION:          touch ? 0.970 : 0.960,
    MAX_SPEED_MULT:    2.5,
    ALPHA_MULT:        touch ? 0.48 : 0.68,
    CONNECTION_ALPHA:  touch ? 0.035 : 0.060,
  };
}

/** Izgara tabanlı homojen başlangıç — tüm ekranı eşit kapsar */
function createParticlesGrid(w, h, count, baseSpeed) {
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const cellW = w / cols;
  const cellH = h / rows;
  const particles = [];
  for (let r = 0; r < rows && particles.length < count; r++) {
    for (let c = 0; c < cols && particles.length < count; c++) {
      particles.push({
        x: cellW * (c + 0.2 + Math.random() * 0.6),
        y: cellH * (r + 0.2 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * baseSpeed,
        vy: (Math.random() - 0.5) * baseSpeed,
        radius: Math.random() * 1.3 + 0.7,
        alpha: Math.random() * 0.35 + 0.12,
        hueShift: Math.random() * 18 - 9,
      });
    }
  }
  return particles;
}

export default function GravityField() {
  const canvasRef    = useRef(null);
  const mouseRef     = useRef({ x: -9999, y: -9999, active: false });
  const particlesRef = useRef([]);
  const rafRef       = useRef(null);
  const sizeRef      = useRef({ w: 0, h: 0 });
  const cfgRef       = useRef(getConfig());
  const dprRef       = useRef(1);

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    cfgRef.current = getConfig();
    const cfg = cfgRef.current;

    const touch = isTouchDevice();
    const dpr = touch ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d', { alpha: false }); // Opt: No alpha transparency for canvas buffer
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); 

    sizeRef.current = { w, h };

    // Izgara dağılımı — mevcut parçacıklar varsa yalnızca ekle/çıkar
    const particles = particlesRef.current;
    const missing = cfg.PARTICLE_COUNT - particles.length;
    if (missing > 0) {
      const extras = createParticlesGrid(w, h, missing, cfg.BASE_SPEED);
      particles.push(...extras);
    } else if (missing < 0) {
      particles.splice(cfg.PARTICLE_COUNT);
    }
    // İlk yükleme: tamamen yeniden oluştur
    if (particles.length === 0) {
      particlesRef.current = createParticlesGrid(w, h, cfg.PARTICLE_COUNT, cfg.BASE_SPEED);
    }
  }, []);

  // İlk yükleme — particlesRef'i ızgara ile doldur
  useEffect(() => {
    handleResize();
    // İlk açılışta particles boşsa yeniden oluştur
    if (particlesRef.current.length === 0) {
      const { w, h } = sizeRef.current;
      const cfg = cfgRef.current;
      particlesRef.current = createParticlesGrid(w, h, cfg.PARTICLE_COUNT, cfg.BASE_SPEED);
    }
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [handleResize]);

  // Mouse — sadece masaüstü
  useEffect(() => {
    if (isTouchDevice()) return;
    const onMove  = (e) => { mouseRef.current.x = e.clientX; mouseRef.current.y = e.clientY; mouseRef.current.active = true; };
    const onLeave = ()  => { mouseRef.current.active = false; };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Ana animasyon döngüsü
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const tick = () => {
      if (document.hidden) { 
        rafRef.current = requestAnimationFrame(tick); 
        return; 
      }
      const { w, h } = sizeRef.current;
      if (!w || !h) { rafRef.current = requestAnimationFrame(tick); return; }

      const cfg       = cfgRef.current;
      const particles = particlesRef.current;
      const mouse     = mouseRef.current;
      const maxV      = cfg.BASE_SPEED * cfg.MAX_SPEED_MULT;
      const minDrift  = cfg.BASE_SPEED * 0.22;

      ctx.clearRect(0, 0, w, h);

      // ── Parçacık fiziği ──────────────────────────────────────
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (mouse.active && cfg.MOUSE_RADIUS > 0) {
          const dx   = p.x - mouse.x;  // imlecten parçacığa (repulsion yönü)
          const dy   = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0 && dist < cfg.MOUSE_RADIUS) {
            const t = 1 - dist / cfg.MOUSE_RADIUS;       // 0…1, yakındaysa 1
            const repulse = t * t * cfg.REPULSE_STRENGTH;
            // Radyal itme — parçacığı imlecten uzağa iter
            p.vx += (dx / dist) * repulse;
            p.vy += (dy / dist) * repulse;
            // Teğetsel sapma — itmeden sonra yayılmayı sağlar, öbeklenmeyi önler
            const swirl = t * cfg.SWIRL_STRENGTH;
            p.vx += (-dy / dist) * swirl;
            p.vy += ( dx / dist) * swirl;
          }
        }

        // Sürtünme
        p.vx *= cfg.FRICTION;
        p.vy *= cfg.FRICTION;

        // Hız tavanı
        if (p.vx >  maxV) p.vx =  maxV;
        if (p.vx < -maxV) p.vx = -maxV;
        if (p.vy >  maxV) p.vy =  maxV;
        if (p.vy < -maxV) p.vy = -maxV;

        // Minimum drift — durağan parçacıklar
        if (Math.abs(p.vx) < minDrift) p.vx += (Math.random() - 0.5) * minDrift * 1.4;
        if (Math.abs(p.vy) < minDrift) p.vy += (Math.random() - 0.5) * minDrift * 1.4;

        p.x += p.vx;
        p.y += p.vy;

        // Ekran sarma
        const m = 60;
        if (p.x < -m) p.x = w + m;
        else if (p.x > w + m) p.x = -m;
        if (p.y < -m) p.y = h + m;
        else if (p.y > h + m) p.y = -m;
      }

      // ── Bağlantı çizgileri ───────────────────────────────────
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          const maxDistSq = cfg.CONNECTION_DIST * cfg.CONNECTION_DIST;
          if (distSq >= maxDistSq) continue;

          const dist = Math.sqrt(distSq);
          let glow = 0;
          if (mouse.active && cfg.MOUSE_RADIUS > 0) {
            const midX = (a.x + b.x) * 0.5;
            const midY = (a.y + b.y) * 0.5;
            const mdx = mouse.x - midX, mdy = mouse.y - midY;
            const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
            if (mDist < cfg.MOUSE_RADIUS) glow = (1 - mDist / cfg.MOUSE_RADIUS) * 1.8;
          }

          const alpha = (1 - dist / cfg.CONNECTION_DIST) * (cfg.CONNECTION_ALPHA + glow * 0.07);
          ctx.strokeStyle = `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // ── Parçacık render ──────────────────────────────────────
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        let glow = 1;
        if (mouse.active && cfg.MOUSE_RADIUS > 0) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < cfg.MOUSE_RADIUS) glow = 1 + (1 - d / cfg.MOUSE_RADIUS) * 2.2;
        }

        const alpha  = Math.min(p.alpha * glow * cfg.ALPHA_MULT, 0.88);
        const radius = p.radius * (glow > 1.8 ? 1.15 : 1);

        // Glow halkası (yakındaysa)
        if (glow > 1.8) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 3.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${PRIMARY.r},${PRIMARY.g},${PRIMARY.b},0.03)`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${PRIMARY.r + p.hueShift},${PRIMARY.g + p.hueShift},${PRIMARY.b},${alpha.toFixed(3)})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[-1] pointer-events-none"
      style={{ background: '#030508' }}
      aria-hidden="true"
    />
  );
}
