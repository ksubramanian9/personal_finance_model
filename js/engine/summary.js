// One stage's worth of years (history from `startIdx` on), in today's rupees.
export function stageSummary(history, startIdx) {
  const years = history.slice(startIdx);
  if (!years.length) return null;
  const first = years[0];
  const last = years[years.length - 1];
  return {
    fromAge: first.age,
    toAge: last.age + 1,
    years: years.length,
    netWorthStartReal: first.netWorthStart / first.priceIndexStart,
    netWorthEndReal: last.netWorthReal,
    incomeEndReal: last.incomeReal,
    savedReal: years.reduce((sum, y) => sum + y.savedReal, 0),
    learningReal: years.reduce((sum, y) => sum + y.learningReal, 0),
    economy: years.map(y => ({ age: y.age, year: y.year, regime: y.regime })),
    taxReal: years.reduce((sum, y) => sum + (y.taxIncome + y.taxInvest) / y.priceIndexStart, 0),
    childrenReal: years.reduce((sum, y) => sum + y.childCost / y.priceIndexStart, 0),
    spouseReal: years.reduce((sum, y) => sum + y.spouseNet / y.priceIndexStart, 0),
    weddingReal: years.reduce((sum, y) => sum + y.weddingCost / y.priceIndexStart, 0),
    // marriage and births in this stretch
    familyMoves: years.flatMap(y => y.family.map(kind => ({
      kind, age: y.age,
      cost: (kind === 'married' ? y.weddingCost : 0) / y.priceIndexStart,
      count: y.childrenCount,
    }))),
    rentReal: years.reduce((sum, y) => sum + y.rent / y.priceIndexStart, 0),
    homeValueEndReal: last.homeValue / last.priceIndexEnd,
    homeLoanEndReal: last.homeLoan / last.priceIndexEnd,
    // buying or selling a home, in today's rupees
    homeMoves: years.filter(y => y.homeBought || y.homeSale).map(y => {
      const k = 1 / y.priceIndexStart;
      return y.homeBought
        ? { kind: 'bought', age: y.age, price: y.homeBought.price * k, paidNow: y.homeBought.outlay * k, loan: (y.homeBought.price - y.homeBought.down) * k }
        : { kind: 'sold', age: y.age, value: y.homeSale.value * k, sellingCost: y.homeSale.sellingCost * k, loanRepaid: y.homeSale.loanRepaid * k, tax: y.homeSale.tax * k };
    }),
    premiumsReal: years.reduce((sum, y) => sum + y.premium / y.priceIndexStart, 0),
    // Years in which something happened, with how any shortfall was met, in today's rupees.
    eventYears: years.filter(y => y.events.length || y.homeSale).map(y => ({
      age: y.age,
      year: y.year,
      events: y.events,
      coping: {
        fromCash: y.coping.fromCash / y.priceIndexStart,
        sold: Object.fromEntries(Object.entries(y.coping.sold).map(([id, v]) => [id, v / y.priceIndexStart])),
        borrowed: y.coping.borrowed / y.priceIndexStart,
        soldHome: y.coping.soldHome,
      },
    })),
  };
}

// Groups played years into decade cards ("Your 20s", "Your 30s", ...), all in today's rupees.
export function decadeSummary(state) {
  const byDecade = new Map();
  for (const y of state.history) {
    const decade = Math.floor(y.age / 10) * 10;
    if (!byDecade.has(decade)) byDecade.set(decade, []);
    byDecade.get(decade).push(y);
  }

  return [...byDecade.entries()].map(([decade, years]) => {
    const last = years[years.length - 1];
    return {
      decade,
      label: `Your ${decade}s`,
      fromAge: years[0].age,
      toAge: last.age + 1,
      years: years.length,
      netWorthReal: last.netWorthReal,
      netWorth: last.netWorth,
      incomeReal: last.incomeReal,
      savedReal: years.reduce((sum, y) => sum + y.savedReal, 0),
    };
  });
}
