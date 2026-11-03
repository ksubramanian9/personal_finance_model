// Turns played years into the numbers the "why?" panels, charts and tables show.
// Pure functions of `history` (state.history, or a slice of it). No DOM, no randomness.
//
// Two ways to show money:
//   nominal  the rupees of that year
//   real     today's rupees (2026 prices). Flows use the price level at the start of their year,
//            balances the price level at the end of theirs, matching the *Real fields in history.

// The order the story is told in. Each id is a line in the net-worth bridge.
export const BRIDGE_ORDER = [
  'income', 'windfalls',                                  // what came in
  'living', 'rent', 'homeUpkeep', 'homeInterest', 'homeBuying', 'homeSelling', // everyday life and housing
  'learning', 'premiums', 'unplanned', 'incomeTax', 'investTax', 'lifestyle', // the rest of what went out
  'growth', 'homeGrowth', 'cashInterest', 'loanInterest', // what the money earned (or cost)
  'inflation',                                            // only in today's rupees
];

// How the net worth got from where it was to where it ended up, line by line.
// start + sum(items) = end, exactly, in either mode (a test checks this).
//
// Why the inflation line exists: in today's rupees a year's change is
//   end/Pend - start/Pstart = flows/Pstart - end * (1/Pstart - 1/Pend)
// so everything you earned and spent is deflated at the start-of-year price, and what is left over is
// the cost of holding the year-end balance while prices rose.
export function bridge(years, { real }) {
  const first = years[0];
  const last = years[years.length - 1];
  const items = Object.fromEntries(BRIDGE_ORDER.map(id => [id, 0]));

  for (const y of years) {
    const k = real ? 1 / y.priceIndexStart : 1;
    const sellingCost = y.homeSale ? y.homeSale.sellingCost : 0;
    const buyingCosts = y.homeBought ? y.homeBought.oneOff : 0;
    // Housing money that is not a loss: the down payment and the loan's principal become (or repay) the home itself.
    const livingAndSupport = y.expenses - y.learning - y.premium - y.eventCost - y.taxIncome - y.taxInvest
      - y.rent - y.homeUpkeep - y.emi - y.homeOutlay - sellingCost;
    items.income += y.income * k;
    items.windfalls += y.extraIncome * k;
    items.living -= livingAndSupport * k;
    items.learning -= y.learning * k;
    items.premiums -= y.premium * k;
    items.unplanned -= y.eventCost * k;
    items.rent -= y.rent * k;
    items.homeUpkeep -= y.homeUpkeep * k;
    items.homeInterest -= y.homeInterest * k;
    items.homeBuying -= buyingCosts * k;
    items.homeSelling -= sellingCost * k;
    items.homeGrowth += y.homeGain * k;
    items.incomeTax -= y.taxIncome * k;
    items.investTax -= y.taxInvest * k;
    items.lifestyle -= y.consumed * k;
    items.growth += y.investGain * k;
    items.cashInterest += y.cashInterest * k;
    items.loanInterest -= y.debtInterest * k;
    if (real) items.inflation -= y.netWorth * (1 / y.priceIndexStart - 1 / y.priceIndexEnd);
  }

  return {
    start: real ? first.netWorthStart / first.priceIndexStart : first.netWorthStart,
    end: real ? last.netWorthReal : last.netWorth,
    items,
  };
}

// How far prices moved over these years: { totalPct, perYearPct, hundredThen } where
// hundredThen is what 100 rupees at the start would have to grow to, to buy the same at the end.
export function inflationOver(years) {
  const ratio = years[years.length - 1].priceIndexEnd / years[0].priceIndexStart;
  return {
    totalPct: (ratio - 1) * 100,
    perYearPct: (ratio ** (1 / years.length) - 1) * 100,
    hundredThen: 100 * ratio,
  };
}

// What tax took over these years, against what came in before tax. `paid` is tax on pay and
// windfalls (onPay) plus the extra tax investing brought (onInvesting).
export function taxStory(years, { real }) {
  let onPay = 0;
  let onInvesting = 0;
  let earned = 0;
  for (const y of years) {
    const k = real ? 1 / y.priceIndexStart : 1;
    onPay += y.taxIncome * k;
    onInvesting += y.taxInvest * k;
    earned += (y.income + y.extraIncome) * k;
  }
  const paid = onPay + onInvesting;
  return { paid, onPay, onInvesting, earned, sharePct: earned > 0 ? (paid / earned) * 100 : 0 };
}

// How many years of each kind of economy.
export function economyCounts(years) {
  const counts = {};
  for (const y of years) counts[y.regime] = (counts[y.regime] ?? 0) + 1;
  return counts;
}

// One row per year for the stacked net-worth chart: balances at year end.
export function netWorthSeries(history, instruments, { real }) {
  return history.map(y => {
    const k = real ? 1 / y.priceIndexEnd : 1;
    const parts = { cash: y.cash * k };
    for (const inst of instruments) parts[inst.id] = y.holdings[inst.id] * k;
    parts.home = y.homeValue * k;
    return { age: y.age, year: y.year, parts, loans: (y.debt + y.homeLoan) * k, net: (real ? y.netWorthReal : y.netWorth) };
  });
}

// One row per year for the earned-versus-spent chart.
//   earned  salary (or what was left of it after a layoff, plus severance) and windfalls
//   spent   everything that left your pocket: bills, premiums, surprises and the part of your
//           leftover you chose to spend. What remains is saved, or went to repaying loans.
export function cashflowSeries(history, { real }) {
  return history.map(y => {
    const k = real ? 1 / y.priceIndexStart : 1;
    return {
      age: y.age, year: y.year, regime: y.regime,
      earned: (y.income + y.extraIncome) * k,
      spent: (y.expenses + y.consumed) * k,
      saved: y.saved * k,
      events: y.events.map(e => e.id),
    };
  });
}

// The year-by-year table: the same facts as the charts, readable by anyone.
export function yearRows(history, { real }) {
  return history.map(y => {
    const k = real ? 1 / y.priceIndexStart : 1;
    return {
      age: y.age, year: y.year, regime: y.regime,
      earned: (y.income + y.extraIncome) * k,
      spent: (y.expenses + y.consumed) * k,
      saved: y.saved * k,
      netWorth: real ? y.netWorthReal : y.netWorth,
      events: y.events.map(e => e.id),
    };
  });
}
