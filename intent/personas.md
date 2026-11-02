# Personas

**Summary:** A persona is a thick starting point: a profile plus behavioral tendencies. It is a JSON file. By decade 2, choices and luck should have moved the person far from the archetype.

## Thick, not thin
A persona carries:
- Starting profile: age, city tier, education, job, salary, savings, debts, family obligations.
- Career path: base income curve, step-jump patterns, which capability tracks matter.
- Behavioral biases used by nudges (see [randomness](randomness.md)), e.g. lifestyle creep, over-conservatism.
- Event weights: which life events are more or less likely for this person.

## Archetypes
| Persona | Distinguishing feature | Version |
|---|---|---|
| Metro IT employee | First-gen graduate, supports parents and sibling, high growth, layoff risk | v1 |
| Government / PSU employee | Stable job, pension, slow growth, tends to over-hold FD | v1 |
| Gig / freelance / startup | High variance, no employer benefits | v2 |
| Small-town family-business heir | Irregular income, property-heavy, joint-family obligations | v2 |
| Dual-income metro couple | Early home loan and child costs | v3 |

Future ideas (not committed): career-break returner, Gulf/NRI route.

## Adding a persona
Add one JSON file under `data/personas/` and register it in the persona index. The loader validates it and reports missing fields in plain language. No engine change should be needed.
