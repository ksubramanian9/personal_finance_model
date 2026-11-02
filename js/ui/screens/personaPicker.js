import { h, mount } from '../dom.js';
import { formatINR, formatINRPerMonth } from '../format.js';

const RETIREMENT_AGES = [55, 60, 65];
const DEFAULT_RETIREMENT_AGE = 60;

function personaCard(p, selected, onPick) {
  return h('button', {
    type: 'button',
    class: `persona-card accent-${p.accent}${selected ? ' selected' : ''}`,
    'aria-pressed': String(selected),
    onClick: () => onPick(p.id),
  },
    h('span', { class: 'persona-emoji', 'aria-hidden': 'true', text: p.emoji }),
    h('span', { class: 'persona-name', text: p.name }),
    h('span', { class: 'persona-tagline', text: p.tagline }));
}

function stat(label, value) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-value', text: value }),
    h('span', { class: 'stat-label', text: label }));
}

function startingLine(p) {
  const support = p.obligations.parentsSupportMonthly + p.obligations.siblingSupportMonthly;
  return h('section', { class: `card starting-line accent-${p.accent}` },
    h('h2', { text: `Meet ${p.name.split(',')[0]}` }),
    h('p', { text: p.story }),
    h('p', { class: 'where', text: `${p.profile.job} · ${p.profile.city} · age ${p.profile.startAge}` }),
    h('div', { class: 'stats' },
      stat('earns a year', formatINR(p.money.startingSalary)),
      stat('saved so far', formatINR(p.money.startingSavings)),
      stat('owes', p.money.startingDebt ? formatINR(p.money.startingDebt) : 'nothing'),
      stat('sends home', support ? formatINRPerMonth(support) : 'nothing yet')));
}

function retirementChoice(selectedAge, onChange) {
  return h('fieldset', { class: 'choice-row' },
    h('legend', { text: 'When would you like to stop working?' }),
    RETIREMENT_AGES.map(age =>
      h('label', { class: 'chip' },
        h('input', {
          type: 'radio', name: 'retirement', value: String(age),
          checked: age === selectedAge, onChange: () => onChange(age),
        }),
        h('span', { text: `at ${age}` }))));
}

// Renders the picker into `root`. `session` is mutated: { personaId, retirementAge }.
export function renderPersonaPicker(root, personas, session, onContinue) {
  if (!session.retirementAge) session.retirementAge = DEFAULT_RETIREMENT_AGE;
  const redraw = () => renderPersonaPicker(root, personas, session, onContinue);
  const chosen = personas.find(p => p.id === session.personaId);

  mount(root,
    h('section', { class: 'hero compact' },
      h('h1', { text: 'Who are you playing?' }),
      h('p', { text: 'Pick a starting point. Where you end up is up to your choices, and a bit of luck.' })),
    h('div', { class: 'persona-grid', role: 'group', 'aria-label': 'Personas' },
      personas.map(p => personaCard(p, p.id === session.personaId, id => {
        session.personaId = id;
        redraw();
      }))),
    chosen && startingLine(chosen),
    chosen && retirementChoice(session.retirementAge, age => { session.retirementAge = age; }),
    chosen && h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => onContinue(chosen, session), text: 'Begin this life' })));
}
