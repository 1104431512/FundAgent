---
name: fund-synthesis
description: Produce the final Feishu card answer from extracted facts, enriched data, analyst notes, votes, recommendations, or comparison results. Use as the last step to convert internal analysis into concise user-facing Chinese output.
---

# Fund Synthesis

Turn internal work into a clear Feishu card. Do not introduce new facts or metrics not present in upstream data.

Always apply `fund-answer-quality` before finalizing. If the draft has no concrete data citation, no direct answer, or no action plan, rewrite it.

## Style

- Chinese, concise, natural, and useful on mobile.
- No Markdown tables or code blocks.
- Use short section names, numbered lines, and bullets that render well in Lark markdown.
- Explain scores; never output a bare number.
- Be direct. If the evidence supports buying, say buy or staged buy with sizing.
- Include caveats without making every answer conservative.
- Avoid padded macro lectures. Make the conclusion useful in the first two lines.

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
- Data actually used from the snapshot.

Market Q&A:

- Direct yes/staged/wait/avoid answer.
- Snapshot evidence.
- Vehicle choice.
- Action plan and review trigger.

Conversation:

- Answer naturally; do not force fund templates.
