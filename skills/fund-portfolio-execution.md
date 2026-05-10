---
id: fund-portfolio-execution
name: Virtual Portfolio Execution
description: Execution constraints for the virtual fund portfolio. Use when a portfolio workflow needs to reason about order submission, cutoff time, valuation date, confirmation, redemption settlement, QDII lag, or purchase-limit caveats.
---

# Virtual Portfolio Execution

This skill governs simulated order lifecycle. It is not a recommendation skill.

## Execution States

Distinguish these states clearly:

- Proposed action: committee suggestion only.
- Submitted order: subscription/redemption request accepted into the simulated order book.
- Priced order: valuation date NAV has been found.
- Confirmed transaction: fund units or redemption amount confirmed.
- Pending subscription: cash is frozen while waiting for confirmation.
- Pending redemption: units are locked while waiting for redemption confirmation.
- Receivable cash: redemption confirmed but cash has not arrived.
- Settled cash: redemption cash is available.

## Timing Rules

- Common open-end funds: trading day before 15:00 uses that trading day's valuation date; after 15:00 rolls to the next trading day.
- Weekends are not trading days in the default simulation.
- Domestic open-end funds usually confirm faster than QDII/overseas products.
- QDII, overseas, Hong Kong, and cross-border products may have delayed NAV, delayed confirmation, and longer redemption settlement.
- ETF/LOF products can have different on-exchange rules; unless real exchange data is connected, keep them in the fund-order simulation and label this limitation.

## Data Rules

- Do not confirm an order without a verifiable NAV for the order's valuation date or a documented nearest available NAV fallback.
- Do not turn purchase-limit, suspension, or holiday uncertainty into a confirmed trade.
- Always keep NAV date, confirmation date, settlement date, and source visible for review.
