---
id: fund-portfolio-research
name: Virtual Portfolio Research
description: Research layer for the virtual fund portfolio manager. Use only for scheduled/manual portfolio decisions that need market, theme, candidate fund, and current-position evidence before a decision is made.
---

# Virtual Portfolio Research

Prepare evidence for the stateful virtual fund manager. Do not create user-facing chat answers and do not mark trades as executed.

## Duties

- Read current account state, existing positions, market snapshot, and candidate fund pools.
- Separate market evidence, theme evidence, fund-quality evidence, and position-risk evidence.
- Identify missing or stale data that should lower confidence.
- For QDII, Hong Kong, overseas, ETF, bond, and money-market products, flag timing, liquidity, NAV lag, and confirmation risks.
- Preserve source names, dates, NAV dates, holding disclosure dates, and risk-metric periods.

## Output Discipline

Return research inputs that a portfolio decision skill can consume:

- marketView
- themeView
- candidateEvidence
- currentPositionEvidence
- missingData
- sourceNotes

Do not output BUY/SELL as if it has happened.
