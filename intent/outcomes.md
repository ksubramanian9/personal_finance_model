# Outcomes and the Debrief

**Summary:** One headline question, a few health measures, no composite score, and a narrative debrief explaining the moments that mattered.

## Headline
**"Could you have stopped working at your chosen retirement age, and did the money last to the end of life?"** A binary the user grasps immediately.

## Measures (decade cards, Level 1)
- **Net worth** and its composition
- **FI ratio** (could passive income/corpus cover expenses?)
- **Resilience** flag (liquid cover, insurance adequacy, shocks absorbed vs forced distress sales)
- A **light wellbeing signal** from the effort trade-off (see [capability](capability.md))

## As built (increment 9, part 1)
- **Life length** (open question 5, resolved): drawn once per life from a bell curve (mean 80, spread 8 years, clipped to 68 to 100) on its own random stream (`"<seed>:life"`), so no other luck moves. Hidden until the end screen. It does not depend on persona, health cover or choices, and nobody dies before they can retire.
- **Retirement years are played.** After the last stage the game plays on, year by year, to the end of life: no pay; everyday costs become the chosen share (Comfortable 100%, Modest 75%, Lean 55%) of the last working year's; parents' support and the employer's health cover end; provident funds unlock and are drawn after fixed deposits; the government persona's pension is 30% of last pay (half of basic pay under the Unified Pension Scheme) and rises with prices; loans, rent and children's costs carry on.
- **The verdict** (`engine/outcomes.js`) has three answers: *lasted* (savings and pension covered every year), *sold the home* (they did, but only by selling the home, a last resort) and *ran out* (the player had to borrow to live; the age is shown, with how many years before the end). It also shows what the savings could pay for when work stopped ("years of cover"), the pension, how the life ended and what was left.
- **Spendable money** is cash and investments, including provident funds once retired. The home you live in is not counted.
- **Resilience** is a plain "steady or shaky" line: steady means at most one working year of borrowing to cover bills and never a forced home sale.
- **Wellbeing signal and the narrative debrief:** not built yet (the signal comes with the effort side of capability; the debrief is v2).
- **What the model says** (seed sets of 60 per row, retiring at 60 with a 3-month fund and basic cover): the single IT persona lasts in about 97% of lives (median cover 56 years); with a wedding, a half-time partner and two children only about half do (median cover 14 years). The government persona lasts in nearly all lives, because the pension covers most spending: playing safe works, at the cost of a smaller estate.

## No composite score
A single score invites gaming, needs arbitrary weights and bakes in values about what a good life is. It would turn the tool into a game.

## Debrief (v2)
A short narrative of the 3-4 moments that mattered, e.g. "the 2031 layoff cost you Rs 18L because you had 2 months' cover; with 6 months you'd have been fine". Uses same-seed counterfactual replay to show what a different choice would have changed.
