import PropTypes from 'prop-types';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';

/**
 * InfoTip — fixed-position tooltip portal.
 * Automatically flips top↔bottom and clamps horizontally to stay inside viewport.
 */
const TIP_W  = 272;
const GAP    = 8;
const MARGIN = 10;
const AW     = 7; // arrow half-width px

export function InfoTip({ content, children, side = 'top' }) {
  const [visible, setVisible] = useState(false);
  const [geo,     setGeo]     = useState(null);
  const trigRef  = useRef(null);
  const hideRef  = useRef(null);

  const place = useCallback(() => {
    const el = trigRef.current;
    if (!el) return;
    const r  = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Flip logic: prefer side, but flip if not enough room (need ~80px)
    const above = side === 'top'
      ? (r.top >= 80 || r.top > vh - r.bottom)   // prefer top, fallback bottom
      : (r.bottom > vh - 80 && r.top > vh - r.bottom); // prefer bottom, fallback top

    // Y (fixed coords)
    const y = above ? r.top - GAP : r.bottom + GAP;

    // X — center on trigger, clamp
    const cx   = r.left + r.width / 2;
    const left = Math.max(MARGIN, Math.min(cx - TIP_W / 2, vw - TIP_W - MARGIN));

    // Arrow offset inside tooltip box
    const arrowLeft = Math.min(Math.max(cx - left - AW, 10), TIP_W - AW * 2 - 10);

    setGeo({ above, y, left, arrowLeft });
  }, [side]);

  const show = useCallback(() => { clearTimeout(hideRef.current); place(); setVisible(true); }, [place]);
  const hide = useCallback(() => { hideRef.current = setTimeout(() => setVisible(false), 130); }, []);
  useEffect(() => () => clearTimeout(hideRef.current), []);

  if (!content) return children ?? null;

  return (
    <>
      {/* Trigger */}
      <span
        ref={trigRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {children ?? (
          <Info size={12} style={{ color: 'rgba(255,255,255,0.28)', cursor: 'help', flexShrink: 0 }} />
        )}
      </span>

      {/* Tooltip — rendered into body, position: fixed */}
      {createPortal(
        <AnimatePresence>
          {visible && geo && (
            <motion.div
              key="tip"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.11 }}
              onMouseEnter={() => clearTimeout(hideRef.current)}
              onMouseLeave={hide}
              style={{
                position: 'fixed',
                left: geo.left,
                width: TIP_W,
                zIndex: 2147483647,
                pointerEvents: 'auto',
                ...(geo.above
                  ? { bottom: window.innerHeight - geo.y }
                  : { top: geo.y }),
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
            >
              {/* If above: box first, arrow below */}
              {geo.above && (
                <>
                  <div style={boxStyle}>{content}</div>
                  <Arrow left={geo.arrowLeft} dir="down" />
                </>
              )}
              {/* If below: arrow first, box below */}
              {!geo.above && (
                <>
                  <Arrow left={geo.arrowLeft} dir="up" />
                  <div style={boxStyle}>{content}</div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

const boxStyle = {
  background: '#1c2235',
  border: '1px solid rgba(255,255,255,0.11)',
  borderRadius: 10,
  padding: '10px 14px',
  fontSize: 12,
  lineHeight: 1.65,
  color: 'rgba(255,255,255,0.84)',
  fontWeight: 400,
  letterSpacing: 'normal',
  textTransform: 'none',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
  boxShadow: '0 12px 32px rgba(0,0,0,0.8)',
};

function Arrow({ left, dir }) {
  return (
    <div style={{
      width: 0, height: 0,
      marginLeft: left,
      flexShrink: 0,
      borderLeft: `${AW}px solid transparent`,
      borderRight: `${AW}px solid transparent`,
      ...(dir === 'down'
        ? { borderTop: `${AW}px solid #1c2235` }
        : { borderBottom: `${AW}px solid #1c2235` }),
    }} />
  );
}
