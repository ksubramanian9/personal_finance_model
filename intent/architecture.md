# Architecture

**Summary:** Three layers with one-way imports: `data` (load and validate JSON) and `engine` (pure simulation) feed `ui` (render and collect choices). Everything tunable lives in JSON. This file describes the code *as built*; the plan in [implementation-plan](implementation-plan.md) says what comes next. Update this file at the end of each increment.

**Status:** as of increment 4 (economy regimes and real instruments). Planned-but-unbuilt modules are listed at the bottom.

## Module map (as built)

```
index.html              entry; loads css and js/ui/main.js as a module
tests.html              browser test runner (imports js/tests/run.js)
package.json            only marks files as ES modules and defines `npm test`

data/                   all tunable numbers and content (JSON)
  theme.json            colors, sizes, fonts -> CSS variables
  engine.json           engine parameters (cash/debt rates, savings rate, starting allocation)
  macro.json            economy regimes (inflation, raise adjustment) and the transition matrix
  instruments.json      pf / equity / fd / gold: returns by regime, liquidity, provenance
  stages.json           decision library (options + effects) and the ordered life stages
  personas/index.json   lists persona files, in display order
  personas/*.json       one thick persona each

js/data/                load + validate; no DOM, no engine
  validate.js           tiny schema checker + the schemas table
  loader.js             loadJSON (fetch + friendly errors), applyTheme
  personas.js           loadPersonas: index -> files -> schema -> range checks
  stages.js             loadStages + checkStages (ranges, contiguity, same-effects rule, allocation sums)
  params.js             loadParams: engine + macro + instruments, with cross-file checks

js/engine/              pure simulation; no DOM, no fetch, no data/ or ui/ imports
  rng.js                seeded mulberry32; generator is a plain {s} object
  macro.js              nextRegime, stationaryDistribution
  state.js              createState, netWorth, totalInvested
  tick.js               tickYear (one year), runUntil
  stages.js             nextStage, stageEnd, currentOption, applyPicks, playStage
  summary.js            stageSummary (one stage) and decadeSummary (decade cards)

js/ui/                  rendering and user input; may import data/ and engine/
  main.js               boot: load theme + data, create the flow, show landing
  flow.js               createFlow(root, data, session): screen-to-screen game flow
  dom.js                h(): element builder (textContent); mount(): safe replaceChildren
  format.js             formatINR (lakh/crore)
  screens/              one file per screen
    personaPicker.js
    stage.js            journey bar, one-question-at-a-time decisions, stage result
    lifeSummary.js      end of run: decade cards, choices recap, replay buttons

js/tests/               harness + *.test.js; run in browser and Node
  fakeDom.js            minimal DOM so UI flows can be driven in Node (browser uses the real one)
```

## Import rules
| Layer | May import | Must not import |
|---|---|---|
| `engine/` | other `engine/` files | `data/`, `ui/`, DOM, `fetch`, `Math.random`, `Date` |
| `data/` | other `data/` files | `engine/`, `ui/` |
| `ui/` | `data/`, `engine/` | (nothing imports `ui/` except `index.html`) |
| `tests/` | anything | |

Why: the engine stays testable in Node and reproducible from a seed. Data parameters reach the engine as plain arguments (`params`, `persona`), never by the engine fetching them.

## Data flow
```
data/*.json --fetch--> loader.js --validate.js--> persona / params objects
                                                      |
   user picks persona, retirement age, seed (session) |
                                                      v
                            createState(persona, params, {seed, retirementAge})
                                                      |
                                    runUntil / tickYear (pure, repeated)
                                                      v
                              state.history[]  --decadeSummary--> decade cards
                                                      |
                                                  ui/screens render
```

- **Session** (created in `main.js`, owned by `flow.js`): what the user chose up front (persona, retirement age, seed). Lives in the UI.
- **Stage loop** (`flow.js`): `nextStage` -> `renderStageDecisions` (collect `picks`) -> `playStage` (apply picks, run to the stage end) -> `renderStageResult` -> repeat, then `renderLifeSummary`. The engine never knows about screens.
- **Choices are data.** `stages.json` holds a decision library (`savings`, `growth`, `retire`) and stages that reference decisions by id. An option's `effects` set whitelisted state fields (`savingsRate`, `learningPct`, `growthBoost`, `retirementAge`). Picks stay in force until a later stage changes them. "What you do now" is found by matching a state to an option's effects (`currentOption`), so all options of one decision must set the same keys.
- **State** (`engine/state.js`): the whole game in one JSON-serializable object, including the RNG state. `JSON.parse(JSON.stringify(state))` resumes with identical luck. A test guards this.
- **History**: `tickYear` appends one record per year (flows, return, net worth nominal and real). Charts and "why" panels read history; they never recompute.

## Conventions
- **`params` is one object**: `loadParams()` returns `{ ...engine.json, macro, instruments }`. Pass it to `createState` and `tickYear`; tests use the same loader.
- **Money is nominal rupees inside the engine.** `priceIndex` (1.0 at start) converts to today's rupees. History carries `*Real` fields so the UI doesn't divide.
- **`tickYear` is pure.** It `structuredClone`s the input state and returns a new one. Randomness comes only from `state.rng`.
- **Each year consumes a fixed number of RNG values** (1 uniform for the economy + 1 normal per instrument, in `instruments.json` order, whatever the player holds). So the same seed gives the same economy and market returns however the player invests; a test guards this. When you add a random event, give it its own fixed draws and put it after the existing ones.
- **The instruments file order is part of the seed contract.** Reordering or inserting instruments changes every replay.
- **New savings follow the allocation; existing holdings are never sold to rebalance** (selling would trigger tax). Deficits are met from cash, then liquid instruments by `drawOrder`; provident funds are locked in and never sold.
- **Errors are for people.** Loader and validator messages name the file and the field. The UI shows them in an error card; it does not swallow them.
- **UI text goes in with `textContent`** (via `dom.js`), never `innerHTML`, since persona text comes from JSON.
- **Use `mount(root, ...)`, never bare `replaceChildren`.** The real DOM prints `undefined`/`false` as text; `mount` drops empty children so `cond && h(...)` is safe. A test walks every screen looking for stray words.
- **Every tunable carries provenance** (`basis`, `confidence`, `asOf`) where it is a real-world estimate.
- **Accent colors** are theme keys (`accent1..3`), mapped to CSS classes `accent-accentN` that set `--accent`.

## Recipes

**Add a persona.** Copy `data/personas/metro-it.json`, give it a unique `id`, edit, and add the filename to `data/personas/index.json`. `loadPersonas` validates it (schema in `validate.js`, ranges in `personas.js:checkPersona`) and a card appears. No code change.

**Add a JSON data file.**
1. Add the file under `data/`.
2. Add its schema to `schemas` in `js/data/validate.js`.
3. Load it in `main.js` with `loadJSON(path, { schema, label })`.
4. Pass the result into the engine as an argument.
5. Add a test that loads the real file (see `engine.test.js`) and one that breaks it.

**Add an engine step.** Put it in its own pure module under `js/engine/`, call it from `tickYear`, record its effect in the year's `history` record, and extend the balance-identity test in `engine.test.js` so the new flow is accounted for.

**Add a screen.** Create `js/ui/screens/<name>.js` exporting `render<Name>(root, ...)` that calls `mount(root, ...)`, and wire it into `flow.js`.

**Add a stage or a choice.** Edit `data/stages.json` only: add an option to a decision, or a stage whose `decisions` reference decision ids. Stages must be contiguous and the last must end with `toAge: null`. `checkStages` reports mistakes in plain words. A new *kind* of effect needs a line in `EFFECT_RANGES` (`js/data/stages.js`), `SETTABLE` (`js/engine/stages.js`) and the tick that uses it.

**Add a test.** Create `js/tests/<name>.test.js` using `test/assert*` from `harness.js`, then import it in **both** `run.js` (browser) and `run-node.mjs` (Node). Use `getFetch()` from `dataFetch.js` to load real data files in either environment.

## Running
- Browser: serve the folder with liveserver (port in `.vscode/settings.json` is a local setting), open `index.html` or `tests.html`. `file://` will not work because JSON is fetched.
- Node: `npm test` (or `node js/tests/run-node.mjs`).
- Replay a run: `index.html?seed=4271`.

## Testing approach
- **UI flows run in Node** against `fakeDom.js` (`flow.test.js`): play whole games by clicking buttons, check Back/replay behavior, retirement-age labels, and that no screen shows stray text. The fake DOM mimics the browser by turning non-node children into text, which is what exposed a real bug.
- Engine tests assert **invariants** (every year's net-worth change is fully explained; balances never negative; determinism; save/reload continues identically) rather than only golden numbers.
- One **golden-value** test pins seed 4271. When parameters change on purpose, re-pin it; if they did not change, something broke.
- Data tests load the real files and also feed deliberately broken ones to check error messages.

## Planned but not built yet
Tracked in [implementation-plan](implementation-plan.md). New modules expected: `engine/income.js`, `assets.js`, `tax.js`, `events.js`, `family.js`, `housing.js`, `nudges.js`, `outcomes.js`; `data/events.json`, `tax.json`; `ui/charts.js`, `ui/disclosure.js`. The single-investment placeholder is gone; regimes and instruments arrived in increment 4.

## Known loose ends
- No retirement (drawdown) stage yet; the run ends at the retirement age. Arrives with the outcomes work in increment 9.
- "Go all in" on learning is still the best choice for every persona and seed tried. Diminishing returns and decay come with increment 9.
- Over a 38-year horizon with no forced selling, a bolder mix has about the same bad-luck outcome (p10) as a safe one but a much higher median. Equity risk only bites when something forces sales (job loss, medical bills) or near retirement; events arrive in increment 5.
- Outcomes are still optimistic: no tax, family, home or events yet.
- Equity and gold volatilities, the gold safe-haven pattern, FD rates and the regime shares are estimates (confidence low); see provenance in the data files.
- The stage screens are tested through the fake DOM only; nobody has looked at them in a real browser yet.
- The "fixed draws per step" convention above has no test yet.
- Seeds from `?seed=` are used as given; there is no UI to type a seed yet (Level 3, increment 10).
