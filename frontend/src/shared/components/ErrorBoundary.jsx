import React from 'react';
import PropTypes from 'prop-types';

/**
 * PivotRadar Safety Shield (ErrorBoundary)
 * Herhangi bir bileşen çöktüğünde 'Siyah Ekran' oluşmasını engelleyerek
 * kullanıcıya bir geri yükleme (Reload) butonu sunar.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("CRITICAL UI CRASH DETECTED:", error, errorInfo);
    // Report to Sentry if initialized
    try {
      const Sentry = window.__SENTRY__;
      if (Sentry?.captureException) Sentry.captureException(error, { extra: errorInfo });
    } catch (_) { /* Sentry not available */ }
  }

  handleReload = () => {
    // location.reload() may not clear the ES module cache in some browsers.
    // A fresh navigation with a cache-bust param guarantees a clean load.
    const url = new URL(window.location.href);
    url.searchParams.set('_r', Date.now());
    window.location.replace(url.toString());
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-8 space-y-6">
          <div className="w-24 h-24 rounded-3xl bg-error/10 flex items-center justify-center border border-error/20">
             <span className="material-symbols-outlined text-5xl text-error animate-pulse">report</span>
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-headline font-bold text-on-surface uppercase tracking-widest">SİSTEM KURTARMA MODU</h1>
            <p className="text-on-surface-variant/60 font-mono text-[11px] max-w-md mx-auto leading-relaxed uppercase tracking-wider">
               Bir bileşende hata tespit edildi. UI bütünüyle kararmadan önce güvenlik kalkanı devreye girdi. 
               <br/><br/>
               Hata Detayı: <span className="text-error/60">{this.state.error?.message}</span>
            </p>
          </div>
          <button 
            onClick={this.handleReload}
            className="px-12 py-4 bg-primary text-on-primary font-bold rounded-2xl shadow-2xl hover:scale-105 transition-transform active:scale-95 uppercase tracking-[0.2em]"
          >
            SİSTEMİ YENİDEN YÜKLE
          </button>
          
          <div className="text-[9px] text-on-surface-variant/20 font-mono">
            PIVOTRADAR - KESİNTİSİZ TERMİNAL GÜVENLİĞİ
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ErrorBoundary;
