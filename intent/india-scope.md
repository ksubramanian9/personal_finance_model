# India Scope

**Summary:** "Medium" fidelity: named Indian instruments, simplified income tax slabs, capital gains by holding period, and India-specific cost structures. Rules are JSON so a new financial year is a data change.

## Instruments (v1)
EPF/PPF, equity mutual fund SIP, FD, gold, home (buy or rent, EMI-based), basic term and health insurance. NPS and more in v3. Each instrument is a JSON entry: return distribution, liquidity, lock-in, tax-treatment tag, risk.

## Tax (`tax.json`)
- New-regime income-tax slabs, standard deduction, the 12-lakh rebate with marginal relief, cess and surcharge tiers, labeled with source and confidence. Assumed to rise with prices.
- **Capital gains** with holding-period rules: equity 12.5% beyond 1.25 lakh a year after 12 months, 20% before; gold 12.5% after 24 months, slab rate before. Fixed-deposit and savings interest is taxed yearly at the slab rate; provident funds are tax-free. Property arrives with housing (increment 8).
- Losses offset gains within the same instrument and year; nothing is carried forward.
- Not tax advice, stated in the UI.

## India-specific realities (the main educational value)
Sandwich-generation burden, housing as the dominant asset, gold as default store of value, thin safety net (so health insurance matters), education inflation, wedding costs, joint-family obligations.

## Out of scope
Old-vs-new regime comparison, 80C/80D deduction optimisation, HRA, surcharge marginal relief, carried-forward losses, per-instrument edge cases.

## Seed data honesty
Every parameter has `basis`, `confidence` (high/medium/low) and `asOf`. High-impact numbers (equity/debt/gold returns, CPI, education inflation, tax slabs) are properly sourced; event probabilities and salary curves are labeled low-confidence illustrative. Level 3 shows where a number comes from.

## Display of money
Today's rupees by default, labeled on every figure; Indian units (lakh/crore). Nominal toggle at Level 2. The engine is nominal internally; conversion is a display-layer transform.
