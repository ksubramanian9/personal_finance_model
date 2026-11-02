# Technical Ground Rules

**Summary:** Vanilla browser tech, pure engine separate from UI, everything configurable in JSON, served with liveserver.

- **Engine/UI split.** The simulation is pure ES modules: state in, state out, no DOM. The UI renders state and sends choices.
- **JSON data via `fetch`.** Separate files for personas, stages, events, instruments, tax, macro, theme. Requires liveserver (`file://` will not work).
- **No dependencies, no build.** Vanilla JS, CSS variables, hand-written SVG charts. A charting library was considered and rejected: the needed charts are simple and a library would fight the custom look.
- **Schema validation on load.** A small validator reports friendly errors (e.g. "persona gig.json is missing startingSavings").
- **Tests.** `tests.html` runs engine functions with fixed seeds and asserts known outcomes; also runnable in Node since the engine has no DOM.
- **State.** A single serializable object, so save/share/replay need no redesign later. v1 keeps it in memory with optional `localStorage`.
- **Money.** Engine is nominal; display layer converts to today's rupees.
