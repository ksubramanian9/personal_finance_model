# UX and Progressive Disclosure

**Summary:** Three named levels. Each stands alone. Deeper content appears only on user action, except critical warnings. Look and feel: colorful, large informal fonts, theme in tokens.

## Remembering between visits (as built, increment 10)
The browser remembers, in `localStorage` under one key and on this device only: the level of detail and the rupee mode, the last persona and retirement age, and **a life in progress**. A life is saved when a stage's questions appear, when an instinct card appears and when a stage result appears, so the landing page can offer "Pick up where you left off: Arjun, age 42" (with "Forget my progress" and "Start a new life"). A resumed life carries on exactly as it would have: the saved state includes every random stream. A finished life is not kept, and a save from another version of the game, or a broken one, is dropped quietly. If storage is blocked or full the game works the same and remembers nothing.

## Level 3 as built (increment 10)
Behind a collapsed "Advanced: under the hood" panel on the persona picker (nothing in it is on unless the player changes it):
- **Seed:** type any text or number, or press "Random seed". The same seed and the same choices give the same life.
- **Economy scripts:** instead of random weather, a fixed stretch of weather: a smooth ride (steady all life), a crash in your 30s, a lost decade in your 40s, a crash just before you retire. A script replaces the weather only in the ages it covers; the random draw is still taken, so no other luck moves. Scripts live in `macro.json`.
- **A few numbers:** inflation, share returns and home price growth, each shifted by a number of points a year, and "pretend there is no tax". They are clamped to sensible ranges and apply to the next life only.
- **Where the numbers come from:** a read-only browser listing every provenance block in every data file (26 or more sources) with its source text, confidence and year, and the numbers it covers.
- **Marking:** a life that used a script or changed numbers is saved as such, resumes as such, and shows a "This life used custom settings" banner on its end screen so it is never mistaken for a default life. "Reset to defaults" clears the script and the changes.

## Levels
**Level 1: Story (default)**
One life stage at a time, one big question, 2-3 big friendly choice cards. After each stage a decade card with three numbers (net worth, "could you stop working?", a resilience color/emoji) and a one-line event headline. No tables, sliders or percentages. Includes the retirement-age choice, family choices and the occasional nudge card.

**Level 2: Why (on tap)**
Each number, event or choice has a "why?" panel: causal explanation, asset mix, income vs expenses, year-by-year view of a decade, named forces (inflation, lifestyle drift). Nominal-vs-real toggle lives here.

**Level 3: Under the hood (advanced toggle)**
Seed, luck dial, capability tracks and sliders, regime fixing, parameter overrides, `basis/confidence/asOf` for each number.

## Rules
1. Each level must stand alone: a user who never leaves Level 1 gets a complete, satisfying run.
2. Disclosure is by user action only. Exception: warnings for critical events.
3. Every deeper element is one tap from a shallower one. Nothing is buried in menus.

## Look and feel
Colorful palette, large informal typefaces, plain words. Fonts and colors are CSS variables / theme tokens so they are easy to change. Money in today's rupees, lakh/crore.
