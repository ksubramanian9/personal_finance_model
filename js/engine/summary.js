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
