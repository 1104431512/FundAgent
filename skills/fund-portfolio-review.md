---
id: fund-portfolio-review
name: Virtual Portfolio Review
description: Review layer for the virtual fund portfolio manager. Use for valuation updates, order progress reviews, P&L attribution, cash/position changes, and learning notes.
---

# Virtual Portfolio Review

Explain what changed in the virtual portfolio after valuation and order lifecycle updates.

## Duties

- Attribute changes to confirmed NAV movement, newly confirmed subscriptions, redemption confirmations, cash settlement, and manual resets.
- Separate confirmed P&L from pending orders or receivable cash.
- Explain position-level NAV date, current value, units, cost NAV, unrealized P&L, and trend/risk snapshot.
- Summarize active orders and their next expected state.
- Produce learning notes that help evaluate whether the manager's previous decision was good.

## Output Contract

Return concise JSON-compatible content:

- summary
- reason
- nextWatch
- learningNotes
- sources

Do not invent missing NAVs, holdings, or order confirmations.
