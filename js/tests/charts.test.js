import { test, assert, assertEqual } from './harness.js';
import { installFakeDom, findAll, hasClass } from './fakeDom.js';
import { createState } from '../engine/state.js';
import { applyPicks, playStage, nextStage } from '../engine/stages.js';
import { netWorthSeries, cashflowSeries } from '../engine/explain.js';
import * as charts from '../ui/charts.js';
import { niceTicks, netWorthChart, cashflowChart, STACK_ORDER } from '../ui/charts.js';
import { formatINRShort } from '../ui/format.js';
import { createDisclosure, LEVEL } from '../ui/disclosure.js';
import { loadParams } from '../data/params.js';
import { loadStages } from '../data/stages.js';
import { loadPersonas } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

installFakeDom();

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const regimes = params.macro.regimes;
const eventDefs = Object.fromEntries(params.events.map(e => [e.id, e]));
const base = { savings: 'balanced', invest: 'mixed', emergency: 'none', health: 'none', growth: 'none', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };

function life(persona, seed, picks = base) {
  let s = createState(persona, params, { seed, retirementAge: 60 });
  for (let st = nextStage(stages, s); st; st = nextStage(stages, s)) s = playStage(s, params, st, decisions, picks);
  return s;
}
const aarav = personas.find(p => p.id === 'metro-it');
const s4271 = life(aarav, 4271);
const nwRows = (real, s = s4271) => netWorthSeries(s.history, params.instruments, { real });
const cfRows = (real, s = s4271) => cashflowSeries(s.history, { real });
const nwChart = (real = true, s = s4271) => netWorthChart(nwRows(real, s), { instruments: params.instruments, real });
// A life with a cash cushion, so every kind of segment is drawn at some point.
const cushioned = life(aarav, 4271, { ...base, emergency: 'six' });
// One decade on its own scale, as the "Why?" panel draws it. The whole-life chart cannot show cash or a
// loan of a few lakh beside a crore-scale peak, so those are checked here.
const decade = (real = true, s = cushioned, n = 8) =>
  netWorthChart(nwRows(real, s).slice(0, n), { instruments: params.instruments, real, title: 'Your 20s: what you owned' });
const cfChart = (real = true, s = s4271) => cashflowChart(cfRows(real, s), { regimes, eventDefs, real });

const all = (root) => findAll(root, () => true);
const attr = (el, k) => el.getAttribute(k);
const byClass = (root, cls) => findAll(root, n => hasClass(n, cls));

// ---- tick marks and short money ----

test('niceTicks: round steps that cover the data', () => {
  const t = niceTicks(0, 97);
  assertEqual(t.ticks, [0, 20, 40, 60, 80, 100]);
  assertEqual([t.min, t.max], [0, 100]);
  assertEqual(niceTicks(-3, 97).ticks, [-20, 0, 20, 40, 60, 80, 100]);
  assertEqual(niceTicks(0, 0).ticks.length > 1, true);
  assertEqual(niceTicks(0, 7e7).ticks[1], 2e7);
  const odd = niceTicks(0, 23);
  assert(odd.ticks[0] === 0 && odd.ticks.at(-1) >= 23, 'covers 23');
});

test('formatINRShort: K, L and Cr for axes', () => {
  assertEqual(formatINRShort(0), '₹0');
  assertEqual(formatINRShort(750), '₹750');
  assertEqual(formatINRShort(50000), '₹50K');
  assertEqual(formatINRShort(500000), '₹5L');
  assertEqual(formatINRShort(25000000), '₹2.5Cr');
  assertEqual(formatINRShort(-300000), '-₹3L');
});

// ---- disclosure ----

test('disclosure: starts at the story, only goes up when asked, and closes back to the story', () => {
  const d = createDisclosure();
  assertEqual([d.level, d.real, d.isOpen(LEVEL.why)], [1, true, false]);
  d.open(LEVEL.why);
  assertEqual(d.isOpen(LEVEL.why), true);
  d.open(LEVEL.story);
  assertEqual(d.level, 2);
  d.close();
  assertEqual(d.level, 1);
  d.setReal(false);
  assertEqual(d.real, false);
});

// ---- net worth chart ----

test('net worth chart: structure, legend, readout and accessibility hooks', () => {
  const fig = nwChart();
  assertEqual(fig.tagName, 'FIGURE');
  assert(/What you owned/.test(fig.textContent), 'title');
  assert(/today's rupees/.test(fig.textContent), 'says which rupees');
  const legend = byClass(fig, 'legend')[0].children.map(li => li.textContent);
  assertEqual(legend.slice(0, 5), ['Equity index funds', 'Gold', 'Provident funds', 'Fixed deposits', 'Cash savings']);
  const frame = byClass(fig, 'chart-frame')[0];
  assertEqual(attr(frame, 'tabindex'), '0');
  assertEqual(attr(frame, 'role'), 'group');
  assert(/arrow keys/.test(attr(frame, 'aria-label')), 'keyboard instructions in the name');
  assertEqual(attr(findAll(fig, n => n.tagName === 'SVG')[0], 'aria-hidden'), 'true');
});

test('net worth chart: stack order is fixed and each entity keeps its colour', () => {
  assertEqual(STACK_ORDER, ['cash', 'fd', 'pf', 'gold', 'equity', 'home']);
  const fig = decade();
  for (const id of STACK_ORDER.filter(x => x !== 'home')) { // no home yet in this life
    const segs = byClass(fig, `seg-${id}`);
    assert(segs.length > 0, `${id} drawn`);
    assert(segs.every(s => attr(s, 'style') === `fill: var(--ch-${id})`), `${id} colour`);
  }
});

test('net worth chart: marks obey the specs (columns at most 24 wide, one column per year, loans below the line)', () => {
  const fig = nwChart();
  const widths = byClass(fig, 'seg').filter(n => n.tagName === 'RECT').map(n => Number(attr(n, 'width')));
  assert(widths.length > 0 && widths.every(w => w > 0 && w <= 24), `widths ${Math.max(...widths)}`);
  assertEqual(byClass(fig, 'hit').length, s4271.history.length);
  // Aarav starts with a 4 lakh loan: visible on a decade's own scale, hanging from the baseline
  const zoomed = decade();
  const loans = byClass(zoomed, 'seg-loans');
  assert(loans.length > 0, 'loans hang below the axis');
  const baselineY = Number(attr(byClass(zoomed, 'baseline')[0], 'y1'));
  assert(loans.every(l => Number(attr(l, 'd').match(/M[\d.]+,([\d.]+)/)[1]) >= baselineY - 0.01), 'loan columns start at the baseline');
});

test('net worth chart: the top segment of a column is rounded, the others are plain rectangles with a gap', () => {
  const fig = nwChart();
  const paths = byClass(fig, 'seg').filter(n => n.tagName === 'PATH' && !hasClass(n, 'seg-loans'));
  assert(paths.length >= 15, `only ${paths.length} rounded tops; early years are too small to see beside a lifetime peak`);
  assert(paths.every(p => /Q/.test(attr(p, 'd'))), 'rounded corners use curves');
});

test('net worth chart: no NaN, undefined or Infinity leaks into any attribute', () => {
  for (const fig of [nwChart(true), nwChart(false), cfChart(true), cfChart(false)]) {
    for (const el of all(fig)) {
      for (const [k, v] of Object.entries(el.attrs ?? {})) assert(!/NaN|undefined|Infinity/.test(v), `${el.tagName}.${k}="${v}"`);
    }
  }
});

test('net worth chart: hovering or tapping a year moves the readout; the last year shows first', () => {
  const fig = nwChart();
  const readout = byClass(fig, 'chart-readout')[0];
  const last = s4271.history.at(-1);
  assert(new RegExp(`Age ${last.age} `).test(readout.textContent), 'starts on the last year');
  const hits = byClass(fig, 'hit');
  hits[3].dispatch('pointerenter');
  assert(new RegExp(`Age ${s4271.history[3].age} `).test(readout.textContent), 'moved to year 4');
  hits[7].dispatch('click');
  assert(new RegExp(`Age ${s4271.history[7].age} `).test(readout.textContent), 'tap works too');
  const hl = byClass(fig, 'active-year')[0];
  assert(Number(attr(hl, 'x')) > 0 && Number(attr(hl, 'width')) > 0, 'the highlight follows');
});

test('net worth chart: arrow keys, Home and End step through the years and stop at the ends', () => {
  const fig = nwChart();
  const frame = byClass(fig, 'chart-frame')[0];
  const readout = byClass(fig, 'chart-readout')[0];
  const ageNow = () => Number(readout.textContent.match(/Age (\d+)/)[1]);
  const first = s4271.history[0].age, last = s4271.history.at(-1).age;
  let prevented = 0;
  const key = (k) => frame.dispatch('keydown', { key: k, preventDefault() { prevented++; } });
  key('Home'); assertEqual(ageNow(), first);
  key('ArrowLeft'); assertEqual(ageNow(), first);
  key('ArrowRight'); assertEqual(ageNow(), first + 1);
  key('End'); assertEqual(ageNow(), last);
  key('ArrowRight'); assertEqual(ageNow(), last);
  key('ArrowLeft'); assertEqual(ageNow(), last - 1);
  const before = prevented;
  key('Tab'); assertEqual(prevented, before);
});

test('net worth chart: the readout lists every non-zero part in rupees, loans included when owed', () => {
  const fig = nwChart(true, cushioned);
  const readout = byClass(fig, 'chart-readout')[0];
  byClass(fig, 'hit')[0].dispatch('pointerenter');
  assert(/Loans ₹/.test(readout.textContent), 'Aarav starts in debt');
  const cashYear = nwRows(true, cushioned).findIndex(r => r.parts.cash > 0.5);
  assert(cashYear >= 0, 'a cushioned life holds cash at some point');
  byClass(fig, 'hit')[cashYear].dispatch('pointerenter');
  assert(/Cash savings ₹/.test(readout.textContent), 'and cash shows in the readout');
  byClass(fig, 'hit').at(-1).dispatch('pointerenter');
  assert(/Equity index funds ₹/.test(readout.textContent), 'equity at the end');
  assert(!/Loans/.test(readout.textContent), 'debt-free by the end');
});

test('net worth chart: switching to nominal rupees changes the wording and the numbers', () => {
  const real = nwChart(true), nominal = nwChart(false);
  assert(/today's rupees/.test(real.textContent) && /rupees of that year/.test(nominal.textContent), 'wording');
  assert(real.textContent !== nominal.textContent, 'numbers differ');
});

test('net worth chart: one direct label, on the last column', () => {
  const labels = byClass(nwChart(), 'end-label');
  assertEqual(labels.length, 1);
  assert(/^₹/.test(labels[0].textContent), 'a short rupee amount');
});

test('net worth chart copes with a single year and with a life that never owed anything', () => {
  const one = netWorthChart(nwRows(true).slice(0, 1), { instruments: params.instruments, real: true });
  assertEqual(byClass(one, 'hit').length, 1);
  const rich = { ...personas[1], money: { ...personas[1].money, startingDebt: 0 } };
  const fig = nwChart(true, life(rich, 3));
  assertEqual(byClass(fig, 'seg-loans').length, 0);
  assert(!/Loans/.test(byClass(fig, 'legend')[0].textContent), 'no loans entry in the legend');
});

// ---- earned vs spent chart ----

test('cash flow chart: two 2px lines, end dots, direct labels, a four-item legend', () => {
  const fig = cfChart();
  assertEqual(byClass(fig, 'line').length, 2);
  assertEqual(byClass(fig, 'end-dot').length, 2);
  assertEqual(byClass(fig, 'end-dot').every(d => Number(attr(d, 'r')) >= 4), true);
  assertEqual(byClass(fig, 'end-label').map(n => n.textContent).sort(), ['Earned', 'Spent']);
  assertEqual(byClass(fig, 'legend')[0].children.map(li => li.textContent), ['Earned', 'Spent', 'Slowdown year', 'Crisis year']);
  assert(byClass(fig, 'line').every(l => /^M[\d.,\- L]+$/.test(attr(l, 'd'))), 'plain path data');
});

test('cash flow chart: slowdown and crisis years are shaded, steady and boom years are not', () => {
  const fig = cfChart();
  const slow = s4271.history.filter(y => y.regime === 'slowdown').length;
  const crisis = s4271.history.filter(y => y.regime === 'crisis').length;
  assertEqual(byClass(fig, 'band-slowdown').length, slow);
  assertEqual(byClass(fig, 'band-crisis').length, crisis);
  assertEqual(byClass(fig, 'band').length, slow + crisis);
});

test('cash flow chart: the readout names the economy, earned, spent, saved and any events', () => {
  const s = life(aarav, 11);
  const fig = cfChart(true, s);
  const readout = byClass(fig, 'chart-readout')[0];
  const hits = byClass(fig, 'hit');
  const withEvent = s.history.findIndex(y => y.events.length > 0);
  assert(withEvent >= 0, 'seed 11 has an event');
  hits[withEvent].dispatch('pointerenter');
  const y = s.history[withEvent];
  assert(readout.textContent.includes(regimes[y.regime].name), 'economy named');
  assert(/Earned ₹/.test(readout.textContent) && /Spent ₹/.test(readout.textContent) && /Saved ₹/.test(readout.textContent), 'the three figures');
  assert(readout.textContent.includes(eventDefs[y.events[0].id].name), 'event named');
  const quiet = s.history.findIndex(y => y.events.length === 0);
  hits[quiet].dispatch('pointerenter');
  assert(byClass(fig, 'readout-events').length === 0, 'no events line in a quiet year');
});

test('cash flow chart: keyboard works here too', () => {
  const fig = cfChart();
  const frame = byClass(fig, 'chart-frame')[0];
  const readout = byClass(fig, 'chart-readout')[0];
  frame.dispatch('keydown', { key: 'Home' });
  assert(new RegExp(`Age ${s4271.history[0].age} `).test(readout.textContent), 'Home goes to the first year');
});

test('a decade chart takes its own title, and only the whole-life chart carries the zoom hint', () => {
  const zoomed = decade();
  assert(/Your 20s: what you owned/.test(zoomed.textContent), 'custom title');
  assert(!/closer look/.test(zoomed.textContent), 'no hint on a decade');
  const whole = netWorthChart(nwRows(true), { instruments: params.instruments, real: true, zoomHint: true });
  assert(/closer look/.test(whole.textContent), 'hint on the whole-life chart');
  assert(/What you owned/.test(whole.textContent), 'default title');
});

test('on a decade scale the cash cushion and the early loan really are visible', () => {
  const fig = decade();
  const cash = byClass(fig, 'seg-cash');
  assert(cash.length > 0, 'cash drawn');
  const heights = byClass(fig, 'seg-loans').map(l => {
    const ys = [...attr(l, 'd').matchAll(/[\d.]+,([\d.]+)/g)].map(m => Number(m[1]));
    return Math.max(...ys) - Math.min(...ys);
  });
  assert(heights.length > 0 && Math.max(...heights) > 3, `tallest loan column is ${Math.max(...heights)}px`);
});

test('stackedDomain: loans extend the axis to scale and never blow it up', () => {
  const { stackedDomain } = charts;
  // no loans: starts at zero
  const none = stackedDomain(97, 0);
  assertEqual([none.min, none.max], [0, 100]);
  // a few lakh of loan beside a crore-scale peak: its own height only, no negative ticks
  const tiny = stackedDomain(4e8, 4e5);
  assertEqual(tiny.min, -4e5);
  assert(tiny.ticks.every(t => t >= 0), 'no negative tick for a sliver of loan');
  // a loan that is a real fraction of a step gets one tick below the line
  const real = stackedDomain(17e5, 4.5e5);
  assert(real.ticks.includes(-5e5) && real.min === -5e5, 'one tick below');
  // no assets at all, only a loan: a sane axis, not millions of ticks
  const onlyLoan = stackedDomain(0, 4e5);
  assert(onlyLoan.ticks.length < 20, `ticks: ${onlyLoan.ticks.length}`);
  assert(onlyLoan.min <= -4e5 && onlyLoan.max > 0, 'covers the loan and has some room above');
  // loans bigger than assets
  const deep = stackedDomain(1e5, 9e5);
  assert(deep.min <= -9e5 && deep.ticks.length < 30, 'deep debt');
});

test('the whole-life chart spends no axis space below the line on a small loan, and a decade chart labels it', () => {
  const labels = (fig) => byClass(fig, 'axis-label').map(n => n.textContent);
  assert(!labels(nwChart()).some(t => t.startsWith('-')), 'no negative tick on the whole-life chart');
  assert(labels(decade()).some(t => t.startsWith('-')), 'a negative tick on the decade chart');
});

test('x axis labels thin out with the number of columns', () => {
  const ages = (fig) => byClass(fig, 'axis-label').map(n => n.textContent).filter(t => /^\d+$/.test(t)).map(Number);
  const whole = ages(nwChart());
  assert(whole.length >= 5 && whole.every(a => a % 5 === 0), `whole-life labels: ${whole}`);
  const short = ages(decade());
  assert(short.length >= 3 && short.every(a => a % 2 === 0), `decade labels: ${short}`);
});

test('a readout never prints the word false or undefined (empty parts are dropped)', () => {
  for (const fig of [cfChart(), nwChart(), decade()]) {
    const readout = byClass(fig, 'chart-readout')[0];
    for (const hit of byClass(fig, 'hit')) {
      hit.dispatch('pointerenter');
      assert(!/false|undefined|null|NaN/.test(readout.textContent), readout.textContent);
    }
  }
});
