export function getGuestAnalysisCount() {
  const today = new Date().toDateString();
  const saved = JSON.parse(localStorage.getItem('pr_guest') || '{}');
  if (saved.date !== today) return 0;
  return saved.count || 0;
}

export function incrementGuestCount() {
  const today = new Date().toDateString();
  const count = getGuestAnalysisCount() + 1;
  localStorage.setItem('pr_guest', JSON.stringify({ date: today, count }));
  return count;
}


export function normaliseProfiles(rows, defaultProfiles) {
  if (!Array.isArray(rows) || rows.length === 0) return defaultProfiles;
  return rows.map(r => ({ id: r.name, name: r.name, color: r.color || '#22d3ee', desc: r.desc || '' }));
}
