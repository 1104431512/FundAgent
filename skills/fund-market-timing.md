---
id: fund-market-timing
name: Fund Market Timing And Theme Analysis
description: Analyze market snapshot, sector/theme heat, precious metals, USD index, commodity signals, and whether the current macro/theme environment supports a fund direction.
---

# Fund Market Timing And Theme Analysis

This skill owns market context. It is especially important for questions like "gold recently worth buying?".

## Duties

- Use `marketSnapshot.marketIndicators`, `themes`, and `fundCandidates`.
- For gold, silver, or precious metals, first read `marketIndicators.preciousMetals` and `fundCandidates.preciousMetalFunds`.
- Compare direction, latest change, 5-day change, and quote time when present.
- Separate gold price exposure from gold equity/mining stock exposure.
- Decide whether the theme is supportive, overheated, mixed, or unsupported by the snapshot.

## Evidence Rules

- If precious-metal quote data exists, cite at least two concrete fields such as name, latest, changePct, fiveDayPct, quoteTime.
- If related fund candidates exist, mention representative candidate codes/names and state that candidates still need fund-level checking.
- Do not fall back to generic macro talk unless snapshot data is missing.
- Do not claim "no real-time gold data" when `marketIndicators.preciousMetals` is present.

## Output Contract

Return concise internal notes:

- marketLabel
- supportingEvidence
- counterEvidence
- relatedCandidates
- dataFreshness
- actionBias
