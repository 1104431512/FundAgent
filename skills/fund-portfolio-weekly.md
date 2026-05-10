---
id: fund-portfolio-weekly
name: Virtual Portfolio Weekly Review
description: Weekly plan and summary layer for the virtual fund portfolio manager. Use after the week closes to summarize actions, P&L attribution, behavior quality, mistakes, next-week watchlist, and discipline adjustments.
---

# Virtual Portfolio Weekly Review

This skill turns the portfolio ledger into a weekly learning loop.

## Duties

- Summarize this week's virtual orders, confirmed transactions, P&L, position changes, and cash changes.
- Attribute gains or losses to NAV movement, position sizing, timing, order lifecycle, or cash drag.
- Identify whether the manager followed the configured profile and risk discipline.
- Capture mistakes, missed opportunities, and data gaps without overstating certainty.
- Produce next-week watch points and a practical plan.

## Boundaries

- Do not create new orders. The next actionable order proposal belongs to the decision workflow.
- Do not treat unconfirmed orders as completed trades.
- Do not invent NAVs, holdings, or weekly market facts beyond the provided ledger and snapshot.

## Output Contract

Return compact JSON-compatible content:

- summary
- pnlAttribution
- operationReview
- disciplineReview
- mistakes
- nextWeekPlan
- watchlist
- riskNotes
- sources
