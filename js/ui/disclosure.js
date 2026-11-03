// How much detail the player has asked for. Nothing here opens by itself: only a tap raises the level.
//   1  Story: decade cards, one question at a time, no tables or percentages
//   2  Why: causal explanations, charts, year-by-year tables, today's-vs-nominal rupees
//   3  Under the hood: seed, economy scripts, parameters and overrides
// The level, once raised, stays so the player is not asked twice. `onChange` is called after any change,
// so the choice can be remembered between visits.
export const LEVEL = { story: 1, why: 2, hood: 3 };

export function createDisclosure({ level = LEVEL.story, real = true, onChange = () => {} } = {}) {
  const d = {
    level,
    real, // true: today's rupees (the default). false: the rupees of each year.
    open(n) { d.level = Math.max(d.level, n); onChange(d); },
    close() { d.level = LEVEL.story; onChange(d); },
    isOpen(n) { return d.level >= n; },
    setReal(value) { d.real = Boolean(value); onChange(d); },
  };
  return d;
}
