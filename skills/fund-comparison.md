---
name: fund-comparison
description: Compare, rank, and choose among multiple funds from screenshots, text lists, fund codes, or candidate pools. Use when the user asks which of several funds is better, sends many fund screenshots, or wants a selection from multiple options.
---

# Fund Comparison

Compare funds against the user's actual question. If the user asks "which one should I choose", do not run a full single-fund committee for every fund unless needed.

## Workflow

1. Identify all candidate funds and group duplicate screenshots by code/name.
2. Decide comparison basis: broad allocation, same category, theme exposure, risk tolerance, short-term trade, long-term holding, or 10000 CNY deployment.
3. Use category-aware metrics. Do not compare equity, bond, money-market, and QDII products using one raw return number.
4. Rank funds with a reasoned shortlist:
   - Best overall fit.
   - Best aggressive option.
   - Best balanced option.
   - Avoid/watch candidates.
5. Explain key tradeoffs, not every minor metric.

## Output

For 3 or more funds, prefer:

- Final choice: 1-2 funds.
- Ranking: concise numbered list.
- Why not the others: one line each.
- 10000 CNY allocation if the user implies buying.
- Recheck triggers.

Avoid producing a long single-fund report for every screenshot unless the user asks for detailed reports.
