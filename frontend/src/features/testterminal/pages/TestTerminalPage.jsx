import React, {
  useState, useMemo, useEffect, useCallback, lazy, Suspense, useRef,
} from 'react';
import { createPortal } from 'react-dom';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { NavLink, Link, useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ChevronDown, Search, FlaskConical,
  LayoutDashboard, Terminal, Wallet, Activity, BarChart2, Wrench, Newspaper,
  Pin, LogOut, LogIn, HelpCircle, MessageCircle,
  RefreshCw, TrendingUp, TrendingDown, Minus,
  Star, User, Info, UserPlus,
  Copy, Briefcase, ShieldCheck,
} from 'lucide-react';
import { AppSidebar } from '@/core/layout/AppSidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { InfoTip } from '@/shared/components/InfoTip';
import { TickerLogo } from '@/shared/components/TickerLogo';
import { useScanStore }      from '@/core/store/useScanStore';
import useAuthStore          from '@/store/useAuthStore';
import { api }               from '@/core/api/client';
import { DEFAULT_PROFILES }  from '@/features/dashboard/components/controls/constants';
import { normaliseProfiles } from '@/features/dashboard/utils/dashboardHelpers';
import { useMarketStatus }   from '@/features/dashboard/hooks/useMarketStatus';
import { useAnalyze }        from '@/features/dashboard/hooks/useAnalyze';
import { useDataWatchdog }   from '@/features/dashboard/hooks/useDataWatchdog';
import { useGuestLimit }     from '@/features/dashboard/hooks/useGuestLimit';
import { useQueryClient }    from '@tanstack/react-query';

const Ticker = lazy(() => import('@/shared/components/Ticker'));

// ── Responsive hook ────────────────────────────────────────────────────────────
function useBreakpoint() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1100, isDesktop: w >= 1100, width: w };
}

// ── φ = 1.618 — Altın Oran Sistem Sabitleri ───────────────────────────────────
//
//  Spacing zinciri:  4 → 6 → 10 → 16 → 26 → 42 → 68 → 110 → 178
//  Her değer bir öncekinin φ katı: 4×φ=6.47≈6, 6×φ=9.7≈10, 10×φ=16.2≈16, vb.
//
//  Font zinciri:     8 → 10 → 11 → 13 → 16 → 21 → 26
//  (Yaklaşık φ adımları, ekran okunabilirliğiyle dengelenmiş)
//
//  Yükseklikler:     26(φ²) → 34(φ².5) → 42(φ³) → 68(φ⁴) → 110(φ⁵) → 178(φ⁶)
//
const φ = 1.618;

const SP = {
  1:  4,   // minimum boşluk, ince çizgi padding
  2:  6,   // küçük padding (4×φ≈6.5)
  3: 10,   // orta padding (6×φ≈9.7)
  4: 16,   // büyük padding (10×φ≈16.2)
  5: 26,   // XL (16×φ≈25.9) — kart başlık yüksekliği, tablo başlığı
  6: 42,   // XXL (26×φ≈42) — topbar yüksekliği
  7: 68,   // HERO (42×φ≈68) — sidebar collapsed genişliği
  8:110,   // 68×φ≈110
  9:178,   // 110×φ≈178 — sidebar expanded genişliği
};

const FS = {
  micro: 11,   // +1 seviye: badge/label minimumu
  tiny:  13,   // +1 seviye: kolon başlıkları, etiketler (UPPERCASE)
  xs:    14,   // +1 seviye: ikincil veri
  sm:    16,   // +1 seviye: birincil body, tablo hücreleri
  md:    20,   // +1 seviye: semboller, önemli etiketler
  lg:    26,   // +1 seviye: fiyatlar, skorlar
  xl:    32,   // +1 seviye: büyük gösterim değerleri
  xxl:   40,   // +1 seviye: hero fiyat
};

const H = {
  ticker:      30,       // alt ticker
  topbar:      SP[6],    // 42px — filtreler
  infobar:     SP[5],    // 26px — sistem durumu (topbar/infobar = 42/26 ≈ φ)
  tableHdr:    SP[5],    // 26px
  tableRow:    42,       // şirket adı için iki satıra çıkarıldı
  cardHdr:     SP[5],    // 26px
  sigRow:      42,       // sinyal/takip satırı — iki satır içerik için
  sidebarC:    SP[7],    // 68px collapsed
  sidebarE:    SP[9],    // 178px expanded (68×φ²≈178)
  metricChip:  SP[6],    // 42px minimum yükseklik
};

// ── Design tokens ──────────────────────────────────────────────────────────────
const S = {
  bg0:       '#05070a',   // en koyu arka plan
  bg1:       '#07090e',   // sayfa arka planı
  bg2:       '#0b0e16',   // yüzey
  bg3:       '#0d1118',   // raised yüzey
  bg4:       '#111520',   // hover
  border0:   'rgba(255,255,255,0.035)',  // çok ince
  border1:   'rgba(255,255,255,0.06)',   // standart
  border2:   'rgba(255,255,255,0.10)',   // belirgin
  positive:  '#34d399',
  negative:  '#f87171',
  primary:   '#99f7ff',
  primaryLo: 'rgba(153,247,255,0.6)',
  amber:     '#fbbf24',
  purple:    '#a855f7',
  emerald:   '#34d399',
  mono:      "'IBM Plex Mono', ui-monospace, monospace",
  sans:      "'Inter', system-ui, sans-serif",
};

// ── Renk yardımcıları ──────────────────────────────────────────────────────────
const colML  = m => m >= 70 ? S.positive : m >= 50 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)';
const colRSI = r =>
  r >= 70 ? S.negative                   // aşırı alım — kırmızı
: r >= 60 ? 'rgba(251,191,36,0.85)'      // ısınıyor — amber
: r >= 45 ? 'rgba(255,255,255,0.55)'     // nötr
: r >= 30 ? 'rgba(99,202,183,0.8)'       // soğuyor — teal
:           S.positive;                  // aşırı satım — yeşil
const colQRS = q => q >= 85 ? S.primary : q >= 70 ? 'rgba(255,255,255,0.85)' : q >= 50 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';

// ── Sektör renk paleti ─────────────────────────────────────────────────────────
// Eski sector_mapping değerlerini (BANKA, GIDA, ULASIM…) Türkçe'ye çevirir
const _SECTOR_LEGACY = {
  'BANKA': 'Bankacılık', 'FINANS': 'Finans', 'SIGORTA': 'Finans',
  'GIDA': 'Gıda', 'ICEÇEK': 'Gıda', 'PERAKENDE': 'Perakende',
  'HOLDING': 'Holding', 'TEKNOLOJI': 'Teknoloji', 'YAZILIM': 'Teknoloji',
  'ENERJI': 'Enerji', 'ELEKTRIK': 'Enerji',
  'GYO': 'GYO', 'GAYRIMENKUL': 'GYO',
  'SANAYI': 'Sanayi', 'IMALAT': 'Sanayi', 'METAL': 'Sanayi',
  'KIMYA': 'Kimya', 'PLASTIK': 'Kimya',
  'INSAAT': 'İnşaat', 'CIMENTO': 'İnşaat',
  'TEKSTIL': 'Tekstil', 'GIYIM': 'Tekstil',
  'ULASIM': 'Ulaşım', 'LOJISTIK': 'Ulaşım', 'HAVACILIK': 'Ulaşım',
  'OTOMOTIV': 'Otomotiv', 'BEYAZ_ESYA': 'Otomotiv',
  'SAGLIK': 'Sağlık', 'ILAC': 'Sağlık',
  'TARIM': 'Tarım', 'MADENCILIK': 'Madencilik',
};
// Sembol bazlı sektör düzeltmeleri (backend data hataları için)
const _SECTOR_OVERRIDE = {
  // Gıda
  ETILR:'Gıda', TATGD:'Gıda', BANVT:'Gıda', PETUN:'Gıda', PNSUT:'Gıda',
  SELVA:'Gıda', AVOD:'Gıda', FRIGO:'Gıda', YYLGD:'Gıda', KAYSE:'Gıda',
  VANGD:'Gıda', TABGD:'Gıda',
  // İnşaat
  PNLSN:'İnşaat', TEKTU:'İnşaat', CONSE:'İnşaat', TKFEN:'İnşaat', SUMAS:'İnşaat',
  // Sağlık
  BLCYT:'Sağlık', ECZYT:'Sağlık', AGEN:'Sağlık', BIENP:'Sağlık', MPARK:'Sağlık',
  // Enerji
  MAGEN:'Enerji',
  CWENE:'Enerji', BIOEN:'Enerji', MANAS:'Enerji', SAYAS:'Enerji',
  SANEL:'Enerji', GEREL:'Enerji', ORGE:'Enerji', IZENR:'Enerji',
  // Tekstil
  KLSYN:'Tekstil', MTRKS:'Tekstil', HATEK:'Tekstil', ARSAN:'Tekstil',
  BOSSA:'Tekstil', YUNSA:'Tekstil', SKTAS:'Tekstil', DAGI:'Tekstil', LUKSK:'Tekstil',
  // Otomotiv
  JANTS:'Otomotiv', BFREN:'Otomotiv', KARSN:'Otomotiv',
  // Metal
  EREGL:'Metal', KRDMA:'Metal', KRDMB:'Metal', KRDMD:'Metal',
  ISDMR:'Metal', IZMDC:'Metal', CEMAS:'Metal', CEMTS:'Metal',
  CUSAN:'Metal', DMSAS:'Metal', ERBOS:'Metal', TUCLK:'Metal',
  SARKY:'Metal', MEGMT:'Metal',
  // Madencilik
  QUAGR:'Madencilik', KIMMR:'Madencilik', PRKME:'Madencilik',
  // Makine
  BURVA:'Makine', KLMSN:'Makine', MMCAS:'Makine', PARSN:'Makine',
  SANFM:'Makine', GESAN:'Makine', INTEM:'Makine', PRKAB:'Makine',
  // Kimya
  MERCN:'Kimya',
  // Holding
  SILVR:'Holding', MTRYO:'Holding',
  // Mobilya
  YATAS:'Mobilya',
  // Finans
  BNTAS:'Finans',
};
const _HIDDEN_SECTORS = new Set(['Diğer', 'DIGER', 'OTHER', 'DIGER2', '']);
const normalizeSector = (raw, sym) => {
  if (sym && _SECTOR_OVERRIDE[sym]) return _SECTOR_OVERRIDE[sym];
  if (!raw) return null;
  if (_HIDDEN_SECTORS.has(raw)) return null;
  if (_SECTOR_LEGACY[raw]) return _SECTOR_LEGACY[raw];
  return raw;
};

const SECTOR_COLOR = {
  'Bankacılık':        '#60a5fa', 'Finans':            '#60a5fa',
  'Sanayi':            '#f59e0b', 'İmalat':            '#f59e0b',
  'Teknoloji':         '#a78bfa', 'Yazılım':           '#a78bfa',
  'Enerji':            '#f97316', 'Elektrik':          '#f97316',
  'Gayrimenkul':       '#34d399', 'GYO':               '#34d399',
  'Perakende':         '#fb7185', 'Gıda':              '#fb7185',
  'Holding':           '#94a3b8', 'Ulaşım':            '#38bdf8',
  'Otomotiv':          '#fb923c', 'İnşaat':            '#a16207',
  'Kimya':             '#c084fc', 'Tekstil':           '#f0abfc',
  'Sağlık':            '#6ee7b7', 'Tarım':             '#86efac',
  'Madencilik':        '#d4a574', 'Diğer':             '#64748b',
  'Metal':             '#b0bec5', 'Makine':            '#7c8fa1',
  'Mobilya':           '#92400e',
};
const getSectorColor = s => {
  if (!s) return '#64748b';
  for (const [k, v] of Object.entries(SECTOR_COLOR)) {
    if (s.includes(k)) return v;
  }
  return '#64748b';
};

// ── Data accessors ─────────────────────────────────────────────────────────────
const getSym   = i => (i.symbol    || i.Sembol    || '').toUpperCase().trim();
const getPrice = i =>  i.Fiyat     ?? i.last      ?? i.close     ?? null;
const getChg   = i =>  i.change_pct ?? i.Değişim  ?? 0;
const getVol   = i =>  i.Hacim     ?? i.volume    ?? 0;
const getRSI   = i =>  i.RSI       ?? i.rsi       ?? 0;
const getML    = i =>  i.ml_score  ?? i.ML        ?? 0;
const getMLCal = i =>  i.ml_score_cal ?? null;  // kalibre edilmiş tarihsel oran
const getQRS   = i =>  i.QRS       ?? i.yzdsh     ?? i.qrs ?? 0;
const getFrm    = i =>  i.pattern_name ?? i.Formasyon ?? null;
const getFrm2   = i =>  i.secondary_pattern_name ?? null;  // ikincil formasyon
// Şirket isimleri artık tamamen backend bist_names.json'dan geliyor.
// GitHub (ahmeterenodaci/Istanbul-Stock-Exchange) + BigPara kaynaklı, 669 hisse.
// Buraya ASLA manuel isim ekleme — rebuild_bist_names.py ile güncelle.
const BIST_NAMES = {};
const _GENERIC = new Set(['SANAYI','SANAYİ','HOLDİNG','HOLDING','TİCARET','TICARET','ENERJİ','ENERJI','GRUP','GROUP','AŞ','A.Ş','LTD','ŞIRKETI']);
let _dynNames = {}; // backend'den dinamik olarak doldurulur
const getCo = i => {
  const sym = (i.symbol || i.Sembol || '').toUpperCase().trim();
  // Statik ve dinamik isimler her zaman önce gelir — eski localStorage verisi ezemez
  if (BIST_NAMES[sym]) return BIST_NAMES[sym];
  if (_dynNames[sym]) return _dynNames[sym];
  const raw = i.company_name ?? i.name ?? i.Name ?? '';
  const cleaned = raw.trim();
  if (!cleaned || cleaned.toUpperCase().trim() === sym) return '';
  const words = cleaned.toUpperCase().replace(/[^A-ZÇĞİÖŞÜa-zçğışöüşü\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1 && _GENERIC.has(words[0])) return cleaned;
  return cleaned;
};
// BIST Katılım Endeksi (KTMLM) bileşenleri — her çeyrek güncellenebilir
const KATILIM_SET = new Set([
  'THYAO','PGSUS','TAVHL','CLEBI','RYSAS','HOROZ','ULUSE','MARTI',
  'FROTO','TOASO','TTRAK','ASUZU','OTKAR',
  'ARCLK','VESTL','VESBE',
  'ASELS','RODRG','VBTYZ','ARDYZ','LOGO','KAREL','PENTA','ARENA','FONET','DGATE','SDTTR',
  'AKSEN','AKENR','ENJSA','GWIND','ZOREN','AYDEM','EUPWR','BIOEN','CWENE','ORGE','ODAS','IZENR','KCAER',
  'BIMAS','MGROS','SOKM','BIZIM','CRFSA','METRO',
  'AEFES','CCOLA','ULKER','PNSUT','PETUN','TATGD','BANVT','SELVA','PNLSN','PINSU','AVOD','FRIGO','YYLGD',
  'PETKM','TUPRS','AKSA','GUBRF','SASA','GOODY','BRISA','ALKIM',
  'SISE',
  'ENKAI','AKCNS','NUHCM','CIMSA','OYAKC','BTCIM','BUCIM','BSOKE','AFYON','KONYA','KUTPO','TEKTU','CONSE',
  'EREGL','KRDMA','KRDMB','KRDMD','ISDMR','IZMDC',
  'BURVA','JANTS','KAYSE','KARSN','BNTAS','BFREN','CEMAS','CEMTS','CUSAN','DMSAS',
  'ERBOS','GEREL','GESAN','HATEK','INTEM','KIMMR','KLMSN','LUKSK','MAKTK','MEGMT',
  'MERCN','MMCAS','MTRKS','MTRYO','PARSN','PRKAB','PRKME','QUAGR','SAMAT','SANEL',
  'SANFM','SARKY','SAYAS','SILVR','SUMAS','TUCLK','YATAS',
  'ARSAN','BOSSA','YUNSA','SKTAS','DAGI','KLSYN','MANAS',
  'MPARK','BLCYT','ECZYT','AGEN','BIENP',
  'EKGYO','ISGYO','VKGYO','ALGYO','AKSGY','YGGYO','KZBGY','MHRGY','KZGYO','DGGYO','OZGYO','PAGYO','NUGYO','TDGYO',
  'DOAS','HEKTS','DARDL','IZFAS','ETILR','OZSUB','LMKDC','EKIZ','GIPTA','KRSTL','PKART',
]);

const getTgt   = i =>  i.target_price   ?? null;
const getSup   = i =>  i.stop_price     ?? null;
const getRR    = i =>  i.risk_reward    ?? null;
const getDays  = i =>  i.predicted_days ?? null;
const getDir   = i =>  i.direction      ?? null;
const getLabel = i =>  i.quality_label  ?? null;

// ── Formasyon verileri ─────────────────────────────────────────────────────────
const FRM_SHORT = {
  // Trend kanalları
  'Yükselen Kanal':   'Y.KANAL',
  'Alçalan Kanal':    'A.KANAL',
  // Takozlar
  'Yükselen Takoz':   'Y.TAKOZ',
  'Alçalan Takoz':    'A.TAKOZ',
  // Üçgenler
  'Daralan Üçgen':    'D.ÜÇGEN',
  'Genişleyen Üçgen': 'G.ÜÇGEN',
  'Yükselen Üçgen':   'Y.ÜÇGEN',
  'Alçalan Üçgen':    'A.ÜÇGEN',
  // Baş-omuz
  'Baş Omuz':         'B.OMUZ',
  'Ters Baş Omuz':    'T.B.OMUZ',
  // Çift/Üçlü
  'Çift Tepe':        'Ç.TEPE',
  'Çift Dip':         'Ç.DİP',
  'Üçlü Tepe':        'Ü.TEPE',
  'Üçlü Dip':         'Ü.DİP',
  // Destek/Direnç
  'Destek Hattı':     'DESTEK',
  'Direnç Hattı':     'DİRENÇ',
  // Konsolidasyon
  'Range/Kutu':       'KUTU',
  // Devam formasyonları
  'Bayrak':           'BAYRAK',
  'Flama':            'FLAMA',
  'Kupa Sap':         'KUPA',
};
const FRM_COLOR = {
  'Yükselen Kanal':   '#22d3ee',
  'Alçalan Kanal':    '#fb923c',
  'Yükselen Takoz':   '#f87171',
  'Alçalan Takoz':    '#34d399',
  'Daralan Üçgen':    '#f59e0b',
  'Genişleyen Üçgen': '#e879f9',
  'Yükselen Üçgen':   '#22d3ee',
  'Alçalan Üçgen':    '#fb923c',
  'Baş Omuz':         '#f87171',
  'Ters Baş Omuz':    '#34d399',
  'Çift Tepe':        '#f87171',
  'Çift Dip':         '#34d399',
  'Üçlü Tepe':        '#fca5a5',
  'Üçlü Dip':         '#6ee7b7',
  'Destek Hattı':     '#4ade80',
  'Direnç Hattı':     '#f87171',
  'Range/Kutu':       '#94a3b8',
  'Bayrak':           '#fbbf24',
  'Flama':            '#fbbf24',
  'Kupa Sap':         '#99f7ff',
};
const ALL_FORMATIONS = Object.keys(FRM_SHORT);

// ── Formasyon açıklamaları (son kullanıcı dili) ────────────────────────────────
const PATTERN_INFO = {
  'Yükselen Kanal': {
    desc: 'Fiyat, yükselen iki paralel çizgi arasında düzenli bir şekilde ilerliyor. Kanal alt bandına yakın olmak alım için daha avantajlıdır.',
    signal: 'bullish',
  },
  'Alçalan Kanal': {
    desc: 'Fiyat, alçalan iki paralel çizgi arasında sıkışmış durumda. Üst bandın güçlü hacimle kırılması trendin tersine döndüğüne işaret edebilir.',
    signal: 'bearish',
  },
  'Yükselen Takoz': {
    desc: 'Fiyat yükselirken ivme kayboluyor. Alım iştahı azalıyor; aşağı kırılım riski yüksek.',
    signal: 'bearish',
  },
  'Alçalan Takoz': {
    desc: 'Fiyat düşerken satış baskısı zayıflıyor. Düşüş momentumu tükeniyor; yukarı kırılım potansiyeli var.',
    signal: 'bullish',
  },
  'Daralan Üçgen': {
    desc: 'Alıcı ve satıcılar giderek daralan bir aralıkta güç savaşı yapıyor. Kırılım yönü büyük bir hareket başlatabilir.',
    signal: 'neutral',
  },
  'Genişleyen Üçgen': {
    desc: 'Fiyat giderek büyüyen salınımlar yapıyor; belirsizlik ve volatilite yüksek. Her iki yönde sert hareket beklenebilir.',
    signal: 'neutral',
  },
  'Yükselen Üçgen': {
    desc: 'Yatay direnç altında her düşüşte alıcılar daha erken devreye giriyor. Üst bant kırılımı izleniyor.',
    signal: 'bullish',
  },
  'Alçalan Üçgen': {
    desc: 'Yatay destek üzerinde her yükselişte satıcılar daha erken baskı yapıyor. Alt bant kırılımı izleniyor.',
    signal: 'bearish',
  },
  'Baş Omuz': {
    desc: 'Üç tepeden oluşan klasik dönüş formasyonu: sol omuz, yüksek baş, sağ omuz. Boyun çizgisi kırılımı izleniyor.',
    signal: 'bearish',
  },
  'Ters Baş Omuz': {
    desc: 'Baş-Omuzun tersi: üç dipten oluşan dönüş formasyonu. Boyun çizgisi yukarı kırılımı izleniyor.',
    signal: 'bullish',
  },
  'Çift Tepe': {
    desc: 'Fiyat iki kez aynı zirveyi test etti ve geri döndü. Direnç bölgesi teknik olarak güçlü görünüyor.',
    signal: 'bearish',
  },
  'Çift Dip': {
    desc: 'Fiyat iki kez aynı desteği test etti ve yukarı döndü. Destek bölgesi teknik olarak aktif görünüyor.',
    signal: 'bullish',
  },
  'Üçlü Tepe': {
    desc: 'Çift Tepeden daha güçlü direnç bölgesi. Üç başarısız zirve girişimi algoritmik olarak tespit edildi.',
    signal: 'bearish',
  },
  'Üçlü Dip': {
    desc: 'Çift Dipten daha güçlü destek bölgesi. Üç başarılı savunma noktası algoritmik olarak tespit edildi.',
    signal: 'bullish',
  },
  'Destek Hattı': {
    desc: 'Fiyatın altına düşmediği teknik taban seviyesi. Tarihsel fiyat hareketlerine göre algoritmik olarak hesaplandı.',
    signal: 'bullish',
  },
  'Direnç Hattı': {
    desc: 'Fiyatın üzerine çıkamadığı teknik tavan seviyesi. Tarihsel fiyat hareketlerine göre algoritmik olarak hesaplandı.',
    signal: 'bearish',
  },
  'Range/Kutu': {
    desc: 'Fiyat belirli bir aralıkta yatay seyrediyor. Birikim veya dağıtım dönemi olabileceği algoritmik olarak işaretlendi.',
    signal: 'neutral',
  },
  'Bayrak': {
    desc: 'Güçlü bir hareket sonrası kısa süreli küçük düzeltme. Devam formasyonu olarak algoritmik model tarafından tespit edildi.',
    signal: 'bullish',
  },
  'Flama': {
    desc: 'Bayrak formasyonuna benzer; güçlü hareketten sonra küçük bir üçgen oluşuyor. Algoritmik olarak devam formasyonu sınıfına alındı.',
    signal: 'bullish',
  },
  'Kupa Sap': { desc: 'U şeklinde yuvarlak bir dip (kupa) ardından küçük bir geri çekilme (sap). Direnç kırılımı algoritmik olarak izleniyor.',
    signal: 'bullish',
  },
};

// ── Formasyon tooltip bileşeni ─────────────────────────────────────────────────
// position:fixed kullanıyoruz — tablo overflow:hidden scroll container'ından kaçmak için
function FormationTooltip({ frm, fShort, fColor, frm2, isStale }) {
  const [pos, setPos] = useState(null);
  const triggerRef    = useRef(null);

  const frm2Short = frm2 ? (FRM_SHORT[frm2] || frm2) : null;
  const frm2Color = frm2 ? (FRM_COLOR[frm2] || '#94a3b8') : null;
  const hasSecondary = !!frm2Short;
  const staleOpacity = isStale ? 0.45 : 1;

  if (!fShort) return (
    <div style={{ display:'flex', alignItems:'center', paddingLeft: SP[2] }}>
      <span style={{ fontSize: FS.sm, color: 'rgba(255,255,255,0.07)' }}>—</span>
    </div>
  );

  const info   = PATTERN_INFO[frm];
  const info2  = frm2 ? PATTERN_INFO[frm2] : null;
  const signal = info?.signal;
  const sigCol = signal === 'bullish' ? S.positive : signal === 'bearish' ? S.negative : 'rgba(255,255,255,0.45)';
  const sigLbl = signal === 'bullish' ? 'Yükselen Baskı' : signal === 'bearish' ? 'Düşen Baskı' : 'Nötr';

  const handleEnter = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    setPos({ left: r.left, top: spaceBelow > 180 ? r.bottom + 4 : r.top - 4, above: spaceBelow <= 180 });
  };

  return (
    <div ref={triggerRef}
         style={{ display:'flex', alignItems:'center', gap: 3, paddingLeft: SP[2], overflow:'hidden', opacity: staleOpacity }}
         onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      <span style={{ fontSize: FS.tiny, fontWeight: 900, color: fColor, textTransform: 'uppercase',
        letterSpacing: '0.07em', whiteSpace: 'nowrap', overflow:'hidden', textOverflow:'ellipsis',
        cursor: info ? 'help' : 'default' }}>
        {fShort}
      </span>
      {/* İkincil formasyon göstergesi */}
      {hasSecondary && (
        <span title={frm2} style={{
          fontSize: 7.5, fontWeight: 800, letterSpacing: '0.06em',
          color: frm2Color, border: `1px solid ${frm2Color}40`,
          borderRadius: 2, padding: '1px 4px', lineHeight: 1.3,
          background: `${frm2Color}10`, flexShrink: 0, whiteSpace: 'nowrap',
          textTransform: 'uppercase',
        }}>{frm2Short}</span>
      )}
      {pos && (info || hasSecondary) && (
        <div style={{
          position:'fixed',
          left: Math.min(pos.left, window.innerWidth - 236),
          top:  pos.above ? undefined : pos.top,
          bottom: pos.above ? window.innerHeight - pos.top : undefined,
          zIndex: 99999,
          background:'#0d1118', border:`1px solid rgba(153,247,255,0.15)`,
          borderRadius:5, padding:'10px 12px', width:224,
          boxShadow:'0 12px 36px rgba(0,0,0,0.8)', pointerEvents:'none',
        }}>
          {/* Birincil formasyon */}
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
            <span style={{ fontSize: FS.tiny, fontWeight:900, color: fColor, textTransform:'uppercase', letterSpacing:'0.1em' }}>{frm}</span>
            {isStale && <span style={{ fontSize:7, fontWeight:700, color:'rgba(255,255,255,0.35)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:2, padding:'0 3px', letterSpacing:'0.08em' }}>ESKİ</span>}
          </div>
          {info && <div style={{ fontSize: FS.micro, color:'rgba(255,255,255,0.6)', lineHeight:1.6, marginBottom:6 }}>{info.desc}</div>}
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom: hasSecondary ? 8 : 0 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background: sigCol, flexShrink:0 }} />
            <span style={{ fontSize: FS.micro, fontWeight:700, color: sigCol, letterSpacing:'0.08em' }}>{sigLbl}</span>
          </div>
          {/* İkincil formasyon */}
          {hasSecondary && (
            <>
              <div style={{ height:1, background:'rgba(255,255,255,0.05)', margin:'4px 0 6px' }} />
              <div style={{ fontSize: FS.tiny, fontWeight:900, color: frm2Color, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>
                {frm2} <span style={{ fontSize:8, opacity:0.6 }}>ikincil</span>
              </div>
              {info2 && <div style={{ fontSize: FS.micro, color:'rgba(255,255,255,0.45)', lineHeight:1.5 }}>{info2.desc}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtPrc = v => v != null
  ? `₺${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const fmtPct = v => v != null
  ? `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—';
const fmtVol = v => {
  const n = Number(v); if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
};
const fmtN = (v, d = 1) => (v != null && !isNaN(v)) ? Number(v).toFixed(d) : '—';
const fmtMarketCap = v => {
  const n = Number(v); if (!n || !isFinite(n)) return '—';
  if (n >= 1e12) return `₺${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `₺${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `₺${(n / 1e6).toFixed(1)}M`;
  return `₺${n.toLocaleString('tr-TR')}`;
};

// ── QRS gradient display ───────────────────────────────────────────────────────
function QrsDisplay({ q, size = FS.sm }) {
  if (q >= 85) return (
    <span style={{ fontFamily: S.mono, fontSize: size, fontWeight: 900, background: 'linear-gradient(90deg, #99f7ff, #67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
      {fmtN(q)}
    </span>
  );
  return <span style={{ fontFamily: S.mono, fontSize: size, fontWeight: q >= 70 ? 700 : 500, color: colQRS(q) }}>{fmtN(q)}</span>;
}

// ── Tablo grid (8 kolon) ───────────────────────────────────────────────────────
// sym+frm | fiyat | %değ | hacim | rsi | ml | qrs | form
const GRID     = '1.8fr 90px 74px 70px 46px 46px 58px 86px';
const PAGE_SIZE = 60;

// ── Dropdown atomları ──────────────────────────────────────────────────────────
function DropBtn({ children, onClick, open, accent, noBorder }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        borderRadius: 3,
        border: noBorder ? 'none' : `1px solid ${accent ? `${accent}30` : S.border1}`,
        background: noBorder ? (h ? 'rgba(255,255,255,0.04)' : 'transparent') : (accent ? (h ? `${accent}12` : `${accent}07`) : (h ? S.bg4 : 'transparent')),
        display: 'flex', alignItems: 'center', gap: SP[1],
        padding: noBorder ? `0 ${SP[2]}px` : `${SP[1]}px ${SP[2]}px`,
        cursor: 'pointer', transition: 'all 0.12s', height: SP[5],
      }}
    >
      {children}
      <ChevronDown size={9} style={{ color: accent ? `${accent}90` : 'rgba(255,255,255,0.22)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
    </button>
  );
}

function DropMenu({ children, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.1 }}
          style={{ position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 100, minWidth: 180, borderRadius: 3, border: `1px solid ${S.border1}`, background: '#0c1018', boxShadow: '0 20px 48px rgba(0,0,0,0.8)', overflow: 'hidden', padding: `${SP[1]}px 0` }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DropItem({ children, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left', background: selected ? 'rgba(255,255,255,0.03)' : 'transparent', border: 'none', cursor: 'pointer', padding: `${SP[2]}px ${SP[3]}px`, display: 'flex', alignItems: 'center', gap: SP[2], transition: 'background 0.08s' }}
      onMouseEnter={e => { e.currentTarget.style.background = S.bg4; }}
      onMouseLeave={e => { e.currentTarget.style.background = selected ? 'rgba(255,255,255,0.03)' : 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ── Profil dropdown ────────────────────────────────────────────────────────────
function ProfileDrop({ profiles, active, onChange, noBorder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const ap = profiles.find(p => p.name === active) || profiles[0];

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <DropBtn onClick={() => setOpen(v => !v)} open={open} accent={ap?.color} noBorder={noBorder}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ap?.color || S.primary, boxShadow: `0 0 6px ${ap?.color || S.primary}`, flexShrink: 0 }} />
        <span style={{ fontSize: FS.tiny, fontWeight: 900, letterSpacing: '0.12em', color: ap?.color || S.primary, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{active}</span>
      </DropBtn>
      <DropMenu visible={open}>
        {profiles.map(p => (
          <DropItem key={p.id} selected={active === p.name} onClick={() => { onChange(p.name); setOpen(false); }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: FS.tiny, fontWeight: 900, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase' }}>{p.name}</div>
              {p.desc && <div style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>{p.desc}</div>}
            </div>
            {active === p.name && <span style={{ marginLeft: 'auto', color: ap?.color || S.primary, fontSize: 7 }}>●</span>}
          </DropItem>
        ))}
      </DropMenu>
    </div>
  );
}

// ── Formasyon filter dropdown ──────────────────────────────────────────────────
function FormationDrop({ value, onChange, noBorder, counts = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const frmColor = value ? (FRM_COLOR[value] || '#94a3b8') : null;
  const totalWithFormation = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <DropBtn onClick={() => setOpen(v => !v)} open={open} accent={frmColor} noBorder={noBorder}>
        {value && <span style={{ width: 5, height: 5, borderRadius: '50%', background: frmColor, flexShrink: 0 }} />}
        <span style={{ fontSize: FS.tiny, fontWeight: 900, letterSpacing: '0.1em', color: value ? frmColor : 'rgba(255,255,255,0.28)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {value ? (FRM_SHORT[value] || value) : 'Formasyon'}
        </span>
      </DropBtn>
      <DropMenu visible={open}>
        <DropItem selected={!value} onClick={() => { onChange(null); setOpen(false); }}>
          <span style={{ fontSize: FS.tiny, fontWeight: 900, letterSpacing: '0.1em', color: !value ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>TÜMÜ</span>
          {totalWithFormation > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: FS.micro, fontWeight: 900, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', borderRadius: 2, padding: '0 4px', flexShrink: 0 }}>{totalWithFormation}</span>
          )}
        </DropItem>
        {ALL_FORMATIONS.map(f => {
          const cnt = counts[f] || 0;
          return (
            <DropItem key={f} selected={value === f} onClick={() => { onChange(f); setOpen(false); }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: FRM_COLOR[f] || '#94a3b8', flexShrink: 0 }} />
              <span style={{ fontSize: FS.tiny, fontWeight: 700, color: cnt > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{FRM_SHORT[f]}</span>
              {cnt > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: FS.micro, fontWeight: 900, fontFamily: 'monospace', color: FRM_COLOR[f] || '#94a3b8', opacity: 0.7, background: 'rgba(255,255,255,0.04)', borderRadius: 2, padding: '0 4px', flexShrink: 0 }}>{cnt}</span>
              )}
            </DropItem>
          );
        })}
      </DropMenu>
    </div>
  );
}

// ── Tablo başlığı ──────────────────────────────────────────────────────────────
const HEADER_COLS = [
  { key: 'symbol',    label: 'HİSSE',  align: 'left'  },
  { key: 'price',     label: 'FİYAT',  align: 'right' },
  { key: 'change',    label: '%DEĞ',   align: 'right' },
  { key: 'volume',    label: 'HACİM',  align: 'right' },
  { key: 'rsi',       label: 'RSI',    align: 'right', tip: 'Relative Strength Index (14 periyot)\n\n70+  Aşırı alım bölgesi\n60–70  Isınıyor\n45–60  Nötr\n30–45  Soğuyor\n30 altı  Aşırı satım bölgesi\n\nYatırım tavsiyesi değildir.' },
  { key: 'ml',        label: 'HAR',    align: 'right', tip: 'Tarihsel Gerçekleşme — Bu gösterge örüntüsüne sahip sinyallerin geçmişteki hareket gerçekleşme oranı. Yatırım tavsiyesi değildir.' },
  { key: 'qrs',       label: 'QRS',    align: 'right', tip: 'Quantitative Ranking Score — Teknik göstergeler, hacim ve momentum\'un ağırlıklı birleşimi. Her profil kendi kural setiyle hesaplar.\n\n85+  Güçlü sinyal\n70–85  İyi sinyal\n50–70  Zayıf\n50 altı  Düşük\n\nYatırım tavsiyesi değildir.' },
  { key: 'formation', label: 'FORM',   align: 'left'  },
];

function TableHeader({ sortKey, sortDir, onSort }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, position: 'sticky', top: 0, zIndex: 20, background: S.bg0, borderBottom: `1px solid ${S.border0}`, flexShrink: 0 }}>
      {HEADER_COLS.map(col => (
        <div
          key={col.key}
          onClick={() => onSort(col.key)}
          style={{
            display: 'flex', alignItems: 'center', gap: SP[1], cursor: 'pointer',
            height: H.tableHdr,
            paddingLeft:  col.align === 'left'  ? (col.key === 'symbol' ? SP[3] : SP[2]) : 0,
            paddingRight: col.align === 'right' ? SP[2] : 0,
            justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start',
            userSelect: 'none',
          }}
        >
          <Tip text={col.tip} pos="bottom" width={210}>
            <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: sortKey === col.key ? S.primary : 'rgba(255,255,255,0.18)', borderBottom: col.tip ? '1px dashed rgba(255,255,255,0.1)' : 'none', cursor: col.tip ? 'help' : 'pointer' }}>
              {col.label}
            </span>
          </Tip>
          <ChevronDown size={7} style={{ color: sortKey === col.key ? S.primary : 'rgba(255,255,255,0.07)', transform: sortKey === col.key && sortDir === 'asc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.1s', flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

// ── Tema uyumlu custom tooltip (createPortal → stacking context sorununu çözer) ──
function Tip({ text, children, pos = 'top', width = 200 }) {
  const [v, setV]       = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  if (!text) return <>{children}</>;

  const show = () => {
    if (!ref.current) return;
    const r   = ref.current.getBoundingClientRect();
    const pad = 8; // viewport kenar boşluğu
    let top, left, transform;

    if (pos === 'top') {
      top       = r.top - 8;
      left      = Math.min(Math.max(r.left + r.width / 2 - width / 2, pad), window.innerWidth - width - pad);
      transform = 'translateY(-100%)';
    } else if (pos === 'bottom') {
      top       = r.bottom + 6;
      left      = Math.min(Math.max(r.left + r.width / 2 - width / 2, pad), window.innerWidth - width - pad);
      transform = 'none';
    } else { // left
      top       = r.top + r.height / 2;
      left      = Math.max(r.left - width - 8, pad);
      transform = 'translateY(-50%)';
    }
    setCoords({ top, left, transform });
    setV(true);
  };

  const tipStyle = {
    position: 'fixed', zIndex: 99999, width, pointerEvents: 'none',
    background: '#0b0f1c', border: '1px solid rgba(153,247,255,0.14)',
    borderRadius: 4, padding: '6px 10px',
    boxShadow: '0 8px 28px rgba(0,0,0,0.9)',
    fontSize: FS.micro, color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.55, whiteSpace: 'pre-wrap', letterSpacing: '0.02em',
    top: coords.top, left: coords.left,
    transform: coords.transform || 'none',
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}
         onMouseEnter={show} onMouseLeave={() => setV(false)}>
      {children}
      {v && createPortal(<div style={tipStyle}>{text}</div>, document.body)}
    </div>
  );
}

// ── Tarihsel Bant Göstergesi — ML kolonunun yerini alır ──────────────────────
// cal: ml_score_cal (0-100, kalibre edilmiş tarihsel gerçekleşme oranı)
// 3 bant → %45+   2 bant → %30+   1 bant → %20+   0 bant → veri yok/yetersiz
function HistoricalBand({ cal, size = 'md' }) {
  const pct   = cal != null ? Number(cal) : null;
  const bars  = pct == null ? 0 : pct >= 45 ? 3 : pct >= 30 ? 2 : pct >= 20 ? 1 : 0;
  const color = bars === 3 ? '#34d399'
              : bars === 2 ? 'rgba(255,255,255,0.45)'
              : bars === 1 ? 'rgba(255,255,255,0.2)'
              :              'rgba(255,255,255,0.08)';
  const h = size === 'sm' ? 8 : 11;
  const w = size === 'sm' ? 3 : 4;
  const tip = pct != null
    ? `Tarihsel Gerçekleşme: %${Math.round(pct)}\n\nBu gösterge örüntüsüne sahip sinyallerin geçmişteki hareket gerçekleşme oranıdır.\nYatırım tavsiyesi değildir.`
    : 'Tarihsel Gerçekleşme\n\nVeri henüz yetersiz — birkaç hafta içinde dolacak.';
  return (
    <Tip text={tip} pos="left" width={220}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, cursor: 'default', padding: '2px 0' }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            width: w, height: i === 1 ? h * 0.6 : i === 2 ? h * 0.8 : h,
            borderRadius: 1,
            background: i <= bars ? color : 'rgba(255,255,255,0.07)',
          }} />
        ))}
      </div>
    </Tip>
  );
}

// ── QRS tooltip (rule + ml breakdown) ─────────────────────────────────────────
function QrsTooltip({ item }) {
  const [vis, setVis] = useState(false);
  const qrs  = getQRS(item);
  const rule = item?.rule_score != null ? Math.round(item.rule_score) : null;
  const ml   = item?.ml_score   != null ? Math.round(item.ml_score)   : null;
  const band = qrs >= 85 ? { label: 'Güçlü Sinyal', color: S.primary }
             : qrs >= 70 ? { label: 'İyi Sinyal',   color: 'rgba(255,255,255,0.85)' }
             : qrs >= 50 ? { label: 'Zayıf',         color: 'rgba(255,255,255,0.45)' }
             :             { label: 'Düşük',          color: 'rgba(255,255,255,0.18)' };
  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: SP[2] }}
      onMouseEnter={() => setVis(true)}
      onMouseLeave={() => setVis(false)}
    >
      <QrsDisplay q={qrs} />
      {vis && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 200,
          background: '#101827', border: `1px solid rgba(153,247,255,0.15)`,
          borderRadius: 4, padding: '8px 10px', minWidth: 140,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: FS.micro, fontWeight: 900, color: band.color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>{band.label}</div>
          {rule != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
              <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>KURAL</span>
              <span style={{ fontSize: FS.micro, fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontFamily: S.mono }}>{rule}</span>
            </div>
          )}
          {ml != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>ML</span>
              <span style={{ fontSize: FS.micro, fontWeight: 700, color: colML(ml), fontFamily: S.mono }}>{ml}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Klavye kısayolları overlay ────────────────────────────────────────────────
const KBD_GROUPS = [
  { title: 'Navigasyon', items: [['/', 'Arama kutusuna odaklan'], ['↑ ↓', 'Listede gezin'], ['Enter', 'Hisseyi seç / aç'], ['Esc', 'Kapat / temizle']] },
  { title: 'Seçili Hisse', items: [['W', 'İzleme listesi ekle / çıkar'], ['C', 'Ticker kopyala'], ['R', 'Sayfayı yenile']] },
  { title: 'Filtreler', items: [['Q', 'QRS 70+ filtresi'], ['K', 'KATILIM filtresi']] },
  { title: 'Grafik', items: [['T', 'Grafik türü döngüsü (mum → ohlc → çizgi → alan)'], ['1 – 6', 'Periyot seç']] },
  { title: 'Genel', items: [['?', 'Bu paneli aç / kapat']] },
];
function Kbd({ children }) {
  return (
    <kbd style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.13)', borderRadius:4, padding:'2px 7px', fontSize:11, fontFamily:'monospace', fontWeight:700, color:'rgba(255,255,255,0.6)', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>
      {children}
    </kbd>
  );
}
function ShortcutsOverlay({ onClose }) {
  return createPortal(
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9998 }} />
      <div onMouseDown={e => e.stopPropagation()} style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:9999, background:'#0d1117', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'22px 26px', minWidth:340, maxWidth:420, boxShadow:'0 24px 64px rgba(0,0,0,0.8)', userSelect:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <span style={{ fontSize:12, fontWeight:800, letterSpacing:'0.14em', color:'rgba(255,255,255,0.6)', textTransform:'uppercase' }}>Klavye Kısayolları</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.25)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0 }}>×</button>
        </div>
        {KBD_GROUPS.map(g => (
          <div key={g.title} style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.18em', color:'rgba(255,255,255,0.2)', textTransform:'uppercase', marginBottom:7 }}>{g.title}</div>
            {g.items.map(([key, desc]) => (
              <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'3px 0', gap:12 }}>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{desc}</span>
                <Kbd>{key}</Kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>,
    document.body
  );
}

// ── Sağ-tık context menu ──────────────────────────────────────────────────────
function CtxDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />;
}
function CtxItem({ icon, label, accent, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width:'100%', display:'flex', alignItems:'center', gap:9, padding:'7px 14px', border:'none', cursor:'pointer', textAlign:'left', background: h ? 'rgba(255,255,255,0.05)' : 'transparent', transition:'background 0.08s', color: accent || (h ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)') }}>
      <span style={{ flexShrink:0, opacity:0.65, display:'flex' }}>{icon}</span>
      <span style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>{label}</span>
    </button>
  );
}
function CtxInfo({ color, label, sub }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:9, padding:'5px 14px' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }} />
      <div>
        <div style={{ fontSize:11, fontWeight:700, color, letterSpacing:'0.04em' }}>{label}</div>
        {sub && <div style={{ fontSize:10, color:'rgba(255,255,255,0.28)', marginTop:1 }}>{sub}</div>}
      </div>
    </div>
  );
}
function AppContextMenu({ type, x, y, item, onClose, watchlist, onToggleWatch, onNavigate }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Chart store values (for chart context)
  const chartType    = useScanStore(s => s.miniChartType) || 'candle';
  const setChartType = useScanStore(s => s.setMiniChartType);
  const ov           = useScanStore(s => s.miniChartOv) || {};
  const setOv        = useScanStore(s => s.setMiniChartOv);
  const selSym       = useScanStore(s => s.selectedSymbol);

  // Stock context values
  const sym       = item ? getSym(item) : selSym;
  const pr        = item ? getPrice(item) : null;
  const chg       = item ? getChg(item) : null;
  const co        = item ? getCo(item) : null;
  const frm       = item ? getFrm(item) : null;
  const qrs       = item ? getQRS(item) : null;
  const volRatio  = item?.volume_ratio ?? null;
  const targetP   = item ? getTgt(item) : null;
  const stopP     = item ? getSup(item) : null;
  const isWatched = sym ? watchlist.includes(sym) : false;
  const sector    = item ? normalizeSector(item?.sector, sym) : null;
  const fmt       = p => p ? `₺${Number(p).toFixed(2)}` : '';

  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({ left: Math.min(x, window.innerWidth - width - 8), top: Math.min(y, window.innerHeight - height - 8) });
  }, [x, y]);

  const copy = (v) => { navigator.clipboard?.writeText(String(v)).catch(() => {}); onClose(); };
  const reload = () => { onClose(); window.location.reload(); };

  const CTX_CHART_TYPES = [
    { key:'candle', label:'Mum' }, { key:'ohlc', label:'Çubuk' },
    { key:'ha', label:'Heikin Ashi' }, { key:'hollow', label:'İçi Boş' },
    { key:'line', label:'Çizgi' }, { key:'area', label:'Alan' },
  ];

  const hasCtx = (frm && frm !== 'Formasyon Yok') || qrs >= 75 || (volRatio && volRatio > 2) || (targetP && stopP);

  return createPortal(
    <div ref={ref} onMouseDown={e => e.stopPropagation()}
      style={{ position:'fixed', left:pos.left, top:pos.top, zIndex:10000, minWidth:220, background:'#0d1117', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, boxShadow:'0 20px 60px rgba(0,0,0,0.85)', overflow:'hidden', userSelect:'none' }}>

      {/* ── STOCK context ── */}
      {type === 'stock' && item && (<>
        <div style={{ padding:'9px 14px 8px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.015)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13, fontWeight:800, color:'#fff', fontFamily:S.mono, letterSpacing:'0.06em' }}>{sym}</span>
            {chg !== null && <span style={{ fontSize:10, fontWeight:700, color: chg >= 0 ? '#34d399' : '#f87171' }}>{chg >= 0 ? '+' : ''}{Number(chg).toFixed(2)}%</span>}
            {pr && <span style={{ marginLeft:'auto', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.5)', fontFamily:S.mono }}>{fmt(pr)}</span>}
          </div>
          {co && <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{co}</div>}
          {sector && <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:getSectorColor(sector), opacity:0.65, marginTop:2, textTransform:'uppercase' }}>{sector}</div>}
        </div>
        <CtxItem icon={<RefreshCw size={11}/>} label="Sayfayı tazele" onClick={reload} />
        <CtxDivider />
        <CtxItem icon={<Copy size={11}/>} label={`Ticker kopyala  (${sym})`} onClick={() => copy(sym)} />
        {pr && <CtxItem icon={<Copy size={11}/>} label={`Fiyat kopyala  (${fmt(pr)})`} onClick={() => copy(Number(pr).toFixed(2))} />}
        <CtxDivider />
        <CtxItem icon={<Star size={11} fill={isWatched?'#fbbf24':'none'} color={isWatched?'#fbbf24':'currentColor'}/>}
          label={isWatched ? 'İzlemeden çıkar' : 'İzleme listesine ekle'} accent={isWatched ? '#fbbf24' : null}
          onClick={() => { onToggleWatch(sym); onClose(); }} />
        <CtxItem icon={<Briefcase size={11}/>} label="Portföye ekle..."
          onClick={() => { onNavigate('/portfolio', { state: { addSymbol: sym, addPrice: pr ? Number(pr).toFixed(2) : '' } }); onClose(); }} />
        {hasCtx && (<>
          <CtxDivider />
          {frm && frm !== 'Formasyon Yok' && <CtxInfo color={FRM_COLOR[frm]||'#94a3b8'} label={FRM_SHORT[frm]||frm} sub="Formasyon tespit edildi" />}
          {qrs >= 75 && <CtxInfo color={qrs >= 85 ? '#22d3ee' : '#86efac'} label={`QRS ${qrs}`} sub={qrs >= 85 ? 'Yüksek kalite sinyal' : 'Güçlü sinyal'} />}
          {volRatio && volRatio > 2 && <CtxInfo color='#fb923c' label={`Hacim ×${Number(volRatio).toFixed(1)}`} sub="Ortalama üzerinde işlem hacmi" />}
          {targetP && stopP && <CtxInfo color='#a78bfa' label={`Hedef ${fmt(targetP)}`} sub={`Stop: ${fmt(stopP)}`} />}
        </>)}
      </>)}

      {/* ── CHART context ── */}
      {type === 'chart' && (<>
        <div style={{ padding:'9px 14px 8px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.015)' }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:'rgba(255,255,255,0.4)', textTransform:'uppercase' }}>Grafik{selSym ? ` · ${selSym}` : ''}</span>
        </div>
        <CtxItem icon={<RefreshCw size={11}/>} label="Sayfayı tazele" onClick={reload} />
        {selSym && <CtxItem icon={<Copy size={11}/>} label={`Sembolü kopyala  (${selSym})`} onClick={() => copy(selSym)} />}
        <CtxDivider />
        <div style={{ padding:'4px 14px 2px' }}>
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.12em', color:'rgba(255,255,255,0.2)', textTransform:'uppercase' }}>Grafik türü</span>
        </div>
        {CTX_CHART_TYPES.map(t => (
          <CtxItem key={t.key} icon={<span style={{ width:11, display:'flex', justifyContent:'center', fontSize:9, fontWeight:700, color: chartType===t.key ? S.primary : 'transparent' }}>✓</span>}
            label={t.label} accent={chartType===t.key ? S.primary : null}
            onClick={() => { setChartType(t.key); onClose(); }} />
        ))}
        <CtxDivider />
        <div style={{ padding:'4px 14px 2px' }}>
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.12em', color:'rgba(255,255,255,0.2)', textTransform:'uppercase' }}>Göstergeler</span>
        </div>
        {[['ema','EMA'],['bb','Bollinger'],['vol','Hacim'],['frm','Formasyon'],['fib','Fibonacci']].map(([k,l]) => (
          <CtxItem key={k} icon={<span style={{ width:11, display:'flex', justifyContent:'center', fontSize:9, fontWeight:700, color: ov[k] ? S.primary : 'transparent' }}>✓</span>}
            label={l} accent={ov[k] ? S.primary : null}
            onClick={() => { setOv({ ...ov, [k]: !ov[k] }); onClose(); }} />
        ))}
      </>)}

      {/* ── SIDEBAR context ── */}
      {type === 'sidebar' && (<>
        <div style={{ padding:'9px 14px 8px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.015)' }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:'rgba(255,255,255,0.4)', textTransform:'uppercase' }}>Menü</span>
        </div>
        <CtxItem icon={<RefreshCw size={11}/>} label="Sayfayı tazele" onClick={reload} />
        <CtxDivider />
        <CtxItem icon={<HelpCircle size={11}/>} label="Yardım"
          onClick={() => { onNavigate('/help'); onClose(); }} />
        <CtxItem icon={<LogOut size={11}/>} label="Çıkış yap"
          onClick={() => { useAuthStore.getState().logout(); window.location.href = '/login'; }} />
      </>)}

      {/* ── GENERAL context ── */}
      {type === 'general' && (<>
        <div style={{ padding:'9px 14px 8px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.015)' }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:'rgba(255,255,255,0.4)', textTransform:'uppercase' }}>Menü</span>
        </div>
        <CtxItem icon={<RefreshCw size={11}/>} label="Sayfayı tazele" onClick={reload} />
        <CtxDivider />
        <CtxItem icon={<HelpCircle size={11}/>} label="Yardım"
          onClick={() => { onNavigate('/help'); onClose(); }} />
        <CtxItem icon={<LogOut size={11}/>} label="Çıkış yap"
          onClick={() => { useAuthStore.getState().logout(); window.location.href = '/login'; }} />
      </>)}
    </div>,
    document.body
  );
}

// ── Değer değişim animasyonu — minimalist fade flash ─────────────────────────
function FlashValue({ value, style, children }) {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prevRef.current !== undefined && prevRef.current !== value) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
    prevRef.current = value;
  }, [value]);
  return (
    <span style={{ ...style, animation: flash ? 'valueFlash 0.7s ease-out' : 'none' }}>
      {children}
    </span>
  );
}

// ── Hisse satırı (compact: 34px) ──────────────────────────────────────────────
function StockRow({ item, isSelected, onSelect }) {
  const sym    = getSym(item);
  const pr     = getPrice(item);
  const [showLoginTip, setShowLoginTip] = useState(false);
  const chg    = getChg(item);
  const vol    = getVol(item);
  const rsi    = getRSI(item);
  const ml     = getML(item);
  const qrs    = getQRS(item);
  const frm      = getFrm(item);
  const frmStale = !!item?.pattern_is_stale;
  const fShort = frm && frm !== 'Formasyon Yok' ? FRM_SHORT[frm] : null;
  const fColor = frm ? (FRM_COLOR[frm] || '#94a3b8') : null;
  const pos    = Number(chg) >= 0;
  const watchlist      = useScanStore(s => s.watchlist);
  const toggleWatch    = useScanStore(s => s.toggleWatchlist);
  const inWatch        = watchlist.includes(sym);
  const isAuth         = useAuthStore(s => s.isAuthenticated);

  const handleStarClick = useCallback((e) => {
    e.stopPropagation();
    if (!isAuth) {
      setShowLoginTip(true);
      setTimeout(() => setShowLoginTip(false), 3000);
      return;
    }
    toggleWatch(sym);
  }, [isAuth, toggleWatch, sym]);
  const co           = getCo(item);
  const sector       = normalizeSector(item?.sector, sym);
  const sectorClr    = getSectorColor(sector);
  const volRatio     = item?.volume_ratio ?? null;

  return (
    <div
      onClick={() => onSelect(sym, item)}
      data-ctx="stock"
      data-symbol={sym}
      style={{
        display: 'grid', gridTemplateColumns: GRID,
        height: H.tableRow, flexShrink: 0,
        borderBottom: `1px solid ${S.border0}`,
        borderLeft: `2px solid ${isSelected ? S.primary : 'transparent'}`,
        background: isSelected ? `rgba(153,247,255,0.04)` : 'transparent',
        cursor: 'pointer', transition: 'background 0.08s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = S.bg4; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Sembol + şirket adı + sektör + watchlist */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: SP[2] + SP[1], overflow: 'hidden', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={handleStarClick}
              title={inWatch ? 'İzlemeden çıkar' : 'İzlemeye ekle'}
              style={{ background: 'none', border: 'none', padding: '2px 3px', cursor: 'pointer', display: 'flex', alignItems: 'center', lineHeight: 1, margin: '-2px -3px' }}
            >
              <Star size={13} style={{ color: inWatch ? '#fbbf24' : 'rgba(255,255,255,0.18)', fill: inWatch ? '#fbbf24' : 'none', transition: 'color 0.15s, fill 0.15s' }} />
            </button>
            {showLoginTip && (
              <div style={{
                position: 'absolute', left: 20, top: -4, zIndex: 999,
                background: '#0d1118', border: '1px solid rgba(251,191,36,0.3)',
                borderRadius: 6, padding: '6px 10px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
                animation: 'fadeIn 0.15s ease-out',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.02em' }}>
                  Takip için giriş yap →
                </span>
              </div>
            )}
          </div>
          <span style={{ fontSize: FS.sm, fontWeight: 900, color: '#fff', fontFamily: S.mono, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{sym}</span>
        </div>
        {(co || sector) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            {co && co !== sym && (
              <span title={co} style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.02em' }}>
                {co.length > 14 ? co.slice(0, 14) + '…' : co}
              </span>
            )}
            {sector && (
              <span style={{ fontSize: FS.micro, fontWeight: 700, color: sectorClr, opacity: 0.7, whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.04em' }}>
                · {sector.length > 10 ? sector.slice(0, 10) + '…' : sector}
              </span>
            )}
          </div>
        )}
      </div>
      {/* Fiyat */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: SP[2] }}>
        <FlashValue value={pr} style={{ fontSize: FS.sm, fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: S.mono }}>{fmtPrc(pr)}</FlashValue>
      </div>
      {/* Değişim */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: SP[2] }}>
        <FlashValue value={chg} style={{ fontSize: FS.sm, fontWeight: 700, color: pos ? S.positive : S.negative, fontFamily: S.mono }}>{fmtPct(chg)}</FlashValue>
      </div>
      {/* Hacim + mini oran çubuğu */}
      {(() => {
        const ratio   = volRatio != null ? Math.min(volRatio, 2.5) : null;
        const barW    = ratio != null ? Math.round((ratio / 2.5) * 100) : null;
        const barCol  = ratio == null  ? 'rgba(255,255,255,0.15)'
                      : ratio >= 1.5   ? '#22d3ee'
                      : ratio >= 1.0   ? '#34d399'
                      : ratio >= 0.5   ? 'rgba(255,255,255,0.2)'
                      :                  'rgba(255,255,255,0.1)';
        const txtCol  = ratio == null  ? 'rgba(255,255,255,0.5)'
                      : ratio >= 1.5   ? 'rgba(34,211,238,0.9)'
                      : ratio >= 1.0   ? 'rgba(52,211,153,0.85)'
                      : ratio >= 0.5   ? 'rgba(255,255,255,0.5)'
                      :                  'rgba(255,255,255,0.3)';
        const tip = ratio != null ? `Hacim/Ort: ${volRatio.toFixed(2)}x` : undefined;
        return (
          <div title={tip} style={{ display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'flex-end', paddingRight: SP[2], gap: 3 }}>
            <span style={{ fontSize: FS.xs, color: txtCol, fontFamily: S.mono, lineHeight: 1 }}>{fmtVol(vol)}</span>
            {barW != null && (
              <div style={{ width: 28, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ width: `${barW}%`, height: '100%', background: barCol, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            )}
          </div>
        );
      })()}
      {/* RSI */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: SP[2] }}>
        <FlashValue value={rsi} style={{ fontSize: FS.sm, fontWeight: 600, color: colRSI(rsi), fontFamily: S.mono }}>{fmtN(rsi)}</FlashValue>
      </div>
      {/* HAR (Tarihsel Bant) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: SP[2] }}>
        <HistoricalBand cal={getMLCal(item)} />
      </div>
      {/* QRS — hover tooltip ile breakdown */}
      <QrsTooltip item={item} />
      {/* Formasyon — hover tooltip ile açıklama */}
      <FormationTooltip frm={frm} fShort={fShort} fColor={fColor} frm2={getFrm2(item)} isStale={frmStale} />
    </div>
  );
}

// ── Sayfalama ──────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const visible = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) visible.push(i);
  } else {
    visible.push(1);
    if (page > 3) visible.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) visible.push(i);
    if (page < totalPages - 2) visible.push('…');
    visible.push(totalPages);
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SP[1], padding: `${SP[1]}px ${SP[3]}px`, borderTop: `1px solid ${S.border0}`, flexShrink: 0 }}>
      {visible.map((p, idx) =>
        p === '…' ? (
          <span key={`e-${idx}`} style={{ color: 'rgba(255,255,255,0.14)', fontSize: FS.xs, padding: `0 2px` }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              width: SP[5], height: SP[5], borderRadius: 3, cursor: 'pointer',
              border: `1px solid ${p === page ? 'rgba(153,247,255,0.3)' : S.border1}`,
              background: p === page ? 'rgba(153,247,255,0.08)' : 'transparent',
              fontSize: FS.xs, fontWeight: p === page ? 900 : 500, fontFamily: S.mono,
              color: p === page ? S.primary : 'rgba(255,255,255,0.28)', transition: 'all 0.1s',
            }}
          >
            {p}
          </button>
        )
      )}
    </div>
  );
}

// ── Plotly loader ──────────────────────────────────────────────────────────────
let _plotlyPromise = null;
function ensurePlotly() {
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (_plotlyPromise) return _plotlyPromise;
  _plotlyPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/plotly.min.js';
    s.async = true;
    s.onload  = () => resolve(window.Plotly);
    s.onerror = () => { _plotlyPromise = null; reject(new Error('Plotly load failed')); };
    document.head.appendChild(s);
  });
  return _plotlyPromise;
}

// ── Grafik bileşeni ────────────────────────────────────────────────────────────
// ── Periyot → API parametresi eşlemesi ────────────────────────────────────────
const PERIOD_MAP = {
  '1H': '1M',  // 1 hafta — 1 aylık veri, 7 günlük pencere
  '1A': '1M',
  '3A': '3M',
  '6A': '6M',
};
// Kaç gün geriye gidileceği (görüntüleme penceresi)
const PERIOD_DAYS = { '1H': 8, '1A': 31, '3A': 92, '6A': 183 };

// İntraday periyotlar — ayrı endpoint
const INTRADAY_PERIODS = new Set(['1S', '6S', '1G']);
const INTRADAY_API_MAP = { '1S': '1H', '6S': '6H', '1G': '1D' };

// ── Grafik tipleri ────────────────────────────────────────────────────────────
const CHART_TYPES = [
  { key: 'candle',  label: 'Mum',       icon: '᪐' },
  { key: 'ohlc',   label: 'Çubuk',     icon: '᪐' },
  { key: 'ha',     label: 'Heikin Ashi', icon: 'HA' },
  { key: 'hollow', label: 'İçi Boş',   icon: '⬜' },
  { key: 'line',   label: 'Çizgi',     icon: '∿'  },
  { key: 'area',   label: 'Alan',      icon: '◿'  },
];

// Heikin Ashi OHLC dönüşümü
function toHeikinAshi(opens, highs, lows, closes) {
  const n = closes.length;
  const haC = closes.map((_, i) => ((opens[i]??0) + (highs[i]??0) + (lows[i]??0) + (closes[i]??0)) / 4);
  const haO = [((opens[0]??0) + (closes[0]??0)) / 2];
  for (let i = 1; i < n; i++) haO.push((haO[i - 1] + haC[i - 1]) / 2);
  const haH = closes.map((_, i) => Math.max(highs[i]??0, haO[i], haC[i]));
  const haL = closes.map((_, i) => Math.min(lows[i]??Infinity, haO[i], haC[i]));
  return { open: haO, high: haH, low: haL, close: haC };
}

// ── Fibonacci renkleri ─────────────────────────────────────────────────────────
const FIB_LEVELS  = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
// 0% ve 100% gri, 38.2/61.8 cyan, 50% mor (pivot), uçlar soluk
const FIB_COLORS  = ['rgba(148,163,184,0.25)', 'rgba(245,158,11,0.3)', 'rgba(34,211,238,0.35)', 'rgba(168,85,247,0.45)', 'rgba(34,211,238,0.35)', 'rgba(245,158,11,0.3)', 'rgba(148,163,184,0.25)'];
const FIB_WIDTHS  = [0.6, 0.7, 0.8, 1.0, 0.8, 0.7, 0.6];

const toDateStr = x => {
  if (!x) return '';
  if (x instanceof Date) return x.toISOString().split('T')[0];
  return String(x).slice(0, 10);
};

function buildFibonacci(figure, xRange) {
  const candle = (figure.data || []).find(t => t.type === 'candlestick' || t.type === 'ohlc');
  if (!candle) return { shapes: [], annotations: [] };
  const xs = candle.x || [];
  const [x0str, x1str] = xRange;
  const inRange = (_, i) => { const d = toDateStr(xs[i]); return d >= x0str && d <= x1str; };
  const highs = (candle.high || []).filter((v, i) => v != null && isFinite(v) && inRange(null, i));
  const lows  = (candle.low  || []).filter((v, i) => v != null && isFinite(v) && inRange(null, i));
  if (!highs.length || !lows.length) return { shapes: [], annotations: [] };
  const swingHigh = Math.max(...highs);
  const swingLow  = Math.min(...lows);
  const range     = swingHigh - swingLow;
  if (range <= 0) return { shapes: [], annotations: [] };

  const x1 = xRange[1];
  const shapes = FIB_LEVELS.map((r, i) => ({
    type: 'line', xref: 'x', yref: 'y',
    x0: xRange[0], x1,
    y0: swingLow + r * range, y1: swingLow + r * range,
    line: { color: FIB_COLORS[i], width: FIB_WIDTHS[i], dash: 'dot' },
  }));
  // Yakın fiyat seviyelerinde etiket çakışmasını önle (min px aralığı ~10)
  const usedY = [];
  const annotations = FIB_LEVELS.map((r, i) => {
    const price = swingLow + r * range;
    const pct   = r * 100 === 0 ? '0' : (r * 100).toFixed(1);
    const tooClose = usedY.some(y => Math.abs(y - price) / range < 0.04);
    if (tooClose) return null;
    usedY.push(price);
    return {
      xref: 'paper', yref: 'y', x: 1.002, xanchor: 'left',
      y: price,
      text: `%${pct} ₺${price.toFixed(1)}`,
      showarrow: false,
      font: { size: 8, color: FIB_COLORS[i], family: S.mono },
    };
  }).filter(Boolean);
  return { shapes, annotations };
}

function MiniChart({ sym, ml, qrs, sup, tgt, frm }) {
  const { isMobile: mcMobile } = useBreakpoint();
  const profile        = useScanStore(s => s.profile);
  const storedPeriod   = useScanStore(s => s.miniChartPeriod);
  const storedType     = useScanStore(s => s.miniChartType);
  const storedOv       = useScanStore(s => s.miniChartOv);
  const setStorePeriod = useScanStore(s => s.setMiniChartPeriod);
  const setStoreType   = useScanStore(s => s.setMiniChartType);
  const setStoreOv     = useScanStore(s => s.setMiniChartOv);

  const divRef  = useRef(null);
  const [ready,      setReady]     = useState(!!window.Plotly);
  const [figure,     setFigure]    = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState(false);
  const prevSymRef   = useRef(null);
  const figureRef    = useRef(null);
  const [ctMenuOpen, setCtMenuOpen] = useState(false);
  const ctBtnRef = useRef(null);
  const [ctMenuPos, setCtMenuPos] = useState({ top: 0, right: 0 });
  const [patternShapes, setPatternShapes] = useState([]);
  const [xLabels, setXLabels] = useState({ vals: [], texts: [], x0: '', x1: '' });

  const period    = storedPeriod   || '3A';
  const chartType = storedType     || 'candle';
  const ov        = storedOv       || { ema: true, bb: false, frm: false, vol: true, fib: false };

  const setPeriod    = p  => setStorePeriod(p);
  const setChartType = t  => setStoreType(t);
  const setOv        = fn => setStoreOv(typeof fn === 'function' ? fn(ov) : fn);
  const toggleOv     = key => setStoreOv({ ...ov, [key]: !ov[key] });

  const isIntraday = INTRADAY_PERIODS.has(period);

  useEffect(() => {
    if (window.Plotly) { setReady(true); return; }
    ensurePlotly().then(() => setReady(true)).catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!sym) return;
    let cancelled = false;
    const symChanged = sym !== prevSymRef.current;
    prevSymRef.current = sym;
    // Skeleton only on first load or symbol change; profile/period changes keep old chart visible
    if (symChanged || !figureRef.current) setLoading(true);
    setError(false);
    const fetchPromise = isIntraday
      ? api.intradayChart(sym, INTRADAY_API_MAP[period] || '1D')
      : api.chart(sym, 'candle', PERIOD_MAP[period] || '6M', ml ?? null, qrs ?? null, profile ?? null);
    fetchPromise
      .then(d => {
        if (cancelled) return;
        if (d?.figure) {
          figureRef.current = d.figure;
          setFigure(d.figure);
          // İntraday'de de formasyonlar gösterilsin (Fix 4)
          // Birincil + ikincil formasyonları birleştir (Fix 2)
          const primaryShapes   = d?.ai_vision?.patterns || [];
          const secondaryShapes = d?.ai_vision?.secondary_pattern?.patterns || [];
          // İkincil şekilleri soluk göster (daha ince çizgi)
          const secondaryDimmed = secondaryShapes.map(s => ({
            ...s, line: { ...(s.line || {}), width: (s.line?.width || 1.5) * 0.7, dash: 'dot' },
          }));
          setPatternShapes([...primaryShapes, ...secondaryDimmed]);
        } else setError(true);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [sym, profile, period]);

  useEffect(() => {
    if (!ready || !figure || !divRef.current) return;
    const Plotly = window.Plotly;
    const base   = figure.layout || {};

    const isEmaTrace     = t => /^EMA\s*\d+$/i.test(t.name || '') || /^(SMA|MA)\s*\d+$/i.test(t.name || '') || /^Har\.\s*Ort\./i.test(t.name || '');
    const isBBTrace      = t => /^BB\s*(Upper|Lower|Mid|Middle|Band|Üst|Alt|Orta)/i.test(t.name || '');
    const isSubplotTrace = t => t.yaxis && t.yaxis !== 'y' && t.yaxis !== 'y1';
    const isFrmTrace     = t => !isEmaTrace(t) && !isBBTrace(t) && !isSubplotTrace(t);
    const getEmaPeriod   = name => { const m = (name||'').match(/(\d+)/); return m ? parseInt(m[1]) : 20; };

    // ── Tarih aralığı ──────────────────────────────────────────────────────
    const now      = new Date();
    const INTRADAY_HOURS = { '1S': 3, '6S': 10, '1G': 48 };
    let startDate, x0, x1;
    if (isIntraday) {
      // x0/x1'i datanın son noktasından hesapla (hafta sonu uyumlu)
      const candleXs = ((figure.data || [])[0]?.x || []);
      const lastXStr = candleXs.length > 0 ? candleXs[candleXs.length - 1] : null;
      const lastTs   = lastXStr ? new Date(lastXStr.replace(' ', 'T') + 'Z') : now;
      const hoursBack = INTRADAY_HOURS[period] || 48;
      startDate = new Date(lastTs.getTime() - hoursBack * 3600000);
      // Formatı veri formatına uydur: "YYYY-MM-DD HH:MM:SS"
      const fmtDT = dt => dt.toISOString().replace('T', ' ').slice(0, 19);
      x0 = fmtDT(startDate);
      x1 = fmtDT(new Date(lastTs.getTime() + 3600000));
    } else {
      const daysBack = PERIOD_DAYS[period] || 92;
      startDate = new Date(now.getTime() - daysBack * 86400000);
      x0 = startDate.toISOString().split('T')[0];
      x1 = new Date(now.getTime() + 86400000 * 3).toISOString().split('T')[0];
    }

    // ── Görünür X aralığında bir trace var mı ──────────────────────────────
    const traceInXRange = t => {
      const xs = (t.x || []).map(toDateStr).filter(Boolean);
      if (!xs.length) return true;
      return xs.some(d => d >= x0 && d <= x1);
    };

    // ── Shape x değerini normalize et ─────────────────────────────────────
    // Paper-space (0-1 float) veya index değerlerini timestamp olarak parse etme
    const shapeDate = v => {
      if (v == null) return null;
      if (v instanceof Date) return v.toISOString().split('T')[0];
      if (typeof v === 'number') {
        if (!isFinite(v) || Math.abs(v) < 1e6) return null; // paper-space veya index
        return new Date(v).toISOString().split('T')[0];
      }
      const s = String(v);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
    };

    // ── Tarih etiketleri ───────────────────────────────────────────────────
    const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    const xTickVals = [], xTickText = [];
    const end = new Date(x1);
    if (isIntraday) {
      // İntraday: saatlik tik
      const cur = new Date(startDate);
      const stepH = period === '1S' ? 1 : period === '6S' ? 2 : 4;
      cur.setMinutes(0, 0, 0);
      while (cur <= end) {
        const ts = cur.toISOString().replace('T', ' ').slice(0, 19);
        xTickVals.push(ts);
        xTickText.push(`${String(cur.getHours()).padStart(2,'0')}:${String(cur.getMinutes()).padStart(2,'0')}`);
        cur.setHours(cur.getHours() + stepH);
      }
    } else {
      const cur = new Date(startDate); cur.setDate(1);
      const daysBack = PERIOD_DAYS[period] || 92;
      if (daysBack <= 10) {
        cur.setTime(startDate.getTime());
        while (cur <= end) {
          xTickVals.push(cur.toISOString().split('T')[0]);
          xTickText.push(`${cur.getDate()} ${MONTHS_TR[cur.getMonth()]}`);
          cur.setDate(cur.getDate() + 1);
        }
      } else if (daysBack <= 35) {
        cur.setTime(startDate.getTime());
        while (cur <= end) {
          xTickVals.push(cur.toISOString().split('T')[0]);
          xTickText.push(`${cur.getDate()} ${MONTHS_TR[cur.getMonth()]}`);
          cur.setDate(cur.getDate() + 7);
        }
      } else {
        while (cur <= end) {
          xTickVals.push(cur.toISOString().split('T')[0]);
          xTickText.push(`${MONTHS_TR[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`);
          cur.setMonth(cur.getMonth() + 1);
        }
      }
    }
    setXLabels({ vals: xTickVals, texts: xTickText, x0, x1 });

    // ── Y aralığı: mum bazlı ──────────────────────────────────────────────
    const candleT = (figure.data || []).find(t => t.type === 'candlestick' || t.type === 'ohlc');
    let yMin = null, yMax = null;
    if (candleT) {
      const xs    = candleT.x || [];
      const lows  = (candleT.low  || []).filter((v, i) => v != null && isFinite(v) && toDateStr(xs[i]) >= x0 && toDateStr(xs[i]) <= x1);
      const highs = (candleT.high || []).filter((v, i) => v != null && isFinite(v) && toDateStr(xs[i]) >= x0 && toDateStr(xs[i]) <= x1);
      if (lows.length && highs.length) {
        const rng = Math.max(...highs) - Math.min(...lows);
        yMin = Math.min(...lows) - rng * 0.05;
        yMax = Math.max(...highs) + rng * 0.04;
      }
    }

    // ── BB Upper/Lower Y aralığını hafifçe genişlet ───────────────────────
    if (ov.bb && yMin != null) {
      (figure.data || []).filter(t => t.type === 'scatter' && isBBTrace(t)).forEach(t => {
        const txs = (t.x || []).map(toDateStr);
        const isUpper = /upper|üst\s*bant/i.test(t.name || '');
        const isLower = /lower|alt\s*bant/i.test(t.name || '');
        if (!isUpper && !isLower) return;
        (t.y || []).forEach((v, i) => {
          if (v != null && isFinite(v) && txs[i] >= x0 && txs[i] <= x1) {
            if (isUpper) yMax = Math.max(yMax, v * 1.002);
            if (isLower) yMin = Math.min(yMin, v * 0.998);
          }
        });
      });
    }

    // ── FRM Y aralığını genişlet — sadece mevcut fiyat aralığının yakınındaki değerleri dahil et
    if (ov.frm && yMin != null) {
      // Mevcut candle range'inin %40 dışına çıkan formation değerlerini yoksay
      const candleRange = yMax - yMin;
      const frmYLo = yMin - candleRange * 0.4;
      const frmYHi = yMax + candleRange * 0.4;
      const clampY = v => v != null && isFinite(v) && v >= frmYLo && v <= frmYHi;

      (figure.data || []).filter(t => t.type === 'scatter' && isFrmTrace(t)).forEach(t => {
        const txs = (t.x || []).map(toDateStr);
        (t.y || []).forEach((v, i) => {
          if (clampY(v) && txs[i] >= x0 && txs[i] <= x1) {
            yMin = Math.min(yMin, v * 0.998);
            yMax = Math.max(yMax, v * 1.002);
          }
        });
      });
      (patternShapes || []).forEach(s => {
        if (s.xref && s.xref !== 'x' && s.xref !== 'x1') return;
        const sx0d = shapeDate(s.x0), sx1d = shapeDate(s.x1);
        const inRange = (!sx0d && !sx1d) || ((sx1d || x1) >= x0 && (sx0d || x0) <= x1);
        if (inRange) {
          if (clampY(s.y0)) { yMin = Math.min(yMin, s.y0 * 0.998); yMax = Math.max(yMax, s.y0 * 1.002); }
          if (clampY(s.y1)) { yMin = Math.min(yMin, s.y1 * 0.998); yMax = Math.max(yMax, s.y1 * 1.002); }
        }
      });
    }

    // ── Formation rengi (trace name veya mevcut formation'dan) ───────────
    const frmColor = frm ? (FRM_COLOR[frm] || '#f59e0b') : '#f59e0b';

    // ── Trace filtreleme + normalize ──────────────────────────────────────
    const traces = (figure.data || [])
      .filter(t => {
        if (t.type === 'candlestick' || t.type === 'ohlc') return true;
        if (t.type === 'bar') return ov.vol;
        if (t.type === 'scatter') {
          if (isEmaTrace(t))     return ov.ema;
          if (isBBTrace(t))      return ov.bb;
          if (isSubplotTrace(t)) return false;
          if (!ov.frm)           return false;
          return traceInXRange(t);
        }
        return true;
      })
      .map(t => {
        if (t.type === 'bar') return { ...t, yaxis: 'y2', opacity: 0.45, hoverinfo: 'skip' };
        if (t.type === 'scatter') {
          const tb = { ...t, fill: 'none', fillcolor: 'transparent', hoverinfo: 'x+y' };
          if (isEmaTrace(t)) {
            const p = getEmaPeriod(t.name);
            const w = p >= 50 ? 1.4 : 0.9;
            const op = p >= 50 ? 0.65 : 0.45;
            return { ...tb, line: { ...(t.line||{}), width: w, dash: 'solid' }, opacity: op };
          }
          if (isBBTrace(t)) {
            const isLower = /lower|alt\s*bant/i.test(t.name || '');
            const isMid   = /mid|orta\s*bant/i.test(t.name || '');
            return {
              ...tb,
              fill:      isLower ? 'tonexty' : 'none',
              fillcolor: isLower ? 'rgba(168,85,247,0.05)' : 'transparent',
              line: { ...(t.line||{}), width: isMid ? 0.6 : 0.7, dash: isMid ? 'dot' : 'solid', color: isMid ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.45)' },
              opacity: 0.65,
            };
          }
          // FRM scatter trace
          const tColor = FRM_COLOR[t.name] || frmColor;
          return { ...tb, line: { ...(t.line||{}), width: 1.4, dash: 'solid', color: tColor }, opacity: 0.85, hoverinfo: 'x+y+name' };
        }
        return t;
      });

    // ── Grafik tipi dönüşümü ─────────────────────────────────────────────────
    const finalTraces = traces.map(t => {
      if (t.type !== 'candlestick' && t.type !== 'ohlc') return t;
      const o = t.open || [], h = t.high || [], l = t.low || [], c = t.close || [];
      if (chartType === 'ohlc') {
        return { ...t, type: 'ohlc',
          increasing: { line: { color: '#34d399', width: 1 } },
          decreasing: { line: { color: '#f87171', width: 1 } },
        };
      }
      if (chartType === 'ha') {
        const ha = toHeikinAshi(o, h, l, c);
        return { ...t, type: 'candlestick', open: ha.open, high: ha.high, low: ha.low, close: ha.close };
      }
      if (chartType === 'hollow') {
        return { ...t, type: 'candlestick',
          increasing: { line: { color: '#34d399', width: 1.2 }, fillcolor: 'transparent' },
          decreasing: { line: { color: '#f87171', width: 1 }, fillcolor: 'rgba(248,113,113,0.85)' },
        };
      }
      if (chartType === 'line') {
        return { type: 'scatter', mode: 'lines', x: t.x, y: c,
          name: t.name, line: { color: '#99f7ff', width: 1.5 }, hoverinfo: 'x+y' };
      }
      if (chartType === 'area') {
        return { type: 'scatter', mode: 'lines', x: t.x, y: c,
          name: t.name, line: { color: '#99f7ff', width: 1.5 },
          fill: 'tozeroy', fillcolor: 'rgba(153,247,255,0.06)', hoverinfo: 'x+y' };
      }
      return t;
    });

    // ── Fibonacci ───────────────────────────────────────────────────────────
    const fib = ov.fib ? buildFibonacci(figure, [x0, x1]) : { shapes: [], annotations: [] };

    // ── Destek / Hedef çizgileri ────────────────────────────────────────────
    const levelShapes = [];
    const levelAnnotations = [];
    if (sup != null && isFinite(Number(sup))) {
      const sy = Number(sup);
      levelShapes.push({ type: 'line', xref: 'x', yref: 'y', x0, x1, y0: sy, y1: sy, line: { color: 'rgba(248,113,113,0.55)', width: 1, dash: 'dot' } });
      levelAnnotations.push({ xref: 'paper', yref: 'y', x: 0, xanchor: 'right', y: sy, text: `M.DESTEK ₺${Number(sy).toFixed(2)}`, showarrow: false, font: { size: 9, color: 'rgba(248,113,113,0.80)', family: S.mono }, bgcolor: 'rgba(248,113,113,0.08)', borderpad: 2 });
    }
    if (tgt != null && isFinite(Number(tgt))) {
      const ty = Number(tgt);
      levelShapes.push({ type: 'line', xref: 'x', yref: 'y', x0, x1, y0: ty, y1: ty, line: { color: 'rgba(52,211,153,0.55)', width: 1, dash: 'dot' } });
      levelAnnotations.push({ xref: 'paper', yref: 'y', x: 0, xanchor: 'right', y: ty, text: `M.HEDEF ₺${Number(ty).toFixed(2)}`, showarrow: false, font: { size: 9, color: 'rgba(52,211,153,0.80)', family: S.mono }, bgcolor: 'rgba(52,211,153,0.08)', borderpad: 2 });
    }

    // ── Backend shapes — orijinal koordinatlarıyla göster (ChartSection ile aynı yaklaşım) ──────
    // Slope-based projeksiyon kaldırıldı: tarihsel şekilleri mevcut range'e taşımak
    // yanlış çizimler üretiyor. Şekilleri orijinal koordinatlarında bırakıyoruz;
    // Plotly görünür range dışındaki kısımları otomatik clip eder.
    let backendShapesProjected = 0;
    const projectedBaseShapes = ov.frm ? (patternShapes || []).map(s => {
      const sColor = s.line?.color || frmColor;
      // Görünür range ile örtüşüp örtüşmediğini kontrol et
      const d0 = shapeDate(s.x0), d1 = shapeDate(s.x1);
      if (d0 && d1) {
        // Shape tamamen görünür range dışındaysa gösterme
        if (d1 < x0 || d0 > x1) return null;
      }
      backendShapesProjected++;
      return {
        ...s,
        line:      { ...(s.line||{}), width: 1.5, color: sColor },
        fillcolor: s.type === 'rect' ? `${sColor}14` : 'rgba(0,0,0,0)',
        opacity:   1,
      };
    }).filter(Boolean) : [];

    // ── Formasyon fallback + annotation ──────────────────────────────────────
    // Shapes: sadece backend projeksiyon başarısız olduğunda çizilir.
    // Annotation: her zaman çizilir; Y pozisyonu projeksiyondan ya da fallback'ten gelir.
    const frmFallbackShapes = [];
    const frmFallbackAnnotations = [];
    if (ov.frm && frm && frm !== 'Formasyon Yok') {
      const fc = FRM_COLOR[frm] || frmColor;
      const fShortName = FRM_SHORT[frm] || frm;

      let annotY = null;

      // Backend projeksiyon başarılıysa annotation Y'sini oradan al
      if (backendShapesProjected > 0 && projectedBaseShapes.length > 0) {
        const firstLine = projectedBaseShapes.find(s => s.type === 'line');
        if (firstLine) annotY = firstLine.y0;
      }

      // Backend projeksiyon yoksa fallback shapes çiz + annotY hesapla
      if (backendShapesProjected === 0) {
        let supLevel = sup != null && isFinite(Number(sup)) ? Number(sup) : null;
        let tgtLevel = tgt != null && isFinite(Number(tgt)) ? Number(tgt) : null;

        if (supLevel == null && candleT) {
          const cxs = candleT.x || [];
          const visLows  = (candleT.low  || []).filter((v,i) => { const d=toDateStr(cxs[i]); return d>=x0&&d<=x1&&v!=null&&isFinite(v); });
          const visHighs = (candleT.high || []).filter((v,i) => { const d=toDateStr(cxs[i]); return d>=x0&&d<=x1&&v!=null&&isFinite(v); });
          if (visLows.length) {
            const sLows  = [...visLows].sort((a,b)=>a-b);
            const sHighs = visHighs.length ? [...visHighs].sort((a,b)=>b-a) : [];
            const isResistance = /direnç/i.test(frm);
            if (isResistance && sHighs.length) {
              supLevel = sHighs[Math.floor(sHighs.length * 0.1)];
            } else {
              supLevel = sLows[Math.floor(sLows.length * 0.12)];
            }
          }
        }

        if (supLevel != null) {
          annotY = supLevel;
          frmFallbackShapes.push({
            type: 'line', xref: 'x', yref: 'y', x0, x1,
            y0: supLevel, y1: supLevel,
            line: { color: fc, width: 1.8, dash: 'solid' },
          });
        }
        if (tgtLevel != null) {
          frmFallbackShapes.push({
            type: 'line', xref: 'x', yref: 'y', x0, x1,
            y0: tgtLevel, y1: tgtLevel,
            line: { color: fc, width: 1.2, dash: 'dash' },
          });
        }
      }

      if (annotY != null) {
        frmFallbackAnnotations.push({
          xref: 'paper', yref: 'y', x: 0.01, xanchor: 'left', y: annotY,
          text: fShortName,
          showarrow: false,
          font: { size: 9, color: fc, family: S.mono },
          bgcolor: fc + '14', borderpad: 3,
        });
      }
    }

    const layout = {
      paper_bgcolor: 'transparent',
      plot_bgcolor:  'rgba(5,7,10,0.7)',
      margin: { t: 2, r: ov.fib ? 82 : SP[5], b: 2, l: 0 },
      showlegend: false,
      font: { color: 'rgba(255,255,255,0.18)', size: FS.micro, family: S.mono },
      shapes: [
        ...projectedBaseShapes,
        ...frmFallbackShapes,
        ...fib.shapes,
        ...levelShapes,
      ],
      annotations: [
        ...(ov.frm ? (base.annotations || []).filter(a => {
            // Tarih bazlı (xref=x) annotation'ları range içinde tut; diğerlerini herzaman göster
            if (!a.xref || a.xref === 'paper' || a.xref === 'x domain') return true;
            if (a.x == null) return true;
            const ax = toDateStr(a.x);
            if (!ax || ax.length < 10) return true;
            // Görünür range içinde veya yakınındaysa göster (+/- 1 ay tolerans)
            const axT = new Date(ax).getTime();
            const x0T = new Date(x0).getTime() - 30 * 86400000;
            const x1T = new Date(x1).getTime() + 30 * 86400000;
            return axT >= x0T && axT <= x1T;
          }).map(a => ({ ...a, font: { ...(a.font||{}), size: 9, family: S.mono }, showarrow: false }))
        : []),
        ...frmFallbackAnnotations,
        ...fib.annotations,
        ...levelAnnotations,
      ],
      hovermode: 'closest',
      hoverlabel: {
        bgcolor: '#0c1420', bordercolor: 'rgba(153,247,255,0.2)',
        font: { size: FS.xs, color: 'rgba(255,255,255,0.75)', family: S.mono }, align: 'left',
        namelength: 0,
      },
      xaxis: {
        domain: [0, 1], range: [x0, x1],
        type: 'date',
        gridcolor: 'rgba(255,255,255,0.04)', linecolor: 'rgba(255,255,255,0.07)',
        showticklabels: false,
        tickfont: { color: 'rgba(0,0,0,0)', size: 1 },
        tickcolor: 'rgba(0,0,0,0)',
        ticklen: 0, tickwidth: 0,
        showspikes: false,
        rangeslider: { visible: false },
        zeroline: false, showgrid: false, fixedrange: true,
      },
      xaxis2: {
        showticklabels: false,
        tickfont: { color: 'rgba(0,0,0,0)', size: 1 },
        ticklen: 0, tickwidth: 0,
        rangeslider: { visible: false },
        zeroline: false, showgrid: false, fixedrange: true,
      },
      yaxis: {
        domain: ov.vol ? [0.18, 1.0] : [0, 1.0],
        gridcolor: 'rgba(255,255,255,0.03)', linecolor: 'rgba(255,255,255,0.05)',
        tickfont: { size: FS.micro, color: 'rgba(255,255,255,0.18)', family: S.mono },
        side: 'right', zeroline: false, showgrid: true, fixedrange: true,
        ...(yMin != null ? { autorange: false, range: [yMin, yMax] } : {}),
      },
      yaxis2: {
        domain: [0, 0.15],
        gridcolor: 'transparent', linecolor: 'transparent',
        tickvals: [], showticklabels: false,
        side: 'right', zeroline: false, showgrid: false, fixedrange: true,
      },
      dragmode: false,
    };
    try {
      Plotly.purge(divRef.current);
      Plotly.newPlot(divRef.current, finalTraces, layout, { displayModeBar: false, responsive: true, scrollZoom: false });
      // Tüm x-ekseni text elementlerini DOM'dan gizle (showticklabels:false yeterince güvenilmez)
      const hide = el => { el.style.display = 'none'; el.style.visibility = 'hidden'; };
      divRef.current.querySelectorAll(
        'g.xtick text, g.x2tick text, g.xaxislayer-above text, g.xaxislayer text, .xtick > text, .x2tick > text'
      ).forEach(hide);
    } catch (_) {}
  }, [ready, figure, ov, period, sup, tgt, frm, patternShapes, chartType]);

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const OV_CHIPS = [
    { key: 'ema', label: 'Hareketli Ortalama', short: 'EMA', color: '#22d3ee', tip: 'Üstel Hareketli Ortalama — fiyatın kısa/orta vadeli trendini gösterir. Fiyat EMA\'nın üstündeyse yükseliş eğilimi, altındaysa düşüş eğilimi.' },
    { key: 'bb',  label: 'Bollinger Bantları',  short: 'BB',  color: '#a855f7', tip: 'Bollinger Bantları — fiyatın volatilite (oynaklık) sınırlarını gösterir. Bantlar daralırsa büyük hareket gelebilir, bantlar genişlerse volatilite artmış demektir.' },
    { key: 'frm', label: 'Formasyon Bölgeleri', short: 'FRM', color: '#f59e0b', tip: 'Teknik formasyon bölgeleri — destek/direnç ve şekil örüntülerinin tespit edildiği fiyat bölgelerini işaretler.' },
    { key: 'vol', label: 'Hacim',               short: 'VOL', color: '#34d399', tip: 'İşlem hacmi — grafiğin alt bölümünde bar olarak gösterilir. Yüksek hacim fiyat hareketini teyit eder.' },
    { key: 'fib', label: 'Fibonacci',            short: 'FIB', color: '#f97316', tip: 'Fibonacci düzeltme seviyeleri — görünür fiyat aralığının %23.6, %38.2, %50, %61.8 ve %78.6 geri çekilme noktalarını işaretler.' },
  ];

  const toolbar = mcMobile ? (
    /* ── Mobil: 2 satır ─────────────────────────────────────────── */
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', background: S.bg0, borderBottom: `1px solid ${S.border0}` }}>
      {/* Satır 1: İndikatör chip'leri */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: `3px ${SP[2]}px`, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {OV_CHIPS.map(({ key, short, color, tip }) => {
          const on = ov[key];
          return (
            <ChipWithTip key={key} tip={tip}>
              <button onClick={() => toggleOv(key)} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24, padding: '0 9px', borderRadius: 4, cursor: 'pointer', flexShrink: 0, border: `1px solid ${on ? color : 'rgba(255,255,255,0.10)'}`, background: on ? color + '1a' : 'transparent', transition: 'all 0.12s' }}>
                <span style={{ display: 'block', width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: on ? color : 'rgba(255,255,255,0.18)', boxShadow: on ? `0 0 4px ${color}` : 'none' }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', color: on ? color : 'rgba(255,255,255,0.28)', fontFamily: S.mono }}>{short}</span>
              </button>
            </ChipWithTip>
          );
        })}
      </div>
      {/* Satır 2: Grafik tipi + periyot butonları */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: `2px ${SP[2]}px`, borderTop: `1px solid ${S.border0}` }}>
        {(() => {
          const cur = CHART_TYPES.find(c => c.key === chartType) || CHART_TYPES[0];
          return (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button ref={ctBtnRef} onClick={() => { if (ctBtnRef.current) { const r = ctBtnRef.current.getBoundingClientRect(); setCtMenuPos({ top: r.bottom + 2, right: window.innerWidth - r.right }); } setCtMenuOpen(v => !v); }} title={cur.label} style={{ padding: '2px 8px', borderRadius: 2, cursor: 'pointer', border: `1px solid ${ctMenuOpen ? 'rgba(153,247,255,0.35)' : 'rgba(153,247,255,0.18)'}`, background: ctMenuOpen ? 'rgba(153,247,255,0.08)' : 'rgba(153,247,255,0.03)', fontSize: FS.micro, fontFamily: S.mono, letterSpacing: '0.06em', color: ctMenuOpen ? S.primary : 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.12s', whiteSpace: 'nowrap', height: 22 }}>
                <span style={{ fontSize: FS.micro, fontWeight: 800 }}>{cur.label.toUpperCase()}</span>
                <span style={{ fontSize: 7, opacity: 0.5 }}>▾</span>
              </button>
              {ctMenuOpen && (
                <div style={{ position: 'fixed', top: ctMenuPos.top, right: ctMenuPos.right, zIndex: 99999, background: '#0d1118', border: '1px solid rgba(153,247,255,0.12)', borderRadius: 4, overflow: 'hidden', minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.7)' }}>
                  {CHART_TYPES.map(ct => (
                    <div key={ct.key} onClick={() => { setChartType(ct.key); setCtMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', background: chartType === ct.key ? 'rgba(153,247,255,0.07)' : 'transparent', color: chartType === ct.key ? S.primary : 'rgba(255,255,255,0.55)', fontSize: FS.micro, fontFamily: S.mono, letterSpacing: '0.04em', transition: 'background 0.1s' }} onMouseEnter={e => { if (chartType !== ct.key) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }} onMouseLeave={e => { e.currentTarget.style.background = chartType === ct.key ? 'rgba(153,247,255,0.07)' : 'transparent'; }}>
                      <span style={{ fontSize: 10, width: 14, textAlign: 'center' }}>{ct.icon}</span>
                      <span>{ct.label}</span>
                      {chartType === ct.key && <span style={{ marginLeft: 'auto', fontSize: 8, color: S.primary }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          {['1S', '6S', '1G', '|', '1H', '1A', '3A', '6A'].map(p => {
            if (p === '|') return <span key="sep" style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 2px', alignSelf: 'stretch', display: 'block' }} />;
            return (
              <button key={p} onClick={() => setPeriod(p)} style={{ padding: `2px 6px`, borderRadius: 2, cursor: 'pointer', border: 'none', background: period === p ? 'rgba(153,247,255,0.08)' : 'transparent', fontSize: FS.micro, fontWeight: period === p ? 900 : 500, letterSpacing: '0.06em', fontFamily: S.mono, color: period === p ? S.primary : INTRADAY_PERIODS.has(p) ? 'rgba(153,247,255,0.35)' : 'rgba(255,255,255,0.28)', transition: 'all 0.1s' }}>{p}</button>
            );
          })}
        </div>
      </div>
    </div>
  ) : (
    /* ── Desktop: tek satır ──────────────────────────────────────── */
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, padding: `3px ${SP[3]}px`, borderBottom: `1px solid ${S.border0}`, background: S.bg0, overflowX: 'auto', overflowY: 'hidden' }}>
      {OV_CHIPS.map(({ key, label, short, color, tip }) => {
        const on = ov[key];
        return (
          <ChipWithTip key={key} tip={tip}>
            <button onClick={() => toggleOv(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 4, cursor: 'pointer', flexShrink: 0, border: `1px solid ${on ? color : 'rgba(255,255,255,0.10)'}`, background: on ? color + '1a' : 'transparent', transition: 'all 0.12s' }}>
              <span style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: on ? color : 'rgba(255,255,255,0.18)', boxShadow: on ? `0 0 4px ${color}` : 'none' }} />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', color: on ? color : 'rgba(255,255,255,0.28)', fontFamily: S.mono }}>{short}</span>
              <span style={{ fontSize: 10, fontWeight: 400, color: on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)', fontFamily: S.sans, whiteSpace: 'nowrap' }}>{label}</span>
            </button>
          </ChipWithTip>
        );
      })}
      <div style={{ flex: 1 }} />
      {(() => {
        const cur = CHART_TYPES.find(c => c.key === chartType) || CHART_TYPES[0];
        return (
          <div style={{ position: 'relative' }}>
            <button ref={ctBtnRef} onClick={() => { if (ctBtnRef.current) { const r = ctBtnRef.current.getBoundingClientRect(); setCtMenuPos({ top: r.bottom + 2, right: window.innerWidth - r.right }); } setCtMenuOpen(v => !v); }} title={cur.label} style={{ padding: '2px 7px', borderRadius: 2, cursor: 'pointer', border: `1px solid ${ctMenuOpen ? 'rgba(153,247,255,0.35)' : 'rgba(153,247,255,0.18)'}`, background: ctMenuOpen ? 'rgba(153,247,255,0.08)' : 'rgba(153,247,255,0.03)', fontSize: FS.micro, fontFamily: S.mono, letterSpacing: '0.06em', color: ctMenuOpen ? S.primary : 'rgba(255,255,255,0.65)', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.12s' }}>
              <span style={{ fontSize: FS.micro, fontWeight: 800 }}>{cur.label.toUpperCase()}</span>
              <span style={{ fontSize: 7, opacity: 0.5 }}>▾</span>
            </button>
            {ctMenuOpen && (
              <div style={{ position: 'fixed', top: ctMenuPos.top, right: ctMenuPos.right, zIndex: 99999, background: '#0d1118', border: '1px solid rgba(153,247,255,0.12)', borderRadius: 4, overflow: 'hidden', minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.7)' }}>
                {CHART_TYPES.map(ct => (
                  <div key={ct.key} onClick={() => { setChartType(ct.key); setCtMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', background: chartType === ct.key ? 'rgba(153,247,255,0.07)' : 'transparent', color: chartType === ct.key ? S.primary : 'rgba(255,255,255,0.55)', fontSize: FS.micro, fontFamily: S.mono, letterSpacing: '0.04em', transition: 'background 0.1s' }} onMouseEnter={e => { if (chartType !== ct.key) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }} onMouseLeave={e => { e.currentTarget.style.background = chartType === ct.key ? 'rgba(153,247,255,0.07)' : 'transparent'; }}>
                    <span style={{ fontSize: 10, width: 14, textAlign: 'center' }}>{ct.icon}</span>
                    <span>{ct.label}</span>
                    {chartType === ct.key && <span style={{ marginLeft: 'auto', fontSize: 8, color: S.primary }}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      <div style={{ display: 'flex', gap: 1 }}>
        {['1S', '6S', '1G', '|', '1H', '1A', '3A', '6A'].map(p => {
          if (p === '|') return <span key="sep" style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 2px', alignSelf: 'stretch', display: 'block' }} />;
          return (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: `2px 5px`, borderRadius: 2, cursor: 'pointer', border: 'none', background: period === p ? 'rgba(153,247,255,0.08)' : 'transparent', fontSize: FS.micro, fontWeight: period === p ? 900 : 500, letterSpacing: '0.06em', fontFamily: S.mono, color: period === p ? S.primary : INTRADAY_PERIODS.has(p) ? 'rgba(153,247,255,0.35)' : 'rgba(255,255,255,0.28)', transition: 'all 0.1s' }}>{p}</button>
          );
        })}
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {toolbar}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: S.bg0 }}>
        <style>{`@keyframes shimmerSweep{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}`}</style>
        {/* shimmer sweep */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, transparent 35%, rgba(153,247,255,0.03) 50%, transparent 65%)',
            animation: 'shimmerSweep 2.2s ease-in-out infinite',
          }} />
        </div>
        {/* centered minimal indicator */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, pointerEvents: 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid rgba(153,247,255,0.08)`, borderTopColor: 'rgba(153,247,255,0.35)', animation: 'spin 1.2s linear infinite' }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(153,247,255,0.2)', fontFamily: S.mono }}>Yükleniyor</span>
        </div>
      </div>
    </div>
  );
  if (error || !figure) return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {toolbar}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: SP[2] }}>
        <span style={{ fontSize: FS.lg, color: 'rgba(255,255,255,0.05)' }}>⚠</span>
        <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Grafik yüklenemedi</span>
      </div>
    </div>
  );
  const x0t = xLabels.x0 ? new Date(xLabels.x0).getTime() : 0;
  const x1t = xLabels.x1 ? new Date(xLabels.x1).getTime() : 1;
  const span = x1t - x0t || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {toolbar}
      <div ref={divRef} style={{ flex: 1, minHeight: 0 }} />
      {/* Tarih ekseni — Plotly dışında, tam hizalı HTML */}
      <div style={{ position: 'relative', height: 16, flexShrink: 0, paddingRight: SP[5] }}>
        {xLabels.vals.map((val, i) => {
          const pct = (new Date(val).getTime() - x0t) / span * 100;
          return (
            <span key={val} style={{
              position: 'absolute',
              left: `${pct}%`,
              transform: 'translateX(-50%)',
              fontSize: FS.micro,
              color: 'rgba(255,255,255,0.28)',
              fontFamily: S.mono,
              whiteSpace: 'nowrap',
              lineHeight: '16px',
              userSelect: 'none',
            }}>
              {xLabels.texts[i]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Paylaş butonu ─────────────────────────────────────────────────────────────
function ShareButton({ sym, co, qrs, chg }) {
  const [copied, setCopied] = useState(false);
  const [open,   setOpen]   = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const url  = `https://pivot-radar.com/terminal/${sym}`;
  const sign = Number(chg) >= 0 ? '+' : '';
  const text = `${sym}${co && co !== sym ? ` (${co})` : ''} — QRS: ${qrs ?? '—'} | ${sign}${Number(chg).toFixed(2)}% | PivotRadar analizi: ${url}`;

  const copyLink = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
    setOpen(false);
  };
  const shareTwitter  = () => { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank'); setOpen(false); };
  const shareWhatsApp = () => { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); setOpen(false); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Paylaş"
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
          background: open ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${open ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.08)'}`,
          color: open ? '#22d3ee' : 'rgba(255,255,255,0.35)',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
          transition: 'all 0.15s',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        {copied ? 'KOPYALANDİ' : 'PAYLAŞ'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
          background: '#07090e', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: 4, minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {[
            { label: '🔗  Linki Kopyala',  action: copyLink },
            { label: '𝕏  Twitter / X',     action: shareTwitter },
            { label: '💬  WhatsApp',        action: shareWhatsApp },
          ].map(({ label, action }) => (
            <button key={label} onClick={action} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600,
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Metrik chip (detail panel) ─────────────────────────────────────────────────
function MetricChip({ label, value, color, accent }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', gap: SP[1], padding: `${SP[2]}px ${SP[3]}px`,
      border: `1px solid ${accent ? `${accent}22` : S.border0}`,
      background: accent ? `${accent}06` : 'rgba(255,255,255,0.015)',
      borderRadius: 3, minWidth: 0, minHeight: H.metricChip,
      justifyContent: 'center',
    }}>
      <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: FS.lg, fontWeight: 900, fontFamily: S.mono, color: color || '#fff', lineHeight: 1 }}>{value}</span>
    </div>
  );
}

// ── Tooltip wrapper (chip toolbar için) — portal ile overflow:hidden'dan kaçar ─
function ChipWithTip({ tip, children }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  const show = useCallback(() => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom + 6 });
  }, [tip]);

  const hide = useCallback(() => setPos(null), []);

  return (
    <div ref={ref} style={{ display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}>
      {children}
      {pos && tip && createPortal(
        <div style={{
          position: 'fixed', top: pos.y, left: pos.x,
          transform: 'translateX(-50%)',
          zIndex: 99999, background: '#0b0e16',
          border: '1px solid rgba(153,247,255,0.18)',
          borderRadius: 4, padding: '5px 8px',
          fontSize: 10, lineHeight: 1.55,
          fontFamily: "'IBM Plex Mono', monospace",
          color: 'rgba(255,255,255,0.6)',
          maxWidth: 200, whiteSpace: 'normal',
          pointerEvents: 'none',
          boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
          textAlign: 'center',
        }}>
          {tip}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Stats tek satır (label … value) ──────────────────────────────────────────
function StatsRow({ label, value, color, bar, barColor, tip }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5px 0', gap: 4 }}>
      <span
        style={{ fontSize: FS.micro, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap', flexShrink: 0, cursor: tip ? 'help' : 'default', borderBottom: tip ? '1px dotted rgba(255,255,255,0.13)' : 'none', position: 'relative' }}
        onMouseEnter={() => tip && setHov(true)}
        onMouseLeave={() => setHov(false)}
      >
        {label}
        {hov && tip && (
          <div style={{
            position: 'absolute', top: '50%', left: 'calc(100% + 6px)',
            transform: 'translateY(-50%)',
            zIndex: 9999, background: '#0b0e16',
            border: '1px solid rgba(153,247,255,0.18)',
            borderRadius: 4, padding: '5px 8px',
            fontSize: 10, lineHeight: 1.55,
            fontFamily: "'IBM Plex Mono', monospace",
            color: 'rgba(255,255,255,0.6)',
            width: 160, whiteSpace: 'normal',
            pointerEvents: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
          }}>
            {tip}
          </div>
        )}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
        {bar != null && (
          <div style={{ width: 20, height: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 1, flexShrink: 0 }}>
            <div style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%`, height: '100%', background: barColor || '#fff', borderRadius: 1, transition: 'width 0.4s ease' }} />
          </div>
        )}
        <span style={{ fontSize: FS.micro, fontWeight: 800, fontFamily: 'monospace', color: color || 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </div>
  );
}

// ── 2 dikey sütun render: sol alt alta, sağ alt alta ─────────────────────────
// cols=1 → tek sütun (dar panel), cols=2 → iki dikey sütun
function renderStatsGrid(items, cols) {
  const valid = items.filter(Boolean);
  if (!valid.length) return null;

  const renderItem = (it, key) => {
    if (it.sep) return <div key={key} style={{ borderTop: `1px solid ${S.border0}`, margin: '2px 0' }} />;
    return <StatsRow key={key} label={it.label} value={it.value} color={it.color} bar={it.bar} barColor={it.barColor} tip={it.tip} />;
  };

  if (cols === 1) {
    return <>{valid.map((it, i) => renderItem(it, i))}</>;
  }

  // Listeyi ortadan ikiye böl — sep item'ları saymadan content bazlı 50/50
  const contentCount = valid.filter(it => !it.sep).length;
  const target = Math.ceil(contentCount / 2);
  let seen = 0, mid = valid.length;
  for (let idx = 0; idx < valid.length; idx++) {
    if (!valid[idx].sep) seen++;
    if (seen === target) { mid = idx + 1; break; }
  }
  const left  = valid.slice(0, mid);
  const right = valid.slice(mid);

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {left.map((it, i) => renderItem(it, `l${i}`))}
      </div>
      {right.length > 0 && (
        <>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch', margin: '0 5px', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {right.map((it, i) => renderItem(it, `r${i}`))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Detail panel (chart zone içeriği) ─────────────────────────────────────────
function DetailPanel({ item }) {
  // ── Hooks önce — React Rules of Hooks: koşullu return'den önce çağrılmalı ──
  const { isMobile: dpMobile } = useBreakpoint();
  const sym = item ? getSym(item) : null;

  const [funData,    setFunData]    = useState(null);
  const [funLoading, setFunLoading] = useState(false);
  useEffect(() => {
    if (!sym) { setFunData(null); return; }
    setFunData(null);
    setFunLoading(true);
    api.fundamentals(sym)
      .then(d => setFunData(d && !d.status ? d : null))
      .catch(() => setFunData(null))
      .finally(() => setFunLoading(false));
  }, [sym]);

  const panelRef = useRef(null);
  const [panelWidth, setPanelWidth] = useState(600);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPanelWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const colsInner = panelWidth >= 400 ? 2 : 1;

  if (!item) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: SP[3] }}>
      <div style={{ width: SP[6], height: SP[6], borderRadius: 3, background: 'rgba(255,255,255,0.015)', border: `1px solid ${S.border0}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: SP[5], color: 'rgba(255,255,255,0.04)' }}>◎</span>
      </div>
      <p style={{ fontSize: FS.xs, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.08)', margin: 0 }}>Hisse seçin</p>
    </div>
  );

  const pr     = getPrice(item) ?? funData?.prev_close ?? null;
  const chg    = getChg(item);   const rsi    = getRSI(item);
  const ml     = getML(item);    const qrs    = getQRS(item);
  const vol    = getVol(item);   const frm    = getFrm(item);
  const co     = getCo(item);    const tgt    = getTgt(item);
  const sup    = getSup(item);   const rr     = getRR(item);
  const days   = getDays(item);  const dir    = getDir(item);

  // qlabel ve dirLabel kaldırıldı — SPK lisansı olmadığı için öneri/tavsiye gösterilmiyor
  const pos    = Number(chg) >= 0;
  const fShort = frm && frm !== 'Formasyon Yok' ? FRM_SHORT[frm] : null;
  const fColor = frm ? (FRM_COLOR[frm] || '#94a3b8') : '#94a3b8';

  const rrRatio = rr != null ? Number(rr).toFixed(2)
    : (() => {
        if (tgt == null || sup == null || Number(pr) <= 0) return null;
        const risk = Math.abs(Number(pr) - Number(sup));
        const reward = Math.abs(Number(tgt) - Number(pr));
        return risk > 0 ? (reward / risk).toFixed(1) : null;
      })();
  const bearishConflict = !!(frm && PATTERN_INFO[frm]?.signal === 'bearish' && tgt != null && Number(pr) > 0 && Number(tgt) > Number(pr));

  const hasLevels = sup != null || tgt != null;
  const e20  = item.ema20_gap    != null ? Number(item.ema20_gap)    : null;
  const e50  = item.ema50_gap    != null ? Number(item.ema50_gap)    : null;
  const vrat = item.volume_ratio  != null ? Number(item.volume_ratio)  : null;
  const w52  = item.w52_position  != null ? Math.round(Number(item.w52_position) * 100) : null;
  const hasSuppData = e20 != null || e50 != null || vrat != null || w52 != null;

  return (
    <div ref={panelRef} data-ctx="chart" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Başlık ── */}
      {dpMobile ? (
        /* Mobil: tek satır, kompakt */
        <div style={{ padding: `${SP[1]}px ${SP[3]}px`, borderBottom: `1px solid ${S.border0}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: SP[2], minHeight: 36 }}>
          {/* Sol: logo + sembol + sektör inline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <TickerLogo ticker={sym} size="sm" />
            <span style={{ fontSize: FS.md, fontWeight: 900, fontFamily: S.mono, color: '#fff', letterSpacing: '0.04em', whiteSpace: 'nowrap', lineHeight: 1 }}>{sym}</span>
            {normalizeSector(item?.sector, getSym(item)) && (
              <span style={{ fontSize: FS.micro, fontWeight: 700, color: getSectorColor(normalizeSector(item.sector, getSym(item))), letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {normalizeSector(item.sector, getSym(item))}
              </span>
            )}
          </div>
          {/* Sağ: fiyat + değişim + formasyon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: SP[1], flexShrink: 0 }}>
            <span style={{ fontSize: FS.sm, fontWeight: 900, fontFamily: S.mono, color: '#fff', lineHeight: 1 }}>{fmtPrc(pr)}</span>
            <span style={{ fontSize: FS.micro, fontWeight: 800, fontFamily: S.mono, color: pos ? S.positive : S.negative, padding: `1px 5px`, borderRadius: 2, background: pos ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${pos ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`, whiteSpace: 'nowrap' }}>
              {fmtPct(chg)}
            </span>
            {fShort && (
              <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: fColor, padding: `1px 5px`, borderRadius: 2, border: `1px solid ${fColor}30`, background: `${fColor}08`, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: fColor, display: 'inline-block', flexShrink: 0 }} />
                {fShort}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Masaüstü: orijinal layout */
        <div style={{ padding: `${SP[2]}px ${SP[3]}px`, borderBottom: `1px solid ${S.border0}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: SP[2], minHeight: 38 }}>
          <TickerLogo ticker={sym} size="lg" />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1, gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: SP[2] }}>
              <span style={{ fontSize: FS.lg, fontWeight: 900, fontFamily: S.mono, color: '#fff', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{sym}</span>
              {co && co !== sym && <span style={{ fontSize: FS.xs, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co}</span>}
            </div>
            {normalizeSector(item?.sector, getSym(item)) && (
              <span style={{ fontSize: FS.micro, fontWeight: 700, color: getSectorColor(normalizeSector(item.sector, getSym(item))), letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{normalizeSector(item.sector, getSym(item))}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP[2], flexShrink: 0 }}>
            <span style={{ fontSize: FS.xl, fontWeight: 900, fontFamily: S.mono, color: '#fff', lineHeight: 1 }}>{fmtPrc(pr)}</span>
            <span style={{ fontSize: FS.sm, fontWeight: 800, fontFamily: S.mono, color: pos ? S.positive : S.negative, padding: `2px ${SP[2]}px`, borderRadius: 3, background: pos ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${pos ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`, whiteSpace: 'nowrap' }}>
              {fmtPct(chg)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP[1], flexShrink: 0 }}>
            {fShort && (
              <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: fColor, padding: `2px ${SP[2]}px`, borderRadius: 2, border: `1px solid ${fColor}30`, background: `${fColor}08`, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: fColor, display: 'inline-block' }} />
                {frm !== 'Formasyon Yok' ? frm : fShort}
              </span>
            )}
            <ShareButton sym={sym} co={co} qrs={qrs} chg={chg} />
          </div>
        </div>
      )}

      {/* ── Yasal uyarı banner — mobilde gizli ── */}
      {!dpMobile && (
        <div style={{ flexShrink: 0, background: 'rgba(251,191,36,0.04)', borderBottom: '1px solid rgba(251,191,36,0.12)', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: FS.micro, color: 'rgba(251,191,36,0.45)', fontWeight: 900, letterSpacing: '0.1em', flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.03em', lineHeight: 1.4 }}>
            Bu platform yatırım danışmanlığı hizmeti vermez. Gösterilen tüm değerler algoritmik model çıktısıdır; yatırım kararı için kullanılamaz.
          </span>
        </div>
      )}

      {/* ── Grafik — büyük alan ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        <MiniChart sym={sym} ml={ml} qrs={qrs} sup={sup} tgt={tgt} frm={frm} />
      </div>

      {/* ── Alt panel ── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${S.border0}`, background: 'rgba(255,255,255,0.012)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: dpMobile ? '1fr 1fr' : '1fr 1fr 1fr', borderBottom: `1px solid ${S.border0}` }}>

          {/* TEKNİK */}
          <div style={{ borderRight: `1px solid ${S.border0}`, padding: dpMobile ? '4px 6px' : '5px 8px' }}>
            <div style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)', marginBottom: 3 }}>TEKNİK</div>
            {renderStatsGrid([
              ml  != null ? { label: 'ML',  value: fmtN(ml),  color: colML(ml),  bar: ml  / 100, barColor: colML(ml),  tip: 'Makine Öğrenimi skoru — sistemin tahmin güveni. 80+ güçlü sinyal, 60 altı zayıf.' } : null,
              qrs != null ? { label: 'QRS', value: fmtN(qrs), color: colQRS(qrs), bar: qrs / 100, barColor: colQRS(qrs), tip: 'Quantitative Ranking Score — teknik, hacim ve momentum birleştirilerek hesaplanır. 75+ yüksek momentum.' } : null,
              rsi != null && rsi > 0 ? { label: 'RSI 14', value: fmtN(rsi), color: colRSI(rsi), tip: 'Relative Strength Index (14 periyot) — 70+ aşırı alım, 30 altı aşırı satım bölgesi.' } : null,
              days != null && days > 0 ? { label: 'Sinyal Yaşı', value: `~${days}g`, color: days <= 3 ? S.positive : days <= 7 ? '#fbbf24' : 'rgba(255,255,255,0.4)', tip: 'Sinyalin kaç gün önce üretildiği. 1–3 gün taze, 7+ gün eski sinyal.' } : null,
              vrat != null && vrat > 0 ? { label: 'Hac/Ort', value: `${vrat.toFixed(1)}x`, color: vrat >= 2 ? S.positive : vrat >= 1 ? '#fbbf24' : 'rgba(255,255,255,0.35)', tip: 'Günlük hacmin 20g ortalamasına oranı. 2x+ güçlü katılım teyidi.' } : null,
              w52  != null ? { label: '52H Poz', value: `%${w52}`, color: w52 >= 70 ? S.positive : w52 <= 30 ? S.negative : '#fbbf24', tip: 'Fiyatın 52 haftalık aralığındaki yüzde konumu. 70%+ güçlü trend bölgesi.' } : null,
            ], colsInner)}
          </div>

          {/* FİYAT & HACİM */}
          <div style={{ borderRight: dpMobile ? 'none' : `1px solid ${S.border0}`, padding: dpMobile ? '4px 6px' : '5px 8px' }}>
            <div style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)', marginBottom: 3 }}>{dpMobile ? 'FİYAT' : 'FİYAT & HACİM'}</div>
            {funLoading && !funData && <div style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.15)', fontStyle: 'italic' }}>yükleniyor…</div>}
            {renderStatsGrid([
              funData?.prev_close > 0 ? { label: 'Ö.Kpn',   value: fmtPrc(funData.prev_close), tip: 'Önceki kapanış — dünün seansının son işlem fiyatı.' } : null,
              funData?.day_low > 0 && funData?.day_high > 0 ? { label: 'Gün', value: `${fmtPrc(funData.day_low)}–${fmtPrc(funData.day_high)}`, tip: 'Günlük fiyat aralığı — bugünkü en düşük ve en yüksek fiyat.' } : null,
              funData?.week52_low > 0 && funData?.week52_high > 0 ? { label: '52H', value: `${fmtPrc(funData.week52_low)}–${fmtPrc(funData.week52_high)}`, tip: '52 haftalık fiyat aralığı — son 1 yılın min/max fiyatı.' } : null,
              vol > 0 ? { label: 'Hacim', value: fmtVol(vol), tip: 'Günlük işlem hacmi — o gün el değiştiren pay adedi.' } : null,
              funData?.avg_volume > 0 ? { label: 'Ort.Hcm', value: fmtVol(funData.avg_volume), tip: '20 günlük ortalama işlem hacmi.' } : null,
              tgt != null ? { label: bearishConflict ? 'Hedef ⚠' : 'Hedef', value: `${fmtPrc(tgt)}${rrRatio ? ` · 1:${rrRatio}` : ''}`, color: bearishConflict ? '#fbbf24' : S.positive, tip: bearishConflict ? 'Hedef fiyat — yön çelişkisi var, dikkatli değerlendir.' : 'Sistem tarafından hesaplanan fiyat hedefi. Risk/Ödül oranı yanında gösterilir.' }
                : sup != null ? { label: 'Destek', value: fmtPrc(sup), color: S.negative, tip: 'Teknik destek seviyesi — formasyona göre hesaplanmış kritik fiyat.' }
                : null,
            ], colsInner)}
          </div>

          {/* TEMEL — mobilde gizli */}
          {!dpMobile && (
            <div style={{ padding: '5px 8px' }}>
              <div style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)', marginBottom: 4 }}>TEMEL</div>
              {funLoading && !funData && <div style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.15)', fontStyle: 'italic' }}>yükleniyor…</div>}
              {renderStatsGrid([
                funData?.market_cap > 0 ? { label: 'Piy.Değ', value: fmtMarketCap(funData.market_cap), tip: 'Piyasa değeri — hisse fiyatı × dolaşımdaki hisse adedi.' } : null,
                funData?.pe_ratio   != null ? { label: 'F/K',  value: funData.pe_ratio.toFixed(2), color: funData.pe_ratio < 0 ? S.negative : 'rgba(255,255,255,0.75)', tip: 'Fiyat/Kazanç — hisse fiyatının yıllık hisse başı kazanca bölümü. Sektör ortalamasıyla karşılaştırılır.' } : null,
                funData?.roe        != null ? { label: 'ROE',  value: `${funData.roe > 0 ? '+' : ''}${funData.roe.toFixed(1)}%`, color: funData.roe > 0 ? S.positive : S.negative, tip: 'Özkaynak Karlılığı — şirketin özkaynaklarından ürettiği getiri. 15%+ iyi kabul edilir.' } : null,
                funData?.pb_ratio   > 0   ? { label: 'F/DD', value: funData.pb_ratio.toFixed(2), tip: 'Fiyat/Defter Değeri — hisse fiyatının defter değerine oranı. 1 altı teorik olarak ucuz.' } : null,
                funData?.eps        != null ? { label: 'EPS',  value: `₺${funData.eps.toFixed(2)}`, color: funData.eps > 0 ? S.positive : S.negative, tip: 'Hisse Başına Kazanç — yıllık net karın dolaşımdaki hisse adedine bölümü.' } : null,
                funData?.dividend_yield > 0 ? { label: 'Temettü', value: `%${funData.dividend_yield.toFixed(2)}`, color: '#fbbf24', tip: 'Temettü verimi — son yıl ödenen temettünün hisse fiyatına oranı.' }
                  : funData?.beta  != null ? { label: 'Beta', value: funData.beta.toFixed(2), color: Math.abs(funData.beta) > 1.5 ? '#fbbf24' : 'rgba(255,255,255,0.7)', tip: 'Piyasaya göre oynaklık. 1\'den büyük = piyasadan daha oynak, 1\'den küçük = daha stabil.' }
                  : null,
              ], colsInner)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mobil alt navigasyon (Terminal sayfasına özel) ────────────────────────────
const MOBILE_TERM_NAV = [
  { name: 'Terminal', href: '/terminal',  Icon: LayoutDashboard, color: '#22d3ee' },
  { name: 'Piyasa',   href: '/market',    Icon: BarChart2,       color: '#a78bfa' },
  { name: 'Haberler', href: '/news',      Icon: Newspaper,       color: '#60a5fa' },
  { name: 'Araçlar',  href: '/tools',     Icon: Wrench,          color: '#34d399' },
  { name: 'Portföy',  href: '/portfolio', Icon: Wallet,          color: '#34d399' },
];

function MobileTerminalBottomNav() {
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, height: 56, background: 'rgba(5,7,10,0.97)', borderTop: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'stretch' }}>
      {MOBILE_TERM_NAV.map(({ name, href, Icon, color }) => (
        <NavLink key={href} to={href} style={{ flex: 1, textDecoration: 'none' }}>
          {({ isActive }) => (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 3, borderTop: `2px solid ${isActive ? color : 'transparent'}`, transition: 'border-color 0.15s' }}>
              <Icon size={18} style={{ color: isActive ? color : 'rgba(255,255,255,0.3)', filter: isActive ? `drop-shadow(0 0 6px ${color})` : 'none', transition: 'color 0.15s' }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: isActive ? color : 'rgba(255,255,255,0.28)', textTransform: 'uppercase', lineHeight: 1, transition: 'color 0.15s' }}>{name}</span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// ── Mobile hisse satırı ───────────────────────────────────────────────────────
function MobileStockRow({ item, isSelected, onSelect }) {
  const sym    = getSym(item), pr = getPrice(item), chg = getChg(item);
  const ml     = getML(item),  qrs = getQRS(item);
  const frm    = getFrm(item);
  const frm2   = getFrm2(item);
  const fColor = frm ? (FRM_COLOR[frm] || '#94a3b8') : null;
  const frm2Color = frm2 ? (FRM_COLOR[frm2] || '#94a3b8') : null;
  const pos  = Number(chg) >= 0;
  return (
    <div onClick={() => onSelect(sym, item)} style={{ display:'grid', gridTemplateColumns:'1fr 70px 58px 46px 58px', height:H.tableRow, flexShrink:0, borderBottom:`1px solid ${S.border0}`, borderLeft:`2px solid ${isSelected?S.primary:'transparent'}`, background:isSelected?'rgba(153,247,255,0.04)':'transparent', cursor:'pointer' }}>
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', paddingLeft:SP[3], overflow:'hidden' }}>
        <span style={{ fontSize:FS.sm, fontWeight:900, color:'#fff', fontFamily:S.mono, whiteSpace:'nowrap' }}>{sym}</span>
        {fColor && (
          <div style={{ display:'flex', alignItems:'center', gap: 3, marginTop:1 }}>
            <span style={{ fontSize:FS.micro, color:fColor, fontWeight:700 }}>{FRM_SHORT[frm]||frm}</span>
            {frm2Color && (
              <span style={{ fontSize:7, fontWeight:800, color:frm2Color, border:`1px solid ${frm2Color}40`, borderRadius:2, padding:'0 2px', background:`${frm2Color}10` }}>+1</span>
            )}
          </div>
        )}
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:SP[2] }}>
        <span style={{ fontSize:FS.xs, fontFamily:S.mono, color:'rgba(255,255,255,0.8)' }}>{fmtPrc(pr)}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:SP[2] }}>
        <span style={{ fontSize:FS.xs, fontWeight:700, fontFamily:S.mono, color:pos?S.positive:S.negative }}>{fmtPct(chg)}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:SP[1] }}>
        <HistoricalBand cal={getMLCal(item)} size="sm" />
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:SP[2] }}>
        <QrsDisplay q={qrs} size={FS.xs} />
      </div>
    </div>
  );
}

// EMA/hacim yardımcı chip
function SuppChip({ label, value, color }) {
  return (
    <div style={{ flex: 1, padding: `${SP[2]}px ${SP[3]}px`, border: `1px solid ${S.border0}`, background: 'rgba(255,255,255,0.015)', borderRadius: 3, minWidth: 0 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)', marginBottom: SP[1] }}>{label}</div>
      <div style={{ fontSize: FS.xl, fontWeight: 900, fontFamily: S.mono, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── φ Sidebar — AppSidebar shared bileşeni kullanılır ────────────────────────
const _PHI_SIDEBAR_PLACEHOLDER = null; // Silme işareti — aşağıda AppSidebar import'u kullanılır
const PHI_NAV = [
  { name: 'Terminal', href: '/terminal',  Icon: LayoutDashboard, color: '#22d3ee' },
  { name: 'Portföy',  href: '/portfolio', Icon: Wallet,          color: '#34d399' },
  { name: 'Piyasa',   href: '/market',    Icon: BarChart2,       color: '#a78bfa' },
  { name: 'Haberler', href: '/news',      Icon: Newspaper,       color: '#60a5fa' },
  { name: 'Backtest', href: '/backtest',  Icon: Activity,        color: '#fbbf24' },
  { name: 'Araçlar',  href: '/tools',     Icon: Wrench,          color: '#34d399' },
  { name: 'Loglar',   href: '/logs',      Icon: Terminal,        color: '#a855f7' },
];

function PhiNavItem({ href, Icon, label, color, expanded, badge }) {
  const [hov, setHov] = useState(false);
  return (
    <NavLink
      to={href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'block', textDecoration: 'none', marginBottom: 2 }}
    >
      {({ isActive }) => (
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 6, height: 36, borderRadius: 6,
          padding: '0 6px',
          justifyContent: expanded ? 'flex-start' : 'center',
          background: isActive
            ? `linear-gradient(90deg, ${color}20 0%, ${color}08 100%)`
            : hov ? 'rgba(255,255,255,0.05)' : 'transparent',
          boxShadow: isActive ? `inset 0 0 0 1px ${color}20` : 'none',
          position: 'relative', cursor: 'pointer',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          {/* Active glow bar */}
          <div style={{
            position: 'absolute', left: 0, top: '15%', height: '70%', width: 2,
            background: isActive ? color : 'transparent',
            borderRadius: '0 2px 2px 0',
            boxShadow: isActive ? `0 0 8px ${color}` : 'none',
            transition: 'all 0.15s ease',
          }} />
          {/* Icon */}
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isActive ? `${color}22` : hov ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isActive ? color + '40' : hov ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
            boxShadow: isActive ? `0 0 10px ${color}25` : 'none',
            transition: 'all 0.15s ease',
          }}>
            <Icon size={13} strokeWidth={isActive ? 2.5 : 2} style={{
              color: isActive ? color : hov ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
              filter: isActive ? `drop-shadow(0 0 4px ${color})` : 'none',
              transition: 'all 0.15s ease',
            }} />
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

function PhiSupportLink({ to, label, expanded, children }) {
  const [hov, setHov] = useState(false);
  return (
    <NavLink to={to} title={label} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24, padding: expanded ? '0 6px' : '0 4px', borderRadius: 6, background: isActive ? 'rgba(34,211,238,0.08)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent', color: isActive ? '#22d3ee' : hov ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)', transition: 'all 0.15s' }}>
          {children}
          {expanded && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</span>}
        </div>
      )}
    </NavLink>
  );
}

function PhiSidebar({ pinned, setPinned, user }) {
  const [hovered, setHovered] = useState(false);
  const [logoutHov, setLogoutHov] = useState(false);
  const [profileHov, setProfileHov] = useState(false);
  const [pinHov, setPinHov] = useState(false);
  const expanded = pinned || hovered;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-ctx="sidebar"
      style={{
        width: expanded ? H.sidebarE : H.sidebarC,
        flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: '#060810',
        borderRight: `1px solid rgba(255,255,255,0.07)`,
        transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden', position: 'relative', zIndex: 10,
      }}
    >
      {/* Top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${S.primary}50, transparent)`, pointerEvents: 'none' }} />

      {/* Logo */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center',
        justifyContent: expanded ? 'flex-start' : 'center',
        padding: expanded ? '0 12px' : 0,
        borderBottom: `1px solid rgba(255,255,255,0.05)`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, gap: 0 }}>
          {/* Icon: transitions between boxed (collapsed) and plain (expanded) */}
          <div style={{
            flexShrink: 0,
            width: expanded ? 36 : 46,
            height: expanded ? 36 : 46,
            background: expanded ? 'transparent' : 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
            borderRadius: expanded ? 0 : 12,
            border: `1px solid ${expanded ? 'transparent' : 'rgba(34,211,238,0.25)'}`,
            boxShadow: expanded ? 'none' : '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1), height 0.2s cubic-bezier(0.4,0,0.2,1), background 0.2s, border-color 0.2s, border-radius 0.2s, box-shadow 0.2s',
          }}>
            <div style={{
              width: expanded ? '100%' : '72%',
              height: expanded ? '100%' : '72%',
              transform: 'skewX(-10deg) translateX(2px)',
              filter: expanded ? 'drop-shadow(0 0 8px #22d3ee99)' : 'drop-shadow(0 0 5px #22d3eeaa)',
              transition: 'width 0.2s, height 0.2s',
            }}>
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
                <defs>
                  <linearGradient id="phiLG" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a5f3fc" />
                    <stop offset="50%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#0891b2" />
                  </linearGradient>
                </defs>
                <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#phiLG)" />
                <rect x="32" y="10" width="4" height="20" rx="2" fill="url(#phiLG)" />
                <rect x="32" y="70" width="4" height="20" rx="2" fill="url(#phiLG)" />
                <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#phiLG)" strokeWidth="14" strokeLinecap="round" fill="none" />
              </svg>
            </div>
          </div>
          {/* Text: HTML span — AppLayout ile birebir aynı render */}
          <div style={{
            display: 'flex', alignItems: 'baseline',
            transform: 'skewX(-10deg)',
            lineHeight: 1, whiteSpace: 'nowrap',
            marginTop: 5,
            marginLeft: expanded ? 8 : 0,
            maxWidth: expanded ? 200 : 0,
            overflow: 'hidden',
            opacity: expanded ? 1 : 0,
            flexShrink: 0,
            transition: 'max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.18s, margin-left 0.22s',
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.01em' }}>PIVOT</span>
            <span style={{ fontSize: 16, fontWeight: 300, color: '#94a3b8', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.01em' }}>RADAR</span>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px #22d3ee, 0 0 16px #22d3ee', marginLeft: 4, marginBottom: 8, flexShrink: 0 }} />
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
        {expanded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 6px 4px' }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.16)', textTransform: 'uppercase' }}>ANA MENÜ</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.07), transparent)' }} />
          </div>
        )}
        {!expanded && <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '6px 4px' }} />}

        {PHI_NAV.map(({ name, href, Icon, color }) => (
          <PhiNavItem key={href} href={href} Icon={Icon} label={name} color={color} expanded={expanded} />
        ))}

        {user?.is_superuser && (
          <>
            {expanded ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 6px 4px' }}>
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.16)', textTransform: 'uppercase' }}>ARAÇLAR</span>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.07), transparent)' }} />
              </div>
            ) : (
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '6px 4px' }} />
            )}
            <PhiNavItem href="/testterminal" Icon={FlaskConical} label="φ Test" color={S.amber} expanded={expanded} badge="AKTİF" />
            <PhiNavItem href="/admin" Icon={ShieldCheck} label="Admin" color={S.purple} expanded={expanded} />
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid rgba(255,255,255,0.05)`, background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
        {user && (
          <NavLink
            to="/profile"
            onMouseEnter={() => setProfileHov(true)}
            onMouseLeave={() => setProfileHov(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', textDecoration: 'none', transition: 'background 0.15s', background: profileHov ? 'rgba(255,255,255,0.04)' : 'transparent' }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(153,247,255,0.18), rgba(153,247,255,0.04))',
              border: `1px solid ${profileHov ? 'rgba(153,247,255,0.35)' : 'rgba(153,247,255,0.18)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', transition: 'border-color 0.15s',
            }}>
              {user?.profile_picture
                ? <img src={user.profile_picture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 14, height: 14 }}>
                    <defs><linearGradient id="phiAv" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a5f3fc"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
                    <g transform="skewX(-8) translate(8,0)">
                      <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#phiAv)"/>
                      <rect x="32" y="10" width="4" height="20" rx="2" fill="url(#phiAv)"/>
                      <rect x="32" y="70" width="4" height="20" rx="2" fill="url(#phiAv)"/>
                      <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#phiAv)" strokeWidth="14" strokeLinecap="round" fill="none"/>
                    </g>
                  </svg>
              }
            </div>
            <div style={{ overflow: 'hidden', maxWidth: expanded ? 120 : 0, opacity: expanded ? 1 : 0, transition: 'max-width 0.2s cubic-bezier(0.4,0,0.2,1), opacity 0.18s', flexShrink: 0 }}>
              <div style={{ fontSize: FS.tiny, fontWeight: 700, color: profileHov ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em', transition: 'color 0.15s' }}>
                {user.username || user.email?.split('@')[0] || 'Kullanıcı'}
              </div>
              <div style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>
                {user.email || ''}
              </div>
            </div>
          </NavLink>
        )}

        {/* Footer: 2×2 grid */}
        {expanded && (() => {
          const btnBase = {
            flex: 1, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 5, border: `1px solid ${S.border0}`, borderRadius: SP[2], cursor: 'pointer',
            fontSize: FS.micro, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'transparent', color: 'rgba(255,255,255,0.3)', transition: 'all 0.15s',
            textDecoration: 'none', whiteSpace: 'nowrap',
          };
          const pinLabel = pinned ? 'ÇIKART' : 'İĞNELE';
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '6px 10px 8px' }}>
              {/* Row 1 */}
              <NavLink to="/help" style={{ ...btnBase, ':hover': {} }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.3)'; }}>
                <HelpCircle size={10} /> YARDIM
              </NavLink>
              <NavLink to="/support" style={{ ...btnBase }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.3)'; }}>
                <MessageCircle size={10} /> DESTEK
              </NavLink>

              {/* Row 2 */}
              <button
                onClick={() => {
                  const next = !pinned;
                  try { localStorage.setItem('psp', next ? '1' : '0'); } catch {}
                  try { const d = new Date(); d.setFullYear(d.getFullYear()+1); document.cookie=`psp=${next?'1':'0'}; path=/; expires=${d.toUTCString()}; SameSite=Lax`; } catch {}
                  setPinned(next);
                }}
                style={{ ...btnBase, color: pinned ? S.primary : 'rgba(255,255,255,0.3)', border: `1px solid ${pinned ? 'rgba(153,247,255,0.25)' : S.border0}`, background: pinned ? 'rgba(153,247,255,0.06)' : 'transparent' }}
                onMouseEnter={e => { if (!pinned) { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; } }}
                onMouseLeave={e => { if (!pinned) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.3)'; } }}
              >
                <Pin size={10} style={{ transform: pinned ? 'none' : 'rotate(45deg)', transition: 'transform 0.15s' }} /> {pinLabel}
              </button>

              {user
                ? <button
                    onClick={() => { useAuthStore.getState().logout(); window.location.href='/login'; }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,0.08)'; e.currentTarget.style.color='#f87171'; e.currentTarget.style.borderColor='rgba(248,113,113,0.25)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor=S.border0; }}
                    style={{ ...btnBase }}>
                    <LogOut size={10} /> ÇIKIŞ
                  </button>
                : <NavLink to="/login" style={{ ...btnBase }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(34,211,238,0.06)'; e.currentTarget.style.color='#22d3ee'; e.currentTarget.style.borderColor='rgba(34,211,238,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor=S.border0; }}>
                    <LogIn size={10} /> GİRİŞ
                  </NavLink>
              }
            </div>
          );
        })()}
      </div>
    </div>
  );
}


// ── Sinyal paneli ─────────────────────────────────────────────────────────────
function SignalsPanel({ items, onSelect }) {
  const selectedSymbol = useScanStore(s => s.selectedSymbol);
  const isAnalyzing    = useScanStore(s => s.isAnalyzing);
  const top20 = useMemo(() => [...items].slice(0, 20), [items]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(255,255,255,0.01)', border: `1px solid ${S.border0}`, borderRadius: 3, minHeight: 0 }}>
      {/* Progress bar */}
      <div style={{ height: 1, flexShrink: 0, background: 'transparent', overflow: 'hidden' }}>
        {isAnalyzing && items.length > 0 && (
          <div style={{ height: '100%', background: `linear-gradient(90deg, transparent 0%, rgba(153,247,255,0.5) 40%, rgba(153,247,255,0.5) 60%, transparent 100%)`, animation: 'indeterminate 1.6s ease-in-out infinite', backgroundSize: '50% 100%' }} />
        )}
      </div>

      {/* Başlık */}
      <div style={{ height: H.cardHdr, display: 'flex', alignItems: 'center', paddingLeft: SP[3], paddingRight: SP[2], borderBottom: `1px solid ${S.border0}`, flexShrink: 0, gap: SP[2] }}>
        <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>Öne Çıkanlar</span>
        {items.length > 0 && (
          <span style={{ fontSize: FS.micro, fontWeight: 900, fontFamily: S.mono, color: 'rgba(153,247,255,0.6)', background: 'rgba(153,247,255,0.07)', border: '1px solid rgba(153,247,255,0.15)', borderRadius: 2, padding: '0 4px' }}>
            {items.length}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: SP[3] }}>
          <Tip text={'Tarihsel Gerçekleşme — Bu gösterge örüntüsüne sahip sinyallerin geçmişteki hareket gerçekleşme oranı. Yatırım tavsiyesi değildir.'} pos="bottom" width={200}>
            <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', width: 32, textAlign: 'right', borderBottom: '1px dashed rgba(255,255,255,0.1)', cursor: 'default' }}>HAR</span>
          </Tip>
          <Tip text={'Quantitative Ranking Score — Teknik göstergeler, hacim ve momentum\'un ağırlıklı birleşimi.\n\n85+  Güçlü sinyal\n70–85  İyi sinyal\n50–70  Zayıf\n50 altı  Düşük\n\nYatırım tavsiyesi değildir.'} pos="bottom" width={210}>
            <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', width: 28, textAlign: 'right', borderBottom: '1px dashed rgba(255,255,255,0.1)', cursor: 'default' }}>QRS</span>
          </Tip>
          <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', width: 14 }}>F</span>
        </div>
      </div>

      {/* Sinyal listesi */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="custom-scrollbar">
        {top20.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: FS.micro, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.08)' }}>Veri bekleniyor</div>
        ) : top20.map((item, i) => {
          const sym    = getSym(item);
          const chg    = getChg(item);
          const pr     = getPrice(item);
          const qrs    = getQRS(item);
          const ml     = getML(item);
          const frm    = getFrm(item);
          const frm2   = getFrm2(item);
          const fColor = frm ? (FRM_COLOR[frm] || '#94a3b8') : null;
          const frm2Color = frm2 ? (FRM_COLOR[frm2] || '#94a3b8') : null;
          const fShort = frm && frm !== 'Formasyon Yok' ? FRM_SHORT[frm] : null;
          const pos    = Number(chg) >= 0;
          const isSel  = selectedSymbol === sym;
          const chgNum = Number(chg);
          const TrendIcon = chgNum > 0.5 ? TrendingUp : chgNum < -0.5 ? TrendingDown : Minus;
          const trendClr  = chgNum > 0.5 ? S.positive  : chgNum < -0.5 ? S.negative  : 'rgba(255,255,255,0.2)';

          return (
            <div
              key={sym}
              onClick={() => onSelect(sym, item)}
              style={{
                display: 'flex', alignItems: 'center', gap: SP[2],
                height: H.sigRow, paddingLeft: SP[2], paddingRight: SP[2],
                borderBottom: `1px solid rgba(255,255,255,0.02)`,
                borderLeft: `2px solid ${isSel ? S.primary : 'transparent'}`,
                background: isSel ? 'rgba(153,247,255,0.03)' : 'transparent',
                cursor: 'pointer', transition: 'background 0.08s', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
            >
              <TrendIcon size={11} style={{ color: trendClr, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 48, overflow: 'hidden' }}>
                <span style={{ fontSize: FS.sm, fontWeight: 900, color: '#fff', fontFamily: S.mono, whiteSpace: 'nowrap' }}>{sym}</span>
                <span style={{ fontSize: FS.micro, fontFamily: S.mono, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>{fmtPrc(pr)}</span>
              </div>
              <span style={{ fontSize: FS.xs, fontWeight: 800, color: pos ? S.positive : S.negative, fontFamily: S.mono, marginLeft: 'auto', flexShrink: 0 }}>{fmtPct(chg)}</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: 32, flexShrink: 0 }}>
                <HistoricalBand cal={getMLCal(item)} size="sm" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, width: 28, flexShrink: 0 }}>
                <QrsDisplay q={qrs} size={FS.micro} />
                <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                  <div style={{ width: `${Math.min(qrs, 100)}%`, height: '100%', background: colQRS(qrs), borderRadius: 1 }} />
                </div>
              </div>
              {/* F kolonu: birincil + ikincil formasyon noktaları */}
              <div style={{ width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0 }}>
                {fColor && (
                  <Tip text={fShort || ''} pos="left" width={120}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: fColor, boxShadow: `0 0 4px ${fColor}80` }} />
                  </Tip>
                )}
                {frm2Color && (
                  <Tip text={FRM_SHORT[frm2] || frm2 || ''} pos="left" width={120}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: frm2Color, opacity: 0.65 }} />
                  </Tip>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── Takip listesi paneli ──────────────────────────────────────────────────────
function WatchlistPanel({ allItems, onSelect }) {
  const watchlist    = useScanStore(s => s.watchlist);
  const toggleWatch  = useScanStore(s => s.toggleWatchlist);
  const selectedSymbol = useScanStore(s => s.selectedSymbol);

  const itemMap = useMemo(() => {
    const m = {};
    (allItems || []).forEach(it => {
      const s = getSym(it);
      if (s) m[s] = it;
    });
    return m;
  }, [allItems]);

  if (!watchlist.length) return null;

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'rgba(251,191,36,0.02)', border: `1px solid rgba(251,191,36,0.1)`, borderRadius: 3 }}>
      {/* Başlık */}
      <div style={{ height: H.cardHdr, display: 'flex', alignItems: 'center', paddingLeft: SP[3], paddingRight: SP[2], borderBottom: `1px solid rgba(251,191,36,0.08)`, flexShrink: 0, gap: SP[2] }}>
        <Star size={9} style={{ color: '#fbbf24', fill: '#fbbf24', flexShrink: 0 }} />
        <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.1em', color: 'rgba(251,191,36,0.7)', textTransform: 'uppercase', flexShrink: 0 }}>Takip</span>
        <span style={{ fontSize: FS.micro, fontWeight: 900, fontFamily: S.mono, color: 'rgba(251,191,36,0.5)', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 2, padding: '0 4px' }}>
          {watchlist.length}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: SP[3] }}>
          <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', width: 32, textAlign: 'right' }}>ML</span>
          <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', width: 28, textAlign: 'right' }}>QRS</span>
        </div>
      </div>

      {/* Satırlar */}
      {watchlist.map(sym => {
        const item  = itemMap[sym];
        const chg   = item ? getChg(item) : null;
        const pr    = item ? getPrice(item) : null;
        const ml    = item ? getML(item) : null;
        const qrs   = item ? getQRS(item) : null;
        const pos   = chg != null ? Number(chg) >= 0 : null;
        const isSel = selectedSymbol === sym;
        return (
          <div
            key={sym}
            onClick={() => item && onSelect(sym, item)}
            style={{
              display: 'flex', alignItems: 'center', gap: SP[2],
              height: H.sigRow, paddingLeft: SP[2], paddingRight: SP[2],
              borderBottom: `1px solid rgba(255,255,255,0.02)`,
              borderLeft: `2px solid ${isSel ? '#fbbf24' : 'transparent'}`,
              background: isSel ? 'rgba(251,191,36,0.04)' : 'transparent',
              cursor: item ? 'pointer' : 'default', transition: 'background 0.08s',
            }}
            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Yıldız — kaldır */}
            <button
              onClick={e => { e.stopPropagation(); toggleWatch(sym); }}
              title="Takipten çıkar"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <Star size={8} style={{ color: '#fbbf24', fill: '#fbbf24' }} />
            </button>
            {/* Symbol + fiyat */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 44, overflow: 'hidden' }}>
              <span style={{ fontSize: FS.sm, fontWeight: 900, color: '#fff', fontFamily: S.mono, whiteSpace: 'nowrap' }}>{sym}</span>
              {pr != null && <span style={{ fontSize: FS.micro, fontFamily: S.mono, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>{fmtPrc(pr)}</span>}
            </div>
            {/* Değişim */}
            {chg != null
              ? <span style={{ fontSize: FS.xs, fontWeight: 800, color: pos ? S.positive : S.negative, fontFamily: S.mono, marginLeft: 'auto', flexShrink: 0 }}>{fmtPct(chg)}</span>
              : <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.15)', marginLeft: 'auto', flexShrink: 0 }}>—</span>
            }
            {/* ML */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, width: 32, flexShrink: 0 }}>
              {ml != null
                ? <><span style={{ fontSize: FS.micro, fontWeight: 700, fontFamily: S.mono, color: colML(ml) }}>{fmtN(ml)}</span>
                    <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                      <div style={{ width: `${Math.min(ml, 100)}%`, height: '100%', background: colML(ml), borderRadius: 1 }} />
                    </div></>
                : <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.12)' }}>—</span>
              }
            </div>
            {/* QRS */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, width: 28, flexShrink: 0 }}>
              {qrs != null
                ? <><QrsDisplay q={qrs} size={FS.micro} />
                    <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                      <div style={{ width: `${Math.min(qrs, 100)}%`, height: '100%', background: colQRS(qrs), borderRadius: 1 }} />
                    </div></>
                : <span style={{ fontSize: FS.micro, color: 'rgba(255,255,255,0.12)' }}>—</span>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Piyasa özeti paneli ────────────────────────────────────────────────────────
function MarketSummary({ items }) {
  const frmStats = useMemo(() => {
    const counts = {};
    items.forEach(item => {
      const f = getFrm(item);
      if (f && f !== 'Formasyon Yok') counts[f] = (counts[f] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [items]);

  const mktStats = useMemo(() => {
    if (!items.length) return null;
    const up   = items.filter(i => Number(getChg(i)) > 0).length;
    const down = items.filter(i => Number(getChg(i)) < 0).length;
    const flat = items.length - up - down;
    const avgQrs = items.reduce((s, i) => s + getQRS(i), 0) / items.length;
    const avgMl  = items.reduce((s, i) => s + getML(i),  0) / items.length;
    const avgRsi = items.reduce((s, i) => s + getRSI(i), 0) / items.length;
    const bullRatio = items.length > 0 ? up / items.length : 0;
    const sentiment = bullRatio >= 0.6 ? 'YÜKSELIŞ' : bullRatio <= 0.4 ? 'DÜŞÜŞ' : 'KARMA';
    const sentimentColor = bullRatio >= 0.6 ? S.positive : bullRatio <= 0.4 ? S.negative : S.amber;
    return { up, down, flat, avgQrs, avgMl, avgRsi, bullRatio, sentiment, sentimentColor };
  }, [items]);

  if (!mktStats) return null;
  const { up, down, flat, avgQrs, avgMl, avgRsi, bullRatio, sentiment, sentimentColor } = mktStats;
  const total = up + down + flat;
  const maxFrm = frmStats[0]?.[1] || 1;

  return (
    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: SP[2] }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.13)' }}>Piyasa Özeti</span>
        <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.1em', color: sentimentColor, opacity: 0.85 }}>{sentiment}</span>
      </div>

      {/* ── Yükselen / Düşen breadth ── */}
      <div style={{ background: 'rgba(255,255,255,0.015)', border: `1px solid ${S.border0}`, borderRadius: 4, padding: `${SP[2]}px ${SP[2]}px ${SP[1]}px` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
            <span style={{ fontSize: FS.md, fontWeight: 900, fontFamily: S.mono, color: S.positive, lineHeight: 1 }}>{up}</span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(52,211,153,0.5)', textTransform: 'uppercase' }}>Yükselen</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            {flat > 0 && <span style={{ fontSize: 9, fontWeight: 700, fontFamily: S.mono, color: 'rgba(255,255,255,0.2)' }}>{flat}</span>}
            <span style={{ fontSize: 7, fontWeight: 600, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.06em' }}>NÖTR</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <span style={{ fontSize: FS.md, fontWeight: 900, fontFamily: S.mono, color: S.negative, lineHeight: 1 }}>{down}</span>
            <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(248,113,113,0.5)', textTransform: 'uppercase' }}>Düşen</span>
          </div>
        </div>
        {/* Ratio bar */}
        <div style={{ height: 3, borderRadius: 2, background: 'rgba(248,113,113,0.2)', overflow: 'hidden' }}>
          <div style={{ width: `${bullRatio * 100}%`, height: '100%', background: `linear-gradient(90deg, rgba(52,211,153,0.4), rgba(52,211,153,0.85))`, borderRadius: 2, transition: 'width 0.6s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 7, fontFamily: S.mono, color: 'rgba(52,211,153,0.4)' }}>{Math.round(bullRatio * 100)}%</span>
          <span style={{ fontSize: 7, fontFamily: S.mono, color: 'rgba(255,255,255,0.15)' }}>{total} hisse</span>
          <span style={{ fontSize: 7, fontFamily: S.mono, color: 'rgba(248,113,113,0.4)' }}>{Math.round((1 - bullRatio) * 100)}%</span>
        </div>
      </div>

      {/* ── Skor metrikleri ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SP[1] }}>
        {[
          { label: 'ORT QRS', value: fmtN(avgQrs), color: colQRS(avgQrs), pct: avgQrs / 100, accent: 'rgba(153,247,255,0.15)' },
          { label: 'ORT ML',  value: fmtN(avgMl),  color: colML(avgMl),   pct: avgMl  / 100, accent: 'rgba(52,211,153,0.15)' },
          { label: 'ORT RSI', value: fmtN(avgRsi), color: colRSI(avgRsi), pct: avgRsi / 100, accent: 'rgba(251,191,36,0.12)' },
        ].map(m => (
          <div key={m.label} style={{ position: 'relative', textAlign: 'center', padding: `5px ${SP[1]}px`, background: 'rgba(255,255,255,0.018)', border: `1px solid ${S.border0}`, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: `${m.pct * 100}%`, height: 2, background: m.color, opacity: 0.4, borderRadius: '0 1px 0 0', transition: 'width 0.6s ease' }} />
            <div style={{ fontSize: FS.xs, fontWeight: 900, fontFamily: S.mono, color: m.color, lineHeight: 1, marginBottom: 3 }}>{m.value}</div>
            <div style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* ── Formasyonlar ── */}
      {frmStats.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.012)', border: `1px solid ${S.border0}`, borderRadius: 4, padding: `${SP[2]}px` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP[2] }}>
            <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.11)' }}>Formasyonlar</span>
            <span style={{ fontSize: 8, fontFamily: S.mono, color: 'rgba(255,255,255,0.15)' }}>{frmStats.reduce((s,[,c])=>s+c,0)} tespit</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {frmStats.map(([f, cnt]) => {
              const clr = FRM_COLOR[f] || '#94a3b8';
              const barW = cnt / maxFrm;
              return (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: SP[1] }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: clr, flexShrink: 0, opacity: 0.8 }} />
                  <span style={{ fontSize: 8, fontWeight: 800, color: clr, letterSpacing: '0.04em', flexShrink: 0, width: 52, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{FRM_SHORT[f] || f}</span>
                  <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ width: `${barW * 100}%`, height: '100%', background: clr, opacity: 0.55, borderRadius: 1, transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 8, fontWeight: 900, fontFamily: S.mono, color: 'rgba(255,255,255,0.4)', flexShrink: 0, width: 14, textAlign: 'right' }}>{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ana sayfa bileşeni ─────────────────────────────────────────────────────────
export default function TestTerminalPage() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();

  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isGuest         = useAuthStore(s => s.isGuest);
  const user            = useAuthStore(s => s.user);
  const actualIsGuest   = isGuest || !isAuthenticated;

  const results         = useScanStore(s => s.results);
  const isAnalyzing     = useScanStore(s => s.isAnalyzing);
  const analyzeProgress = useScanStore(s => s.analyzeProgress);
  const profile         = useScanStore(s => s.profile);
  const setProfile      = useScanStore(s => s.setProfile);
  const topN            = useScanStore(s => s.topN);
  const selectedSymbol  = useScanStore(s => s.selectedSymbol);
  const selectedItem    = useScanStore(s => s.selectedItem);
  const selectSymbol    = useScanStore(s => s.selectSymbol);
  const lastAnalyzeTs   = useScanStore(s => s.lastAnalyzeTs);
  const mlTrainedAt     = useScanStore(s => s.mlTrainedAt);
  const watchlist       = useScanStore(s => s.watchlist);
  const toggleWatchlist = useScanStore(s => s.toggleWatchlist);

  const { isMobile, isTablet } = useBreakpoint();
  const [dynamicProfiles, setDynamicProfiles] = useState(DEFAULT_PROFILES);
  const [searchQuery,     setSearchQuery]     = useState('');
  const [formationFilter, setFormationFilter] = useState(null);
  const [qrsFilter,       setQrsFilter]       = useState(false);
  const [katilimFilter,   setKatilimFilter]   = useState(false);
  const [sortKey,         setSortKey]         = useState('qrs');
  const [sortDir,         setSortDir]         = useState('desc');
  const [page,            setPage]            = useState(1);
  const [sidebarPinned,   setSidebarPinned]   = useState(() => {
    try { return localStorage.getItem('psp') === '1'; } catch { return false; }
  });
  const [mobileTab,       setMobileTab]       = useState('chart'); // 'chart' | 'table'
  const [initSplash,      setInitSplash]      = useState(true);
  const [ctxMenu,         setCtxMenu]         = useState(null); // { x, y, item }
  const [showShortcuts,   setShowShortcuts]   = useState(false);
  const [showKbdHint,     setShowKbdHint]     = useState(() => {
    try { return !localStorage.getItem('pr_kbd_hint_seen'); } catch { return false; }
  });

  useEffect(() => {
    const tid = setTimeout(() => setInitSplash(false), 1200);
    return () => clearTimeout(tid);
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = e => { if (e.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [ctxMenu]);

  // First-visit kbd hint — 5 saniye sonra otomatik kapan
  useEffect(() => {
    if (!showKbdHint) return;
    const tid = setTimeout(() => {
      setShowKbdHint(false);
      try { localStorage.setItem('pr_kbd_hint_seen', '1'); } catch {}
    }, 5000);
    return () => clearTimeout(tid);
  }, [showKbdHint]);

  // Global klavye kısayolları
  useEffect(() => {
    const PERIODS = ['1S','6S','1G','1H','1A','3A'];
    const KBD_CHART_TYPES = ['candle','ohlc','ha','hollow','line','area'];

    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true';

      // ? her zaman çalışır
      if (e.key === '?') { setShowShortcuts(v => !v); return; }

      // Escape — öncelik sırasıyla kapat
      if (e.key === 'Escape') {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (ctxMenu) { setCtxMenu(null); return; }
        return; // search temizleme SymbolAutocomplete içinde hallediliyor
      }

      if (inInput) return; // input odağındayken aşağısı çalışmaz

      // Arama kutusuna odaklan
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('ticker-search')?.focus();
        return;
      }
      // Sayfayı yenile
      if (e.key === 'r' || e.key === 'R') { window.location.reload(); return; }
      // İzleme listesi toggle
      if ((e.key === 'w' || e.key === 'W') && selectedSymbol) {
        toggleWatchlist(selectedSymbol); return;
      }
      // Ticker kopyala
      if ((e.key === 'c' || e.key === 'C') && selectedSymbol) {
        navigator.clipboard?.writeText(selectedSymbol).catch(() => {}); return;
      }
      // Filtreler
      if (e.key === 'q' || e.key === 'Q') { setQrsFilter(v => !v); return; }
      if (e.key === 'k' || e.key === 'K') { setKatilimFilter(v => !v); return; }
      // Grafik türü döngüsü
      if (e.key === 't' || e.key === 'T') {
        const curr = useScanStore.getState().miniChartType || 'candle';
        const next = KBD_CHART_TYPES[(KBD_CHART_TYPES.indexOf(curr) + 1) % KBD_CHART_TYPES.length];
        useScanStore.getState().setMiniChartType(next); return;
      }
      // Periyot kısayolları 1-6
      if (e.key >= '1' && e.key <= '6') {
        const p = PERIODS[parseInt(e.key) - 1];
        if (p) useScanStore.getState().setMiniChartPeriod(p); return;
      }
      // Liste navigasyonu — store'dan anlık results al
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const allResults = useScanStore.getState().results || [];
        if (!allResults.length) return;
        const curSym = useScanStore.getState().selectedSymbol;
        const idx = allResults.findIndex(i => getSym(i) === curSym);
        const next = e.key === 'ArrowDown'
          ? Math.min(idx + 1, allResults.length - 1)
          : Math.max(idx - 1, 0);
        if (next !== idx) {
          const item = allResults[next];
          useScanStore.getState().selectSymbol(getSym(item), item);
          document.querySelector(`[data-symbol="${getSym(item)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showShortcuts, ctxMenu]);

  // Global right-click handler — context detected via data-ctx attributes
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      const x = e.clientX, y = e.clientY;
      const stockEl   = e.target.closest('[data-ctx="stock"]');
      const chartEl   = e.target.closest('[data-ctx="chart"]');
      const sidebarEl = e.target.closest('[data-ctx="sidebar"]');
      if (stockEl) {
        const sym = stockEl.dataset.symbol;
        const item = (results || []).find(r => getSym(r) === sym) ?? { symbol: sym };
        setCtxMenu({ type: 'stock', x, y, item });
      } else if (chartEl) {
        setCtxMenu({ type: 'chart', x, y, item: null });
      } else if (sidebarEl) {
        setCtxMenu({ type: 'sidebar', x, y, item: null });
      } else {
        setCtxMenu({ type: 'general', x, y, item: null });
      }
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, [results]);

  // Dinamik BIST şirket adları — BIST_NAMES'de olmayan semboller için (DOCO, FADE vb.)
  useEffect(() => {
    api.bistNames().then(map => {
      if (map && typeof map === 'object') _dynNames = map;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (results.length > 0) setInitSplash(false);
  }, [results]);

  useEffect(() => {
    api.profiles().then(rows => {
      const n = normaliseProfiles(rows, DEFAULT_PROFILES);
      if (n.length > 0) setDynamicProfiles(n);
    }).catch(() => {});
  }, []);


  const { checkLimit } = useGuestLimit(actualIsGuest);
  const { runAnalyze } = useAnalyze({ profile, topN, isAnalyzing, actualIsGuest, dynamicProfiles });
  const bistStatus     = useMarketStatus();

  const runAnalyzeWithGuestCheck = useCallback(async (profileOverride, isAuto = false) => {
    if (!isAuto && checkLimit()) return;
    return runAnalyze(profileOverride, isAuto);
  }, [checkLimit, runAnalyze]);

  useDataWatchdog(runAnalyzeWithGuestCheck);

  // Yeni tarama gelince grafiği de anında senkronize et
  const queryClient = useQueryClient();
  const prevAnalyzeTsRef = useRef(0);
  useEffect(() => {
    if (lastAnalyzeTs && lastAnalyzeTs !== prevAnalyzeTsRef.current) {
      prevAnalyzeTsRef.current = lastAnalyzeTs;
      queryClient.invalidateQueries({ queryKey: ['chart'] });
    }
  }, [lastAnalyzeTs, queryClient]);

  useEffect(() => {
    const s = useScanStore.getState();
    const stale = (Date.now() - (s.lastAnalyzeTs || 0)) > 5 * 60 * 1000;
    if ((!s.results?.length || stale) && !s.isAnalyzing) {
      runAnalyzeWithGuestCheck(null, true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Profil değişince listeyi o profilin sonuçlarıyla güncelle
  const prevProfileRef = useRef(null);
  useEffect(() => {
    if (prevProfileRef.current === null) { prevProfileRef.current = profile; return; }
    if (prevProfileRef.current === profile) return;
    prevProfileRef.current = profile;
    runAnalyzeWithGuestCheck(profile, false);
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL'den hisse seç
  useEffect(() => {
    if (!urlSymbol) return;
    const sym = urlSymbol.toUpperCase();

    const trySelect = (results) => {
      const found = results?.find(r => getSym(r) === sym);
      // Item null olursa DetailPanel sym = null → chart açılmaz; minimal stub kullan
      selectSymbol(sym, found ?? { symbol: sym });
    };

    const currentResults = useScanStore.getState().results;
    if (currentResults !== null) {
      // Sonuçlar zaten yüklü — listede olsa da olmasa da aç
      trySelect(currentResults);
      return;
    }
    // Sonuçlar henüz yüklenmedi — ilk yüklenişi bekle
    const unsub = useScanStore.subscribe(state => {
      if (state.results === null) return;
      trySelect(state.results);
      unsub();
    });
    return () => unsub();
  }, [urlSymbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hisse seçilince URL güncelle
  useEffect(() => {
    if (!selectedSymbol) return;
    const target = `/terminal/${selectedSymbol}`;
    if (window.location.pathname !== target) {
      navigate(target, { replace: true });
    }
  }, [selectedSymbol, navigate]);

  const handleSort = useCallback(key => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return prev; }
      setSortDir('desc');
      return key;
    });
  }, []);

  const scanSymbols = useMemo(() => {
    const seen = new Set();
    return (results || [])
      .map(i => getSym(i))
      .filter(sym => sym && !seen.has(sym) && seen.add(sym))
      .map(sym => ({ symbol: sym, name: BIST_NAMES[sym] || _dynNames[sym] || '' }));
  }, [results]);

  const displayResults = useMemo(() => {
    let arr = results || [];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      arr = arr.filter(i => getSym(i).toLowerCase().includes(q) || getCo(i).toLowerCase().includes(q));
    }
    if (formationFilter) arr = arr.filter(i => getFrm(i) === formationFilter);
    if (qrsFilter)       arr = arr.filter(i => getQRS(i) >= 70);
    if (katilimFilter) arr = arr.filter(i => KATILIM_SET.has(getSym(i)));
    const SORT_FNS = {
      symbol: i => getSym(i), price: i => getPrice(i), change: i => getChg(i),
      volume: i => getVol(i), rsi:   i => getRSI(i),   ml:     i => getML(i),
      qrs:    i => getQRS(i), formation: i => (getFrm(i) || '').toLowerCase(),
    };
    const fn = SORT_FNS[sortKey];
    if (fn) {
      arr = [...arr].sort((a, b) => {
        const va = fn(a), vb = fn(b);
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? va - vb : vb - va;
      });
    }
    return arr;
  }, [results, searchQuery, formationFilter, qrsFilter, katilimFilter, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [searchQuery, formationFilter, qrsFilter, katilimFilter, sortKey, sortDir]);

  const formationCounts = useMemo(() => {
    const counts = {};
    (results || []).forEach(item => {
      const f = getFrm(item);
      if (f && f !== 'Formasyon Yok') counts[f] = (counts[f] || 0) + 1;
    });
    return counts;
  }, [results]);

  useEffect(() => {
    if (displayResults.length > 0 && !useScanStore.getState().selectedSymbol) {
      selectSymbol(getSym(displayResults[0]), displayResults[0]);
    }
  }, [displayResults, selectedSymbol, selectSymbol]);

  // Sistem saati
  const [sysClock, setSysClock] = useState(() => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  useEffect(() => {
    const id = setInterval(() => setSysClock(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
    return () => clearInterval(id);
  }, []);

  // Tarama tamamlandı bildirimi
  const prevAnalyzing = useRef(false);
  useEffect(() => {
    if (prevAnalyzing.current && !isAnalyzing && (results || []).length > 0) {
      window.dispatchEvent(new CustomEvent('pr-notify', {
        detail: { message: `Tarama tamamlandı — ${(results).length} sonuç`, type: 'success', duration: 3000 }
      }));
    }
    prevAnalyzing.current = isAnalyzing;
  }, [isAnalyzing, results]);

  // Superuser guard kaldırıldı — TestTerminalPage artık ana terminal

  if (initSplash) return (
    <div style={{ position:'fixed', inset:0, background:'#05070a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
      <style>{`@keyframes ttSplashPulse{0%,100%{filter:drop-shadow(0 0 8px #22d3ee66)}50%{filter:drop-shadow(0 0 22px #22d3eecc)}}`}</style>
      <div style={{ display:'flex', alignItems:'center', gap:10, animation:'ttSplashPulse 1.8s ease-in-out infinite' }}>
        <div style={{ width:40, height:40, flexShrink:0, transform:'skewX(-10deg) translateX(3px)' }}>
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
            <defs><linearGradient id="ttSpG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#a5f3fc"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
            <rect x="25" y="25" width="18" height="50" rx="3" fill="url(#ttSpG)"/>
            <rect x="32" y="10" width="4" height="20" rx="2" fill="url(#ttSpG)"/>
            <rect x="32" y="70" width="4" height="20" rx="2" fill="url(#ttSpG)"/>
            <path d="M 40 32 C 85 28 85 68 40 68" stroke="url(#ttSpG)" strokeWidth="14" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div style={{ display:'flex', alignItems:'baseline', transform:'skewX(-10deg)', marginTop:3 }}>
          <span style={{ fontSize:22, fontWeight:700, color:'#ffffff', fontFamily:'Space Grotesk, sans-serif', letterSpacing:'0.01em', lineHeight:1 }}>PIVOT</span>
          <span style={{ fontSize:22, fontWeight:300, color:'#94a3b8', fontFamily:'Space Grotesk, sans-serif', letterSpacing:'0.01em', lineHeight:1 }}>RADAR </span>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#22d3ee', boxShadow:'0 0 10px #22d3ee, 0 0 20px #22d3ee', marginLeft:5, marginBottom:10, flexShrink:0 }}/>
        </div>
      </div>
    </div>
  );

  const lastTime      = lastAnalyzeTs
    ? new Date(lastAnalyzeTs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const mlDateLabel   = mlTrainedAt
    ? new Date(mlTrainedAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null;
  const totalPages    = Math.ceil(displayResults.length / PAGE_SIZE);
  const pageItems     = displayResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeProfile = dynamicProfiles.find(p => p.name === profile) || dynamicProfiles[0];

  // ── Tablo içeriği (desktop + mobile paylaşımlı) ──────────────────────────
  const tableContent = (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: S.bg0, border: `1px solid ${S.border0}`, borderRadius: isMobile ? 0 : 3, minHeight: isMobile ? 0 : 120 }}>
      {/* Profil yenilenirken ince progress bar */}
      <div style={{ height: 1, flexShrink: 0, background: 'transparent', overflow: 'hidden' }}>
        {isAnalyzing && pageItems.length > 0 && (
          <div style={{ height: '100%', background: `linear-gradient(90deg, transparent 0%, rgba(153,247,255,0.5) 40%, rgba(153,247,255,0.5) 60%, transparent 100%)`, animation: 'indeterminate 1.6s ease-in-out infinite', backgroundSize: '50% 100%' }} />
        )}
      </div>
      {!isMobile && <TableHeader sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
      {isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 58px 46px 58px', height: H.tableHdr, borderBottom: `1px solid ${S.border0}`, flexShrink: 0, background: S.bg0 }}>
          {[
            { l:'HİSSE', tip: undefined },
            { l:'FİYAT', tip: undefined },
            { l:'%DEĞ',  tip: undefined },
            { l:'HAR',   tip: 'Tarihsel Gerçekleşme — Bu gösterge örüntüsüne sahip sinyallerin geçmişteki hareket gerçekleşme oranı. Yatırım tavsiyesi değildir.' },
            { l:'QRS',   tip: 'Quantitative Ranking Score — Teknik göstergeler, hacim ve momentum\'un ağırlıklı birleşimi. 85+ güçlü, 70–85 iyi, 50–70 zayıf. Yatırım tavsiyesi değildir.' },
          ].map(({ l, tip }, i) => (
            <div key={l} title={tip} style={{ display:'flex', alignItems:'center', justifyContent: i===0?'flex-start':'flex-end', paddingLeft: i===0?SP[3]:0, paddingRight: i>0?SP[2]:0 }}>
              <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)', borderBottom: tip ? '1px dashed rgba(255,255,255,0.12)' : 'none' }}>{l}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: isMobile ? 64 : 0, WebkitOverflowScrolling: 'touch' }} className="custom-scrollbar">
        {pageItems.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: SP[2] }}>
            {isAnalyzing
              ? <><div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid rgba(153,247,255,0.07)`, borderTopColor: S.primary, animation: 'spin 0.7s linear infinite' }} /><span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.12)' }}>Yükleniyor</span></>
              : <span style={{ fontSize: FS.micro, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.1)' }}>{(results||[]).length===0?'Analiz bekleniyor...':'Filtre sonucu yok'}</span>
            }
          </div>
        ) : (
          pageItems.map(item => (
            isMobile
              ? <MobileStockRow key={getSym(item)} item={item} isSelected={selectedSymbol===getSym(item)} onSelect={(sym,it) => { selectSymbol(sym,it); setMobileTab('chart'); }} />
              : <StockRow key={getSym(item)} item={item} isSelected={selectedSymbol===getSym(item)} onSelect={selectSymbol} />
          ))
        )}
      </div>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );

  const seoName = selectedSymbol ? (BIST_NAMES[selectedSymbol] || selectedSymbol) : null;
  const seoTitle = seoName
    ? `${selectedSymbol} Hisse Analizi — ${seoName} | PivotRadar`
    : 'BIST Terminal — Yapay Zeka Destekli Hisse Analizi | PivotRadar';
  const seoDesc = seoName
    ? `${selectedSymbol} (${seoName}) hissesi için canlı teknik analiz, QRS skoru, ML tahminleri ve formasyon tespiti. PivotRadar ile anlık BIST verisi.`
    : 'BIST hisselerini yapay zeka ile analiz edin. QRS skorlama, ML tahminleri, formasyon tespiti ve canlı tarama. 500+ hisse için anlık teknik analiz.';

  return (
    <>
    <div style={{ display: 'flex', width: '100vw', height: isMobile ? 'calc(100dvh - 56px)' : '100dvh', background: S.bg1, overflow: 'hidden', color: '#fff', fontFamily: S.sans }}>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        {selectedSymbol && <link rel="canonical" href={`https://pivotradar.com/terminal/${selectedSymbol}`} />}
        {!selectedSymbol && <link rel="canonical" href="https://pivotradar.com/terminal" />}
        {selectedSymbol && <meta property="og:title" content={seoTitle} />}
        {selectedSymbol && <meta property="og:description" content={seoDesc} />}
      </Helmet>

      {/* ── Sidebar — AppSidebar shared bileşeni (AppLayout ile aynı) ───── */}
      {!isMobile && <AppSidebar user={user} extraItems={user?.is_superuser ? [{name:'φ Test', href:'/testterminal', Icon:FlaskConical, color:'#fbbf24'},{name:'Admin', href:'/admin', Icon:ShieldCheck, color:'#a855f7'}] : []} />}

      {/* ── Ana içerik ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ── Topbar ────────────────────────────────────────────────────── */}
        <div style={{ height: H.topbar, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0, paddingLeft: SP[3], paddingRight: SP[3], background: S.bg2, borderBottom: `1px solid ${S.border0}` }}>

          {/* Sol grup: BETA + BIST */}
          {!isMobile && (
            <div style={{ display:'flex', alignItems:'center', gap:SP[2], flexShrink:0, paddingRight:SP[3], borderRight:`1px solid ${S.border0}`, marginRight:SP[3] }}>
              <span style={{ fontSize:7, fontWeight:800, letterSpacing:'0.18em', color:'rgba(167,139,250,0.5)', textTransform:'uppercase', lineHeight:1 }}>BETA</span>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background: bistStatus.open?'#34d399':'#f87171', boxShadow: bistStatus.open?'0 0 5px #34d399':'none', flexShrink:0 }} />
                <span style={{ fontSize:FS.micro, fontWeight:700, letterSpacing:'0.1em', color: bistStatus.open?'rgba(52,211,153,0.65)':'rgba(248,113,113,0.65)', textTransform:'uppercase', whiteSpace:'nowrap' }}>BIST {bistStatus.label}</span>
              </div>
            </div>
          )}

          {/* Arama */}
          <div style={{ position:'relative', flexShrink:0, width: isMobile?140:188 }}>
            <Search size={10} style={{ position:'absolute', left:SP[2], top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.15)', pointerEvents:'none', zIndex:1 }} />
            <span style={{ position:'absolute', right:SP[1]+2, top:'50%', transform:'translateY(-50%)', fontSize:9, fontFamily:'monospace', fontWeight:700, color:'rgba(255,255,255,0.18)', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:3, padding:'1px 4px', lineHeight:1, pointerEvents:'none', zIndex:1 }}>/</span>
            <SymbolAutocomplete
              value={searchQuery}
              onChange={v => setSearchQuery(v)}
              onSelect={sym => {
                const item = (results || []).find(i => getSym(i) === sym);
                selectSymbol(sym, item ?? { symbol: sym });
                setSearchQuery('');
              }}
              placeholder="Hisse ara..."
              inputId="ticker-search"
              symbols={scanSymbols}
              inputStyle={{ width:'100%', paddingLeft:SP[3]+SP[2], paddingRight:SP[2], height:SP[5], borderRadius:3, border:`1px solid ${S.border0}`, background:'rgba(255,255,255,0.02)', fontSize:FS.xs, color:'rgba(255,255,255,0.6)', fontFamily:S.mono, outline:'none', boxSizing:'border-box' }}
            />
          </div>

          {/* Dikey ayraç */}
          <span style={{ width:1, height:16, background:S.border0, flexShrink:0, margin:`0 ${SP[2]}px` }} />

          {/* Filtreler — border'sız, hepsi aynı stil */}
          <div style={{ display:'flex', alignItems:'center', gap:0, flexShrink:0 }}>
            <ProfileDrop profiles={dynamicProfiles} active={profile} onChange={p => setProfile(p)} noBorder />
            {!isMobile && (
              <>
                <span style={{ width:1, height:14, background:S.border0, flexShrink:0 }} />
                <FormationDrop value={formationFilter} onChange={setFormationFilter} noBorder counts={formationCounts} />
                <span style={{ width:1, height:14, background:S.border0, flexShrink:0 }} />
                <button onClick={() => setQrsFilter(v => !v)} style={{ padding:`0 ${SP[2]}px`, height:SP[5], border:'none', background:'transparent', fontSize:FS.tiny, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:qrsFilter?S.primary:'rgba(255,255,255,0.25)', cursor:'pointer', whiteSpace:'nowrap', transition:'color 0.12s', display:'flex', alignItems:'center', gap:5 }}>
                  QRS 70+<span style={{ fontSize:8, fontFamily:'monospace', color:'rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:3, padding:'1px 3px', lineHeight:1 }}>Q</span>
                </button>
                <span style={{ width:1, height:14, background:S.border0, flexShrink:0 }} />
                <button onClick={() => setKatilimFilter(v => !v)} style={{ padding:`0 ${SP[2]}px`, height:SP[5], border:'none', background:'transparent', fontSize:FS.tiny, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:katilimFilter?'#fbbf24':'rgba(255,255,255,0.25)', cursor:'pointer', whiteSpace:'nowrap', transition:'color 0.12s', display:'flex', alignItems:'center', gap:5 }}>
                  KATILIM<span style={{ fontSize:8, fontFamily:'monospace', color:'rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:3, padding:'1px 3px', lineHeight:1 }}>K</span>
                </button>
              </>
            )}
          </div>

          {/* Dikey ayraç + sonuç sayısı */}
          <span style={{ width:1, height:16, background:S.border0, flexShrink:0, margin:`0 ${SP[2]}px` }} />
          {(() => {
            const rawTotal = (results||[]).length;
            const hasFilter = !!(searchQuery.trim()||formationFilter||qrsFilter||katilimFilter);
            const filtered  = displayResults.length;
            return (
              <span style={{ fontSize:FS.micro, fontFamily:S.mono, color:'rgba(255,255,255,0.2)', whiteSpace:'nowrap' }}>
                {hasFilter
                  ? <><span style={{ color:'rgba(255,255,255,0.5)', fontWeight:700 }}>{filtered}</span><span style={{ opacity:0.4 }}>/{rawTotal}</span></>
                  : filtered
                }
              </span>
            );
          })()}

          {/* Sağ: analiz + ML + saat */}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:SP[3], flexShrink:0 }}>
            {!isMobile && isAnalyzing && (
              <span style={{ fontSize:FS.micro, fontWeight:700, letterSpacing:'0.1em', color:S.primaryLo, textTransform:'uppercase', whiteSpace:'nowrap' }}>
                {analyzeProgress>0?`${Math.round(analyzeProgress)}%`:'···'}
              </span>
            )}
            {!isMobile && mlDateLabel && (
              <span title={`ML: ${mlTrainedAt}`} style={{ fontSize:FS.micro, fontFamily:S.mono, color:'rgba(255,255,255,0.1)', whiteSpace:'nowrap', letterSpacing:'0.04em' }}>ML {mlDateLabel}</span>
            )}
            {!isMobile && (
              <span style={{ fontSize:FS.xs, fontFamily:S.mono, color:'rgba(255,255,255,0.3)', letterSpacing:'0.08em', whiteSpace:'nowrap', userSelect:'none' }}>{sysClock}</span>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* MOBILE LAYOUT                                                  */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {isMobile ? (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
            {/* Tab bar */}
            <div style={{ display:'flex', flexShrink:0, background:S.bg0, borderBottom:`1px solid ${S.border1}` }}>
              {[
                { id:'chart', label:'GRAFİK', icon:'◈' },
                { id:'table', label:`LİSTE (${displayResults.length})`, icon:'≡' },
              ].map(tab => {
                const active = mobileTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setMobileTab(tab.id)} style={{ flex:1, height:40, border:'none', borderBottom:`2px solid ${active ? S.primary : 'transparent'}`, background: active ? 'rgba(153,247,255,0.03)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer', transition:'all 0.15s' }}>
                    <span style={{ fontSize:10, color: active ? S.primary : 'rgba(255,255,255,0.2)' }}>{tab.icon}</span>
                    <span style={{ fontSize:FS.micro, fontWeight:900, letterSpacing:'0.12em', color: active ? S.primary : 'rgba(255,255,255,0.28)' }}>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Tab içeriği */}
            <div style={{ flex:1, overflow:'hidden', minHeight:0, display:'flex', flexDirection:'column' }}>
              {mobileTab === 'chart' ? (
                <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                  <AnimatePresence mode="wait">
                    <motion.div key={selectedSymbol||'empty'} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.08}} style={{height:'100%'}}>
                      <DetailPanel item={selectedItem} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              ) : (
                tableContent
              )}
            </div>
          </div>
        ) : (
        /* ══════════════════════════════════════════════════════════════ */
        /* DESKTOP / TABLET LAYOUT                                        */
        /* ══════════════════════════════════════════════════════════════ */
          <div style={{ flex:1, display:'flex', gap:SP[1], padding:SP[1], overflow:'hidden', minHeight:0 }}>
            {/* SOL — chart + tablo */}
            <div style={{ flex:φ, display:'flex', flexDirection:'column', gap:SP[1], overflow:'hidden', minWidth:0 }}>
              {/* Chart */}
              <div style={{ flex:φ, display:'flex', flexDirection:'column', overflow:'hidden', background:S.bg2, border:`1px solid ${S.border0}`, borderRadius:3, minHeight:0 }}>
                <AnimatePresence mode="wait">
                  <motion.div key={selectedSymbol||'empty'} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.08}} style={{height:'100%'}}>
                    <DetailPanel item={selectedItem} />
                  </motion.div>
                </AnimatePresence>
              </div>
              {/* Tablo */}
              {tableContent}
            </div>
            {/* SAĞ — sinyaller + özet (tablet'te gizli) */}
            {!isTablet && (
              <div style={{ width:272, flexShrink:0, display:'flex', flexDirection:'column', gap:SP[1], overflow:'hidden' }}>
                <SignalsPanel items={results} onSelect={selectSymbol} />
                <WatchlistPanel allItems={results} onSelect={selectSymbol} />
                <MarketSummary items={displayResults} />
              </div>
            )}
          </div>
        )}

        {/* ── Ticker — sadece desktop ───────────────────────────────────── */}
        {!isMobile && (
          <div style={{ height:H.ticker, flexShrink:0, background:S.bg0, borderTop:`1px solid ${S.border0}`, overflow:'hidden' }}>
            <Suspense fallback={null}><Ticker /></Suspense>
          </div>
        )}
      </div>

      {/* ── Mobil alt navigasyon ──────────────────────────────────────── */}
      {isMobile && <MobileTerminalBottomNav />}

      <style>{`
        @keyframes spin          { to { transform: rotate(360deg); } }
        @keyframes pulse         { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes chartPulse    { 0%,100% { opacity: 0.25; } 50% { opacity: 0.6; } }
        @keyframes valueFlash    { 0% { opacity: 0.3; } 60% { opacity: 1; } 100% { opacity: 1; } }
        @keyframes indeterminate { 0% { background-position: -100% 0; } 100% { background-position: 200% 0; } }
        .custom-scrollbar::-webkit-scrollbar       { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(153,247,255,0.06); border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(153,247,255,0.14); }
      `}</style>
    </div>

    {/* Context menu — portal ile body'e render edilir */}
    {ctxMenu && (
      <AppContextMenu
        type={ctxMenu.type} x={ctxMenu.x} y={ctxMenu.y} item={ctxMenu.item}
        onClose={() => setCtxMenu(null)}
        watchlist={watchlist}
        onToggleWatch={toggleWatchlist}
        onNavigate={navigate}
      />
    )}

    {/* Klavye kısayolları overlay */}
    {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}

    {/* İlk ziyaret toast */}
    {showKbdHint && (
      <div style={{ position:'fixed', bottom:24, right:24, zIndex:9997, background:'rgba(13,17,23,0.96)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 8px 32px rgba(0,0,0,0.6)', userSelect:'none' }}>
        <Kbd>?</Kbd>
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>Klavye kısayolları için <span style={{ color:'rgba(255,255,255,0.65)', fontWeight:600 }}>? tuşuna</span> bas</span>
        <button onClick={() => { setShowKbdHint(false); try { localStorage.setItem('pr_kbd_hint_seen','1'); } catch {} }} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.2)', cursor:'pointer', fontSize:16, lineHeight:1, padding:'0 0 0 4px' }}>×</button>
      </div>
    )}
    </>
  );
}
