import { test, assert, assertEqual } from './harness.js';
import { installFakeDom } from './fakeDom.js';
import { MODES, MODE_INFO, nextMode, resolveScheme, createThemeController, createThemeToggle } from '../ui/theme.js';
import { createStore } from '../ui/storage.js';
import { getFetch } from './dataFetch.js';

installFakeDom();
const theme = await (await getFetch())('data/theme.json').then(r => r.json());
const memory = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) }; };
const fakeRoot = () => { const props = {}; return { props, style: { setProperty: (k, v) => { props[k] = v; } }, dataset: {} }; };
const fakeMedia = (matches) => { const m = { matches, listeners: [], addEventListener: (type, fn) => m.listeners.push(fn) }; return m; };

test('the theme cycles Automatic, Light, Dark and round again', () => {
  assertEqual(MODES, ['auto', 'light', 'dark']);
  assertEqual([nextMode('auto'), nextMode('light'), nextMode('dark')], ['light', 'dark', 'auto']);
  assertEqual(nextMode('nonsense'), 'auto');
});

test('Automatic follows the device; Light and Dark ignore it', () => {
  assertEqual([resolveScheme('auto', false), resolveScheme('auto', true)], ['light', 'dark']);
  assertEqual([resolveScheme('light', true), resolveScheme('dark', false)], ['light', 'dark']);
});

test('the controller starts from the remembered mode, then Automatic, and a URL choice wins for one visit', () => {
  const storage = memory();
  const store = createStore(storage);
  const root = fakeRoot();
  assertEqual(createThemeController({ theme, root, store }).mode, 'auto');
  store.saveSettings({ theme: 'dark' });
  assertEqual(createThemeController({ theme, root, store }).mode, 'dark');
  store.saveSettings({ theme: 'junk' });
  assertEqual(createThemeController({ theme, root, store }).mode, 'auto');
  store.saveSettings({ theme: 'light' });
  const forced = createThemeController({ theme, root, store, initial: 'dark' });
  assertEqual(forced.mode, 'dark');
  assertEqual(store.loadSettings().theme, 'light', 'a URL choice is not remembered');
});

test('cycling applies the scheme, remembers it, and keeps the other settings', () => {
  const store = createStore(memory());
  store.saveSettings({ level: 2, real: false });
  const root = fakeRoot();
  const c = createThemeController({ theme, root, store, media: fakeMedia(false) });
  c.apply();
  assertEqual(root.props['--c-bg'], theme.colors.bg);
  assertEqual(c.cycle(), 'light');
  assertEqual(root.dataset.theme, 'light');
  assertEqual(c.cycle(), 'dark');
  assertEqual([root.props['--c-bg'], root.dataset.theme, root.props['color-scheme']], [theme.dark.colors.bg, 'dark', 'dark']);
  assertEqual(store.loadSettings(), { level: 2, real: false, theme: 'dark' });
  assertEqual(c.cycle(), 'auto');
  assertEqual(root.dataset.theme, 'light', 'Automatic on a light device is light');
});

test('on Automatic the page follows the device when it switches; on a fixed mode it does not', () => {
  const root = fakeRoot();
  const media = fakeMedia(false);
  const c = createThemeController({ theme, root, store: createStore(memory()), media });
  c.apply();
  assertEqual(root.dataset.theme, 'light');
  media.matches = true;
  media.listeners.forEach(fn => fn());
  assertEqual(root.dataset.theme, 'dark');
  c.cycle(); // light
  media.listeners.forEach(fn => fn());
  assertEqual(root.dataset.theme, 'light');
});

test('the button shows the current choice, says it aloud, and changes it when pressed', () => {
  const c = createThemeController({ theme, root: fakeRoot(), store: createStore(memory()) });
  const button = createThemeToggle(c);
  assertEqual(button.tagName, 'BUTTON');
  assertEqual(button.attrs.type, 'button');
  assertEqual(button.textContent, MODE_INFO.auto.icon);
  assert(/Colour theme: Automatic \(follows your device\)\. Press to change\./.test(button.attrs['aria-label']));
  button.click();
  assertEqual(button.textContent, MODE_INFO.light.icon);
  assert(/Colour theme: Light\./.test(button.attrs['aria-label']) && button.attrs.title === button.attrs['aria-label']);
  button.click();
  assertEqual(button.textContent, MODE_INFO.dark.icon);
  button.click();
  assertEqual(button.textContent, MODE_INFO.auto.icon);
  assertEqual(new Set(Object.values(MODE_INFO).map(m => m.icon)).size, 3, 'three different icons');
});
