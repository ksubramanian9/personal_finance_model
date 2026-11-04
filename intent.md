# Intent

A browser-only, interactive simulation that lets young Indian professionals *play* a lifetime of money decisions and see how choices and luck compound.

## Who it's for
Young professionals (early career) in India. Curious, not expert. They want intuition, not a spreadsheet.

## The core experience
Pick a persona. Move through life stages (early career, family building, peak earning, pre-retirement, retirement). At each stage make a few big choices, then watch the years play out, with luck (markets, layoffs, health scares) thrown in. Decades show as cards that expand into years. At the end, answer one question: **could you stop working, and did the money last?**

## Principles
1. **Teach, don't advise.** This is an educational tool, not financial or tax advice.
2. **Show the cause.** Every outcome can be explained in one tap.
3. **Disclose progressively.** Story first, reasons on tap, internals only on request. See [ux-disclosure](intent/ux-disclosure.md).
4. **Luck is visible and fair.** Seeded, replayable, never silently overriding the user.
5. **Data, not code.** Personas, events, instruments, tax and macro live in JSON. Adding a persona is adding a file.
6. **Honest numbers.** Illustrative values carry `basis`, `confidence`, `asOf`. Real rupees of today by default.
7. **Colorful and informal.** Big friendly type, bright palette, plain words.

## Non-goals
- Not a personal financial planner or a calculator for real money decisions.
- No composite "life score", leaderboard or gamified ranking.
- No old-vs-new tax regime comparison, HRA, surcharge or per-instrument tax edge cases.
- No backend, accounts, build step or framework. Browser tech and liveserver only.

## Read next (one concern per file)
| Topic | File |
|---|---|
| Personas and how to add one | [personas](intent/personas.md) |
| Years, stages, decades | [time-and-stages](intent/time-and-stages.md) |
| Randomness, regimes, nudges | [randomness](intent/randomness.md) |
| Capability and income growth | [capability](intent/capability.md) |
| Family: marriage, children, parents | [family](intent/family.md) |
| Housing: rent, buying, the home loan | [housing](intent/housing.md) |
| India scope: instruments, tax, costs | [india-scope](intent/india-scope.md) |
| Outcomes and the debrief | [outcomes](intent/outcomes.md) |
| The three disclosure levels | [ux-disclosure](intent/ux-disclosure.md) |
| Learn pages: reference pages on the key concepts (planned) | [learn-pages](intent/learn-pages.md) |
| Technical ground rules | [tech](intent/tech.md) |
| v1 / v2 / v3 staging | [roadmap](intent/roadmap.md) |
| Code architecture as built | [architecture](intent/architecture.md) |
| Step-by-step build plan for v1 | [implementation-plan](intent/implementation-plan.md) |
| Why we chose what we chose | [decisions](intent/decisions.md) |
| Unresolved items | [open-questions](intent/open-questions.md) |
