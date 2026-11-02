# Architecture

**Summary:** Three layers with one-way imports: `data` (load and validate JSON) and `engine` (pure simulation) feed `ui` (render and collect choices). Everything tunable lives in JSON. This file describes the code *as built*; the plan in [implementation-plan](implementation-plan.md) says what comes next. Update this file at the end of each increment.

**Status:** as of increment 2 (engine skeleton). Planned-but-unbuilt modules are listed at the bottom.

## Module map (as built)

```
index.html              entry; loads css and js/ui/main.js as a module
tests.html              browser test runner (imports js/tests/run.js)
package.json            only marks files as ES modules and defines `npm test`

data/                   all tunable numbers and content (JSON)
  theme.json            colors, sizes, fonts -> CSS variables
  engine.json           engine parameters (inflation, returns, savings rate)
  personas/index.json   lists persona files, in display order
  personas/*.json       one thick persona each

js/data/                load + validate; no DOM, no engine
  validate.js           tiny schema checker + the schemas table
  loader.js             loadJSON (fetch + friendly errors), applyTheme
  personas.js           loadPersonas: index -> files -> schema -> range checks

js/engine/              pure simulation; no DOM, no fetch, no data/ or ui/ imports
  rng.js                seeded mulberry32; generator is a plain {s} object
  state.js              createState, netWorth
  tick.js               tickYear (one year), runUntil
  summary.js            decadeSummary (history -> decade cards)

js/ui/                  rendering and user input; may import data/ and engine/
  main.js               boot, session, screen switching
  dom.js                h(): element builder using textContent
  format.js             formatINR (lakh/crore)
  screens/              one file per screen
    personaPicker.js
    fastForward.js

js/tests/               harness + *.test.js; run in browser and Node
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

- **Session** (`main.js`): what the user chose (persona, retirement age, seed). Lives in the UI.
- **State** (`engine/state.js`): the whole game in one JSON-serializable object, including the RNG state. `JSON.parse(JSON.stringify(state))` resumes with identical luck. A test guards this.
- **History**: `tickYear` appends one record per year (flows, return, net worth nominal and real). Charts and "why" panels read history; they never recompute.

## Conventions
- **Money is nominal rupees inside the engine.** `priceIndex` (1.0 at start) converts to today's rupees. History carries `*Real` fields so the UI doesn't divide.
- **`tickYear` is pure.** It `structuredClone`s the input state and returns a new one. Randomness comes only from `state.rng`.
- **Each draw consumes a fixed number of RNG values**, so adding a new random event later does not shuffle unrelated outcomes in a replay of the same seed. (Not yet tested; becomes important in increment 4+.)
- **Errors are for people.** Loader and validator messages name the file and the field. The UI shows them in an error card; it does not swallow them.
- **UI text goes in with `textContent`** (via `dom.js`), never `innerHTML`, since persona text comes from JSON.
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

**Add a screen.** Create `js/ui/screens/<name>.js` exporting `render<Name>(root, ...)` that ends with `root.replaceChildren(...)`, and wire it into `main.js`.

**Add a test.** Create `js/tests/<name>.test.js` using `test/assert*` from `harness.js`, then import it in **both** `run.js` (browser) and `run-node.mjs` (Node). Use `getFetch()` from `dataFetch.js` to load real data files in either environment.

## Running
- Browser: serve the folder with liveserver (port in `.vscode/settings.json` is a local setting), open `index.html` or `tests.html`. `file://` will not work because JSON is fetched.
- Node: `npm test` (or `node js/tests/run-node.mjs`).
- Replay a run: `index.html?seed=4271`.

## Testing approach
- Engine tests assert **invariants** (every year's net-worth change is fully explained; balances never negative; determinism; save/reload continues identically) rather than only golden numbers.
- One **golden-value** test pins seed 4271. When parameters change on purpose, re-pin it; if they did not change, something broke.
- Data tests load the real files and also feed deliberately broken ones to check error messages.

## Planned but not built yet
Tracked in [implementation-plan](implementation-plan.md). New modules expected: `engine/macro.js`, `income.js`, `assets.js`, `tax.js`, `events.js`, `family.js`, `housing.js`, `nudges.js`, `outcomes.js`; `data/stages.json`, `macro.json`, `instruments.json`, `events.json`, `tax.json`; `ui/charts.js`, `ui/disclosure.js`. The `engine.json` single-investment placeholder is replaced by instruments and regimes in increment 4.

## Known loose ends
- `data/personas.js` imports `validate` but does not use it.
- The "fixed draws per step" convention above has no test yet.
- Seeds from `?seed=` are used as given; there is no UI to type a seed yet (Level 3, increment 10).
