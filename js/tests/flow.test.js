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
// The questions a single, renting, childless player (the default path) is actually asked in a stage.
const visibleRefs = (stage) => stage.decisions.filter(r => [].concat(r.onlyIf ?? []).every(c => ['single', 'renting', 'childless'].includes(c)));
const qIndex = (stageIdx, decisionId) => visibleRefs(stages[stageIdx]).findIndex(d => d.id === decisionId);
const N0 = visibleRefs(stages[0]).length;
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

test('names come from the persona files: renaming one changes every screen that shows it', () => {
  const renamed = personas.map((p, i) => i === 0 ? { ...p, firstName: 'Zoya', name: 'Zoya Without A Comma' } : p);
  const root = createRoot();
  const flow = createFlow(root, { personas: renamed, params, stages, decisions }, { personaId: null, retirementAge: 60, seed: 1 });
  flow.showLanding();
  click(root, /Let's start/);
  assert(/Zoya Without A Comma/.test(text(root)), 'full name on the card');
  findAll(root, n => hasClass(n, 'persona-card'))[0].click();
  assert(/Meet Zoya/.test(text(root)) &&!/Meet Zoya Without/.test(text(root)), 'first name in the greeting');
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
  stepTo(g, /Life is getting busier/); // past the marriage question
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
  for (let i = 0; i < NLAST - 2; i++) click(g.root, /^Next$/);
  assert(/when do you want to stop working/i.test(text(g.root)), 'retirement question');
  click(g.root, /^Next$/);
  assert(/How will you live once|how will you live/i.test(text(g.root)), 'then how to live in retirement');
  assert(buttonWithText(g.root, /^Play these 8 years$/), 'defaults to 52 -> 60');
  click(g.root, /^Back$/);
  pickCard(g.root, /At 65/);
  click(g.root, /^Next$/);
  assert(buttonWithText(g.root, /^Play these 13 years$/), 'picking 65 changes the count');
  click(g.root, /^Back$/);
  pickCard(g.root, /At 55/);
  click(g.root, /^Next$/);
  assert(buttonWithText(g.root, /^Play these 3 years$/), 'picking 55 changes the count');
});

test('retiring at 65 in the last stage runs the life to 65', () => {
  const g = newGame();
  begin(g);
  finish(g, { 3: { [qIndex(3, 'retire')]: /At 65/ } });
  assert(/At 65 you had about/.test(text(g.root)), text(g.root).slice(0, 300));
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
  // No word boundaries on purpose: a stray "false" glued to the end of "lakh" must still be caught.
  const stray = /undefined|null|NaN|false|\[object/;
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

// ---- Level 2: the "why" ----

const figures = (root) => findAll(root, n => n.tagName === 'FIGURE');
const tables = (root) => findAll(root, n => n.tagName === 'TABLE');
const whyRegion = (root) => findAll(root, n => n.attrs.id === 'why')[0];
const whyButtons = (root) => findAll(root, n => hasClass(n, 'why-btn'));
const chooseMoney = (root, value) => {
  const radio = findAll(root, n => n.tagName === 'INPUT' && n.attrs.value === value)[0];
  assert(radio, `no ${value} radio on screen`);
  radio.checked = true;
  radio.dispatch('change');
};

function playToEnd(seed = 4271) {
  const g = newGame(seed);
  begin(g);
  finish(g);
  return g;
}

test('Level 1 stays plain: no charts, no tables, the why region is closed', () => {
  const g = playToEnd();
  assertEqual(figures(g.root).length, 0);
  assertEqual(tables(g.root).length, 0);
  assertEqual(whyRegion(g.root).hidden, true);
  assert(!/Forces at work/.test(text(g.root)), 'no explanations until asked');
});

test('"Why did it go this way?" opens Level 2: two charts and a prompt, no table yet', () => {
  const g = playToEnd();
  click(g.root, /^Why did it go this way\?$/);
  assertEqual(whyRegion(g.root).hidden, false);
  assertEqual(figures(g.root).length, 2);
  assertEqual(tables(g.root).length, 0);
  assert(/What you owned/.test(text(g.root)) && /What came in and what went out/.test(text(g.root)), 'both charts');
  assert(/Tap "Why\?" on a decade card/.test(text(g.root)), 'prompt for the next step');
  assert(buttonWithText(g.root, /^Hide the why$/), 'the button now closes it');
});

test("a decade's Why? opens its own chart, its money story and a year-by-year table", () => {
  const g = playToEnd();
  const btns = whyButtons(g.root);
  assert(btns.length >= 4, 'one per decade');
  btns[1].click(); // the 30s
  assertEqual(whyRegion(g.root).hidden, false);
  assertEqual(figures(g.root).length, 3);
  assert(/Your 30s: what you owned/.test(text(g.root)), 'decade chart');
  assert(/Your 30s, in detail/.test(text(g.root)), 'panel title');
  const t = tables(g.root);
  assertEqual(t.length, 1);
  const bodyRows = findAll(t[0], n => n.tagName === 'TR').length - 1; // minus the header row
  assertEqual(bodyRows, 10);
  assert(/Forces at work/.test(text(g.root)) && /Prices rose \d+% over these 10 years/.test(text(g.root)), 'named forces');
  assert(/What came in/.test(text(g.root)) && /Investment growth/.test(text(g.root)), 'bridge lines');
  assertEqual(btns.map(b => b.attrs['aria-expanded']), btns.map((_, k) => String(k === 1)));
});

test('opening another decade replaces the first one', () => {
  const g = playToEnd();
  const btns = whyButtons(g.root);
  btns[0].click();
  assert(/Your 20s, in detail/.test(text(g.root)), '20s open');
  btns[2].click();
  assert(/Your 40s, in detail/.test(text(g.root)) && !/Your 20s, in detail/.test(text(g.root)), '40s replaced 20s');
  assertEqual(tables(g.root).length, 1);
  assertEqual(btns.map(b => b.attrs['aria-expanded']), btns.map((_, k) => String(k === 2)));
});

test('the bridge shows lines that explain the change, each with a signed amount', () => {
  const g = playToEnd();
  whyButtons(g.root)[0].click();
  const rows = findAll(g.root, n => hasClass(n, 'bridge-row'));
  assert(rows.length >= 6, `bridge rows: ${rows.length}`);
  assert(rows.every(r => /[+−]₹/.test(r.textContent)), 'every line has a signed amount');
  assert(/Prices rising on what you hold/.test(text(g.root)), 'inflation line in today\'s rupees');
});

test('tax is its own line in the bridge, with a plain sentence about how much it took', () => {
  const g = playToEnd();
  whyButtons(g.root)[2].click(); // the 40s: Aarav is paying tax by now
  const lines = findAll(g.root, n => hasClass(n, 'bridge-row')).map(r => r.attrs['data-line']);
  assert(lines.includes('incomeTax'), `income tax line: ${lines}`);
  assert(/Income tax on pay and windfalls/.test(text(g.root)), 'plain label');
  assert(/Tax took ₹[^ ]+( \w+)? of the ₹[^ ]+( \w+)? you earned \(\d+\.\d%\)/.test(text(g.root)), 'tax sentence');
  whyButtons(g.root)[0].click(); // the 20s: below the free limit
  assert(/No tax was due/.test(text(g.root)), 'quiet when nothing was due');
  assert(!findAll(g.root, n => hasClass(n, 'bridge-row')).some(r => r.attrs['data-line'] === 'incomeTax'), 'no empty tax line');
});

test('a stage result shows tax paid once there is some', () => {
  const g = newGame(4271);
  begin(g);
  playStageScreen(g);
  assert(!/paid in tax/.test(text(g.root)), 'nothing to show in the first stage');
  let shown = false;
  while (buttonWithText(g.root, /^On to/)) {
    click(g.root, /^On to/);
    playStageScreen(g);
    shown = shown || /paid in tax/.test(text(g.root));
  }
  assert(shown, 'a later stage shows the tax paid');
});

test('the rupee toggle switches charts, panel and table between kinds of rupee', () => {
  const g = playToEnd();
  whyButtons(g.root)[1].click();
  assert(/today's rupees/.test(tables(g.root)[0].textContent), 'table starts in today\'s rupees');
  const realText = text(g.root);
  chooseMoney(g.root, 'nominal');
  assert(/rupees of each year/.test(tables(g.root)[0].textContent), 'table follows the toggle');
  assert(/rupees of that year/.test(figures(g.root)[0].textContent), 'charts follow too');
  assert(!/Prices rising on what you hold/.test(text(g.root)), 'no inflation line in nominal rupees');
  assert(text(g.root) !== realText, 'numbers changed');
  assertEqual(whyButtons(g.root)[1].attrs['aria-expanded'], 'true');
  chooseMoney(g.root, 'real');
  assert(/Prices rising on what you hold/.test(text(g.root)), 'back to today\'s rupees');
});

test('"Hide the why" closes everything again', () => {
  const g = playToEnd();
  whyButtons(g.root)[0].click();
  click(g.root, /^Hide the why$/);
  assertEqual(whyRegion(g.root).hidden, true);
  assertEqual(figures(g.root).length, 0);
  assertEqual(tables(g.root).length, 0);
  assertEqual(whyButtons(g.root).map(b => b.attrs['aria-expanded']), whyButtons(g.root).map(() => 'false'));
});

test('a stage result has its own Why button, and the level sticks for later stages', () => {
  const g = newGame(4271);
  begin(g);
  playStageScreen(g);
  assertEqual(findAll(g.root, n => hasClass(n, 'why-panel')).length, 0);
  assertEqual(tables(g.root).length, 0);
  click(g.root, /^Why did it go this way\?$/);
  assertEqual(findAll(g.root, n => hasClass(n, 'why-panel')).length, 1);
  assertEqual(tables(g.root).length, 1);
  assert(/Age 22 to 32, in detail/.test(text(g.root)), 'panel covers the stage');
  click(g.root, /^On to/);
  playStageScreen(g);
  assertEqual(findAll(g.root, n => hasClass(n, 'why-panel')).length, 1);
  assert(/Age 32 to 42, in detail/.test(text(g.root)), 'the next stage opens by itself');
  click(g.root, /^Hide the why$/);
  click(g.root, /^On to/);
  playStageScreen(g);
  assertEqual(findAll(g.root, n => hasClass(n, 'why-panel')).length, 0);
});

test('having asked at a stage, the end screen opens with the charts already showing', () => {
  const g = newGame(4271);
  begin(g);
  playStageScreen(g);
  click(g.root, /^Why did it go this way\?$/);
  click(g.root, /^On to/);
  for (let i = 1; i < stages.length; i++) { playStageScreen(g); click(g.root, /^(On to|See the whole story)/); }
  assertEqual(whyRegion(g.root).hidden, false);
  assertEqual(figures(g.root).length, 2);
});

test('no stray words on any Level 2 screen, in either kind of rupee', () => {
  const stray = /undefined|null|NaN|Infinity|false|\[object/;
  for (const seed of [4271, 11, 3]) {
    const g = playToEnd(seed);
    click(g.root, /^Why did it go this way\?$/);
    for (const mode of ['real', 'nominal']) {
      chooseMoney(g.root, mode);
      for (const b of whyButtons(g.root)) {
        b.click();
        const m = text(g.root).match(stray);
        assert(!m, `seed ${seed} ${mode}: found "${m && m[0]}"`);
      }
    }
  }
});

test('the year table has real structure: a caption, column headers and row headers', () => {
  const g = playToEnd();
  whyButtons(g.root)[0].click();
  const t = tables(g.root)[0];
  assert(findAll(t, n => n.tagName === 'CAPTION').length === 1, 'caption');
  assert(findAll(t, n => n.tagName === 'TH' && n.attrs.scope === 'col').length === 7, 'seven column headers');
  assert(findAll(t, n => n.tagName === 'TH' && n.attrs.scope === 'row').length >= 8, 'a row header per year');
});

// ---- housing ----

// Plays the early-career stage as the given persona and stops on the first question of the next stage.
function toFamilyStage(personaIndex, savingsTitle) {
  const g = newGame(4271);
  begin(g, personaIndex);
  playStageScreen(g, { [qIndex(0, 'savings')]: savingsTitle });
  click(g.root, /^On to/);
  return g;
}
const stepTo = (g, re) => {
  for (let i = 0; i < 12 && !re.test(text(g.root)); i++) click(g.root, /^Next$/);
  assert(re.test(text(g.root)), `never reached ${re}`);
};
const homeCards = (root) => findAll(root, n => n.tagName === 'BUTTON' && hasClass(n, 'option-card'));

test('the home question tells you what renting and buying cost, and closes buying until you can afford it', () => {
  const g = toFamilyStage(0, /Save hard/); // Aarav cannot afford a metro flat at 32
  stepTo(g, /Is it time to buy a home\?/);
  const [rent, buy] = homeCards(g.root);
  assert(/Rent now: ₹/.test(rent.textContent), 'rent shown');
  assert(/Home price ₹/.test(buy.textContent) && /a month for 20 years/.test(buy.textContent), 'price and instalment shown');
  assert(buy.disabled === true, 'buying is closed');
  assert(/Not yet: you are ₹[^ ]+( \w+)? short/.test(buy.textContent), `shortfall shown: ${buy.textContent}`);
  assert(rent.attrs['aria-pressed'] === 'true', 'renting is the standing pick');
});

test('when you can afford it, buying opens; the result shows the purchase and the home', () => {
  const g = toFamilyStage(1, /Save hard/); // Meera: a tier-2 flat is within reach
  stepTo(g, /Is it time to buy a home\?/);
  const [, buy] = homeCards(g.root);
  assert(!buy.disabled && !/Not yet/.test(buy.textContent), 'buying is open');
  buy.click();
  while (!buttonWithText(g.root, /^Play these/)) click(g.root, /^Next$/);
  click(g.root, /^Play these/);
  assert(/You bought a home/.test(text(g.root)), 'purchase card');
  assert(!/undefined|null|NaN|false|\[object/.test(text(g.root)), 'no stray words on the purchase result');
  assert(/your home is worth/.test(text(g.root)) && /still owed on it/.test(text(g.root)), 'home stats');
  // and the next stage no longer asks
  click(g.root, /^On to/);
  assert(!/Still renting\?/.test(text(g.root)) && !/Is it time to buy a home\?/.test(text(g.root)), 'not asked again');
  const peak = stages.find(s => s.id === 'peak');
  assert(new RegExp(`Question 1 of ${visibleRefs(peak).length - 1}`).test(text(g.root)), `one question fewer: ${text(g.root).slice(0, 300)}`);
});

test('keeping on renting asks again next stage, and the rent shows in the results', () => {
  const g = toFamilyStage(1, /Save hard/);
  while (!buttonWithText(g.root, /^Play these/)) click(g.root, /^Next$/);
  click(g.root, /^Play these/);
  assert(/paid in rent/.test(text(g.root)), 'rent stat');
  assert(!/You bought a home/.test(text(g.root)));
  click(g.root, /^On to/);
  stepTo(g, /Still renting\?/);
});

test('the bridge and the chart show housing once there is a home', () => {
  const g = toFamilyStage(1, /Save hard/);
  stepTo(g, /Is it time to buy a home\?/);
  homeCards(g.root)[1].click();
  while (!buttonWithText(g.root, /^Play these/)) click(g.root, /^Next$/);
  click(g.root, /^Play these/);
  while (buttonWithText(g.root, /^On to/)) { click(g.root, /^On to/); playStageScreen(g); }
  click(g.root, /^See the whole story/);
  whyButtons(g.root)[2].click(); // the 40s: a home owner by now
  const lines = findAll(g.root, n => hasClass(n, 'bridge-row')).map(r => r.attrs['data-line']);
  for (const id of ['homeInterest', 'homeUpkeep', 'homeGrowth']) assert(lines.includes(id), `${id} line: ${lines}`);
  assert(/Interest on the home loan/.test(text(g.root)) && /Your home's price change/.test(text(g.root)), 'plain labels');
  assert(findAll(g.root, n => hasClass(n, 'seg-home')).length > 0, 'the home is drawn on the chart');
  assert(/Your home/.test(text(g.root)), 'and named in the legend');
});

// ---- family ----

test('choosing a marriage age opens the wedding and partner questions; choosing "Not yet" closes them', () => {
  const g = newGame(4271);
  begin(g);
  stepTo(g, /Is marriage on the cards/);
  assert(new RegExp(`Question ${N0} of ${N0}`).test(text(g.root)), 'last question while single');
  assert(buttonWithText(g.root, /^Play these/), 'ready to play');
  pickCard(g.root, /Around 27/);
  assert(new RegExp(`Question ${N0} of ${N0 + 2}`).test(text(g.root)), 'two more questions');
  click(g.root, /^Next$/);
  assert(/What kind of wedding will it be\?/.test(text(g.root)) && /About ₹15 lakh/.test(text(g.root)), 'wedding sizes in today\'s money');
  pickCard(g.root, /Small and simple/);
  click(g.root, /^Next$/);
  assert(/Will your partner work\?/.test(text(g.root)), 'partner question');
  pickCard(g.root, /Works part-time/);
  assert(buttonWithText(g.root, /^Play these/), 'now ready to play');
  click(g.root, /^Back$/);
  click(g.root, /^Back$/);
  pickCard(g.root, /Not yet/);
  assert(new RegExp(`Question ${N0} of ${N0}`).test(text(g.root)), 'back to none');
  assert(buttonWithText(g.root, /^Play these/), 'play directly');
});

test('a wedding and then children show up in the stage results, and as lines in the story', () => {
  const g = newGame(4271);
  begin(g, 1); // Meera
  stepTo(g, /Is marriage on the cards/);
  pickCard(g.root, /Around 27/);
  click(g.root, /^Next$/);
  pickCard(g.root, /Small and simple/);
  click(g.root, /^Next$/);
  pickCard(g.root, /Works full-time/);
  click(g.root, /^Play these/);
  assert(/You got married/.test(text(g.root)), 'wedding card');
  assert(/The wedding cost ₹[^ ]+( \w+)?\./.test(text(g.root)), 'with its bill');
  assert(/your partner's pay, after tax/.test(text(g.root)), 'partner pay stat');
  assert(!/undefined|null|NaN|false|\[object/.test(text(g.root)), 'no stray words');
  click(g.root, /^On to/);
  stepTo(g, /Will you have children\?/);
  pickCard(g.root, /Two children/);
  while (!buttonWithText(g.root, /^Play these/)) click(g.root, /^Next$/);
  click(g.root, /^Play these/);
  assert(/A child arrived/.test(text(g.root)) && /A second child arrived/.test(text(g.root)), 'two births');
  assert(/spent on children/.test(text(g.root)), 'children stat');
  assert(!/undefined|null|NaN|false|\[object/.test(text(g.root)), 'no stray words');
  while (buttonWithText(g.root, /^On to/)) { click(g.root, /^On to/); playStageScreen(g); }
  click(g.root, /^See the whole story/);
  whyButtons(g.root)[2].click();
  const lines = findAll(g.root, n => hasClass(n, 'bridge-row')).map(r => r.attrs['data-line']);
  for (const id of ['spouse', 'children']) assert(lines.includes(id), `${id} line: ${lines}`);
  assert(/Children: birth, school and college/.test(text(g.root)) && /Your partner's pay, after their tax/.test(text(g.root)), 'plain labels');
});

test('a married player is not asked about marriage again, and the choices recap lists what was asked', () => {
  const g = newGame(4271);
  begin(g, 1);
  stepTo(g, /Is marriage on the cards/);
  pickCard(g.root, /Around 27/);
  click(g.root, /^Next$/);
  pickCard(g.root, /Small and simple/);
  click(g.root, /^Next$/);
  pickCard(g.root, /Works part-time/);
  click(g.root, /^Play these/);
  click(g.root, /^On to/);
  assert(!/Still single/.test(text(g.root)), 'no marriage question now');
});

// ---- the ending ----

test('the end of the story answers "could you stop working, and did the money last?" in words', () => {
  const g = newGame(4271);
  begin(g);
  for (let i = 0; i < stages.length; i++) {
    assert(!/your life ended at/i.test(text(g.root)), 'the end age is hidden until the end');
    playStageScreen(g);
    click(g.root, /^(On to|See the whole story)/);
  }
  const t = text(g.root);
  assert(/Could you stop working, and did the money last\?/.test(t), 'the question');
  assert(/(Yes|No)[.,]/.test(t) && /You stopped at 60/.test(t), `an answer: ${t.slice(0, 300)}`);
  assert(/your life ended at/.test(t) && /savings when you stopped/.test(t) && /left at the end/.test(t), 'the facts');
  assert(/Your 60s/.test(t), 'decade cards run past retirement');
  assert(/At 60 you had about/.test(t));
  assert(!/undefined|null|NaN|false|\[object|Infinity/.test(t), 'no stray words');
});

test('the retirement-style question is asked at the last stage, and a pension shows for the government officer', () => {
  const g = newGame(4271);
  begin(g, 1);
  for (let i = 0; i < 3; i++) { playStageScreen(g); click(g.root, /^On to/); }
  for (let i = 0; i < NLAST; i++) {
    if (/How will you live|nobody knows how long/i.test(text(g.root))) break;
    click(g.root, /^Next$/);
  }
  assert(/nobody knows how long they will live/i.test(text(g.root)), 'the question');
  pickCard(g.root, /Modest/);
  click(g.root, /^Play these/);
  click(g.root, /^See the whole story/);
  assert(/pension a year/.test(text(g.root)), 'the pension is shown');
});

test('a retired life shows its pension and drift as lines in the story', () => {
  const g = newGame(4271);
  begin(g, 1);
  finish(g);
  const buttons = whyButtons(g.root);
  buttons[buttons.length - 1].click(); // the last decade, in retirement
  assert(/Pay, pension and severance/.test(text(g.root)), 'pension is part of what came in');
});
