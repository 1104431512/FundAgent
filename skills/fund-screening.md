---
name: fund-screening
description: Legacy compatibility skill for single mutual fund or ETF screening. Use only when a workflow explicitly needs a compact single-fund verdict and more specific modular skills are not selected.
---

# Fund Screening

Use this only as a fallback for one specific fund. Prefer the modular skills:

- `fund-vision` for screenshot/text fact extraction.
- `fund-data-enrichment` for public data and holdings enrichment.
- `fund-trend-analysis` for NAV trend, drawdown repair, and entry timing.
- `fund-risk-analysis` for risk budget, volatility, drawdown, and position sizing.
- `fund-holdings-style` for top holdings, sector/theme exposure, and style fit.
- `fund-fee-share-class` for share class and fee/holding-period fit.
- `fund-manager-quality` for manager/process/scale evidence.
- `fund-analysis` for integrating specialist notes into one verdict.
- `fund-comparison` for choosing among multiple funds.
- `fund-recommendation` for discovering candidates from market themes.
- `fund-actionability-evaluation` for deciding whether the answer is directly usable as buy/hold/wait/avoid guidance.
- `fund-answer-quality` for rejecting generic or unsupported final answers.
- `fund-synthesis` for final Feishu card wording.

## Minimal Scorecard

Identify fund type first: active equity/mixed, index/ETF, bond, money market, QDII/overseas, or sector/theme.

For active funds, weigh drawdown, Sharpe/Sortino, 3-5y return, fee, manager stability, size/liquidity, and holdings/style stability.

For index/ETF funds, weigh index fit, tracking error, fee, liquidity/size, and premium-discount/spread.

For bond funds, weigh credit risk, duration, leverage, liquidity, and historical drawdown.

## Output

Give:

1. Verdict: buy / staged buy / hold / switch / watch / avoid.
2. Confidence: high / medium / low.
3. Score meaning, not a bare number.
4. Top reasons to own.
5. Top risks.
6. Execution or recheck trigger.
