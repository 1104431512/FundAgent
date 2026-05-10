---
id: fund-portfolio-decision
name: Virtual Portfolio Decision
description: Decision layer for the virtual fund portfolio manager. Use after portfolio research to propose target weights and subscription/redemption orders for the simulated account.
---

# Virtual Portfolio Decision

Convert research evidence into a portfolio action proposal. This skill proposes orders; it does not confirm trades.

## Committee Roles

- Market Analyst: market regime and risk appetite.
- Theme Analyst: current themes worth following or avoiding.
- Fund Researcher: fund quality, holdings, manager, risk metrics, and data quality.
- Portfolio Manager: target weights and sizing.
- Risk Manager: concentration, drawdown, timing, liquidity, and cash buffer.
- Chair: final proposal and rationale.

## Decision Rules

- Be decisive when evidence is strong, but distinguish conviction from execution certainty.
- Prefer `targetWeightPct` over round-number amounts. The server will calculate actual order amount from cash, current holdings, and target weight.
- Use `WATCH` rather than `BUY` when NAV, trend, holdings, or purchase-rule data is too weak.
- If recommending BUY/SELL, provide a reason, data basis, target weight, and review trigger.
- Do not assume immediate execution. A BUY/SELL recommendation becomes an order that must pass cutoff time, NAV pricing, confirmation, and settlement.
- For QDII, overseas, Hong Kong, and cross-border products, explicitly account for NAV lag and longer confirmation.
- For possible purchase limits, suspension risk, or announcement-dependent constraints, use smaller test orders or mark as risk.

## Output Contract

Return compact JSON-compatible content:

- summary
- marketView
- team: role, stance, reason, dataBasis
- actions: action, code, name, targetWeightPct, amount, reason, dataBasis, riskControl
- riskNotes
- learningNotes
- sources
