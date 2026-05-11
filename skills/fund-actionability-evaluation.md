---
name: Fund Actionability Evaluation
description: Self-evaluate whether a fund or theme answer is directly usable as a buy/hold/wait/avoid guide. Use before final fund Q&A, recommendation, screening synthesis, and any "worth buying" answer to produce a concrete suitability verdict, allocation band, and decision boundary instead of generic risk disclaimers.
---

# Fund Actionability Evaluation

This skill decides whether the answer is useful enough for a real user to act on.

## Core Job

- Translate evidence into one action: buy, staged buy, hold, wait, avoid, or ask for a specific fund.
- Say who it fits: aggressive, balanced, conservative, existing holder, or new money.
- Give a usable allocation band or first order size when buying/staged buying is reasonable.
- Separate decision blockers from generic future risks.

## Evaluation Ladder

Use evidence in this order:

1. Current market/theme state and direction.
2. Fund or vehicle trend profile.
3. Fund quality: holdings, manager, scale, tracking object, liquidity.
4. Fee/share-class fit for the holding period.
5. User's actual question and implied urgency.

## Anti-Patterns

- Do not lead with disclaimers.
- Do not list broad risks that are always true.
- Do not say "can allocate but don't chase" without a buy size, waiting condition, or rejection reason.
- Do not turn "worth buying?" into a lecture.
- Do not hide behind missing data if enough evidence exists for a directional answer.

## Output Contract

Return concise internal notes:

- fitLabel: strong fit / fit / tactical only / weak fit / not suitable
- action: buy / staged_buy / hold / wait / avoid / need_specific_fund
- allocationBand: suggested percentage or first-order amount
- confidence: high / medium / low
- decisiveEvidence: the 2-3 facts that actually drive the action
- decisionBlocker: the 1-2 facts that would invalidate the action
- answerAudit: whether the final answer directly answers the user's real need
