import { test, assert, assertEqual } from './harness.js';
import { createState } from '../engine/state.js';
import { tickYear, runUntil } from '../engine/tick.js';
import { settleEvents } from '../engine/events.js';
import { playStage, playRetirement } from '../engine/stages.js';
import { bridge } from '../engine/explain.js';
import { outcome } from '../engine/outcomes.js';
import { loadParams } from '../data/params.js';
import { loadPersonas, checkPersona } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { getFetch } from './dataFetch.js';

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });
const by = (id) => personas.find(p => p.id === id);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const picks = { savings: 'balanced', invest: 'mixed', emergency: 'three', health: 'basic', growth: 'light', home: 'rent', marry: 'single', marryLater: 'single', retire: 'at60', retirementStyle: 'comfortable' };

function wholeLife(persona, seed) {
  let s = createState(persona, params, { seed, retirementAge: 60 });
  for (const st of stages) {
    if (st.toAge !== null && s.age >= st.toAge) continue; // a persona who starts later skips earlier stages
    s = playStage(s, params, st, decisions, picks);
  }
  return playRetirement(s, params);
}

test('there are six personas, each with its own look and a first name', () => {
  assertEqual(personas.length, 6);
  assertEqual(new Set(personas.map(p => p.emoji)).size, 6, 'a different emoji each');
  assertEqual(new Set(personas.map(p => p.firstName)).size, 6, 'a different first name each');
  for (const p of personas) assert(params.housing.cityTiers[p.profile.cityTier], `${p.id} has a city tier the housing data knows`);
});

test('each persona is distinct in the way its story says', () => {
  const aarav = by('metro-it'), gov = by('govt-psu'), kavya = by('freelance-designer'), rohan = by('resident-doctor'), sneha = by('school-teacher'), imran = by('shop-heir');
  // freelancer: no benefits, big swings, a layoff-like risk higher than any employee's
  assert(!kavya.career.employerHealthCover && !kavya.career.pension && kavya.career.severanceMonths === 0);
  assert(kavya.career.layoffRisk > aarav.career.layoffRisk && kavya.career.cyclicality === 1);
  // doctor: the biggest debt, the steepest pay growth, a stable job
  assert(rohan.money.startingDebt > Math.max(...personas.filter(p => p !== rohan).map(p => p.money.startingDebt)), 'the biggest loan');
  assert(rohan.career.salaryGrowthPct > aarav.career.salaryGrowthPct && rohan.career.layoffRisk < aarav.career.layoffRisk);
  // teacher: the lowest pay and the heaviest family load against it
  const load = (p) => (p.obligations.parentsSupportMonthly + p.obligations.siblingSupportMonthly) * 12 / p.money.startingSalary;
  assertEqual(personas.slice().sort((a, b) => load(b) - load(a))[0].id, 'school-teacher');
  assertEqual(personas.slice().sort((a, b) => a.money.startingSalary - b.money.startingSalary)[0].id, 'school-teacher');
  assert(!sneha.career.employerHealthCover && !sneha.career.pension && sneha.biases.overConservatism > 0.8);
  // shop heir: income follows the economy fully, the most family capital, no benefits
  assert(imran.career.cyclicality === 1 && imran.money.startingSavings > aarav.money.startingSavings * 3 && !imran.career.pension && !imran.career.employerHealthCover);
  assert(gov.career.pension && gov.career.layoffRisk === 0, 'the officer is still the secure one');
});

test('a persona can set its own severance, and without one the layoff event decides', () => {
  const layoff = params.events.find(e => e.kind === 'jobLoss');
  const hit = [{ def: layoff, occurred: true, u1: 0.5, u2: 0.5 }];
  const severance = (p) => settleEvents(createState(p, params, { seed: 1, retirementAge: 60 }), hit, params.insurance, 1).severance;
  assertEqual(severance(by('freelance-designer')), 0);
  assertEqual(severance(by('shop-heir')), 0);
  const aarav = by('metro-it');
  assert(near(severance(aarav), (aarav.money.startingSalary / 12) * layoff.severanceMonths), 'the event default');
});

test('without employer cover, a hospital bill falls on you (unless you bought cover)', () => {
  const hospital = params.events.find(e => e.id === 'medical_self');
  const roll = [{ def: hospital, occurred: true, u1: 0.05, u2: 0 }];
  const paid = (p) => settleEvents(createState(p, params, { seed: 1, retirementAge: 60 }), roll, params.insurance, 1).insurancePaid;
  assertEqual(paid(by('freelance-designer')), 0);
  assertEqual(paid(by('school-teacher')), 0);
  assert(paid(by('metro-it')) > 0 && paid(by('resident-doctor')) > 0);
});

test('every persona plays a whole life to its end, with sound books, in both kinds of rupee', () => {
  for (const p of personas) {
    for (const seed of [1, 2, 3]) {
      const s = wholeLife(p, seed);
      assertEqual(s.age, s.deathAge);
      assert(s.history.every(y => Number.isFinite(y.netWorth) && Number.isFinite(y.expenses) && y.cash > -1e-6), `${p.id} seed ${seed}: sound numbers`);
      for (const real of [false, true]) {
        const b = bridge(s.history, { real });
        const total = Object.values(b.items).reduce((a, x) => a + x, 0);
        assert(near(b.start + total, b.end, 1e-8), `${p.id} seed ${seed} real=${real}`);
      }
      assert(['lasted', 'soldHome', 'ranOut'].includes(outcome(s).status));
    }
  }
});

test('a persona who starts later begins at their own age, and the doctor starts in debt', () => {
  const rohan = by('resident-doctor');
  const s = createState(rohan, params, { seed: 1, retirementAge: 60 });
  assertEqual(s.age, 26);
  assertEqual(s.debt, rohan.money.startingDebt);
  const later = runUntil(s, params, 32);
  assert(later.debt < s.debt, 'the loan is being paid down');
  assertEqual(later.history[0].age, 26);
});

test('the lives differ: the doctor ends richest and the teacher poorest in most seeds', () => {
  let doctorTop = 0, teacherBottom = 0;
  const seeds = 12;
  for (let seed = 1; seed <= seeds; seed++) {
    const nw = Object.fromEntries(personas.map(p => [p.id, wholeLife(p, seed).history.find(y => y.age === 59).netWorthReal]));
    const ranked = Object.entries(nw).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    if (ranked[0] === 'resident-doctor') doctorTop++;
    if (ranked[ranked.length - 1] === 'school-teacher') teacherBottom++;
  }
  assert(doctorTop >= seeds * 0.7, `doctor on top in ${doctorTop} of ${seeds}`);
  assert(teacherBottom >= seeds * 0.7, `teacher at the bottom in ${teacherBottom} of ${seeds}`);
});

test('checkPersona accepts the new optional fields and explains bad ones', () => {
  const ok = structuredClone(by('freelance-designer'));
  checkPersona(ok, 'x.json');
  const bad = structuredClone(ok);
  bad.career.severanceMonths = 40;
  bad.eventText.job_loss = 'text only';
  bad.eventText.job_offer = { name: '' };
  let message = '';
  try { checkPersona(bad, 'x.json'); } catch (e) { message = e.message; }
  for (const part of ['severanceMonths', 'eventText.job_loss', 'eventText.job_offer.name']) assert(message.includes(part), `mention ${part}: ${message}`);
  const plain = structuredClone(by('metro-it'));
  checkPersona(plain, 'x.json'); // personas without the optional fields still load
  assertEqual(tickYear(createState(plain, params, { seed: 1, retirementAge: 60 }), params).history.length, 1);
});
