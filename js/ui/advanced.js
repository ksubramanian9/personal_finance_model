import { h, mount } from './dom.js';
import { OVERRIDE_FIELDS, normalizeOverrides } from '../data/overrides.js';

const CONFIDENCE_LABEL = { high: 'high confidence', medium: 'medium confidence', low: 'low confidence' };

function numbersText(numbers) {
  // Plain words for yes and no, so the page never prints the programmer's "true", "false" and "null".
  const text = JSON.stringify(numbers, (k, v) => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : v === null ? 'none' : v), 1);
  return text.length > 1600 ? `${text.slice(0, 1600)}\n...` : text;
}

// "Where the numbers come from": every provenance block in every data file, grouped by file.
function dataBrowser(entries) {
  const files = [...new Set(entries.map(e => e.file))];
  return h('details', { class: 'data-browser' },
    h('summary', { text: `Where the numbers come from (${entries.length} sources)` }),
    h('p', { class: 'hint', text: 'Every number in the game, with where it comes from and how sure we are. Most are illustrative. Nothing here can be changed.' }),
    files.map(file => h('details', { class: 'source-file' },
      h('summary', { text: file }),
      entries.filter(e => e.file === file).map(e => h('details', { class: 'source', 'data-confidence': e.confidence },
        h('summary', {}, h('span', { class: 'source-path', text: e.path }), h('span', { class: `source-tag conf-${e.confidence}`, text: `${CONFIDENCE_LABEL[e.confidence] ?? e.confidence} · ${e.asOf}` })),
        h('p', { class: 'source-basis', text: e.basis }),
        h('pre', { class: 'source-numbers', text: numbersText(e.numbers) }))))));
}

// Level 3, behind the Advanced toggle. `session` is mutated: { seed, script, overrides }.
// ctx: { session, params, entries, randomSeed, onReset }
export function advancedPanel(ctx) {
  const { session, params } = ctx;
  const scripts = params.macro.scripts ?? {};
  const overrides = () => session.overrides ?? {};

  const seedInput = h('input', { type: 'text', id: 'seed-input', value: String(session.seed ?? ''), 'aria-label': 'Seed' });
  seedInput.addEventListener('change', () => { const v = String(seedInput.value ?? '').trim(); if (v) session.seed = v; });

  const scriptChip = (id, name, blurb) => h('label', { class: 'chip', title: blurb },
    h('input', { type: 'radio', name: 'economy-script', value: id ?? '', checked: (session.script ?? null) === id, onChange: () => { session.script = id; } }),
    h('span', { text: name }));

  const numberField = ([id, f]) => {
    const input = h('input', { type: 'number', id: `override-${id}`, min: f.min, max: f.max, step: f.step, value: String(overrides()[id] ?? 0), 'aria-label': f.label });
    input.addEventListener('change', () => { session.overrides = normalizeOverrides({ ...overrides(), [id]: input.value }); });
    return h('label', { class: 'override-row' }, h('span', { class: 'override-label', text: f.label }), input, h('span', { class: 'hint', text: f.unit }));
  };

  const taxBox = h('input', { type: 'checkbox', id: 'override-tax', checked: overrides().taxOn === false });
  taxBox.addEventListener('change', () => { session.overrides = normalizeOverrides({ ...overrides(), taxOn: taxBox.checked ? false : true }); });

  return h('details', { class: 'advanced hood' },
    h('summary', { text: 'Advanced: under the hood' }),
    h('p', { class: 'hint', text: 'For the curious. Nothing here is on unless you change it. Changes apply to the next life only and are marked on its end screen.' }),
    h('div', { class: 'hood-row' },
      h('label', { for: 'seed-input', text: 'Seed ' }), seedInput,
      h('button', { class: 'btn secondary small', type: 'button', text: 'Random seed', onClick: () => { session.seed = ctx.randomSeed(); seedInput.value = String(session.seed); } }),
      h('span', { class: 'hint', text: 'The same seed and the same choices give the same life.' })),
    Object.keys(scripts).length > 0 && h('fieldset', { class: 'choice-row' },
      h('legend', { text: 'The economy' }),
      scriptChip(null, 'Random weather', 'Dice decide, as usual'),
      Object.entries(scripts).map(([id, s]) => scriptChip(id, `${s.emoji} ${s.name}`, s.blurb))),
    h('fieldset', { class: 'overrides' },
      h('legend', { text: 'A few numbers you can change' }),
      Object.entries(OVERRIDE_FIELDS).map(numberField),
      h('label', { class: 'override-row' }, taxBox, h('span', { text: 'Pretend there is no tax' }))),
    h('button', { class: 'btn secondary small', type: 'button', text: 'Reset to defaults', onClick: () => { session.script = null; session.overrides = {}; ctx.onReset(); } }),
    dataBrowser(ctx.entries));
}
