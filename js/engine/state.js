import { createRng } from './rng.js';

// The whole game in one plain, JSON-serializable object.
// All money is nominal rupees. `priceIndex` converts to today's rupees (1 at the start).
// `params` is what loadParams() returns (engine.json plus macro and instruments).
export function createState(persona, params, { seed, retirementAge }) {
  return {
    version: 2,
    seed,
    personaId: persona.id,
    startAge: persona.profile.startAge,
    retirementAge,
    age: persona.profile.startAge,
    year: params.startYear,
    rng: createRng(seed),
    regime: params.macro.start, // last year's economy; the first tick draws this year's

    // annual flows, nominal, for the year about to be played
    salary: persona.money.startingSalary,
    livingCost: persona.money.monthlyExpenses * 12,
    support: (persona.obligations.parentsSupportMonthly + persona.obligations.siblingSupportMonthly) * 12,
    salaryGrowth: persona.career.salaryGrowthPct / 100,
    cyclicality: persona.career.cyclicality, // how much the economy moves this job's raises

    // balances
    cash: persona.money.startingSavings,
    holdings: Object.fromEntries(params.instruments.map(i => [i.id, 0])),
    debt: persona.money.startingDebt,

    priceIndex: 1,
    savingsRate: params.savingsRate,
    alloc: { ...params.allocation }, // where new savings go; existing holdings are never sold to rebalance
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
  return state.cash + totalInvested(state) - state.debt;
}
