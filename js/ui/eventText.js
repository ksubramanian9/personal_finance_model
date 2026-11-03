import { formatINR } from './format.js';

// Fills {cost}, {months}... in an event's story. Unknown placeholders are left visible so a typo in
// events.json shows up on screen instead of silently vanishing.
export function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? vars[key] : whole));
}

// The lines to show for one event record (from the engine's history), all in today's rupees.
export function describeEvent(def, rec) {
  const vars = {
    cost: rec.costReal != null ? formatINR(rec.costReal) : '',
    amount: rec.amountReal != null ? formatINR(rec.amountReal) : '',
    months: rec.months != null ? String(Math.round(rec.months)) : '',
    pct: rec.pct != null ? String(Math.round(rec.pct)) : '',
  };
  const lines = [fillTemplate(def.story, vars)];

  if (def.kind === 'expense' && def.coveredBy.length) {
    if (rec.coveredReal > 0) {
      lines.push(rec.pocketReal > 0
        ? `Insurance paid ${formatINR(rec.coveredReal)} and you paid ${formatINR(rec.pocketReal)}.`
        : 'Insurance paid all of it, so it cost you nothing.');
    } else {
      lines.push('No insurance cover helped.');
    }
  }
  if (def.kind === 'jobLoss' && rec.severanceReal > 0) {
    lines.push(`Severance softened the blow by ${formatINR(rec.severanceReal)}.`);
  }
  return lines;
}

// "To cover the gap you used ... " for a year when spending outran income, or null if it did not.
export function describeCoping(coping, instruments) {
  const parts = [];
  if (coping.fromCash > 0) parts.push(`used ${formatINR(coping.fromCash)} of your cash`);
  // In the order they were sold (fixed deposits, gold, then shares), not the order in the file.
  const sellOrder = [...instruments].sort((a, b) => (a.drawOrder ?? a.retiredDrawOrder ?? 99) - (b.drawOrder ?? b.retiredDrawOrder ?? 99));
  for (const inst of sellOrder) {
    if (coping.sold[inst.id] > 0) parts.push(`sold ${formatINR(coping.sold[inst.id])} of ${inst.name.toLowerCase()}`);
  }
  if (coping.soldHome) parts.push('sold your home');
  if (coping.borrowed > 0) parts.push(`borrowed ${formatINR(coping.borrowed)}`);
  if (!parts.length) return null;
  const last = parts.pop();
  return `To cover the gap you ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
}
