import { test, assert, assertEqual, assertThrows } from './harness.js';
import { createState } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { marry, birthDue, costBand, childCosts, spouseGross } from '../engine/family.js';
import { playStage, askedDecisions } from '../engine/stages.js';
import { bridge, cashflowSeries } from '../engine/explain.js';
import { stageSummary } from '../engine/summary.js';
import { loadParams, checkFamily } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages, checkStages } from '../data/stages.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const F = params.family;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fresh = (persona = aarav, seed = 4271) => createState(persona, params, { seed, retirementAge: 60 });
const base = { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };

// A whole life with the given family choices (wedding, partner and children picks are only used when asked).
function life(persona, seed, family = {}) {
  let s = fresh(persona, seed);
  for (const st of stages) s = playStage(s, params, st, decisions, { ...base, wedding: 'typical', partner: 'home', children: 'none', ...family });
  return s;
}
// A state that married and has a plan, set up directly.
function married(over = {}) {
  const s = fresh(aarav, 3);
  Object.assign(s, { marryAge: 24, weddingReal: 1500000, spousePct: 0, childPlan: 2 }, over);
  return s;
}

// ---- family.json ----

test('family.json loads: a household multiplier, cost bands that climb, a scale for each city tier', () => {
  assert(F.marriage.livingCostMultiplier > 1 && F.marriage.rentMultiplier >= 1);
  const ages = F.children.costBands.map(b => b.upToAge);
  assertEqual(ages, [...ages].sort((a, b) => a - b));
  assert(F.children.costBands.at(-1).costReal > F.children.costBands[0].costReal / 2, 'college is dear');
  for (const tier of Object.keys(params.housing.cityTiers)) assert(F.children.costScaleByTier[tier] > 0, `scale for tier ${tier}`);
  assert(F.children.costScaleByTier[2] < F.children.costScaleByTier[1], 'a tier-2 city is cheaper');
});

test('checkFamily explains bad multipliers, bands out of order and a missing tier scale', () => {
  const bad = structuredClone(F);
  bad.marriage.livingCostMultiplier = 0.5;
  bad.children.costBands[2].upToAge = 1;
  bad.children.costBands[0].education = 'yes';
  bad.children.costScaleByTier = { 1: -1 };
  let message = '';
  try { checkFamily(bad, 'family.json'); } catch (e) { message = e.message; }
  for (const part of ['livingCostMultiplier', 'costBands', 'education', 'costScaleByTier']) {
    assert(message.includes(part), `message should mention ${part}: ${message}`);
  }
});

// ---- marriage ----

test('nobody marries without a plan, and nothing changes for a single life', () => {
  const s = runUntil(fresh(aarav, 2), params, 35);
  assertEqual(s.spouse, null);
  assert(s.history.every(y => y.weddingCost === 0 && y.spouseNet === 0 && y.childCost === 0 && y.family.length === 0));
});

test('marrying: on the planned age, once, with the wedding bill and a bigger household', () => {
  const s0 = married({ marryAge: 24 });
  const living = s0.livingCost;
  const mid = runUntil(s0, params, 26);
  const y = mid.history.find(h => h.family.includes('married'));
  assertEqual(y.age, 24);
  assert(near(y.weddingCost, 1500000 * y.priceIndexStart), 'wedding in the prices of that year');
  assertEqual(mid.history.filter(h => h.weddingCost > 0).length, 1);
  assert(mid.spouse && mid.spouse.year === y.year);
  // the household uplift: the same year's costs are 40% higher than for a single person on the same luck
  const alone = tickYear(fresh(aarav, 3), params);
  const wed = tickYear(married({ marryAge: 22, childPlan: 0 }), params);
  assert(near(wed.livingCost / alone.livingCost, F.marriage.livingCostMultiplier, 1e-9), 'living costs');
  assert(near(mid.rentReal, aarav.money.monthlyRent * 12 * F.marriage.rentMultiplier), 'a bigger place to rent');
});

test('a couple who rent pay the bigger rent from the wedding year; a single person keeps the old one', () => {
  const wed = tickYear(married({ marryAge: 22 }), params).history[0];
  assert(near(wed.rent, aarav.money.monthlyRent * 12 * F.marriage.rentMultiplier), `rent in the wedding year: ${wed.rent}`);
  const single = tickYear(fresh(aarav, 3), params).history[0];
  assert(near(single.rent, aarav.money.monthlyRent * 12), 'single rent');
  const s = fresh(aarav);
  s.weddingReal = 1e6;
  assert(near(marry(s, params).weddingCost, 1e6 * s.priceIndex), 'marry() returns the bill');
});

// ---- the partner's pay ----

test('a partner who works adds their pay after their own tax; a partner at home adds nothing', () => {
  const working = tickYear(married({ marryAge: 22, spousePct: 0.5 }), params).history[0];
  const home = tickYear(married({ marryAge: 22, spousePct: 0 }), params).history[0];
  assertEqual(home.spouseNet, 0);
  assert(working.spouseNet > 0, 'partner earns');
  const s = married({ marryAge: 22, spousePct: 0.5 });
  const gross = spouseGross({ ...s, spouse: {} });
  assert(working.spouseNet <= gross && working.spouseNet > 0.9 * gross - 1e6, `net ${working.spouseNet} of ${gross}`);
});

test('a partner earning more pays tax at a higher rate, and the household is richer for it', () => {
  const a = life(meera, 4271, { marry: 'at27', partner: 'full', children: 'none' });
  const b = life(meera, 4271, { marry: 'at27', partner: 'home', children: 'none' });
  assert(a.history.at(-1).netWorth > b.history.at(-1).netWorth, 'a second income helps');
  const last = a.history.at(-1);
  assert(last.spouseNet < spouseGross({ spouse: {}, salary: a.salary + 1, spousePct: 0.8 }) * 1.001, 'net is below gross');
});

// ---- children ----

test('births: two years after the wedding, then three years apart, never more than planned', () => {
  const s = runUntil(married({ marryAge: 24, childPlan: 2 }), params, 40);
  const births = s.history.filter(y => y.family.includes('birth')).map(y => y.age);
  assertEqual(births, [26, 29]);
  assertEqual(s.children.length, 2);
  const none = runUntil(married({ marryAge: 24, childPlan: 0 }), params, 40);
  assertEqual(none.children.length, 0);
  const one = runUntil(married({ marryAge: 24, childPlan: 1 }), params, 40);
  assertEqual(one.children.length, 1);
});

test('no child without a marriage', () => {
  const s = runUntil(Object.assign(fresh(aarav), { childPlan: 2 }), params, 40);
  assertEqual(s.children.length, 0);
  assertEqual(birthDue(s, params), false);
});

test('child costs follow age bands, rise with prices, and stop after 21', () => {
  const s = married({ marryAge: 22, childPlan: 1 });
  const grown = runUntil(s, params, 22 + 2 + 23 + 2); // the child is 22+ by the end
  const rows = grown.history.map(y => ({ age: y.year - grown.children[0], cost: y.childCost / y.priceIndexStart }));
  const at = (a) => rows.find(r => r.age === a);
  const metroScale = F.children.costScaleByTier[1];
  assert(near(at(0).cost, F.children.costBands[0].costReal * metroScale), `birth year: ${at(0).cost}`);
  assert(near(at(1).cost, F.children.costBands[1].costReal * metroScale), 'toddler year (no education premium)');
  assert(at(18).cost > at(10).cost && at(10).cost > at(4).cost, 'college dearer than school, dearer than playschool');
  assertEqual(rows.find(r => r.age === 22).cost, 0);
  assert(rows.filter(r => r.age >= 0 && r.age <= 21).every(r => r.cost > 0), 'a cost every year from birth to 21');
  assert(costBand(21, params) && costBand(22, params) === null, 'independent after 21');
});

test('school and college fees outrun prices, early years do not', () => {
  const s = married({ marryAge: 22, childPlan: 1 });
  const later = runUntil(s, params, 22 + 2 + 12);
  const y6 = later.history.find(h => h.year - later.children[0] === 6);
  const y1 = later.history.find(h => h.year - later.children[0] === 1);
  const premium = (1 + F.children.educationPremiumPct / 100) ** (y6.year - params.startYear);
  assert(near(y6.childCost / y6.priceIndexStart, F.children.costBands[3].costReal * F.children.costScaleByTier[1] * premium, 1e-9), 'school fee index');
  assert(near(y1.childCost / y1.priceIndexStart, F.children.costBands[1].costReal * F.children.costScaleByTier[1], 1e-9), 'no premium before school');
});

test('a tier-2 city\'s child costs are a fixed share of a metro\'s for the same age and prices', () => {
  const sA = { ...fresh(aarav), spouse: {}, children: [2026], year: 2030, priceIndex: 1.3, educationIndex: 1.1 };
  const sM = { ...sA, cityTier: 2 };
  assert(near(childCosts(sM, params) / childCosts(sA, params), F.children.costScaleByTier[2]));
});

// ---- the books and the luck ----

test('family changes your money, never your luck', () => {
  const single = life(aarav, 6);
  const family = life(aarav, 6, { marry: 'at27', partner: 'part', children: 'two' });
  assertEqual(single.history.map(y => y.regime), family.history.map(y => y.regime));
  assertEqual(single.history.map(y => y.events.map(e => e.id)), family.history.map(y => y.events.map(e => e.id)));
  assertEqual(single.history.map(y => y.returns), family.history.map(y => y.returns));
});

test('a family\'s bridge adds up from start to end, in both kinds of rupee, and year by year', () => {
  const s = life(aarav, 8, { marry: 'at27', partner: 'part', children: 'two' });
  for (const real of [false, true]) {
    const b = bridge(s.history, { real });
    const total = Object.values(b.items).reduce((a, x) => a + x, 0);
    assert(near(b.start + total, b.end, 1e-9), `real=${real}: ${b.start} + ${total} vs ${b.end}`);
    assert(b.items.spouse > 0 && b.items.children < 0 && b.items.wedding < 0, 'family lines present');
  }
  for (const y of s.history) {
    const b = bridge([y], { real: false });
    assert(near(b.start + Object.values(b.items).reduce((a, x) => a + x, 0), b.end, 1e-9), `age ${y.age}`);
  }
});

test('earned in the cash-flow series includes a partner\'s pay', () => {
  const s = life(meera, 2, { marry: 'at27', partner: 'full', children: 'none' });
  const rows = cashflowSeries(s.history, { real: false });
  const y = s.history.at(-1);
  assert(near(rows.at(-1).earned, y.income + y.extraIncome + y.spouseNet));
  assert(y.spouseNet > 0);
});

test('stageSummary reports the wedding, births, partner pay and child costs', () => {
  let s = fresh(meera, 5);
  const start = s.history.length;
  s = playStage(s, params, stages[0], decisions, { ...base, marry: 'at27', wedding: 'modest', partner: 'part' });
  const sum = stageSummary(s.history, start);
  assertEqual(sum.familyMoves.map(m => m.kind), ['married']);
  assert(sum.weddingReal > 0 && sum.spouseReal > 0 && sum.childrenReal === 0);
  s = playStage(s, params, stages[1], decisions, { ...base, children: 'two' });
  const second = stageSummary(s.history, 6);
  assert(second.familyMoves.filter(m => m.kind === 'birth').length >= 1 && second.childrenReal > 0);
});

// ---- the questions ----

test('marriage questions appear only when they apply', () => {
  const early = stages[0];
  const ids = (picks, state = fresh()) => askedDecisions(early, state, picks).map(r => r.id);
  assert(ids({}).includes('marry'));
  assert(!ids({}).includes('wedding') && !ids({}).includes('partner'), 'nothing to ask about a wedding yet');
  assert(!ids({ marry: 'single' }).includes('wedding'));
  assert(ids({ marry: 'at27' }).includes('wedding') && ids({ marry: 'at27' }).includes('partner'), 'wedding and partner once marriage is planned');
  const wed = { ...fresh(), spouse: { year: 2030 } };
  assert(!ids({}, wed).includes('marry'), 'not asked again once married');

  const family = stages.find(s => s.id === 'family');
  assert(!askedDecisions(family, fresh(), {}).some(r => r.id === 'children'), 'no children question for someone single with no plan');
  assert(askedDecisions(family, fresh(), { marryLater: 'at34' }).some(r => r.id === 'children'), 'children question once marriage is planned');
  assert(askedDecisions(family, wed, {}).some(r => r.id === 'children'), 'and for the married');

  const peak = stages.find(s => s.id === 'peak');
  assert(askedDecisions(peak, wed, {}).some(r => r.id === 'children'), 'married and childless are asked late');
  assert(!askedDecisions(peak, { ...wed, children: [2030] }, {}).some(r => r.id === 'children'), 'not once there are children');
  assert(!askedDecisions(peak, fresh(), {}).some(r => r.id === 'children'), 'not for the single');
});

test('marrying late: chosen in the family stage, the wedding happens inside it', () => {
  let s = fresh(aarav, 4);
  s = playStage(s, params, stages[0], decisions, base);
  assertEqual(s.spouse, null);
  s = playStage(s, params, stages[1], decisions, { ...base, marryLater: 'at34', wedding: 'modest', partner: 'part', children: 'one' });
  assert(s.spouse && s.spouse.year === 2026 + (34 - 22), 'married at 34');
  assertEqual(s.history.find(y => y.family.includes('married')).age, 34);
});

test('a married player is not asked about marriage again, and their choices record only what was asked', () => {
  let s = fresh(meera, 1);
  s = playStage(s, params, stages[0], decisions, { ...base, marry: 'at27', wedding: 'typical', partner: 'full' });
  assertEqual(s.choices.early, { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', marry: 'at27', wedding: 'typical', partner: 'full' });
  assert(!askedDecisions(stages[1], s, {}).some(r => r.id === 'marryLater'), 'married: no marryLater');
});

test('the onlyIf names are checked', () => {
  const raw = JSON.parse(JSON.stringify({ decisions, stages, provenance: { basis: 'x', confidence: 'low', asOf: 1 } }));
  raw.stages[0].decisions.find(r => r.id === 'wedding').onlyIf = ['single', 'nonsense'];
  assertThrows(() => checkStages(raw, 'stages.json'), 'nonsense');
});
