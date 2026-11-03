import { loadJSON, applyTheme } from '../data/loader.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { loadParams } from '../data/params.js';
import { schemas } from '../data/validate.js';
import { h, mount } from './dom.js';
import { createFlow } from './flow.js';
import { browserStore } from './storage.js';
import { createAbout } from './about.js';

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
    // The colour scheme follows the device (and its changes); ?theme=dark or ?theme=light forces one.
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const forced = new URLSearchParams(location.search).get('theme');
    const scheme = () => (forced === 'dark' || forced === 'light' ? forced : media?.matches ? 'dark' : 'light');
    applyTheme(theme, document.documentElement, scheme());
    media?.addEventListener?.('change', () => applyTheme(theme, document.documentElement, scheme()));
    if (theme.fonts.googleFontsUrl) {
      document.head.append(h('link', { rel: 'stylesheet', href: theme.fonts.googleFontsUrl }));
    }
    const params = await loadParams();
    const personas = await loadPersonas();
    // The About panel, opened from the footer.
    const about = createAbout(await loadJSON('data/about.json', { schema: schemas.about, label: 'about.json' }));
    document.body.append(about.element);
    document.getElementById('about-link')?.addEventListener('click', about.open);
    const stagesData = await loadStages({ instrumentIds: params.instruments.map(i => i.id) });
    const { stages, decisions } = stagesData;
    // Files the Level 3 data browser lists besides the params (each carries its own provenance).
    const sources = { 'stages.json': stagesData, ...Object.fromEntries(personas.map(p => [`personas/${p.id}.json`, p])) };

    const store = browserStore();
    const saved = store.loadSettings();
    const session = {
      personaId: personas.some(p => p.id === saved.personaId) ? saved.personaId : null, // the last persona played
      retirementAge: [55, 60, 65].includes(saved.retirementAge) ? saved.retirementAge : 60,
      seed: null,
    };
    const flow = createFlow(app, { personas, params, stages, decisions, sources }, session, store);
    // ?seed=4271 replays a run; otherwise every run gets fresh luck.
    session.seed = new URLSearchParams(location.search).get('seed') ?? flow.randomSeed();
    flow.showLanding();
  } catch (err) {
    showError(err);
  }
}

boot();
