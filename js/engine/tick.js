import { nextFloat, nextNormal } from './rng.js';
import { nextRegime } from './macro.js';
import { rollEvents, settleEvents } from './events.js';
import { netWorth } from './state.js';
import { computeTax, buyLot, sellLots, cloneLots } from './tax.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Plays one year. Pure: returns a new state and leaves the input untouched.
//
// Randomness: exactly 1 uniform draw (the economy) plus 1 normal draw per instrument, in the
// order instruments.json lists them, whatever the player holds. So the same seed gives the same
// economy and the same market returns however the player invests. Life events draw from their
// own stream (state.rngEvents), 3 numbers per event, with the same guarantee.
//
// Order within the year:
//   1. the economy moves to this year's regime; every instrument gets its return for that regime
//   2. holdings and cash earn; debt accrues interest
//   3. life events happen (layoff, hospital bill, windfall...); insurance pays what it covers;
//      tax is worked out on pay, windfalls and interest
//   4. debt is paid down from income, up to a share of income left after expenses
//   5. surplus is split into saved (first topping up the emergency fund in cash, the rest spread
//      over instruments by the player's allocation) and consumed; a deficit is drawn from cash,
//      then liquid instruments in drawOrder (provident funds are locked in, never sold), then
//      borrowed. Tax on gains from selling is added to the shortfall
//   5. salary, costs and prices roll forward to next year (raises follow the economy)
export function tickYear(state, params) {
  const s = structuredClone(state);
  const netWorthStart = netWorth(s);
  const priceIndexStart = s.priceIndex;

  // 1. the economy and market returns
  const regime = nextRegime(s.regime, nextFloat(s.rng), params.macro);
  const R = params.macro.regimes[regime];
  s.regime = regime;
  const returns = {};
  for (const inst of params.instruments) {
    const z = nextNormal(s.rng);
    const { meanPct, volPct } = inst.returns[regime];
    returns[inst.id] = clamp(meanPct / 100 + (volPct / 100) * z, -0.9, 3);
  }

  // 2. earnings (interest on cash and fixed deposits is taxed as it builds up)
  let investGain = 0;
  let interest = 0;
  for (const inst of params.instruments) {
    const gain = s.holdings[inst.id] * returns[inst.id];
    s.holdings[inst.id] += gain;
    investGain += gain;
    if (params.tax.instruments[inst.id].kind === 'interest') interest += gain;
  }
  const cashInterest = s.cash * (params.cashReturnPct / 100);
  const debtInterest = s.debt * (params.debtInterestPct / 100);
  s.cash += cashInterest;
  s.debt += debtInterest;
  interest += cashInterest;

  // 3. life events, then the tax on this year's pay and interest (tax on gains from selling comes later)
  const ev = settleEvents(s, rollEvents(s, params.events, regime), params.insurance, priceIndexStart);
  const income = ev.salaryReceived + ev.severance;
  const extraIncome = ev.extraIncome;
  const learning = s.salary * s.learningPct;
  const premium = s.healthPremium * priceIndexStart * (1 + (params.insurance.premiumAgeLoadingPct / 100) * Math.max(0, s.age - 30));
  const taxBasis = { priceIndex: priceIndexStart, salary: income, windfall: ev.taxableExtra, ordinary: interest };
  const baseTax = computeTax(params.tax, taxBasis);
  let taxIncome = baseTax.incomeTax;
  let taxInvest = baseTax.investTax;
  let expenses = s.livingCost + s.support + learning + premium + ev.eventCost + baseTax.total;

  // 4-5. debt, saving
  const debtPaid = Math.min(s.debt, Math.max(0, income + extraIncome - expenses) * params.debtPaydownShare);
  s.debt -= debtPaid;

  const surplus = income + extraIncome - expenses - debtPaid;
  let saved = 0;
  let toCash = 0;
  let consumed = 0;
  let borrowed = 0;
  let fromCash = 0;
  const sold = {};
  if (surplus >= 0) {
    saved = surplus * s.savingsRate;
    consumed = surplus - saved;
    const fundTarget = (s.emergencyMonths * (s.livingCost + s.support)) / 12;
    toCash = Math.min(saved, Math.max(0, fundTarget - s.cash));
    s.cash += toCash;
    for (const inst of params.instruments) {
      const amount = (saved - toCash) * s.alloc[inst.id];
      if (s.lots[inst.id]) buyLot(s.lots[inst.id], s.holdings[inst.id], amount, s.year);
      s.holdings[inst.id] += amount;
    }
  } else {
    // Selling shares or gold can trigger tax, which has to be raised by selling a little more. The
    // extra sale triggers a little more tax, so repeat until the tax on the sale stops changing.
    const sellOrder = params.instruments.filter(i => i.liquid).sort((a, b) => a.drawOrder - b.drawOrder);
    const plan = (raise) => {
      let need = raise;
      const p = { fromCash: Math.min(s.cash, need), sold: {}, holdings: { ...s.holdings }, lots: cloneLots(s.lots), gains: {} };
      need -= p.fromCash;
      for (const inst of sellOrder) {
        const take = Math.min(p.holdings[inst.id], need);
        if (take <= 0) continue;
        if (p.lots[inst.id]) p.gains[inst.id] = sellLots(p.lots[inst.id], p.holdings[inst.id], take, s.year, params.tax.instruments[inst.id].longTermYears);
        p.holdings[inst.id] -= take;
        need -= take;
        p.sold[inst.id] = take;
      }
      p.borrowed = need;
      return p;
    };
    let extra = 0;
    let p = plan(-surplus);
    let withSale = baseTax;
    for (let i = 0; i < 30; i++) {
      withSale = computeTax(params.tax, { ...taxBasis, gains: p.gains });
      const saleTax = Math.max(0, withSale.total - baseTax.total);
      if (Math.abs(saleTax - extra) < 1e-7) break;
      extra = saleTax;
      p = plan(-surplus + extra);
    }
    fromCash = p.fromCash;
    Object.assign(sold, p.sold);
    borrowed = p.borrowed;
    s.cash -= fromCash;
    s.holdings = p.holdings;
    s.lots = p.lots;
    s.debt += borrowed;
    taxIncome = withSale.incomeTax;
    taxInvest = withSale.investTax;
    expenses += withSale.total - baseTax.total;
  }

  // 5. roll forward
  const inflation = R.inflationPct / 100;
  const priceIndexEnd = priceIndexStart * (1 + inflation);
  const nw = netWorth(s);

  s.history.push({
    age: s.age,
    year: s.year,
    regime,
    inflation,
    returns,
    income, extraIncome, expenses, learning, premium, eventCost: ev.eventCost, insurancePaid: ev.insurancePaid,
    taxIncome, taxInvest, // tax on pay and windfalls, and the extra tax investing brought (both are in expenses)
    debtPaid, debtInterest, saved, toCash, consumed, borrowed,
    events: ev.records.map(r => ({ ...r, age: s.age, year: s.year })),
    coping: { fromCash, sold, borrowed }, // how a shortfall was met
    investGain, cashInterest,
    holdings: { ...s.holdings },
    cash: s.cash,
    debt: s.debt,
    netWorthStart,
    netWorth: nw,
    priceIndexStart,
    priceIndexEnd,
    // today's rupees: flows at the prices of that year, balances at year end
    incomeReal: income / priceIndexStart,
    savedReal: saved / priceIndexStart,
    learningReal: learning / priceIndexStart,
    netWorthReal: nw / priceIndexEnd,
  });

  // A fully cyclical job (1) gets the regime's full raise adjustment; a stable one barely feels it.
  // Raises never go negative.
  const raise = Math.max(0, s.salaryGrowth + s.growthBoost + s.cyclicality * (R.wageAdjPct / 100));
  s.age += 1;
  s.year += 1;
  s.priceIndex = priceIndexEnd;
  s.salary *= 1 + raise;
  if (ev.payHit) s.salary *= 1 - ev.payHit;   // the next job after a layoff pays less
  if (ev.payJump) s.salary *= 1 + ev.payJump; // the offer you took
  s.livingCost *= 1 + inflation;
  s.support *= 1 + inflation;
  return s;
}

// Plays years until the persona reaches `targetAge` (default: their retirement age).
export function runUntil(state, params, targetAge = state.retirementAge) {
  let s = state;
  while (s.age < targetAge) s = tickYear(s, params);
  return s;
}
