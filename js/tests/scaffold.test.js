import { test, assert, assertEqual, assertThrows } from './harness.js';
import { validate, schemas, ValidationError } from '../data/validate.js';
import { loadJSON, applyTheme } from '../data/loader.js';

const goodTheme = {
  fonts: { display: 'x', body: 'y' },
  colors: {
    bg: '#fff', surface: '#fff', ink: '#000', inkSoft: '#111', primary: '#ff0', primaryInk: '#000',
    accent1: '#1', accent2: '#2', accent3: '#3', good: '#4', warn: '#5', bad: '#6',
  },
  sizes: { base: '1rem', hero: '3rem', radius: '1rem' },
};

const fakeFetch = (body, { ok = true, status = 200 } = {}) => async () => ({
  ok, status,
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});

test('validate accepts a good theme', () => {
  assertEqual(validate(goodTheme, schemas.theme, 'theme.json'), goodTheme);
});

test('validate lists every missing field in plain words', () => {
  const bad = { fonts: { display: 'x' }, colors: {}, sizes: { base: '1rem', hero: '3rem', radius: '1rem' } };
  try { validate(bad, schemas.theme, 'theme.json'); assert(false, 'should have thrown'); }
  catch (err) {
    assert(err instanceof ValidationError, 'wrong error type');
    assert(err.problems.includes('missing "fonts.body"'), 'fonts.body not reported');
    assert(err.problems.includes('missing "colors.bg"'), 'colors.bg not reported');
    assert(err.message.startsWith('theme.json has problems'), 'label not in message');
  }
});

test('validate reports wrong types', async () => {
  const bad = structuredClone(goodTheme);
  bad.sizes.base = 16;
  await assertThrows(() => validate(bad, schemas.theme, 't'), '"sizes.base" should be string but is number');
});

test('validate rejects non-objects', async () => {
  await assertThrows(() => validate([], schemas.theme, 't'), 'expected an object but got array');
});

test('optional fields may be absent', () => {
  validate(goodTheme, schemas.theme, 't');
});

test('loadJSON returns validated data', async () => {
  const data = await loadJSON('x.json', { schema: schemas.theme, fetchImpl: fakeFetch(goodTheme) });
  assertEqual(data.sizes.base, '1rem');
});

test('loadJSON explains an unreachable server', async () => {
  const boom = async () => { throw new TypeError('Failed to fetch'); };
  await assertThrows(() => loadJSON('x.json', { fetchImpl: boom }), 'liveserver');
});

test('loadJSON explains a 404', async () => {
  await assertThrows(
    () => loadJSON('x.json', { label: 'x.json', fetchImpl: fakeFetch({}, { ok: false, status: 404 }) }),
    'HTTP 404');
});

test('loadJSON explains malformed JSON', async () => {
  const broken = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } });
  await assertThrows(() => loadJSON('x.json', { label: 'x.json', fetchImpl: broken }), 'not valid JSON');
});

test('loadJSON surfaces schema problems', async () => {
  await assertThrows(
    () => loadJSON('x.json', { schema: schemas.theme, label: 'theme.json', fetchImpl: fakeFetch({}) }),
    'missing "fonts"');
});

test('applyTheme writes CSS custom properties', () => {
  const props = {};
  const root = { style: { setProperty: (k, v) => { props[k] = v; } } };
  applyTheme(goodTheme, root);
  assertEqual(props['--c-primary'], '#ff0');
  assertEqual(props['--s-hero'], '3rem');
  assertEqual(props['--f-display'], 'x');
});
