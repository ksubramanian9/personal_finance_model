import { loadJSON } from './loader.js';
import { ValidationError, schemas } from './validate.js';

const DIR = 'data/personas/';
const ACCENTS = ['accent1', 'accent2', 'accent3'];
const CONFIDENCE = ['high', 'medium', 'low'];

// Checks beyond types: ranges and allowed values.
export function checkPersona(p, label) {
  const problems = [];
  for (const [k, v] of Object.entries(p.biases)) {
    if (typeof v !== 'number' || v < 0 || v > 1) problems.push(`"biases.${k}" should be between 0 and 1`);
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
