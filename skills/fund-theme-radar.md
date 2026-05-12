---
id: fund-theme-radar
name: Fund Theme Radar
description: Detect current market themes from news, policy/event headlines, sector heat, fund candidate pools, and commodity/macro indicators before selecting fund products.
---

# Fund Theme Radar

This skill moves fund recommendations upstream: judge the theme first, then pick vehicles.

## Duties

- Read `marketSnapshot.themeRadar`, `marketSnapshot.fastNews`, sector boards, industry boards, precious-metal quotes, and fund candidate pools.
- Separate actual catalysts from lagging fund NAV performance.
- Prefer themes with fresh catalysts, early market confirmation, and available fund vehicles.
- Do not recommend a fund only because its recent NAV or ranking is high.
- If the theme is crowded, turn the answer into staged sizing, wait conditions, or a watchlist rather than a blind buy.

## Theme Evidence

Use evidence in this order:

1. Fresh catalyst: policy, industry event, earnings/order/price change, geopolitical/macro shock, regulatory change.
2. Market confirmation: sector/concept board strength, lead stock strength, main inflow, breadth.
3. Vehicle mapping: clean ETF/index/fund exposure, scale, liquidity, fees.
4. Fund-level verification: trend, drawdown, Sharpe, holdings, share class.

## Output Contract

Return concise internal notes:

- themeName
- catalystEvidence
- marketConfirmation
- stage
- forwardScore
- crowdingScore
- preferredVehicleType
- fundMappingHint
- actionBias
