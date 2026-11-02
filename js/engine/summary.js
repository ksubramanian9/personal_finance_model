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
    premiumsReal: years.reduce((sum, y) => sum + y.premium / y.priceIndexStart, 0),
    // Years in which something happened, with how any shortfall was met, in today's rupees.
    eventYears: years.filter(y => y.events.length).map(y => ({
      age: y.age,
      year: y.year,
      events: y.events,
      coping: {
        fromCash: y.coping.fromCash / y.priceIndexStart,
        sold: Object.fromEntries(Object.entries(y.coping.sold).map(([id, v]) => [id, v / y.priceIndexStart])),
        borrowed: y.coping.borrowed / y.priceIndexStart,
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
