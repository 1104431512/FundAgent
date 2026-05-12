---
id: theme-to-fund-mapping
name: Theme To Fund Mapping
description: Map a selected market theme to fund vehicles while removing false matches, duplicate share classes, and duplicate index exposure.
---

# Theme To Fund Mapping

After the theme is selected, choose the cleanest fund vehicle.

## Duties

- Prefer funds whose name, index, holdings, and candidate keywords actually match the selected theme.
- For index/ETF themes, select the index exposure first, then choose the fund share class.
- Treat A/C/D/I share classes of the same fund as one product choice.
- Treat different issuers tracking the same index as substitutes, not separate themes.
- Avoid false positives where the fund name matches but holdings/style do not support the theme.

## Selection Order

1. Exposure purity and index/holdings match.
2. Scale/liquidity and operational availability.
3. Fee/share-class fit for holding period.
4. Risk and drawdown.
5. Recent trend only as confirmation.

## Output Contract

- primaryTheme
- primaryVehicle
- alternativeShareClasses
- sameExposureAlternatives
- falsePositiveRejects
- mappingConfidence
