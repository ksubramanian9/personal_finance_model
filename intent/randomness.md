# Randomness

**Summary:** One seeded RNG drives everything, so runs are reproducible. Shocks are linked through macro regimes. Life events are weighted by persona and stage. Behavioral nudges let the user resist instinct. Nothing silently overrides the user.

## Seeded and replayable
- Seeded RNG (e.g. mulberry32). The seed is hidden by default and shown behind the advanced toggle, where it can be typed in.
- Same seed + same choices = same life. This is what makes testing possible.
- Same seed + different choices is the basis of the v2 counterfactual debrief.

## Macro regimes
- A small set of states: **Boom, Normal, Slowdown, Crisis**, moving on a transition matrix in `macro.json`, with persistence (a Crisis lasts 1-3 years).
- Each regime shifts equity return and volatility, inflation, layoff probability, hiring, job-switch premium, property growth, and the payoff of upskilling, together.
- Only the current year's regime is shown, after the fact. No foresight until Level 3, where a regime sequence can be fixed.

## Life events
- Base probability by stage and persona, e.g. job loss, medical emergency, windfall, parent's illness, startup opportunity.
- User state changes impact, not likelihood: no emergency fund means a medical event hurts more.
- v1 has about 8-10 events. Events are always shown with what happened, what it cost, and what cushioned it.

## Behavioral nudges
- At moments real people slip (crash, raise, festival/wedding season, hot tip) the persona has an *instinct*, biased by persona traits. The user follows or resists it. Resisting may carry a small stress/effort cost.
- Capped at about 1-2 per stage; crash nudges always fire. The cap is a JSON parameter.
- **Slow drift** (e.g. lifestyle creep) happens automatically but is always visible as a named line in the "why" panel.

## Luck dial (v2)
Gentle / Normal / Harsh, scaling event frequency and severity. Level 3.

## Deferred
Monte Carlo spread across many seeds (v3). It pushes toward a planner product.
