import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "src", "server.mjs"), "utf8");

const forbiddenPatterns = [
  {
    pattern: /reboundFromRecentLowPct,\s*\n/,
    message: "computeTrendProfile must map reboundFromRecentLowPct from reboundFromLowPct; shorthand causes ReferenceError."
  },
  {
    pattern: /const hasAction = \/[^\n]*(?:buy|staged|wait|avoid|hold|sell)/i,
    message: "fund answer quality gate must not count raw English action enums as user-facing actions."
  },
  {
    pattern: /drawYAxisTickLabels\([^;\n]*["'][\u4e00-\u9fff]/,
    message: "fund report charts must not render tiny bitmap Chinese axis labels."
  }
];

const requiredPatterns = [
  {
    pattern: /internal_signal_leak/,
    message: "fund answer quality gate must reject internal enum/field leaks."
  },
  {
    pattern: /normalizeUserFacingFundAnswer/,
    message: "fund answers need a final localization pass for internal labels."
  },
  {
    pattern: /extended_uptrend[\s\S]{0,120}短期涨幅偏热/,
    message: "internal trend labels must have Chinese user-facing translations."
  },
  {
    pattern: /scoreCandidateReturnSetup/,
    message: "market deep-dive candidate sorting must use setup-aware return scoring instead of raw recent-return chasing."
  },
  {
    pattern: /pullbackSetup/,
    message: "trend profiles must expose a pullback/setup signal for ready-to-launch requests."
  },
  {
    pattern: /pullback_setup_discovery/,
    message: "generic pullback/setup requests must use a dedicated discovery route instead of generic QA."
  },
  {
    pattern: /fetchPullbackSetupCandidates/,
    message: "pullback/setup discovery must widen the candidate pool before deep-dive ranking."
  },
  {
    pattern: /stiff_confidence_label/,
    message: "fund answer quality gate must reject stiff confidence labels such as 信心：高。"
  },
  {
    pattern: /BUY\/FEE/,
    message: "fund report charts must include a readable buy-point and fee evidence panel."
  },
  {
    pattern: /function renderFundReportSummaryPng\(\{\s*profile,\s*width\s*=\s*980,\s*height\s*=\s*620\s*\}\s*=\s*\{\}\)/,
    message: "fund report chart defaults must remain large enough for dense evidence cards."
  },
  {
    pattern: /sanitizeChartText/,
    message: "fund report charts must sanitize non-ASCII text before drawing bitmap labels."
  },
  {
    pattern: /drawDecisionEvidenceStrip/,
    message: "fund report charts must expose decision evidence above the trend line."
  },
  {
    pattern: /DEFAULT_MODEL_MAX_OUTPUT_TOKENS\s*=\s*9600/,
    message: "fund manager default output token budget must remain high enough for richer answers."
  },
  {
    pattern: /DEFAULT_REPLY_MAX_CHARS\s*=\s*18000/,
    message: "Feishu reply character budget must not force premature truncation."
  },
  {
    pattern: /MIN_FUND_RECOMMENDATION_OUTPUT_TOKENS\s*=\s*9600/,
    message: "fund recommendation workflow must have enough output budget for evidence, fees, execution tiers, and chart context."
  },
  {
    pattern: /PULLBACK_SETUP_RANK_LIMIT\s*\|\|\s*60/,
    message: "pullback/setup discovery must keep a wide ranking recall pool."
  },
  {
    pattern: /PULLBACK_SETUP_BACKFILL_DIVE_LIMIT\s*\|\|\s*8/,
    message: "pullback/setup discovery must run a second deep-dive batch when the first batch has no qualified main candidate."
  },
  {
    pattern: /FEISHU_REPORT_TREND_IMAGE_LIMIT\s*\|\|\s*5/,
    message: "fund report image defaults should show more than three recommended funds when available."
  },
  {
    pattern: /buildSkillFocusDirective/,
    message: "skill growth must be anchored by a task focus directive before detailed skill bodies."
  },
  {
    pattern: /本次任务焦点：回调完成\/低位启动，不追热点/,
    message: "pullback/setup prompts must keep low-position launch discovery ahead of generic theme skills."
  },
  {
    pattern: /isPullbackSetupRequest\(text\)\s*&&\s*\(hasFundWord\s*\|\|\s*asksRecommendation\)/,
    message: "pullback/setup discovery must route correctly even when the user omits the word 基金."
  },
  {
    pattern: /产品类型焦点：货币基金按现金管理评估/,
    message: "money-market screening must not use equity pullback/chase framing."
  },
  {
    pattern: /产品类型焦点：QDII\/海外基金/,
    message: "QDII screening must account for overseas market, FX, and NAV-lag evidence."
  },
  {
    pattern: /return5dPct[\s\S]{0,120}return10dPct/,
    message: "pullback/setup discovery must expose early 5/10-day turn signals."
  },
  {
    pattern: /lowPositionPct120/,
    message: "pullback/setup discovery must judge whether the fund is actually in a low 120-day position."
  },
  {
    pattern: /dateFallback/,
    message: "fund ranking recall must fall back to latest rankings when a dated window returns empty."
  },
  {
    pattern: /selectWeeklyReversalRankCandidates/,
    message: "pullback/setup discovery must preserve mild one-week low-position reversal candidates."
  },
  {
    pattern: /filterFocusedPullbackRankingCandidates/,
    message: "focused pullback/setup requests must filter broad ranking scans to the requested theme."
  },
  {
    pattern: /scorePullbackThemeRotation/,
    message: "pullback/setup deep-dive ranking must incorporate sector rotation, low-position, and crowding evidence."
  },
  {
    pattern: /hasHighChaseTheme/,
    message: "pullback/setup main candidates must reject crowded or high-chase-risk themes."
  },
  {
    pattern: /hasQualifiedPullbackMainCandidate/,
    message: "pullback/setup discovery must detect whether first-pass deep dives produced any qualified main candidate."
  },
  {
    pattern: /mergeCandidateFundRecord/,
    message: "candidate recall must merge return evidence from multiple discovery sources, not just keywords."
  },
  {
    pattern: /missing_pullback_timing_evidence/,
    message: "pullback/setup recommendations must include numeric timing and low-position evidence."
  },
  {
    pattern: /missing_pullback_three_tier_execution/,
    message: "pullback/setup recommendations must include aggressive/balanced/conservative execution tiers."
  },
  {
    pattern: /missing_pullback_share_class_fee/,
    message: "pullback/setup recommendations must include share-class and fee evidence per candidate."
  },
  {
    pattern: /watch_candidate_given_buy_execution/,
    message: "watch/reject pullback candidates must not receive buy amounts in execution plans."
  },
  {
    pattern: /resolveFundMentionsFromText/,
    message: "text-only fund screening must resolve fund names into codes before enrichment."
  },
  {
    pattern: /Data_sevenDaysYearIncome/,
    message: "money-market funds must parse seven-day annualized yield from public data."
  }
];

const failures = [
  ...forbiddenPatterns
  .filter((item) => item.pattern.test(server))
  .map((item) => item.message),
  ...requiredPatterns
    .filter((item) => !item.pattern.test(server))
    .map((item) => item.message)
];

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
