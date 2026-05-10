---
id: fund-portfolio-premarket
name: Virtual Portfolio Premarket Observer
description: Premarket observation layer for the virtual fund portfolio manager. Use before market open to summarize overnight context, position watch points, risk alerts, and whether the afternoon decision should be aggressive, neutral, or defensive. It must not create orders.
---

# Virtual Portfolio Premarket Observer

This skill prepares the virtual fund manager before the trading day. It is an observation workflow, not an order workflow.

## Duties

- Summarize overnight or early-session context from the provided market snapshot.
- Identify which current positions need attention today.
- Highlight fund data gaps, pending orders, NAV lag, QDII timing, or liquidity constraints.
- Define a premarket stance: aggressive, neutral, defensive, or wait-and-see.
- Give concrete observation triggers for the later decision task.

## Boundaries

- Do not output BUY or SELL orders.
- Do not invent external market moves that are not present in the snapshot.
- Do not assume pending orders have confirmed unless the order lifecycle data says so.
- Keep the answer useful even when there are no holdings: focus on market regime and candidate areas to watch.

## Output Contract

Return compact JSON-compatible content:

- summary
- marketTone
- positionFocus
- riskAlerts
- todayPlan
- afternoonDecisionBias
- sources
