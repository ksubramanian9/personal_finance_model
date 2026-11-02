import { test, assert, assertEqual, assertThrows } from './harness.js';
import { createState, netWorth } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { nextStage, stageEnd, currentOption, applyPicks, playStage } from '../engine/stages.js';
import { stageSummary, decadeSummary } from '../engine/summary.js';
import { loadStages, checkStages } from '../data/stages.js';
import { loadParams } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const aarav = personas.find(p => p.id === 'metro-it');
const meera = personas.find(p => p.id === 'govt-psu');
const data = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const { decisions, stages } = data;

const fresh = (persona = aarav, seed = 4271, retirementAge = 60) =>
  createState(persona, params, { seed, retirementAge });
const balanced = { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', retire: 'at60' };

// Plays a whole life stage by stage with the same picks every time.
function playLife(state, picks) {
  let s = state;
  for (let stage = nextStage(stages, s); stage; stage = nextStage(stages, s)) {
    s = playStage(s, params, stage, decisions, picks);
  }
  return s;
}

// ---- stages.json ----

test('stages.json loads and validates', () => {
  assert(stages.length >= 4, 'expected at least 4 stages');
  assertEqual(stages.at(-1).toAge, null);
});

test('every stage decision exists, and every decision is used', () => {
  const used = new Set(stages.flatMap(s => s.decisions.map(d => d.id)));
  for (const id of used) assert(decisions[id], `unknown decision ${id}`);
  for (const id of Object.keys(decisions)) assert(used.has(id), `decision ${id} is never asked`);
});

test('the default option of each decision matches a fresh state', () => {
  const s = fresh();
  assertEqual(currentOption(decisions.savings, s)?.id, 'balanced');
  assertEqual(currentOption(decisions.growth, s)?.id, 'none');
  assertEqual(currentOption(decisions.retire, s)?.id, 'at60');
});

test('checkStages names the problem: unknown decision, gap, bad effect, bad range', async () => {
  const bad = structuredClone(data);
  bad.stages[1].fromAge = 35;
  bad.stages[0].decisions.push({ id: 'ghost' });
  bad.decisions.savings.options[0].effects.savingsRate = 4;
  bad.decisions.growth.options[0].effects.luck = 1;
  try { checkStages(bad, 'stages.json'); assert(false, 'should have thrown'); }
  catch (err) {
    const all = err.problems.join('\n');
    assert(all.includes('unknown decision "ghost"'), all);
    assert(all.includes('should start at age 32'), all);
    assert(all.includes('savingsRate" should be a number from 0 to 1'), all);
    assert(all.includes('effects.luck" is not a known effect'), all);
  }
});

test('checkStages: last stage must run until retirement, options must set the same keys', () => {
  const bad = structuredClone(data);
  bad.stages.at(-1).toAge = 70;
  bad.decisions.savings.options[1].effects = { learningPct: 0.1 };
  try { checkStages(bad, 'stages.json'); assert(false, 'should have thrown'); }
  catch (err) {
    const all = err.problems.join('\n');
    assert(all.includes('last stage should end with toAge: null'), all);
    assert(all.includes('should all set the same effects'), all);
  }
});

// ---- stage navigation ----

test('nextStage: starts in the stage that contains the start age', () => {
  assertEqual(nextStage(stages, fresh(aarav)).id, 'early');
  assertEqual(nextStage(stages, fresh(meera)).id, 'early');
});

test('nextStage: walks the stages in order and then returns null', () => {
  let s = fresh();
  const seen = [];
  for (let st = nextStage(stages, s); st; st = nextStage(stages, s)) {
    seen.push(st.id);
    s = playStage(s, params, st, decisions, balanced);
  }
  assertEqual(seen, ['early', 'family', 'peak', 'pre']);
  assertEqual(nextStage(stages, s), null);
});

test('stageEnd: capped by retirement age; open-ended stage ends at retirement', () => {
  const s = fresh(aarav, 1, 55);
  assertEqual(stageEnd(stages[0], s), 32);
  assertEqual(stageEnd(stages.at(-1), s), 55);
});

test('a stage that already passed is skipped for a persona who starts later', () => {
  const late = { ...aarav, profile: { ...aarav.profile, startAge: 45 } };
  assertEqual(nextStage(stages, fresh(late)).id, 'peak');
});

// ---- playing a stage ----

test('playStage: runs exactly to the end of the stage', () => {
  const s = playStage(fresh(), params, stages[0], decisions, balanced);
  assertEqual(s.age, 32);
  assertEqual(s.history.length, 10);
});

test('playStage: Meera\'s first stage is shorter because she starts at 24', () => {
  const s = playStage(fresh(meera), params, stages[0], decisions, balanced);
  assertEqual(s.history.length, 8);
});

test('playStage and applyPicks do not mutate their input', () => {
  const s0 = fresh();
  const snap = JSON.stringify(s0);
  playStage(s0, params, stages[0], decisions, balanced);
  applyPicks(s0, stages[0], decisions, balanced);
  assertEqual(JSON.stringify(s0), snap);
});

test('picks are recorded in state.choices, by stage', () => {
  const s = playStage(fresh(), params, stages[0], decisions, { ...balanced, savings: 'frugal', growth: 'light' });
  assertEqual(s.choices.early, { savings: 'frugal', invest: 'mixed', emergency: 'none', health: 'none', growth: 'light' });
});

test('a missing or unknown pick is refused', async () => {
  await assertThrows(() => playStage(fresh(), params, stages[0], decisions, { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none' }), 'No valid pick for "growth"');
  await assertThrows(() => playStage(fresh(), params, stages[0], decisions, { ...balanced, savings: 'yolo' }), 'No valid pick for "savings"');
});

test('picks stay in force into later stages until changed', () => {
  let s = playStage(fresh(), params, stages[0], decisions, { ...balanced, savings: 'frugal', growth: 'serious' });
  assertEqual(s.savingsRate, 0.9);
  s = tickYear(s, params);
  assertEqual(s.history.at(-1).learning > 0, true);
});

// ---- what the choices do ----

test('same seed, different savings style: saving harder ends richer', () => {
  const end = (savings) => playLife(fresh(), { ...balanced, savings }).history.at(-1).netWorth;
  assert(end('frugal') > end('balanced'), 'frugal vs balanced');
  assert(end('balanced') > end('enjoy'), 'balanced vs enjoy');
});

test('investing in yourself costs money now and raises pay later', () => {
  const none = playStage(fresh(), params, stages[0], decisions, { ...balanced, growth: 'none' });
  const serious = playStage(fresh(), params, stages[0], decisions, { ...balanced, growth: 'serious' });
  assertEqual(none.history[0].learning, 0);
  assert(serious.history[0].learning > 0, 'serious should spend on learning');
  assertEqual(serious.history[0].income, none.history[0].income, 'year-1 pay is the same');
  assert(serious.history.at(-1).income > none.history.at(-1).income, 'pay should diverge upward');
  assert(serious.salary > none.salary * 1.1, 'a decade of serious learning should add well over 10% to pay');
});

test('learning cost shows up in expenses, so every year still balances', () => {
  const s = playLife(fresh(), { ...balanced, growth: 'serious' });
  for (const y of s.history) {
    const explained = y.netWorthStart + y.income + y.extraIncome - y.expenses - y.consumed
      + y.investGain + y.cashInterest - y.debtInterest;
    assert(Math.abs(explained - y.netWorth) < 1e-6, `age ${y.age}`);
  }
});

test('retirement age can be changed in the last stage, and the run follows it', () => {
  let s = fresh(aarav, 4271, 60);
  for (const st of stages.slice(0, 3)) s = playStage(s, params, st, decisions, balanced);
  s = playStage(s, params, stages[3], decisions, { ...balanced, retire: 'at65' });
  assertEqual(s.retirementAge, 65);
  assertEqual(s.age, 65);
  assertEqual(nextStage(stages, s), null);
});

test('retirement age earlier than the player\'s current age is refused', async () => {
  const old = runUntil(fresh(aarav, 1, 65), params, 58);
  await assertThrows(() => applyPicks(old, stages[3], decisions, { ...balanced, retire: 'at55' }), 'Cannot retire at 55');
});

test('playing stage by stage with fixed picks equals one straight run with the same effects', () => {
  const staged = playLife(fresh(), balanced);
  const straight = runUntil(fresh(), params);
  assertEqual(staged.history.at(-1).netWorth, straight.history.at(-1).netWorth);
});

test('a staged life is reproducible and reloadable mid-way', () => {
  const picks = { ...balanced, savings: 'frugal', growth: 'light' };
  const a = playLife(fresh(), picks);
  const b = playLife(fresh(), picks);
  assertEqual(a, b);
  const mid = playStage(fresh(), params, stages[0], decisions, picks);
  assertEqual(playLife(JSON.parse(JSON.stringify(mid)), picks), a);
});

// ---- summaries ----

test('stageSummary: covers just the stage, in today\'s rupees', () => {
  const s0 = fresh();
  const s1 = playStage(s0, params, stages[0], decisions, balanced);
  const sum = stageSummary(s1.history, 0);
  assertEqual(sum.fromAge, 22);
  assertEqual(sum.toAge, 32);
  assertEqual(sum.years, 10);
  assert(Math.abs(sum.netWorthStartReal - netWorth(s0)) < 1e-6, 'start net worth');
  assertEqual(sum.netWorthEndReal, s1.history.at(-1).netWorthReal);
  const s2 = playStage(s1, params, stages[1], decisions, balanced);
  const sum2 = stageSummary(s2.history, s1.history.length);
  assertEqual(sum2.fromAge, 32);
  assert(Math.abs(sum2.netWorthStartReal - sum.netWorthEndReal) < 1e-6, 'stage 2 starts where stage 1 ended');
});

test('stageSummary: no years played gives null', () => {
  assertEqual(stageSummary([], 0), null);
});

test('decadeSummary still lines up after a staged life', () => {
  const cards = decadeSummary(playLife(fresh(), balanced));
  assertEqual(cards.map(c => c.label), ['Your 20s', 'Your 30s', 'Your 40s', 'Your 50s']);
});
