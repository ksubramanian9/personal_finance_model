import { nextFloat, nextNormal } from './rng.js';
import { nextRegime } from './macro.js';
import { rollEvents, settleEvents } from './events.js';
import { netWorth } from './state.js';
import { computeTax, buyLot, sellLots, cloneLots } from './tax.js';
import { buyHome, payLoanYear, saleProceeds } from './housing.js';
import { marry, birthDue, childCosts, spouseGross } from './family.js';
import { retire } from './retirement.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Plays one year. Pure: returns a new state and leaves the input untouched.
//
// Randomness: exactly 1 uniform draw (the economy) plus 1 normal draw per instrument, in the
// order instruments.json lists them, whatever the player holds. So the same seed gives the same
// economy and the same market returns however the player invests. Life events draw from their
// own stream (state.rngEvents), 3 numbers per event, with the same guarantee. Home prices use no
// random numbers: they follow the economy's regime.
//
// Order within the year:
//   0. a home chosen at the stage start is bought (down payment and one-off costs go out now);
//      a planned wedding or birth happens; at the retirement age the pay stops (see retirement.js)
//   1. the economy moves to this year's regime; every instrument gets its return for that regime
//   2. holdings and cash earn; debt accrues interest; homes change in price
//   3. life events happen (layoff, hospital bill, windfall...); insurance pays what it covers;
//      tax is worked out on pay, windfalls and interest; rent or the home's instalment and upkeep
//   4. debt is paid down from income, up to a share of income left after expenses
//   5. surplus is split into saved (first topping up the emergency fund in cash, the rest spread
//      over instruments by the player's allocation) and consumed; a deficit is drawn from cash,
//      then liquid instruments in drawOrder (provident funds are locked in until retirement), then, if
//      borrowing would swamp the player, the home; then borrowed. Tax on gains from selling is
//      added to the shortfall
//   6. salary, costs and prices roll forward to next year (raises follow the economy)
export function tickYear(state, params) {
  const s = structuredClone(state);
  const netWorthStart = netWorth(s);
  const priceIndexStart = s.priceIndex;

  // 0. buying a home
  let purchase = null;
  if (s.buyHome && !s.home) purchase = buyHome(s, params);
  s.buyHome = 0;

  // 0b. family: the wedding and the births the player planned
  let marriage = null;
  let birth = false;
  if (s.marryAge > 0 && !s.spouse && s.age >= s.marryAge) marriage = marry(s, params);
  if (birthDue(s, params)) { s.children.push(s.year); birth = true; }

  // 0c. the pay stops
  if (s.age >= s.retirementAge && !s.retired) retire(s, params);

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

  // 2. earnings (interest on cash and fixed deposits is taxed as it builds up)
  let investGain = 0;
  let interest = 0;
  for (const inst of params.instruments) {
    const gain = s.holdings[inst.id] * returns[inst.id];
    s.holdings[inst.id] += gain;
    investGain += gain;
    if (params.tax.instruments[inst.id].kind === 'interest') interest += gain;
  }
  const cashInterest = s.cash * (params.cashReturnPct / 100);
  const debtInterest = s.debt * (params.debtInterestPct / 100);
  s.cash += cashInterest;
  s.debt += debtInterest;
  interest += cashInterest;

  const priceGrowth = params.housing.priceGrowthPct[regime] / 100;
  s.homePrice *= 1 + priceGrowth;
  let homeGain = 0;
  let homeUpkeep = 0;
  let loanYear = { interest: 0, principal: 0, paid: 0 };
  if (s.home) {
    homeUpkeep = (s.home.value * params.housing.upkeepPct) / 100;
    homeGain = s.home.value * priceGrowth;
    s.home.value += homeGain;
    loanYear = payLoanYear(s.home);
  }
  const rentPaid = s.rent;

  // 3. life events, then the tax on this year's pay and interest (tax on gains from selling comes later)
  const ev = settleEvents(s, rollEvents(s, params.events, regime), params.insurance, priceIndexStart);
  const pensionIncome = s.pension;
  const income = ev.salaryReceived + ev.severance + pensionIncome;
  const extraIncome = ev.extraIncome;
  const learning = s.salary * s.learningPct;
  const premium = s.healthPremium * priceIndexStart * (1 + (params.insurance.premiumAgeLoadingPct / 100) * Math.max(0, s.age - 30));
  const taxBasis = { priceIndex: priceIndexStart, salary: income, windfall: ev.taxableExtra, ordinary: interest };
  const baseTax = computeTax(params.tax, taxBasis);
  let taxIncome = baseTax.incomeTax;
  let taxInvest = baseTax.investTax;
  const homeOutlay = purchase ? purchase.outlay : 0;
  const childCost = childCosts(s, params);
  const weddingCost = marriage ? marriage.weddingCost : 0;
  const partnerGross = spouseGross(s);
  const partnerTax = partnerGross > 0 ? computeTax(params.tax, { priceIndex: priceIndexStart, salary: partnerGross }).total : 0;
  const spouseNet = partnerGross - partnerTax; // their pay after their own tax
  let expenses = s.livingCost + s.support + rentPaid + homeUpkeep + loanYear.paid + homeOutlay
    + childCost + weddingCost + learning + premium + ev.eventCost + baseTax.total;
  const inflow = income + extraIncome + spouseNet;

  // 4-5. debt, saving
  const debtPaid = Math.min(s.debt, Math.max(0, inflow - expenses) * params.debtPaydownShare);
  s.debt -= debtPaid;

  const surplus = inflow - expenses - debtPaid;
  let saved = 0;
  let toCash = 0;
  let consumed = 0;
  let borrowed = 0;
  let fromCash = 0;
  let homeSale = null;
  let homeToCash = 0; // what is left of a home's sale once the gap is covered
  const sold = {};
  if (surplus >= 0) {
    saved = surplus * s.savingsRate;
    consumed = surplus - saved;
    const fundTarget = (s.emergencyMonths * (s.livingCost + s.support + rentPaid + homeUpkeep + loanYear.paid)) / 12;
    toCash = Math.min(saved, Math.max(0, fundTarget - s.cash));
    s.cash += toCash;
    for (const inst of params.instruments) {
      const amount = (saved - toCash) * s.alloc[inst.id];
      if (s.lots[inst.id]) buyLot(s.lots[inst.id], s.holdings[inst.id], amount, s.year);
      s.holdings[inst.id] += amount;
    }
  } else {
    // Selling shares or gold can trigger tax, which has to be raised by selling a little more. The
    // extra sale triggers a little more tax, so repeat until the tax on the sale stops changing.
    // Provident funds open up once the pay has stopped.
    const opens = (i) => i.liquid || (s.retired && i.retiredDrawOrder !== undefined);
    const key = (i) => (s.retired && i.retiredDrawOrder !== undefined ? i.retiredDrawOrder : i.drawOrder);
    const sellOrder = params.instruments.filter(opens).sort((a, b) => key(a) - key(b));
    const plan = (raise) => {
      let need = raise;
      const p = { fromCash: Math.min(s.cash, need), sold: {}, holdings: { ...s.holdings }, lots: cloneLots(s.lots), gains: {}, sellsHome: false, homeCash: 0 };
      need -= p.fromCash;
      for (const inst of sellOrder) {
        const take = Math.min(p.holdings[inst.id], need);
        if (take <= 0) continue;
        if (p.lots[inst.id]) p.gains[inst.id] = sellLots(p.lots[inst.id], p.holdings[inst.id], take, s.year, params.tax.instruments[inst.id].longTermYears);
        p.holdings[inst.id] -= take;
        need -= take;
        p.sold[inst.id] = take;
      }
      // A home is the last thing to go, and only when borrowing the rest would swamp the player.
      if (need > 1e-9 && s.home) {
        const sale = saleProceeds(s.home, params);
        const swamped = s.debt + need > (params.housing.forcedSaleDebtMonths * s.salary) / 12;
        if (swamped && sale.net > 0) {
          const held = s.year - s.home.boughtYear;
          const longTerm = held >= params.tax.property.longTermYears;
          p.gains.home = { st: longTerm ? 0 : sale.gain, lt: longTerm ? sale.gain : 0 };
          p.sellsHome = true;
          p.homeCash = sale.net;
          p.sale = sale;
          need -= sale.net;
        }
      }
      p.borrowed = Math.max(0, need);
      p.toCash = Math.max(0, -need); // what is left of the home's proceeds once the gap is covered
      return p;
    };
    let extra = 0;
    let p = plan(-surplus);
    let withSale = baseTax;
    for (let i = 0; i < 30; i++) {
      withSale = computeTax(params.tax, { ...taxBasis, gains: p.gains });
      const saleTax = Math.max(0, withSale.total - baseTax.total);
      if (Math.abs(saleTax - extra) < 1e-7) break;
      extra = saleTax;
      p = plan(-surplus + extra);
    }
    fromCash = p.fromCash;
    Object.assign(sold, p.sold);
    borrowed = p.borrowed;
    homeToCash = p.toCash;
    s.cash += homeToCash - fromCash;
    s.holdings = p.holdings;
    s.lots = p.lots;
    s.debt += borrowed;
    if (p.sellsHome) {
      homeSale = { value: s.home.value, sellingCost: p.sale.sellingCost, loanRepaid: s.home.loan, tax: Math.max(0, withSale.total - baseTax.total) };
      s.home = null;
    }
    taxIncome = withSale.incomeTax;
    taxInvest = withSale.investTax;
    expenses += withSale.total - baseTax.total;
    if (homeSale) expenses += homeSale.sellingCost; // the cost of selling is part of what went out
  }

  // 6. roll forward
  const inflation = R.inflationPct / 100;
  const priceIndexEnd = priceIndexStart * (1 + inflation);
  if (homeSale) s.rent = s.rentReal * priceIndexEnd; // back to renting at the going rate
  const nw = netWorth(s);

  s.history.push({
    age: s.age,
    year: s.year,
    regime,
    inflation,
    returns,
    income, extraIncome, expenses, learning, premium, eventCost: ev.eventCost, insurancePaid: ev.insurancePaid,
    taxIncome, taxInvest, // tax on pay and windfalls, and the extra tax investing brought (both are in expenses)
    rent: rentPaid, homeUpkeep, homeOutlay, // what housing cost (all in expenses)
    pension: pensionIncome, retired: s.retired,
    drift: s.livingCost * (1 - 1 / s.creepIndex), // the part of everyday costs that crept up with pay (inside expenses)
    spouseNet, childCost, weddingCost,      // a partner's pay after tax (income); children and the wedding (in expenses)
    family: [...(marriage ? ['married'] : []), ...(birth ? ['birth'] : [])],
    married: s.spouse !== null, childrenCount: s.children.length,
    emi: loanYear.paid, homeInterest: loanYear.interest, homePrincipal: loanYear.principal,
    homeGain, homeValue: s.home ? s.home.value : 0, homeLoan: s.home ? s.home.loan : 0,
    homeBought: purchase, homeSale,
    debtPaid, debtInterest, saved, toCash, consumed, borrowed,
    events: ev.records.map(r => ({ ...r, age: s.age, year: s.year })),
    coping: { fromCash, sold, borrowed, soldHome: homeSale !== null }, // how a shortfall was met
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
  const salaryBefore = s.salary;
  s.age += 1;
  s.year += 1;
  s.priceIndex = priceIndexEnd;
  s.salary *= 1 + raise;
  if (ev.payHit) s.salary *= 1 - ev.payHit;   // the next job after a layoff pays less
  if (ev.payJump) s.salary *= 1 + ev.payJump; // the offer you took
  s.pension *= 1 + inflation; // the pension is linked to prices
  s.educationIndex *= 1 + params.family.children.educationPremiumPct / 100;
  // Slow drift: when pay rises faster than prices, part of the extra goes into a more expensive way of
  // living, and it never comes back down. The share is the persona's lifestyleCreep.
  const realPayGrowth = salaryBefore > 0 ? s.salary / salaryBefore / (1 + inflation) - 1 : 0;
  const drift = realPayGrowth > 0 ? 1 + s.lifestyleCreep * realPayGrowth : 1;
  s.creepIndex *= drift;
  s.livingCost *= (1 + inflation) * drift;
  s.support *= 1 + inflation;
  if (s.rent > 0 && !homeSale) s.rent *= 1 + inflation; // rent follows prices
  return s;
}

// Plays years until the persona reaches `targetAge` (default: their retirement age).
export function runUntil(state, params, targetAge = state.retirementAge) {
  let s = state;
  while (s.age < targetAge) s = tickYear(s, params);
  return s;
}
