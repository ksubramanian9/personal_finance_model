import { formatINR } from './format.js';
import { fillTemplate } from './eventText.js';

// What a card says, in today's rupees. `card` comes from the engine (nominal), `priceIndex` from the state.
export function describeCard(def, card, priceIndex) {
  const k = 1 / priceIndex;
  return fillTemplate(def.story, { pct: String(card.pct ?? ''), value: formatINR((card.value ?? 0) * k) });
}

// The extra facts shown under each answer, so the player knows what is at stake.
export function answerFacts(card, priceIndex) {
  const k = 1 / priceIndex;
  if (card.id === 'crash') return { follow: [`Your shares are worth ${formatINR(card.value * k)}.`], resist: [] };
  if (card.id === 'festival') return { follow: [`About ${formatINR(card.spend * k)}.`], resist: [] };
  if (card.id === 'tip') return { follow: [`You would put in ${formatINR(card.stake * k)}.`], resist: [] };
  return { follow: [], resist: [] };
}

// One answered card, as a line in the stage result.
export function describeAnswer(def, a) {
  const emoji = def.emoji;
  const f = a.choice === 'follow';
  let text;
  if (a.id === 'crash') text = f ? `You sold your shares for ${formatINR(a.value)} during the crash and moved the money to fixed deposits.` : 'You held your shares through the crash.';
  else if (a.id === 'raise') text = f ? `You upgraded your life after the raise: everyday costs went up by ${a.pct}% for good.` : 'You turned down the upgrade and kept your lifestyle.';
  else if (a.id === 'festival') text = f ? `You splurged ${formatINR(a.spend)} on the festival.` : 'You kept the festival simple.';
  else text = !f ? 'You passed on the hot tip.' : a.win ? `The tip paid off: you put in ${formatINR(a.stake)} and got ${formatINR(a.payout)} back.` : `The tip fizzled: you lost the ${formatINR(a.stake)} you put in.`;
  return { emoji, title: def.title, text };
}
