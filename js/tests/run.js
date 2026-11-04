// Browser entry for tests.html. Add new *.test.js imports here.
import { runAll } from './harness.js';
import './scaffold.test.js';
import './format.test.js';
import './personas.test.js';
import './engine.test.js';
import './macro.test.js';
import './events.test.js';
import './tax.test.js';
import './housing.test.js';
import './family.test.js';
import './retirement.test.js';
import './capability.test.js';
import './nudges.test.js';
import './level3.test.js';
import './about.test.js';
import './learn.test.js';
import './morepersonas.test.js';
import './theme.test.js';
import './explain.test.js';
import './charts.test.js';
import './stages.test.js';
import './flow.test.js';

const results = await runAll();
const failed = results.filter(r => !r.ok);

document.getElementById('summary').textContent =
  failed.length ? `${failed.length} of ${results.length} failed` : `All ${results.length} tests passed`;
document.getElementById('summary').className = failed.length ? 'fail' : 'pass';

const list = document.getElementById('results');
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}`;
  if (!r.ok) {
    const pre = document.createElement('pre');
    pre.textContent = r.error;
    li.append(pre);
  }
  list.append(li);
}
