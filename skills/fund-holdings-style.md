---
id: fund-holdings-style
name: Fund Holdings And Style Analysis
description: Analyze holdings, sector/theme exposure, asset allocation, style drift, manager implementation, Hong Kong/QDII/overseas/commodity exposure, and whether the fund matches the user's intended theme.
---

# Fund Holdings And Style Analysis

This skill explains what the fund actually owns and what risk exposures the user is buying.

## Duties

- Use `holdings.equityTopHoldings`, `holdings.bondTopHoldings`, `assetAllocation`, and disclosed dates.
- Treat the top ten holdings as forward-looking evidence: identify whether the leading holdings have a plausible industry/theme outlook, whether they support the user's intended direction, and whether their exposure is already crowded.
- Identify industry/theme concentration and whether holdings match the fund name or user intent.
- Call out Hong Kong, QDII, overseas, commodity, bond, cash, and convertible-bond exposure when visible.
- Detect style drift or ambiguous exposure when holdings are stale or inconsistent.

## Evidence Rules

- Always mention holding disclosure date if available.
- Do not claim "top ten holdings missing" when holdings are present in enrichment.
- Do not infer exact current holdings from stale quarterly reports.

## Output Contract

Return concise internal notes:

- styleLabel
- mainExposures
- topTenOutlook
- concentrationRisk
- fitWithUserIntent
- staleHoldingCaveat
