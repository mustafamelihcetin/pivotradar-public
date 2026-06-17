import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { aFetch, Spinner, SectionTitle, T, notify } from './shared';

const R = 6;

// ── Inline slider control ──────────────────────────────────────────────────────
function SliderField({ label, desc, value, min, max, step = 1, suffix = '', color = T.primary, onChange }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)', margin: 0 }}>{label}</p>
        <span style={{ fontSize: 14, fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%', height: 4, borderRadius: 2, appearance: 'none', WebkitAppearance: 'none', outline: 'none', cursor: 'pointer',
          background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
        }}
        className="pr-slider"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)' }}>{min}{suffix}</span>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1.4, textAlign: 'center', flex: 1, padding: '0 8px' }}>{desc}</span>
        <span style={{ fontSize: 8, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.15)' }}>{max}{suffix}</span>
      </div>
    </div>
  );
}

// ── Inline toggle control ──────────────────────────────────────────────────────
function ToggleField({ label, desc, value, color = T.success, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 5, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.6)', margin: '0 0 3px' }}>{label}</p>
        {desc && <p style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1.5, margin: 0 }}>{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        style={{ width: 40, height: 22, borderRadius: 99, background: value ? color : 'rgba(255,255,255,0.1)', boxShadow: value ? `0 0 10px ${color}50` : 'none', border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', transition: 'all 0.2s', marginTop: 2 }}>
        <div style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'all 0.2s', left: value ? 21 : 3 }} />
      </button>
    </div>
  );
}

// ── Quick-edit panel for scanner_config (sliders + toggles) ────────────────────
function QuickEditPanel({ settings, onSave }) {
  const sc = settings?.scanner_config;
  const [draft, setDraft] = useState(null);
  const [state, setState] = useState('idle'); // idle | saving | saved
  const syncedRef = useRef(false);

  // One-time sync once settings arrive (settings may be undefined on first render)
  useEffect(() => {
    if (sc && !syncedRef.current) { syncedRef.current = true; setDraft({ ...sc }); }
  }, [sc]);

  if (!draft) return null;

  const set = (k, v) => { setDraft(d => ({ ...d, [k]: v })); setState('idle'); };
  const dirty = JSON.stringify(draft) !== JSON.stringify(sc);

  const handleSave = async () => {
    setState('saving');
    try {
      await onSave('scanner_config', draft);
      setState('saved');
      setTimeout(() => setState('idle'), 2200);
    } catch { setState('idle'); }
  };

  return (
    <div style={{ padding: 18, borderRadius: R, border: '1px solid rgba(153,247,255,0.1)', background: 'linear-gradient(135deg, rgba(153,247,255,0.03), rgba(255,255,255,0.012))', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: R, background: 'rgba(153,247,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 19, color: T.primary }}>tune</span>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>Hızlı Tarama Ayarları</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: 0, lineHeight: 1.5 }}>Temel tarama parametrelerini kaydırıcı ve anahtarlarla ayarlayın. JSON editörüne gerek yok.</p>
          </div>
        </div>
        <AnimatePresence mode="wait">
          {state === 'saved' ? (
            <motion.button key="saved" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              disabled
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: T.success, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'default', fontFamily: 'inherit' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>Kaydedildi
            </motion.button>
          ) : (
            <motion.button key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={handleSave} disabled={!dirty || state === 'saving'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, background: dirty ? T.primary : 'rgba(255,255,255,0.04)', border: dirty ? 'none' : '1px solid rgba(255,255,255,0.08)', color: dirty ? '#000' : 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: dirty && state !== 'saving' ? 'pointer' : 'not-allowed', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {state === 'saving' ? <><Spinner size={12} />Kaydediliyor...</> : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>save</span>{dirty ? 'Kaydet' : 'Güncel'}</>}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <SliderField label="Maks. Sembol" desc="taramada analiz edilecek sembol" value={draft.max_symbols ?? 200} min={50} max={500} step={10} color={T.primary} onChange={v => set('max_symbols', v)} />
        <SliderField label="Bekleme Süresi" desc="taramalar arası bekleme" value={draft.cooldown_sec ?? 5} min={0} max={120} step={1} suffix="s" color={T.warning} onChange={v => set('cooldown_sec', v)} />
        <SliderField label="Maks. Kuyruk" desc="aynı anda bekleyen talep" value={draft.max_queue ?? 5} min={1} max={20} step={1} color={T.purple} onChange={v => set('max_queue', v)} />
        <SliderField label="Otomatik Tarama Aralığı" desc="otomatik tarama sıklığı" value={draft.auto_scan_interval_minutes ?? 15} min={5} max={120} step={5} suffix="dk" color={T.success} onChange={v => set('auto_scan_interval_minutes', v)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <ToggleField label="ML Skorlama" desc="Kapalıyken yalnızca QRS kullanılır." value={!!draft.ml_enabled} onChange={v => set('ml_enabled', v)} />
        <ToggleField label="Formasyon Tespiti" desc="Teknik pattern algılamayı açar." value={!!draft.pattern_enabled} onChange={v => set('pattern_enabled', v)} />
        <ToggleField label="Otomatik Tarama" desc="Zamanlanmış otomatik taramayı açar." value={!!draft.auto_scan_enabled} color={T.primary} onChange={v => set('auto_scan_enabled', v)} />
      </div>
    </div>
  );
}

const CONFIG_FIELD_DOCS = {
  scanner_config: [
    { key: 'max_symbols',                 type: 'int',    desc: 'Tek taramada analiz edilecek maksimum sembol sayısı.' },
    { key: 'cooldown_sec',                type: 'int',    desc: 'Ardışık iki tarama arasındaki bekleme süresi (saniye).' },
    { key: 'max_queue',                   type: 'int',    desc: 'Sırada bekleyebilecek maksimum eşzamanlı tarama talebi.' },
    { key: 'ml_enabled',                  type: 'bool',   desc: 'ML skorlaması aktif/pasif. Kapalıysa sadece QRS kullanılır.' },
    { key: 'pattern_enabled',             type: 'bool',   desc: 'Teknik formasyon (pattern) tespitini açar/kapatır.' },
    { key: 'scan_interval_min',           type: 'int',    desc: 'Manuel tarama tetiklemeleri arasındaki minimum süre (dakika).' },
    { key: 'auto_scan_enabled',           type: 'bool',   desc: 'Zamanlanmış otomatik taramayı aktifleştirir.' },
    { key: 'auto_scan_interval_minutes',  type: 'int',    desc: 'Otomatik tarama aralığı — dakika cinsinden.' },
    { key: 'auto_scan_interval_hours',    type: 'int',    desc: 'Otomatik tarama aralığı — saat cinsinden (dakikaya ek olarak).' },
  ],
  ml_config: [
    { key: 'min_samples',       type: 'int',    desc: 'Model eğitimi için gereken minimum etiketli veri sayısı.' },
    { key: 'calib_window_days', type: 'int',    desc: 'Kalibrasyon için kullanılacak geriye dönük gün penceresi.' },
    { key: 'half_life_days',    type: 'int',    desc: 'Eski tahminlerin ağırlığı bu sürede yarıya düşer (exponential decay).' },
    { key: 'soft_weights',      type: 'object', desc: 'Etiket başına yumuşak ağırlıklar: target_hit, near_miss, partial, miss.' },
  ],
  db_config: [
    { key: 'retention_days',     type: 'int',  desc: 'Değerlendirilen kayıtların silinmeden önce tutulacağı gün sayısı. Minimum 20.' },
    { key: 'prune_neutral_days', type: 'int',  desc: 'Nötr yönlü (signal=neutral) kayıtların temizleneceği yaş. Minimum 20.' },
    { key: 'auto_prune_enabled', type: 'bool', desc: 'Günlük otomatik veritabanı temizliğini aktifleştirir.' },
  ],
  anomaly_config: [
    { key: 'win_rate_min',   type: 'float', desc: 'Bu oranın altına düşen yönsel isabet oranı anormal sayılır (örn: 0.30 = %30).' },
    { key: 'deviation_max', type: 'float', desc: 'Ortalama hedef büyüklük sapması bu yüzdeyi aşarsa alarm üretilir.' },
    { key: 'window_days',   type: 'int',   desc: 'Anomali hesabı için geriye bakılacak gün sayısı.' },
    { key: 'min_samples',   type: 'int',   desc: 'Kontrol yapılabilmesi için gereken minimum tahmin kaydı sayısı.' },
  ],
  prism_config: [
    { key: 'raw_danger_threshold',     type: 'int',   desc: 'Ham PRISM skoru bu değerin altındaysa "tehlikeli" sinyali verilmez.' },
    { key: 'rsi_heat_shield',          type: 'int',   desc: 'RSI bu eşiği aşarsa aşırı-alım kalkanı devreye girer (ceza puanı).' },
    { key: 'atr_extreme_threshold',    type: 'int',   desc: 'ATR bu değeri aşarsa ekstrem volatilite olarak işaretlenir.' },
    { key: 'bull_trap_momentum_min',   type: 'float', desc: 'Bull trap tespiti için minimum momentum eşiği.' },
    { key: 'bull_trap_vol_max',        type: 'float', desc: 'Bull trap için maksimum hacim oranı eşiği (spike sonrası düşüş).' },
    { key: 'zero_liquidity_threshold', type: 'float', desc: 'Bu oranın altındaki hacim likidite sıfır kabul edilir.' },
  ],
  data_config: [
    { key: 'fresh_ttl_hours', type: 'int', desc: 'Veri "taze" sayılacak süre (saat). Bu süreden eski veri yeniden çekilir.' },
    { key: 'usable_ttl_days', type: 'int', desc: 'Verinin "kullanılabilir" sayılacağı maksimum yaş (gün). Aşılırsa analiz reddedilir.' },
  ],
};

// Her JSON yapılandırma grubunun Türkçe başlık ve açıklaması
const CONFIG_GROUP_META = {
  scanner_config:  { title: 'Tarama Motoru Ayarları',         icon: 'radar',          color: T.primary,  desc: 'BIST hisselerinin ne sıklıkla tarandığını, kaç sembolün analiz edileceğini ve ML skorlamasının aktif olup olmayacağını belirler.' },
  ml_config:       { title: 'Makine Öğrenmesi Parametreleri', icon: 'model_training',  color: T.purple,   desc: 'Modelin eğitim koşulları: minimum veri, kalibrasyon penceresi ve zamansal ağırlık azalma (half-life) değerleri.' },
  db_config:       { title: 'Veritabanı Saklama Politikası',  icon: 'database',        color: T.success,  desc: 'Değerlendirilen tahminlerin kaç gün saklanacağı, nötr kayıtların ne zaman temizleneceği ve otomatik prune zamanlaması.' },
  anomaly_config:  { title: 'Anomali Algılama Eşikleri',      icon: 'analytics',       color: T.warning,  desc: 'İsabet oranı bu eşiğin altına düşerse veya hedef sapması bu değeri aşarsa sistem uyarı üretir.' },
  prism_config:    { title: 'PRISM Filtresi Parametreleri',   icon: 'filter_alt',      color: T.danger,   desc: 'Yüksek riskli (bull trap, aşırı-alım, düşük likidite) sinyalleri elemek için kullanılan ceza puanı eşikleri.' },
  data_config:     { title: 'Veri Tazelik Yapılandırması',    icon: 'refresh',         color: '#60a5fa',  desc: 'Fiyat verisinin "taze" ve "kullanılabilir" sayıldığı süre sınırları. Bu değerleri aşan veri yeniden çekilir veya reddedilir.' },
};

const TYPE_COLORS = {
  int:    '#60a5fa',
  float:  T.purple,
  bool:   T.warning,
  object: T.success,
};

const FLAG_DESCRIPTIONS = {
  ticker_bar_enabled:   'Sayfanın üstündeki canlı fiyat ticker çubuğunu gösterir/gizler.',
  scanner_enabled:      'Quant tarama motorunu aktifleştirir. Kapalıyken kullanıcılar analiz başlatamaz.',
  backtest_enabled:     'Geçmiş veri üzerinde strateji testi yapan backtest modülünü açar/kapatır.',
  strategy_enabled:     'Strateji oluşturucu sayfasına erişimi kontrol eder.',
  logs_enabled:         'Kullanıcıların sistem izleyici (/logs) sayfasına erişimini açar/kapatır.',
  help_enabled:         'Yardım merkezi sayfasını aktifleştirir.',
  registration_enabled: 'Yeni kullanıcı kayıtlarını açar. Kapalıyken kayıt formu hata verir.',
  maintenance_mode:     'Bakım modunu aktifleştirir. Tüm giriş yapmış kullanıcıları kilitler (adminler hariç).',
};

export function SettingsTab() {
  const qc = useQueryClient();
  const [busy, setBusy]                         = useState(false);
  const [jsonDrafts, setJsonDrafts]             = useState({});
  const [jsonErrors, setJsonErrors]             = useState({});
  const [dirtyKeys, setDirtyKeys]               = useState(new Set());
  const [tickerConfirmIdx, setTickerConfirmIdx] = useState(null);
  const newSymRef = useRef(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['a-settings'],
    queryFn: () => aFetch('/api/admin/settings'),
    staleTime: 60_000,
  });

  const JSON_KEYS = ['scanner_config', 'ml_config', 'db_config', 'anomaly_config', 'prism_config', 'data_config'];

  const initializedRef = useRef(false);
  useEffect(() => {
    if (!settings || initializedRef.current) return;
    initializedRef.current = true;
    const drafts = {};
    JSON_KEYS.forEach(key => {
      if (settings[key] !== undefined) drafts[key] = JSON.stringify(settings[key], null, 2);
    });
    setJsonDrafts(drafts);
  }, [settings]);

  const update = async (key, val) => {
    setBusy(true);
    try {
      await aFetch('/api/admin/settings', { method: 'POST', body: JSON.stringify({ [key]: val }) });
      qc.invalidateQueries({ queryKey: ['a-settings'] });
      notify(`${key} başarıyla güncellendi.`, 'success');
    } catch (e) {
      notify(`Güncelleme hatası: ${e.message}`, 'error');
      throw e;
    } finally { setBusy(false); }
  };

  const handleJsonSave = async (key) => {
    const raw = jsonDrafts[key] ?? '';
    try {
      const parsed = JSON.parse(raw);
      setJsonErrors(prev => ({ ...prev, [key]: null }));
      await update(key, parsed);
      setDirtyKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
    } catch {
      setJsonErrors(prev => ({ ...prev, [key]: 'Geçersiz JSON formatı — kaydetmeden önce düzeltin.' }));
    }
  };

  if (isLoading && !settings) return <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 20 }}>

      {/* Sayfa başlığı */}
      <div style={{ paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.75)', margin: '0 0 4px' }}>Sistem Yapılandırma Merkezi</p>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
          Tarama motoru, ML modeli, veritabanı saklama politikaları ve özellik anahtarları dahil tüm sistem parametreleri.
          Değişiklikler anında uygulanır — kaydetmeden sayfadan ayrılmayın.
        </p>
      </div>

      <SectionTitle icon="tune" title="Sistem Yapılandırma Matrisi" />

      {dirtyKeys.size > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 5, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.22)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fbbf24', flexShrink: 0 }}>warning</span>
          <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Kaydedilmemiş değişiklikler var: <span style={{ color: '#fbbf24' }}>{[...dirtyKeys].join(', ')}</span>. Sayfadan ayrılmadan önce kaydedin.
          </p>
        </div>
      )}

      {/* Hızlı tarama ayarları — slider/toggle inline editör */}
      <QuickEditPanel settings={settings} onSave={update} />

      {/* Üst 2 sütun: ticker listesi + özellik anahtarları */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Ticker izleme listesi */}
        <div style={{ padding: 18, borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: 34, height: 34, borderRadius: R, background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.purple }}>currency_exchange</span>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>Varlık İzleme Listesi (Ticker)</p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: 0, lineHeight: 1.5 }}>Sayfanın üstündeki canlı fiyat çubuğunda gösterilecek semboller. Hisse kodu veya kur çifti ekleyebilirsiniz.</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }} className="custom-scrollbar">
            {settings?.ticker_symbols?.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 5, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', transition: 'border-color 0.14s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = `${T.purple}30`}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', margin: '0 0 2px' }}>{s.label || s}</p>
                  <p style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.12)', margin: 0 }}>{s.symbol || s}</p>
                </div>
                {tickerConfirmIdx === i ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { update('ticker_symbols', settings.ticker_symbols.filter((_, idx) => idx !== i)); setTickerConfirmIdx(null); }}
                      title="Kaldırmayı onayla — ticker çubuğundan silinir"
                      style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)', color: T.danger, cursor: 'pointer', fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', fontFamily: 'inherit' }}>
                      ONAYLA
                    </button>
                    <button onClick={() => setTickerConfirmIdx(null)}
                      style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', fontFamily: 'inherit' }}>
                      İPTAL
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setTickerConfirmIdx(i)} title="Bu sembolü izleme listesinden kaldır"
                    style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.1)', color: 'rgba(248,113,113,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.12s', fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.danger; e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.35)'; e.currentTarget.style.background = 'rgba(248,113,113,0.05)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.1)'; }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                    KALDIR
                  </button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input ref={newSymRef} placeholder="SEMBOL GİR (ör: BIMAS, USD/TRY)..."
              style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: T.primary, outline: 'none', transition: 'border-color 0.12s' }}
              onFocus={e => e.target.style.borderColor = `${T.purple}50`}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
            <button onClick={() => {
              const val = newSymRef.current?.value?.trim();
              if (val) {
                update('ticker_symbols', [...(settings.ticker_symbols || []), { label: val, symbol: val, source: 'yfinance' }]);
                if (newSymRef.current) newSymRef.current.value = '';
              }
            }}
              title="Bu sembolü ticker çubuğuna ekle"
              style={{ padding: '8px 16px', borderRadius: 8, background: T.purple, border: 'none', color: '#000', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', transition: 'filter 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}
            >EKLE</button>
          </div>
        </div>

        {/* Özellik anahtarları (Feature Flags) */}
        <div style={{ padding: 18, borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: 40, height: 40, borderRadius: R, background: 'rgba(251,191,36,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: T.warning }}>flag</span>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>Modül Anahtarları (Feature Flags)</p>
              <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: 0, lineHeight: 1.5 }}>Her anahtarı açıp kapatarak ilgili modülü anında etkinleştirin veya devre dışı bırakın. Yeşil = aktif.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {Object.entries(settings?.feature_flags || {}).map(([flag, val]) => (
              <div key={flag} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: 14, borderRadius: 5, border: `1px solid ${val ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)'}`, background: val ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.008)', transition: 'all 0.14s' }}
                onMouseEnter={e => e.currentTarget.style.background = val ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)'}
                onMouseLeave={e => e.currentTarget.style.background = val ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.008)'}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {flag.replace(/_/g, ' ')}
                  </p>
                  {FLAG_DESCRIPTIONS[flag] && (
                    <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', lineHeight: 1.5, margin: 0 }}>{FLAG_DESCRIPTIONS[flag]}</p>
                  )}
                </div>
                <button onClick={() => update('feature_flags', { ...settings.feature_flags, [flag]: !val })}
                  disabled={busy}
                  title={val ? 'Şu an aktif — kapatmak için tıklayın' : 'Şu an kapalı — açmak için tıklayın'}
                  style={{ width: 40, height: 22, borderRadius: 99, background: val ? T.success : 'rgba(255,255,255,0.1)', boxShadow: val ? `0 0 10px rgba(52,211,153,0.3)` : 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0, position: 'relative', transition: 'all 0.2s', marginTop: 2 }}>
                  <div style={{ position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'all 0.2s', left: val ? 21 : 3 }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gelişmiş JSON yapılandırması */}
      <div style={{ padding: 18, borderRadius: R, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width: 34, height: 34, borderRadius: R, background: 'rgba(153,247,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: T.primary }}>data_object</span>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>Gelişmiş JSON Yapılandırması</p>
            <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', margin: 0, lineHeight: 1.5 }}>
              Her yapılandırma grubunu JSON formatında düzenleyin. Her alanın altındaki tabloda parametre açıklamaları ve veri tipleri listelenmiştir.
              JSON sözdizimi hatalıysa kaydet butonu pasif kalır.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {JSON_KEYS.filter(k => settings?.[k] !== undefined).map(key => {
            const hasErr = !!jsonErrors[key];
            const meta = CONFIG_GROUP_META[key];
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Grup başlığı */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {meta ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: meta.color }}>{meta.icon}</span>
                          <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{meta.title}</p>
                        </div>
                        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', margin: 0, lineHeight: 1.5 }}>{meta.desc}</p>
                      </>
                    ) : (
                      <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', margin: 0 }}>{key.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                  <button onClick={() => handleJsonSave(key)} disabled={busy || hasErr}
                    title={hasErr ? 'JSON formatı hatalı — düzeltmeden kaydedemezsiniz' : 'Değişiklikleri kaydet ve sisteme uygula'}
                    style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 5, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', cursor: busy || hasErr ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.14s', background: hasErr ? 'rgba(248,113,113,0.08)' : 'rgba(153,247,255,0.07)', border: `1px solid ${hasErr ? 'rgba(248,113,113,0.2)' : 'rgba(153,247,255,0.18)'}`, color: hasErr ? T.danger : T.primary }}>
                    {hasErr ? 'HATA' : 'KAYDET'}
                  </button>
                </div>
                {hasErr && <p style={{ fontSize: 9, color: 'rgba(248,113,113,0.7)', paddingLeft: 4, margin: 0 }}>{jsonErrors[key]}</p>}
                <textarea
                  value={jsonDrafts[key] ?? JSON.stringify(settings?.[key], null, 2) ?? ''}
                  onChange={e => {
                    const val = e.target.value;
                    setJsonDrafts(prev => ({ ...prev, [key]: val }));
                    setDirtyKeys(prev => new Set([...prev, key]));
                    try { JSON.parse(val); setJsonErrors(prev => ({ ...prev, [key]: null })); }
                    catch { setJsonErrors(prev => ({ ...prev, [key]: 'Geçersiz JSON — düzeltin.' })); }
                  }}
                  style={{ width: '100%', height: 220, background: 'rgba(0,0,0,0.4)', borderRadius: 5, padding: 14, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: T.primary, outline: 'none', border: `1px solid ${hasErr ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.05)'}`, resize: 'vertical', transition: 'border-color 0.14s', boxSizing: 'border-box' }}
                  onFocus={e => { if (!hasErr) e.target.style.borderColor = 'rgba(153,247,255,0.25)'; }}
                  onBlur={e => { if (!hasErr) e.target.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                />
                {CONFIG_FIELD_DOCS[key] && (
                  <div style={{ borderRadius: 5, border: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)', overflow: 'hidden' }}>
                    {CONFIG_FIELD_DOCS[key].map(({ key: fk, type, desc }) => (
                      <div key={fk} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 1 }}>
                          <code style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{fk}</code>
                          <span style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: TYPE_COLORS[type] || 'rgba(255,255,255,0.3)' }}>{type}</span>
                        </div>
                        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', lineHeight: 1.5, margin: 0 }}>{desc}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
