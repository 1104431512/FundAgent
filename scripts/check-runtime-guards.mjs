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
  },
  {
    pattern: /相对初始本金/,
    message: "portfolio PnL UI must not use initial capital as the visible percentage denominator."
  },
  {
    pattern: /FUND_REPORT_CHART_LEGEND_LINES[\s\S]{0,900}\b(?:ENTRY|SIG|LOW\/YLOW|BATCH|STAGE|stage)\b/,
    message: "fund chart reading guides must not keep raw legacy English labels in the standard customer-facing legend."
  },
  {
    pattern: /FEISHU_FUND_IMAGE_CARD_LEGEND[\s\S]{0,260}\b(?:BATCH|STAGE|stage)\b/,
    message: "Feishu image card legends must stay Chinese-first and avoid raw STAGE/BATCH labels."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,2600}JSON\.stringify\(heldProfiles \|\| \[\], null, 2\)/,
    message: "portfolio decisions must not send full held profiles with raw NAV series to the model."
  },
  {
    pattern: /function buildPortfolioPremarketWithModel[\s\S]{0,1800}JSON\.stringify\(profiles \|\| \[\], null, 2\)/,
    message: "portfolio premarket reports must not send full holding profiles with raw NAV series to the model."
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
    pattern: /localizedEvaluation[\s\S]{0,260}fundAnswerQualityLocalizationFixes/,
    message: "fund answer quality enforcement must accept deterministic localization fixes before spending a rewrite call."
  },
  {
    pattern: /function appendFundReportChartReadingGuide[\s\S]{0,180}normalizeUserFacingFundAnswer\(text\)/,
    message: "chart-reading finalization must sanitize user-facing fund answers even when no charts are appended."
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
    pattern: /raw_english_section_leak/,
    message: "fund answer quality gate must reject English section headers such as Manager Decision."
  },
  {
    pattern: /missing_market_data_quality_disclosure/,
    message: "fund answer quality gate must reject answers that ignore partial or poor market data quality."
  },
  {
    pattern: /evaluateMarketDataQualityDisclosure[\s\S]{0,900}getEvidenceMarketDataQuality[\s\S]{0,900}降低把握度/,
    message: "fund answer quality gate must require Chinese data-gap disclosure and conviction downgrade."
  },
  {
    pattern: /function evaluateFundAnswerQuality[\s\S]{0,2400}evaluateStaleFundEvidenceActionDiscipline/,
    message: "fund answer quality gate must reject buy language based on stale NAV/trend evidence."
  },
  {
    pattern: /function evaluateStaleFundEvidenceActionDiscipline[\s\S]{0,1400}stale_data_candidate_given_buy_execution[\s\S]{0,600}stale_data_candidate_given_buy_signal/,
    message: "stale evidence quality gate must distinguish stale-data buy execution and buy-signal leaks."
  },
  {
    pattern: /function hasStaleFundEvidence[\s\S]{0,900}系统数据时效降级[\s\S]{0,500}evaluatePullbackTrendFreshness/,
    message: "stale evidence quality gate must reuse structured freshness and actionability blockers."
  },
  {
    pattern: /buildMarketDataQualityDisclosureFallback[\s\S]{0,1400}降低把握度[\s\S]{0,900}数据缺口提示/,
    message: "fund answer quality enforcement must deterministically add data-gap disclosure when the model omits it."
  },
  {
    pattern: /hasRawEnglishFundSectionLeak/,
    message: "fund answer quality gate must detect English committee-style headers separately from action enums."
  },
  {
    pattern: /Manager\\s\+Decision[\s\S]{0,260}经理最终判断/,
    message: "fund answer localization must translate Manager Decision into natural Chinese."
  },
  {
    pattern: /经理最终判断：最终动作/,
    message: "fund screening final prompt must use Chinese manager-decision wording instead of Manager Decision."
  },
  {
    pattern: /买点成本/,
    message: "fund report charts must include a readable buy-point and cost evidence panel."
  },
  {
    pattern: /120日低位[\s\S]{0,140}250日低位/,
    message: "fund report charts must show low-position labels as plain Chinese time-window low-position evidence rather than opaque metric names."
  },
  {
    pattern: /每万成本/,
    message: "fund report charts must label fee evidence as per-10k cost instead of an unexplained numeric metric."
  },
  {
    pattern: /回撤风险[\s\S]{0,1400}阶段收益/,
    message: "fund report charts must use Chinese panel names instead of RISK/RET abbreviations."
  },
  {
    pattern: /250日低位/,
    message: "fund report charts must show longer-window low-position evidence in a compact readable label."
  },
  {
    pattern: /function renderFundReportSummaryPng\(\{\s*profile,\s*width\s*=\s*1280,\s*height\s*=\s*760\s*\}\s*=\s*\{\}\)/,
    message: "fund report chart defaults must remain large enough for dense evidence cards."
  },
  {
    pattern: /function formatChartStringValue[\s\S]{0,520}hasInternalFundSignalLeak\(raw\)[\s\S]{0,220}normalizeUserFacingFundAnswer\(raw\)/,
    message: "fund report chart string values must localize raw internal enums before rendering."
  },
  {
    pattern: /function formatChartMetricValue[\s\S]{0,360}formatChartStringValue\(value,\s*8\)[\s\S]{0,180}formatChartStringValue\(value,\s*8\)/,
    message: "fund report chart metric fallbacks must use Chinese string localization instead of uppercase raw labels."
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
    pattern: /CJK_CHART_FONT/,
    message: "fund report charts must render fixed Chinese labels with readable glyphs instead of unreadable bitmap blocks."
  },
  {
    pattern: /drawDecisionEvidenceStrip/,
    message: "fund report charts must expose decision evidence above the trend line."
  },
  {
    pattern: /drawChartTextFit/,
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
    pattern: /DEFAULT_FUND_REPORT_IMAGE_MIN\s*=\s*12/,
    message: "fund report image defaults should target a richer chart set than two or three images."
  },
  {
    pattern: /DEFAULT_FUND_REPORT_BUY_IMAGE_MIN\s*=\s*6[\s\S]{0,120}DEFAULT_FUND_REPORT_BACKUP_IMAGE_MIN\s*=\s*6/,
    message: "fund report image defaults must reserve enough charts for both buy references and backup candidates."
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
    pattern: /FUND_REPORT_CHART_BACKFILL_DIVE_LIMIT\s*\|\|\s*DEFAULT_FUND_REPORT_CHART_BACKFILL_DIVE_LIMIT/,
    message: "fund report generation must keep backfilling deep-dive candidates when only two or three chartable funds are available."
  },
  {
    pattern: /countEligibleFundReportProfiles\(candidates\)[\s\S]{0,520}selectFundReportChartBackfillCandidates/,
    message: "market deep dives must continue fetching chart-backed candidates until the report image target is reachable."
  },
  {
    pattern: /chartBackfillCodes/,
    message: "market deep dive summaries must expose report-chart backfill codes for debugging sparse image replies."
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
    pattern: /roleCounts[\s\S]{0,240}roleTargets[\s\S]{0,240}备选/,
    message: "fund report image selection must balance buy-reference and backup/watch chart quotas."
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
    pattern: /新图只使用中文短标签/,
    message: "fund chart reading guides must tell users that report images are Chinese-first."
  },
  {
    pattern: /买点=是否到了可买位置[\s\S]{0,260}120日低位\/250日低位=区间低位判断[\s\S]{0,260}规模=基金规模/,
    message: "fund chart reading guides must explain the key entry, low-position, and scale labels."
  },
  {
    pattern: /看不懂指标时先看中文图例/,
    message: "fund chart reading guides must reassure users that opaque indicators are explained in Chinese."
  },
  {
    pattern: /分批买=分几次买入[\s\S]{0,220}旧版英文简称已从新图移除/,
    message: "fund report charts must explain staged buying in Chinese without reintroducing raw STAGE text."
  },
  {
    pattern: /STAGE:\s*"分批买"/,
    message: "fund report charts must translate legacy STAGE values into Chinese if upstream data still contains them."
  },
  {
    pattern: /题材雷达：[\s\S]{0,300}formatThemeRadarEvidenceLine/,
    message: "market evidence summaries must feed Chinese theme-radar labels instead of raw stage/actionBias fields."
  },
  {
    pattern: /buildMarketDataQuality/,
    message: "market snapshots must expose structured data-quality diagnostics instead of only raw errors."
  },
  {
    pattern: /dataQuality:\s*compactMarketDataQuality\(snapshot\.dataQuality\)/,
    message: "summarized market snapshots must preserve data quality for prompts, reports, and admin debugging."
  },
  {
    pattern: /市场数据部分缺失[\s\S]{0,180}降低把握度/,
    message: "market data quality notes must explain partial source failures in natural Chinese."
  },
  {
    pattern: /必须检查 marketSnapshot\.dataQuality[\s\S]{0,220}数据缺口[\s\S]{0,220}降低把握度/,
    message: "fund and portfolio prompts must force data-gap disclosure when public sources are partial or poor."
  },
  {
    pattern: /function compactMarketSnapshotForModel[\s\S]{0,1400}compactMarketFundCandidates[\s\S]{0,900}errors/,
    message: "model prompts must use a compact market snapshot that preserves key evidence without raw payload bloat."
  },
  {
    pattern: /function recommendFundsWithModel[\s\S]{0,1800}marketSnapshotForModel = compactMarketSnapshotForModel\(marketSnapshot\)[\s\S]{0,2600}JSON\.stringify\(marketSnapshotForModel \|\| \{\}, null, 2\)/,
    message: "fund recommendation prompts must send compact market snapshots instead of full raw snapshots."
  },
  {
    pattern: /function answerFundQuestionWithModel[\s\S]{0,1800}marketSnapshotForModel = compactMarketSnapshotForModel\(marketSnapshot\)[\s\S]{0,2600}JSON\.stringify\(marketSnapshotForModel, null, 2\)/,
    message: "fund QA prompts must send compact market snapshots instead of full raw snapshots."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,3600}JSON\.stringify\(compactMarketSnapshotForModel\(marketSnapshot\), null, 2\)/,
    message: "portfolio decisions must use compact market snapshots to avoid model context-window failures."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,1800}compactHeldProfiles = \(heldProfiles \|\| \[\]\)\.map\(compactPortfolioReviewProfile\)[\s\S]{0,2600}JSON\.stringify\(compactHeldProfiles, null, 2\)/,
    message: "portfolio decisions must compact held fund profiles before model prompts."
  },
  {
    pattern: /function buildPortfolioPremarketWithModel[\s\S]{0,1200}compactProfiles = \(profiles \|\| \[\]\)\.map\(compactPortfolioReviewProfile\)[\s\S]{0,1800}JSON\.stringify\(compactProfiles, null, 2\)/,
    message: "portfolio premarket reports must compact holding fund profiles before model prompts."
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
    pattern: /drawFundReportLegendPanel/,
    message: "fund report summary images must include an in-image Chinese legend instead of relying only on surrounding text."
  },
  {
    pattern: /图例说明[\s\S]{0,160}买点=可买\/分批买\/等待\/回避\/观察/,
    message: "fund report images must explain buy-point states directly in Chinese."
  },
  {
    pattern: /越低越接近低位[\s\S]{0,120}越高越接近高位/,
    message: "fund report images must explain 120/250-day position metrics in plain Chinese."
  },
  {
    pattern: /分批=不一次买完/,
    message: "fund report images must explain staged buying without exposing STAGE."
  },
  {
    pattern: /DEFAULT_FEISHU_CARD_IMAGE_CHUNK_SIZE\s*=\s*4/,
    message: "fund report image cards should be split into readable chunks instead of crowding one card."
  },
  {
    pattern: /DEFAULT_PORTFOLIO_REPORT_IMAGE_MIN\s*=\s*8/,
    message: "portfolio manager visual reports must not default back to two or three charts."
  },
  {
    pattern: /getPortfolioTrendImageLimit[\s\S]{0,220}Math\.max\(DEFAULT_PORTFOLIO_REPORT_IMAGE_MIN,\s*configured\)/,
    message: "portfolio trend image runtime config must not lower manager reports to sparse two-or-three-chart output."
  },
  {
    pattern: /buildPortfolioStatusCardImages/,
    message: "portfolio status conversations must attach chart evidence instead of text-only status replies."
  },
  {
    pattern: /watchlistUpdates[\s\S]{0,260}买入准备图[\s\S]{0,260}备选观察图/,
    message: "portfolio chart selection must include ready buy-preparation and backup watchlist candidates."
  },
  {
    pattern: /buildPortfolioTrendCardImages[\s\S]{0,520}renderFundReportSummaryPng/,
    message: "portfolio manager images must use dense report cards rather than simple line charts."
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
    pattern: /FEISHU_FUND_IMAGE_CARD_LEGEND[\s\S]{0,300}图上中文短标签[\s\S]{0,260}分批=分几次买入[\s\S]{0,120}新图不再显示英文简称/,
    message: "fund image cards must show a Chinese legend next to report images, not only in the main text body."
  },
  {
    pattern: /buildFeishuImageCaption[\s\S]{0,700}先看“买点\/动作”判断能否买[\s\S]{0,320}“每万成本\/回撤\/规模”控制成本和风险/,
    message: "fund image captions must tell users how to read buy, low-position, fee, drawdown, and scale evidence."
  },
  {
    pattern: /fundReportChart:\s*true/,
    message: "generated fund report images must be tagged so Feishu cards can attach Chinese chart legends."
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
    pattern: /selectFundWorkflowStaleWatchlistRefreshCandidates/,
    message: "fund recommendation and QA workflows should attempt to refresh stale self-selected candidates before excluding them."
  },
  {
    pattern: /getFundWorkflowWatchlistContext[\s\S]{0,1200}enrichFunds/,
    message: "fund workflow watchlist context must refresh stale watchlist candidates through enrichment."
  },
  {
    pattern: /fund_workflow_watchlist_refresh/,
    message: "fund workflow watchlist refreshes must be traceable in the candidate ledger."
  },
  {
    pattern: /经理自选候选池（优先复核，不自动买入）/,
    message: "fund workflow prompts must expose self-selected candidates without implying automatic buys."
  },
  {
    pattern: /替代份额=/,
    message: "fund workflow watchlist prompts must expose alternative share classes for A/C fee comparison."
  },
  {
    pattern: /同类替代=/,
    message: "fund workflow watchlist prompts must expose same-exposure alternatives without cluttering main picks."
  },
  {
    pattern: /alternativeShareClasses[\s\S]{0,160}sameExposureAlternatives/,
    message: "fund workflow watchlist deep-dive evidence must preserve share-class and same-exposure alternatives."
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
    pattern: /基金规模[\s\S]{0,80}不能作为可直接买入候选/,
    message: "portfolio watchlist readiness must downgrade tiny funds before they are labeled buy-ready."
  },
  {
    pattern: /前十大集中度[\s\S]{0,80}只能观察或小仓复核/,
    message: "portfolio watchlist readiness must downgrade high-concentration funds before they are labeled buy-ready."
  },
  {
    pattern: /watchlist_readiness_guard/,
    message: "portfolio watchlist structural readiness downgrades must leave a traceable source."
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
    pattern: /account\.investedCost[\s\S]{0,900}account\.cumulativePnlPct[\s\S]{0,220}account\.investedCost/,
    message: "portfolio PnL percentage must use actual invested cost instead of initial capital."
  },
  {
    pattern: /按实际投入/,
    message: "admin portfolio UI must label PnL percentage as based on actual invested amount."
  },
  {
    pattern: /normalizePortfolioInvestedCostReturnText[\s\S]{0,700}按实际投入成本[\s\S]{0,700}初始资金口径/,
    message: "portfolio valuation text must rewrite initial-capital denominator wording to actual invested-cost wording."
  },
  {
    pattern: /normalizePortfolioReview\(raw,\s*options\s*=\s*\{\}\)[\s\S]{0,900}normalizePortfolioInvestedCostReturnText/,
    message: "portfolio valuation review normalization must sanitize summary/reason/watch notes before showing them to users."
  },
  {
    pattern: /function summarizePortfolioOrder[\s\S]{0,900}navQuality[\s\S]{0,220}navSource/,
    message: "confirmed portfolio orders must expose verified NAV, units, NAV date, and source in the public API."
  },
  {
    pattern: /function formatOrderNavLine[\s\S]{0,700}确认净值[\s\S]{0,180}份额/,
    message: "admin order rows must show confirmed NAV and units so orders and transaction ledger are not disconnected."
  },
  {
    pattern: /renderPortfolioDashboard[\s\S]{0,5000}portfolioManagerSummary[\s\S]{0,5000}portfolioHoldingSummary[\s\S]{0,5000}portfolioReadinessSummary/,
    message: "admin portfolio UI must provide a manager dashboard with summary, holdings exposure, and buy-preparation panels."
  },
  {
    pattern: /holding-strip/,
    message: "admin portfolio UI must expose top holdings as readable chips on positions and watchlist candidates."
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
    pattern: /shouldReduceHeldPositionFromReview[\s\S]{0,900}return20d[\s\S]{0,260}return60d/,
    message: "omitted held positions with verified hot/chase risk must be eligible for deterministic staged reduction."
  },
  {
    pattern: /buildPortfolioHeldPositionReviewActions[\s\S]{0,1400}evaluatePortfolioSellDiscipline[\s\S]{0,900}系统补充分批减仓动作/,
    message: "held-position fallback reductions must pass the sell-discipline guard before creating SELL actions."
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
    pattern: /buildPortfolioExposureSummary/,
    message: "portfolio manager must compute portfolio-level look-through exposure and overlap diagnostics."
  },
  {
    pattern: /组合穿透暴露诊断/,
    message: "portfolio decision prompts must force model review of theme and underlying holding concentration."
  },
  {
    pattern: /exposureSummary/,
    message: "portfolio API must expose look-through exposure diagnostics for the admin UI."
  },
  {
    pattern: /同题材暴露[\s\S]{0,600}底层重叠/,
    message: "admin portfolio holdings summary must display same-theme exposure and repeated underlying holdings."
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
    pattern: /buildPortfolioAccountRiskBudget/,
    message: "portfolio manager must compute account-level drawdown budget state."
  },
  {
    pattern: /PORTFOLIO_MAX_ACCOUNT_DRAWDOWN_PCT/,
    message: "portfolio account drawdown budget must be configurable."
  },
  {
    pattern: /portfolio_account_drawdown_guard/,
    message: "portfolio BUY guard must leave traceable evidence when account drawdown blocks new buys."
  },
  {
    pattern: /enforcePortfolioRiskBudget/,
    message: "portfolio manager must deterministically override model actions when drawdown risk breaches."
  },
  {
    pattern: /buildPortfolioPositionRiskBudget/,
    message: "portfolio manager must compute single-position stop-loss and profit-giveback risk."
  },
  {
    pattern: /PORTFOLIO_POSITION_STOP_LOSS_PCT/,
    message: "single-position stop-loss budget must be configurable."
  },
  {
    pattern: /PORTFOLIO_PROFIT_GIVEBACK_PCT/,
    message: "profit giveback protection must be configurable."
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
    pattern: /portfolio_sell_last_confirmed_nav_guard/,
    message: "portfolio SELL guard must allow verified held-position risk reduction with last-confirmed NAV fallback."
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
    pattern: /function compactPortfolioReviewProfile[\s\S]{0,260}topHoldings = \(profile\.holdings\?\.equityTopHoldings \|\| profile\.topStocks \|\| \[\]\)\.slice\(0, 10\)/,
    message: "portfolio model review context must preserve all ten top holdings instead of truncating to five."
  },
  {
    pattern: /function buildPortfolioFundSnapshot[\s\S]{0,500}topHoldings = \(profile\.holdings\?\.equityTopHoldings \|\| profile\.topStocks \|\| \[\]\)\.slice\(0, 10\)/,
    message: "portfolio fund snapshots must preserve all ten top holdings instead of truncating to five."
  },
  {
    pattern: /TOP_HOLDINGS_DISPLAY_LIMIT = 10/,
    message: "admin portfolio UI must display the full top-ten holdings list."
  },
  {
    pattern: /renderWatchlistCategoryDeck/,
    message: "admin portfolio watchlist must use categorized card sections instead of one long mixed list."
  },
  {
    pattern: /fund-card-summary/,
    message: "admin portfolio fund rows must be click-to-expand cards so the page stays scannable."
  },
  {
    pattern: /manager-timeline/,
    message: "admin portfolio manager activity must be displayed as a timeline."
  },
  {
    pattern: /renderRunThinkingCards/,
    message: "admin portfolio run history must expose manager analysis as cards instead of only raw text."
  },
  {
    pattern: /team: \(run\.team \|\| \[\]\)\.slice/,
    message: "portfolio API must expose visible investment committee views for the manager timeline."
  },
  {
    pattern: /run\.summary = decision\.summary[\s\S]{0,1400}markPortfolioRunProgress\(db, run, "决策日报已生成，正在保存任务结果。", \{ preserveSummary: true \}\)/,
    message: "portfolio decision runs must preserve the manager's actual conclusion instead of overwriting it with the last progress message."
  },
  {
    pattern: /run\.summary = buildPortfolioRunSummary\(run\)[\s\S]{0,220}run\.status = "completed"/,
    message: "completed portfolio runs must derive a meaningful summary before being shown in admin history."
  },
  {
    pattern: /isGenericPortfolioProgressSummary[\s\S]{0,800}保存任务结果/,
    message: "portfolio run summaries must treat save-progress text as non-user-facing."
  },
  {
    pattern: /buildDecisionRunSummary[\s\S]{0,900}今日决策：/,
    message: "portfolio decision summaries must expose action counts and order status instead of generic progress."
  },
  {
    pattern: /enforcePortfolioBuyDiscipline\(decision\.actions[\s\S]{0,260}enforcePortfolioHeldPositionRiskOverrides\(decision\.actions[\s\S]{0,260}enforcePortfolioSellDiscipline\(decision\.actions/,
    message: "portfolio decisions must convert under-reactive HOLD/WATCH on verified hot holdings into sell-discipline-checked reductions before order submission."
  },
  {
    pattern: /function enforcePortfolioHeldPositionRiskOverrides[\s\S]{0,1400}portfolio_held_position_risk_override/,
    message: "held-position risk override must explain when it replaces a model HOLD/WATCH with risk reduction."
  },
  {
    pattern: /hasPortfolioHeldActionReduceEvidence[\s\S]{0,900}extractPctAfterLabel[\s\S]{0,900}高位强势/,
    message: "held-position risk override must use model-written hot-position evidence when structured trend fetch temporarily fails."
  },
  {
    pattern: /accountAfter\.cumulativePnlPct[\s\S]{0,260}investedCost[\s\S]{0,260}严禁把初始本金/,
    message: "portfolio valuation prompt must force PnL percentages to use actual invested cost instead of initial capital."
  },
  {
    pattern: /function buildPortfolioWeeklyWithModel[\s\S]{0,900}compactProfiles[\s\S]{0,700}JSON\.stringify\(compactProfiles/,
    message: "portfolio weekly reports must send compact holding profiles to avoid context-window failures."
  },
  {
    pattern: /function buildPortfolioWeeklyWithModel[\s\S]{0,900}compactAccount = compactPortfolioWeeklyAccount\(account\)[\s\S]{0,700}JSON\.stringify\(compactAccount/,
    message: "portfolio weekly reports must compact the current account before sending it to the model."
  },
  {
    pattern: /compactPortfolioWeeklyContext[\s\S]{0,900}account: compactPortfolioWeeklyAccount/,
    message: "portfolio weekly reports must compact account positions instead of sending full fund snapshots."
  },
  {
    pattern: /compactPortfolioWeeklyAccount[\s\S]{0,1200}positions: \(account\.positions \|\| \[\]\)\.map\(compactPortfolioWeeklyPosition\)/,
    message: "portfolio weekly compact account must summarize positions through a dedicated compact position mapper."
  },
  {
    pattern: /compactPortfolioTrendProfile[\s\S]{0,900}pullbackSetup[\s\S]{0,260}\}[\s\S]{0,120}\}/,
    message: "portfolio weekly/profile compact context must strip raw NAV series while preserving trend setup evidence."
  },
  {
    pattern: /DEFAULT_MODEL_MAX_INPUT_CHARS\s*=\s*120000/,
    message: "model calls need a global input ceiling to prevent context-window failures on long portfolio reports."
  },
  {
    pattern: /function compactModelInputForContext[\s\S]{0,900}getModelMaxInputChars[\s\S]{0,900}compactTextMiddle/,
    message: "model calls must compact oversized prompts before sending them to the API."
  },
  {
    pattern: /isModelContextWindowError\(error\)[\s\S]{0,900}getModelContextRetryInputChars[\s\S]{0,900}modelContextWindowRetries/,
    message: "model calls must retry context-window failures with a smaller compacted prompt."
  },
  {
    pattern: /maxInputCharsOverride[\s\S]{0,700}compressionMarker/,
    message: "model input compaction must support an explicit lower retry budget and diagnostic marker."
  },
  {
    pattern: /lastModelInputOriginalChars[\s\S]{0,220}lastModelInputCompacted/,
    message: "model input compaction must be visible in runtime stats for diagnosing report failures."
  },
  {
    pattern: /buildFallbackPortfolioWeeklyRaw/,
    message: "portfolio weekly reports must have a deterministic fallback instead of failing with no customer-facing report."
  },
  {
    pattern: /isResponsesStreamFallbackError[\s\S]{0,260}isTransientModelTransportError/,
    message: "Responses stream INTERNAL_ERROR must fall back to non-streaming model calls."
  },
  {
    pattern: /isTransientModelTransportError[\s\S]{0,260}INTERNAL_ERROR/,
    message: "model transport errors must recognize stream INTERNAL_ERROR as recoverable."
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
    pattern: /renderWatchlistFactStrip[\s\S]{0,260}includeAction:\s*false[\s\S]{0,220}池内状态/,
    message: "admin watchlist cards must show pool status before raw deep-dive buy/watch actions."
  },
  {
    pattern: /getPortfolioWatchlistMainCandidateBlocker[\s\S]{0,520}自选池状态为观察中/,
    message: "pullback discovery must not promote watchlist observation candidates into main recommendations."
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
    pattern: /\/health[\s\S]{0,900}release:\s*getRuntimeRelease\(\)/,
    message: "health checks must expose runtime release metadata so deployment drift is visible."
  },
  {
    pattern: /function getRuntimeStats\(\)[\s\S]{0,240}release:\s*getRuntimeRelease\(\)/,
    message: "runtime stats must expose release metadata for the admin UI."
  },
  {
    pattern: /function getRuntimeStats\(\)[\s\S]{0,360}diagnostics:\s*buildRuntimeDiagnostics\(stats\)/,
    message: "runtime stats must expose diagnostics so manager degradation is visible."
  },
  {
    pattern: /function buildRuntimeDiagnostics[\s\S]{0,3600}市场快照失败[\s\S]{0,900}持仓补全失败[\s\S]{0,2600}模型上下文超限/,
    message: "runtime diagnostics must highlight context-window, market snapshot, and holdings failures."
  },
  {
    pattern: /statReleaseCommit[\s\S]*formatReleaseCommit|formatReleaseCommit[\s\S]*statReleaseCommit/,
    message: "admin runtime UI must show the currently deployed commit."
  },
  {
    pattern: /runtimeDiagnostics[\s\S]{0,260}renderRuntimeDiagnostics|renderRuntimeDiagnostics[\s\S]{0,260}runtimeDiagnostics/,
    message: "admin runtime UI must render structured runtime diagnostics."
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
    pattern: /lowPositionPct250/,
    message: "pullback/setup discovery must expose longer-window position evidence so 120-day pseudo-lows are not mistaken for true low positions."
  },
  {
    pattern: /hasPullbackLowPositionEvidence/,
    message: "pullback/setup main candidates must require actual low-position evidence, not only a repaired trend label."
  },
  {
    pattern: /hasPullbackLongPositionChaseRisk[\s\S]{0,700}classifyPullbackSetupCandidateForSummary|classifyPullbackSetupCandidateForSummary[\s\S]{0,700}hasPullbackLongPositionChaseRisk/,
    message: "pullback/setup main-candidate classification must reject candidates that are high in the 250-day window."
  },
  {
    pattern: /classifyPullbackSetupCandidateForSummary[\s\S]{0,800}isEarlyTurnSetupTrend/,
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
    pattern: /isLowBaseTurnSeedCandidate[\s\S]{0,420}thisYearPct/,
    message: "pullback/setup discovery must use year-to-date evidence when ranking low-base launch-eve candidates."
  },
  {
    pattern: /thisYear\s*>\s*30[\s\S]{0,180}score\s*-=|score\s*-=[\s\S]{0,180}thisYear\s*>\s*30/,
    message: "pullback/setup scoring must penalize year-to-date high candidates that only look mild in short windows."
  },
  {
    pattern: /hasPullbackYearToDateChaseRisk[\s\S]{0,700}classifyPullbackSetupCandidateForSummary|classifyPullbackSetupCandidateForSummary[\s\S]{0,700}hasPullbackYearToDateChaseRisk/,
    message: "pullback/setup main-candidate classification must reject year-to-date high pseudo-low candidates."
  },
  {
    pattern: /isPullbackTrendFreshEnough[\s\S]{0,700}classifyPullbackSetupCandidateForSummary|classifyPullbackSetupCandidateForSummary[\s\S]{0,700}isPullbackTrendFreshEnough/,
    message: "pullback/setup main-candidate classification must reject stale NAV/trend evidence."
  },
  {
    pattern: /evaluatePullbackTrendFreshness[\s\S]{0,360}PULLBACK_SETUP_MAX_TREND_AGE_DAYS/,
    message: "pullback/setup freshness guard must have a configurable maximum NAV/trend evidence age."
  },
  {
    pattern: /净值日期=\$\{trendDate\}/,
    message: "pullback/setup summaries must expose stale NAV/trend evidence dates."
  },
  {
    pattern: /净值走势已过期/,
    message: "pullback/setup summaries must explain stale-data gaps before buying."
  },
  {
    pattern: /今年以来=\$\{seedThisYear\}%[\s\S]{0,2600}今年以来\$\{formatFallbackPct\(seedThisYear\)\}偏高/,
    message: "pullback/setup summaries must expose and explain year-to-date high-position evidence."
  },
  {
    pattern: /250日位置=\$\{trend\.lowPositionPct250\}%[\s\S]{0,2600}250日位置\$\{formatFallbackPlainPct\(longPosition\)\}偏高/,
    message: "pullback/setup summaries must expose and explain 250-day high-position pseudo-low evidence."
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
    pattern: /scoreResearchDigestForPullbackSetup[\s\S]{0,3200}scoreHoldingsOutlookForCandidate/,
    message: "pullback/setup deep-dive ranking must score top-ten holdings outlook, not only NAV trend."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,1400}buildHoldingsOutlookProfile/,
    message: "fund actionability must incorporate structured top-ten holdings outlook."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,3600}getActionabilityEntryDiscipline\(trend[\s\S]{0,900}boundedScore = Math\.min\(boundedScore, entryDiscipline\.scoreCap\)/,
    message: "fund actionability must cap buy/staged-buy scores when the trend says wait for pullback."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,3800}getActionabilityFreshnessDiscipline\(digest[\s\S]{0,900}boundedScore = Math\.min\(boundedScore, freshnessDiscipline\.scoreCap\)/,
    message: "fund actionability must cap buy/staged-buy scores when NAV or trend evidence is stale."
  },
  {
    pattern: /function getActionabilityEntryDiscipline[\s\S]{0,1800}scoreCap:\s*58[\s\S]{0,600}不能给买入或分批买入动作/,
    message: "fund actionability entry discipline must explain hot/wait-pullback downgrades in Chinese."
  },
  {
    pattern: /function getActionabilityFreshnessDiscipline[\s\S]{0,1800}系统数据时效降级[\s\S]{0,600}不能给买入或分批买入动作/,
    message: "fund actionability freshness discipline must explain stale-data downgrades in Chinese."
  },
  {
    pattern: /formatPullbackSetupCandidateLine[\s\S]{0,2400}formatHoldingsOutlookEvidence/,
    message: "pullback/setup summaries must expose top-ten holdings outlook next to timing evidence."
  },
  {
    pattern: /前十大持仓\/前景/,
    message: "fund selection prompts and gaps must require top-ten holdings and outlook checks."
  },
  {
    pattern: /scoreResearchDigestForPullbackSetup[\s\S]{0,900}lowPositionPct250/,
    message: "pullback/setup deep-dive ranking must score longer-window low-position evidence, not only 120-day position."
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
    pattern: /watch_candidate_given_buy_signal/,
    message: "watch/reject pullback candidates must not receive buy-intent language even without an explicit amount."
  },
  {
    pattern: /hasPositiveBuyIntentForFundCode[\s\S]{0,800}hasPositiveBuyIntentText/,
    message: "pullback/setup answer quality must detect watch-candidate buy intent separately from numeric execution."
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
    pattern: /const deterministicFallback = buildPullbackQualityFallbackAnswer[\s\S]{0,1200}FUND_ANSWER_QUALITY_REWRITE/,
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
  },
  {
    pattern: /apiFetch\("\/api\/portfolio\?summary=1"/,
    message: "admin initial portfolio load must use the lightweight summary API."
  },
  {
    pattern: /function compactPublicTrendSeries[\s\S]{0,260}date: item\.date[\s\S]{0,180}nav: finiteMetricNumber/,
    message: "portfolio summary API must compact chart series to date and NAV only."
  },
  {
    pattern: /summarizePortfolioPositionBrief[\s\S]{0,180}compactPublicFundSnapshot/,
    message: "portfolio summary API must compact held-position fund snapshots."
  },
  {
    pattern: /function compactPortfolioDbForStorage[\s\S]{0,900}compactStoredPortfolioAccount[\s\S]{0,900}compactStoredPortfolioSnapshotFields/,
    message: "portfolio storage writes must compact stored fund snapshots before the DB grows too large."
  },
  {
    pattern: /compactStoredPortfolioSnapshotFields[\s\S]{0,360}fundSnapshot:\s*compactPublicFundSnapshot[\s\S]{0,180}lastSnapshot:\s*compactPublicFundSnapshot/,
    message: "portfolio storage compaction must cover both held/order snapshots and watchlist snapshots."
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
