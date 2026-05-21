---
id: forward-looking-actionability
name: Forward Looking Actionability
description: Convert theme-stage and fund-mapping evidence into a forward-looking buy/staged/wait/avoid action without relying only on lagging fund performance.
---

# Forward Looking Actionability

This skill decides whether a recommendation still has forward-looking payoff.

## Decision Formula

`priority = theme payoff * catalyst freshness * vehicle purity * top-ten-holdings outlook - crowding penalty - product friction`

## Action Rules

- Fresh catalyst + early confirmation: starter position or staged buy.
- Strong catalyst + broad diffusion: staged buy with smaller first order.
- Crowded theme + high 20/60-day fund gain: wait for pullback or use watchlist only.
- Weak catalyst + strong fund NAV: do not chase; the move is already reflected.
- Clean theme but poor fund vehicle: recommend the direction, not the fund.
- Good trend but stale, crowded, mismatched, or over-concentrated top ten holdings: downgrade to watch/avoid until holdings outlook is verified.

## Output Contract

- action: buy / staged_buy / wait / avoid / watch
- allocationBand
- firstOrderSize
- confidence
- whyNow
- whyNotNow
- decisionBoundary
