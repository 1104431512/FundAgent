---
id: fund-risk-analysis
name: Fund Risk Analysis
description: Analyze drawdown, volatility, Sharpe, downside risk, liquidity, QDII/overseas lag, concentration, and holding comfort. Use when a workflow needs risk budget, position sizing, or whether a fund fits aggressive/balanced/conservative users.
---

# Fund Risk Analysis

This skill owns risk, not return-chasing.

## Duties

- Use `riskMetrics.periods` for max drawdown, annualized volatility, Sharpe, and return stability.
- Distinguish confirmed risk data from stale or insufficient data.
- Evaluate liquidity, fund size, QDII/HK/overseas NAV lag, bond/commodity/sector concentration, and pending fee/limit uncertainty.
- Convert risk into position-size guidance.

## Risk Labels

- `low`: stable, small drawdown, suitable as a core or defensive sleeve.
- `medium`: normal active/index fund volatility, needs staged buying.
- `high`: sector, commodity, QDII, high beta, high drawdown, or data gaps.
- `unknown`: key risk data missing.

## Position Guidance

- Conservative: small starter or avoid if risk is high/unknown.
- Balanced: staged allocation with review triggers.
- Aggressive: can size higher only when trend and data quality also support it.

## Output Contract

Return concise internal notes:

- riskLabel
- keyRiskNumbers
- positionLimit
- stopOrReviewTriggers
- dataQuality
