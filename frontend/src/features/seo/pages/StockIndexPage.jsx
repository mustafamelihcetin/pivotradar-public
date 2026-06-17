import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, ChevronRight, TrendingUp, BarChart3, Info } from 'lucide-react';
import { SEOFooter } from '../../../shared/components/SEOFooter';

export default function StockIndexPage() {
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/seo/all-tickers')
      .then(res => res.json())
      .then(data => {
        if (data && data.tickers) setTickers(data.tickers);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch tickers:', err);
        setLoading(false);
      });
  }, []);

  const filteredTickers = useMemo(() => {
    if (!search) return tickers;
    const s = search.toUpperCase();
    return tickers.filter(t => t.symbol.includes(s) || (t.name && t.name.toUpperCase().includes(s)));
  }, [tickers, search]);

  const groupedTickers = useMemo(() => {
    const groups = {};
    filteredTickers.forEach(t => {
      const char = t.symbol[0].toUpperCase();
      if (!groups[char]) groups[char] = [];
      groups[char].push(t);
    });
    return Object.keys(groups).sort().map(char => ({
      char,
      items: groups[char]
    }));
  }, [filteredTickers]);

  return (
    <div className="min-h-screen bg-[#05070a] text-white/90 pb-20">
      <Helmet>
        <title>BIST Hisse Senedi Merkezi & Analiz Rehberi | PivotRadar</title>
        <meta name="description" content="Tüm Borsa İstanbul (BIST) hisselerinin listesi, canlı analizleri ve QRS skorları. 500+ hisse senedi için yapay zeka destekli teknik analiz rehberi." />
        <link rel="canonical" href="https://pivot-radar.com/hisse-merkezi" />
      </Helmet>

      {/* Hero / Header */}
      <div className="relative pt-32 pb-16 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative z-10 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-4">
            <BarChart3 size={12} /> BIST Veri Merkezi
          </div>
          <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-tight">
            HİSSE SENEDİ <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">REHBERİ</span>
          </h1>
          <p className="text-lg text-white/40 max-w-2xl mx-auto font-medium">
            Borsa İstanbul'da işlem gören tüm şirketlerin yapay zeka destekli teknik analizlerine ve güncel skorlarına buradan ulaşabilirsiniz.
          </p>

          {/* Search Box */}
          <div className="max-w-xl mx-auto mt-12 relative group">
             <div className="absolute inset-x-0 -bottom-4 h-12 bg-primary/20 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
             <div className="relative flex items-center bg-[#0c0f18] border border-white/10 rounded-2xl p-2 focus-within:border-primary/50 transition-all shadow-2xl">
                <div className="pl-4 text-white/30">
                   <Search size={20} />
                </div>
                <input 
                  type="text" 
                  placeholder="Hisse kodu veya şirket adı arayın..." 
                  className="w-full bg-transparent border-none outline-none px-4 py-3 text-sm font-bold placeholder:text-white/20"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
             </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-40">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Hisse Veritabanı Yükleniyor...</span>
          </div>
        ) : filteredTickers.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-white/5 rounded-3xl">
             <Info className="mx-auto text-white/20 mb-4" size={40} />
             <p className="text-white/30 font-medium">Aradığınız kriterlere uygun hisse bulunamadı.</p>
          </div>
        ) : (
          <div className="space-y-16">
            {groupedTickers.map((group) => (
              <div key={group.char} className="space-y-6">
                <div className="flex items-center gap-4">
                   <div className="text-3xl font-black text-primary/50">{group.char}</div>
                   <div className="flex-1 h-px bg-white/5" />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {group.items.map((item) => (
                    <Link 
                      key={item.symbol} 
                      to={`/terminal/${item.symbol}`}
                      className="group p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-primary/[0.05] hover:border-primary/30 transition-all flex items-center justify-between"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-white/90 group-hover:text-primary transition-colors">{item.symbol}</span>
                        <span className="text-[10px] text-white/20 truncate max-w-[140px] font-medium">{item.name}</span>
                      </div>
                      <ChevronRight size={16} className="text-white/10 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SEO Context (Footer Info) */}
        <div className="mt-32 p-10 rounded-[3rem] bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.05] space-y-8">
           <div className="flex items-center gap-3">
              <TrendingUp className="text-primary" size={24} />
              <h3 className="text-xl font-black uppercase tracking-tight">PivotRadar Analiz Motoru Hakkında</h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-sm leading-relaxed text-white/40 font-medium">
              <p>
                PivotRadar Hisse Merkezi, Borsa İstanbul (BIST) ekosistemindeki tüm şirketleri kapsayan dinamik bir veri dizinidir. 
                Her bir hisse için özel olarak eğitilmiş **PRISM-Deep** neural ağlarımız, günlük olarak 80'den fazla teknik göstergeyi (RSI, Bollinger, EMA, Ichimoku vb.) tarayarak 
                matematiksel bir QRS (Quant Radar Score) üretir.
              </p>
              <p>
                Sistemimiz sadece fiyatı değil; hacim momentumunu, kurumsal para akışını ve saklama dağılımlarını da analiz eder. 
                Bu sayede yatırımcılar, 500'den fazla hisse arasında o günün en güçlü "Sektörel Alpha" (ayrışma) potansiyeli taşıyan kağıtlarını saniyeler içinde tespit edebilir.
              </p>
           </div>
        </div>
      </div>

      <SEOFooter />
    </div>
  );
}
