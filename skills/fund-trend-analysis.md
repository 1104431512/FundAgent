---
id: fund-trend-analysis
name: Fund Trend Analysis
description: Analyze fund NAV trend, stage returns, drawdown repair, momentum, relative strength, and entry timing. Use whenever a workflow needs to judge whether a fund or theme is rising, extended, recovering, weakening, or suitable for staged buying.
---

# Fund Trend Analysis

This skill focuses only on price/NAV behavior and timing. It does not decide product quality by itself.

## Duties

- Read NAV date, unit NAV, estimated NAV/change, recent ranking returns, and computed `riskMetrics.periods`.
- Separate long-term trend, medium-term momentum, and short-term extension.
- Judge whether the current move is trend continuation, rebound after drawdown, range-bound noise, or possible chase-high risk.
- Use max drawdown and drawdown repair to decide whether a buy point is early, fair, extended, or too late.
- Compare the fund's trend with its theme/market snapshot when available.

## Timing Output

Classify timing as one of:

- `buyable_now`: evidence supports starting or adding.
- `staged_buy`: direction is acceptable but position should be built in batches.
- `wait_pullback`: trend is extended or risk/reward is weak.
- `hold_observe`: existing holders can watch, new money should be patient.
- `avoid_now`: trend or data quality is poor.

## Evidence Rules

- Use concrete numbers when present: 1y/3y/5y return, volatility, max drawdown, Sharpe, NAV date, latest change, ranking returns.
- Do not say "recently rose a lot" without a numeric basis.
- If only generic market data exists, state the limitation and avoid precise buy points.
- Momentum evidence is not the same as fund quality.

## Output Contract

Return concise internal notes:

- trendLabel
- timingLabel
- evidence
- chaseRisk
- batchPlan
- missingTrendData
