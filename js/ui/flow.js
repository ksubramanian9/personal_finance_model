import { createState } from '../engine/state.js';
import { nextStage, playStage } from '../engine/stages.js';
import { stageSummary } from '../engine/summary.js';
import { h, mount } from './dom.js';
import { renderPersonaPicker } from './screens/personaPicker.js';
import { renderStageDecisions, renderStageResult } from './screens/stage.js';
import { renderLifeSummary } from './screens/lifeSummary.js';

const randomSeed = () => Math.floor(Math.random() * 9000) + 1000;

// The game's screen-to-screen flow. `data` holds loaded files: { personas, params, stages, decisions }.
// `session` holds the player's setup: { personaId, retirementAge, seed }.
export function createFlow(root, data, session) {
  let game = null; // { persona, state, stage, picks, startIdx }

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
      picks: game.picks,
      isFirst: game.state.history.length === 0,
      doneIds: doneIds(),
      onPlay: playCurrentStage,
    });
  }

  function playCurrentStage() {
    const { stage } = game;
    const picked = stage.decisions.map(ref => {
      const o = data.decisions[ref.id].options.find(x => x.id === game.picks[ref.id]);
      return { emoji: o.emoji, title: o.title };
    });
    game.state = playStage(game.state, data.params, stage, data.decisions, game.picks);
    renderStageResult(root, {
      stages: data.stages,
      stage,
      summary: stageSummary(game.state.history, game.startIdx),
      regimes: data.params.macro.regimes,
      doneIds: doneIds(),
      picked,
      nextStage: nextStage(data.stages, game.state),
      onNext: enterNextStage,
    });
  }

  function showLifeSummary() {
    renderLifeSummary(root, {
      persona: game.persona,
      state: game.state,
      session,
      stages: data.stages,
      decisions: data.decisions,
      onSameLuck: () => startGame(game.persona),
      onNewLuck: () => { session.seed = randomSeed(); startGame(game.persona); },
      onBack: showPicker,
    });
  }

  return { showLanding, showPicker, randomSeed };
}
