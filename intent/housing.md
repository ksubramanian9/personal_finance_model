# Housing

**Summary:** One buy-or-rent choice. Rent is separated from living costs and rises with prices. At a life stage the player can buy a home with a fixed-rate 20-year loan; the home is a large, calm asset that follows the economy mildly and counts in net worth but not as spendable money. Decided with the user in the housing grilling (decisions 38 to 42). What was built, and the numbers behind it, are under "As built".

## What the player decides (Level 1)
- At the start of the "Building a life" stage (about 32) and the "Peak earning" stage (about 42), while still renting: **keep renting**, or **buy a home**. The question is skipped once you own one. (Built in increment 8, part 1.)
- A buy option is closed, with the shortfall shown, until the player can pay the down payment and one-off costs from cash and savings.

## Mechanics
- **Rent** leaves the persona's `monthlyExpenses` and becomes its own line (`housing.monthlyRent` in the persona file). It rises with prices. A tier-1 city rent is higher than a tier-2 city's.
- **Buying** costs: down payment (about 20% of the price) plus one-off costs (stamp duty, registration, brokerage, furnishing; roughly 6 to 8%), paid from cash first, then liquid holdings in the usual sell order, with any capital-gains tax on what is sold. The option is unavailable if these cannot be covered.
- **Loan:** about 80% of the price, 20 years, one fixed interest rate, a fixed monthly EMI (the standard annuity formula). No prepayment, no rate changes. The EMI continues through a layoff.
- **After buying:** rent stops; the EMI and upkeep (maintenance, property tax, repairs as a share of the price, rising with prices) replace it.
- **Price:** (deterministic given the economy: no extra random draws, so existing seeds keep their luck) moves each year with the same economy regime as everything else (strong in a boom, flat in a slowdown, a small dip in a crisis), much calmer than shares, growing only a little faster than inflation over the long run. The starting price level depends on city tier.
- **Counting it:** the home is part of net worth and has its own colour on the net-worth chart. For the "could you stop working?" test (increment 9) it is not spendable: a live-in home saves rent but cannot be eaten.
- **Last resort:** if cash and liquid savings run out in a bad year, the home is sold after the other assets, with selling costs and any tax on the gain. The loan is repaid from the proceeds, and the player rents from then on.
- Loan interest and principal deductions are not modelled (the new tax regime has no deduction for a home you live in).

## Out of scope for v1
Upgrading, a second or investment property, rental income, prepayment, a floating loan rate, joint loans, builder delay or fraud, local price swings separate from the economy.

## As built (increment 8, part 1)
- Numbers live in `data/housing.json` with provenance: metro flat ₹45 lakh and tier-2 flat ₹30 lakh in today's rupees (illustrative, low confidence; first built at 80 and 40 lakh, lowered in November 2026 because buying was almost never open at 32: with the lower prices about half of "save hard" lives can buy for the metro IT worker and most for the tier-2 personas, while the teacher and the freelance designer still mostly cannot); price growth by economy 8.5 / 5.5 / 3 / -2 percent (about 5.1% long run, sourced loosely to the RBI index's 3.6% year-on-year in 2026); loan 80% over 20 years at 8.75% fixed (2026 bank rates quoted about 8.4 to 9.2%); one-off costs 8% (a Bengaluru worked example gave about 7.6%); upkeep 1% of the price a year; selling cost 2%; the property tax rule is in `tax.json` (12.5% after 24 months, else slab).
- Rent is in each persona file (`money.monthlyRent`, split out of `monthlyExpenses`; totals are unchanged, so existing lives are unchanged while renting).
- Affordability: cash plus sellable savings (not provident funds) must cover the down payment and one-off costs plus a 10% buffer for tax on sales.
- A forced sale happens only when, after cash and every liquid holding, the remaining gap would take personal debt above 12 months of pay; a smaller gap is borrowed instead. Proceeds repay the loan; leftover goes to cash; rent resumes at the going rate.
- What the model says: on these sourced numbers a home loses to renting and investing the difference over ten years (buying costs, loan interest at 8.75% and a 5% price rise against shares at about 12%), though the gap narrows as the fixed instalment shrinks against rising pay. The game reports that; it does not tune it away.
- Loose ends: no mortgage tax benefits, no prepayment, no rent increase beyond inflation, one home size per city tier, a pay-driven EMI limit is not enforced (only the savings test at purchase), and a home bought at 42 is still being paid for in retirement.
