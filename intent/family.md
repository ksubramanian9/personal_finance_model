# Family

**Summary:** (As built in increment 8, part 2; see below.) Family is the biggest driver of Indian financial outcomes. Marriage and children are timing choices; parents are a standing obligation with random health events. The spouse is an income parameter, not a simulated person.

## Choices (Level 1)
- **Marriage timing** (e.g. 27 / 32 / not at all) and **wedding-cost level** (modest / typical / lavish).
- **Children:** 0, 1 or 2, and timing.
- **Parents:** support starts at persona-defined ages; health events are random.

## Mechanics
- Spouse: income parameter by partner type (non-working / part-time / dual-income) with a simple growth rate. No separate spouse career or skill tracks.
- Children: costs follow dependent ages; education inflation about 10%+; peaks at school and college; optional career-break income dip.
- Dependents and ages live in the state object, so costs follow naturally.

## As built (increment 8, part 2)
- **Marriage:** asked in the early-career stage (not yet / around 27 / around 30) and, if still single, in the next stage (not planning to / around 34 / around 38). Choosing a date opens two more questions: the wedding size (about 5, 15 or 40 lakh in today's rupees) and whether the partner works (at home, part-time at 30% of your pay, full-time at 80%). The wedding happens in the planned year; from then on everyday costs are 40% higher and rent 20% higher.
- **Partner's pay:** a share of the player's pay, taxed separately as their own income; only the pay after tax counts (a line in the bridge). There is no partner career, no partner job loss and no partner skills.
- **Children:** asked in the "Building a life" stage for anyone married or planning to be (none, one, two), and in the "Peak earning" stage for the married and childless. The first child arrives two years after the wedding (or at once if they have been married that long), the second three years later. Each child costs a yearly amount by age band (birth and first year, toddler, playschool, school, college; independent after 21) in today's rupees, scaled by city tier (tier-2 is 65% of a metro), and school and college fees rise 3 points a year faster than general prices.
- **Parents:** unchanged. The standing support in each persona file and the random "parent's health scare" event stay; there is no new choice about parents.
- **Numbers:** in `data/family.json` with provenance (wedding sizes sit in `stages.json`). All low confidence, from blogs and press summaries: a child costs about 50 lakh by 21 in a metro before fees outrun prices, at the low end of published figures (50 lakh to over a crore).
- **What the model says:** with one income, two children cost a lot: a government officer with a partner at home and two children can end up borrowing for decades. The game cannot cut spending, so it borrows, and the player is left with the lesson that a second income, a smaller family or a cheaper wedding matter. A working partner more than pays for the children in every case tried.
- **Not built:** term life insurance and any death or disability of the earner (it needs the life-expectancy decision in increment 9), career breaks, single parenthood, a partner's own savings, and parents moving in.

## Out of scope
Spouse career simulation; extended family beyond parents.
