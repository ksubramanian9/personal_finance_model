import { h, mount } from '../dom.js';
import { formatINR, formatINRPerMonth } from '../format.js';
import { START_FIELDS, clampStart } from '../../data/personas.js';

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

// One starting number with a minus and a plus button. A change is kept per person in session.start and
// redrawn in place, so keyboard focus stays on the button that was pressed.
const STEP_WORDS = {
  salary: (amount, word) => `Earn ${amount} a year ${word}`,
  savings: (amount, word) => `Start with ${amount} ${word} saved`,
  debt: (amount, word) => `Owe ${amount} ${word}`,
  support: (amount, word) => `Send home ${amount} a month ${word}`,
};
const SHOW = {
  salary: formatINR, savings: formatINR, debt: formatINR, support: formatINRPerMonth,
};

function adjustStat(p, session, key) {
  const field = START_FIELDS[key];
  const base = field.read(p);
  const current = () => session.start[p.id]?.[key] ?? base;
  const value = h('span', { class: 'stat-value', 'aria-live': 'polite' });
  const note = h('span', { class: 'stat-note' });
  const step = (sign, symbol, word) => h('button', {
    type: 'button', class: 'step-btn', text: symbol,
    'aria-label': STEP_WORDS[key](formatINR(field.step), word),
    onClick: () => change(sign * field.step),
  });
  const less = step(-1, '−', 'less');
  const more = step(1, '+', 'more');
  const paint = () => {
    const now = current();
    value.textContent = SHOW[key](now);
    note.textContent = now === base ? `Change it by ${formatINR(field.step)} at a time` : `Usually ${SHOW[key](base)}`;
    less.disabled = now <= field.min;
    more.disabled = now >= field.max;
  };
  const change = (delta) => {
    const next = clampStart(key, current() + delta);
    const mine = { ...session.start[p.id] };
    if (next === base) delete mine[key]; else mine[key] = next;
    session.start[p.id] = mine;
    paint();
  };
  paint();
  return h('div', { class: `stat adjust-stat start-${key}` },
    value,
    h('span', { class: 'stat-label', text: field.label }),
    h('span', { class: 'stepper' }, less, more),
    note);
}

function startingLine(p, session) {
  return h('section', { class: `card starting-line accent-${p.accent}` },
    h('h2', { text: `Meet ${p.firstName}` }),
    h('p', { text: p.story }),
    h('p', { class: 'where', text: `${p.profile.job} · ${p.profile.city} · age ${p.profile.startAge}` }),
    h('div', { class: 'stats' }, Object.keys(START_FIELDS).map(key => adjustStat(p, session, key))));
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

// Page one: who to play. `session` is mutated: { personaId }. `onNext` opens the set-up page.
export function renderPersonaPicker(root, personas, session, onNext) {
  const redraw = () => renderPersonaPicker(root, personas, session, onNext);
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
    chosen && h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => onNext(chosen), text: `Next: set up ${chosen.firstName}'s start` })));
}

// Page two: the starting numbers, when to stop working, and Begin. `session` is mutated:
// { retirementAge, start }. `advanced` makes the Advanced panel.
export function renderPersonaSetup(root, persona, session, onBegin, onBack, advanced = null) {
  if (!session.retirementAge) session.retirementAge = DEFAULT_RETIREMENT_AGE;
  if (!session.start) session.start = {}; // changed starting numbers, by persona id

  mount(root,
    h('section', { class: 'hero compact' },
      h('h1', { text: `Set up ${persona.firstName}'s start` }),
      h('p', { text: 'Change the numbers if you like. The usual ones are a fair place to begin.' })),
    startingLine(persona, session),
    retirementChoice(session.retirementAge, age => { session.retirementAge = age; }),
    h('div', { class: 'actions inline' },
      h('button', { class: 'btn secondary', type: 'button', text: 'Pick someone else', onClick: onBack }),
      h('button', { class: 'btn', type: 'button', onClick: () => onBegin(persona, session), text: 'Begin this life' })),
    advanced && advanced());
}
