import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { 
  Radar, Shield, Zap, Target, Cpu, Globe, 
  ArrowLeft, ChevronRight, BarChart3, Binary
} from 'lucide-react';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { MalthenBadge } from '@/shared/components/MalthenBadge';
import { SEOFooter } from '@/shared/components/SEOFooter';

const FeatureItem = ({ icon: Icon, title, desc }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="p-8 rounded-[2.5rem] bg-[#0c0f18]/60 border border-white/[0.05] backdrop-blur-3xl hover:border-primary/30 transition-all group"
  >
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:scale-110 transition-transform">
      <Icon className="text-primary" size={24} />
    </div>
    <h3 className="text-xl font-black text-white uppercase tracking-tight mb-3">{title}</h3>
    <p className="text-sm text-white/40 leading-relaxed font-medium">{desc}</p>
  </motion.div>
);

export default function AboutPage() {
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#05070a] text-white selection:bg-primary/30">
      <Helmet>
        <title>Hakkımızda | PivotRadar PRISM Analiz Motoru</title>
        <meta name="description" content="PivotRadar'ın hikayesi, teknolojisi ve arkasındaki vizyon. Borsa İstanbul için geliştirilen en gelişmiş quant analiz terminalini keşfedin." />
        <link rel="canonical" href="https://pivot-radar.com/about" />
      </Helmet>

      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/5 blur-[150px] rounded-full opacity-40" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-500/5 blur-[150px] rounded-full opacity-30" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
      </div>

      {/* Header / Nav */}
      <div className="relative z-10 border-b border-white/[0.05] bg-[#05070a]/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="group">
            <BrandLogo size="md" />
          </Link>
          <Link to="/" className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={16} /> ANA SAYFA
          </Link>
        </div>
      </div>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-24 pb-32 px-6">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black tracking-[0.4em] mb-4"
            >
              <Cpu size={14} /> MISSION CONTROL
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-[0.85] text-transparent bg-clip-text bg-gradient-to-b from-white to-white/20"
            >
              Piyasada <br /> <span className="text-primary">Rasyonalite</span> Arayışı
            </motion.h1>

            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-2xl text-white/40 max-w-3xl mx-auto font-medium leading-relaxed"
            >
              PivotRadar, finansal piyasaların kaotik yapısını matematiksel bir düzleme oturtmak için doğdu. 
              Duygulardan arındırılmış, tamamen veriye dayalı bir analiz ekosistemi.
            </motion.p>
          </div>
        </section>

        {/* Vision Section */}
        <section className="py-24 px-6 border-t border-white/[0.03] bg-white/[0.01]">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-10">
              <div className="space-y-4">
                <h2 className="text-[11px] font-black text-primary uppercase tracking-[0.5em]">Vizyonumuz</h2>
                <h3 className="text-4xl font-black uppercase tracking-tight leading-none">İstatistiksel Üstünlüğü <br /> Herkese Ulaştırmak</h3>
              </div>
              <div className="space-y-6 text-white/50 text-lg leading-relaxed font-medium">
                <p>
                  Finansal özgürlük, şans eseri değil, doğru verinin doğru zamanda işlenmesiyle elde edilir. 
                  PivotRadar olarak amacımız, kurumsal fonların kullandığı karmaşık analiz yöntemlerini 
                  basitleştirerek bireysel yatırımcıların hizmetine sunmaktır.
                </p>
                <p>
                  PRISM-Deep mimarimiz, her gün milyonlarca veri noktasını tarayarak "şeffaf bir piyasa haritası" oluşturur. 
                  Biz sadece bir terminal değil, yatırım yolculuğunuzdaki otonom navigasyon sisteminiziz.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 pt-4">
                 {[
                   { l: 'Deterministik', i: Binary },
                   { l: 'Ölçeklenebilir', i: Globe },
                   { l: 'Hızlı', i: Zap }
                 ].map(tag => (
                   <div key={tag.l} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[10px] font-black uppercase tracking-widest text-white/40">
                      <tag.i size={14} className="text-primary/60" /> {tag.l}
                   </div>
                 ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full scale-75 animate-pulse" />
              <div className="relative p-1 rounded-[3rem] bg-gradient-to-br from-primary/30 via-white/5 to-purple-500/30">
                <div className="bg-[#05070a] rounded-[2.9rem] overflow-hidden p-8 aspect-square flex flex-col justify-between border border-white/5">
                   <div className="flex justify-between items-start">
                      <div className="space-y-1">
                         <p className="text-[10px] font-black text-primary uppercase tracking-widest">Core Status</p>
                         <p className="text-2xl font-black text-white">OPERATIONAL</p>
                      </div>
                      <Radar size={40} className="text-primary/40 animate-pulse" />
                   </div>
                   
                   <div className="space-y-4">
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                         <motion.div 
                           animate={{ width: ['0%', '100%', '100%'] }} 
                           transition={{ duration: 4, repeat: Infinity }}
                           className="h-full bg-primary" 
                         />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                         {[1,2,3,4,5,6].map(i => <div key={i} className="h-12 rounded-lg bg-white/[0.03] border border-white/[0.05]" />)}
                      </div>
                   </div>

                   <div className="flex justify-between items-end">
                      <p className="text-[8px] font-mono text-white/20 max-w-[120px]">
                        PRISM_CORE <br /> NEURAL_CONNECTIVITY_ESTABLISHED
                      </p>
                      <div className="text-right">
                         <p className="text-[10px] font-black text-white/40 uppercase">Sync Rate</p>
                         <p className="text-xl font-black text-emerald-400">99.9%</p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Technical Features */}
        <section className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center space-y-4 mb-20">
               <h2 className="text-[11px] font-black text-primary uppercase tracking-[0.5em]">Teknoloji Stack</h2>
               <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tight">Hetzner Üzerinde Koşan Bir Akıl</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <FeatureItem 
                icon={Cpu} 
                title="PRISM-Deep Engine" 
                desc="XGBoost ve Random Forest modellerinden oluşan hibrit bir topluluk (ensemble) öğrenme yapısı. Her hisse için rasyonalite skorları üretir."
              />
              <FeatureItem 
                icon={Shield} 
                title="Risk Guard Rails" 
                desc="Piyasa aşırı ısındığında veya volatilitenin saptığı anlarda otomatik olarak devreye giren koruma protokolleri."
              />
              <FeatureItem 
                icon={Zap} 
                title="Low-Latency Pipeline" 
                desc="BIST ve Kripto verilerini saniyeler içinde işleyen, yüksek performanslı Python tabanlı asenkron veri hattı."
              />
              <FeatureItem 
                icon={Target} 
                title="Otonom Formasyon" 
                desc="Destek, direnç ve kritik Fibonacci seviyelerini matematiksel olarak haritalandırarak manuel analiz yükünü ortadan kaldırır."
              />
              <FeatureItem 
                icon={BarChart3} 
                title="Sektörel Alpha" 
                desc="Hisseleri kendi sektörlerindeki rakipleriyle normalize ederek, gerçekten hangi kağıdın pozitif ayrıştığını gösterir."
              />
              <FeatureItem 
                icon={Globe} 
                title="Cloud Native" 
                desc="Dockerize edilmiş mikroservis mimarisi sayesinde her zaman erişilebilir ve saniyeler içinde ölçeklenebilir altyapı."
              />
            </div>
          </div>
        </section>

        {/* DEVELOPER SECTION - MALTHEN CREDIT */}
        <section className="py-40 px-6 relative overflow-hidden bg-gradient-to-b from-transparent to-[#0a0a14]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="max-w-4xl mx-auto text-center relative z-10 space-y-12">
            <div className="space-y-4">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]"
              >
                Geliştirici & Vizyoner
              </motion.div>
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-6xl font-black uppercase tracking-tight text-white"
              >
                Malthen Tarafından <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Mühendislik Edildi</span>
              </motion.h2>
            </div>

            <motion.p 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-white/40 text-lg md:text-xl font-medium leading-relaxed"
            >
              PivotRadar, Malthen'ın kurumsal yazılım mimarisi ve finansal mühendislik tutkusunun bir ürünüdür. 
              Modern teknolojileri kullanarak karmaşık problemleri zarif çözümlere dönüştürme vizyonuyla geliştirilmiştir.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring' }}
              className="flex flex-col items-center gap-8 pt-10"
            >
               <MalthenBadge />
               <p className="text-[10px] font-black text-white/20 tracking-[0.5em] mt-4">
                  FUTURE-READY DIGITAL INFRASTRUCTURE
               </p>
            </motion.div>
          </div>
        </section>
      </main>

      <SEOFooter />
    </div>
  );
}
