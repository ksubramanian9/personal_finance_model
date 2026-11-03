// Real-browser smoke test: plays whole lives through the real screens with the real DOM and the real data
// files, and reports what worked. Open smoke.html through liveserver. It uses its own in-memory store, so
// it never touches a life you have saved in this browser.
import { createFlow } from '../ui/flow.js';
import { createStore, browserStore } from '../ui/storage.js';
import { loadParams } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { loadJSON } from '../data/loader.js';
import { schemas } from '../data/validate.js';
import { createAbout } from '../ui/about.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail: ok ? '' : detail });
const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};

async function run() {
  const params = await loadParams();
  const personas = await loadPersonas();
  const stagesData = await loadStages({ instrumentIds: params.instruments.map(i => i.id) });
  const { stages, decisions } = stagesData;
  check('data files load and validate', params && personas.length >= 2 && stages.length >= 4);

  const host = document.getElementById('under-test');
  const text = () => host.innerText;
  const buttons = () => [...host.querySelectorAll('button')];
  const press = (re) => {
    const b = buttons().find(x => re.test(x.textContent) && !x.disabled);
    if (!b) throw new Error(`no button ${re} on screen: ${text().slice(0, 160)}`);
    b.click();
  };
  const has = (re) => buttons().some(x => re.test(x.textContent));
  const strays = /undefined|NaN|\[object|Infinity/;

  // Plays one stage's questions, then its cards: follows the gut on every other card.
  let cards = 0;
  const playStage = () => {
    for (let guard = 0; guard < 20 && !has(/^Play these/); guard++) press(/^Next$/);
    press(/^Play these/);
    for (let guard = 0; guard < 20; guard++) {
      const card = host.querySelector('.nudge-follow');
      if (!card) break;
      cards += 1;
      (cards % 2 ? card : host.querySelector('.nudge-resist')).click();
    }
  };

  async function life(personaIndex, label, store) {
    const session = { personaId: null, retirementAge: 60, seed: 4271 };
    const flow = createFlow(host, { personas, params, stages, decisions, sources: { 'stages.json': stagesData } }, session, store);
    flow.showLanding();
    check(`${label}: the landing page shows`, has(/Let's start|Start a new life/));
    press(/Let's start|Start a new life/);
    check(`${label}: focus moves to the new screen's heading`, document.activeElement?.tagName === 'H1', document.activeElement?.tagName);
    host.querySelectorAll('.persona-card')[personaIndex].click();
    press(/Begin this life/);
    for (let i = 0; i < stages.length; i++) {
      playStage();
      check(`${label}: stage ${i + 1} result has no stray words`, !strays.test(text()), text().slice(0, 200));
      press(/^(On to|See the whole story)/);
    }
    return { flow, session };
  }

  // 1. A whole life for each persona, with an in-memory store.
  for (const [i, label] of [[0, 'IT persona'], [1, 'government persona']]) {
    await life(i, label, createStore(memory()));
    check(`${label}: the end screen answers the question`, /Could you stop working, and did the money last\?/.test(text()));
    check(`${label}: the verdict says how it ended`, /(Yes|No)[.,]/.test(text()) && /your life ended at/.test(text()));
    check(`${label}: decade cards run past retirement`, host.querySelectorAll('.decade-card').length >= 5, `${host.querySelectorAll('.decade-card').length} cards`);
    check(`${label}: no stray words on the end screen`, !strays.test(text()), text().slice(0, 200));
  }
  check('instinct cards appeared in real browser play', cards > 0, `${cards} cards`);

  // 2. Level 2: charts, bridge and table in the real DOM, in both kinds of rupee.
  host.querySelector('.why-btn').click();
  check('Level 2 opens charts', host.querySelectorAll('svg.chart-svg').length >= 3, `${host.querySelectorAll('svg.chart-svg').length} charts`);
  check('Level 2 has a year-by-year table', host.querySelectorAll('table.year-table tbody tr').length >= 5);
  check('Level 2 shows the bridge', host.querySelectorAll('.bridge-row').length >= 5);
  const nominal = [...host.querySelectorAll('input[type=radio]')].find(r => r.value === 'nominal');
  nominal.click();
  check('the rupee toggle works in a real browser', /Rupees of each year/.test(text()) && host.querySelectorAll('svg.chart-svg').length >= 3);
  check('no stray words at Level 2', !strays.test(text()), text().slice(0, 200));
  const chart = host.querySelector('.chart-frame');
  chart.focus();
  chart.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  check('a chart answers the keyboard', /Age \d+/.test(host.querySelector('.chart-readout, .readout')?.textContent ?? ''));

  // 3. Resume: a life closed mid-way is offered back and finishes.
  const storage = memory();
  const first = await (async () => {
    const session = { personaId: null, retirementAge: 60, seed: 1234 };
    const flow = createFlow(host, { personas, params, stages, decisions, sources: {} }, session, createStore(storage));
    flow.showLanding(); press(/Let's start/);
    host.querySelectorAll('.persona-card')[0].click(); press(/Begin this life/);
    playStage(); // one stage played, its result on screen
    return flow;
  })();
  const second = createFlow(host, { personas, params, stages, decisions, sources: {} }, { personaId: null, retirementAge: 60, seed: 9 }, createStore(storage));
  second.showLanding();
  check('a half-played life is offered back', /Pick up where you left off/.test(text()));
  press(/Continue/);
  check('and continuing shows the same stage result', /Here's how it went/.test(text()));
  void first;

  // 4. The Advanced panel in the real DOM.
  const adv = createFlow(host, { personas, params, stages, decisions, sources: { 'stages.json': stagesData } }, { personaId: null, retirementAge: 60, seed: 5 }, createStore(memory()));
  adv.showLanding(); press(/Let's start/);
  check('the Advanced panel and data browser exist', host.querySelector('details.hood') && host.querySelectorAll('details.source').length >= 20, `${host.querySelectorAll('details.source').length} sources`);
  check('the page has one main landmark and a heading', document.querySelectorAll('main').length === 1 && host.querySelector('h1'));

  // 5. The About panel opens as a real dialog and closes again.
  const about = createAbout(await loadJSON('data/about.json', { schema: schemas.about, label: 'about.json' }));
  document.body.append(about.element);
  about.open();
  check('the About panel opens as a dialog', about.element.open === true && /not financial, tax or investment advice/.test(about.element.textContent));
  about.close();
  check('and closes again', about.element.open === false);
  about.element.remove();

  // 6. Storage in this browser.
  check('this browser allows saving a life', browserStore().available, 'localStorage is blocked or missing; the game still works but remembers nothing');
}

const render = () => {
  const failed = results.filter(r => !r.ok);
  document.title = `smoke: ${results.length - failed.length}/${results.length}`;
  const out = document.getElementById('report');
  out.append(Object.assign(document.createElement('h2'), { textContent: failed.length ? `${failed.length} of ${results.length} failed` : `All ${results.length} checks passed` }));
  const ul = document.createElement('ul');
  for (const r of results) {
    const li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`;
    ul.append(li);
  }
  out.append(ul);
};

run().catch(err => { check(`the run itself: ${err.message}`, false, err.stack?.split('\n')[1] ?? ''); }).finally(render);
