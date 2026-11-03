import { test, assert, assertEqual, assertThrows } from './harness.js';
import { createState, netWorth } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { yearlyPayment, payLoanYear, homeOffer, liquidAssets } from '../engine/housing.js';
import { applyPicks, askedDecisions, playStage } from '../engine/stages.js';
import { bridge, netWorthSeries } from '../engine/explain.js';
import { loadParams, checkHousing } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages, checkStages } from '../data/stages.js';
import { describeOffer } from '../ui/housingText.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const H = params.housing;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fresh = (persona = aarav, seed = 4271) => createState(persona, params, { seed, retirementAge: 60 });
const base = { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };

// A life that buys at 22 with plenty of money, then runs to `toAge`.
function owner(persona = aarav, seed = 1, toAge = 40) {
  const s = fresh(persona, seed);
  s.cash = 3e7;
  s.buyHome = 1;
  return runUntil(s, params, toAge);
}

// ---- housing.json ----

test('housing.json loads: tiers for both personas, a price for every economy', () => {
  assert(H.cityTiers[aarav.profile.cityTier] && H.cityTiers[meera.profile.cityTier], 'a tier for each persona');
  assertEqual(Object.keys(H.priceGrowthPct), params.macro.order);
  assert(H.cityTiers[1].homePrice > H.cityTiers[2].homePrice, 'a metro costs more');
});

test('checkHousing explains missing tiers, unknown regimes and impossible loans', () => {
  const bad = structuredClone(H);
  delete bad.priceGrowthPct.boom;
  bad.priceGrowthPct.mild = 4;
  bad.loan.sharePct = 140;
  bad.cityTiers[1].homePrice = -5;
  bad.affordabilityBuffer = 0.5;
  let message = '';
  try { checkHousing(bad, params.macro.order, 'housing.json'); } catch (e) { message = e.message; }
  for (const part of ['priceGrowthPct.boom', 'priceGrowthPct.mild', 'loan.sharePct', 'cityTiers.1.homePrice', 'affordabilityBuffer']) {
    assert(message.includes(part), `message should mention ${part}: ${message}`);
  }
});

test('a persona whose city tier has no price gets a plain error', () => {
  const lost = { ...aarav, profile: { ...aarav.profile, cityTier: 9 } };
  assertThrows(() => createState(lost, params, { seed: 1, retirementAge: 60 }), 'no city tier 9');
});

// ---- the loan ----

test('yearly payment: the standard instalment formula, and it pays the loan off', () => {
  assert(near(yearlyPayment(1e6, 10, 10), 162745.39, 1e-6), `payment ${yearlyPayment(1e6, 10, 10)}`);
  assertEqual(yearlyPayment(1.2e6, 0, 10), 120000);
  const home = { loan: 1e6, payment: yearlyPayment(1e6, 10, 10), yearsLeft: 10, ratePct: 10 };
  const first = payLoanYear({ ...home });
  assert(near(first.interest, 1e5) && near(first.principal, home.payment - 1e5), 'early payments are mostly interest');
  for (let i = 0; i < 10; i++) payLoanYear(home);
  assertEqual(home.loan, 0);
  assertEqual(home.yearsLeft, 0);
  assertEqual(payLoanYear(home).paid, 0);
});

// ---- the offer ----

test('the offer adds up and says how short you are', () => {
  const s = fresh(aarav);
  const o = homeOffer(s, params);
  assert(near(o.down + o.loan, o.price) && near(o.loan / o.price, H.loan.sharePct / 100), 'down payment and loan');
  assert(near(o.oneOff / o.price, H.oneOffCostPct / 100), 'one-off costs');
  assert(near(o.required, o.needed * H.affordabilityBuffer), 'buffer');
  assertEqual(o.affordable, false);
  assert(near(o.shortfall, o.required - liquidAssets(s, params)), 'shortfall');
  s.cash = o.required;
  assertEqual(homeOffer(s, params).affordable, true);
  s.cash = o.required - 1;
  assertEqual(homeOffer(s, params).affordable, false);
});

test('provident funds do not count towards a down payment; sellable savings do', () => {
  const s = fresh(aarav);
  s.holdings.pf = 1e9;
  assertEqual(homeOffer(s, params).affordable, false);
  s.holdings.equity = homeOffer(s, params).required;
  assertEqual(homeOffer(s, params).affordable, true);
});

test('describeOffer talks in today\'s rupees and names the shortfall', () => {
  const s = fresh(aarav);
  s.priceIndex = 2;
  s.homePrice *= 2;
  s.rent *= 2;
  const text = describeOffer(homeOffer(s, params), s.priceIndex);
  assert(/₹80 lakh/.test(text.buy[0]), `price in today's rupees: ${text.buy[0]}`);
  assert(/short/.test(text.buy.at(-1)), 'shortfall line');
  assert(/₹15,000|₹15000/.test(text.rent) || /1\.5 lakh|15,000/.test(text.rent) || /₹15/.test(text.rent), `rent ${text.rent}`);
  s.cash = 1e9;
  assert(!/short/.test(describeOffer(homeOffer(s, params), s.priceIndex).buy.join(' ')), 'no shortfall line when affordable');
});

// ---- buying ----

test('buying: the home and loan appear, rent stops, the down payment and costs go out', () => {
  const s = fresh(aarav);
  s.cash = 3e7;
  const o = homeOffer(s, params);
  s.buyHome = 1;
  const t = tickYear(s, params);
  const y = t.history[0];
  assert(t.home && near(t.home.cost, o.price + o.oneOff), 'home owned');
  assertEqual(t.buyHome, 0);
  assertEqual(t.rent, 0);
  assertEqual(y.rent, 0);
  assert(near(y.homeOutlay, o.down + o.oneOff) && near(y.homeBought.price, o.price), 'outlay recorded');
  assert(y.emi > 0 && y.homeInterest > 0 && y.homeUpkeep > 0, 'loan and upkeep paid');
  assert(near(y.homeUpkeep, o.price * H.upkeepPct / 100), 'upkeep on the starting value');
  assert(near(t.home.loan, o.loan + y.homeInterest - y.emi), 'loan balance after the first instalment');
  assert(near(y.netWorth - y.netWorthStart + (y.homeBought.oneOff), y.income + y.extraIncome - (y.expenses - y.homeOutlay - y.emi) - y.consumed - y.homeInterest + y.investGain + y.cashInterest - y.debtInterest + y.homeGain, 1e-9), 'only the costs, interest and upkeep are lost');
});

test('home prices follow the economy and nothing the player does', () => {
  const rentLife = runUntil(fresh(meera, 7), params, 50);
  const buyLife = owner(meera, 7, 50);
  assertEqual(rentLife.history.map(y => y.regime), buyLife.history.map(y => y.regime));
  assert(near(rentLife.homePrice, buyLife.homePrice), 'same price path');
  let price = H.cityTiers[2].homePrice;
  for (const y of rentLife.history) price *= 1 + H.priceGrowthPct[y.regime] / 100;
  assert(near(rentLife.homePrice, price), 'price = tier price compounded by each year\'s regime');
  const dips = rentLife.history.filter(y => y.regime === 'crisis').length;
  assert(dips === 0 || H.priceGrowthPct.crisis < 0, 'a crisis year dents prices');
});

test('long-run home price growth sits a little above inflation, below shares', () => {
  const m = params.macro;
  // stationary shares of each regime
  let pi = Object.fromEntries(m.order.map(r => [r, 1 / m.order.length]));
  for (let i = 0; i < 500; i++) {
    const next = Object.fromEntries(m.order.map(r => [r, 0]));
    for (const from of m.order) for (const to of m.order) next[to] += pi[from] * m.transitions[from][to];
    pi = next;
  }
  const growth = m.order.reduce((a, r) => a + pi[r] * H.priceGrowthPct[r], 0);
  const inflation = m.order.reduce((a, r) => a + pi[r] * m.regimes[r].inflationPct, 0);
  assert(growth > inflation && growth < inflation + 2, `home growth ${growth} vs inflation ${inflation}`);
});

test('the instalment is fixed while prices and pay move, and the loan ends on time', () => {
  const s = owner(aarav, 3, 22 + H.loan.years + 2);
  const paid = s.history.map(y => y.emi);
  assert(near(paid[0], paid[H.loan.years - 1]), 'same instalment in the first and last year');
  assertEqual(paid[H.loan.years], 0);
  assertEqual(s.home.loan, 0);
  assert(s.history[H.loan.years - 1].homeLoan < 1, 'nothing owed after the term');
  assert(s.history.every(y => y.homeLoan >= 0));
});

test('buying costs rent savings but adds a home to net worth, and the chart sees it', () => {
  const s = owner(aarav, 5, 30);
  const series = netWorthSeries(s.history, params.instruments, { real: false });
  assert(series.every(r => r.parts.home > 0), 'a home every year');
  assert(series[0].loans > 0, 'the home loan is counted with the loans');
  const renter = netWorthSeries(runUntil(fresh(aarav, 5), params, 30).history, params.instruments, { real: false });
  assert(renter.every(r => r.parts.home === 0), 'no home when renting');
});

// ---- choices ----

test('the home question is asked while renting and skipped once you own', () => {
  const family = stages.find(s => s.id === 'family');
  const s = fresh(aarav);
  assert(askedDecisions(family, s).some(r => r.id === 'home'), 'asked while renting');
  s.home = {};
  assertEqual(askedDecisions(family, s).some(r => r.id === 'home'), false);
  assert(stages[0].decisions.every(r => r.id !== 'home'), 'not asked in the early career');
});

test('picking "buy" when you cannot afford it is refused; when you can, the home is bought', () => {
  const family = stages.find(s => s.id === 'family');
  const buy = { ...base, home: 'buy' };
  const poor = fresh(aarav);
  assertThrows(() => applyPicks(poor, family, decisions, buy, params), 'Cannot buy a home yet');
  const rich = fresh(aarav);
  rich.cash = 1e9;
  const ok = applyPicks(rich, family, decisions, buy, params);
  assertEqual(ok.buyHome, 1);
  assertEqual(ok.choices.family.home, 'buy');
  const played = playStage(rich, params, family, decisions, buy);
  assert(played.home, 'a home after the stage');
  // the next stage no longer asks, and its recorded choices leave the home out
  const peak = stages.find(s => s.id === 'peak');
  assertEqual(askedDecisions(peak, played).some(r => r.id === 'home'), false);
  const { home: _skip, ...without } = base;
  assert(applyPicks(played, peak, decisions, without, params).choices.peak.home === undefined, 'no home pick recorded');
});

test('checkStages accepts only a known onlyIf', () => {
  const raw = JSON.parse(JSON.stringify({ decisions, stages, provenance: { basis: 'x', confidence: 'low', asOf: 1 } }));
  raw.stages[1].decisions.find(r => r.id === 'home').onlyIf = 'whenever';
  assertThrows(() => checkStages(raw, 'stages.json'), 'onlyIf');
});

// ---- the books ----

test('every year with a home balances: the bridge adds up from start to end, in both kinds of rupee', () => {
  const s = owner(aarav, 9, 45);
  for (const real of [false, true]) {
    const b = bridge(s.history, { real });
    const total = Object.values(b.items).reduce((a, x) => a + x, 0);
    assert(near(b.start + total, b.end, 1e-9), `real=${real}: ${b.start} + ${total} vs ${b.end}`);
    assert(b.items.homeInterest < 0 && b.items.homeUpkeep < 0 && b.items.homeBuying < 0 && b.items.homeGrowth !== 0, 'housing lines present');
    assertEqual(b.items.rent, 0);
  }
  // and year by year
  for (const y of s.history) {
    const b = bridge([y], { real: false });
    assert(near(b.start + Object.values(b.items).reduce((a, x) => a + x, 0), b.end, 1e-9), `age ${y.age}`);
  }
});

test('a renter pays rent every year, and rent follows prices', () => {
  const s = runUntil(fresh(aarav, 2), params, 30);
  assert(s.history.every(y => y.rent > 0));
  for (const y of s.history) assert(near(y.rent, aarav.money.monthlyRent * 12 * y.priceIndexStart), `age ${y.age}: ${y.rent}`);
  const b = bridge(s.history, { real: false });
  assert(b.items.rent < 0 && b.items.homeGrowth === 0 && b.items.homeInterest === 0);
});

// ---- selling as a last resort ----

function stretched(livingCost, salary = null) {
  const s = fresh(aarav, 12);
  s.cash = 3e7;
  s.buyHome = 1;
  let t = tickYear(s, params);       // buy, then
  t.cash = 0;                        // lose the savings
  t.livingCost = livingCost;         // and face a gap
  if (salary) t.salary = salary;
  return t;
}

test('a small gap is borrowed, not a reason to sell the home', () => {
  const t = tickYear(stretched(1.2e6, 1.5e6), params); // a gap of about 7 lakh against 15 lakh of pay
  const y = t.history.at(-1);
  assert(y.borrowed > 0 && !y.homeSale && t.home, 'borrowed, home kept');
});

test('a gap that would swamp you sells the home: costs, loan, tax, then back to renting', () => {
  const before = stretched(3e7);
  const t = tickYear(before, params);
  const y = t.history.at(-1);
  assert(y.homeSale && t.home === null, 'home sold');
  assertEqual(y.coping.soldHome, true);
  assert(near(y.homeSale.sellingCost, (before.home.value * (1 + H.priceGrowthPct[y.regime] / 100)) * H.sellingCostPct / 100, 1e-6), 'selling cost');
  assert(y.homeSale.loanRepaid > 0, 'loan repaid from the proceeds');
  assert(near(t.rent, aarav.money.monthlyRent * 12 * y.priceIndexEnd), 'renting at the going rate');
  assert(y.homeLoan === 0 && y.homeValue === 0);
  // the books balance across the sale
  const b = bridge([y], { real: false });
  assert(near(b.start + Object.values(b.items).reduce((a, x) => a + x, 0), b.end, 1e-9), 'bridge adds up through a sale');
  assert(b.items.homeSelling < 0, 'selling costs show');
  // and the next year's rent is paid again
  const next = tickYear(t, params).history.at(-1);
  assert(next.rent > 0 && next.emi === 0 && next.homeUpkeep === 0, 'renting afterwards');
});

test('a home held for years pays long-term tax on its gain when it is sold', () => {
  const s = owner(aarav, 4, 36);       // owned for 14 years
  s.cash = 0;
  s.holdings = Object.fromEntries(Object.keys(s.holdings).map(k => [k, 0]));
  s.lots = { equity: [], gold: [] };
  s.livingCost = 3e8;
  const y = tickYear(s, params).history.at(-1);
  assert(y.homeSale, 'sold');
  const gain = y.homeSale.value - y.homeSale.sellingCost - s.home.cost;
  assert(gain > 0, `a gain: ${gain}`);
  assert(y.taxInvest >= gain * 0.125 * 1.04 - 1, `tax on the gain: ${y.taxInvest} vs ${gain * 0.125 * 1.04}`);
});

test('net worth counts the home less its loan', () => {
  const s = owner(meera, 6, 35);
  const expected = s.cash + Object.values(s.holdings).reduce((a, b) => a + b, 0) + s.home.value - s.home.loan - s.debt;
  assert(near(netWorth(s), expected));
});
