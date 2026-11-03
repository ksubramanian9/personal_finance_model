import { loadJSON } from './loader.js';
import { ValidationError, schemas } from './validate.js';

// Which effect keys a choice may set, and the range each must stay inside.
// "alloc.<instrumentId>" sets the share of new savings going to that instrument.
export const EFFECT_RANGES = {
  savingsRate: [0, 1],
  learningPct: [0, 0.5],
  growthBoost: [0, 0.1],
  retirementAge: [50, 75],
  emergencyMonths: [0, 24],
  healthCover: [0, 1e8],
  healthPremium: [0, 1e7],
  buyHome: [0, 1],
};
const ALLOC = 'alloc.';
const rangeFor = (k) => EFFECT_RANGES[k] ?? (k.startsWith(ALLOC) ? [0, 1] : undefined);

const isStr = (x) => typeof x === 'string' && x.length > 0;

function checkDecision(id, d, problems, instrumentIds) {
  const at = `decisions.${id}`;
  if (!isStr(d.title)) problems.push(`"${at}.title" is missing`);
  if (!isStr(d.question)) problems.push(`"${at}.question" is missing`);
  if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 4) {
    problems.push(`"${at}.options" should list 2 to 4 options`);
    return;
  }
  const ids = new Set();
  const keySets = new Set();
  for (const [i, o] of d.options.entries()) {
    const oat = `${at}.options[${i}]`;
    for (const f of ['id', 'emoji', 'title', 'blurb']) if (!isStr(o[f])) problems.push(`"${oat}.${f}" is missing`);
    if (ids.has(o.id)) problems.push(`"${oat}.id" "${o.id}" is used twice`);
    ids.add(o.id);
    if (typeof o.effects !== 'object' || o.effects === null || !Object.keys(o.effects).length) {
      problems.push(`"${oat}.effects" should set at least one value`);
      continue;
    }
    keySets.add(Object.keys(o.effects).sort().join(','));
    for (const [k, v] of Object.entries(o.effects)) {
      const range = rangeFor(k);
      if (!range) problems.push(`"${oat}.effects.${k}" is not a known effect (${Object.keys(EFFECT_RANGES).join(', ')}, alloc.<instrument>)`);
      else if (typeof v !== 'number' || v < range[0] || v > range[1]) problems.push(`"${oat}.effects.${k}" should be a number from ${range[0]} to ${range[1]}`);
    }
    // An allocation option must cover every instrument and add up to 1.
    const allocKeys = Object.keys(o.effects).filter(k => k.startsWith(ALLOC));
    if (allocKeys.length) {
      if (instrumentIds) {
        for (const id of instrumentIds) if (!allocKeys.includes(ALLOC + id)) problems.push(`"${oat}.effects" is missing "${ALLOC}${id}"`);
        for (const k of allocKeys) if (!instrumentIds.includes(k.slice(ALLOC.length))) problems.push(`"${oat}.effects.${k}" is not a known instrument`);
      }
      const sum = allocKeys.reduce((a, k) => a + (Number(o.effects[k]) || 0), 0);
      if (Math.abs(sum - 1) > 1e-9) problems.push(`"${oat}.effects" allocations should add up to 1 but add up to ${Math.round(sum * 1e6) / 1e6}`);
    }
  }
  // All options of one decision must set the same things, so "which one is current?" is answerable.
  if (keySets.size > 1) problems.push(`"${at}" options should all set the same effects`);
}

export function checkStages(data, label, instrumentIds = null) {
  const problems = [];
  for (const [id, d] of Object.entries(data.decisions)) checkDecision(id, d, problems, instrumentIds);

  if (!data.stages.length) problems.push('"stages" is empty');
  const seen = new Set();
  data.stages.forEach((s, i) => {
    const at = `stages[${i}]`;
    for (const f of ['id', 'name', 'emoji', 'intro']) if (!isStr(s[f])) problems.push(`"${at}.${f}" is missing`);
    if (seen.has(s.id)) problems.push(`"${at}.id" "${s.id}" is used twice`);
    seen.add(s.id);
    if (typeof s.fromAge !== 'number') problems.push(`"${at}.fromAge" should be a number`);
    if (s.toAge !== null && typeof s.toAge !== 'number') problems.push(`"${at}.toAge" should be a number, or null for "until retirement"`);
    if (typeof s.toAge === 'number' && s.toAge <= s.fromAge) problems.push(`"${at}" ends before it starts`);
    if (!Array.isArray(s.decisions) || !s.decisions.length) problems.push(`"${at}.decisions" should list at least one decision`);
    else for (const ref of s.decisions) {
      if (!data.decisions[ref.id]) problems.push(`"${at}" uses unknown decision "${ref.id}"`);
      if (ref.onlyIf !== undefined && ref.onlyIf !== 'renting') problems.push(`"${at}" decision "${ref.id}": "onlyIf" should be "renting"`);
    }
    const prev = data.stages[i - 1];
    if (prev && prev.toAge !== s.fromAge) problems.push(`"${at}" should start at age ${prev.toAge} where "${prev.id}" ends`);
    if (i < data.stages.length - 1 && s.toAge === null) problems.push(`"${at}": only the last stage may end with null`);
  });
  const last = data.stages[data.stages.length - 1];
  if (last && last.toAge !== null) problems.push('the last stage should end with toAge: null (until retirement)');

  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

// Pass instrumentIds (from loadParams) to also check allocation options against the instruments.
export async function loadStages({ fetchImpl = fetch, instrumentIds = null } = {}) {
  const label = 'stages.json';
  const data = await loadJSON('data/stages.json', { schema: schemas.stages, label, fetchImpl });
  return checkStages(data, label, instrumentIds);
}
