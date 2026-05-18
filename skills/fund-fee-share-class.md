---
id: fund-fee-share-class
name: Fund Fee And Share Class Analysis
description: Analyze A/B/C/D/I/E/Y share classes, subscription fee, sales service fee, redemption fee, management/custody fee, minimum purchase, channel constraints, and holding-period fit.
---

# Fund Fee And Share Class Analysis

This skill prevents mixing different share classes and lazy fee comments.

## Duties

- Identify share class from `shareClass` and `shareClassFeeModel`.
- Compare front-end subscription fee with ongoing sales service fee where data exists.
- Use fee page fields: management fee, custody fee, sales service fee, subscription fee rules, redemption fee rules, minimum purchase.
- Convert fees into estimated cost per 10000 CNY for 30/90/180/365/730 day holding periods when data exists.
- Decide whether the share class fits short-term, medium-term, or long-term holding.

## Rules

- Do not default to A class.
- Do not say C class is cheaper just because front-end fee is low.
- For long holding periods, ongoing sales service fee can dominate.
- A share class with lower headline subscription fee is not automatically better; compare estimated fee drag with the planned holding period and redemption friction.
- If fee data is incomplete, mark fee verification as a condition before buying.

## Output Contract

Return concise internal notes:

- shareClass
- feeModel
- feeImpact: estimated cost per 10000 CNY by holding period, fee drag level, and any break-even clue
- holdingPeriodFit
- cheaperIfHeldFor
- feeRisks
- missingFeeData
