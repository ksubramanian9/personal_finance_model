import { runUntil } from './tick.js';
import { homeOffer } from './housing.js';

// Effect keys a choice may set on the state. Anything else is ignored by design
// (data/stages.js rejects unknown keys when the file loads).
// "alloc.<id>" keys live in state.alloc.<id>; the rest are top-level state fields.
const SETTABLE = ['savingsRate', 'learningPct', 'growthBoost', 'retirementAge', 'emergencyMonths', 'healthCover', 'healthPremium', 'buyHome',
  'marryAge', 'weddingReal', 'spousePct', 'childPlan'];
const ALLOC = 'alloc.';

function readEffect(state, key) {
  return key.startsWith(ALLOC) ? state.alloc[key.slice(ALLOC.length)] : state[key];
}

// When a decision is worth asking. A stage's decision can carry "onlyIf": a condition name or a list of
// them, all of which must hold. `picks` is what the player has chosen so far in this stage.
export const CONDITIONS = {
  renting: (s) => !s.home,
  single: (s) => !s.spouse,
  married: (s) => s.spouse !== null,
  childless: (s) => s.children.length === 0 && s.childPlan === 0,
  marriagePlanned: (s, picks) => ['marry', 'marryLater'].some(id => picks[id] && picks[id] !== 'single'),
  marriedOrPlanned: (s, picks) => s.spouse !== null || CONDITIONS.marriagePlanned(s, picks),
};

// The decisions this stage actually asks right now, given the state and the picks made so far.
export function askedDecisions(stage, state, picks = {}) {
  return stage.decisions.filter(ref => [].concat(ref.onlyIf ?? []).every(name => CONDITIONS[name](state, picks)));
}

export function stageEnd(stage, state) {
  return Math.min(stage.toAge ?? Infinity, state.retirementAge);
}

// The stage the player is in (or about to enter), or null once they have retired.
export function nextStage(stages, state) {
  if (state.age >= state.retirementAge) return null;
  return stages.find(s => (s.toAge ?? Infinity) > state.age) ?? null;
}

const sameNumber = (a, b) => Math.abs(a - b) < 1e-9;

// The option whose effects match what the state already does, or null.
export function currentOption(decision, state) {
  return decision.options.find(o =>
    Object.entries(o.effects).every(([k, v]) => sameNumber(readEffect(state, k), v))) ?? null;
}

// `picks` maps decisionId -> optionId for every decision the stage asks.
// Returns a new state; the input is untouched. Pass `params` to also check that a home the player
// wants to buy is affordable.
export function applyPicks(state, stage, decisions, picks, params = null) {
  const s = structuredClone(state);
  const asked = askedDecisions(stage, state, picks);
  for (const ref of asked) {
    const decision = decisions[ref.id];
    const option = decision.options.find(o => o.id === picks[ref.id]);
    if (!option) throw new Error(`No valid pick for "${ref.id}" in stage "${stage.id}"`);
    for (const [k, v] of Object.entries(option.effects)) {
      if (k.startsWith(ALLOC)) { s.alloc[k.slice(ALLOC.length)] = v; continue; }
      if (!SETTABLE.includes(k)) continue;
      if (k === 'retirementAge' && v <= s.age) {
        throw new Error(`Cannot retire at ${v}: already ${s.age}`);
      }
      if (k === 'buyHome' && v === 1 && params && !homeOffer(state, params).affordable) {
        throw new Error('Cannot buy a home yet: not enough cash and savings, or already own one');
      }
      s[k] = v;
    }
  }
  s.choices[stage.id] = Object.fromEntries(asked.map(ref => [ref.id, picks[ref.id]]));
  return s;
}

// Applies the picks, then plays the years of this stage.
export function playStage(state, params, stage, decisions, picks) {
  const s = applyPicks(state, stage, decisions, picks, params);
  return runUntil(s, params, stageEnd(stage, s));
}
