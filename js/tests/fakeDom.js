// A just-big-enough DOM for testing screens without a browser. The tests inspect it directly (attrs, dispatch),
// so tests.html uses it too: ui/dom.js builds elements with globalThis.__testDocument when it is set.

class FakeText {
  constructor(text) { this.nodeType = 3; this.data = String(text); }
  get textContent() { return this.data; }
}

class FakeElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.className = '';
    this.disabled = false;
    this.hidden = false;
    this.checked = false;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  // Like the real DOM: anything that is not a node is turned into text ("undefined", "false"...).
  append(...nodes) {
    for (const n of nodes) this.children.push(n && typeof n === 'object' && n.nodeType ? n : new FakeText(n));
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  get textContent() { return this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(v)]; }
  // Runs listeners for any event type (tests use this for pointer and key events).
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] ?? []) fn({ type, target: this, preventDefault() {}, ...event });
  }
  click() {
    if (this.disabled) return;
    for (const fn of this.listeners.click ?? []) fn({ type: 'click', target: this });
  }
}

const fakeDocument = {
  createElement: (tag) => new FakeElement(tag),
  createElementNS: (ns, tag) => Object.assign(new FakeElement(tag), { namespace: ns }),
  createTextNode: (t) => new FakeText(t),
};

export function installFakeDom() {
  globalThis.__testDocument = fakeDocument;
  if (typeof document === 'undefined') globalThis.document = fakeDocument; // Node: also make it the global one
  return true;
}

export const createRoot = () => fakeDocument.createElement('main');

// ---- query helpers (work on real elements too) ----

export function findAll(node, pred, out = []) {
  if (node.nodeType !== 1) return out;
  if (pred(node)) out.push(node);
  for (const c of node.children ?? Array.from(node.children)) findAll(c, pred, out);
  return out;
}

export const buttons = (root) => findAll(root, n => n.tagName === 'BUTTON');
export const buttonWithText = (root, re) => buttons(root).find(b => re.test(b.textContent));
// SVG elements keep their class as an attribute, HTML ones as className.
export const hasClass = (n, cls) => (n.className || n.attrs.class || '').split(/\s+/).includes(cls);
