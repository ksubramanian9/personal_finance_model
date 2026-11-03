import { h, mount } from '../dom.js';
import { formatINR } from '../format.js';
import { outcome } from '../../engine/outcomes.js';
import { decadeSummary } from '../../engine/summary.js';
import { netWorthSeries, cashflowSeries } from '../../engine/explain.js';
import { netWorthChart, cashflowChart } from '../charts.js';
import { moneyToggle, whyPanel, yearTable } from '../whyPanel.js';
import { LEVEL } from '../disclosure.js';

const TONES = ['accent1', 'accent2', 'accent3'];

// A decade card: three plain numbers and a "Why?" button that opens the detail (Level 2).
function decadeCard(card, index, onWhy) {
  const tone = TONES[index % TONES.length];
  const button = h('button', { class: 'why-btn', type: 'button', 'aria-expanded': 'false', text: 'Why?', onClick: onWhy });
  const el = h('article', { class: `decade-card accent-${tone}` },
    h('h3', { text: card.label }),
    h('p', { class: 'ages', text: `age ${card.fromAge} to ${card.toAge}` }),
    h('p', { class: 'big-number', text: formatINR(card.netWorthReal) }),
    h('p', { class: 'big-label', text: 'net worth by the end' }),
    h('p', { class: 'small-line', text: card.retired
      ? (card.incomeReal > 0.5 ? `living on savings and a ${formatINR(card.incomeReal)} pension` : 'no pay: living on savings')
      : `earning ${formatINR(card.incomeReal)} a year by then` }),
    !card.retired && h('p', { class: 'small-line', text: `${formatINR(card.savedReal)} saved along the way` }),
    button);
  return { card, el, button, tone };
}

// "Could you stop working, and did the money last?" in words.
function verdictSentence(o) {
  const stopped = `You stopped at ${o.retirementAge}`;
  if (o.status === 'ranOut') {
    const left = o.deathAge - o.ranOutAge;
    return `No. ${stopped}, but the money ran out at ${o.ranOutAge}, ${left} ${left === 1 ? 'year' : 'years'} before the end of your life at ${o.deathAge}.`;
  }
  if (o.status === 'soldHome') return `Yes, but only by selling your home at ${o.soldHomeAge}. ${stopped}, and your savings alone were not enough to reach the end of your life at ${o.deathAge}.`;
  return `Yes. ${stopped} and the money lasted to the end of your life, at ${o.deathAge}.`;
}

function coverLine(o) {
  if (!Number.isFinite(o.coverYears)) return 'Your pension paid for your living costs on its own.';
  if (o.coverYears > 99) return 'Your savings could have paid your living costs for more than a lifetime.';
  const years = Math.round(o.coverYears);
  return `When you stopped, your savings could pay your living costs (after any pension) for about ${years} ${years === 1 ? 'year' : 'years'}. You needed ${o.retiredYears}.`;
}

function wellbeingLine(w) {
  if (w.signal === 'burntOut') return `How it felt: burnout caught up with you ${w.burnouts} times. ${w.hardYears} of your ${w.workingYears} working years were all-in.`;
  if (w.signal === 'stretched') return `How it felt: stretched. ${w.hardYears} of your ${w.workingYears} working years were all-in${w.burnouts === 1 ? ', and you hit burnout once' : ''}.`;
  return w.hardYears > 0
    ? `How it felt: a sustainable pace. Just ${w.hardYears} of your ${w.workingYears} working years were all-in, and no burnout.`
    : 'How it felt: a sustainable pace, with no burnout.';
}

function verdictCard(o) {
  const notes = [];
  if (o.resilience.borrowedYears > 1) notes.push(`You borrowed to cover bills in ${o.resilience.borrowedYears} of your working years.`);
  if (o.resilience.soldHome && o.status !== 'soldHome') notes.push('At some point you had to sell your home to cope.');
  return h('section', { class: `card verdict verdict-${o.status}` },
    h('h2', { text: 'Could you stop working, and did the money last?' }),
    h('p', { class: 'verdict-line', text: verdictSentence(o) }),
    h('p', { text: coverLine(o) }),
    h('div', { class: 'stats' },
      stat('savings when you stopped', formatINR(o.spendableAtRetirementReal)),
      o.pensionReal > 0 && stat('pension a year', formatINR(o.pensionReal)),
      stat('your life ended at', String(o.deathAge)),
      stat('left at the end', formatINR(o.netWorthAtEndReal))),
    h('p', { class: 'hint', text: wellbeingLine(o.wellbeing) }),
    h('p', { class: 'hint', text: o.resilience.steady ? 'A steady ride: you rarely had to borrow, and never had to sell your home.' : 'A shaky ride in places.' }),
    notes.map(t => h('p', { class: 'hint', text: t })),
    h('p', { class: 'hint', text: "Savings count cash and investments, including provident funds once you stop working. The home you live in is not counted as spendable. All amounts are in today's rupees." }));
}

function stat(label, value) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-value', text: value }),
    h('span', { class: 'stat-label', text: label }));
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

// The end of a run.
// ctx: { persona, state, session, stages, decisions, params, eventDefs, disclosure, onSameLuck, onNewLuck, onBack }
export function renderLifeSummary(root, ctx) {
  const { persona, state, session, stages, decisions, params, eventDefs, disclosure } = ctx;
  const history = state.history;
  const regimes = params.macro.regimes;
  const cards = decadeSummary(state);
  const last = cards[cards.length - 1];
  const result = outcome(state);
  const atRetirement = history.find(y => y.age === state.retirementAge - 1);

  let selected = null; // the decade whose year-by-year story is open, if any
  const yearsOf = (c) => history.filter(y => y.age >= c.fromAge && y.age < c.toAge);

  // ---- Level 2: charts, then the open decade's story ----
  const region = h('section', { class: 'why-region', id: 'why', 'aria-label': 'Why it went this way' });
  const whyButton = h('button', { class: 'btn secondary', type: 'button' });

  const decadeEls = cards.map((c, i) => decadeCard(c, i, () => {
    selected = c;
    disclosure.open(LEVEL.why);
    paint();
    region.scrollIntoView?.({ block: 'nearest' });
  }));

  function paint() {
    const open = disclosure.isOpen(LEVEL.why);
    region.hidden = !open;
    whyButton.textContent = open ? 'Hide the why' : 'Why did it go this way?';
    whyButton.setAttribute('aria-expanded', String(open));
    for (const d of decadeEls) {
      const expanded = open && selected === d.card;
      d.button.setAttribute('aria-expanded', String(expanded));
      d.el.className = `decade-card accent-${d.tone}${expanded ? ' open' : ''}`;
    }
    if (!open) return mount(region);

    const real = disclosure.real;
    const years = selected ? yearsOf(selected) : null;
    mount(region,
      h('h2', { text: 'Why it went this way' }),
      moneyToggle(disclosure, paint),
      netWorthChart(netWorthSeries(history, params.instruments, { real }), { instruments: params.instruments, real, zoomHint: true }),
      cashflowChart(cashflowSeries(history, { real }), { regimes, eventDefs, real }),
      years
        ? [
          netWorthChart(netWorthSeries(years, params.instruments, { real }), { instruments: params.instruments, real, title: `${selected.label}: what you owned` }),
          whyPanel({ years, real, regimes, title: `${selected.label}, in detail` }),
          yearTable(years, { real, regimes, eventDefs }),
        ]
        : h('p', { class: 'hint', text: 'Tap "Why?" on a decade card for its story, year by year.' }));
  }
  whyButton.addEventListener('click', () => {
    if (disclosure.isOpen(LEVEL.why)) { disclosure.close(); selected = null; } else disclosure.open(LEVEL.why);
    paint();
  });

  mount(root,
    h('section', { class: 'hero compact' },
      h('h1', { text: `${persona.emoji} ${persona.name}` }),
      h('p', { text: `Age ${persona.profile.startAge} to ${state.age}. Here's the whole story.` })),
    verdictCard(result),
    h('div', { class: 'decade-grid' }, decadeEls.map(d => d.el)),
    h('section', { class: 'card' },
      h('p', { class: 'headline' },
        `At ${state.retirementAge} you had about `,
        h('strong', { text: formatINR((atRetirement ?? history[history.length - 1]).netWorthReal) }),
        ' in today\'s money.'),
      h('p', { class: 'hint', text: "All amounts are in today's rupees, so they're comparable across the decades." }),
      h('div', { class: 'actions inline' },
        whyButton,
        h('button', { class: 'btn', type: 'button', text: 'Same luck, different choices', onClick: ctx.onSameLuck }),
        h('button', { class: 'btn secondary', type: 'button', text: 'New luck', onClick: ctx.onNewLuck }),
        h('button', { class: 'btn secondary', type: 'button', text: 'Pick someone else', onClick: ctx.onBack }))),
    region,
    h('section', { class: 'card picks-recap' },
      h('h2', { text: 'Your choices' }),
      h('ul', {}, choiceRecap(state, stages, decisions))),
    h('details', { class: 'advanced' },
      h('summary', { text: 'Advanced' }),
      h('p', {},
        'Seed: ', h('code', { text: String(session.seed) }), ' · ',
        h('a', { href: `?seed=${encodeURIComponent(session.seed)}`, text: 'replay link' }),
        ' (same seed and same choices give the same life)')));

  paint();
}
