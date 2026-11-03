// Retirement: the day the pay stops (mutates `s`). Called by tickYear in the first year at or past the
// retirement age.
//   - a pension, for a persona that has one, becomes a share of the last pay and then rises with prices
//   - everyday costs become the chosen share of the last working year's
//   - parents' support ends, and the job's own cover, learning and raises end with the job
//   - provident funds unlock (the sell order in tick.js includes them from now on)
export function retire(s, params) {
  s.retired = true;
  s.pension = s.career.pension ? s.salary * params.retirement.pension.shareOfLastPay : 0;
  s.salary = 0;
  s.learningPct = 0;
  s.growthBoost = 0;
  s.support = 0;
  s.livingCost *= s.retireSpendPct;
}
