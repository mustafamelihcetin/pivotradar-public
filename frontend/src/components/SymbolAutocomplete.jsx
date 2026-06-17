import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

/**
 * Reusable symbol autocomplete input.
 * Props:
 *   value          — current input value (string)
 *   onChange       — (text: string) => void — raw text change
 *   onSelect       — (symbol: string) => void — user picked a suggestion
 *   placeholder    — input placeholder text
 *   inputStyle     — style object applied to the <input> element
 *   symbols        — [{symbol: string, name: string}] suggestion source
 *   maxSuggestions — max dropdown rows (default 8)
 *   onKeyDown      — extra key handler (called after internal handling)
 */
export default function SymbolAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Hisse ara...',
  inputStyle = {},
  symbols = [],
  maxSuggestions = 8,
  onKeyDown: externalKeyDown,
  inputId,
}) {
  const [open, setOpen]         = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  const suggestions = useMemo(() => {
    const q = (value || '').toUpperCase().trim();
    if (!q) return [];
    return symbols
      .filter(s =>
        s.symbol.toUpperCase().startsWith(q) ||
        (s.name && s.name.toUpperCase().includes(q))
      )
      .sort((a, b) => {
        const aExact = a.symbol.toUpperCase().startsWith(q);
        const bExact = b.symbol.toUpperCase().startsWith(q);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return  1;
        return a.symbol.localeCompare(b.symbol);
      })
      .slice(0, maxSuggestions);
  }, [value, symbols, maxSuggestions]);

  // Close on click outside
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset active when suggestions list changes
  useEffect(() => { setActiveIdx(-1); }, [suggestions.length]);

  const select = useCallback((sym) => {
    onSelect?.(sym);
    setOpen(false);
    setActiveIdx(-1);
  }, [onSelect]);

  function handleKeyDown(e) {
    const isDropdownOpen = open && suggestions.length > 0;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen) { setOpen(true); return; }
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
      return;
    }
    if (e.key === 'Enter' && isDropdownOpen && activeIdx >= 0) {
      e.preventDefault();
      select(suggestions[activeIdx].symbol);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    externalKeyDown?.(e);
  }

  const showDrop = open && suggestions.length > 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange?.(e.target.value); setOpen(true); }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        id={inputId}
        style={{ ...inputStyle }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {showDrop && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 9999,
          background: '#0b0e16',
          border: '1px solid rgba(34,211,238,0.18)',
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
          maxHeight: 224,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.symbol}
              onMouseDown={e => { e.preventDefault(); select(s.symbol); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: i === activeIdx ? 'rgba(34,211,238,0.08)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                transition: 'background 0.08s',
              }}
            >
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                fontWeight: 700,
                color: '#22d3ee',
                minWidth: 56,
                flexShrink: 0,
              }}>
                {s.symbol}
              </span>
              {s.name && (
                <span style={{
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.32)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {s.name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
