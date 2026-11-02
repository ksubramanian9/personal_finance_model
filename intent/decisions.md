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
