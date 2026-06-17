import React from 'react';
import { useFormContext } from 'react-hook-form';
import { 
  Zap, 
  Volume2, 
  Activity, 
  TrendingUp, 
  ShieldCheck, 
  Filter,
  Sparkles,
  BarChart3,
  Dna,
  Settings2
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export function FilterControls() {
  const { register, watch, setValue } = useFormContext();
  const volThreshold = watch('volThreshold');
  const rsiThreshold = watch('rsiThreshold');
  const prefilterEnabled = watch('prefilterEnabled');
  const topN = watch('topN');
  const trendFilter = watch('trendFilter') ?? true;
  const volBlast = watch('volBlast') ?? 1.2;
  const rsiPeriod = watch('rsiPeriod') ?? 14;
  const signalMultiplier = watch('signalMultiplier') ?? 1.0;

  return (
    <div className="space-y-10">
      {/* Configuration Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Core Constraints Card */}
        <div className="p-8 rounded-[2rem] bg-surface-variant/10 border border-outline-variant/10 backdrop-blur-3xl space-y-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
              <Filter size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Temel Kısıtlar</h3>
              <p className="text-[10px] text-on-surface-variant/50 font-bold uppercase tracking-[0.2em]">Hisse Eleme Parametreleri</p>
            </div>
          </div>

          <div className="space-y-8 relative z-10">
            {/* Volume Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} className="text-primary/60" />
                  <span className="text-[11px] font-black text-on-surface-variant/80 uppercase tracking-widest">Min. Günlük Hacim (Lot)</span>
                </div>
                <div className="text-right">
                  <span className="text-primary font-black text-2xl tracking-tighter">{(volThreshold / 1000).toFixed(0)}K</span>
                </div>
              </div>
              <input
                type="range" min="10000" max="5000000" step="10000"
                {...register('volThreshold')}
                className="w-full h-2 bg-surface-variant/40 rounded-full appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-on-surface-variant/30 font-black tracking-widest">
                <span>10K</span><span>2.5M</span><span>5M</span>
              </div>
            </div>

            {/* RSI Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-primary/60" />
                  <span className="text-[11px] font-black text-on-surface-variant/80 uppercase tracking-widest">Maks. RSI Değeri</span>
                </div>
                <div className="text-right">
                  <span className="text-primary font-black text-2xl tracking-tighter">≤ {rsiThreshold}</span>
                </div>
              </div>
              <input
                type="range" min="10" max="70" step="1"
                {...register('rsiThreshold')}
                className="w-full h-2 bg-surface-variant/40 rounded-full appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-on-surface-variant/30 font-black tracking-widest">
                <span>10 (Aşırı Satım)</span><span>70 (Aşırı Alım)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Confirmation Card */}
        <div className="p-8 rounded-[2rem] bg-surface-variant/10 border border-outline-variant/10 backdrop-blur-3xl space-y-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 blur-3xl -mr-16 -mt-16 group-hover:bg-secondary/10 transition-colors" />

          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center text-secondary shadow-inner">
              <Activity size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Teknik Teyit</h3>
              <p className="text-[10px] text-on-surface-variant/50 font-bold uppercase tracking-[0.2em]">Hassasiyet Ayarları</p>
            </div>
          </div>

          <div className="space-y-8 relative z-10">
             {/* Vol Blast Slider */}
             <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-secondary/60" />
                  <span className="text-[11px] font-black text-on-surface-variant/80 uppercase tracking-widest">Hacim Patlaması (V5/V20)</span>
                </div>
                <div className="text-right">
                  <span className="text-secondary font-black text-2xl tracking-tighter">×{volBlast}</span>
                </div>
              </div>
              <input
                type="range" min="1.0" max="3.0" step="0.1"
                {...register('volBlast')}
                className="w-full h-2 bg-surface-variant/40 rounded-full appearance-none cursor-pointer accent-secondary"
              />
              <div className="flex justify-between text-[10px] text-on-surface-variant/30 font-black tracking-widest">
                <span>Normal</span><span>Agresif</span><span>Ekstrem</span>
              </div>
            </div>

            {/* Toggles Grid */}
            <div className="grid grid-cols-1 gap-4">
              <button 
                type="button"
                onClick={() => setValue('trendFilter', !trendFilter)}
                className={cn(
                  "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300",
                  trendFilter ? "bg-secondary/10 border-secondary/30" : "bg-surface-variant/10 border-outline-variant/10 opacity-60"
                )}
              >
                <div className="flex items-center gap-3 text-left">
                  <TrendingUp size={18} className={trendFilter ? "text-secondary" : "text-on-surface-variant/40"} />
                  <div>
                    <div className={cn("text-[11px] font-black uppercase tracking-tight", trendFilter ? "text-secondary" : "text-on-surface")}>Trend Teyidi</div>
                    <p className="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">EMA 5 {">"} EMA 20 Şartı</p>
                  </div>
                </div>
                <div className={cn("w-10 h-5 rounded-full relative transition-all border shrink-0", trendFilter ? "bg-secondary border-secondary" : "bg-surface-variant/60 border-outline-variant/20")}>
                  <div className={cn("absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all", trendFilter ? "translate-x-5" : "")} />
                </div>
              </button>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-primary/20 bg-primary/5">
                <div className="flex items-center gap-3">
                  <Sparkles size={18} className="text-primary" />
                  <div>
                    <div className="text-[11px] font-black text-primary uppercase tracking-tight">AI Vision Pre-Scan</div>
                    <p className="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">Derin formasyon analizi aktif</p>
                  </div>
                </div>
                <ShieldCheck size={20} className="text-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Expert Controls Bar */}
      <div className="p-8 rounded-[2rem] border border-outline-variant/10 bg-surface-variant/5 backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-700">
         <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-lg border border-primary/20">
               <Settings2 size={22} />
            </div>
            <div>
               <h4 className="text-sm font-black text-white uppercase tracking-widest">Gelişmiş Analiz Parametreleri</h4>
               <p className="text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-widest">Expert Mode Özel Ayarlar</p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {/* RSI Period */}
            <div className="space-y-4">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">RSI Hesaplama Periyodu</span>
                  <span className="px-2 py-1 rounded bg-white/5 border border-white/5 text-[11px] font-mono font-bold text-primary">{rsiPeriod}</span>
               </div>
               <input 
                  type="range" min="2" max="50" step="1"
                  {...register('rsiPeriod')}
                  className="w-full h-1.5 bg-surface-variant/30 rounded-full appearance-none cursor-pointer accent-primary"
               />
               <div className="flex justify-between text-[8px] text-on-surface-variant/20 font-black uppercase tracking-widest">
                  <span>Hızlı (2)</span><span>Sert (50)</span>
               </div>
            </div>

            {/* Signal Multiplier */}
            <div className="space-y-4">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">Sinyal Hassasiyeti (QRS)</span>
                  <span className="px-2 py-1 rounded bg-white/5 border border-white/5 text-[11px] font-mono font-bold text-secondary">×{signalMultiplier}</span>
               </div>
               <input 
                  type="range" min="0.5" max="2.0" step="0.1"
                  {...register('signalMultiplier')}
                  className="w-full h-1.5 bg-surface-variant/30 rounded-full appearance-none cursor-pointer accent-secondary"
               />
               <div className="flex justify-between text-[8px] text-on-surface-variant/20 font-black uppercase tracking-widest">
                  <span>Gevşek</span><span>Agresif</span>
               </div>
            </div>

            {/* AI Confirmation Weight */}
            <div className="space-y-4">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">AI Teyit Ağırlığı</span>
                  <span className="px-2 py-1 rounded bg-white/5 border border-white/5 text-[11px] font-mono font-bold text-tertiary">YÜKSEK</span>
               </div>
               <div className="flex gap-2">
                  {['Düşük', 'Normal', 'Yüksek'].map(lvl => (
                     <button 
                        key={lvl}
                        type="button"
                        className={cn(
                           "flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                           lvl === 'Yüksek' ? "bg-tertiary/20 border-tertiary text-tertiary" : "bg-white/5 border-white/5 text-on-surface-variant/40 hover:bg-white/10"
                        )}
                     >
                        {lvl}
                     </button>
                  ))}
               </div>
            </div>
         </div>
      </div>

      {/* Pre-filter Section (Full Width) */}
      <div className={cn(
        "p-8 rounded-[2rem] border transition-all duration-500 relative overflow-hidden",
        prefilterEnabled ? "bg-primary/5 border-primary/25 shadow-2xl shadow-primary/5" : "bg-surface-variant/10 border-outline-variant/10 shadow-inner"
      )}>
        <div className="absolute top-0 left-0 w-64 h-64 bg-primary/5 blur-[100px] -ml-32 -mt-32" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div className="flex items-start gap-4 flex-1">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
              prefilterEnabled ? "bg-primary text-on-primary" : "bg-surface-variant/40 text-on-surface-variant/40"
            )}>
              <Dna size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className={cn("text-base font-black uppercase tracking-widest", prefilterEnabled ? "text-primary" : "text-on-surface-variant")}>Ön Eleme Motoru (High-Velocity)</h3>
                {prefilterEnabled && <span className="bg-primary/20 text-primary text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-primary/30">Turbo Aktif</span>}
              </div>
              <p className="text-[11px] text-on-surface-variant/55 max-w-lg leading-relaxed">
                Piyasa evrenini (332+ hisse) taramadan önce skora göre ön elemeye tabi tutarak analiz hızını %400 artırır. Çoklu testler için tavsiye edilir.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-8">
            {prefilterEnabled && (
              <div className="flex flex-col gap-2 min-w-[200px] animate-in slide-in-from-right duration-500">
                <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest text-right">Top-N Sınırı</p>
                <div className="flex gap-2">
                  {[50, 100, 200].map((n) => (
                    <button 
                      key={n} 
                      type="button" 
                      onClick={() => setValue('topN', n)}
                      className={cn(
                        "flex-1 py-3 px-4 rounded-xl border text-sm font-black transition-all",
                        topN === n 
                          ? "bg-primary text-on-primary border-primary shadow-[0_10px_20px_rgba(34,211,238,0.3)]" 
                          : "bg-surface-variant/20 border-outline-variant/10 text-on-surface-variant/40 hover:border-primary/40 hover:text-primary"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setValue('prefilterEnabled', !prefilterEnabled)}
              className={cn(
                "w-16 h-8 rounded-full relative transition-all duration-500 shadow-xl border shrink-0",
                prefilterEnabled ? "bg-primary border-primary" : "bg-surface-variant/60 border-outline-variant/20"
              )}
            >
              <div className={cn("absolute top-1 left-1.5 w-5 h-5 rounded-full bg-white shadow-lg transition-all", prefilterEnabled ? "translate-x-8" : "")} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
