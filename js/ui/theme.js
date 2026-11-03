import { h } from './dom.js';
import { applyTheme } from '../data/loader.js';

// The colour theme: Automatic (follows the device), Light or Dark. The choice is remembered (see storage.js).
export const MODES = ['auto', 'light', 'dark'];
export const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length];

export const MODE_INFO = {
  auto: { icon: '\u{1F313}', label: 'Automatic (follows your device)' },
  light: { icon: '☀️', label: 'Light' },
  dark: { icon: '\u{1F319}', label: 'Dark' },
};

// Which colour scheme to draw: the chosen one, or the device's when the choice is Automatic.
export const resolveScheme = (mode, prefersDark) => (mode === 'light' || mode === 'dark' ? mode : prefersDark ? 'dark' : 'light');

// Holds the current mode and applies it. `media` is matchMedia('(prefers-color-scheme: dark)'), if any.
// `initial` overrides the remembered mode for this visit only (for example ?theme=dark).
export function createThemeController({ theme, root, store, media = null, initial = null }) {
  const saved = store.loadSettings().theme;
  let mode = MODES.includes(initial) ? initial : MODES.includes(saved) ? saved : 'auto';
  const scheme = () => resolveScheme(mode, media?.matches === true);
  const apply = () => applyTheme(theme, root, scheme());
  media?.addEventListener?.('change', apply); // the device switched while we are on Automatic
  return {
    get mode() { return mode; },
    scheme,
    apply,
    // Automatic, then Light, then Dark, then back to Automatic.
    cycle() {
      mode = nextMode(mode);
      store.saveSettings({ ...store.loadSettings(), theme: mode });
      apply();
      return mode;
    },
  };
}

// The round button at the top right. Its icon and spoken label show the current choice.
export function createThemeToggle(controller) {
  const describe = () => `Colour theme: ${MODE_INFO[controller.mode].label}. Press to change.`;
  const button = h('button', { class: 'theme-toggle', type: 'button', id: 'theme-toggle' });
  const paint = () => {
    button.textContent = MODE_INFO[controller.mode].icon;
    button.setAttribute('aria-label', describe());
    button.setAttribute('title', describe());
  };
  button.addEventListener('click', () => { controller.cycle(); paint(); });
  paint();
  return button;
}
