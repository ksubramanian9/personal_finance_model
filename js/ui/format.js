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

export function formatINRPerMonth(amount) {
  return `${formatINR(amount)}/month`;
}
