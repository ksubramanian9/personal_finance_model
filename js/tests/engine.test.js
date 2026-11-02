import { test, assert, assertEqual } from './harness.js';
import { createRng, nextFloat, nextNormal, hashSeed } from '../engine/rng.js';
import { createState, netWorth } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { decadeSummary } from '../engine/summary.js';
import { loadJSON } from '../data/loader.js';
import { schemas } from '../data/validate.js';
import { loadPersonas } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadJSON('data/engine.json', { schema: schemas.engine, label: 'engine.json', fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');

const play = (persona, seed, retirementAge = 60, p = params) =>
  runUntil(createState(persona, p, { seed, retirementAge }), p);

// ---- RNG ----

test('rng: same seed gives the same sequence', () => {
  const a = createRng(4271), b = createRng(4271);
  for (let i = 0; i < 50; i++) assertEqual(nextFloat(a), nextFloat(b));
});

test('rng: different seeds give different sequences', () => {
  assert(nextFloat(createRng(1)) !== nextFloat(createRng(2)), 'seeds 1 and 2 collided');
});

test('rng: values stay in [0, 1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 10000; i++) {
    const x = nextFloat(r);
    assert(x >= 0 && x < 1, `out of range: ${x}`);
  }
});

test('rng: numeric strings and numbers are the same seed; text seeds are stable', () => {
  assertEqual(hashSeed('4271'), hashSeed(4271));
  assertEqual(hashSeed('hello'), hashSeed('hello'));
  assert(hashSeed('hello') !== hashSeed('world'), 'text seeds collided');
});

test('rng: state survives a JSON round trip and continues the same sequence', () => {
  const a = createRng(99);
  for (let i = 0; i < 5; i++) nextFloat(a);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 20; i++) assertEqual(nextFloat(a), nextFloat(b));
});

test('rng: normal draws have mean near 0 and sd near 1', () => {
  const r = createRng(2024);
  const n = 20000;
  const xs = Array.from({ length: n }, () => nextNormal(r));
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  assert(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert(Math.abs(sd - 1) < 0.03, `sd ${sd}`);
});

// ---- engine ----

test('engine.json loads and validates', () => {
  assert(params.savingsRate > 0 && params.savingsRate <= 1, 'savingsRate out of range');
});

test('engine: same seed and persona gives an identical life', () => {
  assertEqual(play(aarav, 4271), play(aarav, 4271));
});

test('engine: different seeds give different lives', () => {
  assert(play(aarav, 1).history.at(-1).netWorth !== play(aarav, 2).history.at(-1).netWorth, 'seeds 1 and 2 matched');
});

test('engine: tickYear does not mutate its input', () => {
  const s0 = createState(aarav, params, { seed: 5, retirementAge: 60 });
  const snapshot = JSON.stringify(s0);
  tickYear(s0, params);
  assertEqual(JSON.stringify(s0), snapshot);
});

test('engine: state is JSON-serializable and a reloaded run continues identically', () => {
  const mid = runUntil(createState(aarav, params, { seed: 11, retirementAge: 60 }), params, 40);
  const reloaded = JSON.parse(JSON.stringify(mid));
  assertEqual(runUntil(reloaded, params), runUntil(mid, params));
});

test('engine: runs from start age to the chosen retirement age', () => {
  for (const [persona, retire] of [[aarav, 55], [aarav, 65], [meera, 60]]) {
    const s = play(persona, 3, retire);
    assertEqual(s.age, retire);
    assertEqual(s.history.length, retire - persona.profile.startAge);
    assertEqual(s.history[0].age, persona.profile.startAge);
  }
});

test('engine: every year balances (net worth change is fully explained)', () => {
  for (const persona of [aarav, meera]) {
    for (const seed of [1, 2, 3, 4271]) {
      for (const y of play(persona, seed).history) {
        const explained = y.netWorthStart + y.income - y.expenses - y.consumed
          + y.investGain + y.cashInterest - y.debtInterest;
        assert(Math.abs(explained - y.netWorth) < 1e-6,
          `${persona.id} seed ${seed} age ${y.age}: ${explained} vs ${y.netWorth}`);
      }
    }
  }
});

test('engine: balances never go negative', () => {
  for (const seed of [1, 2, 3, 4271]) {
    for (const persona of [aarav, meera]) {
      let s = createState(persona, params, { seed, retirementAge: 65 });
      while (s.age < 65) {
        s = tickYear(s, params);
        assert(s.cash >= -1e-9 && s.invested >= -1e-9 && s.debt >= -1e-9,
          `${persona.id} seed ${seed} age ${s.age}: ${s.cash}, ${s.invested}, ${s.debt}`);
      }
    }
  }
});

test('engine: a deficit is drawn from cash, then investments, then borrowed', () => {
  const broke = { ...aarav, money: { ...aarav.money, monthlyExpenses: 200000, startingSavings: 100000, startingDebt: 0 } };
  const y = play(broke, 1, 23).history[0];
  assert(y.borrowed > 0, 'expected borrowing');
  const s = runUntil(createState(broke, params, { seed: 1, retirementAge: 23 }), params);
  assert(s.cash === 0, 'cash should be exhausted before borrowing');
  assert(s.debt > 0, 'debt should have grown');
});

test('engine: debt is paid down and never overpaid', () => {
  const s = play(aarav, 1, 40);
  assertEqual(s.debt, 0);
  for (const y of s.history) assert(y.debtPaid >= 0, 'negative payment');
});

test('engine: today\'s rupees are deflated by compounding inflation', () => {
  const s = play(aarav, 1, 25);
  const infl = params.inflationPct / 100;
  assert(Math.abs(s.history[0].priceIndexEnd - (1 + infl)) < 1e-12, 'year-1 index');
  assert(Math.abs(s.history[2].priceIndexEnd - (1 + infl) ** 3) < 1e-12, 'year-3 index');
  assertEqual(s.history[0].incomeReal, s.history[0].income);
  assert(Math.abs(s.history[0].netWorthReal - s.history[0].netWorth / (1 + infl)) < 1e-6, 'real net worth');
});

test('engine: a higher savings rate leaves the same life richer on the same seed', () => {
  const lazy = { ...params, savingsRate: 0.2 };
  const keen = { ...params, savingsRate: 0.9 };
  assert(play(aarav, 8, 60, keen).history.at(-1).netWorth > play(aarav, 8, 60, lazy).history.at(-1).netWorth,
    'saving more should win with a positive expected return');
});

// Golden values for seed 4271 with the current data/engine.json and persona files.
// If you change those numbers on purpose, re-pin these; if you didn't, something broke.
test('engine: known outcomes for seed 4271 (regression guard)', () => {
  const near = (actual, expected) => Math.abs(actual - expected) / expected < 1e-8;
  const a = play(aarav, 4271).history.at(-1);
  const m = play(meera, 4271).history.at(-1);
  assert(near(a.netWorth, 506620831), `Aarav final nominal net worth ${a.netWorth}`);
  assert(near(m.netWorth, 174958907), `Meera final nominal net worth ${m.netWorth}`);
});

// ---- decade summary ----

test('decadeSummary: buckets by age decade and covers every year', () => {
  const s = play(aarav, 4271, 60);
  const cards = decadeSummary(s);
  assertEqual(cards.map(c => c.label), ['Your 20s', 'Your 30s', 'Your 40s', 'Your 50s']);
  assertEqual(cards.reduce((n, c) => n + c.years, 0), s.history.length);
  assertEqual(cards[0].fromAge, 22);
  assertEqual(cards[0].toAge, 30);
  assertEqual(cards.at(-1).toAge, 60);
});

test('decadeSummary: later start ages give a shorter first decade; last card matches the final state', () => {
  const s = play(meera, 4271, 60);
  const cards = decadeSummary(s);
  assertEqual(cards[0].fromAge, 24);
  assertEqual(cards[0].years, 6);
  assertEqual(cards.at(-1).netWorthReal, s.history.at(-1).netWorthReal);
  assertEqual(cards.at(-1).netWorth, netWorth(s));
});

test('decadeSummary: retiring at 55 ends the last card at 55', () => {
  const cards = decadeSummary(play(aarav, 4271, 55));
  assertEqual(cards.at(-1).toAge, 55);
  assertEqual(cards.at(-1).years, 5);
});
