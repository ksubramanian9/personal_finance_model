import { h, mount } from '../dom.js';
import { formatINR } from '../format.js';
import { currentOption, stageEnd, askedDecisions } from '../../engine/stages.js';
import { homeOffer } from '../../engine/housing.js';
import { describeOffer } from '../housingText.js';
import { describeEvent, describeCoping } from '../eventText.js';
import { whyToggle } from '../whyPanel.js';

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
  for (const ref of askedDecisions(stage, state, picks)) {
    const o = decisions[ref.id].options.find(x => x.id === picks[ref.id]);
    if (o && 'retirementAge' in o.effects) retirementAge = o.effects.retirementAge;
  }
  return stageEnd(stage, { retirementAge });
}

function optionCard(option, selected, isCurrent, onPick, { extras = [], disabled = false } = {}) {
  return h('button', {
    type: 'button',
    class: `option-card${selected ? ' selected' : ''}${disabled ? ' unavailable' : ''}`,
    'aria-pressed': String(selected),
    disabled,
    onClick: onPick,
  },
    h('span', { class: 'option-emoji', 'aria-hidden': 'true', text: option.emoji }),
    h('span', { class: 'option-title', text: option.title }),
    h('span', { class: 'option-blurb', text: option.blurb }),
    extras.map(t => h('span', { class: 'option-extra', text: t })),
    isCurrent && h('span', { class: 'option-tag', text: 'what you do now' }));
}

// One decision at a time. ctx is mutated: ctx.step and ctx.picks.
// ctx: { persona, stages, stage, decisions, state, params, picks, step, isFirst, doneIds, onPlay }
export function renderStageDecisions(root, ctx) {
  const { stage, decisions, state, picks, stages } = ctx;
  ctx.step ??= 0;
  const redraw = () => renderStageDecisions(root, ctx);

  const refs = askedDecisions(stage, state, picks);
  if (ctx.step >= refs.length) ctx.step = refs.length - 1; // a changed answer can shorten the list
  const ref = refs[ctx.step];
  const decision = decisions[ref.id];
  const current = currentOption(decision, state);
  if (!picks[ref.id] && current) picks[ref.id] = current.id;

  const isLastStep = ctx.step === refs.length - 1;
  const from = state.age;
  const to = projectedEnd(stage, state, decisions, picks);
  const offer = ref.id === 'home' ? homeOffer(state, ctx.params) : null;
  const offerText = offer ? describeOffer(offer, state.priceIndex) : null;
  const yearsLabel = `age ${from} to ${to}`;

  mount(root,
    journeyBar(stages, stage.id, ctx.doneIds),
    h('section', { class: 'hero compact' },
      h('p', { class: 'eyebrow', text: `${stage.emoji} ${stage.name} · ${yearsLabel}` }),
      ctx.step === 0 && h('p', { class: 'stage-intro', text: stage.intro }),
      h('h1', { text: ref.question || decision.question }),
      h('p', { class: 'step-count', text: `Question ${ctx.step + 1} of ${refs.length}` })),
    h('div', { class: 'option-grid', role: 'group', 'aria-label': decision.title },
      decision.options.map(o => optionCard(
        o,
        picks[ref.id] === o.id,
        !ctx.isFirst && current?.id === o.id,
        () => { picks[ref.id] = o.id; redraw(); },
        offer ? { extras: o.effects.buyHome ? offerText.buy : [offerText.rent], disabled: o.effects.buyHome === 1 && !offer.affordable } : {}))),
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

// Marriage and births, as cards in the same style as life events.
function familyMoveCards(moves) {
  return moves.map(m => h('li', { class: 'event-card kind-family' },
    h('span', { class: 'event-emoji', 'aria-hidden': 'true', text: m.kind === 'married' ? '\u{1F492}' : '\u{1F476}' }),
    h('div', { class: 'event-body' },
      h('p', { class: 'event-title' },
        h('strong', { text: m.kind === 'married' ? 'You got married' : (m.count > 1 ? 'A second child arrived' : 'A child arrived') }),
        h('span', { class: 'event-age', text: ` \u00B7 age ${m.age}` })),
      h('p', { class: 'event-line', text: m.kind === 'married'
        ? `The wedding cost ${formatINR(m.cost)}. Everyday costs are higher with two of you.`
        : 'Costs start with the birth and rise through school and college.' }))));
}

// Buying or selling a home, as cards in the same style as life events.
function homeMoveCards(moves) {
  return moves.map(m => h('li', { class: 'event-card kind-home' },
    h('span', { class: 'event-emoji', 'aria-hidden': 'true', text: m.kind === 'bought' ? '🏠' : '🔑' }),
    h('div', { class: 'event-body' },
      h('p', { class: 'event-title' },
        h('strong', { text: m.kind === 'bought' ? 'You bought a home' : 'You sold your home' }),
        h('span', { class: 'event-age', text: ` · age ${m.age}` })),
      m.kind === 'bought'
        ? h('p', { class: 'event-line', text: `It cost ${formatINR(m.price)}. You paid ${formatINR(m.paidNow)} up front for the down payment and buying costs, and took a loan of ${formatINR(m.loan)}.` })
        : h('p', { class: 'event-line', text: `Money ran out, so the home went for ${formatINR(m.value)}. Selling costs were ${formatINR(m.sellingCost)}, ${formatINR(m.loanRepaid)} repaid the loan${m.tax > 0.5 ? ` and tax took ${formatINR(m.tax)}` : ''}. You rent again.` }))));
}

// What happened along the way, year by year, and how any shortfall was met.
function eventsSection(eventYears, eventDefs, instruments, homeMoves = [], familyMoves = []) {
  if (!eventYears.length && !homeMoves.length && !familyMoves.length) {
    return h('section', { class: 'events quiet' },
      h('h2', { text: 'What happened' }),
      h('p', { text: 'A quiet stretch. Nothing dramatic came your way.' }));
  }
  return h('section', { class: 'events' },
    h('h2', { text: 'What happened' }),
    h('ul', { class: 'event-list' },
      familyMoveCards(familyMoves),
      homeMoveCards(homeMoves),
      eventYears.flatMap(y => {
        const coping = describeCoping(y.coping, instruments);
        if (!y.events.length) return [h('li', { class: 'event-card kind-home' }, h('div', { class: 'event-body' }, h('p', { class: 'event-line coping', text: coping })))];
        return y.events.map((rec, i) => {
          const def = eventDefs[rec.id];
          const lines = describeEvent(def, rec);
          return h('li', { class: `event-card kind-${def.kind}` },
            h('span', { class: 'event-emoji', 'aria-hidden': 'true', text: def.emoji }),
            h('div', { class: 'event-body' },
              h('p', { class: 'event-title' },
                h('strong', { text: def.name }),
                h('span', { class: 'event-age', text: ` · age ${y.age}` })),
              lines.map(t => h('p', { class: 'event-line', text: t })),
              i === y.events.length - 1 && coping && h('p', { class: 'event-line coping', text: coping })));
        });
      })));
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
    eventsSection(s.eventYears, ctx.eventDefs, ctx.instruments, s.homeMoves, s.familyMoves),
    h('div', { class: 'stats' },
      stat('earning a year by the end, before tax', formatINR(s.incomeEndReal)),
      stat('saved over these years', formatINR(s.savedReal)),
      s.skillBoostPct >= 0.05 && stat('extra pay growth from your skills', `${s.skillBoostPct.toFixed(1)}% a year`),
      s.taxReal > 0 && stat('paid in tax', formatINR(s.taxReal)),
      s.spouseReal > 0 && stat("your partner's pay, after tax", formatINR(s.spouseReal)),
      s.childrenReal > 0 && stat('spent on children', formatINR(s.childrenReal)),
      s.rentReal > 0 && stat('paid in rent', formatINR(s.rentReal)),
      s.homeValueEndReal > 0 && stat('your home is worth', formatINR(s.homeValueEndReal)),
      s.homeValueEndReal > 0 && s.homeLoanEndReal > 0 && stat('still owed on it', formatINR(s.homeLoanEndReal)),
      s.learningReal > 0 && stat('spent on getting better', formatINR(s.learningReal)),
      s.premiumsReal > 0 && stat('paid for health cover', formatINR(s.premiumsReal))),
    whyToggle({ disclosure: ctx.disclosure, years: ctx.years, regimes: ctx.regimes, eventDefs: ctx.eventDefs, title: `Age ${s.fromAge} to ${s.toAge}, in detail` }),
    ctx.picked.length > 0 && h('section', { class: 'card picks-recap' },
      h('h2', { text: 'Your choices' }),
      h('ul', {}, ctx.picked.map(p => h('li', { text: `${p.emoji} ${p.title}` })))),
    h('div', { class: 'actions' },
      h('button', {
        class: 'btn', type: 'button', onClick: ctx.onNext,
        text: ctx.nextStage ? `On to ${ctx.nextStage.name} ${ctx.nextStage.emoji}` : 'See the whole story',
      })));
}
