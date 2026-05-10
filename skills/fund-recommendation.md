---
name: fund-recommendation
description: Discover and recommend fund or ETF candidates from recent market themes, sector heat, user preferences, or portfolio allocation requests. Use when the user asks for "recommend a few funds", "what to buy recently", "latest themes", or "how to allocate 10000 CNY" without providing a specific fund.
---

# Fund Recommendation

Recommend candidates from market context and fund pools. Do not treat this as analysis of an already provided fund.

## Workflow

1. Read the user's intent: aggressive, balanced, conservative, theme chasing, long-term core, QDII, bond, dividend, technology, etc.
2. Use market snapshot and candidate fund rankings as discovery evidence, not as final proof.
3. Select themes first, then products.
4. Include at least one risk-balanced alternative when recommending high-volatility themes.
5. Give a 10000 CNY plan when buying/allocation is implied.

## Candidate Rules

- Use codes/names only from available candidate data unless explicitly marked "direction only, code pending verification".
- Avoid recommending only recent top performers; mention crowding and drawdown risk.
- For sector/theme/QDII products, label them as satellite or tactical unless the user asks for concentration.
- For broad index or balanced funds, they can be core candidates if evidence supports it.

## Output

Give:

1. Top 2-4 themes/directions.
2. 3-6 candidate funds or ETFs.
3. Which profile fits each: aggressive / balanced / conservative.
4. 10000 CNY allocation.
5. Do-not-buy or reduce-size conditions.
6. Data staleness note.
