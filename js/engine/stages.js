import { runUntil } from './tick.js';

// Effect keys a choice may set on the state. Anything else is ignored by design
// (stages.js in data/ rejects unknown keys when the file loads).
const SETTABLE = ['savingsRate', 'learningPct', 'growthBoost', 'retirementAge'];

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
    Object.entries(o.effects).every(([k, v]) => sameNumber(state[k], v))) ?? null;
}

// `picks` maps decisionId -> optionId for every decision the stage asks.
// Returns a new state; the input is untouched.
export function applyPicks(state, stage, decisions, picks) {
  const s = structuredClone(state);
  for (const ref of stage.decisions) {
    const decision = decisions[ref.id];
    const option = decision.options.find(o => o.id === picks[ref.id]);
    if (!option) throw new Error(`No valid pick for "${ref.id}" in stage "${stage.id}"`);
    for (const [k, v] of Object.entries(option.effects)) {
      if (!SETTABLE.includes(k)) continue;
      if (k === 'retirementAge' && v <= s.age) {
        throw new Error(`Cannot retire at ${v}: already ${s.age}`);
      }
      s[k] = v;
    }
  }
  s.choices[stage.id] = { ...picks };
  return s;
}

// Applies the picks, then plays the years of this stage.
export function playStage(state, params, stage, decisions, picks) {
  const s = applyPicks(state, stage, decisions, picks);
  return runUntil(s, params, stageEnd(stage, s));
}
