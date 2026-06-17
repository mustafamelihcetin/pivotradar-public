export const WIZARD_QUESTIONS = [
  {
    id: 'horizon', question: 'Yatırım ufkunuz ne kadar?',
    options: [
      { label: 'Günlük / anlık', value: 'scalper', score: { Scalper: 3, Kirilim: 2, Agresif: 1 } },
      { label: 'Birkaç gün – 2 hafta', value: 'swing', score: { Swing: 3, Kirilim: 2, Agresif: 1 } },
      { label: '1 – 6 ay', value: 'mid', score: { Trend: 3, Agresif: 2, Dengeli: 1 } },
      { label: '6 ay ve üzeri', value: 'long', score: { Deger: 3, Dengeli: 2 } },
    ]
  },
  {
    id: 'risk', question: 'Risk toleransınız nasıl?',
    options: [
      { label: 'Çok yüksek (büyük dalgalanmalar)', value: 'very_high', score: { Agresif: 3, Scalper: 2, Swing: 1 } },
      { label: 'Orta (makul düşüşleri kabul ederim)', value: 'mid', score: { Dengeli: 3, Trend: 2, Swing: 1 } },
      { label: 'Düşük (korumacı yaklaşım tercih)', value: 'low', score: { Dengeli: 3, Deger: 2 } },
    ]
  },
  {
    id: 'goal', question: 'Öncelikli hedefiniz nedir?',
    options: [
      { label: 'Kısa vadeli hızlı kazanç', value: 'fast', score: { Scalper: 3, Kirilim: 2, Swing: 1 } },
      { label: 'Trendi yakalayıp sürdürmek', value: 'trend', score: { Trend: 3, Agresif: 2, 'Güvenli Liman': 1 } },
      { label: 'Sermayemi büyütmek, istikrarlı', value: 'stable', score: { 'Güvenli Liman': 3, Deger: 1 } },
      { label: 'Düşük değerli hisseler bulmak', value: 'value', score: { Deger: 3, 'Güvenli Liman': 2, Swing: 1 } },
    ]
  }
];

export const DEFAULT_PROFILES = [
  { id: 'Güvenli Liman',     name: 'Güvenli Liman',     color: '#22d3ee', desc: 'Maksimum Sermaye Koruması & Risk Optimizasyonu' },
  { id: 'Agresif Atak',      name: 'Agresif Atak',      color: '#f87171', desc: 'Yüksek Risk · Keskin Momentum' },
  { id: 'Dönüş Uzmanı',      name: 'Dönüş Uzmanı',      color: '#34d399', desc: 'Kısa Vadeli Dip ve Dönüşler' },
  { id: 'Trend Avcısı',      name: 'Trend Avcısı',      color: '#fbbf24', desc: 'Güçlü Momentum Takibi' },
  { id: 'Değer Kaşifi',      name: 'Değer Kaşifi',      color: '#a5f3fc', desc: 'Teknik Olarak Düşük Fiyatlı' },
  { id: 'Anlık Fırsatçı',    name: 'Anlık Fırsatçı',    color: '#fb923c', desc: 'Yüksek Frekanslı Hızlı Atak' },
  { id: 'Kırılım Dedektörü', name: 'Kırılım Dedektörü', color: '#a855f7', desc: 'Teknik Formasyon Kırılımları' },
];

export const AUTOSCAN_INTERVALS = [15, 30, 60];
