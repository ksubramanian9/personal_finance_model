import { createState, STATE_VERSION } from '../engine/state.js';
import { nextStage, askedDecisions, playRetirement, beginStage, continueStage } from '../engine/stages.js';
import { answerNudge } from '../engine/nudges.js';
import { stageSummary } from '../engine/summary.js';
import { h, mount } from './dom.js';
import { renderPersonaPicker, renderPersonaSetup } from './screens/personaPicker.js';
import { renderStageDecisions, renderStageResult } from './screens/stage.js';
import { renderNudge } from './screens/nudge.js';
import { renderLifeSummary } from './screens/lifeSummary.js';
import { createDisclosure } from './disclosure.js';
import { createNoStore } from './storage.js';
import { advancedPanel } from './advanced.js';
import { applyOverrides, normalizeOverrides } from '../data/overrides.js';
import { collectSources } from '../data/provenance.js';
import { personaWithStart, changesBetween } from '../data/personas.js';

const randomSeed = () => Math.floor(Math.random() * 9000) + 1000;

// The game's screen-to-screen flow. `data` holds loaded files: { personas, params, stages, decisions }.
// `session` holds the player's setup: { personaId, retirementAge, seed }. `store` (see storage.js)
// remembers settings and a life in progress; without one nothing is remembered.
export function createFlow(root, data, session, store = createNoStore()) {
  let game = null; // { persona, state, stage, picks, startIdx, picked, endAge, card }
  const saved = store.loadSettings();
  const disclosure = createDisclosure({
    level: saved.level, real: saved.real,
    onChange: (d) => store.saveSettings({ ...store.loadSettings(), level: d.level, real: d.real }),
  }); // how much detail the player has asked for, remembered between visits
  const baseEventDefs = Object.fromEntries(data.params.events.map(e => [e.id, e]));
  // A persona can use its own words for an event (a freelancer loses a client, not a job).
  const eventDefsFor = (persona) => Object.fromEntries(Object.entries(baseEventDefs).map(([id, def]) => [id, { ...def, ...(persona?.eventText?.[id] ?? {}) }]));
  const entries = collectSources({ ...data.params.sources, ...(data.sources ?? {}) }); // for the Level 3 data browser
  const gameParams = () => (game?.params ?? data.params); // the params this life uses (Level 3 may have changed some)

  const doneIds = () => Object.keys(game.state.choices);

  // A saved life that still fits this game, or null (and the old one is forgotten).
  function resumable() {
    const life = store.loadLife();
    if (!life) return null;
    const persona = data.personas.find(p => p.id === life.personaId);
    const stage = life.stageId ? data.stages.find(s => s.id === life.stageId) : null;
    const ok = persona && life.state && life.state.version === STATE_VERSION && life.state.personaId === persona.id
      && Array.isArray(life.state.history) && ['decisions', 'card', 'result'].includes(life.phase)
      && (life.phase === 'decisions' || stage)
      && (life.phase !== 'card' || (life.card && data.params.nudges.cards[life.card.id]))
      && (!life.state.custom?.scriptId || data.params.macro.scripts?.[life.state.custom.scriptId]);
    if (!ok) { store.clearLife(); return null; }
    return { life, persona, stage };
  }

  // What to remember so a closed tab can pick up where it left off.
  function persist(phase, card = null) {
    if (!game) return;
    store.saveLife({
      phase, personaId: game.persona.id, seed: session.seed, retirementAge: session.retirementAge, changes: changesBetween(game.persona, data.personas.find(p => p.id === game.persona.id)),
      stageId: phase === 'decisions' ? null : game.stage.id,
      state: game.state, picks: game.picks, startIdx: game.startIdx, picked: game.picked ?? [], endAge: game.endAge ?? null, card,
    });
  }

  function resume({ life, persona, stage }) {
    session.seed = life.seed;
    session.retirementAge = life.retirementAge;
    session.personaId = persona.id;
    const played = personaWithStart(persona, life.changes); // the starting numbers this life was begun with
    session.start = { ...session.start, [persona.id]: changesBetween(played, persona) };
    const custom = life.state.custom ?? { scriptId: null, overrides: {} };
    session.script = custom.scriptId;
    session.overrides = custom.overrides;
    game = { persona: played, params: applyOverrides(data.params, custom.overrides), state: life.state, stage, picks: life.picks ?? {}, startIdx: life.startIdx ?? 0, picked: life.picked ?? [], endAge: life.endAge };
    if (life.phase === 'card') showCard(life.card);
    else if (life.phase === 'result') showResult();
    else enterNextStage();
  }

  function showLanding() {
    const again = resumable();
    mount(root,
      h('section', { class: 'hero' },
        h('div', { class: 'blobs', 'aria-hidden': 'true', text: '💰 📈 🏠 🎲' }),
        h('h1', {},
          'Live a ', h('span', { class: 'pop-1', text: 'lifetime' }),
          ' of ', h('span', { class: 'pop-2', text: 'money' }), ' choices'),
        h('p', { text: 'Pick a person, make the big calls, and watch how your choices and a bit of luck add up over the decades. No spreadsheets, just a story.' }),
        again && h('div', { class: 'resume card' },
          h('p', { class: 'headline', text: `Pick up where you left off: ${again.persona.firstName}, age ${again.life.state.age}` }),
          h('div', { class: 'actions inline' },
            h('button', { class: 'btn', type: 'button', text: 'Continue', onClick: () => resume(again) }),
            h('button', { class: 'btn secondary small', type: 'button', text: 'Forget my progress', onClick: () => { store.clearLife(); showLanding(); } }))),
        h('button', { class: again ? 'btn secondary' : 'btn', type: 'button', text: again ? 'Start a new life' : "Let's start!", onClick: showPicker })));
  }

  function showPicker() {
    game = null;
    renderPersonaPicker(root, data.personas, session, showSetup);
  }

  // The second page: the chosen person's starting numbers, when to stop working, and the Advanced panel.
  function showSetup() {
    const persona = data.personas.find(p => p.id === session.personaId);
    if (!persona) return showPicker();
    renderPersonaSetup(root, persona, session, startGame, showPicker, () => advancedPanel({
      session, params: data.params, entries, randomSeed,
      onReset: showSetup,
    }));
  }

  // A fresh life for this persona with the session's seed and retirement age.
  function startGame(chosen) {
    const persona = personaWithStart(chosen, session.start?.[chosen.id]); // the numbers the player changed, if any
    store.saveSettings({ ...store.loadSettings(), personaId: persona.id, retirementAge: session.retirementAge });
    // Level 3: this life may use fixed weather and a few changed numbers.
    const custom = { scriptId: session.script ?? null, overrides: normalizeOverrides(session.overrides) };
    const params = applyOverrides(data.params, custom.overrides);
    game = {
      persona,
      params,
      state: createState(persona, params, { seed: session.seed, retirementAge: session.retirementAge, custom: custom.scriptId || Object.keys(custom.overrides).length ? custom : null }),
      stage: null, picks: {}, startIdx: 0,
    };
    enterNextStage();
  }

  function enterNextStage() {
    const stage = nextStage(data.stages, game.state);
    if (!stage) return showLifeSummary();
    game.stage = stage;
    game.picks = {};
    game.startIdx = game.state.history.length;
    renderStageDecisions(root, {
      persona: game.persona,
      stages: data.stages,
      stage,
      decisions: data.decisions,
      state: game.state,
      params: gameParams(),
      picks: game.picks,
      isFirst: game.state.history.length === 0,
      doneIds: doneIds(),
      onPlay: playCurrentStage,
      learn: data.learn,
    });
    persist('decisions');
  }

  // Plays the chosen stage, stopping at any instinct card for the player's answer.
  function playCurrentStage() {
    const { stage } = game;
    game.picked = askedDecisions(stage, game.state, game.picks).map(ref => {
      const o = data.decisions[ref.id].options.find(x => x.id === game.picks[ref.id]);
      return { emoji: o.emoji, title: o.title };
    });
    const begun = beginStage(game.state, gameParams(), stage, data.decisions, game.picks);
    game.state = begun.state;
    game.endAge = begun.endAge;
    advance();
  }

  function advance() {
    const { stage } = game;
    const r = continueStage(game.state, gameParams(), stage, game.endAge);
    game.state = r.state;
    if (r.card) showCard(r.card);
    else showResult();
  }

  function showCard(card) {
    const { stage } = game;
    renderNudge(root, {
      persona: game.persona, stages: data.stages, stage, card, def: gameParams().nudges.cards[card.id],
      state: game.state, doneIds: doneIds().filter(id => id !== stage.id), // this stage is still being played
      onChoose: (choice) => { game.state = answerNudge(game.state, gameParams(), stage, card, choice); advance(); },
    });
    persist('card', card);
  }

  function showResult() {
    const { stage } = game;
    renderStageResult(root, {
      stages: data.stages,
      stage,
      summary: stageSummary(game.state.history, game.startIdx, game.state.nudgeLog.filter(l => l.stageId === stage.id)),
      regimes: gameParams().macro.regimes,
      eventDefs: eventDefsFor(game.persona),
      cardDefs: gameParams().nudges.cards,
      instruments: gameParams().instruments,
      disclosure,
      years: game.state.history.slice(game.startIdx),
      doneIds: doneIds(),
      picked: game.picked,
      nextStage: nextStage(data.stages, game.state),
      onNext: enterNextStage,
    });
    persist('result');
  }

  function showLifeSummary() {
    store.clearLife(); // a finished life is not kept
    // The rest of life: the retirement years, until the end.
    if (game.state.age < game.state.deathAge) game.state = playRetirement(game.state, gameParams());
    renderLifeSummary(root, {
      persona: game.persona,
      state: game.state,
      session,
      stages: data.stages,
      decisions: data.decisions,
      params: gameParams(),
      eventDefs: eventDefsFor(game.persona),
      disclosure,
      onSameLuck: () => startGame(game.persona),
      onNewLuck: () => { session.seed = randomSeed(); startGame(game.persona); },
      onBack: showPicker,
    });
  }

  return { showLanding, showPicker, showSetup, randomSeed, disclosure };
}
