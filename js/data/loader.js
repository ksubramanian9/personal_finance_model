import { validate } from './validate.js';

// Fetch a JSON file and explain failures in plain words.
// `fetchImpl` is injectable so tests can run without a server.
export async function loadJSON(path, { schema, label, fetchImpl = fetch } = {}) {
  const name = label || path;
  let res;
  try {
    res = await fetchImpl(path);
  } catch (err) {
    throw new Error(`Could not reach ${name}. Is the page served through liveserver (not opened as a file)?`);
  }
  if (!res.ok) throw new Error(`Could not load ${name} (HTTP ${res.status}).`);

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${err.message}`);
  }
  return schema ? validate(data, schema, name) : data;
}

// Writes theme tokens onto an element as CSS custom properties.
export function applyTheme(theme, root, scheme = 'light') {
  const dark = scheme === 'dark' && theme.dark;
  const colors = { ...theme.colors, ...(dark ? theme.dark.colors : {}) };
  const chart = { ...theme.chart, ...(dark ? theme.dark.chart : {}) };
  const set = (name, value) => root.style.setProperty(name, value);
  for (const [k, v] of Object.entries(colors)) set(`--c-${k}`, v);
  for (const [k, v] of Object.entries(theme.sizes)) set(`--s-${k}`, v);
  for (const [k, v] of Object.entries(chart)) set(`--ch-${k}`, v);
  set('color-scheme', dark ? 'dark' : 'light'); // so scrollbars and form controls follow
  if (root.dataset) root.dataset.theme = dark ? 'dark' : 'light';
  set('--f-display', theme.fonts.display);
  set('--f-body', theme.fonts.body);
}
