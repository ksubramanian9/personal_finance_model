// Marriage, a partner's pay and children. Pure functions on the state; no randomness.
//
// The player chooses *when* to marry (state.marryAge, 0 = not planned), how big the wedding is
// (state.weddingReal, today's rupees), whether the partner works (state.spousePct, their pay as a
// share of the player's), and how many children to have (state.childPlan). Everything then happens
// on schedule, so the same choices always give the same family.
//
//   state.spouse    null, or { year } the year they married
//   state.children  the years each child was born

// Marries at the start of a year (mutates `s`). Returns the wedding bill, nominal.
export function marry(s, params) {
  const m = params.family.marriage;
  s.spouse = { year: s.year };
  s.livingCost *= m.livingCostMultiplier;
  s.rent *= m.rentMultiplier;      // a larger place, while renting
  s.rentReal *= m.rentMultiplier;  // and if the player goes back to renting later
  return { weddingCost: s.weddingReal * s.priceIndex };
}

// Is a child due this year? Two years after the wedding for the first, then a fixed gap.
export function birthDue(s, params) {
  const c = params.family.children;
  if (!s.spouse || s.children.length >= s.childPlan) return false;
  if (s.children.length === 0) return s.year - s.spouse.year >= c.firstBirthAfterMarriageYears;
  return s.year - s.children[s.children.length - 1] >= c.gapYears;
}

// Which cost band a child of this age is in, or null once they are grown up.
export function costBand(age, params) {
  return params.family.children.costBands.find(b => age <= b.upToAge) ?? null;
}

// What this year's children cost, nominal. `educationIndex` is how much dearer school and college have
// become compared with general prices.
export function childCosts(s, params) {
  const scale = params.family.children.costScaleByTier[s.cityTier] ?? 1;
  let cost = 0;
  for (const born of s.children) {
    const band = costBand(s.year - born, params);
    if (band) cost += band.costReal * scale * s.priceIndex * (band.education ? s.educationIndex : 1);
  }
  return cost;
}

// The partner's pay this year, before their own tax, nominal. Zero while single.
export const spouseGross = (s) => (s.spouse ? s.salary * s.spousePct : 0);
