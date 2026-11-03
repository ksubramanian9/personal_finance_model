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

*As built (increment 9, part 1):* slow drift exists as **lifestyle drift**. When pay rises faster than prices, a share of the real rise (the persona's `lifestyleCreep`, 0.7 for the IT persona and 0.2 for the government officer) turns into spending that never comes back down. It is a named line in the "why" panel. The instinct cards (crash panic-sell, raise upgrade, festival overspend, hot tip) are not built yet.

*As built (increment 9, part 3):* the instinct cards exist. See "Instinct cards" below.

## Instinct cards (as built)
- **They pause the stage in the moment.** While a stage plays, the game stops after a year in which something tempting happened. A card shows the story, a line for what the persona's gut says, and two answers (follow, or resist). Nothing is pre-selected and nothing happens on its own.
- **Four cards:** *Market crash* (shares fell at least 15% in the year and you hold at least 1 lakh of them): following sells all your shares into fixed deposits, with tax on any gain. *Big raise* (after a recruiter's offer): following adds a fifth to everyday costs for good, counted as lifestyle drift. *Festival season*: following spends about 5% of a year's pay. *Hot tip*: following stakes a tenth of your sellable savings; one tip in five pays three times the stake and the rest lose it all (the win or loss is fixed by the seed, so it is the same whatever else you do).
- **Limits:** at most two ordinary cards a stage (a JSON setting); the crash card always shows and does not count. A card that would appear in a stage's last year is not shown.
- **Traits:** a persona's traits set how often a card shows and how loudly the gut speaks (calm, middling, loud). Lifestyle creep drives the raise and festival cards, the panic-sell trait the crash wording, and how little cautious they are drives the tip. The government officer never gets a raise card (no job offers).
- **Own random stream** (`"<seed>:nudges"`, four draws a year): cards never move any other luck, and answering "resist" to everything gives exactly the same life as playing the stages without cards.
- **What the model says** (100 lives each, retiring at 60): the IT persona sees about 8 cards a life; following every one leaves a median of about 35% less wealth, and following only the crash card loses money in about three lives out of four; following only the tips loses in about 70%.
- **Not built:** a stress cost for resisting (resisting is free in v1), more cards (a gold rush, a friend's startup), and counterfactuals ("what if you had held?"), which come with the v2 debrief.

Gentle / Normal / Harsh, scaling event frequency and severity. Level 3.

## Deferred
Monte Carlo spread across many seeds (v3). It pushes toward a planner product.
