# Learn Pages

**Summary:** Eight short reference pages (banking and credit, health insurance, life insurance, investing and wealth, tax, skills and income, housing, retirement), opened on request from a "Learn" link in the footer or from a quiet link at the matching decision. Each page has real-world India essentials first, then how the game treats the topic. Content is JSON, sourced like the rest of the game's numbers. **Status: planned, not built.** Settled in a grilling session on 2026-11-04; see decisions 68 to 75.

## Purpose
Each page does two jobs (decision 68):
1. **Real-world essentials** for a young professional in India: what it is, how it works, what to decide, the common traps.
2. **How this game treats it:** what the game simplifies or leaves out, so a page never contradicts what the player just played.

These pages teach; they are not advice (principle 1). They are not a planner and add no calculators.

## Topics (decision 69)
| # | Page | Connects to in the game |
|---|---|---|
| 1 | Banking and credit | Savings, FD, the emergency-fund decision, the home loan and EMI |
| 2 | Health insurance | The `health` decision at every stage, medical-cost events |
| 3 | Life insurance | Not modelled in the game; real-life decision only |
| 4 | Investing and wealth | The `invest` decision, instruments, instinct cards |
| 5 | Tax | The tax line in the year bridge, `tax.json` |
| 6 | Skills and income | The `growth` ("Invest in yourself") decision, capability |
| 7 | Housing | The `home` decision, rent versus buy |
| 8 | Retirement | The `retire` and `retirementStyle` decisions, pension, the verdict |

Left out on purpose: separate inflation or compounding pages (folded into Banking, Investing and Retirement), insurance beyond life and health, credit scores, crypto, and generic "planning basics".

## Scope of each page (decision 75)
These are the ceilings. A point is in only if it changes a decision a young Indian professional actually faces or a mistake they are likely to make.

| Page | In | Out |
|---|---|---|
| Banking and credit | Savings versus FD and what each is for; inflation versus interest (real return); DICGC ₹5 lakh deposit cover; emergency fund (how much, where); how a loan and EMI work (interest-heavy early years, prepayment); keeping debt cost below returns | Credit-card rewards, credit-score deep dives, UPI and app mechanics, forex |
| Health insurance | Why one bill can undo years of saving; employer cover versus your own (it ends with the job); cover size, premium, what it pays; waiting periods, co-pay, room-rent limits, claim settlement; buy young; floater versus individual, and parents | Plan-by-plan comparisons, hospital networks, claims procedure detail |
| Life insurance | Who needs it (dependants) and who does not; term versus endowment and ULIP, and why term plus investing usually wins; how much cover (income multiple, loans plus dependants' needs); nominee; mis-selling traps | Annuity products, riders and sub-types, specific insurers |
| Investing and wealth | Compounding and time; risk versus return and drawdowns; equity (SIP), debt, gold, EPF/PPF/NPS and what each does; asset mix and rebalancing; costs and fees; not panic-selling | Stock picking, derivatives, crypto, real-estate funds, trading |
| Tax | Slabs, rebate and standard deduction under the new regime (the only one the game models); capital gains by asset, short versus long; taxable versus tax-free income; advance tax for the self-employed | The old regime and any regime comparison, 80C/80D/NPS and other deductions, HRA, filing mechanics, GST, business tax, edge-case sections |
| Skills and income | Why income growth often beats chasing returns early on; how skills compound into pay and stall without upkeep; cost and time of learning versus the pay bump; burnout and diminishing returns; what evidence supports, kept apart from the game's tuning | Specific courses and certifications, job-hunting advice |
| Housing | Rent versus buy and the real cost of owning (EMI, upkeep, taxes, selling cost); down payment and affordability limits; the home as somewhere to live, not a liquid asset; loan tenure trade-offs | Property-search tips, stamp duty by state, builder risk |
| Retirement | The corpus idea (cost of living x years, inflation-adjusted); EPF/NPS/pension and how long they last; longevity risk; sequence risk in the early years; withdrawal-rate rule of thumb | Annuity comparisons, estate planning, wills |

**Consistent with the game's non-goals.** The Tax page explains only what the game models (the new regime). It does not explain the old regime, regime comparison or deductions (decision 75), matching [intent.md](../intent.md) and [india-scope](india-scope.md).

## Access (decision 70)
- **Footer "Learn" link**, beside "About". It opens a native `<dialog>` (as About does: focus trapped, Escape closes, the game underneath is untouched) showing an index of the eight pages; choosing one shows it in the same dialog, with a way back to the index.
- **In-context links**, a small quiet text link ("Learn: health insurance"), not a card or banner, on the decision cards that map to a page. It opens the same dialog on that page. Closing returns the player to the same question.
- **Nothing opens by itself.** User action only (ux-disclosure rule 2).
- **Candidate mapping** (confirm while building): `emergency` to Banking; `health` to Health insurance; `invest` to Investing; `growth` to Skills and income; `home` to Housing; `retire` and `retirementStyle` to Retirement. Stages with no matching topic get no link. Life insurance and Tax have no matching decision; they are reached from the index (and possibly from the tax line of the year bridge or its "why" panel).
- Level 1 stands alone: a player who never opens a page still gets a complete run (ux-disclosure rule 1).

## Page template (decision 71)
Target 400 to 600 words, about a three-minute read.
1. **The short version.** One or two sentences: what it is and why it matters at this stage of life. Always visible.
2. **How it works.** The few mechanics a person needs. Collapsible (`<details>`, closed by default).
3. **What to decide.** Practical rules of thumb: how much, which type, when. Always visible. Holds any static "depends on your job" notes (decision 74).
4. **Common traps.** Three to five real mistakes. Collapsible.
5. **India, as of 2026.** Specific limits, rates and rules, each with source, confidence and year. Collapsible.
6. **How this game treats it.** Two to four lines on what is simplified or left out, with links to the game's own numbers.

**Content rules** (decision 71): a fact stays only if it changes a decision; no product names or brand comparisons; no number without a source and year; plain English only; the same not-advice wording as the About panel; rules likely to change soon show a visible "as of" date.

## Data and accuracy (decision 72)
- **Pages are data:** `data/learn/<page>.json` plus an index file, with a schema in `js/data/validate.js`, loaded and validated like `about.json`. Adding or correcting a fact never touches UI code.
- **Numbers the game holds are read from the game's data, not retyped:** tax slabs and rebate from `tax.json`, PPF and EPF rates from `instruments.json`, health cover and premium from `stages.json`, and so on. A test fails if a page hard-codes a number the game also defines.
- **Real-world facts the game does not hold are researched against primary sources** (RBI, IRDAI, the income-tax department and the like) and carry the standard provenance block: source, confidence, `asOf`. Anything not confirmable from a primary source gets low confidence or is cut. These blocks also appear in the "Where the numbers come from" browser.
- Tests: schema, the no-hard-coded-numbers rule, accessibility of the dialog (label, focus, Escape), and a real-browser check of open, close, index and in-context link.

## Personas (decision 74)
Pages are the same for every player. Where a decision genuinely flips by employment type (employer health cover, EPF, pension, advance tax), the "What to decide" section carries a fixed "If you are salaried / self-employed / in government" note. Nothing reads the current persona. Most pages need one or two such notes; Banking probably none.

## Language (decision 71)
Plain English only on these pages. The game's informal tone may show in the short opening line. The game-wide Hinglish question stays open (open question 6).

## Build order (decision 73)
1. **Increment 1, the container and a pilot.** The Learn dialog, index, schema and validation, footer link, in-context link mechanism, and the **Health insurance** page, fully researched and sourced; tests; a real-browser check. **Stop for the user's review** before writing more: fix template, tone or depth once.
2. **Increment 2:** Banking and credit, Life insurance, Tax.
3. **Increment 3:** Investing and wealth, Housing, Retirement.
4. **Increment 4:** Skills and income, last, because it is the topic where the game's tuning is most likely to be mistaken for evidence; it keeps what research supports apart from what the game assumes.

Each increment ends the way the earlier ones did: tests, a real-browser run, update [architecture.md](architecture.md), commit.

## Not decided yet (settle while building)
- Exact wording and placement of the in-context link on each decision card, and the exact mapping above.
- Whether collapsible sections should default open on a first visit (current plan: closed).
- Whether the year bridge's tax line should link to the Tax page.
- Page file names and the index file's shape.
