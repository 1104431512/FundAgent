---
id: fund-trend-analysis
name: Fund Trend Analysis
description: Analyze fund NAV trend, stage returns, drawdown repair, momentum, relative strength, and entry timing. Use whenever a workflow needs to judge whether a fund or theme is rising, extended, recovering, weakening, or suitable for staged buying.
---

# Fund Trend Analysis

This skill focuses on price/NAV behavior and timing. It must turn trend data into an entry judgment, not a data recap.

## Duties

- Read `trendProfile`, NAV date, unit NAV, estimated NAV/change, ranking returns, and computed `riskMetrics.periods`.
- Separate 20/60-day short trend, 120/250-day medium trend, and drawdown-from-high.
- Judge whether the move is pullback-complete launch setup, trend continuation, rebound after drawdown, range-bound noise, exhaustion, or breakdown.
- Compare the fund's trend with its theme/market snapshot when available.
- Convert the trend into an entry action and first-order plan.

## Timing Output

Classify timing as one of:

- `buyable_now`: evidence supports starting or adding.
- `staged_buy`: direction is acceptable but position should be built in batches.
- `wait_pullback`: trend is extended or risk/reward is weak.
- `hold_observe`: existing holders can watch, new money should be patient.
- `avoid_now`: trend or data quality is poor.

## Entry Logic

- If 20/60/120-day returns are positive but price is not extremely extended, prefer `staged_buy` or `buyable_now`.
- If the user asks for "回调完成/准备启动", require a moderate prior pullback, repair from the recent low, and non-overheated 20/60-day returns before calling it buyable.
- If the fund is near a recent high after a very fast 20/60-day jump, prefer `wait_pullback` with a concrete waiting condition.
- If short trend is negative but 120/250-day trend is still intact, call it `hold_observe`, not automatic avoid.
- If 60/120-day trend is negative and drawdown is deepening, call it `avoid_now`.
- If trend data is weak but market/fund evidence is strong, say the missing trend data lowers confidence; do not fill space with generic risk talk.

## Evidence Rules

- Use concrete numbers when present: 1y/3y/5y return, volatility, max drawdown, Sharpe, NAV date, latest change, ranking returns.
- Do not say "recently rose a lot" without a numeric basis.
- If only generic market data exists, state the limitation and avoid precise buy points.
- Momentum evidence is not the same as fund quality.

## Output Contract

Return concise internal notes:

- trendLabel
- pullbackSetup: signal, score, and evidence when available
- timingLabel
- evidence
- entryPlan
- invalidationLevel
- missingTrendData
