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
    pattern: /function compactThemeRadarForModel[\s\S]{0,1200}\n\s*(?:stage|positionSignal|actionBias|stageText|positionSignalText|actionBiasText|leaderSignal|capitalFollowScore|preheatScore|newsLogic)\s*:/,
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
    pattern: /async function fetchFundValuation\([\s\S]{0,7000}fetchFundValuationFromPingzhongData[\s\S]{0,65000}function parseFundPingzhongLatestNav[\s\S]{0,700}Data_netWorthTrend/,
    message: "fund valuation must fall back to Eastmoney pingzhongdata latest official NAV when intraday estimates are unavailable or stale."
  },
  {
    pattern: /async function fetchFundRecentNavHistory[\s\S]{0,2600}fetchFundPingzhongNavHistory[\s\S]{0,900}deepDiveNavHistoryFallbacks[\s\S]*function parseFundPingzhongNavHistoryPoints[\s\S]{0,900}Data_netWorthTrend/,
    message: "deep-dive trend checks must repair F10 NAV failures with Eastmoney pingzhongdata NAV history."
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
    pattern: /async function fetchFundValuation\([\s\S]{0,900}YANGJIBAO_PLUGIN_TOKEN[\s\S]{0,900}fetchFundValuationFromYangjibaoSearch[\s\S]{0,1200}shouldPreferYangjibaoFundValuation/,
    message: "fund valuation must optionally use Yangjibao browser-plugin realtime fund data when a token is configured."
  },
  {
    pattern: /function normalizeYangjibaoFundSearchValuation[\s\S]{0,2400}yangjibao_search_fund_realtime[\s\S]{0,500}盘中估算（养基宝实时源）/,
    message: "Yangjibao fund search rows must be normalized into traceable realtime valuation evidence."
  },
  {
    pattern: /(?=[\s\S]*async function fetchFundSearchCandidates[\s\S]{0,1200}fetchEastmoneyFundSearchCandidates[\s\S]{0,700}fetchYangjibaoFundSearchCandidates)(?=[\s\S]*function normalizeYangjibaoFundSearchCandidate[\s\S]{0,2600}yangjibao_search_fund_candidate[\s\S]{0,700}养基宝实时基金搜索)/,
    message: "fund candidate recall must supplement Eastmoney search with Yangjibao realtime fund-search candidates when configured."
  },
  {
    pattern: /function parseHaoetfQdiiValuationRows[\s\S]{0,2400}realtimePremiumPct[\s\S]{0,2400}benchmarkName[\s\S]{0,1800}function normalizeHaoetfQdiiValuationRow/,
    message: "HaoETF QDII source must parse realtime valuation, premium, and benchmark evidence."
  },
  {
    pattern: /if \(!isStaleFundValuation\(primary\)\) \{[\s\S]{0,260}augmentFundValuationWithSinaIntraday\([\s\S]{0,260}mergeYangjibaoFundValuation\(primary,\s*yangjibaoRealtime\)/,
    message: "fresh Tiantian/FundGZ valuations must still be supplemented with Yangjibao and Sina intraday trend evidence."
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
    pattern: /(?=[\s\S]*function buildPortfolioMarketSnapshotPrioritySeeds)(?=[\s\S]*portfolio_holding)(?=[\s\S]*portfolio_watchlist)(?=[\s\S]*user_portfolio_holding)(?=[\s\S]*function buildRealtimeFundValuationSeedItems)(?=[\s\S]*prioritySeeds)/,
    message: "portfolio market snapshots must prioritize held, watchlist, and user-held funds in the realtime valuation queue."
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
    pattern: /function compactThemeRadarForModel(?=[\s\S]{0,1800}板块位置)(?=[\s\S]{0,1800}主力节奏)(?=[\s\S]{0,1800}题材逻辑)(?=[\s\S]{0,1800}操作倾向)/,
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
    pattern: /check-deployment-state\.mjs[\s\S]*portfolioCapabilityActionQueue[\s\S]*capabilityDiagnostics[\s\S]*capabilityActionQueue/,
    message: "deployment checker must prove online admin and portfolio APIs expose capability repair features."
  },
  {
    pattern: /check-deployment-state\.mjs[\s\S]{0,5200}portfolio-terminal-shell[\s\S]{0,1600}PORTFOLIO_VIEW_GROUPS[\s\S]{0,1600}\.portfolio-terminal-shell/,
    message: "deployment checker must fail stale online portfolio pages that still use the old long vertical layout."
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
    pattern: /(?=[\s\S]*unsolicited_score_label)(?=[\s\S]*function isExplicitScoreRequest)(?=[\s\S]*function removeUnsolicitedScoreLabels)(?=[\s\S]*除非用户明确要求评分)/,
    message: "fund answer quality gate must reject unsolicited score labels and keep default answers action-and-reason first."
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
    pattern: /function evaluateFundAnswerQuality[\s\S]{0,5200}evaluateStaleFundEvidenceActionDiscipline/,
    message: "fund answer quality gate must reject buy language based on stale NAV/trend evidence."
  },
  {
    pattern: /function evaluateStaleFundEvidenceActionDiscipline[\s\S]{0,1400}stale_data_candidate_given_buy_execution[\s\S]{0,600}stale_data_candidate_given_buy_signal/,
    message: "stale evidence quality gate must distinguish stale-data buy execution and buy-signal leaks."
  },
  {
    pattern: /function evaluateFundAnswerQuality[\s\S]{0,5200}evaluateStaleThemeCatchdownAnswerDiscipline/,
    message: "fund answer quality gate must run stale-theme catchdown buy-language discipline."
  },
  {
    pattern: /function evaluateStaleThemeCatchdownAnswerDiscipline[\s\S]{0,1400}stale_theme_candidate_given_buy_execution[\s\S]{0,700}stale_theme_candidate_given_buy_signal/,
    message: "fund answer quality gate must reject buy language for stale-theme catchdown candidates."
  },
  {
    pattern: /function hasPositiveBuyIntentText[\s\S]{0,700}验证仓[\s\S]{0,700}小仓验证[\s\S]{0,700}少量参与[\s\S]{0,900}function hasNegativeBuyIntentText[\s\S]{0,900}不能[\s\S]{0,500}验证/,
    message: "buy-language detection must catch soft starter wording such as validation positions while preserving explicit no-buy wording."
  },
  {
    pattern: /function hasPositiveBuyIntentText[\s\S]{0,1200}首选[\s\S]{0,600}第一优先[\s\S]{0,900}主推荐[\s\S]{0,1200}function hasNegativeBuyIntentText[\s\S]{0,900}不是首选[\s\S]{0,900}不作为主推/,
    message: "fund answer quality must treat first-priority/preferred ranking wording as buy intent unless explicitly negated."
  },
  {
    pattern: /function hasPositiveBuyExecutionForFundCode[\s\S]{0,900}contextAfterCode[\s\S]{0,900}rawContext\.includes\(fundCode\)[\s\S]{0,1600}function hasPositiveBuyIntentForFundCode[\s\S]{0,900}contextAfterCode/,
    message: "fund-specific buy-language detection must inspect same-line clauses after the fund code, not only the code-containing clause."
  },
  {
    pattern: /function hasStaleThemeCatchdownEvidence[\s\S]{0,700}hasStaleThemeCatchdownRisk[\s\S]{0,260}hasThemeRetreatRisk[\s\S]{0,260}hasHoldingRealtimeCatchdownRisk[\s\S]{0,260}getTextualCatchdownWarnings\(candidate\)/,
    message: "stale-theme answer quality must reuse structured catchdown risk, weak-holdings pulse, and text-only catchdown warnings."
  },
  {
    pattern: /function hasStaleThemeCatchdownEvidence[\s\S]{0,500}getTextualCatchdownWarnings\(candidate\)/,
    message: "stale-theme answer quality must reuse text-only retreat/catchdown warnings."
  },
  {
    pattern: /function hasStaleThemeCatchdownEvidence[\s\S]{0,500}getUnrefreshedMarketThemeWarnings\(candidate\)\.length/,
    message: "stale-theme answer quality must reject buy wording when old theme labels are not confirmed by the current radar."
  },
  {
    pattern: /stale_theme_candidate_given_buy_execution[\s\S]{0,500}旧题材未被当前雷达确认[\s\S]{0,500}当前题材雷达重新确认/,
    message: "fund answer rewrite guidance must explain current-radar-unconfirmed old themes as zero-yuan observation, not buyable pullbacks."
  },
  {
    pattern: /function getActionabilityThemeRetreatDiscipline[\s\S]{0,700}getTextualCatchdownWarnings\(digest\)[\s\S]{0,500}系统文本接盘风险拦截/,
    message: "fund actionability must downgrade text-only catchdown risks before UI cards or model prompts can surface them as buyable."
  },
  {
    pattern: /function getActionabilityThemeRetreatDiscipline[\s\S]{0,1000}getUnrefreshedMarketThemeWarnings\(digest\)[\s\S]{0,500}系统当前题材雷达未确认/,
    message: "fund actionability must downgrade historical theme labels that are not confirmed by the current theme radar."
  },
  {
    pattern: /function hasActionabilityMicroStarterSupport[\s\S]{0,500}getTextualCatchdownWarnings\(digest\)\.length/,
    message: "theme micro-starter logic must not override text-only catchdown warnings."
  },
  {
    pattern: /function hasActionabilityMicroStarterSupport[\s\S]{0,650}getUnrefreshedMarketThemeWarnings\(digest\)\.length/,
    message: "theme micro-starter logic must not override current-radar-unconfirmed old theme warnings."
  },
  {
    pattern: /function classifyPullbackSetupCandidateForSummary[\s\S]{0,900}getTextualCatchdownWarnings\(candidate\)\.length/,
    message: "pullback/setup candidate bucketing must demote text-only catchdown risks before deterministic fallback can recommend them."
  },
  {
    pattern: /function buildPullbackSetupCandidateGaps[\s\S]{0,2600}getUnrefreshedMarketThemeWarnings\(candidate\)/,
    message: "pullback/setup watch gaps must explain old theme labels that are not confirmed by the current radar."
  },
  {
    pattern: /function scoreResearchDigestForPullbackSetup[\s\S]{0,3600}getUnrefreshedMarketThemeWarnings\(digest\)\.length[\s\S]{0,80}score\s*-=\s*54/,
    message: "pullback/setup scoring must heavily downgrade old theme labels that are not confirmed by the current radar."
  },
  {
    pattern: /function buildPullbackFallbackRecheckCondition[\s\S]{0,600}新鲜新闻\/政策\/订单\/产业预热[\s\S]{0,300}代表持仓\/前十大承载/,
    message: "catchdown fallback must explain the live catalyst, capital-return, and holdings-carrier evidence required to reopen review."
  },
  {
    pattern: /function getPullbackFallbackCatchdownWarnings[\s\S]{0,420}getUnrefreshedMarketThemeWarnings\(candidate\)[\s\S]{0,600}getStaleThemeCatchdownWarnings\(candidate\)/,
    message: "catchdown fallback must explain current-radar-unconfirmed old theme labels, not only retreat or stale catalyst warnings."
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
    pattern: /hasQualifiedPullbackMainCandidate\(candidates,\s*\{\s*requireThemeOpportunityBacking\s*\}\)/,
    message: "pullback/setup backfill must use deepDive-level current-theme requirements before deciding a main candidate is qualified."
  },
  {
    pattern: /function hasQualifiedPullbackMainCandidate\(candidates = \[\],\s*options = \{\}\)[\s\S]{0,520}requireThemeOpportunityBacking:\s*Boolean\(options\.requireThemeOpportunityBacking\)/,
    message: "qualified pullback main-candidate checks must pass current-theme requirements into candidate bucketing."
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
    pattern: /fetchYangjibaoChinaIndexQuotes[\s\S]{0,4200}yangjibao_plugin_index_data[\s\S]{0,1800}browser-plug-api\.yangjibao\.com\/index_data/,
    message: "market snapshots must include Yangjibao's public index source as supplemental real-time market temperature evidence."
  },
  {
    pattern: /process\.env\.YANGJIBAO_PLUGIN_TOKEN \? "http:\/\/browser-plug-api\.yangjibao\.com\/search_fund\?keyword=\{code\}" : ""/,
    message: "market snapshot sources must only claim Yangjibao fund-level realtime search when the plugin token is configured."
  },
  {
    pattern: /养基宝基金级实时估值未配置授权[\s\S]{0,260}具体基金估值仍需天天基金、Sina、HaoETF和东财净值交叉复核/,
    message: "market data quality notes must disclose when Yangjibao fund-level realtime valuation is not configured."
  },
  {
    pattern: /fetchChinaRealtimeIndexQuotes[\s\S]{0,2400}fetchYangjibaoChinaIndexQuotes[\s\S]{0,2400}fetchEastmoneyChinaIndexQuotes[\s\S]{0,2400}A股指数实时源（养基宝\+东方财富备份）/,
    message: "market snapshots must merge Yangjibao index temperature with an Eastmoney realtime A-share index backup."
  },
  {
    pattern: /function fetchEastmoneyChinaIndexQuotes[\s\S]{0,2200}CHINA_INDEX_SECIDS[\s\S]{0,1200}eastmoney_china_index_realtime/,
    message: "A-share market temperature must have a public Eastmoney realtime index fallback when Yangjibao is unavailable."
  },
  {
    pattern: /marketIndicators:\s*\{[\s\S]{0,260}chinaIndices[\s\S]{0,900}compactMarketQuoteItems\(summary\.marketIndicators\?\.chinaIndices/,
    message: "compact market snapshots must preserve Yangjibao China index evidence for model prompts."
  },
  {
    pattern: /A股指数温度[\s\S]{0,500}不能替代具体基金净值、前十大持仓和费用核验/,
    message: "fund and portfolio prompts must explain how to use Yangjibao index evidence without pretending it is fund-level valuation."
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
    pattern: /function recommendFundsWithModel[\s\S]{0,1800}marketSnapshotForModel = compactMarketSnapshotForModel\(marketSnapshot\)[\s\S]{0,4600}JSON\.stringify\(marketSnapshotForModel \|\| \{\}, null, 2\)/,
    message: "fund recommendation prompts must send compact market snapshots instead of full raw snapshots."
  },
  {
    pattern: /function answerFundQuestionWithModel[\s\S]{0,1800}marketSnapshotForModel = compactMarketSnapshotForModel\(marketSnapshot\)[\s\S]{0,3400}JSON\.stringify\(marketSnapshotForModel, null, 2\)/,
    message: "fund QA prompts must send compact market snapshots instead of full raw snapshots."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,7600}JSON\.stringify\(compactMarketSnapshotForModel\(marketSnapshot\), null, 2\)/,
    message: "portfolio decisions must use compact market snapshots to avoid model context-window failures."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,5000}每只基金最多保留3个最能改变动作的数字[\s\S]{0,260}不要连续罗列5日\/10日\/20日\/60日\/120日/,
    message: "portfolio decision prompts must reduce numeric dumps and prioritize customer-readable trend logic."
  },
  {
    pattern: /function evaluateFundAnswerQuality[\s\S]{0,3600}missing_result_sort_policy/,
    message: "fund answer quality must reject multi-candidate recommendations that omit a customer-readable sort policy."
  },
  {
    pattern: /function evaluateFundAnswerQuality[\s\S]{0,4300}missing_result_first_ranking_summary[\s\S]{0,1200}opening_metric_dump_before_result/,
    message: "fund answer quality must force result-first ranked summaries and reject metric-heavy openings."
  },
  {
    pattern: /function shouldRequireFundAnswerSortPolicy[\s\S]{0,900}fundCodes\.size >= 2[\s\S]{0,900}function hasFundAnswerSortPolicy[\s\S]{0,500}排序口径/,
    message: "fund answer quality must require and recognize customer-readable result ranking policies."
  },
  {
    pattern: /(?=[\s\S]*function getRequestedFundAnswerSortPriorities[\s\S]{0,1200}高夏普[\s\S]{0,1200}低回撤)(?=[\s\S]*function hasFundAnswerRequestedSortPolicy[\s\S]{0,700}getFundAnswerSortPolicyText)/,
    message: "fund answer quality must require the sort policy to follow user-specified priorities such as high-Sharpe or low-drawdown first."
  },
  {
    pattern: /function evaluateFundAnswerQuality[\s\S]{0,3600}hasFundAnswerRequestedSortOrderMismatch\(\{ text: rawText, userText, evidence \}\)[\s\S]{0,180}requested_result_sort_order_mismatch/,
    message: "fund answer quality must reject answers that state the requested priority but list candidates in the wrong evidence-backed order."
  },
  {
    pattern: /function hasFundAnswerRequestedSortOrderMismatch[\s\S]{0,900}extractAnswerRecommendationSection\(text\)[\s\S]{0,900}compareFundAnswerRankedCandidatesByRequestedPriority/,
    message: "fund answer quality must compare the answer's recommendation order against evidence-backed requested-priority scores."
  },
  {
    pattern: /(?=[\s\S]*function sortFundAnswerRankedCandidatesByRequestedPriority)(?=[\s\S]*function getFundAnswerPriorityScore[\s\S]{0,1200}risk_adjusted_quality[\s\S]{0,700}sharpe)(?=[\s\S]*function buildPullbackQualityFallbackAnswer[\s\S]{0,1800}sortFundAnswerRankedCandidatesByRequestedPriority)/,
    message: "deterministic fund fallbacks must actually reorder candidates by requested priorities such as high-Sharpe, not only state the policy."
  },
  {
    pattern: /function sortFundAnswerRankedCandidatesByRequestedPriority[\s\S]{0,420}compareFundAnswerRankedCandidatesByCustomerEligibility[\s\S]{0,700}function compareFundAnswerRankedCandidatesByCustomerEligibility[\s\S]{0,360}isFundAnswerLeaderboardNoBuyCandidate/,
    message: "high-Sharpe or low-drawdown ranking must not put stale-theme no-buy blockers ahead of buyable current-theme candidates."
  },
  {
    pattern: /function formatFundAnswerLeaderboardCandidate[\s\S]{0,420}buildFundAnswerLeaderboardRole(?=[\s\S]{0,520}首选)(?=[\s\S]{0,520}备选)(?=[\s\S]{0,520}只观察)/,
    message: "fund result leaderboards must label ranked funds as first choice, backup, or observation-only instead of dumping plain metrics."
  },
  {
    pattern: /function hasFundAnswerResultFirstRankingSummary[\s\S]{0,800}直接结论[\s\S]{0,500}结果榜/,
    message: "fund answer quality must recognize direct-conclusion plus result-board openings."
  },
  {
    pattern: /function hasMetricHeavyResultRankingSummary[\s\S]{0,900}结果榜[\s\S]{0,900}countUserFacingNonCodeMetricNumbers[\s\S]{0,900}reasonWords/,
    message: "fund answer quality must reject metric-heavy result leaderboards before they reach the customer."
  },
  {
    pattern: /推荐清单必须先写排序口径[\s\S]{0,900}高夏普[\s\S]{0,520}低回撤/,
    message: "fund recommendation prompts must mention high-Sharpe and low-drawdown ranking priorities."
  },
  {
    pattern: /多候选回答的前三行必须固定为[\s\S]{0,160}直接结论[\s\S]{0,160}排序口径[\s\S]{0,160}结果榜/,
    message: "fund recommendation prompts must force result-first leaderboard openings for multi-candidate answers."
  },
  {
    pattern: /结果榜只能写人话理由[\s\S]{0,220}不能把近5日[\s\S]{0,220}夏普[\s\S]{0,220}回撤/,
    message: "fund recommendation prompts must keep result leaderboards reason-first instead of metric-first."
  },
  {
    pattern: /榜单型回答必须短[\s\S]{0,180}最多3条为什么这样排[\s\S]{0,180}1条执行方案[\s\S]{0,180}最多2条决策边界/,
    message: "fund recommendation prompts must keep ranked answers concise instead of turning them into long metric reports."
  },
  {
    pattern: /短榜单模式[\s\S]{0,160}只写直接结论、排序口径、结果榜、为什么这样排、执行、边界[\s\S]{0,220}不要再追加推荐清单/,
    message: "fund recommendation prompts must make requested-priority answers use the short result leaderboard mode."
  },
  {
    pattern: /全文控制在 12-16 行内/,
    message: "fund recommendation prompts must set a short line budget for customer-facing ranked answers."
  },
  {
    pattern: /推荐清单：按排序口径/,
    message: "fund recommendation prompts must list candidates according to the declared sort policy."
  },
  {
    pattern: /function extractAnswerRecommendationSection[\s\S]{0,500}结果榜[\s\S]{0,220}推荐清单/,
    message: "fund recommendation quality must treat first-screen result leaderboards as recommendation sections."
  },
  {
    pattern: /function extractAnswerRecommendationSection[\s\S]{0,900}风险边界[\s\S]{0,160}风险提示[\s\S]{0,160}主要风险/,
    message: "fund recommendation extraction must not truncate result boards at plain-language phrases such as risk-adjusted returns."
  },
  {
    pattern: /function evaluateFundAnswerQuality[\s\S]{0,5200}verbose_result_answer_detail/,
    message: "fund answer quality must reject result-first answers that become verbose after the leaderboard."
  },
  {
    pattern: /function shouldRequireConciseFundResultAnswer[\s\S]{0,700}function hasVerboseFundResultAnswer[\s\S]{0,1300}metricDetailLines/,
    message: "fund answer quality must detect long metric-heavy ranked answers after the result board."
  },
  {
    pattern: /function isFundAnswerPriorityLeaderboardRequest[\s\S]{0,620}高夏普[\s\S]{0,220}低回撤[\s\S]{0,220}主力题材[\s\S]{0,120}优先[\s\S]*function hasVerboseFundResultAnswer[\s\S]{0,1100}!priorityAsk && lines\.length <= 10[\s\S]{0,520}lineLimit = priorityAsk \? 8[\s\S]{0,900}repeatedRecommendationSection/,
    message: "priority ranking requests such as high-Sharpe first must stay in short leaderboard mode instead of expanding into a repeated recommendation report."
  },
  {
    pattern: /function isFundAnswerPriorityLeaderboardRequest[\s\S]{0,900}太啰嗦[\s\S]{0,220}干巴巴[\s\S]{0,220}直接给[\s\S]{0,220}结果[\s\S]{0,220}少报数据/,
    message: "customer complaints about verbosity or metric dumps must also trigger short result-leaderboard mode."
  },
  {
    pattern: /function buildConciseFundResultAnswerFallback[\s\S]{0,1200}最多3条为什么这样排|function buildConciseFundResultAnswerFallback[\s\S]{0,1800}为什么这样排/,
    message: "fund answer quality must have a deterministic compact fallback for verbose ranked answers."
  },
  {
    pattern: /function buildFundResultLeaderboardFallback[\s\S]{0,900}missing_result_first_ranking_summary[\s\S]{0,1600}sortFundAnswerRankedCandidatesByRequestedPriority[\s\S]{0,1300}结果榜/,
    message: "fund answer quality must have a deterministic result leaderboard fallback when ranked answers omit the first-screen result board."
  },
  {
    pattern: /const resultLeaderboardFallback = buildFundResultLeaderboardFallback[\s\S]{0,520}evaluateFundAnswerQuality[\s\S]{0,260}fundAnswerQualityDeterministicFallbacks/,
    message: "fund answer enforcement must try deterministic result leaderboards before relying on model rewrite for ordinary ranking failures."
  },
  {
    pattern: /质检问题包含 verbose_result_answer_detail[\s\S]{0,260}压缩为：直接结论、排序口径、结果榜、最多3条为什么这样排、1条执行、最多2条边界/,
    message: "fund answer rewrite guidance must compress verbose ranked answers into direct result-first summaries."
  },
  {
    pattern: /account\.cash 才是当下可动用现金[\s\S]{0,180}receivableCash 是赎回在途资金[\s\S]{0,180}不能当作已经到账的买入火力/,
    message: "portfolio decision prompts must distinguish deployable cash from unsettled redemption receivables."
  },
  {
    pattern: /function buildPortfolioDecisionWithModel[\s\S]{0,2400}compactHeldProfiles = \(heldProfiles \|\| \[\]\)\.map\(compactPortfolioReviewProfile\)[\s\S]{0,5600}JSON\.stringify\(compactHeldProfiles, null, 2\)/,
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
    pattern: /function selectFeishuHighlightLines(?=[\s\S]{0,1200}题材为什么动)(?=[\s\S]{0,1200}主力资金)(?=[\s\S]{0,1200}代表基金)(?=[\s\S]{0,1200}接盘风险)(?=[\s\S]{0,1200}旧题材未确认)(?=[\s\S]{0,1200}历史热点)/,
    message: "Feishu card summaries must prioritize theme catalyst, capital-flow, representative-fund carrier logic, catchdown warnings, and current-radar-unconfirmed old-theme risks."
  },
  {
    pattern: /function inferFeishuCardTone[\s\S]{0,700}旧题材未确认[\s\S]{0,260}未被当前题材雷达确认/,
    message: "Feishu card headers must turn current-radar-unconfirmed old-theme replies into risk-first cards."
  },
  {
    pattern: /function formatPortfolioCustomerNextStepLines[\s\S]{0,1600}确认前不追加[\s\S]{0,900}不急着追进同一热门方向/,
    message: "portfolio reports must explain next-step operating logic instead of only dumping metrics."
  },
  {
    pattern: /function formatPortfolioCustomerOrderLine[\s\S]{0,1200}确认前不追加[\s\S]{0,900}formatPortfolioCustomerTransactionLine[\s\S]{0,900}按低位修复是否延续/,
    message: "portfolio order and transaction lines must be customer-readable and avoid NAV/share metric dumps."
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
    pattern: /function processPortfolioOrderLifecycle[\s\S]{0,3600}hasPortfolioTransactionForOrderDedupe[\s\S]{0,260}rejectDuplicatePortfolioConfirmOrder[\s\S]{0,2800}function hasPortfolioTransactionForOrderDedupe/,
    message: "portfolio order lifecycle must reject duplicate same-day same-fund confirmations before recording another transaction."
  },
  {
    pattern: /现金闲置风险[\s\S]{0,360}不能只说等待机会/,
    message: "portfolio capability diagnostics must flag high-cash over-waiting as an actionable manager weakness."
  },
  {
    pattern: /候选数据源阻塞回测[\s\S]{0,1400}抓取失败当成没有机会/,
    message: "portfolio backtests must turn data-blocked candidates into explicit data-source repair work."
  },
  {
    pattern: /function findMostRecentPortfolioBuyActivity[\s\S]{0,1200}cancelled[\s\S]{0,260}rejected[\s\S]{0,260}status/,
    message: "portfolio capability diagnostics must treat fresh pending buy orders as recent buy activity."
  },
  {
    pattern: /function getPortfolioDiagnosticOrders[\s\S]{0,700}activeOrders[\s\S]{0,500}recentOrders[\s\S]{0,900}function getPortfolioDiagnosticTransactions[\s\S]{0,500}recentTransactions/,
    message: "portfolio diagnostics must read public recentOrders/activeOrders as well as raw ledger orders."
  },
  {
    pattern: /试探仓跟踪[\s\S]{0,700}加到3%-5%[\s\S]{0,260}继续观察[\s\S]{0,260}退出/,
    message: "portfolio capability diagnostics must require explicit follow-through after starter buy orders."
  },
  {
    pattern: /function buildPortfolioStarterBuyFollowUpQueue[\s\S]{0,5200}确认前不追加/,
    message: "portfolio starter-buy follow-up queues must keep the no-add-before-confirmation rule."
  },
  {
    pattern: /function ensurePortfolioStarterBuyFollowUpReviewed[\s\S]{0,2600}portfolio_starter_buy_follow_up_guard/,
    message: "portfolio decisions must force scale/hold/exit follow-up for pending or confirmed starter buys."
  },
  {
    pattern: /已提交\/已确认小仓试探跟踪队列（必须逐只处理）[\s\S]{0,700}确认前不能追加买入[\s\S]{0,260}加到3%-5%/,
    message: "portfolio prompts must expose starter-buy follow-up queues to the model."
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
    pattern: /function isAnswerWatchlistRejectedContext[\s\S]{0,700}接盘[\s\S]{0,220}主力/,
    message: "answer-derived watchlist updates must treat catchdown, theme retreat, main-capital withdrawal, and stale-catalyst wording as rejected no-buy context."
  },
  {
    pattern: /function buildPortfolioWatchlistUpdatesFromAnswerProfiles[\s\S]{0,900}getAnswerWatchlistHardRiskWarnings\(profile\)[\s\S]{0,700}rejectedByHardRisk[\s\S]{0,700}blocked/,
    message: "answer-derived watchlist updates must block structured catchdown/theme-support risks even when the model answer sounds positive."
  },
  {
    pattern: /function isAnswerWatchlistCatchdownRisk[\s\S]{0,900}hasStaleThemeCatchdownRisk/,
    message: "answer-derived watchlist updates must detect stale-catchdown exclusions separately from generic blocked candidates."
  },
  {
    pattern: /function buildPortfolioWatchlistUpdatesFromAnswerProfiles[\s\S]{0,3200}接盘风险排除候选/,
    message: "answer-derived watchlist updates must label stale-catchdown exclusions as catchdown-risk excluded candidates."
  },
  {
    pattern: /function buildAnswerWatchBuyTriggers[\s\S]{0,500}主力资金回流[\s\S]{0,160}代表持仓止跌/,
    message: "answer-derived watchlist stale-catchdown triggers must require capital return and representative holdings stabilization."
  },
  {
    pattern: /function formatAnswerWatchPositionPlan[\s\S]{0,500}0元观察[\s\S]{0,160}不是低位启动/,
    message: "answer-derived watchlist stale-catchdown position plans must stay at zero-yuan observation."
  },
  {
    pattern: /function getAnswerWatchlistHardRiskWarnings[\s\S]{0,1000}getPortfolioActionableThemeSupportGap\(profile\)[\s\S]{0,500}function isAnswerWatchlistHardRiskText/,
    message: "answer-derived watchlist hard-risk detection must include missing current theme support, retreat, stale radar, and catchdown warnings."
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
    pattern: /function selectFundWorkflowWatchlistCandidates[\s\S]{0,520}hasFundWorkflowWatchlistThemeBlocker/,
    message: "fund workflow watchlist reuse must exclude stale-theme or no-current-radar candidates before they enter recommendation context."
  },
  {
    pattern: /function hasFundWorkflowWatchlistThemeBlocker[\s\S]{0,1200}hasPortfolioCustomerThemeEvidenceBlocker/,
    message: "fund workflow watchlist theme blocker must reuse the shared stale-theme evidence blocker."
  },
  {
    pattern: /function selectFundWorkflowStaleWatchlistRefreshCandidates[\s\S]{0,420}hasFundWorkflowWatchlistThemeBlocker/,
    message: "fund workflow stale-refresh queue must not keep recycling candidates already blocked by stale theme evidence."
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
    pattern: /function formatPortfolioCustomerActionLine[\s\S]{0,400}formatPortfolioCustomerMoney\(action\.amount\)[\s\S]{0,500}目标约/,
    message: "portfolio action lines must round customer-facing amounts and target weights instead of showing accounting decimals."
  },
  {
    pattern: /function formatPortfolioCustomerActionLine[\s\S]{0,1400}summarizePortfolioCustomerFeeText[\s\S]{0,2600}function choosePortfolioCustomerSentence/,
    message: "portfolio customer-facing action lines must prioritize readable logic and translate fee numbers into share-class meaning."
  },
  {
    pattern: /function shortenPortfolioCustomerText[\s\S]{0,1200}compactNumericHeavyCustomerText[\s\S]{0,4500}function compactNumericHeavyCustomerText[\s\S]{0,900}maxNumbers/,
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
    pattern: /(?=[\s\S]*renderPortfolioDashboard)(?=[\s\S]*portfolioManagerSummary)(?=[\s\S]*portfolioHoldingSummary)(?=[\s\S]*portfolioReadinessSummary)/,
    message: "admin portfolio UI must provide a manager dashboard with summary, holdings exposure, and buy-preparation panels."
  },
  {
    pattern: /(?=[\s\S]*function inferThemeRetreatSignal)(?=[\s\S]*capitalRetreatScore)(?=[\s\S]*avgMainNetInflowPct)(?=[\s\S]*getActionabilityThemeRetreatDiscipline)(?=[\s\S]*getStaleThemeCatchdownWarnings)(?=[\s\S]*系统接盘风险拦截)(?=[\s\S]*题材退潮)(?=[\s\S]*主力资金撤离)/,
    message: "fund manager must block pullback-looking candidates when the theme is fading, main capital is leaving, or stale catchdown risk is detected."
  },
  {
    pattern: /(?=[\s\S]*const MARKET_BOARD_FETCH_MODES\s*=\s*\[[\s\S]*涨幅榜[\s\S]*跌幅榜[\s\S]*主力流入榜[\s\S]*主力流出榜)(?=[\s\S]*function fetchEastmoneyBoardCoverage)(?=[\s\S]*fetchEastmoneyBoardCoverage\("concept"\))(?=[\s\S]*fetchEastmoneyBoardCoverage\("industry"\))(?=[\s\S]*mergeMarketBoardCoverageItems)(?=[\s\S]*scoreThemeRadarPriority[\s\S]*capitalRetreatScore)/,
    message: "market board snapshots must merge gainers, losers, main inflow, and main outflow lists so theme-retreat detection is not blind to capital leaving."
  },
  {
    pattern: /(?=[\s\S]*function scoreThemeBoardRankSignals)(?=[\s\S]*mainInflowRankScore)(?=[\s\S]*mainOutflowRankScore)(?=[\s\S]*榜单线索)(?=[\s\S]*主力流入榜)/,
    message: "theme radar must score main-inflow/outflow leaderboard ranks and explain those board-rank signals in theme logic."
  },
  {
    pattern: /(?=[\s\S]*function hasStrongMainInflowRankSignal)(?=[\s\S]*function inferThemeStage[\s\S]{0,1200}mainInflowRankScore)(?=[\s\S]*function inferThemeLeaderSignal[\s\S]{0,1400}mainInflowRankScore)(?=[\s\S]*function inferThemePositionSignal[\s\S]{0,1100}mainInflowRankScore)/,
    message: "theme radar must treat top main-inflow leaderboard ranks as main-capital entry evidence even when numeric inflow is missing."
  },
  {
    pattern: /(?=[\s\S]*function inferThemeLeaderSignal)(?=[\s\S]*capitalFollowScore)(?=[\s\S]*preheatScore)(?=[\s\S]*主力跟随)(?=[\s\S]*题材逻辑)(?=[\s\S]*follow_main_small)/,
    message: "fund manager must identify main-capital entry, preheated themes, and news logic before ranking fund opportunities."
  },
  {
    pattern: /function isActionableThemeSupport[\s\S]{0,1700}traceableCatalystContext[\s\S]{0,700}preheatCatalyst && traceableCatalystContext/,
    message: "main-capital/preheat opportunities must require traceable fresh news or industry catalyst logic before entering actionable recall."
  },
  {
    pattern: /function hasFreshActionableThemeSupport[\s\S]{0,420}isFreshActionableThemeSupportForCandidate[\s\S]{0,700}hasFreshPullbackLowRotationThemeEvidence\(candidate,\s*theme\)/,
    message: "candidate-level actionable theme support must require fresh current-radar evidence for low-rotation labels."
  },
  {
    pattern: /function getPortfolioActionableThemeSupportGap[\s\S]{0,2200}hasFreshActionableThemeSupport\(candidate\)[\s\S]{0,260}低位轮动标签缺少当前题材雷达刷新/,
    message: "portfolio theme support gaps must block stale low-rotation labels before buy readiness."
  },
  {
    pattern: /(?=[\s\S]*function hasTraceableFreshThemeCatalystContext)(?=[\s\S]*latestNewsTime)(?=[\s\S]*快讯\|新闻源\|来源)(?=[\s\S]*function isThemeLowBaseMicroStarterSupport[\s\S]{0,500}hasTraceableFreshThemeCatalystContext\(theme\))/,
    message: "main-capital/preheat micro-starter buys must require traceable catalyst source or timestamp, not just generic newsLogic text."
  },
  {
    pattern: /function scoreThemeMainForceOpportunity[\s\S]{0,700}traceableCatalyst[\s\S]{0,700}leaderBonus[\s\S]{0,500}&& traceableCatalyst/,
    message: "main-force theme scoring must only grant leader/preheat bonus when the catalyst source is traceable."
  },
  {
    pattern: /(?=[\s\S]*function hasPositiveThemeMainCapitalEvidence)(?=[\s\S]*avgMainNetInflowPct)(?=[\s\S]*maxMainNetInflowPct)(?=[\s\S]*mainInflowRankScore)(?=[\s\S]*function isThemeLowBaseMicroStarterSupport[\s\S]{0,650}hasPositiveThemeMainCapitalEvidence\(theme\))/,
    message: "main-capital/preheat micro-starter buys must require positive fund-flow or main-inflow leaderboard confirmation."
  },
  {
    pattern: /function buildPortfolioThemeOpportunityPlan[\s\S]{0,3600}capitalFlowGap[\s\S]{0,500}hasPositiveThemeMainCapitalEvidence\(theme\)[\s\S]{0,700}缺少正向主力资金或主力流入榜确认/,
    message: "theme opportunity plans must downgrade traceable news/preheat candidates that lack positive main-capital confirmation."
  },
  {
    pattern: /(?=[\s\S]*function buildNewsCatalystProfile[\s\S]{0,1600}资金抢筹)(?=[\s\S]*function hasPositiveThemeMainCapitalEvidence[\s\S]{0,900}hasNewsMainCapitalEvidence)(?=[\s\S]*function hasNewsMainCapitalEvidence[\s\S]{0,900}主力资金[\s\S]{0,900}净流入)(?=[\s\S]*新闻提示资金抢筹)/,
    message: "theme radar must treat fresh traceable main-capital news as positive capital evidence for preheat follow-through."
  },
  {
    pattern: /(?=[\s\S]*function hasConflictingThemeCapitalOutflow[\s\S]{0,900}avgFlow[\s\S]{0,300}<= -0\.8)(?=[\s\S]*function hasPositiveThemeMainCapitalEvidence[\s\S]{0,500}hasConflictingThemeCapitalOutflow\(theme\)\) return false)(?=[\s\S]*function hasNewsMainCapitalEvidence[\s\S]{0,260}hasConflictingThemeCapitalOutflow\(theme\)\) return false)/,
    message: "fresh news main-capital claims must not override confirmed board outflow or retreating capital evidence."
  },
  {
    pattern: /(?=[\s\S]*function isStaleThemeCatchdownRiskTheme[\s\S]{0,900}leaderSignal === "capital_outflow")(?=[\s\S]*function hasThemeCapitalRetreatRisk[\s\S]{0,900}leaderSignal === "capital_outflow")/,
    message: "theme retreat and catchdown guards must treat main-force capital_outflow leader signals as hard no-buy risk."
  },
  {
    pattern: /function hasUsableThemeLowRotationSupport[\s\S]{0,220}hasConflictingThemeCapitalOutflow\(theme\)\) return false[\s\S]{0,900}minRotation[\s\S]{0,500}lowPosition >= minLowPosition/,
    message: "low-position rotation support must reject themes whose related boards show confirmed main-capital outflow."
  },
  {
    pattern: /function scoreNewsMainCapitalConfirmation[\s\S]{0,1500}资金抢筹[\s\S]{0,900}主力资金[\s\S]{0,900}return Math\.min\(44,\s*score\)/,
    message: "theme radar must convert explicit main-capital news into a bounded capital-follow boost."
  },
  {
    pattern: /function hasNewsMainCapitalEvidence[\s\S]{0,900}主力资金\|主力\|资金[\s\S]{0,900}function hasThemeLeaderOrPreheatSignal/,
    message: "main-capital evidence must recognize short news phrasing such as 主力净流入, not only 主力资金净流入."
  },
  {
    pattern: /scoreNewsMainCapitalConfirmation\(newsCatalystProfile,\s*news\);[\s\S]{0,4500}\+ newsMainCapitalScore/,
    message: "theme radar scoring must feed news main-capital confirmation into theme scores."
  },
  {
    pattern: /newsMainCapitalScore:\s*round\(newsMainCapitalScore,\s*1\)/,
    message: "theme radar must expose the news main-capital confirmation score for diagnostics."
  },
  {
    pattern: /(?=[\s\S]*function buildThemeNewsFreshnessProfile)(?=[\s\S]*function parseThemeNewsTimeMs)(?=[\s\S]*MARKET_THEME_NEWS_FRESH_HOURS)(?=[\s\S]*function hasFreshThemeCatalystContext[\s\S]{0,260}catalystProfile\?\.fresh !== false)/,
    message: "theme catalyst logic must track headline freshness and block stale news from actionable main-capital/preheat support."
  },
  {
    pattern: /function buildThemeNewsFreshnessProfile[\s\S]{0,900}news \|\| \[\]\)\.length[\s\S]{0,500}新闻未标时间，不能当实时催化/,
    message: "theme catalyst freshness must reject news items that have no traceable timestamp."
  },
  {
    pattern: /function getStaleCatalystThemeWarnings[\s\S]{0,900}旧新闻\/旧催化[\s\S]{0,700}今天的买点/,
    message: "old catalysts must produce a customer-readable warning before they can be treated as setup evidence."
  },
  {
    pattern: /function getActionabilityThemeRetreatDiscipline[\s\S]{0,1600}getStaleCatalystThemeWarnings\(digest\)[\s\S]{0,500}系统旧催化降级/,
    message: "old catalysts must downgrade actionability even when they are not yet classified as hard catchdown risk."
  },
  {
    pattern: /buildThemeLeaderboards[\s\S]{0,1200}main_capital[\s\S]{0,700}hasTraceableFreshThemeCatalystContext\(theme\)[\s\S]{0,1800}preheat[\s\S]{0,700}hasTraceableFreshThemeCatalystContext\(theme\)/,
    message: "main-capital and preheat leaderboards must both require traceable fresh catalyst context."
  },
  {
    pattern: /buildThemeLeaderboards[\s\S]{0,1200}main_capital[\s\S]{0,900}hasPositiveThemeMainCapitalEvidence\(theme\)/,
    message: "main-capital leaderboard must require positive fund-flow or main-inflow leaderboard confirmation."
  },
  {
    pattern: /(?=[\s\S]*function buildNewsCatalystProfile)(?=[\s\S]*function scoreThemeCatalystQuality)(?=[\s\S]*政策落地)(?=[\s\S]*产业订单)(?=[\s\S]*外盘映射)(?=[\s\S]*风险提醒)(?=[\s\S]*催化性质)/,
    message: "theme news evidence must classify the catalyst type so the manager can explain why a sector is moving."
  },
  {
    pattern: /(?=[\s\S]*function hasActionabilityMicroStarterSupport)(?=[\s\S]*0\.5%-2\.5% 试探仓)(?=[\s\S]*系统小仓试探限制)(?=[\s\S]*microStarterSupport)/,
    message: "actionability must allow tiny starter positions for catalyst-backed main-capital setups without turning them into heavy buys."
  },
  {
    pattern: /(?=[\s\S]*function buildThemeLeaderboards)(?=[\s\S]*hasRetreatOrCatchdownRisk)(?=[\s\S]*isStaleThemeCatchdownRiskTheme)(?=[\s\S]*主力进场榜)(?=[\s\S]*题材预热榜)(?=[\s\S]*低位轮动榜)(?=[\s\S]*退潮回避榜)(?=[\s\S]*接盘风险)(?=[\s\S]*追涨风险榜)(?=[\s\S]*题材榜单)/,
    message: "market snapshots must expose theme leaderboards and route stale catchdown themes into retreat/avoid instead of low-rotation opportunity lanes."
  },
  {
    pattern: /buildThemeLeaderboards[\s\S]{0,2400}preheat[\s\S]{0,800}!hasConflictingThemeCapitalOutflow\(theme\)[\s\S]{0,900}low_rotation[\s\S]{0,800}hasUsableThemeLowRotationSupport\(theme/,
    message: "preheat and low-rotation leaderboards must not surface themes that conflict with main-capital outflow evidence."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioRankingCustomerActionDeck[\s\S]*hasCatchdownAvoid)(?=[\s\S]*接盘风险优先)(?=[\s\S]*新鲜新闻\/政策催化[\s\S]{0,180}主力资金回流[\s\S]{0,180}代表持仓止跌)/,
    message: "customer action cards must promote stale-theme catchdown risk above generic avoid guidance and explain the live evidence needed to reopen review."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioRankingCustomerDecisionSummary[\s\S]{0,900}isPortfolioCustomerCatchdownAvoidCard)(?=[\s\S]*\["sell", "avoid", "buy", "wait", "data"\])(?=[\s\S]*先排除接盘风险（暂不买）)/,
    message: "customer decision summaries must put catchdown avoidance before buy review when stale-theme pullbacks are present."
  },
  {
    pattern: /(?=[\s\S]*function resolvePortfolioPositiveWatchRankingGate)(?=[\s\S]*正向买入门禁拦截)(?=[\s\S]*function buildPortfolioBuyPreparationRanking[\s\S]{0,900}resolvePortfolioPositiveWatchRankingGate)(?=[\s\S]*function buildPortfolioLaunchSetupRanking[\s\S]{0,900}resolvePortfolioPositiveWatchRankingGate)(?=[\s\S]*function buildPortfolioCashRedeploymentRankingItem[\s\S]{0,900}resolvePortfolioPositiveWatchRankingGate)(?=[\s\S]*function buildPortfolioFitRankingItem[\s\S]{0,500}resolvePortfolioPositiveWatchRankingGate)(?=[\s\S]*function buildPortfolioThemeAllocationGroups[\s\S]{0,500}resolvePortfolioPositiveWatchRankingGate)(?=[\s\S]*function buildPortfolioThemeMomentumRankingItem[\s\S]{0,500}resolvePortfolioPositiveWatchRankingGate)(?=[\s\S]*function buildPortfolioRotationOpportunityRankingItem[\s\S]{0,500}resolvePortfolioPositiveWatchRankingGate)/,
    message: "positive portfolio rankings must use the stale-catchdown gate before surfacing buy-preparation, launch-setup, cash-redeployment, portfolio-fit, theme-allocation, theme-momentum, or rotation-opportunity candidates."
  },
  {
    pattern: /function buildPortfolioDecisionReadinessQueue[\s\S]{0,1200}resolvePortfolioPositiveWatchRankingGate[\s\S]{0,1200}positiveRankingGate/,
    message: "model readiness queues must carry the same positive-ranking no-buy gate so stale-theme pullbacks are not shown as merely high-readiness candidates."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioRankingCustomerActionDeck[\s\S]*hasMainForceBuy)(?=[\s\S]*主力预热复核优先)(?=[\s\S]*新闻来源\/时间[\s\S]{0,180}主力资金延续[\s\S]{0,180}0\.5%-1\.2%)/,
    message: "customer buy cards must prioritize fresh main-capital/preheat micro-starter opportunities with news, capital, and sizing constraints."
  },
  {
    pattern: /(?=[\s\S]*function sortPortfolioCustomerBuyActionItems)(?=[\s\S]*function isPortfolioCustomerMainForceBuyAction)(?=[\s\S]*主力预热微型复核)(?=[\s\S]*新鲜新闻\/政策\/订单逻辑[\s\S]{0,220}正向主力资金)/,
    message: "customer buy ordering and labels must distinguish main-capital/preheat micro-starter reviews from ordinary small-buy reviews."
  },
  {
    pattern: /function compactThemeLeaderboardItem[\s\S]{0,700}nextStep[\s\S]{0,260}invalidation[\s\S]{0,260}evidence/,
    message: "theme leaderboards must expose next steps, invalidation boundaries, and evidence chips instead of score-only theme items."
  },
  {
    pattern: /function buildThemeLeaderboardEvidenceChips[\s\S]{0,600}theme\.evidence\?\.news\?\.\[0\][\s\S]{0,900}新闻：/,
    message: "theme leaderboard evidence chips must include fresh news source/time evidence for why-move explanations."
  },
  {
    pattern: /function compactThemeLeaderboardItem[\s\S]{0,700}whyMove:\s*buildThemeLeaderboardWhyMove\(theme\)[\s\S]{0,900}function buildThemeLeaderboardWhyMove[\s\S]{0,900}为什么动/,
    message: "theme leaderboards must expose a customer-readable why-move line instead of only raw newsLogic or scores."
  },
  {
    pattern: /function buildThemeLeaderboardNextStep[\s\S]{0,900}preheat_catalyst_watch[\s\S]{0,500}hasPositiveThemeMainCapitalEvidence\(theme\)[\s\S]{0,500}0\.5%-1\.2%微型试探/,
    message: "funded preheat themes must escalate to representative-fund micro-starter review instead of generic observation."
  },
  {
    pattern: /function renderPortfolioThemeLeaderboardItem[\s\S]{0,1300}theme-leaderboard-evidence[\s\S]{0,900}theme-leaderboard-decision/,
    message: "admin theme leaderboards must render evidence chips and next-step cards for each theme."
  },
  {
    pattern: /function formatThemeLeaderboardEvidenceLines[\s\S]{0,900}下一步[\s\S]{0,500}失效[\s\S]{0,500}证据/,
    message: "portfolio model prompts must receive theme leaderboard next steps, invalidation boundaries, and evidence chips."
  },
  {
    pattern: /function formatThemeNewsHeadline/,
    message: "theme news logic must preserve source/time for catalyst explanations."
  },
  {
    pattern: /fetchMarketSnapshot[\s\S]{0,2200}fetchMarketFastNews/,
    message: "market snapshots must use the aggregated fast-news feed instead of depending on a single news source."
  },
  {
    pattern: /async function fetchMarketFastNews[\s\S]{0,1700}fetchEastmoneyFastNews[\s\S]{0,900}fetchSinaFastNews[\s\S]{0,900}fetchClsTelegraphNews[\s\S]{0,900}mergeFastNewsItems/,
    message: "theme news support must merge Eastmoney, Sina, and CLS fast-news sources so one source failure does not make the manager look offline."
  },
  {
    pattern: /function parseSinaFastNewsJsonp[\s\S]{0,1400}rich_text[\s\S]{0,900}sina_finance_7x24_news/,
    message: "Sina fast-news backup must parse rich_text headlines and expose a traceable source kind for catalyst explanations."
  },
  {
    pattern: /function parseClsTelegraphHtml[\s\S]{0,2400}cls_telegraph_news[\s\S]{0,900}decodeHtmlEntitiesBasic/,
    message: "CLS telegraph backup must parse HTML or embedded JSON headlines into traceable fast-news evidence."
  },
  {
    pattern: /(?=[\s\S]*THEME_NEWS_KEYWORD_EXPANSIONS)(?=[\s\S]*宇树)(?=[\s\S]*Optimus)(?=[\s\S]*GPU)(?=[\s\S]*空天经济)(?=[\s\S]*可回收火箭)(?=[\s\S]*function extractEmergingNewsTopicTerms[\s\S]{0,1400}应用商店)(?=[\s\S]*function buildNewsCatalystProfile[\s\S]{0,1200}产业落地)(?=[\s\S]*function buildNewsCatalystProfile[\s\S]{0,1500}技术突破)/,
    message: "theme news discovery must recognize hard-tech preheat catalysts such as humanoid robots, GPU/AI chips, and commercial-space license or breakthrough news."
  },
  {
    pattern: /新闻催化：\$\{formatThemeNewsHeadline\(news\[0\]\)\}/,
    message: "theme news logic must use the source/time-aware headline formatter."
  },
  {
    pattern: /function compactMatchedThemeSignal[\s\S]{0,1400}catalystProfile:\s*theme\.catalystProfile/,
    message: "matched fund themes must preserve catalyst type."
  },
  {
    pattern: /function hasStaleThemeCatchdownRisk/,
    message: "pullback candidates must expose stale theme catchdown detection."
  },
  {
    pattern: /function hasActionableThemeSupport/,
    message: "pullback candidates must expose actionable theme support detection."
  },
  {
    pattern: /function hasStaleThemeCatchdownEvidence[\s\S]{0,500}getPortfolioActionableThemeSupportGap\(candidate\)/,
    message: "answer quality must reject buy wording for theme-named candidates lacking current radar support."
  },
  {
    pattern: /function getPullbackFallbackCatchdownWarnings[\s\S]{0,500}getPortfolioActionableThemeSupportGap\(candidate\)/,
    message: "pullback deterministic fallback must explain missing current radar support for theme-named candidates."
  },
  {
    pattern: /hasPortfolioVerifiedSeedChaseRisk[\s\S]{0,900}hasStaleThemeCatchdownRisk/,
    message: "pullback candidates must block stale theme catchdown risk and require actionable theme support before buy readiness."
  },
  {
    pattern: /function hasThemeRetreatNoBuyOverride[\s\S]{0,300}hasStaleThemeCatchdownRisk[\s\S]{0,300}hasThemeRetreatRisk[\s\S]{0,700}function formatEntryBiasForCandidate[\s\S]{0,220}回调但不买/,
    message: "user-facing trend evidence must override buyable entry labels for stale-theme or capital-outflow pullbacks."
  },
  {
    pattern: /function formatPortfolioSeedVerifiedTrendEvidence[\s\S]{0,500}formatEntryBiasForCandidate\(trend\.entryBias,\s*profile\)[\s\S]{0,300}不能把回调当买点/,
    message: "verified trend evidence must not describe stale-theme pullbacks as buyable."
  },
  {
    pattern: /function getChartEntryDecision[\s\S]{0,300}hasThemeRetreatNoBuyOverride\(profile\)[\s\S]{0,220}回调不买/,
    message: "fund report chart buy tiles must display a no-buy label for stale-theme pullbacks."
  },
  {
    pattern: /function inferPullbackSetupSearchKeywords[\s\S]{0,1200}isStaleThemeCatchdownRiskTheme\(theme\)/,
    message: "pullback setup discovery keywords must exclude stale outflow themes."
  },
  {
    pattern: /function inferPullbackSetupSearchKeywords[\s\S]{0,1400}isActionableThemeSupport\(theme\)/,
    message: "pullback setup discovery keywords must expand actionable themes."
  },
  {
    pattern: /const unresolvedLeaderHeat = hasThemeLeaderOrPreheatSignal\(theme\) && !hasTraceableFreshThemeCatalystContext\(theme\);[\s\S]{0,220}leaderCandidate && hasTraceableFreshThemeCatalystContext\(theme\)/,
    message: "pullback setup discovery keywords must not expand main-capital/preheat themes whose catalyst source is not traceable."
  },
  {
    pattern: /function inferPullbackSetupSearchKeywords[\s\S]{0,1700}const capitalFlowConflict = hasConflictingThemeCapitalOutflow\(theme\);[\s\S]{0,280}lowRotationCandidate && !unresolvedLeaderHeat && !capitalFlowConflict[\s\S]{0,180}leaderCandidate && hasTraceableFreshThemeCatalystContext\(theme\) && !capitalFlowConflict/,
    message: "pullback setup discovery keywords must not expand low-rotation or preheat themes when board outflow conflicts with the setup."
  },
  {
    pattern: /function inferPullbackSetupSearchKeywords[\s\S]{0,2400}themeMatchesSearchText\(theme,\s*text\)[\s\S]{0,700}scopedRadarKeywords[\s\S]{0,700}\.\.\.baseKeywords,\s*\.\.\.scopedRadarKeywords/,
    message: "pullback/setup and portfolio seed recall must merge current theme-radar, board, news, and leader-stock keywords instead of being short-circuited by old broad sector terms."
  },
  {
    pattern: /(?=[\s\S]*function summarizePortfolioRunMarketSnapshot)(?=[\s\S]*compactThemeLeaderboardsForPublic)(?=[\s\S]*marketSnapshot:\s*summarizePortfolioRunMarketSnapshot\(run\.marketSnapshot\))/,
    message: "portfolio public run summaries must expose compact market theme leaderboards for the admin UI."
  },
  {
    pattern: /function summarizePortfolioRunMarketSnapshot[\s\S]{0,900}themeMainForcePlaybook[\s\S]{0,900}compactThemeMainForcePlaybookForPublic/,
    message: "portfolio public run summaries must expose the main-force playbook for admin UI and historical diagnostics."
  },
  {
    pattern: /(?=[\s\S]*function buildDynamicThemeRadarRules)(?=[\s\S]*buildDynamicThemeKeywords)(?=[\s\S]*dynamic_)(?=[\s\S]*discoveryScore)/,
    message: "theme radar must generate dynamic emerging themes from live concept and industry boards, not only a static dictionary."
  },
  {
    pattern: /(?=[\s\S]*function buildDynamicThemeRadarRules[\s\S]{0,2600}selectedBoards = selectDynamicThemeRadarBoardEntries\(boards,\s*10\))(?=[\s\S]*function selectDynamicThemeRadarBoardEntries[\s\S]{0,1200}freshNewsCount[\s\S]{0,260}catalystScore[\s\S]{0,900}addLane\(\(\) => true,\s*max\))/,
    message: "dynamic theme radar must reserve slots for fresh catalyst-backed preheat boards instead of letting hotter chasing boards crowd them out."
  },
  {
    pattern: /function selectThemeRadarThemes[\s\S]{0,900}addLane\(isThemeRadarMainCapitalOpportunity,\s*4\)[\s\S]{0,260}addLane\(isThemeRadarPreheatOpportunity,\s*4\)[\s\S]{0,260}addLane\(isThemeRadarLowRotationOpportunity,\s*3\)[\s\S]{0,260}addLane\(isThemeRadarRiskLane,\s*3\)/,
    message: "final theme radar selection must preserve main-capital, preheat, low-rotation, and risk lanes instead of using one blunt score slice."
  },
  {
    pattern: /(?=[\s\S]*THEME_NEWS_KEYWORD_EXPANSIONS)(?=[\s\S]*function expandThemeNewsKeywords)(?=[\s\S]*newsKeywords)(?=[\s\S]*buildNewsCatalystProfile\(matchedNews)/,
    message: "dynamic theme radar must expand news/current-event keywords so emerging sectors can explain why they are moving."
  },
  {
    pattern: /function buildNewsDiscoveredThemeRadarRules[\s\S]{0,1800}THEME_NEWS_DISCOVERY_RULES[\s\S]{0,1600}news_\$\{rule\.id\}/,
    message: "theme radar must discover preheated emerging themes from fast news before concept boards fully move."
  },
  {
    pattern: /(?=[\s\S]*GENERIC_THEME_NEWS_MATCH_TERMS)(?=[\s\S]*function buildSpecificThemeNewsKeywords)(?=[\s\S]*function matchesThemeSpecificNews)(?=[\s\S]*function buildNewsDiscoveredThemeRadarRules[\s\S]{0,700}matchesThemeSpecificNews)/,
    message: "theme news discovery must require specific theme anchors instead of mapping generic catalyst words such as orders or approvals to unrelated sectors."
  },
  {
    pattern: /(?=[\s\S]*function buildEmergingNewsTopicRadarRules)(?=[\s\S]*function extractEmergingNewsTopicTerms)(?=[\s\S]*news_auto_)(?=[\s\S]*newsOnlyPreheatBoost)(?=[\s\S]*newsDiscovered)(?=[\s\S]*新闻自动发现)/,
    message: "theme radar must auto-extract fresh news-only preheat topics instead of relying only on preset theme rules."
  },
  {
    pattern: /(?=[\s\S]*function extractEmergingNewsTopicTerms)(?=[\s\S]*主力资金\|资金\|ETF资金[\s\S]{0,420}净流入\|流入\|抢筹)(?=[\s\S]*function normalizeEmergingNewsTopicTerm[\s\S]{0,700}新品发布[\s\S]{0,260}订单加速落地[\s\S]{0,260}适配加速)/,
    message: "emerging news topic extraction must preserve specific main-capital theme names and strip event-tail words before representative-fund search."
  },
  {
    pattern: /(?=[\s\S]*function buildThemeRadar)(?=[\s\S]*marketEvidenceCoverageCount)(?=[\s\S]*Number\(theme\.marketEvidenceCoverageCount \|\| 0\) > 0)/,
    message: "theme radar must not surface broad static themes from fund vehicle names alone when no board, news, commodity, or overseas evidence exists."
  },
  {
    pattern: /function buildThemeMainForcePlaybook[\s\S]{0,7200}主力题材作战图[\s\S]{0,5200}carrierSearchKeywords[\s\S]{0,1200}carrierAnchors[\s\S]{0,3200}function collectThemeMainForcePlaybookOpportunityItems/,
    message: "theme radar must be converted into a main-force playbook with representative-fund search keywords and holding anchors."
  },
  {
    pattern: /function formatThemeMainForceCapitalProof[\s\S]{0,700}avgFlow > 0\.2[\s\S]{0,700}主力资金均值接近平衡[\s\S]{0,900}maxFlow >= 1\.5[\s\S]{0,900}最强相关板块小幅流入[\s\S]{0,300}尚未达到主力确认/,
    message: "main-force playbook capital proof must not describe near-zero or weak max flow as confirmed positive net inflow."
  },
  {
    pattern: /function compactThemeMainForcePlaybookForModel[\s\S]{0,1800}代表基金检索词[\s\S]{0,500}持仓承载锚点/,
    message: "market snapshots and compact model context must carry the main-force theme playbook, not only raw theme lists."
  },
  {
    pattern: /const themeMainForcePlaybook = buildThemeMainForcePlaybook\(themeRadar,\s*themeLeaderboards\)[\s\S]{0,1800}themeMainForcePlaybook/,
    message: "fresh market snapshots must store the main-force theme playbook next to theme leaderboards."
  },
  {
    pattern: /function buildPortfolioThemeOpportunityKeywordGroups[\s\S]{0,1800}carrierSearchKeywords[\s\S]{0,1200}carrierAnchors/,
    message: "representative-fund recall must use main-force playbook keywords and carrier anchors before searching funds."
  },
  {
    pattern: /function buildPortfolioThemeOpportunitySeedCandidates[\s\S]{0,3600}承载锚点/,
    message: "theme representative seed candidates must preserve carrier anchors as traceable evidence."
  },
  {
    pattern: /(?=[\s\S]*function extractEmergingNewsTopicTerms[\s\S]{0,1800}涨停潮)(?=[\s\S]*function buildNewsCatalystProfile[\s\S]{0,1600}库存见底)(?=[\s\S]*function buildNewsCatalystProfile[\s\S]{0,1600}订单超预期)/,
    message: "theme radar must discover market-style preheat headlines such as limit-up waves, inventory bottoms, and order beats."
  },
  {
    pattern: /(?=[\s\S]*THEME_NEWS_DISCOVERY_RULES)(?=[\s\S]*ai_terminal)(?=[\s\S]*domestic_semiconductor)(?=[\s\S]*power_grid_nuclear)(?=[\s\S]*innovative_drug_policy)(?=[\s\S]*resource_price_up)(?=[\s\S]*high_dividend_reform)(?=[\s\S]*brain_computer_interface)(?=[\s\S]*vehicle_road_cloud)(?=[\s\S]*pcb_copper_link)(?=[\s\S]*quantum_technology)/,
    message: "theme news discovery must cover a broad preheat universe, not only the original few emerging themes."
  },
  {
    pattern: /(?=[\s\S]*function getCandidateThemeHoldingAnchors)(?=[\s\S]*leaderStocks)(?=[\s\S]*matchedThemeHoldings)(?=[\s\S]*前十大持仓未命中题材龙头)(?=[\s\S]*题材龙头=)/,
    message: "holdings outlook must connect emerging themes to live board leaders before treating a fund as a true theme vehicle."
  },
  {
    pattern: /(?=[\s\S]*themeOpportunityRequirement)(?=[\s\S]*require_current_theme_playbook)(?=[\s\S]*function getPullbackThemeOpportunityBackingGap)(?=[\s\S]*缺少当前题材雷达\/新闻逻辑支撑)(?=[\s\S]*function formatPullbackCandidateThemeOpportunityEvidence)(?=[\s\S]*题材作战=)/,
    message: "pullback/setup discovery must require current theme playbook, news logic, and carrier evidence before pure trend setups become main recommendations."
  },
  {
    pattern: /function shouldRequireThemeOpportunityBackingForQuestion[\s\S]{0,260}options\.preferPullbackSetup\) return true[\s\S]{0,900}当前没有可用题材雷达，主推荐必须降级为待复核/,
    message: "pullback/setup discovery must still require current theme playbook evidence when the theme radar is missing."
  },
  {
    pattern: /function inferPullbackSetupCandidateSearchKeywords[\s\S]{0,520}inferPullbackSetupPlaybookSearchKeywords/,
    message: "pullback/setup discovery must use theme playbook opportunity keywords and carrier anchors when recalling candidates."
  },
  {
    pattern: /function inferPullbackSetupPlaybookSearchKeywords[\s\S]{0,420}buildPullbackSetupPlaybookKeywordGroups[\s\S]{0,1500}group\.anchors/,
    message: "pullback/setup playbook keyword recovery must include carrier anchors, not only broad theme names."
  },
  {
    pattern: /async function fetchPullbackSetupCandidates[\s\S]{0,520}inferPullbackSetupCandidateSearchKeywords\(userText,\s*themeRadar,\s*marketSnapshot\)/,
    message: "pullback/setup candidate fetching must call the combined radar and playbook keyword entrypoint."
  },
  {
    pattern: /(?=[\s\S]*async function fetchPullbackSetupCandidates[\s\S]{0,1400}buildPullbackSetupPlaybookKeywordContextMap[\s\S]{0,1400}enrichPullbackSetupKeywordCandidateWithPlaybookContext)(?=[\s\S]*function enrichPullbackSetupKeywordCandidateWithPlaybookContext[\s\S]{0,900}theme_main_force_playbook_keyword_search)/,
    message: "pullback/setup keyword candidates recovered from the main-force playbook must keep current theme context for downstream scoring."
  },
  {
    pattern: /function enrichPullbackSetupKeywordCandidateWithPlaybookContext[\s\S]{0,1300}themeOpportunityRequirement:\s*"require_current_theme_playbook"[\s\S]{0,900}matchedThemes[\s\S]{0,900}作战图关键词/,
    message: "playbook keyword candidate enrichment must preserve matched themes, current-theme requirement, and customer-readable evidence."
  },
  {
    pattern: /searchKeywords:\s*preferPullbackSetup[\s\S]{0,180}inferPullbackSetupCandidateSearchKeywords\(userText,\s*relevantThemeRadar,\s*scopedMarketSnapshot\)/,
    message: "market deep dives must expose the combined pullback setup search keywords used for playbook-driven candidate recall."
  },
  {
    pattern: /(?=[\s\S]*function buildPullbackQualityFallbackAnswer)(?=[\s\S]*const evidenceRecoveryLine = buildPullbackFallbackEvidenceRecoveryLine\(deepDive,\s*userText\))(?=[\s\S]*evidenceRecoveryLine,)/,
    message: "no-main pullback fallbacks must tell users which playbook keywords and carrier anchors will be used to recover evidence."
  },
  {
    pattern: /function buildPullbackFallbackEvidenceRecoveryLine[\s\S]{0,700}补证据路径[\s\S]{0,240}前十大持仓或指数名称能承载题材/,
    message: "pullback evidence recovery lines must name the next search keywords and carrier-holding verification requirement."
  },
  {
    pattern: /(?=[\s\S]*function evaluatePullbackAnswerDiscipline[\s\S]{0,600}shouldRequireThemeOpportunityBackingForDeepDive\(deepDive\)[\s\S]{0,500}classifyPullbackSetupCandidateForSummary\(candidate,\s*\{\s*requireThemeOpportunityBacking\s*\}\))(?=[\s\S]*function buildPullbackQualityFallbackAnswer[\s\S]{0,1200}classifyPullbackSetupCandidateForSummary\(candidate,\s*\{[\s\S]{0,220}shouldRequireThemeOpportunityBackingForDeepDive\(deepDive\))/,
    message: "answer quality and deterministic fallback must pass deepDive-level theme-playbook requirements into pullback candidate bucketing."
  },
  {
    pattern: /(?=[\s\S]*missing_theme_news_logic_explanation)(?=[\s\S]*function evaluateThemeNewsLogicAnswerCoverage)(?=[\s\S]*hasCatalystLogic)(?=[\s\S]*hasCatalystFreshnessTrace)(?=[\s\S]*hasCapitalOrBoardConfirmation)(?=[\s\S]*hasFundCarrierLogic)(?=[\s\S]*function shouldRequireStrictThemePlaybookExplanation)(?=[\s\S]*hasActionableThemeMainForcePlaybookEvidence)(?=[\s\S]*题材为什么动)/,
    message: "fund answer quality must require catalyst, fresh source/time trace, capital/board confirmation, and fund-carrier logic in customer replies when current theme playbook evidence is required."
  },
  {
    pattern: /(?=[\s\S]*missing_theme_action_trigger)(?=[\s\S]*function evaluateThemeNewsLogicAnswerCoverage)(?=[\s\S]*hasActionBoundary)(?=[\s\S]*继续观望)(?=[\s\S]*买入触发)(?=[\s\S]*失效条件)/,
    message: "fund answer quality must reject generic waiting on live theme opportunities unless the reply includes actionable triggers and invalidation boundaries."
  },
  {
    pattern: /(?=[\s\S]*async function enforceFundAnswerQuality[\s\S]{0,1600}buildThemePlaybookQualityFallbackAnswer)(?=[\s\S]*function buildThemePlaybookQualityFallbackAnswer[\s\S]{0,2400}0元观察[\s\S]{0,1200}触发[\s\S]{0,800}失效条件)/,
    message: "fund answer quality must use a deterministic theme-playbook fallback with zero-yuan observation, triggers, and invalidation when rewrites fail."
  },
  {
    pattern: /(?=[\s\S]*function getActionabilityHoldingsOutlookDiscipline)(?=[\s\S]*系统持仓承载降级)(?=[\s\S]*前十大持仓没有证明基金真实承载该题材)(?=[\s\S]*getPortfolioWatchStructuralReadinessCap[\s\S]*前十大持仓未命中题材龙头)/,
    message: "buy/actionability and watchlist readiness must be capped when holdings do not prove theme-carrier alignment."
  },
  {
    pattern: /(?=[\s\S]*function hasHoldingRealtimeCatchdownRisk)(?=[\s\S]*function getHoldingRealtimeCatchdownWarning)(?=[\s\S]*表面回调可能继续下探)(?=[\s\S]*function getActionabilityHoldingsOutlookDiscipline[\s\S]{0,700}系统持仓实时降级)(?=[\s\S]*scoreResearchDigestForPullbackSetup[\s\S]{0,2600}hasHoldingRealtimeCatchdownRisk\(digest\))/,
    message: "pullback/setup discovery must downgrade otherwise-qualified candidates when top holdings are weakening intraday."
  },
  {
    pattern: /(?=[\s\S]*function matchCandidateThemes)(?=[\s\S]*buildCandidateThemeMatchText)(?=[\s\S]*candidateHoldingsMatchThemeAnchors)(?=[\s\S]*top_holding_theme_anchor)/,
    message: "theme matching must inspect top-ten holdings so generic fund names cannot hide stale-theme exposure."
  },
  {
    pattern: /(?=[\s\S]*managerPerformance:\s*buildPortfolioManagerPerformanceStats\(db\))(?=[\s\S]*function buildPortfolioManagerPerformanceStats)(?=[\s\S]*操作正确率)(?=[\s\S]*盈利能力)(?=[\s\S]*abilityLanes)(?=[\s\S]*防接盘能力)(?=[\s\S]*主力跟随能力)(?=[\s\S]*过度观望纠偏)(?=[\s\S]*kindBreakdown)(?=[\s\S]*买入复盘)(?=[\s\S]*operationLanes)(?=[\s\S]*proofPoints)/,
    message: "portfolio public API must expose manager performance proof statistics with correctness, profitability, and operation-kind review cards."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioManagerAbilityLanes)(?=[\s\S]*findLatestPortfolioThemeLeaderboardsFromRuns)(?=[\s\S]*findLatestPortfolioThemeMainForcePlaybookFromRuns)(?=[\s\S]*collectPortfolioAbilityRankingProofItems)(?=[\s\S]*collectPortfolioAbilityThemeLeaderboardProofItems)(?=[\s\S]*collectPortfolioAbilityThemeMainForcePlaybookProofItems)(?=[\s\S]*proofItems)(?=[\s\S]*防接盘能力)(?=[\s\S]*主力跟随能力)/,
    message: "manager ability lanes must expose concrete proof items from catchdown risk rankings, latest theme leaderboards, and the main-force playbook, not only generic ability slogans."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioManagerPlaybookExecutionReview)(?=[\s\S]*playbookExecutionReview)(?=[\s\S]*riskBlockedCount)(?=[\s\S]*riskLeakCount)(?=[\s\S]*opportunityReadyCount)(?=[\s\S]*opportunityStuckCount)(?=[\s\S]*已压住 \$\{playbookRiskBlockedCount\} 个作战图风险候选)(?=[\s\S]*作战图机会进入复核)(?=[\s\S]*作战图机会仍卡在观察)/,
    message: "manager ability proof must show whether main-force playbook risk candidates were actually blocked and opportunity candidates advanced beyond vague observation."
  },
  {
    pattern: /(?=[\s\S]*function classifyPortfolioManagerOperation)(?=[\s\S]*退潮接盘亏损回测)(?=[\s\S]*接盘失误)(?=[\s\S]*主力预热错过回测)(?=[\s\S]*主线错过)(?=[\s\S]*0\.5%-1\.2%微型试探)/,
    message: "manager performance reviews must classify stale-catchdown buys and missed main-capital/preheat waits as explicit correction verdicts."
  },
  {
    pattern: /(?=[\s\S]*<section id="portfolioManagerScoreboard" class="portfolio-performance-board">)(?=[\s\S]*经理能力总览)(?=[\s\S]*portfolioPerformanceNarrative)(?=[\s\S]*portfolioManagerAbilityLanes)(?=[\s\S]*portfolioOperationKindMatrix)(?=[\s\S]*portfolioOperationReviews)/,
    message: "admin portfolio overview must lead with manager ability proof, operation-kind matrix, and action review verdicts before workspace entries."
  },
  {
    pattern: /renderPortfolioManagerPerformance\(managerPerformance,\s*account\)[\s\S]{0,1200}renderPortfolioWorkspaceCards/,
    message: "admin portfolio overview must render manager performance before shortcut cards."
  },
  {
    pattern: /(?=[\s\S]*function renderPortfolioThemeLeaderboards)(?=[\s\S]*function renderPortfolioThemeLeaderboardLane)(?=[\s\S]*function getPortfolioLatestThemeLeaderboards)(?=[\s\S]*\.theme-leaderboard-board)(?=[\s\S]*\.theme-leaderboard-lane-sell)/,
    message: "admin sector board must show latest theme leaderboards with visible retreat/preheat lanes."
  },
  {
    pattern: /(?=[\s\S]*function renderPortfolioThemeMainForcePlaybook)(?=[\s\S]*function getPortfolioLatestThemeMainForcePlaybook)(?=[\s\S]*theme-playbook-carrier)(?=[\s\S]*载体锚点)(?=[\s\S]*\.theme-playbook-board)(?=[\s\S]*\.theme-playbook-lane-sell)/,
    message: "admin sector board must show the main-force playbook with carrier anchors and risk-colored lanes."
  },
  {
    pattern: /(?=[\s\S]*function renderPortfolioManagerAbilityLane)(?=[\s\S]*renderPortfolioAbilityProofItem)(?=[\s\S]*portfolio-ability-proof-list)(?=[\s\S]*\.portfolio-ability-proof-list)(?=[\s\S]*\.portfolio-ability-proof-item)/,
    message: "admin manager ability lanes must render compact concrete proof items for catchdown blocks and main-force opportunities."
  },
  {
    pattern: /function renderPortfolioThemeLeaderboardItem[\s\S]{0,800}whyMove[\s\S]{0,900}theme-leaderboard-why[\s\S]{0,700}theme-leaderboard-evidence/,
    message: "admin theme leaderboard cards must lead with why-move narrative before evidence chips."
  },
  {
    pattern: /\.theme-leaderboard-why\s*\{[\s\S]{0,160}font-weight:\s*750/,
    message: "admin theme leaderboard why-move lines must be visually emphasized."
  },
  {
    pattern: /(?=[\s\S]*\.portfolio-performance-board\s*\{[\s\S]{0,620}border-left)(?=[\s\S]*\.portfolio-ability-lanes\s*\{[\s\S]{0,260}grid-template-columns:\s*repeat\(5)(?=[\s\S]*\.portfolio-operation-kind-matrix\s*\{[\s\S]{0,260}grid-template-columns:\s*repeat\(4)(?=[\s\S]*\.portfolio-operation-review-lanes\s*\{[\s\S]{0,420}grid-template-columns:\s*repeat\(3)(?=[\s\S]*\.portfolio-operation-review\s*\{[\s\S]{0,700}border-left)/,
    message: "admin manager performance board must use bounded, verdict-colored operation matrix and review cards."
  },
  {
    pattern: /portfolio-command-panel[\s\S]{0,420}grid-template-areas:\s*"hero kpis status"[\s\S]{0,900}portfolio-hero \.actions[\s\S]{0,260}overflow-x:\s*auto[\s\S]{0,900}portfolio-command-panel \.info-grid[\s\S]{0,260}grid-area:\s*status/,
    message: "admin portfolio command header must be a compact trading-console strip instead of a tall stacked dashboard."
  },
  {
    pattern: /(?=[\s\S]*@media \(min-width:\s*861px\)[\s\S]{0,900}body\[data-active-tab="portfolio"\] \.main[\s\S]{0,260}padding:\s*16px)(?=[\s\S]*@media \(min-width:\s*861px\)[\s\S]*\.portfolio-command-panel[\s\S]{0,360}max-height:\s*108px)(?=[\s\S]*@media \(min-width:\s*861px\)[\s\S]*\.portfolio-workspace-switcher small[\s\S]{0,120}display:\s*none)/,
    message: "admin portfolio desktop layout must compress the header and rail labels so the trading workspace fits in one screen."
  },
  {
    pattern: /function setPortfolioView[\s\S]{0,360}document\.body\.dataset\.activePortfolioView\s*=\s*nextView/,
    message: "admin portfolio view switching must expose the active workspace on the body for view-specific terminal layouts."
  },
  {
    pattern: /portfolio-workspace-group[\s\S]{0,160}账户[\s\S]{0,900}data-portfolio-view-target="positions"[\s\S]{0,900}portfolio-workspace-group[\s\S]{0,160}机会[\s\S]{0,900}data-portfolio-view-target="watchlist"[\s\S]{0,900}portfolio-workspace-group[\s\S]{0,160}决策[\s\S]{0,1200}data-portfolio-view-target="diagnostics"[\s\S]{0,900}portfolio-workspace-group[\s\S]{0,160}记录[\s\S]{0,900}data-portfolio-view-target="orders"/,
    message: "admin portfolio page must group stock-terminal workspace entries by account, opportunity, decision, and records instead of one long page."
  },
  {
    pattern: /<div class="portfolio-terminal-shell">[\s\S]{0,500}<aside class="portfolio-terminal-rail"[\s\S]{0,1600}<nav class="portfolio-workspace-switcher portfolio-workspace-dock"[\s\S]{0,3400}<div class="portfolio-terminal-stage">/,
    message: "admin portfolio page must use a left-rail terminal workspace instead of stacking all virtual-run sections."
  },
  {
    pattern: /(?=[\s\S]*\.portfolio-terminal-shell\s*\{[\s\S]*--portfolio-workspace-height:\s*100%[\s\S]*height:\s*var\(--portfolio-workspace-height\)[\s\S]*max-height:\s*100%[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.portfolio-terminal-stage\s*\{[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.portfolio-workspace-view\.active\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin portfolio terminal workspace must keep the virtual-run page bounded and scroll inside the active entry."
  },
  {
    pattern: /portfolio-entry-tabs[\s\S]{0,900}data-portfolio-group-target="account"[\s\S]{0,500}data-portfolio-group-target="opportunity"[\s\S]{0,500}data-portfolio-group-target="decision"[\s\S]{0,500}data-portfolio-group-target="records"/,
    message: "admin portfolio terminal must put account, opportunity, decision, and record groups behind top-level entry tabs."
  },
  {
    pattern: /(?=[\s\S]*const PORTFOLIO_VIEW_GROUPS[\s\S]*runner:\s*"decision"[\s\S]*orders:\s*"records")(?=[\s\S]*data-portfolio-nav-group[\s\S]*classList\.toggle\("active")/,
    message: "admin portfolio view switching must reveal only the active terminal entry group instead of a long rail."
  },
  {
    pattern: /(?=[\s\S]*\.portfolio-entry-tabs\s*\{)(?=[\s\S]*\.portfolio-workspace-group\s*\{[\s\S]{0,180}display:\s*none)(?=[\s\S]*\.portfolio-workspace-group\.active\s*\{[\s\S]{0,180}display:\s*grid)/,
    message: "admin portfolio rail must hide inactive entry groups to keep the virtual page short."
  },
  {
    pattern: /\.portfolio-terminal-rail\s*\{[\s\S]{0,320}align-content:\s*start[\s\S]{0,160}grid-auto-rows:\s*max-content/,
    message: "admin portfolio rail entries must not stretch into a tall blank menu."
  },
  {
    pattern: /function setPortfolioView[\s\S]{0,1200}data-portfolio-view-target[\s\S]{0,1200}data-portfolio-view/,
    message: "admin portfolio workspace entries must switch focused views."
  },
  {
    pattern: /function renderPortfolioDashboard[\s\S]*renderPortfolioWorkspaceCards/,
    message: "admin portfolio overview must show actionable workspace shortcut cards."
  },
  {
    pattern: /function renderPortfolioWorkspaceCards[\s\S]*function renderPortfolioWorkspaceCard/,
    message: "admin portfolio overview must render workspace shortcut cards."
  },
  {
    pattern: /PORTFOLIO_WORKSPACE_OVERVIEW_GROUPS[\s\S]{0,620}账户[\s\S]{0,620}机会[\s\S]{0,620}决策[\s\S]{0,620}记录[\s\S]*function renderPortfolioWorkspaceGroups[\s\S]*portfolio-workspace-cluster/,
    message: "admin portfolio overview must group shortcut entries into account, opportunity, decision, and record zones instead of a flat strip."
  },
  {
    pattern: /PORTFOLIO_WORKSPACE_OVERVIEW_GROUPS[\s\S]{0,520}decision[\s\S]{0,260}focusViews:\s*\["diagnostics",\s*"runner",\s*"alerts",\s*"actions",\s*"rankings",\s*"matrix"\][\s\S]*selectPortfolioWorkspaceGroupFocus[\s\S]*hasPortfolioWorkspaceCardSignal\(item\)[\s\S]*byView\.has\(view\)/,
    message: "admin portfolio decision overview must prefer ability/signaled cards but fall back to the runner instead of enlarging a zero-count alert card."
  },
  {
    pattern: /renderPortfolioWorkspaceGroups[\s\S]*secondary\.slice\(0,\s*3\)[\s\S]*renderPortfolioWorkspaceMoreButton[\s\S]*portfolio-workspace-more[\s\S]*portfolio-workspace-mini-list\s*\{[\s\S]*overflow:\s*hidden/,
    message: "admin portfolio overview groups must cap mini shortcuts and show a more chip instead of creating internal scrollbars."
  },
  {
    pattern: /function renderPortfolioWorkspaceCards[\s\S]*managerRankings[\s\S]*ready[\s\S]*waiting[\s\S]*userAlerts[\s\S]*renderPortfolioWorkspaceGroups/,
    message: "admin portfolio workspace cards must summarize rankings, watchlist readiness, and user alerts."
  },
  {
    pattern: /renderPortfolioWorkspaceCards[\s\S]{0,2600}customerActionLeaderboard[\s\S]{0,2600}label:\s*"行动排行"/,
    message: "admin portfolio workspace cards must use the customer action leaderboard as the first-scan manager ranking shortcut."
  },
  {
    pattern: /(?=[\s\S]*portfolioRankingRadar)(?=[\s\S]*function renderPortfolioRankingRadar)(?=[\s\S]*customerActionDeck)(?=[\s\S]*可买复核)(?=[\s\S]*等待触发)(?=[\s\S]*先回避)/,
    message: "admin portfolio overview must render customer action cards so users can scan buy, wait, avoid, sell, and data signals without opening a long ranking report."
  },
  {
    pattern: /<section id="portfolioRankingRadar" class="portfolio-ranking-radar">[\s\S]{0,1200}今日行动中心[\s\S]{0,900}data-portfolio-view-target="runner"[\s\S]{0,500}data-portfolio-view-target="opportunities"[\s\S]{0,500}data-portfolio-view-target="rankings"/,
    message: "admin portfolio overview must have a nonblank first-screen action center before async portfolio data loads."
  },
  {
    pattern: /function renderPortfolioRankingRadar[\s\S]{0,1800}portfolio-launch-center[\s\S]{0,900}data-portfolio-view-target="runner"[\s\S]{0,500}data-portfolio-view-target="opportunities"[\s\S]{0,500}data-portfolio-view-target="rankings"/,
    message: "admin portfolio ranking radar empty state must route users to runner, opportunity, and ranking entries instead of showing a blank panel."
  },
  {
    pattern: /\.portfolio-launch-center\s*\{[\s\S]{0,380}min-height:\s*168px[\s\S]{0,600}\.portfolio-launch-actions\s*\{[\s\S]{0,280}flex-wrap:\s*wrap/,
    message: "admin portfolio launch center must be styled as a visible first-screen action panel."
  },
  {
    pattern: /renderPortfolioRankingCommandStrip[\s\S]{0,1800}今日买卖指挥[\s\S]{0,1200}完整榜单/,
    message: "admin portfolio overview must expose a first-scan buy/sell command strip before the detailed ranking radar lanes."
  },
  {
    pattern: /getPortfolioRankingRadarLensTarget[\s\S]{0,1200}buy_preparation[\s\S]{0,1200}launch_setup[\s\S]{0,1200}data_confidence/,
    message: "admin portfolio ranking command strip must jump from lane counters into the corresponding ranking lenses."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="sectors")(?=[\s\S]*portfolioNavSectorCount)(?=[\s\S]*data-portfolio-view="sectors")/,
    message: "admin portfolio UI must expose a dedicated sector leaderboard entrance instead of burying theme and rotation choices in a long ranking page."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="actions")(?=[\s\S]*portfolioNavActionCount)(?=[\s\S]*data-portfolio-view="actions")/,
    message: "admin portfolio UI must expose a dedicated action desk entrance for buy, sell, watch, and order items."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="matrix")(?=[\s\S]*portfolioNavMatrixCount)(?=[\s\S]*data-portfolio-view="matrix")/,
    message: "admin portfolio UI must expose a dedicated decision-matrix entrance instead of forcing users through a long ranking page."
  },
  {
    pattern: /(?=[\s\S]*PORTFOLIO_ACTION_LANES[\s\S]{0,900}买入动作[\s\S]{0,900}卖出动作[\s\S]{0,900}观察动作[\s\S]{0,900}执行流转)(?=[\s\S]*function renderPortfolioActionDesk)/,
    message: "admin portfolio action desk must split latest manager actions and active orders into executable lanes."
  },
  {
    pattern: /(?=[\s\S]*\.action-terminal\s*\{[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.action-lane-grid\s*\{[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\))(?=[\s\S]*\.action-item-list\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin portfolio action desk must be a bounded four-lane terminal board."
  },
  {
    pattern: /(?=[\s\S]*PORTFOLIO_POSITION_LANES[\s\S]{0,900}风险预警[\s\S]{0,900}止盈\/回吐[\s\S]{0,900}核心持有[\s\S]{0,900}小仓观察)(?=[\s\S]*function renderPositions[\s\S]{0,2200}position-terminal[\s\S]{0,2200}position-lane-grid)/,
    message: "admin portfolio positions view must split holdings into risk, profit, core, and watch lanes instead of a long holding list."
  },
  {
    pattern: /(?=[\s\S]*\.position-terminal\s*\{[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.position-lane-grid\s*\{[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\))(?=[\s\S]*\.position-item-list\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin portfolio positions view must be a bounded four-lane terminal board."
  },
  {
    pattern: /(?=[\s\S]*function renderPortfolioDecisionMatrixBoard)(?=[\s\S]*matrix-table)(?=[\s\S]*买点[\s\S]*板块\/质量[\s\S]*风险[\s\S]*数据\/费率)/,
    message: "admin portfolio decision matrix must compare buy point, sector, risk, and data columns in one trading-style board."
  },
  {
    pattern: /(?=[\s\S]*buildPortfolioRankingDecisionMatrixVerdict[\s\S]*permission[\s\S]*blockers[\s\S]*constraints[\s\S]*supports)(?=[\s\S]*renderPortfolioDecisionMatrixRow[\s\S]*matrix-verdict-[\s\S]*阻断：[\s\S]*约束：[\s\S]*支持：)/,
    message: "portfolio decision matrix must show a traffic-light buy/wait/block verdict with supports, constraints, and blockers."
  },
  {
    pattern: /(?=[\s\S]*function isPortfolioDecisionMatrixCatchdownRisk[\s\S]{0,900}stale_catchdown_risk)(?=[\s\S]*function buildPortfolioRankingDecisionMatrixVerdict[\s\S]{0,1600}接盘风险拦截[\s\S]{0,320}0元观察[\s\S]{0,320}不是低位启动[\s\S]{0,320}主力资金回流[\s\S]{0,180}代表持仓止跌)/,
    message: "portfolio decision matrix must translate stale-theme pullbacks into a visible 0-yuan catchdown-risk verdict with reopening conditions."
  },
  {
    pattern: /(?=[\s\S]*\.matrix-terminal\s*\{[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.matrix-table\s*\{[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.matrix-body\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin portfolio decision matrix must be bounded with an internally scrollable table."
  },
  {
    pattern: /(?=[\s\S]*PORTFOLIO_SECTOR_LANES[\s\S]{0,900}theme_allocation[\s\S]{0,900}rotation_opportunity[\s\S]{0,900}holdings_outlook[\s\S]{0,900}quality_score)(?=[\s\S]*function renderPortfolioSectorBoard)/,
    message: "admin portfolio sector board must split theme allocation, sector rotation, holdings outlook, and fund quality into separate lenses."
  },
  {
    pattern: /(?=[\s\S]*PORTFOLIO_RISK_LANES[\s\S]{0,900}stale_catchdown_risk[\s\S]{0,900}chase_risk)(?=[\s\S]*接盘风险)/,
    message: "admin portfolio risk board must expose stale-catchdown risk separately from ordinary chase risk."
  },
  {
    pattern: /(?=[\s\S]*\.sector-terminal\s*\{[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.sector-lane-grid\s*\{[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\))(?=[\s\S]*\.sector-item-list\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin portfolio sector leaderboard must be a bounded four-lane terminal board."
  },
  {
    pattern: /(?=[\s\S]*\.data-terminal\s*\{[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.data-lane-grid\s*\{[\s\S]*repeat\(4,\s*minmax\(0,\s*1fr\)\))(?=[\s\S]*\.data-item-list\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin portfolio data-confidence board must be a bounded four-lane terminal board."
  },
  {
    pattern: /renderPortfolioRankingRadarItem[\s\S]{0,1400}data-focus-watchlist-code[\s\S]{0,900}renderPortfolioRankingRadarPriority/,
    message: "admin portfolio ranking radar must jump from radar items and priority queue entries to matching watchlist details."
  },
  {
    pattern: /(?=[\s\S]*\.portfolio-ranking-radar\s*\{)(?=[\s\S]*\.portfolio-ranking-radar-grid\s*\{[\s\S]*display:\s*grid[\s\S]*repeat\(auto-fit,\s*minmax\(158px,\s*1fr\)\)[\s\S]*overflow:\s*visible)(?=[\s\S]*\.portfolio-ranking-radar-priority\s*\{[\s\S]*overflow-x:\s*auto)/,
    message: "admin portfolio ranking radar must use an adaptive action-card grid instead of forcing a horizontal scrollbar."
  },
  {
    pattern: /portfolio-workspace-switcher[^]*?position:\s*sticky/,
    message: "admin portfolio workspace switcher must stay reachable and remain usable on narrow screens."
  },
  {
    pattern: /portfolio-terminal-shell[^]*?grid-template-columns:\s*minmax\(78px,\s*90px\)\s*minmax\(0,\s*1fr\)[^]*?portfolio-terminal-rail[^]*?grid-row:\s*1\s*\/\s*span\s*2/,
    message: "admin portfolio terminal workspace must keep only the primary entry navigation in a stable left rail."
  },
  {
    pattern: /\.portfolio-workspace-dock\s*\{[\s\S]{0,700}grid-column:\s*2[\s\S]{0,260}grid-row:\s*1[\s\S]{0,260}overflow:\s*hidden/,
    message: "admin portfolio secondary entries must live in a compact top dock instead of a long side menu."
  },
  {
    pattern: /@media \(min-width:\s*861px\)[\s\S]{0,5200}\.portfolio-workspace-group\.active\s*\{[\s\S]{0,360}display:\s*flex[\s\S]{0,360}overflow-x:\s*auto/,
    message: "admin portfolio secondary entry groups must scroll horizontally in the compact desktop dock."
  },
  {
    pattern: /@media \(max-width: 860px\)[^]*?portfolio-workspace-switcher[^]*?overflow-x:\s*auto/,
    message: "admin portfolio workspace switcher must remain usable on narrow screens."
  },
  {
    pattern: /function focusWatchlistFund[\s\S]{0,500}setPortfolioView\("watchlist"\)/,
    message: "ranking-to-watchlist jumps must open the dedicated watchlist workspace."
  },
  {
    pattern: /function renderWatchlist[\s\S]{0,700}renderWatchlistTerminal[\s\S]{0,2600}function renderWatchlistTerminal[\s\S]{0,1600}watchlist-terminal[\s\S]{0,1200}watchlist-status-stage/,
    message: "admin watchlist must use focused status-category navigation instead of showing every candidate category as one long page."
  },
  {
    pattern: /function renderWatchlistStatusButton[\s\S]{0,900}data-watchlist-status-filter/,
    message: "admin watchlist must expose status-category filter buttons for focused navigation."
  },
  {
    pattern: /(?=[\s\S]*自选池终端)(?=[\s\S]*watchlist-panel[\s\S]{0,360}grid-template-rows:\s*auto minmax\(0,\s*1fr\))(?=[\s\S]*watchlist-panel \.watchlist-list[\s\S]{0,360}overflow:\s*hidden)/,
    message: "admin portfolio watchlist workspace must be a bounded terminal panel, not an expandable long section."
  },
  {
    pattern: /watchlist-terminal[\s\S]{0,900}watchlist-status-rail[\s\S]{0,900}watchlist-status-stage/,
    message: "admin watchlist UI must keep category navigation and selected fund details in a terminal workspace."
  },
  {
    pattern: /(?=[\s\S]*\.watchlist-terminal-body\s*\{[\s\S]*max-height:\s*calc\(var\(--portfolio-workspace-height[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.watchlist-status-stage\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin watchlist workspace must scroll candidate details inside the selected category instead of stretching the whole page."
  },
  {
    pattern: /function ensurePortfolioTimelineDetails[\s\S]{0,900}\/api\/portfolio\?full=1[\s\S]{0,700}renderRuns/,
    message: "admin portfolio timeline must lazy-load full run details instead of losing complete daily report text in summary mode."
  },
  {
    pattern: /(?=[\s\S]*function renderRuns[\s\S]*timeline-terminal[\s\S]*renderRunDetail)(?=[\s\S]*function renderRunIndexButton[\s\S]*data-run-select)(?=[\s\S]*function renderRunDetail[\s\S]*完整日报文本)/,
    message: "admin portfolio timeline must use a focused run selector instead of a long stacked run report list."
  },
  {
    pattern: /(?=[\s\S]*经理时间线终端)(?=[\s\S]*timeline-panel[\s\S]{0,360}grid-template-rows:\s*auto minmax\(0,\s*1fr\))(?=[\s\S]*timeline-panel \.run-list[\s\S]{0,360}overflow:\s*hidden)/,
    message: "admin portfolio timeline workspace must be a bounded terminal panel instead of an expandable long report section."
  },
  {
    pattern: /(?=[\s\S]*虚拟运行台)(?=[\s\S]*data-portfolio-view-target="runner")(?=[\s\S]*renderPortfolioRunConsole)(?=[\s\S]*run-console-terminal[\s\S]{0,900}run-task-rail[\s\S]{0,900}run-console-stage)/,
    message: "admin portfolio virtual run controls must live in a dedicated trading-terminal console with task entries and a bounded detail stage."
  },
  {
    pattern: /(?=[\s\S]*activePortfolioRunPanel)(?=[\s\S]*data-run-panel)(?=[\s\S]*function renderRunPanelSwitch[\s\S]*运行记录详情入口)(?=[\s\S]*function renderRunPanelContent[\s\S]*renderRunActionsPanel[\s\S]*renderRunCommitteePanel[\s\S]*renderRunExecutionPanel[\s\S]*renderRunReportPanel)/,
    message: "admin portfolio timeline must split a selected run into quote-terminal style detail entries instead of one long report page."
  },
  {
    pattern: /(?=[\s\S]*\.timeline-terminal-body\s*\{[\s\S]*max-height:\s*calc\(var\(--portfolio-workspace-height[\s\S]*overflow:\s*hidden)(?=[\s\S]*\.run-stage\s*\{[\s\S]*overflow:\s*auto)(?=[\s\S]*\.run-panel-stage\s*\{[\s\S]*overflow:\s*auto)/,
    message: "admin portfolio timeline must keep run selection and detail panels inside a bounded trading-terminal stage."
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
    pattern: /(?=[\s\S]*function buildPortfolioHoldingThemeRefresh)(?=[\s\S]*current_market_holding_theme_radar)(?=[\s\S]*getPortfolioHoldingThemeRetreatWarnings)(?=[\s\S]*泛题材热度不能覆盖底层退潮)(?=[\s\S]*buildPortfolioHeldPositionRiskReview[\s\S]{0,2600}getPortfolioHoldingThemeRetreatWarnings)(?=[\s\S]*collectPortfolioSellDisciplineSignals[\s\S]{0,1800}getPortfolioHoldingThemeRetreatWarnings)/,
    message: "held-position sell discipline must inspect precise top-holding subtheme retreat instead of relying on broad sector support."
  },
  {
    pattern: /(?=[\s\S]*refreshPortfolioCandidateThemesWithMarketRadar)(?=[\s\S]*function getDirectPortfolioHoldingThemeRetreatWarnings)(?=[\s\S]*function getPortfolioActionableThemeSupportGap[\s\S]{0,700}getDirectPortfolioHoldingThemeRetreatWarnings)(?=[\s\S]*function getActionabilityThemeRetreatDiscipline[\s\S]{0,900}getDirectPortfolioHoldingThemeRetreatWarnings)(?=[\s\S]*function buildPortfolioWatchReadinessGaps[\s\S]{0,900}getDirectPortfolioHoldingThemeRetreatWarnings)/,
    message: "candidate buy/readiness/actionability guards must prioritize directly refreshed top-holding subtheme retreat before broad theme support can reopen buys."
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
    pattern: /function applyPortfolioWatchlistUpdates[\s\S]{0,900}effectiveUpdate[\s\S]{0,220}status:\s*update\.status \|\| existing\?\.status[\s\S]{0,360}guardPortfolioWatchlistReadyUpdate\(effectiveUpdate/,
    message: "portfolio watchlist write path must recheck the effective merged ready status even when the model omits status."
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
    pattern: /hasVerifiedPortfolioBuySetup[\s\S]{0,900}isEarlyTurnSetupTrend/,
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
    pattern: /function cancelPortfolioActiveOrder[\s\S]{0,900}releasePortfolioOrderReservation[\s\S]{0,900}pendingBuyAmount[\s\S]{0,500}reservationReleasedAt/,
    message: "portfolio order cancellation must release frozen BUY cash exactly once."
  },
  {
    pattern: /function cancelStalePortfolioActiveOrders[\s\S]{0,900}findImpossiblePortfolioSellOrders[\s\S]{0,2200}已无对应持仓[\s\S]{0,1200}释放冻结现金[\s\S]{0,1400}function shouldCancelStalePortfolioOrder/,
    message: "portfolio lifecycle must cancel stale unconfirmed orders and impossible sell orders so old pending items do not distort the ledger."
  },
  {
    pattern: /function repairDuplicatePortfolioTransactions[\s\S]{0,1800}reversed\s*=\s*true[\s\S]{0,700}reversalReason/,
    message: "portfolio lifecycle must mark duplicate transactions as reversed with an audit reason."
  },
  {
    pattern: /function findDuplicatePortfolioTradeGroups[\s\S]{0,500}item\?\.reversed/,
    message: "portfolio duplicate-trade diagnostics must ignore transactions already marked reversed."
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
    pattern: /deployableCashPct[\s\S]{0,900}可用现金约[\s\S]{0,260}应收赎回约/,
    message: "portfolio backtest redeployment diagnostics must separate deployable cash from unsettled redemption receivables."
  },
  {
    pattern: /function buildPortfolioBacktestDiagnostics[\s\S]{0,15000}waitOnlyDecisionRuns[\s\S]{0,1200}过度保守回测/,
    message: "portfolio backtest diagnostics must detect repeated wait-only decisions while cash remains deployable."
  },
  {
    pattern: /readyOpportunityCandidates[\s\S]{0,900}!isPortfolioBacktestOpportunityCostRiskBlocked\(item\)[\s\S]{0,1500}买点错过回测[\s\S]{0,400}接近买点未执行/,
    message: "portfolio backtests must detect ready watchlist candidates that stay unexecuted under high cash."
  },
  {
    pattern: /function getPortfolioBacktestFollowThroughBlockingReason[\s\S]{0,700}getPortfolioBacktestOpportunityCostRiskBlockReason\(item\)[\s\S]{0,1200}function getPortfolioBacktestOpportunityCostRiskBlockReason[\s\S]{0,900}接盘风险未解除[\s\S]{0,900}追涨风险未解除/,
    message: "portfolio opportunity-cost backtests must block stale-theme catchdown or chase-risk rebounds from being counted as missed buy points."
  },
  {
    pattern: /function buildPortfolioBacktestFollowThroughCandidate[\s\S]{0,2600}starterCapital[\s\S]{0,900}estimatedStarterOpportunity/,
    message: "portfolio backtests must quantify opportunity cost when unbought ready candidates keep rising."
  },
  {
    pattern: /findPortfolioBacktestMissedFollowThroughCandidates[\s\S]{0,1600}!item\.blockingReason[\s\S]{0,900}readinessScore[\s\S]{0,5200}findPortfolioBacktestBlockedFollowThroughCandidates/,
    message: "portfolio opportunity-cost diagnostics must exclude blocked or structurally unbuyable candidates."
  },
  {
    pattern: /少赚约[\s\S]{0,900}机会成本回测[\s\S]{0,700}等待后继续走强/,
    message: "portfolio diagnostics must explain missed follow-through in user-readable opportunity-cost terms."
  },
  {
    pattern: /(?=[\s\S]*主力预热错过回测)(?=[\s\S]*function findPortfolioBacktestMissedThemeMomentumCandidates)(?=[\s\S]*hasPortfolioThemeMicroStarterSetup)(?=[\s\S]*新闻逻辑)/,
    message: "portfolio backtests must hold the manager accountable for missing executable main-capital/preheat opportunities with news logic."
  },
  {
    pattern: /(?=[\s\S]*退潮接盘亏损回测)(?=[\s\S]*function findPortfolioBacktestStaleCatchdownLossBuys)(?=[\s\S]*summarizePortfolioBacktestStaleCatchdownEvidence)(?=[\s\S]*estimatePortfolioBacktestStaleCatchdownLoss)/,
    message: "portfolio backtests must identify stale-theme catchdown buys that become real losses."
  },
  {
    pattern: /function summarizePortfolioBacktestStaleCatchdownEvidence[\s\S]{0,700}current_radar_unconfirmed[\s\S]{0,120}旧题材未确认/,
    message: "stale catchdown backtests must classify current-radar-unconfirmed historical-hotspot buys as old-theme catchdown mistakes."
  },
  {
    pattern: /退潮接盘亏损回测[\s\S]{0,1000}资金回流[\s\S]{0,800}新闻催化[\s\S]{0,800}代表持仓承载/,
    message: "stale catchdown loss diagnostics must require capital-flow recovery, catalyst logic, and holding-carrier validation before re-entry."
  },
  {
    pattern: /主力预热错过回测[\s\S]{0,900}主力\/预热题材不能被普通等待吞掉[\s\S]{0,900}0\.5%-1\.2%微型试探/,
    message: "portfolio capability queue must turn missed main-capital/preheat opportunities into micro-starter or downgrade decisions."
  },
  {
    pattern: /退潮接盘亏损回测[\s\S]{0,900}退潮接盘不是低位启动[\s\S]{0,900}新闻催化/,
    message: "portfolio capability queue must turn stale catchdown losses into a concrete theme/news repair task."
  },
  {
    pattern: /退潮接盘亏损回测[\s\S]{0,900}旧题材未确认[\s\S]{0,420}当前题材雷达重新确认/,
    message: "portfolio capability queue must turn current-radar-unconfirmed old-theme losses into a specific radar-reconfirmation repair task."
  },
  {
    pattern: /function buildUserPortfolioAlerts[\s\S]{0,1400}buildUserHoldingRiskEvidence[\s\S]{0,700}复核卖出\/减仓/,
    message: "user holding alerts must automatically turn stale-theme or capital-outflow holdings into sell/reduce reminders."
  },
  {
    pattern: /function buildUserHoldingRiskEvidence[\s\S]{0,1100}getCandidateThemeRetreatWarnings[\s\S]{0,500}getStaleThemeCatchdownWarnings[\s\S]{0,500}getUnrefreshedMarketThemeWarnings/,
    message: "user holding risk evidence must reuse structured theme-retreat, stale-catchdown, and current-radar-unconfirmed warnings."
  },
  {
    pattern: /function buildPortfolioBacktestThemeMomentumCandidate[\s\S]{0,1800}!theme \|\| !hasTraceableFreshThemeCatalystContext\(theme\) \|\| !hasPositiveThemeMainCapitalEvidence\(theme\)/,
    message: "missed theme momentum backtests must not count stale, untraceable, or capital-unconfirmed catalysts as missed executable opportunities."
  },
  {
    pattern: /function getPortfolioBacktestThemeMomentumBlockingReason[\s\S]{0,500}!hasTraceableFreshThemeCatalystContext\(theme\)[\s\S]{0,180}缺少可追溯的新鲜新闻\/催化来源/,
    message: "missed theme momentum blocking reasons must explain untraceable catalyst sources in customer-readable Chinese."
  },
  {
    pattern: /候选质量缺口回测[\s\S]{0,700}不能直接算作可买机会成本[\s\S]{0,500}扩展数据源和同主题替代品/,
    message: "portfolio diagnostics must attribute blocked follow-through to candidate-quality or data-source gaps rather than chase pressure."
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
    pattern: /候选质量缺口回测[\s\S]{0,700}同主题可执行替代候选/,
    message: "portfolio capability queue must turn blocked follow-through into data-source and substitute-candidate work."
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
    pattern: /db\.dailyEquity\.push\(\{[\s\S]{0,600}positionWeightPct: db\.account\.positionWeightPct[\s\S]{0,220}pendingWeightPct: db\.account\.pendingWeightPct[\s\S]{0,180}receivableCashPct: db\.account\.receivableCashPct/,
    message: "portfolio valuation history must persist position, pending-buy, and receivable-cash weights separately."
  },
  {
    pattern: /function summarizePortfolioEquityBrief[\s\S]{0,900}resolvePortfolioStoredWeightPct\(item\.positionWeightPct, investedValue, totalAsset\)[\s\S]{0,500}resolvePortfolioCashComponentWeightPct\(pendingBuyAmount, totalAsset\)[\s\S]{0,500}resolvePortfolioCashComponentWeightPct\(receivableCash, totalAsset\)/,
    message: "portfolio equity history summaries must derive pending buys separately from unsettled redemption receivables."
  },
  {
    pattern: /account\.pendingWeightPct = account\.totalAsset > 0 \? round\(\(account\.pendingBuyAmount \/ account\.totalAsset\) \* 100, 2\) : 0;\s+account\.receivableCashPct = account\.totalAsset > 0 \? round\(\(account\.receivableCash \/ account\.totalAsset\) \* 100, 2\) : 0;/,
    message: "portfolio account recalculation must not mix receivable cash into pending-buy weight."
  },
  {
    pattern: /function summarizePortfolioEquityBrief[\s\S]{0,1600}repairPortfolioSnapshotCumulativePnlPct[\s\S]{0,2400}function resolvePortfolioSnapshotInvestedCostBasis[\s\S]{0,1800}function repairPortfolioSnapshotCumulativePnlPct/,
    message: "portfolio equity history must repair stale zero invested-cost return percentages after liquidation."
  },
  {
    pattern: /function compactPortfolioWeeklyEquity[\s\S]{0,1100}repairPortfolioSnapshotCumulativePnlPct[\s\S]{0,1600}function compactPortfolioWeeklyAccount[\s\S]{0,1400}repairPortfolioSnapshotCumulativePnlPct/,
    message: "weekly backtest context must not carry stale zero invested-cost return percentages."
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
    pattern: /DEFAULT_PORTFOLIO_MANAGER_PROFILE_LINES[\s\S]{0,700}主力跟随纪律[\s\S]{0,420}0\.5%-1\.2%微型试探[\s\S]{0,420}不能只说等待机会[\s\S]{0,700}REQUIRED_PORTFOLIO_MANAGER_PROFILE_LINES[\s\S]{0,900}主力跟随纪律/,
    message: "stored portfolio manager profiles must be upgraded with active main-capital/preheat follow discipline."
  },
  {
    pattern: /const capabilityDiagnostics = buildPortfolioCapabilityDiagnostics\(db\)[\s\S]{0,160}const capabilityActionQueue = buildPortfolioCapabilityActionQueue\(db\)[\s\S]{0,4200}capabilityDiagnostics,[\s\S]{0,120}capabilityActionQueue/,
    message: "portfolio decision runs must pass full-ledger capability diagnostics, including transactions and failed runs, into the model prompt."
  },
  {
    pattern: /组合能力诊断（系统计算，必须先处理，不能只写套话）[\s\S]{0,700}能力修复队列（必须进入 team\.主席、team\.风控经理、actions 或 learningNotes）/,
    message: "portfolio decision prompt must force capability repair before new buy decisions."
  },
  {
    pattern: /function buildPortfolioDecisionRankingBoard[\s\S]{0,900}refreshPortfolioWatchlistThemesWithMarketRadar\(virtualDb,\s*\{[\s\S]{0,300}marketSnapshot[\s\S]{0,300}watchlistProfiles[\s\S]{0,900}buildPortfolioWatchlistUpdatesFromSeedCandidates\(watchlistSeedCandidates,\s*\{\s*profiles\s*\}\)[\s\S]{0,900}buildPortfolioRankingBoard\(virtualDb\)/,
    message: "portfolio decision ranking boards must refresh current market theme radar and preview same-day seed candidates before model prompts."
  },
  {
    pattern: /function refreshPortfolioWatchlistThemesWithMarketRadar(?=[\s\S]{0,5200}retreatWarnings\.length)(?=[\s\S]{0,5400}\["ready",\s*"waiting_pullback",\s*"watch"\]\.includes\(item\.status\)[\s\S]{0,180}\?\s*"blocked")/,
    message: "current market retreat radar must block buy-candidate watchlist statuses instead of leaving them as vague wait states."
  },
  {
    pattern: /function refreshPortfolioWatchlistThemesWithMarketRadar(?=[\s\S]{0,1200}getMarketThemeMainForcePlaybook\(marketContext,\s*themeRadar\))(?=[\s\S]{0,1600}!\s*themeRadar\.length\s*&&\s*!playbook)(?=[\s\S]{0,4300}getThemeMainForcePlaybookRiskWarnings\(current\))(?=[\s\S]{0,5600}theme_main_force_playbook)/,
    message: "watchlist theme refresh must still run from the main-force playbook when themeRadar is empty and downgrade playbook-risk candidates."
  },
  {
    pattern: /function refreshPortfolioHeldPositionsThemesWithMarketRadar(?=[\s\S]{0,1200}getMarketThemeMainForcePlaybook\(marketContext,\s*themeRadar\))(?=[\s\S]{0,1600}!\s*themeRadar\.length\s*&&\s*!playbook)(?=[\s\S]{0,3600}getThemeMainForcePlaybookRiskWarnings\(current\))(?=[\s\S]{0,4600}theme_main_force_playbook)/,
    message: "held-position theme refresh must still run from the main-force playbook when themeRadar is empty so sell/de-risk review catches catchdown risk."
  },
  {
    pattern: /function refreshPortfolioCandidateThemesWithMarketRadar[\s\S]{0,2300}markUnrefreshedMarketThemeSignal[\s\S]{0,900}noCurrentThemeMatch:\s*true/,
    message: "current market radar refresh must downgrade old theme labels that are not confirmed today."
  },
  {
    pattern: /function refreshPortfolioCandidateThemesWithMarketRadar[\s\S]{0,3200}marketThemeRefresh:\s*buildPortfolioMarketThemeRefresh\(matchedThemes/,
    message: "candidate market-theme refresh must write a structured marketThemeRefresh object after current-radar matching."
  },
  {
    pattern: /function buildPortfolioMarketThemeRefresh[\s\S]{0,1100}supportSignals[\s\S]{0,1100}newsLogic[\s\S]{0,1100}dataBasis/,
    message: "candidate market-theme refresh must preserve why-move, support-signal, and data-basis evidence, not just matched theme names."
  },
  {
    pattern: /function markUnrefreshedMarketThemeSignal[\s\S]{0,1200}current_radar_unconfirmed[\s\S]{0,900}未被当前题材雷达确认/,
    message: "unrefreshed theme labels must become non-actionable and carry a readable current-radar warning."
  },
  {
    pattern: /function getPortfolioActionableThemeSupportGap[\s\S]{0,1800}getUnrefreshedMarketThemeWarnings\(candidate\)[\s\S]{0,2200}function getUnrefreshedMarketThemeWarnings[\s\S]{0,900}旧题材线索未被当前题材雷达确认[\s\S]{0,900}历史热点/,
    message: "portfolio BUY discipline must explicitly block old theme labels that are not confirmed by the current radar."
  },
  {
    pattern: /function refreshPortfolioWatchlistThemesWithMarketRadar(?=[\s\S]{0,5200}unconfirmedThemeWarning)(?=[\s\S]{0,5600}item\.status === "ready"[\s\S]{0,180}\?\s*"waiting_pullback")/,
    message: "old unconfirmed theme labels must downgrade ready watchlist candidates before ranking."
  },
  {
    pattern: /function buildPortfolioStaleCatchdownRiskRanking[\s\S]{0,260}\["ready",\s*"waiting_pullback",\s*"watch",\s*"blocked"\]\.includes\(item\.status\)/,
    message: "stale-catchdown risk ranking must still show blocked candidates so current-radar retreats remain visible."
  },
  {
    pattern: /function buildPortfolioChaseRiskRanking[\s\S]{0,260}\["ready",\s*"waiting_pullback",\s*"watch",\s*"blocked"\]\.includes\(item\.status\)/,
    message: "chase-risk ranking must still show blocked candidates so risk blocks remain visible."
  },
  {
    pattern: /const managerRankings = buildPortfolioDecisionRankingBoard\(db,\s*watchlistSeedCandidates,\s*\{[\s\S]{0,160}profiles:\s*seedProfiles,[\s\S]{0,160}watchlistProfiles,[\s\S]{0,160}marketSnapshot[\s\S]{0,900}managerRankings/,
    message: "portfolio decision runs must compute current-radar refreshed, seed-aware manager ranking boards and pass them into the model prompt."
  },
  {
    pattern: /经理多角度榜单（系统计算，必须先看榜单再决定）[\s\S]{0,900}rankingBasis[\s\S]{0,900}来源：manager_ranking_board/,
    message: "portfolio decision prompts must force recommendations to cite the manager ranking board."
  },
  {
    pattern: /客户视角要求[\s\S]{0,700}customerDecisionSummary[\s\S]{0,500}customerActionLeaderboard[\s\S]{0,500}customerActionDeck[\s\S]{0,500}可买复核[\s\S]{0,500}等待触发[\s\S]{0,500}卖出\/减仓[\s\S]{0,500}先补数据/,
    message: "portfolio decision prompts must make the customer decision summary, action leaderboard, and action deck the first layer for client-facing buy, wait, avoid, sell, and data guidance."
  },
  {
    pattern: /经理多角度榜单（系统计算，必须先看榜单再决定）[\s\S]{0,1900}cash_redeployment[\s\S]{0,500}position_sizing[\s\S]{0,500}quality_score[\s\S]{0,500}manager_stability[\s\S]{0,500}portfolio_fit[\s\S]{0,900}theme_momentum[\s\S]{0,900}stale_catchdown_risk[\s\S]{0,900}drawdown_defense[\s\S]{0,900}data_confidence[\s\S]{0,900}replacement_choice/,
    message: "portfolio decision prompts must force the model to review the cash-redeployment, position-sizing, fund-quality, manager-stability, portfolio-fit, main-capital/preheat, stale-catchdown, drawdown-defense, data-confidence, and replacement-choice ranking lanes."
  },
  {
    pattern: /buildPortfolioWatchlistStatusLines[\s\S]{0,1200}buildPortfolioWatchRankingCitationMap[\s\S]{0,1600}formatPortfolioWatchDetailLine/,
    message: "portfolio watchlist status replies must pass ranking citation context into detail lines."
  },
  {
    pattern: /function buildPortfolioWatchlistStatusLines[\s\S]{0,900}const compact = Boolean\(options\.compact\)[\s\S]{0,1200}自选池简版[\s\S]{0,1400}formatPortfolioWatchCompactLine/,
    message: "portfolio default watchlist status replies must support a compact customer-readable mode instead of dumping every detail."
  },
  {
    pattern: /function formatPortfolioWatchCompactLine[\s\S]{0,1600}关注：[\s\S]{0,600}下一步：[\s\S]{0,600}边界：[\s\S]{0,600}上榜：/,
    message: "portfolio compact watchlist lines must emphasize reason, next step, risk boundary, and ranking evidence."
  },
  {
    pattern: /formatPortfolioWatchDetailLine[\s\S]{0,2200}上榜依据：/,
    message: "portfolio watchlist detail lines must cite ranking lanes when available."
  },
  {
    pattern: /buildPortfolioStatusAnswer[\s\S]{0,1800}managerRankings[\s\S]{0,5200}buildPortfolioWatchlistStatusLines[\s\S]{0,900}managerRankings[\s\S]{0,500}compact:\s*!wantsWatchlist/,
    message: "portfolio status answers must include current ranking-board citations in watchlist summaries."
  },
  {
    pattern: /(?=[\s\S]*buildPortfolioWatchRankingCitationMap[\s\S]{0,2400}consensusRadar\?\.lanes)(?=[\s\S]*collectWatchlistRankingRefs[\s\S]{0,2400}consensusRadar\?\.lanes)/,
    message: "watchlist details and status replies must cite consensus radar lanes alongside ranking lanes."
  },
  {
    pattern: /function buildPortfolioAccountStatusLines[\s\S]{0,1800}账户简版[\s\S]{0,900}资金流转[\s\S]{0,900}回撤边界/,
    message: "portfolio default account status replies must summarize position, cash pressure, fund flow, and drawdown instead of dumping ledger fields."
  },
  {
    pattern: /buildPortfolioStatusAnswer[\s\S]{0,4200}buildPortfolioAccountStatusLines\(account,\s*\{\s*compact:\s*!wantsPosition\s*\}\)/,
    message: "portfolio status answers must reserve exact account ledger fields for explicit position/account questions."
  },
  {
    pattern: /function buildPortfolioPositionStatusLines[\s\S]{0,900}const compact = Boolean\(options\.compact\)[\s\S]{0,900}持仓简版[\s\S]{0,1400}formatPortfolioPositionCompactLine/,
    message: "portfolio default position status replies must support a compact customer-readable mode instead of dumping every ledger field."
  },
  {
    pattern: /function formatPortfolioPositionCompactLine[\s\S]{0,900}关注：[\s\S]{0,500}下一步：[\s\S]{0,500}边界：/,
    message: "portfolio compact position lines must emphasize focus, next step, and risk boundary."
  },
  {
    pattern: /buildPortfolioStatusAnswer[\s\S]{0,5200}buildPortfolioPositionStatusLines\(positions[\s\S]{0,300}compact:\s*!wantsPosition/,
    message: "portfolio status answers must use compact holdings by default and reserve detailed ledger fields for explicit position questions."
  },
  {
    pattern: /function buildPortfolioRecentDecisionStatusLines[\s\S]{0,700}动作摘要[\s\S]{0,900}formatPortfolioCustomerActionLine[\s\S]{0,900}完整推演/,
    message: "portfolio operation status replies must summarize the latest decision as customer action lines instead of pasting a daily report excerpt."
  },
  {
    pattern: /function buildPortfolioTodayOperationStatusLines[\s\S]{0,900}今日成交简版[\s\S]{0,700}formatPortfolioCustomerTransactionLine[\s\S]{0,900}formatPortfolioTransactionDetailStatusLine/,
    message: "portfolio today-operation status replies must use customer-readable transaction summaries by default while preserving explicit detail mode."
  },
  {
    pattern: /function buildPortfolioActiveOrderStatusLines[\s\S]{0,900}订单简版[\s\S]{0,700}formatPortfolioCustomerOrderLine[\s\S]{0,900}formatPortfolioOrderDetailStatusLine/,
    message: "portfolio active-order status replies must use customer-readable order flow summaries by default while preserving explicit detail mode."
  },
  {
    pattern: /buildPortfolioStatusAnswer[\s\S]{0,6400}buildPortfolioRecentDecisionStatusLines\(recentDecision/,
    message: "portfolio status answers must route recent decisions through the compact action-summary formatter."
  },
  {
    pattern: /buildPortfolioStatusAnswer[\s\S]{0,6800}buildPortfolioTodayOperationStatusLines[\s\S]{0,600}compact:\s*!wantsOperation[\s\S]{0,900}buildPortfolioActiveOrderStatusLines[\s\S]{0,600}compact:\s*!wantsOperation/,
    message: "portfolio status answers must reserve raw transaction and order fields for explicit operation questions."
  },
  {
    pattern: /^(?=[\s\S]*buildPortfolioRecentDecisionStatusLines)(?![\s\S]*recentDecision\.card\.split\("\\n"\)\.slice)/,
    message: "portfolio status answers must not slice raw recent decision report text into customer replies."
  },
  {
    pattern: /function buildPortfolioCustomerActionDeckStatusLines[\s\S]{0,1200}客户行动牌/,
    message: "portfolio status answers must format customer action cards in Chinese."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioCustomerActionDeckStatusLines[\s\S]{0,1600}formatPortfolioCustomerActionReasonLabel)(?=[\s\S]*function formatPortfolioCustomerActionReasonLabel[\s\S]{0,900}买入理由[\s\S]{0,900}加备选理由[\s\S]{0,900}暂不买理由[\s\S]{0,900}卖出\/减仓理由[\s\S]{0,900}先补证据原因)/,
    message: "portfolio customer action cards must explain buy, backup, avoid, sell, and data-block reasons with customer-friendly labels."
  },
  {
    pattern: /function buildPortfolioStatusDirectConclusionLines[\s\S]{0,900}priorityOrder = \["sell",\s*"buy",\s*"wait",\s*"avoid",\s*"data"\][\s\S]{0,900}直接结论：[\s\S]{0,900}优先处理：/,
    message: "portfolio status replies must start with a direct conclusion derived from customer action cards."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioStatusDirectConclusionLines[\s\S]{0,600}buildPortfolioStatusConsensusDirectConclusion)(?=[\s\S]*function buildPortfolioStatusConsensusDirectConclusion[\s\S]{0,2200}多榜单交叉)/,
    message: "portfolio status direct conclusions must prefer consensus radar before generic action cards."
  },
  {
    pattern: /buildPortfolioStatusAnswer[\s\S]{0,4200}buildPortfolioStatusDirectConclusionLines[\s\S]{0,900}buildPortfolioAccountStatusLines/,
    message: "portfolio status answers must put direct conclusion before account ledger summaries."
  },
  {
    pattern: /buildPortfolioStatusAnswer[\s\S]{0,5200}buildPortfolioCustomerActionDeckStatusLines/,
    message: "portfolio status answers must lead with customer action cards before dense holdings and watchlist details."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioCustomerActionLeaderboardStatusLines[\s\S]{0,900}客户行动排行)(?=[\s\S]*function buildPortfolioStatusAnswer[\s\S]{0,6200}buildPortfolioCustomerActionLeaderboardStatusLines[\s\S]{0,900}buildPortfolioCustomerActionDeckStatusLines)/,
    message: "portfolio status answers must translate customer action leaderboards before detailed action-card lines."
  },
  {
    pattern: /function buildPortfolioCustomerActionLeaderboardStatusLines[\s\S]{0,1200}排序口径[\s\S]{0,500}结果：\$\{results/,
    message: "portfolio customer action leaderboard status lines must lead with sort policy and ranked results instead of verbose trigger dumps."
  },
  {
    pattern: /function buildPortfolioRotationOpportunityRankingItem[\s\S]{0,260}resolvePortfolioPositiveWatchRankingGate\(item\)[\s\S]{0,260}if \(!riskGate\.ok && !evidence\.themeSupportGap\) return null[\s\S]{0,260}if \(evidence\.themeRetreatRisk\) return null/,
    message: "portfolio rotation opportunity ranking must drop retreat/catchdown themes instead of showing them as positive rotation opportunities."
  },
  {
    pattern: /function buildPortfolioDecisionSynthesisRankingItem[\s\S]{0,260}if \(evidence\.hardCatchdown\) return null[\s\S]{0,2600}const hardCatchdown = Boolean\([\s\S]{0,900}unsupportedHoldingThemeRisk/,
    message: "portfolio decision synthesis ranking must not surface hard catchdown risks inside the positive buy-class synthesis lane."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioConsensusRadarStatusLines[\s\S]{0,1200}共识雷达)(?=[\s\S]*buildPortfolioStatusAnswer[\s\S]{0,6200}buildPortfolioConsensusRadarStatusLines[\s\S]{0,900}buildPortfolioCustomerActionLeaderboardStatusLines)/,
    message: "portfolio status answers must translate consensus radar before detailed action leaderboards."
  },
  {
    pattern: /function buildPortfolioRedeploymentPlan[\s\S]{0,5200}pressureActive[\s\S]{0,5200}starter_buy[\s\S]{0,5200}实时估算时间/,
    message: "portfolio redeployment plan must force high-cash low-exposure portfolios to review starter buys with realtime valuation evidence."
  },
  {
    pattern: /function buildPortfolioRedeploymentPlan[\s\S]{0,950}PORTFOLIO_REDEPLOYMENT_CASH_TRIGGER_PCT[\s\S]{0,360}PORTFOLIO_REDEPLOYMENT_MAX_POSITION_PCT[\s\S]{0,520}positionWeightPct\) \|\| positionWeightPct <= redeploymentMaxPositionPct/,
    message: "portfolio redeployment plan must activate for high-cash moderate-exposure accounts, not only near-empty portfolios."
  },
  {
    pattern: /function buildPortfolioMissedFollowThroughReviewQueue[\s\S]{0,2200}findPortfolioBacktestMissedFollowThroughCandidates[\s\S]{0,2200}小仓试探 \/ 主动降级 \/ 明确复查时间/,
    message: "portfolio decisions must expose missed follow-through candidates as a concrete review queue."
  },
  {
    pattern: /function ensurePortfolioMissedFollowThroughReviewed[\s\S]{0,2600}portfolio_missed_follow_through_guard[\s\S]{0,1200}等待后继续走强/,
    message: "portfolio decisions must inject a buy/watch review when historical waiting missed follow-through."
  },
  {
    pattern: /function ensurePortfolioMissedFollowThroughReviewed[\s\S]{0,2600}1\.2%以内微型试探[\s\S]{0,1800}portfolio_missed_theme_momentum_guard/,
    message: "portfolio decisions must inject capped micro-starter reviews for missed main-capital/preheat opportunities."
  },
  {
    pattern: /function ensurePortfolioMissedFollowThroughReviewed[\s\S]{0,900}themeWhyMove[\s\S]{0,900}为什么动[\s\S]{0,1300}系统主力预热机会成本复核[\s\S]{0,900}微型试探/,
    message: "missed main-capital/preheat review actions must show the why-move news logic in the customer-visible reason."
  },
  {
    pattern: /function hasVerifiedThemeCarrierEvidence[\s\S]{0,1800}matchedThemeHoldings[\s\S]{0,900}isExplicitThemeIndexVehicle/,
    message: "portfolio theme micro-starters must verify that the representative fund actually carries the live theme through holdings or a specific index/ETF vehicle."
  },
  {
    pattern: /function hasPortfolioThemeMicroStarterSetup[\s\S]{0,900}hasVerifiedThemeCarrierEvidence/,
    message: "portfolio theme micro-starter setup must block buy-like actions when representative-fund carrier evidence fails."
  },
  {
    pattern: /function hasActionabilityMicroStarterSupport[\s\S]{0,900}hasStaleThemeCatchdownRisk[\s\S]{0,900}hasVerifiedThemeCarrierEvidence/,
    message: "fund actionability micro-starter support must reject stale-theme catchdown risk and require verified theme-carrier evidence."
  },
  {
    pattern: /function isThemeLowBaseMicroStarterSupport[\s\S]{0,500}hasTraceableFreshThemeCatalystContext\(theme\)[\s\S]{0,700}function isThemeLaunchProbeSupport[\s\S]{0,300}hasTraceableFreshThemeCatalystContext\(theme\)/,
    message: "theme micro-starter recognition must require traceable fresh catalyst support for both low-base and launch-probe setups."
  },
  {
    pattern: /function compactMatchedThemeSignal[\s\S]{0,800}mainInflowRankScore/,
    message: "matched fund themes must preserve main-inflow leaderboard evidence for rank-only main-force opportunities."
  },
  {
    pattern: /function collectCandidateHoldings[\s\S]{0,700}candidate\.topHoldings[\s\S]{0,500}candidate\.seed\?\.topHoldings/,
    message: "fund holding-carrier checks must read topHoldings arrays from seed previews and fund snapshots, not only nested holdings.equityTopHoldings."
  },
  {
    pattern: /等待后继续走强的候选复核队列（必须逐只处理，不能只写观察池）[\s\S]{0,900}actions 中必须对前3只给出 BUY\/小仓试探/,
    message: "portfolio prompts must force the model to handle missed follow-through candidates explicitly."
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
    pattern: /async function fetchPortfolioWatchlistSeedCandidates[\s\S]{0,1600}shouldForcePortfolioRedeploymentSeedScan[\s\S]{0,1600}PORTFOLIO_REDEPLOYMENT_SEED_LIMIT/,
    message: "portfolio watchlist seeding must keep scanning low-position candidates when high-cash redeployment has no executable setup."
  },
  {
    pattern: /async function fetchPortfolioWatchlistSeedCandidates[\s\S]{0,1200}findPortfolioBacktestBlockedFollowThroughCandidates[\s\S]{0,900}shouldForcePortfolioBlockedFollowThroughSeedScan[\s\S]{0,900}buildPortfolioWatchlistSeedSearchText/,
    message: "portfolio watchlist seeding must search replacements when blocked candidates later follow through."
  },
  {
    pattern: /async function fetchPortfolioWatchlistSeedCandidates[\s\S]{0,1400}findPortfolioBacktestDataBlockedCandidates[\s\S]{0,900}shouldForcePortfolioDataBlockedSeedScan[\s\S]{0,900}buildPortfolioWatchlistSeedSearchText/,
    message: "portfolio watchlist seeding must search replacements when candidates are blocked by trend/data-source gaps."
  },
  {
    pattern: /async function fetchPortfolioWatchlistSeedCandidates[\s\S]{0,2200}shouldForcePortfolioThemeOpportunitySeedScan[\s\S]{0,1200}buildPortfolioThemeOpportunitySeedCandidates[\s\S]{0,900}PORTFOLIO_REDEPLOYMENT_SEED_LIMIT/,
    message: "portfolio watchlist seeding must force candidate recall when live main-capital/preheat/low-rotation themes are not represented in the watchlist."
  },
  {
    pattern: /function buildPortfolioWatchlistSeedSearchText[\s\S]{0,700}新闻催化[\s\S]{0,700}前十大持仓[\s\S]{0,700}代表基金[\s\S]{0,700}inferPortfolioThemeOpportunitySearchKeywords/,
    message: "portfolio watchlist seeding must search representative funds for live theme opportunities instead of generic low-position funds only."
  },
  {
    pattern: /function buildPortfolioThemeOpportunityKeywordGroups[\s\S]{0,1700}collectPortfolioThemeOpportunityLeaderboardItems[\s\S]{0,1100}collectThemeOpportunitySearchKeywords[\s\S]{0,3200}function buildPortfolioThemeOpportunitySeedCandidates[\s\S]{0,2600}题材榜单代表基金[\s\S]{0,3200}function collectThemeOpportunitySearchKeywords[\s\S]{0,1200}fundKeywords[\s\S]{0,700}newsKeywords/,
    message: "portfolio theme opportunity seed recall must derive grouped theme/fund keywords from main-capital, preheat, and low-rotation leaderboards."
  },
  {
    pattern: /function scorePullbackSetupSeedCandidate[\s\S]{0,260}shouldSuppressPreciousMetalCandidate\(userText,\s*item\)[\s\S]{0,1200}seedContextText[\s\S]{0,1200}theme_leaderboard_carrier_seed\|题材榜单代表基金[\s\S]{0,1200}require_current_theme_playbook/,
    message: "theme-leaderboard representative fund seeds must receive scoring lift without weakening gold suppression."
  },
  {
    pattern: /function collectThemeOpportunitySearchKeywords[\s\S]{0,600}collectThemeCatalystSearchKeywords\(theme,\s*options\)[\s\S]{0,1200}function collectThemeCatalystSearchKeywords[\s\S]{0,1200}extractEmergingNewsTopicTerms[\s\S]{0,900}THEME_NEWS_KEYWORD_EXPANSIONS/,
    message: "portfolio theme opportunity recall must extract specific catalyst terms from fresh news logic so preheated topics become representative-fund searches quickly."
  },
  {
    pattern: /function collectThemeOpportunityAnchorKeywords[\s\S]{0,700}collectThemeCatalystSearchKeywords\(theme,\s*options\)[\s\S]{0,900}specificAnchors[\s\S]{0,500}isBroadThemeOpportunityCoverageAnchor[\s\S]{0,1200}智能制造/,
    message: "portfolio theme coverage anchors must prefer specific catalyst terms so broad sector watchlist items do not block fresh preheat recalls."
  },
  {
    pattern: /function collectThemeCatalystSearchKeywords[\s\S]{0,1400}collectMatchedThemeNewsAliases[\s\S]{0,500}preciseOnly:\s*true[\s\S]{0,900}function collectMatchedThemeNewsAliases[\s\S]{0,1000}matchedAliases/,
    message: "theme opportunity recall must prefer specific catalyst aliases such as CPO or liquid cooling instead of expanding every broad AI-compute alias."
  },
  {
    pattern: /function filterPortfolioDefaultThemeOpportunityItems[\s\S]{0,900}isPreciousPortfolioThemeOpportunityItem[\s\S]{0,900}function isPreciousPortfolioThemeOpportunityItem[\s\S]{0,500}黄金\|贵金属/,
    message: "portfolio default theme recall must suppress precious-metal seeds when non-precious mainline themes are available, without disabling gold-only opportunities."
  },
  {
    pattern: /function formatPortfolioThemeSeedWaitingReason[\s\S]{0,1200}已有新闻\/资金线索[\s\S]{0,900}不能把题材热度直接当买点/,
    message: "theme representative fund seeds that are not executable must explain the live theme logic and the fund-carrier/buy-point gap."
  },
  {
    pattern: /function buildPortfolioCapabilityDiagnostics[\s\S]{0,5200}findPortfolioThemeRepresentativeGaps[\s\S]{0,900}主力预热代表基金缺口/,
    message: "portfolio capability diagnostics must surface live main-capital/preheat themes whose representative funds are missing from the watchlist."
  },
  {
    pattern: /function findPortfolioThemeRepresentativeGaps[\s\S]{0,1200}buildPortfolioThemeOpportunityKeywordGroups[\s\S]{0,900}hasPortfolioThemeRepresentativeCoverageForGroup/,
    message: "theme representative gap detection must compare theme leaderboard keywords against active watchlist coverage."
  },
  {
    pattern: /(?=[\s\S]*function shouldForcePortfolioThemeOpportunitySeedScan[\s\S]{0,500}hasPortfolioThemeRepresentativeCoverageForGroup)(?=[\s\S]*function findPortfolioThemeRepresentativeGaps[\s\S]{0,800}hasPortfolioThemeRepresentativeCoverageForGroup)(?=[\s\S]*function hasPortfolioThemeRepresentativeCoverageForGroup[\s\S]{0,900}isPortfolioThemeRepresentativeCoverageCandidate)/,
    message: "theme representative recall and diagnostics must use item-level usable coverage instead of pooled watchlist text."
  },
  {
    pattern: /function findLatestPortfolioMarketSnapshot[\s\S]{0,2600}isFreshPortfolioMarketSnapshot[\s\S]{0,1400}Date\.parse\(b\.completedAt/,
    message: "portfolio diagnostics must use the latest fresh market snapshot instead of stale cached theme radar."
  },
  {
    pattern: /function evaluatePortfolioMarketSnapshotFreshness[\s\S]{0,1800}PORTFOLIO_MARKET_SNAPSHOT_MAX_AGE_DAYS/,
    message: "market snapshot freshness must have an explicit age cap before treating theme radar as live."
  },
  {
    pattern: /function buildPortfolioCapabilityDiagnostics[\s\S]{0,5200}findPortfolioMarketSnapshotFreshnessIssues[\s\S]{0,700}主力题材快照待刷新/,
    message: "stale theme snapshots must become visible refresh tasks instead of silent waiting."
  },
  {
    pattern: /function buildPortfolioCapabilityActionQueue[\s\S]{0,2200}主力题材快照待刷新[\s\S]{0,500}新闻快讯/,
    message: "stale theme snapshot refresh tasks must ask for news, capital flow, and representative-fund refresh."
  },
  {
    pattern: /function findLatestPortfolioThemeLeaderboardsFromRuns[\s\S]{0,900}isFreshPortfolioMarketSnapshot[\s\S]{0,500}themeLeaderboards/,
    message: "manager ability proof must reject stale theme leaderboards before showing main-capital follow evidence."
  },
  {
    pattern: /function findLatestPortfolioThemeMainForcePlaybookFromRuns[\s\S]{0,1000}isFreshPortfolioMarketSnapshot[\s\S]{0,800}themeMainForcePlaybook/,
    message: "manager ability proof must reject stale main-force playbooks before showing main-force evidence."
  },
  {
    pattern: /function buildPortfolioWatchlistThemeCoverageText[\s\S]{0,500}filter\(isPortfolioThemeRepresentativeCoverageCandidate\)/,
    message: "theme coverage must only count usable representative candidates, not stale text matches in the watchlist."
  },
  {
    pattern: /function isPortfolioThemeRepresentativeCoverageCandidate[\s\S]{0,1200}isUnrefreshedMarketThemeSignal[\s\S]{0,700}hasStaleThemeCatchdownRisk[\s\S]{0,700}hasVerifiedThemeCarrierEvidence/,
    message: "usable theme representatives must reject unconfirmed old themes, stale/retreat/chase candidates, and require verified carrier evidence for actionable live themes."
  },
  {
    pattern: /function isPortfolioThemeRepresentativeCoverageCandidate[\s\S]{0,520}getStalePortfolioThemeRefreshWarnings\(profile\)[\s\S]{0,260}getPortfolioActionableThemeSupportGap\(profile\)/,
    message: "usable theme representatives must reject expired radar snapshots and current theme-support gaps."
  },
  {
    pattern: /function buildPortfolioThemeCoverageProfile[\s\S]{0,900}marketThemeRefresh[\s\S]{0,500}holdingThemeRefresh/,
    message: "theme coverage profiles must preserve market and holding theme refresh metadata for freshness guards."
  },
  {
    pattern: /function isUnrefreshedMarketThemeSignal[\s\S]{0,500}current_radar_unconfirmed[\s\S]{0,500}未被当前题材雷达确认/,
    message: "theme representative coverage must detect old theme labels that were not confirmed by the current radar."
  },
  {
    pattern: /function inferPortfolioBlockedFollowThroughSearchKeywords[\s\S]{0,2200}信息传媒[\s\S]{0,900}QDII[\s\S]{0,900}新能源车[\s\S]{0,900}医药/,
    message: "blocked or data-gapped replacement scans must infer theme keywords such as media, QDII, new-energy vehicles, and healthcare."
  },
  {
    pattern: /function formatPortfolioCustomerActionLine[\s\S]{0,900}走势：\$\{trend\}[\s\S]{0,500}为什么：\$\{why\}[\s\S]{0,500}边界：\$\{boundary\}[\s\S]{0,500}\.join\("\\n"\)/,
    message: "portfolio decision cards must split action reasoning into trend, reason, and boundary lines instead of one dense numeric paragraph."
  },
  {
    pattern: /function formatPortfolioCustomerAccountLine[\s\S]{0,1400}可动用约[\s\S]{0,900}赎回款约[\s\S]{0,500}不当作买入火力/,
    message: "portfolio decision cards must present deployable cash separately from unsettled redemption receivables."
  },
  {
    pattern: /function computePortfolioCustomerCashPct[\s\S]{0,360}Number\(account\.cash \|\| 0\)/,
    message: "portfolio customer cash percentage must use deployable cash, not cash plus receivables."
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
    pattern: /evaluatePortfolioSpecialShareClassAvailability[\s\S]{0,1800}special_or_platform_class[\s\S]{0,1800}普通渠道可申购[\s\S]{0,900}起购门槛/,
    message: "portfolio BUY guard must verify retail channel availability and minimum purchase before buying special/platform share classes."
  },
  {
    pattern: /D\/I\/Y等特殊或平台份额缺少可申购渠道、起购门槛或申购规则验证/,
    message: "portfolio BUY guard must explain special/platform share-class blocks in user-readable Chinese."
  },
  {
    pattern: /缺少回调完成\/启动前夜、5日\/10日刚转强和低位证据/,
    message: "portfolio BUY guard must explain when low-position launch or early-turn evidence is missing."
  },
  {
    pattern: /function evaluatePortfolioBuyDiscipline[\s\S]{0,2600}getPortfolioActionableThemeSupportGap\(profile\)[\s\S]{0,500}portfolio_theme_support_guard/,
    message: "portfolio BUY guard must block theme-labeled pullbacks that lack current actionable main-capital, preheat, or rotation support."
  },
  {
    pattern: /(?=[\s\S]*function getPortfolioActionableThemeSupportGap[\s\S]{0,1800}hasPortfolioCurrentThemeRadarSupport\(candidate\))(?=[\s\S]*function getPortfolioActionableThemeSupportGap[\s\S]{0,2200}getPortfolioThemeSupportRequirement\(candidate\))(?=[\s\S]*function getPortfolioActionableThemeSupportGap[\s\S]{0,2400}基金名称\/标签显示为)/,
    message: "portfolio theme support gaps must block theme-named funds when current radar support is absent."
  },
  {
    pattern: /(?=[\s\S]*function getPortfolioActionableThemeSupportGap[\s\S]{0,1400}getPortfolioHoldingThemeSupportGap\(candidate\))(?=[\s\S]*function getPortfolioHoldingThemeSupportGap[\s\S]{0,1000}前十大持仓实际集中)/,
    message: "portfolio theme support gaps must block generic-name funds when concentrated top holdings reveal an unsupported bottom-layer theme."
  },
  {
    pattern: /function buildHoldingThemeExposureProfile[\s\S]{0,2500}getHoldingThemeExposureSpecificityScore[\s\S]{0,900}dominant[\s\S]{0,900}function getHoldingThemeExposureSpecificityScore[\s\S]{0,500}CPO\|光模块\|AI服务器\|液冷\|半导体\|芯片[\s\S]{0,900}function isDominantHoldingThemeExposure[\s\S]{0,1200}function formatHoldingThemeExposureSummary/,
    message: "holdings outlook must compute dominant bottom-layer theme exposure from top-ten holdings."
  },
  {
    pattern: /const HOLDING_THEME_GROUPS[\s\S]{0,900}CPO\/光模块[\s\S]{0,700}AI服务器\/液冷[\s\S]{0,700}半导体\/芯片[\s\S]{0,1800}const HOLDING_THEME_PATTERNS[\s\S]{0,900}CPO\/光模块[\s\S]{0,900}AI服务器\/液冷[\s\S]{0,900}半导体\/芯片/,
    message: "top-ten holding exposure must split broad technology into precise CPO/optical-module, AI-server/liquid-cooling, and semiconductor subthemes."
  },
  {
    pattern: /function hasPortfolioCurrentSupportForHoldingTheme[\s\S]{0,1600}isFreshActionableThemeSupportForCandidate\(candidate,\s*theme\)[\s\S]{0,1200}function isThemeSignalRelatedToHoldingTheme/,
    message: "holding-derived theme exposure must reopen only when same-direction current radar, main-capital, or news support is present."
  },
  {
    pattern: /function hasPortfolioCurrentThemeRadarSupport[\s\S]{0,520}isPortfolioThemeRefreshFreshEnough\(refresh\)[\s\S]{0,900}function isPortfolioThemeRefreshFreshEnough[\s\S]{0,220}evaluatePortfolioThemeRefreshFreshness/,
    message: "current theme radar support must reject expired or unverified radar snapshots before reopening buys."
  },
  {
    pattern: /function evaluatePortfolioThemeRefreshFreshness[\s\S]{0,1300}PORTFOLIO_THEME_REFRESH_MAX_AGE_DAYS[\s\S]{0,600}重新刷新主力资金\/新闻催化/,
    message: "stale theme refresh blocks must use configurable freshness and customer-readable Chinese explanations."
  },
  {
    pattern: /function hasPortfolioCurrentSupportForHoldingTheme[\s\S]{0,520}isPortfolioThemeRefreshFreshEnough\(holdingThemeRefresh,\s*\{\s*label:\s*"前十大持仓题材雷达"\s*\}\)/,
    message: "holding-theme support must also reject stale holding-theme radar refresh snapshots."
  },
  {
    pattern: /function getPortfolioActionableThemeSupportGap[\s\S]{0,1300}getStalePortfolioThemeRefreshWarnings\(candidate\)[\s\S]{0,220}staleThemeRefreshWarnings\[0\]/,
    message: "theme support gaps must surface stale radar refresh snapshots before vague wait-state language."
  },
  {
    pattern: /function getPortfolioWatchThemeSupportGap[\s\S]{0,700}marketThemeRefresh:\s*profile\.marketThemeRefresh \|\| item\.marketThemeRefresh[\s\S]{0,500}holdingThemeRefresh:\s*profile\.holdingThemeRefresh \|\| item\.holdingThemeRefresh/,
    message: "watchlist theme-support gaps must preserve item-level market and holding theme refresh evidence."
  },
  {
    pattern: /function buildPortfolioWatchReadinessGaps[\s\S]{0,1300}getStalePortfolioThemeRefreshWarnings\(evidence\)[\s\S]{0,120}getStalePortfolioThemeRefreshWarnings\(item\)/,
    message: "watchlist readiness gaps must surface stale radar refresh evidence even when NAV/trend evidence is missing."
  },
  {
    pattern: /function isPortfolioRedeploymentHardGap[\s\S]{0,900}重新刷新主力资金/,
    message: "expired current-theme radar evidence must be treated as a hard redeployment no-buy gap."
  },
  {
    pattern: /function isPortfolioWatchStructuralReadinessGap[\s\S]{0,900}重新刷新主力资金/,
    message: "expired current-theme radar evidence must be treated as a hard watchlist readiness gap."
  },
  {
    pattern: /function getPortfolioWatchStructuralReadinessCap[\s\S]{0,500}重新刷新主力资金/,
    message: "expired current-theme radar evidence must cap watchlist readiness instead of sounding close to buyable."
  },
  {
    pattern: /buildPortfolioStaleCatchdownRiskRankingItem[\s\S]{0,1800}staleThemeRefreshRisk[\s\S]{0,2200}旧雷达接盘拦截[\s\S]{0,2600}当前主力资金\/新闻催化刷新/,
    message: "catchdown risk ranking must surface expired theme-radar support as an old-radar trap."
  },
  {
    pattern: /(?=[\s\S]*function getPortfolioThemeSupportRequirement[\s\S]{0,900}isBroadPortfolioExposureText)(?=[\s\S]*function isBroadPortfolioExposureText)/,
    message: "portfolio theme support guard must exempt broad/core funds from sector-radar-only blocking."
  },
  {
    pattern: /function getPortfolioSectorThemeLabel[\s\S]{0,3200}人工智能[\s\S]{0,3200}医药[\s\S]{0,3200}消费[\s\S]{0,3200}黄金/,
    message: "portfolio theme support guard must detect sector/theme fund labels even when matchedThemes are empty."
  },
  {
    pattern: /function hasVerifiedPortfolioBuySetup[\s\S]{0,220}getPortfolioActionableThemeSupportGap\(profile\)[\s\S]{0,900}function hasPortfolioStarterBuySetup[\s\S]{0,260}getPortfolioActionableThemeSupportGap\(profile\)/,
    message: "portfolio verified and starter buy setup gates must not bypass current theme support gaps."
  },
  {
    pattern: /function getTextualCatchdownWarnings[\s\S]{0,900}文本证据显示题材退潮/,
    message: "portfolio BUY guard must define a text-only retreat/catchdown warning extractor."
  },
  {
    pattern: /(?=[\s\S]*function resolvePortfolioChaseRiskEvidence[\s\S]{0,2600}unsupportedHoldingThemeRisk)(?=[\s\S]*function buildPortfolioStaleCatchdownRiskRankingItem[\s\S]{0,3000}底层题材未确认拦截)/,
    message: "catchdown rankings must surface generic-name candidates whose top holdings reveal unsupported bottom-layer theme exposure."
  },
  {
    pattern: /function isTextualCatchdownRiskSegment[\s\S]{0,1200}旧主力标签[\s\S]{0,500}历史热点[\s\S]{0,500}当前题材雷达/,
    message: "text-only catchdown guard must also catch historical-hotspot or old-main labels that are not confirmed by the current theme radar."
  },
  {
    pattern: /function evaluatePortfolioBuyDiscipline[\s\S]{0,1700}getTextualCatchdownWarnings\(action,\s*profile\)[\s\S]{0,500}portfolio_text_catchdown_guard/,
    message: "portfolio BUY guard must block text-only retreat/catchdown warnings even when structured matchedThemes are missing."
  },
  {
    pattern: /function getPortfolioActionableThemeSupportGap[\s\S]{0,500}getTextualCatchdownWarnings\(candidate\)/,
    message: "theme support gaps must reuse text-only retreat/catchdown warnings for watchlist readiness."
  },
  {
    pattern: /(?=[\s\S]*function evaluatePortfolioBuyDiscipline)(?=[\s\S]*getHoldingRealtimeCatchdownWarning\(profile\))(?=[\s\S]*portfolio_holding_realtime_guard)(?=[\s\S]*function hasPortfolioThemeMicroStarterSetup[\s\S]{0,1200}hasHoldingRealtimeCatchdownRisk\(profile\))/,
    message: "portfolio BUY guard and micro-starter recognition must block intraday weak top-holding pulse as catchdown risk."
  },
  {
    pattern: /function buildPortfolioWatchReadinessGaps[\s\S]{0,2600}getStaleThemeCatchdownWarnings\(evidence\)[\s\S]{0,2600}getPortfolioWatchThemeSupportGap\(item,\s*evidence\)[\s\S]{0,260}gaps\.push\(themeSupportGap\)/,
    message: "watchlist readiness must downgrade stale-catchdown and theme-labeled pullbacks that lack current actionable theme support."
  },
  {
    pattern: /function isPortfolioRedeploymentHardGap[\s\S]{0,700}题材退潮[\s\S]{0,260}接盘风险[\s\S]{0,260}旧新闻[\s\S]{0,120}旧催化/,
    message: "cash redeployment must treat stale-theme catchdown and old-catalyst risk as hard no-buy gaps."
  },
  {
    pattern: /function isPortfolioRedeploymentHardGap[\s\S]{0,900}前十大持仓实际集中/,
    message: "cash redeployment must treat concentrated top-holding themes without current radar support as hard no-buy gaps."
  },
  {
    pattern: /function buildPortfolioDecisionSynthesisRankingItem[\s\S]{0,220}if \(evidence\.hardCatchdown\) return null[\s\S]{0,1400}function resolvePortfolioDecisionSynthesisEvidence[\s\S]{0,700}hardCatchdown[\s\S]{0,600}themeSupportGap/,
    message: "decision-synthesis ranking must not classify unsupported theme pullbacks as buy-review candidates."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioRotationOpportunityRankingItem[\s\S]{0,1600}evidence\.themeSupportGap \|\| evidence\.missingTheme)(?=[\s\S]*function buildPortfolioRotationOpportunityRankingItem[\s\S]{0,3600}不给买入金额)(?=[\s\S]*function buildPortfolioRotationOpportunityRankingItem[\s\S]{0,4200}status: evidence\.themeSupportGap)/,
    message: "rotation-opportunity ranking must keep pure low-position trends without current theme radar out of buy-review."
  },
  {
    pattern: /function finalizePortfolioRankingDecisionMatrixRow[\s\S]{0,1600}const hasSectorBlock =[\s\S]{0,700}hasDataBlock \|\| hasSectorBlock[\s\S]{0,260}\? "先补证据"/,
    message: "decision matrix must treat missing current theme radar as a blocker before assigning buy-review actions."
  },
  {
    pattern: /function buildPortfolioRankingDecisionMatrixVerdict[\s\S]{0,700}hasSectorBlock[\s\S]{0,900}板块\/题材/,
    message: "decision matrix verdict must expose missing current theme radar as a sector/theme blocker."
  },
  {
    pattern: /function shouldIncludePortfolioAlertItem[\s\S]{0,900}laneId === "buy"[\s\S]{0,260}hasPortfolioCustomerBuyBlocker/,
    message: "customer buy alerts must exclude candidates whose only rotation evidence lacks current theme radar."
  },
  {
    pattern: /function resolvePortfolioDataConfidenceEvidence[\s\S]{0,1200}getPortfolioWatchThemeSupportGap\(item,\s*snapshot\)[\s\S]{0,900}当前主力进场\|题材预热\|低位轮动支撑/,
    message: "data-confidence ranking must surface missing current theme support as a critical evidence gap."
  },
  {
    pattern: /function resolvePortfolioSizingBand[\s\S]{0,500}themeSupportGap[\s\S]{0,900}仓位必须保持0元观察/,
    message: "position-sizing ranking must force 0-yuan observation when current theme support is missing."
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
    pattern: /function compactPortfolioReviewProfile[\s\S]{0,300}topHoldings = \(profile\.holdings\?\.equityTopHoldings \|\| profile\.topHoldings \|\| profile\.topStocks \|\| \[\]\)\.slice\(0, 10\)/,
    message: "portfolio model review context must preserve all ten top holdings instead of truncating to five."
  },
  {
    pattern: /function buildPortfolioFundSnapshot[\s\S]{0,1000}topHoldings = \(profile\.holdings\?\.equityTopHoldings \|\| profile\.topHoldings \|\| profile\.topStocks \|\| \[\]\)\.slice\(0, 10\)/,
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
    pattern: /function buildPortfolioDecisionRankingBoard[\s\S]{0,900}heldProfiles[\s\S]{0,700}refreshPortfolioHeldPositionsThemesWithMarketRadar/,
    message: "decision ranking board must refresh held-position theme labels with the current market radar before building risk lanes."
  },
  {
    pattern: /function refreshPortfolioHeldPositionsThemesWithMarketRadar[\s\S]{0,2400}current_market_theme_radar[\s\S]{0,900}buildPortfolioPositionRiskBudget/,
    message: "held-position theme refresh must update snapshots, trace current-radar evidence, and recompute position risk budgets."
  },
  {
    pattern: /function buildPortfolioHeldPositionRiskReview[\s\S]{0,2200}getCandidateThemeRetreatWarnings[\s\S]{0,900}当前题材风险/,
    message: "held-position reviews must surface current theme retreat/main-capital outflow risk instead of only NAV-trend risk."
  },
  {
    pattern: /function matchCandidateThemes[\s\S]{0,500}theme\.fundKeywords[\s\S]{0,240}theme\.keywords[\s\S]{0,240}theme\.themeKeywords/,
    message: "candidate-theme matching must use full theme keywords so CPO/optical-module holdings inherit current main-capital retreat signals."
  },
  {
    pattern: /async function enrichFunds\(fundCodes,\s*options = \{\}\)[\s\S]{0,600}FUND_ENRICHMENT_LIMIT[\s\S]{0,1800}fundEnrichmentSkippedByLimit/,
    message: "fund enrichment must use configurable coverage limits and report skipped profiles instead of silently hard-limiting to six funds."
  },
  {
    pattern: /executePortfolioDecision[\s\S]{0,1600}heldProfilesRaw[\s\S]{0,180}getPortfolioProfileEnrichmentLimit[\s\S]{0,600}watchlistProfilesRaw[\s\S]{0,180}getPortfolioProfileEnrichmentLimit/,
    message: "portfolio decisions must enrich held positions and watchlist candidates with the higher portfolio coverage limit."
  },
  {
    pattern: /function collectPortfolioSellDisciplineSignals[\s\S]{0,5200}getCandidateThemeRetreatWarnings[\s\S]{0,5200}主力撤离[\s\S]{0,700}降低题材风险/,
    message: "sell discipline must accept current theme retreat or main-capital outflow as valid staged reduction evidence."
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
    pattern: /compactPortfolioWeeklyAccount[\s\S]{0,1800}positions: \(account\.positions \|\| \[\]\)\.map\(compactPortfolioWeeklyPosition\)/,
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
    pattern: /(?=[\s\S]*WATCHLIST_HARD_RISK_RULES)(?=[\s\S]*旧题材未确认)(?=[\s\S]*历史热点)(?=[\s\S]*接盘风险)(?=[\s\S]*退潮接盘)(?=[\s\S]*底层持仓走弱)(?=[\s\S]*表面回调可能继续下探)(?=[\s\S]*持仓未承载题材)(?=[\s\S]*renderWatchlistHardRiskStrip)(?=[\s\S]*watchlist-hard-risk-strip)(?=[\s\S]*watchlist-risk-danger)/,
    message: "admin watchlist UI must highlight hard risks such as weak top-holding pulse, holdings-carrier mismatch, capital retreat, and chase risk before long evidence text."
  },
  {
    pattern: /(?=[\s\S]*function renderWatchlistCatchdownNotice)(?=[\s\S]*function isWatchlistCatchdownRiskItem)(?=[\s\S]*接盘风险)(?=[\s\S]*只做0元观察)(?=[\s\S]*这不是低位启动)(?=[\s\S]*\.watchlist-catchdown-notice)/,
    message: "admin watchlist categories must surface stale-catchdown candidates as zero-yuan observation before the detailed fund cards."
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
    pattern: /\/api\/deployment[\s\S]{0,360}getDeploymentFreshness/,
    message: "admin API must expose deployment freshness so stale server builds are visible from the UI."
  },
  {
    pattern: /async function getDeploymentFreshness[\s\S]{0,1800}fetchDeploymentFreshnessSnapshot[\s\S]{0,2400}api\.github\.com\/repos/,
    message: "deployment freshness must compare the running commit with the latest GitHub branch commit."
  },
  {
    pattern: /loadStats[\s\S]{0,900}\/api\/deployment[\s\S]{0,1200}renderRuntimeTerminal\(stats,\s*deployment\)/,
    message: "admin runtime UI must load deployment freshness without blocking the normal stats view."
  },
  {
    pattern: /formatDeploymentStatus[\s\S]{0,800}部署落后[\s\S]{0,1200}formatDeploymentMeta[\s\S]{0,1200}getDeploymentTone/,
    message: "admin runtime UI must render stale deployment status as a compact 1Panel-style status card."
  },
  {
    pattern: /(?=[\s\S]*portfolioDeploymentStatus)(?=[\s\S]*portfolioRailDeploymentStatus)(?=[\s\S]*currentDeployment)(?=[\s\S]*renderPortfolioDeploymentStatus[\s\S]{0,1600}formatDeploymentStatus[\s\S]{0,1200}formatDeploymentMeta)(?=[\s\S]*portfolio-deployment-status)(?=[\s\S]*portfolio-rail-deployment)/,
    message: "admin portfolio dashboard must surface deployment freshness inside the manager workspace, not only the runtime tab."
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
    pattern: /runtimeReleaseBoard[\s\S]*formatReleaseCommit|formatReleaseCommit[\s\S]*runtimeReleaseBoard/,
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
    pattern: /(?=[\s\S]*本次任务焦点：回调完成\/低位启动，但低位不是第一理由，先确认题材还活着)(?=[\s\S]*当前题材作战图)(?=[\s\S]*当前题材有支撑 \+ 基金承载题材 \+ 回调\/启动买点合格)/,
    message: "pullback/setup prompts must put live theme, catalyst, capital-flow, and fund-carrier checks before pure low-position trend screening."
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
    pattern: /(?=[\s\S]*function inferPullbackSetupSearchKeywords)(?=[\s\S]*\.filter\(\(keyword\)\s*=>\s*allowPrecious\s*\|\|\s*!isPreciousMetalKeyword\(keyword\)\))/,
    message: "generic pullback/setup discovery must suppress precious-metal search keywords unless explicitly requested."
  },
  {
    pattern: /function fetchPullbackSetupCandidates[\s\S]{0,2600}\.filter\(\(item\)\s*=>\s*!shouldSuppressPreciousMetalCandidate\(userText,\s*item\)\)/,
    message: "generic pullback/setup discovery must not seed gold candidates unless the user asks for gold."
  },
  {
    pattern: /function scorePullbackSetupSeedCandidate[\s\S]{0,120}shouldSuppressPreciousMetalCandidate\(userText,\s*item\)[\s\S]{0,80}return -1000/,
    message: "generic pullback/setup scoring must strongly suppress gold candidates unless explicitly requested."
  },
  {
    pattern: /function selectPortfolioWatchlistSeedCandidates[\s\S]{0,900}marketContext[\s\S]{0,900}refreshPortfolioCandidateThemesWithMarketRadar\(candidate,\s*marketContext\)[\s\S]{0,700}scorePullbackSetupSeedCandidate\(enriched,\s*marketContext/,
    message: "watchlist seed selection must refresh candidate theme labels with the current market radar before scoring."
  },
  {
    pattern: /function scorePullbackSetupSeedCandidate[\s\S]{0,700}marketContext[\s\S]{0,3600}refreshPortfolioCandidateThemesWithMarketRadar\(item,\s*marketContext\)[\s\S]{0,500}matchedThemes/,
    message: "pullback/setup scoring must prefer current-radar theme labels over stale candidate labels."
  },
  {
    pattern: /if \(\["capital_entering", "preheat_catalyst"\]\.includes\(theme\.leaderSignal\) && hasTraceableFreshThemeCatalystContext\(theme\)\) score \+= 10;[\s\S]{0,260}score -= 24;/,
    message: "pullback/setup seed scoring must penalize main-capital/preheat heat when catalyst source is not traceable."
  },
  {
    pattern: /function scoreDeepDiveCandidate[\s\S]{0,700}marketContext[\s\S]{0,700}refreshPortfolioCandidateThemesWithMarketRadar\(item,\s*marketContext\)[\s\S]{0,500}matchedThemes/,
    message: "deep-dive scoring must prefer current-radar theme labels over stale candidate labels."
  },
  {
    pattern: /(?=[\s\S]*function hasPullbackThemeOpportunityBacking[\s\S]{0,900}hasFreshPullbackLowRotationThemeEvidence\(candidate,\s*theme\))(?=[\s\S]*低位轮动标签缺少当前题材雷达刷新)(?=[\s\S]*function isFreshPortfolioThemeRefreshSupportForTheme[\s\S]{0,1100}isPortfolioThemeRefreshFreshEnough\(refresh\)[\s\S]{0,900}matchedThemeNames)/,
    message: "pullback/setup main recommendations must require fresh current-radar evidence before low-rotation labels can support a buyable result."
  },
  {
    pattern: /function resolvePortfolioRotationOpportunityEvidence[\s\S]{0,1600}themeSupportGap = getPortfolioActionableThemeSupportGap[\s\S]{0,1300}themeSupportGap \? 36/,
    message: "rotation opportunity ranking must downgrade stale low-rotation theme labels instead of scoring them as buyable rotation."
  },
  {
    pattern: /(?=[\s\S]*function hasPortfolioPlaybookOpportunitySeedContext)(?=[\s\S]*collectPortfolioManagerPlaybookOpportunityMatches\(candidate\))(?=[\s\S]*function formatPortfolioWatchSeedKind[\s\S]{0,520}hasPortfolioPlaybookOpportunitySeedContext\(candidate\)[\s\S]{0,120}主力预热代表基金候选)(?=[\s\S]*function buildPortfolioWatchlistUpdatesFromSeedCandidates[\s\S]{0,1800}formatPortfolioSeedPlaybookOpportunityEvidence\(candidate\))/,
    message: "watchlist seed updates must preserve main-force playbook opportunity context for search-returned representative fund candidates."
  },
  {
    pattern: /if \(\["capital_entering", "preheat_catalyst"\]\.includes\(theme\.leaderSignal\) && hasTraceableFreshThemeCatalystContext\(theme\)\) score \+= 8;[\s\S]{0,220}score -= 20;/,
    message: "deep-dive scoring must also reject untraceable main-capital/preheat heat before model analysis."
  },
  {
    pattern: /function fetchMarketDeepDive[\s\S]{0,2600}\.filter\(\(item\)\s*=>\s*!shouldSuppressPreciousMetalCandidate\(userText,\s*item\)\)/,
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
    pattern: /(?=[\s\S]*function classifyPullbackSetupCandidateForSummary)(?=[\s\S]*function hasPullbackLongPositionChaseRisk)(?=[\s\S]*classifyPullbackSetupCandidateForSummary[\s\S]*hasPullbackLongPositionChaseRisk\(candidate\))/,
    message: "pullback/setup main-candidate classification must reject candidates that are high in the 250-day window."
  },
  {
    pattern: /(?=[\s\S]*function classifyPullbackSetupCandidateForSummary)(?=[\s\S]*function isEarlyTurnSetupTrend)(?=[\s\S]*classifyPullbackSetupCandidateForSummary[\s\S]*isEarlyTurnSetupTrend\(trend\))/,
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
    pattern: /hasPullbackYearToDateChaseRisk[\s\S]{0,1200}classifyPullbackSetupCandidateForSummary|classifyPullbackSetupCandidateForSummary[\s\S]{0,1200}hasPullbackYearToDateChaseRisk/,
    message: "pullback/setup main-candidate classification must reject year-to-date high pseudo-low candidates."
  },
  {
    pattern: /(?=[\s\S]*function classifyPullbackSetupCandidateForSummary)(?=[\s\S]*function isPullbackTrendFreshEnough)(?=[\s\S]*classifyPullbackSetupCandidateForSummary[\s\S]*isPullbackTrendFreshEnough\(candidate\))/,
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
    pattern: /今年以来=\$\{seedThisYear\}%[\s\S]{0,4200}今年以来\$\{formatFallbackPct\(seedThisYear\)\}偏高/,
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
    pattern: /function scorePullbackThemeRotation[\s\S]{0,900}const capitalFlowConflict = hasConflictingThemeCapitalOutflow\(theme\);[\s\S]{0,350}if \(capitalFlowConflict\) score -= 24[\s\S]{0,700}!capitalFlowConflict && theme\.positionSignal === "low_position_rotation"[\s\S]{0,1100}!capitalFlowConflict && Number\.isFinite\(rotation\)/,
    message: "pullback/setup deep-dive ranking must penalize board outflow conflicts and suppress low-position rotation bonuses under conflict."
  },
  {
    pattern: /scoreResearchDigestForPullbackSetup[\s\S]{0,3200}scoreHoldingsOutlookForCandidate/,
    message: "pullback/setup deep-dive ranking must score top-ten holdings outlook, not only NAV trend."
  },
  {
    pattern: /scoreResearchDigestForPullbackSetup[\s\S]{0,2200}getPortfolioActionableThemeSupportGap\(digest\)[\s\S]{0,900}score -= 54/,
    message: "pullback/setup deep-dive ranking must demote unsupported holding-derived theme exposure before recommendation ordering."
  },
  {
    pattern: /function refreshPortfolioCandidateThemesWithMarketRadar[\s\S]{0,900}attachThemeMainForcePlaybookRisk/,
    message: "candidate theme refresh must attach main-force playbook risk lanes even when normal theme radar matching is absent."
  },
  {
    pattern: /function refreshPortfolioCandidateThemesWithMarketRadar[\s\S]{0,900}attachThemeMainForcePlaybookOpportunity/,
    message: "candidate theme refresh must attach main-force playbook opportunity lanes so qualified carriers do not become endless waiting."
  },
  {
    pattern: /function buildMatchedThemeSignalFromPlaybookOpportunityMatch[\s\S]{0,1800}main_capital_entering[\s\S]{0,1600}preheat_catalyst_watch[\s\S]{0,2200}latestNewsTime/,
    message: "playbook opportunity matches must synthesize actionable theme support with news/current-event freshness."
  },
  {
    pattern: /function getPortfolioActionableThemeSupportGap[\s\S]{0,700}getThemeMainForcePlaybookRiskWarnings/,
    message: "theme support gaps must surface main-force playbook catchdown/chase risks before buy wording."
  },
  {
    pattern: /function fetchMarketDeepDive[\s\S]{0,5200}fetchMarketResearchDigests\(selected\)[\s\S]{0,260}refreshPortfolioCandidateThemesWithMarketRadar\(digest,\s*scopedMarketSnapshot\)/,
    message: "market deep-dive research digests must be refreshed against the main-force playbook after top-ten holdings are fetched."
  },
  {
    pattern: /scoreResearchDigestForPullbackSetup[\s\S]{0,2200}getThemeMainForcePlaybookRiskWarnings\(digest\)[\s\S]{0,140}score -= 70/,
    message: "pullback/setup scoring must heavily demote candidates whose names or holdings hit playbook catchdown/chase risk lanes."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,1400}buildHoldingsOutlookProfile/,
    message: "fund actionability must incorporate structured top-ten holdings outlook."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,5400}getActionabilityEntryDiscipline\(trend[\s\S]{0,1800}boundedScore = Math\.min\(boundedScore, entryDiscipline\.scoreCap\)/,
    message: "fund actionability must cap buy/staged-buy scores when the trend says wait for pullback."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,4600}getActionabilityFreshnessDiscipline\(digest[\s\S]{0,1200}boundedScore = Math\.min\(boundedScore, freshnessDiscipline\.scoreCap\)/,
    message: "fund actionability must cap buy/staged-buy scores when NAV or trend evidence is stale."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,5200}getActionabilityIntradayDiscipline\(digest[\s\S]{0,1300}boundedScore = Math\.min\(boundedScore, intradayDiscipline\.scoreCap\)/,
    message: "fund actionability must cap buy/staged-buy scores when intraday valuation fades from the high."
  },
  {
    pattern: /buildFundActionabilitySignals[\s\S]{0,6000}getActionabilityValuationSourceDiscipline\(digest[\s\S]{0,1400}boundedScore = Math\.min\(boundedScore, valuationSourceDiscipline\.scoreCap\)/,
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
    pattern: /function formatPullbackFallbackWatchCandidate[\s\S]{0,800}getPullbackFallbackCatchdownWarnings\(candidate\)[\s\S]{0,800}接盘证据/,
    message: "watch-only pullback fallback lines must surface catchdown evidence, not only missing numeric setup metrics."
  },
  {
    pattern: /const deterministicFallback = buildPullbackQualityFallbackAnswer[\s\S]{0,2200}FUND_ANSWER_QUALITY_REWRITE/,
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
    pattern: /PORTFOLIO_USER_FACING_SECTION_PATTERN[\s\S]{0,900}function formatReadablePortfolioUserFacingText[\s\S]{0,1200}splitReadablePortfolioUserFacingLine[\s\S]{0,900}splitOverlongPortfolioActionLine[\s\S]{0,900}splitOverlongPortfolioNarrativeLine/,
    message: "portfolio reports must insert readable section spacing and split overlong action and narrative lines."
  },
  {
    pattern: /function hasNumericDumpWithoutInterpretation[\s\S]{0,900}hasDenseUserFacingMetricLine/,
    message: "fund answer quality gate must catch dense single-fund metric lines, not only long full-answer dumps."
  },
  {
    pattern: /pendingImageMessages/,
    message: "Feishu image-only messages must be buffered briefly so a following text instruction can be merged."
  },
  {
    pattern: /FEISHU_IMAGE_TEXT_MERGE_WINDOW_MS/,
    message: "Feishu image/text merge window must be configurable."
  },
  {
    pattern: /downloadMessageImage\(entry\.messageId,\s*entry\.imageKey\)/,
    message: "merged image/text requests must download images from the original image message id."
  },
  {
    pattern: /screenshot_held_position_sell_plan/,
    message: "screenshots plus held-position sell timing captions must route to a dedicated sell-plan mode."
  },
  {
    pattern: /图文同一需求：截图事实和用户文字必须合并成一个问题/,
    message: "fund screening prompts must explicitly fuse screenshot facts with the user's text instruction."
  },
  {
    pattern: /userPortfolios/,
    message: "portfolio DB must persist user-level real holding watchlists separately from the manager virtual account."
  },
  {
    pattern: /pendingUserPortfolioImportRequests/,
    message: "text-first user holding import commands must wait for the next screenshot."
  },
  {
    pattern: /screenshotHoldings/,
    message: "fund screenshot extraction must preserve row-level user holding facts."
  },
  {
    pattern: /\/api\/user-portfolios\/holding/,
    message: "admin UI/API must manage per-user holding funds."
  },
  {
    pattern: /用户持仓(?:关注|终端)/,
    message: "admin UI must expose user-level holding watchlists."
  },
  {
    pattern: /data-portfolio-view="users"[\s\S]{0,5000}user-terminal[\s\S]{0,3600}userPortfolioRail[\s\S]{0,600}userPortfolioList/,
    message: "admin user holdings UI must use a focused user terminal instead of rendering every user's holdings as one long page."
  },
  {
    pattern: /function renderUserPortfolios[\s\S]{0,1800}user-portfolio-terminal[\s\S]{0,2200}function renderUserPortfolioTab[\s\S]{0,900}data-user-portfolio-select/,
    message: "admin user holdings UI must switch one selected user into the detail terminal."
  },
  {
    pattern: /\.user-terminal\s*\{[\s\S]{0,360}grid-template-columns:\s*minmax\(250px,\s*310px\)\s*minmax\(0,\s*1fr\)[\s\S]{0,260}overflow:\s*hidden[\s\S]{0,1600}\.user-portfolio-tab-list\s*\{[\s\S]{0,320}overflow:\s*auto[\s\S]{0,2600}\.user-portfolio-detail-stage\s*\{[\s\S]{0,320}overflow:\s*auto/,
    message: "admin user holdings terminal must bound the editor/user rail and selected-user detail stage."
  },
  {
    pattern: /buildPortfolioRankingBoard/,
    message: "portfolio public state must build multi-angle manager ranking boards."
  },
  {
    pattern: /ensurePortfolioRankingBoardReviewed[\s\S]{0,1200}managerRankings/,
    message: "portfolio decision runs must apply ranking-board coverage guards after model output."
  },
  {
    pattern: /function ensurePortfolioRankingBoardReviewed(?=[\s\S]{0,2600}manager_ranking_board_guard)(?=[\s\S]{0,2600}来源：manager_ranking_board)/,
    message: "ranking-board guards must add traceable fallback review actions when top ranked items are omitted."
  },
  {
    pattern: /function inferPortfolioRankingBoardReviewAction[\s\S]{0,1200}hasTraceablePortfolioRankingThemeMomentumEvidence[\s\S]{0,2600}function hasTraceablePortfolioRankingThemeMomentumEvidence[\s\S]{0,1600}(?:东方财富|新浪财经|财联社|source)[\s\S]{0,2400}function resolvePortfolioRankingReviewTargetWeight[\s\S]{0,900}1\.2/,
    message: "ranking-board fallback must turn only traceable news/main-capital preheat micro-starters into capped BUY reviews instead of always WATCH."
  },
  {
    pattern: /(?=[\s\S]*function isPortfolioUserHoldingDeRiskAlert[\s\S]{0,1200}主力\(\?:资金\)\?撤离)(?=[\s\S]*用户真实持仓卖出\/减仓提醒)(?=[\s\S]*来源：user_holding_derisk_alert)(?=[\s\S]*不提交虚拟组合赎回单)/,
    message: "ranking-board guards must turn external user-held stale-theme alerts into explicit sell/reduce reminders without creating virtual redemption orders."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioRankingBoardReviewActions[\s\S]{0,1800}catchdownRiskReview)(?=[\s\S]*接盘风险复核[\s\S]{0,260}这不是低位启动[\s\S]{0,180}不能试探买入)(?=[\s\S]*来源：stale_catchdown_risk_guard)(?=[\s\S]*function isPortfolioRankingBoardCatchdownRiskReview[\s\S]{0,360}stale_catchdown_risk)/,
    message: "ranking-board fallback must turn stale-catchdown lanes into explicit zero-yuan no-test-buy review actions."
  },
  {
    pattern: /function ensurePortfolioRankingBoardReviewed[\s\S]{0,3600}upgradePortfolioRankingBoardWatchAction[\s\S]{0,2200}系统榜单升级[\s\S]{0,1200}题材退潮守卫/,
    message: "ranking-board guards must upgrade generic WATCH actions into capped BUY reviews when a top ranking lane says the mainline/preheat candidate is executable."
  },
  {
    pattern: /(?=[\s\S]*function enforcePortfolioBuyDiscipline)(?=[\s\S]*isPortfolioRankingBoardSourcedAction\(action\))(?=[\s\S]*ranking_board_buy_execution_guard)(?=[\s\S]*系统榜单二次校验)(?=[\s\S]*题材退潮)(?=[\s\S]*formatPortfolioBlockedBuyRiskControl)(?=[\s\S]*0元观察)(?=[\s\S]*主力资金回流)/,
    message: "ranking-upgraded BUY reviews must be rechecked by execution discipline and converted to 0-yuan observation when stale-theme, retreat, holdings, fee, or sizing guards fail."
  },
  {
    pattern: /decision_synthesis[\s\S]*buy_preparation[\s\S]*launch_setup[\s\S]*cash_redeployment[\s\S]*position_sizing[\s\S]*quality_score[\s\S]*manager_stability[\s\S]*portfolio_fit[\s\S]*theme_allocation[\s\S]*theme_momentum[\s\S]*rotation_opportunity[\s\S]*stale_catchdown_risk[\s\S]*chase_risk[\s\S]*drawdown_defense[\s\S]*data_confidence[\s\S]*holdings_outlook[\s\S]*fee_suitability[\s\S]*replacement_choice[\s\S]*opportunity_cost[\s\S]*sell_risk[\s\S]*user_holding_alerts/,
    message: "manager ranking boards must cover decision synthesis, buy preparation, low-position launch, cash redeployment, position sizing, fund quality, manager stability, portfolio fit, theme allocation, main-capital/preheat momentum, sector rotation, stale-catchdown risk, chase risk, drawdown defense, data confidence, holdings outlook, fee suitability, replacement choice, opportunity cost, sell risk, and user holding alerts."
  },
  {
    pattern: /function buildPortfolioCashRedeploymentRanking[\s\S]{0,2600}现金再部署榜[\s\S]{0,2600}0\.5%-2\.5%/,
    message: "manager ranking boards must include a cash-redeployment lane that fights over-conservative high-cash waiting with small starter-buy reviews."
  },
  {
    pattern: /function buildPortfolioPositionSizingRanking[\s\S]{0,2600}仓位方案榜[\s\S]{0,2600}0元观察[\s\S]{0,2600}2\.5%启动仓/,
    message: "manager ranking boards must include a position-sizing lane that turns buy candidates into explicit 0 yuan watch or starter weight ranges."
  },
  {
    pattern: /function buildPortfolioQualityScoreRanking[\s\S]{0,2600}基金质量榜[\s\S]{0,2600}夏普[\s\S]{0,2600}最大回撤/,
    message: "manager ranking boards must include a fund-quality lane that checks Sharpe, drawdown, annualized return, scale, and fee evidence."
  },
  {
    pattern: /function resolvePortfolioQualityScoreEvidence[\s\S]{0,900}resolvePortfolioPositiveWatchRankingGate[\s\S]{0,1800}质量不抵消接盘风险[\s\S]{0,900}高夏普\/低回撤不等于可以买旧题材反弹/,
    message: "fund-quality rankings must not let high-Sharpe or low-drawdown evidence override stale-theme catchdown risk."
  },
  {
    pattern: /function buildPortfolioManagerStabilityRanking[\s\S]{0,2600}经理稳定榜[\s\S]{0,2600}基金经理任期[\s\S]{0,2600}产品历史/,
    message: "manager ranking boards must include a manager-stability lane that checks manager tenure, tenure return, product history, and scale evidence."
  },
  {
    pattern: /function resolvePortfolioManagerStabilityEvidence[\s\S]{0,900}resolvePortfolioPositiveWatchRankingGate[\s\S]{0,1800}稳定性不抵消接盘风险[\s\S]{0,900}稳定经理不代表旧题材回调可以买/,
    message: "manager-stability rankings must not let long-tenure manager evidence override stale-theme catchdown risk."
  },
  {
    pattern: /function buildPortfolioFitRanking[\s\S]{0,2600}组合适配榜[\s\S]{0,2600}同题材[\s\S]{0,2600}底层/,
    message: "manager ranking boards must include a portfolio-fit lane that checks diversification and same-theme or holding overlap before buys."
  },
  {
    pattern: /function buildPortfolioThemeAllocationRanking(?=[\s\S]{0,3600}主题配置榜)(?=[\s\S]{0,3600}代表基金)(?=[\s\S]{0,3600}低位)(?=[\s\S]{0,3600}拥挤)/,
    message: "manager ranking boards must include a theme-allocation lane that chooses sectors first, then representative funds, with low-position and crowding evidence."
  },
  {
    pattern: /function buildPortfolioThemeMomentumRanking(?=[\s\S]{0,3600}主力预热机会榜)(?=[\s\S]{0,3600}新闻逻辑)(?=[\s\S]{0,3600}0\.5%-1\.2%微型试探)/,
    message: "manager ranking boards must include a main-capital/preheat lane that links news logic to representative fund micro-starters."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioThemeMomentumRankingItem)(?=[\s\S]*capitalFlowGap)(?=[\s\S]*缺少正向主力资金或主力流入榜确认)(?=[\s\S]*主力资金还没有确认)/,
    message: "portfolio theme momentum ranking must explain when preheat news lacks positive main-capital confirmation."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioThemeOpportunityPlan)(?=[\s\S]*portfolio_theme_opportunity_plan)(?=[\s\S]*theme_micro_starter)(?=[\s\S]*function ensurePortfolioThemeOpportunityReviewed)(?=[\s\S]*portfolio_theme_opportunity_guard)/,
    message: "portfolio decisions must deterministically review main-capital/preheat theme opportunities instead of allowing generic waiting."
  },
  {
    pattern: /function buildPortfolioThemeOpportunityPlan[\s\S]{0,2600}themeEvidenceSource\s*=\s*refreshPortfolioCandidateThemesWithMarketRadar[\s\S]{0,1200}selectPortfolioActionableThemeSignal\(themeEvidenceSource\)/,
    message: "portfolio theme opportunity planning must refresh self-selected historical theme labels against the current market radar before promoting main-capital/preheat opportunities."
  },
  {
    pattern: /function refreshPortfolioCandidateThemesWithMarketRadar[\s\S]{0,1900}mergeMatchedThemeSignals\(\s*matchCandidateThemes\(candidate,\s*themeRadar\),\s*matchCurrentThemeRadarByPreviousThemeSignals\(candidate,\s*themeRadar\)/,
    message: "current-radar refresh must verify both direct candidate matches and historical theme id/name matches before downgrading old labels."
  },
  {
    pattern: /function matchCurrentThemeRadarByPreviousThemeSignals[\s\S]{0,700}hasThemeCapitalRetreatRisk\(theme\)[\s\S]{0,220}isStaleThemeCatchdownRiskTheme\(theme\)[\s\S]{0,220}isUnrefreshedMarketThemeSignal\(theme\)[\s\S]{0,1100}current_radar_same_theme[\s\S]{0,900}function mergeMatchedThemeSignals/,
    message: "historical theme id/name matches must be traceable, deduped, and must not revive retreat/catchdown/unconfirmed old labels."
  },
  {
    pattern: /(?=[\s\S]*function ensurePortfolioThemeOpportunityReviewed)(?=[\s\S]*formatPortfolioThemeOpportunityCustomerLogic)(?=[\s\S]*为什么动)(?=[\s\S]*资金\/题材)(?=[\s\S]*代表基金)/,
    message: "portfolio theme opportunity guard must inject customer-readable why-move, capital/theme, and representative-fund logic into actions."
  },
  {
    pattern: /(?=[\s\S]*function ensurePortfolioThemeRepresentativeRecallAction)(?=[\s\S]*theme_representative_recall)(?=[\s\S]*主力预热代表基金召回)(?=[\s\S]*代表基金搜索词)(?=[\s\S]*承载锚点)(?=[\s\S]*至少补3只)(?=[\s\S]*function collectPortfolioThemeRepresentativeExpansionKeywords)(?=[\s\S]*function collectPortfolioThemeRepresentativeCarrierAnchors)/,
    message: "portfolio theme opportunity guard must inject a 0-yuan representative-fund recall action with search terms, carrier anchors, and at least three candidates per live theme."
  },
  {
    pattern: /function buildPortfolioRankingBoard[\s\S]{0,240000}buildPortfolioStaleCatchdownRiskRanking\(watchlist\)[\s\S]{0,240000}function buildPortfolioStaleCatchdownRiskRanking[\s\S]{0,2000}stale_catchdown_risk[\s\S]{0,2000}接盘风险榜[\s\S]{0,2000}表面回调/,
    message: "manager ranking boards must include a stale-catchdown risk lane that blocks retreating themes from masquerading as pullback setups."
  },
  {
    pattern: /function buildPortfolioStaleCatchdownRiskRankingItem(?=[\s\S]{0,2400}staleCatalystRisk)(?=[\s\S]{0,3600}旧催化接盘强拦截)(?=[\s\S]{0,3600}旧新闻\/旧催化)(?=[\s\S]{0,4200}缺新鲜新闻\/政策\/产业预热)/,
    message: "stale-catchdown risk ranking must surface old catalysts even when strong current flow avoids hard catchdown classification."
  },
  {
    pattern: /function buildPortfolioStaleCatchdownRiskRankingItem[\s\S]{0,7000}holdingRealtimeCatchdownRisk[\s\S]{0,3200}底层持仓接盘拦截[\s\S]{0,3200}缺底层持仓止跌确认[\s\S]{0,16000}function resolvePortfolioChaseRiskEvidence[\s\S]{0,7000}buildPortfolioHoldingRealtimeEvidenceProfile[\s\S]{0,7000}function buildPortfolioHoldingRealtimeEvidenceProfile/,
    message: "stale-catchdown risk lane must surface intraday weak top-holding pulse as a customer-readable no-buy blocker."
  },
  {
    pattern: /function buildPortfolioDecisionSynthesisRanking[\s\S]{0,2200}买点[\s\S]{0,2200}费率[\s\S]{0,2200}持仓前景/,
    message: "manager ranking boards must include an integrated decision-synthesis lane combining buy point, rotation, chase risk, fees, and holdings outlook."
  },
  {
    pattern: /function buildPortfolioRotationOpportunityRanking[\s\S]{0,2200}板块轮动[\s\S]{0,2200}拥挤度/,
    message: "manager ranking boards must include a sector-rotation opportunity lane with low-position and crowding evidence."
  },
  {
    pattern: /function buildPortfolioChaseRiskRanking[\s\S]{0,2200}追涨风险[\s\S]{0,2200}降级为观察/,
    message: "manager ranking boards must include a chase-risk lane that downgrades hot pseudo-opportunities."
  },
  {
    pattern: /function buildPortfolioDrawdownDefenseRanking[\s\S]{0,2600}回撤防线榜[\s\S]{0,2600}利润回吐[\s\S]{0,2600}补仓摊薄/,
    message: "manager ranking boards must include a drawdown-defense lane that protects profit and blocks averaging down as a substitute for risk control."
  },
  {
    pattern: /function buildPortfolioDataConfidenceRanking[\s\S]{0,2600}数据体检榜[\s\S]{0,2600}净值[\s\S]{0,2600}份额[\s\S]{0,2600}前十大持仓/,
    message: "manager ranking boards must include a data-confidence lane that checks NAV freshness, share class, fees, top holdings, and source completeness before buys."
  },
  {
    pattern: /function buildPortfolioFeeSuitabilityRanking[\s\S]{0,1800}A\/C\/D\/I[\s\S]{0,1800}每万/,
    message: "manager ranking boards must include a fee/share-class suitability lane with holding-period and per-10k cost evidence."
  },
  {
    pattern: /function buildPortfolioReplacementChoiceRanking[\s\S]{0,2600}替代优选榜[\s\S]{0,2600}A\/C\/D\/I[\s\S]{0,2600}同指数\/同题材/,
    message: "manager ranking boards must include a replacement-choice lane that compares same-fund share classes and same-exposure alternatives before buying."
  },
  {
    pattern: /function buildPortfolioRankingCustomerDigest[\s\S]{0,3200}const buyReview = \[[\s\S]{0,900}\.\.\.themeMomentumItems\.filter[\s\S]{0,1200}hasPortfolioCustomerBuyBlocker/,
    message: "customer buy-review digest must not treat replacement-choice or low-fee alternatives as buy signals."
  },
  {
    pattern: /(?=[\s\S]*const priorityQueue = buildPortfolioRankingPriorityQueue\(lists\))(?=[\s\S]*function buildPortfolioRankingPriorityQueue)/,
    message: "manager ranking boards must build a cross-list priority queue before rendering or model calls."
  },
  {
    pattern: /(?=[\s\S]*const decisionMatrix = buildPortfolioRankingDecisionMatrix\(lists,\s*priorityQueue\))(?=[\s\S]*function buildPortfolioRankingDecisionMatrix[\s\S]{0,2600}买点[\s\S]{0,2600}板块[\s\S]{0,2600}风险[\s\S]{0,2600}数据)/,
    message: "manager ranking boards must build a cross-list decision matrix that aligns buy, sector, risk, and data evidence by fund."
  },
  {
    pattern: /(?=[\s\S]*const alertCenter = buildPortfolioRankingAlertCenter\(lists,\s*priorityQueue,\s*decisionMatrix\))(?=[\s\S]*function buildPortfolioRankingAlertCenter[\s\S]{0,2600}买入复核[\s\S]{0,2600}卖出\/风控[\s\S]{0,2600}数据\/费率补证[\s\S]{0,2600}用户持仓提醒)/,
    message: "manager ranking boards must build a four-lane alert center for buy review, sell/risk, data/fee evidence, and user holdings."
  },
  {
    pattern: /(?=[\s\S]*compactPortfolioRankingBoardForModel[\s\S]*priorityQueue)(?=[\s\S]*compactPortfolioRankingBoardForModel[\s\S]*alertCenter)(?=[\s\S]*compactPortfolioRankingBoardForModel[\s\S]*decisionMatrix)/,
    message: "portfolio decision prompts must include the ranking priority queue, alert center, and decision matrix."
  },
  {
    pattern: /(?=[\s\S]*const customerDecisionSummary = buildPortfolioRankingCustomerDecisionSummary)(?=[\s\S]*customerDecisionSummary[\s\S]{0,700}customerActionDeck)(?=[\s\S]*compactPortfolioRankingBoardForModel[\s\S]{0,1000}customerDecisionSummary)/,
    message: "manager ranking boards must produce and compact a customer decision summary before detailed ranking cards."
  },
  {
    pattern: /(?=[\s\S]*const customerActionLeaderboard = buildPortfolioRankingCustomerActionLeaderboard)(?=[\s\S]*customerActionLeaderboard[\s\S]{0,700}customerDecisionSummary)(?=[\s\S]*compactPortfolioRankingBoardForModel[\s\S]{0,1800}customerActionLeaderboard[\s\S]{0,900}sortPolicy)/,
    message: "manager ranking boards must produce and compact customer action leaderboards by buy, wait, avoid, sell, data lanes, and sort policy."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioRankingConsensusRadar)(?=[\s\S]*consensusRadar)(?=[\s\S]*compactPortfolioRankingBoardForModel[\s\S]*consensusRadar)/,
    message: "manager ranking boards must produce and compact a cross-list consensus radar."
  },
  {
    pattern: /buildPortfolioRankingCustomerDigest[\s\S]{0,2200}buyReview[\s\S]{0,2200}watchFocus[\s\S]{0,2200}riskAvoid/,
    message: "manager ranking boards must translate multi-angle rankings into customer-facing buy/watch/avoid digest buckets."
  },
  {
    pattern: /(?=[\s\S]*function hasPortfolioCustomerExecutableBuyIntent[\s\S]{0,500}hasPortfolioCustomerBuyBlockerText)(?=[\s\S]*function isPortfolioCustomerBuyAction[\s\S]{0,900}hasPortfolioCustomerBuyBlocker)(?=[\s\S]*function shouldIncludePortfolioAlertItem[\s\S]{0,900}hasPortfolioCustomerBuyBlocker)/,
    message: "customer action cards must not classify generic review/watch-only theme candidates as buy-review items."
  },
  {
    pattern: /function hasPortfolioCustomerBuyBlockerText[\s\S]{0,900}低位轮动标签缺少当前题材雷达刷新[\s\S]{0,700}不给买入金额/,
    message: "customer-facing portfolio buy blockers must catch stale low-rotation radar gaps and no-buy amount blockers."
  },
  {
    pattern: /buildPortfolioRankingCustomerDigest[\s\S]{0,2200}hasPortfolioCustomerThemeEvidenceBlocker[\s\S]{0,1800}hasPortfolioCustomerBuyBlocker/,
    message: "stale theme blockers must be shared with the customer buy-review digest."
  },
  {
    pattern: /buildPortfolioRankingCustomerActionDeck[\s\S]{0,1400}hasPortfolioCustomerBuyBlocker/,
    message: "stale theme blockers must be shared with the customer action deck buy lane."
  },
  {
    pattern: /shouldIncludePortfolioAlertItem[\s\S]{0,700}hasPortfolioCustomerBuyBlocker/,
    message: "stale theme blockers must be shared with the alert center buy lane."
  },
  {
    pattern: /buildPortfolioRankingConsensusRadarItem[\s\S]{0,1400}hasPortfolioCustomerBuyBlocker/,
    message: "stale theme blockers must be shared with the consensus radar."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioRankingCustomerActionDeck[\s\S]{0,1500}dataSourceItems\.filter\(isPortfolioCustomerHardDataBlocker\))(?=[\s\S]*function buildPortfolioRankingCustomerActionDeck[\s\S]{0,1900}buyCandidateCodes)(?=[\s\S]*function buildPortfolioRankingCustomerActionDeck[\s\S]{0,2600}isPortfolioCustomerHardAvoidAction)(?=[\s\S]*function buildPortfolioRankingCustomerActionDeck[\s\S]{0,3300}buySourceItems\.filter\(\(item\) => !blockedCodes\.has\(item\.code\)\))/,
    message: "customer action cards must let sell, avoid, and data blockers override buy-review while keeping watch-only trigger candidates visible."
  },
  {
    pattern: /(?=[\s\S]*function buildPortfolioCustomerDecisionSummaryStatusLines[\s\S]{0,700}客户决策摘要)(?=[\s\S]*function buildPortfolioStatusAnswer[\s\S]{0,6200}buildPortfolioCustomerDecisionSummaryStatusLines)/,
    message: "portfolio status replies must show a customer decision summary before detailed action-card lines."
  },
  {
    pattern: /(?=[\s\S]*function renderPortfolioCustomerDecisionSummary)(?=[\s\S]*customerDecisionSummary)(?=[\s\S]*function renderManagerCustomerDecisionSummary)(?=[\s\S]*ranking-decision-summary)(?=[\s\S]*portfolio-decision-summary)/,
    message: "admin portfolio UI must show customer decision summaries in both the overview radar and full ranking terminal."
  },
  {
    pattern: /(?=[\s\S]*function renderPortfolioCustomerActionLeaderboard)(?=[\s\S]*customerActionLeaderboard)(?=[\s\S]*function renderManagerCustomerActionLeaderboard)(?=[\s\S]*ranking-action-leaderboard)(?=[\s\S]*portfolio-action-leaderboard)/,
    message: "admin portfolio UI must show customer action leaderboards in both the overview radar and full ranking terminal."
  },
  {
    pattern: /(?=[\s\S]*function renderPortfolioConsensusRadar)(?=[\s\S]*consensusRadar)(?=[\s\S]*consensus-radar-grid)/,
    message: "admin portfolio UI must show consensus radar lanes in compact manager ranking workspaces."
  },
  {
    pattern: /renderManagerRankings/,
    message: "admin portfolio UI must render manager ranking boards."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="opportunities")(?=[\s\S]*portfolioNavOpportunityCount)(?=[\s\S]*data-portfolio-view="opportunities")/,
    message: "admin portfolio UI must expose a dedicated observation-opportunity entrance instead of burying buy/watch candidates in a long page."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="risk")(?=[\s\S]*portfolioNavRiskCount)(?=[\s\S]*data-portfolio-view="risk")/,
    message: "admin portfolio UI must expose a dedicated risk-defense entrance instead of burying drawdown and sell-risk items in a long page."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="data")(?=[\s\S]*portfolioNavDataCount)(?=[\s\S]*data-portfolio-view="data")/,
    message: "admin portfolio UI must expose a dedicated data-confidence entrance instead of burying data gaps in a long ranking page."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="alerts")(?=[\s\S]*portfolioNavAlertCount)(?=[\s\S]*data-portfolio-view="alerts")/,
    message: "admin portfolio UI must expose a dedicated alert desk entrance for today's must-handle items."
  },
  {
    pattern: /(?=[\s\S]*data-portfolio-view-target="diagnostics")(?=[\s\S]*portfolioNavDiagnosticCount)(?=[\s\S]*data-portfolio-view="diagnostics")/,
    message: "admin portfolio UI must expose diagnostics as a separate entrance instead of lengthening the overview page."
  },
  {
    pattern: /body\[data-active-tab="portfolio"\][\s\S]{0,260}overflow:\s*hidden[\s\S]{0,1200}\.tab-panel\[data-panel="portfolio"\]\.active[\s\S]{0,360}height:\s*calc\(100vh - 48px\)/,
    message: "admin portfolio UI must be constrained to a viewport-sized terminal workspace on desktop."
  },
  {
    pattern: /function renderPortfolioOpportunityBoard[\s\S]{0,2200}接近可买[\s\S]{0,2200}等待回调[\s\S]{0,2200}启动前夜/,
    message: "admin portfolio UI must split observation opportunities into buy, pullback, and launch-eve entrances."
  },
  {
    pattern: /renderPortfolioOpportunityCommand[\s\S]{0,2200}selectPortfolioOpportunityLead[\s\S]{0,1800}buy_preparation[\s\S]{0,1800}launch_setup/,
    message: "admin opportunity workspace must lift the first actionable opportunity and shortcut counts above the lane grid."
  },
  {
    pattern: /(?=[\s\S]*PORTFOLIO_DATA_LANES[\s\S]{0,900}净值\/走势[\s\S]{0,900}份额\/费率[\s\S]{0,900}持仓\/前景[\s\S]{0,900}来源\/补证)(?=[\s\S]*function renderPortfolioDataBoard)/,
    message: "admin portfolio UI must split data confidence into NAV, fee, holdings, and source lanes."
  },
  {
    pattern: /(?=[\s\S]*PORTFOLIO_ALERT_LANES[\s\S]{0,900}买入复核[\s\S]{0,900}卖出\/风控[\s\S]{0,900}数据\/费率补证[\s\S]{0,900}用户持仓提醒)(?=[\s\S]*function renderPortfolioAlertBoard[\s\S]{0,1200}alert-terminal[\s\S]{0,1200}alert-lane-grid)/,
    message: "admin portfolio UI must split alert desk items into buy, sell/risk, data, and user-holding lanes."
  },
  {
    pattern: /renderManagerCustomerDigest[\s\S]{0,1800}客户视角摘要/,
    message: "admin manager ranking board must render the customer-facing digest before detailed lists."
  },
  {
    pattern: /(?=[\s\S]*buildPortfolioRankingCustomerActionDeck[\s\S]*客户行动牌)(?=[\s\S]*可买复核[\s\S]*等待触发[\s\S]*先回避[\s\S]*卖出\/减仓[\s\S]*先补数据)/,
    message: "manager ranking boards must translate ranking lanes into customer action cards for buy, wait, avoid, sell, and data-first decisions."
  },
  {
    pattern: /renderManagerRankingActionDeck[\s\S]{0,1800}ranking-action-deck[\s\S]{0,1200}renderManagerRankingActionCard/,
    message: "admin manager ranking board must show customer action cards before detailed ranking lists."
  },
  {
    pattern: /function buildPortfolioCustomerActionStory[\s\S]{0,1600}themeLogic[\s\S]{0,500}carrierLogic[\s\S]{0,500}riskBoundary[\s\S]*function renderManagerCustomerActionStory[\s\S]{0,900}ranking-action-story[\s\S]*\.ranking-action-story\s*\{/,
    message: "customer action cards must split theme logic, fund-carrier evidence, and risk boundary into scannable story rows."
  },
  {
    pattern: /renderManagerRankingLensGuide[\s\S]{0,2200}ranking-lens-guide/,
    message: "admin manager ranking board must explain the selected ranking lens and its first handling target before detailed fund rows."
  },
  {
    pattern: /getManagerRankingLensPurpose/,
    message: "admin manager ranking lens guide must explain launch-setup and other buying lenses in customer-readable Chinese."
  },
  {
    pattern: /专门找回调完成、低位、准备启动/,
    message: "admin manager ranking lens guide must explain the launch-setup lens as pullback-complete, low-position, ready-to-start screening."
  },
  {
    pattern: /setManagerRankingFilter[\s\S]{0,1600}data-ranking-guide-id/,
    message: "admin manager ranking lens guide must switch with the selected ranking lane."
  },
  {
    pattern: /renderManagerPriorityQueue[\s\S]{0,1200}今日优先处理/,
    message: "admin manager ranking board must render a first-class priority queue."
  },
  {
    pattern: /renderManagerRankingOverview[\s\S]{0,1400}ranking-overview-card/,
    message: "admin manager rankings must include overview cards for quick scanning before detailed lists."
  },
  {
    pattern: /MANAGER_RANKING_GROUPS[\s\S]{0,1200}行动[\s\S]{0,1200}机会[\s\S]{0,1200}风控[\s\S]{0,1200}证据/,
    message: "admin manager ranking lenses must be grouped into trading-terminal views instead of one long lens list."
  },
  {
    pattern: /buildManagerRankingOverviewGroups[\s\S]{0,1600}renderManagerRankingOverviewGroup[\s\S]{0,1600}ranking-overview-group/,
    message: "admin manager ranking overview must render grouped lens sections."
  },
  {
    pattern: /(?=[\s\S]*renderManagerRankingOverviewGroupTab[\s\S]*data-ranking-group-target)(?=[\s\S]*data-ranking-group-id)(?=[\s\S]*setManagerRankingFilter[\s\S]{0,1800}activeRankingGroup[\s\S]{0,900}is-group-hidden)/,
    message: "admin manager ranking overview must use first-level group tabs and show only the active ranking group."
  },
  {
    pattern: /selectManagerRankingGroupFocus[\s\S]{0,1400}renderManagerRankingGroupFocus[\s\S]{0,1200}ranking-overview-group-focus/,
    message: "admin manager ranking groups must expose a one-click focus item for the most relevant lens in each group."
  },
  {
    pattern: /renderManagerRankings[\s\S]{0,1800}ranking-terminal[\s\S]{0,900}ranking-detail-stage/,
    message: "admin manager ranking boards must render as a terminal-style lane navigator with a separate focused detail stage."
  },
  {
    pattern: /(?=[\s\S]*renderManagerRankingDigestDeck[\s\S]*ranking-digest-deck)(?=[\s\S]*ranking-terminal-body[\s\S]{0,360}overflow:\s*hidden)(?=[\s\S]*ranking-board[\s\S]{0,360}overflow:\s*hidden)(?=[\s\S]*ranking-detail-stage[\s\S]{0,360}overflow:\s*auto)/,
    message: "admin manager ranking board must keep health, digest, priority queue, and selected list inside a bounded terminal stage."
  },
  {
    pattern: /(?=[\s\S]*buildPortfolioCustomerActionCrossCheck[\s\S]*supportingEvidence[\s\S]*constraintEvidence)(?=[\s\S]*buildPortfolioCustomerActionLeaderboardItem[\s\S]*crossCheckSummary)(?=[\s\S]*renderManagerCustomerActionCrossCheck[\s\S]*ranking-action-crosscheck)/,
    message: "customer action leaderboard details must preserve cross-ranking validation and constraints while concise status lines stay result-first."
  },
  {
    pattern: /getDefaultManagerRankingFilter[\s\S]{0,900}priorityQueue[\s\S]{0,900}listId/,
    message: "admin manager ranking boards must default to the highest-priority ranking lane instead of expanding all lists."
  },
  {
    pattern: /setManagerRankingFilter[\s\S]{0,1600}data-ranking-filter[\s\S]{0,1600}is-filtered-out/,
    message: "admin manager ranking overview cards must focus one ranking lane and hide non-focused lists."
  },
  {
    pattern: /focusWatchlistFund[\s\S]{0,1400}data-watchlist-code[\s\S]{0,1400}focused-from-ranking/,
    message: "admin customer digest must jump to, open, and highlight matching watchlist fund cards."
  },
  {
    pattern: /renderManagerCustomerDigestItem[\s\S]{0,1200}data-focus-watchlist-code[\s\S]{0,1200}查看自选池/,
    message: "admin customer digest items must expose a direct watchlist detail action."
  },
  {
    pattern: /renderManagerPriorityItem[\s\S]{0,1000}ranking-detail-link[\s\S]{0,800}data-focus-watchlist-code/,
    message: "admin priority queue items must expose a compact watchlist detail action."
  },
  {
    pattern: /renderManagerRankingItem[\s\S]{0,1200}ranking-detail-link[\s\S]{0,800}data-focus-watchlist-code/,
    message: "admin ranking list items must expose a compact watchlist detail action."
  },
  {
    pattern: /renderWatchlistItem[\s\S]{0,2400}renderWatchlistRankingRefs[\s\S]{0,2800}上榜依据/,
    message: "admin watchlist cards must show which ranking lanes cite each fund."
  },
  {
    pattern: /collectWatchlistRankingRefs[\s\S]{0,1200}currentPortfolio\?\.managerRankings\?\.lists[\s\S]{0,900}item\.rank/,
    message: "admin watchlist ranking citations must derive from the current manager ranking board."
  },
  {
    pattern: /getManagerRankingActionClass[\s\S]{0,900}卖出[\s\S]{0,900}综合[\s\S]{0,900}再部署[\s\S]{0,900}仓位[\s\S]{0,900}质量[\s\S]{0,900}经理[\s\S]{0,900}组合[\s\S]{0,900}主题[\s\S]{0,900}追涨[\s\S]{0,900}回撤[\s\S]{0,900}轮动[\s\S]{0,900}买入[\s\S]{0,900}持仓[\s\S]{0,900}替代[\s\S]{0,900}费用[\s\S]{0,900}机会[\s\S]{0,900}观察/,
    message: "admin ranking items must visually distinguish synthesis, cash-redeployment, position-sizing, fund-quality, manager-stability, portfolio-fit, theme-allocation, buy, chase-risk, drawdown-defense, sector-rotation, holdings-outlook, replacement-choice, fee-suitability, opportunity-cost, watch, and sell style actions."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-redeploy)(?=[\s\S]*ranking-list-redeploy)(?=[\s\S]*ranking-action\.redeploy)/,
    message: "admin ranking board must visually distinguish cash-redeployment cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-sizing)(?=[\s\S]*ranking-list-sizing)(?=[\s\S]*ranking-action\.sizing)/,
    message: "admin ranking board must visually distinguish position-sizing cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-quality)(?=[\s\S]*ranking-list-quality)(?=[\s\S]*ranking-action\.quality)/,
    message: "admin ranking board must visually distinguish fund-quality cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-fit)(?=[\s\S]*ranking-list-fit)(?=[\s\S]*ranking-action\.fit)/,
    message: "admin ranking board must visually distinguish portfolio-fit cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-theme)(?=[\s\S]*ranking-list-theme)(?=[\s\S]*ranking-action\.theme)/,
    message: "admin ranking board must visually distinguish theme-allocation cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-synthesis)(?=[\s\S]*ranking-list-synthesis)(?=[\s\S]*ranking-action\.synthesis)/,
    message: "admin ranking board must visually distinguish decision-synthesis cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-chase)(?=[\s\S]*ranking-list-chase)(?=[\s\S]*ranking-action\.chase)/,
    message: "admin ranking board must visually distinguish chase-risk cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-defense)(?=[\s\S]*ranking-list-defense)(?=[\s\S]*ranking-action\.defense)/,
    message: "admin ranking board must visually distinguish drawdown-defense cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-data)(?=[\s\S]*ranking-list-data)(?=[\s\S]*ranking-action\.data)/,
    message: "admin ranking board must visually distinguish data-confidence cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-rotation)(?=[\s\S]*ranking-list-rotation)(?=[\s\S]*ranking-action\.rotation)/,
    message: "admin ranking board must visually distinguish sector-rotation cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-fee)(?=[\s\S]*ranking-list-fee)(?=[\s\S]*ranking-action\.fee)/,
    message: "admin ranking board must visually distinguish fee-suitability cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-overview-replacement)(?=[\s\S]*ranking-list-replacement)(?=[\s\S]*ranking-action\.replacement)/,
    message: "admin ranking board must visually distinguish replacement-choice cards, lists, and action pills."
  },
  {
    pattern: /(?=[\s\S]*ranking-health)(?=[\s\S]*ranking-next)/,
    message: "manager ranking boards must explain empty states and next actions."
  },
  {
    pattern: /renderManagerRankingDecision[\s\S]{0,1600}看点[\s\S]{0,1200}风险[\s\S]{0,1200}缺口[\s\S]{0,1200}下一步/,
    message: "manager ranking items must render opportunity, risk, gap, and next-step decision cells."
  },
  {
    pattern: /function renderRunActionAudit[\s\S]{0,900}榜单[\s\S]{0,180}action\.rankingBasis[\s\S]{0,400}走势[\s\S]{0,400}边界/,
    message: "admin run timeline must audit whether each manager action cites ranking, trend, and boundary evidence."
  },
  {
    pattern: /(?=[\s\S]*function renderRunThinkingCards[\s\S]{0,900}renderRunActionRiskStrip\(action\))(?=[\s\S]*function collectRunActionHardRisks[\s\S]{0,1200}WATCHLIST_HARD_RISK_RULES)(?=[\s\S]*\.action-hard-risk-strip)/,
    message: "admin run timeline action cards must render hard-risk chips for stale catalysts and catchdown warnings before long reasons."
  },
  {
    pattern: /rankingActionAudit:\s*buildPortfolioRankingActionAudit\(db\)[\s\S]*function buildPortfolioRankingActionAudit[\s\S]{0,2600}coveragePct/,
    message: "portfolio API must expose ranking-board citation coverage for recent manager actions."
  },
  {
    pattern: /(?=[\s\S]*榜单引用)(?=[\s\S]*portfolioRankingAuditSummary)(?=[\s\S]*buildRankingAuditInsightItems)/,
    message: "admin dashboard must render ranking citation coverage as a first-class insight card."
  },
  {
    pattern: /(?=[\s\S]*runtime-terminal-shell)(?=[\s\S]*data-runtime-view-target="conversation")(?=[\s\S]*data-runtime-view-target="data")(?=[\s\S]*renderRuntimeTerminal)/,
    message: "admin runtime page must use a multi-entry terminal instead of one long metric wall."
  },
  {
    pattern: /(?=[\s\S]*订单终端)(?=[\s\S]*data-order-view-target="transactions")(?=[\s\S]*setPortfolioOrderView)/,
    message: "admin portfolio orders must split orders, transactions, equity, and raw state into terminal entries."
  },
  {
    pattern: /(?=[\s\S]*虚拟运行台)(?=[\s\S]*data-runner-view-target="latest")(?=[\s\S]*data-runner-view-target="execution")(?=[\s\S]*data-runner-view-target="history")(?=[\s\S]*setPortfolioRunnerView)(?=[\s\S]*portfolioRunCommandStrip)(?=[\s\S]*renderPortfolioRunHistoryBoard)/,
    message: "admin portfolio runner must split virtual execution into task, conclusion, execution, history, and raw-state entries."
  },
  {
    pattern: /compactRunnerConsoleText/,
    message: "admin portfolio runner control cards must compact long manager summaries."
  },
  {
    pattern: /runnerTarget:\s*"latest"[\s\S]*data-runner-view-target/,
    message: "admin portfolio runner control cards must switch runner sub-entries instead of sending users into long report pages."
  },
  {
    pattern: /runner-workspace-view\[data-runner-view="control"\]\.active[\s\S]{0,260}overflow:\s*hidden/,
    message: "admin portfolio runner control view must stay bounded inside the trading terminal."
  },
  {
    pattern: /run-console-grid[\s\S]{0,260}overflow:\s*auto/,
    message: "admin portfolio runner summary cards must scroll inside the control entry."
  },
  {
    pattern: /@media \(max-width: 860px\)[\s\S]*body\[data-active-tab="portfolio"\] \.app-shell[\s\S]{0,220}height:\s*100dvh[\s\S]{0,260}grid-template-rows:\s*auto minmax\(0,\s*1fr\)/,
    message: "admin portfolio mobile layout must remain a bounded stock-terminal workspace instead of reverting to a long page."
  },
  {
    pattern: /@media \(max-width: 860px\)[\s\S]*\.portfolio-workspace-view\[data-portfolio-view="runner"\]\.active[\s\S]{0,140}overflow:\s*hidden[\s\S]{0,700}\.run-console-terminal[\s\S]{0,260}grid-template-rows:\s*auto minmax\(0,\s*1fr\)/,
    message: "admin portfolio mobile runner must split task entries from the active detail panel."
  },
  {
    pattern: /@media \(max-width: 860px\)[\s\S]*\.run-task-rail[\s\S]{0,220}max-height:\s*70px[\s\S]{0,140}overflow-x:\s*auto/,
    message: "admin portfolio mobile runner tasks must be horizontal terminal entries, not a tall vertical stack."
  },
  {
    pattern: /(?=[\s\S]*body\[data-active-tab="portfolio"\]\[data-active-portfolio-view\]:not\(\[data-active-portfolio-view="overview"\]\) \.portfolio-command-panel[\s\S]{0,120}display:\s*none)(?=[\s\S]*@media \(min-width:\s*861px\)[\s\S]*data-active-portfolio-view[\s\S]{0,260}grid-template-rows:\s*minmax\(0,\s*1fr\))/,
    message: "admin portfolio focused workspaces must hide the tall account header so virtual-run entries fit like a trading terminal."
  },
  {
    pattern: /(?=[\s\S]*经理体检终端)(?=[\s\S]*data-diagnostic-view-target="actions")(?=[\s\S]*setPortfolioDiagnosticView)(?=[\s\S]*diagnosticNavBacktestCount)/,
    message: "admin portfolio diagnostics must be a multi-entry manager health terminal, not a long mixed card block."
  },
  {
    pattern: /经理榜单/,
    message: "admin portfolio UI must include a visible manager ranking board section."
  }
];

const traceGuards = process.env.CHECK_RUNTIME_GUARDS_TRACE === "1";
const profileGuards = process.env.CHECK_RUNTIME_GUARDS_PROFILE === "1";
const failures = [];
for (const item of forbiddenPatterns) {
  if (traceGuards) console.error(`[forbidden] ${item.message}`);
  if (profileGuards) console.error(`[forbidden start] ${item.message}`);
  const startedAt = Date.now();
  const matched = item.pattern.test(server);
  const elapsedMs = Date.now() - startedAt;
  if (profileGuards && elapsedMs > 20) console.error(`[forbidden ${elapsedMs}ms] ${item.message}`);
  if (matched) failures.push(item.message);
}
for (const item of requiredPatterns) {
  if (traceGuards) console.error(`[required] ${item.message}`);
  if (profileGuards) console.error(`[required start] ${item.message}`);
  const startedAt = Date.now();
  const matched = item.pattern.test(allSource);
  const elapsedMs = Date.now() - startedAt;
  if (profileGuards && elapsedMs > 20) console.error(`[required ${elapsedMs}ms] ${item.message}`);
  if (!matched) failures.push(item.message);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
