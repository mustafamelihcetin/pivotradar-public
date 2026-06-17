import React from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { ChevronRight, Globe, ShieldCheck, Mail, Zap } from 'lucide-react';

const SECTOR_GROUPS = [
  {
    name: 'Bankacılık & Finans',
    tickers: ['AKBNK', 'GARAN', 'ISCTR', 'YKBNK', 'HALKB', 'VAKBN', 'SAHOL', 'KCHOL', 'SKBNK', 'TSKB', 'ALBRK']
  },
  {
    name: 'Enerji & Sanayi',
    tickers: ['TUPRS', 'EREGL', 'KARDM', 'PETKM', 'SASA', 'HEKTS', 'ASTOR', 'KONTR', 'SMRTG', 'ALARK', 'ENKAI']
  },
  {
    name: 'Ulaşım & Teknoloji',
    tickers: ['THYAO', 'PGSUS', 'TCELL', 'TTKOM', 'ASELS', 'MIATK', 'SDTTR', 'DOCO', 'CLEBI', 'REEDER']
  },
  {
    name: 'Gıda & Perakende',
    tickers: ['BIMAS', 'MGROS', 'SOKM', 'AEFES', 'CCOLA', 'ULKER', 'TATGD', 'TKNSA', 'SOKM']
  }
];

const FIXED_ANCHORS = ['THYAO', 'TUPRS', 'AKBNK', 'EREGL', 'SISE', 'KCHOL', 'ASELS', 'BIMAS', 'YKBNK', 'ISCTR'];

export function SEOFooter() {
  const [sectors, setSectors] = React.useState(null);

  React.useEffect(() => {
    fetch('/api/seo/market-leaders')
      .then(res => res.json())
      .then(data => {
        if (data && data.sectors) setSectors(data.sectors);
      })
      .catch(err => console.error('SEO Footer fetch error:', err));
  }, []);

  const displayGroups = sectors || SECTOR_GROUPS;

  return (
    <footer className="relative z-10 bg-[#020306] border-t border-white/[0.03] pt-24 pb-12 px-6 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 blur-[150px] rounded-full pointer-events-none opacity-40" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[300px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none opacity-30" />

      <div className="max-w-7xl mx-auto">
        {/* Top Section: Brand & Meta Info */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pb-20">
          <div className="lg:col-span-4 space-y-8">
            <Link to="/" className="inline-block group">
              <BrandLogo size="md" />
            </Link>
            <p className="text-[13px] text-white/40 leading-relaxed max-w-sm font-medium">
              PivotRadar, PRISM-Deep mimarisiyle BIST verilerini saniyeler içinde analiz eden, kurumsal seviyede bir quant analiz terminalidir. İstatistiksel üstünlüğü herkese ulaştırır.
            </p>
            <div className="flex gap-4">
              <a href="mailto:destek@pivotradar.net" className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/30 hover:text-primary hover:border-primary/30 transition-all group">
                <Mail size={18} />
              </a>
              <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/30 hover:text-primary hover:border-primary/30 transition-all">
                <Globe size={18} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-10">
            <div className="space-y-6">
              <h4 className="text-[10px] font-black tracking-[0.3em] text-white/70">TERMINAL</h4>
              <ul className="space-y-3">
                <li><Link to="/terminal" className="text-[13px] text-white/30 hover:text-primary transition-colors flex items-center gap-2 group">
                  <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 -ml-4 group-hover:ml-0 transition-all" /> Canlı Analiz
                </Link></li>
                <li><Link to="/strategy" className="text-[13px] text-white/30 hover:text-primary transition-colors flex items-center gap-2 group">
                  <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 -ml-4 group-hover:ml-0 transition-all" /> Strateji Seçimi
                </Link></li>
                <li><Link to="/backtest" className="text-[13px] text-white/30 hover:text-primary transition-colors flex items-center gap-2 group">
                  <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 -ml-4 group-hover:ml-0 transition-all" /> Backtest Modülü
                </Link></li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Kurumsal</h4>
              <ul className="space-y-3">
                <li><Link to="/about" className="text-[13px] text-white/30 hover:text-primary transition-colors">Hakkımızda</Link></li>
                <li><Link to="/support" className="text-[13px] text-white/30 hover:text-primary transition-colors">Destek & İletişim</Link></li>
                <li><Link to="/help" className="text-[13px] text-white/30 hover:text-primary transition-colors">Yardım Merkezi</Link></li>
                <li><Link to="/legal/terms" className="text-[13px] text-white/30 hover:text-primary transition-colors">Kullanım Koşulları</Link></li>
                <li><Link to="/legal/privacy" className="text-[13px] text-white/30 hover:text-primary transition-colors">Gizlilik Politikası</Link></li>
                <li><Link to="/legal/cookies" className="text-[13px] text-white/30 hover:text-primary transition-colors">Çerez Politikası</Link></li>
              </ul>
            </div>

            <div className="hidden sm:block space-y-6">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">Teknoloji</h4>
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/[0.03] border border-primary/10">
                  <Zap size={14} className="text-primary" />
                  <span className="text-[10px] font-bold text-primary/80 tracking-widest leading-none">PRISM FLOW ACTIVE</span>
                </div>
                <p className="text-[10px] text-white/20 italic font-mono leading-relaxed">
                  QL-7 Pipeline verileri her 15 dakikada bir senkronize edilmektedir.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Fixed SEO Anchors (High Authority Core) ── */}
        <div className="py-10 border-t border-white/[0.03] flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap">Otorite Endeksi:</span>
          {FIXED_ANCHORS.map(ticker => (
            <Link key={ticker} to={`/terminal/${ticker}`} className="text-[11px] font-bold text-white/30 hover:text-primary transition-colors">
              {ticker}
            </Link>
          ))}
        </div>

        {/* Professional Ticker Directory (Categorized & Dynamic) */}
        <div className="pt-10 border-t border-white/[0.05] space-y-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/40">PAZAR LİDERLERİ ANALİZ REHBERİ</h4>
              <p className="text-[10px] text-white/20 uppercase tracking-widest">En Yüksek QRS Skorlu Sektörel Sinyaller</p>
            </div>
            <Link to="/hisse-merkezi" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/5 border border-primary/20 text-[10px] font-black text-primary uppercase tracking-widest hover:bg-primary/10 transition-all group">
              Tüm Hisseleri Keşfet <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
            {displayGroups.map((group, idx) => (
              <div key={idx} className="space-y-5">
                <div className="flex items-center gap-2 pb-2 border-b border-white/[0.03]">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
                  <h5 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em]">{group.name}</h5>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {(group.tickers || []).map(item => {
                    const symbol = typeof item === 'string' ? item : item.symbol;
                    const change = typeof item === 'object' ? item.change : null;
                    return (
                      <Link
                        key={symbol}
                        to={`/terminal/${symbol}`}
                        className="px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[12px] font-bold text-white/30 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all"
                      >
                        {symbol}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legal & Security Baseline */}
        <div className="mt-20 pt-10 border-t border-white/[0.02] flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col gap-2 text-center md:text-left">
            <p className="text-[10px] font-mono text-white/15 uppercase tracking-[0.3em]">
              &copy; {new Date().getFullYear()} PivotRadar. Tüm hakları saklıdır.
            </p>
            <div className="flex items-center justify-center md:justify-start gap-4">
              <ShieldCheck size={12} className="text-emerald-500/50" />
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest italic">Yatırım tavsiyesi içermez. İstatistiksel modellemedir.</span>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.02] border border-white/[0.05]">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Piyasa Veri Akışı: Stabil</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
