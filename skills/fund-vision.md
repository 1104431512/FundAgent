---
name: fund-vision
description: Extract structured facts from fund screenshots, pasted fund pages, mixed image/text Feishu messages, or screenshots containing multiple funds. Use before analysis when the input contains images or unstructured visible fund data.
---

# Fund Vision

Extract facts only. Do not evaluate, recommend, score, or summarize line by line.

## Duties

- Identify visible fund codes, names, share classes, fund type, platform labels, dates, NAV, returns, ranks, fees, position/profit fields, and user annotations.
- If multiple screenshots refer to the same fund, merge facts by fund code/name.
- If screenshots contain multiple funds, return one item per fund.
- Separate visible facts from inferred facts.
- Mark unreadable or missing fields as `N/A`; never guess numeric metrics.

## Output Contract

Return compact structured facts that downstream skills can consume:

- fundCodes
- fundNames
- funds: code, name, visibleFacts, visibleMetrics, missingFields
- userIntentHint: single fund / compare funds / recommend candidates / unknown

Do not produce final user-facing advice.
