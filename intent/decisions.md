# Decisions Log

**Summary:** What we chose, what we rejected, why. Read before re-opening a settled question.

| # | Decision | Rejected | Why |
|---|---|---|---|
| 1 | Educational/exploratory tool for young professionals | Planner (B), game (C) | Planner needs high fidelity and carries advice liability; game over-emphasises scoring |
| 2 | Thick personas, 4-5 archetypes, extensible via JSON | Thin profiles | Behavior biases make personas distinct and feed nudges |
| 3 | Yearly tick; stage-driven decisions; decade cards expand to years | Monthly tick; stage = decade | Yearly is enough fidelity; stages need not be round decades |
| 4 | Retirement age user-overridable | Fixed per persona | Core to the headline outcome |
| 5 | Seeded RNG, same-seed comparison, seed behind advanced toggle | Unseeded; Monte Carlo in v1 | Reproducibility, testing, counterfactuals; Monte Carlo pushes toward a planner |
| 6 | Capability: 3 tracks, money + effort; default single choice | Single skill number; full skill tree | Trade-offs matter but must not overwhelm |
| 7 | India fidelity "Medium", including capital gains | Light; Heavy | Cultural realities teach more than tax precision. Capital gains pulled into Medium on request |
| 8 | Outcome = headline question + measures + light wellbeing; no composite score | Net worth only; composite score | Composite invites gaming and bakes in values |
| 9 | Root intent.md of about one page plus per-concern files | Single flat doc | Progressive disclosure applies to the documentation too |
| 10 | Staged roadmap v1/v2/v3 | Everything at once | Prove the loop first |
| 11 | Three disclosure levels with rules | Ad-hoc disclosure | Core requirement made concrete |
| 12 | Vanilla JS, pure engine, JSON data, no library | Framework; charting library | Small scale; custom look; simplicity |
| 13 | Today's rupees default, nominal toggle at Level 2 | Nominal only | Nominal misleads over 60 years |
| 14 | Family: choices and events, spouse as a parameter | Fixed family; full household sim | Keeps choice without doubling the engine |
| 15 | Nudges the user can resist, plus visible slow drift | Silent behavioral drift; no behavioral modeling | Honest and educational |
| 16 | Illustrative seed data with basis/confidence/asOf; sourcing for high-impact numbers | All guessed; all sourced | Truthful without swallowing the project |
| 17 | Macro regimes link shocks | Independent draws | Correlated pain is why liquidity and insurance matter |
| 18 | Choices are data: a decision library plus stages in `stages.json`; picks persist until changed | Hard-coded stage screens | Adding a choice or stage is a data change, like personas |
| 19 | Stage flow lives in `flow.js`, testable in Node with a fake DOM | Flow inside `main.js` | UI behavior could not be tested otherwise; it caught a real bug |
| 20 | Retirement age is a decision in the last stage, applied before playing it | Fixed at the start only | Intent says it is overridable at pre-retirement |
| 21 | Equity return parameters are arithmetic means calibrated so the compounded (geometric) return matches the sourced CAGR | Using the CAGR directly as the mean | A random simulation compounds at roughly mean minus half the variance; using 12.4% as the mean would have given about 10.6% |
| 22 | One economy-regime table drives inflation, market returns and raises; the job's `cyclicality` scales the raise effect | Independent shocks per asset | Correlated pain; government job stays steady, IT job swings |
| 23 | New savings follow the player's mix; existing holdings are never sold to rebalance; provident funds are locked | Auto-rebalance each stage | Rebalancing would trigger tax and hide the lesson that switching late is slow |
| 24 | Calibration is enforced by tests (long-run mix, compounded returns, inflation, ordering) | Trusting the numbers by eye | Data edits that break the sourced anchors fail loudly |
| 25 | Events use their own random stream and never depend on what the player buys, saves or invests; skill (`capabilityEffect`) shifts only the odds | One shared stream; choices that change which events happen | Same seed + different choices must show the same luck. Skill is the intended exception (intent: layoffs hit lower-capability people harder) |
| 26 | Insurance and an emergency fund are decisions in the early and family stages (health again before retirement) | Always on; or a separate screen | They persist like other choices and keep Level 1 to one question at a time |
| 27 | Term life insurance is deferred to the family increment | Build it now | Nothing can kill the breadwinner until family exists, so it would have no effect |
| 28 | Persona base pay growth lowered for IT (9 to 7%) once job offers became explicit events | Keep 9% | Switching premiums were counted twice |
| 29 | Chart colours come from the dataviz skill's validated palette (first five slots, fixed order), not the playful game accents | Reuse the game's accent colours | The validator proves colour-blind separation; the game palette is for chrome, the chart palette is for data. Aqua, yellow and magenta are under 3:1 on white, so a legend, readout and table twin ship with every chart |
| 30 | Each decade's "Why?" draws its own net-worth chart; the whole-life chart stays on a linear scale and says so | Log scale; hiding small segments; drawing slivers at a minimum height | A lifetime peak of crores makes early cash and loans invisible. Bending the scale or drawing fake slivers would mislead; zooming by decade shows them honestly |
| 31 | Net-worth "bridge" with an explicit inflation line in today's rupees | Deflating the end figures only | Every line adds up exactly from start to end in both rupee modes, so the explanation can be trusted and tested |
| 32 | The level of detail, once raised, persists for the session | Reset on every screen | A player who asked "why?" once should not have to ask at every stage; they can hide it with one tap |
| 33 | Only the new tax regime is modelled; slabs, the standard deduction and the capital-gains exemption are assumed to rise with prices | Old regime too; fixed rupee slabs | Fixed slabs would push every long career into the top bracket by inflation alone, which real governments reset; a real-terms table keeps the lesson about rates, not drift. Old-vs-new stays out of scope |
| 34 | Persona salaries are gross pay; tax is worked out once a year on pay, taxable windfalls and interest, plus gains realised when assets are sold | Treat salary as take-home; tax unrealised gains each year | Tax on unsold gains does not exist in India; it only bites when you sell, which is the point of the "selling early vs late" lesson. Net worth before retirement is therefore before that tax |
| 35 | Gains are tracked per purchase (oldest sold first) so holding period decides long- vs short-term; tax on a sale is raised by selling a little more | One average cost; paying tax the next year | The holding-period rule is the lesson, and it needs real purchase years. Raising the tax in the same year keeps each year's books closed |
| 36 | The tax drag shows as two bridge lines: tax on pay and windfalls, and the extra tax investing brought | One tax line | Splitting them shows how much of the bill is the job and how much is the portfolio |
| 37 | Long-run inflation lowered from 5.2% to 4.5% (boom 5.1, steady 4.3, slowdown 3.8, crisis 5.3); persona base pay growth lowered by the same 0.7 points (IT 7 to 6.3, government 6 to 5.3) | Keep 5.2%; lower inflation but leave pay growth alone | 5.2% (the 2012-26 average) made prices rise 24 times over a 63-year life, and sits above the RBI's 4% target. Pay growth is nominal, so leaving it alone would have quietly raised real pay growth by 0.7 points a year (about 30% more real income by 60). Asset returns are left as sourced, so real returns on investments are about 0.7 points higher than before |
