// Replaces everything inside `root`. Unlike a bare replaceChildren, it skips undefined / null / false
// (which the DOM would otherwise print as the words "undefined" / "null" / "false").
export function mount(root, ...children) {
  root.replaceChildren(...children.flat().filter(c => c != null && c !== false));
}

// Tiny element builder. Text goes in via textContent, never as HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
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
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
