// Node entry: `node js/tests/run-node.mjs`. Same tests as tests.html; engine has no DOM.
import { runAll } from './harness.js';
import './scaffold.test.js';

const results = await runAll();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : `\n     ${r.error}`}`);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
