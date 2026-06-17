const fs = require('fs');

let content = fs.readFileSync('src/features/landing/pages/LandingPage.jsx', 'utf8');

// Replace MOCK_ROWS and MockProTerminal completely
const mockProTerminalRegex = /\/\* ── MOCK PRO TERMINAL COMPONENT ─────────────────────────────────────────── \*\/(.|\n)*?\/\* ── MAIN PAGE ─────────────────────────────────────────────────────────────── \*\//m;

const newMockProTerminal = `/* ── MOCK PRO TERMINAL COMPONENT ─────────────────────────────────────────── */
const MOCK_ROWS = [
  { sym: 'ALPH', desc: 'Alpha Technology', price: '3,63', chg: '+0.83%', vol: '5.5M', rsi: '60.5', qrs: '56.9', form: 'BAYRAK', formColor: 'text-[#fbbf24]', formBg: 'bg-[#fbbf24]/10' },
  { sym: 'NEXG', desc: 'NexGen Energy Ltd.', price: '31,60', chg: '+4.43%', vol: '2.8M', rsi: '51.3', qrs: '65.5', form: 'K.SAP', formColor: 'text-[#a855f7]', formBg: 'bg-[#a855f7]/10' },
  { sym: 'VRTX', desc: 'Vertex Innovations', price: '42,30', chg: '+5.81%', vol: '1.1M', rsi: '53.5', qrs: '65.5', form: 'Ç.DİP', formColor: 'text-primary', formBg: 'bg-primary/10' },
  { sym: 'QNTM', desc: 'Quantum Mechanics', price: '72,10', chg: '+3.00%', vol: '4K', rsi: '56.3', qrs: '64.4', form: 'BAYRAK', formColor: 'text-[#fbbf24]', formBg: 'bg-[#fbbf24]/10' },
  { sym: 'GLBL', desc: 'Global Logistics', price: '7,86', chg: '+2.31%', vol: '941K', rsi: '56.1', qrs: '64.4', form: '-', formColor: 'text-white/50', formBg: 'bg-transparent' },
  { sym: 'CRON', desc: 'Chronos Holdings', price: '10.192,50', chg: '+2.26%', vol: '1K', rsi: '61.5', qrs: '64.4', form: 'B.OMUZ', formColor: 'text-[#f87171]', formBg: 'bg-[#f87171]/10' },
  { sym: 'SYNR', desc: 'Synergy Group', price: '15,21', chg: '+3.19%', vol: '772K', rsi: '59.5', qrs: '64.4', form: '-', formColor: 'text-white/50', formBg: 'bg-transparent' },
  { sym: 'NOVA', desc: 'Nova Resources', price: '8,37', chg: '+2.71%', vol: '666K', rsi: '56.1', qrs: '64.4', form: '-', formColor: 'text-white/50', formBg: 'bg-transparent' },
  { sym: 'PUL', desc: 'Pulse Electronics', price: '7,59', chg: '+3.83%', vol: '17.7M', rsi: '57.3', qrs: '64.4', form: 'T.B.OMUZ', formColor: 'text-primary', formBg: 'bg-primary/10' },
];

const MockProTerminal = memo(() => {
  return (
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
        {/* LEFT PANEL (Chart + Table) */}
        <div className="flex-1 flex flex-col border-r border-white/[0.08] min-w-0 bg-[#0b0e16]">
          
          {/* CHART AREA */}
          <div className="min-h-[420px] flex-none border-b border-white/[0.08] flex flex-col p-4 relative bg-[#05070a]">
            {/* Ticker Header like Ege Seramik screenshot */}
            <div className="flex justify-between items-start mb-2 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-[#f87171] flex items-center justify-center">
                  <div className="w-3 h-3 rounded-sm bg-white opacity-90 transform rotate-45" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                     <span className="text-xl font-black tracking-widest text-white/90 leading-none">ALPH</span>
                     <span className="text-[11px] text-white/50 font-sans tracking-wide">Alpha Technology</span>
                  </div>
                  <span className="text-[10px] text-[#fbbf24] font-bold mt-1">Teknoloji</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3">
                   <span className="text-2xl font-black text-white/90 leading-none">₺3,63</span>
                   <span className="text-[#34d399] text-sm bg-[#34d399]/10 px-1.5 py-0.5 rounded border border-[#34d399]/20 font-bold">+0.83%</span>
                   <span className="text-[9px] px-1.5 py-1 rounded bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20 font-black tracking-widest">BAYRAK</span>
                   <span className="text-[9px] px-1.5 py-1 rounded bg-white/5 text-white/50 border border-white/[0.1] font-black tracking-widest">PAYLAŞ</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3 relative z-10 text-[8px] text-white/40 font-mono bg-[#fbbf24]/5 border border-[#fbbf24]/10 px-2 py-1 rounded w-fit">
              <span className="text-[#fbbf24]">⚠️</span> Bu platform yatırım danışmanlığı hizmeti vermez. Gösterilen tüm değerler algoritmik model çıktısıdır.
            </div>

            {/* Indicators Row */}
            <div className="flex items-center gap-2 mb-4 relative z-10">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#22d3ee]/30 text-[9px] font-bold text-white/70 bg-[#111520]"><span className="w-1.5 h-1.5 rounded-full bg-[#22d3ee]" /> EMA</div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#a855f7]/30 text-[9px] font-bold text-white/70 bg-[#111520]"><span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" /> Bollinger</div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#fbbf24]/30 text-[9px] font-bold text-white/70 bg-[#111520]"><span className="w-1.5 h-1.5 rounded-full bg-[#fbbf24]" /> Formasyon</div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#34d399]/30 text-[9px] font-bold text-white/70 bg-[#111520]"><span className="w-1.5 h-1.5 rounded-full bg-[#34d399]" /> Hacim</div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#f97316]/30 text-[9px] font-bold text-white/70 bg-[#111520]"><span className="w-1.5 h-1.5 rounded-full bg-[#f97316]" /> Fibonacci</div>
            </div>

            {/* Fake Chart Graphics */}
            <div className="flex-1 relative border border-white/[0.05] rounded bg-[#07090e] overflow-hidden mb-3">
               {/* Grid */}
               <div className="w-full h-full absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '60px 40px' }} />
               
               {/* Advanced Chart Lines */}
               <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                 {/* Bollinger Band Shading */}
                 <path d="M0,140 Q100,160 200,160 T400,140 T600,40 L800,40 L800,130 Q600,150 400,180 T200,190 T0,180 Z" fill="rgba(168, 85, 247, 0.08)" />
                 {/* Bollinger Band Borders */}
                 <path d="M0,140 Q100,160 200,160 T400,140 T600,40 T800,40" fill="none" stroke="rgba(168, 85, 247, 0.3)" strokeWidth="1" />
                 <path d="M0,180 Q100,190 200,190 T400,180 T600,150 T800,130" fill="none" stroke="rgba(168, 85, 247, 0.3)" strokeWidth="1" />
                 {/* Moving Average */}
                 <path d="M0,160 Q100,175 200,175 T400,160 T600,95 T800,85" fill="none" stroke="rgba(34, 211, 238, 0.5)" strokeWidth="1.5" />
                 
                 {/* Trend Line (Yellow) */}
                 <line x1="320" y1="160" x2="560" y2="40" stroke="#fbbf24" strokeWidth="1.5" />
                 {/* Flag / Bayrak Box */}
                 <rect x="560" y="30" width="220" height="40" fill="rgba(251, 191, 36, 0.05)" stroke="#fbbf24" strokeWidth="1" strokeDasharray="5 5" />
               </svg>

               {/* Y-Axis Prices */}
               <div className="absolute right-2 top-0 bottom-12 flex flex-col justify-between text-[9px] font-mono text-white/40 py-2">
                 <span>3.8</span>
                 <span>3.6</span>
                 <span>3.4</span>
                 <span>3.2</span>
                 <span>3.0</span>
                 <span>2.8</span>
               </div>

               {/* Candlesticks - Advanced Look */}
               <div className="absolute inset-x-8 bottom-12 top-4 flex items-end justify-between">
                 {[
                   {h: 60, v: 40, up: false}, {h: 65, v: 35, up: false}, {h: 55, v: 25, up: false}, {h: 60, v: 35, up: true},
                   {h: 62, v: 40, up: false}, {h: 68, v: 30, up: false}, {h: 70, v: 25, up: false}, {h: 72, v: 15, up: true},
                   {h: 75, v: 20, up: false}, {h: 70, v: 25, up: true}, {h: 68, v: 30, up: true}, {h: 65, v: 35, up: true},
                   {h: 60, v: 40, up: true}, {h: 55, v: 50, up: true}, {h: 50, v: 45, up: true}, {h: 40, v: 60, up: true},
                   {h: 30, v: 80, up: true}, {h: 20, v: 60, up: false}, {h: 25, v: 40, up: false}, {h: 22, v: 55, up: true},
                   {h: 20, v: 75, up: true}, {h: 28, v: 30, up: false}, {h: 25, v: 40, up: true}, {h: 22, v: 30, up: true},
                 ].map((d, i) => (
                    <div key={i} className="flex flex-col items-center justify-end h-full w-2.5 relative group">
                       <div className="absolute flex flex-col items-center justify-center w-full" style={{bottom: \`\${d.h}%\`, height: '25%'}}>
                         <div className="w-px h-full bg-white/30 absolute" />
                         <div className={cn("w-2 rounded-[1px] relative z-10", d.up ? "bg-[#34d399]" : "bg-[#f87171]")} style={{height: \`\${Math.random()*40 + 20}%\`}} />
                       </div>
                    </div>
                 ))}
               </div>

               {/* Volume Bars */}
               <div className="absolute inset-x-8 bottom-0 h-10 flex items-end justify-between border-t border-white/[0.05]">
                 {Array.from({length: 24}).map((_, i) => (
                   <div key={i} className="w-1.5 rounded-t-[1px] opacity-40 bg-[#34d399]" style={{height: \`\${Math.random() * 80 + 10}%\`}} />
                 ))}
               </div>
            </div>

            {/* Footer Stats inside Chart area */}
            <div className="grid grid-cols-3 gap-6 text-[9px] relative z-10 border-t border-white/[0.05] pt-3 px-2">
               {/* TEKNIK */}
               <div className="flex flex-col gap-1.5">
                  <span className="text-white/40 tracking-[0.2em] font-black mb-1">TEKNİK</span>
                  <div className="flex justify-between"><span className="text-white/50">ML Skoru</span><span className="text-[#34d399] font-bold">91.0</span></div>
                  <div className="flex justify-between"><span className="text-white/50">QRS</span><span className="text-[#34d399] font-bold">56.9</span></div>
                  <div className="flex justify-between"><span className="text-white/50">RSI 14</span><span className="text-white/90">60.5</span></div>
               </div>
               {/* FIYAT & HACIM */}
               <div className="flex flex-col gap-1.5">
                  <span className="text-white/40 tracking-[0.2em] font-black mb-1">FİYAT & HACİM</span>
                  <div className="flex justify-between"><span className="text-white/50">Günlük Değişim</span><span className="text-[#fbbf24] font-bold">-0.1x</span></div>
                  <div className="flex justify-between"><span className="text-white/50">Hacim</span><span className="text-white/90">43,6B</span></div>
                  <div className="flex justify-between"><span className="text-white/50">Ortalama Hacim</span><span className="text-white/90">62,5B</span></div>
               </div>
               {/* TEMEL */}
               <div className="flex flex-col gap-1.5">
                  <span className="text-white/40 tracking-[0.2em] font-black mb-1">TEMEL</span>
                  <div className="flex justify-between"><span className="text-white/50">Piyasa Değeri</span><span className="text-white/90">645M</span></div>
                  <div className="flex justify-between"><span className="text-white/50">F/DD</span><span className="text-white/90">62.88</span></div>
                  <div className="flex justify-between"><span className="text-white/50">EPS</span><span className="text-[#f87171] font-bold">-40.5%</span></div>
               </div>
            </div>
          </div>

          {/* TABLE AREA */}
          <div className="flex-1 overflow-hidden flex flex-col bg-[#0b0e16]">
            <div className="flex text-[8px] font-black text-white/50 tracking-[0.2em] px-4 py-2 border-b border-white/[0.05]">
              <div className="w-2/5">SEMBOL</div>
              <div className="w-[10%] text-right">FİYAT</div>
              <div className="w-[10%] text-right">%DEĞ</div>
              <div className="w-[10%] text-right">HACİM</div>
              <div className="w-[10%] text-right">RSI</div>
              <div className="w-[10%] text-right text-primary">QRS</div>
              <div className="w-[10%] text-right">FORM</div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col">
              {MOCK_ROWS.map((r, i) => (
                <div key={r.sym} className="flex items-center px-4 py-2 border-b border-white/[0.03] hover:bg-[#07090e] text-[10px]">
                  <div className="w-2/5 flex flex-col">
                    <span className="font-black text-white/90">{r.sym}</span>
                    <span className="text-[8px] text-white/50 font-sans truncate pr-4">{r.desc}</span>
                  </div>
                  <div className="w-[10%] text-right font-bold text-white/90">{r.price}</div>
                  <div className={cn("w-[10%] text-right font-bold", r.chg.startsWith('+') ? 'text-[#34d399]' : 'text-[#f87171]')}>{r.chg}</div>
                  <div className="w-[10%] text-right text-white/50">{r.vol}</div>
                  <div className="w-[10%] text-right text-white/50">{r.rsi}</div>
                  <div className="w-[10%] text-right font-black text-primary">{r.qrs}</div>
                  <div className="w-[10%] flex justify-end">
                    <span className={cn("text-[7.5px] font-black px-1.5 py-0.5 rounded tracking-widest", r.formColor, r.formBg)}>{r.form}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="w-64 bg-[#07090e] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/[0.05]">
            <div className="text-[8px] font-black tracking-widest text-white/50 mb-3">ÖNE ÇIKANLAR</div>
            <div className="flex flex-col gap-2.5">
              {MOCK_ROWS.slice(0,5).map(r => (
                <div key={r.sym} className="flex justify-between items-center text-[10px]">
                  <span className="font-black text-white/90">{r.sym}</span>
                  <div className="flex gap-2 text-right">
                    <span className={cn("font-bold w-12", r.chg.startsWith('+') ? 'text-[#34d399]' : 'text-[#f87171]')}>{r.chg}</span>
                    <span className="text-primary w-6 text-right font-black">{r.qrs}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 border-b border-white/[0.05]">
            <div className="text-[8px] font-black tracking-widest text-white/50 mb-3">PİYASA ÖZETİ</div>
            <div className="flex justify-between mb-2">
              <span className="text-2xl font-black text-[#34d399]">239</span>
              <span className="text-2xl font-black text-[#f87171]">46</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-white/[0.05]">
              <div className="bg-[#34d399] h-full w-[80%]" />
              <div className="bg-[#f87171] h-full w-[20%]" />
            </div>
          </div>
          <div className="p-4">
            <div className="text-[8px] font-black tracking-widest text-white/50 mb-3">FORMASYONLAR</div>
            <div className="flex flex-col gap-2.5 text-[9px] font-black">
              <div className="flex justify-between text-[#a855f7]"><span className="tracking-widest">BAYRAK</span> <span>24</span></div>
              <div className="flex justify-between text-primary"><span className="tracking-widest">Ç.DİP</span> <span>18</span></div>
              <div className="flex justify-between text-[#fbbf24]"><span className="tracking-widest">KANAL</span> <span>12</span></div>
              <div className="flex justify-between text-[#f87171]"><span className="tracking-widest">B.OMUZ</span> <span>7</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
/* ── MAIN PAGE ─────────────────────────────────────────────────────────────── */`;

content = content.replace(mockProTerminalRegex, newMockProTerminal);

// Now, replace real tickers in other text on the page
content = content.replace(/"THYAO"/g, '"ALPH"');
content = content.replace(/>THYAO</g, '>ALPH<');
content = content.replace(/"FROTO"/g, '"NEXG"');
content = content.replace(/>FROTO</g, '>NEXG<');
content = content.replace(/"EREGL"/g, '"VRTX"');
content = content.replace(/>EREGL</g, '>VRTX<');
content = content.replace(/"HEKTS"/g, '"GLBL"');
content = content.replace(/>HEKTS</g, '>GLBL<');
content = content.replace(/"TUPRS"/g, '"QNTM"');
content = content.replace(/>TUPRS</g, '>QNTM<');

content = content.replace(/Tüpraş 3\. Çeyrek/g, 'Quantum 3. Çeyrek');
content = content.replace(/Hektaş bedelli/g, 'Global Logistics bedelli');
content = content.replace(/BIST100/g, 'GLOBAL ENDEKS'); // BIST100'u de fake yapalım
content = content.replace(/>BIST AÇIK</g, '>PİYASA AÇIK<');
content = content.replace(/TCMB faiz/g, 'Merkez Bankası faiz');
content = content.replace(/BIST hisselerini/g, 'Hisse senetlerini');
content = content.replace(/BIST/g, 'Hisse Senedi'); // remaining BIST references

fs.writeFileSync('src/features/landing/pages/LandingPage.jsx', content);
console.log('Update complete.');
