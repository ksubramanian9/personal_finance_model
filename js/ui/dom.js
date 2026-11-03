// Replaces everything inside `root`. Unlike a bare replaceChildren, it skips undefined / null / false
// (which the DOM would otherwise print as the words "undefined" / "null" / "false").
export function mount(root, ...children) {
  root.replaceChildren(...children.flat().filter(c => c != null && c !== false));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// The document to build elements with. Tests can swap in a fake one (see tests/fakeDom.js), in Node and in a
// browser alike, because a real browser's own document cannot be replaced.
const doc = () => globalThis.__testDocument ?? document;

// Same idea as h(), for SVG elements (they need their own namespace). Attributes only; class is
// set as an attribute.
export function svg(tag, props = {}, ...children) {
  const el = doc().createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : doc().createTextNode(String(c)));
  }
  return el;
}

// Tiny element builder. Text goes in via textContent, never as HTML.
export function h(tag, props = {}, ...children) {
  const el = doc().createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked' || k === 'hidden' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : doc().createTextNode(String(c)));
  }
  return el;
}
