# UX and Progressive Disclosure

**Summary:** Three named levels. Each stands alone. Deeper content appears only on user action, except critical warnings. Look and feel: colorful, large informal fonts, theme in tokens.

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
