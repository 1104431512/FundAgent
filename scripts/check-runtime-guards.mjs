import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "src", "server.mjs"), "utf8");
const admin = fs.readFileSync(path.join(root, "public", "admin.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "public", "admin.html"), "utf8");
const allSource = [server, admin, adminHtml].join("\n");

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
  },
  {
    pattern: /drawText\([^;\n]*,\s*1\)/,
    message: "fund report charts must not use scale-1 bitmap text because Feishu thumbnails make it look like QR noise."
  },
  {
    pattern: /buildPortfolioWatchlistUpdatesFromSeedCandidates\(watchlistSeedCandidates\)/,
    message: "portfolio watchlist seed updates must receive enriched seedProfiles before assigning watch status."
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
    pattern: /function renderFundReportSummaryPng\(\{\s*profile,\s*width\s*=\s*1280,\s*height\s*=\s*760\s*\}\s*=\s*\{\}\)/,
    message: "fund report chart defaults must remain large enough for dense evidence cards."
  },
  {
    pattern: /REPORT_CHART_MIN_TEXT_SCALE\s*=\s*3/,
    message: "fund report chart text must stay thumbnail-readable instead of falling back to tiny bitmap blocks."
  },
  {
    pattern: /showAxisLabels:\s*false/,
    message: "fund report chart thumbnails must hide dense axis tick text that looks like QR noise."
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
    pattern: /drawTextFit/,
    message: "fund report charts must fit large labels instead of shrinking them into unreadable bitmap text."
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
    pattern: /MIN_FUND_ANALYST_OUTPUT_TOKENS\s*=\s*7200/,
    message: "fund analyst review must have enough output budget to preserve the full multi-skill evidence chain."
  },
  {
    pattern: /MIN_FUND_COMMITTEE_OUTPUT_TOKENS\s*=\s*6400/,
    message: "fund committee voting must have enough output budget for bull/bear/risk sizing before final synthesis."
  },
  {
    pattern: /MIN_FUND_EXTRACTION_OUTPUT_TOKENS\s*=\s*1800/,
    message: "fund screenshot extraction must not be constrained by the old tiny JSON output cap."
  },
  {
    pattern: /buildAnalystReviewWithModel[\s\S]{0,1600}getFundWorkflowMaxOutputTokens\(MIN_FUND_ANALYST_OUTPUT_TOKENS\)/,
    message: "fund analyst review must respect the shared high-budget workflow floor instead of a fixed low cap."
  },
  {
    pattern: /buildCommitteeVoteWithModel[\s\S]{0,1600}getFundWorkflowMaxOutputTokens\(MIN_FUND_COMMITTEE_OUTPUT_TOKENS\)/,
    message: "fund committee vote must respect the shared high-budget workflow floor instead of a fixed low cap."
  },
  {
    pattern: /modelMaxOutputTokens\s*=\s*Number\(payload\.modelMaxOutputTokens\s*\|\|\s*9600\)/,
    message: "admin config must not silently save the obsolete 4800-token model cap."
  },
  {
    pattern: /replyMaxChars\s*=\s*Number\(payload\.replyMaxChars\s*\|\|\s*18000\)/,
    message: "admin config must not silently save the obsolete 9000-character reply cap."
  },
  {
    pattern: /name="modelMaxOutputTokens"[\s\S]{0,80}max="32000"/,
    message: "admin config UI must allow larger model output budgets for richer fund workflows."
  },
  {
    pattern: /name="replyMaxChars"[\s\S]{0,80}max="30000"/,
    message: "admin config UI must allow longer fund answers when the evidence and charts need context."
  },
  {
    pattern: /PULLBACK_SETUP_RANK_LIMIT\s*\|\|\s*60/,
    message: "pullback/setup discovery must keep a wide ranking recall pool."
  },
  {
    pattern: /PULLBACK_SETUP_WEEKLY_RANK_LIMIT\s*\|\|\s*160/,
    message: "pullback/setup discovery must directly scan one-week ranking candidates instead of only inheriting weekly evidence from monthly/quarterly lists."
  },
  {
    pattern: /metric:\s*"zzf"[\s\S]{0,80}近1周转强候选/,
    message: "pullback/setup discovery must include the Eastmoney one-week ranking metric for early-turn recall."
  },
  {
    pattern: /PULLBACK_SETUP_BACKFILL_DIVE_LIMIT\s*\|\|\s*8/,
    message: "pullback/setup discovery must run a second deep-dive batch when the first batch has no qualified main candidate."
  },
  {
    pattern: /PULLBACK_SETUP_BACKFILL_ROUNDS\s*\|\|\s*3/,
    message: "pullback/setup discovery must keep backfilling for multiple rounds before giving up."
  },
  {
    pattern: /selectPullbackBackfillCandidates/,
    message: "pullback/setup backfill must exclude already tested products while continuing the search."
  },
  {
    pattern: /FEISHU_REPORT_TREND_IMAGE_LIMIT\s*\|\|\s*8/,
    message: "fund report image defaults should show buy and backup candidates when available."
  },
  {
    pattern: /extractAnswerChartEvidenceSections/,
    message: "fund report images must select from both recommendation and qualified backup/watch sections."
  },
  {
    pattern: /scoreBackupChartContext/,
    message: "fund report image selection must score qualified backup/watch candidates instead of only main buys."
  },
  {
    pattern: /备选观察图/,
    message: "fund report images must label backup/watch charts so users understand why they are shown."
  },
  {
    pattern: /normalizePortfolioWatchlist/,
    message: "virtual fund manager must persist a self-selected fund watchlist instead of only ad hoc weekly text."
  },
  {
    pattern: /watchlistUpdates/,
    message: "portfolio decision/premarket/weekly model outputs must be able to update the self-selected fund pool."
  },
  {
    pattern: /persistAnswerWatchlistCandidates/,
    message: "fund recommendation and QA answers must persist eligible chart candidates into the manager watchlist."
  },
  {
    pattern: /buildPortfolioWatchlistUpdatesFromAnswerProfiles/,
    message: "answer-derived buy and backup chart candidates must be converted into detailed watchlist updates."
  },
  {
    pattern: /source:\s*"fund_recommendation_answer"/,
    message: "fund recommendation answers must mark self-selected candidates with a traceable recommendation-answer source."
  },
  {
    pattern: /source:\s*"fund_qa_answer"/,
    message: "fund QA answers with concrete candidates must mark watchlist entries with a traceable QA-answer source."
  },
  {
    pattern: /用户问答沉淀/,
    message: "answer-derived watchlist entries must explain why the manager kept the candidate."
  },
  {
    pattern: /fetchPortfolioWatchlistSeedCandidates/,
    message: "portfolio manager must deterministically recall low-position pullback candidates into its watchlist instead of waiting only for model-written updates."
  },
  {
    pattern: /deterministic_pullback_recall/,
    message: "portfolio watchlist candidates must preserve traceable deterministic recall evidence."
  },
  {
    pattern: /buildPortfolioWatchlistUpdatesFromSeedCandidates\(watchlistSeedCandidates,\s*\{\s*profiles:\s*seedProfiles\s*\}\)/,
    message: "portfolio watchlist deterministic seeds must be judged with enriched NAV/trend profiles."
  },
  {
    pattern: /已用净值下钻验证/,
    message: "portfolio watchlist ready seeds must explicitly prove NAV trend verification passed."
  },
  {
    pattern: /function inferPortfolioWatchStatusFromSeedCandidate[\s\S]{0,900}hasPullbackLowPositionEvidence/,
    message: "portfolio watchlist seed status must require verified low-position pullback evidence."
  },
  {
    pattern: /hasPortfolioVerifiedSeedChaseRisk/,
    message: "portfolio watchlist seed status must block verified chase-risk candidates."
  },
  {
    pattern: /guardPortfolioWatchlistReadyUpdate/,
    message: "portfolio watchlist write path must downgrade model-written ready candidates without NAV verification."
  },
  {
    pattern: /系统净值验证降级/,
    message: "portfolio watchlist ready downgrade must be visible in the saved reason."
  },
  {
    pattern: /renderWatchlist/,
    message: "admin portfolio page must render the manager's self-selected fund pool."
  },
  {
    pattern: /groupWatchlistItems/,
    message: "admin portfolio watchlist must group candidates by readiness status for fast scanning."
  },
  {
    pattern: /renderWatchlistEvidenceBlock/,
    message: "admin portfolio watchlist must expose evidence blocks, not only fund names."
  },
  {
    pattern: /formatWatchlistSnapshotEvidence/,
    message: "admin portfolio watchlist must show NAV/trend snapshot evidence for candidates."
  },
  {
    pattern: /watchlist-evidence-grid/,
    message: "admin portfolio watchlist must keep detailed backup evidence readable in the UI."
  },
  {
    pattern: /自选基金池/,
    message: "manager-facing and admin-facing portfolio UI must expose the self-selected fund pool in Chinese."
  },
  {
    pattern: /buildPortfolioWatchlistStatusLines/,
    message: "portfolio status replies must group the self-selected fund pool by readiness status."
  },
  {
    pattern: /备选理由：/,
    message: "portfolio status replies must include detailed watchlist backup reasons."
  },
  {
    pattern: /风险边界：/,
    message: "portfolio status replies must include watchlist risk boundaries."
  },
  {
    pattern: /费用\/份额：/,
    message: "portfolio status replies must include watchlist fee/share-class evidence."
  },
  {
    pattern: /最新走势：/,
    message: "portfolio status replies must include watchlist trend evidence."
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
    pattern: /低位刚要启动/,
    message: "pullback/setup routing must recognize natural low-position launch phrasing without the word 基金."
  },
  {
    pattern: /回踩完成/,
    message: "pullback/setup routing must recognize pullback-complete phrasing beyond 回调完成."
  },
  {
    pattern: /specific_pullback_setup_assessment/,
    message: "specific fund-code pullback/setup questions must not degrade into generic fund screening."
  },
  {
    pattern: /text_contains_fund_code_pullback_setup_request/,
    message: "specific fund-code pullback/setup routing must be deterministic and visible."
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
    pattern: /hasPullbackLowPositionEvidence/,
    message: "pullback/setup main candidates must require actual low-position evidence, not only a repaired trend label."
  },
  {
    pattern: /finiteMetricNumber/,
    message: "pullback/setup low-position checks must not treat null or missing metrics as zero."
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
    pattern: /const deterministicFallback = buildPullbackQualityFallbackAnswer[\s\S]{0,420}FUND_ANSWER_QUALITY_REWRITE/,
    message: "severe pullback/setup quality violations must use deterministic fallback before model rewrite."
  },
  {
    pattern: /enforceFundAnswerQuality/,
    message: "fund answer quality enforcement must stay testable for deterministic pullback fallback behavior."
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
    .filter((item) => !item.pattern.test(allSource))
    .map((item) => item.message)
];

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
