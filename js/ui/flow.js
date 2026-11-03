import { createState } from '../engine/state.js';
import { nextStage, askedDecisions, playRetirement, beginStage, continueStage } from '../engine/stages.js';
import { answerNudge } from '../engine/nudges.js';
import { stageSummary } from '../engine/summary.js';
import { h, mount } from './dom.js';
import { renderPersonaPicker } from './screens/personaPicker.js';
import { renderStageDecisions, renderStageResult } from './screens/stage.js';
import { renderNudge } from './screens/nudge.js';
import { renderLifeSummary } from './screens/lifeSummary.js';
import { createDisclosure } from './disclosure.js';

const randomSeed = () => Math.floor(Math.random() * 9000) + 1000;

// The game's screen-to-screen flow. `data` holds loaded files: { personas, params, stages, decisions }.
// `session` holds the player's setup: { personaId, retirementAge, seed }.
export function createFlow(root, data, session) {
  let game = null; // { persona, state, stage, picks, startIdx }
  const disclosure = createDisclosure(); // how much detail the player has asked for, for the whole session
  const eventDefs = Object.fromEntries(data.params.events.map(e => [e.id, e]));

  const doneIds = () => Object.keys(game.state.choices);

  function showLanding() {
    mount(root,
      h('section', { class: 'hero' },
        h('div', { class: 'blobs', 'aria-hidden': 'true', text: '💰 📈 🏠 🎲' }),
        h('h1', {},
          'Live a ', h('span', { class: 'pop-1', text: 'lifetime' }),
          ' of ', h('span', { class: 'pop-2', text: 'money' }), ' choices'),
        h('p', { text: 'Pick a person, make the big calls, and watch how your choices and a bit of luck add up over the decades. No spreadsheets, just a story.' }),
        h('button', { class: 'btn', type: 'button', text: "Let's start!", onClick: showPicker })));
  }

  function showPicker() {
    game = null;
    renderPersonaPicker(root, data.personas, session, startGame);
  }

  // A fresh life for this persona with the session's seed and retirement age.
  function startGame(persona) {
    game = {
      persona,
      state: createState(persona, data.params, { seed: session.seed, retirementAge: session.retirementAge }),
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
      params: data.params,
      picks: game.picks,
      isFirst: game.state.history.length === 0,
      doneIds: doneIds(),
      onPlay: playCurrentStage,
    });
  }

  // Plays the chosen stage, stopping at any instinct card for the player's answer.
  function playCurrentStage() {
    const { stage } = game;
    game.picked = askedDecisions(stage, game.state, game.picks).map(ref => {
      const o = data.decisions[ref.id].options.find(x => x.id === game.picks[ref.id]);
      return { emoji: o.emoji, title: o.title };
    });
    const begun = beginStage(game.state, data.params, stage, data.decisions, game.picks);
    game.state = begun.state;
    game.endAge = begun.endAge;
    advance();
  }

  function advance() {
    const { stage } = game;
    const r = continueStage(game.state, data.params, stage, game.endAge);
    game.state = r.state;
    if (r.card) {
      renderNudge(root, {
        persona: game.persona, stages: data.stages, stage, card: r.card, def: data.params.nudges.cards[r.card.id],
        state: game.state, doneIds: doneIds().filter(id => id !== stage.id), // this stage is still being played
        onChoose: (choice) => { game.state = answerNudge(game.state, data.params, stage, r.card, choice); advance(); },
      });
      return;
    }
    renderStageResult(root, {
      stages: data.stages,
      stage,
      summary: stageSummary(game.state.history, game.startIdx, game.state.nudgeLog.filter(l => l.stageId === stage.id)),
      regimes: data.params.macro.regimes,
      eventDefs,
      cardDefs: data.params.nudges.cards,
      instruments: data.params.instruments,
      disclosure,
      years: game.state.history.slice(game.startIdx),
      doneIds: doneIds(),
      picked: game.picked,
      nextStage: nextStage(data.stages, game.state),
      onNext: enterNextStage,
    });
  }

  function showLifeSummary() {
    // The rest of life: the retirement years, until the end.
    if (game.state.age < game.state.deathAge) game.state = playRetirement(game.state, data.params);
    renderLifeSummary(root, {
      persona: game.persona,
      state: game.state,
      session,
      stages: data.stages,
      decisions: data.decisions,
      params: data.params,
      eventDefs,
      disclosure,
      onSameLuck: () => startGame(game.persona),
      onNewLuck: () => { session.seed = randomSeed(); startGame(game.persona); },
      onBack: showPicker,
    });
  }

  return { showLanding, showPicker, randomSeed };
}
