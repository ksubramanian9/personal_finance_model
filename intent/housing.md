# Housing

**Summary:** One buy-or-rent choice. Rent is separated from living costs and rises with prices. At a life stage the player can buy a home with a fixed-rate 20-year loan; the home is a large, calm asset that follows the economy mildly and counts in net worth but not as spendable money. Decided with the user in the housing grilling (decisions 38 to 42). Numbers still to be sourced are listed at the end.

## What the player decides (Level 1)
- Each stage from the late 20s: **keep renting**, or **buy a home** (the stage says roughly when: about 30 or about 38).
- A buy option is closed, with the shortfall shown, until the player can pay the down payment and one-off costs from cash and savings.

## Mechanics
- **Rent** leaves the persona's `monthlyExpenses` and becomes its own line (`housing.monthlyRent` in the persona file). It rises with prices. A tier-1 city rent is higher than a tier-2 city's.
- **Buying** costs: down payment (about 20% of the price) plus one-off costs (stamp duty, registration, brokerage, furnishing; roughly 6 to 8%), paid from cash first, then liquid holdings in the usual sell order, with any capital-gains tax on what is sold. The option is unavailable if these cannot be covered.
- **Loan:** about 80% of the price, 20 years, one fixed interest rate, a fixed monthly EMI (the standard annuity formula). No prepayment, no rate changes. The EMI continues through a layoff.
- **After buying:** rent stops; the EMI and upkeep (maintenance, property tax, repairs as a share of the price, rising with prices) replace it.
- **Price:** moves each year with the same economy regime as everything else (strong in a boom, flat in a slowdown, a small dip in a crisis), much calmer than shares, growing only a little faster than inflation over the long run. The starting price level depends on city tier.
- **Counting it:** the home is part of net worth and has its own colour on the net-worth chart. For the "could you stop working?" test (increment 9) it is not spendable: a live-in home saves rent but cannot be eaten.
- **Last resort:** if cash and liquid savings run out in a bad year, the home is sold after the other assets, with selling costs and any tax on the gain. The loan is repaid from the proceeds, and the player rents from then on.
- Loan interest and principal deductions are not modelled (the new tax regime has no deduction for a home you live in).

## Out of scope for v1
Upgrading, a second or investment property, rental income, prepayment, a floating loan rate, joint loans, builder delay or fraud, local price swings separate from the economy.

## Still to settle or source while building
Starting price by city tier, price growth by regime, rent by city tier, loan rate, one-off cost share, upkeep share, property capital-gains rule on a forced sale (secondary sources, with provenance and confidence like every other number), and how a stage presents the buy option to a player who has not yet bought.
