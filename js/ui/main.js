import { loadJSON, applyTheme } from '../data/loader.js';
import { loadPersonas } from '../data/personas.js';
import { schemas } from '../data/validate.js';
import { h } from './dom.js';
import { renderPersonaPicker } from './screens/personaPicker.js';
import { renderFastForward } from './screens/fastForward.js';

const app = document.getElementById('app');
const session = { personaId: null, retirementAge: 60, seed: null };
const data = { personas: [], params: null };

const randomSeed = () => Math.floor(Math.random() * 9000) + 1000;

function showError(err) {
  app.replaceChildren(
    h('section', { class: 'card error' },
      h('h2', { text: 'Oops, something is off' }),
      h('pre', { text: err.message })));
}

function showPicker() {
  renderPersonaPicker(app, data.personas, session, showFastForward);
}

function showFastForward(persona) {
  renderFastForward(app, persona, data.params, session, {
    onReroll: () => { session.seed = randomSeed(); showFastForward(persona); },
    onBack: showPicker,
  });
}

function showLanding() {
  app.replaceChildren(
    h('section', { class: 'hero' },
      h('div', { class: 'blobs', 'aria-hidden': 'true', text: '💰 📈 🏠 🎲' }),
      h('h1', {},
        'Live a ', h('span', { class: 'pop-1', text: 'lifetime' }),
        ' of ', h('span', { class: 'pop-2', text: 'money' }), ' choices'),
      h('p', { text: 'Pick a person, make the big calls, and watch how your choices and a bit of luck add up over the decades. No spreadsheets, just a story.' }),
      h('button', { class: 'btn', type: 'button', text: "Let's start!", onClick: showPicker })));
}

async function boot() {
  try {
    const theme = await loadJSON('data/theme.json', { schema: schemas.theme, label: 'theme.json' });
    applyTheme(theme, document.documentElement);
    if (theme.fonts.googleFontsUrl) {
      document.head.append(h('link', { rel: 'stylesheet', href: theme.fonts.googleFontsUrl }));
    }
    data.params = await loadJSON('data/engine.json', { schema: schemas.engine, label: 'engine.json' });
    data.personas = await loadPersonas();
    // ?seed=4271 replays a run; otherwise every run gets fresh luck.
    session.seed = new URLSearchParams(location.search).get('seed') ?? randomSeed();
    showLanding();
  } catch (err) {
    showError(err);
  }
}

boot();
