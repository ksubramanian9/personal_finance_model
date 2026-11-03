import { loadJSON } from './loader.js';
import { ValidationError, schemas } from './validate.js';

const CONFIDENCE = ['high', 'medium', 'low'];
const isStr = (x) => typeof x === 'string' && x.length > 0;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function checkProvenance(p, at, problems) {
  if (!p || typeof p !== 'object') return problems.push(`"${at}.provenance" is missing`);
  if (!isStr(p.basis)) problems.push(`"${at}.provenance.basis" is missing`);
  if (!CONFIDENCE.includes(p.confidence)) problems.push(`"${at}.provenance.confidence" should be one of ${CONFIDENCE.join(', ')}`);
  if (!isNum(p.asOf)) problems.push(`"${at}.provenance.asOf" should be a year`);
}

export function checkMacro(m, label) {
  const problems = [];
  const ids = m.order;
  if (!ids.length || new Set(ids).size !== ids.length) problems.push('"order" should list each regime once');
  if (!ids.includes(m.start)) problems.push(`"start" "${m.start}" is not in "order"`);

  for (const id of ids) {
    const r = m.regimes[id];
    if (!r) { problems.push(`"regimes.${id}" is missing`); continue; }
    for (const f of ['name', 'emoji', 'blurb']) if (!isStr(r[f])) problems.push(`"regimes.${id}.${f}" is missing`);
    if (!isNum(r.inflationPct) || r.inflationPct < 0 || r.inflationPct > 25) problems.push(`"regimes.${id}.inflationPct" should be a number from 0 to 25`);
    if (!isNum(r.wageAdjPct) || Math.abs(r.wageAdjPct) > 15) problems.push(`"regimes.${id}.wageAdjPct" should be a number from -15 to 15`);

    const row = m.transitions[id];
    if (!row) { problems.push(`"transitions.${id}" is missing`); continue; }
    let sum = 0;
    for (const to of ids) {
      const x = row[to];
      if (!isNum(x) || x < 0 || x > 1) problems.push(`"transitions.${id}.${to}" should be a probability from 0 to 1`);
      else sum += x;
    }
    if (Math.abs(sum - 1) > 1e-9) problems.push(`"transitions.${id}" should add up to 1 but adds up to ${Math.round(sum * 1e6) / 1e6}`);
    for (const to of Object.keys(row)) if (!ids.includes(to)) problems.push(`"transitions.${id}.${to}" is not a known regime`);
  }
  for (const id of Object.keys(m.regimes)) if (!ids.includes(id)) problems.push(`"regimes.${id}" is not listed in "order"`);
  if (problems.length) throw new ValidationError(label, problems);
  return m;
}

export function checkInstruments(data, regimeIds, label) {
  const problems = [];
  const list = data.instruments;
  if (!list.length) problems.push('"instruments" is empty');
  const seen = new Set();
  list.forEach((inst, i) => {
    const at = `instruments[${i}]`;
    for (const f of ['id', 'name', 'emoji', 'blurb']) if (!isStr(inst[f])) problems.push(`"${at}.${f}" is missing`);
    if (seen.has(inst.id)) problems.push(`"${at}.id" "${inst.id}" is used twice`);
    seen.add(inst.id);
    if (typeof inst.liquid !== 'boolean') problems.push(`"${at}.liquid" should be true or false`);
    if (inst.liquid && !isNum(inst.drawOrder)) problems.push(`"${at}.drawOrder" is needed for a liquid instrument (lower numbers are sold first)`);
    for (const r of regimeIds) {
      const x = inst.returns?.[r];
      if (!x) { problems.push(`"${at}.returns.${r}" is missing`); continue; }
      if (!isNum(x.meanPct) || x.meanPct < -90 || x.meanPct > 100) problems.push(`"${at}.returns.${r}.meanPct" should be a number from -90 to 100`);
      if (!isNum(x.volPct) || x.volPct < 0 || x.volPct > 100) problems.push(`"${at}.returns.${r}.volPct" should be a number from 0 to 100`);
    }
    checkProvenance(inst.provenance, at, problems);
  });
  const orders = list.filter(i => i.liquid).map(i => i.drawOrder);
  if (new Set(orders).size !== orders.length) problems.push('liquid instruments should each have a different "drawOrder"');
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

const EVENT_KINDS = ['jobLoss', 'payJump', 'expense', 'windfall'];
const COVERS = ['employer', 'player'];
const isRange = (r) => Array.isArray(r) && r.length === 2 && r.every(isNum) && r[0] >= 0 && r[0] <= r[1];

export function checkEvents(data, regimeIds, label) {
  const problems = [];
  const ins = data.insurance;
  if (ins.employerCoverReal < 0) problems.push('"insurance.employerCoverReal" should not be negative');
  if (ins.premiumAgeLoadingPct < 0 || ins.premiumAgeLoadingPct > 20) problems.push('"insurance.premiumAgeLoadingPct" should be from 0 to 20');
  if (!data.events.length) problems.push('"events" is empty');
  const seen = new Set();
  data.events.forEach((e, i) => {
    const at = `events[${i}]`;
    for (const f of ['id', 'emoji', 'name', 'story']) if (!isStr(e[f])) problems.push(`"${at}.${f}" is missing`);
    if (seen.has(e.id)) problems.push(`"${at}.id" "${e.id}" is used twice`);
    seen.add(e.id);
    if (!EVENT_KINDS.includes(e.kind)) problems.push(`"${at}.kind" should be one of ${EVENT_KINDS.join(', ')}`);

    const p = e.prob;
    if (!p || typeof p !== 'object') problems.push(`"${at}.prob" is missing`);
    else if (isNum(p.base)) { if (p.base < 0 || p.base > 1) problems.push(`"${at}.prob.base" should be a probability from 0 to 1`); }
    else if (!isStr(p.fromCareer)) problems.push(`"${at}.prob" needs either "base" or "fromCareer"`);

    for (const r of regimeIds) {
      const m = e.regimeMult?.[r];
      if (!isNum(m) || m < 0 || m > 10) problems.push(`"${at}.regimeMult.${r}" should be a number from 0 to 10`);
    }
    const bands = e.ageMult;
    if (!Array.isArray(bands) || !bands.length) problems.push(`"${at}.ageMult" should list [maxAge, multiplier] bands`);
    else {
      bands.forEach((b, j) => {
        if (!Array.isArray(b) || !isNum(b[0]) || !isNum(b[1]) || b[1] < 0) problems.push(`"${at}.ageMult[${j}]" should be [maxAge, multiplier]`);
        else if (j > 0 && isNum(bands[j - 1][0]) && b[0] <= bands[j - 1][0]) problems.push(`"${at}.ageMult" ages should go up`);
      });
      const lastAge = bands[bands.length - 1]?.[0];
      if (!(lastAge >= 100)) problems.push(`"${at}.ageMult" should end with a band up to age 100 or more`);
    }
    if (e.capabilityEffect !== undefined && !isNum(e.capabilityEffect)) problems.push(`"${at}.capabilityEffect" should be a number`);

    if (e.kind === 'jobLoss') {
      if (!isRange(e.monthsOut) || e.monthsOut[1] > 12) problems.push(`"${at}.monthsOut" should be [min, max] months, at most 12`);
      if (!isNum(e.severanceMonths) || e.severanceMonths < 0) problems.push(`"${at}.severanceMonths" should be a number`);
      if (!isRange(e.payHitPct) || e.payHitPct[1] > 60) problems.push(`"${at}.payHitPct" should be [min, max] percent, at most 60`);
    }
    if (e.kind === 'expense' || e.kind === 'windfall') {
      if (!isRange(e.amountReal)) problems.push(`"${at}.amountReal" should be [min, max] in today's rupees`);
      if (!isNum(e.shape) || e.shape < 0.5 || e.shape > 6) problems.push(`"${at}.shape" should be a number from 0.5 to 6 (1 = even, higher = mostly small, sometimes big)`);
    }
    if (e.kind === 'windfall' && typeof e.taxable !== 'boolean') problems.push(`"${at}.taxable" should be true or false`);
    if (e.kind === 'expense') {
      if (!Array.isArray(e.coveredBy) || e.coveredBy.some(c => !COVERS.includes(c))) problems.push(`"${at}.coveredBy" should list any of ${COVERS.join(', ')}`);
    }
  });
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

const TAX_KINDS = ['exempt', 'interest', 'capitalGains'];

export function checkTax(data, instrumentIds, label) {
  const problems = [];
  const it = data.incomeTax;
  checkProvenance(it?.provenance, 'incomeTax', problems);
  const slabs = it?.slabs;
  if (!Array.isArray(slabs) || !slabs.length) problems.push('"incomeTax.slabs" should list the tax slabs');
  else {
    slabs.forEach((s, i) => {
      const last = i === slabs.length - 1;
      if (last ? s.upTo !== null : !isNum(s.upTo)) problems.push(`"incomeTax.slabs[${i}].upTo" should be ${last ? 'null (no upper limit)' : 'a number'}`);
      else if (i > 0 && !last && s.upTo <= slabs[i - 1].upTo) problems.push('"incomeTax.slabs" limits should go up');
      if (!isNum(s.ratePct) || s.ratePct < 0 || s.ratePct > 100) problems.push(`"incomeTax.slabs[${i}].ratePct" should be a percentage from 0 to 100`);
    });
  }
  for (const f of ['standardDeduction', 'rebateIncomeLimit']) if (!isNum(it?.[f]) || it[f] < 0) problems.push(`"incomeTax.${f}" should be a number of rupees`);
  if (!isNum(it?.cessPct) || it.cessPct < 0 || it.cessPct > 20) problems.push('"incomeTax.cessPct" should be from 0 to 20');
  if (!Array.isArray(it?.surcharge)) problems.push('"incomeTax.surcharge" should be a list (possibly empty)');
  else it.surcharge.forEach((s, i) => {
    if (!isNum(s.above) || !isNum(s.ratePct) || s.ratePct < 0 || s.ratePct > 50) problems.push(`"incomeTax.surcharge[${i}]" should be { above, ratePct }`);
    else if (i > 0 && s.above <= it.surcharge[i - 1].above) problems.push('"incomeTax.surcharge" tiers should go up');
  });

  const rules = data.instruments;
  for (const id of instrumentIds) {
    const r = rules[id];
    const at = `instruments.${id}`;
    if (!r) { problems.push(`"${at}" is missing: say how ${id} is taxed`); continue; }
    if (!TAX_KINDS.includes(r.kind)) problems.push(`"${at}.kind" should be one of ${TAX_KINDS.join(', ')}`);
    checkProvenance(r.provenance, at, problems);
    if (r.kind === 'capitalGains') {
      if (!isNum(r.longTermYears) || r.longTermYears < 0) problems.push(`"${at}.longTermYears" should be a number of years`);
      if (!isNum(r.longTermRatePct) || r.longTermRatePct < 0 || r.longTermRatePct > 100) problems.push(`"${at}.longTermRatePct" should be a percentage`);
      if (r.shortTermRatePct !== 'slab' && (!isNum(r.shortTermRatePct) || r.shortTermRatePct < 0 || r.shortTermRatePct > 100)) problems.push(`"${at}.shortTermRatePct" should be a percentage or "slab"`);
      if (!isNum(r.exemptionPerYear) || r.exemptionPerYear < 0) problems.push(`"${at}.exemptionPerYear" should be a number of rupees`);
    }
  }
  for (const id of Object.keys(rules)) if (!instrumentIds.includes(id)) problems.push(`"instruments.${id}" is not a known instrument`);
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export function checkEngine(e, instrumentIds, label) {
  const problems = [];
  if (e.savingsRate < 0 || e.savingsRate > 1) problems.push('"savingsRate" should be between 0 and 1');
  if (e.debtPaydownShare < 0 || e.debtPaydownShare > 1) problems.push('"debtPaydownShare" should be between 0 and 1');
  let sum = 0;
  for (const id of instrumentIds) {
    const x = e.allocation[id];
    if (!isNum(x) || x < 0 || x > 1) problems.push(`"allocation.${id}" should be a share from 0 to 1`);
    else sum += x;
  }
  for (const id of Object.keys(e.allocation)) if (!instrumentIds.includes(id)) problems.push(`"allocation.${id}" is not a known instrument`);
  if (Math.abs(sum - 1) > 1e-9) problems.push(`"allocation" should add up to 1 but adds up to ${Math.round(sum * 1e6) / 1e6}`);
  if (problems.length) throw new ValidationError(label, problems);
  return e;
}

// Everything the engine needs, as one object:
//   { ...engine.json, macro: <macro.json>, instruments: [...], events: [...], insurance: {...} }
export async function loadParams({ fetchImpl = fetch } = {}) {
  const opts = (schema, label) => ({ schema, label, fetchImpl });
  const macro = checkMacro(await loadJSON('data/macro.json', opts(schemas.macro, 'macro.json')), 'macro.json');
  const inst = checkInstruments(
    await loadJSON('data/instruments.json', opts(schemas.instruments, 'instruments.json')),
    macro.order, 'instruments.json');
  const engine = checkEngine(
    await loadJSON('data/engine.json', opts(schemas.engine, 'engine.json')),
    inst.instruments.map(i => i.id), 'engine.json');
  const ev = checkEvents(
    await loadJSON('data/events.json', opts(schemas.events, 'events.json')),
    macro.order, 'events.json');
  const tax = checkTax(
    await loadJSON('data/tax.json', opts(schemas.tax, 'tax.json')),
    inst.instruments.map(i => i.id), 'tax.json');
  return { ...engine, macro, instruments: inst.instruments, events: ev.events, insurance: ev.insurance, tax };
}
