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
//   { ...engine.json, macro: <macro.json>, instruments: [<instrument>, ...] }
export async function loadParams({ fetchImpl = fetch } = {}) {
  const opts = (schema, label) => ({ schema, label, fetchImpl });
  const macro = checkMacro(await loadJSON('data/macro.json', opts(schemas.macro, 'macro.json')), 'macro.json');
  const inst = checkInstruments(
    await loadJSON('data/instruments.json', opts(schemas.instruments, 'instruments.json')),
    macro.order, 'instruments.json');
  const engine = checkEngine(
    await loadJSON('data/engine.json', opts(schemas.engine, 'engine.json')),
    inst.instruments.map(i => i.id), 'engine.json');
  return { ...engine, macro, instruments: inst.instruments };
}
