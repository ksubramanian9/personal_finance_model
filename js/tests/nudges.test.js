import { test, assert, assertEqual } from './harness.js';
import { createState } from '../engine/state.js';
import { createRng, nextFloat } from '../engine/rng.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { rollNudges, pickCard, answerNudge, playUntilCard, strength, gutLine } from '../engine/nudges.js';
import { playStage, beginStage, continueStage } from '../engine/stages.js';
import { bridge } from '../engine/explain.js';
import { outcome } from '../engine/outcomes.js';
import { stageSummary } from '../engine/summary.js';
import { loadParams, checkNudges } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { describeAnswer, describeCard } from '../ui/nudgeText.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const N = params.nudges;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fresh = (persona = aarav, seed = 4271) => createState(persona, params, { seed, retirementAge: 60 });
const base = { savings: 'balanced', invest: 'mixed', emergency: 'three', health: 'basic', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };
const early = stages[0];

// Plays every stage, answering each card with `policy(card)`.
function life(persona, seed, policy) {
  let s = fresh(persona, seed);
  const shown = [];
  for (const st of stages) {
    const b = beginStage(s, params, st, decisions, base);
    s = b.state;
    for (;;) {
      const r = continueStage(s, params, st, b.endAge);
      s = r.state;
      if (!r.card) break;
      shown.push(r.card);
      s = answerNudge(s, params, st, r.card, policy(r.card));
    }
  }
  return { s, shown };
}

// ---- nudges.json ----

test('nudges.json loads: four cards, each with three gut lines and two answers', () => {
  assertEqual(Object.keys(N.cards), ['crash', 'raise', 'festival', 'tip']);
  for (const c of Object.values(N.cards)) {
    assertEqual(c.gut.length, 3);
    assert(c.follow.title && c.resist.title && c.story);
  }
  assert(N.perStage >= 1);
});

test('checkNudges explains bad numbers and missing text', () => {
  const bad = structuredClone(N);
  bad.cards.crash.trigger.equityReturnBelow = 0.1;
  bad.cards.tip.effect.winProb = 4;
  bad.cards.raise.gut = ['only one'];
  delete bad.cards.festival.follow;
  bad.cards.raise.firing.baseProb = 3;
  let message = '';
  try { checkNudges(bad, 'nudges.json'); } catch (e) { message = e.message; }
  for (const part of ['equityReturnBelow', 'winProb', 'raise.gut', 'festival.follow', 'raise.firing.baseProb']) assert(message.includes(part), `mention ${part}: ${message}`);
});

// ---- traits ----

test('traits set how loudly the gut speaks: calm, middling, loud', () => {
  const crash = N.cards.crash;
  assertEqual(gutLine(crash, { panicSell: 0.1 }), crash.gut[0]);
  assertEqual(gutLine(crash, { panicSell: 0.5 }), crash.gut[1]);
  assertEqual(gutLine(crash, { panicSell: 0.9 }), crash.gut[2]);
  assert(near(strength(N.cards.tip, { overConservatism: 0.8 }), 0.2), 'a cautious person feels little pull towards a tip');
  assert(strength(N.cards.raise, aarav.biases) > strength(N.cards.raise, meera.biases));
});

// ---- the rolls ----

test('every year draws exactly four numbers from the cards\' own stream, whatever happens', () => {
  const s = runUntil(fresh(aarav, 9), params, 40);
  const probe = createRng('9:nudges');
  for (let i = 0; i < 4 * s.history.length; i++) nextFloat(probe);
  assertEqual(s.rngNudges, probe);
  // and the other streams are as they were before cards existed
  assertEqual(s.history.length, 18);
});

test('a retired player gets no cards, but the stream still advances', () => {
  const s = runUntil(fresh(meera, 3), params, 62);
  assert(s.history.filter(y => y.retired).every(y => y.nudges.length === 0));
  const probe = createRng('3:nudges');
  for (let i = 0; i < 4 * s.history.length; i++) nextFloat(probe);
  assertEqual(s.rngNudges, probe);
});

test('a crash card needs a big fall and real money in shares', () => {
  const s = fresh(aarav);
  const roll = (equityReturn, equityValue) => rollNudges({ ...structuredClone(s), rngNudges: createRng(1) }, params, { equityReturn, equityValue, payJump: 0 }).find(c => c.id === 'crash');
  assert(roll(-0.2, 5e5), 'a 20% fall with 5 lakh in shares');
  assertEqual(roll(-0.1, 5e5), undefined);
  assertEqual(roll(-0.4, 5e4), undefined);
  assertEqual(roll(-0.15, 1e5) !== undefined, true);
  assertEqual(roll(-0.2, 5e5).pct, 20);
});

test('a raise card needs a job offer; a persona with more pull gets it more often', () => {
  const rate = (biases, payJump) => {
    let n = 0;
    for (let seed = 1; seed <= 800; seed++) {
      const s = { ...structuredClone(fresh(aarav)), rngNudges: createRng(seed), biases };
      if (rollNudges(s, params, { equityReturn: 0, equityValue: 0, payJump }).some(c => c.id === 'raise')) n++;
    }
    return n / 800;
  };
  assertEqual(rate({ lifestyleCreep: 0.7 }, 0), 0);
  const high = rate({ lifestyleCreep: 0.9 }, 0.3);
  const low = rate({ lifestyleCreep: 0.1 }, 0.3);
  assert(high > low + 0.3, `${high} vs ${low}`);
  assert(Math.abs(low - Math.min(1, N.cards.raise.firing.baseProb + 0.1)) < 0.06, `low ${low}`);
});

test('the hot tip stakes a tenth of sellable savings, and whether it pays is fixed by the seed', () => {
  const s = Object.assign(structuredClone(fresh(aarav)), { cash: 3e6 });
  let found = null;
  for (let seed = 1; seed <= 2000 && !found; seed++) {
    const c = rollNudges({ ...structuredClone(s), rngNudges: createRng(seed), biases: { overConservatism: 0 } }, params, { equityReturn: 0, equityValue: 0, payJump: 0 }).find(x => x.id === 'tip');
    if (c) found = { seed, c };
  }
  assert(found, 'a tip eventually appears');
  assert(near(found.c.stake, 3e5), `stake ${found.c.stake}`);
  assertEqual(found.c.payout, found.c.win ? 9e5 : 0);
  const again = rollNudges({ ...structuredClone(s), rngNudges: createRng(found.seed), biases: { overConservatism: 0 } }, params, { equityReturn: 0, equityValue: 0, payJump: 0 }).find(x => x.id === 'tip');
  assertEqual(again, found.c);
  // too little to stake: no card
  const poor = { ...structuredClone(fresh(aarav)), cash: 100, rngNudges: createRng(found.seed), biases: { overConservatism: 0 } };
  assertEqual(rollNudges(poor, params, { equityReturn: 0, equityValue: 0, payJump: 0 }).some(c => c.id === 'tip'), false);
});

// ---- which card is shown ----

test('a crash always shows; the others stop at the stage limit', () => {
  const s = fresh();
  const crash = { id: 'crash', pct: 30, value: 1e6, age: 30, year: 2034 };
  const festival = { id: 'festival', spend: 1e4, age: 30, year: 2034 };
  assertEqual(pickCard(s, params, early, [festival, crash]).id, 'crash');
  assertEqual(pickCard(s, params, early, [festival]).id, 'festival');
  const full = { ...s, nudgeCounts: { early: N.perStage } };
  assertEqual(pickCard(full, params, early, [festival]), null);
  assertEqual(pickCard(full, params, early, [crash]).id, 'crash');
  assertEqual(pickCard(s, params, early, []), null);
});

test('at most the limit of ordinary cards per stage, whatever the luck', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { s } = life(aarav, seed, () => 'resist');
    for (const st of stages) {
      const ordinary = s.nudgeLog.filter(l => l.stageId === st.id && l.id !== 'crash').length;
      assert(ordinary <= N.perStage, `seed ${seed} ${st.id}: ${ordinary}`);
    }
  }
});

test('playing a stage with cards stops at one, and a card is never shown in a stage\'s last year', () => {
  let found = null;
  for (let seed = 1; seed <= 30 && !found; seed++) {
    const b = beginStage(fresh(aarav, seed), params, early, decisions, base);
    const r = continueStage(b.state, params, early, b.endAge);
    if (r.card) found = { seed, b, r };
  }
  assert(found, 'a card in the first stage for some seed');
  const { b, r } = found;
  assert(r.card.age > b.state.age && r.card.age < b.endAge, `card at ${r.card.age} inside ${b.state.age}..${b.endAge}`);
  assertEqual(r.state.age, r.card.age);
  assertEqual(r.state.history.at(-1).nudges.some(c => c.id === r.card.id), true);
});

// ---- answering ----

const card = (over) => ({ age: 30, year: 2034, ...over });

test('resisting changes nothing but the record', () => {
  const s = fresh();
  const t = answerNudge(s, params, early, card({ id: 'festival', spend: 5e4 }), 'resist');
  assertEqual(t.pending, s.pending);
  assertEqual(t.livingCost, s.livingCost);
  assertEqual(t.nudgeLog.length, 1);
  assertEqual(t.nudgeLog[0].choice, 'resist');
  assertEqual(t.nudgeCounts.early, 1);
});

test('following: raise adds a fifth to costs for good and counts as drift; festival and tip become spending; crash queues a sale', () => {
  const s = fresh();
  const raise = answerNudge(s, params, early, card({ id: 'raise', pct: 20 }), 'follow');
  assert(near(raise.livingCost, s.livingCost * 1.2) && near(raise.creepIndex, 1.2));
  const fest = answerNudge(s, params, early, card({ id: 'festival', spend: 5e4 }), 'follow');
  assertEqual(fest.pending.spend, 5e4);
  const tip = answerNudge(s, params, early, card({ id: 'tip', stake: 2e5, payout: 6e5, win: true }), 'follow');
  assertEqual([tip.pending.spend, tip.pending.income], [2e5, 6e5]);
  const crash = answerNudge(s, params, early, card({ id: 'crash', pct: 30, value: 1e6 }), 'follow');
  assertEqual(crash.pending.panicSell, true);
  assertEqual(crash.nudgeCounts.early, undefined); // a crash does not count against the limit
});

// ---- carrying it out ----

test('a festival splurge or a lost tip is spending next year; a won tip is a taxable windfall', () => {
  const s = answerNudge(fresh(), params, early, card({ id: 'festival', spend: 5e4 }), 'follow');
  const y = tickYear(s, params).history[0];
  assertEqual(y.nudgeSpend, 5e4);
  assertEqual(tickYear(s, params).pending, { spend: 0, income: 0, panicSell: false });
  const won = answerNudge(fresh(), params, early, card({ id: 'tip', stake: 2e5, payout: 3e6, win: true }), 'follow');
  const w = tickYear(won, params).history[0];
  assertEqual([w.nudgeSpend, w.nudgeIncome], [2e5, 3e6]);
  assert(w.extraIncome >= 3e6, 'the payout is income');
  const plain = tickYear(fresh(), params).history[0];
  assert(w.taxIncome > plain.taxIncome, 'and it is taxed');
});

test('a panic sale moves all shares into fixed deposits, taxing the gain, and the books balance', () => {
  const s = fresh(aarav, 5);
  s.holdings.equity = 3e6;
  s.lots.equity = [{ year: s.year - 4, cost: 1e6, share: 1 }];
  s.cash = 1e6;
  const followed = answerNudge(s, params, early, card({ id: 'crash', pct: 30, value: 3e6 }), 'follow');
  const kept = tickYear(s, params);
  const sold = tickYear(followed, params);
  const y = sold.history[0];
  assertEqual(y.panicSold, 3e6);
  assert(sold.holdings.equity < kept.holdings.equity - 2e6, 'the shares are gone (only new savings are in shares)');
  assert(sold.holdings.fd > 3e6, 'the money waits in fixed deposits');
  assert(y.taxInvest > kept.history[0].taxInvest, 'tax on the gain: ' + y.taxInvest);
  assert(sold.lots.equity.every(l => l.year === s.year), 'no old purchases left');
  const b = bridge(sold.history, { real: false });
  assert(near(b.start + Object.values(b.items).reduce((a, x) => a + x, 0), b.end, 1e-9), 'bridge adds up');
});

test('the bridge shows instincts as their own line and still adds up over a whole life of following', () => {
  const { s } = life(aarav, 6, () => 'follow');
  for (const real of [false, true]) {
    const b = bridge(s.history, { real });
    const total = Object.values(b.items).reduce((a, x) => a + x, 0);
    assert(near(b.start + total, b.end, 1e-9), `real=${real}`);
  }
  const b = bridge(s.history, { real: true });
  assert(s.nudgeLog.some(l => l.id === 'festival') ? b.items.instincts < 0 : true);
});

// ---- the whole thing ----

test('answering "resist" to everything is exactly playing the stages without cards', () => {
  for (const seed of [4271, 2, 7]) {
    const { s } = life(aarav, seed, () => 'resist');
    let plain = fresh(aarav, seed);
    for (const st of stages) plain = playStage(plain, params, st, decisions, base);
    assertEqual(s.history.map(y => y.netWorth), plain.history.map(y => y.netWorth));
  }
});

test('following every instinct costs money and never changes the luck', () => {
  let worse = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const a = life(aarav, seed, () => 'resist').s;
    const b = life(aarav, seed, () => 'follow').s;
    assertEqual(a.history.map(y => y.regime), b.history.map(y => y.regime));
    assertEqual(a.history.map(y => y.returns), b.history.map(y => y.returns));
    if (b.history.at(-1).netWorthReal < a.history.at(-1).netWorthReal) worse++;
  }
  assert(worse >= 17, `worse in ${worse} of 20`);
});

test('the government officer never gets a raise card (no job offers), the IT persona does', () => {
  const kinds = (persona) => { const out = new Set(); for (let seed = 1; seed <= 25; seed++) life(persona, seed, () => 'resist').shown.forEach(c => out.add(c.id)); return out; };
  assertEqual(kinds(meera).has('raise'), false);
  assertEqual(kinds(aarav).has('raise'), true);
  assert(kinds(aarav).has('crash') && kinds(meera).has('crash'));
});

test('the verdict counts how often the gut was followed', () => {
  const { s } = life(aarav, 3, c => (c.id === 'crash' ? 'follow' : 'resist'));
  const o = outcome(s);
  assertEqual(o.instincts.total, s.nudgeLog.length);
  assertEqual(o.instincts.followed, s.nudgeLog.filter(l => l.choice === 'follow').length);
  assertEqual(o.instincts.panicSold, s.nudgeLog.some(l => l.id === 'crash'));
  assertEqual(o.instincts.followed + o.instincts.resisted, o.instincts.total);
});

test('stage summaries carry the answers in today\'s rupees, and the words read well', () => {
  const { s } = life(aarav, 3, () => 'follow');
  const first = s.nudgeLog.filter(l => l.stageId === 'early');
  const sum = stageSummary(s.history, 0, first);
  assertEqual(sum.instincts.length, first.length);
  for (const a of sum.instincts) {
    const text = describeAnswer(N.cards[a.id], a);
    assert(text.text.length > 10 && !/undefined|NaN|null/.test(text.text), text.text);
  }
  assert(sum.instincts.every(a => a.choice === 'follow'));
  assert(!/\{/.test(describeCard(N.cards.crash, { id: 'crash', pct: 30, value: 1e6 }, 1.5)), 'no unfilled placeholder');
});
