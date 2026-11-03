// Instinct cards: moments when a person is tempted to act on a feeling (panic in a crash, a lifestyle
// upgrade after a raise, festival spending, a hot tip). The player follows or resists.
//
// Cards are worked out at the end of each year by tickYear (rollNudges, using its own random stream so
// no other luck moves) and recorded in the year's history. A stage that is played interactively stops
// at a card (playUntilCard), the player answers (answerNudge), and what they chose is carried out in
// the next year. A stage played without answering (playStage) simply never shows the cards, which is
// the same as resisting every one.

import { nextFloat } from './rng.js';
import { liquidAssets } from './housing.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// How strong this persona's pull is for a card, 0 to 1. A trait can be used directly or, for the hot tip,
// as its opposite (a very cautious person feels little pull).
export function strength(card, biases) {
  const b = card.bias;
  return typeof b === 'string' ? (biases[b] ?? 0) : 1 - (biases[b.inverse] ?? 0);
}

// "How loudly the gut speaks": one of the card's three lines, calm to loud.
export function gutLine(card, biases) {
  const s = strength(card, biases);
  return card.gut[s < 1 / 3 ? 0 : s < 2 / 3 ? 1 : 2];
}

// Mutates state.rngNudges: always four draws a year, whatever happens, so the stream never shifts.
// `info` says what the year did: { equityReturn, equityValue, payJump }. Returns this year's candidate cards.
export function rollNudges(s, params, info) {
  const u = [0, 1, 2, 3].map(() => nextFloat(s.rngNudges));
  if (s.retired) return [];
  const { cards, minStakeReal } = params.nudges;
  const fires = (card, i) => clamp(card.firing.baseProb + card.firing.biasWeight * strength(card, s.biases), 0, 1) > u[i];
  const out = [];

  const t = cards.crash.trigger;
  if (info.equityReturn <= t.equityReturnBelow && info.equityValue >= t.minEquityReal * s.priceIndex) {
    out.push({ id: 'crash', pct: Math.round(-info.equityReturn * 100), value: info.equityValue });
  }
  if (info.payJump > 0 && fires(cards.raise, 0)) out.push({ id: 'raise', pct: Math.round(cards.raise.effect.upgradePct * 100) });
  if (fires(cards.festival, 1)) out.push({ id: 'festival', spend: s.salary * cards.festival.effect.spendPctOfPay });
  if (fires(cards.tip, 2)) {
    const tip = cards.tip.effect;
    const stake = liquidAssets(s, params) * tip.stakeShare;
    if (stake >= minStakeReal * s.priceIndex) {
      const win = u[3] < tip.winProb;
      out.push({ id: 'tip', stake, win, payout: win ? stake * tip.payoffMultiple : 0 });
    }
  }
  return out.map(c => ({ ...c, age: s.age + 1, year: s.year + 1 }));
}

// The card to show now, or null. A crash always shows; the others stop once the stage's limit is reached.
export function pickCard(state, params, stage, candidates) {
  const crash = candidates.find(c => c.id === 'crash');
  if (crash) return crash;
  if ((state.nudgeCounts[stage.id] ?? 0) >= params.nudges.perStage) return null;
  return candidates[0] ?? null;
}

// Carries the player's answer into the state (a new state is returned). 'follow' sets something in motion
// that the next tickYear carries out; 'resist' only records the answer.
export function answerNudge(state, params, stage, card, choice) {
  const s = structuredClone(state);
  const fx = params.nudges.cards;
  const entry = { id: card.id, stageId: stage.id, age: card.age, year: card.year, choice, priceIndex: s.priceIndex };
  if (choice === 'follow') {
    if (card.id === 'crash') { s.pending.panicSell = true; entry.value = card.value; }
    else if (card.id === 'raise') {
      const up = 1 + fx.raise.effect.upgradePct;
      s.livingCost *= up;
      s.creepIndex *= up; // so the extra shows up as lifestyle drift
      entry.pct = card.pct;
    } else if (card.id === 'festival') { s.pending.spend += card.spend; entry.spend = card.spend; }
    else if (card.id === 'tip') {
      s.pending.spend += card.stake;
      s.pending.income += card.payout;
      entry.stake = card.stake; entry.payout = card.payout; entry.win = card.win;
    }
  }
  s.nudgeLog.push(entry);
  if (card.id !== 'crash') s.nudgeCounts[stage.id] = (s.nudgeCounts[stage.id] ?? 0) + 1;
  return s;
}

// Plays years until a card should be shown (returns { state, card }) or the stage ends (card: null).
// A card that would appear in the last year of a stage is not shown.
export function playUntilCard(state, params, stage, endAge, tick) {
  let s = state;
  while (s.age < endAge) {
    s = tick(s, params);
    if (s.age >= endAge) break;
    const card = pickCard(s, params, stage, s.history[s.history.length - 1].nudges);
    if (card) return { state: s, card };
  }
  return { state: s, card: null };
}
