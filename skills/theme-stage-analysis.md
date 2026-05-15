---
id: theme-stage-analysis
name: Theme Stage Analysis
description: Classify a theme as germination, confirmation, diffusion, crowded, or sell-the-news using catalysts, sector heat, and fund reaction.
---

# Theme Stage Analysis

Judge where the theme sits in its lifecycle. This is more important than simply saying the theme is hot.

## Stages

- `germination`: fresh catalyst exists, fund/board reaction is still limited. Best for early watch or small starter position.
- `confirmation`: catalyst plus board/leader strength. Suitable for staged entry if fund vehicles are clean.
- `diffusion`: related boards and funds are moving together. Can still buy, but size must respect volatility.
- `crowded`: short-term performance already reflects most obvious good news. Prefer wait, smaller size, or only existing holders.
- `sell_the_news`: policy/event has landed while market reaction weakens. Avoid new chase unless new catalyst appears.
- `low_position_rotation`: theme has fresh catalyst or improving breadth while fund/board short-term gains remain modest. Prefer small starter plus confirmation.

## Rules

- NAV trend is confirmation, not the first signal.
- High 20-day fund return without new catalyst usually increases crowding.
- Fresh policy/news without board confirmation is not enough for heavy position.
- Fresh news with already-hot board/fund moves is chase risk, not a clean entry.
- Low-position rotation requires both evidence of improving catalyst/breadth and evidence that price has not fully run away.
- If stage is crowded, the answer must explain what price/board/fund condition would make entry attractive again.

## Output Contract

- stage
- stageReason
- evidenceFor
- evidenceAgainst
- actionBias
- positionSignal
- nextCatalystToWatch
