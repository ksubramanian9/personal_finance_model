import { loadJSON } from '../data/loader.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { loadParams } from '../data/params.js';
import { loadScripts } from '../data/scripts.js';
import { schemas } from '../data/validate.js';
import { h, mount } from './dom.js';
import { browserStore } from './storage.js';
import { createThemeController, createThemeToggle } from './theme.js';
import { buildScript } from './scriptText.js';
import { renderScript, renderScriptIndex } from './scriptPage.js';

const app = document.getElementById('app');

// The student script page: scripts.html lists the scripts, scripts.html?persona=metro-it opens one, and
// adding &facilitator=1 starts it with the facilitator notes showing.
async function boot() {
  try {
    const theme = await loadJSON('data/theme.json', { schema: schemas.theme, label: 'theme.json' });
    const store = browserStore();
    const themeControl = createThemeController({
      theme, root: document.documentElement, store,
      media: globalThis.matchMedia?.('(prefers-color-scheme: dark)'),
      initial: new URLSearchParams(location.search).get('theme'),
    });
    themeControl.apply();
    document.body.append(createThemeToggle(themeControl));
    if (theme.fonts.googleFontsUrl) document.head.append(h('link', { rel: 'stylesheet', href: theme.fonts.googleFontsUrl }));

    const params = await loadParams();
    const personas = await loadPersonas();
    const { stages, decisions } = await loadStages({ instrumentIds: params.instruments.map(i => i.id) });
    const { template, scripts } = await loadScripts({ world: { personas, stages, decisions } });

    const query = new URLSearchParams(location.search);
    const persona = personas.find(p => p.id === query.get('persona') && scripts[p.id]);
    if (!persona) {
      renderScriptIndex(app, personas.filter(p => scripts[p.id]));
      return;
    }
    document.title = `${persona.firstName}'s script: Money Life`;
    renderScript(app, buildScript({ template, script: scripts[persona.id], persona, stages, decisions }), {
      store, facilitator: query.get('facilitator') === '1',
    });
  } catch (err) {
    mount(app, h('section', { class: 'card error' }, h('h2', { text: 'Oops, something is off' }), h('pre', { text: err.message })));
  }
}

boot();
