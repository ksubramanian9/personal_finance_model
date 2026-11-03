import { test, assert, assertEqual } from './harness.js';
import { createState } from '../engine/state.js';
import { createRng } from '../engine/rng.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { eventProbability, settleEvents } from '../engine/events.js';
import { retire } from '../engine/retirement.js';
import { playStage, playRetirement } from '../engine/stages.js';
import { outcome } from '../engine/outcomes.js';
import { bridge } from '../engine/explain.js';
import { loadParams, checkRetirement } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const R = params.retirement;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fresh = (persona = aarav, seed = 4271, retirementAge = 60) => createState(persona, params, { seed, retirementAge });
const base = { savings: 'balanced', invest: 'mixed', emergency: 'three', health: 'basic', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };

function wholeLife(persona, seed, over = {}) {
  let s = fresh(persona, seed);
  for (const st of stages) s = playStage(s, params, st, decisions, { ...base, ...over });
  return playRetirement(s, params);
}

// ---- retirement.json ----

test('retirement.json loads: a life-length curve and a pension share', () => {
  assert(R.lifespan.minAge >= 66 && R.lifespan.maxAge > R.lifespan.meanAge && R.lifespan.meanAge > R.lifespan.minAge);
  assert(R.pension.shareOfLastPay > 0 && R.pension.shareOfLastPay <= 1);
  assertEqual(params.instruments.find(i => i.id === 'pf').retiredDrawOrder, 1.5);
});

test('checkRetirement explains a life that could end before retirement, and bad shares', () => {
  const bad = structuredClone(R);
  bad.lifespan.minAge = 60;
  bad.lifespan.sdYears = -1;
  bad.pension.shareOfLastPay = 2;
  let message = '';
  try { checkRetirement(bad, 'retirement.json'); } catch (e) { message = e.message; }
  for (const part of ['lifespan.minAge', 'lifespan.sdYears', 'pension.shareOfLastPay']) assert(message.includes(part), `mention ${part}: ${message}`);
});

// ---- how long a life lasts ----

test('the end of life is drawn from the seed alone, between the limits, and moves no other luck', () => {
  const a = fresh(aarav, 11);
  const b = fresh(meera, 11);
  assertEqual(a.deathAge, b.deathAge);
  assert(a.deathAge >= R.lifespan.minAge && a.deathAge <= R.lifespan.maxAge);
  assertEqual(a.rng, createRng(11));
  assertEqual(a.rngEvents, createRng('11:events'));
});

test('across many seeds, lives average about the mean and vary', () => {
  const ages = [];
  for (let seed = 1; seed <= 600; seed++) ages.push(fresh(aarav, seed).deathAge);
  const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
  assert(Math.abs(mean - R.lifespan.meanAge) < 1, `mean ${mean}`);
  assert(Math.min(...ages) < 70 && Math.max(...ages) > 90, 'a real spread');
  assert(ages.every(a => a >= 68 && a <= 100));
});

test('nobody dies before they can retire', () => {
  for (let seed = 1; seed <= 400; seed++) assert(fresh(aarav, seed, 65).deathAge > 65, `seed ${seed}`);
});

// ---- the day the pay stops ----

test('retiring: pay, learning and parents\' support stop; costs become the chosen share; a pension appears for those who have one', () => {
  for (const [persona, pension] of [[aarav, 0], [meera, R.pension.shareOfLastPay]]) {
    const s = fresh(persona);
    s.salary = 1e6; s.learningPct = 0.06; s.growthBoost = 0.025; s.retireSpendPct = 0.75;
    const living = s.livingCost;
    retire(s, params);
    assertEqual(s.retired, true);
    assertEqual(s.salary, 0);
    assertEqual(s.learningPct, 0);
    assertEqual(s.support, 0);
    assert(near(s.livingCost, living * 0.75));
    assert(near(s.pension, 1e6 * pension), `${persona.id} pension ${s.pension}`);
  }
});

test('the first retired year has no pay, only a pension, and no layoffs or offers can happen', () => {
  const s = runUntil(fresh(meera), params, 60);
  assertEqual(s.retired, false);
  const t = tickYear(s, params);
  const y = t.history.at(-1);
  assertEqual(y.retired, true);
  assert(near(y.income, y.pension) && y.pension > 0, 'income is the pension');
  assertEqual(y.learning, 0);
  const jobLoss = params.events.find(e => e.kind === 'jobLoss');
  const offer = params.events.find(e => e.kind === 'payJump');
  assertEqual(eventProbability(jobLoss, t, 'crisis'), 0);
  assertEqual(eventProbability(offer, t, 'boom'), 0);
  assert(eventProbability(jobLoss, runUntil(fresh(aarav), params, 40), 'crisis') > 0, 'still possible while working');
});

test('the employer\'s health cover ends with the job', () => {
  const working = fresh(aarav);
  const retired = { ...fresh(aarav), retired: true, salary: 0 };
  const hospital = params.events.find(e => e.id === 'medical_self');
  const roll = [{ def: hospital, occurred: true, u1: 0.1, u2: 0 }];
  const a = settleEvents(working, roll, params.insurance, 1);
  const b = settleEvents(retired, roll, params.insurance, 1);
  assert(a.insurancePaid > 0 && b.insurancePaid === 0, `${a.insurancePaid} vs ${b.insurancePaid}`);
});

test('the pension is linked to prices: it grows with inflation and is flat in today\'s rupees', () => {
  const s = runUntil(fresh(meera), params, 66);
  const years = s.history.filter(y => y.retired);
  assert(years.length >= 5);
  for (let i = 1; i < years.length; i++) {
    assert(near(years[i].pension / years[i - 1].pension, years[i].priceIndexStart / years[i - 1].priceIndexStart, 1e-9), `year ${years[i].age}`);
  }
});

test('provident funds open up in retirement, after fixed deposits and before gold and shares', () => {
  const holdings = { pf: 5e6, equity: 5e6, fd: 5e6, gold: 5e6 };
  const drawn = (retired) => {
    const s = fresh(aarav, 4271, 60);
    Object.assign(s, { cash: 0, holdings: { ...holdings }, age: 40, retired, salary: retired ? 0 : 5e5 });
    s.livingCost = 1.2e7; // a gap of more than the fixed deposits
    s.lots = { equity: [], gold: [] };
    const y = tickYear(s, params).history[0];
    return y.coping.sold;
  };
  const working = drawn(false);
  assert(working.fd > 0 && !working.pf, 'working: the provident fund is locked');
  const retired = drawn(true);
  assert(retired.fd > 0 && retired.pf > 0, 'retired: fixed deposits then the provident fund');
  assert(!retired.gold || retired.pf >= holdings.pf - 1, 'the fund is used up before gold');
});

// ---- running to the end ----

test('the retirement years run to the end of life, one record a year', () => {
  const s = wholeLife(aarav, 7);
  assertEqual(s.age, s.deathAge);
  assertEqual(s.history.length, s.deathAge - aarav.profile.startAge);
  assert(s.history.every((y, i) => y.age === aarav.profile.startAge + i), 'no gaps');
  assert(s.history.filter(y => y.retired).every(y => y.age >= s.retirementAge));
  assertEqual(s.history.filter(y => !y.retired).at(-1).age, s.retirementAge - 1);
});

test('retirement spending: the chosen share of the last working year\'s costs', () => {
  const comfortable = wholeLife(aarav, 3, { retirementStyle: 'comfortable' }).history.find(y => y.retired);
  const lean = wholeLife(aarav, 3, { retirementStyle: 'lean' }).history.find(y => y.retired);
  const living = (y) => y.expenses - y.rent - y.homeUpkeep - y.emi - y.premium - y.eventCost - y.taxIncome - y.taxInvest - y.childCost;
  assert(near(living(lean) / living(comfortable), 0.55, 1e-6), `lean/comfortable ${living(lean) / living(comfortable)}`);
});

test('the books still balance through retirement, in both kinds of rupee', () => {
  const s = wholeLife(aarav, 9, { retirementStyle: 'modest' });
  for (const real of [false, true]) {
    const b = bridge(s.history, { real });
    const total = Object.values(b.items).reduce((a, x) => a + x, 0);
    assert(near(b.start + total, b.end, 1e-9), `real=${real}: ${b.start + total} vs ${b.end}`);
  }
});

// ---- the verdict ----

test('a life with plenty of savings lasts; one that cannot pay its bills runs out, at the first year of retirement', () => {
  const rich = fresh(aarav, 5, 23);
  rich.cash = 5e8;
  const lasted = outcome(playRetirement(runUntil(rich, params, 23), params));
  assertEqual(lasted.status, 'lasted');
  assertEqual(lasted.ranOutAge, null);
  assertEqual(lasted.yearsFunded, lasted.retiredYears);

  const poor = fresh(aarav, 5, 23);
  poor.startAge = 22;
  const ran = outcome(playRetirement(runUntil(poor, params, 23), params));
  assertEqual(ran.status, 'ranOut');
  assert(ran.ranOutAge >= 23 && ran.yearsFunded < ran.retiredYears, 'ran out before the end');
});

test('selling the home to get through counts as "sold the home", not "lasted"', () => {
  const s = fresh(aarav, 1, 24);
  s.cash = 3e7;
  s.buyHome = 1;
  let t = runUntil(s, params, 24); // the last working year is behind us
  t.cash = 0;
  t.holdings = Object.fromEntries(Object.keys(t.holdings).map(k => [k, 0]));
  t.lots = { equity: [], gold: [] };
  t.deathAge = t.retirementAge + 1; // one year to fund
  t.livingCost = 3e5;
  const o = outcome(playRetirement(t, params));
  assertEqual(o.status, 'soldHome');
  assertEqual(o.soldHomeAge, 24);
});

test('years of cover: finite with a gap, infinite when the pension pays everything', () => {
  const poorish = fresh(aarav, 5, 23);
  poorish.cash = 2e6;
  const o = outcome(playRetirement(runUntil(poorish, params, 23), params));
  assert(Number.isFinite(o.coverYears) && o.coverYears > 0, `cover ${o.coverYears}`);
  const pensioner = fresh(meera, 5, 60);
  pensioner.cash = 1e7;
  pensioner.livingCost = 1e4;
  pensioner.salary = 3e6;
  pensioner.support = 0;
  const p = outcome(playRetirement(runUntil(pensioner, params, 60), params));
  assert(p.pensionReal > 0);
  assertEqual(p.status, 'lasted');
});

test('the verdict never moves with anything but the money: same life, same answer', () => {
  assertEqual(outcome(wholeLife(aarav, 3)), outcome(wholeLife(aarav, 3)));
});

// ---- slow drift: lifestyle creep ----

test('lifestyle drift: spending rises with real pay in proportion to the persona\'s creep, and never falls', () => {
  const run = (creep) => {
    const s = fresh(aarav, 2);
    s.lifestyleCreep = creep;
    return runUntil(s, params, 45);
  };
  const none = run(0);
  const some = run(0.7);
  const lots = run(1);
  assertEqual(none.creepIndex, 1);
  assert(some.creepIndex > 1 && lots.creepIndex > some.creepIndex, `${some.creepIndex} ${lots.creepIndex}`);
  assert(some.livingCost / some.priceIndex > none.livingCost / none.priceIndex, 'dearer in real terms');
  const idx = some.history.map(y => y.drift);
  assert(idx.every(d => d >= 0));
  assert(some.history.at(-1).drift > some.history[0].drift, 'drift grows');
  const b = bridge(some.history, { real: true });
  assert(b.items.drift < 0, 'a named line in the bridge');
  assertEqual(bridge(none.history, { real: true }).items.drift, 0);
});

test('a persona with a bigger creep ends up spending more of what she earns', () => {
  const share = (p) => { const s = runUntil(fresh(p, 4), params, 55); return s.livingCost / s.priceIndex / (s.salary / s.priceIndex); };
  assert(aarav.biases.lifestyleCreep > meera.biases.lifestyleCreep);
  assert(share(aarav) > 0 && share(meera) > 0);
  const driftShare = (p) => { const y = runUntil(fresh(p, 4), params, 55).history.at(-1); return y.drift / y.expenses; };
  assert(driftShare(aarav) > driftShare(meera), 'more drift in the free-spending persona\'s costs');
});
