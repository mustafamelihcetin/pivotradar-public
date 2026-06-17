// Shared right-click context menu primitives — kullanılan her sayfada import edilir
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/** State yönetimi: menu = { x, y, data } | null */
export function useCtxMenu() {
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    if (!menu) return;
    const close  = () => setMenu(null);
    const onKey  = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click',   close,  { once: true });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!menu]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Element üzerinde sağ tık — preventDefault + stopPropagation */
  const open = (e, data = {}) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, data });
  };

  /** Document listener'dan genel menü için — koordinat doğrudan verilir */
  const openAt = (x, y, data = {}) => {
    setMenu({ x, y, data });
  };

  return { menu, open, openAt, close: () => setMenu(null) };
}

export function CtxDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '3px 0' }} />;
}

export function CtxItem({ icon, label, accent, onClick, danger }) {
  const [h, setH] = useState(false);
  const col = danger
    ? (h ? '#f87171' : 'rgba(248,113,113,0.55)')
    : accent || (h ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)');
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
        background: h ? (danger ? 'rgba(248,113,113,0.06)' : 'rgba(255,255,255,0.05)') : 'transparent',
        transition: 'background 0.08s', color: col,
      }}
    >
      <span style={{ flexShrink: 0, opacity: 0.65, display: 'flex' }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

export function CtxInfo({ color, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 14px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.04em' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

/** Ana container — createPortal ile body'e render eder */
export function CtxMenu({ x, y, onClose, header, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(x, window.innerWidth  - width  - 8),
      top:  Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: pos.left, top: pos.top, zIndex: 10000,
        minWidth: 210, background: '#0d1117',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6, boxShadow: '0 20px 60px rgba(0,0,0,0.85)',
        overflow: 'hidden', userSelect: 'none',
      }}
    >
      {header && (
        <div style={{
          padding: '9px 14px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.015)',
        }}>
          {header}
        </div>
      )}
      {children}
    </div>,
    document.body
  );
}
