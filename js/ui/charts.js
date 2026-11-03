import { h, svg, mount } from './dom.js';
import { formatINR, formatINRShort } from './format.js';

// Hand-drawn SVG charts. Marks follow the dataviz mark specs: columns at most 24px with a 4px rounded
// data end and square at the baseline, 2px gaps between stacked segments, 2px lines, hairline grid.
// Colours come from CSS variables (--ch-*), filled from data/theme.json, one fixed colour per entity.
// Every chart has a legend, a readout that follows hover, tap or the arrow keys, and a table twin
// (see whyPanel.js), so no value is available only through colour or a tooltip.

const W = 520;
const H = 300;
const M = { l: 58, r: 16, t: 14, b: 32 };
const PLOT_W = W - M.l - M.r;
const PLOT_H = H - M.t - M.b;
const GAP = 2;
const BAR_MAX = 24;
const RADIUS = 4;

// Bottom to top: the safest and most liquid first, the riskiest on top.
export const STACK_ORDER = ['cash', 'fd', 'pf', 'gold', 'equity', 'home'];

const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Round tick values (1, 2, 2.5, 5 x 10^k) that cover [min, max].
export function niceTicks(min, max, target = 5) {
  if (!(max > min)) max = min + 1;
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const n = Math.round((hi - lo) / step);
  return { ticks: Array.from({ length: n + 1 }, (_, i) => lo + i * step), min: lo, max: hi, step };
}

// Axis for columns that may hang below the line. Positive values set the ticks. Loans extend the
// axis downward to scale: a whole extra step if they are a real fraction of one (so there is a tick to
// read them against), otherwise just their own height, so a few lakh of loan beside a crore-scale peak
// does not waste half the chart on empty space.
export function stackedDomain(maxPos, maxLoan) {
  const step = niceTicks(0, Math.max(maxPos, maxLoan, 1)).step; // suits whichever side is bigger
  const up = Math.max(1, Math.ceil(maxPos / step - 1e-9));
  const positive = Array.from({ length: up + 1 }, (_, i) => i * step);
  const top = up * step;
  if (!(maxLoan > 0)) return { ticks: positive, min: 0, max: top, step };
  if (maxLoan <= 0.25 * step) return { ticks: positive, min: -maxLoan, max: top, step };
  const down = Math.ceil(maxLoan / step - 1e-9);
  const negative = Array.from({ length: down }, (_, i) => -(down - i) * step);
  return { ticks: [...negative, ...positive], min: -down * step, max: top, step };
}

// A column whose top two corners are rounded and bottom is square.
function roundedTop(x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt);
  return `M${r2(x)},${r2(y + hgt)} V${r2(y + r)} Q${r2(x)},${r2(y)} ${r2(x + r)},${r2(y)} H${r2(x + w - r)} Q${r2(x + w)},${r2(y)} ${r2(x + w)},${r2(y + r)} V${r2(y + hgt)} Z`;
}
// ...and the mirror image, for columns that hang below the baseline.
function roundedBottom(x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt);
  return `M${r2(x)},${r2(y)} H${r2(x + w)} V${r2(y + hgt - r)} Q${r2(x + w)},${r2(y + hgt)} ${r2(x + w - r)},${r2(y + hgt)} H${r2(x + r)} Q${r2(x)},${r2(y + hgt)} ${r2(x)},${r2(y + hgt - r)} Z`;
}

const swatch = (cssVar, extra = '') => h('span', { class: 'swatch', 'aria-hidden': 'true', style: `background: var(${cssVar});${extra}` });
const colorVar = (id) => `--ch-${id}`;

// Gridlines, y labels, baseline and x labels shared by both charts.
function frame(rows, dom, y) {
  const slot = PLOT_W / rows.length;
  const labelEvery = rows.length > 45 ? 10 : rows.length > 14 ? 5 : 2;
  const els = [];
  for (const t of dom.ticks) {
    els.push(svg('line', { class: 'grid', x1: M.l, x2: W - M.r, y1: r2(y(t)), y2: r2(y(t)) }));
    els.push(svg('text', { class: 'axis-label', x: M.l - 8, y: r2(y(t) + 4), 'text-anchor': 'end', text: formatINRShort(t) }));
  }
  els.push(svg('line', { class: 'baseline', x1: M.l, x2: W - M.r, y1: r2(y(0)), y2: r2(y(0)) }));
  rows.forEach((r, i) => {
    if (r.age % labelEvery !== 0) return;
    els.push(svg('text', { class: 'axis-label', x: r2(M.l + slot * (i + 0.5)), y: H - 10, 'text-anchor': 'middle', text: String(r.age) }));
  });
  els.push(svg('text', { class: 'axis-label axis-title', x: W - M.r, y: H - 10, 'text-anchor': 'end', text: 'age' }));
  return els;
}

// Hover, tap and keyboard: moving the active year moves the highlight and rewrites the readout.
function interaction(rows, describe) {
  const slot = PLOT_W / rows.length;
  const readout = h('div', { class: 'chart-readout' });
  const highlight = svg('rect', { class: 'active-year', y: M.t, height: PLOT_H, rx: 4 });
  let active = rows.length - 1;

  function setActive(i) {
    active = clamp(i, 0, rows.length - 1);
    highlight.setAttribute('x', r2(M.l + slot * active));
    highlight.setAttribute('width', r2(slot));
    mount(readout, ...describe(rows[active])); // mount drops the `false` from `cond && element`
  }
  const hits = rows.map((r, i) => svg('rect', {
    class: 'hit', x: r2(M.l + slot * i), y: M.t, width: r2(slot), height: PLOT_H, fill: 'transparent',
    onPointerenter: () => setActive(i), onClick: () => setActive(i),
  }));
  function onKey(e) {
    const moves = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: rows.length - 1 };
    if (!(e.key in moves)) return;
    e.preventDefault();
    setActive(moves[e.key]);
  }
  setActive(active);
  return { readout, highlight, hits, onKey };
}

function figure({ title, hint, legend, plot, readout, onKey, label }) {
  return h('figure', { class: 'chart' },
    h('h3', { text: title }),
    h('p', { class: 'hint', text: hint }),
    h('ul', { class: 'legend' }, legend.map(item => h('li', {}, item.swatch, item.label))),
    h('div', { class: 'chart-frame', tabindex: '0', role: 'group', 'aria-label': label, onKeydown: onKey }, plot),
    readout);
}

// Stacked columns: where your money sat each year, with loans hanging below the line.
// `title` is for a chart of one decade; `zoomHint` adds the reminder that early years look small
// beside a lifetime peak (the scale is linear, so we say so instead of bending it).
export function netWorthChart(rows, { instruments, real, title = 'What you owned', zoomHint = false }) {
  const ids = STACK_ORDER.filter(id => id === 'cash' || (id === 'home' ? rows.some(r => r.parts.home > 0) : instruments.some(i => i.id === id)));
  const label = (id) => (id === 'cash' ? 'Cash savings' : id === 'home' ? 'Your home' : instruments.find(i => i.id === id).name);
  const totalOf = (r) => ids.reduce((a, id) => a + r.parts[id], 0);
  const maxPos = Math.max(0, ...rows.map(totalOf));
  const maxLoan = Math.max(0, ...rows.map(r => r.loans));
  const dom = stackedDomain(maxPos, maxLoan);
  const y = (v) => M.t + ((dom.max - v) / (dom.max - dom.min)) * PLOT_H;
  const slot = PLOT_W / rows.length;
  const bw = Math.min(BAR_MAX, slot * 0.72);
  const ia = interaction(rows, (r) => [
    h('p', { class: 'readout-head', text: `Age ${r.age} · net worth ${formatINR(r.net)}` }),
    h('ul', { class: 'readout-parts' },
      [...ids].reverse().filter(id => r.parts[id] > 0.5).map(id => h('li', {}, swatch(colorVar(id)), `${label(id)} ${formatINR(r.parts[id])}`)),
      r.loans > 0.5 && h('li', {}, swatch(colorVar('loans')), `Loans ${formatINR(r.loans)}`)),
  ]);

  const bars = [];
  rows.forEach((r, i) => {
    const x = M.l + slot * i + (slot - bw) / 2;
    const present = ids.filter(id => r.parts[id] > 0);
    let cum = 0;
    for (const id of present) {
      const v = r.parts[id];
      const top = y(cum + v);
      const bottom = y(cum) - (cum > 0 ? GAP : 0); // a surface-coloured gap between segments
      const hgt = bottom - top;
      const isTop = id === present[present.length - 1];
      cum += v;
      if (hgt < 0.5) continue;
      const style = `fill: var(${colorVar(id)})`;
      bars.push(isTop && hgt > 1
        ? svg('path', { class: `seg seg-${id}`, d: roundedTop(x, top, bw, hgt, RADIUS), style })
        : svg('rect', { class: `seg seg-${id}`, x: r2(x), y: r2(top), width: r2(bw), height: r2(hgt), style }));
    }
    if (r.loans > 0.5) {
      const hgt = y(-r.loans) - y(0); // from the baseline down, to scale
      if (hgt > 0.5) bars.push(svg('path', { class: 'seg seg-loans', d: roundedBottom(x, y(0), bw, hgt, RADIUS), style: `fill: var(${colorVar('loans')})` }));
    }
  });

  // One direct label, on the last column: where you ended up.
  const last = rows[rows.length - 1];
  const lastX = M.l + slot * (rows.length - 1) + (slot + bw) / 2;
  const endLabel = svg('text', { class: 'end-label', x: r2(lastX), y: r2(y(totalOf(last)) - 6), 'text-anchor': 'end', text: formatINRShort(last.net) });

  const plot = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', 'aria-hidden': 'true', focusable: 'false' },
    ...frame(rows, dom, y), ia.highlight, ...bars, endLabel, ...ia.hits);

  const legend = [...ids].reverse().map(id => ({ swatch: swatch(colorVar(id)), label: label(id) }));
  if (maxLoan > 0) legend.push({ swatch: swatch(colorVar('loans')), label: 'Loans (below the line)' });

  return figure({
    title,
    hint: `Each column is a year, stacked by where the money sat, ${real ? "in today's rupees" : 'in the rupees of that year'}.${zoomHint ? ' Early years look small beside later ones; open a decade with "Why?" for a closer look.' : ''}`,
    legend, plot, readout: ia.readout, onKey: ia.onKey,
    label: 'Net worth by age. Use the left and right arrow keys to step through the years.',
  });
}

// Two lines, earned and spent, with slowdowns and crises shaded behind them.
export function cashflowChart(rows, { regimes, eventDefs, real }) {
  const max = Math.max(1, ...rows.map(r => Math.max(r.earned, r.spent)));
  const dom = niceTicks(0, max);
  const y = (v) => M.t + ((dom.max - v) / (dom.max - dom.min)) * PLOT_H;
  const slot = PLOT_W / rows.length;
  const x = (i) => M.l + slot * (i + 0.5);

  const ia = interaction(rows, (r) => [
    h('p', { class: 'readout-head', text: `Age ${r.age} · ${regimes[r.regime].emoji} ${regimes[r.regime].name}` }),
    h('ul', { class: 'readout-parts' },
      h('li', {}, swatch('--ch-earned'), `Earned ${formatINR(r.earned)}`),
      h('li', {}, swatch('--ch-spent'), `Spent ${formatINR(r.spent)}`),
      h('li', {}, `Saved ${formatINR(r.saved)}`)),
    r.events.length > 0 && h('p', { class: 'readout-events', text: r.events.map(id => `${eventDefs[id].emoji} ${eventDefs[id].name}`).join(' · ') }),
  ]);

  const bands = [];
  rows.forEach((r, i) => {
    if (r.regime !== 'slowdown' && r.regime !== 'crisis') return;
    bands.push(svg('rect', { class: `band band-${r.regime}`, x: r2(M.l + slot * i), y: M.t, width: r2(slot), height: PLOT_H }));
  });

  const line = (key) => 'M' + rows.map((r, i) => `${r2(x(i))},${r2(y(r[key]))}`).join(' L');
  const last = rows[rows.length - 1];
  const lastI = rows.length - 1;
  const earnedAbove = last.earned >= last.spent;
  const dot = (key, cssVar) => svg('circle', { class: 'end-dot', cx: r2(x(lastI)), cy: r2(y(last[key])), r: 4.5, style: `fill: var(${cssVar})` });
  const tag = (key, text, above) => svg('text', {
    class: 'end-label', x: r2(x(lastI) + 4), y: r2(y(last[key]) + (above ? -10 : 17)), 'text-anchor': 'end', text,
  });

  const plot = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', 'aria-hidden': 'true', focusable: 'false' },
    ...frame(rows, dom, y), ...bands, ia.highlight,
    svg('path', { class: 'line', d: line('earned'), style: 'stroke: var(--ch-earned)' }),
    svg('path', { class: 'line', d: line('spent'), style: 'stroke: var(--ch-spent)' }),
    dot('earned', '--ch-earned'), dot('spent', '--ch-spent'),
    tag('earned', 'Earned', earnedAbove), tag('spent', 'Spent', !earnedAbove),
    ...ia.hits);

  const legend = [
    { swatch: swatch('--ch-earned'), label: 'Earned' },
    { swatch: swatch('--ch-spent'), label: 'Spent' },
    { swatch: swatch('--ch-band', ' opacity: 0.12;'), label: 'Slowdown year' },
    { swatch: swatch('--ch-band', ' opacity: 0.28;'), label: 'Crisis year' },
  ];

  return figure({
    title: 'What came in and what went out',
    hint: `Earned is pay and windfalls. Spent is bills, premiums, surprises and the part of your leftover you spent, ${real ? "in today's rupees" : 'in the rupees of that year'}. When spent is above earned, the difference came out of savings or loans.`,
    legend, plot, readout: ia.readout, onKey: ia.onKey,
    label: 'Earned and spent by age. Use the left and right arrow keys to step through the years.',
  });
}
