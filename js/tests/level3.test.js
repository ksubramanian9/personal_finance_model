import { test, assert, assertEqual } from './harness.js';
import { createState } from '../engine/state.js';
import { runUntil } from '../engine/tick.js';
import { computeTax } from '../engine/tax.js';
import { loadParams, checkMacro } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { normalizeOverrides, applyOverrides, hasOverrides, describeOverrides, OVERRIDE_FIELDS } from '../data/overrides.js';
import { collectSources } from '../data/provenance.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const aarav = personas.find(p => p.id === 'metro-it');
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const life = (p, seed, custom = null, toAge = 60) => runUntil(createState(aarav, p, { seed, retirementAge: 60, custom }), p, toAge);

// ---- economy scripts ----

test('macro.json has scripts, and checkMacro explains a bad one', () => {
  assertEqual(Object.keys(params.macro.scripts), ['smooth', 'crash30s', 'lostDecade', 'lateCrash']);
  const bad = structuredClone(params.macro);
  bad.scripts.crash30s.sequence = [{ fromAge: 35, toAge: 33, regime: 'crisis' }, { fromAge: 30, toAge: 40, regime: 'apocalypse' }];
  delete bad.scripts.smooth.blurb;
  let message = '';
  try { checkMacro(bad, 'macro.json'); } catch (e) { message = e.message; }
  for (const part of ['smooth.blurb', 'crash30s.sequence[0]', 'apocalypse']) assert(message.includes(part), `mention ${part}: ${message}`);
});

test('a script fixes the weather in the ages it covers and leaves the rest to the dice', () => {
  const smooth = life(params, 7, { scriptId: 'smooth', overrides: {} });
  assert(smooth.history.every(y => y.regime === 'normal'), 'a smooth ride is steady all through');
  const crash = life(params, 7, { scriptId: 'crash30s', overrides: {} });
  const at = (age) => crash.history.find(y => y.age === age).regime;
  assertEqual([at(33), at(34), at(35), at(36)], ['crisis', 'crisis', 'slowdown', 'slowdown']);
  const dice = life(params, 7);
  assertEqual(crash.history.filter(y => y.age < 33).map(y => y.regime), dice.history.filter(y => y.age < 33).map(y => y.regime), 'before the script: the same dice');
  assertEqual(life(params, 7, { scriptId: 'lateCrash', overrides: {} }).history.filter(y => y.regime === 'crisis' && y.age >= 58).length, 2);
});

test('scripts move no other luck: the random streams end where they would have anyway', () => {
  const a = life(params, 5, { scriptId: 'smooth', overrides: {} });
  const b = life(params, 5);
  assertEqual(a.rng, b.rng);
  assertEqual(a.rngNudges, b.rngNudges);
  assertEqual(a.deathAge, b.deathAge);
  assert(a.history.at(-1).netWorth !== b.history.at(-1).netWorth, 'but the money differs');
});

test('the state remembers that a life was custom', () => {
  assertEqual(createState(aarav, params, { seed: 1, retirementAge: 60 }).custom, null);
  const s = createState(aarav, params, { seed: 1, retirementAge: 60, custom: { scriptId: 'smooth', overrides: { taxOn: false } } });
  assertEqual(s.custom, { scriptId: 'smooth', overrides: { taxOn: false } });
});

// ---- overrides ----

test('overrides are cleaned: only real changes, kept inside their ranges', () => {
  assertEqual(normalizeOverrides({}), {});
  assertEqual(normalizeOverrides({ inflationShiftPct: 0, equityShiftPct: '', taxOn: true }), {});
  assertEqual(normalizeOverrides({ inflationShiftPct: '1.5', equityShiftPct: 99, homeGrowthShiftPct: -99, taxOn: false, junk: 4 }),
    { inflationShiftPct: 1.5, equityShiftPct: OVERRIDE_FIELDS.equityShiftPct.max, homeGrowthShiftPct: OVERRIDE_FIELDS.homeGrowthShiftPct.min, taxOn: false });
  assertEqual(hasOverrides({}), false);
  assertEqual(hasOverrides({ taxOn: false }), true);
});

test('overrides change a copy and never the original params', () => {
  const before = JSON.stringify([params.macro, params.instruments, params.housing, params.tax]);
  const p = applyOverrides(params, { inflationShiftPct: 1, equityShiftPct: -2, homeGrowthShiftPct: 1.5, taxOn: false });
  assertEqual(JSON.stringify([params.macro, params.instruments, params.housing, params.tax]), before);
  assert(near(p.macro.regimes.normal.inflationPct, params.macro.regimes.normal.inflationPct + 1));
  const eq = (x) => x.instruments.find(i => i.id === 'equity').returns.normal.meanPct;
  assert(near(eq(p), eq(params) - 2));
  assert(near(p.housing.priceGrowthPct.boom, params.housing.priceGrowthPct.boom + 1.5));
  assertEqual(applyOverrides(params, {}), params);
});

test('"no tax" really means no tax, on pay and on gains', () => {
  const p = applyOverrides(params, { taxOn: false });
  assertEqual(computeTax(p.tax, { priceIndex: 1, salary: 5e7, gains: { equity: { st: 1e6, lt: 5e6 }, gold: { st: 1e6, lt: 1e6 }, home: { st: 0, lt: 1e7 } } }).total, 0);
  assert(computeTax(params.tax, { priceIndex: 1, salary: 5e7 }).total > 0, 'the default still taxes');
  const taxed = life(params, 4).history.reduce((a, y) => a + y.taxIncome + y.taxInvest, 0);
  const free = life(p, 4).history.reduce((a, y) => a + y.taxIncome + y.taxInvest, 0);
  assert(taxed > 0 && free === 0);
});

test('higher inflation and weaker shares both change a life in the expected direction', () => {
  const base = life(params, 3).history.at(-1);
  const hot = life(applyOverrides(params, { inflationShiftPct: 2 }), 3).history.at(-1);
  assert(hot.priceIndexEnd > base.priceIndexEnd * 1.5, 'prices rise faster');
  const weak = life(applyOverrides(params, { equityShiftPct: -5 }), 3).history.at(-1);
  assert(weak.netWorth < base.netWorth, 'shares that earn less leave less');
});

test('overrides are described in plain words', () => {
  assertEqual(describeOverrides({ inflationShiftPct: 1, equityShiftPct: -2, taxOn: false }), ['Inflation +1 points a year', 'Share returns −2 points a year', 'No tax']);
  assertEqual(describeOverrides({}), []);
});

// ---- the data browser ----

test('every provenance block is found, with its source, confidence and year', () => {
  const entries = collectSources(params.sources);
  assert(entries.length >= 25, `${entries.length} sources`);
  for (const e of entries) {
    assert(e.file && e.path && e.basis.length > 10, `${e.file} ${e.path}`);
    assert(['high', 'medium', 'low'].includes(e.confidence) && typeof e.asOf === 'number', `${e.file} ${e.path}`);
  }
  const files = new Set(entries.map(e => e.file));
  for (const f of ['macro.json', 'instruments.json', 'tax.json', 'housing.json', 'retirement.json', 'nudges.json']) assert(files.has(f), f);
  assert(entries.some(e => e.file === 'instruments.json' && e.path === 'instruments[equity]'), 'one entry per instrument');
});

test('the numbers an entry covers leave out the provenance and anything with its own', () => {
  const entries = collectSources(params.sources);
  const top = entries.find(e => e.file === 'instruments.json' && e.path === '(whole file)');
  assertEqual(top.numbers, {});
  const equity = entries.find(e => e.path === 'instruments[equity]');
  assert(equity.numbers.returns && !('provenance' in equity.numbers));
  const small = collectSources({ 'x.json': { a: 1, inner: { b: 2, provenance: { basis: 'inner basis here', confidence: 'low', asOf: 1 } }, provenance: { basis: 'outer basis here', confidence: 'high', asOf: 2 } } });
  assertEqual(small.map(e => [e.path, Object.keys(e.numbers)]), [['(whole file)', ['a']], ['inner', ['b']]]);
});
