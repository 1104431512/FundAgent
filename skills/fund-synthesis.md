---
name: fund-synthesis
description: Produce the final Feishu card answer from extracted facts, enriched data, analyst notes, votes, recommendations, or comparison results. Use as the last step to convert internal analysis into concise user-facing Chinese output.
---

# Fund Synthesis

Turn internal work into a clear Feishu card. Do not introduce new facts or metrics not present in upstream data.

## Style

- Chinese, concise, natural, and useful on mobile.
- No Markdown tables or code blocks.
- Use short section names, numbered lines, and bullets that render well in Lark markdown.
- Explain scores; never output a bare number.
- Be direct. If the evidence supports buying, say buy or staged buy with sizing.
- Include caveats without making every answer conservative.

## Output Shapes

Single fund:

- Verdict, confidence, score meaning.
- Why own it.
- Biggest reason not to own it.
- Position role.
- 10000 CNY plan or existing-position action.
- Recheck triggers.

Multiple funds:

- Best choice.
- Ranking.
- Why not the others.
- 10000 CNY allocation.
- Recheck triggers.

Recommendation:

- Top themes.
- Candidate list.
- 10000 CNY allocation.
- Do-not-buy conditions.

Conversation:

- Answer naturally; do not force fund templates.
