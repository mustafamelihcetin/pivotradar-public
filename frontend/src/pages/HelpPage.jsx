import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const CATEGORIES = [
  { id: 'all',        label: 'Tümü',           icon: 'apps' },
  { id: 'prism',      label: 'PRISM Motor',     icon: 'psychology' },
  { id: 'profiles',   label: 'Profiller',       icon: 'tune' },
  { id: 'data',       label: 'Veri & Pipeline', icon: 'database' },
  { id: 'scoring',    label: 'Skorlama',        icon: 'analytics' },
];

const SECTIONS = [
  {
    id: 'what_is_pivotradar',
    category: 'prism',
    icon: 'hub',
    title: 'PivotRadar Nedir?',
    badge: 'TEMEL',
    badgeColor: '#99f7ff',
    content: [
      {
        type: 'text',
        body: 'PivotRadar, BIST (Borsa İstanbul) hisselerini algoritmik olarak analiz eden bir karar destek yazılımıdır. Fiyat hareketleri, hacim anormallikleri ve teknik indikatörler gerçek zamanlı olarak işlenir; her sembol için QRS (Quant Rating Score) adı verilen sayısal bir skor üretilir.',
      },
      {
        type: 'tags',
        items: [
          { label: 'Yatırım tavsiyesi değildir', color: '#f87171' },
          { label: 'SPK lisanslı değiliz', color: '#fbbf24' },
          { label: 'Algoritmik destek aracı', color: '#99f7ff' },
        ],
      },
    ],
  },
  {
    id: 'prism_engine',
    category: 'prism',
    icon: 'psychology',
    title: 'PRISM Motor Mimarisi',
    badge: 'MİMARİ',
    badgeColor: '#a78bfa',
    content: [
      {
        type: 'text',
        body: 'PRISM (Probabilistic Ranking & Intelligent Signal Model) üç katmandan oluşur:',
      },
      {
        type: 'steps',
        items: [
          { label: 'Teknik Katman', desc: 'RSI, EMA, ATR, hacim rasyo, Bollinger gibi 20+ indikatör hesaplanır.' },
          { label: 'ML Katman', desc: 'HistGradientBoosting modeli eğitim verisine dayalı bir olasılık skoru üretir.' },
          { label: 'PRISM Fusion', desc: 'Profil ağırlıkları kullanılarak teknik + ML + momentum birleştirilir, risk veto mekanizması devreye girer.' },
        ],
      },
    ],
  },
  {
    id: 'risk_guard',
    category: 'prism',
    icon: 'shield',
    title: 'Risk Guard Rails',
    badge: 'GÜVENLİK',
    badgeColor: '#f87171',
    content: [
      {
        type: 'text',
        body: 'Sistem, aşırı ısınmış veya güvenilmez koşulları otomatik olarak tespit edip skoru kısıtlar:',
      },
      {
        type: 'grid',
        items: [
          { label: 'Aşırı Şişme', desc: 'RSI bölge kontrolüne göre skor tavanlanır.', icon: 'thermostat', color: '#f87171' },
          { label: 'Sahte Yükseliş', desc: 'Fiyat yükselirken hacim desteği yoksa puan nötralize edilir.', icon: 'warning', color: '#fbbf24' },
          { label: 'Vade Uyumu', desc: 'Seçili profile uygun olmayan hareketler filtrelenir.', icon: 'schedule', color: '#99f7ff' },
          { label: 'ML Blend Limiti', desc: 'Profil koşulu zayıfsa ML etkisi %15\'e düşürülür.', icon: 'tune', color: '#a78bfa' },
        ],
      },
    ],
  },
  {
    id: 'profiles',
    category: 'profiles',
    icon: 'tune',
    title: 'Strateji Profilleri',
    badge: '7 PROFİL',
    badgeColor: '#34d399',
    content: [
      {
        type: 'text',
        body: 'Her profil, farklı yatırımcı karakterine göre indikatör ağırlıklarını ve risk eşiklerini yeniden kalibre eder:',
      },
      {
        type: 'profile_grid',
        items: [
          { name: 'Güvenli Liman',  role: 'DEFENSIVE',  color: '#99f7ff',  desc: 'Riski minimize eder, sadece düşük volatiliteli fırsatlara odaklanır.' },
          { name: 'Agresif Atak',   role: 'OFFENSIVE',  color: '#f87171',  desc: 'Momentumun en güçlü olduğu yüksek riskli fırsatları hedefler.' },
          { name: 'Dönüş Uzmanı',   role: 'REVERSAL',   color: '#34d399',  desc: 'Kısa düzeltme sonrası ilk dönüş sinyallerini yakalar.' },
          { name: 'Trend Avcısı',   role: 'MOMENTUM',   color: '#fbbf24',  desc: 'Mevcut güçlü trendlerin üzerinde kalmayı sağlar.' },
          { name: 'Değer Kaşifi',   role: 'VALUE',      color: '#7dd3fc',  desc: 'Teknik olarak uyanmaya başlayan iskontolu hisseleri tespit eder.' },
          { name: 'Anlık Fırsatçı', role: 'SCALPER',    color: '#fb923c',  desc: 'Hızlı giriş-çıkış için saniyeli hacim ataklarını filtreler.' },
          { name: 'Kırılım Avcısı', role: 'BREAKOUT',   color: '#c084fc',  desc: 'Kritik direnç seviyelerini zorlayan formasyonları bulur.' },
        ],
      },
    ],
  },
  {
    id: 'qrs_scoring',
    category: 'scoring',
    icon: 'analytics',
    title: 'QRS Skoru Nasıl Okunur?',
    badge: 'SKORLAMA',
    badgeColor: '#fbbf24',
    content: [
      {
        type: 'text',
        body: 'QRS (Quant Rating Score) 0–100 arası bir sayısal değerdir. Yüksek skor, seçili profilin koşullarına daha çok uyan bir hisseyi gösterir:',
      },
      {
        type: 'score_bars',
        items: [
          { range: '85–100', label: 'Güçlü Sinyal',    color: '#34d399', bg: 'rgba(52,211,153,0.08)', pct: 95 },
          { range: '65–84',  label: 'Orta Sinyal',     color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  pct: 75 },
          { range: '45–64',  label: 'Zayıf Sinyal',    color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  pct: 55 },
          { range: '0–44',   label: 'Sinyal Yok',      color: '#f87171', bg: 'rgba(248,113,113,0.08)', pct: 25 },
        ],
      },
      {
        type: 'text',
        body: 'Skor, profil koşulları karşılanmıyorsa otomatik olarak tavanlanır. Örneğin RSI>52 iken "Dönüş Uzmanı" profili maksimum 62 alır.',
      },
    ],
  },
  {
    id: 'data_pipeline',
    category: 'data',
    icon: 'database',
    title: 'Veri Pipeline\'ı',
    badge: 'ALTYAPI',
    badgeColor: '#7dd3fc',
    content: [
      {
        type: 'text',
        body: 'Veriler üç ana kaynaktan toplanır ve PRISM motoruna beslenir:',
      },
      {
        type: 'data_sources',
        items: [
          { label: 'Yahoo Finance',   status: '~15dk gecikme',   color: '#fbbf24', icon: 'candlestick_chart', desc: 'BIST OHLCV fiyatları, normalize edilip önbelleğe alınır.' },
          { label: 'Halk Yatırım',   status: 'Yedek kaynak',    color: '#99f7ff', icon: 'backup',            desc: 'Primary kaynak yanıt vermezse fallback olarak kullanılır.' },
          { label: 'İç Cache (Redis)',status: 'Anlık',            color: '#34d399', icon: 'bolt',             desc: 'Tüm hesaplanmış özellikler Redis\'te 90 dakika önbellekte kalır.' },
        ],
      },
    ],
  },
  {
    id: 'weekly_cycle',
    category: 'data',
    icon: 'refresh',
    title: 'Haftalık ML Döngüsü',
    badge: 'OTOMATİK',
    badgeColor: '#a78bfa',
    content: [
      {
        type: 'text',
        body: 'Her Pazar ML modeli otomatik olarak yeniden eğitilir:',
      },
      {
        type: 'steps',
        items: [
          { label: 'Veri Güncelleme',  desc: 'Son 12 aylık OHLCV verileri yenilenir.' },
          { label: 'Etiketleme',       desc: 'Geçmiş sinyal başarıları hesaplanarak eğitim verisi oluşturulur.' },
          { label: 'Yeniden Eğitim',  desc: 'HistGradientBoosting modeli son 3 versiyonu saklayarak yenilenir.' },
          { label: 'Kalibrasyon',      desc: 'Profil eşikleri calibration engine ile optimize edilir.' },
        ],
      },
    ],
  },
];

function SectionContent({ content }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {content.map((block, i) => {
        if (block.type === 'text') {
          return (
            <p key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, fontFamily: "'Inter', sans-serif" }}>
              {block.body}
            </p>
          );
        }
        if (block.type === 'tags') {
          return (
            <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {block.items.map(t => (
                <span key={t.label} style={{ fontSize: 9, fontWeight: 900, color: t.color, background: t.color + '14', border: `1px solid ${t.color}30`, borderRadius: 3, padding: '3px 8px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {t.label}
                </span>
              ))}
            </div>
          );
        }
        if (block.type === 'steps') {
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {block.items.map((step, j) => (
                <div key={j} style={{ display: 'flex', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: '#99f7ff', background: 'rgba(153,247,255,0.1)', border: '1px solid rgba(153,247,255,0.2)', borderRadius: 3, padding: '2px 6px', fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0, alignSelf: 'flex-start', marginTop: 1 }}>{j + 1}</span>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 2 }}>{step.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        if (block.type === 'grid') {
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {block.items.map(item => (
                <div key={item.label} style={{ padding: '10px 12px', background: item.color + '08', border: `1px solid ${item.color}20`, borderRadius: 4, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: item.color, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        if (block.type === 'profile_grid') {
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
              {block.items.map(p => (
                <div key={p.name} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${p.color}20`, borderRadius: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.06em', fontFamily: "'IBM Plex Mono', monospace" }}>{p.name}</span>
                    <span style={{ fontSize: 8, fontWeight: 900, color: p.color, background: p.color + '14', border: `1px solid ${p.color}30`, borderRadius: 3, padding: '1px 5px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>{p.role}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          );
        }
        if (block.type === 'score_bars') {
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {block.items.map(item => (
                <div key={item.range} style={{ padding: '8px 12px', background: item.bg, border: `1px solid ${item.color}25`, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: item.color, fontFamily: "'IBM Plex Mono', monospace", width: 52, flexShrink: 0 }}>{item.range}</span>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: 2, boxShadow: `0 0 6px ${item.color}60` }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif", width: 90, flexShrink: 0, textAlign: 'right' }}>{item.label}</span>
                </div>
              ))}
            </div>
          );
        }
        if (block.type === 'data_sources') {
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {block.items.map(src => (
                <div key={src.label} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: src.color, flexShrink: 0 }}>{src.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.7)', fontFamily: "'IBM Plex Mono', monospace" }}>{src.label}</span>
                      <span style={{ fontSize: 8, fontWeight: 900, color: src.color, background: src.color + '14', border: `1px solid ${src.color}30`, borderRadius: 3, padding: '1px 5px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>{src.status}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>{src.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function SectionCard({ section }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(153,247,255,0.06)', border: '1px solid rgba(153,247,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#99f7ff' }}>{section.icon}</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>{section.title}</div>
        </div>
        <span style={{ fontSize: 8, fontWeight: 900, color: section.badgeColor, background: section.badgeColor + '14', border: `1px solid ${section.badgeColor}30`, borderRadius: 3, padding: '2px 7px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.12em', flexShrink: 0 }}>{section.badge}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)', transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>expand_more</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ paddingTop: 12 }}>
                <SectionContent content={section.content} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HelpPage() {
  const [activeCategory, setActiveCategory] = useState('all');

  const filtered = SECTIONS.filter(s => activeCategory === 'all' || s.category === activeCategory);

  return (
    <div style={{ minHeight: '100dvh', background: '#05070a', color: '#fff', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Helmet>
        <title>Yardım Merkezi | PivotRadar</title>
        <meta name="description" content="PivotRadar PRISM motor mimarisi, QRS skorlama, strateji profilleri ve veri pipeline dokümantasyonu." />
        <link rel="canonical" href="https://pivot-radar.com/help" />
      </Helmet>

      {/* Top nav */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(5,7,10,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 2, height: 16, borderRadius: 1, background: '#99f7ff', boxShadow: '0 0 6px rgba(153,247,255,0.5)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>Yardım Merkezi</span>
            <span style={{ fontSize: 8, fontWeight: 900, color: 'rgba(153,247,255,0.4)', background: 'rgba(153,247,255,0.06)', border: '1px solid rgba(153,247,255,0.12)', borderRadius: 3, padding: '2px 6px', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.1em' }}>PRISM CORE</span>
          </div>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace', transition: 'color 0.15s'" }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_back</span>
            Ana Sayfa
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'rgba(255,255,255,0.88)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6 }}>
            Platform Dokümantasyonu
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, fontFamily: "'Inter', sans-serif", maxWidth: 600 }}>
            PRISM motor mimarisi, QRS skorlama sistemi, strateji profilleri ve veri pipeline'ı hakkında teknik referans.
          </p>
        </div>

        {/* Category filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase',
                fontFamily: "'IBM Plex Mono', monospace",
                transition: 'all 0.15s',
                background: activeCategory === cat.id ? 'rgba(153,247,255,0.12)' : 'rgba(255,255,255,0.03)',
                border: activeCategory === cat.id ? '1px solid rgba(153,247,255,0.35)' : '1px solid rgba(255,255,255,0.06)',
                color: activeCategory === cat.id ? '#99f7ff' : 'rgba(255,255,255,0.3)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Sections */}
        <AnimatePresence mode="wait">
          <motion.div key={activeCategory} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(s => <SectionCard key={s.id} section={s} />)}
          </motion.div>
        </AnimatePresence>

        {/* Support CTA */}
        <div style={{ marginTop: 32, padding: '16px 20px', background: '#07090e', border: '1px solid rgba(153,247,255,0.1)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#99f7ff' }}>headphones</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>Sorunuz mu var?</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', sans-serif" }}>Destek ekibimize ulaşabilirsiniz.</div>
            </div>
          </div>
          <Link
            to="/support"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'rgba(153,247,255,0.08)', border: '1px solid rgba(153,247,255,0.25)', borderRadius: 4, color: '#99f7ff', fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: "'IBM Plex Mono', monospace", transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(153,247,255,0.14)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(153,247,255,0.08)'}
          >
            Destek Platformu
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>arrow_forward</span>
          </Link>
        </div>

        {/* Footer note */}
        <p style={{ marginTop: 20, fontSize: 9, color: 'rgba(255,255,255,0.1)', textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}>
          PIVOTRADAR TERMINAL · PRISM CORE · 2026 · Matematiksel karar destek yazılımı
        </p>
      </div>
    </div>
  );
}
