import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, Zap, Activity, Scale, CheckCircle2,
  Target, Gem, Shield, Flame,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

const profiles = [
  {
    id: 'Dengeli',
    name: 'Dengeli Strateji',
    subtitle: 'Risk ve Getiri Optimizasyonu',
    desc: 'RSI, EMA, hacim ve momentum göstergelerini dengeli ağırlıkla değerlendiren PivotRadar varsayılan profilidir.',
    icon: Scale,
    badge: 'VARSAYILAN',
    badgeColor: 'text-primary bg-primary/10 border-primary/20',
    stats: { win: 68, rr: '1:2.0', risk: 'Düşük', horizon: '3–10 gün' },
    gradient: 'from-cyan-400/15 to-cyan-400/5',
    accentColor: '#22d3ee',
    riskLevel: 1,
  },
  {
    id: 'Swing',
    name: 'Dönüş Uzmanı',
    subtitle: 'Kısa Vadeli Dip ve Dönüşler',
    desc: 'Aşırı satım bölgelerinden (RSI < 45) güçlü dönüş sinyallerini yakalar. Teknik dip noktalarını hedefler.',
    icon: TrendingUp,
    badge: 'POPÜLER',
    badgeColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    stats: { win: 71, rr: '1:3.0', risk: 'Orta', horizon: '5–15 gün' },
    gradient: 'from-emerald-400/15 to-emerald-400/5',
    accentColor: '#34d399',
    riskLevel: 2,
  },
  {
    id: 'Trend',
    name: 'Trend Avcısı',
    subtitle: 'Güçlü Momentum Takibi',
    desc: 'EMA hizalaması ve sürdürülebilir RSI (50–70) bölgesindeki hisseleri filtreler. Sabırlı yatırımcılar için idealdir.',
    icon: Activity,
    badge: null,
    badgeColor: '',
    stats: { win: 66, rr: '1:3.5', risk: 'Orta', horizon: '10–30 gün' },
    gradient: 'from-yellow-400/12 to-yellow-400/4',
    accentColor: '#fbbf24',
    riskLevel: 2,
  },
  {
    id: 'Scalper',
    name: 'Anlık Fırsatçı',
    subtitle: 'Yüksek Frekanslı Hızlı Atak',
    desc: 'ATR oynaklığı ve anlık hacim patlamalarını (V5/V20 > 2) hedefler. Extreme RSI bölgelerinde kazanç.',
    icon: Zap,
    badge: 'YÜKSEK RİSK',
    badgeColor: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    stats: { win: 64, rr: '1:1.5', risk: 'Yüksek', horizon: '0–2 gün' },
    gradient: 'from-orange-400/12 to-orange-400/4',
    accentColor: '#fb923c',
    riskLevel: 4,
  },
  {
    id: 'Kirilim',
    name: 'Kırılım Dedektörü',
    subtitle: 'Teknik Formasyon Kırılımları',
    desc: 'BB Squeeze sonrası yüksek hacimle gerçekleşen fiyat kırılımlarını yakalar. RSI 55–75 momentumu arar.',
    icon: Target,
    badge: null,
    badgeColor: '',
    stats: { win: 62, rr: '1:4.0', risk: 'Orta-Yüksek', horizon: '1–5 gün' },
    gradient: 'from-purple-400/12 to-purple-400/4',
    accentColor: '#a855f7',
    riskLevel: 3,
  },
  {
    id: 'Deger',
    name: 'Değer Kaşifi',
    subtitle: 'Teknik Olarak Düşük Fiyatlı Hisseler',
    desc: 'RSI < 40 bölgesindeki derin satım baskısından çıkan, teknik göstergelere göre düşük fiyatlı görünen hisseleri tarar. Temel/finansal analiz içermez.',
    icon: Gem,
    badge: null,
    badgeColor: '',
    stats: { win: 69, rr: '1:4.5', risk: 'Düşük-Orta', horizon: '15–60 gün' },
    gradient: 'from-sky-400/10 to-cyan-400/4',
    accentColor: '#38bdf8',
    riskLevel: 1,
  },
  {
    id: 'Konservatif',
    name: 'Güvenli Liman',
    subtitle: 'Maksimum Sermaye Koruması',
    desc: 'Düşük ATR oynaklığı, RSI 40–60 dengeli bölge ve güçlü EMA hizalaması şartlarını birlikte arar.',
    icon: Shield,
    badge: 'GÜVENLİ',
    badgeColor: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    stats: { win: 73, rr: '1:1.8', risk: 'Çok Düşük', horizon: '7–20 gün' },
    gradient: 'from-sky-400/12 to-sky-400/4',
    accentColor: '#38bdf8',
    riskLevel: 1,
  },
  {
    id: 'Agresif',
    name: 'Maksimum Büyüme',
    subtitle: 'Yüksek Riskli Momentum Odaklı',
    desc: 'Güçlü yükseliş momentumu (RSI ≥ 60), yüksek hacim patlaması ve aktif kırılım sinyali birleşimini hedefler.',
    icon: Flame,
    badge: 'MAX RİSK',
    badgeColor: 'text-red-400 bg-red-400/10 border-red-400/20',
    stats: { win: 58, rr: '1:5.0', risk: 'Çok Yüksek', horizon: '1–7 gün' },
    gradient: 'from-red-400/12 to-red-400/4',
    accentColor: '#f87171',
    riskLevel: 5,
  },
];

const RISK_LABELS = ['', 'Çok Düşük', 'Düşük–Orta', 'Orta', 'Yüksek', 'Çok Yüksek'];
const RISK_COLORS = ['', '#34d399', '#22d3ee', '#fbbf24', '#fb923c', '#f87171'];

function RiskBar({ level }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="h-1.5 flex-1 rounded-full transition-all duration-500"
          style={{ background: i <= level ? RISK_COLORS[level] : 'rgba(255,255,255,0.06)' }}
        />
      ))}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[8px] text-white/25 font-black uppercase tracking-[0.2em] leading-none">{label}</span>
      <span className={cn('text-[12px] font-black font-mono leading-none', color)}>{value}</span>
    </div>
  );
}

export function ProfileSelector({ selectedProfile, onSelect }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {profiles.map((p, idx) => {
        const Icon = p.icon;
        const active = selectedProfile === p.id;
        return (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.35 }}
            whileHover={{ y: -2, scale: 1.005 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'group text-left rounded-2xl border transition-all duration-300 relative overflow-hidden',
              active
                ? 'border-opacity-100 shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1'
                : 'border-white/[0.12] bg-[#12151e] hover:border-white/15 hover:bg-surface/40'
            )}
            style={active ? {
              borderColor: `${p.accentColor}55`,
              background: `linear-gradient(135deg, ${p.accentColor}0d 0%, rgba(6,9,15,0.95) 60%)`,
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${p.accentColor}22`,
            } : {}}
          >
            {/* Hover glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at 0% 50%, ${p.accentColor}15, transparent 65%)` }}
            />

            {/* Active left accent line */}
            {active && (
              <motion.div
                layoutId="activeAccent"
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
                style={{ background: `linear-gradient(180deg, ${p.accentColor}00, ${p.accentColor}, ${p.accentColor}00)` }}
              />
            )}

            <div className="p-5 relative">
              {/* Top row */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-300')}
                  style={active
                    ? { background: `${p.accentColor}20`, borderColor: `${p.accentColor}40`, boxShadow: `0 0 20px ${p.accentColor}30` }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }
                  }
                >
                  <Icon size={20} strokeWidth={1.8}
                    style={{ color: active ? p.accentColor : 'rgba(255,255,255,0.3)' }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-black text-[13px] leading-tight uppercase tracking-tight transition-colors"
                      style={{ color: active ? p.accentColor : 'rgba(255,255,255,0.85)' }}>
                      {p.name}
                    </span>
                    {active && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded font-black tracking-widest"
                        style={{ background: `${p.accentColor}20`, color: p.accentColor, border: `1px solid ${p.accentColor}30` }}
                      >
                        <CheckCircle2 size={8} /> AKTİF
                      </motion.span>
                    )}
                    {p.badge && (
                      <span className={cn('text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border', p.badgeColor)}>
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-white/25 font-mono uppercase tracking-wider">{p.subtitle}</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-[11px] text-white/45 leading-relaxed mb-3">{p.desc}</p>

              {/* Risk bar */}
              <div className="mb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/20">Risk Seviyesi</span>
                  <span className="text-[9px] font-black" style={{ color: RISK_COLORS[p.riskLevel] }}>
                    {RISK_LABELS[p.riskLevel]}
                  </span>
                </div>
                <RiskBar level={p.riskLevel} />
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 pt-3 border-t border-white/[0.05]">
                <Stat label="Başarı Oranı" value={`%${p.stats.win}`} color="text-emerald-400" />
                <div className="w-px h-6 bg-[#12151e]" />
                <Stat label="Risk/Ödül" value={p.stats.rr} color="text-primary" />
                <div className="w-px h-6 bg-[#12151e]" />
                <Stat label="Süre" value={p.stats.horizon} color="text-white/40" />
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
