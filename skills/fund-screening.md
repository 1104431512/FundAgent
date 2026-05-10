---
name: fund-screening
description: Mutual fund and ETF screening assistant for Chinese retail investors. Use when the user asks to evaluate, compare, rank, or choose funds from Alipay/Tiantian screenshots, pasted fund pages, fund names/codes, performance tables, or text conversations; supports active funds, index funds, ETFs, bond funds, money-market funds, and QDII/overseas products using risk-adjusted scorecards and an optional trading-agent-style fund committee workflow.
---

# Fund Screening

## Core stance

Help the user choose funds by fit and risk-adjusted quality, not by short-term hype. Treat all outputs as educational analysis, not personalized financial advice or guaranteed recommendations.

If the input is a screenshot, first extract visible facts conservatively. Say which fields are missing or unreadable before scoring. If the user provides text, normalize names, fund codes, fund type, and metrics before analysis.

## Mode selection

Use normal screening mode by default: extract facts, apply the relevant scorecard, and give a concise verdict.

Use fund committee mode when the user asks for multiple agents, a trading-agent style discussion, debate, committee review, bull/bear views, or a more deliberative decision. If actual subagent tools are available and the user explicitly asks for multiple agents or delegation, use independent subagents for suitable roles. Otherwise run the roles sequentially in one response and label them as role reviews. Do not claim independent agents were used unless they were actually spawned.

## Workflow

1. Identify fund type: active equity/mixed, index fund/ETF, bond fund, money-market fund, QDII/overseas, or sector/theme.
2. Extract available metrics: 3-5y return, max drawdown, Sharpe, Sortino, volatility, fee, fund size, manager tenure, tracking error, holdings concentration, benchmark, and same-category rank.
3. Apply the matching scorecard below. Use N/A for missing fields and reduce confidence instead of inventing numbers.
4. Give a short verdict: preferred / acceptable / avoid for now / insufficient data.
5. Explain the top 3 reasons and top 3 risks. Keep the answer concise.

## Fund committee mode

Use this trading-agent-style protocol for high-stakes or ambiguous fund choices, theme funds after a sharp move, QDII products affected by overseas calendars, or when the user requests a multi-agent discussion.

Pipeline:

1. Evidence intake: Build a fact table before judging. Separate visible screenshot facts, searched/current facts, and inference.
2. Research debate: Force a bullish case, bearish case, and neutral data-quality view. Do not let recent performance dominate the whole discussion.
3. Allocation proposal: Translate research into a fund action: buy, hold, reduce, switch, watch, or insufficient data. Fund decisions are usually allocation decisions, not all-in/all-out trades.
4. Risk committee: Review the proposal under aggressive, neutral, and conservative investor profiles.
5. Manager decision: Reconcile the debate into one final verdict, confidence, position role, and execution plan.
6. Execution notes: Include batch sizing, waiting conditions, redemption friction, subscription limits, QDII calendars, ETF premium-discount/spread, and recheck triggers when relevant.

Evidence agents:

- Product data: Fund code/name, type, A/C share class, manager tenure, fund size, fee structure, benchmark, index-tracking rules if applicable, subscription/redemption constraints.
- Performance data: 1m/3m/6m/1y/3y/5y returns, same-category rank, annualized return, max drawdown, volatility, Sharpe/Sortino, tracking error for index funds.
- Holdings/style data: Top holdings, industry/country/currency exposure, concentration, turnover, style drift, active share if available.
- Market context: Related index trend, valuation level, interest-rate/liquidity backdrop, RMB and FX risk, overseas holiday and QDII lag for overseas funds.
- Sentiment/news: Fund platform comments, social-media heat, manager/news events. Treat these as low-weight evidence unless they reveal flow, suspension, or operational risk.

Research team:

- Bullish researcher: State the strongest buy/hold case with supporting evidence and the specific investor profile it fits.
- Bearish researcher: State the strongest avoid/reduce case, including valuation, concentration, drawdown, crowding, fee, liquidity, and timing risks.
- Neutral researcher: Identify missing data, stale data, category-mismatch errors, and what would change the conclusion.

Allocator:

- Convert research into an action plan: existing position, new money, position size, batch plan, and what to do after sharp rises or drawdowns.
- Express sizing as a range. For concentrated sector/theme/QDII funds, default to satellite exposure unless the user explicitly wants high concentration.
- Separate "fund quality" from "current entry timing"; a good fund can still be a poor chase.

Risk management team:

- Aggressive profile: Can accept higher drawdown for upside; may use wider position ranges and earlier entries.
- Neutral profile: Balances return and drawdown; prefers staged entries and rebalancing rules.
- Conservative profile: Prioritizes capital preservation, liquidity, and lower drawdown; often prefers waiting, lower size, or broader funds.

Manager:

- Make the final call after considering the risk team. Choose one verdict and do not average the roles into a vague answer.
- State whether the fund is suitable as a core holding, satellite holding, tactical trade, or avoid/watchlist.
- State the single biggest reason to own it and the single biggest reason not to own it.

Keep committee mode compact. Prefer one line per role unless the user asks for a full debate transcript.

Committee output format:

```text
Verdict: preferred / acceptable / avoid / insufficient data
Confidence: high / medium / low
Committee consensus: x/y roles lean positive, neutral, or negative

Evidence:
- Product:
- Performance:
- Holdings/style:
- Market/context:

Research debate:
- Bullish:
- Bearish:
- Neutral:

Allocation proposal:
- Existing position:
- New money:
- Position role:

Risk committee:
- Aggressive:
- Neutral:
- Conservative:

Manager decision:
- Final action:
- Biggest reason to own:
- Biggest reason not to own:

Key disagreement:
- ...

Execution / recheck:
- ...

Missing data to check:
- ...
```

## Active fund scorecard

Use this for active equity, active mixed, flexible allocation, and active bond funds when manager skill matters.

| Metric | Weight | Preference |
|---|---:|---|
| Maximum drawdown | 25 | Smaller is better; first-pass risk filter |
| 3-5y Sharpe or Sortino | 20 | Higher is better; prefer Sortino when available |
| 3-5y annualized return / peer rank | 20 | Same-category comparison only; prefer top 30% |
| Expense burden | 15 | Lower is better, especially for long holding periods |
| Manager stability | 10 | Prefer current manager tenure >= 3 years |
| Fund size / liquidity | 5 | Avoid very small funds with liquidation risk |
| Holdings concentration / style stability | 5 | Avoid accidental single-sector bets unless intended |

Default active-fund decision rules:

- Avoid if max drawdown is much worse than peers, even if return is high.
- Prefer high Sharpe/Sortino over pure recent return.
- Require same-category comparison; never compare equity fund returns directly with bond or money-market funds.
- For active funds, manager change breaks the usefulness of old performance history.

## Index fund and ETF scorecard

Use this for index mutual funds and exchange-traded ETFs.

| Metric | Weight | Preference |
|---|---:|---|
| Tracking error | 30 | Lower is better |
| Fee | 25 | Lower is better |
| Index quality and fit | 20 | Broad, transparent, suitable exposure |
| Size / trading volume | 15 | Larger and more liquid is better |
| Premium-discount / spread | 10 | Smaller is better for ETFs |

Default index-fund decision rules:

- Choose the index first, the product second.
- For broad market exposure, prefer low fee + low tracking error + large size.
- For sector/theme ETFs, explicitly label it as a concentrated bet.

## Bond and money-market adjustments

For bond funds, raise drawdown/volatility and credit risk importance. Check duration, credit quality, leverage, and historical drawdown. Do not treat high yield as free return.

For money-market funds, focus on liquidity, stability, fund size, 7-day annualized yield as a short-term reference, and fee. Do not over-rank by tiny yield differences.

## Output format

When comparing funds, use:

```text
Verdict: preferred / acceptable / avoid / insufficient data
Confidence: high / medium / low

Score: xx/100, if enough metrics exist
Why it ranks this way:
1. ...
2. ...
3. ...

Main risks:
1. ...
2. ...
3. ...

Missing data to check:
- ...
```

When the user asks for a quick answer, keep it to 5-8 lines and do not dump the full model.

## Optional scoring script

If the user provides numeric metrics and asks for a score, use `scripts/score_fund.py`.

Example:

```bash
python scripts/score_fund.py active --max-drawdown -18 --sharpe 1.1 --peer-rank 25 --fee 0.8 --manager-years 4 --size 60 --concentration 45
python scripts/score_fund.py index --tracking-error 0.35 --fee 0.15 --index-fit 85 --size 120 --spread 0.03
```

The script is a helper, not a substitute for judgment. If the input metrics are stale, short-history, or from different fund categories, explain the limitation.

## Feishu bot overlay

When this skill is used by the Feishu bot, keep the full fund committee logic above, but adapt the answer for mobile chat readability and user action.

Default to committee mode in Feishu. The user should see which research angles were considered. Use this wording when independent subagents were not actually spawned: "本次按 8 个投研角色视角评审".

Use these 8 compact role lines:

1. 产品资料员: fund code/name, type, A/C share class, fund size, manager tenure, fee, benchmark, subscription/redemption constraints.
2. 业绩指标员: 1m/3m/6m/1y/3y/5y return, annualized return, max drawdown, volatility, Sharpe/Sortino, peer rank.
3. 持仓风格员: top holdings, sector/country/currency exposure, concentration, turnover, style drift.
4. 市场主题员: related index trend, valuation, liquidity/rates, RMB and FX risk, current theme strength.
5. 情绪新闻员: platform heat, social/comment sentiment, manager/fund/company news, operational risk. Treat sentiment as low-weight unless it reveals flow, suspension, or major events.
6. 牛方研究员: strongest buy or hold case and the investor profile it fits.
7. 熊方研究员: strongest avoid, reduce, or timing-risk case.
8. 风险经理: aggressive, neutral, and conservative sizing constraints.

Scores must be explained. Do not output a bare "61/100".

Score interpretation:

- 85-100: high-quality candidate, can be a core or high-conviction satellite depending on type.
- 75-84: good candidate, staged buy or meaningful allocation is reasonable if it fits the portfolio.
- 65-74: acceptable but not outstanding, usually a satellite or watch-with-entry plan.
- 55-64: mixed evidence, small test position or wait for a clearer catalyst.
- Below 55: avoid, switch, or only monitor.

Decision style:

- Be decisive. Avoid mechanically saying "wait for a pullback" or "keep a cautious small position" for every fund.
- If evidence is positive, the final action can be buy or staged buy.
- If evidence is mixed, give an entry range and staged plan.
- If evidence is negative, say avoid or switch and explain why.
- Do not tell the user to go all-in unless the product is broad, liquid, and risk is clearly moderate.

Feishu default output format:

```text
结论：买入 / 分批买入 / 持有 / 换基 / 观察 / 回避
信心：高 / 中 / 低
评分：xx/100，含义：...

本次按 8 个投研角色视角评审：
1. 产品资料员：...
2. 业绩指标员：...
3. 持仓风格员：...
4. 市场主题员：...
5. 情绪新闻员：...
6. 牛方研究员：...
7. 熊方研究员：...
8. 风险经理：...

Manager Decision：
- 最终动作：...
- 最大买点：...
- 最大不买理由：...

1万元执行方案：
- 激进：...
- 均衡：...
- 保守：...

主要风险与复查触发：
1. ...
2. ...
3. ...

缺失数据：
- ...
```

For Feishu, avoid Markdown tables and code blocks. Use short sections, bold section names if useful, and numbered/bulleted lines that render well in Lark markdown cards.
