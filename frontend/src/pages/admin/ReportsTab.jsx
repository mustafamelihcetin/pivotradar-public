import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/shared/utils/cn';
import { aFetch, Spinner, SectionTitle } from './shared';

function relTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Az önce';
  if (m < 60) return `${m} dakika önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} saat önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

const SOURCE_LABELS = {
  app_report: {
    label: 'Sorun Bildirimi',
    desc:  'Kullanıcı uygulama içinden hata veya aksaklık bildirdi',
    color: 'text-amber-400 bg-amber-400/[0.07] border-amber-500/20',
  },
  contact: {
    label: 'İletişim Formu',
    desc:  'Kullanıcı iletişim formu aracılığıyla mesaj gönderdi',
    color: 'text-sky-400 bg-sky-400/[0.07] border-sky-500/20',
  },
};

export function ReportsTab() {
  const qc = useQueryClient();
  const [source, setSource] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ['admin-reports', source],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (source !== 'all') params.set('source', source);
      return aFetch(`/api/support/messages?${params}`, { signal });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id) => aFetch(`/api/support/messages/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  });

  const unread = msgs.filter(m => !m.is_read).length;

  if (isLoading) return <div className="py-16 flex justify-center"><Spinner /></div>;

  return (
    <div className="space-y-6">

      {/* Başlık */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>
          Kullanıcı Bildirimleri ve İletişim Gelen Kutusu
          {unread > 0 && (
            <span style={{ marginLeft: 10, fontSize: 9, padding: '3px 8px', borderRadius: 3, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24', verticalAlign: 'middle' }}>
              {unread} OKUNMADI
            </span>
          )}
        </p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
          Kullanıcıların uygulama içi sorun bildirimleri ve iletişim formu mesajları burada toplanır. Okunmamış bildirimler sarı ile işaretlidir.
        </p>
      </div>

      <SectionTitle
        icon="flag"
        title={`Kullanıcı Bildirimleri${unread > 0 ? ` (${unread} okunmamış)` : ''}`}
        action={
          <div className="flex gap-1.5">
            {[
              ['all',        'Tümü',             'Tüm mesaj türlerini göster'],
              ['app_report', 'Sorun Bildirimi',  'Uygulama içi hata bildirimleri'],
              ['contact',    'İletişim Formu',   'Kullanıcıdan gelen genel mesajlar'],
            ].map(([val, lbl, title]) => (
              <button key={val} onClick={() => setSource(val)} title={title}
                className={cn(
                  'px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all',
                  source === val
                    ? 'bg-white/[0.06] border-white/[0.12] text-white'
                    : 'border-transparent text-white/30 hover:text-white/60 hover:border-white/10'
                )}>
                {lbl}
              </button>
            ))}
          </div>
        }
      />

      {msgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="material-symbols-outlined text-[40px] text-white/10">inbox</span>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Henüz gelen kullanıcı bildirimi yok</p>
          <p className="text-[9px] text-white/10">
            {source === 'all'
              ? 'Kullanıcılar sorun bildirimi veya iletişim formu doldurduğunda burada görünür'
              : source === 'app_report'
              ? 'Uygulama içi sorun bildirimi henüz gönderilmedi'
              : 'İletişim formu aracılığıyla gönderilen mesaj henüz yok'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {msgs.map(m => {
            const src = SOURCE_LABELS[m.source] || SOURCE_LABELS.contact;
            const isOpen = expanded === m.id;
            return (
              <div key={m.id}
                className={cn(
                  'rounded-2xl border transition-all overflow-hidden',
                  m.is_read
                    ? 'border-white/[0.04] bg-[#0a0d14]'
                    : 'border-amber-500/20 bg-amber-500/[0.03]'
                )}>
                <button
                  onClick={() => {
                    setExpanded(isOpen ? null : m.id);
                    if (!m.is_read) markRead.mutate(m.id);
                  }}
                  className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
                  title={isOpen ? 'Mesajı kapat' : 'Mesajı aç ve okundu olarak işaretle'}
                >
                  {!m.is_read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" title="Okunmamış bildirim" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border', src.color)}
                        title={src.desc}>
                        {src.label}
                      </span>
                      <span className="text-[10px] font-black text-white/80 truncate">{m.subject}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] text-white/30 font-mono">{m.email}</span>
                      <span className="text-[9px] text-white/20">{relTime(m.created_at)}</span>
                    </div>
                  </div>
                  <span className={cn(
                    'material-symbols-outlined text-[16px] text-white/20 shrink-0 transition-transform mt-0.5',
                    isOpen && 'rotate-180'
                  )}>expand_more</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-white/[0.04]">
                    <p className="text-[10px] text-white/30 font-mono mb-2 pt-3">
                      {m.name} · {new Date(m.created_at).toLocaleString('tr-TR')}
                    </p>
                    <p className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap">{m.message}</p>
                    {!m.is_read && (
                      <button
                        onClick={() => markRead.mutate(m.id)}
                        title="Bu bildirimi okundu olarak işaretle — gelen kutusu sayısını azaltır"
                        className="mt-3 text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors"
                      >
                        Okundu Olarak İşaretle
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
