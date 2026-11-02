# Implementation Plan: Lifetime Money Simulator (India)

## Context
`intent.md` and `intent/*.md` define an educational, browser-only simulation where young Indian professionals play a lifetime of financial decisions with seeded luck. The repo currently holds only those docs. This plan builds v1 in small increments, each ending in something visible in the browser under liveserver. v2/v3 are out of scope here (see `intent/roadmap.md`).

Working rules for every increment:
- Engine stays pure (no DOM); UI only renders state and sends choices.
- Anything tunable goes in JSON, not code.
- Each increment: build, add engine tests to `tests.html`, open in liveserver and look at it, then commit.
- Pick up `intent/open-questions.md` items just before the increment that needs them (flagged below).
- At the end of each increment, update [architecture.md](architecture.md) so it describes the code as built.

Progress: increments 0, 1, 2, 3 done.

## Target layout
```
index.html            tests.html
css/    theme.css (tokens)   app.css
js/data/    loader.js  validate.js
js/engine/  rng.js state.js tick.js macro.js income.js assets.js tax.js
            events.js nudges.js family.js housing.js outcomes.js
js/ui/      main.js screens/*.js charts.js format.js disclosure.js
data/       personas/*.json  stages.json  events.json  instruments.json
            tax.json  macro.json  theme.json
```

## Increments

### 0. Scaffold: colorful shell (visible: a bright landing page)
- `index.html`, `theme.css` (palette, large informal font via Google Fonts link or system fallback, all as CSS variables), a landing screen with title, one-line purpose, "Start" button, and the "educational, not advice" footer.
- `loader.js` (fetch JSON with friendly errors), `validate.js` (tiny schema checker), `theme.json` read into CSS variables.
- `tests.html` with a minimal assert helper.
- **See:** the styled page loads via liveserver; a deliberate bad JSON shows a friendly error.
- **Open question to settle first:** mobile/accessibility baseline (#2) and disclaimer wording (#3).

### 1. Persona picker (visible: persona cards)
- `data/personas/metro-it.json`, `govt-psu.json` plus an index file; validator rules for persona schema.
- Persona cards (emoji/illustration, one-line story, starting salary/savings in lakh/crore via `format.js`); selecting one shows a "your starting line" summary and a retirement-age choice (55/60/65).
- **See:** pick a persona, see its profile. Adding a third JSON file makes a new card appear (proves extensibility).

### 2. Deterministic engine skeleton (visible: first decade cards)
- `rng.js` (mulberry32), `state.js` (single serializable object), `tick.js` (one year: income, expenses, savings, one generic investment at fixed return, inflation constant).
- UI: "Fast-forward" runs age 22 to retirement and shows 5-6 decade cards (net worth in today's rupees).
- `tests.html`: same seed gives same result; different seed differs; money invariants (no negative cash from nowhere).
- **See:** decade cards that change with the persona; a hidden `?seed=` URL param reproduces a run.

### 3. Life stages and choices (visible: the stage-by-stage game loop)
- `data/stages.json` (4-5 stages with age ranges, choice cards, effects such as savings rate, "Invest in yourself" None/Light/Serious as a simple income-growth modifier).
- Stage screen: big question, 2-3 choice cards, "play this stage" animates years and ends with the decade card and a one-line headline.
- **See:** an actual playthrough with decisions that visibly change net worth; retirement-age override applied.

### 4. Macro regimes and real instruments (visible: economy "weather", allocation choice)
- `macro.json` (Boom/Normal/Slowdown/Crisis, transition matrix, multipliers), `macro.js`, `instruments.json` (EPF/PPF, equity SIP, FD, gold with return distributions, lock-ins), `assets.js`.
- Allocation choice per stage (simple presets: Safe / Balanced / Growth); weather icon per year; inflation now varies with regime; display stays in today's rupees.
- **Sourcing pass:** look up and verify high-impact numbers (equity/debt/gold returns, CPI); every parameter gets `basis`, `confidence`, `asOf`.
- **See:** the same persona gets visibly different lives across seeds; a Crisis year dents net worth.

### 5. Life events and cushions (visible: event cards)
- `events.json` (8-10 events: job loss, medical emergency, windfall, parent illness, etc., weighted by persona/stage/regime), `events.js`; basic term/health insurance as choices that reduce impact; emergency-fund (liquid cover) check.
- UI: event card with what happened, what it cost, what cushioned it.
- **See:** replaying one seed shows the same events; buying insurance changes the cost line on the same event.

### 6. Decade-to-year drill-down and Level 2 "Why" (visible: charts and explanations)
- `charts.js` hand-written SVG: stacked net-worth composition, income vs expenses line.
- Decade card expands to year-by-year; "why?" panel on each number with named forces (inflation, lifestyle, regime, events); nominal/real toggle (display transform only); `disclosure.js` manages the three levels.
- **See:** tap a decade, then a number, get a causal explanation; toggle nominal and watch figures balloon.

### 7. Tax and capital gains (visible: take-home and post-tax returns)
- `tax.json` (illustrative slabs, year-stamped; capital-gains holding-period rules for equity, gold, property), `tax.js`; tax applied to income and on redemption/sale.
- "Why" panel shows tax drag as its own line.
- **See:** take-home differs from gross; selling equity early vs late shows different tax in a test and in the UI.

### 8. Family and housing (visible: marriage/kids/parents/home choices)
- `family.js`: marriage timing + wedding level, children count/timing with education inflation, parents' support and health events, spouse income parameter.
- `housing.js`: rent vs buy with EMI; city-tier parameter; property growth tied to regime.
- **Open question to settle first:** housing economics (#1).
- **See:** a full family-building stage with big choices; home purchase creates an EMI line and a dominant asset on the net-worth chart.

### 9. Behavior, capability and the ending (visible: nudges and the verdict)
- `nudges.js`: instinct cards (crash panic-sell, raise lifestyle upgrade, festival overspend, hot tip), persona biases, cap per stage; slow drift (lifestyle creep) as a named line.
- Capability model behind "Invest in yourself" refined: diminishing returns, decay, step jumps at switches/promotions.
- `outcomes.js`: random life expectancy (**open question #5**), FI ratio, resilience flag, light wellbeing signal, headline verdict "Could you stop working, and did the money last?".
- **See:** a complete start-to-finish run ending in the verdict screen.

### 10. Level 3 and polish (visible: advanced toggle, finished feel)
- Advanced toggle: seed display/entry, fixed regime sequence, parameter override panel with `basis/confidence/asOf` shown per number.
- Persistence per **open question #4** (`localStorage` for seed/resume, wrapped in try/catch).
- Accessibility/contrast and mobile pass; final disclaimer; Government persona tuned so it feels different (stability, pension, FD bias); update `intent/` docs where decisions changed and move resolved open questions to the decisions log.
- **See:** two clearly different personas, full runs, advanced users able to replay and tweak.

## Critical files
`index.html`, `css/theme.css`, `data/*.json`, `js/engine/tick.js` (core loop), `js/data/loader.js` + `validate.js`, `js/ui/disclosure.js`, `tests.html`.

## Verification
- **Engine:** `tests.html` in liveserver: determinism per seed, money-conservation invariants, regime transition sanity, tax and capital-gains cases, event reproducibility. Same modules runnable in Node if installed.
- **Per increment:** open under liveserver, do the "See" step, check console is clean.
- **End-to-end (increment 10):** play both personas to the verdict on 3 seeds; confirm same seed + same choices reproduces identical results; confirm a new persona JSON appears without code changes; confirm Level 1 alone gives a complete run.
