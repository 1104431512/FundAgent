import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "src", "server.mjs"), "utf8");
const admin = fs.readFileSync(path.join(root, "public", "admin.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(root, "public", "admin.html"), "utf8");
const adminCss = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const deploymentCheck = fs.readFileSync(path.join(root, "scripts", "check-deployment-state.mjs"), "utf8");
const dockerfile = fs.readFileSync(path.join(root, "Dockerfile"), "utf8");
const dockerPublishWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "docker-publish.yml"), "utf8");
const allSource = [server, admin, adminHtml, adminCss, packageJson, deploymentCheck, dockerfile, dockerPublishWorkflow].join("\n");

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
    pattern: /drawFundReportLegendPanel[\s\S]{0,420}题材阶段/,
    message: "in-image fund chart legends must avoid opaque theme-stage wording; use shorter low/high labels."
  },
  {
    pattern: /function compactThemeRadarForModel[\s\S]{0,900}\n\s*(?:stage|positionSignal|actionBias|stageText|positionSignalText|actionBiasText)\s*:/,
    message: "compact market snapshots sent to the model must not expose raw theme-radar field names."
  },
  {
    pattern: /themeRadar\.positionSignal/,
    message: "portfolio prompts must describe theme-radar chase risk in Chinese instead of raw field names."
  },
  {
    pattern: /不要输出 stage\/forwardScore\/crowdingScore/,
    message: "fund prompts must not seed the model with raw field names when asking it not to leak them."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,2600}JSON\.stringify\(heldProfiles \|\| \[\], null, 2\)/,
    message: "portfolio decisions must not send full held profiles with raw NAV series to the model."
  },
  {
    pattern: /function buildPortfolioPremarketWithModel[\s\S]{0,1800}JSON\.stringify\(profiles \|\| \[\], null, 2\)/,
    message: "portfolio premarket reports must not send full holding profiles with raw NAV series to the model."
  },
  {
    pattern: /next\.modelMaxOutputTokens\s*=\s*Number\(next\.modelMaxOutputTokens/,
    message: "effective config must not honor stale low persisted model output caps."
  },
  {
    pattern: /next\.replyMaxChars\s*=\s*Number\(next\.replyMaxChars/,
    message: "effective config must not honor stale low persisted reply character caps."
  }
];

const requiredPatterns = [
  {
    pattern: /internal_signal_leak/,
    message: "fund answer quality gate must reject internal enum/field leaks."
  },
  {
    pattern: /numeric_dump_without_interpretation/,
    message: "fund answer quality gate must reject numeric dumps that do not explain走势和买点逻辑."
  },
  {
    pattern: /marketIndicators\.realtimeFundValuations/,
    message: "market snapshots must carry a real-time or near-real-time fund valuation layer."
  },
  {
    pattern: /marketIndicators\.globalMarkets/,
    message: "market snapshots must carry overseas index and FX quotes for QDII decisions."
  },
  {
    pattern: /function fetchGlobalMarketQuotes[\s\S]{0,2200}100\.NDX[\s\S]{0,600}133\.USDCNH/,
    message: "global market quote fetching must include key US/HK/Japan index and offshore RMB references."
  },
  {
    pattern: /function inferFundShareClass[\s\S]{0,500}knownProductSuffixes\.includes\(rawSuffix\)[\s\S]{0,80}return ""/,
    message: "share-class inference must not misread QDII/ETF/FOF product suffixes as A/C/I share classes."
  },
  {
    pattern: /function fetchRealtimeFundValuationSnapshot[\s\S]{0,2200}fetchFundValuation\(code\)[\s\S]{0,3600}function normalizeRealtimeFundValuation[\s\S]{0,2600}source: valuation\.source \|\| `https:\/\/fundgz\.1234567\.com\.cn\/js\/\$\{valuation\.fundcode/,
    message: "real-time fund valuation snapshots must use the existing Tiantian/FundGZ estimate endpoint with source traceability."
  },
  {
    pattern: /async function fetchFundValuation[\s\S]{0,7000}fetchFundValuationFromPingzhongData[\s\S]{0,50000}function parseFundPingzhongLatestNav[\s\S]{0,700}Data_netWorthTrend/,
    message: "fund valuation must fall back to Eastmoney pingzhongdata latest official NAV when intraday estimates are unavailable or stale."
  },
  {
    pattern: /async function fetchFundValuation[\s\S]{0,1800}fetchFundValuationFromSinaEstimate[\s\S]{0,2600}stock\.finance\.sina\.com\.cn\/fundInfo\/api\/openapi\.php\/FdFundService\.getEstimateNetworthPic/,
    message: "fund valuation must include a Sina minute-level estimate backup before falling back to official NAV only."
  },
  {
    pattern: /async function fetchFundValuation[\s\S]{0,2600}fetchFundValuationFromHaoetfQdii[\s\S]{0,2600}https:\/\/www\.haoetf\.com\/qdii\/\$\{code\}/,
    message: "fund valuation must include HaoETF realtime QDII valuation before falling back to official NAV only."
  },
  {
    pattern: /function parseHaoetfQdiiValuationRows[\s\S]{0,2400}realtimePremiumPct[\s\S]{0,2400}benchmarkName[\s\S]{0,1800}function normalizeHaoetfQdiiValuationRow/,
    message: "HaoETF QDII source must parse realtime valuation, premium, and benchmark evidence."
  },
  {
    pattern: /if \(!isStaleFundValuation\(primary\)\) \{[\s\S]{0,120}augmentFundValuationWithSinaIntraday\(primary,\s*code\)/,
    message: "fresh Tiantian/FundGZ valuations must still be supplemented with Sina intraday trend evidence."
  },
  {
    pattern: /function mergeFundValuationIntradaySupplement[\s\S]{0,900}supplementalIntradaySourceKind[\s\S]{0,500}supplementalEstimatedChangePct/,
    message: "Sina intraday supplement must preserve the primary valuation while disclosing supplemental trend source."
  },
  {
    pattern: /function isStaleFundValuation[\s\S]{0,500}estimateFreshnessMinutes[\s\S]{0,500}FUND_VALUATION_STALE_ESTIMATE_MINUTES/,
    message: "fund valuation freshness must check intraday estimate time before trusting a realtime source."
  },
  {
    pattern: /function parseSinaEstimateNetworthJsonp[\s\S]{0,1600}growthrate2[\s\S]{0,2200}sina_intraday_estimate/,
    message: "Sina estimate backup must parse pre_nav2/growthrate2 into normalized realtime valuation evidence."
  },
  {
    pattern: /function normalizeSinaEstimateIntradaySeries[\s\S]{0,900}function summarizeFundIntradayValuationTrend[\s\S]{0,1400}冲高回落/,
    message: "Sina estimate backup must preserve minute-level valuation series and summarize intraday direction."
  },
  {
    pattern: /function compactRealtimeFundValuations[\s\S]{0,900}盘中走势[\s\S]{0,600}尾盘变化/,
    message: "compact market snapshots must carry intraday fund valuation direction into model prompts."
  },
  {
    pattern: /realtimeFundValuations[\s\S]{0,220}盘中走势[\s\S]{0,220}冲高回落[\s\S]{0,220}尾盘转弱/,
    message: "fund and portfolio prompts must use intraday valuation direction to reduce chase-buy confidence."
  },
  {
    pattern: /async function fetchFundHoldingRealtimePulse[\s\S]{0,2600}fetchEastmoneyRealtimeQuotes[\s\S]{0,9000}fetchTencentRealtimeQuotes[\s\S]{0,9000}function buildFundHoldingRealtimePulseFromQuotes/,
    message: "fund enrichment must add Eastmoney and Tencent realtime top-holding quote pulse evidence, not only stale fund NAV estimates."
  },
  {
    pattern: /function parseTencentRealtimeQuotes[\s\S]{0,2200}sourceKind: "tencent_realtime_quote"[\s\S]{0,1800}function inferTencentQuoteCodeFromHolding/,
    message: "Tencent realtime quote fallback must parse A-share and HK holding quotes into normalized pulse evidence."
  },
  {
    pattern: /function buildHoldingsOutlookProfile[\s\S]{0,5000}holdingRealtimePulse[\s\S]{0,1600}前十大持仓盘中/,
    message: "holdings outlook must convert realtime top-holding pulse into buy/wait risk evidence."
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
    pattern: /function isFundChartGlossaryQuestion[\s\S]{0,360}stage[\s\S]{0,360}buildFundReportChartGlossaryAnswer/,
    message: "fund QA must have a deterministic Chinese glossary path when users ask what chart metrics mean."
  },
  {
    pattern: /function buildFundReportChartGlossaryAnswer[\s\S]{0,900}先看能不能买，再看是不是低位，最后看成本和风险/,
    message: "fund chart glossary must explain the reading order in natural Chinese."
  },
  {
    pattern: /function compactThemeRadarForModel[\s\S]{0,900}板块位置[\s\S]{0,900}位置判断[\s\S]{0,900}操作倾向/,
    message: "compact market snapshots must present theme-radar fields with Chinese labels before model calls."
  },
  {
    pattern: /"check:deployment":\s*"node scripts\/check-deployment-state\.mjs"/,
    message: "deployment freshness must be checkable after code is pushed."
  },
  {
    pattern: /check-deployment-state\.mjs[\s\S]{0,2600}\/health[\s\S]{0,1800}release[\s\S]{0,1800}deployed commit matches local HEAD/,
    message: "deployment checker must verify online release metadata against the current local commit."
  },
  {
    pattern: /ARG FUNDAGENT_COMMIT[\s\S]{0,260}ENV FUNDAGENT_COMMIT=\$FUNDAGENT_COMMIT[\s\S]{0,2600}\.fundagent-release\.json[\s\S]{0,2600}build-args:[\s\S]{0,260}FUNDAGENT_COMMIT=\$\{\{ github\.sha \}\}/,
    message: "Docker image publishing must embed the git commit and a build release file so /health can prove the deployed manager version."
  },
  {
    pattern: /function resolveAppRelease[\s\S]{0,700}readBuildReleaseMetadata\(\)[\s\S]{0,1000}builtAt: buildFile\.builtAt/,
    message: "runtime release metadata must fall back to the Docker build release file when env vars or .git metadata are unavailable."
  },
  {
    pattern: /check-deployment-state\.mjs[\s\S]{0,3600}portfolioCapabilityActionQueue[\s\S]{0,1800}capabilityDiagnostics[\s\S]{0,1800}capabilityActionQueue/,
    message: "deployment checker must prove online admin and portfolio APIs expose capability repair features."
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
    pattern: /function buildFundReportCardImages[\s\S]{0,700}const chartMode = "summary"[\s\S]{0,700}renderFundReportSummaryPng/,
    message: "fund report images must always use Chinese summary evidence cards instead of sparse trend-only charts."
  },
  {
    pattern: /120日位置[\s\S]{0,140}250日位置/,
    message: "fund report charts must show low-position labels as plain Chinese time-window position evidence rather than opaque metric names."
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
    pattern: /250日位置/,
    message: "fund report charts must show longer-window low-position evidence in a compact readable label."
  },
  {
    pattern: /板块位置=这条赛道现在处在低位、确认、扩散还是拥挤/,
    message: "fund report chart guides must explain theme-stage signals as plain Chinese board position."
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
    pattern: /DEFAULT_MODEL_MAX_OUTPUT_TOKENS\s*=\s*12000/,
    message: "fund manager default output token budget must remain high enough for richer answers."
  },
  {
    pattern: /DEFAULT_REPLY_MAX_CHARS\s*=\s*18000/,
    message: "Feishu reply character budget must not force premature truncation."
  },
  {
    pattern: /MIN_FUND_RECOMMENDATION_OUTPUT_TOKENS\s*=\s*12000/,
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
    pattern: /modelMaxOutputTokens\s*=\s*Number\(payload\.modelMaxOutputTokens\s*\|\|\s*12000\)/,
    message: "admin config must not silently save the obsolete 4800-token model cap."
  },
  {
    pattern: /replyMaxChars\s*=\s*Number\(payload\.replyMaxChars\s*\|\|\s*18000\)/,
    message: "admin config must not silently save the obsolete 9000-character reply cap."
  },
  {
    pattern: /MIN_EFFECTIVE_MODEL_MAX_OUTPUT_TOKENS\s*=\s*DEFAULT_MODEL_MAX_OUTPUT_TOKENS/,
    message: "effective config must raise stale stored model output caps to the high default."
  },
  {
    pattern: /next\.modelMaxOutputTokens\s*=\s*Math\.max\(MIN_EFFECTIVE_MODEL_MAX_OUTPUT_TOKENS/,
    message: "effective config must raise stale stored model output caps to the high default."
  },
  {
    pattern: /MIN_EFFECTIVE_REPLY_MAX_CHARS\s*=\s*DEFAULT_REPLY_MAX_CHARS/,
    message: "effective config must raise stale stored reply character caps to the high default."
  },
  {
    pattern: /next\.replyMaxChars\s*=\s*Math\.max\(MIN_EFFECTIVE_REPLY_MAX_CHARS/,
    message: "effective config must raise stale stored reply character caps to the high default."
  },
  {
    pattern: /REQUIRED_PORTFOLIO_MANAGER_PROFILE_LINES[\s\S]{0,1200}轮动纪律/,
    message: "stored portfolio manager profiles must be upgraded with required rotation/chase discipline."
  },
  {
    pattern: /function normalizePortfolioManagerProfile[\s\S]{0,900}REQUIRED_PORTFOLIO_MANAGER_PROFILE_LINES/,
    message: "stored portfolio manager profiles must be upgraded with required rotation/chase discipline."
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
    pattern: /新图只使用中文短标签和决策理由/,
    message: "fund chart reading guides must tell users that report images are Chinese-first and decision-first."
  },
  {
    pattern: /买点=是否到了可买位置[\s\S]{0,260}板块位置=是否低位轮动或已经拥挤[\s\S]{0,260}规模=基金规模/,
    message: "fund chart reading guides must explain the key entry, theme-position, low-position, and scale labels."
  },
  {
    pattern: /指标速读：近20日\/近60日看是否追涨[\s\S]{0,160}每万成本看费用拖累/,
    message: "fund chart reading guides must include a plain Chinese metric quick-read."
  },
  {
    pattern: /看不懂指标时先看底部决策理由/,
    message: "fund chart reading guides must reassure users that opaque indicators are explained through decision reasons."
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
    pattern: /normalizeMarketDataQualityComponent[\s\S]{0,900}realtimeFundValuations[\s\S]{0,500}status = "stale"/,
    message: "market data quality must downgrade stale realtime valuation coverage instead of treating it as live."
  },
  {
    pattern: /实时估算净值全部偏旧[\s\S]{0,260}不能当作实时买点确认/,
    message: "market data quality notes must explain stale realtime valuation evidence in Chinese."
  },
  {
    pattern: /stock\.finance\.sina\.com\.cn\/fundInfo\/api\/openapi\.php\/FdFundService\.getEstimateNetworthPic/,
    message: "market snapshot sources must expose the Sina intraday valuation supplement."
  },
  {
    pattern: /必须检查 marketSnapshot\.dataQuality[\s\S]{0,220}数据缺口[\s\S]{0,220}降低把握度/,
    message: "fund and portfolio prompts must force data-gap disclosure when public sources are partial or poor."
  },
  {
    pattern: /function compactMarketSnapshotForModel[\s\S]{0,2200}compactRealtimeFundValuations[\s\S]{0,1200}compactMarketFundCandidates[\s\S]{0,1200}errors/,
    message: "model prompts must use a compact market snapshot that preserves key evidence without raw payload bloat."
  },
  {
    pattern: /function recommendFundsWithModel[\s\S]{0,1800}marketSnapshotForModel = compactMarketSnapshotForModel\(marketSnapshot\)[\s\S]{0,3400}JSON\.stringify\(marketSnapshotForModel \|\| \{\}, null, 2\)/,
    message: "fund recommendation prompts must send compact market snapshots instead of full raw snapshots."
  },
  {
    pattern: /function answerFundQuestionWithModel[\s\S]{0,1800}marketSnapshotForModel = compactMarketSnapshotForModel\(marketSnapshot\)[\s\S]{0,2600}JSON\.stringify\(marketSnapshotForModel, null, 2\)/,
    message: "fund QA prompts must send compact market snapshots instead of full raw snapshots."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,5200}JSON\.stringify\(compactMarketSnapshotForModel\(marketSnapshot\), null, 2\)/,
    message: "portfolio decisions must use compact market snapshots to avoid model context-window failures."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,5000}每只基金最多保留3个最能改变动作的数字[\s\S]{0,260}不要连续罗列5日\/10日\/20日\/60日\/120日/,
    message: "portfolio decision prompts must reduce numeric dumps and prioritize customer-readable trend logic."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,2200}compactHeldProfiles = \(heldProfiles \|\| \[\]\)\.map\(compactPortfolioReviewProfile\)[\s\S]{0,4200}JSON\.stringify\(compactHeldProfiles, null, 2\)/,
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
    pattern: /drawFundReportDecisionReasonPanel/,
    message: "fund report summary images must include in-image buy/watch decision reasons instead of only a legend."
  },
  {
    pattern: /本次动作[\s\S]{0,160}买点[\s\S]{0,160}风险[\s\S]{0,160}待确认/,
    message: "fund report images must show the customer why to buy or add to watchlist."
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
    pattern: /每万成本=每1万元持有估算成本[\s\S]{0,120}分批=不一次买完/,
    message: "fund report chart guides must explain cost and staged buying in plain Chinese."
  },
  {
    pattern: /风险边界/,
    message: "fund report images must connect chart evidence to risk boundaries."
  },
  {
    pattern: /\["SHRP",\s*"夏普比率"\][\s\S]{0,260}\["20d",\s*"近20日"\]/,
    message: "fund answer localization must translate legacy chart metric abbreviations into Chinese."
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
    pattern: /FEISHU_FUND_IMAGE_CARD_LEGEND[\s\S]{0,300}图上底部会直接写[\s\S]{0,260}结论、支持证据、风险边界和下一步[\s\S]{0,180}新图不再显示英文简称/,
    message: "fund image cards must show decision reasons next to report images, not only in the main text body."
  },
  {
    pattern: /buildFeishuImageCaption[\s\S]{0,700}先看底部“为什么买或备选”[\s\S]{0,260}“买点\/经理动作”判断能否买[\s\S]{0,260}“每万成本\/回撤\/规模”控制成本和风险/,
    message: "fund image captions must tell users how chart evidence supports buy or backup decisions."
  },
  {
    pattern: /function buildFeishuCardTextElements[\s\S]{0,700}buildFeishuDetailedAnalysisElements/,
    message: "Feishu cards must route detailed analysis through the sectioned detail renderer."
  },
  {
    pattern: /function buildFeishuDetailedAnalysisElements[\s\S]{0,900}\*\*详细分析\*\*/,
    message: "Feishu cards must keep a detailed analysis heading below the highlighted summary."
  },
  {
    pattern: /FEISHU_DETAIL_SECTION_PATTERN[\s\S]{0,260}今日操作[\s\S]{0,260}自选基金池[\s\S]{0,260}风险控制/,
    message: "Feishu portfolio reports must recognize major daily report sections for readable card splitting."
  },
  {
    pattern: /function formatFeishuSectionTitle[\s\S]{0,260}formatFeishuColoredText/,
    message: "Feishu portfolio report sections must use colored headings rather than plain long text."
  },
  {
    pattern: /function buildFeishuDecisionDigest[\s\S]{0,1200}\*\*关键证据\*\*[\s\S]{0,520}\*\*风险\/待确认\*\*/,
    message: "Feishu cards must expose key evidence and risk sections as scannable blocks."
  },
  {
    pattern: /function formatFeishuColoredText[\s\S]{0,260}<font color='/,
    message: "Feishu card summaries must use supported lark_md color markup for important text."
  },
  {
    pattern: /function getCardMeta[\s\S]{0,900}inferFeishuCardTone[\s\S]{0,260}template:\s*tone\.template/,
    message: "Feishu card headers must change color template according to the decision tone."
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
    pattern: /function getPortfolioDecisionSkillIds[\s\S]{0,700}fund-market-timing[\s\S]{0,260}fund-answer-quality/,
    message: "portfolio decisions must load market-timing and answer-quality skills, not only portfolio bookkeeping skills."
  },
  {
    pattern: /function hasPortfolioStarterBuySetup[\s\S]{0,900}return5dPct[\s\S]{0,260}return10dPct/,
    message: "portfolio buy discipline must support small starter probes for low-position pullback setups that are starting to turn."
  },
  {
    pattern: /function cancelDuplicatePortfolioActiveOrders[\s\S]{0,900}同一基金同方向已有未完成订单/,
    message: "portfolio order lifecycle must cancel duplicate same-fund active orders before they double-execute."
  },
  {
    pattern: /现金闲置风险[\s\S]{0,360}不能只说等待机会/,
    message: "portfolio capability diagnostics must flag high-cash over-waiting as an actionable manager weakness."
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
    pattern: /function derivePortfolioInvestedCostBasisFromTransactions[\s\S]{0,900}peakCost[\s\S]{0,500}return round\(peakCost,\s*2\)/,
    message: "portfolio PnL denominator must preserve the historical actual invested basis after full liquidation."
  },
  {
    pattern: /staleZeroPctAfterLiquidation[\s\S]{0,500}account\.investedCostBasis[\s\S]{0,500}account\.cumulativePnlPct = round\(\(Number\(account\.cumulativePnl\) \/ Number\(account\.investedCostBasis\)\) \* 100,\s*2\)/,
    message: "public historical portfolio runs must repair stale zero PnL percentages after positions are fully sold."
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
    pattern: /function normalizePortfolioPremarket\(raw\)[\s\S]{0,900}normalizePortfolioUserFacingText[\s\S]{0,900}formatPortfolioMarketTone/,
    message: "portfolio premarket reports must localize internal model fields and English market tones before display."
  },
  {
    pattern: /function normalizePortfolioWeekly\(raw\)[\s\S]{0,900}normalizePortfolioUserFacingArray/,
    message: "portfolio weekly reports must localize internal model fields before display."
  },
  {
    pattern: /function buildPortfolioDecisionCard[\s\S]{0,900}formatPortfolioCustomerActionLine[\s\S]{0,3600}return normalizePortfolioUserFacingText\(card, account\)/,
    message: "portfolio decision cards must use customer-friendly action summaries and run a final user-facing localization pass."
  },
  {
    pattern: /function formatPortfolioCustomerActionLine[\s\S]{0,1400}formatPortfolioActionLabel\(action\.action\)[\s\S]{0,700}shortenPortfolioCustomerText/,
    message: "portfolio action lines must keep Chinese action labels while trimming metric-heavy model reasons."
  },
  {
    pattern: /function formatPortfolioCustomerActionLine[\s\S]{0,1400}summarizePortfolioCustomerFeeText[\s\S]{0,2600}function choosePortfolioCustomerSentence/,
    message: "portfolio customer-facing action lines must prioritize readable logic and translate fee numbers into share-class meaning."
  },
  {
    pattern: /function shortenPortfolioCustomerText[\s\S]{0,900}compactNumericHeavyCustomerText[\s\S]{0,4200}function compactNumericHeavyCustomerText[\s\S]{0,900}maxNumbers/,
    message: "portfolio customer-facing cards must compact numeric-heavy action reasons before Feishu display."
  },
  {
    pattern: /function summarizePortfolioRun\(run,\s*fallbackAccount\s*=\s*\{\}\)[\s\S]{0,220}getPortfolioRunAccountContext\(run,\s*fallbackAccount\)[\s\S]{0,800}card:\s*normalizePortfolioUserFacingText\(run\.card \|\| "",\s*account\)[\s\S]{0,900}sanitizePortfolioPublicReportValue/,
    message: "portfolio public API must sanitize stored historical run cards with the run account context before the admin UI displays them."
  },
  {
    pattern: /const summarizeRun = lightweight[\s\S]{0,180}summarizePortfolioRunBrief\(run,\s*db\.account\)[\s\S]{0,180}summarizePortfolioRun\(run,\s*db\.account\)/,
    message: "portfolio public state must pass account context into historical run summaries."
  },
  {
    pattern: /function sanitizePortfolioPublicReportValue\(value,\s*key\s*=\s*"",\s*account\s*=\s*\{\}\)[\s\S]{0,900}normalizePortfolioUserFacingText\(value,\s*account\)[\s\S]{0,900}shouldPreservePortfolioPublicString/,
    message: "portfolio public report sanitization must preserve source URLs while localizing user-facing report text with account context."
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
    pattern: /function buildPortfolioHeldPositionRiskReview[\s\S]{0,3200}缺少当前净值\/走势复核[\s\S]{0,3200}浮盈已回吐[\s\S]{0,1200}可操作性偏等待/,
    message: "held-position risk review must not let stale trend data hide wait/giveback risk."
  },
  {
    pattern: /function buildPortfolioPositionRiskBudget[\s\S]{0,2600}当前转亏[\s\S]{0,500}回吐保护/,
    message: "position risk budget must reduce stale holdings whose prior gains have turned negative."
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
    pattern: /enforcePortfolioLedgerIntegrityGuard[\s\S]{0,1400}系统账本完整性拦截[\s\S]{0,700}portfolio_ledger_integrity_guard/,
    message: "portfolio execution must block new buys while duplicate trades, stale orders, or duplicate receivables can distort cash."
  },
  {
    pattern: /decision\.actions = enforcePortfolioLedgerIntegrityGuard\(decision\.actions,\s*db\)/,
    message: "portfolio decision runs must apply ledger integrity protection after model and discipline guards."
  },
  {
    pattern: /buildPortfolioExposureSummary/,
    message: "portfolio manager must compute portfolio-level look-through exposure and overlap diagnostics."
  },
  {
    pattern: /function buildPortfolioRiskBudgetActions[\s\S]{0,2600}buildPortfolioExposureSummary\(positions\)[\s\S]{0,3600}portfolio_exposure_concentration_guard/,
    message: "portfolio risk budget must create deterministic reductions for excessive same-theme or underlying overlap exposure."
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
    pattern: /capabilityDiagnostics:\s*buildPortfolioCapabilityDiagnostics\(db\)/,
    message: "portfolio API must expose manager capability diagnostics derived from the real ledger."
  },
  {
    pattern: /capabilityActionQueue:\s*buildPortfolioCapabilityActionQueue\(db\)/,
    message: "portfolio API must expose concrete capability repair tasks, not only diagnostics."
  },
  {
    pattern: /backtestDiagnostics:\s*buildPortfolioBacktestDiagnostics\(db\)/,
    message: "portfolio API must expose historical backtest diagnostics for replayed manager defects."
  },
  {
    pattern: /function buildPortfolioBacktestDiagnostics[\s\S]{0,8200}重复成交回测[\s\S]{0,8200}追高买入回测[\s\S]{0,8200}卖出滞后回测[\s\S]{0,8200}空仓等待回测/,
    message: "portfolio backtest diagnostics must replay duplicate trades, chase entries, delayed sells, and idle-cash redeployment failures."
  },
  {
    pattern: /findPortfolioBacktestUnprotectedGivebackPositions[\s\S]{0,1600}PORTFOLIO_BACKTEST_PROFIT_PROTECTION_TRIM_PCT[\s\S]{0,2200}estimatedProtectedProfitLoss/,
    message: "portfolio backtests must estimate money lost by not protecting profits after giveback."
  },
  {
    pattern: /利润回吐放任回测[\s\S]{0,1400}少保住约[\s\S]{0,800}止盈减仓/,
    message: "portfolio backtest diagnostics must explain unprotected profit giveback in user-readable yuan terms."
  },
  {
    pattern: /function buildPortfolioBacktestDiagnostics[\s\S]{0,2600}订单卡滞回测/,
    message: "portfolio backtest diagnostics must flag stale active orders that can distort cash, receivables, and deployment capacity."
  },
  {
    pattern: /function dedupePortfolioSettlements[\s\S]{0,2200}重复应收作废[\s\S]{0,500}receivableCash/,
    message: "portfolio settlement lifecycle must cancel duplicate receivables and repair receivable cash."
  },
  {
    pattern: /function buildPortfolioBacktestDiagnostics[\s\S]{0,3600}重复应收回测/,
    message: "portfolio backtest diagnostics must flag duplicated settlement receivables that overstate deployable cash."
  },
  {
    pattern: /function buildPortfolioBacktestDiagnostics[\s\S]{0,7600}试探仓后续回测[\s\S]{0,1200}加到3%-5%/,
    message: "portfolio backtest diagnostics must force a scale-or-exit plan after tiny starter buys when cash remains excessive."
  },
  {
    pattern: /function buildPortfolioBacktestDiagnostics[\s\S]{0,9000}waitOnlyDecisionRuns[\s\S]{0,1200}过度保守回测/,
    message: "portfolio backtest diagnostics must detect repeated wait-only decisions while cash remains deployable."
  },
  {
    pattern: /readyOpportunityCandidates[\s\S]{0,1500}买点错过回测[\s\S]{0,400}接近买点未执行/,
    message: "portfolio backtests must detect ready watchlist candidates that stay unexecuted under high cash."
  },
  {
    pattern: /findPortfolioBacktestMissedFollowThroughCandidates[\s\S]{0,2600}estimatedStarterOpportunity[\s\S]{0,1200}function selectPortfolioFollowThroughPct/,
    message: "portfolio backtests must quantify opportunity cost when unbought ready candidates keep rising."
  },
  {
    pattern: /少赚约[\s\S]{0,900}机会成本回测[\s\S]{0,700}等待后继续走强/,
    message: "portfolio diagnostics must explain missed follow-through in user-readable opportunity-cost terms."
  },
  {
    pattern: /function hasRecentPortfolioBuyForCode[\s\S]{0,900}item\.side === "BUY"[\s\S]{0,500}!\["cancelled", "rejected"\]\.includes\(item\.status\)/,
    message: "missed-ready-candidate diagnostics must ignore candidates with recent valid buy orders."
  },
  {
    pattern: /买点错过回测[\s\S]{0,700}自选池ready不能只收藏/,
    message: "portfolio capability queue must force trial-or-downgrade actions for missed ready candidates."
  },
  {
    pattern: /机会成本回测[\s\S]{0,700}等待后继续走强要被追责/,
    message: "portfolio capability queue must turn missed follow-through into a concrete repair task."
  },
  {
    pattern: /利润回吐放任回测[\s\S]{0,700}浮盈回吐不是纸面波动/,
    message: "portfolio capability queue must turn unprotected profit giveback into a concrete sell-discipline repair task."
  },
  {
    pattern: /过度保守回测[\s\S]{0,700}连续等待不能算完成工作/,
    message: "portfolio capability queue must turn over-conservative replays into concrete redeployment tasks."
  },
  {
    pattern: /frozenDecisionRuns[\s\S]{0,1000}仓位冻结回测[\s\S]{0,500}不能只把仓位停在第一轮操作/,
    message: "portfolio backtest diagnostics must detect frozen position structure across repeated decision runs."
  },
  {
    pattern: /仓位冻结回测[\s\S]{0,700}仓位不能停在第一轮操作/,
    message: "portfolio capability queue must turn frozen-position replays into concrete position-change tasks."
  },
  {
    pattern: /db\.dailyEquity\.push\(\{[\s\S]{0,600}positionWeightPct: db\.account\.positionWeightPct[\s\S]{0,220}pendingWeightPct: db\.account\.pendingWeightPct/,
    message: "portfolio valuation history must persist position and pending weights."
  },
  {
    pattern: /function summarizePortfolioEquityBrief[\s\S]{0,900}resolvePortfolioStoredWeightPct\(item\.positionWeightPct, investedValue, totalAsset\)[\s\S]{0,900}resolvePortfolioStoredWeightPct\(item\.pendingWeightPct, pendingBuyAmount \+ receivableCash, totalAsset\)/,
    message: "portfolio equity history summaries must derive missing or stale 0% historical weights instead of displaying 0%."
  },
  {
    pattern: /function resolvePortfolioStoredWeightPct[\s\S]{0,500}stored > 0[\s\S]{0,500}numerator \/ basis \* 100/,
    message: "portfolio stored weight recovery must recompute stale zero weights from ledger amounts."
  },
  {
    pattern: /function buildPortfolioRedeploymentPlan[\s\S]{0,1200}resolvePortfolioStoredWeightPct\(account\.positionWeightPct, investedValue, totalAsset\)/,
    message: "portfolio redeployment pressure must not treat stale 0% stored weights as a true empty portfolio."
  },
  {
    pattern: /function processPortfolioOrderLifecycle[\s\S]{0,2200}order\.confirmDate <= now\.date && shouldRejectImpossiblePortfolioSellOrder[\s\S]{0,260}rejectImpossiblePortfolioSellOrder[\s\S]{0,900}resolveOrderNavSnapshot/,
    message: "portfolio order lifecycle must reject old impossible sell orders before depending on NAV fetches."
  },
  {
    pattern: /function buildPortfolioCapabilityDiagnostics[\s\S]{0,5200}盈利能力承压[\s\S]{0,5200}追涨暴露待消化[\s\S]{0,5200}数据质量缺口/,
    message: "portfolio capability diagnostics must cover profitability, chase-risk exposure, and data-quality gaps."
  },
  {
    pattern: /function buildPortfolioCapabilityActionQueue[\s\S]{0,3600}先解释亏损来源[\s\S]{0,3600}暂停新增同线买入[\s\S]{0,3600}重复订单/,
    message: "portfolio capability diagnostics must become required repair tasks before the next decision."
  },
  {
    pattern: /function buildPortfolioManagerProfileContext[\s\S]{0,1200}历史回测诊断[\s\S]{0,1200}组合能力诊断[\s\S]{0,1200}能力修复队列/,
    message: "portfolio model context must carry capability diagnostics into every manager run."
  },
  {
    pattern: /const capabilityDiagnostics = buildPortfolioCapabilityDiagnostics\(db\)[\s\S]{0,160}const capabilityActionQueue = buildPortfolioCapabilityActionQueue\(db\)[\s\S]{0,2600}capabilityDiagnostics,[\s\S]{0,120}capabilityActionQueue/,
    message: "portfolio decision runs must pass full-ledger capability diagnostics, including transactions and failed runs, into the model prompt."
  },
  {
    pattern: /组合能力诊断（系统计算，必须先处理，不能只写套话）[\s\S]{0,700}能力修复队列（必须进入 team\.主席、team\.风控经理、actions 或 learningNotes）/,
    message: "portfolio decision prompt must force capability repair before new buy decisions."
  },
  {
    pattern: /function buildPortfolioRedeploymentPlan[\s\S]{0,5200}pressureActive[\s\S]{0,5200}starter_buy[\s\S]{0,5200}实时估算时间/,
    message: "portfolio redeployment plan must force high-cash low-exposure portfolios to review starter buys with realtime valuation evidence."
  },
  {
    pattern: /function ensurePortfolioRedeploymentPlanReviewed[\s\S]{0,2600}0\.5%-2\.5%试探[\s\S]{0,1200}portfolio_redeployment_guard/,
    message: "portfolio redeployment guard must inject small starter-buy reviews instead of allowing generic waiting."
  },
  {
    pattern: /现金再部署纪律（系统计算；高现金低仓位时必须处理，不能只写等待机会）[\s\S]{0,700}verified_buy\/starter_buy/,
    message: "portfolio decision prompt must include deterministic redeployment pressure and executable starter candidates."
  },
  {
    pattern: /async function fetchPortfolioWatchlistSeedCandidates[\s\S]{0,900}shouldForcePortfolioRedeploymentSeedScan[\s\S]{0,900}PORTFOLIO_REDEPLOYMENT_SEED_LIMIT/,
    message: "portfolio watchlist seeding must keep scanning low-position candidates when high-cash redeployment has no executable setup."
  },
  {
    pattern: /function formatPortfolioCustomerActionLine[\s\S]{0,900}理由：\$\{reason\}[\s\S]{0,600}看点：\$\{logic\.join\("；"\)\}[\s\S]{0,400}\.join\("\\n"\)/,
    message: "portfolio decision cards must split action reasoning into readable lines instead of one dense numeric paragraph."
  },
  {
    pattern: /portfolioCapabilitySummary[\s\S]{0,500}buildCapabilityInsightItems|buildCapabilityInsightItems[\s\S]{0,500}portfolioCapabilitySummary/,
    message: "admin portfolio UI must show capability diagnostics instead of hiding manager weaknesses in raw JSON."
  },
  {
    pattern: /portfolioCapabilityActionQueue[\s\S]{0,600}renderCapabilityActionQueue|renderCapabilityActionQueue[\s\S]{0,600}portfolioCapabilityActionQueue/,
    message: "admin portfolio UI must show the manager's concrete capability repair queue."
  },
  {
    pattern: /portfolioBacktestSummary[\s\S]{0,700}buildBacktestInsightItems|buildBacktestInsightItems[\s\S]{0,700}portfolioBacktestSummary/,
    message: "admin portfolio UI must show historical backtest diagnostics, not only current-state diagnostics."
  },
  {
    pattern: /portfolio-insight-grid[\s\S]{0,180}repeat\(auto-fit,\s*minmax\(250px,\s*1fr\)\)/,
    message: "admin portfolio insight cards must remain responsive after adding capability diagnostics."
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
    pattern: /team:\s*sanitizePortfolioPublicReportValue\(\(run\.team \|\| \[\]\)\.slice/,
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
    pattern: /function collectPortfolioSellDisciplineSignals[\s\S]{0,4000}effectiveProfitGiveback[\s\S]{0,4000}actionability\.action === "wait"[\s\S]{0,300}缺少当前净值/,
    message: "sell discipline must accept stale wait-position giveback evidence before reducing a holding."
  },
  {
    pattern: /function collectPortfolioSellDisciplineSignals[\s\S]{0,5200}同题材暴露[\s\S]{0,260}底层重叠[\s\S]{0,260}降低集中风险/,
    message: "sell discipline must accept portfolio exposure concentration as a valid staged reduction signal."
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
    pattern: /function parseDotEnvValue[\s\S]{0,520}replace\(\/\\s\+#\.\*\$\/g/,
    message: "dotenv parser must strip unquoted inline comments so model names do not include human notes."
  },
  {
    pattern: /next\.modelName\s*=\s*normalizeModelName\(next\.modelName \|\| "gpt-5\.5"\)/,
    message: "effective config must sanitize model names polluted by inline comments."
  },
  {
    pattern: /buildModelConfigCommentDiagnostic\(last\)/,
    message: "runtime diagnostics must explicitly flag model names polluted by inline comments."
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
    pattern: /function getRuntimeStats\(\)[\s\S]{0,260}shouldPersistRuntimeStats\(\)[\s\S]{0,180}runtimeStatsMemoryCache/,
    message: "capability checks must read in-memory runtime stats instead of polluted production stats."
  },
  {
    pattern: /function updateStats[\s\S]{0,700}shouldPersistRuntimeStats\(\)[\s\S]{0,180}fs\.writeFileSync\(STATS_PATH[\s\S]{0,260}runtimeStatsMemoryCache/,
    message: "capability checks must not write synthetic diagnostic counters into data/stats.json."
  },
  {
    pattern: /function shouldPersistRuntimeStats[\s\S]{0,220}FUNDAGENT_SKIP_SERVER_START[\s\S]{0,220}FUNDAGENT_PERSIST_TEST_STATS/,
    message: "runtime stats persistence must be disabled by default in test imports with an explicit opt-in override."
  },
  {
    pattern: /function getRuntimeStats\(\)[\s\S]{0,360}diagnostics:\s*buildRuntimeDiagnostics\(stats\)/,
    message: "runtime stats must expose diagnostics so manager degradation is visible."
  },
  {
    pattern: /buildStatsIntegrityDiagnostic\(stats\)/,
    message: "runtime diagnostics must detect stats that look like test noise rather than customer activity."
  },
  {
    pattern: /统计样本疑似测试噪音[\s\S]{0,360}没有真实消息、回复或组合任务/,
    message: "stats integrity diagnostics must explain when local counters should not be treated as real manager history."
  },
  {
    pattern: /buildFundAnswerQualityIssueDiagnostic\(last\)/,
    message: "runtime diagnostics must translate recent answer-quality issue codes into actionable Chinese notes."
  },
  {
    pattern: /回调\/低位启动请求存在硬凑或错推风险/,
    message: "answer-quality diagnostics must explain pullback hard-pick and share-class fee failures."
  },
  {
    pattern: /主推荐缺少A\/C份额和费用依据/,
    message: "answer-quality diagnostics must explain missing share-class fee evidence."
  },
  {
    pattern: /市场快照失败/,
    message: "runtime diagnostics must highlight market snapshot failures."
  },
  {
    pattern: /持仓补全失败/,
    message: "runtime diagnostics must highlight top-holdings enrichment failures."
  },
  {
    pattern: /模型上下文超限/,
    message: "runtime diagnostics must highlight context-window failures."
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
    pattern: /id:\s*"precious_metals"[\s\S]{0,260}fundKeywords:\s*\["黄金",\s*"贵金属",\s*"白银"\]/,
    message: "precious-metal theme matching must not treat broad 有色 funds as gold by default."
  },
  {
    pattern: /function inferPullbackSetupSearchKeywords[\s\S]{0,1200}\.filter\(\(keyword\)\s*=>\s*allowPrecious\s*\|\|\s*!isPreciousMetalKeyword\(keyword\)\)/,
    message: "generic pullback/setup discovery must suppress precious-metal search keywords unless explicitly requested."
  },
  {
    pattern: /function fetchPullbackSetupCandidates[\s\S]{0,1600}\.filter\(\(item\)\s*=>\s*!shouldSuppressPreciousMetalCandidate\(userText,\s*item\)\)/,
    message: "generic pullback/setup discovery must not seed gold candidates unless the user asks for gold."
  },
  {
    pattern: /function scorePullbackSetupSeedCandidate[\s\S]{0,120}shouldSuppressPreciousMetalCandidate\(userText,\s*item\)[\s\S]{0,80}return -1000/,
    message: "generic pullback/setup scoring must strongly suppress gold candidates unless explicitly requested."
  },
  {
    pattern: /function fetchMarketDeepDive[\s\S]{0,1800}\.filter\(\(item\)\s*=>\s*!shouldSuppressPreciousMetalCandidate\(userText,\s*item\)\)/,
    message: "generic recommendation deep dives must not let gold candidates crowd out other sectors."
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
    pattern: /buildFundActionabilitySignals[\s\S]{0,4400}getActionabilityIntradayDiscipline\(digest[\s\S]{0,1100}boundedScore = Math\.min\(boundedScore, intradayDiscipline\.scoreCap\)/,
    message: "fund actionability must cap buy/staged-buy scores when intraday valuation fades from the high."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,5200}getActionabilityValuationSourceDiscipline\(digest[\s\S]{0,1100}boundedScore = Math\.min\(boundedScore, valuationSourceDiscipline\.scoreCap\)/,
    message: "fund actionability must cap buy/staged-buy scores when realtime valuation sources disagree."
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
    pattern: /function getActionabilityIntradayDiscipline[\s\S]{0,1600}冲高回落\|尾盘转弱[\s\S]{0,800}不能把估算涨幅当追买理由/,
    message: "fund actionability intraday discipline must explain fading valuation downgrades in Chinese."
  },
  {
    pattern: /function getActionabilityValuationSourceDiscipline[\s\S]{0,1100}系统估值源分歧降级[\s\S]{0,500}不能把单一估算源当作买点确认/,
    message: "fund actionability valuation-source discipline must explain conflicting realtime estimates in Chinese."
  },
  {
    pattern: /function buildFundValuationSourceAgreement[\s\S]{0,1100}mild_divergence[\s\S]{0,700}实时估值源明显分歧/,
    message: "fund valuation agreement must classify primary/supplemental realtime source divergence."
  },
  {
    pattern: /async function fetchFundResearchDigest[\s\S]{0,3200}intradayTrend:\s*valuation\.intradayTrend \|\| null/,
    message: "fund research digest must pass realtime intraday valuation trend into actionability."
  },
  {
    pattern: /async function fetchFundResearchDigest[\s\S]{0,900}valuationSourceAgreement = buildFundValuationSourceAgreement\(valuation\)[\s\S]{0,2600}valuationSourceAgreement/,
    message: "fund research digest must pass realtime valuation-source agreement into actionability."
  },
  {
    pattern: /async function fetchFundProfile[\s\S]{0,2600}buildFundActionabilitySignals\([\s\S]{0,900}intradayTrend:\s*valuation\.intradayTrend \|\| null/,
    message: "fund profile actionability must consume realtime intraday valuation trend."
  },
  {
    pattern: /async function fetchFundProfile[\s\S]{0,900}valuationSourceAgreement = buildFundValuationSourceAgreement\(valuation\)[\s\S]{0,2200}valuationSourceAgreement/,
    message: "fund profile actionability must consume realtime valuation-source agreement."
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
  },
  {
    pattern: /function compactPortfolioActionabilityProfile[\s\S]{0,1100}normalizePortfolioActionabilityText[\s\S]{0,500}decisiveEvidence:\s*normalizePortfolioActionabilityList[\s\S]{0,260}decisionBlocker:\s*normalizePortfolioActionabilityList/,
    message: "public compact actionability evidence must localize legacy internal labels before admin display."
  },
  {
    pattern: /function normalizePortfolioActionabilityText[\s\S]{0,520}normalizePortfolioUserFacingText[\s\S]{0,520}watch\\s\*\\\/\\s\*test/,
    message: "portfolio actionability sanitizer must translate watch/test and internal fund labels."
  },
  {
    pattern: /function normalizeUserFacingFundAnswer[\s\S]{0,3600}return compactUserFacingFundMetricLines\(output\)/,
    message: "fund answer normalization must compact dense metric lines before users see them."
  },
  {
    pattern: /function compactUserFacingFundMetricLine[\s\S]{0,1800}其余明细交给配图和后续复盘/,
    message: "dense metric line compaction must preserve readability and point users to charts/reviews for details."
  },
  {
    pattern: /PORTFOLIO_USER_FACING_SECTION_PATTERN[\s\S]{0,900}function formatReadablePortfolioUserFacingText[\s\S]{0,1200}splitOverlongPortfolioActionLine/,
    message: "portfolio reports must insert readable section spacing and split overlong action lines."
  },
  {
    pattern: /function hasNumericDumpWithoutInterpretation[\s\S]{0,900}hasDenseUserFacingMetricLine/,
    message: "fund answer quality gate must catch dense single-fund metric lines, not only long full-answer dumps."
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
