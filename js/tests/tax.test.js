import { test, assert, assertEqual, assertThrows } from './harness.js';
import { createState } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { slabTax, ordinaryTax, computeTax, buyLot, sellLots, gainsIds, interestIds } from '../engine/tax.js';
import { taxStory, bridge } from '../engine/explain.js';
import { loadParams, checkTax } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const rules = params.tax;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fresh = (persona = aarav, seed = 4271) => createState(persona, params, { seed, retirementAge: 60 });
const L = 100000; // a lakh

// ---- tax.json ----

test('tax.json loads and says how every instrument is taxed', () => {
  assertEqual(gainsIds(rules), ['equity', 'gold']);
  assertEqual(interestIds(rules), ['fd']);
  assertEqual(rules.instruments.pf.kind, 'exempt');
  assertEqual(rules.incomeTax.slabs.at(-1).upTo, null);
});

test('checkTax explains a missing instrument, an unknown kind, open-ended slabs and bad rates', () => {
  const ids = params.instruments.map(i => i.id);
  const bad = structuredClone(rules);
  delete bad.instruments.gold;
  bad.instruments.fd.kind = 'magic';
  bad.incomeTax.slabs.at(-1).upTo = 5000000;
  bad.instruments.equity.longTermRatePct = 400;
  bad.instruments.mystery = { kind: 'exempt' };
  let message = '';
  try { checkTax(bad, ids, 'tax.json'); } catch (e) { message = e.message; }
  for (const part of ['"instruments.gold" is missing', '"instruments.fd.kind"', '"incomeTax.slabs[6].upTo"', 'longTermRatePct', 'mystery']) {
    assert(message.includes(part), `message should mention ${part}: ${message}`);
  }
  assertThrows(() => checkTax(structuredClone(rules), ids.slice(1), 'tax.json'));
});

// ---- income tax ----

test('slab tax: the new-regime table', () => {
  assertEqual(slabTax(400000, rules.incomeTax.slabs), 0);
  assertEqual(slabTax(800000, rules.incomeTax.slabs), 20000);
  assertEqual(slabTax(1200000, rules.incomeTax.slabs), 60000);
  assertEqual(slabTax(1500000, rules.incomeTax.slabs), 105000);
  assertEqual(slabTax(3000000, rules.incomeTax.slabs), 480000);
});

test('ordinary tax: nothing up to 12 lakh, relief just above it, slab tax well above', () => {
  const t = (x) => ordinaryTax(x, rules.incomeTax);
  assertEqual(t(1200000), 0);
  assertEqual(t(1210000), 10000); // only the extra 10,000 is taxed
  assert(t(1230000) <= 30000, 'relief fades out');
  assertEqual(t(1500000), 105000);
  assert(t(1100000) === 0 && t(1199999) === 0, 'rebate');
  for (let x = 1000000; x < 3000000; x += 50000) assert(t(x + 50000) >= t(x), 'tax never falls as income rises');
  assert(near(t(6000000), slabTax(6000000, rules.incomeTax.slabs) * 1.1), 'surcharge above 50 lakh');
});

test('salary tax: the standard deduction, cess and prices', () => {
  const pay = (salary, priceIndex = 1) => computeTax(rules, { priceIndex, salary });
  assertEqual(pay(1275000).total, 0); // 12.75 lakh salary is tax-free
  assert(near(pay(1575000).total, 105000 * 1.04), 'taxable 15 lakh: slab tax plus 4% cess');
  assertEqual(pay(500000).total, 0);
  // the same real pay is taxed the same in real terms, in any year
  assert(near(pay(2 * 1575000, 2).total, 2 * pay(1575000).total), 'slabs move with prices');
  assert(near(pay(7.5 * 1575000, 7.5).total, 7.5 * pay(1575000).total), 'slabs move with prices');
  const split = pay(2500000);
  assert(near(split.incomeTax, split.total) && split.investTax === 0, 'pay alone is all income tax');
});

test('interest is taxed at the slab rate and counted as investing tax', () => {
  const t = computeTax(rules, { priceIndex: 1, salary: 1575000, ordinary: 100000 });
  assert(near(t.investTax, 100000 * 0.15 * 1.04), `tax on the interest: ${t.investTax}`);
  assert(near(t.incomeTax, 105000 * 1.04), 'pay tax is unchanged');
  assertEqual(computeTax(rules, { priceIndex: 1, salary: 600000, ordinary: 100000 }).total, 0); // still under the limit
});

test('a taxable windfall is income tax; low pay and a windfall can still be tax-free', () => {
  const t = computeTax(rules, { priceIndex: 1, salary: 1575000, windfall: 1000000 });
  assert(t.incomeTax > computeTax(rules, { priceIndex: 1, salary: 1575000 }).total, 'windfall adds to income tax');
  assertEqual(t.investTax, 0);
});

// ---- capital gains ----

test('equity gains: long-term 12.5% beyond 1.25 lakh, short-term 20%', () => {
  const lt = computeTax(rules, { priceIndex: 1, salary: 0, gains: { equity: { st: 0, lt: 5 * L } } });
  assert(near(lt.total, (5 * L - 1.25 * L) * 0.125 * 1.04), `long-term: ${lt.total}`);
  const st = computeTax(rules, { priceIndex: 1, salary: 0, gains: { equity: { st: 1 * L, lt: 0 } } });
  assert(near(st.total, 1 * L * 0.2 * 1.04), `short-term: ${st.total}`);
  assertEqual(computeTax(rules, { priceIndex: 1, salary: 0, gains: { equity: { st: 0, lt: 1 * L } } }).total, 0); // under the exemption
  assertEqual(lt.incomeTax, 0);
  assertEqual(lt.investTax, lt.total);
});

test('the exemption and slabs rise with prices', () => {
  const at1 = computeTax(rules, { priceIndex: 1, salary: 0, gains: { equity: { st: 0, lt: 5 * L } } }).total;
  const at3 = computeTax(rules, { priceIndex: 3, salary: 0, gains: { equity: { st: 0, lt: 15 * L } } }).total;
  assert(near(at3, 3 * at1), 'same real gain, same real tax');
});

test('gold: long-term 12.5% with no exemption; short-term joins your slab income', () => {
  const lt = computeTax(rules, { priceIndex: 1, salary: 0, gains: { gold: { st: 0, lt: 2 * L } } });
  assert(near(lt.total, 2 * L * 0.125 * 1.04), 'long-term gold');
  const low = computeTax(rules, { priceIndex: 1, salary: 0, gains: { gold: { st: 2 * L, lt: 0 } } });
  assertEqual(low.total, 0); // small enough to sit under the rebate
  const high = computeTax(rules, { priceIndex: 1, salary: 2475000, gains: { gold: { st: 2 * L, lt: 0 } } }); // taxable 24 lakh
  assert(near(high.investTax, 2 * L * 0.30 * 1.04), `at the top slab: ${high.investTax}`);
});

test('a short-term loss offsets long-term gains; a long-term loss offsets nothing else', () => {
  const g = (st, lt) => computeTax(rules, { priceIndex: 1, salary: 0, gains: { equity: { st, lt } } }).total;
  assert(near(g(-2 * L, 5 * L), g(0, 3 * L)), 'short-term loss reduces the long-term gain');
  assertEqual(g(0, -5 * L), 0);
  assert(near(g(1 * L, -5 * L), g(1 * L, 0)), 'a long-term loss does not shelter short-term gains');
});

// ---- cost basis ----

test('lots: shares add up to 1 after buying and selling, and the oldest piece is sold first', () => {
  const lots = [];
  buyLot(lots, 0, 100, 2030);
  buyLot(lots, 110, 50, 2031);  // the first 100 grew to 110
  const total = lots.reduce((a, l) => a + l.share, 0);
  assert(near(total, 1), 'shares sum to 1');
  assert(near(lots[0].share * 160, 110) && near(lots[1].share * 160, 50), 'value split between the pieces');
  const gain = sellLots(lots, 160, 110, 2032, 1);
  assert(near(gain.lt, 10) && gain.st === 0, `the old piece, sold whole: ${JSON.stringify(gain)}`);
  assertEqual(lots.length, 1);
  assert(near(lots[0].share, 1), 'what is left is the whole pool');
});

test('lots: gain is proceeds minus cost, split by holding time', () => {
  const lots = [];
  buyLot(lots, 0, 1000, 2030);
  const early = sellLots(structuredClone(lots), 1500, 750, 2030, 2);
  assert(near(early.st, 250) && early.lt === 0, 'sold in the year bought: short-term');
  const late = sellLots(structuredClone(lots), 1500, 750, 2032, 2);
  assert(near(late.lt, 250) && late.st === 0, 'sold two years on: long-term');
  const all = sellLots(lots, 1500, 1500, 2032, 2);
  assert(near(all.lt + all.st, 500), 'everything sold: all the gain');
  assertEqual(lots.length, 0);
});

test('lots: a pool with no record is treated as bought at its current value', () => {
  const lots = [];
  const gain = sellLots(lots, 1000, 400, 2040, 1);
  assertEqual(gain, { st: 0, lt: 0 });
  assert(near(lots[0].share, 1));
});

// ---- inside the yearly tick ----

test('an early career at or under the free limit pays no tax', () => {
  const s = runUntil(fresh(aarav), params, 25);
  assert(s.history.every(y => y.taxIncome === 0 && y.taxInvest === 0), 'no tax yet');
});

test('provident-fund growth is never taxed; a fixed-deposit pile is', () => {
  const rich = (holdings) => { const s = fresh(meera); s.salary = 6 * L; s.holdings = { ...s.holdings, ...holdings }; return tickYear(s, params).history[0]; };
  assertEqual(rich({ pf: 5e7 }).taxInvest, 0);
  assert(rich({ fd: 5e7 }).taxInvest > 0, 'fixed-deposit interest is taxed every year');
});

test('selling shares: younger holdings cost more tax than older ones, for the same sale', () => {
  const sale = (boughtYear) => {
    const s = fresh(aarav);
    s.livingCost = 5.8 * 1e6;
    s.holdings.equity = 1e7;
    s.lots.equity = [{ year: s.year - boughtYear, cost: 5e6, share: 1 }];
    return tickYear(s, params).history[0];
  };
  const young = sale(0);
  const old = sale(3);
  assert(young.coping.sold.equity > 0 && old.coping.sold.equity > 0, 'shares were sold');
  assert(young.taxInvest > old.taxInvest, `short-term ${young.taxInvest} should exceed long-term ${old.taxInvest}`);
  assert(young.taxInvest > 0 && old.taxInvest > 0);
});

test('tax on a sale is raised by selling a little more, so the books still balance', () => {
  const s = fresh(aarav);
  s.livingCost = 5.8 * 1e6;
  s.holdings.equity = 1e7;
  s.lots.equity = [{ year: s.year - 4, cost: 4e6, share: 1 }];
  const y = tickYear(s, params).history[0];
  const raised = y.coping.fromCash + Object.values(y.coping.sold).reduce((a, b) => a + b, 0) + y.coping.borrowed;
  const short = y.expenses + y.debtPaid - y.income - y.extraIncome;
  assert(near(raised, short, 1e-9), `raised ${raised} should cover the shortfall ${short}, tax included`);
  assert(y.taxInvest > 0, 'selling shares at a gain costs tax');
  assert(near(y.expenses, y.learning + y.premium + y.eventCost + y.taxIncome + y.taxInvest + s.livingCost + s.support, 1e-9), 'tax is part of what went out');
});

test('buying shares each year records pieces that add up to the pool', () => {
  const s = runUntil(fresh(aarav), params, 40);
  for (const id of gainsIds(rules)) {
    const total = s.lots[id].reduce((a, l) => a + l.share, 0);
    assert(s.lots[id].length > 0 && near(total, 1, 1e-9), `${id}: ${total}`);
    assert(s.lots[id].every(l => l.cost > 0), 'every piece cost something');
  }
});

test('tax makes the same life poorer than it would be tax-free, and never changes the luck', () => {
  const free = structuredClone(params);
  free.tax.incomeTax.slabs = [{ upTo: null, ratePct: 0 }];
  free.tax.incomeTax.surcharge = [];
  free.tax.incomeTax.cessPct = 0;
  for (const id of gainsIds(free.tax)) { free.tax.instruments[id].longTermRatePct = 0; free.tax.instruments[id].shortTermRatePct = 0; }
  const a = runUntil(createState(aarav, free, { seed: 4271, retirementAge: 60 }), free);
  const b = runUntil(createState(aarav, params, { seed: 4271, retirementAge: 60 }), params);
  assert(b.history.at(-1).netWorth < a.history.at(-1).netWorth, 'taxed life ends poorer');
  assertEqual(a.history.map(y => y.regime), b.history.map(y => y.regime));
  assertEqual(a.history.map(y => y.events.map(e => e.id)), b.history.map(y => y.events.map(e => e.id)));
});

test('the government persona pays far less tax than the product-company engineer', () => {
  const stat = (p) => taxStory(runUntil(fresh(p), params).history, { real: true });
  const a = stat(aarav);
  const m = stat(meera);
  assert(a.sharePct > m.sharePct, `${a.sharePct} vs ${m.sharePct}`);
  assert(a.sharePct > 3 && a.sharePct < 30, `Aarav's tax share looks sane: ${a.sharePct}`);
  assert(a.onPay > 0 && a.onInvesting >= 0);
});

test('taxStory adds up with the bridge lines', () => {
  const years = runUntil(fresh(aarav), params).history;
  for (const real of [false, true]) {
    const t = taxStory(years, { real });
    const b = bridge(years, { real });
    assert(near(t.onPay, -b.items.incomeTax, 1e-9) && near(t.onInvesting, -b.items.investTax, 1e-9), 'same figures');
    assert(t.paid > 0 && t.earned > t.paid);
  }
});
