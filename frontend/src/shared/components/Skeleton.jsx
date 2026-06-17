import PropTypes from 'prop-types';
/**
 * Skeleton — Yükleme sırasında içerik iskelet göstergesi.
 * Boş ekran yerine anlayışlı bir "yükleniyor" deneyimi sunar (Faz 3B).
 */
import { cn } from '@/shared/utils/cn';

// Tek bir shimmer satırı
export function SkeletonLine({ className = '', width = 'w-full', height = 'h-3' }) {
  return (
    <div className={cn(
      'rounded animate-pulse bg-white/[0.05]',
      width, height, className
    )} />
  );
}

// Fiyat/skor hücresi için kare blok
export function SkeletonBlock({ className = '', size = 'h-5 w-12' }) {
  return (
    <div className={cn(
      'rounded animate-pulse bg-white/[0.05]',
      size, className
    )} />
  );
}

// CandidateTable için tek satır iskelet
export function SkeletonTableRow({ cols = 7 }) {
  const widths = ['w-16', 'w-14', 'w-10', 'w-10', 'w-8', 'w-10', 'w-12'];
  return (
    <tr className="border-b border-outline-variant/5">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="py-4 px-1">
          <div className={cn('h-3 rounded animate-pulse bg-white/[0.05]', widths[i] || 'w-10')} />
        </td>
      ))}
    </tr>
  );
}

// Birden fazla satır iskelet
export function SkeletonTable({ rows = 8, cols = 7 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </tbody>
  );
}

// Grafik alanı iskeleti
export function SkeletonChart({ height = 360 }) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      {/* Sahte eksen çizgileri */}
      <div className="flex flex-col justify-between h-full py-4 px-6">
        {[0.85, 0.65, 0.5, 0.35, 0.15].map((ratio, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-2 rounded bg-white/[0.04]" />
            <div className="flex-1 h-px bg-white/[0.03]" />
          </div>
        ))}
      </div>
      {/* Sahte bar/candle kolonları */}
      <div
        className="absolute bottom-8 left-16 right-4 flex items-end gap-1"
        style={{ position: 'absolute', bottom: 32, left: 64, right: 16, display: 'flex', alignItems: 'flex-end', gap: 3 }}
      >
        {Array.from({ length: 28 }).map((_, i) => {
          const h = 20 + Math.sin(i * 0.8) * 15 + Math.random() * 25;
          return (
            <div
              key={i}
              className="flex-1 rounded-sm bg-white/[0.05]"
              style={{ height: `${h}%`, minHeight: 4 }}
            />
          );
        })}
      </div>
    </div>
  );
}

// Stat kart iskeleti
export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-3 animate-pulse">
      <div className="h-2 w-20 rounded bg-white/[0.05]" />
      <div className="h-6 w-16 rounded bg-white/[0.07]" />
      <div className="h-2 w-24 rounded bg-white/[0.04]" />
    </div>
  );
}
