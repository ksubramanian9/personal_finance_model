import { h, mount } from '../dom.js';
import { journeyBar } from './stage.js';
import { gutLine } from '../../engine/nudges.js';
import { describeCard, answerFacts } from '../nudgeText.js';

function answerCard(answer, facts, onPick, gutPull) {
  return h('button', { type: 'button', class: `option-card nudge-${gutPull ? 'follow' : 'resist'}`, onClick: onPick },
    h('span', { class: 'option-title', text: answer.title }),
    h('span', { class: 'option-blurb', text: answer.blurb }),
    facts.map(t => h('span', { class: 'option-extra', text: t })),
    gutPull && h('span', { class: 'option-tag', text: 'your gut says this' }));
}

// A pause in the middle of a stage. ctx: { persona, stages, stage, card, def, state, doneIds, onChoose }
export function renderNudge(root, ctx) {
  const { stage, card, def, state } = ctx;
  const facts = answerFacts(card, state.priceIndex);
  mount(root,
    journeyBar(ctx.stages, stage.id, ctx.doneIds),
    h('section', { class: 'hero compact nudge' },
      h('p', { class: 'eyebrow', text: `${stage.emoji} ${stage.name} \u00B7 age ${card.age}` }),
      h('h1', { text: `${def.emoji} ${def.title}` }),
      h('p', { class: 'nudge-story', text: describeCard(def, card, state.priceIndex) }),
      h('p', { class: 'nudge-gut', text: `${ctx.persona.firstName}'s gut: ${gutLine(def, state.biases)}` })),
    h('div', { class: 'option-grid', role: 'group', 'aria-label': def.title },
      answerCard(def.follow, facts.follow, () => ctx.onChoose('follow'), true),
      answerCard(def.resist, facts.resist, () => ctx.onChoose('resist'), false)));
}
