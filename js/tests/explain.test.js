import { test, assert, assertEqual } from './harness.js';
import { createState } from '../engine/state.js';
import { runUntil } from '../engine/tick.js';
import { applyPicks, playStage, nextStage } from '../engine/stages.js';
import { BRIDGE_ORDER, bridge, inflationOver, economyCounts, netWorthSeries, cashflowSeries, yearRows } from '../engine/explain.js';
import { loadParams } from '../data/params.js';
import { loadStages } from '../data/stages.js';
import { loadPersonas } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const base = { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };

const life = (persona, seed, picks = base) => {
  let s = createState(persona, params, { seed, retirementAge: 60 });
  for (let st = nextStage(stages, s); st; st = nextStage(stages, s)) s = playStage(s, params, st, decisions, picks);
  return s;
};
const close = (a, b, label) => assert(Math.abs(a - b) <= Math.max(1e-6, 1e-9 * Math.abs(b)), `${label}: ${a} vs ${b}`);
const sum = (items) => Object.values(items).reduce((a, b) => a + b, 0);

// A spread of lives that exercise events, windfalls, premiums, loans and borrowing.
const lives = [];
for (const persona of personas) {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 4271]) {
    lives.push(life(persona, seed));
    lives.push(life(persona, seed, { ...base, health: 'strong', emergency: 'six', growth: 'serious', savings: 'enjoy', invest: 'bold' }));
  }
}

test('bridge: start plus every line equals the end, exactly, in nominal rupees', () => {
  for (const s of lives) {
    const b = bridge(s.history, { real: false });
    close(b.start + sum(b.items), b.end, `${s.personaId} seed ${s.seed}`);
  }
});

test('bridge: start plus every line equals the end, exactly, in today\'s rupees (inflation line included)', () => {
  for (const s of lives) {
    const b = bridge(s.history, { real: true });
    close(b.start + sum(b.items), b.end, `${s.personaId} seed ${s.seed}`);
  }
});

test('bridge works on any stretch of years, and a stage starts where the last one ended', () => {
  const s = life(personas[0], 4271);
  const cut = 10;
  for (const real of [false, true]) {
    const a = bridge(s.history.slice(0, cut), { real });
    const b = bridge(s.history.slice(cut), { real });
    close(a.end, b.start, `end of the first ten years meets the start of the rest (real=${real})`);
    close(b.start + sum(b.items), b.end, `second slice balances (real=${real})`);
  }
});

test('bridge: the lines have the signs a person would expect', () => {
  const b = bridge(life(personas[0], 4271).history, { real: true });
  assert(b.items.income > 0 && b.items.growth > 0, 'income and growth are positive');
  assert(b.items.living < 0 && b.items.lifestyle < 0, 'living and lifestyle are negative');
  assert(b.items.inflation < 0, 'inflation erodes a positive net worth');
  assertEqual(bridge(life(personas[0], 4271).history, { real: false }).items.inflation, 0);
});

test('bridge: only what you chose is charged: no cover, no premiums; no learning, no learning cost', () => {
  const s = life(personas[0], 4271);
  const b = bridge(s.history, { real: false });
  assertEqual(b.items.premiums, 0);
  assertEqual(b.items.learning, 0);
  const paid = bridge(life(personas[0], 4271, { ...base, health: 'basic', growth: 'light' }).history, { real: false });
  assert(paid.items.premiums < 0 && paid.items.learning < 0, 'premiums and learning show up as costs');
});

test('bridge lists every line the UI groups, in order', () => {
  assertEqual(BRIDGE_ORDER, ['income', 'windfalls', 'spouse', 'living', 'drift', 'children', 'wedding', 'rent', 'homeUpkeep', 'homeInterest', 'homeBuying', 'homeSelling', 'learning', 'premiums', 'unplanned', 'instincts', 'incomeTax', 'investTax', 'lifestyle', 'growth', 'homeGrowth', 'cashInterest', 'loanInterest', 'inflation']);
  assertEqual(Object.keys(bridge(life(personas[1], 1).history, { real: true }).items), BRIDGE_ORDER);
});

test('inflationOver: compounds the actual yearly inflation', () => {
  const s = life(personas[0], 4271);
  const years = s.history.slice(0, 10);
  const expected = years.reduce((p, y) => p * (1 + y.inflation), 1);
  const i = inflationOver(years);
  close(i.totalPct, (expected - 1) * 100, 'total');
  close(i.hundredThen, 100 * expected, 'hundred then');
  close((1 + i.perYearPct / 100) ** 10, expected, 'per year compounds to the total');
});

test('economyCounts adds up to the years played', () => {
  const s = life(personas[0], 4271);
  const counts = economyCounts(s.history);
  assertEqual(Object.values(counts).reduce((a, b) => a + b, 0), s.history.length);
  assert(Object.keys(counts).every(k => params.macro.order.includes(k)), 'only known regimes');
});

test('netWorthSeries: the parts minus loans make the net worth, in both modes', () => {
  const s = life(personas[0], 4271);
  for (const real of [false, true]) {
    for (const r of netWorthSeries(s.history, params.instruments, { real })) {
      close(Object.values(r.parts).reduce((a, b) => a + b, 0) - r.loans, r.net, `age ${r.age} real=${real}`);
    }
  }
});

test('netWorthSeries: real rupees are smaller than nominal ones once prices have risen', () => {
  const s = life(personas[0], 4271);
  const nominal = netWorthSeries(s.history, params.instruments, { real: false });
  const real = netWorthSeries(s.history, params.instruments, { real: true });
  assert(real.at(-1).net < nominal.at(-1).net, 'real is smaller at the end');
  assert(real.every((r, i) => nominal[i].net <= 0 || r.net <= nominal[i].net + 1e-6), 'a positive net worth is never larger in real rupees');
});

test('cashflowSeries: earned minus spent is what you saved plus loans repaid, less any shortfall you had to cover', () => {
  const s = life(personas[0], 4271);
  for (const real of [false, true]) {
    const rows = cashflowSeries(s.history, { real });
    rows.forEach((r, i) => {
      const y = s.history[i];
      const k = real ? 1 / y.priceIndexStart : 1;
      const shortfall = y.coping.fromCash + y.coping.borrowed + Object.values(y.coping.sold).reduce((a, b) => a + b, 0);
      close(r.earned - r.spent, (y.saved + y.debtPaid - shortfall) * k, `age ${r.age} real=${real}`);
    });
  }
});

test('cashflowSeries and yearRows carry the regime and the event ids of each year', () => {
  const s = life(personas[0], 11);
  const rows = yearRows(s.history, { real: true });
  assertEqual(rows.length, s.history.length);
  rows.forEach((r, i) => {
    assertEqual(r.regime, s.history[i].regime);
    assertEqual(r.events, s.history[i].events.map(e => e.id));
    assertEqual(r.netWorth, s.history[i].netWorthReal);
  });
  assertEqual(yearRows(s.history, { real: false })[3].netWorth, s.history[3].netWorth);
  assert(cashflowSeries(s.history, { real: true }).some(r => r.events.length > 0), 'seed 11 has events');
});

test('explain functions do not change the history they read', () => {
  const s = life(personas[0], 4271);
  const snap = JSON.stringify(s.history);
  bridge(s.history, { real: true });
  netWorthSeries(s.history, params.instruments, { real: true });
  cashflowSeries(s.history, { real: true });
  yearRows(s.history, { real: false });
  assertEqual(JSON.stringify(s.history), snap);
});

test('bridge of an untouched run (no choices applied) still balances', () => {
  const s = runUntil(applyPicks(createState(personas[1], params, { seed: 3, retirementAge: 60 }), stages[0], decisions, base), params);
  const b = bridge(s.history, { real: true });
  close(b.start + sum(b.items), b.end, 'untouched');
});
