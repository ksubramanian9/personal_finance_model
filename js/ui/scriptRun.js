import { createState } from '../engine/state.js';
import { nextStage, beginStage, continueStage, playRetirement } from '../engine/stages.js';
import { answerNudge } from '../engine/nudges.js';
import { outcome } from '../engine/outcomes.js';

// Plays a whole life from a student script's choices, the way a student would at the screen:
// every stage's questions are answered from `picks` ({ stageId: { decisionId: optionId } }), and every
// instinct card is answered by `cards` ('resist', 'follow', or { cardId: 'resist' | 'follow' }).
// A question the script has no pick for is an error, so a script cannot quietly drift from the game.
export function playScriptLife({ persona, params, stages, decisions, seed, retirementAge, picks, cards = 'resist' }) {
  const answer = (card) => (typeof cards === 'string' ? cards : cards[card.id] ?? 'resist');
  let state = createState(persona, params, { seed, retirementAge });
  for (let stage = nextStage(stages, state); stage; stage = nextStage(stages, state)) {
    const begun = beginStage(state, params, stage, decisions, picks[stage.id] ?? {});
    state = begun.state;
    for (;;) {
      const r = continueStage(state, params, stage, begun.endAge);
      state = r.state;
      if (!r.card) break;
      state = answerNudge(state, params, stage, r.card, answer(r.card));
    }
  }
  if (state.age < state.deathAge) state = playRetirement(state, params);
  return { state, outcome: outcome(state) };
}

// The script's picks with its one change applied: the decision is set to `change.to` in every stage
// that asks it (or only in `change.stages`), because a choice such as the emergency fund carries on
// until the next stage's question changes it.
export function changedPicks(picks, change) {
  const out = structuredClone(picks);
  for (const [stageId, stagePicks] of Object.entries(out)) {
    if (change.decision in stagePicks && (!change.stages || change.stages.includes(stageId))) stagePicks[change.decision] = change.to;
  }
  return out;
}

// The lives a script walks through: the first plan, the same luck with one choice changed, and the changed
// plan on a fresh seed. `freshFirst` is the first plan on the fresh seed too, for the optional extra step.
export function playScriptRuns(ctx, script) {
  const base = { ...ctx, retirementAge: script.retirementAge, cards: script.cards ?? 'resist' };
  return {
    baseline: playScriptLife({ ...base, seed: script.seed, picks: script.picks }),
    changed: playScriptLife({ ...base, seed: script.seed, picks: changedPicks(script.picks, script.change) }),
    fresh: playScriptLife({ ...base, seed: script.freshSeed, picks: changedPicks(script.picks, script.change) }),
    freshFirst: playScriptLife({ ...base, seed: script.freshSeed, picks: script.picks }),
  };
}

// ---- the facts a script claims ----
// A script's "expect" lines each carry a check. A check names a run and says what is true of it, so a test
// can replay the script and fail when a retune makes a claim false.

const yearAt = (run, age) => run.state.history.find(y => y.age === age);
const inRange = (y, c) => y.age >= (c.fromAge ?? 0) && y.age <= (c.toAge ?? 200);
const METRICS = {
  spendableAtRetirementReal: (r) => r.outcome.spendableAtRetirementReal,
  netWorthAtEndReal: (r) => r.outcome.netWorthAtEndReal,
  borrowedYears: (r) => r.outcome.resilience.borrowedYears,
  deathAge: (r) => r.state.deathAge,
};

// Returns true or false for one check. `runs` is the result of playScriptRuns.
export function holds(check, runs) {
  const run = runs[check.run];
  switch (check.type) {
    case 'event': return run.state.history.some(y => inRange(y, check) && y.events.some(e => e.id === check.event));
    case 'verdict': return run.outcome.status === check.is;
    case 'borrowed': return run.state.history.some(y => inRange(y, check) && y.borrowed > 1) === (check.is !== false);
    case 'homeBought': return run.state.history.some(y => y.homeBought) === (check.is !== false);
    case 'netWorth': {
      const y = yearAt(run, check.atAge);
      return Boolean(y) && y.netWorthReal >= (check.minReal ?? -Infinity) && y.netWorthReal <= (check.maxReal ?? Infinity);
    }
    case 'metric': {
      const v = METRICS[check.metric](run);
      return v >= (check.min ?? -Infinity) && v <= (check.max ?? Infinity);
    }
    case 'higher': return METRICS[check.metric](runs[check.a]) > METRICS[check.metric](runs[check.b]);
    case 'lower': return METRICS[check.metric](runs[check.a]) < METRICS[check.metric](runs[check.b]);
    case 'regime': return run.state.history.some(y => inRange(y, check) && y.regime === check.regime);
    default: throw new Error(`Unknown check type "${check.type}"`);
  }
}
