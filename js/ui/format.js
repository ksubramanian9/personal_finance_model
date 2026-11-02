// Indian money formatting: lakh / crore units, en-IN grouping below a lakh.
const LAKH = 1e5;
const CRORE = 1e7;

function trim(n) {
  return String(Math.round(n * 100) / 100);
}

export function formatINR(amount) {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= CRORE) return `${sign}₹${trim(abs / CRORE)} crore`;
  if (abs >= LAKH) return `${sign}₹${trim(abs / LAKH)} lakh`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

// Short form for chart axes: ₹50K, ₹5L, ₹1.5Cr.
export function formatINRShort(amount) {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs >= CRORE) return `${sign}₹${trim(abs / CRORE)}Cr`;
  if (abs >= LAKH) return `${sign}₹${trim(abs / LAKH)}L`;
  if (abs >= 1000) return `${sign}₹${trim(abs / 1000)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

export function formatINRPerMonth(amount) {
  return `${formatINR(amount)}/month`;
}
