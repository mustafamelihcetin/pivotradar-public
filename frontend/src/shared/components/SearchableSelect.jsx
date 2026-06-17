import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/utils/cn';

/**
 * Premium Searchable Select Component
 * @param {Object} props
 * @param {Array} props.options - Array of { value, label, icon? }
 * @param {any} props.value - Current selected value
 * @param {Function} props.onChange - Selection change handler
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - Container class
 * @param {boolean} props.disabled - Disabled state
 * @param {boolean} props.searchable - Enable/disable search (default true)
 * @param {boolean} props.compact - Compact mode for small UI areas
 */
export function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Seçiniz...',
  className = '',
  disabled = false,
  searchable = true,
  icon,
  compact = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = useMemo(() => 
    options.find(opt => opt.value === value), 
  [options, value]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    return options.filter(opt => 
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      (opt.value && String(opt.value).toLowerCase().includes(search.toLowerCase()))
    );
  }, [options, search]);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      window.addEventListener('scroll', updateCoords, true);
    } else {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    }
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        // Also check if click was on the portal content
        const portalMenu = document.getElementById('searchable-select-portal-menu');
        if (portalMenu && portalMenu.contains(event.target)) return;
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, searchable]);

  const handleSelect = (option) => {
    if (disabled) return;
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between gap-3 bg-[#131720] border border-white/[0.08] rounded-xl transition-all text-left",
          compact ? "px-2 py-1 text-[10px]" : "px-4 py-3 text-sm",
          isOpen ? "border-primary/40 ring-1 ring-primary/20" : "hover:border-white/20",
          disabled && "opacity-50 cursor-not-allowed",
          !selectedOption && "text-white/30"
        )}
      >
        <div className="flex items-center gap-2.5 truncate">
          {icon && <span className={cn("material-symbols-outlined text-white/25", compact ? "text-[16px]" : "text-[18px]")}>{icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <span className={cn(
          "material-symbols-outlined text-white/20 transition-transform duration-200",
          compact ? "text-[16px]" : "text-[20px]",
          isOpen && "rotate-180"
        )}>
          expand_more
        </span>
      </button>

      {/* Portal Dropdown */}
      {createPortal(
        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              id="searchable-select-portal-menu"
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                top: coords.top + 8,
                left: coords.left,
                width: coords.width,
                zIndex: 99999
              }}
              className="bg-[#111520]/95 backdrop-blur-xl border border-white/[0.12] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden"
            >
              {searchable && (
                <div className="p-2 border-b border-white/[0.08] bg-white/[0.02]">
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-white/20">search</span>
                    <input
                      ref={inputRef}
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Ara..."
                      className="w-full bg-[#161a24] border border-white/[0.06] rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-primary/30 transition-all"
                    />
                  </div>
                </div>
              )}

              <div className="max-h-[240px] overflow-y-auto custom-scrollbar p-1">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(option)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all text-left",
                        value === option.value 
                          ? "bg-primary/10 text-primary font-bold" 
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {option.icon && <span className="material-symbols-outlined text-[16px]">{option.icon}</span>}
                      <span className="flex-1">{option.label}</span>
                      {value === option.value && (
                        <span className="material-symbols-outlined text-[16px]">check</span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="py-8 px-4 text-center">
                    <span className="material-symbols-outlined text-white/10 text-3xl mb-2">search_off</span>
                    <p className="text-[10px] text-white/20 uppercase tracking-widest">Sonuç Bulunamadı</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
