---
name: fund-analysis
description: Orchestrate one specific fund's overall verdict from specialized analyst skills. Use after data enrichment, trend, risk, holdings/style, fee/share-class, and manager-quality analysis have contributed evidence.
---

# Fund Analysis

Analyze one specific fund. Do not turn single-fund analysis into broad market recommendation unless the user asks.

This is an orchestration skill, not a one-person-does-everything skill.

## Specialist Dependencies

- `fund-trend-analysis`: NAV trend, momentum, drawdown repair, timing.
- `fund-risk-analysis`: drawdown, volatility, Sharpe, position sizing risk.
- `fund-holdings-style`: holdings, sector/theme exposure, style fit.
- `fund-fee-share-class`: share class and fee/holding-period fit.
- `fund-manager-quality`: manager, tenure, scale, and process quality.
- `fund-answer-quality`: final answer must be specific, evidence-backed, and actionable.

## Evaluation Axes

- Product fit: fund type, benchmark, size, subscription/redemption constraints.
- Trend and timing: use the trend specialist; do not make timing claims without trend evidence.
- Risk-return: use the risk specialist; separate return from holding discomfort.
- Holdings/style: use the holdings/style specialist; explain what exposure the user is actually buying.
- Share-class cost: use the fee/share-class specialist; do not mix A/C/D/I share classes.
- Manager and operation: use the manager-quality specialist.
- Execution: final action, position role, staged plan, review trigger.

## Decision Style

Be decisive when evidence is strong. Do not mechanically say "wait for a pullback" for every fund.

Separate:

- Fund quality: whether the product is worth owning.
- Entry timing: whether now is a good entry.
- Position role: core, satellite, tactical trade, watchlist, or avoid.

If specialists disagree, say where the disagreement is. Do not smooth it into vague neutral wording.

The final action must be one of: buy, staged buy, hold, switch, watch, avoid.

Always include the strongest buy reason and strongest not-buy reason.

## Score Meaning

- 85-100: high-quality candidate, meaningful allocation may be reasonable if it fits.
- 75-84: good candidate, staged buy or solid satellite/core role depending on type.
- 65-74: acceptable but not outstanding; usually satellite or staged entry.
- 55-64: mixed evidence; small test position or wait for clearer catalyst.
- Below 55: avoid, switch, or monitor only.

Always explain the score in one sentence.
