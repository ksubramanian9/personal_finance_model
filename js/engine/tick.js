import { nextFloat, nextNormal } from './rng.js';
import { nextRegime } from './macro.js';
import { netWorth } from './state.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Plays one year. Pure: returns a new state and leaves the input untouched.
//
// Randomness: exactly 1 uniform draw (the economy) plus 1 normal draw per instrument, in the
// order instruments.json lists them, whatever the player holds. So the same seed gives the same
// economy and the same market returns however the player invests.
//
// Order within the year:
//   1. the economy moves to this year's regime; every instrument gets its return for that regime
//   2. holdings and cash earn; debt accrues interest
//   3. debt is paid down from income, up to a share of income left after expenses
//   4. surplus is split into saved (spread over instruments by the player's allocation) and
//      consumed; a deficit is drawn from cash, then liquid instruments in drawOrder (provident
//      funds are locked in, never sold), then borrowed
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

  // 2. earnings
  let investGain = 0;
  for (const inst of params.instruments) {
    const gain = s.holdings[inst.id] * returns[inst.id];
    s.holdings[inst.id] += gain;
    investGain += gain;
  }
  const cashInterest = s.cash * (params.cashReturnPct / 100);
  const debtInterest = s.debt * (params.debtInterestPct / 100);
  s.cash += cashInterest;
  s.debt += debtInterest;

  // 3-4. income, expenses, saving
  const income = s.salary;
  const learning = income * s.learningPct;
  const expenses = s.livingCost + s.support + learning;
  const debtPaid = Math.min(s.debt, Math.max(0, income - expenses) * params.debtPaydownShare);
  s.debt -= debtPaid;

  const surplus = income - expenses - debtPaid;
  let saved = 0;
  let consumed = 0;
  let borrowed = 0;
  if (surplus >= 0) {
    saved = surplus * s.savingsRate;
    consumed = surplus - saved;
    for (const inst of params.instruments) s.holdings[inst.id] += saved * s.alloc[inst.id];
  } else {
    let need = -surplus;
    const fromCash = Math.min(s.cash, need);
    s.cash -= fromCash;
    need -= fromCash;
    const sellOrder = params.instruments.filter(i => i.liquid).sort((a, b) => a.drawOrder - b.drawOrder);
    for (const inst of sellOrder) {
      const take = Math.min(s.holdings[inst.id], need);
      s.holdings[inst.id] -= take;
      need -= take;
    }
    borrowed = need;
    s.debt += borrowed;
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
    income, expenses, learning, debtPaid, debtInterest, saved, consumed, borrowed,
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
