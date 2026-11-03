import { createRng } from './rng.js';
import { gainsIds } from './tax.js';

// The whole game in one plain, JSON-serializable object.
// All money is nominal rupees. `priceIndex` converts to today's rupees (1 at the start).
// `params` is what loadParams() returns (engine.json plus macro and instruments).
export function createState(persona, params, { seed, retirementAge }) {
  const tier = params.housing.cityTiers[persona.profile.cityTier];
  if (!tier) throw new Error(`housing.json has no city tier ${persona.profile.cityTier} (needed by ${persona.id})`);
  return {
    version: 6,
    seed,
    personaId: persona.id,
    startAge: persona.profile.startAge,
    retirementAge,
    age: persona.profile.startAge,
    year: params.startYear,
    rng: createRng(seed),                  // the economy and markets
    rngEvents: createRng(`${seed}:events`), // life events: a separate stream, so markets and events never shift each other
    regime: params.macro.start, // last year's economy; the first tick draws this year's

    // annual flows, nominal, for the year about to be played
    salary: persona.money.startingSalary,
    livingCost: persona.money.monthlyExpenses * 12,
    rentReal: persona.money.monthlyRent * 12, // rent in today's rupees, for when the player goes back to renting
    rent: persona.money.monthlyRent * 12,     // this year's rent, nominal; 0 while the player owns a home
    support: (persona.obligations.parentsSupportMonthly + persona.obligations.siblingSupportMonthly) * 12,
    salaryGrowth: persona.career.salaryGrowthPct / 100,
    cyclicality: persona.career.cyclicality, // how much the economy moves this job's raises
    career: {
      layoffRisk: persona.career.layoffRisk,
      jobSwitchJumpPct: persona.career.jobSwitchJumpPct,
      employerHealthCover: persona.career.employerHealthCover,
    },

    // balances
    cash: persona.money.startingSavings,
    holdings: Object.fromEntries(params.instruments.map(i => [i.id, 0])),
    // what each taxed-on-sale holding cost and when it was bought (see tax.js)
    lots: Object.fromEntries(gainsIds(params.tax).map(id => [id, []])),
    debt: persona.money.startingDebt,
    cityTier: persona.profile.cityTier, // scales what children cost
    homePrice: tier.homePrice, // what a typical apartment in this city costs now (nominal)
    home: null,                // the player's home, once bought (see housing.js)
    buyHome: 0,                // 1 = buy at the start of the next year (set by a choice)

    // family (see family.js)
    spouse: null,        // { year } once married
    marryAge: 0,         // the age the player plans to marry at; 0 = no plan
    weddingReal: 0,      // the wedding bill in today's rupees
    spousePct: 0,        // the partner's pay as a share of the player's
    childPlan: 0,        // how many children the couple will have
    children: [],        // the year each child was born
    educationIndex: 1,   // how much dearer school and college are than general prices

    priceIndex: 1,
    savingsRate: params.savingsRate,
    alloc: { ...params.allocation }, // where new savings go; existing holdings are never sold to rebalance
    emergencyMonths: 0, // months of living costs kept in cash before new savings are invested
    healthCover: 0,     // cover the player bought, in today's rupees a year
    healthPremium: 0,   // its yearly premium at age 30, in today's rupees
    learningPct: 0,   // share of salary spent on getting better at work
    growthBoost: 0,   // extra yearly salary growth that buys
    choices: {},      // stageId -> { decisionId: optionId }
    history: [],
  };
}

export function totalInvested(state) {
  return Object.values(state.holdings).reduce((a, b) => a + b, 0);
}

export function netWorth(state) {
  const home = state.home ? state.home.value - state.home.loan : 0;
  return state.cash + totalInvested(state) + home - state.debt;
}
