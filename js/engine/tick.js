import { nextNormal } from './rng.js';
import { netWorth } from './state.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Plays one year. Pure: returns a new state and leaves the input untouched.
//
// Order within the year:
//   1. balances earn (cash interest, a random investment return); debt accrues interest
//   2. debt is paid down from income, up to a share of income left after expenses
//   3. surplus is split into saved (-> invested) and consumed; a deficit is drawn from
//      cash, then investments, then borrowed
//   4. salary, costs and prices roll forward to next year
export function tickYear(state, params) {
  const s = structuredClone(state);
  const netWorthStart = netWorth(s);
  const priceIndexStart = s.priceIndex;

  const investReturn = clamp(
    params.investReturnMeanPct / 100 + (params.investReturnVolPct / 100) * nextNormal(s.rng),
    -0.95, 3);
  const investGain = s.invested * investReturn;
  const cashInterest = s.cash * (params.cashReturnPct / 100);
  const debtInterest = s.debt * (params.debtInterestPct / 100);
  s.invested += investGain;
  s.cash += cashInterest;
  s.debt += debtInterest;

  const income = s.salary;
  const expenses = s.livingCost + s.support;
  const debtPaid = Math.min(s.debt, Math.max(0, income - expenses) * params.debtPaydownShare);
  s.debt -= debtPaid;

  const surplus = income - expenses - debtPaid;
  let saved = 0;
  let consumed = 0;
  let borrowed = 0;
  if (surplus >= 0) {
    saved = surplus * s.savingsRate;
    consumed = surplus - saved;
    s.invested += saved;
  } else {
    let need = -surplus;
    const fromCash = Math.min(s.cash, need);
    s.cash -= fromCash;
    need -= fromCash;
    const fromInvested = Math.min(s.invested, need);
    s.invested -= fromInvested;
    need -= fromInvested;
    borrowed = need;
    s.debt += borrowed;
  }

  const inflation = params.inflationPct / 100;
  const priceIndexEnd = priceIndexStart * (1 + inflation);
  const nw = netWorth(s);

  s.history.push({
    age: s.age,
    year: s.year,
    income, expenses, debtPaid, debtInterest, saved, consumed, borrowed,
    investReturn, investGain, cashInterest,
    netWorthStart,
    netWorth: nw,
    priceIndexStart,
    priceIndexEnd,
    // today's rupees: flows at the prices of that year, balances at year end
    incomeReal: income / priceIndexStart,
    savedReal: saved / priceIndexStart,
    netWorthReal: nw / priceIndexEnd,
  });

  s.age += 1;
  s.year += 1;
  s.priceIndex = priceIndexEnd;
  s.salary *= 1 + s.salaryGrowth;
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
