import React, { useState, useEffect, Component } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '@/store/useAuthStore';

import { TabBtn, Notification } from './admin/shared';
import { LiveTab }        from './admin/LiveTab';
import { OverviewTab }    from './admin/OverviewTab';
import { DiagnosticsTab } from './admin/DiagnosticsTab';
import { PipelineTab }    from './admin/PipelineTab';
import { QrsAnalysisTab } from './admin/QrsAnalysisTab';
import { PredictionsTab } from './admin/PredictionsTab';
import { DatabaseTab, AuditLogTab } from './admin/DatabaseTab';
import { UsersTab }       from './admin/UsersTab';
import { SettingsTab }    from './admin/SettingsTab';

const TABS = [
  { id: 'pulse',       label: 'Nabız',          icon: 'monitor_heart'     },
  { id: 'overview',    label: 'Genel Bakış',     icon: 'bar_chart'         },
  { id: 'diagnostics', label: 'Tanılama',        icon: 'health_and_safety' },
  { id: 'engine',      label: 'Zeka Motoru',     icon: 'psychology'        },
  { id: 'analytics',   label: 'Piyasa Analiz',   icon: 'analytics'         },
  { id: 'records',     label: 'Tahmin Arşivi',   icon: 'inventory_2'       },
  { id: 'database',    label: 'Veritabanı',      icon: 'database'          },
  { id: 'audit',       label: 'Audit Log',       icon: 'history_edu'       },
  { id: 'users',       label: 'Üyeler',          icon: 'group'             },
  { id: 'settings',    label: 'Ayarlar',         icon: 'tune'              },
];

class AdminErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center', padding: 40 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'rgba(248,113,113,0.3)' }}>error</span>
        <h2 style={{ fontSize: 16, fontWeight: 900, color: '#f87171', margin: 0 }}>Admin Paneli Hatası</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', maxWidth: 420, margin: 0 }}>{this.state.error?.message || 'Bilinmeyen hata'}</p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          style={{ marginTop: 8, padding: '8px 20px', borderRadius: 6, background: 'rgba(153,247,255,0.08)', border: '1px solid rgba(153,247,255,0.2)', color: '#99f7ff', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          Yeniden Dene
        </button>
      </div>
    );
    return this.props.children;
  }
}

function AdminPageInner() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pulse');
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      setNotification(e.detail);
      setTimeout(() => setNotification(null), 4000);
    };
    window.addEventListener('admin-notify', handler);
    return () => window.removeEventListener('admin-notify', handler);
  }, []);

  if (!user || !user.is_superuser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center', background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: 40 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(248,113,113,0.25)' }}>lock</span>
        <h2 style={{ fontSize: 16, fontWeight: 900, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Admin Erişimi Gerekli</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Bu sayfa yalnızca sistem yöneticilerine açıktır.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── PAGE HEADER ── */}
      <div style={{ background: '#07090e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '10px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 2, height: 18, borderRadius: 1, background: '#99f7ff', boxShadow: '0 0 6px rgba(153,247,255,0.5)', flexShrink: 0 }} />
          <div>
            <span style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Admin Merkezi</span>
            <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', marginTop: 2, letterSpacing: '0.06em' }}>
              Sistem monitörü · Scan kuyruk · Kullanıcı yönetimi · QRS kalibrasyon
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/terminal-classic')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, background: 'rgba(153,247,255,0.06)', border: '1px solid rgba(153,247,255,0.18)', cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(153,247,255,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(153,247,255,0.06)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'rgba(153,247,255,0.8)' }}>dashboard</span>
            <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(153,247,255,0.8)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.08em' }}>KLASİK TERMİNAL</span>
          </button>
          {user?.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 4, background: 'rgba(153,247,255,0.04)', border: '1px solid rgba(153,247,255,0.14)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'rgba(153,247,255,0.7)' }}>admin_panel_settings</span>
              <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(153,247,255,0.7)', fontFamily: "'IBM Plex Mono', monospace" }}>{user.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, paddingBottom: 2 }}>
        {TABS.map(t => <TabBtn key={t.id} {...t} active={activeTab === t.id} onClick={setActiveTab} />)}
      </div>

      {/* ── TAB CONTENT ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'pulse'       && <LiveTab />}
          {activeTab === 'overview'    && <OverviewTab />}
          {activeTab === 'diagnostics' && <DiagnosticsTab />}
          {activeTab === 'engine'      && <PipelineTab />}
          {activeTab === 'analytics'   && <QrsAnalysisTab />}
          {activeTab === 'records'     && <PredictionsTab />}
          {activeTab === 'database'    && <DatabaseTab />}
          {activeTab === 'audit'       && <AuditLogTab />}
          {activeTab === 'users'       && <UsersTab />}
          {activeTab === 'settings'    && <SettingsTab />}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {notification && <Notification {...notification} onClose={() => setNotification(null)} />}
      </AnimatePresence>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminErrorBoundary>
      <AdminPageInner />
    </AdminErrorBoundary>
  );
}
