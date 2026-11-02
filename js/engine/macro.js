// The economy as a small Markov chain over named regimes (boom / steady / slowdown / crisis).

// Picks next year's regime. `u` is a uniform draw in [0, 1); passing it in keeps this pure.
export function nextRegime(current, u, macro) {
  const row = macro.transitions[current];
  let acc = 0;
  for (const id of macro.order) {
    acc += row[id];
    if (u < acc) return id;
  }
  return macro.order[macro.order.length - 1]; // rounding guard: u just under 1
}

// Long-run share of years spent in each regime, by repeated multiplication.
export function stationaryDistribution(macro, iterations = 5000) {
  let p = Object.fromEntries(macro.order.map(id => [id, 1 / macro.order.length]));
  for (let i = 0; i < iterations; i++) {
    const q = Object.fromEntries(macro.order.map(id => [id, 0]));
    for (const from of macro.order) {
      for (const to of macro.order) q[to] += p[from] * macro.transitions[from][to];
    }
    p = q;
  }
  return p;
}
