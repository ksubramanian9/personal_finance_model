import { test, assert, assertEqual, assertThrows } from './harness.js';
import { installFakeDom, findAll, buttons, buttonWithText } from './fakeDom.js';
import { createLearn } from '../ui/learn.js';
import { gameNumbers, fill, tokensIn } from '../ui/learnText.js';
import { loadLearn } from '../data/learn.js';
import { loadParams } from '../data/params.js';
import { loadStages } from '../data/stages.js';
import { collectSources } from '../data/provenance.js';
import { getFetch } from './dataFetch.js';

installFakeDom();
const fetchImpl = await getFetch();
const learn = await loadLearn({ fetchImpl });
const params = await loadParams({ fetchImpl });
const stagesData = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const values = gameNumbers(params, stagesData.decisions);
const pageIds = Object.keys(learn.pages);
const everyText = (page) => JSON.stringify([page.short, page.how, page.decide, page.traps, page.game, page.india.map(i => i.text)]);

test('the learn index and every page load, validate and agree with each other', () => {
  assert(pageIds.length >= 1);
  assertEqual(learn.index.pages.map(p => p.id), pageIds);
  for (const id of Object.values(learn.index.decisions)) assert(learn.pages[id], `${id} is a page`);
  for (const p of learn.index.pages) assertEqual(learn.pages[p.id].title, p.title);
});

test('a page whose id does not match the index, or a decision with no page, is refused', async () => {
  const swap = (path, edit) => async (p) => {
    const res = await fetchImpl(p);
    if (p !== path) return res;
    return { ok: true, status: 200, json: async () => edit(await res.json()) };
  };
  await assertThrows(() => loadLearn({ fetchImpl: swap('data/learn/health-insurance.json', d => ({ ...d, id: 'other' })) }), 'says its id');
  await assertThrows(() => loadLearn({ fetchImpl: swap('data/learn/index.json', d => ({ ...d, decisions: { health: 'nope' } })) }), 'no such page');
  await assertThrows(() => loadLearn({ fetchImpl: swap('data/learn/health-insurance.json', d => ({ ...d, india: [{ text: 'x' }] })) }), 'provenance');
});

test('every {number} a page uses is one the game defines, and every one fills in', () => {
  for (const page of Object.values(learn.pages)) {
    for (const name of tokensIn(everyText(page))) assert(name in values, `${page.id} uses {${name}}`);
    for (const t of [page.short, ...page.how.bullets, ...page.decide.bullets, ...page.game.bullets, ...page.game.paragraphs]) {
      assert(!/undefined|NaN|\{|\}/.test(fill(t, values)), `${page.id}: ${t.slice(0, 40)}`);
    }
  }
  assertEqual(fill('Cover {health.basic.cover}.', values), 'Cover ₹5 lakh.');
});

test('an unknown {number} is an error, not the word "undefined"', () => {
  let message = '';
  try { fill('Costs {health.nope}.', values); } catch (err) { message = err.message; }
  assert(/health\.nope/.test(message), message);
});

test('pages never type a number the game already defines', () => {
  // The game's own figures (covers, premiums, the age loading) must come in as {tokens}, so a retune cannot leave a page stale.
  const typed = Object.entries(values).filter(([name]) => !name.endsWith('ageLoadingPct')).map(([, v]) => v);
  for (const page of Object.values(learn.pages)) {
    const prose = everyText(page);
    for (const v of typed) assert(!prose.includes(v), `${page.id} types ${v}; use a {token}`);
    const loading = String(params.insurance.premiumAgeLoadingPct);
    assert(!new RegExp(`\\b${loading}% of`).test(prose), `${page.id} types the ${loading}% age loading`);
  }
});

test('every fact in "India" carries a source, a confidence and a year, and the browser lists them', () => {
  for (const page of Object.values(learn.pages)) {
    for (const item of page.india) {
      const p = item.provenance;
      assert(p.basis.length > 20 && ['high', 'medium', 'low'].includes(p.confidence) && p.asOf >= 2020, `${page.id}: ${item.text.slice(0, 40)}`);
      if (p.url) assert(/^https:\/\//.test(p.url), `${page.id}: ${p.url}`);
    }
    const listed = collectSources({ [`learn/${page.id}.json`]: page });
    assertEqual(listed.length, page.india.length + 1);
  }
});

test('a page is short enough to read, and uses plain words', () => {
  for (const page of Object.values(learn.pages)) {
    const words = fill(everyText(page), values).replace(/[\[\]{}",]/g, ' ').split(/\s+/).filter(Boolean).length;
    assert(words <= 1400, `${page.id} is ${words} words`);
    assert(!/\b(namaste|yaar|paisa vasool)\b/i.test(everyText(page)), 'plain English only');
  }
});

test('the Learn dialog opens on an index, goes to a page and back, and closes', () => {
  const panel = createLearn(learn, values);
  assertEqual(panel.element.tagName, 'DIALOG');
  panel.open();
  assertEqual(panel.element.attrs.open, '');
  assertEqual(panel.element.attrs['aria-labelledby'], 'learn-title');
  assert(findAll(panel.element, n => n.className === 'learn-item').length === pageIds.length);
  buttonWithText(panel.element, /Health insurance/).click();
  const heading = findAll(panel.element, n => n.tagName === 'H2')[0];
  assert(/Health insurance/.test(heading.textContent));
  assertEqual(heading.attrs.id, 'learn-title');
  buttonWithText(panel.element, /All topics/).click();
  assert(findAll(panel.element, n => n.className === 'learn-list').length === 1, 'back at the index');
  assert(buttons(panel.element).some(b => /Close/.test(b.textContent)));
});

test('opening a page by id lands on it; the page shows every section with the game\'s own numbers', () => {
  const panel = createLearn(learn, values);
  panel.open('health-insurance');
  const text = panel.element.textContent;
  for (const heading of ['How it works', 'What to decide', 'Common traps', 'India, as of 2026', 'How this game treats it']) assert(text.includes(heading), heading);
  assert(text.includes('₹5 lakh') && text.includes('₹12,000'), 'the game\'s cover and premium');
  assert(!/undefined|null|NaN|false|\[object|\{health/.test(text), 'no stray words or unfilled numbers');
  assert(findAll(panel.element, n => n.tagName === 'DETAILS').length === 3, 'three collapsible sections');
  assert(findAll(panel.element, n => n.tagName === 'DETAILS').every(d => d.attrs.open === undefined), 'closed to begin with');
  const links = findAll(panel.element, n => n.tagName === 'A');
  assert(links.length >= 1 && links.every(a => a.attrs.rel.includes('noopener')), 'external links are safe');
});

test('pageFor finds the page for a decision, and nothing for others', () => {
  const panel = createLearn(learn, values);
  assertEqual(panel.pageFor('health'), { id: 'health-insurance', title: 'Health insurance' });
  assertEqual(panel.pageFor('marry'), null);
});
