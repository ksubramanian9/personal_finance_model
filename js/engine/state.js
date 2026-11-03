import { createRng, nextNormal } from './rng.js';
import { gainsIds } from './tax.js';

// Bumped whenever the shape of the state changes, so a saved life from an older game is not resumed.
export const STATE_VERSION = 9;

// The whole game in one plain, JSON-serializable object.
// All money is nominal rupees. `priceIndex` converts to today's rupees (1 at the start).
// `params` is what loadParams() returns (engine.json plus macro and instruments).
// `custom` is Level 3: { scriptId, overrides } (the overrides are already applied to `params`; they are kept here so
// the end screen can say the life was not a default one).
export function createState(persona, params, { seed, retirementAge, custom = null }) {
  const tier = params.housing.cityTiers[persona.profile.cityTier];
  if (!tier) throw new Error(`housing.json has no city tier ${persona.profile.cityTier} (needed by ${persona.id})`);
  // How long this life lasts: its own random stream, so nothing else's luck moves.
  const L = params.retirement.lifespan;
  const lifeZ = nextNormal(createRng(`${seed}:life`));
  const deathAge = Math.round(Math.min(L.maxAge, Math.max(L.minAge, L.meanAge + L.sdYears * lifeZ)));
  return {
    version: STATE_VERSION,
    seed,
    personaId: persona.id,
    startAge: persona.profile.startAge,
    retirementAge,
    age: persona.profile.startAge,
    year: params.startYear,
    rng: createRng(seed),                  // the economy and markets
    rngEvents: createRng(`${seed}:events`), // life events: a separate stream, so markets and events never shift each other
    rngNudges: createRng(`${seed}:nudges`), // instinct cards: likewise
    script: custom?.scriptId ? params.macro.scripts[custom.scriptId].sequence : null, // fixed weather, or null for the dice
    custom: custom ? { scriptId: custom.scriptId ?? null, overrides: custom.overrides ?? {} } : null,
    regime: params.macro.start, // last year's economy; the first tick draws this year's

    // annual flows, nominal, for the year about to be played
    salary: persona.money.startingSalary,
    livingCost: persona.money.monthlyExpenses * 12,
    rentReal: persona.money.monthlyRent * 12, // rent in today's rupees, for when the player goes back to renting
    rent: persona.money.monthlyRent * 12,     // this year's rent, nominal; 0 while the player owns a home
    biases: { ...persona.biases },                  // panicSell, lifestyleCreep, overConservatism: how strongly instincts pull
    lifestyleCreep: persona.biases.lifestyleCreep, // how much of a real pay rise turns into spending
    creepIndex: 1,                                  // how much dearer a lifestyle has become through that drift
    support: (persona.obligations.parentsSupportMonthly + persona.obligations.siblingSupportMonthly) * 12,
    salaryGrowth: persona.career.salaryGrowthPct / 100,
    cyclicality: persona.career.cyclicality, // how much the economy moves this job's raises
    career: {
      layoffRisk: persona.career.layoffRisk,
      jobSwitchJumpPct: persona.career.jobSwitchJumpPct,
      employerHealthCover: persona.career.employerHealthCover,
      pension: persona.career.pension,
      skillPayoff: persona.career.skillPayoff,
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

    // instinct cards (see nudges.js)
    pending: { spend: 0, income: 0, panicSell: false }, // what the player chose at a card, carried out next year
    nudgeLog: [],        // every answer: { id, age, choice, ... }
    nudgeCounts: {},     // cards shown so far, by stage id

    // the end of working life and of life (see retirement.js)
    deathAge,            // hidden from the player until the end
    retired: false,
    pension: 0,          // yearly, nominal, once retired
    retireSpendPct: 1,   // everyday costs in retirement, as a share of the last working year's

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
    effort: 0,        // 0 to 1: how much free time goes into getting better (set by a choice)
    capability: 0,    // skills, 0 to 1: builds with effort, fades without it
    growthBoost: 0,   // extra yearly salary growth the skills buy (worked out from capability each year)
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
