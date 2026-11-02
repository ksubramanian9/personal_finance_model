// Minimal test harness. Works in the browser (tests.html) and in Node.
const tests = [];

export function test(name, fn) { tests.push({ name, fn }); }

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function assertEqual(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e} but got ${a}`.trim());
}

export async function assertThrows(fn, includes, msg = 'expected a throw') {
  try { await fn(); } catch (err) {
    if (includes && !err.message.includes(includes)) {
      throw new Error(`${msg}: error was "${err.message}", wanted text "${includes}"`);
    }
    return;
  }
  throw new Error(msg);
}

export async function runAll() {
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); }
    catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
