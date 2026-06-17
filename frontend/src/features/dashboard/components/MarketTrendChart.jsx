import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  defs,
  linearGradient,
  stop
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api/client';
import { TrendingUp, Activity, Sparkles } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface/90 backdrop-blur-xl border border-outline-variant/20 p-4 rounded-2xl shadow-2xl">
        <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest mb-1">{payload[0].payload.time}</p>
        <p className="text-xl font-black text-primary tracking-tighter">{payload[0].value.toLocaleString('tr-TR')} <span className="text-[10px] opacity-40 ml-1">XU100</span></p>
      </div>
    );
  }
  return null;
};

export function MarketTrendChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['market-trend-index'],
    queryFn: () => api.chart('XU100.IS', 'line'),
    refetchInterval: 300000, // 5 min
  });

  // MOCK DATA REMOVED. Using XU100 live index data.
  const chartData = data?.points || [];



  if (isLoading || chartData.length === 0) {
    return (
      <div className="h-full w-full rounded-3xl bg-surface-variant/10 border border-outline-variant/10 animate-pulse flex flex-col items-center justify-center space-y-4">
         <Activity size={32} className="text-primary/20 animate-bounce" />
         <span className="text-[10px] font-black uppercase tracking-[0.4em] text-on-surface-variant/20">XU100 ANALİZİ HAZIRLANAMIYOR</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
       <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp size={16} className="text-primary" />
             </div>
             <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-on-surface-variant/60">Piyasa Duyarlılık Endeksi</h3>
                <p className="text-[10px] text-on-surface-variant/20 uppercase font-bold tracking-widest italic leading-none">BIST 100 CANLI VERİ ANALİZİ</p>
             </div>
          </div>
          <div className="flex items-center gap-2 bg-on-surface-variant/5 px-3 py-1 rounded-full border border-on-surface-variant/10 shadow-inner">
             <Sparkles size={12} className="text-primary animate-pulse" />
             <span className="text-[9px] font-black text-primary">LIVE SYNC</span>
          </div>
       </div>

       <div className="flex-1 min-h-0 relative group rounded-2xl overflow-hidden"
         style={{ background: 'linear-gradient(180deg, rgba(34,211,238,0.03) 0%, transparent 100%)', border: '1px solid rgba(34,211,238,0.07)' }}>
          {/* Corner glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-24 bg-primary/8 blur-[60px] pointer-events-none" />

          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25}/>
                  <stop offset="60%" stopColor="#22d3ee" stopOpacity={0.06}/>
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgba(255,255,255,0.18)', fontSize: 9, fontWeight: 700 }}
                dy={8}
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(34,211,238,0.15)', strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22d3ee"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#trendGradient)"
                animationDuration={1500}
                activeDot={{ r: 5, stroke: 'rgba(34,211,238,0.3)', strokeWidth: 4, fill: '#22d3ee' }}
              />
            </AreaChart>
          </ResponsiveContainer>
       </div>
    </div>
  );
}
