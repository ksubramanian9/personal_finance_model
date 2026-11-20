# Money Life: a lifetime of choices

An educational, browser-only game about a lifetime of personal finance for a young professional in India. Pick a person, make the big calls at each stage of life, and watch how your choices and a bit of luck add up, ending with one question: could you stop working, and did the money last?

No build step and no dependencies: HTML, CSS, JavaScript modules and JSON.

## Run it
- Serve this folder with a static server (for example the VS Code Live Server extension) and open `index.html`. It will not work from `file://`, because the data files are fetched.
- `?seed=4271` replays a life; the same seed and the same choices give the same life. `?persona=metro-it&retire=60` opens that person's set-up page.
- `scripts.html` has the student scripts: a guided walk through a persona's life for a class or self-study (`scripts.html?persona=metro-it`, and `&facilitator=1` shows the facilitator notes). Only Arjun has one so far; see [intent/student-scripts.md](intent/student-scripts.md).

## Check it
- `npm test` (or `node js/tests/run-node.mjs`) runs the test suite in Node.
- `tests.html` runs the same suite in your browser.
- `smoke.html` plays whole lives through the real screens in your browser.

## Read about it
- [intent.md](intent.md) is the intent and the map of the detail files in `intent/`.
- [intent/architecture.md](intent/architecture.md) describes the code as built, with recipes for adding a persona, a life event, a stage or a test.
- [intent/decisions.md](intent/decisions.md) lists every design decision and what was rejected.
- [intent/implementation-plan.md](intent/implementation-plan.md) is the plan the game was built from.

Educational tool. Illustrative numbers, not financial or tax advice.
