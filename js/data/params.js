import { loadJSON } from './loader.js';
import { ValidationError, schemas } from './validate.js';

const CONFIDENCE = ['high', 'medium', 'low'];
const isStr = (x) => typeof x === 'string' && x.length > 0;
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function checkProvenance(p, at, problems) {
  if (!p || typeof p !== 'object') return problems.push(`"${at}.provenance" is missing`);
  if (!isStr(p.basis)) problems.push(`"${at}.provenance.basis" is missing`);
  if (!CONFIDENCE.includes(p.confidence)) problems.push(`"${at}.provenance.confidence" should be one of ${CONFIDENCE.join(', ')}`);
  if (!isNum(p.asOf)) problems.push(`"${at}.provenance.asOf" should be a year`);
}

export function checkMacro(m, label) {
  const problems = [];
  const ids = m.order;
  if (!ids.length || new Set(ids).size !== ids.length) problems.push('"order" should list each regime once');
  if (!ids.includes(m.start)) problems.push(`"start" "${m.start}" is not in "order"`);

  for (const id of ids) {
    const r = m.regimes[id];
    if (!r) { problems.push(`"regimes.${id}" is missing`); continue; }
    for (const f of ['name', 'emoji', 'blurb']) if (!isStr(r[f])) problems.push(`"regimes.${id}.${f}" is missing`);
    if (!isNum(r.inflationPct) || r.inflationPct < 0 || r.inflationPct > 25) problems.push(`"regimes.${id}.inflationPct" should be a number from 0 to 25`);
    if (!isNum(r.wageAdjPct) || Math.abs(r.wageAdjPct) > 15) problems.push(`"regimes.${id}.wageAdjPct" should be a number from -15 to 15`);

    const row = m.transitions[id];
    if (!row) { problems.push(`"transitions.${id}" is missing`); continue; }
    let sum = 0;
    for (const to of ids) {
      const x = row[to];
      if (!isNum(x) || x < 0 || x > 1) problems.push(`"transitions.${id}.${to}" should be a probability from 0 to 1`);
      else sum += x;
    }
    if (Math.abs(sum - 1) > 1e-9) problems.push(`"transitions.${id}" should add up to 1 but adds up to ${Math.round(sum * 1e6) / 1e6}`);
    for (const to of Object.keys(row)) if (!ids.includes(to)) problems.push(`"transitions.${id}.${to}" is not a known regime`);
  }
  for (const id of Object.keys(m.regimes)) if (!ids.includes(id)) problems.push(`"regimes.${id}" is not listed in "order"`);
  if (problems.length) throw new ValidationError(label, problems);
  return m;
}

export function checkInstruments(data, regimeIds, label) {
  const problems = [];
  const list = data.instruments;
  if (!list.length) problems.push('"instruments" is empty');
  const seen = new Set();
  list.forEach((inst, i) => {
    const at = `instruments[${i}]`;
    for (const f of ['id', 'name', 'emoji', 'blurb']) if (!isStr(inst[f])) problems.push(`"${at}.${f}" is missing`);
    if (seen.has(inst.id)) problems.push(`"${at}.id" "${inst.id}" is used twice`);
    seen.add(inst.id);
    if (typeof inst.liquid !== 'boolean') problems.push(`"${at}.liquid" should be true or false`);
    if (inst.liquid && !isNum(inst.drawOrder)) problems.push(`"${at}.drawOrder" is needed for a liquid instrument (lower numbers are sold first)`);
    for (const r of regimeIds) {
      const x = inst.returns?.[r];
      if (!x) { problems.push(`"${at}.returns.${r}" is missing`); continue; }
      if (!isNum(x.meanPct) || x.meanPct < -90 || x.meanPct > 100) problems.push(`"${at}.returns.${r}.meanPct" should be a number from -90 to 100`);
      if (!isNum(x.volPct) || x.volPct < 0 || x.volPct > 100) problems.push(`"${at}.returns.${r}.volPct" should be a number from 0 to 100`);
    }
    checkProvenance(inst.provenance, at, problems);
  });
  list.forEach((inst, i) => {
    if (inst.retiredDrawOrder !== undefined && !isNum(inst.retiredDrawOrder)) problems.push(`"instruments[${i}].retiredDrawOrder" should be a number`);
  });
  const orders = list.filter(i => i.liquid).map(i => i.drawOrder);
  if (new Set(orders).size !== orders.length) problems.push('liquid instruments should each have a different "drawOrder"');
  const retired = list.filter(i => !i.liquid && i.retiredDrawOrder !== undefined).map(i => i.retiredDrawOrder);
  if (retired.some(o => orders.includes(o))) problems.push('"retiredDrawOrder" should differ from every liquid instrument\'s "drawOrder"');
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

const EVENT_KINDS = ['jobLoss', 'payJump', 'expense', 'windfall', 'burnout'];
const COVERS = ['employer', 'player'];
const isRange = (r) => Array.isArray(r) && r.length === 2 && r.every(isNum) && r[0] >= 0 && r[0] <= r[1];

export function checkEvents(data, regimeIds, label) {
  const problems = [];
  const ins = data.insurance;
  if (ins.employerCoverReal < 0) problems.push('"insurance.employerCoverReal" should not be negative');
  if (ins.premiumAgeLoadingPct < 0 || ins.premiumAgeLoadingPct > 20) problems.push('"insurance.premiumAgeLoadingPct" should be from 0 to 20');
  if (!data.events.length) problems.push('"events" is empty');
  const seen = new Set();
  data.events.forEach((e, i) => {
    const at = `events[${i}]`;
    for (const f of ['id', 'emoji', 'name', 'story']) if (!isStr(e[f])) problems.push(`"${at}.${f}" is missing`);
    if (seen.has(e.id)) problems.push(`"${at}.id" "${e.id}" is used twice`);
    seen.add(e.id);
    if (!EVENT_KINDS.includes(e.kind)) problems.push(`"${at}.kind" should be one of ${EVENT_KINDS.join(', ')}`);

    const p = e.prob;
    if (!p || typeof p !== 'object') problems.push(`"${at}.prob" is missing`);
    else if (isNum(p.base)) { if (p.base < 0 || p.base > 1) problems.push(`"${at}.prob.base" should be a probability from 0 to 1`); }
    else if (isNum(p.fromEffort)) { if (p.fromEffort < 0 || p.fromEffort > 1) problems.push(`"${at}.prob.fromEffort" should be a probability from 0 to 1`); }
    else if (!isStr(p.fromCareer)) problems.push(`"${at}.prob" needs "base", "fromCareer" or "fromEffort"`);

    for (const r of regimeIds) {
      const m = e.regimeMult?.[r];
      if (!isNum(m) || m < 0 || m > 10) problems.push(`"${at}.regimeMult.${r}" should be a number from 0 to 10`);
    }
    const bands = e.ageMult;
    if (!Array.isArray(bands) || !bands.length) problems.push(`"${at}.ageMult" should list [maxAge, multiplier] bands`);
    else {
      bands.forEach((b, j) => {
        if (!Array.isArray(b) || !isNum(b[0]) || !isNum(b[1]) || b[1] < 0) problems.push(`"${at}.ageMult[${j}]" should be [maxAge, multiplier]`);
        else if (j > 0 && isNum(bands[j - 1][0]) && b[0] <= bands[j - 1][0]) problems.push(`"${at}.ageMult" ages should go up`);
      });
      const lastAge = bands[bands.length - 1]?.[0];
      if (!(lastAge >= 100)) problems.push(`"${at}.ageMult" should end with a band up to age 100 or more`);
    }
    if (e.capabilityEffect !== undefined && !isNum(e.capabilityEffect)) problems.push(`"${at}.capabilityEffect" should be a number`);

    if (e.kind === 'jobLoss') {
      if (!isRange(e.monthsOut) || e.monthsOut[1] > 12) problems.push(`"${at}.monthsOut" should be [min, max] months, at most 12`);
      if (!isNum(e.severanceMonths) || e.severanceMonths < 0) problems.push(`"${at}.severanceMonths" should be a number`);
      if (!isRange(e.payHitPct) || e.payHitPct[1] > 60) problems.push(`"${at}.payHitPct" should be [min, max] percent, at most 60`);
    }
    if (e.kind === 'burnout' && (!isRange(e.monthsOut) || e.monthsOut[1] > 12)) problems.push(`"${at}.monthsOut" should be [min, max] months, at most 12`);
    if (e.kind === 'expense' || e.kind === 'windfall') {
      if (!isRange(e.amountReal)) problems.push(`"${at}.amountReal" should be [min, max] in today's rupees`);
      if (!isNum(e.shape) || e.shape < 0.5 || e.shape > 6) problems.push(`"${at}.shape" should be a number from 0.5 to 6 (1 = even, higher = mostly small, sometimes big)`);
    }
    if (e.kind === 'windfall' && typeof e.taxable !== 'boolean') problems.push(`"${at}.taxable" should be true or false`);
    if (e.kind === 'expense') {
      if (!Array.isArray(e.coveredBy) || e.coveredBy.some(c => !COVERS.includes(c))) problems.push(`"${at}.coveredBy" should list any of ${COVERS.join(', ')}`);
    }
  });
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

const TAX_KINDS = ['exempt', 'interest', 'capitalGains'];

export function checkTax(data, instrumentIds, label) {
  const problems = [];
  const it = data.incomeTax;
  checkProvenance(it?.provenance, 'incomeTax', problems);
  const slabs = it?.slabs;
  if (!Array.isArray(slabs) || !slabs.length) problems.push('"incomeTax.slabs" should list the tax slabs');
  else {
    slabs.forEach((s, i) => {
      const last = i === slabs.length - 1;
      if (last ? s.upTo !== null : !isNum(s.upTo)) problems.push(`"incomeTax.slabs[${i}].upTo" should be ${last ? 'null (no upper limit)' : 'a number'}`);
      else if (i > 0 && !last && s.upTo <= slabs[i - 1].upTo) problems.push('"incomeTax.slabs" limits should go up');
      if (!isNum(s.ratePct) || s.ratePct < 0 || s.ratePct > 100) problems.push(`"incomeTax.slabs[${i}].ratePct" should be a percentage from 0 to 100`);
    });
  }
  for (const f of ['standardDeduction', 'rebateIncomeLimit']) if (!isNum(it?.[f]) || it[f] < 0) problems.push(`"incomeTax.${f}" should be a number of rupees`);
  if (!isNum(it?.cessPct) || it.cessPct < 0 || it.cessPct > 20) problems.push('"incomeTax.cessPct" should be from 0 to 20');
  if (!Array.isArray(it?.surcharge)) problems.push('"incomeTax.surcharge" should be a list (possibly empty)');
  else it.surcharge.forEach((s, i) => {
    if (!isNum(s.above) || !isNum(s.ratePct) || s.ratePct < 0 || s.ratePct > 50) problems.push(`"incomeTax.surcharge[${i}]" should be { above, ratePct }`);
    else if (i > 0 && s.above <= it.surcharge[i - 1].above) problems.push('"incomeTax.surcharge" tiers should go up');
  });

  const prop = data.property;
  if (!prop) problems.push('"property" is missing: say how a sold home is taxed');
  else {
    checkProvenance(prop.provenance, 'property', problems);
    if (!isNum(prop.longTermYears) || prop.longTermYears < 0) problems.push('"property.longTermYears" should be a number of years');
    if (!isNum(prop.longTermRatePct) || prop.longTermRatePct < 0 || prop.longTermRatePct > 100) problems.push('"property.longTermRatePct" should be a percentage');
    if (prop.shortTermRatePct !== 'slab' && (!isNum(prop.shortTermRatePct) || prop.shortTermRatePct < 0 || prop.shortTermRatePct > 100)) problems.push('"property.shortTermRatePct" should be a percentage or "slab"');
    if (!isNum(prop.exemptionPerYear) || prop.exemptionPerYear < 0) problems.push('"property.exemptionPerYear" should be a number of rupees');
  }
  const rules = data.instruments;
  for (const id of instrumentIds) {
    const r = rules[id];
    const at = `instruments.${id}`;
    if (!r) { problems.push(`"${at}" is missing: say how ${id} is taxed`); continue; }
    if (!TAX_KINDS.includes(r.kind)) problems.push(`"${at}.kind" should be one of ${TAX_KINDS.join(', ')}`);
    checkProvenance(r.provenance, at, problems);
    if (r.kind === 'capitalGains') {
      if (!isNum(r.longTermYears) || r.longTermYears < 0) problems.push(`"${at}.longTermYears" should be a number of years`);
      if (!isNum(r.longTermRatePct) || r.longTermRatePct < 0 || r.longTermRatePct > 100) problems.push(`"${at}.longTermRatePct" should be a percentage`);
      if (r.shortTermRatePct !== 'slab' && (!isNum(r.shortTermRatePct) || r.shortTermRatePct < 0 || r.shortTermRatePct > 100)) problems.push(`"${at}.shortTermRatePct" should be a percentage or "slab"`);
      if (!isNum(r.exemptionPerYear) || r.exemptionPerYear < 0) problems.push(`"${at}.exemptionPerYear" should be a number of rupees`);
    }
  }
  for (const id of Object.keys(rules)) if (!instrumentIds.includes(id)) problems.push(`"instruments.${id}" is not a known instrument`);
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export function checkHousing(data, regimeIds, label) {
  const problems = [];
  checkProvenance(data.provenance, '', problems);
  const tiers = data.cityTiers;
  if (!tiers || !Object.keys(tiers).length) problems.push('"cityTiers" should list at least one tier');
  else for (const [id, t] of Object.entries(tiers)) {
    if (!isStr(t.name)) problems.push(`"cityTiers.${id}.name" is missing`);
    if (!isNum(t.homePrice) || t.homePrice <= 0) problems.push(`"cityTiers.${id}.homePrice" should be a price in today's rupees`);
    checkProvenance(t.provenance, `cityTiers.${id}`, problems);
  }
  for (const r of regimeIds) {
    const g = data.priceGrowthPct?.[r];
    if (!isNum(g) || g < -30 || g > 30) problems.push(`"priceGrowthPct.${r}" should be a percentage from -30 to 30`);
  }
  for (const r of Object.keys(data.priceGrowthPct ?? {})) if (!regimeIds.includes(r)) problems.push(`"priceGrowthPct.${r}" is not a known regime`);
  const loan = data.loan ?? {};
  if (!isNum(loan.sharePct) || loan.sharePct < 0 || loan.sharePct > 100) problems.push('"loan.sharePct" should be a percentage from 0 to 100');
  if (!isNum(loan.years) || loan.years < 1 || loan.years > 40) problems.push('"loan.years" should be from 1 to 40');
  if (!isNum(loan.ratePct) || loan.ratePct < 0 || loan.ratePct > 30) problems.push('"loan.ratePct" should be a percentage from 0 to 30');
  for (const [f, max] of [['oneOffCostPct', 30], ['upkeepPct', 10], ['sellingCostPct', 20]]) {
    if (!isNum(data[f]) || data[f] < 0 || data[f] > max) problems.push(`"${f}" should be a percentage from 0 to ${max}`);
  }
  if (!isNum(data.affordabilityBuffer) || data.affordabilityBuffer < 1 || data.affordabilityBuffer > 2) problems.push('"affordabilityBuffer" should be from 1 to 2');
  if (!isNum(data.forcedSaleDebtMonths) || data.forcedSaleDebtMonths < 0) problems.push('"forcedSaleDebtMonths" should be a number of months');
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export function checkFamily(data, label) {
  const problems = [];
  checkProvenance(data.provenance, '', problems);
  const m = data.marriage ?? {};
  checkProvenance(m.provenance, 'marriage', problems);
  if (!isNum(m.livingCostMultiplier) || m.livingCostMultiplier < 1 || m.livingCostMultiplier > 3) problems.push('"marriage.livingCostMultiplier" should be from 1 to 3');
  if (!isNum(m.rentMultiplier) || m.rentMultiplier < 1 || m.rentMultiplier > 3) problems.push('"marriage.rentMultiplier" should be from 1 to 3');
  const c = data.children ?? {};
  checkProvenance(c.provenance, 'children', problems);
  if (!isNum(c.firstBirthAfterMarriageYears) || c.firstBirthAfterMarriageYears < 0) problems.push('"children.firstBirthAfterMarriageYears" should be a number of years');
  if (!isNum(c.gapYears) || c.gapYears < 1) problems.push('"children.gapYears" should be at least 1');
  if (!isNum(c.educationPremiumPct) || c.educationPremiumPct < 0 || c.educationPremiumPct > 15) problems.push('"children.educationPremiumPct" should be from 0 to 15');
  const scale = c.costScaleByTier;
  if (!scale || typeof scale !== 'object') problems.push('"children.costScaleByTier" should give a share for each city tier');
  else for (const [tier, v] of Object.entries(scale)) if (!isNum(v) || v <= 0 || v > 3) problems.push(`"children.costScaleByTier.${tier}" should be a number above 0 and up to 3`);
  const bands = c.costBands;
  if (!Array.isArray(bands) || !bands.length) problems.push('"children.costBands" should list the cost of each age band');
  else bands.forEach((b, i) => {
    const at = `children.costBands[${i}]`;
    if (!isNum(b.upToAge) || b.upToAge < 0) problems.push(`"${at}.upToAge" should be an age`);
    else if (i > 0 && isNum(bands[i - 1].upToAge) && b.upToAge <= bands[i - 1].upToAge) problems.push('"children.costBands" ages should go up');
    if (!isNum(b.costReal) || b.costReal < 0) problems.push(`"${at}.costReal" should be a yearly cost in today's rupees`);
    if (typeof b.education !== 'boolean') problems.push(`"${at}.education" should be true or false`);
    if (!isStr(b.label)) problems.push(`"${at}.label" is missing`);
  });
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export function checkRetirement(data, label) {
  const problems = [];
  checkProvenance(data.provenance, '', problems);
  const L = data.lifespan ?? {};
  checkProvenance(L.provenance, 'lifespan', problems);
  if (!isNum(L.meanAge) || L.meanAge < 60 || L.meanAge > 100) problems.push('"lifespan.meanAge" should be from 60 to 100');
  if (!isNum(L.sdYears) || L.sdYears < 0 || L.sdYears > 20) problems.push('"lifespan.sdYears" should be from 0 to 20');
  if (!isNum(L.minAge) || L.minAge < 66) problems.push('"lifespan.minAge" should be at least 66, so everyone reaches the latest retirement age (65)');
  if (!isNum(L.maxAge) || L.maxAge <= L.minAge || L.maxAge > 120) problems.push('"lifespan.maxAge" should be above minAge and at most 120');
  const P = data.pension ?? {};
  checkProvenance(P.provenance, 'pension', problems);
  if (!isNum(P.shareOfLastPay) || P.shareOfLastPay < 0 || P.shareOfLastPay > 1) problems.push('"pension.shareOfLastPay" should be from 0 to 1');
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export function checkCapability(data, regimeIds, label) {
  const problems = [];
  checkProvenance(data.provenance, '', problems);
  if (!isNum(data.gainPerYear) || data.gainPerYear <= 0 || data.gainPerYear > 1) problems.push('"gainPerYear" should be above 0 and at most 1');
  if (!isNum(data.decayPct) || data.decayPct < 0 || data.decayPct > 100) problems.push('"decayPct" should be a percentage');
  if (!isNum(data.maxGrowthBoost) || data.maxGrowthBoost < 0 || data.maxGrowthBoost > 0.1) problems.push('"maxGrowthBoost" should be from 0 to 0.1 (10 points of yearly pay growth)');
  for (const r of regimeIds) {
    const m = data.regimeMult?.[r];
    if (!isNum(m) || m < 0 || m > 3) problems.push(`"regimeMult.${r}" should be a number from 0 to 3`);
  }
  const bands = data.ageMult;
  if (!Array.isArray(bands) || !bands.length) problems.push('"ageMult" should list [maxAge, multiplier] bands');
  else {
    bands.forEach((b, j) => {
      if (!Array.isArray(b) || !isNum(b[0]) || !isNum(b[1]) || b[1] < 0) problems.push(`"ageMult[${j}]" should be [maxAge, multiplier]`);
      else if (j > 0 && isNum(bands[j - 1][0]) && b[0] <= bands[j - 1][0]) problems.push('"ageMult" ages should go up');
    });
    if (!(bands[bands.length - 1]?.[0] >= 100)) problems.push('"ageMult" should end with a band up to age 100 or more');
  }
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export const NUDGE_CARDS = ['crash', 'raise', 'festival', 'tip'];

export function checkNudges(data, label) {
  const problems = [];
  checkProvenance(data.provenance, '', problems);
  if (!isNum(data.perStage) || data.perStage < 0 || data.perStage > 5) problems.push('"perStage" should be from 0 to 5');
  if (!isNum(data.minStakeReal) || data.minStakeReal < 0) problems.push('"minStakeReal" should be a number of rupees');
  for (const id of NUDGE_CARDS) {
    const c = data.cards?.[id];
    const at = `cards.${id}`;
    if (!c) { problems.push(`"${at}" is missing`); continue; }
    for (const f of ['emoji', 'title', 'story']) if (!isStr(c[f])) problems.push(`"${at}.${f}" is missing`);
    if (!Array.isArray(c.gut) || c.gut.length !== 3 || c.gut.some(g => !isStr(g))) problems.push(`"${at}.gut" should be three lines, from calm to loud`);
    for (const o of ['follow', 'resist']) if (!isStr(c[o]?.title) || !isStr(c[o]?.blurb)) problems.push(`"${at}.${o}" needs a title and a blurb`);
    const b = c.bias;
    if (!(isStr(b) || isStr(b?.inverse))) problems.push(`"${at}.bias" should name a persona trait, or { "inverse": trait }`);
    if (c.firing?.always !== true) {
      if (!isNum(c.firing?.baseProb) || c.firing.baseProb < 0 || c.firing.baseProb > 1) problems.push(`"${at}.firing.baseProb" should be a probability`);
      if (!isNum(c.firing?.biasWeight) || c.firing.biasWeight < 0 || c.firing.biasWeight > 1) problems.push(`"${at}.firing.biasWeight" should be from 0 to 1`);
    }
  }
  const e = data.cards?.raise?.effect;
  if (!isNum(e?.upgradePct) || e.upgradePct < 0 || e.upgradePct > 1) problems.push('"cards.raise.effect.upgradePct" should be from 0 to 1');
  const f = data.cards?.festival?.effect;
  if (!isNum(f?.spendPctOfPay) || f.spendPctOfPay < 0 || f.spendPctOfPay > 1) problems.push('"cards.festival.effect.spendPctOfPay" should be from 0 to 1');
  const t = data.cards?.tip?.effect;
  if (!isNum(t?.stakeShare) || t.stakeShare <= 0 || t.stakeShare > 1) problems.push('"cards.tip.effect.stakeShare" should be above 0 and at most 1');
  if (!isNum(t?.winProb) || t.winProb < 0 || t.winProb > 1) problems.push('"cards.tip.effect.winProb" should be a probability');
  if (!isNum(t?.payoffMultiple) || t.payoffMultiple < 1) problems.push('"cards.tip.effect.payoffMultiple" should be at least 1');
  const c0 = data.cards?.crash?.trigger;
  if (!isNum(c0?.equityReturnBelow) || c0.equityReturnBelow >= 0) problems.push('"cards.crash.trigger.equityReturnBelow" should be a negative return such as -0.15');
  if (!isNum(c0?.minEquityReal) || c0.minEquityReal < 0) problems.push('"cards.crash.trigger.minEquityReal" should be a number of rupees');
  if (problems.length) throw new ValidationError(label, problems);
  return data;
}

export function checkEngine(e, instrumentIds, label) {
  const problems = [];
  if (e.savingsRate < 0 || e.savingsRate > 1) problems.push('"savingsRate" should be between 0 and 1');
  if (e.debtPaydownShare < 0 || e.debtPaydownShare > 1) problems.push('"debtPaydownShare" should be between 0 and 1');
  let sum = 0;
  for (const id of instrumentIds) {
    const x = e.allocation[id];
    if (!isNum(x) || x < 0 || x > 1) problems.push(`"allocation.${id}" should be a share from 0 to 1`);
    else sum += x;
  }
  for (const id of Object.keys(e.allocation)) if (!instrumentIds.includes(id)) problems.push(`"allocation.${id}" is not a known instrument`);
  if (Math.abs(sum - 1) > 1e-9) problems.push(`"allocation" should add up to 1 but adds up to ${Math.round(sum * 1e6) / 1e6}`);
  if (problems.length) throw new ValidationError(label, problems);
  return e;
}

// Everything the engine needs, as one object:
//   { ...engine.json, macro: <macro.json>, instruments: [...], events: [...], insurance: {...}, tax, housing, family, retirement, capability, nudges }
export async function loadParams({ fetchImpl = fetch } = {}) {
  const opts = (schema, label) => ({ schema, label, fetchImpl });
  const macro = checkMacro(await loadJSON('data/macro.json', opts(schemas.macro, 'macro.json')), 'macro.json');
  const inst = checkInstruments(
    await loadJSON('data/instruments.json', opts(schemas.instruments, 'instruments.json')),
    macro.order, 'instruments.json');
  const engine = checkEngine(
    await loadJSON('data/engine.json', opts(schemas.engine, 'engine.json')),
    inst.instruments.map(i => i.id), 'engine.json');
  const ev = checkEvents(
    await loadJSON('data/events.json', opts(schemas.events, 'events.json')),
    macro.order, 'events.json');
  const tax = checkTax(
    await loadJSON('data/tax.json', opts(schemas.tax, 'tax.json')),
    inst.instruments.map(i => i.id), 'tax.json');
  const housing = checkHousing(
    await loadJSON('data/housing.json', opts(schemas.housing, 'housing.json')),
    macro.order, 'housing.json');
  const family = checkFamily(
    await loadJSON('data/family.json', opts(schemas.family, 'family.json')), 'family.json');
  const retirement = checkRetirement(
    await loadJSON('data/retirement.json', opts(schemas.retirement, 'retirement.json')), 'retirement.json');
  const capability = checkCapability(
    await loadJSON('data/capability.json', opts(schemas.capability, 'capability.json')), macro.order, 'capability.json');
  const nudges = checkNudges(
    await loadJSON('data/nudges.json', opts(schemas.nudges, 'nudges.json')), 'nudges.json');
  return { ...engine, macro, instruments: inst.instruments, events: ev.events, insurance: ev.insurance, tax, housing, family, retirement, capability, nudges };
}
