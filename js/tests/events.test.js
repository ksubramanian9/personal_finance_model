import { test, assert, assertEqual } from './harness.js';
import { createRng } from '../engine/rng.js';
import { createState } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { eventProbability, rollEvents, settleEvents } from '../engine/events.js';
import { applyPicks } from '../engine/stages.js';
import { describeEvent, describeCoping, fillTemplate } from '../ui/eventText.js';
import { stageSummary } from '../engine/summary.js';
import { loadParams, checkEvents } from '../data/params.js';
import { loadStages } from '../data/stages.js';
import { loadPersonas } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const def = (id) => params.events.find(e => e.id === id);
const base = { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', retire: 'at60' };
const fresh = (persona = aarav, seed = 4271) => createState(persona, params, { seed, retirementAge: 60 });
const life = (persona, seed, picks = base, p = params) => {
  let s = applyPicks(createState(persona, p, { seed, retirementAge: 60 }), stages[0], decisions, picks);
  s = runUntil(s, p, 60);
  return s;
};
// An event that definitely happens, with chosen severity draws.
const happens = (id, u1 = 0.5, u2 = 0.5) => ({ def: def(id), occurred: true, u1, u2 });

// ---- events.json ----

test('events.json loads: 8 events, every kind has what it needs', () => {
  assertEqual(params.events.length, 8);
  assertEqual(params.events.map(e => e.id), ['job_loss', 'job_offer', 'medical_self', 'parent_health', 'big_repair', 'relative_loan', 'family_wedding', 'windfall']);
  assert(params.insurance.employerCoverReal > 0, 'employer cover');
});

test('checkEvents explains unknown kinds, bad ranges, missing regimes and a short age table', () => {
  const bad = structuredClone({ insurance: params.insurance, events: params.events, provenance: {} });
  bad.events[0].kind = 'meteor';
  bad.events[2].amountReal = [500, 100];
  delete bad.events[3].regimeMult.crisis;
  bad.events[4].ageMult = [[60, 1]];
  bad.events[5].coveredBy = ['neighbour'];
  try { checkEvents(bad, params.macro.order, 'events.json'); assert(false, 'should have thrown'); }
  catch (err) {
    const all = err.problems.join('\n');
    assert(all.includes('"events[0].kind" should be one of'), all);
    assert(all.includes('events[2].amountReal'), all);
    assert(all.includes('events[3].regimeMult.crisis'), all);
    assert(all.includes('events[4].ageMult" should end with a band up to age 100'), all);
    assert(all.includes('events[5].coveredBy'), all);
  }
});

test('every event has a story whose placeholders the UI can fill', () => {
  for (const e of params.events) {
    const holes = [...e.story.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    for (const h of holes) assert(['cost', 'amount', 'months', 'pct'].includes(h), `${e.id}: unknown placeholder {${h}}`);
  }
});

// ---- probabilities ----

test('probability: layoff chance comes from the persona; government jobs never lay off', () => {
  const l = def('job_loss');
  assertEqual(eventProbability(l, fresh(meera), 'crisis'), 0);
  assert(eventProbability(l, fresh(aarav), 'normal') > 0, 'IT can be laid off');
});

test('probability: the economy and age move the odds the way the file says', () => {
  const l = def('job_loss'), s = fresh(aarav);
  const p = (regime) => eventProbability(l, s, regime);
  assert(p('crisis') > p('slowdown') && p('slowdown') > p('normal') && p('normal') > p('boom'), 'regime ordering');
  assert(Math.abs(p('crisis') / p('normal') - 4) < 1e-9, 'crisis is four times a normal year');
  const old = { ...s, age: 58 };
  assert(eventProbability(l, old, 'normal') > p('normal'), 'older workers are laid off more');
  const m = def('medical_self');
  assert(eventProbability(m, { ...s, age: 60 }, 'normal') > eventProbability(m, { ...s, age: 25 }, 'normal'), 'illness rises with age');
});

test('probability: stronger skills lower the layoff chance and raise the odds of an offer', () => {
  const s = fresh(aarav), strong = { ...s, growthBoost: 0.025 };
  assert(eventProbability(def('job_loss'), strong, 'normal') < eventProbability(def('job_loss'), s, 'normal'), 'fewer layoffs');
  assert(eventProbability(def('job_offer'), strong, 'normal') > eventProbability(def('job_offer'), s, 'normal'), 'more offers');
});

test('probability: no pay-jump offers for a persona whose job has no switching premium', () => {
  assertEqual(eventProbability(def('job_offer'), fresh(meera), 'boom'), 0);
});

test('probability is always a probability', () => {
  for (const e of params.events) for (const r of params.macro.order) for (const age of [22, 40, 60, 80]) {
    const p = eventProbability(e, { ...fresh(), age, growthBoost: 0.1 }, r);
    assert(p >= 0 && p <= 0.95, `${e.id} ${r} ${age}: ${p}`);
  }
});

test('long-run frequency matches the probability', () => {
  const s = fresh(aarav);
  const n = 20000;
  const rng = createRng(77);
  const target = { ...s, rngEvents: rng };
  const m = def('big_repair');
  let hits = 0;
  for (let i = 0; i < n; i++) hits += rollEvents(target, [m], 'normal')[0].occurred ? 1 : 0;
  assert(Math.abs(hits / n - 0.06) < 0.01, `saw ${hits / n}, expected 0.06`);
});

test('rollEvents always draws exactly 3 numbers per event, so one event never shifts another', () => {
  const a = { ...fresh(), rngEvents: createRng(5) }, b = { ...fresh(), rngEvents: createRng(5) };
  rollEvents(a, params.events, 'normal');
  rollEvents(b, params.events.slice(0, 2), 'crisis');
  rollEvents(b, params.events.slice(2), 'boom');
  assertEqual(a.rngEvents, b.rngEvents);
});

// ---- the money ----

test('layoff: pay stops for the months out, severance helps, the next job pays less', () => {
  const s = fresh(aarav);
  const r = settleEvents(s, [happens('job_loss', 0.5, 0.5)], params.insurance, 1);
  const months = 3 + (9 - 3) * 0.5;
  assert(Math.abs(r.salaryReceived - s.salary * (12 - months) / 12) < 1e-6, 'pay for the months worked');
  assert(Math.abs(r.severance - s.salary / 12 * 2) < 1e-6, 'two months of severance');
  assert(Math.abs(r.payHit - 0.06) < 1e-9, 'a 6% pay cut at the midpoint');
  assert(r.lostJob, 'flagged');
  assertEqual(r.records[0].months, months);
});

test('layoff in a tick: income falls this year and salary is lower afterwards', () => {
  const s0 = fresh(aarav);
  const r = settleEvents(s0, [happens('job_loss', 0.5, 1)], params.insurance, 1);
  assert(r.salaryReceived + r.severance < s0.salary, 'income this year is below full pay');
  assert(Math.abs(r.payHit - 0.12) < 1e-9, 'worst pay hit is 12%');
});

test('hospital bill: the employer pays first, then the player\'s policy, then the player', () => {
  const s = { ...fresh(aarav), healthCover: 500000 };
  // u1 = 1 -> the largest bill: 20 lakh
  const r = settleEvents(s, [happens('medical_self', 1)], params.insurance, 1);
  assertEqual(r.records[0].costReal, 2000000);
  assertEqual(r.records[0].coveredReal, 300000 + 500000);
  assertEqual(r.records[0].pocketReal, 2000000 - 800000);
  assertEqual(r.insurancePaid, 800000);
  assertEqual(r.eventCost, 1200000);
});

test('hospital bill: cover is a yearly limit shared by every claim that year', () => {
  const s = { ...fresh(aarav), healthCover: 0 };
  const one = (u) => ({ ...happens('medical_self', u) });
  const r = settleEvents(s, [one(1), one(1)], params.insurance, 1);
  assertEqual(r.insurancePaid, 300000); // employer limit, once
  assertEqual(r.eventCost, 4000000 - 300000);
});

test('losing your job in the same year costs you the employer cover', () => {
  const s = fresh(aarav);
  const withJob = settleEvents(s, [happens('medical_self', 1)], params.insurance, 1);
  const laidOff = settleEvents(s, [happens('job_loss'), happens('medical_self', 1)], params.insurance, 1);
  assertEqual(withJob.insurancePaid, 300000);
  assertEqual(laidOff.insurancePaid, 0);
});

test('a parent\'s illness is covered by your own policy only, not the employer\'s', () => {
  const s = { ...fresh(aarav), healthCover: 500000 };
  const r = settleEvents(s, [happens('parent_health', 1)], params.insurance, 1);
  assertEqual(r.records[0].coveredReal, 500000);
});

test('events that insurance cannot touch are paid in full', () => {
  const s = { ...fresh(aarav), healthCover: 2500000 };
  const r = settleEvents(s, [happens('big_repair', 1)], params.insurance, 1);
  assertEqual(r.records[0].coveredReal, 0);
  assertEqual(r.records[0].pocketReal, 250000);
});

test('amounts are in today\'s rupees: the nominal bill grows with prices', () => {
  const s = fresh(aarav);
  const a = settleEvents(s, [happens('big_repair', 0.5)], params.insurance, 1);
  const b = settleEvents(s, [happens('big_repair', 0.5)], params.insurance, 3);
  assert(Math.abs(b.eventCost - 3 * a.eventCost) < 1e-6, 'three times the prices, three times the bill');
  assertEqual(a.records[0].costReal, b.records[0].costReal);
});

test('shape makes small bills common: a middling draw is far below the midpoint', () => {
  const r = settleEvents(fresh(), [happens('medical_self', 0.5)], params.insurance, 1);
  assert(r.records[0].costReal < 300000, `a median hospital bill was ${r.records[0].costReal}`);
});

test('windfall adds income; a job offer lifts pay by the persona\'s switching premium', () => {
  const w = settleEvents(fresh(), [happens('windfall', 1)], params.insurance, 1);
  assertEqual(w.extraIncome, 3000000);
  const o = settleEvents(fresh(aarav), [happens('job_offer')], params.insurance, 1);
  assertEqual(o.payJump, 0.3);
});

// ---- inside the tick ----

test('every year still balances with events, windfalls and premiums in it', () => {
  for (const persona of [aarav, meera]) {
    for (const seed of [1, 2, 3, 4, 5, 6, 4271]) {
      const s = life(persona, seed, { ...base, health: 'strong', emergency: 'six' });
      for (const y of s.history) {
        const explained = y.netWorthStart + y.income + y.extraIncome - y.expenses - y.consumed
          + y.investGain + y.cashInterest - y.debtInterest;
        assert(Math.abs(explained - y.netWorth) < 1e-4, `${persona.id} seed ${seed} age ${y.age}: ${explained} vs ${y.netWorth}`);
      }
    }
  }
});

test('events do not depend on what you buy, save or invest in: same seed, same events', () => {
  const sig = (s) => JSON.stringify(s.history.map(y => y.events.map(e => [e.id, e.age])));
  const none = sig(life(aarav, 4271));
  assertEqual(sig(life(aarav, 4271, { ...base, health: 'strong', emergency: 'six', invest: 'bold', savings: 'frugal' })), none);
});

test('the one exception is skill: investing in yourself changes the layoff and offer odds, never the draws', () => {
  const rolls = (growthBoost) => {
    const s = { ...fresh(aarav), rngEvents: createRng(9), growthBoost };
    return rollEvents(s, params.events, 'normal').map(r => [r.u1, r.u2]);
  };
  assertEqual(rolls(0), rolls(0.025));
});

test('events do not shift the markets: the economy and returns are the same with events switched off', () => {
  const sig = (s) => JSON.stringify(s.history.map(y => [y.regime, y.returns]));
  assertEqual(sig(life(aarav, 4271)), sig(life(aarav, 4271, base, { ...params, events: [] })));
});

test('insurance and the emergency fund change the cost, not the event', () => {
  let compared = 0;
  for (let seed = 1; seed <= 150 && compared < 3; seed++) {
    const bare = life(aarav, seed);
    const covered = life(aarav, seed, { ...base, health: 'strong' });
    const bill = (s) => s.history.filter(y => y.events.some(e => e.id === 'medical_self'));
    if (!bill(bare).length) continue;
    compared++;
    const bareCost = bill(bare).reduce((a, y) => a + y.eventCost / y.priceIndexStart, 0);
    const coveredCost = bill(covered).reduce((a, y) => a + y.eventCost / y.priceIndexStart, 0);
    assert(coveredCost <= bareCost + 1e-6, `seed ${seed}: with cover ${coveredCost} vs without ${bareCost}`);
    assert(covered.history.some(y => y.premium > 0), 'premiums were paid');
  }
  assert(compared === 3, 'found three lives with a hospital stay');
});

test('premiums rise with age and with prices, and cost nothing if you buy no cover', () => {
  const s = life(aarav, 1, { ...base, health: 'basic' });
  const real = (y) => y.premium / y.priceIndexStart;
  assert(real(s.history[0]) < 12000 + 1e-6, 'at 22 (before the age loading starts) the premium is the base 12,000');
  assert(Math.abs(real(s.history[0]) - 12000) < 1e-6, 'base premium at 22');
  const at50 = s.history.find(y => y.age === 50);
  assert(Math.abs(real(at50) - 12000 * (1 + 0.04 * 20)) < 1e-6, 'age-loaded premium at 50');
  assertEqual(life(aarav, 1).history.every(y => y.premium === 0), true);
});

test('the emergency fund fills with new savings before anything is invested', () => {
  const noEvents = { ...params, events: [] };
  const s0 = applyPicks(fresh(aarav), stages[0], decisions, { ...base, emergency: 'six' });
  const y = tickYear(s0, noEvents).history[0];
  const target = 6 * (30000 * 12 + 15000 * 12) / 12;
  assert(y.toCash > 0, 'some savings went to cash');
  assert(y.toCash <= y.saved + 1e-9, 'never more than was saved');
  const s1 = tickYear(s0, noEvents);
  const filled = s1.cash >= Math.min(target, s0.cash * 1.03 + y.saved) - 1;
  assert(filled, 'cash is topped up as far as savings allow');
  assert(Math.abs(Object.values(y.holdings).reduce((a, b) => a + b, 0) - (y.saved - y.toCash) - y.investGain) < 1e-6, 'only the rest was invested');
});

test('once the fund is full, savings go back to investments', () => {
  const noEvents = { ...params, events: [] };
  let s = applyPicks(fresh(aarav), stages[0], decisions, { ...base, emergency: 'three' });
  s = runUntil(s, noEvents, 40);
  const last = s.history.at(-1);
  // the fund target grows with prices, so a small top-up each year is normal; the rest is invested
  assert(last.toCash < last.saved * 0.2, `top-up ${last.toCash} of ${last.saved}`);
  assert(Object.values(s.holdings).reduce((a, b) => a + b, 0) > 0, 'invested');
});

test('with a fund and cover, a bad run is less likely to end in borrowing', () => {
  const borrowers = (picks) => {
    let n = 0;
    for (let seed = 1; seed <= 120; seed++) if (life(aarav, seed, picks).history.some(y => y.borrowed > 0)) n++;
    return n;
  };
  const bare = borrowers(base), cushioned = borrowers({ ...base, emergency: 'six', health: 'strong' });
  assert(bare > 5, `expected some bare lives to borrow, saw ${bare}`);
  assert(cushioned < bare, `cushioned ${cushioned} vs bare ${bare}`);
});

test('government employees are never laid off; IT employees are, about twice a life', () => {
  let gov = 0, it = 0;
  for (let seed = 1; seed <= 100; seed++) {
    gov += life(meera, seed).history.filter(y => y.events.some(e => e.id === 'job_loss')).length;
    it += life(aarav, seed).history.filter(y => y.events.some(e => e.id === 'job_loss')).length;
  }
  assertEqual(gov, 0);
  assert(it / 100 > 1.2 && it / 100 < 3.8, `layoffs per IT life: ${it / 100}`);
});

test('the same life with events is reproducible and reloadable mid-way', () => {
  assertEqual(life(aarav, 4271), life(aarav, 4271));
  const mid = runUntil(applyPicks(fresh(), stages[0], decisions, base), params, 40);
  assertEqual(runUntil(JSON.parse(JSON.stringify(mid)), params, 60), runUntil(mid, params, 60));
});

// ---- summaries and text ----

test('stageSummary lists the events of the stage in today\'s rupees, with how any shortfall was met', () => {
  const s = life(aarav, 11, { ...base, emergency: 'none' });
  const sum = stageSummary(s.history, 0);
  const total = s.history.reduce((n, y) => n + y.events.length, 0);
  assertEqual(sum.eventYears.reduce((n, y) => n + y.events.length, 0), total);
  assert(sum.eventYears.every(y => y.coping.fromCash >= 0 && y.coping.borrowed >= 0), 'coping amounts present');
});

test('describeEvent: the story, insurance lines and severance', () => {
  const lines = describeEvent(def('medical_self'), { id: 'medical_self', costReal: 500000, coveredReal: 300000, pocketReal: 200000 });
  assertEqual(lines[0], 'A hospital stay cost ₹5 lakh.');
  assertEqual(lines[1], 'Insurance paid ₹3 lakh and you paid ₹2 lakh.');
  assertEqual(describeEvent(def('medical_self'), { costReal: 100000, coveredReal: 100000, pocketReal: 0 })[1], 'Insurance paid all of it, so it cost you nothing.');
  assertEqual(describeEvent(def('medical_self'), { costReal: 100000, coveredReal: 0, pocketReal: 100000 })[1], 'No insurance cover helped.');
  assertEqual(describeEvent(def('big_repair'), { costReal: 90000, coveredReal: 0, pocketReal: 90000 }).length, 1);
  const loss = describeEvent(def('job_loss'), { months: 5.5, pct: 6.2, severanceReal: 60000 });
  assertEqual(loss[0], 'Layoffs hit and you were out of work for 6 months. Your next job paid 6% less.');
  assertEqual(loss[1], 'Severance softened the blow by ₹60,000.');
  assertEqual(describeEvent(def('job_offer'), { pct: 30 })[0], "A recruiter's offer was too good to refuse. Your pay jumped 30%.");
  assertEqual(describeEvent(def('windfall'), { amountReal: 1500000 })[0], 'A bonus, a small inheritance or a lucky break brought in ₹15 lakh.');
});

test('fillTemplate leaves unknown placeholders visible', () => {
  assertEqual(fillTemplate('hello {name} {x}', { name: 'Asha' }), 'hello Asha {x}');
});

test('describeCoping: cash, then sales in order, then borrowing', () => {
  assertEqual(describeCoping({ fromCash: 0, sold: {}, borrowed: 0 }, params.instruments), null);
  assertEqual(describeCoping({ fromCash: 100000, sold: {}, borrowed: 0 }, params.instruments), 'To cover the gap you used ₹1 lakh of your cash.');
  assertEqual(
    describeCoping({ fromCash: 100000, sold: { fd: 50000, equity: 20000 }, borrowed: 0 }, params.instruments),
    'To cover the gap you used ₹1 lakh of your cash, sold ₹50,000 of fixed deposits and sold ₹20,000 of equity index funds.');
  assertEqual(
    describeCoping({ fromCash: 0, sold: {}, borrowed: 250000 }, params.instruments),
    'To cover the gap you borrowed ₹2.5 lakh.');
});
