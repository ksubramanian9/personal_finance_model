import { test, assert, assertEqual } from './harness.js';
import { createRng, nextFloat } from '../engine/rng.js';
import { nextRegime, stationaryDistribution } from '../engine/macro.js';
import { createState } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { applyPicks } from '../engine/stages.js';
import { loadParams, checkMacro, checkInstruments, checkEngine } from '../data/params.js';
import { loadStages } from '../data/stages.js';
import { loadPersonas } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const inst = (id) => params.instruments.find(i => i.id === id);
const pi = stationaryDistribution(params.macro);
const base = { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60' };
const fresh = (persona = aarav, seed = 4271, p = params) => createState(persona, p, { seed, retirementAge: 60 });

// Params where every row of the economy leads to one regime, so a year's regime is known in advance.
const forced = (regime) => ({
  ...params,
  macro: {
    ...params.macro,
    transitions: Object.fromEntries(params.macro.order.map(from => [
      from, Object.fromEntries(params.macro.order.map(to => [to, to === regime ? 1 : 0])),
    ])),
  },
});

// Mean and volatility of one instrument over the long-run mix of regimes (percent).
function mixture(id) {
  let mean = 0, second = 0;
  for (const r of params.macro.order) {
    const { meanPct, volPct } = inst(id).returns[r];
    mean += pi[r] * meanPct;
    second += pi[r] * (volPct * volPct + meanPct * meanPct);
  }
  const vol = Math.sqrt(second - mean * mean);
  return { mean, vol, geometric: mean - (vol * vol) / 200 };
}

// ---- the economy ----

test('regime transitions: every row adds up to 1 and the chain is built from real data', () => {
  for (const from of params.macro.order) {
    const sum = params.macro.order.reduce((a, to) => a + params.macro.transitions[from][to], 0);
    assert(Math.abs(sum - 1) < 1e-9, `${from} row adds up to ${sum}`);
  }
});

test('nextRegime follows the cumulative probabilities and survives u near 0 and 1', () => {
  const m = params.macro;
  assertEqual(nextRegime('normal', 0, m), 'boom');
  assertEqual(nextRegime('normal', 0.1999, m), 'boom');
  assertEqual(nextRegime('normal', 0.2001, m), 'normal');
  assertEqual(nextRegime('normal', 0.9999, m), 'crisis');
  assertEqual(nextRegime('crisis', 0.9999999999, m), 'crisis');
});

test('long-run mix: mostly steady, crisis about one year in ten', () => {
  assert(pi.normal > pi.boom && pi.normal > pi.slowdown && pi.normal > pi.crisis, 'steady should be the most common');
  assert(pi.crisis > 0.07 && pi.crisis < 0.13, `crisis share ${pi.crisis}`);
  assert(Math.abs(Object.values(pi).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'shares add to 1');
});

test('crises tend to last one to three years', () => {
  const stay = params.macro.transitions.crisis.crisis;
  const meanLength = 1 / (1 - stay);
  assert(meanLength >= 1.3 && meanLength <= 3, `mean crisis length ${meanLength}`);
});

test('simulated regime frequencies match the long-run mix', () => {
  const rng = createRng(31337);
  let regime = 'normal';
  const counts = Object.fromEntries(params.macro.order.map(r => [r, 0]));
  const n = 40000;
  for (let i = 0; i < n; i++) { regime = nextRegime(regime, nextFloat(rng), params.macro); counts[regime]++; }
  for (const r of params.macro.order) {
    assert(Math.abs(counts[r] / n - pi[r]) < 0.015, `${r}: simulated ${counts[r] / n}, expected ${pi[r]}`);
  }
});

// ---- calibration against the sourced anchors ----

test('equity: long-run compounding is near the ~12.4% Nifty 50 TRI 20-year CAGR, with ~19% volatility', () => {
  const e = mixture('equity');
  assert(e.geometric > 11.4 && e.geometric < 13.4, `compounded ${e.geometric}`);
  assert(e.vol > 17 && e.vol < 21, `volatility ${e.vol}`);
});

test('gold: long-run compounding is near 11% in rupee terms', () => {
  const g = mixture('gold');
  assert(g.geometric > 10 && g.geometric < 12.5, `compounded ${g.geometric}`);
});

test('inflation: the long-run mix averages between the RBI 4% target and the targeting-era 4.9%', () => {
  const infl = params.macro.order.reduce((a, r) => a + pi[r] * params.macro.regimes[r].inflationPct, 0);
  assert(infl > 4.0 && infl < 4.9, `average inflation ${infl}`);
});

test('real returns are ordered the way Indian savers experience them', () => {
  const infl = params.macro.order.reduce((a, r) => a + pi[r] * params.macro.regimes[r].inflationPct, 0);
  const fd = mixture('fd').mean, pf = mixture('pf').mean, gold = mixture('gold').geometric, eq = mixture('equity').geometric;
  assert(fd > infl && fd - infl < 3, `FD real return ${fd - infl}`);
  assert(pf > fd, 'provident funds should beat FDs');
  assert(eq > gold && gold > pf, 'shares > gold > provident funds over the long run');
});

test('regimes behave sensibly: shares fall in a crisis, gold holds up, the job market weakens', () => {
  const eq = inst('equity').returns, gold = inst('gold').returns, reg = params.macro.regimes;
  assert(eq.crisis.meanPct < 0 && eq.boom.meanPct > eq.normal.meanPct && eq.normal.meanPct > eq.slowdown.meanPct, 'equity ordering');
  assert(gold.crisis.meanPct > gold.boom.meanPct, 'gold should do better in a crisis than in a boom');
  assert(reg.boom.wageAdjPct > reg.normal.wageAdjPct && reg.normal.wageAdjPct > reg.slowdown.wageAdjPct && reg.slowdown.wageAdjPct > reg.crisis.wageAdjPct, 'wage ordering');
  const wage = params.macro.order.reduce((a, r) => a + pi[r] * reg[r].wageAdjPct, 0);
  assert(Math.abs(wage) < 0.3, `raise adjustment should average about zero, got ${wage}`);
});

test('fixed-rate instruments have no volatility; risky ones do', () => {
  for (const r of params.macro.order) {
    assertEqual(inst('pf').returns[r].volPct, 0);
    assertEqual(inst('fd').returns[r].volPct, 0);
    assert(inst('equity').returns[r].volPct > 0 && inst('gold').returns[r].volPct > 0, `${r} risky vol`);
  }
});

// ---- the tick with an economy ----

test('each year records its regime, inflation, returns and holdings', () => {
  const y = tickYear(fresh(), params).history[0];
  assert(params.macro.order.includes(y.regime), 'regime');
  assertEqual(y.inflation, params.macro.regimes[y.regime].inflationPct / 100);
  assertEqual(Object.keys(y.returns), ['pf', 'equity', 'fd', 'gold']);
  assertEqual(Object.keys(y.holdings), ['pf', 'equity', 'fd', 'gold']);
});

test('same seed: the economy and market returns do not depend on how the player invests', () => {
  const life = (allocKey) => {
    const stage = stages[0];
    const picks = { ...base, invest: allocKey };
    let s = applyPicks(fresh(), stage, decisions, picks);
    s = runUntil(s, params, 50);
    return s.history.map(y => [y.regime, y.returns]);
  };
  assertEqual(life('safe'), life('bold'));
  assertEqual(life('safe'), life('mixed'));
});

test('new savings are spread over instruments by the allocation, and only that', () => {
  const picks = { ...base, invest: 'bold' };
  const noEvents = { ...params, events: [] }; // keep life events out of this one
  const s0 = applyPicks(fresh(), stages[0], decisions, picks);
  const y = tickYear(s0, noEvents).history[0];
  assert(y.saved > 0, 'saved something');
  assert(Math.abs(y.holdings.equity - 0.70 * y.saved) < 1e-6, 'equity share');
  assert(Math.abs(y.holdings.pf - 0.20 * y.saved) < 1e-6, 'pf share');
  assertEqual(y.holdings.fd, 0);
  assert(Math.abs(y.holdings.gold - 0.10 * y.saved) < 1e-6, 'gold share');
});

test('changing the allocation never sells existing holdings', () => {
  let s = applyPicks(fresh(), stages[0], decisions, { ...base, invest: 'bold' });
  s = runUntil(s, params, 30);
  const equityBefore = s.holdings.equity;
  const switched = applyPicks(s, stages[1], decisions, { ...base, invest: 'safe' });
  assertEqual(switched.holdings, s.holdings);
  assertEqual(switched.holdings.equity, equityBefore);
});

test('a shortfall is met from cash, then fixed deposits, gold, shares; provident funds are never sold', () => {
  const broke = { ...aarav, money: { ...aarav.money, monthlyExpenses: 400000, startingSavings: 0, startingDebt: 0 } };
  const s0 = createState(broke, forced('normal'), { seed: 1, retirementAge: 60 });
  s0.holdings = { pf: 5e6, equity: 1e5, fd: 1e5, gold: 1e5 };
  const s1 = tickYear(s0, forced('normal'));
  const y = s1.history[0];
  const pfGrew = 5e6 * (1 + y.returns.pf);
  assert(Math.abs(s1.holdings.pf - pfGrew) < 1e-6, 'provident funds untouched apart from their return');
  assert(s1.holdings.fd < 1e-6 && s1.holdings.gold < 1e-6 && s1.holdings.equity < 1e-6, 'liquid holdings sold');
  assert(y.borrowed > 0, 'and then it borrows');
});

test('deficits sell fixed deposits first, then gold, then shares', () => {
  const p = forced('normal');
  const lean = { ...aarav, money: { ...aarav.money, monthlyExpenses: 70000, startingSavings: 0, startingDebt: 0 } };
  const s0 = createState(lean, p, { seed: 3, retirementAge: 60 });
  s0.holdings = { pf: 0, equity: 3e6, fd: 3e6, gold: 3e6 };
  const s1 = tickYear(s0, p);
  const y = s1.history[0];
  const grown = (id, v) => v * (1 + y.returns[id]);
  assert(s1.holdings.fd < grown('fd', 3e6) - 1, 'fixed deposits were sold');
  assert(Math.abs(s1.holdings.equity - grown('equity', 3e6)) < 1e-6, 'shares untouched while cheaper holdings cover the gap');
  if (s1.holdings.fd > 1e-6) assert(Math.abs(s1.holdings.gold - grown('gold', 3e6)) < 1e-6, 'gold untouched while fixed deposits remain');
});

test('a stable job feels the economy less than a cyclical one', () => {
  const pay = (persona, regime) => {
    const p = forced(regime);
    const s0 = createState({ ...persona, career: { ...persona.career, salaryGrowthPct: 8 } }, p, { seed: 1, retirementAge: 60 });
    return tickYear(s0, p).salary / s0.salary - 1;
  };
  const itBoom = pay(aarav, 'boom'), itCrisis = pay(aarav, 'crisis');
  const govBoom = pay(meera, 'boom'), govCrisis = pay(meera, 'crisis');
  assert(itBoom > govBoom && itCrisis < govCrisis, 'IT swings more than government');
  assert(itBoom - itCrisis > 3 * (govBoom - govCrisis), 'IT swing is several times larger');
});

test('raises never go negative, however bad the economy', () => {
  const p = forced('crisis');
  const harsh = { ...aarav, career: { ...aarav.career, salaryGrowthPct: 1 } };
  const s0 = createState(harsh, p, { seed: 1, retirementAge: 60 });
  assert(tickYear(s0, p).salary >= s0.salary, 'salary should not fall');
});

test('the same life is reproducible with the economy in it', () => {
  assertEqual(runUntil(fresh(), params), runUntil(fresh(), params));
  assert(runUntil(fresh(aarav, 1), params).history.map(y => y.regime).join() !==
         runUntil(fresh(aarav, 2), params).history.map(y => y.regime).join(), 'different seeds, different economies');
});

test('over 200 seeds, a crisis year costs shares more than provident funds', () => {
  let worstEquity = 0, worstPf = Infinity, crisisYears = 0;
  for (let seed = 1; seed <= 200; seed++) {
    for (const y of runUntil(fresh(aarav, seed), params).history) {
      if (y.regime !== 'crisis') continue;
      crisisYears++;
      worstEquity = Math.min(worstEquity, y.returns.equity);
      worstPf = Math.min(worstPf, y.returns.pf);
    }
  }
  assert(crisisYears > 100, `saw ${crisisYears} crisis years`);
  assert(worstEquity < -0.4, `worst equity year ${worstEquity}`);
  assert(worstEquity > -0.9, 'floor respected');
  assert(worstPf > 0, 'provident funds never lose');
});

// ---- data checks ----

test('checkMacro explains a row that does not add up, an unknown regime and a bad start', async () => {
  const bad = structuredClone(params.macro);
  bad.transitions.boom.normal = 0.9;
  bad.start = 'sunny';
  bad.transitions.crisis.meltdown = 0;
  try { checkMacro(bad, 'macro.json'); assert(false, 'should have thrown'); }
  catch (err) {
    const all = err.problems.join('\n');
    assert(all.includes('"transitions.boom" should add up to 1'), all);
    assert(all.includes('"start" "sunny" is not in "order"'), all);
    assert(all.includes('"transitions.crisis.meltdown" is not a known regime'), all);
  }
});

test('checkInstruments explains a missing regime, a repeated drawOrder and a bad volatility', () => {
  const bad = { instruments: structuredClone(params.instruments), provenance: {} };
  delete bad.instruments[1].returns.crisis;
  bad.instruments[2].drawOrder = 3;
  bad.instruments[3].returns.boom.volPct = -5;
  try { checkInstruments(bad, params.macro.order, 'instruments.json'); assert(false, 'should have thrown'); }
  catch (err) {
    const all = err.problems.join('\n');
    assert(all.includes('instruments[1].returns.crisis" is missing'), all);
    assert(all.includes('different "drawOrder"'), all);
    assert(all.includes('instruments[3].returns.boom.volPct'), all);
  }
});

test('checkEngine explains an allocation that does not add up or names an unknown instrument', () => {
  const ids = params.instruments.map(i => i.id);
  const bad = { ...params, allocation: { pf: 0.5, equity: 0.6, fd: 0, gold: 0, crypto: 0.1 } };
  try { checkEngine(bad, ids, 'engine.json'); assert(false, 'should have thrown'); }
  catch (err) {
    const all = err.problems.join('\n');
    assert(all.includes('"allocation.crypto" is not a known instrument'), all);
    assert(all.includes('"allocation" should add up to 1'), all);
  }
});

test('allocation options in stages.json cover every instrument and add up to 1', async () => {
  const ids = params.instruments.map(i => i.id);
  for (const o of decisions.invest.options) {
    const sum = ids.reduce((a, id) => a + o.effects[`alloc.${id}`], 0);
    assert(Math.abs(sum - 1) < 1e-9, `${o.id} adds up to ${sum}`);
  }
  const { checkStages } = await import('../data/stages.js');
  const bad = structuredClone({ decisions, stages, provenance: {} });
  delete bad.decisions.invest.options[0].effects['alloc.gold'];
  bad.decisions.invest.options[1].effects['alloc.equity'] = 0.9;
  try { checkStages(bad, 'stages.json', ids); assert(false, 'should have thrown'); }
  catch (err) {
    const all = err.problems.join('\n');
    assert(all.includes('is missing "alloc.gold"'), all);
    assert(all.includes('allocations should add up to 1'), all);
  }
});

test('the default allocation in engine.json matches one of the player-facing options', () => {
  const s = fresh();
  const ids = Object.keys(s.alloc);
  const match = decisions.invest.options.find(o => ids.every(id => Math.abs(o.effects[`alloc.${id}`] - s.alloc[id]) < 1e-9));
  assertEqual(match?.id, 'mixed');
});

test('every instrument and the macro file carry provenance', () => {
  for (const i of params.instruments) {
    assert(i.provenance.basis.length > 20 && ['high', 'medium', 'low'].includes(i.provenance.confidence), `${i.id} provenance`);
  }
  assert(params.macro.provenance.basis.length > 20, 'macro provenance');
});

test('persona cyclicality is a real difference between the two', () => {
  assert(aarav.career.cyclicality > 0.8 && meera.career.cyclicality < 0.3, 'IT exposed, government shielded');
});
