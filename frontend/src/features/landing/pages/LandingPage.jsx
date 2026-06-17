import React, { memo, useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowRight, Search, Activity, Zap, Briefcase, Newspaper,
  TrendingUp, TrendingDown, BarChart2, Target, CheckCircle,
  Clock, Check, X, Minus,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { SEOFooter } from '@/shared/components/SEOFooter';

/* ── Mock sembol verileri (kurgusal — hukuki bağlayıcılık olmaması için) ─── */
const MOCK_ROWS = [
  { sym: 'ALPH', desc: 'Alpha Technology',    price: '3,63',     chg: '+0.83%', vol: '5.5M',  rsi: '60.5', qrs: '94.1', form: 'BAYRAK',   formColor: 'text-[#fbbf24]', formBg: 'bg-[#fbbf24]/10' },
  { sym: 'NEXG', desc: 'NexGen Energy Ltd.',  price: '31,60',    chg: '+4.43%', vol: '2.8M',  rsi: '51.3', qrs: '91.3', form: 'K.SAP',    formColor: 'text-[#a855f7]', formBg: 'bg-[#a855f7]/10' },
  { sym: 'VRTX', desc: 'Vertex Innovations',  price: '42,30',    chg: '+5.81%', vol: '1.1M',  rsi: '53.5', qrs: '88.7', form: 'Ç.DİP',    formColor: 'text-primary',    formBg: 'bg-primary/10' },
  { sym: 'QNTM', desc: 'Quantum Mechanics',   price: '72,10',    chg: '+3.00%', vol: '4.2M',  rsi: '56.3', qrs: '85.2', form: 'BAYRAK',   formColor: 'text-[#fbbf24]', formBg: 'bg-[#fbbf24]/10' },
  { sym: 'GLBL', desc: 'Global Logistics',    price: '7,86',     chg: '+2.31%', vol: '941K',  rsi: '56.1', qrs: '82.4', form: '-',        formColor: 'text-white/50',  formBg: 'bg-transparent' },
  { sym: 'CRON', desc: 'Chronos Holdings',    price: '10.192,50',chg: '+2.26%', vol: '1.2M',  rsi: '61.5', qrs: '79.8', form: 'B.OMUZ',   formColor: 'text-[#f87171]', formBg: 'bg-[#f87171]/10' },
  { sym: 'SYNR', desc: 'Synergy Group',       price: '15,21',    chg: '+3.19%', vol: '772K',  rsi: '59.5', qrs: '77.3', form: '-',        formColor: 'text-white/50',  formBg: 'bg-transparent' },
  { sym: 'NOVA', desc: 'Nova Resources',      price: '8,37',     chg: '+2.71%', vol: '666K',  rsi: '56.1', qrs: '74.6', form: '-',        formColor: 'text-white/50',  formBg: 'bg-transparent' },
  { sym: 'PUL',  desc: 'Pulse Electronics',   price: '7,59',     chg: '+3.83%', vol: '17.7M', rsi: '57.3', qrs: '71.9', form: 'T.B.OMUZ', formColor: 'text-primary',    formBg: 'bg-primary/10' },
];

/* ── Animasyonlu sayaç ───────────────────────────────────────────────────── */
function CountUp({ end, suffix = '', duration = 1800 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, end, duration]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ── Mock ProTerminal ────────────────────────────────────────────────────── */
const MockProTerminal = memo(() => (
  <div className="w-full h-full bg-[#0b0e16] border border-white/[0.08] rounded-lg overflow-hidden flex flex-col font-mono text-white/90 shadow-2xl">
    {/* TOP NAVBAR */}
    <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d1118] border-b border-white/[0.08] shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 opacity-80">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[9px] font-black tracking-widest text-primary">TERMINAL ONLINE</span>
        </div>
        <div className="w-px h-3 bg-white/[0.08]" />
        <div className="flex items-center gap-1 px-2 py-1 bg-[#111520] border border-white/[0.05] rounded text-white/50 text-[9px] w-48">
          <Search size={10} />
          <span className="ml-1">Sembol ara...</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-black tracking-widest">GÜVENLİ LİMAN</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/[0.05] font-black tracking-widest">FORMASYON</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-white/50 border border-white/[0.05] font-black tracking-widest">QRS 70+</span>
        </div>
      </div>
      <div className="text-[10px] text-white/50">17:16:33</div>
    </div>

    {/* MAIN LAYOUT */}
    <div className="flex flex-1 min-h-0">
      {/* LEFT PANEL */}
      <div className="flex-1 flex flex-col border-r border-white/[0.08] min-w-0 bg-[#0b0e16]">

        {/* CHART AREA */}
        <div className="min-h-[420px] flex-none border-b border-white/[0.08] flex flex-col p-4 relative bg-[#05070a]">
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-[#22d3ee]/20 flex items-center justify-center border border-[#22d3ee]/30">
                <TrendingUp size={14} className="text-primary" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-black tracking-widest text-white/90 leading-none">ALPH</span>
                  <span className="text-[11px] text-white/50 font-sans tracking-wide">Alpha Technology</span>
                </div>
                <span className="text-[10px] text-[#22d3ee] font-bold mt-1">Teknoloji</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-white/90 leading-none">₺299,50</span>
              <span className="text-[#34d399] text-sm bg-[#34d399]/10 px-1.5 py-0.5 rounded border border-[#34d399]/20 font-bold">+1.83%</span>
              <span className="text-[9px] px-1.5 py-1 rounded bg-primary/10 text-primary border border-primary/20 font-black tracking-widest">T.B.OMUZ</span>
            </div>
          </div>

          {/* Indicators Row */}
          <div className="flex items-center gap-2 mb-4 relative z-10">
            {[['EMA','#22d3ee'],['Bollinger','#a855f7'],['Formasyon','#fbbf24'],['Hacim','#34d399'],['Fibonacci','#f97316']].map(([l,c])=>(
              <div key={l} className="flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-bold text-white/70 bg-[#111520]" style={{borderColor:`${c}4D`}}>
                <span className="w-1.5 h-1.5 rounded-full" style={{background:c}} />{l}
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="flex-1 relative border border-white/[0.05] rounded bg-[#07090e] overflow-hidden mb-3 min-h-[160px]">
            <div className="w-full h-full absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 40px' }} />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 160" preserveAspectRatio="none">
              <path d="M0,130 C200,130 300,10 520,10 C650,10 750,20 800,20 L800,70 C750,70 650,90 520,90 C300,90 200,150 0,150 Z" fill="rgba(168,85,247,0.08)" />
              <path d="M0,130 C200,130 300,10 520,10 C650,10 750,20 800,20" fill="none" stroke="rgba(168,85,247,0.3)" strokeWidth="1" />
              <path d="M0,150 C200,150 300,90 520,90 C650,90 750,70 800,70" fill="none" stroke="rgba(168,85,247,0.3)" strokeWidth="1" />
              <path d="M0,140 C200,140 300,50 520,50 C650,50 750,45 800,45" fill="none" stroke="rgba(34,211,238,0.5)" strokeWidth="1.5" />
              <line x1="250" y1="120" x2="520" y2="20" stroke="#fbbf24" strokeWidth="1.5" />
              <rect x="520" y="10" width="260" height="50" fill="rgba(251,191,36,0.05)" stroke="#fbbf24" strokeWidth="1" strokeDasharray="5 5" />
            </svg>
            <div className="absolute right-2 top-0 bottom-8 flex flex-col justify-between text-[8px] font-mono text-white/40 py-1 z-10 pointer-events-none">
              {['310','300','290','280','270','260'].map(p=><span key={p}>{p}</span>)}
            </div>
            <div className="absolute inset-x-8 bottom-8 top-2 flex items-end justify-between">
              {[{h:15,up:false,bh:40},{h:18,up:true,bh:60},{h:16,up:false,bh:30},{h:20,up:true,bh:50},{h:19,up:false,bh:45},{h:22,up:true,bh:55},{h:20,up:false,bh:35},{h:23,up:true,bh:65},{h:30,up:true,bh:80},{h:40,up:true,bh:70},{h:35,up:false,bh:50},{h:50,up:true,bh:85},{h:60,up:true,bh:75},{h:55,up:false,bh:40},{h:70,up:true,bh:90},{h:82,up:true,bh:60},{h:78,up:false,bh:45},{h:74,up:false,bh:50},{h:76,up:true,bh:30},{h:71,up:false,bh:40},{h:73,up:true,bh:35},{h:68,up:false,bh:45},{h:70,up:true,bh:50},{h:65,up:false,bh:60}].map((d,i)=>(
                <div key={i} className="flex flex-col items-center justify-end h-full w-2 relative">
                  <div className="absolute flex flex-col items-center justify-center w-full" style={{bottom:`${d.h}%`,height:'25%'}}>
                    <div className="w-px h-full bg-white/30 absolute" />
                    <div className={cn("w-1.5 rounded-[1px] relative z-10",d.up?"bg-[#34d399]":"bg-[#f87171]")} style={{height:`${d.bh}%`}} />
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-x-8 bottom-0 h-6 flex items-end justify-between border-t border-white/[0.05]">
              {Array.from({length:24}).map((_,i)=>(
                <div key={i} className="w-1 rounded-t-[1px] opacity-40 bg-[#34d399]" style={{height:`${[35,60,25,80,45,70,30,90,55,40,75,50,65,35,85,60,45,70,30,55,80,40,65,50][i]}%`}} />
              ))}
            </div>
          </div>

          {/* Footer Stats */}
          <div className="grid grid-cols-3 gap-6 text-[9px] relative z-10 border-t border-white/[0.05] pt-3 px-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-white/40 tracking-[0.2em] font-black mb-1">TEKNİK</span>
              <div className="flex justify-between"><span className="text-white/50">ML Skoru</span><span className="text-[#34d399] font-bold">91.4</span></div>
              <div className="flex justify-between"><span className="text-white/50">QRS</span><span className="text-primary font-bold">94.1</span></div>
              <div className="flex justify-between"><span className="text-white/50">RSI 14</span><span className="text-white/90">62.4</span></div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-white/40 tracking-[0.2em] font-black mb-1">FİYAT & HACİM</span>
              <div className="flex justify-between"><span className="text-white/50">Günlük Değişim</span><span className="text-[#34d399] font-bold">+1.83%</span></div>
              <div className="flex justify-between"><span className="text-white/50">Hacim</span><span className="text-white/90">42,1M</span></div>
              <div className="flex justify-between"><span className="text-white/50">Ort. Hacim</span><span className="text-white/90">38,5M</span></div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-white/40 tracking-[0.2em] font-black mb-1">TEMEL</span>
              <div className="flex justify-between"><span className="text-white/50">Piyasa Değeri</span><span className="text-white/90">399B</span></div>
              <div className="flex justify-between"><span className="text-white/50">F/K</span><span className="text-white/90">7.82</span></div>
              <div className="flex justify-between"><span className="text-white/50">Hedef Fiyat</span><span className="text-[#34d399] font-bold">₺330</span></div>
            </div>
          </div>
        </div>

        {/* TABLE AREA */}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#0b0e16]">
          <div className="flex text-[8px] font-black text-white/50 tracking-[0.2em] px-4 py-1.5 border-b border-white/[0.05]">
            <div className="w-2/5">SEMBOL</div>
            <div className="w-[10%] text-right">FİYAT</div>
            <div className="w-[10%] text-right">%DEĞ</div>
            <div className="w-[10%] text-right">HACİM</div>
            <div className="w-[10%] text-right">RSI</div>
            <div className="w-[10%] text-right text-primary">QRS</div>
            <div className="w-[10%] text-right">FORM</div>
          </div>
          <div className="flex-1 flex flex-col">
            {MOCK_ROWS.slice(0,5).map((r,i) => (
              <div key={r.sym} className={cn("flex items-center px-4 py-1.5 border-b border-white/[0.03] text-[9px] flex-1", i===0 && "bg-primary/[0.04] border-l-2 border-l-primary")}>
                <div className="w-2/5 flex flex-col">
                  <span className="font-black text-white/90">{r.sym}</span>
                  <span className="text-[7.5px] text-white/50 font-sans truncate pr-4">{r.desc}</span>
                </div>
                <div className="w-[10%] text-right font-bold text-white/90">₺{r.price}</div>
                <div className={cn("w-[10%] text-right font-bold", r.chg.startsWith('+') ? 'text-[#34d399]' : 'text-[#f87171]')}>{r.chg}</div>
                <div className="w-[10%] text-right text-white/50">{r.vol}</div>
                <div className="w-[10%] text-right text-white/50">{r.rsi}</div>
                <div className="w-[10%] text-right font-black text-primary">{r.qrs}</div>
                <div className="w-[10%] flex justify-end">
                  <span className={cn("text-[7px] font-black px-1.5 py-0.5 rounded tracking-widest", r.formColor, r.formBg)}>{r.form}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="w-[280px] bg-[#07090e] flex flex-col shrink-0 overflow-hidden border-l border-white/[0.05]">

        {/* ÖNE ÇIKANLAR */}
        <div className="flex flex-col border-b border-white/[0.05] flex-none">
          <div className="flex justify-between items-center px-3 py-1.5 border-b border-white/[0.05] bg-[#05070a]">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black tracking-widest text-white/50">ÖNE ÇIKANLAR</span>
              <span className="text-[8px] font-black text-primary bg-primary/10 px-1 py-0.5 rounded border border-primary/20">287</span>
            </div>
            <div className="flex gap-2 text-[7px] font-black text-white/30 tracking-widest">
              <span>HAR</span><span>QRS</span><span>F</span>
            </div>
          </div>
          <div className="flex flex-col">
            {MOCK_ROWS.slice(0,5).map((r,i) => (
              <div key={r.sym} className="flex items-center justify-between px-3 py-1.5 hover:bg-white/[0.02] border-b border-white/[0.02] relative cursor-default">
                {i===0 && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />}
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={8} className="text-[#34d399] opacity-80" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white/90 leading-none">{r.sym}</span>
                    <span className="text-[8px] font-sans text-white/30">₺{r.price}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-[#34d399] w-10 text-right">{r.chg}</span>
                  <span className="text-[9px] font-black text-primary border-b border-primary/30 pb-[1px] w-8 text-center">{r.qrs}</span>
                  <div className={cn("w-1.5 h-1.5 rounded-full", r.formBg.replace('/10','').replace('bg-','bg-'))} style={{background: r.formColor.includes('primary') ? '#22d3ee' : r.formColor.includes('fbbf24') ? '#fbbf24' : r.formColor.includes('a855f7') ? '#a855f7' : 'rgba(255,255,255,0.2)'}} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TAKİP LİSTESİ */}
        <div className="flex flex-col border-b border-white/[0.05] flex-none relative">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#fbbf24] z-10" />
          <div className="flex justify-between items-center px-3 py-1.5 border-b border-[#fbbf24]/10 bg-[#fbbf24]/[0.03]">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-[#fbbf24]">★</span>
              <span className="text-[9px] font-black tracking-widest text-[#fbbf24]">TAKİP</span>
              <span className="text-[8px] font-black text-[#fbbf24] bg-[#fbbf24]/10 px-1 py-0.5 rounded border border-[#fbbf24]/20">6</span>
            </div>
            <div className="flex gap-2 text-[7px] font-black text-white/30 tracking-widest"><span>ML</span><span className="mr-1">QRS</span></div>
          </div>
          <div className="flex flex-col bg-[#fbbf24]/[0.01]">
            {[
              {sym:'NEXG', price:'₺31,60',chg:'+4.43%',ml:'89.4',qrs:'79.8'},
              {sym:'VRTX', price:'₺42,30',chg:'+5.81%',ml:'87.1',qrs:'77.3'},
              {sym:'QNTM', price:'₺72,10',chg:'+3.00%',ml:'85.4',qrs:'74.6'},
              {sym:'GLBL', price:'₺7,86', chg:'+2.31%',ml:'83.2',qrs:'71.9'},
            ].map(r=>(
              <div key={r.sym} className="flex items-center justify-between px-3 py-1.5 hover:bg-[#fbbf24]/[0.04] border-b border-[#fbbf24]/5 cursor-default">
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-[#fbbf24] opacity-80">★</span>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-white/90 leading-none">{r.sym}</span>
                    <span className="text-[8px] font-sans text-white/30">{r.price}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-[#34d399] w-10 text-right">{r.chg}</span>
                  <div className="flex gap-2 items-center">
                    <span className="text-[9px] font-black text-[#34d399] border-b border-[#34d399]/40 pb-[1px] w-6 text-center">{r.ml}</span>
                    <span className="text-[9px] font-black text-white/80 border-b border-white/20 pb-[1px] w-5 text-center">{r.qrs}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PİYASA ÖZETİ */}
        <div className="p-4 border-b border-white/[0.05] flex-none">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[8px] font-black tracking-widest text-white/40">PİYASA ÖZETİ</span>
            <span className="text-[8px] font-black tracking-widest text-[#34d399]">YÜKSELİŞ</span>
          </div>
          <div className="flex justify-between items-end mb-2">
            <div className="flex flex-col">
              <span className="text-xl font-black text-[#34d399] leading-none">307</span>
              <span className="text-[8px] font-black text-[#34d399] tracking-widest mt-1">YÜKSELEN</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs font-black text-white/30 leading-none">18</span>
              <span className="text-[7px] font-black text-white/30 tracking-widest mt-0.5">NÖTR</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xl font-black text-[#f87171] leading-none">87</span>
              <span className="text-[8px] font-black text-[#f87171] tracking-widest mt-1">DÜŞEN</span>
            </div>
          </div>
          <div className="w-full h-1.5 flex rounded-full overflow-hidden mb-1">
            <div className="h-full bg-[#34d399]" style={{width:'74%'}} />
            <div className="h-full bg-[#f87171]" style={{width:'26%'}} />
          </div>
          <div className="flex justify-between text-[7.5px] font-sans text-white/40 mb-4">
            <span>74%</span><span>412 hisse</span><span>26%</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="border border-white/[0.05] rounded p-1.5 flex flex-col items-center justify-center bg-[#05070a]/50">
              <span className="text-xs font-black text-white/90">47.3</span>
              <span className="text-[6.5px] font-black text-white/30 tracking-widest mt-0.5">ORT QRS</span>
            </div>
            <div className="border border-primary/20 rounded p-1.5 flex flex-col items-center justify-center bg-primary/5">
              <span className="text-xs font-black text-[#34d399]">88.9</span>
              <span className="text-[6.5px] font-black text-[#34d399] tracking-widest mt-0.5">ORT ML</span>
            </div>
            <div className="border border-white/[0.05] rounded p-1.5 flex flex-col items-center justify-center bg-[#05070a]/50">
              <span className="text-xs font-black text-white/90">53.7</span>
              <span className="text-[6.5px] font-black text-white/30 tracking-widest mt-0.5">ORT RSI</span>
            </div>
          </div>
        </div>

        {/* FORMASYONLAR */}
        <div className="p-4 flex-none">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[8px] font-black tracking-widest text-white/40">FORMASYONLAR</span>
            <span className="text-[8px] font-sans text-white/30">183 tespit</span>
          </div>
          <div className="flex flex-col gap-3">
            {[
              {name:'BAYRAK',   count:72, color:'text-[#fbbf24]', bar:'bg-[#fbbf24]', w:'100%'},
              {name:'T.B.OMUZ',count:58, color:'text-primary',    bar:'bg-primary',   w:'80%'},
              {name:'B.OMUZ',  count:31, color:'text-[#f87171]',  bar:'bg-[#f87171]', w:'43%'},
              {name:'Ç.DİP',   count:14, color:'text-[#34d399]',  bar:'bg-[#34d399]', w:'19%'},
              {name:'K.SAP',   count:8,  color:'text-[#a855f7]',  bar:'bg-[#a855f7]', w:'11%'},
            ].map(f=>(
              <div key={f.name} className="flex items-center justify-between text-[8px] font-black">
                <div className={cn("flex items-center gap-1.5 w-16 shrink-0", f.color)}>
                  <div className="w-1 h-1 rounded-full bg-current" />
                  <span className="tracking-widest">{f.name}</span>
                </div>
                <div className="flex-1 mx-2 bg-white/[0.05] h-0.5 rounded-full overflow-hidden">
                  <div className={cn("h-full", f.bar)} style={{width:f.w}} />
                </div>
                <span className="text-white/50 w-4 text-right">{f.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
));

/* ── KARŞILAŞTIRMA TABLOSU ───────────────────────────────────────────────── */
const COMPARE_FEATURES = [
  'Hisse taraması',
  'ML / QRS Skoru',
  'Formasyon tespiti',
  'Strateji profili',
  'Gerçek zamanlı veri',
  'Portföy K/Z takibi',
  'Sektör analizi',
  'Piyasa haberleri',
];
const COMPARE_DATA = {
  'Manuel Analiz':     [false, false, false, false, false, 'partial', false, false],
  'İsyatirim/Matriks': [false, false, 'partial', false, 'partial', 'partial', false, 'partial'],
  'PivotRadar':        [true,  true,  true,      true,  true,      true,     true,  true],
};
function CmpCell({ val }) {
  if (val === true)    return <Check size={14} className="text-[#34d399] mx-auto" />;
  if (val === false)   return <X     size={14} className="text-white/20  mx-auto" />;
  return                       <Minus size={14} className="text-[#fbbf24] mx-auto" />;
}

/* ── ANA SAYFA ───────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="relative min-h-[100dvh] bg-[#05070a] text-white/90 font-sans overflow-x-hidden selection:bg-primary/25">
      <Helmet>
        <title>PivotRadar | BIST Hisse Senedi Quant Analiz Terminali</title>
        <meta name="description" content="500+ BIST hissesini ML skoru, teknik indikatörler ve formasyon analizi ile tarayan profesyonel quant terminali. Ücretsiz dene." />
      </Helmet>

      {/* ── 1. NAVBAR ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-[100] bg-[#05070a]/90 backdrop-blur-xl border-b border-white/[0.05]">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex-1 flex items-center justify-start">
            <Link to="/" className="flex items-center gap-3 group">
              <BrandLogo size="md" className="transition-transform group-hover:scale-105" />
              <div className="hidden sm:block h-4 w-px bg-white/[0.1] mx-1" />
              <span className="text-[10px] font-black tracking-[0.3em] text-white/50 hidden sm:block group-hover:text-white/80 transition-colors">QUANT TERMINAL</span>
            </Link>
          </div>
          <div className="hidden md:flex flex-1 items-center justify-center gap-10">
            <a href="#features"  className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-primary transition-all">Özellikler</a>
            <a href="#workflow"  className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-primary transition-all">Nasıl Çalışır</a>
            <a href="#compare"   className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-primary transition-all">Karşılaştır</a>
          </div>
          <div className="flex-1 flex items-center justify-end gap-5">
            <Link to="/terminal" className="hidden sm:block text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-white/90 transition-colors">Giriş Yap</Link>
            <div className="hidden sm:block w-px h-3 bg-white/[0.1]" />
            <Link to="/terminal" className="group flex items-center gap-2 px-5 py-2.5 rounded bg-primary text-black text-[10px] font-black uppercase tracking-widest hover:bg-[#a5f3fc] transition-all shadow-[0_0_15px_rgba(34,211,238,0.15)] hover:shadow-[0_0_25px_rgba(34,211,238,0.35)]">
              Uygulamaya Git <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── 2. HERO ───────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 min-h-[100dvh] flex flex-col items-center">
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(153,247,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(153,247,255,0.02) 1px,transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'linear-gradient(to bottom,black 40%,transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom,black 40%,transparent 100%)',
          }}
        />
        <div className="relative z-10 w-full max-w-[1400px] mx-auto flex flex-col items-center">
          <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:0.5}}
            className="text-center max-w-3xl mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/5 border border-primary/20 rounded text-[9px] font-black text-primary tracking-[0.3em] mb-6 shadow-[0_0_15px_rgba(153,247,255,0.1)]">
              PRISM ENGINE · 500+ BIST HİSSESİ · CANLI
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tighter leading-[1.1] mb-6 text-white/90">
              500+ Hisseyi<br/>
              <span className="text-primary">30 Saniyede</span> Tara
            </h1>
            <p className="text-sm md:text-base text-white/50 max-w-2xl mx-auto leading-relaxed">
              PRISM motoru tüm BIST hisselerini 80+ teknik gösterge ve XGBoost ML modeliyle süzerek en güçlü fırsatları QRS skoru ile sıralar. Manuel analize son.
            </p>
            <div className="flex items-center justify-center gap-4 mt-8">
              <Link to="/terminal" className="group flex items-center gap-2 px-8 py-3.5 rounded bg-primary text-black font-black uppercase tracking-widest hover:bg-[#a5f3fc] transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                Terminali Aç <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a href="#workflow" className="flex items-center gap-2 px-8 py-3.5 rounded border border-white/[0.1] text-white/60 font-black uppercase tracking-widest text-[11px] hover:border-white/20 hover:text-white/80 transition-all">
                Nasıl Çalışır
              </a>
            </div>
            <p className="text-[10px] text-white/30 mt-4">Terminal ücretsiz · Portföy için hesap aç</p>
          </motion.div>

          <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{duration:0.7,delay:0.2}}
            className="w-full h-[600px] 2xl:h-[700px]">
            <MockProTerminal />
          </motion.div>
        </div>
      </section>

      {/* ── 3. METRİK BAR ─────────────────────────────────────────────────── */}
      <section className="border-y border-white/[0.05] bg-[#07090e] py-12">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {end:500, suffix:'+', label:'BIST Hissesi', sub:'Tam evren taraması'},
            {end:80,  suffix:'+', label:'Teknik Gösterge', sub:'RSI, MACD, Bollinger ve daha fazlası'},
            {end:8,   suffix:'',  label:'Strateji Profili', sub:'Güvenli Liman\'dan Agresif\'e'},
            {end:6,   suffix:'',  label:'Formasyon Tipi', sub:'Bayrak, Kanal, Baş-Omuz ve daha fazlası'},
          ].map(({end,suffix,label,sub})=>(
            <div key={label} className="flex flex-col items-center text-center">
              <span className="text-4xl lg:text-5xl font-black text-primary tracking-tighter">
                <CountUp end={end} suffix={suffix} />
              </span>
              <span className="text-[11px] font-black tracking-widest text-white/70 mt-2 uppercase">{label}</span>
              <span className="text-[10px] text-white/30 mt-1 font-mono">{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. PRISM ENGINE ───────────────────────────────────────────────── */}
      <section id="features" className="py-24 border-t border-white/[0.05] bg-[#07090e]">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="w-8 h-8 border border-primary/30 rounded bg-primary/10 flex items-center justify-center mb-5 text-primary shadow-[0_0_10px_rgba(153,247,255,0.2)]">
              <Zap size={14} />
            </div>
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-widest mb-4">Kapsamlı<br/>Piyasa Taraması</h2>
            <p className="text-sm font-mono text-white/50 leading-relaxed mb-6 max-w-md">
              PRISM motoru tüm BIST hisselerini düzenli olarak tarar. Fırsatları manuel aramayı bırak, algoritma senin için filtrelesin.
            </p>
            <ul className="flex flex-col gap-3 text-xs font-mono text-white/50">
              {[
                'RSI, MACD, Bollinger Bands, EMA anlık hesaplama',
                'Hacim patlaması ve volatilite anomali tespiti',
                'Fibonacci geri çekilme seviyeleri',
                'Sektörel normalize QRS sıralaması',
                '8 hazır strateji profili (Güvenli Liman, Trend Takip...)',
              ].map(t=>(
                <li key={t} className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-primary flex-shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>

          {/* PRISM Mock */}
          <div className="bg-[#0b0e16] border border-white/[0.08] rounded p-5 font-mono text-[10px] relative overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center border-b border-white/[0.05] pb-3 mb-4 text-white/50">
              <span className="tracking-widest font-black text-white/90">PRISM ENGINE · ÇALIŞIYOR</span>
              <span className="text-primary animate-pulse font-bold tracking-widest">● AKTİF</span>
            </div>
            <div className="flex flex-col gap-2.5 text-white/70">
              <div className="flex gap-2"><span className="text-white/30">{'>'}</span> Piyasa verisi çekiliyor... <span className="text-[#34d399] font-bold">[OK]</span></div>
              <div className="flex gap-2"><span className="text-white/30">{'>'}</span> Göstergeler hesaplanıyor (N=512)...</div>
              <div className="w-full h-1 bg-white/[0.05] mt-1 mb-3"><div className="h-full bg-primary w-[85%]" /></div>
              <div className="grid grid-cols-4 gap-2 text-[8px] font-black text-white/40 border-b border-white/[0.03] pb-1">
                <span>SEMBOL</span><span>SİNYAL</span><span>METRİK</span><span className="text-right">DEĞİŞİM</span>
              </div>
              {[
                {sym:'ALPH', sig:'KIRILIŞ',  met:'RSI: 72', chg:'+5.63%', c:'text-[#34d399]'},
                {sym:'NEXG', sig:'HACİM',    met:'Vol: 2.1x',chg:'+4.43%', c:'text-[#34d399]'},
                {sym:'VRTX', sig:'DİRENÇ',   met:'OBV: -1.2',chg:'-0.45%', c:'text-[#f87171]'},
              ].map(r=>(
                <div key={r.sym} className="grid grid-cols-4 items-center p-2 rounded bg-[#111520] border border-white/[0.03]">
                  <span className="font-black text-white/90">{r.sym}</span>
                  <span className="text-primary">{r.sig}</span>
                  <span className="text-white/50">{r.met}</span>
                  <span className={cn("font-bold text-right", r.c)}>{r.chg}</span>
                </div>
              ))}
              <div className="flex justify-between text-[8px] text-white/30 border-t border-white/[0.05] pt-2 mt-1">
                <span>287 hisse işlendi</span><span>23 sinyal tespit edildi</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. ML / QRS ───────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.05] bg-[#0b0e16]">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* QRS Mock */}
          <div className="order-2 lg:order-1 flex flex-col gap-4">
            <div className="bg-[#0d1118] border border-white/[0.05] rounded p-5 flex flex-col shadow-2xl relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 blur-2xl rounded-full" />
              <span className="text-[9px] font-black text-white/50 tracking-widest mb-3 relative z-10">QRS — KANTİTATİF DERECELENDIRME</span>
              <div className="flex items-baseline gap-2 relative z-10">
                <span className="text-5xl font-black text-primary tracking-tighter">94</span>
                <span className="text-sm text-white/50 font-bold">/100</span>
                <span className="ml-2 text-[10px] font-black text-[#34d399] bg-[#34d399]/10 px-2 py-1 rounded border border-[#34d399]/20">GÜÇLÜ SINYAL</span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.05] mt-4 relative z-10 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{width:'94%'}} />
              </div>
              <div className="mt-3 relative z-10">
                <span className="text-[9px] text-white/40">ALPH · Alpha Technology · Teknoloji</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                {l:'MOMENTUM',v:'88.5',c:'text-[#34d399]',b:'bg-[#34d399]',w:'88%'},
                {l:'VOLATİLİTE',v:'12.4',c:'text-white/90',b:'bg-primary',w:'12%'},
                {l:'BETA',v:'1.14',c:'text-white/90',b:'bg-[#a855f7]',w:'57%'},
              ].map(m=>(
                <div key={m.l} className="bg-[#0d1118] border border-white/[0.05] rounded p-4 flex flex-col justify-between shadow-2xl">
                  <span className="text-[8px] font-black text-white/50 tracking-widest">{m.l}</span>
                  <span className={cn("text-lg font-black mt-2", m.c)}>{m.v}</span>
                  <div className="w-full h-0.5 bg-white/[0.05] mt-2"><div className={cn("h-full", m.b)} style={{width:m.w}} /></div>
                </div>
              ))}
            </div>
            <div className="bg-[#0d1118] border border-white/[0.05] rounded p-4 flex justify-between items-center shadow-2xl">
              <span className="text-[9px] font-black font-mono text-white/50 tracking-widest">TESPİT EDİLEN FORMASYON</span>
              <span className="text-[10px] font-black tracking-widest px-2.5 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded">TERSİNE BAŞ-OMUZ</span>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="w-8 h-8 border border-[#a855f7]/30 rounded bg-[#a855f7]/10 flex items-center justify-center mb-5 text-[#a855f7] shadow-[0_0_10px_rgba(210,119,255,0.2)]">
              <Activity size={14} />
            </div>
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-widest mb-4">Makine Öğrenmesi &<br/>Formasyon Analizi</h2>
            <p className="text-sm font-mono text-white/50 leading-relaxed mb-6 max-w-md">
              QRS (Kantitatif Derecelendirme Skoru) ile her hissenin sektör içi göreli gücünü ölç. XGBoost modeli yönsel tahmin üretir, formasyon motoru klasik formları otomatik tespit eder.
            </p>
            <ul className="flex flex-col gap-3 text-xs font-mono text-white/50">
              {[
                'XGBoost model — sektör bazlı normalize skorlama',
                'Geometrik formasyon tespiti (Bayrak, Kanal, Takoz)',
                'Baş-Omuz, Çift Dip, Çift Tepe formasyonları',
                'Hedef fiyat ve stop-loss önerisi',
              ].map(t=>(
                <li key={t} className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-[#a855f7] flex-shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 6. PORTFÖY ────────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.05] bg-[#07090e]">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="w-8 h-8 border border-[#fbbf24]/30 rounded bg-[#fbbf24]/10 flex items-center justify-center mb-5 text-[#fbbf24]">
              <Briefcase size={14} />
            </div>
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-widest mb-4">Portföy &<br/>K/Z Takibi</h2>
            <p className="text-sm font-mono text-white/50 leading-relaxed mb-6 max-w-md">
              Hisselerini ekle, giriş fiyatını gir. Sistem anlık fiyatla karşılaştırarak gerçek zamanlı kâr/zarar hesaplar. QRS ve RSI değerleri de kartın üzerinde görünür.
            </p>
            <ul className="flex flex-col gap-3 text-xs font-mono text-white/50">
              {[
                'Anlık K/Z ve yüzdesel değişim',
                'Her pozisyon için QRS & RSI göstergesi',
                'İzleme listesiyle entegre yıldız sistemi',
                'Grafik ile pozisyon performansı',
              ].map(t=>(
                <li key={t} className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-[#fbbf24] flex-shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>

          {/* Portfolio Mock — gerçek PortfolioPage kartlarıyla aynı stil */}
          <div className="flex flex-col gap-3">
            {[
              {sym:'ALPH', full:'Alpha Technology',  qty:200, avg:'₺3,10',  cur:'₺3,63',  pnl:'+%17.1', pnlColor:'text-[#34d399]', pnlBg:'rgba(52,211,153,0.05)', pnlBd:'rgba(52,211,153,0.12)', qrs:94, rsi:62, pos:true},
              {sym:'NEXG', full:'NexGen Energy Ltd.', qty:150, avg:'₺29,70', cur:'₺31,60', pnl:'+%6.4',  pnlColor:'text-[#34d399]', pnlBg:'rgba(52,211,153,0.05)', pnlBd:'rgba(52,211,153,0.12)', qrs:91, rsi:56, pos:true},
              {sym:'CRON', full:'Chronos Holdings',   qty:500, avg:'₺11.100', cur:'₺10.192', pnl:'-%8.2', pnlColor:'text-[#f87171]', pnlBg:'rgba(248,113,113,0.05)', pnlBd:'rgba(248,113,113,0.12)', qrs:48, rsi:38, pos:false},
            ].map(h=>(
              <div key={h.sym} className="flex flex-col gap-3 p-4 rounded border bg-[#07090e]" style={{borderColor:'rgba(255,255,255,0.06)'}}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded flex items-center justify-center border" style={{background:h.pos?'rgba(52,211,153,0.05)':'rgba(248,113,113,0.05)', borderColor:h.pos?'rgba(52,211,153,0.15)':'rgba(248,113,113,0.15)'}}>
                      <span className="text-[10px] font-black" style={{color:h.pos?'#34d399':'#f87171'}}>{h.sym.slice(0,3)}</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-black text-white leading-none">{h.sym}</p>
                      <p className="text-[9px] text-white/25 mt-1">{h.qty} ADET · {h.avg}</p>
                    </div>
                  </div>
                  <span className="text-[8px]" style={{color:'#fbbf24'}}>★</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded border" style={{background:'rgba(0,0,0,0.25)',borderColor:'rgba(255,255,255,0.04)'}}>
                    <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">GÜNCEL DEĞER</p>
                    <p className="text-[15px] font-black text-primary">{h.cur}</p>
                  </div>
                  <div className="p-2.5 rounded border" style={{background:h.pnlBg,borderColor:h.pnlBd}}>
                    <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">KÂR / ZARAR</p>
                    <p className={cn("text-[15px] font-black", h.pnlColor)}>{h.pnl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black font-mono text-primary border border-primary/20 rounded px-1.5 py-0.5">QRS {h.qrs}</span>
                  <span className="text-[9px] font-black font-mono border rounded px-1.5 py-0.5" style={{color:h.rsi>70?'#f87171':h.rsi<30?'#34d399':'rgba(255,255,255,0.45)',borderColor:'rgba(255,255,255,0.07)'}}>RSI {h.rsi}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. HABERLER ───────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/[0.05] bg-[#0b0e16]">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* News Mock — sentiment analizi ile */}
          <div className="order-2 lg:order-1 flex flex-col gap-3">
            <div className="grid grid-cols-[1fr_2fr_1fr_1fr] px-4 text-[8px] font-black text-white/50 tracking-[0.2em] mb-1">
              <span>SEMBOL</span><span>BAŞLIK (KAP/HABER)</span><span className="text-center">CONF.</span><span className="text-right">SENTİMENT</span>
            </div>
            {[
              {sym:'QNTM', time:'14:22', title:'Quantum 3. Çeyrek net kârı beklentileri aştı, EPS %34 yukarı...', conf:'98%', confC:'text-primary', confBg:'bg-primary/10', confBd:'border-primary/20', sent:'POZİTİF', sentC:'text-[#34d399]', sentBg:'bg-[#34d399]/10', sentBd:'border-[#34d399]/20'},
              {sym:'GLBL', time:'12:05', title:'Merkez Bankası faiz kararını açıkladı, politika faizi değişmedi...', conf:'85%', confC:'text-white/90', confBg:'bg-white/[0.05]', confBd:'border-white/[0.08]', sent:'NÖTR', sentC:'text-white/50', sentBg:'bg-white/[0.05]', sentBd:'border-white/[0.08]'},
              {sym:'NOVA', time:'09:15', title:'Nova Resources bedelli sermaye artırımı SPK onayına sunuldu...', conf:'92%', confC:'text-primary', confBg:'bg-primary/10', confBd:'border-primary/20', sent:'NEGATİF', sentC:'text-[#f87171]', sentBg:'bg-[#f87171]/10', sentBd:'border-[#f87171]/20'},
            ].map((n,i)=>(
              <div key={i} className="bg-[#0d1118] border border-white/[0.05] rounded p-3 font-mono shadow-xl grid grid-cols-[1fr_2fr_1fr_1fr] items-center gap-2">
                <div className="flex flex-col">
                  <span className="font-black text-white/90 text-[10px]">{n.sym}</span>
                  <span className="text-[7px] text-white/50">{n.time}</span>
                </div>
                <span className="text-[9px] text-white/50 truncate pr-2">{n.title}</span>
                <div className="text-center">
                  <span className={`text-[8px] px-1.5 py-0.5 rounded border ${n.confC} ${n.confBg} ${n.confBd}`}>{n.conf}</span>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-[8px] font-black tracking-widest border ${n.sentC} ${n.sentBg} ${n.sentBd}`}>{n.sent}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="order-1 lg:order-2">
            <div className="w-8 h-8 border border-primary/30 rounded bg-primary/10 flex items-center justify-center mb-5 text-primary">
              <Newspaper size={14} />
            </div>
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-widest mb-4">Piyasa<br/>Haberleri</h2>
            <p className="text-sm font-mono text-white/50 leading-relaxed mb-6 max-w-md">
              Bigpara, KAP, Bloomberg HT ve diğer kaynaklardan anlık haber akışı. İlgili hisse koduna tıklayarak terminalde doğrudan analiz yap.
            </p>
            <ul className="flex flex-col gap-3 text-xs font-mono text-white/50">
              {[
                'Bigpara, KAP, Bloomberg HT entegrasyonu',
                'Habere tıkla, terminalde hisseyi aç',
                'Sembol bazlı filtreleme',
                'Haber arşivi ve geçmiş akış',
              ].map(t=>(
                <li key={t} className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-primary flex-shrink-0" />{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 8. İŞ AKIŞI ───────────────────────────────────────────────────── */}
      <section id="workflow" className="py-24 border-t border-white/[0.05] bg-[#05070a] px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-white/90 mb-4">
              <span className="text-primary">PRISM</span> İŞ AKIŞI
            </h2>
            <p className="text-sm font-mono text-white/50 max-w-2xl mx-auto">
              Strateji seç, algoritmayı çalıştır, sinyalleri incele, pozisyon al.
            </p>
          </div>

          <div className="relative max-w-4xl mx-auto">
            <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-primary/20 to-transparent transform md:-translate-x-1/2" />
            <div className="flex flex-col gap-12">
              {[
                {step:'01', title:'STRATEJİ PROFİLİ SEÇ',  desc:'Güvenli Liman, Büyüme, Momentum veya Agresif profillerinden birini seç. Sistem filtrelerini otomatik yapılandırır.', icon:Target,    align:'right'},
                {step:'02', title:'ALGORİTMİK TARAMA',      desc:'PRISM motoru 500+ hisseyi 30 saniyede tarar. QRS sıralaması ile en güçlü fırsatlar öne çıkar.', icon:Search,    align:'left'},
                {step:'03', title:'SİNYALLERİ İNCELE',      desc:'Terminal\'de seçilen hissenin grafik, formasyon, ML skoru, hedef fiyat ve stop-loss seviyelerini gör.', icon:BarChart2, align:'right'},
                {step:'04', title:'POZİSYON & TAKİP',        desc:'Hisseyi izleme listesine ekle veya portföye gir. Gerçek zamanlı K/Z takibine başla.', icon:CheckCircle, align:'left'},
              ].map(({step,title,desc,icon:Icon,align})=>(
                <div key={step} className={`relative flex items-center flex-col md:flex-row gap-8 ${align==='left'?'md:flex-row-reverse':''}`}>
                  <div className="absolute left-4 md:left-1/2 transform -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-[#05070a] border border-primary text-[10px] font-black text-primary shadow-[0_0_15px_rgba(34,211,238,0.2)] z-10">
                    {step}
                  </div>
                  <div className={`w-full md:w-1/2 pl-12 md:pl-0 ${align==='left'?'md:pr-12':'md:pl-12'}`}>
                    <div className="bg-[#0b0e16] border border-white/[0.05] p-6 rounded-lg hover:border-primary/30 transition-colors group">
                      <div className="flex items-center gap-3 mb-3">
                        <Icon size={16} className="text-primary opacity-70" />
                        <h3 className="text-sm font-black tracking-widest text-white/90">{title}</h3>
                      </div>
                      <p className="text-[11px] font-sans text-white/50 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. KARŞILAŞTIRMA TABLOSU ──────────────────────────────────────── */}
      <section id="compare" className="py-24 border-t border-white/[0.05] bg-[#07090e] px-6">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-widest text-white/90 mb-4">Neden PivotRadar?</h2>
            <p className="text-sm font-mono text-white/50">Rakiplerinizle aynı araçları kullanırken onlardan nasıl ayrışacaksınız?</p>
          </div>
          <div className="overflow-hidden border border-white/[0.08] rounded-lg">
            {/* Header */}
            <div className="grid grid-cols-4 bg-[#0d1118] border-b border-white/[0.08]">
              <div className="px-6 py-4 text-[9px] font-black tracking-widest text-white/30">ÖZELLİK</div>
              {[
                {label:'Manuel Analiz', sub:'Excel / el ile takip'},
                {label:'Geleneksel Platformlar', sub:'Standart borsa uygulamaları'},
                {label:'PivotRadar', sub:'PRISM Engine', highlight:true},
              ].map(({label,sub,highlight})=>(
                <div key={label} className={cn("px-4 py-4 text-center", highlight && "bg-primary/5 border-l border-r border-primary/20")}>
                  <p className={cn("text-[11px] font-black tracking-widest", highlight ? "text-primary" : "text-white/60")}>{label}</p>
                  <p className="text-[9px] text-white/30 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
            {/* Rows */}
            {COMPARE_FEATURES.map((feat, fi) => (
              <div key={feat} className={cn("grid grid-cols-4 border-b border-white/[0.05]", fi%2===0?"bg-[#07090e]":"bg-[#08090f]")}>
                <div className="px-6 py-3.5 text-[11px] font-mono text-white/60">{feat}</div>
                {Object.entries(COMPARE_DATA).map(([col, vals])=>(
                  <div key={col} className={cn("px-4 py-3.5 flex items-center justify-center", col==='PivotRadar' && "bg-primary/[0.03] border-l border-r border-primary/10")}>
                    <CmpCell val={vals[fi]} />
                  </div>
                ))}
              </div>
            ))}
            {/* Footer */}
            <div className="grid grid-cols-4 bg-[#0d1118]">
              <div className="px-6 py-4" />
              <div className="px-4 py-4" />
              <div className="px-4 py-4" />
              <div className="px-4 py-4 flex items-center justify-center bg-primary/5 border-l border-r border-t border-primary/20">
                <Link to="/terminal" className="text-[10px] font-black text-primary hover:text-[#a5f3fc] transition-colors tracking-widest flex items-center gap-1">
                  Terminali Aç <ArrowRight size={10} />
                </Link>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-center gap-6 text-[10px] font-mono text-white/30">
            <span className="flex items-center gap-1.5"><Check size={10} className="text-[#34d399]" /> Mevcut</span>
            <span className="flex items-center gap-1.5"><Minus size={10} className="text-[#fbbf24]" /> Kısmi</span>
            <span className="flex items-center gap-1.5"><X     size={10} className="text-white/20" /> Yok</span>
          </div>
        </div>
      </section>

      {/* ── 10. FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="py-32 border-t border-white/[0.05] bg-[#0b0e16] text-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{backgroundImage:'linear-gradient(rgba(153,247,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(153,247,255,0.03) 1px,transparent 1px)',backgroundSize:'40px 40px'}} />
        <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse 60% 40% at 50% 100%, rgba(34,211,238,0.05), transparent)'}} />
        <div className="relative z-10">
          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4 text-white/90">
            500+ Hisseyi Bugün Tara
          </h2>
          <p className="text-sm font-mono text-white/50 mb-10 max-w-lg mx-auto">
            Ücretsiz hesap aç, terminale gir, PRISM motorunu çalıştır.
          </p>
          <Link to="/terminal" className="inline-flex items-center gap-3 px-12 py-4 bg-primary text-black font-black uppercase tracking-widest hover:bg-[#a5f3fc] transition-all rounded shadow-[0_0_30px_rgba(34,211,238,0.2)] hover:shadow-[0_0_40px_rgba(34,211,238,0.35)]">
            Terminali Ücretsiz Dene <ArrowRight size={16} />
          </Link>
          <p className="text-[10px] text-white/30 mt-5">Terminal ücretsiz · Portföy & gelişmiş özellikler için hesap aç</p>
        </div>
      </section>

      {/* ── SPK UYARISI ───────────────────────────────────────────────────── */}
      <section className="py-6 px-6 border-t border-white/[0.05] bg-[#07090e]">
        <div className="max-w-[1200px] mx-auto text-center">
          <p className="text-[9px] text-white/25 font-mono leading-relaxed max-w-4xl mx-auto">
            Bu platform yatırım tavsiyesi vermez. Sermaye Piyasası Kurulu (SPK) nezdinde yatırım danışmanlığı veya portföy yönetimi lisansına sahip değildir.
            Tüm analiz ve sinyaller yalnızca bilgilendirme amaçlı algoritmik model çıktısıdır. Yatırım kararları tamamen yatırımcının sorumluluğundadır.
          </p>
        </div>
      </section>

      <SEOFooter />
    </div>
  );
}
