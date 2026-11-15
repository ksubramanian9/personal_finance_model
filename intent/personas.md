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
| Gig / freelance / startup | High variance, no employer benefits | built: Kavya, the Freelance Designer |
| Small-town family-business heir | Irregular income, joint-family obligations (the shop's property is not modelled) | built: Imran, the Family-Shop Heir |
| Resident doctor | A big education loan and a steep, sure climb | built: Dr. Rohan, the Resident Doctor |
| Private school teacher | Modest pay, heavy family support, thin safety net | built: Sneha, the School Teacher |
| Dual-income metro couple | Early home loan and child costs | v3 |

Future ideas (not committed): career-break returner, Gulf/NRI route.

## Choosing and setting up a persona
The picker is two pages. Page one is only the six people and a "Next: set up …" button. Page two (`renderPersonaSetup`) holds the story, the starting numbers, when to stop working, "Begin this life" (with "Pick someone else" to go back) and the Advanced panel.

Four starting numbers have minus and plus buttons (`START_FIELDS` in `js/data/personas.js`): pay a year (steps of ₹50,000, from ₹3 lakh to ₹30 lakh), saved so far (₹10,000, from zero to ₹10 lakh), owes (₹50,000, from zero to ₹50 lakh) and sends home a month (₹1,000, from zero to ₹50,000). A note under each changed number shows the usual amount. "Sends home" is the parents' and sibling's support as one amount: the sibling's share is kept where it fits and the parents' share is the rest. Each persona keeps its own changes for the visit (`session.start`). The persona file is never edited: `startGame` makes a copy with the new numbers, and a saved life stores what was changed (`changes`) so Continue and "same luck" replays match. Expenses and rent stay as the persona has them, so a lower pay is a tighter life. Changes are not remembered between visits.

## As built: six personas
- **Arjun** (metro IT): high growth, layoff risk, supports parents and a sibling.
- **Meera** (government officer): stable, a pension, a cautious saver.
- **Kavya** (freelance designer, Pune): income that follows the economy fully, a 9% yearly chance of losing a big client, no severance, no employer cover, no pension, the strongest payoff from skills.
- **Dr. Rohan** (resident doctor, Indore, starts at 26): a 15 lakh loan, 10% yearly pay growth, a stable job with employer cover.
- **Sneha** (school teacher, Coimbatore): the lowest pay, the heaviest family load against it, no cover, no pension, very cautious.
- **Imran** (family-shop heir, Nashik): income that follows the economy fully, the most family capital, joint-family support, no cover, no pension, a 4% chance of a bad stretch at the shop.

All numbers are illustrative (low confidence, with a basis in each file). In the seed-sets tried (60 lives each, rent only, a balanced mix, keep learning), the doctor ends richest (about ₹8.5 crore at 60 in today's money) and the teacher poorest (about ₹1.1 crore); every persona's money lasts in at least 90% of lives.

Two optional persona fields let a persona's story fit its job: `career.severanceMonths` (months of pay on losing the job; omit it to use the layoff event's) and `eventText` (the persona's own name, emoji and story for any event by id, for example a freelancer "loses a big client" instead of being laid off). Everything else about a persona is the same set of fields as before.

## Adding a persona
Add one JSON file under `data/personas/` and register it in the persona index. The loader validates it and reports missing fields in plain language. No engine change should be needed.
