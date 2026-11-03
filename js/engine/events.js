import { nextFloat } from './rng.js';

// Life events. Two steps, kept apart so each can be tested alone:
//   rollEvents    decides what happens this year (uses the events random stream)
//   settleEvents  works out what each event does to this year's money (no randomness)
//
// The player's choices change how much an event hurts (insurance, savings), never whether it happens.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = ([lo, hi], u) => lo + (hi - lo) * u;
// `shape` > 1 makes small amounts common and big ones rare (u squared, cubed...).
const amountReal = (def, u) => lerp(def.amountReal, u ** (def.shape ?? 1));

function ageMult(bands, age) {
  for (const [maxAge, mult] of bands) if (age <= maxAge) return mult;
  return bands[bands.length - 1][1];
}

// Chance this event happens this year, from the file's base chance (or the persona's, for layoffs),
// the economy, the player's age and, where the file says so, how strong their skills are.
export function eventProbability(def, state, regime) {
  const { prob } = def;
  if (state.retired && (def.kind === 'jobLoss' || def.kind === 'payJump')) return 0; // no job left to lose or leave
  if (prob.requiresCareerPositive && !(state.career[prob.requiresCareerPositive] > 0)) return 0;
  const base = prob.fromEffort !== undefined ? prob.fromEffort * state.effort ** 2
    : prob.fromCareer ? (state.career[prob.fromCareer] ?? 0) : prob.base;
  const capability = clamp(1 + (def.capabilityEffect ?? 0) * state.growthBoost, 0.2, 3);
  return clamp(base * def.regimeMult[regime] * ageMult(def.ageMult, state.age) * capability, 0, 0.95);
}

// Mutates state.rngEvents. Always draws exactly 3 numbers per event (did it happen, how big, a
// second size), in the order of the file, so one event never shifts another's luck.
export function rollEvents(state, events, regime) {
  return events.map(def => {
    const roll = nextFloat(state.rngEvents);
    const u1 = nextFloat(state.rngEvents);
    const u2 = nextFloat(state.rngEvents);
    return { def, occurred: roll < eventProbability(def, state, regime), u1, u2 };
  });
}

// What this year's events do to the money. `priceIndex` turns today's rupees into this year's.
// Returns plain numbers (nominal) plus `records` for the UI (real rupees, ready to display).
export function settleEvents(state, rolled, insurance, priceIndex) {
  const happened = rolled.filter(r => r.occurred);
  const out = {
    salaryReceived: state.salary, severance: 0, extraIncome: 0,
    taxableExtra: 0,     // the part of extraIncome that income tax applies to
    eventCost: 0,        // what the player pays out of pocket
    insurancePaid: 0,    // what insurance paid
    payHit: 0, payJump: 0, lostJob: false, records: [],
  };

  // Job loss first: it also takes away the employer's health cover for the year.
  const loss = happened.find(r => r.def.kind === 'jobLoss');
  if (loss) {
    const { def } = loss;
    const months = lerp(def.monthsOut, loss.u1);
    out.lostJob = true;
    out.salaryReceived = state.salary * (12 - months) / 12;
    out.severance = (state.salary / 12) * (state.career.severanceMonths ?? def.severanceMonths);
    out.payHit = lerp(def.payHitPct, loss.u2) / 100;
    out.records.push({ id: def.id, months, pct: out.payHit * 100, severanceReal: out.severance / priceIndex });
  }

  // Burnout: months off, mostly unpaid, but the job and its cover stay. A layoff in the same year takes precedence.
  const burn = !loss && happened.find(r => r.def.kind === 'burnout');
  if (burn) {
    const months = lerp(burn.def.monthsOut, burn.u1);
    out.salaryReceived = state.salary * (12 - months) / 12;
    out.records.push({ id: burn.def.id, months });
  }

  // Cover left this year, shared by all medical events: employer first, then the player's policy.
  const cover = {
    employer: state.career.employerHealthCover && !out.lostJob && !state.retired ? insurance.employerCoverReal * priceIndex : 0,
    player: state.healthCover * priceIndex,
  };

  for (const r of happened) {
    const { def } = r;
    if (def.kind === 'payJump') {
      out.payJump = state.career.jobSwitchJumpPct / 100;
      out.records.push({ id: def.id, pct: state.career.jobSwitchJumpPct });
    } else if (def.kind === 'expense') {
      const cost = amountReal(def, r.u1) * priceIndex;
      let covered = 0;
      for (const who of def.coveredBy) {
        const take = Math.min(cost - covered, cover[who]);
        cover[who] -= take;
        covered += take;
      }
      out.insurancePaid += covered;
      out.eventCost += cost - covered;
      out.records.push({ id: def.id, costReal: cost / priceIndex, coveredReal: covered / priceIndex, pocketReal: (cost - covered) / priceIndex });
    } else if (def.kind === 'windfall') {
      const amount = amountReal(def, r.u1) * priceIndex;
      out.extraIncome += amount;
      if (def.taxable) out.taxableExtra += amount;
      out.records.push({ id: def.id, amountReal: amount / priceIndex });
    }
  }
  return out;
}
