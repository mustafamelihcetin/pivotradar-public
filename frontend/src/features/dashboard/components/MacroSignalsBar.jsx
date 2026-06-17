import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/core/api/client';
import { cn } from '@/shared/utils/cn';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 dakika

function SignalBadge({ label, value, colorClass, subtext }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors",
      "bg-white/[0.03] border-white/[0.06]"
    )}>
      <div className="flex flex-col min-w-0">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">{label}</span>
        <span className={cn("text-[12px] font-black tabular-nums leading-tight", colorClass)}>{value}</span>
        {subtext && <span className="text-[9px] text-white/25 leading-tight">{subtext}</span>}
      </div> 
    </div>
  );
}


function vixInfo(regime) {
  if (regime === 2) return { label: 'KORKU', cls: 'text-red-400' };
  if (regime === 1) return { label: 'DİKKAT', cls: 'text-amber-400' };
  return { label: 'NORMAL', cls: 'text-emerald-400' };
}

function trendInfo(pct) {
  const sign = pct >= 0 ? '+' : '';
  const val = `${sign}${Number(pct).toFixed(2)}%`;
  if (pct >= 0.5)  return { val, cls: 'text-emerald-400' };
  if (pct <= -0.5) return { val, cls: 'text-red-400' };
  return { val, cls: 'text-white/50' };
}

function regimeLabel(mr) {
  const vix = Math.floor(mr / 10);
  const dir = mr % 10 >= 0 ? Math.round(mr % 10) : Math.round(mr % 10);
  const dirVal = mr - Math.floor(mr / 10) * 10;
  if (vix === 2) return { label: 'KRİZ', cls: 'text-red-400' };
  if (vix === 1 && dirVal < 0) return { label: 'AYI', cls: 'text-orange-400' };
  if (dirVal > 0.5) return { label: 'BOĞA', cls: 'text-emerald-400' };
  if (dirVal < -0.5) return { label: 'AYI', cls: 'text-red-400' };
  return { label: 'NÖTR', cls: 'text-white/50' };
}

export function MacroSignalsBar() {
  const [signals, setSignals] = useState(null);
  const intervalRef = useRef(null);

  const fetchSignals = async () => {
    const data = await api.getMarketSignals();
    if (data) setSignals(data);
  };

  useEffect(() => {
    fetchSignals();
    intervalRef.current = setInterval(fetchSignals, REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  if (!signals) return null;

  const bist = trendInfo(signals.bist100_trend_5d ?? 0);
  const usd  = trendInfo(signals.usdtry_change_5d ?? 0);
  const vix  = vixInfo(signals.vix_regime ?? 0);
  const reg  = regimeLabel(signals.market_regime ?? 0);

  return (
    <div className="flex items-center gap-2 flex-wrap px-1">
      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/15 shrink-0">MAKRO</span>
      <SignalBadge
        label="BIST100 5G"
        value={bist.val}
        colorClass={bist.cls}
      />
      <SignalBadge
        label="VIX"
        value={vix.label}
        colorClass={vix.cls}
        subtext={`Rejim ${signals.vix_regime ?? 0}`}
      />
      <SignalBadge
        label="USD/TRY 5G"
        value={usd.val}
        colorClass={usd.cls}
      />
      <SignalBadge
        label="PİYASA"
        value={reg.label}
        colorClass={reg.cls}
      />
    </div>
  );
}
