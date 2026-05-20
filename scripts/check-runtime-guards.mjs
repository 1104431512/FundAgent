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
    pattern: /PULLBACK_SETUP_LOW_BASE_LIMIT\s*\|\|\s*96/,
    message: "pullback/setup discovery must keep a broad low-base launch-eve recall pool."
  },
  {
    pattern: /PULLBACK_SETUP_KEYWORD_LIMIT\s*\|\|\s*32/,
    message: "pullback/setup discovery must keep a broad default keyword pool so low-position rotation themes are not missed."
  },
  {
    pattern: /中证2000[\s\S]{0,200}科创100[\s\S]{0,200}央企[\s\S]{0,200}国企/,
    message: "pullback/setup default search keywords must include small-cap and state-owned rotation exposures."
  },
  {
    pattern: /有色金属[\s\S]{0,160}电力[\s\S]{0,160}公用事业/,
    message: "pullback/setup default search keywords must include cyclical and defensive low-position rotation exposures."
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
    pattern: /FEISHU_REPORT_TREND_IMAGE_LIMIT\s*\|\|\s*12/,
    message: "fund report image defaults should show a broad buy and backup chart set when available."
  },
  {
    pattern: /DEFAULT_FUND_REPORT_IMAGE_MIN\s*=\s*10/,
    message: "fund report image defaults should target a richer chart set than two or three images."
  },
  {
    pattern: /getFundReportChartLimit[\s\S]{0,220}Math\.max\(DEFAULT_FUND_REPORT_IMAGE_MIN,\s*configured\)/,
    message: "fund report image limit must not be lowered to two or three charts by runtime config."
  },
  {
    pattern: /FEISHU_REPORT_TREND_IMAGE_MIN/,
    message: "fund report image count should be configurable without lowering the default rich chart set."
  },
  {
    pattern: /hasFundReportChartSeries[\s\S]{0,700}selectFundReportProfilesForAnswer/,
    message: "fund report image selection must only count candidates that can actually render chart images."
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
    pattern: /insufficient_chart_linked_candidates/,
    message: "fund answer quality gate must reject sparse answers that only support two or three charts when more qualified candidates exist."
  },
  {
    pattern: /appendFundReportChartReadingGuide/,
    message: "fund answers with attached report images must include a text guide that ties each chart to buy or backup reasoning."
  },
  {
    pattern: /本次配图共/,
    message: "fund chart reading guides must summarize how many charts support buy and backup reasoning."
  },
  {
    pattern: /用来确认是否适合分批买入[\s\S]{0,120}用来观察是否能从备选转入买点/,
    message: "fund chart reading guides must explain how each chart supports buy or backup decisions."
  },
  {
    pattern: /配图阅读/,
    message: "fund answers must tell users how to read the attached buy/reference and backup charts."
  },
  {
    pattern: /DEFAULT_FEISHU_CARD_IMAGE_CHUNK_SIZE\s*=\s*4/,
    message: "fund report image cards should be split into readable chunks instead of crowding one card."
  },
  {
    pattern: /splitFeishuCardImages/,
    message: "fund report images must be sent in supplemental chunks when the visual set is large."
  },
  {
    pattern: /buildFeishuImageSupplementText/,
    message: "supplemental fund image cards must explain which buy or backup charts they contain."
  },
  {
    pattern: /preferPullbackSetup\s*\?\s*24\s*:\s*precious\s*\?\s*10\s*:\s*options\.forRecommendation\s*\?\s*14\s*:\s*10/,
    message: "market deep dive defaults must fetch enough candidates to support a broad chart set."
  },
  {
    pattern: /normalizePortfolioWatchlist/,
    message: "virtual fund manager must persist a self-selected fund watchlist instead of only ad hoc weekly text."
  },
  {
    pattern: /consolidatePortfolioWatchlistAlternatives/,
    message: "portfolio watchlist must consolidate duplicate share classes and same-exposure alternatives."
  },
  {
    pattern: /alternativeShareClasses/,
    message: "portfolio watchlist must preserve same-fund A/C alternatives instead of losing them during consolidation."
  },
  {
    pattern: /sameExposureAlternatives/,
    message: "portfolio watchlist must preserve same-index or same-theme alternatives without cluttering the main queue."
  },
  {
    pattern: /watchlist_exposure_consolidation/,
    message: "portfolio watchlist exposure consolidation must leave traceable evidence."
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
    pattern: /source:\s*"fund_screening_answer"/,
    message: "specific fund screening answers must persist eligible analyzed funds into the manager watchlist."
  },
  {
    pattern: /selectFundScreeningWatchlistProfiles/,
    message: "fund screening answers must select analyzed profiles for watchlist persistence."
  },
  {
    pattern: /isAnswerWatchlistRejectedContext/,
    message: "answer-derived watchlist updates must not turn explicitly rejected funds into ready buys."
  },
  {
    pattern: /source === "fund_screening_answer"[\s\S]{0,120}具体基金分析/,
    message: "screening-derived watchlist candidates must explain their screening-answer origin."
  },
  {
    pattern: /沉淀：本次回答/,
    message: "answer-derived watchlist entries must explain why the manager kept the candidate."
  },
  {
    pattern: /formatAnswerWatchlistGapEvidence/,
    message: "answer-derived watchlist entries must preserve setup gaps in the self-selected fund pool."
  },
  {
    pattern: /观察缺口：/,
    message: "answer-derived watchlist reasons must explain whether candidates are ready, backup-only, or blocked by setup gaps."
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
    pattern: /getFundWorkflowWatchlistContext/,
    message: "fund recommendation and QA workflows must reuse the manager's self-selected fund pool as evidence."
  },
  {
    pattern: /mergeFundWorkflowWatchlistIntoDeepDive/,
    message: "fund workflow watchlist candidates must be visible to deep-dive quality gates."
  },
  {
    pattern: /isFundWorkflowWatchlistFreshEnough/,
    message: "fund recommendation and QA workflows must not reuse stale ready/waiting watchlist snapshots."
  },
  {
    pattern: /isFundWorkflowWatchlistFreshEnough[\s\S]{0,500}evaluatePortfolioWatchlistFreshness/,
    message: "fund workflow watchlist reuse must apply the same snapshot freshness guard as portfolio decisions."
  },
  {
    pattern: /经理自选候选池（优先复核，不自动买入）/,
    message: "fund workflow prompts must expose self-selected candidates without implying automatic buys."
  },
  {
    pattern: /portfolioWatchlist/,
    message: "fund answer quality evidence must carry manager watchlist context."
  },
  {
    pattern: /buildPortfolioWatchlistRecheckUpdates/,
    message: "daily portfolio decisions must recheck existing ready/waiting watchlist candidates with fresh NAV evidence."
  },
  {
    pattern: /decision_watchlist_recheck/,
    message: "daily watchlist rechecks must leave a traceable source in the candidate ledger."
  },
  {
    pattern: /evaluatePortfolioWatchlistFreshness/,
    message: "portfolio watchlist readiness must account for stale NAV snapshots and stale reviews."
  },
  {
    pattern: /watchlist_freshness_guard/,
    message: "portfolio watchlist freshness downgrades must leave a traceable source."
  },
  {
    pattern: /系统时效复核/,
    message: "daily watchlist rechecks must explain freshness downgrades in user-readable Chinese."
  },
  {
    pattern: /净值快照已过期/,
    message: "watchlist readiness gaps must expose expired NAV evidence before buying."
  },
  {
    pattern: /buildPortfolioDecisionReadinessQueue/,
    message: "daily portfolio decisions must expose a ready/waiting buy-preparation queue to the model."
  },
  {
    pattern: /evaluatePortfolioWatchReadiness/,
    message: "portfolio watchlist must compute deterministic buy-preparation readiness instead of relying only on status labels."
  },
  {
    pattern: /readinessScore[\s\S]{0,120}readinessLabel/,
    message: "portfolio watchlist readiness scores and readable labels must be exposed to prompts, status answers, and UI."
  },
  {
    pattern: /准备度/,
    message: "portfolio watchlist readiness must be shown in user-readable Chinese."
  },
  {
    pattern: /watchlist-readiness/,
    message: "admin watchlist UI must show buy-preparation readiness on candidate cards."
  },
  {
    pattern: /ensurePortfolioReadyWatchlistReviewed/,
    message: "daily portfolio decisions must add a fallback review action when ready watchlist candidates are omitted."
  },
  {
    pattern: /buildPortfolioHeldPositionReviewQueue/,
    message: "daily portfolio decisions must expose existing holdings as a mandatory review queue."
  },
  {
    pattern: /ensurePortfolioHeldPositionsReviewed/,
    message: "daily portfolio decisions must add a fallback review action when existing holdings are omitted."
  },
  {
    pattern: /held_position_review_fallback/,
    message: "held-position fallback actions must be traceable and not look like model-written trades."
  },
  {
    pattern: /ready_watchlist_review_fallback/,
    message: "ready watchlist fallback actions must be traceable and not look like model-written buys."
  },
  {
    pattern: /已用净值下钻验证/,
    message: "portfolio watchlist ready seeds must explicitly prove NAV trend verification passed."
  },
  {
    pattern: /function inferPortfolioWatchStatusFromSeedCandidate[\s\S]{0,900}hasVerifiedPortfolioBuySetup/,
    message: "portfolio watchlist seed status must require the shared verified buy setup gate."
  },
  {
    pattern: /function hasVerifiedPortfolioBuySetup[\s\S]{0,700}hasPullbackLowPositionEvidence/,
    message: "portfolio verified buy setup must require low-position pullback evidence."
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
    pattern: /enforcePortfolioBuyDiscipline/,
    message: "portfolio BUY execution must be blocked before virtual orders when NAV/trend/chase discipline fails."
  },
  {
    pattern: /evaluatePortfolioBuyDiscipline/,
    message: "portfolio BUY execution discipline must remain directly testable."
  },
  {
    pattern: /hasVerifiedPortfolioBuySetup/,
    message: "portfolio BUY execution must require verified pullback/launch and low-position setup evidence, not merely absence of chase risk."
  },
  {
    pattern: /hasVerifiedPortfolioBuySetup[\s\S]{0,500}isEarlyTurnSetupTrend/,
    message: "portfolio BUY execution must require 5/10-day early-turn evidence before virtual subscription."
  },
  {
    pattern: /hasVerifiedPortfolioFeeEvidence/,
    message: "portfolio BUY execution must require verified share-class and fee evidence before virtual subscription."
  },
  {
    pattern: /evaluatePortfolioBuyExposureDiscipline/,
    message: "portfolio BUY execution must block duplicate same-index or same-theme exposure before virtual subscription."
  },
  {
    pattern: /findPortfolioSameExposurePositions/,
    message: "portfolio BUY exposure discipline must inspect existing same-exposure holdings."
  },
  {
    pattern: /PORTFOLIO_BUY_MAX_SAME_EXPOSURE_WEIGHT_PCT/,
    message: "portfolio BUY sizing must cap aggregate same-index or same-theme exposure."
  },
  {
    pattern: /同一指数\/同主题/,
    message: "portfolio BUY exposure guard must explain duplicate exposure blocks in user-readable Chinese."
  },
  {
    pattern: /缺少可验证费用\/份额证据/,
    message: "portfolio BUY guard must explain when share-class fee evidence is missing."
  },
  {
    pattern: /缺少回调完成\/启动前夜、5日\/10日刚转强和低位证据/,
    message: "portfolio BUY guard must explain when low-position launch or early-turn evidence is missing."
  },
  {
    pattern: /还差5日\/10日刚转强证据/,
    message: "watchlist readiness gaps must expose missing early-turn evidence before buying."
  },
  {
    pattern: /portfolio_buy_discipline_guard/,
    message: "portfolio BUY guard must leave traceable evidence when it blocks model-written buys."
  },
  {
    pattern: /capPortfolioBuyAmountByDiscipline/,
    message: "portfolio BUY sizing must apply system-level staged-entry caps before creating orders."
  },
  {
    pattern: /PORTFOLIO_BUY_MAX_SINGLE_ORDER_WEIGHT_PCT/,
    message: "portfolio BUY sizing must cap each order as a configurable percentage of total assets."
  },
  {
    pattern: /PORTFOLIO_BUY_MAX_SINGLE_FUND_WEIGHT_PCT/,
    message: "portfolio BUY sizing must cap single-fund exposure after a buy."
  },
  {
    pattern: /PORTFOLIO_BUY_MIN_CASH_RESERVE_PCT/,
    message: "portfolio BUY sizing must preserve a configurable cash reserve."
  },
  {
    pattern: /系统买入纪律拦截/,
    message: "portfolio BUY guard must explain blocked buys in user-readable Chinese."
  },
  {
    pattern: /enforcePortfolioSellDiscipline/,
    message: "portfolio SELL execution must be blocked before virtual orders when risk/profit-control evidence is missing."
  },
  {
    pattern: /evaluatePortfolioSellDiscipline/,
    message: "portfolio SELL execution discipline must remain directly testable."
  },
  {
    pattern: /缺少破位、转弱、回撤扩大或止盈证据/,
    message: "portfolio SELL guard must explain when sell evidence is missing."
  },
  {
    pattern: /portfolio_sell_discipline_guard/,
    message: "portfolio SELL guard must leave traceable evidence when it blocks or confirms model-written sells."
  },
  {
    pattern: /capPortfolioSellAmountByDiscipline/,
    message: "portfolio SELL sizing must apply system-level staged-redemption caps before creating orders."
  },
  {
    pattern: /PORTFOLIO_SELL_MAX_POSITION_PCT/,
    message: "portfolio SELL sizing must cap normal redemptions as a configurable percentage of the current holding."
  },
  {
    pattern: /PORTFOLIO_SELL_SEVERE_MAX_POSITION_PCT/,
    message: "portfolio SELL sizing must still stage severe-risk redemptions instead of blindly liquidating."
  },
  {
    pattern: /系统卖出纪律拦截/,
    message: "portfolio SELL guard must explain blocked sells in user-readable Chinese."
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
    pattern: /renderWatchlistActionQueue/,
    message: "admin portfolio watchlist must surface a buy-preparation queue above the detailed pool."
  },
  {
    pattern: /renderWatchlistSetupFocus/,
    message: "admin portfolio watchlist must surface low-base launch-eve candidates before the general buy-preparation queue."
  },
  {
    pattern: /isWatchlistLaunchEveCandidate/,
    message: "admin portfolio watchlist must recognize launch-eve candidates from persisted watchlist evidence."
  },
  {
    pattern: /启动前夜重点复核/,
    message: "admin portfolio watchlist must label launch-eve candidates as review focus, not automatic buys."
  },
  {
    pattern: /watchlist-setup-badge/,
    message: "admin portfolio watchlist must visually distinguish launch-eve setup candidates."
  },
  {
    pattern: /watchlist-action-card/,
    message: "admin portfolio watchlist must render actionable ready/waiting candidates as scannable cards."
  },
  {
    pattern: /selectWatchlistObservationGaps/,
    message: "admin portfolio watchlist must extract observation/setup gaps as first-class UI data."
  },
  {
    pattern: /watchlist-gap-panel/,
    message: "admin portfolio watchlist must show observation gaps prominently on candidate rows."
  },
  {
    pattern: /watchlist-gap-line/,
    message: "admin buy-preparation queue must highlight the primary missing setup condition."
  },
  {
    pattern: /购买准备队列/,
    message: "manager-facing watchlist replies and admin UI must expose a Chinese buy-preparation queue."
  },
  {
    pattern: /buildPortfolioWatchlistActionQueueLines/,
    message: "portfolio status replies must summarize ready and waiting candidates as a buy-preparation queue."
  },
  {
    pattern: /buildPortfolioWatchlistLaunchEveLines/,
    message: "portfolio status replies must surface launch-eve watchlist candidates before the general buy-preparation queue."
  },
  {
    pattern: /启动前夜重点复核/,
    message: "manager-facing watchlist replies must label launch-eve candidates as review focus."
  },
  {
    pattern: /不自动买入/,
    message: "launch-eve watchlist focus must not sound like an automatic buy instruction."
  },
  {
    pattern: /buildPortfolioWatchReadinessGaps/,
    message: "portfolio watchlist must expose the remaining buy-readiness gaps for ready/waiting candidates."
  },
  {
    pattern: /readinessGaps/,
    message: "portfolio watchlist API/model payloads must carry buy-readiness gap details."
  },
  {
    pattern: /买入缺口/,
    message: "manager-facing and admin-facing watchlist views must show what is still missing before buying."
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
    pattern: /替代份额[\s\S]{0,120}同类替代/,
    message: "admin portfolio watchlist must display consolidated share-class and same-exposure alternatives."
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
    pattern: /回调到位[\s\S]{0,260}刚拐头[\s\S]{0,260}筑底/,
    message: "pullback/setup routing must recognize launch-eve natural language such as 回调到位, 筑底, and 刚拐头."
  },
  {
    pattern: /isPullbackSetupDiscoveryAsk/,
    message: "pullback/setup routing must allow discovery verbs only after a setup intent is detected."
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
    pattern: /isPullbackSetupRequest\(text\)\s*&&\s*\(hasFundWord\s*\|\|\s*asksRecommendation\s*\|\|\s*isPullbackSetupDiscoveryAsk\(text\)\)/,
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
    pattern: /classifyPullbackSetupCandidateForSummary[\s\S]{0,500}isEarlyTurnSetupTrend/,
    message: "pullback/setup main candidates must require 5/10-day early-turn evidence, not only low-position repair."
  },
  {
    pattern: /scoreResearchDigestForPullbackSetup[\s\S]{0,900}!earlyTurn[\s\S]{0,80}score\s*-=+\s*14/,
    message: "pullback/setup ranking must downgrade low-position funds that have not started turning up."
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
    pattern: /selectLowBaseTurnRankCandidates/,
    message: "pullback/setup discovery must preserve low-base launch-eve candidates that are not weekly chases."
  },
  {
    pattern: /低位启动前夜候选/,
    message: "pullback/setup discovery must tag low-base launch-eve candidates for ranking and watchlist persistence."
  },
  {
    pattern: /isLowBaseLaunchWatchSeed/,
    message: "portfolio watchlist persistence must recognize low-base launch-eve candidates explicitly."
  },
  {
    pattern: /启动前夜观察池/,
    message: "low-base launch-eve watchlist seeds must stay in a pre-buy observation plan until NAV verification confirms the setup."
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
    pattern: /formatPullbackSetupCandidateGaps/,
    message: "pullback/setup summaries must explain exactly what observation candidates still lack."
  },
  {
    pattern: /还差：\$\{gaps\}/,
    message: "no-main pullback fallback answers must expose missing setup, low-position, and overheat conditions."
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
