import { test, assert, assertEqual, assertThrows } from './harness.js';
import { loadPersonas, checkPersona } from '../data/personas.js';
import { getFetch } from './dataFetch.js';

const realFetch = await getFetch();

// Serves a fixed set of in-memory files, falling back to nothing.
const memFetch = (files) => async (path) => path in files
  ? { ok: true, status: 200, json: async () => structuredClone(files[path]) }
  : { ok: false, status: 404, json: async () => ({}) };

test('real persona files load and validate', async () => {
  const personas = await loadPersonas({ fetchImpl: realFetch });
  assert(personas.length >= 6, 'expected at least 6 personas');
  assertEqual(personas.map(p => p.id).sort(), ['freelance-designer', 'govt-psu', 'metro-it', 'resident-doctor', 'school-teacher', 'shop-heir']);
});

test('personas differ in the ways the intent says they should', async () => {
  const [it, gov] = await loadPersonas({ fetchImpl: realFetch }).then(ps => [
    ps.find(p => p.id === 'metro-it'), ps.find(p => p.id === 'govt-psu')]);
  assert(it.career.layoffRisk > gov.career.layoffRisk, 'IT should carry more layoff risk');
  assert(it.career.salaryGrowthPct > gov.career.salaryGrowthPct, 'IT should grow faster');
  assert(gov.career.pension && !it.career.pension, 'only government has a pension');
  assert(gov.biases.overConservatism > it.biases.overConservatism, 'government is more conservative');
});

test('every persona carries provenance', async () => {
  for (const p of await loadPersonas({ fetchImpl: realFetch })) {
    assert(p.provenance.basis.length > 0, `${p.id} missing basis`);
    assert(typeof p.provenance.asOf === 'number', `${p.id} missing asOf`);
  }
});

test('a new persona file appears just by being listed in the index', async () => {
  const base = await realFetch('data/personas/metro-it.json').then(r => r.json());
  const files = {
    'data/personas/index.json': { personas: ['a.json', 'b.json'] },
    'data/personas/a.json': { ...base, id: 'a' },
    'data/personas/b.json': { ...base, id: 'b', name: 'Bee' },
  };
  const personas = await loadPersonas({ fetchImpl: memFetch(files) });
  assertEqual(personas.map(p => p.id), ['a', 'b']);
});

test('duplicate ids are rejected', async () => {
  const base = await realFetch('data/personas/metro-it.json').then(r => r.json());
  const files = {
    'data/personas/index.json': { personas: ['a.json', 'b.json'] },
    'data/personas/a.json': base,
    'data/personas/b.json': base,
  };
  await assertThrows(() => loadPersonas({ fetchImpl: memFetch(files) }), 'already used');
});

test('a broken persona file names the file and the missing field', async () => {
  const base = await realFetch('data/personas/metro-it.json').then(r => r.json());
  delete base.money.startingSavings;
  const files = {
    'data/personas/index.json': { personas: ['bad.json'] },
    'data/personas/bad.json': base,
  };
  await assertThrows(() => loadPersonas({ fetchImpl: memFetch(files) }), 'personas/bad.json');
  await assertThrows(() => loadPersonas({ fetchImpl: memFetch(files) }), 'missing "money.startingSavings"');
});

test('every persona has a first name, and a file without one is rejected by name', async () => {
  const base = await realFetch('data/personas/metro-it.json').then(r => r.json());
  assert(typeof base.firstName === 'string' && base.firstName.length > 0, 'first name in the file');
  delete base.firstName;
  const files = { 'data/personas/index.json': { personas: ['bad.json'] }, 'data/personas/bad.json': base };
  await assertThrows(() => loadPersonas({ fetchImpl: memFetch(files) }), 'missing "firstName"');
});

test('a listed but missing file gives a 404 message', async () => {
  const files = { 'data/personas/index.json': { personas: ['ghost.json'] } };
  await assertThrows(() => loadPersonas({ fetchImpl: memFetch(files) }), 'HTTP 404');
});

test('checkPersona rejects out-of-range biases and unknown confidence', async () => {
  const base = await realFetch('data/personas/metro-it.json').then(r => r.json());
  base.biases.lifestyleCreep = 1.5;
  base.provenance.confidence = 'sure';
  try { checkPersona(base, 'x'); assert(false, 'should have thrown'); }
  catch (err) {
    assert(err.problems.some(p => p.includes('biases.lifestyleCreep')), 'bias range not reported');
    assert(err.problems.some(p => p.includes('provenance.confidence')), 'confidence not reported');
  }
});
