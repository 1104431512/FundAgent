---
name: fund-screening
description: Legacy compatibility skill for single mutual fund or ETF screening. Use only when a workflow explicitly needs a compact single-fund verdict and more specific modular skills are not selected.
---

# Fund Screening

Use this only as a fallback for one specific fund. Prefer the modular skills:

- `fund-vision` for screenshot/text fact extraction.
- `fund-data-enrichment` for public data and holdings enrichment.
- `fund-analysis` for one fund's quality, risk, timing, and role.
- `fund-comparison` for choosing among multiple funds.
- `fund-recommendation` for discovering candidates from market themes.
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
