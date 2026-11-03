// Level 3 data browser: finds every provenance block (basis, confidence, asOf) in the loaded files and
// the numbers it covers. Pure; no DOM.

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isProv = (x) => isObj(x) && typeof x.basis === 'string' && typeof x.confidence === 'string';

// What a provenance block covers: its container without the provenance and without any nested part that
// carries its own.
function covered(container) {
  if (Array.isArray(container)) return container.filter(x => !(isObj(x) && isProv(x.provenance)));
  const out = {};
  for (const [k, v] of Object.entries(container)) {
    if (k === 'provenance') continue;
    if (isObj(v) && isProv(v.provenance)) continue;
    if (Array.isArray(v)) { const rest = v.filter(x => !(isObj(x) && isProv(x.provenance))); if (rest.length) out[k] = rest; continue; }
    out[k] = v;
  }
  return out;
}

// files: { 'macro.json': object, ... } -> [{ file, path, basis, confidence, asOf, numbers }]
export function collectSources(files) {
  const out = [];
  const walk = (file, node, path) => {
    if (Array.isArray(node)) { node.forEach((x, i) => walk(file, x, `${path}[${isObj(x) && (x.id ?? x.name) ? (x.id ?? x.name) : i}]`)); return; }
    if (!isObj(node)) return;
    if (isProv(node.provenance)) {
      out.push({ file, path: path || '(whole file)', basis: node.provenance.basis, confidence: node.provenance.confidence, asOf: node.provenance.asOf, numbers: covered(node) });
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'provenance') walk(file, v, path ? `${path}.${k}` : k);
  };
  for (const [file, data] of Object.entries(files)) walk(file, data, '');
  return out;
}
