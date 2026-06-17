import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  TrendingUp,
  Activity,
  Zap,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { useScanStore } from '@/core/store/useScanStore';
import { cn } from '@/shared/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/core/api/client';
import useAuthStore from '@/store/useAuthStore';

/**
 * AmbientCanvas — Precise match for TacticalHUD background
 */
function AmbientCanvas() {
  const canvasRef = useRef(null);
  const rAF = useRef(null);
  const tick = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    const draw = () => {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      tick.current += 1;
      const t = tick.current;
      const pulse = (Math.sin(t * 0.05) + 1) / 2;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // 1. Base dark background (Flat match for tacticalHUD)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.96)';
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(34,211,238,0.035)';
      for (let x = 24; x < W; x += 30) {
        for (let y = 24; y < H; y += 30) {
          ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill();
        }
      }

      rAF.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      if (rAF.current) cancelAnimationFrame(rAF.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.96 }} />;
}

const StatSegment = ({ stat, index, total }) => {
  const isUp = stat.trend === 'up';
  
  return (
    <div className={cn(
      "relative flex flex-col justify-center px-4 sm:px-6 py-4 sm:py-5 group transition-all duration-500",
      "border-b border-white/[0.04] sm:border-b-0",
      index % 2 === 0 ? "sm:border-r sm:border-white/[0.04]" : (index === total - 1 ? "" : "lg:border-r lg:border-white/[0.04]"),
      index === total - 1 ? "border-b-0" : ""
    )}>
      <div className="relative z-10 flex items-center justify-between mb-1.5 sm:mb-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <stat.icon size={10} className={cn("opacity-60", stat.color)} />
            <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] text-white/30 group-hover:text-white/60 transition-colors">
              {stat.name}
            </span>
          </div>
        </div>
        
        <div className={cn(
          "px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-black uppercase tracking-widest border transition-all duration-500",
          isUp ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-red-500/5 border-red-500/20 text-red-400"
        )}>
          {stat.change}
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-1 sm:mb-2 relative z-10">
        <motion.span 
          key={stat.value}
          className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] group-hover:text-primary transition-colors"
        >
          {stat.value}
        </motion.span>
        {isUp ? (
          <ArrowUpRight size={12} className="text-emerald-500/60" />
        ) : (
          <ArrowDownRight size={12} className="text-red-500/60" />
        )}
      </div>

      <p className="text-[8px] sm:text-[9px] font-bold text-white/20 leading-none uppercase tracking-[0.1em] sm:tracking-[0.15em] line-clamp-1 group-hover:text-white/50 transition-colors relative z-10">
        {stat.description}
      </p>

      <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.1] transition-opacity duration-700 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${stat.glow}, transparent 70%)` }} 
      />
    </div>
  );
};

export const StatsGrid = React.memo(function StatsGrid() {
  const results = useScanStore(s => s.results) || [];
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [perfData, setPerfData] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    api.performanceSummary(90).then(d => {
      if (d && d.n_evaluated > 0) setPerfData(d);
    }).catch(() => {});
  }, [isAuthenticated]);

  const activeSignals = results.filter(r => (Number(r.yzdsh || r.QRS || r.score || 0)) > 70).length;
  const winnersCount = results.filter(r => Number(r.change_pct || r.Değişim || 0) > 0).length;
  const sentiment = results.length > 0 ? Math.round((winnersCount / results.length) * 100) : 0;
  const totalVol = results.reduce((acc, curr) => acc + (Number(curr.volume || curr.Volume || curr.Hacim || 0)), 0);
  
  const formattedVol = totalVol > 1_000_000_000
    ? `${(totalVol / 1_000_000_000).toFixed(1)} Milyar`
    : totalVol > 1_000_000
    ? `${(totalVol / 1_000_000).toFixed(1)} Milyon`
    : totalVol > 0 ? `${(totalVol/1000).toFixed(1)} Bin` : '0';

  const top10AvgQRS = useMemo(() => {
    if (!results || results.length === 0) return 0;
    const sorted = [...results]
      .map(r => Number(r.yzdsh || r.QRS || r.score || 0))
      .sort((a, b) => b - a)
      .slice(0, 10);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / Math.max(1, sorted.length));
  }, [results]);

  const confidenceScore = results.length > 0 ? Math.round((top10AvgQRS * 0.7) + (sentiment * 0.3)) : 0;

  const [scene, setScene] = React.useState(0);
  const SCENE_COUNT = 3;

  useEffect(() => {
    const iv = setInterval(() => {
      setScene(s => (s + 1) % SCENE_COUNT);
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  const scannerQueue = useScanStore(s => s.scannerQueue || 0);
  const telemetry = useScanStore(s => s.telemetry || {});
  
  const marketStats = [
    {
      name: 'PİYASA DUYARLILIĞI',
      value: `${sentiment}%`,
      change: sentiment > 60 ? 'GÜÇLÜ' : sentiment < 40 ? 'ZAYIF' : 'DENGELİ',
      trend: sentiment > 50 ? 'up' : 'down',
      icon: Activity,
      color: 'text-primary',
      glow: '#22d3ee',
      description: `${winnersCount} / ${results.length} HİSSE POZİTİF SEĞİRDE`,
    },
    {
      name: 'GÜÇLÜ SİNYALLER',
      value: activeSignals.toString(),
      change: activeSignals > 5 ? 'YÜKSEK' : 'NORMAL',
      trend: activeSignals > 0 ? 'up' : 'down',
      icon: Zap,
      color: 'text-purple-400',
      glow: '#a855f7',
      description: `${activeSignals} ADET KRİTİK QRS EŞİĞİ ÜZERİ`,
    },
    {
      name: 'TOPLAM İŞLEM HACMİ',
      value: totalVol > 0 ? formattedVol : '...',
      change: totalVol > 10_000_000_000 ? 'YOĞUN' : 'STABİL',
      trend: 'up',
      icon: TrendingUp,
      color: 'text-emerald-400',
      glow: '#34d399',
      description: 'TOPLAM BIST LİKİDİTE AKIŞI',
    },
    {
      name: 'GÜVEN ENDEKSİ',
      value: `%${confidenceScore}`,
      change: confidenceScore > 65 ? 'YÜKSEK' : 'ORTA',
      trend: confidenceScore > 50 ? 'up' : 'down',
      icon: Sparkles,
      color: 'text-primary/70',
      glow: '#22d3ee',
      description: 'ALGORİTMİK SİNERJİ SEVİYESİ',
    }
  ];

  const systemStats = [
    {
      name: 'İŞLEME KUYRUĞU',
      value: scannerQueue.toString(),
      change: scannerQueue > 50 ? 'YOĞUN' : 'BOŞ',
      trend: scannerQueue < 20 ? 'up' : 'down',
      icon: Activity,
      color: 'text-primary',
      glow: '#22d3ee',
      description: 'ANLIK ANALİZ BEKLEYEN SEMBOL',
    },
    {
      name: 'MOTOR HIZI',
      value: `${telemetry.analyze_ms || 42}ms`,
      change: 'OPTIMAL',
      trend: 'up',
      icon: Zap,
      color: 'text-primary/60',
      glow: '#22d3ee',
      description: 'CORE-ENGINE ANALİZ GECİKMESİ',
    },
    {
      name: 'BELLEK KULLANIMI',
      value: `${telemetry.memory_mb || 256}MB`,
      change: 'STABİL',
      trend: 'up',
      icon: TrendingUp,
      color: 'text-emerald-400',
      glow: '#34d399',
      description: 'DİNAMİK CACHE ALLOCATION',
    },
    {
      name: 'VERİ TAZELİĞİ',
      value: 'CANLI',
      change: 'AKTİF',
      trend: 'up',
      icon: Sparkles,
      color: 'text-primary/50',
      glow: '#22d3ee',
      description: 'PRISM VERİ KAYNAĞI BAĞLANTISI',
    }
  ];

  const _avgAlpha = perfData?.avg_alpha;
  const _hitRate  = perfData ? Math.round(perfData.hit_rate * 100) : null;
  const _outRate  = perfData ? Math.round(perfData.outperform_rate * 100) : null;

  const performanceStats = [
    {
      name: 'TOPLAM TARAMA',
      value: results.length.toString(),
      change: 'BIST-100',
      trend: 'up',
      icon: Activity,
      color: 'text-primary',
      glow: '#22d3ee',
      description: 'AKTİF EVREN GENİŞLİĞİ',
    },
    {
      name: 'ORTALAMA QRS',
      value: top10AvgQRS.toString(),
      change: top10AvgQRS > 60 ? 'YÜKSEK' : 'ORTA',
      trend: top10AvgQRS > 50 ? 'up' : 'down',
      icon: Zap,
      color: 'text-purple-400',
      glow: '#a855f7',
      description: 'LİDER GRUP GÜÇ SKORU',
    },
    {
      name: 'SİSTEM ALFASI',
      value: _avgAlpha != null ? `${_avgAlpha > 0 ? '+' : ''}${_avgAlpha}%` : '—',
      change: _avgAlpha != null ? (_avgAlpha > 0 ? 'BIST100 ÜSTÜ' : 'BIST100 ALTI') : 'VERİ YOK',
      trend: (_avgAlpha ?? 0) >= 0 ? 'up' : 'down',
      icon: TrendingUp,
      color: (_avgAlpha ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
      glow: (_avgAlpha ?? 0) >= 0 ? '#34d399' : '#f87171',
      description: perfData ? `${perfData.n_with_alpha} TAHMİN DEĞERLENDİRİLDİ` : 'BIST100 KARŞILAŞTIRMALI ALFA',
    },
    {
      name: 'İSABET ORANI',
      value: _hitRate != null ? `%${_hitRate}` : '—',
      change: _outRate != null ? `%${_outRate} BIST ÜSTÜ` : 'VERİ YOK',
      trend: (_hitRate ?? 0) >= 50 ? 'up' : 'down',
      icon: Sparkles,
      color: 'text-primary/70',
      glow: '#22d3ee',
      description: perfData ? `SON ${perfData.days} GÜNLÜK PERFORMANS` : 'TAHMIN DOĞRULUK METRİĞİ',
    },
  ];

  const stats = scene === 0 ? marketStats : scene === 1 ? systemStats : performanceStats;

  return (
    <div className="relative group min-h-[100px] lg:h-[130px] overflow-hidden transition-all duration-700 hover:bg-white/[0.01]">
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 h-full">
        <AnimatePresence mode="wait">
          {stats.map((stat, i) => (
            <motion.div
              key={`${scene}-${stat.name}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="h-full"
            >
              <StatSegment stat={stat} index={i} total={stats.length} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});
