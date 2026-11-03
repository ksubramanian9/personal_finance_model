// The verdict on a finished life: could the player stop working, and did the money last?
// Pure functions of the state after the retirement years have been played (see playRetirement).
//
//   status  'lasted'    the money covered every year of retirement, from savings and pension
//           'soldHome'  it did, but only by selling the home (a last resort)
//           'ranOut'    the savings ran out and the player had to borrow to live
//
// "Spendable" money is cash and all investments, including provident funds once retired. The home
// you live in is not counted: you cannot eat your living room.

const sumHoldings = (y) => Object.values(y.holdings).reduce((a, b) => a + b, 0);

export function outcome(state) {
  const history = state.history;
  const working = history.filter(y => !y.retired);
  const retired = history.filter(y => y.retired);
  const lastWorking = working[working.length - 1];
  const firstRetired = retired[0];
  const endYear = history[history.length - 1];

  const ranOut = retired.find(y => y.borrowed > 1);
  const soldHome = history.find(y => y.homeSale);
  const soldHomeInRetirement = retired.find(y => y.homeSale);
  const status = ranOut ? 'ranOut' : soldHomeInRetirement ? 'soldHome' : 'lasted';

  // What the savings at the start of retirement could pay for, with the pension taken off the bills.
  const spendable = lastWorking ? lastWorking.cash + sumHoldings(lastWorking) : 0;
  const yearlyGap = firstRetired ? firstRetired.expenses - firstRetired.income : 0;
  const coverYears = yearlyGap > 0 ? spendable / yearlyGap : Infinity;
  const real = (amount, y) => amount / y.priceIndexEnd;

  // How it felt: years of all-in effort and burnouts. A light signal, not a score.
  const hardYears = working.filter(y => y.effort >= 0.9).length;
  const burnouts = history.reduce((n, y) => n + y.events.filter(e => e.id === 'burnout').length, 0);
  const wellbeing = burnouts >= 2 ? 'burntOut' : (burnouts === 1 || hardYears >= working.length / 2) ? 'stretched' : 'balanced';

  // Instinct cards: how often the player followed their gut.
  const log = state.nudgeLog ?? [];
  const followed = log.filter(l => l.choice === 'follow');
  const tips = followed.filter(l => l.id === 'tip');
  const instincts = {
    total: log.length, followed: followed.length, resisted: log.length - followed.length,
    panicSold: followed.some(l => l.id === 'crash'),
    tipsTaken: tips.length, tipsWon: tips.filter(l => l.win).length,
    tipNetReal: tips.reduce((n, l) => n + (l.payout - l.stake) / l.priceIndex, 0),
  };

  const borrowedYears = working.filter(y => y.borrowed > 1).length;
  const steady = borrowedYears <= 1 && !soldHome;

  return {
    status,
    retirementAge: state.retirementAge,
    deathAge: state.deathAge,
    retiredYears: retired.length,
    ranOutAge: ranOut ? ranOut.age : null,
    soldHomeAge: soldHome ? soldHome.age : null,
    // years of retirement the money paid for: all of them, or up to the year it ran out
    yearsFunded: ranOut ? ranOut.age - state.retirementAge : retired.length,
    spendableAtRetirementReal: lastWorking ? real(spendable, lastWorking) : 0,
    pensionReal: firstRetired ? firstRetired.income / firstRetired.priceIndexStart : 0,
    needPerYearReal: firstRetired ? yearlyGap / firstRetired.priceIndexStart : 0,
    coverYears,
    netWorthAtEndReal: endYear ? endYear.netWorthReal : 0,
    spendableAtEndReal: endYear ? real(endYear.cash + sumHoldings(endYear), endYear) : 0,
    resilience: { steady, borrowedYears, soldHome: soldHome !== undefined },
    instincts,
    wellbeing: { signal: wellbeing, hardYears, burnouts, workingYears: working.length },
  };
}
