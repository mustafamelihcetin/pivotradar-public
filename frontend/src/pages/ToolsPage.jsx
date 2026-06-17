import React, { useState, useMemo, useEffect } from 'react';

function useIsMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return m;
}
import { Wrench, TrendingDown, AlertTriangle, ChevronDown, ChevronUp, Calculator, Target, Shield, BarChart2 } from 'lucide-react';

const mono  = "'IBM Plex Mono','Fira Mono',monospace";
const sans  = "'Inter','system-ui',sans-serif";
const CYAN  = '#22d3ee';
const GREEN = '#22c55e';
const RED   = '#ef4444';
const AMBER = '#fbbf24';
const PURPLE= '#a78bfa';
const BD    = 'rgba(255,255,255,0.07)';
const BD2   = 'rgba(255,255,255,0.04)';
const w     = (a) => `rgba(255,255,255,${a})`;

function fmt(n, dec = 2) {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(n) {
  if (n == null || !isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}
function parseNum(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/* ── Input ─────────────────────────────────────────────────────── */
function Field({ label, value, onChange, suffix, hint, step }) {
  const [focus, setFocus] = useState(false);
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 6 }}>
        <span style={{ fontSize:10, fontWeight:800, color:w(0.3), fontFamily:mono, letterSpacing:'0.12em', textTransform:'uppercase' }}>{label}</span>
        {hint && <span style={{ fontSize:9, color:w(0.18), fontFamily:mono }}>{hint}</span>}
      </div>
      <div style={{ position:'relative' }}>
        <input
          type="number" value={value} step={step}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            width:'100%', boxSizing:'border-box',
            padding: suffix ? '10px 38px 10px 14px' : '10px 14px',
            background: focus ? 'rgba(34,211,238,0.04)' : 'rgba(255,255,255,0.03)',
            border:`1px solid ${focus ? 'rgba(34,211,238,0.5)' : BD}`,
            borderRadius:8, outline:'none',
            color: w(0.92), fontSize:15, fontFamily:mono, fontWeight:700,
            transition:'all 0.15s',
            boxShadow: focus ? '0 0 0 3px rgba(34,211,238,0.06)' : 'none',
          }}
        />
        {suffix && (
          <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:11, color:w(0.25), fontFamily:mono }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Büyük metrik kutu ─────────────────────────────────────────── */
function MetricBox({ label, value, sub, color, bg, glow, icon: Icon }) {
  return (
    <div style={{
      padding:'16px', borderRadius:10,
      background: bg || 'rgba(255,255,255,0.025)',
      border:`1px solid ${color ? `${color}28` : BD}`,
      boxShadow: glow ? `0 0 20px ${color}15` : 'none',
      display:'flex', flexDirection:'column', gap:4,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        {Icon && <Icon size={11} style={{ color: color || w(0.3) }} />}
        <span style={{ fontSize:9, fontWeight:900, color: color ? `${color}99` : w(0.28), fontFamily:mono, letterSpacing:'0.12em', textTransform:'uppercase' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize:22, fontWeight:900, color: color || w(0.85), fontFamily:mono, lineHeight:1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize:10, color:w(0.25), fontFamily:mono }}>{sub}</div>}
    </div>
  );
}

/* ── Risk bar ──────────────────────────────────────────────────── */
function RiskBar({ pct }) {
  const capped = Math.min(pct, 100);
  const color  = pct < 10 ? GREEN : pct < 20 ? AMBER : RED;
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <span style={{ fontSize:9, color:w(0.3), fontFamily:mono, letterSpacing:'0.1em', textTransform:'uppercase' }}>Portföy Riski</span>
        <span style={{ fontSize:11, fontWeight:900, color, fontFamily:mono }}>%{pct.toFixed(1)}</span>
      </div>
      <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${capped}%`,
          background:`linear-gradient(90deg, ${color}99, ${color})`,
          borderRadius:3, transition:'width 0.3s ease',
          boxShadow:`0 0 8px ${color}60`,
        }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
        {['%1','%5','%10','%20','%30+'].map(l => (
          <span key={l} style={{ fontSize:8, color:w(0.14), fontFamily:mono }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   POZİSYON HESAPLAYICI
══════════════════════════════════════════════════════════════ */
function PositionCalc() {
  const [sermaye, setSermaye] = useState('100000');
  const [riskPct, setRiskPct] = useState('2');
  const [giris,   setGiris]   = useState('');
  const [stop,    setStop]    = useState('');

  const r = useMemo(() => {
    const S = parseNum(sermaye), R = parseNum(riskPct);
    const G = parseNum(giris),  ST = parseNum(stop);
    if (!S||!R||!G||!ST||S<=0||R<=0||G<=0||ST<=0) return null;
    const dist = G - ST;
    if (dist <= 0) return null;
    const riskTL = S * (R / 100);
    const lots   = Math.floor(riskTL / dist);
    if (lots <= 0) return null;
    const pozTL  = lots * G;
    const pozPct = (pozTL / S) * 100;
    const mzarar = lots * dist;
    return { riskTL, lots, pozTL, pozPct, mzarar, dist,
      h1: G + dist, h2: G + dist*2, h3: G + dist*3,
      kz1: lots*dist, kz2: lots*dist*2, kz3: lots*dist*3,
    };
  }, [sermaye, riskPct, giris, stop]);

  const stopErr = useMemo(() => {
    const G = parseNum(giris), ST = parseNum(stop);
    if (!G || !ST) return false;
    return ST >= G;
  }, [giris, stop]);

  const acolor = GREEN;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0, background:'#07090e', border:`1px solid ${BD}`, borderRadius:12, overflow:'hidden' }}>
      {/* Başlık */}
      <div style={{ padding:'16px 20px', borderBottom:`1px solid ${BD}`, background:`linear-gradient(135deg, ${acolor}08, transparent)` }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
          <div style={{ width:28,height:28,borderRadius:7,background:`${acolor}18`,border:`1px solid ${acolor}35`,display:'flex',alignItems:'center',justifyContent:'center' }}>
            <BarChart2 size={13} style={{ color:acolor }} />
          </div>
          <span style={{ fontSize:12,fontWeight:900,color:w(0.88),fontFamily:mono,letterSpacing:'0.1em' }}>POZİSYON HESAPLAYICI</span>
        </div>
        <div style={{ fontSize:10,color:w(0.24),fontFamily:mono,marginLeft:36 }}>Risk yönetimine göre ideal pozisyon büyüklüğünü hesapla</div>
      </div>

      <div style={{ padding:'20px' }}>
        {/* 4 girdi */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <Field label="Sermaye"     value={sermaye} onChange={setSermaye} suffix="₺" hint="Toplam portföy" />
          <Field label="Risk %"      value={riskPct} onChange={setRiskPct} suffix="%" hint="Önerilen: 1–3%" step="0.1" />
          <Field label="Giriş Fiyatı" value={giris}  onChange={setGiris}   suffix="₺" />
          <Field label="Stop-Loss"   value={stop}    onChange={setStop}    suffix="₺" hint="< giriş fiyatı" />
        </div>

        {stopErr && (
          <div style={{ display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'rgba(251,191,36,0.07)',border:'1px solid rgba(251,191,36,0.28)',borderRadius:8,marginBottom:14 }}>
            <AlertTriangle size={12} style={{ color:AMBER,flexShrink:0 }} />
            <span style={{ fontSize:11,color:AMBER,fontFamily:mono }}>Stop-loss, giriş fiyatından düşük olmalıdır.</span>
          </div>
        )}

        {/* Ana metrik — Lot */}
        <div style={{ marginBottom:14 }}>
          <MetricBox
            label="Lot / Adet"
            value={r ? `${r.lots.toLocaleString('tr-TR')} adet` : '—'}
            sub={r ? `Pozisyon: ₺${fmt(r.pozTL)}` : 'Giriş ve stop fiyatı girin'}
            color={r ? acolor : undefined}
            glow={!!r}
            icon={Target}
          />
        </div>

        {/* 3 küçük metrik */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
          <div style={{ padding:'12px', background:'rgba(255,255,255,0.02)', border:`1px solid ${BD}`, borderRadius:8 }}>
            <div style={{ fontSize:9,color:w(0.25),fontFamily:mono,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5 }}>Risk Tutarı</div>
            <div style={{ fontSize:15,fontWeight:900,color:AMBER,fontFamily:mono }}>{r?`₺${fmt(r.riskTL)}`:'—'}</div>
          </div>
          <div style={{ padding:'12px', background:'rgba(255,255,255,0.02)', border:`1px solid ${BD}`, borderRadius:8 }}>
            <div style={{ fontSize:9,color:w(0.25),fontFamily:mono,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5 }}>Stop Mesafesi</div>
            <div style={{ fontSize:15,fontWeight:900,color:w(0.7),fontFamily:mono }}>{r?`₺${fmt(r.dist)}`:'—'}</div>
          </div>
          <div style={{ padding:'12px', background:'rgba(239,68,68,0.05)', border:`1px solid rgba(239,68,68,0.2)`, borderRadius:8 }}>
            <div style={{ fontSize:9,color:'rgba(239,68,68,0.7)',fontFamily:mono,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:5 }}>Maks. Zarar</div>
            <div style={{ fontSize:15,fontWeight:900,color:RED,fontFamily:mono }}>{r?`₺${fmt(r.mzarar)}`:'—'}</div>
          </div>
        </div>

        {/* Risk bar */}
        {r && <div style={{ marginBottom:20 }}><RiskBar pct={r.pozPct} /></div>}
        {r && r.pozPct>30 && (
          <div style={{ display:'flex',alignItems:'center',gap:8,padding:'9px 12px',background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:8,marginBottom:14 }}>
            <AlertTriangle size={12} style={{ color:RED,flexShrink:0 }} />
            <span style={{ fontSize:11,color:RED,fontFamily:mono }}>Portföyün %{r.pozPct.toFixed(0)}'i — yüksek konsantrasyon riski.</span>
          </div>
        )}

        {/* 1R / 2R / 3R hedefler */}
        {r && (
          <div>
            <div style={{ fontSize:9,fontWeight:900,color:w(0.2),fontFamily:mono,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:8 }}>Risk/Ödül Hedefleri</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[
                { label:'1R Hedef', price:r.h1, kz:r.kz1, ratio:'1:1' },
                { label:'2R Hedef', price:r.h2, kz:r.kz2, ratio:'1:2' },
                { label:'3R Hedef', price:r.h3, kz:r.kz3, ratio:'1:3' },
              ].map(({label,price,kz,ratio})=>(
                <div key={label} style={{
                  padding:'12px 10px', borderRadius:8, textAlign:'center',
                  background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)',
                }}>
                  <div style={{ fontSize:8,color:'rgba(34,197,94,0.6)',fontFamily:mono,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:14,fontWeight:900,color:GREEN,fontFamily:mono,marginBottom:2 }}>₺{fmt(price)}</div>
                  <div style={{ fontSize:10,color:w(0.35),fontFamily:mono }}>+₺{fmt(kz)}</div>
                  <div style={{ fontSize:8,color:'rgba(34,197,94,0.4)',fontFamily:mono,marginTop:2 }}>{ratio}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   KÂR / ZARAR HESAPLAYICI
══════════════════════════════════════════════════════════════ */
function PLCalc() {
  const [alis,     setAlis]     = useState('');
  const [adet,     setAdet]     = useState('');
  const [satis,    setSatis]    = useState('');
  const [kom,      setKom]      = useState('0.05');
  const [showScen, setShowScen] = useState(false);

  const r = useMemo(() => {
    const A=parseNum(alis), N=parseNum(adet), S=parseNum(satis), K=parseNum(kom);
    if (!A||!N||!S||K==null||A<=0||N<=0||S<=0) return null;
    const alisTL  = A*N;
    const satisTL = S*N;
    const komTL   = (alisTL+satisTL)*(K/100);
    const brutKZ  = satisTL-alisTL;
    const netKZ   = brutKZ-komTL;
    const netPct  = (netKZ/alisTL)*100;
    const basabas = A*(1+2*(K/100));
    return { alisTL, satisTL, komTL, brutKZ, netKZ, netPct, basabas };
  },[alis,adet,satis,kom]);

  const scenarios = useMemo(()=>{
    const A=parseNum(alis), N=parseNum(adet), K=parseNum(kom);
    if (!A||!N||K==null||A<=0||N<=0) return [];
    return [-15,-10,-5,-3,+3,+5,+10,+15,+20].map(pct=>{
      const exit = A*(1+pct/100);
      const alisTL=A*N, satisTL=exit*N;
      const komTL=(alisTL+satisTL)*(K/100);
      const netKZ=satisTL-alisTL-komTL;
      return {pct,exit,netKZ};
    });
  },[alis,adet,kom]);

  const isProfit = r && r.netKZ>=0;
  const resultColor = r ? (isProfit ? GREEN : RED) : undefined;

  return (
    <div style={{ display:'flex', flexDirection:'column', background:'#07090e', border:`1px solid ${BD}`, borderRadius:12, overflow:'hidden' }}>
      {/* Başlık */}
      <div style={{ padding:'16px 20px', borderBottom:`1px solid ${BD}`, background:'linear-gradient(135deg,rgba(167,139,250,0.06),transparent)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
          <div style={{ width:28,height:28,borderRadius:7,background:'rgba(167,139,250,0.15)',border:'1px solid rgba(167,139,250,0.3)',display:'flex',alignItems:'center',justifyContent:'center' }}>
            <Calculator size={13} style={{ color:PURPLE }} />
          </div>
          <span style={{ fontSize:12,fontWeight:900,color:w(0.88),fontFamily:mono,letterSpacing:'0.1em' }}>KÂR / ZARAR HESAPLAYICI</span>
        </div>
        <div style={{ fontSize:10,color:w(0.24),fontFamily:mono,marginLeft:36 }}>Komisyon dahil net kâr/zarar ve başabaş noktası</div>
      </div>

      <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
        {/* Girdiler */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Alış Fiyatı"  value={alis}  onChange={setAlis}  suffix="₺" />
          <Field label="Adet / Lot"   value={adet}  onChange={setAdet}  hint="Hisse sayısı" />
          <Field label="Satış Fiyatı" value={satis} onChange={setSatis} suffix="₺" />
          <Field label="Komisyon"     value={kom}   onChange={setKom}   suffix="%" hint="Her iki taraf" step="0.01" />
        </div>

        {/* Ana net K/Z kutusu */}
        <div style={{
          padding:'20px', borderRadius:12, textAlign:'center',
          background: r ? (isProfit ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)') : 'rgba(255,255,255,0.02)',
          border:`1px solid ${r ? (isProfit ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)') : BD}`,
          boxShadow: r ? `0 0 30px ${isProfit?'rgba(34,197,94,0.08)':'rgba(239,68,68,0.08)'}` : 'none',
          transition:'all 0.3s',
        }}>
          <div style={{ fontSize:10,fontWeight:900,color:r?(isProfit?'rgba(34,197,94,0.6)':'rgba(239,68,68,0.6)'):w(0.2),fontFamily:mono,letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:8 }}>
            Net Kâr / Zarar
          </div>
          <div style={{ fontSize:36,fontWeight:900,color:resultColor||w(0.2),fontFamily:mono,lineHeight:1,marginBottom:6 }}>
            {r ? `${isProfit?'+':''}₺${fmt(r.netKZ)}` : '—'}
          </div>
          <div style={{ fontSize:16,fontWeight:700,color:resultColor||w(0.15),fontFamily:mono }}>
            {r ? fmtPct(r.netPct) : 'Değerleri girin'}
          </div>
        </div>

        {/* Detay satırları */}
        <div style={{ background:'rgba(255,255,255,0.02)', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
          {[
            { label:'Alış Tutarı',   val:r?`₺${fmt(r.alisTL)}`:'—',   color:w(0.65) },
            { label:'Satış Tutarı',  val:r?`₺${fmt(r.satisTL)}`:'—',  color:w(0.65) },
            { label:'Komisyon',      val:r?`₺${fmt(r.komTL)}`:'—',    color:RED },
            { label:'Brüt K/Z',     val:r?`${r.brutKZ>=0?'+':''}₺${fmt(r.brutKZ)}`:'—', color:r?(r.brutKZ>=0?GREEN:RED):w(0.4) },
            { label:'Başabaş Fiyatı',val:r?`₺${fmt(r.basabas)}`:'—',  color:AMBER },
          ].map(({label,val,color},i,arr)=>(
            <div key={label} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 14px',
              borderBottom: i<arr.length-1 ? `1px solid ${BD2}` : 'none',
            }}>
              <span style={{ fontSize:11,color:w(0.28),fontFamily:mono,letterSpacing:'0.04em' }}>{label}</span>
              <span style={{ fontSize:13,fontWeight:800,color,fontFamily:mono }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Senaryo tablosu */}
        {scenarios.length>0 && (
          <div>
            <button onClick={()=>setShowScen(s=>!s)} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
              padding:'10px 14px', borderRadius:8, cursor:'pointer',
              background:'rgba(255,255,255,0.03)', border:`1px solid ${BD}`,
              color:w(0.35), fontSize:11, fontFamily:mono, fontWeight:700, letterSpacing:'0.08em',
              textTransform:'uppercase', transition:'all 0.15s',
            }}>
              <span>Fiyat Senaryoları</span>
              {showScen ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            </button>

            {showScen && (
              <div style={{ marginTop:8, border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
                {/* Başlık */}
                <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 1fr', padding:'8px 14px', background:'rgba(255,255,255,0.025)', borderBottom:`1px solid ${BD}` }}>
                  {['Değişim','Fiyat','Net K/Z'].map(h=>(
                    <span key={h} style={{ fontSize:9,fontWeight:900,color:w(0.22),fontFamily:mono,letterSpacing:'0.12em',textTransform:'uppercase' }}>{h}</span>
                  ))}
                </div>
                {scenarios.map(({pct,exit,netKZ},i)=>{
                  const c = netKZ>=0 ? GREEN : RED;
                  const isZero = pct===0;
                  return (
                    <div key={pct} style={{
                      display:'grid', gridTemplateColumns:'80px 1fr 1fr', padding:'9px 14px',
                      borderBottom: i<scenarios.length-1 ? `1px solid rgba(255,255,255,0.03)` : 'none',
                      background: isZero ? 'rgba(255,255,255,0.02)' : 'transparent',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:3,height:3,borderRadius:'50%',background:c,flexShrink:0 }} />
                        <span style={{ fontSize:12,fontWeight:800,color:c,fontFamily:mono }}>{pct>0?'+':''}{pct}%</span>
                      </div>
                      <span style={{ fontSize:12,color:w(0.55),fontFamily:mono }}>₺{fmt(exit)}</span>
                      <span style={{ fontSize:12,fontWeight:800,color:c,fontFamily:mono }}>{netKZ>=0?'+':''}₺{fmt(netKZ)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ANA SAYFA
══════════════════════════════════════════════════════════════ */
export default function ToolsPage() {
  const isMobile = useIsMobile();
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, paddingBottom:32 }}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        input[type=number]{-moz-appearance:textfield}
      `}</style>

      {/* Sayfa başlığı */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 20px', background:'#07090e',
        border:`1px solid ${BD}`, borderRadius:12,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36,height:36,borderRadius:9,background:'rgba(34,211,238,0.08)',border:'1px solid rgba(34,211,238,0.2)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 16px rgba(34,211,238,0.08)' }}>
            <Wrench size={16} style={{ color:CYAN }} />
          </div>
          <div>
            <div style={{ fontSize:14,fontWeight:900,color:w(0.9),fontFamily:mono,letterSpacing:'0.08em' }}>ARAÇLAR</div>
            <div style={{ fontSize:10,color:w(0.22),fontFamily:sans,marginTop:1 }}>Hesaplamalar tamamen tarayıcıda yapılır — veri dışarıya gönderilmez</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { icon:Shield,  label:'Güvenli',  color:'rgba(34,197,94,0.7)'  },
            { icon:Target,  label:'Hassas',   color:'rgba(34,211,238,0.7)' },
          ].map(({icon:Icon,label,color})=>(
            <div key={label} style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:6,background:'rgba(255,255,255,0.03)',border:`1px solid ${BD}` }}>
              <Icon size={10} style={{ color }} />
              <span style={{ fontSize:10,color:w(0.3),fontFamily:mono }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* İki araç */}
      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit,minmax(380px,1fr))', gap:14, alignItems:'start' }}>
        <PositionCalc />
        <PLCalc />
      </div>
    </div>
  );
}
