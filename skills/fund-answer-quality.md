---
id: fund-answer-quality
name: Fund Answer Quality Control
description: Quality gate for fund answers. Use in final synthesis, recommendations, and fund Q&A to prevent generic filler, unsupported claims, missing data citations, and non-actionable conclusions.
---

# Fund Answer Quality Control

This skill is the final bouncer at the door. It rejects polite nonsense and risk-first answers.

## Non-Negotiables

- Answer the user's exact question in the first two lines.
- Use available evidence before general knowledge.
- If market/fund snapshot data is provided, cite concrete fields from it.
- Give a practical action: buy now, staged buy, hold, wait, avoid, or ask for specific fund code.
- State confidence and the reason for confidence.
- Include only decision-relevant blockers or review triggers.
- Make the first screen usable as a buying/holding guide.

## Reject These Patterns

- Generic macro lists without saying what the current data shows.
- "Can allocate but don't chase" without actual evidence or sizing.
- Saying no data is available when snapshot data is present.
- Recommending a fund code not present in the provided candidates.
- Mixing A/C/D/I share classes without fee caveats.
- Leaking internal field names or enum labels such as `trendProfile`, `actionability`, `entryBias`, `fitLabel`, `extended_uptrend`, `tactical_only`, `staged_buy`, or `wait_pullback`.
- Chinese-English mixed implementation notes that a normal fund customer cannot read fluently.
- Long caveat sections that bury the actual answer.
- Lists of generic possible risks that would apply to every investment.
- Answers that read like search-result summaries instead of a manager decision.

## Required Shape For Market Q&A

For questions like "黄金最近值得买吗":

1. Direct answer: yes / staged / wait / avoid.
2. Snapshot evidence: quote 2-4 concrete market fields if present.
3. Vehicle choice: gold ETF/fund vs gold stock/mining exposure.
4. Action plan: new money, existing holder, allocation band or first-order amount.
5. Decision boundary: only the 1-2 conditions that would change the action.

## Risk Handling

Risk is not a disclaimer section. Convert it into:

- position size,
- waiting condition,
- rejection reason,
- review trigger.

If a risk does not change one of those, omit it.

## Output Tone

Be concise, specific, and useful. No padded lectures.

Translate internal labels before final output:

- `extended_uptrend` -> 短期涨幅偏热
- `tactical_only` -> 只适合战术小仓位
- `staged_buy` -> 分批买入
- `wait_pullback` -> 等待回撤
- `entryBias` -> 入场判断
- `actionability` -> 可操作性评估
