// Level 3: a few numbers the player may change for one life. Pure functions over the loaded params
// (data layer: no engine imports). The original params are never touched.

export const OVERRIDE_FIELDS = {
  inflationShiftPct: { label: 'Inflation', unit: 'points a year, added in every economy', min: -3, max: 3, step: 0.5 },
  equityShiftPct: { label: 'Share returns', unit: 'points a year, added in every economy', min: -6, max: 6, step: 1 },
  homeGrowthShiftPct: { label: 'Home price growth', unit: 'points a year, added in every economy', min: -4, max: 4, step: 0.5 },
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// A clean overrides object: only fields that differ from the defaults, each inside its range.
export function normalizeOverrides(o = {}) {
  const out = {};
  for (const [id, f] of Object.entries(OVERRIDE_FIELDS)) {
    const v = Number(o[id]);
    if (Number.isFinite(v) && v !== 0) out[id] = clamp(v, f.min, f.max);
  }
  if (o.taxOn === false) out.taxOn = false;
  return out;
}

export const hasOverrides = (o) => Object.keys(normalizeOverrides(o)).length > 0;

// Plain words for each change, for the banner on the end screen.
export function describeOverrides(o) {
  const n = normalizeOverrides(o);
  const sign = (v) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`;
  const out = [];
  for (const [id, f] of Object.entries(OVERRIDE_FIELDS)) if (id in n) out.push(`${f.label} ${sign(n[id])} points a year`);
  if (n.taxOn === false) out.push('No tax');
  return out;
}

// A copy of params with the overrides applied.
export function applyOverrides(params, overrides) {
  const o = normalizeOverrides(overrides);
  if (!Object.keys(o).length) return params;
  const p = { ...params };
  if ('inflationShiftPct' in o) {
    p.macro = structuredClone(params.macro);
    for (const r of Object.values(p.macro.regimes)) r.inflationPct = clamp(r.inflationPct + o.inflationShiftPct, 0, 25);
  }
  if ('equityShiftPct' in o) {
    p.instruments = structuredClone(params.instruments);
    const eq = p.instruments.find(i => i.id === 'equity');
    for (const r of Object.values(eq.returns)) r.meanPct = clamp(r.meanPct + o.equityShiftPct, -90, 100);
  }
  if ('homeGrowthShiftPct' in o) {
    p.housing = structuredClone(params.housing);
    for (const r of Object.keys(p.housing.priceGrowthPct)) p.housing.priceGrowthPct[r] = clamp(p.housing.priceGrowthPct[r] + o.homeGrowthShiftPct, -30, 30);
  }
  if (o.taxOn === false) {
    p.tax = structuredClone(params.tax);
    p.tax.incomeTax.slabs = [{ upTo: null, ratePct: 0 }];
    p.tax.incomeTax.surcharge = [];
    p.tax.incomeTax.cessPct = 0;
    for (const rule of [...Object.values(p.tax.instruments), p.tax.property]) {
      if (rule.kind === undefined || rule.kind === 'capitalGains') { rule.longTermRatePct = 0; rule.shortTermRatePct = 0; }
    }
  }
  return p;
}
