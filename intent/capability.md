# Capability and Income

**Summary:** (A simple one-stock version is built; see "As built".) Capability is a stock built from money and effort, with diminishing returns and decay. Default experience is one "Invest in yourself" choice; the three tracks and sliders live at Level 3.

## Model
- Three tracks: **technical/domain depth**, **leadership**, **network/credentials**. The persona's career path decides which matter (government rewards tenure and exams; gigs reward network and portfolio).
- Inputs each year: a **learning budget** (money) and **effort** (share of free time). Effort trades off against family time, side income and burnout risk.
- Gains show diminishing returns; skills decay if neglected.
- **Income** = persona base curve x capability multiplier, plus **step jumps** at promotions, job switches, new roles. Switches in private-sector careers give bigger jumps than internal raises.
- Opportunity cost is explicit: e.g. an MBA costs fees and two years of income.
- Interaction with luck: layoffs hit low-capability people harder; a good regime raises the payoff of upskilling.

## As built (increment 9, part 2)
- **One stock of skills** (0 to 1), not three tracks (those stay for v2). The "Invest in yourself" choice sets two things: the share of pay spent on learning (0%, 2%, 6%) and the effort (0, 0.4, 1: how much free time goes in).
- **Diminishing returns:** each year of effort closes a share of the gap to the ceiling, so each step is smaller than the last. **Decay:** the stock loses 10% a year, so stopping lets it fade. Effort buys less with age (full until 35, then 70%, 40%, 15%) and less in bad times (130% in a boom to 60% in a crisis).
- **What skills do:** they add up to 3 points a year to pay growth, times the persona's `skillPayoff` (the IT persona 1.0; the government officer 0.4, since government pay follows tenure and scales). They also still nudge event odds (fewer layoffs, more offers) through the pay boost, as before.
- **The cost of effort:** besides the money, a **burnout** event, with a yearly chance that scales with the square of the effort (about 5% at full effort, under 1% for a light learner), costing 2 to 8 months of mostly unpaid leave. A layoff in the same year takes precedence.
- **Wellbeing signal** on the verdict: "How it felt" is balanced, stretched (half or more of the working years all-in, or one burnout) or burnt out (two or more). A line, not a score.
- **What the model says** (120 lives each, rent only, 70% saved): coasting leaves the IT persona behind a learner in nearly every life; going all in beats keeping learning only in about 60% of lives (a few percent more wealth) at about two burnouts per life against a third for light. For the government officer, light learning helps a little and going all in loses to coasting in about nine lives out of ten.
- **Not built:** three tracks, effort and budget sliders (Level 3), career-break or MBA opportunity costs, burnout wiping out skills, and any link between effort and family time.

## Disclosure
- Level 1: a single choice, **None / Light / Serious**.
- Level 3: three tracks, budget and effort sliders.

## Version
Single choice in v1 (simple model behind it); full tracks and effort/burnout in v2.
