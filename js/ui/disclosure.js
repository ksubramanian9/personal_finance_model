// How much detail the player has asked for. Nothing here opens by itself: only a tap raises the level.
//   1  Story: decade cards, one question at a time, no tables or percentages
//   2  Why: causal explanations, charts, year-by-year tables, today's-vs-nominal rupees
//   3  Under the hood: seed, parameters, overrides (arrives in a later step)
// The level, once raised, stays for the session so the player is not asked twice.
export const LEVEL = { story: 1, why: 2, hood: 3 };

export function createDisclosure({ level = LEVEL.story, real = true } = {}) {
  const d = {
    level,
    real, // true: today's rupees (the default). false: the rupees of each year.
    open(n) { d.level = Math.max(d.level, n); },
    close() { d.level = LEVEL.story; },
    isOpen(n) { return d.level >= n; },
    setReal(value) { d.real = Boolean(value); },
  };
  return d;
}
