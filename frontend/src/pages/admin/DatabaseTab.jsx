import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '@/core/api/client';
import { aFetch, Spinner, SectionTitle, Btn, T, notify, relTime, TableWrap, Th, Td } from './shared';

const R = 6;

// ── Backup list ───────────────────────────────────────────────────────────────
function BackupList({ qc }) {
  const { data: backups, isLoading } = useQuery({
    queryKey: ['a-db-backups'],
    queryFn: () => aFetch('/api/admin/db/backups'),
    staleTime: 30_000,
  });

  const handleNewBackup = async () => {
    try {
      const res = await aFetch('/api/admin/db/backup', { method: 'POST' });
      notify('Yedekleme başarılı' + (res?.filename ? ': ' + res.filename : '.'), 'success');
      qc.invalidateQueries({ queryKey: ['a-db-backups'] });
    } catch (e) {
      notify('Yedekleme hatası: ' + e.message, 'error');
    }
  };

  if (isLoading) return <div style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.7)', margin: '0 0 3px' }}>Sistem Yedekleri</p>
          <p style={{ fontSize: 9, color: T.dim, margin: 0, lineHeight: 1.5 }}>
            Tam veritabanı anlık görüntüsü (JSON formatı). Her yedek indirilip güvenli bir yere kaydedilebilir.
          </p>
        </div>
        <Btn variant="primary" onClick={handleNewBackup} title="Şu anki veritabanının tam yedeğini oluştur">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          YENİ YEDEK OLUŞTUR
        </Btn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxHeight: 200, overflowY: 'auto' }} className="custom-scrollbar">
        {backups?.length > 0 ? backups.map((b, i) => (
          <div key={i} style={{ padding: '12px 14px', borderRadius: R, background: T.bg3, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(153,247,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 0 3px' }} title={b.filename}>{b.filename}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{b.size_kb} KB</span>
                <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)' }}>{new Date(b.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  const { token } = (await import('@/store/useAuthStore')).default.getState();
                  const res = await fetch(`/api/admin/db/backup/download?filename=${encodeURIComponent(b.filename)}`, {
                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = b.filename;
                  document.body.appendChild(a); a.click(); a.remove();
                  window.URL.revokeObjectURL(url);
                } catch { notify('İndirme başarısız.', 'error'); }
              }}
              style={{ flexShrink: 0, padding: 6, borderRadius: 4, background: 'none', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.14s' }}
              onMouseEnter={e => { e.currentTarget.style.color = T.primary; e.currentTarget.style.borderColor = 'rgba(153,247,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
              title="Bu yedek dosyasını bilgisayarınıza indirin"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
            </button>
          </div>
        )) : (
          <div style={{ gridColumn: 'span 3', padding: '32px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: R }}>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: T.faint, margin: 0 }}>Henüz yedek dosyası oluşturulmadı</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Prune panel ───────────────────────────────────────────────────────────────
function PrunePanel({ dbStats, qc }) {
  const [pruning, setPruning] = useState(null);
  const [pruneResult, setPruneResult] = useState(null);
  const [confirmMode, setConfirmMode] = useState(null);

  const r = dbStats?.rows || {};

  const handlePrune = async (mode, days) => {
    if (confirmMode !== mode) { setConfirmMode(mode); return; }
    setConfirmMode(null);
    setPruning(mode); setPruneResult(null);
    try {
      const res = await api.admin.pruneDb(mode, days);
      setPruneResult({ ok: true, msg: `${res.deleted} kayıt başarıyla silindi.` });
      qc.invalidateQueries({ queryKey: ['a-db-stats'] });
      qc.invalidateQueries({ queryKey: ['a-stats'] });
    } catch (e) {
      setPruneResult({ ok: false, msg: e.message });
    }
    setPruning(null);
  };

  const pruneItems = [
    {
      mode: 'neutral',
      days: 90,
      label: 'Nötr Yönlü Kayıtlar',
      count: r.neutral,
      color: T.warning,
      desc: 'Hedef fiyat veya yön vektörü olmayan girişler. Veritabanı indeks optimizasyonu için güvenle silinebilir.',
    },
    {
      mode: 'stale',
      days: 180,
      label: 'Değerlendirilmemiş Eskimiş Bekleyenler',
      count: r.unevaluated,
      color: T.primary,
      desc: 'Değerlendirme olmadan süresi dolmuş tahminler. Genellikle delisted semboller veya veri boşluklarından kaynaklanır.',
    },
    {
      mode: 'evaluated',
      days: 730,
      label: 'Değerlendirilmiş Arşiv',
      count: r.evaluated,
      color: T.danger,
      desc: 'Tamamlanmış ve kalibrasyon hesaplamalarında kullanılmış kayıtlar. Uzun vadeli arşiv temizliği için kullanın.',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Uyarı mesajı */}
      <div style={{ padding: '10px 14px', borderRadius: R, background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: T.danger, flexShrink: 0 }}>warning</span>
        <p style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>
          Silme işlemleri <span style={{ color: T.danger }}>geri alınamaz</span>. Lütfen dikkatli kullanın. İşlem öncesi yedek almak önerilir.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {pruneItems.map(item => (
          <div key={item.mode} style={{ padding: '16px', borderRadius: R, background: T.bg2, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = `${item.color}30`}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.7)', margin: 0 }}>{item.label}</p>
              <span style={{ fontSize: 12, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: `${item.color}80` }}>{item.count?.toLocaleString('tr-TR') ?? '—'}</span>
            </div>
            <p style={{ fontSize: 9, color: T.dim, lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>{item.desc}</p>
            <button
              onClick={() => handlePrune(item.mode, item.days)}
              disabled={!!pruning}
              style={{ width: '100%', padding: '8px', borderRadius: 5, background: confirmMode === item.mode ? `${item.color}25` : `${item.color}10`, border: `1px solid ${confirmMode === item.mode ? item.color + '60' : item.color + '25'}`, color: item.color, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: pruning ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', opacity: pruning ? 0.5 : 1 }}
              onMouseEnter={e => { if (!pruning) { e.currentTarget.style.background = `${item.color}20`; e.currentTarget.style.borderColor = `${item.color}40`; } }}
              onMouseLeave={e => { if (confirmMode !== item.mode) { e.currentTarget.style.background = `${item.color}10`; e.currentTarget.style.borderColor = `${item.color}25`; } }}
              title={confirmMode === item.mode ? 'Bir kez daha tıklayarak onaylayın' : `${item.days}+ günlük ${item.label.toLowerCase()} sil`}
            >
              {pruning === item.mode ? 'SİLİNİYOR...' : confirmMode === item.mode ? '⚠ ONAYLIYORUM — SİL' : `${item.days}+ GÜNLÜK KAYITLARI SİL`}
            </button>
          </div>
        ))}
      </div>

      {pruneResult && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          style={{ padding: '10px 16px', borderRadius: R, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', textAlign: 'center', border: `1px solid ${pruneResult.ok ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`, background: pruneResult.ok ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)', color: pruneResult.ok ? T.success : T.danger }}
        >
          {pruneResult.msg}
        </motion.div>
      )}
    </div>
  );
}

// ── Table data viewer ─────────────────────────────────────────────────────────
function TableDataView({ tableName, onBack }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['a-db-table-data', tableName, page],
    queryFn: () => aFetch(`/api/admin/db/table/${tableName}?page=${page}&per_page=50`),
    placeholderData: keepPreviousData,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{ width: 36, height: 36, borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.14s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
            title="Tablo listesine geri dön"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          </button>
          <div>
            <p style={{ fontSize: 14, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: T.primary, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 2px' }}>Ham Veritabanı Tablosu: {tableName}</p>
            <p style={{ fontSize: 9, color: T.dim, margin: 0, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Sayfa {page} / {data?.pages || 1} · Toplam {data?.total?.toLocaleString('tr-TR') ?? '—'} kayıt
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.success, boxShadow: `0 0 6px ${T.success}80` }} />
          <span style={{ fontSize: 9, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{data?.total?.toLocaleString('en-US') ?? '—'} Kayıt</span>
        </div>
      </div>

      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', margin: 0, lineHeight: 1.5 }}>
        Bu görünüm veritabanındaki ham verileri gösterir. Salt okunurdur, değişiklik yapılamaz.
      </p>

      {isLoading ? (
        <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : (
        <div>
          <div style={{ borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '65vh', overflowY: 'auto' }} className="custom-scrollbar">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: T.bg3, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {(data?.columns || []).map(col => (
                      <th key={col} style={{ padding: '10px 12px', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.2)', textAlign: 'left', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.04)' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.items || []).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {(data?.columns || []).map(col => (
                        <td key={col} style={{ padding: '7px 12px', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.025)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={String(row[col])}>
                          {row[col] === null ? <span style={{ opacity: 0.2, fontStyle: 'italic' }}>NULL</span> : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data?.pages > 1 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
              {[['first_page', 1, page <= 1], ['chevron_left', page - 1, page <= 1], null, ['chevron_right', page + 1, page >= data.pages], ['last_page', data.pages, page >= data.pages]].map((item, i) => (
                item === null
                  ? <div key="mid" style={{ padding: '0 14px', borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.35)' }}>{page} / {data.pages}</span>
                    </div>
                  : <button key={i} disabled={item[2]} onClick={() => setPage(item[1])}
                      style={{ width: 34, height: 34, borderRadius: 5, background: T.bg2, border: '1px solid rgba(255,255,255,0.06)', color: item[2] ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)', cursor: item[2] ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{item[0]}</span>
                    </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main DatabaseTab ──────────────────────────────────────────────────────────
export function DatabaseTab() {
  const qc = useQueryClient();
  const [selectedTable, setSelectedTable] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: tables, isLoading, refetch } = useQuery({
    queryKey: ['a-db-tables'],
    queryFn: () => api.admin.getDbTables(),
    staleTime: 60_000,
    enabled: !selectedTable,
  });
  const { data: dbStats } = useQuery({
    queryKey: ['a-db-stats'],
    queryFn: () => api.admin.getDbStats(),
    staleTime: 60_000,
    enabled: !selectedTable,
  });

  const runMaintenance = async (action, table) => {
    setBusy(true);
    notify(`${table} için ${action.toUpperCase()} başlatılıyor...`, 'info');
    try {
      await aFetch(`/api/admin/db/${action}?table=${table}`, { method: 'POST' });
      notify(`${table} → ${action.toUpperCase()} tamamlandı.`, 'success');
      refetch();
    } catch (e) {
      notify(e.message?.includes('409') || e.message?.includes('devam ediyor')
        ? 'Başka bir bakım işlemi devam ediyor. Lütfen bekleyin.'
        : `İşlem başarısız: ${e.message}`, 'error');
    }
    setBusy(false);
  };

  if (isLoading && !tables && !selectedTable) return (
    <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  );
  if (selectedTable) return <TableDataView tableName={selectedTable} onBack={() => setSelectedTable(null)} />;

  const r  = dbStats?.rows || {};
  const sz = dbStats?.size || {};
  const g  = dbStats?.growth || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Başlık */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>Veritabanı Sağlığı ve Bakım</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
          PostgreSQL veritabanının boyutu, büyüme hızı ve tablo bakım işlemleri. Yedek almak, eski kayıtları temizlemek ve indeksleri optimize etmek için bu sayfayı kullanın.
        </p>
      </div>

      {/* Header metrics */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, borderRadius: R, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { label: 'Toplam Kayıt Sayısı',       value: r.total?.toLocaleString('tr-TR') ?? '—',   color: 'rgba(255,255,255,0.85)', sub: 'Veritabanındaki tüm satırlar' },
            { label: 'Disk Kullanımı',             value: sz.table_mb != null ? `${sz.table_mb} MB` : '—', color: T.primary, sub: 'Tablo verisi toplam boyutu' },
            { label: 'Günlük Büyüme (7 Günlük)',   value: g.rows_per_day_7d != null ? `+${g.rows_per_day_7d}` : '—', color: T.success, sub: 'Ortalama yeni kayıt/gün' },
            { label: 'Yıllık Büyüme Tahmini',      value: g.est_yearly?.toLocaleString('tr-TR') ?? '—', color: 'rgba(255,255,255,0.2)', sub: 'Mevcut hızla 1 yıl sonra' },
          ].map((m, i) => (
            <div key={i} style={{ padding: '18px 20px', background: T.bg2, borderRight: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', margin: '0 0 8px' }}>{m.label}</p>
              <p style={{ fontSize: 24, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: m.color, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{m.value}</p>
              <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.12)', margin: 0, lineHeight: 1.5 }}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Prune panel */}
      <div>
        <SectionTitle icon="auto_delete" title="Veri Temizleme (Prune)" />
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 10px', lineHeight: 1.6 }}>
          Veritabanındaki eski ve gereksiz kayıtları silerek disk alanı ve sorgu performansı kazanın.
        </p>
        <PrunePanel dbStats={dbStats} qc={qc} />
      </div>

      {/* Backup section */}
      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <BackupList qc={qc} />
      </div>

      {/* Tables */}
      <div>
        <SectionTitle icon="table_view" title="Tablo Bakımı ve Ham Veri İnceleme" />
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 10px', lineHeight: 1.6 }}>
          Her tablo için VACUUM (ölü satır temizleme) ve REINDEX (index yeniden oluşturma) işlemi çalıştırabilirsiniz. "İncele" ile tablodaki ham verileri görüntüleyebilirsiniz.
        </p>
        <div style={{ maxHeight: 280, overflowY: 'auto' }} className="custom-scrollbar">
        <TableWrap>
          <thead>
            <tr>
              <Th>Tablo Adı</Th>
              <Th right>Aktif Satır</Th>
              <Th right>Ölü Satır (Temizlik Gerektirebilir)</Th>
              <Th right>Boyut</Th>
              <Th right>İşlemler</Th>
            </tr>
          </thead>
          <tbody>
            {(tables || []).map(t => (
              <tr key={t.name} style={{ transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: `${T.primary}60`, boxShadow: `0 0 6px ${T.primary}30`, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.7)' }}>{t.name}</span>
                  </div>
                </td>
                <Td right mono>{t.live_rows.toLocaleString()}</Td>
                <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 900, color: t.dead_rows > 100 ? T.danger : 'rgba(255,255,255,0.15)' }}>
                    {t.dead_rows.toLocaleString()}
                  </span>
                </td>
                <Td right mono muted>{(t.total_bytes / 1024 / 1024).toFixed(1)} MB</Td>
                <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button disabled={busy} onClick={() => runMaintenance('vacuum', t.name)}
                      style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.18)', color: T.success, fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.14s', opacity: busy ? 0.5 : 1 }}
                      title="Ölü satırları temizle, disk alanını geri kazan">
                      VACUUM
                    </button>
                    <button disabled={busy} onClick={() => runMaintenance('reindex', t.name)}
                      style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.18)', color: '#60a5fa', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.14s', opacity: busy ? 0.5 : 1 }}
                      title="Sorgu hızını artırmak için tabloyu yeniden indeksle">
                      REINDEX
                    </button>
                    <button onClick={() => setSelectedTable(t.name)}
                      style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.14s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                      title="Tablodaki ham verileri sayfalı şekilde görüntüle">
                      HAM VERİ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        </div>
      </div>
    </div>
  );
}

// ── AuditLogTab ───────────────────────────────────────────────────────────────
export function AuditLogTab() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['a-audit-logs'],
    queryFn: () => aFetch('/api/admin/audit-logs'),
    refetchInterval: 30_000,
  });

  if (isLoading && !logs) return (
    <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionTitle icon="history_edu" title="Sistem Denetim Kaydı (Audit Trail)" />
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: '-4px 0 0', lineHeight: 1.6 }}>
          Yöneticiler tarafından gerçekleştirilen tüm işlemlerin zaman damgalı kaydı.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }} className="custom-scrollbar">
        {logs?.map(l => (
          <div key={l.id} style={{ padding: '12px 14px', borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: T.bg2, display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'background 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.background = T.bg3}
            onMouseLeave={e => e.currentTarget.style.background = T.bg2}
          >
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.purple }}>admin_panel_settings</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.75)', margin: 0 }}>{l.admin}</p>
                <p style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: T.dim, margin: 0 }}>{relTime(l.timestamp)}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: l.details ? 10 : 0 }}>
                <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 7px', borderRadius: 3, background: 'rgba(153,247,255,0.08)', border: '1px solid rgba(153,247,255,0.18)', color: T.primary }}>{l.action}</span>
                <span style={{ fontSize: 10, color: T.dim }}>{l.target || 'Sistem'}</span>
              </div>
              {l.details && (
                <div style={{ padding: '10px 12px', borderRadius: 5, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.03)', fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.25)', whiteSpace: 'pre-wrap', overflowX: 'auto' }} className="custom-scrollbar">
                  {JSON.stringify(l.details, null, 2)}
                </div>
              )}
            </div>
          </div>
        ))}
        {!logs?.length && (
          <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, border: '1px dashed rgba(255,255,255,0.05)', borderRadius: R }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(255,255,255,0.05)' }}>history_edu</span>
            <p style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: T.faint, margin: 0 }}>Henüz denetim kaydı bulunmuyor</p>
          </div>
        )}
      </div>
    </div>
  );
}
