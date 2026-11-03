import { test, assert, assertEqual } from './harness.js';
import { createState } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { eventProbability, settleEvents } from '../engine/events.js';
import { playStage, playRetirement } from '../engine/stages.js';
import { outcome } from '../engine/outcomes.js';
import { stageSummary } from '../engine/summary.js';
import { loadParams, checkCapability, checkEvents } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const C = params.capability;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fresh = (persona = aarav, seed = 4271) => createState(persona, params, { seed, retirementAge: 60 });
const forced = (regime) => ({
  ...params,
  macro: { ...params.macro, transitions: Object.fromEntries(params.macro.order.map(from => [from, Object.fromEntries(params.macro.order.map(to => [to, to === regime ? 1 : 0]))])) },
});
const burnoutDef = params.events.find(e => e.kind === 'burnout');
const base = { savings: 'balanced', invest: 'mixed', emergency: 'three', health: 'basic', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };
const wholeLife = (persona, seed, growth) => {
  let s = fresh(persona, seed);
  for (const st of stages) s = playStage(s, params, st, decisions, { ...base, growth });
  return s;
};

// ---- capability.json ----

test('capability.json loads and checkCapability explains bad numbers', () => {
  assert(C.gainPerYear > 0 && C.maxGrowthBoost > 0 && C.decayPct > 0);
  assertEqual(Object.keys(C.regimeMult), params.macro.order);
  const bad = structuredClone(C);
  bad.gainPerYear = 0;
  delete bad.regimeMult.crisis;
  bad.ageMult = [[45, 1], [40, 0.5]];
  bad.maxGrowthBoost = 0.5;
  let message = '';
  try { checkCapability(bad, params.macro.order, 'capability.json'); } catch (e) { message = e.message; }
  for (const part of ['gainPerYear', 'regimeMult.crisis', 'ageMult', 'maxGrowthBoost']) assert(message.includes(part), `mention ${part}: ${message}`);
});

test('the personas say how much skill moves pay: the IT persona fully, the officer much less', () => {
  assert(aarav.career.skillPayoff > meera.career.skillPayoff && meera.career.skillPayoff > 0);
});

// ---- the stock of skills ----

test('effort builds skills with diminishing returns, towards a ceiling below 1', () => {
  let s = Object.assign(fresh(aarav, 3), { effort: 1 });
  const stock = [];
  for (let i = 0; i < 12; i++) { s = tickYear(s, forced('normal')); stock.push(s.capability); }
  assert(stock[0] > 0 && stock.every((x, i) => i === 0 || x > stock[i - 1]), 'builds every year');
  const steps = stock.map((x, i) => x - (i ? stock[i - 1] : 0));
  assert(steps[1] < steps[0] || steps[3] < steps[1], 'each step smaller than the first');
  assert(steps[11] < steps[2], 'later steps are smaller');
  assert(stock[11] < 1 && stock[11] < C.gainPerYear / (C.gainPerYear + C.decayPct / 100) + 0.01, `ceiling ${stock[11]}`);
});

test('without effort, skills fade by the decay rate each year', () => {
  const s = Object.assign(fresh(aarav, 3), { effort: 0, capability: 0.5 });
  const t = tickYear(s, forced('normal'));
  assert(near(t.capability, 0.5 * (1 - C.decayPct / 100)));
  assert(near(t.growthBoost, C.maxGrowthBoost * t.capability * aarav.career.skillPayoff));
});

test('the same effort buys less with age, and less in a crisis than in a boom', () => {
  const gain = (age, regime) => {
    const s = Object.assign(fresh(aarav, 3), { effort: 1, capability: 0, age });
    return tickYear(s, forced(regime)).capability;
  };
  assert(gain(30, 'normal') > gain(40, 'normal') && gain(40, 'normal') > gain(50, 'normal') && gain(50, 'normal') > gain(54, 'normal'), 'older, less');
  assert(near(gain(30, 'normal'), C.gainPerYear), 'full effort at 30 in a steady economy');
  assert(gain(30, 'boom') > gain(30, 'normal') && gain(30, 'normal') > gain(30, 'crisis'), 'boom pays more than crisis');
});

test('skills move pay by the persona\'s payoff, and raises follow', () => {
  const pay = (persona, capability) => {
    const s = Object.assign(fresh(persona, 3), { effort: 0, capability });
    s.growthBoost = C.maxGrowthBoost * capability * persona.career.skillPayoff;
    return s;
  };
  const a = tickYear(pay(aarav, 0.6), forced('normal'));
  const a0 = tickYear(pay(aarav, 0), forced('normal'));
  const m = tickYear(pay(meera, 0.6), forced('normal'));
  const m0 = tickYear(pay(meera, 0), forced('normal'));
  assert(a.salary > a0.salary && m.salary > m0.salary, 'skills raise pay');
  assert((a.salary / a0.salary - 1) > (m.salary / m0.salary - 1), 'more for the IT persona');
});

test('retiring ends effort and skills', () => {
  const s = Object.assign(fresh(aarav, 3), { effort: 1, capability: 0.5, growthBoost: 0.02, age: 60 });
  const t = tickYear(s, params);
  assertEqual(t.effort, 0);
  assertEqual(t.capability, 0);
  assertEqual(t.growthBoost, 0);
});

// ---- burnout ----

test('burnout: impossible without effort, rare with a little, likelier with a lot', () => {
  const p = (effort, age = 30) => eventProbability(burnoutDef, { ...fresh(aarav), effort, age, growthBoost: 0 }, 'normal');
  assertEqual(p(0), 0);
  assert(p(0.4) > 0 && p(0.4) < p(1) / 4, 'light is far below full effort (it scales with effort squared)');
  assert(near(p(1), burnoutDef.prob.fromEffort * 0.8, 1e-9), 'full effort at 30');
  assert(eventProbability(burnoutDef, { ...fresh(aarav), effort: 1, age: 40, growthBoost: 0 }, 'crisis') > p(1, 40) * 1.4, 'a crisis year is harder');
  assert(p(1, 50) > p(1, 30), 'older is harder');
  assertEqual(eventProbability(burnoutDef, { ...fresh(aarav), effort: 0, retired: true, age: 70, growthBoost: 0 }, 'normal'), 0);
});

test('burnout costs the months off, keeps the job and the cover, and a layoff comes first', () => {
  const s = fresh(aarav);
  const burn = { def: burnoutDef, occurred: true, u1: 0.5, u2: 0 };
  const out = settleEvents(s, [burn], params.insurance, 1);
  const months = burnoutDef.monthsOut[0] + (burnoutDef.monthsOut[1] - burnoutDef.monthsOut[0]) * 0.5;
  assert(near(out.salaryReceived, s.salary * (12 - months) / 12));
  assertEqual(out.records[0].id, 'burnout');
  assertEqual(out.severance, 0);
  assertEqual(out.lostJob, false);
  const loss = { def: params.events.find(e => e.kind === 'jobLoss'), occurred: true, u1: 0.5, u2: 0.5 };
  const both = settleEvents(s, [loss, burn], params.insurance, 1);
  assertEqual(both.records.map(r => r.id), ['job_loss']);
});

test('checkEvents accepts a burnout entry and says what is missing from a bad one', () => {
  const bad = structuredClone({ insurance: params.insurance, events: params.events, provenance: {} });
  const b = bad.events.find(e => e.kind === 'burnout');
  delete b.monthsOut;
  b.prob = { fromEffort: 4 };
  let message = '';
  try { checkEvents(bad, params.macro.order, 'events.json'); } catch (e) { message = e.message; }
  assert(message.includes('monthsOut') && message.includes('fromEffort'), message);
});

// ---- what it means for a life ----

test('effort changes your money and your burnouts, never the economy or the markets', () => {
  const a = wholeLife(aarav, 6, 'none');
  const b = wholeLife(aarav, 6, 'serious');
  assertEqual(a.history.map(y => y.regime), b.history.map(y => y.regime));
  assertEqual(a.history.map(y => y.returns), b.history.map(y => y.returns));
  assertEqual(a.history.some(y => y.events.some(e => e.id === 'burnout')), false); // no effort, no burnout
});

test('going all in is no free lunch: it burns out the IT persona often, and does not pay the government officer', () => {
  let burn = 0, light = 0, serious = 0, noneBeatsSerious = 0;
  const seeds = 24;
  for (let seed = 1; seed <= seeds; seed++) {
    const n = wholeLife(meera, seed, 'none').history.at(-1).netWorthReal;
    const sMeera = wholeLife(meera, seed, 'serious').history.at(-1).netWorthReal;
    if (n > sMeera) noneBeatsSerious++;
    const count = (g) => wholeLife(aarav, seed, g).history.reduce((a, y) => a + y.events.filter(e => e.id === 'burnout').length, 0);
    burn += count('serious');
    light += count('light');
  }
  serious = burn / seeds;
  assert(serious > 1, `burnouts per life going all in: ${serious}`);
  assert(light / seeds < serious / 2, `light learners burn out far less: ${light / seeds} vs ${serious}`);
  assert(noneBeatsSerious > seeds / 2, `the officer is usually better off not going all in (${noneBeatsSerious} of ${seeds})`);
});

test('keeping learning pays the IT persona more than coasting, most of the time', () => {
  let wins = 0;
  const seeds = 24;
  for (let seed = 1; seed <= seeds; seed++) {
    if (wholeLife(aarav, seed, 'light').history.at(-1).netWorthReal > wholeLife(aarav, seed, 'none').history.at(-1).netWorthReal) wins++;
  }
  assert(wins > seeds * 0.7, `${wins} of ${seeds}`);
});

// ---- the wellbeing signal and the stage result ----

test('how it felt: balanced, stretched or burnt out, from effort and burnouts', () => {
  const years = (n, effort, burnouts = 0) => Array.from({ length: n }, (_, i) => ({
    retired: false, effort, borrowed: 0, events: i < burnouts ? [{ id: 'burnout' }] : [], homeSale: null, income: 1, expenses: 1,
    cash: 0, holdings: {}, priceIndexEnd: 1, netWorthReal: 0,
  }));
  const run = (hist) => outcome({ history: hist, retirementAge: 60, deathAge: 80 }).wellbeing;
  assertEqual(run(years(30, 0)).signal, 'balanced');
  assertEqual(run(years(30, 0.4)).signal, 'balanced');
  assertEqual(run(years(30, 1)).signal, 'stretched');
  assertEqual(run(years(30, 0, 1)).signal, 'stretched');
  assertEqual(run(years(30, 1, 2)).signal, 'burntOut');
  assertEqual(run(years(30, 1)).hardYears, 30);
});

test('a stage result reports what the skills are adding to pay', () => {
  let s = fresh(aarav, 2);
  s = playStage(s, params, stages[0], decisions, { ...base, growth: 'serious' });
  const sum = stageSummary(s.history, 0);
  assert(sum.skillBoostPct > 0.3, `boost ${sum.skillBoostPct}`);
  const none = stageSummary(playStage(fresh(aarav, 2), params, stages[0], decisions, base).history, 0);
  assertEqual(none.skillBoostPct, 0);
});

test('the verdict includes how it felt', () => {
  const s = playRetirement(wholeLife(aarav, 3, 'serious'), params);
  const o = outcome(s);
  assert(['balanced', 'stretched', 'burntOut'].includes(o.wellbeing.signal));
  assert(o.wellbeing.hardYears > 20 && o.wellbeing.workingYears === 38);
});
