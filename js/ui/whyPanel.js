import { h, mount } from './dom.js';
import { formatINR } from './format.js';
import { LEVEL } from './disclosure.js';
import { bridge, inflationOver, economyCounts, taxStory, yearRows } from '../engine/explain.js';

// The plain-words name of each line in the net-worth bridge, grouped the way the story is told.
export const BRIDGE_GROUPS = [
  { title: 'What came in', lines: [['income', 'Pay, pension and severance'], ['windfalls', 'Windfalls'], ['spouse', "Your partner's pay, after their tax"]] },
  { title: 'What went out', lines: [
    ['living', 'Everyday life and family support'],
    ['drift', 'Lifestyle drift: spending that crept up with your pay'],
    ['children', 'Children: birth, school and college'],
    ['wedding', 'The wedding'],
    ['rent', 'Rent'],
    ['homeUpkeep', 'Home upkeep and property tax'],
    ['homeInterest', 'Interest on the home loan'],
    ['homeBuying', 'Buying costs (stamp duty, registration, fees)'],
    ['homeSelling', 'Selling costs'],
    ['learning', 'Courses and upskilling'],
    ['premiums', 'Health insurance premiums'],
    ['unplanned', 'Surprise costs, after insurance'],
    ['incomeTax', 'Income tax on pay and windfalls'],
    ['investTax', 'Tax on interest and on gains from selling'],
    ['lifestyle', 'Lifestyle spending (your money style)'],
  ] },
  { title: 'What your money did', lines: [
    ['growth', 'Investment growth'],
    ['homeGrowth', "Your home's price change"],
    ['cashInterest', 'Interest on cash'],
    ['loanInterest', 'Interest on loans'],
  ] },
  { title: 'Rising prices', lines: [['inflation', 'Prices rising on what you hold']] },
];

const signed = (amount) => `${amount >= 0 ? '+' : '−'}${formatINR(Math.abs(amount))}`;

let radioGroups = 0;

// "Today's rupees" or "Rupees of each year". A display choice only; the numbers underneath are the same.
export function moneyToggle(disclosure, onChange) {
  const name = `money-mode-${radioGroups++}`;
  const chip = (real, text) => h('label', { class: 'chip' },
    h('input', {
      type: 'radio', name, value: real ? 'real' : 'nominal',
      checked: disclosure.real === real,
      onChange: () => { disclosure.setReal(real); onChange(); },
    }),
    h('span', { text }));
  return h('fieldset', { class: 'choice-row money-toggle' },
    h('legend', { text: 'Show money in' }),
    chip(true, "Today's rupees"),
    chip(false, 'Rupees of each year'));
}

// How the net worth got from the start of these years to the end, line by line, plus the named forces.
export function whyPanel({ years, real, regimes, title }) {
  const b = bridge(years, { real });
  const biggest = Math.max(1, ...Object.values(b.items).map(Math.abs));
  const from = years[0].age;
  const to = years[years.length - 1].age + 1;

  const groups = BRIDGE_GROUPS
    .filter(g => real || g.lines.some(([id]) => id !== 'inflation')) // the inflation group only exists in today's rupees
    .map(g => {
      const rows = g.lines
        .filter(([id]) => Math.abs(b.items[id]) >= 0.5)
        .map(([id, label]) => {
          const amount = b.items[id];
          return h('li', { class: 'bridge-row', 'data-line': id },
            h('span', { class: 'bridge-label', text: label }),
            h('span', { class: 'bridge-track', 'aria-hidden': 'true' },
              h('span', { class: `bridge-bar ${amount >= 0 ? 'up' : 'down'}`, style: `width: ${Math.max(2, (Math.abs(amount) / biggest) * 100).toFixed(1)}%` })),
            h('span', { class: 'bridge-amount', text: signed(amount) }));
        });
      return rows.length ? h('div', { class: 'bridge-group' }, h('h4', { text: g.title }), h('ul', { class: 'bridge-list' }, rows)) : null;
    });

  const infl = inflationOver(years);
  const tax = taxStory(years, { real });
  const counts = economyCounts(years);
  const economy = Object.entries(regimes)
    .filter(([id]) => counts[id])
    .map(([id, r]) => `${counts[id]} ${r.name.toLowerCase()}`)
    .join(', ');

  return h('section', { class: 'why-panel' },
    h('h3', { text: title }),
    h('p', { class: 'bridge-end-points' },
      `Age ${from} to ${to}: from `, h('strong', { text: formatINR(b.start) }),
      ' to ', h('strong', { text: formatINR(b.end) }), '.'),
    groups,
    h('div', { class: 'forces' },
      h('h4', { text: 'Forces at work' }),
      h('ul', {},
        h('li', { text: `Prices rose ${infl.totalPct.toFixed(0)}% over these ${years.length} years, about ${infl.perYearPct.toFixed(1)}% a year. What cost ₹100 at the start cost about ₹${Math.round(infl.hundredThen)} by the end.` }),
        h('li', { text: `The economy: ${economy}.` }),
        h('li', { text: tax.paid > 0.5
          ? `Tax took ${formatINR(tax.paid)} of the ${formatINR(tax.earned)} you earned (${tax.sharePct.toFixed(1)}%). Everything that is yours to spend or save is what is left.`
          : 'No tax was due: pay stayed below the level where tax starts.' }))));
}

// The same facts as the charts, as a table anyone can read or navigate.
export function yearTable(years, { real, regimes, eventDefs }) {
  const rows = yearRows(years, { real });
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'year-table' },
      h('caption', { text: `Year by year, ${real ? "in today's rupees" : 'in the rupees of each year'}` }),
      h('thead', {}, h('tr', {}, ['Age', 'Economy', 'Earned', 'Spent', 'Saved', 'Net worth', 'What happened']
        .map(t => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, rows.map(r => h('tr', {},
        h('th', { scope: 'row', text: String(r.age) }),
        h('td', { text: `${regimes[r.regime].emoji} ${regimes[r.regime].name}` }),
        h('td', { text: formatINR(r.earned) }),
        h('td', { text: formatINR(r.spent) }),
        h('td', { text: formatINR(r.saved) }),
        h('td', { text: formatINR(r.netWorth) }),
        h('td', { text: r.events.length ? r.events.map(id => `${eventDefs[id].emoji} ${eventDefs[id].name}`).join(', ') : '' }))))));
}

// A "Why did it go this way?" button that opens the bridge for a stretch of years. Remembers, through
// `disclosure`, that the player asked, so later stages open it for them.
export function whyToggle({ disclosure, years, regimes, eventDefs, title }) {
  const slot = h('div', { class: 'why-slot' });
  const button = h('button', { class: 'btn secondary small', type: 'button', 'aria-expanded': 'false' });

  function paint() {
    const open = disclosure.isOpen(LEVEL.why);
    button.textContent = open ? 'Hide the why' : 'Why did it go this way?';
    button.setAttribute('aria-expanded', String(open));
    if (!open) return mount(slot);
    mount(slot,
      moneyToggle(disclosure, paint),
      whyPanel({ years, real: disclosure.real, regimes, title }),
      yearTable(years, { real: disclosure.real, regimes, eventDefs }));
  }
  button.addEventListener('click', () => {
    if (disclosure.isOpen(LEVEL.why)) disclosure.close(); else disclosure.open(LEVEL.why);
    paint();
  });
  paint();
  return h('section', { class: 'why-toggle' }, h('div', { class: 'actions inline' }, button), slot);
}
