import { createRng } from './rng.js';

// The whole game in one plain, JSON-serializable object.
// All money is nominal rupees. `priceIndex` converts to today's rupees (1 at the start).
export function createState(persona, params, { seed, retirementAge }) {
  return {
    version: 1,
    seed,
    personaId: persona.id,
    startAge: persona.profile.startAge,
    retirementAge,
    age: persona.profile.startAge,
    year: params.startYear,
    rng: createRng(seed),

    // annual flows, nominal, for the year about to be played
    salary: persona.money.startingSalary,
    livingCost: persona.money.monthlyExpenses * 12,
    support: (persona.obligations.parentsSupportMonthly + persona.obligations.siblingSupportMonthly) * 12,
    salaryGrowth: persona.career.salaryGrowthPct / 100,

    // balances
    cash: persona.money.startingSavings,
    invested: 0,
    debt: persona.money.startingDebt,

    priceIndex: 1,
    savingsRate: params.savingsRate,
    learningPct: 0,   // share of salary spent on getting better at work
    growthBoost: 0,   // extra yearly salary growth that buys
    choices: {},      // stageId -> { decisionId: optionId }
    history: [],
  };
}

export function netWorth(state) {
  return state.cash + state.invested - state.debt;
}
