import { test, assert, assertEqual, assertThrows } from './harness.js';
import { installFakeDom, createRoot, findAll, buttonWithText, hasClass } from './fakeDom.js';
import { loadParams } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { loadScripts, checkScript, checkTemplate } from '../data/scripts.js';
import { buildScript, fillTokens, answersAsText } from '../ui/scriptText.js';
import { playScriptLife, playScriptRuns, changedPicks, holds } from '../ui/scriptRun.js';
import { renderScript, renderScriptIndex } from '../ui/scriptPage.js';
import { createStore } from '../ui/storage.js';
import { getFetch } from './dataFetch.js';

installFakeDom();

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const world = { personas, stages, decisions };
const { template, scripts } = await loadScripts({ world, fetchImpl });
const ctx = (id) => ({ persona: personas.find(p => p.id === id), params, stages, decisions });
const build = (id) => buildScript({ template, script: scripts[id], persona: personas.find(p => p.id === id), stages, decisions });
const text = (root) => root.textContent;
const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};

// ---- loading and checking the data ----

test('the template and every script load, and every script belongs to a persona', () => {
  assertEqual(template.steps.map(s => s.id), ['meet', 'setup', 'choose', 'observe', 'verdict', 'change', 'newluck', 'explain']);
  assert(Object.keys(scripts).length >= 1 && Object.keys(scripts).every(id => personas.some(p => p.id === id)), 'scripts for personas');
});

test('checkScript explains what is wrong, in plain words', async () => {
  const bad = structuredClone(scripts['metro-it']);
  bad.freshSeed = bad.seed;
  bad.retirementAge = 58;
  bad.picks.early.invest = 'wild';
  delete bad.picks.pre;
  bad.keyChoices = bad.keyChoices.slice(0, 2);
  bad.change = { decision: 'savings', to: 'balanced', why: 'x' };
  bad.expect[0].step = 'nowhere';
  bad.expect[1].checks[0] = { type: 'vibes', run: 'baseline' };
  bad.extras[0].after = 'nowhere';
  bad.overrides.nowhere = {};
  let message = '';
  try { checkScript(bad, template, world, 'bad.json'); } catch (e) { message = e.message; }
  for (const part of ['freshSeed', 'retirementAge', 'picks.early.invest', 'picks.pre', 'keyChoices', 'change.to', 'expect[0].step', 'vibes', 'extras[0].after', 'overrides.nowhere']) {
    assert(message.includes(part), `message should mention ${part}: ${message}`);
  }
});

test('checkScript catches a key choice the plan does not answer and a retire pick that disagrees', () => {
  const bad = structuredClone(scripts['metro-it']);
  bad.keyChoices[0].decision = 'children';
  bad.picks.pre.retire = 'at65';
  let message = '';
  try { checkScript(bad, template, world, 'bad.json'); } catch (e) { message = e.message; }
  assert(message.includes('not answered') && message.includes('"retire" pick'), message);
});

test('checkTemplate wants ids, titles and text', () => {
  const bad = structuredClone(template);
  bad.steps[1].id = bad.steps[0].id;
  bad.steps[2].title = '';
  bad.steps[3].generated = 'dice';
  let message = '';
  try { checkTemplate(bad); } catch (e) { message = e.message; }
  assert(message.includes('used twice') && message.includes('title') && message.includes('generated'), message);
});

// ---- building a script ----

test('a built script follows the spine, adds the persona\'s extras and has no stray tokens or words', () => {
  const b = build('metro-it');
  assertEqual(b.steps.map(s => s.id), ['meet', 'setup', 'choose', 'observe', 'layoff', 'verdict', 'change', 'newluck', 'explain']);
  assertEqual(b.steps.filter(s => s.extra).map(s => s.id), ['layoff']);
  const all = JSON.stringify(b);
  assert(!/\{\w+\}|undefined|null|NaN|\[object/.test(all), `stray text: ${all.match(/\{\w+\}|undefined|null|NaN|\[object/)?.[0]}`);
  assertEqual(b.links.start, 'index.html?persona=metro-it&seed=35&retire=60');
  assertEqual(b.links.fresh, 'index.html?persona=metro-it&seed=36&retire=60');
  assert(/Arjun/.test(b.title) && /₹15,000/.test(JSON.stringify(b.steps[2].student.choices)), 'the persona\'s own words and numbers');
});

test('the choose step asks for reasoning on the key choices and lists the plan for the rest', () => {
  const b = build('metro-it');
  const choose = b.steps.find(s => s.id === 'choose');
  assertEqual(choose.student.choices.length, 6);
  assertEqual(choose.student.prompts.length, 6);
  const keyed = new Set(scripts['metro-it'].keyChoices.map(k => k.decision));
  const planned = choose.student.plan.flatMap(s => s.rows.map(r => r.decision));
  const rows = choose.student.plan.flatMap(s => s.rows);
  assert(planned.includes('Marriage') && !choose.student.plan[0].rows.some(r => r.decision === 'Emergency fund'), 'the stage a key choice is made in leaves it out; the rest are listed');
  assert(rows.some(r => r.decision === 'Money style' && r.pick === 'Keep what you chose before'), 'a question already decided is answered by keeping the earlier choice');
  assert(choose.student.choices.every(c => c.options.length >= 2 && c.weigh.length >= 1), 'options and things to weigh');
  assertEqual(choose.facilitator.reference.length, keyed.size);
  assert(choose.facilitator.reference.some(r => r.title === 'Emergency fund' && r.pick === 'Wing it'), 'the facilitator sees the reference picks');
});

test('one generated prompt per stage on the observe step, with the persona\'s own prompts after theirs', () => {
  const observe = build('metro-it').steps.find(s => s.id === 'observe');
  assertEqual(observe.student.prompts.map(p => p.id), ['observe-early', 'obs-early', 'observe-family', 'obs-family', 'observe-peak', 'observe-pre']);
  assert(/age 52 to 60/.test(observe.student.prompts.at(-1).label), 'the last stage ends at the stopping age');
});

test('a persona can reword a facilitator note; the spine stays', () => {
  const b = build('metro-it');
  assert(b.steps.find(s => s.id === 'choose').facilitator.discuss[0].includes('layoff risk'), 'override applied');
  assertEqual(b.steps.find(s => s.id === 'meet').facilitator.discuss, template.steps[0].facilitator.discuss.map(d => d), 'untouched steps are the template\'s');
});

test('an unknown token is an error, not the word "undefined"', () => {
  assertEqual(fillTokens('Hello {name}', { name: 'Arjun' }), 'Hello Arjun');
  let message = '';
  try { fillTokens('Hello {nmae}', { name: 'Arjun' }, 'a test'); } catch (e) { message = e.message; }
  assert(message.includes('{nmae}') && message.includes('a test'), message);
});

test('answers export as plain text, with a note for the unanswered', () => {
  const b = build('metro-it');
  const out = answersAsText(b, { predict: 'It will last.' }, { student: 'Asha' });
  assert(out.startsWith("A walk through Arjun's life\nName: Asha"), out.slice(0, 80));
  assert(out.includes('It will last.') && out.includes('(no answer yet)'), 'answered and unanswered');
  assert(/MAKE THE KEY CHOICES/.test(out) && !/Open the game/.test(out), 'headings for steps with boxes only');
});

// ---- replaying a script ----

test('a script that leaves a question unanswered is an error, so it cannot quietly drift from the game', async () => {
  const s = structuredClone(scripts['metro-it']);
  delete s.picks.family.home;
  await assertThrows(() => playScriptLife({ ...ctx('metro-it'), seed: s.seed, retirementAge: s.retirementAge, picks: s.picks }), 'home');
});

test('the change is applied wherever the decision is asked, and nowhere else', () => {
  const s = scripts['metro-it'];
  const changed = changedPicks(s.picks, s.change);
  assertEqual(Object.values(changed).map(p => p.invest), ['bold', 'bold', 'bold', 'bold'], 'asked in all four stages');
  assertEqual(changed.early.savings, s.picks.early.savings);
  assertEqual(Object.values(s.picks).map(p => p.invest), ['mixed', 'mixed', 'mixed', 'mixed'], 'the original is untouched');
});

test('the same luck gives the same life, and the changed plan differs only because of its change', () => {
  const s = scripts['metro-it'];
  const a = playScriptLife({ ...ctx('metro-it'), seed: s.seed, retirementAge: 60, picks: s.picks });
  const b = playScriptLife({ ...ctx('metro-it'), seed: s.seed, retirementAge: 60, picks: s.picks });
  assertEqual(a.state.history.map(y => y.netWorth), b.state.history.map(y => y.netWorth));
  const c = playScriptLife({ ...ctx('metro-it'), seed: s.seed, retirementAge: 60, picks: changedPicks(s.picks, s.change) });
  assertEqual(a.state.history.map(y => y.regime), c.state.history.map(y => y.regime), 'the weather is the same');
  assertEqual(a.state.history.map(y => y.events.map(e => e.id)), c.state.history.map(y => y.events.map(e => e.id)), 'the events are the same');
});

// The guard: every fact a script claims is replayed. A retune that breaks a claim fails here, and the
// message names the script, the step and the claim.
for (const id of Object.keys(scripts)) {
  test(`${id}: every expected finding in the script still holds when the seed is replayed`, () => {
    const runs = playScriptRuns(ctx(id), scripts[id]);
    const broken = [];
    for (const e of scripts[id].expect) {
      for (const check of e.checks) if (!holds(check, runs)) broken.push(`step "${e.step}": ${JSON.stringify(check)} is no longer true (${e.text.slice(0, 70)}...)`);
    }
    assert(broken.length === 0, `${id}'s script needs a look after a model change:\n${broken.join('\n')}`);
  });
}

// ---- the page ----

test('the page shows every step, saves what is typed, and shows facilitator notes only when asked', () => {
  const store = createStore(memory());
  const root = createRoot();
  const b = build('metro-it');
  renderScript(root, b, { store });
  const page = findAll(root, n => hasClass(n, 'script-page'))[0];
  assertEqual(findAll(root, n => n.tagName === 'SECTION' && hasClass(n, 'script-step')).length, b.steps.length);
  assert(!hasClass(page, 'show-facilitator'), 'notes hidden to begin with');
  const box = findAll(root, n => n.tagName === 'TEXTAREA' && n.attrs.id === 'answer-predict')[0];
  box.value = 'It will last.';
  box.dispatch('input');
  assertEqual(store.loadAnswers('metro-it').predict, 'It will last.');
  const sw = findAll(root, n => n.tagName === 'INPUT' && n.attrs.id === 'show-facilitator')[0];
  sw.checked = true;
  sw.dispatch('change');
  assert(hasClass(page, 'show-facilitator'), 'notes shown after the switch');
  assert(findAll(root, n => n.tagName === 'ASIDE' && hasClass(n, 'facilitator-note')).length >= 6, 'notes are in the page for the switch to show');
  // coming back later restores the answer
  const again = createRoot();
  renderScript(again, b, { store });
  assertEqual(findAll(again, n => n.tagName === 'TEXTAREA' && n.attrs.id === 'answer-predict')[0].value, 'It will last.');
});

test('the page can start with the notes showing, and clears answers on request', () => {
  const store = createStore(memory());
  store.saveAnswers('metro-it', { predict: 'x' });
  const root = createRoot();
  renderScript(root, build('metro-it'), { store, facilitator: true });
  assert(hasClass(findAll(root, n => hasClass(n, 'script-page'))[0], 'show-facilitator'), 'started showing notes');
  buttonWithText(root, /Clear my answers/).click(); // no confirm() in Node, so it goes ahead
  assertEqual(store.loadAnswers('metro-it'), {});
  assertEqual(findAll(root, n => n.tagName === 'TEXTAREA' && n.attrs.id === 'answer-predict')[0].value, '');
});

test('the facilitator notes carry the expected findings and the rubric', () => {
  const root = createRoot();
  renderScript(root, build('metro-it'), { store: createStore(memory()) });
  const notes = findAll(root, n => n.tagName === 'ASIDE').map(n => n.textContent).join(' ');
  assert(/Expected on this luck/.test(notes) && /crash runs from age 29 to 32/.test(notes), 'expected findings');
  assert(/Rubric for the explanation/.test(notes) && /Separates choice from luck/.test(notes), 'rubric');
  assert(/The reference plan behind the expected findings/.test(notes), 'reference plan');
});

test('the game links in the text are real links', () => {
  const root = createRoot();
  renderScript(root, build('metro-it'), { store: createStore(memory()) });
  const hrefs = findAll(root, n => n.tagName === 'A').map(n => n.attrs.href);
  assert(hrefs.includes('index.html?persona=metro-it&seed=35&retire=60') && hrefs.includes('index.html?persona=metro-it&seed=36&retire=60'), hrefs.join(' '));
});

test('with no storage the page still works, and the index lists only personas that have a script', () => {
  const root = createRoot();
  renderScript(root, build('metro-it'), { store: createStore(null) });
  assert(/Make the key choices/.test(text(root)), 'renders without storage');
  const index = createRoot();
  renderScriptIndex(index, personas.filter(p => scripts[p.id]));
  assertEqual(findAll(index, n => n.tagName === 'A').map(a => a.attrs.href), Object.keys(scripts).map(id => `scripts.html?persona=${id}`));
  assert(!/undefined|null|NaN/.test(text(index)), 'no stray words');
});

test('no step of any script leaks stray words', () => {
  for (const id of Object.keys(scripts)) {
    const root = createRoot();
    renderScript(root, build(id), { store: createStore(memory()), facilitator: true });
    assert(!/undefined|null|NaN|false|\[object/.test(text(root)), `${id}: ${text(root).match(/.{20}(undefined|null|NaN|false|\[object).{20}/)?.[0]}`);
  }
});

// ---- remembering answers ----

test('answers are kept per script, on this device, and a blocked store forgets without failing', () => {
  const storage = memory();
  const store = createStore(storage);
  store.saveAnswers('a', { x: '1' });
  store.saveAnswers('b', { x: '2' });
  assertEqual([store.loadAnswers('a'), store.loadAnswers('b'), store.loadAnswers('c')], [{ x: '1' }, { x: '2' }, {}]);
  store.saveSettings({ theme: 'dark' });
  assertEqual(store.loadAnswers('a'), { x: '1' }, 'settings and answers do not overwrite each other');
  const none = createStore(null);
  assertEqual([none.saveAnswers('a', { x: 1 }), none.loadAnswers('a')], [false, {}]);
});
