import { loadJSON, applyTheme } from '../data/loader.js';
import { loadPersonas } from '../data/personas.js';
import { schemas } from '../data/validate.js';
import { h } from './dom.js';
import { renderPersonaPicker } from './screens/personaPicker.js';

const app = document.getElementById('app');
const session = { personaId: null, retirementAge: 60 };

function showError(err) {
  app.replaceChildren(
    h('section', { class: 'card error' },
      h('h2', { text: 'Oops, something is off' }),
      h('pre', { text: err.message })));
}

function renderLanding(personas) {
  app.replaceChildren(
    h('section', { class: 'hero' },
      h('div', { class: 'blobs', 'aria-hidden': 'true', text: '💰 📈 🏠 🎲' }),
      h('h1', {},
        'Live a ', h('span', { class: 'pop-1', text: 'lifetime' }),
        ' of ', h('span', { class: 'pop-2', text: 'money' }), ' choices'),
      h('p', { text: 'Pick a person, make the big calls, and watch how your choices and a bit of luck add up over the decades. No spreadsheets, just a story.' }),
      h('button', {
        class: 'btn', type: 'button', text: "Let's start!",
        onClick: () => renderPersonaPicker(app, personas, session, renderBegun),
      })));
}

// Placeholder until increment 2 brings the engine and increment 3 the stages.
function renderBegun(persona, sess) {
  app.replaceChildren(
    h('section', { class: 'card' },
      h('h2', { text: `${persona.emoji} ${persona.name}` }),
      h('p', { text: `Retiring at ${sess.retirementAge}. The first life stage arrives in a later step.` }),
      h('button', {
        class: 'btn', type: 'button', text: 'Back',
        onClick: () => renderPersonaPicker(app, state.personas, session, renderBegun),
      })));
}

const state = { personas: [] };

async function boot() {
  try {
    const theme = await loadJSON('data/theme.json', { schema: schemas.theme, label: 'theme.json' });
    applyTheme(theme, document.documentElement);
    if (theme.fonts.googleFontsUrl) {
      document.head.append(h('link', { rel: 'stylesheet', href: theme.fonts.googleFontsUrl }));
    }
    state.personas = await loadPersonas();
    renderLanding(state.personas);
  } catch (err) {
    showError(err);
  }
}

boot();
