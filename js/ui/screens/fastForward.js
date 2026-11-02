import { h } from '../dom.js';
import { formatINR } from '../format.js';
import { createState } from '../../engine/state.js';
import { runUntil } from '../../engine/tick.js';
import { decadeSummary } from '../../engine/summary.js';

const TONES = ['accent1', 'accent2', 'accent3'];

function decadeCard(card, index) {
  return h('article', { class: `decade-card accent-${TONES[index % TONES.length]}` },
    h('h3', { text: card.label }),
    h('p', { class: 'ages', text: `age ${card.fromAge} to ${card.toAge}` }),
    h('p', { class: 'big-number', text: formatINR(card.netWorthReal) }),
    h('p', { class: 'big-label', text: 'net worth by the end' }),
    h('p', { class: 'small-line', text: `earning ${formatINR(card.incomeReal)} a year by then` }),
    h('p', { class: 'small-line', text: `${formatINR(card.savedReal)} saved along the way` }));
}

// Plays the whole life in one go. Becomes the per-stage loop in increment 3.
export function renderFastForward(root, persona, params, session, { onReroll, onBack }) {
  const start = createState(persona, params, { seed: session.seed, retirementAge: session.retirementAge });
  const end = runUntil(start, params);
  const cards = decadeSummary(end);
  const last = cards[cards.length - 1];

  root.replaceChildren(
    h('section', { class: 'hero compact' },
      h('h1', { text: `${persona.emoji} ${persona.name}` }),
      h('p', { text: `Age ${persona.profile.startAge} to ${session.retirementAge}, if life just keeps going the way it is. No big decisions yet, and no surprises.` })),
    h('div', { class: 'decade-grid' }, cards.map(decadeCard)),
    h('section', { class: 'card' },
      h('p', { class: 'headline' },
        `At ${session.retirementAge} you'd have about `,
        h('strong', { text: formatINR(last.netWorthReal) }),
        ' in today\'s money.'),
      h('p', { class: 'hint', text: "All amounts are in today's rupees, so they're comparable across the decades." }),
      h('div', { class: 'actions inline' },
        h('button', { class: 'btn', type: 'button', text: 'Roll the dice again', onClick: onReroll }),
        h('button', { class: 'btn secondary', type: 'button', text: 'Pick someone else', onClick: onBack }))),
    h('details', { class: 'advanced' },
      h('summary', { text: 'Advanced' }),
      h('p', {},
        'Seed: ', h('code', { text: String(session.seed) }), ' · ',
        h('a', { href: `?seed=${encodeURIComponent(session.seed)}`, text: 'replay link' }),
        ' (same seed and choices give the same life)')));
}
