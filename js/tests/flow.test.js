import { test, assert, assertEqual } from './harness.js';
import { installFakeDom, createRoot, findAll, buttons, buttonWithText, hasClass } from './fakeDom.js';
import { createFlow } from '../ui/flow.js';
import { loadParams } from '../data/params.js';
import { loadPersonas } from '../data/personas.js';
import { loadStages } from '../data/stages.js';
import { getFetch } from './dataFetch.js';

installFakeDom();

const fetchImpl = await getFetch();
const params = await loadParams({ fetchImpl });
const personas = await loadPersonas({ fetchImpl });
const { stages, decisions } = await loadStages({ fetchImpl, instrumentIds: params.instruments.map(i => i.id) });

function newGame(seed = 4271, retirementAge = 60) {
  const root = createRoot();
  const session = { personaId: null, retirementAge, seed };
  const flow = createFlow(root, { personas, params, stages, decisions }, session);
  flow.showLanding();
  return { root, session, flow };
}

// Where a decision sits in a stage's list of questions (0-based), so tests survive new questions.
const qIndex = (stageIdx, decisionId) => stages[stageIdx].decisions.findIndex(d => d.id === decisionId);
const N0 = stages[0].decisions.length;
const NLAST = stages[stages.length - 1].decisions.length;

const text = (root) => root.textContent;
const click = (root, re) => {
  const b = buttonWithText(root, re);
  assert(b, `no button matching ${re} on screen: ${text(root).slice(0, 200)}`);
  b.click();
};
const pickCard = (root, titleRe) => {
  const card = findAll(root, n => n.tagName === 'BUTTON' && hasClass(n, 'option-card'))
    .find(n => titleRe.test(n.textContent));
  assert(card, `no option card matching ${titleRe}`);
  card.click();
};

// Starts a life as the first persona, accepting all defaults up to the first question.
function begin(g, personaIndex = 0) {
  click(g.root, /Let's start/);
  findAll(g.root, n => hasClass(n, 'persona-card'))[personaIndex].click();
  click(g.root, /Begin this life/);
}

// Plays one stage: pass a map of "question number" -> card title regex; the rest keep defaults.
function playStageScreen(g, picks = {}) {
  let q = 0;
  for (;;) {
    if (picks[q]) pickCard(g.root, picks[q]);
    const play = buttonWithText(g.root, /^Play these/);
    if (play) { play.click(); return; }
    click(g.root, /^Next$/);
    q += 1;
  }
}

function finish(g, perStage = {}) {
  for (let i = 0; i < stages.length; i++) {
    assert(!/whole story/.test(text(g.root)), `ended early at stage ${i}`);
    playStageScreen(g, perStage[i]);
    click(g.root, /^(On to|See the whole story)/);
  }
}

test('landing -> picker -> first question for both personas', () => {
  for (const idx of [0, 1]) {
    const g = newGame();
    begin(g, idx);
    assert(/Early career/.test(text(g.root)), 'should be in the first stage');
    assert(new RegExp(`Question 1 of ${N0}`).test(text(g.root)), 'question count shown');
  }
});

test('Begin is only offered once a persona is picked', () => {
  const g = newGame();
  click(g.root, /Let's start/);
  assert(!buttonWithText(g.root, /Begin this life/), 'no begin button before picking');
  findAll(g.root, n => hasClass(n, 'persona-card'))[0].click();
  assert(buttonWithText(g.root, /Begin this life/), 'begin button after picking');
});

test('first question has no "what you do now" tag, Next is enabled by the default pick', () => {
  const g = newGame();
  begin(g);
  assert(!/what you do now/.test(text(g.root)), 'first stage should not claim a current choice');
  const next = buttonWithText(g.root, /^Next$/);
  assert(next && !next.disabled, 'Next should be enabled with the default selected');
});

test('a full game walks through every stage and ends with the whole story', () => {
  const g = newGame();
  begin(g);
  finish(g);
  const t = text(g.root);
  assert(/Here's the whole story/.test(t), 'summary headline');
  assert(/in today's money/.test(t), 'real-rupees headline');
  assert(/Your 20s/.test(t) && /Your 50s/.test(t), 'decade cards');
  assert(/Your choices/.test(t), 'recap');
  for (const s of stages) assert(t.includes(s.name), `recap should list ${s.name}`);
});

test('stage result screen shows a net-worth sentence and the choices made', () => {
  const g = newGame();
  begin(g);
  playStageScreen(g, { [qIndex(0, 'savings')]: /Save hard/, [qIndex(0, 'invest')]: /Go for growth/, [qIndex(0, 'growth')]: /Go all in/ });
  const t = text(g.root);
  assert(/Net worth (grew|fell) from/.test(t), 'headline');
  assert(t.includes('Save hard') && t.includes('Go for growth') && t.includes('Go all in'), 'choices listed');
  assert(/spent on getting better/.test(t), 'learning spend shown when > 0');
  assert(/On to Building a life/.test(t), 'next stage button');
});

test('later stages tag the option you are already doing', () => {
  const g = newGame();
  begin(g);
  playStageScreen(g, { 0: /Save hard/ });
  click(g.root, /^On to/);
  const tagged = findAll(g.root, n => hasClass(n, 'option-card') && /what you do now/.test(n.textContent));
  assertEqual(tagged.length, 1);
  assert(/Save hard/.test(tagged[0].textContent), 'the tag should sit on the previous pick');
});

test('Back returns to the previous question and keeps the pick', () => {
  const g = newGame();
  begin(g);
  pickCard(g.root, /Enjoy life/);
  click(g.root, /^Next$/);
  assert(new RegExp(`Question 2 of ${N0}`).test(text(g.root)), 'moved to question 2');
  click(g.root, /^Back$/);
  const selected = findAll(g.root, n => hasClass(n, 'option-card') && hasClass(n, 'selected'));
  assertEqual(selected.length, 1);
  assert(/Enjoy life/.test(selected[0].textContent), 'pick survived going back');
});

test('the last stage offers a retirement age, and the button counts the years it will play', () => {
  const g = newGame(4271, 60);
  begin(g);
  for (let i = 0; i < 3; i++) { playStageScreen(g); click(g.root, /^On to/); }
  assert(/Pre-retirement/.test(text(g.root)), 'in the last stage');
  for (let i = 0; i < NLAST - 1; i++) click(g.root, /^Next$/);
  assert(/when do you want to stop working/i.test(text(g.root)), 'retirement question');
  assert(buttonWithText(g.root, /^Play these 8 years$/), 'defaults to 52 -> 60');
  pickCard(g.root, /At 65/);
  assert(buttonWithText(g.root, /^Play these 13 years$/), 'picking 65 changes the count');
  pickCard(g.root, /At 55/);
  assert(buttonWithText(g.root, /^Play these 3 years$/), 'picking 55 changes the count');
});

test('retiring at 65 in the last stage runs the life to 65', () => {
  const g = newGame();
  begin(g);
  finish(g, { 3: { [qIndex(3, 'retire')]: /At 65/ } });
  assert(/At 65 you have about/.test(text(g.root)), text(g.root).slice(0, 300));
});

test('same seed and same choices give the same ending, different seed a different one', () => {
  const ending = (seed) => {
    const g = newGame(seed);
    begin(g);
    finish(g);
    return findAll(g.root, n => hasClass(n, 'headline'))[0].textContent;
  };
  assertEqual(ending(4271), ending(4271));
  assert(ending(4271) !== ending(1234), 'different seeds should differ');
});

test('"Same luck, different choices" restarts at stage 1 with the same seed', () => {
  const g = newGame(4271);
  begin(g);
  finish(g);
  click(g.root, /Same luck, different choices/);
  assert(/Early career/.test(text(g.root)) && new RegExp(`Question 1 of ${N0}`).test(text(g.root)), 'back to the first question');
  assertEqual(g.session.seed, 4271);
});

test('"New luck" restarts with a different seed; "Pick someone else" returns to the picker', () => {
  const g = newGame(4271);
  begin(g);
  finish(g);
  click(g.root, /^New luck$/);
  assert(Number.isInteger(g.session.seed), 'a new numeric seed is drawn');
  assert(/Early career/.test(text(g.root)), 'restarted');
  finish(g);
  click(g.root, /Pick someone else/);
  assert(/Who are you playing/.test(text(g.root)), 'picker');
});

test('Advanced section shows the seed after a run', () => {
  const g = newGame(4271);
  begin(g);
  finish(g);
  assert(/Seed:\s*4271/.test(text(g.root)), 'seed visible under Advanced');
});

test('a start age past the first stage skips straight to the stage it is in', () => {
  const old = { ...personas[0], profile: { ...personas[0].profile, startAge: 45 } };
  const root = createRoot();
  const session = { personaId: old.id, retirementAge: 60, seed: 1 };
  const flow = createFlow(root, { personas: [old], params, stages, decisions }, session);
  flow.showLanding();
  click(root, /Let's start/);
  findAll(root, n => hasClass(n, 'persona-card'))[0].click();
  click(root, /Begin this life/);
  assert(/Peak earning/.test(text(root)), 'should start in Peak earning');
  assert(buttons(root).length > 0, 'has buttons');
});

test('no screen leaks stray words like "undefined", "null", "NaN" or "false"', () => {
  const stray = /undefined|\bnull\b|NaN|\bfalse\b|\[object/;
  const g = newGame();
  const seen = [];
  const snap = (label) => seen.push([label, text(g.root)]);
  snap('landing');
  click(g.root, /Let's start/);
  snap('picker, nobody chosen yet');
  findAll(g.root, n => hasClass(n, 'persona-card'))[1].click();
  snap('picker, persona chosen');
  click(g.root, /Begin this life/);
  for (let i = 0; i < stages.length; i++) {
    for (;;) {
      snap(`stage ${i} question`);
      const play = buttonWithText(g.root, /^Play these/);
      if (play) { play.click(); break; }
      click(g.root, /^Next$/);
    }
    snap(`stage ${i} result`);
    click(g.root, /^(On to|See the whole story)/);
  }
  snap('summary');
  for (const [label, t] of seen) {
    const m = t.match(stray);
    assert(!m, `${label}: found "${m && m[0]}"`);
  }
});

test('stage result shows the economy year by year, with ages so it works without colour', () => {
  const g = newGame();
  begin(g);
  playStageScreen(g);
  const chips = findAll(g.root, n => hasClass(n, 'weather-chip'));
  assertEqual(chips.length, 10);
  assert(/age 22/.test(chips[0].textContent) && /age 31/.test(chips[9].textContent), 'ages on the chips');
  assert(/Boom|Steady|Slowdown|Crisis/.test(chips[0].textContent), 'a named mood on each chip');
  assert(/How the economy was/.test(text(g.root)), 'section heading');
});

test('the same life with a different savings mix ends differently, on the same luck', () => {
  const ending = (mix) => {
    const g = newGame(4271);
    begin(g);
    finish(g, Object.fromEntries(stages.map((st, i) => [i, { [qIndex(i, 'invest')]: mix }])));
    return findAll(g.root, n => hasClass(n, 'headline'))[0].textContent;
  };
  assert(ending(/Play it safe/) !== ending(/Go for growth/), 'allocation should matter');
});

test('stage result says what happened: event cards with names and ages, or a quiet stretch', () => {
  let sawCards = 0, sawQuiet = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = newGame(seed);
    begin(g);
    playStageScreen(g);
    const t = text(g.root);
    assert(/What happened/.test(t), `seed ${seed}: section heading`);
    const cards = findAll(g.root, n => hasClass(n, 'event-card'));
    if (cards.length) {
      sawCards++;
      for (const c of cards) assert(/ · age \d\d/.test(c.textContent), `seed ${seed}: card shows an age`);
    } else {
      sawQuiet++;
      assert(/Nothing dramatic/.test(t), `seed ${seed}: quiet message`);
    }
  }
  assert(sawCards > 0, 'at least one of twelve lives had an event in the first stage');
  assert(sawQuiet + sawCards === 12, 'every seed rendered one or the other');
});

test('health premiums show up as a line item once you buy cover', () => {
  const g = newGame(4271);
  begin(g);
  playStageScreen(g, { [qIndex(0, 'health')]: /Basic cover/ });
  assert(/paid for health cover/.test(text(g.root)), 'premiums line');
  const g2 = newGame(4271);
  begin(g2);
  playStageScreen(g2);
  assert(!/paid for health cover/.test(text(g2.root)), 'no premiums line without cover');
});
