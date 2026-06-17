import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

/**
 * Global (Singleton-like) Toast Notifier for PivotRadar.
 * Uses event listeners to show notifications from anywhere.
 */
export function ToastNotifier() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleAdd = (e) => {
      const { message, type = 'info', duration = 3000 } = e.detail;
      const id = Date.now();
      setToasts(prev => [...prev, { id, message, type, duration }]);
      
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    };

    window.addEventListener('pr-notify', handleAdd);
    return () => window.removeEventListener('pr-notify', handleAdd);
  }, []);

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999] flex flex-col gap-3 pointer-events-none w-[calc(100%-2rem)] sm:w-auto max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            className="pointer-events-auto w-full bg-[#0c0f15]/95 backdrop-blur-3xl border border-white/10 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-start gap-3 sm:gap-4 overflow-hidden relative"
          >
            {/* Status accent line */}
            <div className={cn("absolute left-0 top-0 bottom-0 w-1", 
              toast.type === 'success' ? "bg-emerald-500" : toast.type === 'warn' ? "bg-amber-500" : "bg-primary"
            )} />

            <div className="flex-shrink-0 mt-0.5 ml-1">
              {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
              {toast.type === 'info' && <Info size={16} className="text-primary" />}
              {toast.type === 'warn' && <AlertCircle size={16} className="text-amber-400" />}
            </div>
            
            <div className="flex-grow min-w-0 pr-1">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30 mb-1 leading-none">
                {toast.type === 'success' ? 'Başarılı' : toast.type === 'warn' ? 'Uyarı' : 'Bilgi'}
              </p>
              <p className="text-[12px] font-bold text-white/90 leading-tight break-words">
                {toast.message}
              </p>
            </div>

            <button 
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-white/20 hover:text-white transition-colors p-1 -mr-1"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/**
 * Utility to trigger a notification from anywhere in JS/React.
 */
export const notify = (message, type = 'info', duration = 3000) => {
  window.dispatchEvent(new CustomEvent('pr-notify', { 
    detail: { message, type, duration } 
  }));
};
