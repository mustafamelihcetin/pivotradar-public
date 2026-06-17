const fs = require('fs');
let content = fs.readFileSync('src/features/landing/pages/LandingPage.jsx', 'utf8');

const replacements = [
  ['Milisaniyelik<br/>Piyasa Taraması', 'Kapsamlı<br/>Piyasa Taraması'],
  ['eşzamanlı geçirilir.', 'düzenli olarak geçirilir.'],
  ['bg-background', 'bg-[#05070a]'],
  ['text-surface-container-lowest', 'text-black'],
  ['bg-surface-container-low', 'bg-[#07090e]'],
  ['bg-surface-container-high', 'bg-[#111520]'],
  ['bg-surface-container', 'bg-[#0d1118]'],
  ['bg-surface-variant', 'bg-white/5'],
  ['bg-surface', 'bg-[#0b0e16]'],
  ['text-on-surface-variant', 'text-white/50'],
  ['text-on-surface', 'text-white/90'],
  ['border-outline-variant/30', 'border-white/[0.08]'],
  ['border-outline-variant/20', 'border-white/[0.05]'],
  ['border-outline-variant/10', 'border-white/[0.03]'],
  ['bg-outline-variant/30', 'bg-white/[0.08]'],
  ['bg-outline-variant/20', 'bg-white/[0.05]'],
  ['bg-outline-variant/10', 'bg-white/[0.03]'],
  ['text-error', 'text-[#f87171]'],
  ['bg-error', 'bg-[#f87171]'],
  ['border-error', 'border-[#f87171]'],
  ['text-emerald-400', 'text-[#34d399]'],
  ['bg-emerald-400', 'bg-[#34d399]'],
  ['border-emerald-400', 'border-[#34d399]'],
  ['text-tertiary', 'text-[#a855f7]'],
  ['bg-tertiary', 'bg-[#a855f7]'],
  ['border-tertiary', 'border-[#a855f7]'],
  ['text-secondary', 'text-[#fbbf24]'],
  ['bg-secondary', 'bg-[#fbbf24]'],
  ['border-secondary', 'border-[#fbbf24]']
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

fs.writeFileSync('src/features/landing/pages/LandingPage.jsx', content);
console.log('Replacements done.');
