import { loadJSON } from './loader.js';
import { ValidationError, schemas } from './validate.js';

const DIR = 'data/personas/';
const ACCENTS = ['accent1', 'accent2', 'accent3'];
const CONFIDENCE = ['high', 'medium', 'low'];

// The starting numbers the player may change on the set-up page, each in steps within limits. `read` is the
// persona's own number; amounts are rupees (a year, or a month for `support`).
export const START_FIELDS = {
  salary: { label: 'earns a year', step: 50000, min: 300000, max: 3000000, read: (p) => p.money.startingSalary },
  savings: { label: 'saved so far', step: 10000, min: 0, max: 1000000, read: (p) => p.money.startingSavings },
  debt: { label: 'owes', step: 50000, min: 0, max: 5000000, read: (p) => p.money.startingDebt },
  support: { label: 'sends home', step: 1000, min: 0, max: 50000, read: (p) => p.obligations.parentsSupportMonthly + p.obligations.siblingSupportMonthly },
};
export const clampStart = (key, value) => Math.min(START_FIELDS[key].max, Math.max(START_FIELDS[key].min, value));

// Every changeable starting number of a persona: { salary, savings, debt, support }.
export const startOf = (persona) => Object.fromEntries(Object.entries(START_FIELDS).map(([k, f]) => [k, f.read(persona)]));

// A copy of the persona with some starting numbers changed (`changes` holds only the ones that differ).
// Sends-home is one amount: the sibling's share is kept where it fits, and the parents' share is the rest.
export function personaWithStart(persona, changes = {}) {
  const has = (k) => Number.isFinite(changes[k]);
  if (!Object.keys(START_FIELDS).some(has)) return persona;
  const value = (k) => (has(k) ? clampStart(k, changes[k]) : START_FIELDS[k].read(persona));
  const sibling = persona.obligations.siblingSupportMonthly;
  const parents = Math.max(0, value('support') - sibling);
  return {
    ...persona,
    money: { ...persona.money, startingSalary: value('salary'), startingSavings: value('savings'), startingDebt: value('debt') },
    obligations: { ...persona.obligations, parentsSupportMonthly: parents, siblingSupportMonthly: value('support') - parents },
  };
}

// What differs between a played persona and the one in the file (to restore a saved life's changes).
export function changesBetween(played, original) {
  const was = startOf(original);
  return Object.fromEntries(Object.entries(startOf(played)).filter(([k, v]) => v !== was[k]));
}

// Checks beyond types: ranges and allowed values.
export function checkPersona(p, label) {
  const problems = [];
  for (const [k, v] of Object.entries(p.biases)) {
    if (typeof v !== 'number' || v < 0 || v > 1) problems.push(`"biases.${k}" should be between 0 and 1`);
  }
  if (p.career.skillPayoff < 0 || p.career.skillPayoff > 2) problems.push('"career.skillPayoff" should be between 0 and 2 (0 = skills do not move pay)');
  if (p.career.severanceMonths !== undefined && (p.career.severanceMonths < 0 || p.career.severanceMonths > 12)) problems.push('"career.severanceMonths" should be from 0 to 12 (months of pay on losing the job)');
  for (const [id, t] of Object.entries(p.eventText ?? {})) {
    if (!t || typeof t !== 'object') { problems.push(`"eventText.${id}" should be { name, emoji, story }`); continue; }
    for (const f of ['name', 'emoji', 'story']) if (t[f] !== undefined && (typeof t[f] !== 'string' || !t[f])) problems.push(`"eventText.${id}.${f}" should be text`);
  }
  if (p.career.layoffRisk < 0 || p.career.layoffRisk > 1) problems.push('"career.layoffRisk" should be between 0 and 1');
  if (p.career.cyclicality < 0 || p.career.cyclicality > 1) problems.push('"career.cyclicality" should be between 0 and 1 (0 = immune to the economy, 1 = fully exposed)');
  if (!ACCENTS.includes(p.accent)) problems.push(`"accent" should be one of ${ACCENTS.join(', ')}`);
  if (!CONFIDENCE.includes(p.provenance.confidence)) problems.push(`"provenance.confidence" should be one of ${CONFIDENCE.join(', ')}`);
  if (p.profile.startAge < 18 || p.profile.startAge > 40) problems.push('"profile.startAge" should be between 18 and 40');
  if (p.money.startingSalary <= 0) problems.push('"money.startingSalary" should be above 0');
  if (problems.length) throw new ValidationError(label, problems);
  return p;
}

// Reads data/personas/index.json, then every persona it lists.
// Adding a persona = add a file and list it in the index.
export async function loadPersonas({ fetchImpl = fetch } = {}) {
  const index = await loadJSON(`${DIR}index.json`, {
    label: 'personas/index.json',
    schema: { personas: 'array' },
    fetchImpl,
  });

  const personas = [];
  for (const file of index.personas) {
    const label = `personas/${file}`;
    const p = await loadJSON(`${DIR}${file}`, { label, schema: schemas.persona, fetchImpl });
    checkPersona(p, label);
    if (personas.some(x => x.id === p.id)) {
      throw new ValidationError(label, [`id "${p.id}" is already used by another persona`]);
    }
    personas.push(p);
  }
  return personas;
}
