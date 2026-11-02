# Time and Stages

**Summary:** The engine ticks yearly. Life stages are the unit of play and carry the decisions. Decade cards are the default zoom of the visualization and expand into years.

## Three layers
- **Engine tick:** one year. Age about 22 to about 85; life expectancy is itself random.
- **Life stage:** a narrative chunk with a decision point at its start. Defined in JSON with its own start and end ages (e.g. Early career 22-32). Stages roughly align with decades but are not forced to.
- **Decade view:** about 5-6 cards by default. Tap a decade to see its years.

## Stages (v1, about 4-5)
Early career, family building, peak earning, pre-retirement, retirement. Exact boundaries live in `stages.json`.

## Retirement age
The user can override it. It is a simple choice (e.g. 55 / 60 / 65) at the start and again at the pre-retirement stage; finer control is Level 3.
