// Renting, buying and selling a home. Pure functions on the state; no randomness.
//
// The home is one apartment of a fixed size. `state.homePrice` is what such an apartment costs this
// year (nominal); it moves with the economy (housing.json) whether or not the player owns one.
// `state.home` is null while renting, otherwise
//   { value, cost, boughtYear, loan, payment, yearsLeft, ratePct }
//   value   what the home is worth now        cost   price plus one-off buying costs (for tax on a sale)
//   loan    what is still owed on it          payment  the fixed yearly instalment (twelve EMIs)

// The fixed yearly instalment for a loan paid off over `years` at `ratePct`.
export function yearlyPayment(loan, ratePct, years) {
  const r = ratePct / 100;
  return r === 0 ? loan / years : (loan * r) / (1 - (1 + r) ** -years);
}

export const liquidAssets = (state, params) =>
  state.cash + params.instruments.filter(i => i.liquid).reduce((sum, i) => sum + state.holdings[i.id], 0);

// What buying would look like right now, in nominal rupees, and whether the player can afford it.
export function homeOffer(state, params) {
  const H = params.housing;
  const price = state.homePrice;
  const loan = (price * H.loan.sharePct) / 100;
  const down = price - loan;
  const oneOff = (price * H.oneOffCostPct) / 100;
  const needed = down + oneOff;
  const required = needed * H.affordabilityBuffer; // a little extra for tax on whatever has to be sold
  const liquid = liquidAssets(state, params);
  const owns = state.home !== null;
  return {
    owns, price, loan, down, oneOff, needed, required, liquid,
    affordable: !owns && liquid >= required,
    shortfall: Math.max(0, required - liquid),
    paymentPerMonth: yearlyPayment(loan, H.loan.ratePct, H.loan.years) / 12,
    upkeepPerYear: (price * H.upkeepPct) / 100,
    rentPerMonth: state.rent / 12,
    years: H.loan.years,
  };
}

// Buys the home at the start of a year (mutates `s`). Returns what was paid out of pocket now:
// the down payment and the one-off costs.
export function buyHome(s, params) {
  const o = homeOffer(s, params);
  s.home = {
    value: o.price,
    cost: o.price + o.oneOff,
    boughtYear: s.year,
    loan: o.loan,
    payment: yearlyPayment(o.loan, params.housing.loan.ratePct, o.years),
    yearsLeft: o.years,
    ratePct: params.housing.loan.ratePct,
  };
  s.rent = 0;
  return { price: o.price, down: o.down, oneOff: o.oneOff, outlay: o.down + o.oneOff };
}

// One year of the loan (mutates `home`): interest builds up on the balance, then the instalment is
// paid. Returns { interest, principal, paid }.
export function payLoanYear(home) {
  const interest = home.loan * (home.ratePct / 100);
  const paid = home.yearsLeft > 0 ? Math.min(home.payment, home.loan + interest) : 0;
  home.loan = Math.max(0, home.loan + interest - paid);
  if (home.loan < 1e-6) home.loan = 0;
  home.yearsLeft = Math.max(0, home.yearsLeft - 1);
  return { interest, principal: paid - interest, paid };
}

// What selling the home would bring (nominal): its value less selling costs and the loan.
export function saleProceeds(home, params) {
  const sellingCost = (home.value * params.housing.sellingCostPct) / 100;
  return { sellingCost, net: home.value - sellingCost - home.loan, gain: home.value - sellingCost - home.cost };
}
