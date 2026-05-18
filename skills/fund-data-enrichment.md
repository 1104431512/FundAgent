---
name: fund-data-enrichment
description: Public-data enrichment rules for Chinese mutual funds, ETFs, QDII, Hong Kong related funds, bond funds, money-market funds, and index products. Use when fund codes or candidate funds need NAV, risk metrics, holdings, fees, manager, size, ranking, market, or theme context.
---

# Fund Data Enrichment

Use public data to supplement, not replace, user-provided screenshots. If public data conflicts with screenshots, keep both and label the source.

## Source Priority

1. Fund profile and valuation: fund code/name, share class, NAV date, unit NAV, estimated NAV/change, fees, minimum purchase.
2. Historical NAV: compute 1y/3y/5y annualized return, annualized volatility, max drawdown, and Sharpe when enough points exist.
3. Holdings: use F10 stock investment details for A-share, Hong Kong, QDII, and index holdings; use F10 bond investment details for bond funds.
4. Fee page: management fee, custody fee, sales service fee, subscription fee, redemption fee, minimum purchase, and estimated fee drag by holding period.
5. Asset allocation and managers: fund size, stock/bond/cash ratio, manager tenure, manager fund size, performance evaluation.
6. Market snapshot: industry/concept heat and recent fund ranking only for discovery/recommendation workflows.
7. Precious metals snapshot: COMEX/SHFE gold and silver, USD index, and related fund search candidates when the question involves gold, silver, or precious metals.
8. Market deep dive: when candidate fund digests are provided, use their trend profile, fees, holdings, manager/scale, and actionability signals instead of only ranking snapshot fields.

## Data Quality Rules

- Holdings are usually quarterly and may be stale; always state the disclosure date when available.
- QDII overseas NAV and holdings can lag due to overseas market holidays and time zones.
- Recent ranking is momentum evidence, not proof of long-term quality.
- Do not treat A/B/C/D/I classes as interchangeable. Explain the selected share class and compare subscription fee, sales service fee, redemption fee, holding horizon, and channel availability when alternatives exist.
- A-class style front-end subscription fees and C-class style ongoing sales service fees affect different holding periods differently; do not assume one is always cheaper.
- When feeImpact exists, pass it through to recommendation and portfolio decisions; do not collapse it into a generic "fees differ" caveat.
- Do not ask the user to manually provide Sharpe/drawdown/volatility if computed risk metrics are available.
- Do not say "missing top holdings" when `holdings.equityTopHoldings` or `holdings.bondTopHoldings` exists.

## Output

Return enriched facts and source caveats. Do not make final buy/sell decisions.
