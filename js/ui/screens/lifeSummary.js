import { h, mount } from '../dom.js';
import { formatINR } from '../format.js';
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

// What the player picked in each stage, as readable lines.
function choiceRecap(state, stages, decisions) {
  return stages.filter(s => state.choices[s.id]).map(s => {
    const picks = state.choices[s.id];
    const titles = s.decisions.map(ref => {
      const o = decisions[ref.id].options.find(x => x.id === picks[ref.id]);
      return o ? `${o.emoji} ${o.title}` : null;
    }).filter(Boolean);
    return h('li', {},
      h('strong', { text: `${s.emoji} ${s.name}: ` }),
      titles.join(' · '));
  });
}

// The end of a run. ctx: { persona, state, session, stages, decisions, onSameLuck, onNewLuck, onBack }
export function renderLifeSummary(root, ctx) {
  const { persona, state, session, stages, decisions } = ctx;
  const cards = decadeSummary(state);
  const last = cards[cards.length - 1];

  mount(root,
    h('section', { class: 'hero compact' },
      h('h1', { text: `${persona.emoji} ${persona.name}` }),
      h('p', { text: `Age ${persona.profile.startAge} to ${state.retirementAge}. Here's the whole story.` })),
    h('div', { class: 'decade-grid' }, cards.map(decadeCard)),
    h('section', { class: 'card' },
      h('p', { class: 'headline' },
        `At ${state.retirementAge} you have about `,
        h('strong', { text: formatINR(last.netWorthReal) }),
        ' in today\'s money.'),
      h('p', { class: 'hint', text: "All amounts are in today's rupees, so they're comparable across the decades." }),
      h('div', { class: 'actions inline' },
        h('button', { class: 'btn', type: 'button', text: 'Same luck, different choices', onClick: ctx.onSameLuck }),
        h('button', { class: 'btn secondary', type: 'button', text: 'New luck', onClick: ctx.onNewLuck }),
        h('button', { class: 'btn secondary', type: 'button', text: 'Pick someone else', onClick: ctx.onBack }))),
    h('section', { class: 'card picks-recap' },
      h('h2', { text: 'Your choices' }),
      h('ul', {}, choiceRecap(state, stages, decisions))),
    h('details', { class: 'advanced' },
      h('summary', { text: 'Advanced' }),
      h('p', {},
        'Seed: ', h('code', { text: String(session.seed) }), ' · ',
        h('a', { href: `?seed=${encodeURIComponent(session.seed)}`, text: 'replay link' }),
        ' (same seed and same choices give the same life)')));
}
