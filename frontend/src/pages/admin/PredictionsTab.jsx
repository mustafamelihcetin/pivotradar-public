import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { aFetch, Spinner, Badge, DirBadge, T, TableWrap, Th, Td } from './shared';

const R = 6;

function PagBtn({ icon, disabled, onClick }) {
  return (
    <button disabled={disabled} onClick={onClick}
      style={{ width: 36, height: 36, borderRadius: 5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: disabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.4)', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.14s' }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
    </button>
  );
}

export function PredictionsTab() {
  const [page, setPage] = useState(1);
  const [sym, setSym]   = useState('');
  const [dir, setDir]   = useState('');
  const [ev, setEv]     = useState('');
  const [qMin, setQMin] = useState('');

  const params = {
    page, per_page: 50,
    ...(sym  ? { symbol: sym }    : {}),
    ...(dir  ? { direction: dir } : {}),
    ...(ev === 'yes' ? { evaluated: true } : ev === 'no' ? { evaluated: false } : {}),
    ...(qMin ? { qrs_min: qMin } : {}),
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['a-predictions', params],
    queryFn: ({ signal }) => aFetch(`/api/admin/predictions?${new URLSearchParams(params)}`, { signal }),
    staleTime: 15_000, placeholderData: keepPreviousData,
  });
  const { data: stats } = useQuery({
    queryKey: ['a-stats'],
    queryFn: () => aFetch('/api/admin/stats'),
    staleTime: 30_000, placeholderData: keepPreviousData,
  });

  const c = stats?.calibration || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Başlık ── */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>Tahmin Takip & Kalibrasyon Matrisi</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
          Her tarama oturumunda üretilen QRS skoru, hedef fiyat ve yön parametrelerini içerir. Vade dolumunda gerçek piyasa verileriyle otomatik karşılaştırılır.
        </p>
      </div>

      {/* ── Info banner ── */}
      <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 280, height: 280, background: `${T.primary}03`, filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, position: 'relative' }}>
          {[
            {
              label: 'Toplam Tahmin Kaydı',
              value: data?.total?.toLocaleString('tr-TR') ?? '—',
              color: 'rgba(255,255,255,0.8)',
              sub: 'Sistemin bugüne kadar ürettiği tüm tahminler',
            },
            {
              label: 'Değerlendirildi',
              value: c.total_evaluated?.toLocaleString('tr-TR') ?? '—',
              color: T.success,
              sub: 'Vadesi dolmuş ve sonucu öğrenilen tahminler',
            },
            {
              label: 'Vade Bekliyor',
              value: c.pending?.toLocaleString('tr-TR') ?? '—',
              color: T.warning,
              sub: 'Henüz sonucu bilinmeyen, vade bekleyen tahminler',
            },
            {
              label: 'Hedef Fiyat Başarı Oranı',
              value: `%${c.hit_rate || 0}`,
              color: c.hit_rate >= 60 ? T.primary : T.warning,
              sub: 'Hedef fiyata tam ulaşma oranı (değerlendirilen tahminlerde)',
            },
          ].map(m => (
            <div key={m.label}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.18)', margin: '0 0 6px' }}>{m.label}</p>
              <p style={{ fontSize: 22, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: m.color, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{m.value}</p>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: 0, lineHeight: 1.5 }}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(255,255,255,0.15)', pointerEvents: 'none' }}>search</span>
          <input value={sym} onChange={e => { setSym(e.target.value.toUpperCase()); setPage(1); }} placeholder="SEMBOL..."
            style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.7)', outline: 'none', width: 110 }}
            onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.25)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
        </div>

        <SearchableSelect value={dir} onChange={val => { setDir(val); setPage(1); }}
          options={[{ value: '', label: 'TÜM YÖNLER' }, { value: 'bullish', label: '▲ YÜKSELİŞ BEKLENTİSİ', icon: 'trending_up' }, { value: 'bearish', label: '▼ DÜŞÜŞ BEKLENTİSİ', icon: 'trending_down' }]}
          compact searchable={false} className="w-36" />

        <SearchableSelect value={ev} onChange={val => { setEv(val); setPage(1); }}
          options={[{ value: '', label: 'TÜM DURUMLAR' }, { value: 'yes', label: '✓ DEĞERLENDİRİLDİ', icon: 'done_all' }, { value: 'no', label: '⏳ VADE BEKLENİYOR', icon: 'timer' }]}
          compact searchable={false} className="w-44" />

        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'rgba(255,255,255,0.15)', pointerEvents: 'none' }}>filter_list</span>
          <input value={qMin} onChange={e => { setQMin(e.target.value); setPage(1); }} placeholder="MIN QRS..." type="number" min={0} max={100}
            style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 8, paddingBottom: 8, borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.08)', fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.7)', outline: 'none', width: 100, fontFamily: "'IBM Plex Mono', monospace" }}
            onFocus={e => e.target.style.borderColor = 'rgba(153,247,255,0.25)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
        </div>

        {data && (
          <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.15)', marginLeft: 'auto' }}>
            Sayfa {page} / {data.pages || 1}
          </p>
        )}
      </div>

      {/* ── Table ── */}
      {isLoading && !data ? (
        <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
          {error ? <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: T.danger }}>Hata: {error.message}</p> : <Spinner size={20} />}
        </div>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Sembol</Th>
              <Th>Tarama Tarihi</Th>
              <Th>QRS Sinyal Skoru</Th>
              <Th right>Kapanış Fiyatı</Th>
              <Th right>Hedef Fiyat</Th>
              <Th>Beklenen Yön</Th>
              <Th>Sonuç Durumu</Th>
              <Th right>İsabet Doğruluğu</Th>
              <Th right>Gerçekleşen Getiri</Th>
              <Th>Tarama Profili</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map(r => (
              <tr key={r.id} style={{ transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '9px 14px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 900, color: T.primary, borderBottom: '1px solid rgba(255,255,255,0.025)', letterSpacing: '-0.01em' }}>{r.symbol}</td>
                <Td mono muted>{r.scan_date}</Td>
                <Td>
                  <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: r.qrs_score >= 80 ? T.success : r.qrs_score >= 60 ? T.primary : T.danger }}>
                    %{r.qrs_score?.toFixed(1) ?? '—'}
                  </span>
                </Td>
                <Td right mono muted>₺{r.close_price?.toFixed(2) ?? '—'}</Td>
                <Td right mono>₺{r.target_price ? r.target_price.toFixed(2) : '—'}</Td>
                <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  <DirBadge d={r.target_direction} />
                </td>
                <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  <Badge status={r.hit_status} />
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  {r.hit_accuracy_pct != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={{ width: 44, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, r.hit_accuracy_pct)}%` }}
                          style={{ height: '100%', background: r.hit_accuracy_pct >= 90 ? T.success : T.primary, borderRadius: 2 }}
                        />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>%{r.hit_accuracy_pct?.toFixed(0)}</span>
                    </div>
                  ) : <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>}
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: (r.actual_return_pct || 0) >= 0 ? T.success : T.danger }}>
                    {r.actual_return_pct != null ? (r.actual_return_pct >= 0 ? '+' : '') + r.actual_return_pct.toFixed(2) + '%' : '—'}
                  </span>
                </td>
                <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 7px', borderRadius: 3, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                    {r.profile_name || '—'}
                  </span>
                </td>
              </tr>
            ))}
            {!data?.items?.length && (
              <tr>
                <td colSpan={10} style={{ padding: '64px 0', textAlign: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(255,255,255,0.05)', display: 'block', marginBottom: 12 }}>dataset</span>
                  <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.3em', color: 'rgba(255,255,255,0.1)', margin: '0 0 4px' }}>Eşleşen tahmin kaydı bulunamadı</p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.08)', margin: 0 }}>Filtrelerinizi değiştirmeyi deneyin</p>
                </td>
              </tr>
            )}
          </tbody>
        </TableWrap>
      )}

      {/* ── Pagination ── */}
      {data && data.pages > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <PagBtn icon="first_page"    disabled={page <= 1}          onClick={() => setPage(1)} />
          <PagBtn icon="chevron_left"  disabled={page <= 1}          onClick={() => setPage(p => p - 1)} />
          <div style={{ padding: '0 16px', borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', minWidth: 72, justifyContent: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>{page} / {data.pages}</span>
          </div>
          <PagBtn icon="chevron_right" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} />
          <PagBtn icon="last_page"     disabled={page >= data.pages} onClick={() => setPage(data.pages)} />
        </div>
      )}
    </div>
  );
}
