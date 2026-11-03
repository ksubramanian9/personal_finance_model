// Income tax and capital gains tax. Pure functions, no randomness.
//
// Money is worked out in today's rupees (the slabs and exemptions are assumed to rise with prices),
// then scaled back to the rupees of the year. Rules come from data/tax.json.
//
// What is taxed:
//   salary (and severance)       slab tax, after the standard deduction
//   windfalls marked taxable     slab tax
//   interest (cash, FDs)         slab tax, every year as it builds up
//   gains on equity and gold     only when sold: long-term at a flat rate (equity beyond a yearly
//                                exemption), short-term at a flat rate or at the slab rate
//   a home                       only when sold (the game does that as a last resort), on its own rule
//   provident funds              not taxed
// Then cess on the total.

// Tax on `income` by the slab table (no rebate, surcharge or cess).
export function slabTax(income, slabs) {
  let tax = 0;
  let lower = 0;
  for (const { upTo, ratePct } of slabs) {
    const top = upTo ?? Infinity;
    if (income > lower) tax += (Math.min(income, top) - lower) * (ratePct / 100);
    if (income <= top) break;
    lower = top;
  }
  return tax;
}

// Tax on ordinary income (today's rupees): slabs, the rebate that wipes out tax up to the limit,
// marginal relief just above it, then surcharge for very high incomes.
export function ordinaryTax(income, rules) {
  let tax = slabTax(income, rules.slabs);
  const limit = rules.rebateIncomeLimit;
  tax = income <= limit ? 0 : Math.min(tax, income - limit);
  let surcharge = 0;
  for (const tier of rules.surcharge) if (income > tier.above) surcharge = tier.ratePct;
  return tax * (1 + surcharge / 100);
}

// Instruments whose gains are taxed when sold, and instruments whose interest is taxed each year.
export const gainsIds = (tax) => Object.keys(tax.instruments).filter(id => tax.instruments[id].kind === 'capitalGains');
export const interestIds = (tax) => Object.keys(tax.instruments).filter(id => tax.instruments[id].kind === 'interest');

// The year's tax, split into what pay would cost on its own and what investing added.
//   salary    pay received this year (before the standard deduction), nominal
//   windfall  taxable windfalls, nominal
//   ordinary  interest taxed as income, nominal
//   gains     { instrumentId: { st, lt } } realised this year, nominal (may be negative)
// Returns { total, incomeTax, investTax } in nominal rupees.
export function computeTax(tax, { priceIndex, salary, windfall = 0, ordinary = 0, gains = {} }) {
  const rules = tax.incomeTax;
  const k = 1 / priceIndex;
  const cess = 1 + rules.cessPct / 100;
  const pay = Math.max(0, salary * k - rules.standardDeduction) + windfall * k;

  let normal = pay + ordinary * k;
  let special = 0;
  for (const id of [...gainsIds(tax), 'home']) {
    const g = gains[id];
    if (!g) continue;
    const rule = id === 'home' ? tax.property : tax.instruments[id];
    // A loss on the short side cancels long-side gains; a long-side loss cancels nothing else.
    let st = g.st * k;
    let lt = g.lt * k;
    if (st < 0) { lt += st; st = 0; }
    lt = Math.max(0, lt);
    special += Math.max(0, lt - rule.exemptionPerYear) * (rule.longTermRatePct / 100);
    if (rule.shortTermRatePct === 'slab') normal += st;
    else special += st * (rule.shortTermRatePct / 100);
  }

  const incomeOnly = ordinaryTax(pay, rules) * cess;
  const total = (ordinaryTax(normal, rules) + special) * cess;
  return { total: total * priceIndex, incomeTax: incomeOnly * priceIndex, investTax: Math.max(0, total - incomeOnly) * priceIndex };
}

// Adds two sets of realised gains ({ id: { st, lt } }) together.
export function mergeGains(a, b) {
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[id] = { st: (a[id]?.st ?? 0) + (b[id]?.st ?? 0), lt: (a[id]?.lt ?? 0) + (b[id]?.lt ?? 0) };
  }
  return out;
}

// ---- cost basis ----
// A holding is a pool whose pieces were bought in different years. Each piece (lot) is
// { year, cost, share }: the year it was bought (at year end), what it cost, and what fraction of
// the pool's current value it is. Every piece grows at the same rate, so the shares only change when
// money goes in or out. Oldest pieces are sold first.

export const cloneLots = (lots) => Object.fromEntries(Object.entries(lots).map(([id, list]) => [id, list.map(l => ({ ...l }))]));

// Pieces that add up to the pool. A pool that exists without any record (for example one set up
// directly in a test) is treated as one old piece bought at today's value, so it has no gain yet.
function ensureLots(lots, value, year) {
  if (value > 0 && !lots.length) lots.push({ year: year - 100, cost: value, share: 1 });
}

// Put `amount` into a pool currently worth `value` (before the purchase).
export function buyLot(lots, value, amount, year) {
  if (!(amount > 0)) return;
  ensureLots(lots, value, year);
  const total = value + amount;
  for (const l of lots) l.share *= value / total;
  lots.push({ year, cost: amount, share: amount / total });
}

// Take `amount` out of a pool currently worth `value`, selling the oldest pieces first.
// Returns the gain realised, split by how long the pieces were held: { st, lt }.
export function sellLots(lots, value, amount, year, longTermYears) {
  ensureLots(lots, value, year);
  const out = { st: 0, lt: 0 };
  let left = amount;
  for (const l of lots) {
    if (left <= 0) break;
    const worth = l.share * value;
    const take = Math.min(worth, left);
    if (!(take > 0)) continue;
    const costOut = l.cost * (take / worth);
    out[year - l.year >= longTermYears ? 'lt' : 'st'] += take - costOut;
    l.cost -= costOut;
    l.share = (worth - take) / value; // as a share of the old value; rescaled below
    left -= take;
  }
  const remaining = value - amount;
  for (let i = lots.length - 1; i >= 0; i--) {
    if (remaining <= 0 || lots[i].share * value < 1e-9) lots.splice(i, 1);
    else lots[i].share = (lots[i].share * value) / remaining;
  }
  return out;
}
