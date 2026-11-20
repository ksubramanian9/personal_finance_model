# Student scripts

**Summary:** A script walks a student through one persona's life in the game: predict, choose and reason, watch, change one choice and replay on the same luck, replay on fresh luck, and explain. One common template holds the steps; each persona's file fills it in. A page (`scripts.html`) shows it with a student layer and a facilitator layer. Decided with the user in the student-scripts grilling (decisions 81 to 86). Built: the template, the page and the first script (Arjun). Not built: the other five scripts and an in-app guided mode.

## Decisions reached
- **Form.** A printable, fillable worksheet first; an in-app guided mode later. The data is shaped so the later mode could read the same files.
- **Audience.** A class with a facilitator, and self-paced learners, from one script with two layers: the student layer stands alone, the facilitator layer (behind a switch) adds timing, discussion questions, expected findings, the reference plan and a rubric.
- **Fair comparison.** Run one on a fixed seed, run two on the same seed with one choice changed (so only the choice differs), run three on a fresh seed (so luck shows).
- **A fixed seed per persona, with an automated check.** Each persona's script picks a seed whose life has a story. A test replays it and fails if a fact the script claims stops being true.
- **Authoring.** JSON data shown by a page in the browser; no build step.
- **Key choices.** Four to six per persona, chosen by the persona's file; the rest follow a listed plan.
- **Answers.** Text boxes saved on the device as the student types, a Print or save as PDF button, and a Copy as text button. Nothing leaves the device.
- **Customising.** A fixed spine of steps; a persona file fills slots, may reword a note and add extra steps; it cannot remove a step.
- **The explanation.** A guided frame for the student, a rubric for the facilitator (guidance, not a score: the game never scores a life).
- **Game change.** Only a deep link: `index.html?persona=metro-it&seed=35&retire=60` opens that person's set-up page with the luck and the stopping age already set.

## The spine (the same for every persona)
1. **Meet and predict.** Read the story, write how the life will end and the biggest danger and chance.
2. **Open the game.** Use the link; leave the starting numbers alone.
3. **Make the key choices, and say why.** Each key choice shows the question, why it matters for this person, things to weigh and the options; the student writes the pick and the reason. A table gives the plan for every other question (a question already decided in an earlier stage reads "Keep what you chose before"). Instinct cards are answered Resist, both times, so only the changed choice differs.
4. **Watch what happens.** One line per stage (luck or choice?), plus the persona's own prompts.
5. **Read the verdict,** and compare it with the prediction.
6. **Change one thing and replay the same luck.** The student picks the choice they think mattered most; the script suggests one.
7. **Same plan, fresh luck.** Replay the changed plan on a second seed (or New luck).
8. **Explain the journey.** A frame: where they ended up, the two choices that mattered with a number each, which parts were luck, what they would change, one limit of the game.

## Two kinds of fact
- **Luck facts** (the weather and the life events: "a crash runs from 29 to 32 and the job ends at 32") do not depend on the student's choices, because events and weather use their own random streams. They hold for any plan, and the facilitator can rely on them.
- **Plan facts** (the money at 60, the verdict) hold for the **reference plan**: the script's `picks`. The facilitator layer lists the reference plan next to the findings. A student who chooses differently will get different numbers, which is the point.

## Files
- `data/scripts/index.json` lists the template and the scripts.
- `data/scripts/template.json`: the spine. Steps have `student` (lead text, prompts) and `facilitator` (lead, discussion), a `minutes` figure and, for two steps, `generated`: `keyChoices` (the persona's key choices become the prompts) or `stages` (one prompt per stage). Text may use `{tokens}`.
- `data/scripts/<persona>.json`: `personaId`, `seed`, `freshSeed`, `retirementAge`, `cards` (how instinct cards are answered), `picks` (the reference plan: every question of every stage), `keyChoices` (stage, decision, why, weigh), `observe` (extra prompts per stage), `change` (decision, to, why), `overrides` (reword a step's lead, a prompt label or the facilitator's notes), `extras` (extra steps after a named step), `expect` (the facilitator's expected findings, each with `checks`) and `provenance`.
- Tokens: `{firstName} {name} {story} {job} {city} {age} {seed} {freshSeed} {retireAge} {startLink} {freshLink} {changeDecision} {changeFrom} {changeTo} {minutes} {keyCount} {layoffRiskPct} {support}`. An unknown token is an error, not the word "undefined".

## Checks (what an `expect` line can claim)
`event` (an event id in an age range), `regime` (a weather in an age range), `verdict`, `borrowed` (a year of borrowing in an age range, or none), `homeBought`, `netWorth` (real net worth at an age), `metric` (a number between `min` and `max`: `spendableAtRetirementReal`, `netWorthAtEndReal`, `borrowedYears`, `deathAge`), `higher` and `lower` (one run's metric against another's). The runs are `baseline` (the reference plan), `changed` (the same luck with the change), `fresh` (the changed plan on the fresh seed) and `freshFirst` (the reference plan on the fresh seed).

## How to add a persona's script
1. Choose the reference plan: a `picks` entry for every question the persona's life asks (a missing one fails the replay).
2. Choose the key choices (four to six) and the one change. Search for a seed with a story and a fresh seed that contrasts: the checks in `scripts.test.js` help. Replay both with `playScriptRuns` (`js/ui/scriptRun.js`).
3. Write the `expect` lines, each with checks, and the persona's `why` and `weigh` text. Prefer luck facts; keep numbers as ranges.
4. Add the file to `data/scripts/index.json`. `checkScript` reports mistakes in plain words, and `scripts.test.js` replays the seed and fails if a claim is false.

## As built (first increment)
- **Arjun, the metro techie.** Seed 35, fresh seed 36, stopping at 60. The reference plan is balanced saving, a bit of everything invested, no cushion, no extra cover, light learning, renting. The suggested change is to go for growth. On seed 35 a crash runs from 29 to 32 and the job ends at 32; the reference plan needs no borrowing and the money lasts (about ₹13 crore spendable at 60); going for growth ends higher (about ₹19 crore). On seed 36 the same growth plan ends with about ₹2 crore, below what the reference plan makes there (about ₹2.9 crore): same plan, different luck. An extra step looks closely at the layoff.
- **Why this change.** Of the changes tried on Arjun, a bigger emergency fund never raised the money at 60 in 200 lives (it costs growth), saving harder always did, and going for growth raised it in about 86% of lives. Going for growth tells the luck-versus-choice story, and the emergency fund question stays one of the key choices to reason about.
- **Code.** `js/data/scripts.js` (load and check), `js/ui/scriptRun.js` (replay a life from a script's picks, run the checks), `js/ui/scriptText.js` (build the steps; export answers as text), `js/ui/scriptPage.js` (render), `js/ui/scriptMain.js` and `scripts.html` (the page), the deep link in `js/ui/main.js`, `loadAnswers` and `saveAnswers` in `js/ui/storage.js`. Tests: `js/tests/scripts.test.js` and two in `flow.test.js`.
- **Not checked in a real browser.** The page, its print layout and the copy button were exercised only through the fake DOM in the tests.

## Not built yet
- Scripts for the other five personas (Meera, Kavya, Rohan, Sneha, Imran).
- The in-app guided mode.
- Links from a script's prompts to the Learn pages other than a text hint at the health question.
- A shared view for a teacher (there is no backend; answers come in by print, PDF or copied text).
