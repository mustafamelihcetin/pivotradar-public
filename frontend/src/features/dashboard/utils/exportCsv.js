export function exportResultsToCsv(results) {
  if (!results || results.length === 0) return;

  const cols = ['Sembol', 'QRS', 'RSI', 'Trend', 'Değişim%', 'HacimOranı', 'Sinyal', 'Sektör'];
  const rows = results.map(r => [
    r.symbol   || r.Sembol || '',
    r.yzdsh    ?? r.qrs_score ?? '',
    r.rsi14_x  ?? r.rsi ?? '',
    r.trend    ?? '',
    r.change_pct ?? r.değişim ?? '',
    r.vol_ratio20 ?? r.vol_ratio ?? '',
    r.signal   ?? r.Sinyal ?? '',
    r.sector   ?? r.sektör ?? '',
  ]);

  const csv = [cols, ...rows]
    .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // BOM karakteri → Excel'de Türkçe karakter sorunu olmaz
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pivotradar_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
