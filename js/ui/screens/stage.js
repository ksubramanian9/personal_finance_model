import { h, mount } from '../dom.js';
import { formatINR } from '../format.js';
import { currentOption, stageEnd } from '../../engine/stages.js';

// Row of stage dots across the top: done / current / still to come.
export function journeyBar(stages, currentId, doneIds) {
  return h('ol', { class: 'journey', 'aria-label': 'Life stages' },
    stages.map(s => {
      const status = doneIds.includes(s.id) ? 'done' : s.id === currentId ? 'current' : 'todo';
      return h('li', { class: `journey-step ${status}`, 'aria-current': status === 'current' ? 'step' : false },
        h('span', { class: 'journey-emoji', 'aria-hidden': 'true', text: status === 'done' ? '✅' : s.emoji }),
        h('span', { class: 'journey-name', text: s.name }));
    }));
}

// Where this stage will end once the player's picks are applied (a pick can move the retirement age).
function projectedEnd(stage, state, decisions, picks) {
  let retirementAge = state.retirementAge;
  for (const ref of stage.decisions) {
    const o = decisions[ref.id].options.find(x => x.id === picks[ref.id]);
    if (o && 'retirementAge' in o.effects) retirementAge = o.effects.retirementAge;
  }
  return stageEnd(stage, { retirementAge });
}

function optionCard(option, selected, isCurrent, onPick) {
  return h('button', {
    type: 'button',
    class: `option-card${selected ? ' selected' : ''}`,
    'aria-pressed': String(selected),
    onClick: onPick,
  },
    h('span', { class: 'option-emoji', 'aria-hidden': 'true', text: option.emoji }),
    h('span', { class: 'option-title', text: option.title }),
    h('span', { class: 'option-blurb', text: option.blurb }),
    isCurrent && h('span', { class: 'option-tag', text: 'what you do now' }));
}

// One decision at a time. ctx is mutated: ctx.step and ctx.picks.
// ctx: { persona, stages, stage, decisions, state, picks, step, isFirst, doneIds, onPlay }
export function renderStageDecisions(root, ctx) {
  const { stage, decisions, state, picks, stages } = ctx;
  ctx.step ??= 0;
  const redraw = () => renderStageDecisions(root, ctx);

  const ref = stage.decisions[ctx.step];
  const decision = decisions[ref.id];
  const current = currentOption(decision, state);
  if (!picks[ref.id] && current) picks[ref.id] = current.id;

  const isLastStep = ctx.step === stage.decisions.length - 1;
  const from = state.age;
  const to = projectedEnd(stage, state, decisions, picks);
  const yearsLabel = `age ${from} to ${to}`;

  mount(root,
    journeyBar(stages, stage.id, ctx.doneIds),
    h('section', { class: 'hero compact' },
      h('p', { class: 'eyebrow', text: `${stage.emoji} ${stage.name} · ${yearsLabel}` }),
      ctx.step === 0 && h('p', { class: 'stage-intro', text: stage.intro }),
      h('h1', { text: ref.question || decision.question }),
      h('p', { class: 'step-count', text: `Question ${ctx.step + 1} of ${stage.decisions.length}` })),
    h('div', { class: 'option-grid', role: 'group', 'aria-label': decision.title },
      decision.options.map(o => optionCard(
        o,
        picks[ref.id] === o.id,
        !ctx.isFirst && current?.id === o.id,
        () => { picks[ref.id] = o.id; redraw(); }))),
    h('div', { class: 'actions inline' },
      ctx.step > 0 && h('button', {
        class: 'btn secondary', type: 'button', text: 'Back',
        onClick: () => { ctx.step -= 1; redraw(); },
      }),
      h('button', {
        class: 'btn', type: 'button', disabled: !picks[ref.id],
        text: isLastStep ? `Play these ${to - from} years` : 'Next',
        onClick: () => { if (isLastStep) ctx.onPlay(); else { ctx.step += 1; redraw(); } },
      })));
}

// One chip per year: the economy's mood, with the age so it works without colour.
function economyStrip(economy, regimes) {
  const counts = {};
  for (const e of economy) counts[e.regime] = (counts[e.regime] ?? 0) + 1;
  const summary = Object.entries(regimes)
    .filter(([id]) => counts[id])
    .map(([id, r]) => `${counts[id]} ${r.name.toLowerCase()}`)
    .join(', ');
  return h('section', { class: 'economy' },
    h('h2', { text: 'How the economy was' }),
    h('ol', { class: 'weather', 'aria-label': 'Economy by year' },
      economy.map(e => {
        const r = regimes[e.regime];
        return h('li', { class: `weather-chip w-${e.regime}`, title: `${e.year}: ${r.name}. ${r.blurb}` },
          h('span', { class: 'weather-emoji', 'aria-hidden': 'true', text: r.emoji }),
          h('span', { class: 'weather-age', text: `age ${e.age}` }),
          h('span', { class: 'weather-name', text: r.name }));
      })),
    h('p', { class: 'hint', text: `${summary}.` }));
}

function stat(label, value) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-value', text: value }),
    h('span', { class: 'stat-label', text: label }));
}

// Shown after a stage has played. ctx: { stages, stage, summary, doneIds, picked, nextStage, onNext }
export function renderStageResult(root, ctx) {
  const { stage, summary: s, stages } = ctx;
  const grew = s.netWorthEndReal - s.netWorthStartReal;
  const headline = grew >= 0
    ? `Net worth grew from ${formatINR(s.netWorthStartReal)} to ${formatINR(s.netWorthEndReal)}.`
    : `Net worth fell from ${formatINR(s.netWorthStartReal)} to ${formatINR(s.netWorthEndReal)}.`;

  mount(root,
    journeyBar(stages, ctx.nextStage?.id ?? null, ctx.doneIds),
    h('section', { class: 'hero compact' },
      h('p', { class: 'eyebrow', text: `${stage.emoji} ${stage.name} · age ${s.fromAge} to ${s.toAge}` }),
      h('h1', { text: 'Here\'s how it went' }),
      h('p', { class: 'headline', text: headline }),
      h('p', { class: 'hint', text: "All amounts are in today's rupees." })),
    economyStrip(s.economy, ctx.regimes),
    h('div', { class: 'stats' },
      stat('earning a year by the end', formatINR(s.incomeEndReal)),
      stat('saved over these years', formatINR(s.savedReal)),
      s.learningReal > 0 && stat('spent on getting better', formatINR(s.learningReal))),
    ctx.picked.length > 0 && h('section', { class: 'card picks-recap' },
      h('h2', { text: 'Your choices' }),
      h('ul', {}, ctx.picked.map(p => h('li', { text: `${p.emoji} ${p.title}` })))),
    h('div', { class: 'actions' },
      h('button', {
        class: 'btn', type: 'button', onClick: ctx.onNext,
        text: ctx.nextStage ? `On to ${ctx.nextStage.name} ${ctx.nextStage.emoji}` : 'See the whole story',
      })));
}
