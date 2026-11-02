import { loadJSON, applyTheme } from '../data/loader.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { schemas } from '../data/validate.js';
import { h, mount } from './dom.js';
import { createFlow } from './flow.js';

const app = document.getElementById('app');

function showError(err) {
  mount(app,
    h('section', { class: 'card error' },
      h('h2', { text: 'Oops, something is off' }),
      h('pre', { text: err.message })));
}

async function boot() {
  try {
    const theme = await loadJSON('data/theme.json', { schema: schemas.theme, label: 'theme.json' });
    applyTheme(theme, document.documentElement);
    if (theme.fonts.googleFontsUrl) {
      document.head.append(h('link', { rel: 'stylesheet', href: theme.fonts.googleFontsUrl }));
    }
    const params = await loadJSON('data/engine.json', { schema: schemas.engine, label: 'engine.json' });
    const personas = await loadPersonas();
    const { stages, decisions } = await loadStages();

    const session = { personaId: null, retirementAge: 60, seed: null };
    const flow = createFlow(app, { personas, params, stages, decisions }, session);
    // ?seed=4271 replays a run; otherwise every run gets fresh luck.
    session.seed = new URLSearchParams(location.search).get('seed') ?? flow.randomSeed();
    flow.showLanding();
  } catch (err) {
    showError(err);
  }
}

boot();
