// Tiny schema checker. A schema maps field name -> type string or nested schema.
// Types: 'string' | 'number' | 'boolean' | 'array' | 'object'. Suffix '?' marks optional.

export class ValidationError extends Error {
  constructor(label, problems) {
    super(`${label} has problems:\n- ${problems.join('\n- ')}`);
    this.name = 'ValidationError';
    this.label = label;
    this.problems = problems;
  }
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function check(value, schema, path, problems) {
  for (const [key, rule] of Object.entries(schema)) {
    const here = path ? `${path}.${key}` : key;
    const nested = typeof rule === 'object';
    const optional = !nested && rule.endsWith('?');
    const expected = nested ? 'object' : rule.replace('?', '');

    if (!(key in value) || value[key] === undefined) {
      if (!optional) problems.push(`missing "${here}"`);
      continue;
    }
    const actual = typeOf(value[key]);
    if (actual !== expected) {
      problems.push(`"${here}" should be ${expected} but is ${actual}`);
      continue;
    }
    if (nested) check(value[key], rule, here, problems);
  }
}

export function validate(data, schema, label) {
  const problems = [];
  if (typeOf(data) !== 'object') {
    problems.push(`expected an object but got ${typeOf(data)}`);
  } else {
    check(data, schema, '', problems);
  }
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export const schemas = {
  stages: {
    decisions: 'object', stages: 'array',
    provenance: { basis: 'string', confidence: 'string', asOf: 'number' },
  },
  engine: {
    startYear: 'number', cashReturnPct: 'number',
    debtInterestPct: 'number', debtPaydownShare: 'number', savingsRate: 'number',
    allocation: 'object',
    provenance: { basis: 'string', confidence: 'string', asOf: 'number' },
  },
  events: {
    insurance: { employerCoverReal: 'number', premiumAgeLoadingPct: 'number' },
    events: 'array',
    provenance: { basis: 'string', confidence: 'string', asOf: 'number' },
  },
  macro: {
    order: 'array', start: 'string', regimes: 'object', transitions: 'object',
    provenance: { basis: 'string', confidence: 'string', asOf: 'number' },
  },
  instruments: {
    instruments: 'array',
    provenance: { basis: 'string', confidence: 'string', asOf: 'number' },
  },
  persona: {
    id: 'string', name: 'string', emoji: 'string', accent: 'string',
    tagline: 'string', story: 'string',
    profile: { startAge: 'number', city: 'string', cityTier: 'number', education: 'string', job: 'string' },
    money: { startingSalary: 'number', startingSavings: 'number', startingDebt: 'number', monthlyExpenses: 'number' },
    obligations: { parentsSupportMonthly: 'number', siblingSupportMonthly: 'number' },
    career: {
      salaryGrowthPct: 'number', jobSwitchJumpPct: 'number', layoffRisk: 'number', cyclicality: 'number',
      pension: 'boolean', employerHealthCover: 'boolean',
    },
    biases: { lifestyleCreep: 'number', panicSell: 'number', overConservatism: 'number' },
    provenance: { basis: 'string', confidence: 'string', asOf: 'number' },
  },
  theme: {
    fonts: { display: 'string', body: 'string', 'googleFontsUrl': 'string?' },
    colors: {
      bg: 'string', surface: 'string', ink: 'string', inkSoft: 'string',
      primary: 'string', primaryInk: 'string',
      accent1: 'string', accent2: 'string', accent3: 'string',
      good: 'string', warn: 'string', bad: 'string',
    },
    sizes: { base: 'string', hero: 'string', radius: 'string' },
    chart: {
      cash: 'string', fd: 'string', pf: 'string', gold: 'string', equity: 'string', loans: 'string',
      earned: 'string', spent: 'string', surface: 'string', grid: 'string', axis: 'string', muted: 'string', band: 'string',
    },
    provenance: { basis: 'string', confidence: 'string', asOf: 'number' },
  },
};
