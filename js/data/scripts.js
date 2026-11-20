import { loadJSON } from './loader.js';
import { ValidationError, schemas } from './validate.js';

// Student scripts: data/scripts/template.json is the spine every script shares (steps, prompts, rubric),
// and each data/scripts/<persona>.json fills it for one persona. data/scripts/index.json lists them.
// Everything is loaded and checked up front, so a bad script is found when the page opens.

export const CHECK_TYPES = ['event', 'verdict', 'borrowed', 'homeBought', 'netWorth', 'metric', 'higher', 'lower', 'regime'];
export const RUN_NAMES = ['baseline', 'changed', 'fresh', 'freshFirst'];
export const METRIC_NAMES = ['spendableAtRetirementReal', 'netWorthAtEndReal', 'borrowedYears', 'deathAge'];
const RETIREMENT_AGES = [55, 60, 65];

const isText = (x) => typeof x === 'string' && x.trim() !== '';
const isTexts = (x) => Array.isArray(x) && x.length > 0 && x.every(isText);

// A step's student and facilitator parts: { lead: [text], prompts: [{ id, label }] } and { lead, discuss }.
function checkStepParts(step, where, problems) {
  if (!isText(step.id)) problems.push(`${where} needs an "id"`);
  if (!isText(step.title)) problems.push(`${where} needs a "title"`);
  const s = step.student;
  if (!s || !isTexts(s.lead)) problems.push(`${where}.student.lead should be a list of text`);
  for (const p of s?.prompts ?? []) if (!isText(p.id) || !isText(p.label)) problems.push(`${where}.student.prompts each need an id and a label`);
  const f = step.facilitator;
  if (!f || !isTexts(f.lead)) problems.push(`${where}.facilitator.lead should be a list of text`);
  if (f && !Array.isArray(f.discuss)) problems.push(`${where}.facilitator.discuss should be a list`);
}

export function checkTemplate(t, label = 'scripts/template.json') {
  const problems = [];
  const ids = new Set();
  for (const [i, step] of t.steps.entries()) {
    checkStepParts(step, `steps[${i}]`, problems);
    if (ids.has(step.id)) problems.push(`step id "${step.id}" is used twice`);
    ids.add(step.id);
    if (typeof step.minutes !== 'number') problems.push(`steps[${i}].minutes should be a number`);
    if (step.generated !== undefined && !['keyChoices', 'stages'].includes(step.generated)) problems.push(`steps[${i}].generated should be "keyChoices" or "stages"`);
  }
  for (const [i, r] of t.rubric.entries()) if (!isText(r.id) || !isText(r.label) || !isText(r.looksLike)) problems.push(`rubric[${i}] needs id, label and looksLike`);
  if (problems.length) throw new ValidationError(label, problems);
  return t;
}

// `world` is { personas, stages, decisions } as loaded for the game.
export function checkScript(s, template, { personas, stages, decisions }, label) {
  const problems = [];
  if (!personas.some(p => p.id === s.personaId)) problems.push(`"personaId" ${s.personaId} is not a persona`);
  if (s.seed === s.freshSeed) problems.push('"freshSeed" must differ from "seed"');
  if (!RETIREMENT_AGES.includes(s.retirementAge)) problems.push(`"retirementAge" should be one of ${RETIREMENT_AGES.join(', ')}`);

  const optionIds = (decisionId) => (decisions[decisionId]?.options ?? []).map(o => o.id);
  for (const stage of stages) if (!s.picks[stage.id]) problems.push(`"picks.${stage.id}" is missing: a script must answer every stage`);
  for (const [stageId, stagePicks] of Object.entries(s.picks)) {
    if (!stages.some(st => st.id === stageId)) { problems.push(`"picks.${stageId}" is not a stage`); continue; }
    for (const [decisionId, optionId] of Object.entries(stagePicks)) {
      if (!decisions[decisionId]) problems.push(`"picks.${stageId}.${decisionId}" is not a decision`);
      else if (!optionIds(decisionId).includes(optionId)) problems.push(`"picks.${stageId}.${decisionId}" is "${optionId}", which is not one of ${optionIds(decisionId).join(', ')}`);
    }
  }
  const retire = Object.values(s.picks).map(p => p.retire).find(Boolean);
  if (retire && retire !== `at${s.retirementAge}`) problems.push(`the "retire" pick is "${retire}", but "retirementAge" is ${s.retirementAge}`);

  const seen = new Set();
  if (s.keyChoices.length < 4 || s.keyChoices.length > 6) problems.push(`"keyChoices" should have 4 to 6 choices, not ${s.keyChoices.length}`);
  for (const [i, k] of s.keyChoices.entries()) {
    const where = `keyChoices[${i}]`;
    if (s.picks[k.stage]?.[k.decision] === undefined) problems.push(`${where}: "${k.decision}" is not answered in "picks.${k.stage}"`);
    if (seen.has(`${k.stage}/${k.decision}`)) problems.push(`${where}: ${k.stage}/${k.decision} is listed twice`);
    seen.add(`${k.stage}/${k.decision}`);
    if (!isText(k.why)) problems.push(`${where}.why should be text`);
    if (!isTexts(k.weigh)) problems.push(`${where}.weigh should be a list of text`);
  }

  const c = s.change;
  const placed = Object.values(s.picks).filter(p => c.decision in p);
  if (!placed.length) problems.push(`"change.decision" ${c.decision} is not answered in any stage`);
  else if (!optionIds(c.decision).includes(c.to)) problems.push(`"change.to" is "${c.to}", which is not one of ${optionIds(c.decision).join(', ')}`);
  else if (placed.every(p => p[c.decision] === c.to)) problems.push('"change.to" is what the plan already picks, so nothing would change');

  for (const [i, o] of (s.observe ?? []).entries()) {
    if (!stages.some(st => st.id === o.stage)) problems.push(`observe[${i}].stage is not a stage`);
    if (!isText(o.id) || !isText(o.label)) problems.push(`observe[${i}] needs an id and a label`);
  }

  const stepIds = new Set(template.steps.map(st => st.id));
  for (const [i, x] of (s.extras ?? []).entries()) {
    checkStepParts(x, `extras[${i}]`, problems);
    if (!stepIds.has(x.after)) problems.push(`extras[${i}].after "${x.after}" is not a template step`);
  }
  const all = new Set([...stepIds, ...(s.extras ?? []).map(x => x.id)]);
  if (all.size !== stepIds.size + (s.extras ?? []).length) problems.push("an extra step reuses another step's id");
  for (const [id, o] of Object.entries(s.overrides ?? {})) {
    const step = template.steps.find(st => st.id === id);
    if (!step) { problems.push(`overrides.${id} is not a template step`); continue; }
    for (const pid of Object.keys(o.prompts ?? {})) {
      if (!(step.student.prompts ?? []).some(p => p.id === pid)) problems.push(`overrides.${id}.prompts.${pid} is not a prompt of that step`);
    }
  }

  for (const [i, e] of s.expect.entries()) {
    const where = `expect[${i}]`;
    if (!all.has(e.step)) problems.push(`${where}.step "${e.step}" is not a step`);
    if (!isText(e.text)) problems.push(`${where}.text should be text`);
    if (!Array.isArray(e.checks) || !e.checks.length) { problems.push(`${where}.checks should list at least one check`); continue; }
    for (const [j, ch] of e.checks.entries()) {
      const at = `${where}.checks[${j}]`;
      if (!CHECK_TYPES.includes(ch.type)) { problems.push(`${at}.type "${ch.type}" should be one of ${CHECK_TYPES.join(', ')}`); continue; }
      const runs = ch.type === 'higher' || ch.type === 'lower' ? [ch.a, ch.b] : [ch.run];
      for (const r of runs) if (!RUN_NAMES.includes(r)) problems.push(`${at} names a run "${r}", which should be one of ${RUN_NAMES.join(', ')}`);
      if (['metric', 'higher', 'lower'].includes(ch.type) && !METRIC_NAMES.includes(ch.metric)) problems.push(`${at}.metric "${ch.metric}" should be one of ${METRIC_NAMES.join(', ')}`);
    }
  }
  if (problems.length) throw new ValidationError(label, problems);
  return s;
}

// Reads the index, the template and every script it lists.
export async function loadScripts({ world, fetchImpl = fetch }) {
  const index = await loadJSON('data/scripts/index.json', { label: 'scripts/index.json', schema: { template: 'string', scripts: 'array' }, fetchImpl });
  const template = checkTemplate(await loadJSON(`data/scripts/${index.template}`, { label: `scripts/${index.template}`, schema: schemas.scriptTemplate, fetchImpl }), `scripts/${index.template}`);
  const scripts = {};
  for (const file of index.scripts) {
    const label = `scripts/${file}`;
    const s = await loadJSON(`data/scripts/${file}`, { label, schema: schemas.script, fetchImpl });
    checkScript(s, template, world, label);
    if (scripts[s.personaId]) throw new ValidationError(label, [`persona "${s.personaId}" already has a script`]);
    scripts[s.personaId] = s;
  }
  return { template, scripts };
}
