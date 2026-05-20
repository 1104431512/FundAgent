import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.FUNDAGENT_SKIP_SERVER_START = "1";
process.env.FEISHU_REPORT_CHART_PIXEL_RATIO = "1";

const serverPath = pathToFileURL(path.join(process.cwd(), "src", "server.mjs")).href;
const serverSource = fs.readFileSync(path.join(process.cwd(), "src", "server.mjs"), "utf8");
const manager = await import(serverPath);

const setupQuery = "我想要找一个回调完成，到了低位，准备要启动的基金";
const intent = await manager.classifyMessageIntent({
  userText: setupQuery,
  messageType: "text",
  imageKeys: []
});

assert.equal(intent.workflow, "fund_recommendation", "pullback setup query must route to recommendation workflow");
assert.equal(intent.mode, "pullback_setup_discovery", "pullback setup query must use dedicated discovery mode");
assert.equal(intent.reason, "hard_rule_pullback_setup_request", "pullback setup routing must not depend on model router");
assert.equal(manager.isPullbackSetupRequest(setupQuery), true, "setup query must be recognized as pullback/setup request");
assert.equal(manager.isGenericPullbackSetupRequest(setupQuery), true, "generic setup query must expand beyond a single named theme");
assertSkillCoverage(intent.skillIds, [
  "fund-theme-radar",
  "theme-stage-analysis",
  "theme-to-fund-mapping",
  "forward-looking-actionability",
  "fund-recommendation",
  "fund-market-timing",
  "fund-fee-share-class",
  "fund-actionability-evaluation",
  "fund-answer-quality",
  "fund-synthesis"
], "pullback setup recommendation");
const setupSkillContext = manager.buildSkillContextForIntent(intent, manager.getFundRecommendationSkillIds(), { userText: setupQuery });
assert(
  setupSkillContext.includes("本次任务焦点：回调完成/低位启动，不追热点。"),
  "pullback setup skill context must keep the ready-to-launch task focus above generic skill details"
);
assert(
  setupSkillContext.indexOf("本次任务焦点：回调完成/低位启动") < setupSkillContext.indexOf("# Skill: fund-theme-radar"),
  "task focus directive must appear before loaded skill bodies"
);
assert(
  setupSkillContext.indexOf("# Skill: fund-theme-radar") < setupSkillContext.indexOf("# Skill: fund-answer-quality"),
  "skill context must preserve requested workflow priority order"
);
assert(
  !serverSource.includes("Math.min(getConfiguredMaxOutputTokens(), 5200)") &&
    !serverSource.includes("Math.min(getConfiguredMaxOutputTokens(), 4800)"),
  "fund analyst and committee stages must not be capped below the richer workflow token budget"
);
assert(
  serverSource.includes("getFundWorkflowMaxOutputTokens(MIN_FUND_ANALYST_OUTPUT_TOKENS)") &&
    serverSource.includes("getFundWorkflowMaxOutputTokens(MIN_FUND_COMMITTEE_OUTPUT_TOKENS)"),
  "intermediate fund workflow stages must use explicit high token floors"
);
assert(!serverSource.includes("maxTokens: 900"), "fund screenshot extraction must not use the old 900-token cap");

await assertIntent({
  userText: "黄金里面找一个回调完成、低位、准备启动的基金",
  expectedWorkflow: "fund_recommendation",
  expectedReason: "hard_rule_pullback_setup_request",
  expectedMode: "pullback_setup_discovery",
  requiredSkills: ["fund-theme-radar", "theme-stage-analysis", "fund-market-timing", "fund-fee-share-class", "fund-answer-quality"]
});
await assertIntent({
  userText: "找一个回调完成、低位、准备启动的",
  expectedWorkflow: "fund_recommendation",
  expectedReason: "hard_rule_pullback_setup_request",
  expectedMode: "pullback_setup_discovery",
  requiredSkills: ["fund-theme-radar", "theme-stage-analysis", "fund-market-timing", "fund-fee-share-class", "fund-answer-quality"]
});
for (const userText of [
  "有没有低位刚要启动的标的",
  "找低位刚启动的机会",
  "有没有回踩完成准备向上的基金",
  "帮我筛低位修复要启动的",
  "有回撤企稳准备走强的标的吗",
  "帮我找回调到位刚拐头的",
  "有没有筑底企稳开始走强的标的",
  "筛一下跌下来后止跌反弹的机会",
  "找调整到位低位横盘要启动的"
]) {
  await assertIntent({
    userText,
    expectedWorkflow: "fund_recommendation",
    expectedReason: "hard_rule_pullback_setup_request",
    expectedMode: "pullback_setup_discovery",
    requiredSkills: ["fund-theme-radar", "theme-stage-analysis", "fund-market-timing", "fund-fee-share-class", "fund-answer-quality"]
  });
}
for (const userText of [
  "000001 是不是回调完成低位准备启动",
  "000001 有没有低位刚启动机会",
  "帮我看000001是不是回踩完成准备向上",
  "000001 有没有筑底拐头机会"
]) {
  await assertIntent({
    userText,
    expectedWorkflow: "fund_screening",
    expectedReason: "text_contains_fund_code_pullback_setup_request",
    expectedMode: "specific_pullback_setup_assessment",
    requiredSkills: ["fund-data-enrichment", "fund-trend-analysis", "fund-risk-analysis", "fund-fee-share-class", "fund-market-timing", "fund-actionability-evaluation", "fund-answer-quality"]
  });
}
const specificPullbackContext = manager.buildSkillContextForIntent({
  workflow: "fund_screening",
  mode: "specific_pullback_setup_assessment",
  userText: "000001 是不是回调完成低位准备启动",
  skillIds: manager.getFundAnalysisSkillIds(["fund-market-timing", "fund-synthesis"])
});
assert(specificPullbackContext.includes("具体基金的回调完成/低位启动评估"), "specific fund pullback setup requests must get a dedicated low-position launch focus");
assert(specificPullbackContext.includes("如果不符合，要说等待什么条件，不要给买入金额"), "specific fund pullback setup focus must forbid buy amounts when conditions are not met");
assert(!serverSource.includes("preferPullbackSetup && !precious"), "precious-metal pullback setup requests must not bypass setup discovery");
assert.deepEqual(
  manager.filterFocusedPullbackRankingCandidates([
    { code: "000010", name: "博时黄金ETF联接C", type: "指数型基金", keywords: ["近1周低位转强候选"] },
    { code: "000011", name: "半导体ETF联接C", type: "指数型基金", keywords: ["近1周低位转强候选"] },
    { code: "000012", name: "贵金属主题基金A", type: "股票型基金", keywords: [] }
  ], ["黄金", "贵金属"]).map((item) => item.code),
  ["000010", "000012"],
  "focused pullback ranking scan must keep precious-metal candidates and drop unrelated themes"
);

await assertIntent({
  userText: "按最近题材推荐几个基金",
  expectedWorkflow: "fund_recommendation",
  expectedReason: "hard_rule_text_requests_recommendations_without_specific_fund",
  requiredSkills: ["fund-theme-radar", "theme-to-fund-mapping", "fund-recommendation", "fund-market-timing", "fund-answer-quality"]
});

await assertIntent({
  userText: "招商行业精选股票基金怎么样",
  expectedWorkflow: "fund_screening",
  expectedReason: "hard_rule_text_mentions_specific_fund_action",
  requiredSkills: ["fund-data-enrichment", "fund-trend-analysis", "fund-risk-analysis", "fund-holdings-style", "fund-fee-share-class", "fund-manager-quality", "fund-actionability-evaluation", "fund-answer-quality"]
});

await assertIntent({
  userText: "诺德短债A适合买吗",
  expectedWorkflow: "fund_screening",
  expectedReason: "hard_rule_text_mentions_specific_fund_action",
  requiredSkills: ["fund-data-enrichment", "fund-risk-analysis", "fund-fee-share-class", "fund-actionability-evaluation", "fund-answer-quality"]
});

await assertIntent({
  userText: "天弘余额宝货币能买吗",
  expectedWorkflow: "fund_screening",
  expectedReason: "hard_rule_text_mentions_specific_fund_action",
  requiredSkills: ["fund-data-enrichment", "fund-risk-analysis", "fund-fee-share-class", "fund-actionability-evaluation", "fund-answer-quality"]
});

await assertIntent({
  userText: "华安纳斯达克100ETF联接QDIIA还能买吗",
  expectedWorkflow: "fund_screening",
  expectedReason: "hard_rule_text_mentions_specific_fund_action",
  requiredSkills: ["fund-data-enrichment", "fund-trend-analysis", "fund-risk-analysis", "fund-fee-share-class", "fund-actionability-evaluation", "fund-answer-quality"]
});

await assertIntent({
  userText: "博时黄金ETF联接C和A哪个好",
  expectedWorkflow: "fund_screening",
  expectedReason: "hard_rule_text_mentions_specific_fund_action",
  expectedMode: "comparison_or_specific_fund",
  requiredSkills: ["fund-comparison", "fund-synthesis", "fund-fee-share-class", "fund-answer-quality"]
});

await assertIntent({
  userText: "黄金最近值得买吗",
  expectedWorkflow: "fund_qa",
  expectedReason: "hard_rule_market_action_question",
  expectedMode: "market_question",
  requiredSkills: ["fund-theme-radar", "theme-stage-analysis", "forward-looking-actionability", "fund-market-timing", "fund-trend-analysis", "fund-answer-quality", "fund-synthesis"]
});

await assertIntent({
  userText: "你能做什么",
  expectedWorkflow: "conversation",
  expectedReason: "hard_rule_plain_conversation",
  requiredSkills: []
});

await assertIntent({
  userText: "我的虚拟组合今天买卖了吗",
  expectedWorkflow: "portfolio_status",
  expectedReason: "hard_rule_virtual_manager_account_query",
  requiredSkills: []
});

await assertIntent({
  userText: "基金经理你的自选基金池有哪些，备选理由是什么",
  expectedWorkflow: "portfolio_status",
  expectedReason: "hard_rule_virtual_manager_account_query",
  requiredSkills: []
});

const normalizedWatchDb = manager.normalizePortfolioDb({
  watchlist: [
    {
      code: "000001",
      name: "低位修复基金C",
      status: "ready_to_buy",
      priority: 1,
      reason: "回调完成后低位修复，适合等待触发后分批。",
      setupEvidence: ["120日位置偏低", "5日/10日刚转强"],
      buyTriggers: ["放量站回20日均线"],
      riskNotes: ["若近20日涨幅超过10%则暂停追入"],
      feeNotes: ["C类更适合短中期观察，A类适合更长持有"]
    }
  ]
});
assert.equal(normalizedWatchDb.watchlist.length, 1, "portfolio db must persist manager self-selected funds");
assert.equal(normalizedWatchDb.watchlist[0].status, "ready", "watchlist status aliases must normalize to ready");
const watchSummary = manager.summarizePortfolioWatchItem(normalizedWatchDb.watchlist[0]);
assert(watchSummary.reason.includes("回调完成"), "watchlist candidates must keep detailed backup reasons");
assert(watchSummary.buyTriggers.length > 0, "watchlist candidates must keep buy triggers");
assert(watchSummary.riskNotes.length > 0, "watchlist candidates must keep risk notes");
assert(watchSummary.feeNotes.length > 0, "watchlist candidates must keep fee/share-class notes");
assert(watchSummary.readinessGaps.some((item) => item.includes("缺少可验证净值")), "watchlist summary must expose buy-readiness gaps when NAV evidence is missing");
const consolidatedWatchDb = manager.normalizePortfolioDb({
  watchlist: [
    {
      code: "000101",
      name: "中证500ETF联接A",
      shareClass: "A",
      status: "ready",
      priority: 2,
      reason: "A类同基金份额，适合长期持有再比较。",
      feeNotes: ["A类有申购费，长期可比较。"]
    },
    {
      code: "000102",
      name: "中证500ETF联接C",
      shareClass: "C",
      status: "ready",
      priority: 1,
      reason: "C类同基金份额，短中期观察更灵活。",
      feeNotes: ["C类通常无申购费，有销售服务费。"]
    },
    {
      code: "000103",
      name: "南方中证500ETF联接C",
      shareClass: "C",
      status: "waiting_pullback",
      priority: 3,
      reason: "同指数替代工具，等待回踩。"
    }
  ]
});
assert.equal(consolidatedWatchDb.watchlist.length, 1, "watchlist must consolidate duplicate share classes and same-exposure alternatives into one scannable candidate");
assert.equal(consolidatedWatchDb.watchlist[0].code, "000102", "watchlist consolidation should keep the most actionable C-share primary when status evidence is comparable");
assert(consolidatedWatchDb.watchlist[0].alternativeShareClasses.some((item) => item.code === "000101"), "watchlist consolidation must preserve same-fund A/C alternatives");
assert(consolidatedWatchDb.watchlist[0].sameExposureAlternatives.some((item) => item.code === "000103"), "watchlist consolidation must preserve same-index exposure alternatives");
assert(consolidatedWatchDb.watchlist[0].dataBasis.includes("来源：watchlist_exposure_consolidation"), "watchlist exposure consolidation must leave a traceable source");
const consolidatedWatchLines = manager.buildPortfolioWatchlistStatusLines(consolidatedWatchDb.watchlist).join("\n");
assert(consolidatedWatchLines.includes("替代份额：000101"), "portfolio status answer must show consolidated share-class alternatives");
assert(consolidatedWatchLines.includes("同类替代：000103"), "portfolio status answer must show consolidated same-exposure alternatives");
const watchlistStatusLines = manager.buildPortfolioWatchlistStatusLines([
  {
    ...normalizedWatchDb.watchlist[0],
    lastSnapshot: {
      nav: 1.2345,
      navDate: "2026-05-19",
      trendSummary: "20日+4.8%，60日+7.6%，趋势回调完成，入场可买",
      trendProfile: {
        ok: true,
        pullbackSetup: { signal: "pullback_complete" },
        trendLabel: "pullback_complete",
        entryBias: "buyable_now",
        return5dPct: 1.2,
        return10dPct: 3.2,
        return20dPct: 4.8,
        return60dPct: 7.6,
        lowPositionPct120: 42.4,
        drawdownFromRecentHighPct: -7.1
      },
      fees: {
        shareClass: "C",
        shareClassFeeModel: { label: "C类：通常无申购费，销售服务费按年计提" },
        feeImpact: { oneYearCostPer10000: 42 }
      }
    }
  },
  {
    code: "000002",
    name: "等待回调基金C",
    status: "waiting_pullback",
    priority: 3,
    candidateRole: "低位启动前夜观察备选",
    reason: "召回定位：低位启动前夜候选。近20日涨幅略快，等待回踩。",
    setupEvidence: ["召回定位：低位启动前夜候选"],
    buyTriggers: ["回踩不破前低"],
    riskNotes: ["若继续放量冲高则不追"],
    feeNotes: ["C类适合短期观察"],
    positionPlan: "先放入启动前夜观察池；只等净值下钻确认后再小额分批。",
    dataBasis: ["召回来源：low_base_turn_scan"],
    lastSnapshot: {
      trendProfile: {
        ok: true,
        pullbackSetup: { signal: "none" },
        trendLabel: "range_or_mixed",
        entryBias: "wait_pullback",
        return20dPct: 8.8,
        return60dPct: 18.2,
        lowPositionPct120: 58.6,
        drawdownFromRecentHighPct: -4.1
      }
    }
  },
  {
    code: "000003",
    name: "追涨拦截基金A",
    status: "blocked",
    priority: 5,
    reason: "短期偏热，不符合低位启动。",
    riskNotes: ["20日涨幅过高"]
  }
]).join("\n");
assert(watchlistStatusLines.includes("合计 3 只"), "portfolio status answer must summarize watchlist counts");
assert(watchlistStatusLines.includes("启动前夜重点复核："), "portfolio status answer must surface launch-eve watchlist candidates before the general queue");
assert(watchlistStatusLines.includes("000002 等待回调基金C（准备度"), "launch-eve focus must include the low-base candidate with readiness score");
assert(watchlistStatusLines.includes("等净值下钻确认后再进入买点评估，不自动买入"), "launch-eve focus must say it is a review target, not an automatic buy");
assert(watchlistStatusLines.includes("购买准备队列："), "portfolio status answer must surface an actionable buy-preparation queue");
assert(watchlistStatusLines.includes("000001 低位修复基金C（接近可买，准备度"), "buy-preparation queue must highlight ready watchlist candidates with readiness score");
assert(watchlistStatusLines.includes("000002 等待回调基金C（等待回调，准备度"), "buy-preparation queue must highlight backup candidates waiting for pullback with readiness score");
assert(watchlistStatusLines.includes("买入准备充分"), "portfolio status answer must translate readiness score into a client-readable label");
assert(watchlistStatusLines.includes("【接近可买】"), "portfolio status answer must group ready watchlist candidates");
assert(watchlistStatusLines.includes("【等待回调】"), "portfolio status answer must group waiting watchlist candidates");
assert(watchlistStatusLines.includes("【暂不买入】"), "portfolio status answer must group blocked watchlist candidates");
assert(watchlistStatusLines.includes("备选理由：回调完成后低位修复"), "portfolio status answer must include detailed watchlist reasons");
assert(watchlistStatusLines.includes("触发：放量站回20日均线"), "portfolio status answer must include buy triggers");
assert(watchlistStatusLines.includes("风险边界：若近20日涨幅超过10%则暂停追入"), "portfolio status answer must include risk boundaries");
assert(watchlistStatusLines.includes("费用/份额：C类更适合短中期观察"), "portfolio status answer must include fee/share-class notes");
assert(watchlistStatusLines.includes("最新走势：20日+4.8%"), "portfolio status answer must include latest trend evidence");
assert(watchlistStatusLines.includes("缺口=低位/启动/刚转强/不过热/费用条件已满足"), "buy-preparation queue must tell managers when ready candidates have no remaining setup, early-turn, and fee gap");
assert(watchlistStatusLines.includes("买入缺口：还差回调完成或启动前夜信号"), "watchlist detail must expose what waiting candidates still lack before buying");
const workflowWatchlistInput = [
  {
    ...normalizedWatchDb.watchlist[0],
    updatedAt: "2026-05-20T00:00:00.000Z",
    alternativeShareClasses: [{ code: "000101", name: "低位修复基金A", shareClass: "A", feeNotes: ["A类适合更长持有"] }],
    sameExposureAlternatives: [{ code: "000005", name: "同指数低费率联接C", shareClass: "C" }],
    lastSnapshot: {
      snapshotDate: "2026-05-19",
      navDate: "2026-05-19",
      trendProfile: {
        ok: true,
        pullbackSetup: { signal: "pullback_complete", score: 78 },
        trendLabel: "pullback_complete",
        entryBias: "buyable_now",
        return5dPct: 1.2,
        return10dPct: 3.2,
        return20dPct: 4.8,
        return60dPct: 7.6,
        lowPositionPct120: 42.4,
        drawdownFromRecentHighPct: -7.1
      }
    }
  },
  {
    code: "000002",
    name: "等待回调基金C",
    status: "waiting_pullback",
    priority: 3,
    updatedAt: "2026-05-20T00:00:00.000Z",
    candidateRole: "低位启动前夜观察备选",
    reason: "召回定位：低位启动前夜候选。",
    setupEvidence: ["召回定位：低位启动前夜候选"],
    buyTriggers: ["回踩不破前低"],
    positionPlan: "先放入启动前夜观察池。",
    dataBasis: ["召回来源：low_base_turn_scan"],
    lastSnapshot: {
      snapshotDate: "2026-05-19",
      navDate: "2026-05-19",
      trendProfile: {
        ok: true,
        pullbackSetup: { signal: "none" },
        trendLabel: "range_or_mixed",
        entryBias: "wait_pullback",
        return20dPct: 8.8,
        return60dPct: 18.2,
        lowPositionPct120: 58.6,
        drawdownFromRecentHighPct: -4.1
      }
    }
  },
  {
    code: "000004",
    name: "旧快照接近可买基金C",
    status: "ready",
    priority: 1,
    updatedAt: "2000-01-01T00:00:00.000Z",
    reason: "旧的低位启动候选。",
    lastSnapshot: { snapshotDate: "2000-01-01", navDate: "2000-01-01", trendProfile: { ok: true, pullbackSetup: { signal: "pullback_complete" } } }
  },
  { code: "000003", name: "追涨拦截基金A", status: "blocked", reason: "短期偏热" }
];
const workflowWatchlistCandidates = manager.selectFundWorkflowWatchlistCandidates(workflowWatchlistInput, setupQuery, { limit: 4, now: "2026-05-20T00:00:00.000Z" });
assert.deepEqual(workflowWatchlistCandidates.map((item) => item.code), ["000001", "000002"], "fund workflows must reuse ready and launch-eve watchlist candidates while excluding blocked items");
assert(!workflowWatchlistCandidates.some((item) => item.code === "000004"), "fund workflows must not reuse stale ready watchlist snapshots as recommendation evidence");
const staleWorkflowRefreshCandidates = manager.selectFundWorkflowStaleWatchlistRefreshCandidates(workflowWatchlistInput, setupQuery, { limit: 2, now: "2026-05-20T00:00:00.000Z" });
assert.deepEqual(staleWorkflowRefreshCandidates.map((item) => item.code), ["000004"], "fund workflows should refresh stale setup watchlist candidates before excluding them");
const workflowWatchlistSummary = manager.buildFundWorkflowWatchlistSummary(workflowWatchlistCandidates);
assert(workflowWatchlistSummary.includes("经理自选候选池（优先复核，不自动买入）"), "fund workflow prompt must expose manager-maintained candidates");
assert(workflowWatchlistSummary.includes("000002 等待回调基金C"), "fund workflow prompt must include launch-eve watchlist candidates");
assert(workflowWatchlistSummary.includes("替代份额=000101"), "fund workflow prompt must expose alternative A/C share classes from the watchlist");
assert(workflowWatchlistSummary.includes("同类替代=000005"), "fund workflow prompt must expose same-exposure alternatives from the watchlist");
const mergedWatchDeepDive = manager.mergeFundWorkflowWatchlistIntoDeepDive({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  candidates: []
}, workflowWatchlistCandidates, setupQuery);
const mergedWatchSummary = manager.buildMarketDeepDiveSummary(mergedWatchDeepDive);
assert(mergedWatchSummary.includes("mainCandidateCodes=000001"), "ready watchlist candidates with verified pullback evidence must be visible to pullback quality gates");
assert(mergedWatchSummary.includes("watchOrRejectCodes=000002"), "launch-eve watchlist candidates that still wait for confirmation must stay out of main recommendations");
assert(mergedWatchDeepDive.portfolioWatchlistCandidates?.length === 2, "merged deep-dive evidence must keep traceable watchlist context");
assert(mergedWatchDeepDive.candidates.find((item) => item.code === "000001")?.seed?.alternativeShareClasses?.some((item) => item.code === "000101"), "merged watchlist candidates must carry share-class alternatives into deep-dive evidence");
const mergedWatchWithFailedMarketFetch = manager.mergeFundWorkflowWatchlistIntoDeepDive({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  candidates: [{ ok: false, code: "000001", name: "低位修复基金C", error: "temporary fetch failure" }]
}, workflowWatchlistCandidates, setupQuery);
assert.equal(mergedWatchWithFailedMarketFetch.candidates.find((item) => item.code === "000001")?.ok, true, "watchlist snapshots must not be overwritten by temporary market deep-dive failures");
assert.equal(
  manager.normalizePortfolioWatchlistUpdates([{ operation: "REMOVE", code: "000001", reason: "主题过热" }])[0].operation,
  "REMOVE",
  "watchlist updates must support removing stale candidates"
);

const moneyMarketSkillContext = manager.buildSkillContextForIntent({
  workflow: "fund_screening",
  userText: "天弘余额宝货币能买吗",
  skillIds: manager.getFundAnalysisSkillIds(["fund-synthesis"])
});
assert(moneyMarketSkillContext.includes("产品类型焦点：货币基金按现金管理评估"), "money-market screening must prioritize cash-management evidence");
assert(moneyMarketSkillContext.indexOf("产品类型焦点：货币基金") < moneyMarketSkillContext.indexOf("# Skill: fund-data-enrichment"), "money-market focus must appear before skill bodies");

const bondSkillContext = manager.buildSkillContextForIntent({
  workflow: "fund_screening",
  userText: "诺德短债A适合买吗",
  skillIds: manager.getFundAnalysisSkillIds(["fund-synthesis"])
});
assert(bondSkillContext.includes("产品类型焦点：债基按久期、信用风险"), "bond screening must prioritize duration, credit, and drawdown evidence");

const qdiiSkillContext = manager.buildSkillContextForIntent({
  workflow: "fund_screening",
  userText: "华安纳斯达克100ETF联接QDIIA还能买吗",
  skillIds: manager.getFundAnalysisSkillIds(["fund-synthesis"])
});
assert(qdiiSkillContext.includes("产品类型焦点：QDII/海外基金"), "QDII screening must prioritize overseas, FX, NAV-lag, and liquidity evidence");

const shareClassSkillContext = manager.buildSkillContextForIntent({
  workflow: "fund_screening",
  userText: "博时黄金ETF联接C和A哪个好",
  skillIds: manager.getFundAnalysisSkillIds(["fund-comparison", "fund-synthesis"])
});
assert(shareClassSkillContext.includes("对比焦点：同一基金 A/C 等份额先比较费用和预计持有期"), "share-class comparisons must prioritize fees and holding period");

const lowSetupSeed = {
  name: "中证500ETF联接C",
  type: "指数型基金",
  oneWeekPct: 2.6,
  oneMonthPct: 4.2,
  threeMonthPct: -6.5,
  sixMonthPct: -11.8,
  thisYearPct: -7.6,
  oneYearPct: -8.4,
  dailyPct: 0.8
};
const chaseSeed = {
  name: "热门黄金主题基金A",
  type: "股票型基金",
  oneWeekPct: 9.8,
  oneMonthPct: 33.4,
  threeMonthPct: 36.6,
  sixMonthPct: 58.1,
  thisYearPct: 64.2,
  oneYearPct: 92.5,
  dailyPct: 4.9
};
const yearHighFakeLowSeed = {
  code: "000017",
  name: "年内高位伪低位基金C",
  type: "指数型基金",
  oneWeekPct: 2.2,
  oneMonthPct: 4.8,
  threeMonthPct: -1.2,
  sixMonthPct: 8.6,
  thisYearPct: 52.4,
  dailyPct: 0.7
};
assert(
  manager.scorePullbackSetupSeedCandidate(lowSetupSeed, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate(chaseSeed, [], setupQuery),
  "pullback setup seed scoring must prefer low-position repair over recent surge/chase candidates"
);
assert(
  manager.scorePullbackSetupSeedCandidate({ ...lowSetupSeed, code: "000018" }, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate(yearHighFakeLowSeed, [], setupQuery),
  "pullback setup seed scoring must penalize year-to-date high candidates that only look mild in short windows"
);
const weeklyTurnSeed = {
  code: "000010",
  name: "中证A500ETF联接C",
  type: "指数型基金",
  oneWeekPct: 2.4,
  oneMonthPct: 1.2,
  threeMonthPct: -7.5,
  sixMonthPct: -12.4,
  thisYearPct: -9.6,
  dailyPct: 0.6
};
const lowBaseTurnSeed = {
  code: "000014",
  name: "低位启动前夜基金C",
  type: "指数型基金",
  oneWeekPct: 1.6,
  oneMonthPct: 2.1,
  threeMonthPct: -10.4,
  sixMonthPct: -18.2,
  thisYearPct: -14.8,
  dailyPct: 0.5
};
const weeklyChaseSeed = {
  code: "000011",
  name: "热门强势主题基金A",
  type: "股票型基金",
  oneWeekPct: 9.2,
  oneMonthPct: 26.8,
  threeMonthPct: 42.1,
  sixMonthPct: 66.5,
  thisYearPct: 71.3,
  dailyPct: 5.4
};
assert(
  manager.scorePullbackSetupSeedCandidate(weeklyTurnSeed, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate(weeklyChaseSeed, [], setupQuery),
  "pullback setup seed scoring must prefer one-week low-position reversals over weekly/monthly chases"
);
assert.deepEqual(
  manager.selectWeeklyReversalRankCandidates([
    weeklyChaseSeed,
    weeklyTurnSeed,
    { code: "000012", name: "仍在下跌基金C", oneWeekPct: -3.1, oneMonthPct: -8.2, threeMonthPct: -15.4 }
  ]).map((item) => item.code),
  ["000010"],
  "weekly reversal scanner must keep mild one-week turns and reject chases or still-falling funds"
);
assert.deepEqual(
  manager.selectLowBaseTurnRankCandidates([
    weeklyChaseSeed,
    lowBaseTurnSeed,
    { code: "000015", name: "横盘未启动基金C", oneWeekPct: 0.1, oneMonthPct: -1.2, threeMonthPct: -8.4, sixMonthPct: -16.1 },
    { code: "000016", name: "月线追涨基金C", oneWeekPct: 3.2, oneMonthPct: 12.4, threeMonthPct: 18.8, sixMonthPct: 35.2 },
    yearHighFakeLowSeed
  ]).map((item) => item.code),
  ["000014"],
  "low-base turn scanner must keep low-position launch-eve candidates while rejecting no-turn, monthly chase, and year-to-date high candidates"
);
assert(
  manager.scorePullbackSetupSeedCandidate({ ...lowBaseTurnSeed, keywords: ["低位启动前夜候选"] }, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate(weeklyTurnSeed, [], setupQuery),
  "pullback setup scoring must prioritize low-base launch-eve candidates when return evidence is stronger"
);
assert(serverSource.includes('metric: "zzf"'), "pullback setup recall must directly scan one-week ranking data");
assert(serverSource.includes("PULLBACK_SETUP_WEEKLY_RANK_LIMIT || 160"), "one-week ranking scan must use a wider pool to catch mild early turns after hot weekly leaders");
assert(serverSource.includes("PULLBACK_SETUP_LOW_BASE_LIMIT || 96"), "low-base launch-eve scan must keep a broad candidate pool");
assert(serverSource.includes("PULLBACK_SETUP_BACKFILL_ROUNDS || 3"), "pullback setup deep-dive must keep searching beyond a single backfill batch");
const genericSetupKeywords = manager.inferPullbackSetupSearchKeywords(setupQuery, []);
for (const keyword of ["中证2000", "科创100", "央企", "国企", "基建", "房地产", "有色金属", "电力", "公用事业"]) {
  assert(genericSetupKeywords.includes(keyword), `generic pullback setup recall must include low-position rotation keyword: ${keyword}`);
}
assert(genericSetupKeywords.length > 24, "generic pullback setup recall must expand beyond the old narrow 24-keyword pool");
assert.deepEqual(
  manager.inferPullbackSetupSearchKeywords("小盘低位刚要启动", []),
  ["中证2000", "中证1000"],
  "focused pullback setup recall must understand small-cap/CSI2000 requests"
);
assert.deepEqual(
  manager.filterFocusedPullbackRankingCandidates([
    { code: "000020", name: "中证2000ETF联接C", type: "指数型基金", keywords: ["近1周低位转强候选"] },
    { code: "000021", name: "央企红利ETF联接C", type: "指数型基金", keywords: ["近1周低位转强候选"] },
    { code: "000022", name: "新能源主题基金C", type: "股票型基金", keywords: ["近1周低位转强候选"] }
  ], ["小盘"]).map((item) => item.code),
  ["000020"],
  "focused ranking scan must keep small-cap low-position candidates without leaking unrelated hot themes"
);
const mergedWeeklyEvidence = manager.mergeCandidateFunds([
  { code: "000010", name: "中证A500ETF联接C", keywords: ["中证A500"], setupDiscoverySource: "keyword_search" }
], [
  { ...weeklyTurnSeed, keywords: ["近1周低位转强候选"], setupDiscoverySource: "weekly_reversal_scan" }
])[0];
assert.equal(mergedWeeklyEvidence.oneWeekPct, 2.4, "candidate merge must preserve ranking return evidence when keyword search sees the fund first");
assert(mergedWeeklyEvidence.keywords.includes("近1周低位转强候选"), "candidate merge must preserve setup discovery tags");
assert.equal(mergedWeeklyEvidence.thisYearPct, -9.6, "candidate merge must preserve year-to-date ranking evidence for low-base scoring");
assert(mergedWeeklyEvidence.setupDiscoverySource.includes("keyword_search"), "candidate merge must preserve original discovery source");
assert(mergedWeeklyEvidence.setupDiscoverySource.includes("weekly_reversal_scan"), "candidate merge must preserve later ranking discovery source");
assert(
  manager.scorePullbackSetupSeedCandidate({ ...weeklyTurnSeed, name: "中证A500ETF联接C", shareClass: "C" }, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate({ ...weeklyTurnSeed, name: "中证A500ETF联接A", shareClass: "A" }, [], setupQuery),
  "tactical pullback setup scoring should prefer C share class over A when return evidence is otherwise equal"
);
const portfolioWatchlistSeeds = manager.selectPortfolioWatchlistSeedCandidates([
  weeklyChaseSeed,
  { ...lowBaseTurnSeed, keywords: ["低位启动前夜候选"], setupDiscoverySource: "low_base_turn_scan" },
  weeklyTurnSeed,
  { code: "000013", name: "已有候选基金C", type: "指数型基金", oneWeekPct: 2.1, oneMonthPct: 3.2, threeMonthPct: -4.5, sixMonthPct: -8.4 }
], [
  { code: "000013", name: "已有候选基金C", status: "watch" }
], [], { limit: 3, minScore: 52 });
assert.deepEqual(
  portfolioWatchlistSeeds.map((item) => item.code),
  ["000014", "000010"],
  "portfolio watchlist seed selection must prioritize low-base launch-eve candidates while rejecting chases and existing watchlist items"
);
const portfolioSeedUpdates = manager.buildPortfolioWatchlistUpdatesFromSeedCandidates(portfolioWatchlistSeeds);
assert.equal(portfolioSeedUpdates[0].source, "deterministic_pullback_recall", "portfolio watchlist seeds must be traceable to deterministic pullback recall");
assert.equal(portfolioSeedUpdates[0].status, "waiting_pullback", "portfolio watchlist seeds without NAV verification must not be marked ready");
assert(portfolioSeedUpdates[0].reason.includes("系统低位回调召回评分"), "portfolio watchlist seed must keep a detailed backup reason");
assert(portfolioSeedUpdates[0].reason.includes("召回定位：低位启动前夜候选"), "portfolio watchlist seed must preserve low-base launch-eve positioning in backup reason");
assert(portfolioSeedUpdates[0].candidateRole.includes("低位启动前夜观察"), "low-base launch-eve seeds must be clearly labeled in the watchlist role");
assert(portfolioSeedUpdates[0].reason.includes("待净值下钻确认"), "portfolio watchlist seed must say unverified ranking recalls are only watch candidates");
assert(portfolioSeedUpdates[0].setupEvidence.length > 0, "portfolio watchlist seed must include setup evidence");
assert(portfolioSeedUpdates[0].setupEvidence.some((item) => item.includes("低位启动前夜候选")), "portfolio watchlist seed must keep launch-eve setup evidence");
assert(portfolioSeedUpdates[0].buyTriggers.length > 0, "portfolio watchlist seed must include buy triggers");
assert(portfolioSeedUpdates[0].riskNotes.length > 0, "portfolio watchlist seed must include risk notes");
assert(portfolioSeedUpdates[0].feeNotes.length > 0, "portfolio watchlist seed must include fee/share-class notes");
assert(portfolioSeedUpdates[0].positionPlan.includes("启动前夜观察池"), "low-base launch-eve seeds must get a stricter pre-buy observation plan");
assert.equal(portfolioSeedUpdates[0].priority, 3, "low-base launch-eve seeds should enter the actionable watch queue ahead of generic waiting candidates");
const verifiedSeedProfile = {
  ok: true,
  code: "000010",
  name: "中证A500ETF联接C",
  snapshotDate: "2026-05-19",
  unitNav: 1.234,
  trendProfile: {
    ok: true,
    pullbackSetup: { signal: "pullback_complete", score: 78 },
    trendLabel: "pullback_complete",
    entryBias: "buyable_now",
    return5dPct: 1.2,
    return10dPct: 2.4,
    return20dPct: 4.8,
    return60dPct: 7.6,
    lowPositionPct120: 42.4,
    drawdownFromRecentHighPct: -7.1
  },
  actionability: { action: "staged_buy", score: 73 },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { label: "C类：通常无申购费，销售服务费按年计提" },
    feeImpact: { oneYearCostPer10000: 42 }
  },
  sources: ["https://fund.eastmoney.com/000010.html"]
};
const weeklyWatchlistSeed = portfolioWatchlistSeeds.find((item) => item.code === "000010");
assert(weeklyWatchlistSeed, "portfolio watchlist seed selection must still keep generic weekly-turn candidates after low-base candidates");
const verifiedSeedUpdates = manager.buildPortfolioWatchlistUpdatesFromSeedCandidates([
  { ...weeklyWatchlistSeed, portfolioWatchlistSeedScore: 72 }
], { profiles: [verifiedSeedProfile] });
assert.equal(verifiedSeedUpdates[0].status, "ready", "verified low-position pullback seed can become ready");
assert(verifiedSeedUpdates[0].reason.includes("已用净值下钻验证"), "ready seed must explain that NAV trend verification passed");
assert(verifiedSeedUpdates[0].setupEvidence.some((item) => item.includes("净值验证")), "ready seed must include verified trend evidence");
assert(verifiedSeedUpdates[0].feeNotes.some((item) => item.includes("42")), "ready seed must keep fee impact evidence");
const readyWatchReadiness = manager.evaluatePortfolioWatchReadiness({ ...verifiedSeedUpdates[0], updatedAt: "2026-05-20" }, verifiedSeedProfile);
assert(readyWatchReadiness.score >= 85, "verified low-position ready watchlist candidates must show high buy-preparation readiness");
assert.equal(readyWatchReadiness.label, "买入准备充分", "high-readiness watchlist candidates must have a client-readable readiness label");
const unverifiedWatchReadiness = manager.evaluatePortfolioWatchReadiness(portfolioSeedUpdates[0]);
assert(unverifiedWatchReadiness.score < 35, "unverified watchlist seeds must show low readiness until NAV/trend evidence is available");
assert.equal(unverifiedWatchReadiness.label, "暂不买入", "low-readiness watchlist seeds must not sound buyable");
const hotVerifiedSeedProfile = {
  ok: true,
  code: "000011",
  name: "热门强势主题基金A",
  unitNav: 1.456,
  trendProfile: {
    ok: true,
    pullbackSetup: { signal: "none", score: 18 },
    trendLabel: "extended_uptrend",
    entryBias: "wait_pullback",
    return5dPct: 8.2,
    return10dPct: 16.4,
    return20dPct: 33.41,
    return60dPct: 36.64,
    lowPositionPct120: 93.2,
    drawdownFromRecentHighPct: -0.8
  },
  actionability: { action: "wait", score: 68 },
  fees: { shareClass: "A", shareClassFeeModel: { label: "A类：有申购费，适合较长持有期再比较" } },
  sources: ["https://fund.eastmoney.com/000011.html"]
};
const hotVerifiedSeedUpdates = manager.buildPortfolioWatchlistUpdatesFromSeedCandidates([
  { ...weeklyTurnSeed, code: "000011", name: "热门强势主题基金A", portfolioWatchlistSeedScore: 76 }
], { profiles: [hotVerifiedSeedProfile] });
assert.notEqual(hotVerifiedSeedUpdates[0].status, "ready", "verified extended uptrend seed must not be ready");
assert.equal(hotVerifiedSeedUpdates[0].status, "blocked", "verified extended uptrend seed should be blocked as chase risk");
assert(hotVerifiedSeedUpdates[0].riskNotes.some((item) => item.includes("拦截")), "blocked seed must explain chase-risk downrank");
assert(hotVerifiedSeedUpdates[0].setupEvidence.some((item) => item.includes("20日+33.41%")), "blocked seed must expose hot-return evidence");
const guardedHotWatchUpdate = manager.guardPortfolioWatchlistReadyUpdate({
  code: "000011",
  status: "ready",
  priority: 1,
  reason: "模型声称低位可买",
  riskNotes: [],
  dataBasis: []
}, hotVerifiedSeedProfile);
assert.equal(guardedHotWatchUpdate.status, "blocked", "watchlist write path must block model ready updates when verified trend is hot");
assert(guardedHotWatchUpdate.reason.includes("系统净值验证拦截"), "guarded hot watch update must explain the automatic block");
const guardedUnverifiedWatchUpdate = manager.guardPortfolioWatchlistReadyUpdate({
  code: "000012",
  status: "ready",
  priority: 1,
  reason: "模型声称可买",
  riskNotes: [],
  dataBasis: []
}, null);
assert.equal(guardedUnverifiedWatchUpdate.status, "waiting_pullback", "watchlist write path must downgrade ready updates without NAV verification");
assert(guardedUnverifiedWatchUpdate.reason.includes("系统净值验证降级"), "guarded unverified watch update must explain the automatic downgrade");
const answerWatchlistUpdates = manager.buildPortfolioWatchlistUpdatesFromAnswerProfiles([
  { ...verifiedSeedProfile, reportChartRole: "买入参考图" },
  { ...hotVerifiedSeedProfile, reportChartRole: "买入参考图" },
  {
    ...verifiedSeedProfile,
    code: "000012",
    name: "备选观察基金C",
    reportChartRole: "备选观察图"
  }
], { userText: setupQuery, source: "fund_recommendation_answer" });
assert.deepEqual(
  answerWatchlistUpdates.map((item) => [item.code, item.status]),
  [["000010", "ready"], ["000011", "blocked"], ["000012", "waiting_pullback"]],
  "answer chart candidates must be persisted as ready, blocked, or backup watchlist candidates according to verified trend evidence"
);
assert(answerWatchlistUpdates[0].reason.includes("基金推荐回答沉淀"), "answer-derived watchlist candidates must keep the recommendation-answer origin in the backup reason");
assert(answerWatchlistUpdates[0].reason.includes("观察缺口：低位启动条件暂已满足"), "ready answer-derived watchlist candidates must explain that the setup is ready but still needs the next NAV check");
assert(answerWatchlistUpdates[0].setupEvidence.some((item) => item.includes("回答角色：买入参考")), "answer-derived watchlist candidates must keep answer role evidence");
assert(answerWatchlistUpdates[2].candidateRole.includes("备选观察"), "backup answer candidates must remain backup/watch candidates instead of ready buys");
assert(answerWatchlistUpdates[2].reason.includes("回答定位为备选"), "backup answer-derived watchlist candidates must preserve why they are not immediately buyable");
assert(answerWatchlistUpdates[1].riskNotes.some((item) => item.includes("暂不买入")), "hot answer candidates must be blocked with an explicit no-buy risk note");
assert(answerWatchlistUpdates[1].riskNotes.some((item) => item.includes("观察缺口") && item.includes("近20日+33.41%偏热")), "blocked answer-derived watchlist candidates must preserve concrete missing setup and overheat gaps");
const screeningSelectedProfiles = manager.selectFundScreeningWatchlistProfiles([
  verifiedSeedProfile
], [
  "结论：可以分批买入，但只做卫星仓。",
  "000010 中证A500ETF联接C：回调完成、低位修复，C类费用适合短中期，下一次盘前复查。"
].join("\n"), "000010 可以买吗");
assert.equal(screeningSelectedProfiles.length, 1, "specific fund screening answers with action advice must produce watchlist candidates");
assert.equal(screeningSelectedProfiles[0].reportChartRole, "买入参考图", "positive screening candidates should be treated as buy-reference watchlist evidence");
const screeningWatchlistUpdates = manager.buildPortfolioWatchlistUpdatesFromAnswerProfiles(screeningSelectedProfiles, {
  userText: "000010 可以买吗",
  answerText: "000010 中证A500ETF联接C：可以分批买入，回调完成且低位修复。",
  source: "fund_screening_answer"
});
assert.equal(screeningWatchlistUpdates[0].source, "fund_screening_answer", "specific fund screening candidates must be traceable to screening answers");
assert(screeningWatchlistUpdates[0].reason.includes("具体基金分析沉淀"), "specific fund screening candidates must keep the screening-answer origin in the backup reason");
const rejectedScreeningWatchlistUpdates = manager.buildPortfolioWatchlistUpdatesFromAnswerProfiles([
  verifiedSeedProfile
], {
  userText: "000010 可以买吗",
  answerText: "000010 中证A500ETF联接C：暂不买入，不符合当前风控要求，先排除。",
  source: "fund_screening_answer"
});
assert.equal(rejectedScreeningWatchlistUpdates[0].status, "blocked", "answer context must prevent rejected screening funds from becoming ready watchlist buys");
assert(rejectedScreeningWatchlistUpdates[0].reason.includes("暂不买入/排除"), "rejected screening candidates must preserve the no-buy answer context");
const dailyRecheckUpdates = manager.buildPortfolioWatchlistRecheckUpdates([
  { code: "000010", name: "中证A500ETF联接C", status: "waiting_pullback", priority: 3, reason: "等低位启动确认", buyTriggers: ["温和转强"] },
  { code: "000011", name: "热门强势主题基金A", status: "ready", priority: 1, reason: "原本接近可买" }
], { profiles: [verifiedSeedProfile, hotVerifiedSeedProfile] });
assert.deepEqual(
  dailyRecheckUpdates.map((item) => [item.code, item.status]).sort((a, b) => a[0].localeCompare(b[0])),
  [["000010", "ready"], ["000011", "blocked"]],
  "daily decision recheck must upgrade verified low-position candidates and block newly hot ready candidates"
);
assert(dailyRecheckUpdates[0].reason.includes("系统每日复核自选池"), "daily watchlist recheck must leave a traceable reason");
const staleReadyProfile = {
  ...verifiedSeedProfile,
  snapshotDate: "2000-01-01",
  navDate: "2000-01-01"
};
const staleWatchFreshness = manager.evaluatePortfolioWatchlistFreshness(
  { code: "000010", status: "ready", updatedAt: "2000-01-01T00:00:00.000Z" },
  staleReadyProfile
);
assert.equal(staleWatchFreshness.ok, false, "ready watchlist candidates must fail freshness checks when NAV evidence is stale");
assert(staleWatchFreshness.issues.some((item) => item.includes("净值快照已过期")), "stale watchlist candidates must expose expired NAV evidence");
const staleReadyRecheck = manager.buildPortfolioWatchlistRecheckUpdates([
  {
    code: "000010",
    name: "中证A500ETF联接C",
    status: "ready",
    priority: 1,
    reason: "旧的接近可买候选",
    updatedAt: "2000-01-01T00:00:00.000Z",
    lastSnapshot: staleReadyProfile
  }
], { profiles: [] });
assert.equal(staleReadyRecheck[0].status, "waiting_pullback", "stale ready candidates must be downgraded until fresh NAV evidence is fetched");
assert(staleReadyRecheck[0].reason.includes("系统时效复核"), "stale watchlist downgrade must explain the freshness guard");
assert(staleReadyRecheck[0].dataBasis.includes("来源：watchlist_freshness_guard"), "stale watchlist downgrade must leave a traceable source");
const staleGuardedReadyUpdate = manager.guardPortfolioWatchlistReadyUpdate({
  code: "000010",
  status: "ready",
  priority: 1,
  reason: "模型声称旧候选仍可买"
}, staleReadyProfile, { updatedAt: "2000-01-01T00:00:00.000Z" });
assert.equal(staleGuardedReadyUpdate.status, "waiting_pullback", "watchlist write path must not mark stale NAV evidence as ready");
assert(staleGuardedReadyUpdate.reason.includes("系统时效验证降级"), "stale ready write downgrade must be visible in the saved reason");
const readinessQueue = manager.buildPortfolioDecisionReadinessQueue([
  { code: "000010", name: "中证A500ETF联接C", status: "ready", priority: 1, reason: "低位回调", buyTriggers: ["温和转强"], riskNotes: ["不追涨"] }
], [verifiedSeedProfile]);
assert.equal(readinessQueue[0].firstTrigger, "温和转强", "portfolio decision prompt must expose ready candidate triggers");
assert(readinessQueue[0].readinessScore >= 85, "portfolio decision prompt must expose deterministic buy-preparation readiness scores");
assert.equal(readinessQueue[0].readinessLabel, "买入准备充分", "portfolio decision prompt must expose readable readiness labels");
assert(readinessQueue[0].readinessGaps.some((item) => item.includes("低位/启动/刚转强/不过热/费用条件已满足")), "portfolio decision prompt must expose remaining buy-readiness gaps or confirmation status");
const fallbackReadyActions = manager.buildPortfolioReadyWatchlistReviewActions([
  { code: "000010", name: "中证A500ETF联接C", status: "ready", priority: 1, reason: "低位回调", buyTriggers: ["温和转强"], riskNotes: ["不追涨"], feeNotes: ["C类短期更合适"] }
], [], { profiles: [verifiedSeedProfile] });
assert.equal(fallbackReadyActions[0].action, "WATCH", "ready watchlist fallback must review omitted candidates without forcing an automatic buy");
assert(fallbackReadyActions[0].reason.includes("未被模型逐项评估"), "ready watchlist fallback must explain why the review action was added");
const reviewedDecision = manager.ensurePortfolioReadyWatchlistReviewed({ actions: [], watchlistUpdates: [], learningNotes: [], sources: [] }, [
  { code: "000010", name: "中证A500ETF联接C", status: "ready", priority: 1, reason: "低位回调" }
], { profiles: [verifiedSeedProfile] });
assert(reviewedDecision.actions.some((item) => item.code === "000010"), "portfolio decision must not silently omit ready watchlist candidates");
const heldPosition = { code: "000011", name: "热门强势主题基金A", currentValue: 6000, weightPct: 6, unrealizedPnlPct: 12.4 };
const heldReviewQueue = manager.buildPortfolioHeldPositionReviewQueue([heldPosition], [hotVerifiedSeedProfile]);
assert.equal(heldReviewQueue[0].code, "000011", "portfolio decision prompt must expose held positions for mandatory review");
assert(heldReviewQueue[0].riskReview.some((item) => item.includes("偏热") || item.includes("止盈")), "held position review queue must expose hot-position risk review");
const heldFallbackActions = manager.buildPortfolioHeldPositionReviewActions([heldPosition], [], { profiles: [hotVerifiedSeedProfile] });
assert.equal(heldFallbackActions[0].action, "HOLD", "held position fallback must review omitted holdings without forcing an automatic sell");
assert(heldFallbackActions[0].dataBasis.includes("来源：held_position_review_fallback"), "held position fallback must leave a traceable source");
assert(/止盈|降仓|减仓/.test(heldFallbackActions[0].riskControl), "held position fallback must carry a concrete reduce/profit-control trigger");
const reviewedHeldDecision = manager.ensurePortfolioHeldPositionsReviewed({ actions: [], watchlistUpdates: [], learningNotes: [], sources: [] }, [
  heldPosition
], { profiles: [hotVerifiedSeedProfile] });
assert(reviewedHeldDecision.actions.some((item) => item.code === "000011"), "portfolio decision must not silently omit existing holdings");
assert(reviewedHeldDecision.sources.includes("held_position_review_fallback"), "held position fallback must be traceable in decision sources");
assert.equal(
  manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000010" }, verifiedSeedProfile).ok,
  true,
  "portfolio buy discipline should allow verified low-position ready candidates"
);
const hotBuyGuard = manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000011" }, hotVerifiedSeedProfile);
assert.equal(hotBuyGuard.ok, false, "portfolio buy discipline must block verified chase-risk buys");
assert(hotBuyGuard.reason.includes("系统买入纪律拦截"), "blocked portfolio buy must explain the execution-layer guard");
const enforcedHotBuy = manager.enforcePortfolioBuyDiscipline([
  { action: "BUY", code: "000011", name: "热门强势主题基金A", amount: 1000, reason: "模型想买" }
], [hotVerifiedSeedProfile]);
assert.equal(enforcedHotBuy[0].action, "WATCH", "execution guard must convert chase-risk BUY actions into WATCH");
assert.equal(enforcedHotBuy[0].amount, 0, "execution guard must zero out blocked buy amounts");
assert(enforcedHotBuy[0].dataBasis.includes("来源：portfolio_buy_discipline_guard"), "execution guard must leave a traceable data source");
assert.equal(
  manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000099" }, null).ok,
  false,
  "portfolio buy discipline must block buys without enriched trend profiles"
);
const midPositionBuyGuard = manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000010" }, {
  ...verifiedSeedProfile,
  trendProfile: {
    ...verifiedSeedProfile.trendProfile,
    lowPositionPct120: 72.5,
    drawdownFromRecentHighPct: -2.4
  }
});
assert.equal(midPositionBuyGuard.ok, false, "portfolio buy discipline must block buys that are not actually low-position setups");
assert(midPositionBuyGuard.reason.includes("低位证据"), "mid-position buy block must explain the missing low-position evidence");
const noLaunchSignalBuyGuard = manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000010" }, {
  ...verifiedSeedProfile,
  trendProfile: {
    ...verifiedSeedProfile.trendProfile,
    pullbackSetup: { signal: "none", score: 34 },
    trendLabel: "uptrend"
  }
});
assert.equal(noLaunchSignalBuyGuard.ok, false, "portfolio buy discipline must require pullback-complete or launch-setup evidence before buying");
assert(noLaunchSignalBuyGuard.reason.includes("启动前夜"), "missing setup signal block must explain the launch evidence requirement");
const noEarlyTurnProfile = {
  ...verifiedSeedProfile,
  trendProfile: {
    ...verifiedSeedProfile.trendProfile,
    return5dPct: -0.8,
    return10dPct: 0.2,
    return20dPct: 4.2
  }
};
const noEarlyTurnBuyGuard = manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000010" }, noEarlyTurnProfile);
assert.equal(noEarlyTurnBuyGuard.ok, false, "portfolio buy discipline must block low-position pullbacks that have not started turning up");
assert(noEarlyTurnBuyGuard.reason.includes("5日/10日刚转强"), "missing early-turn block must explain the 5/10-day turn requirement");
assert(
  manager.buildPortfolioWatchReadinessGaps({ code: "000010", status: "ready" }, noEarlyTurnProfile).some((item) => item.includes("5日/10日刚转强")),
  "watchlist readiness gaps must expose missing early-turn evidence before buying"
);
const missingFeeProfile = {
  ...verifiedSeedProfile,
  fees: {
    shareClass: "C",
    shareClassFeeModel: { type: "likely_sales_service_fee", label: "C类：通常需重点核对销售服务费" },
    feeImpact: { missingFeeData: ["sales_service_fee"], oneYearCostPer10000: null }
  }
};
const missingFeeBuyGuard = manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000010" }, missingFeeProfile);
assert.equal(missingFeeBuyGuard.ok, false, "portfolio buy discipline must block buys without verified share-class fee evidence");
assert(missingFeeBuyGuard.reason.includes("费用/份额证据"), "missing fee evidence block must explain the fee/share-class requirement");
assert(
  manager.buildPortfolioWatchReadinessGaps({ code: "000010", status: "ready" }, missingFeeProfile).some((item) => item.includes("费用/份额")),
  "watchlist readiness gaps must expose missing fee/share-class evidence before buying"
);
const duplicateExposureBuyGuard = manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000010" }, verifiedSeedProfile, [
  { code: "000099", name: "南方中证A500ETF联接C", currentValue: 7000 }
]);
assert.equal(duplicateExposureBuyGuard.ok, false, "portfolio buy discipline must block buying a duplicate same-index exposure through another fund");
assert(duplicateExposureBuyGuard.reason.includes("同一指数/同主题"), "duplicate exposure buy block must explain the exposure overlap");
const enforcedDuplicateExposureBuy = manager.enforcePortfolioBuyDiscipline([
  { action: "BUY", code: "000010", name: "中证A500ETF联接C", amount: 2000, reason: "模型想买同指数另一只" }
], [verifiedSeedProfile], [
  { code: "000099", name: "南方中证A500ETF联接C", currentValue: 7000 }
]);
assert.equal(enforcedDuplicateExposureBuy[0].action, "WATCH", "execution guard must convert duplicate exposure BUY actions into WATCH");
assert(enforcedDuplicateExposureBuy[0].dataBasis.includes("来源：portfolio_buy_discipline_guard"), "duplicate exposure buy guard must leave a traceable source");
const oversizedBuyAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 100000,
  cash: 90000,
  positions: []
}, { action: "BUY", code: "000010", amount: 50000, targetWeightPct: 50 }, "BUY");
assert.equal(oversizedBuyAmount, 4000, "portfolio buy sizing must cap a single order to the staged-entry weight limit");
const nearSingleFundCapAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 100000,
  cash: 90000,
  positions: [{ code: "000010", currentValue: 5800 }]
}, { action: "BUY", code: "000010", amount: 50000, targetWeightPct: 50 }, "BUY");
assert.equal(nearSingleFundCapAmount, 200, "portfolio buy sizing must not exceed the single-fund exposure cap");
const cashReserveAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 100000,
  cash: 22000,
  positions: []
}, { action: "BUY", code: "000010", amount: 5000, targetWeightPct: 5 }, "BUY");
assert.equal(cashReserveAmount, 2000, "portfolio buy sizing must preserve the configured cash reserve before buying");
const sameExposureCapAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 100000,
  cash: 90000,
  positions: [{ code: "000099", name: "南方中证A500ETF联接C", currentValue: 7000 }]
}, { action: "BUY", code: "000010", amount: 5000, targetWeightPct: 5 }, "BUY", null, verifiedSeedProfile);
assert.equal(sameExposureCapAmount, 1000, "portfolio buy sizing must cap the aggregate same-index exposure before creating orders");
const noRiskSellGuard = manager.evaluatePortfolioSellDiscipline(
  { action: "SELL", code: "000010", amount: 3000, reason: "模型想卖出" },
  verifiedSeedProfile,
  { code: "000010", name: "中证A500ETF联接C", currentValue: 6000, weightPct: 6, unrealizedPnlPct: 3.2 }
);
assert.equal(noRiskSellGuard.ok, false, "portfolio sell discipline must block sells without risk or profit-control evidence");
assert(noRiskSellGuard.reason.includes("系统卖出纪律拦截"), "blocked portfolio sell must explain the execution-layer guard");
const enforcedNoRiskSell = manager.enforcePortfolioSellDiscipline([
  { action: "SELL", code: "000010", name: "中证A500ETF联接C", amount: 3000, reason: "模型想卖出" }
], [verifiedSeedProfile], [
  { code: "000010", name: "中证A500ETF联接C", currentValue: 6000, weightPct: 6, unrealizedPnlPct: 3.2 }
]);
assert.equal(enforcedNoRiskSell[0].action, "HOLD", "execution guard must convert unsupported SELL actions into HOLD");
assert.equal(enforcedNoRiskSell[0].amount, 0, "execution guard must zero out blocked sell amounts");
assert(enforcedNoRiskSell[0].dataBasis.includes("来源：portfolio_sell_discipline_guard"), "sell guard must leave a traceable data source");
const hotSellGuard = manager.evaluatePortfolioSellDiscipline(
  { action: "SELL", code: "000011", amount: 6000, reason: "止盈减仓，防止利润回吐" },
  hotVerifiedSeedProfile,
  heldPosition
);
assert.equal(hotSellGuard.ok, true, "portfolio sell discipline should allow staged profit-control sells for verified hot holdings");
assert(/止盈|偏热|回撤/.test(hotSellGuard.reason), "allowed sell must explain the verified reduce reason");
const oversizedSellAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 100000,
  cash: 50000,
  positions: [{ code: "000011", currentValue: 8000 }]
}, { action: "SELL", code: "000011", amount: 8000, targetWeightPct: 0, reason: "止盈减仓" }, "SELL", { code: "000011", currentValue: 8000 });
assert.equal(oversizedSellAmount, 4000, "portfolio sell sizing must cap normal profit-taking to a staged percentage of the position");
const severeSellAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 100000,
  cash: 50000,
  positions: [{ code: "000011", currentValue: 8000 }]
}, { action: "SELL", code: "000011", amount: 8000, targetWeightPct: 0, reason: "趋势破位止损" }, "SELL", { code: "000011", currentValue: 8000 });
assert.equal(severeSellAmount, 6400, "portfolio sell sizing may reduce more aggressively for verified severe risk while still avoiding blind full liquidation");

const setupDigest = {
  ok: true,
  trendProfile: {
    pullbackSetup: { signal: "pullback_complete", score: 76 },
    trendLabel: "pullback_complete",
    entryBias: "buyable_now",
    return5dPct: 1.4,
    return10dPct: 2.8,
    return20dPct: 4.5,
    return60dPct: 6.2,
    lowPositionPct120: 38.5,
    drawdownFromRecentHighPct: -7.4
  },
  actionability: { score: 74 },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { label: "C类：通常无申购费，销售服务费按年计提" }
  }
};
const setupDigestSecond = {
  ok: true,
  trendProfile: {
    pullbackSetup: { signal: "launch_setup", score: 68 },
    trendLabel: "launch_setup",
    entryBias: "staged_buy",
    return5dPct: 1.1,
    return10dPct: 2.2,
    return20dPct: 3.8,
    return60dPct: 4.9,
    lowPositionPct120: 34.2,
    drawdownFromRecentHighPct: -6.2
  },
  actionability: { score: 69 },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { label: "C类：通常无申购费，销售服务费按年计提" }
  }
};
const hotDigest = {
  ok: true,
  trendProfile: {
    pullbackSetup: { signal: "none", score: 18 },
    trendLabel: "extended_uptrend",
    entryBias: "wait_pullback",
    return20dPct: 33.41,
    return60dPct: 36.64,
    drawdownFromRecentHighPct: -0.8
  },
  actionability: { score: 68 }
};
const highPositionPullbackDigest = {
  ok: true,
  trendProfile: {
    pullbackSetup: { signal: "pullback_complete", score: 78 },
    trendLabel: "pullback_complete",
    entryBias: "buyable_now",
    return5dPct: 1.6,
    return10dPct: 3.2,
    return20dPct: 5.8,
    return60dPct: 9.4,
    lowPositionPct120: 74.5,
    drawdownFromRecentHighPct: -3.4
  },
  actionability: { score: 76 },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { label: "C类：通常无申购费，销售服务费按年计提" }
  }
};
const highYtdPullbackDigest = {
  ...setupDigest,
  seed: {
    thisYearPct: 52.4,
    keywords: ["近1周低位转强候选"]
  }
};
const stalePullbackDigest = {
  ...setupDigest,
  trendProfile: {
    ...setupDigest.trendProfile,
    latestDate: "2000-01-01"
  }
};
const missingLowPositionDigest = {
  ok: true,
  trendProfile: {
    pullbackSetup: { signal: "pullback_complete", score: 72 },
    trendLabel: "pullback_complete",
    entryBias: "buyable_now",
    return5dPct: 1.5,
    return10dPct: 2.9,
    return20dPct: 4.8,
    return60dPct: 8.8,
    lowPositionPct120: null,
    drawdownFromRecentHighPct: -3.2
  },
  actionability: { score: 72 },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { label: "C类：通常无申购费，销售服务费按年计提" }
  }
};
const noEarlyTurnPullbackDigest = {
  ...setupDigest,
  trendProfile: {
    ...setupDigest.trendProfile,
    pullbackSetup: { signal: "pullback_complete", score: 76 },
    return5dPct: -0.8,
    return10dPct: 0.2,
    return20dPct: 4.2,
    return60dPct: 6.8
  }
};
assert(
  manager.scoreResearchDigestForPullbackSetup(setupDigest) >
    manager.scoreResearchDigestForPullbackSetup(hotDigest),
  "deep-dive scoring must rank pullback-complete candidates above extended uptrends"
);
assert(
  manager.scoreResearchDigestForPullbackSetup(setupDigest) >
    manager.scoreResearchDigestForPullbackSetup(highPositionPullbackDigest),
  "deep-dive scoring must prefer genuinely low-position pullbacks over mid/high-position repaired funds"
);
assert(
  manager.scoreResearchDigestForPullbackSetup(setupDigest) >
    manager.scoreResearchDigestForPullbackSetup(missingLowPositionDigest),
  "deep-dive scoring must not treat missing low-position data as zero-percent low-position evidence"
);
assert(
  manager.scoreResearchDigestForPullbackSetup(setupDigest) >
    manager.scoreResearchDigestForPullbackSetup(noEarlyTurnPullbackDigest),
  "deep-dive scoring must prefer pullbacks with 5/10-day early-turn evidence over low but not-yet-launching funds"
);
assert(
  manager.scoreResearchDigestForPullbackSetup(setupDigest) >
    manager.scoreResearchDigestForPullbackSetup(highYtdPullbackDigest),
  "deep-dive scoring must downgrade year-to-date high pullbacks that only look low in short windows"
);
assert(
  manager.scoreResearchDigestForPullbackSetup(setupDigest) >
    manager.scoreResearchDigestForPullbackSetup(stalePullbackDigest),
  "deep-dive scoring must downgrade stale NAV/trend evidence before treating a setup as actionable"
);
const highPositionSummary = manager.buildMarketDeepDiveSummary({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  candidates: [
    { ...setupDigest, code: "000001", name: "低位修复基金A" },
    { ...highPositionPullbackDigest, code: "000004", name: "位置偏高修复基金C" },
    { ...missingLowPositionDigest, code: "000005", name: "低位缺失修复基金C" },
    { ...noEarlyTurnPullbackDigest, code: "000006", name: "未启动修复基金C" },
    { ...highYtdPullbackDigest, code: "000007", name: "年内高位修复基金C" },
    { ...stalePullbackDigest, code: "000008", name: "旧净值修复基金C" }
  ]
});
assert(highPositionSummary.includes("mainCandidateCodes=000001"), "genuinely low-position setup should remain a main candidate");
assert(/watchOrRejectCodes=.*000004/.test(highPositionSummary), "pullback-looking but high-position fund must be demoted to watch/reject");
assert(/watchOrRejectCodes=.*000005/.test(highPositionSummary), "pullback-looking fund with missing low-position evidence must be visible only as watch/reject");
assert(/watchOrRejectCodes=.*000006/.test(highPositionSummary), "pullback-looking fund without 5/10-day early turn must be visible only as watch/reject");
assert(/watchOrRejectCodes=.*000007/.test(highPositionSummary), "year-to-date high pullback-looking fund must be demoted to watch/reject");
assert(/watchOrRejectCodes=.*000008/.test(highPositionSummary), "stale pullback-looking fund must be demoted to watch/reject");
assert(highPositionSummary.includes("今年以来=52.4%"), "deep-dive summary must expose year-to-date position evidence for pullback candidates");
assert(highPositionSummary.includes("今年以来+52.4%偏高"), "deep-dive summary must explain when a candidate is not truly low because year-to-date return is high");
assert(highPositionSummary.includes("净值日期=2000-01-01"), "deep-dive summary must expose stale NAV/trend evidence dates");
assert(highPositionSummary.includes("净值走势已过期"), "deep-dive summary must explain stale trend evidence before buying");
const rotationSupportedDigest = {
  ...setupDigest,
  code: "000021",
  name: "低位轮动修复基金C",
  seed: {
    matchedThemes: [{
      id: "medicine",
      name: "医药",
      stage: "low_position_rotation",
      positionSignal: "low_position_rotation",
      rotationScore: 58,
      lowPositionScore: 62,
      crowdingScore: 18,
      forwardScore: 46
    }]
  }
};
const crowdedThemeDigest = {
  ...setupDigest,
  code: "000022",
  name: "拥挤主题修复基金C",
  seed: {
    matchedThemes: [{
      id: "precious_metals",
      name: "贵金属",
      stage: "crowded",
      positionSignal: "high_chase_risk",
      rotationScore: 22,
      lowPositionScore: 12,
      crowdingScore: 72,
      forwardScore: 40
    }]
  }
};
assert(
  manager.scoreResearchDigestForPullbackSetup(rotationSupportedDigest) >
    manager.scoreResearchDigestForPullbackSetup(setupDigest),
  "deep-dive scoring must reward pullback candidates backed by low-position sector rotation"
);
assert(
  manager.scoreResearchDigestForPullbackSetup(crowdedThemeDigest) <
    manager.scoreResearchDigestForPullbackSetup(setupDigest),
  "deep-dive scoring must downgrade pullback-looking funds in crowded/high-chase themes"
);
const rotationSummary = manager.buildMarketDeepDiveSummary({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  candidates: [rotationSupportedDigest, crowdedThemeDigest]
});
assert(rotationSummary.includes("mainCandidateCodes=000021"), "low-position rotation candidate should remain eligible for main pullback recommendations");
assert(rotationSummary.includes("watchOrRejectCodes=000022"), "crowded/high-chase theme candidate should be demoted to watch/reject even if fund trend looks repaired");
assert(rotationSummary.includes("题材=医药/低位轮动"), "deep-dive summary should expose sector rotation evidence for the manager");
const earlyTurnTrend = manager.computeTrendProfile(buildEarlyTurnNavPoints());
assert.equal(earlyTurnTrend.ok, true, "early-turn synthetic series should produce a trend profile");
assert(
  ["pullback_complete", "launch_setup"].includes(earlyTurnTrend.pullbackSetup.signal),
  "5/10-day early turn from a low 120-day position must count as a pullback/setup signal"
);
assert.notEqual(earlyTurnTrend.entryBias, "wait_pullback", "early low-position turn should not be treated as a wait-for-pullback chase");
assert(Number(earlyTurnTrend.lowPositionPct120) <= 55, "early low-position turn should expose 120-day low-position evidence");
assert(
  (earlyTurnTrend.pullbackSetup.evidence || []).some((item) => item.includes("5日/10日刚转强")),
  "pullback setup evidence must include early 5/10-day turn information"
);
assert(
  manager.scoreResearchDigestForPullbackSetup({ ok: true, trendProfile: earlyTurnTrend, actionability: { score: 66 } }) >
    manager.scoreResearchDigestForPullbackSetup(hotDigest),
  "deep-dive scoring must rank early low-position turns above recent-surge candidates"
);

const stiffAnswer = "信心：高。\n建议分批买入，先用10%仓位，依据是近20日收益4.5%、距高点回撤7%。";
const quality = manager.evaluateFundAnswerQuality({
  text: stiffAnswer,
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: { marketDeepDive: { candidates: [setupDigest] } }
});
assert(quality.issues.includes("stiff_confidence_label"), "quality gate must reject stiff confidence labels");
assert(
  manager.normalizeUserFacingFundAnswer(stiffAnswer).includes("我对这条判断把握度较高"),
  "localization pass must rewrite stiff confidence labels into natural Chinese"
);
const stiffConfidenceAlias = manager.evaluateFundAnswerQuality({
  text: "把握度：高。\n建议先观察回调确认，不追涨。",
  workflow: "fund_qa",
  userText: "黄金最近值得买吗",
  evidence: { marketDeepDive: { candidates: [setupDigest] } }
});
assert(stiffConfidenceAlias.issues.includes("stiff_confidence_label"), "quality gate must reject translated-but-stiff confidence labels");
assert(
  manager.normalizeUserFacingFundAnswer("把握度：高。").includes("我对这条判断把握度较高"),
  "localization pass must rewrite translated confidence labels into natural Chinese"
);

const leakQuality = manager.evaluateFundAnswerQuality({
  text: "趋势/动作：extended_uptrend，actionability 为 tactical only / staged_buy，但 entryBias 是 wait_pullback。",
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: { marketDeepDive: { candidates: [hotDigest] } }
});
assert(leakQuality.issues.includes("internal_signal_leak"), "quality gate must reject internal enum leaks");

const englishActionQuality = manager.evaluateFundAnswerQuality({
  text: "Verdict: buy. Confidence: high. Score: 82/100. 新资金先买1000元。",
  workflow: "fund_qa",
  userText: "黄金最近值得买吗",
  evidence: { marketDeepDive: { candidates: [setupDigest] } }
});
assert(englishActionQuality.issues.includes("raw_english_action_leak"), "quality gate must reject raw English action labels");
const localizedEnglishAction = manager.normalizeUserFacingFundAnswer("Verdict: staged buy. Confidence: high. Score: 82/100.");
assert(localizedEnglishAction.includes("结论：分批买入"), "localization pass must translate Verdict/staged buy");
assert(!/\b(?:Verdict|Confidence|Score|staged buy|buy|wait|avoid)\b/i.test(localizedEnglishAction), "localized answer must not keep raw English action labels");
assert(!serverSource.includes("buy/staged/wait/avoid"), "fund QA prompt must not ask for raw English action labels");
const englishSectionQuality = manager.evaluateFundAnswerQuality({
  text: [
    "Manager Decision：建议先观察，暂不买。",
    "Evidence：近20日+4.5%，120日位置38.5%。",
    "Missing data：还需要复查最新净值。"
  ].join("\n"),
  workflow: "fund_screening",
  userText: "这个基金能买吗",
  evidence: { enrichments: [{ code: "000001", trendProfile: { ok: true } }] }
});
assert(englishSectionQuality.issues.includes("raw_english_section_leak"), "quality gate must reject English section headers in user-facing fund answers");
const localizedEnglishSections = manager.normalizeUserFacingFundAnswer("Manager Decision: wait. Evidence: 120日位置38.5%。Missing data to check: 最新净值。");
assert(localizedEnglishSections.includes("经理最终判断：等待"), "localized answer must translate Manager Decision and action text");
assert(localizedEnglishSections.includes("证据：120日位置38.5%"), "localized answer must translate Evidence headers");
assert(localizedEnglishSections.includes("缺失数据：最新净值"), "localized answer must translate Missing data headers");
assert(!/\b(?:Manager Decision|Evidence|Missing data|wait)\b/i.test(localizedEnglishSections), "localized answer must not keep raw English section headers");

const png = manager.renderFundReportSummaryPng({
  profile: buildChartProfile(),
  width: 1280,
  height: 760
});
assert(Buffer.isBuffer(png), "summary chart renderer must return a PNG buffer");
assert.equal(png.slice(0, 8).toString("hex"), "89504e470d0a1a0a", "summary chart must be a PNG");
assert.equal(png.readUInt32BE(16), 1280, "summary chart width must match requested width");
assert.equal(png.readUInt32BE(20), 760, "summary chart height must match requested height");
assert(png.length > 12000, "summary chart should contain dense report-card evidence, not only a sparse legacy line");
assert(serverSource.includes("sanitizeChartText"), "summary chart renderer must sanitize non-ASCII labels before bitmap drawing");
assert(serverSource.includes("drawTextFit"), "summary chart renderer must fit large metric labels instead of shrinking them into QR-like bitmap text");
assert(serverSource.includes("REPORT_CHART_MIN_TEXT_SCALE = 3"), "summary chart must keep thumbnail-safe minimum text scale");
assert(serverSource.includes("showAxisLabels: false"), "summary chart must hide dense axis tick text in Feishu thumbnails");
for (const label of ["FUND", "NAV", "RANGE", "RET", "BUY/FEE", "ENTRY", "SIG", "LOW", "ACT", "CLASS", "FEE", "SHRP", "YRET", "SIZE"]) {
  assert(serverSource.includes(label), `summary chart must use readable compact label: ${label}`);
}
for (const staleLabel of ["FUND SETUP", "NAV TREND", "DRAWDOWN FROM HIGH", "STAGE RETURN", "SETUP / RISK", "PULLBK", "FEEY", "20D", "60D", "120D", "250D"]) {
  assert(!serverSource.includes(staleLabel), `summary chart should not expose stale English label: ${staleLabel}`);
}
assert(!/drawText\([^)]*[\u4e00-\u9fff]/.test(serverSource), "chart renderer must not draw tiny bitmap Chinese text inside PNGs");
assert(!/drawText\([^;\n]*,\s*1\)/.test(serverSource), "summary chart must not use scale-1 bitmap text that becomes QR-like in Feishu thumbnails");
const tinyFontSource = serverSource.slice(serverSource.indexOf("const TINY_FONT"), serverSource.indexOf("function encodePngRgba"));
assert(!/[\u4e00-\u9fff]/.test(tinyFontSource), "tiny chart font must not keep Chinese bitmap glyphs that render like QR codes");
assert(!/drawYAxisTickLabels\([^;\n]*["'][\u4e00-\u9fff]/.test(serverSource), "summary chart must not use Chinese axis labels in bitmap text");

const selectedChartProfiles = manager.selectFundReportProfilesForAnswer([
  { code: "000001", name: "低位修复基金A", trendProfile: { series: [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.01 }] } },
  { code: "000002", name: "启动前夜基金C", trendProfile: { series: [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.02 }] } },
  { code: "000003", name: "追涨观察基金A", trendProfile: { series: [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.03 }] } },
  { code: "000004", name: "备选回踩基金C", trendProfile: { series: [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.015 }] } }
], [
  "推荐清单：",
  "1. 000001 低位修复基金A：回调完成，可分批。",
  "2. 000002 启动前夜基金C：低位修复，适合小仓位。",
  "备选观察：",
  "000004 备选回踩基金C：等待回调，回踩确认后可关注，满足触发再评估。",
  "观察名单：",
  "000003 追涨观察基金A：短期偏热，只观察，不作为主推荐。"
].join("\n"));
const selectedChartCodes = selectedChartProfiles.map((profile) => profile.code);
assert.deepEqual(
  selectedChartCodes,
  ["000001", "000002", "000004"],
  "report images must cover buy candidates and qualified backup candidates while excluding watch/reject candidates"
);
assert.equal(
  selectedChartProfiles.find((profile) => profile.code === "000004")?.reportChartRole,
  "备选观察图",
  "backup report images must be labeled as backup/watch evidence instead of buy-only charts"
);
const chartSeries = [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.01 }];
const expandedChartUniverse = [
  { ...setupDigest, code: "000001", name: "低位修复基金A", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } },
  { ...setupDigestSecond, code: "000002", name: "启动前夜基金C", trendProfile: { ...setupDigestSecond.trendProfile, series: chartSeries } },
  { ...hotDigest, code: "000003", name: "追涨观察基金A", trendProfile: { ...hotDigest.trendProfile, series: chartSeries } },
  { ...setupDigestSecond, code: "000004", name: "备选回踩基金C", reportChartRole: "备选观察图", trendProfile: { ...setupDigestSecond.trendProfile, series: chartSeries } },
  { ...setupDigest, code: "000005", name: "轮动低位基金C", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } },
  { ...setupDigestSecond, code: "000006", name: "低位观察基金C", reportChartRole: "备选观察图", trendProfile: { ...setupDigestSecond.trendProfile, series: chartSeries } },
  { ...setupDigest, code: "000007", name: "低位扩散基金C", reportChartRole: "备选观察图", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } },
  { ...setupDigestSecond, code: "000008", name: "费用占优基金C", reportChartRole: "备选观察图", trendProfile: { ...setupDigestSecond.trendProfile, series: chartSeries } },
  { ...setupDigest, code: "000009", name: "均衡低位基金A", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } },
  { ...setupDigestSecond, code: "000025", name: "低位确认基金C", reportChartRole: "备选观察图", trendProfile: { ...setupDigestSecond.trendProfile, series: chartSeries } },
  { ...setupDigest, code: "000026", name: "回调完成基金A", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } },
  { ...setupDigestSecond, code: "000027", name: "备选低位轮动基金C", reportChartRole: "备选观察图", trendProfile: { ...setupDigestSecond.trendProfile, series: chartSeries } },
  { ...setupDigest, code: "000028", name: "买入确认基金C", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } }
];
const expandedChartProfiles = manager.selectFundReportProfilesForAnswer(expandedChartUniverse, [
  "推荐清单：",
  "1. 000001 低位修复基金A：回调完成，可分批，配图看低位和费用。",
  "备选观察：",
  "000004 备选回踩基金C：等待触发，配图看回踩确认。"
].join("\n"), { minCount: 12, limit: 12 });
assert.equal(expandedChartProfiles.length, 12, "report image selector must expand sparse answers to a broad chart-backed set");
assert(expandedChartProfiles.some((profile) => profile.code === "000002"), "expanded report images should add qualified launch/setup candidates not only explicitly mentioned funds");
assert(expandedChartProfiles.some((profile) => profile.code === "000006" && profile.reportChartRole === "备选观察图"), "expanded report images should include qualified backup charts");
assert(expandedChartProfiles.some((profile) => profile.code === "000007" && profile.reportChartRole === "备选观察图"), "expanded report images should fill the richer backup chart set when evidence exists");
assert(expandedChartProfiles.some((profile) => profile.code === "000008" && profile.reportChartRole === "备选观察图"), "expanded report images should include a broad backup chart set when evidence exists");
assert(expandedChartProfiles.some((profile) => profile.code === "000009"), "expanded report images should include additional qualified buy-reference charts when evidence exists");
assert(expandedChartProfiles.some((profile) => profile.code === "000025" && profile.reportChartRole === "备选观察图"), "expanded report images should include enough backup charts for a richer visual set");
assert(expandedChartProfiles.some((profile) => profile.code === "000026"), "expanded report images should include enough buy-reference charts for a richer visual set");
assert(expandedChartProfiles.filter((profile) => profile.reportChartRole === "买入参考图").length >= 6, "expanded report images should keep enough buy-reference charts to explain buy decisions");
assert(expandedChartProfiles.filter((profile) => profile.reportChartRole === "备选观察图").length >= 6, "expanded report images should keep enough backup/watch charts to explain alternatives");
assert(!expandedChartProfiles.some((profile) => profile.code === "000003"), "expanded report images must not add hot chase-risk candidates as filler charts");
assert.equal(
  manager.getFundReportChartBackfillTarget({ userText: "按最近题材推荐几个基金", options: { forRecommendation: true } }),
  12,
  "recommendation deep dives should keep fetching enough candidates to support a broad chart set"
);
assert.equal(
  manager.getFundReportChartBackfillTarget({ userText: "讲讲基金费率概念", options: { forRecommendation: false } }),
  0,
  "non-action fund education answers should not force extra chart backfill work"
);
const chartBackfillBatch = manager.selectFundReportChartBackfillCandidates([
  { code: "000100", name: "中证500ETF联接A" },
  { code: "000101", name: "中证500ETF联接C" },
  { code: "000102", name: "中证1000ETF联接C" },
  { code: "000103", name: "创业板ETF联接C" }
], [
  { code: "000100", name: "中证500ETF联接A" }
], 2, { diversifyExposure: true });
assert.deepEqual(
  chartBackfillBatch.map((item) => item.code),
  ["000102", "000103"],
  "report-chart backfill should skip already tested products and fetch additional chart candidates"
);
const chartBackfillSummary = manager.buildMarketDeepDiveSummary({
  ok: true,
  focus: "market_recommendation",
  chartBackfillCodes: ["000102", "000103"],
  candidates: []
});
assert(chartBackfillSummary.includes("chartBackfillCodes=000102/000103"), "deep-dive summary must expose report-chart backfill codes when sparse images are repaired");
const previousReportImageLimit = process.env.FEISHU_REPORT_TREND_IMAGE_LIMIT;
const previousReportImageMin = process.env.FEISHU_REPORT_TREND_IMAGE_MIN;
process.env.FEISHU_REPORT_TREND_IMAGE_LIMIT = "3";
process.env.FEISHU_REPORT_TREND_IMAGE_MIN = "2";
assert.equal(manager.getFundReportChartLimit(), 12, "report image limit must not be configured below the rich chart floor");
assert.equal(manager.getFundReportChartMinCount(), 12, "report image minimum must not be configured back to two or three charts");
if (previousReportImageLimit === undefined) {
  delete process.env.FEISHU_REPORT_TREND_IMAGE_LIMIT;
} else {
  process.env.FEISHU_REPORT_TREND_IMAGE_LIMIT = previousReportImageLimit;
}
if (previousReportImageMin === undefined) {
  delete process.env.FEISHU_REPORT_TREND_IMAGE_MIN;
} else {
  process.env.FEISHU_REPORT_TREND_IMAGE_MIN = previousReportImageMin;
}
const sparseExplicitChartProfiles = manager.selectFundReportProfilesForAnswer([
  { ...setupDigest, code: "000098", name: "缺走势主推基金A" },
  { ...setupDigestSecond, code: "000099", name: "缺走势备选基金C", reportChartRole: "备选观察图" },
  ...expandedChartUniverse
], [
  "推荐清单：",
  "1. 000098 缺走势主推基金A：模型写了代码但没有走势序列。",
  "2. 000001 低位修复基金A：回调完成，可分批，配图看低位。",
  "备选观察：",
  "000099 缺走势备选基金C：模型写了备选但没有走势序列。"
].join("\n"), { minCount: 12, limit: 12 });
assert.equal(sparseExplicitChartProfiles.length, 12, "report image selector must fill missing chart slots when explicit answer codes have no trend series");
assert(!sparseExplicitChartProfiles.some((profile) => ["000098", "000099"].includes(profile.code)), "profiles without trend series must not occupy report image slots");
const thinChartCoverageQuality = manager.evaluateFundAnswerQuality({
  text: [
    "直接结论：可以分批买入，先用1000元。",
    "推荐清单：",
    "1. 000001 低位修复基金A：近20日4.5%，C类费用适合短中期，配图看低位修复。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: "按最近题材推荐几个基金",
  evidence: { marketDeepDive: { candidates: expandedChartUniverse } }
});
assert(thinChartCoverageQuality.issues.includes("insufficient_chart_linked_candidates"), "quality gate must reject answers that only support two or three report charts when more eligible candidates exist");
const guidedChartAnswer = manager.appendFundReportChartReadingGuide("直接结论：优先分批，备选继续等触发。", expandedChartProfiles);
assert(guidedChartAnswer.includes("配图阅读："), "final answer must append a chart reading guide when report images are attached");
assert(guidedChartAnswer.includes("本次配图共 12 张"), "chart reading guide must summarize how many charts support the answer");
assert(guidedChartAnswer.includes("买入参考图"), "chart reading guide must distinguish buy-reference charts");
assert(guidedChartAnswer.includes("备选观察图"), "chart reading guide must distinguish backup/watch charts");
assert(guidedChartAnswer.includes("用来确认是否适合分批买入"), "buy-reference chart guide must say how the chart supports a buy decision");
assert(guidedChartAnswer.includes("用来观察是否能从备选转入买点"), "backup chart guide must say how the chart supports a backup decision");
const previousCardImageChunkSize = process.env.FEISHU_CARD_IMAGE_CHUNK_SIZE;
delete process.env.FEISHU_CARD_IMAGE_CHUNK_SIZE;
assert.equal(manager.getFeishuCardImageChunkSize(), 4, "fund report image card chunks should keep each Feishu card readable");
const imageChunks = manager.splitFeishuCardImages(Array.from({ length: 12 }, (_, index) => ({ imageKey: `img_${index}` })));
assert.deepEqual(imageChunks.map((chunk) => chunk.length), [4, 4, 4], "fund report images should be split into supplemental cards instead of crowding one card");
if (previousCardImageChunkSize === undefined) {
  delete process.env.FEISHU_CARD_IMAGE_CHUNK_SIZE;
} else {
  process.env.FEISHU_CARD_IMAGE_CHUNK_SIZE = previousCardImageChunkSize;
}
const previousPortfolioTrendImageLimit = process.env.FEISHU_PORTFOLIO_TREND_IMAGE_LIMIT;
process.env.FEISHU_PORTFOLIO_TREND_IMAGE_LIMIT = "3";
assert.equal(manager.getPortfolioTrendImageLimit(), 8, "portfolio manager report images must not fall back to two or three simple trend charts");
if (previousPortfolioTrendImageLimit === undefined) {
  delete process.env.FEISHU_PORTFOLIO_TREND_IMAGE_LIMIT;
} else {
  process.env.FEISHU_PORTFOLIO_TREND_IMAGE_LIMIT = previousPortfolioTrendImageLimit;
}
const portfolioSnapshots = manager.collectTrendSnapshotsForRun({
  orders: [
    { side: "BUY", code: "000031", name: "订单买入基金C", fundSnapshot: { ...setupDigest, code: "000031", name: "订单买入基金C", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } } }
  ],
  transactions: [
    { side: "BUY", code: "000032", name: "成交买入基金C", fundSnapshot: { ...setupDigest, code: "000032", name: "成交买入基金C", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } } }
  ],
  watchlistUpdates: [
    { status: "ready", code: "000033", name: "自选可买基金C", lastSnapshot: { ...setupDigest, code: "000033", name: "自选可买基金C", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } } },
    { status: "waiting_pullback", code: "000034", name: "自选备选基金C", lastSnapshot: { ...setupDigestSecond, code: "000034", name: "自选备选基金C", trendProfile: { ...setupDigestSecond.trendProfile, series: chartSeries } } }
  ],
  accountAfter: {
    positions: [
      { code: "000035", name: "持仓跟踪基金A", fundSnapshot: { ...setupDigest, code: "000035", name: "持仓跟踪基金A", trendProfile: { ...setupDigest.trendProfile, series: chartSeries } } }
    ]
  }
});
assert(portfolioSnapshots.some((item) => item.role === "买入准备图" && item.code === "000033"), "portfolio report images must include ready watchlist candidates as buy-preparation charts");
assert(portfolioSnapshots.some((item) => item.role === "备选观察图" && item.code === "000034"), "portfolio report images must include waiting watchlist candidates as backup charts");
assert(portfolioSnapshots.some((item) => item.role === "持仓跟踪图" && item.code === "000035"), "portfolio report images must include current positions after buy/backup evidence");
assert.equal(portfolioSnapshots[0].role, "买入执行图", "portfolio report images should put executed buys before lower-priority reference charts");

const deepDiveSummary = manager.buildMarketDeepDiveSummary({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  searchKeywords: ["中证500"],
  backfillCodes: ["000004", "000005"],
  candidates: [
    { ...setupDigest, code: "000001", name: "低位修复基金A" },
    { ...hotDigest, code: "000003", name: "追涨观察基金A" }
  ]
});
assert(deepDiveSummary.includes("pullbackSetupRanking"), "deep dive summary must expose pullback/setup ranking evidence");
assert(deepDiveSummary.includes("backfillCodes=000004/000005"), "deep dive summary must expose secondary backfill searches when the first pullback batch has no main candidate");
assert(deepDiveSummary.includes("mainCandidateCodes=000001"), "deep dive summary must identify main pullback/setup candidates");
assert(deepDiveSummary.includes("watchOrRejectCodes=000003"), "deep dive summary must keep hot candidates out of main recommendations");
assert(deepDiveSummary.includes("缺口=回调完成/启动前夜信号未确认"), "deep dive summary must expose why watch/reject candidates are not low-position launch buys");
assert(deepDiveSummary.includes("近20日+33.41%偏热"), "deep dive summary must show concrete overheat gaps instead of only labeling candidates as watch");
const firstBackfillBatch = manager.selectPullbackBackfillCandidates([
  { code: "000100", name: "中证500ETF联接A" },
  { code: "000101", name: "中证500ETF联接C" },
  { code: "000102", name: "中证1000ETF联接C" },
  { code: "000103", name: "创业板ETF联接C" }
], [
  { code: "000100", name: "中证500ETF联接A" }
], 1);
assert.deepEqual(firstBackfillBatch.map((item) => item.code), ["000102"], "pullback backfill must skip already selected product/share-class variants");
const secondBackfillBatch = manager.selectPullbackBackfillCandidates([
  { code: "000100", name: "中证500ETF联接A" },
  { code: "000101", name: "中证500ETF联接C" },
  { code: "000102", name: "中证1000ETF联接C" },
  { code: "000103", name: "创业板ETF联接C" }
], [
  { code: "000100", name: "中证500ETF联接A" },
  ...firstBackfillBatch
], 1);
assert.deepEqual(secondBackfillBatch.map((item) => item.code), ["000103"], "pullback backfill must support another round instead of stopping after one miss");

const promotedWatchQuality = manager.evaluateFundAnswerQuality({
  text: [
    "推荐清单：",
    "1. 000003 追涨观察基金A：建议分批买入10%，看起来启动很强。",
    "1万元执行：先买1000元。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [
        { ...setupDigest, code: "000001", name: "低位修复基金A" },
        { ...hotDigest, code: "000003", name: "追涨观察基金A" }
      ]
    }
  }
});
assert(
  promotedWatchQuality.issues.includes("watch_candidate_promoted_to_recommendation"),
  "quality gate must reject watch/reject candidates promoted into the recommendation list"
);

const watchExecutionQuality = manager.evaluateFundAnswerQuality({
  text: [
    "推荐清单：",
    "1. 000001 低位修复基金A：C类，近5日+1.4%、近10日+2.8%，120日位置38.5%，可以分批。",
    "观察/排除：000003 追涨观察基金A：短期偏热，只观察。",
    "1万元执行：激进给000001买1500元，均衡给000001买800元，保守0元；000003买入500元做试探。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [
        { ...setupDigest, code: "000001", name: "低位修复基金A" },
        { ...hotDigest, code: "000003", name: "追涨观察基金A" }
      ]
    }
  }
});
assert(
  watchExecutionQuality.issues.includes("watch_candidate_given_buy_execution"),
  "quality gate must reject buy amounts assigned to watch/reject candidates outside the recommendation list"
);
const watchBuySignalQuality = manager.evaluateFundAnswerQuality({
  text: [
    "推荐清单：",
    "1. 000001 低位修复基金A：C类，近5日+1.4%、近10日+2.8%，120日位置38.5%，可以分批。",
    "观察/排除：000003 追涨观察基金A：短期偏热，但可以小仓位试探，后续再看回撤。",
    "1万元执行：激进给000001买1500元，均衡给000001买800元，保守0元。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [
        { ...setupDigest, code: "000001", name: "低位修复基金A" },
        { ...hotDigest, code: "000003", name: "追涨观察基金A" }
      ]
    }
  }
});
assert(
  watchBuySignalQuality.issues.includes("watch_candidate_given_buy_signal"),
  "quality gate must reject buy-intent language for watch/reject candidates even without an explicit amount"
);

const thinPullbackQuality = manager.evaluateFundAnswerQuality({
  text: [
    "推荐清单：",
    "1. 000001 低位修复基金A：回调完成，可以分批买入。",
    "1万元执行：先买1000元。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [
        { ...setupDigest, code: "000001", name: "低位修复基金A" },
        { ...hotDigest, code: "000003", name: "追涨观察基金A" }
      ]
    }
  }
});
assert(
  thinPullbackQuality.issues.includes("missing_pullback_timing_evidence"),
  "pullback recommendations must include numeric low-position/early-turn evidence"
);
assert(
  thinPullbackQuality.issues.includes("missing_pullback_three_tier_execution"),
  "pullback recommendations must include aggressive/balanced/conservative execution tiers"
);
assert(
  thinPullbackQuality.issues.includes("missing_pullback_share_class_fee"),
  "pullback recommendations must include share-class and fee evidence"
);

const partialEvidenceQuality = manager.evaluateFundAnswerQuality({
  text: [
    "推荐清单：",
    "1. 000001 低位修复基金A：C类，近5日+1.4%、近10日+2.8%，120日位置38.5%，可以分批。",
    "2. 000002 启动前夜基金C：回调完成，可以分批买入。",
    "1万元执行：激进2000元，均衡1000元，保守0元。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [
        { ...setupDigest, code: "000001", name: "低位修复基金A" },
        { ...setupDigestSecond, code: "000002", name: "启动前夜基金C" },
        { ...hotDigest, code: "000003", name: "追涨观察基金A" }
      ]
    }
  }
});
assert(
  partialEvidenceQuality.issues.includes("missing_pullback_timing_evidence"),
  "every recommended pullback candidate must carry its own timing evidence"
);
assert(
  partialEvidenceQuality.issues.includes("missing_pullback_share_class_fee"),
  "every recommended pullback candidate must carry its own share-class evidence"
);

const noQualifiedQuality = manager.evaluateFundAnswerQuality({
  text: [
    "推荐清单：",
    "1. 000003 追涨观察基金A：建议买入1000元。",
    "1万元执行：激进1000元，均衡500元。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [{ ...hotDigest, code: "000003", name: "追涨观察基金A" }]
    }
  }
});
assert(
  noQualifiedQuality.issues.includes("recommends_without_qualified_pullback_candidate"),
  "quality gate must reject hard-coded recommendations when no qualified pullback candidate exists"
);

const deterministicMainFallback = manager.buildPullbackQualityFallbackAnswer({
  userText: setupQuery,
  issues: promotedWatchQuality.issues,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [
        { ...setupDigest, code: "000001", name: "低位修复基金A" },
        { ...hotDigest, code: "000003", name: "追涨观察基金A" }
      ]
    }
  }
});
assert(deterministicMainFallback.includes("000001"), "deterministic fallback must keep qualified main candidates");
assert(!deterministicMainFallback.split("推荐清单：")[1].split("1万元执行")[0].includes("000003"), "deterministic fallback must not promote watch candidates into recommendations");
assert(deterministicMainFallback.includes("近5日+1.4%"), "deterministic fallback must show early 5-day turn evidence");
assert(deterministicMainFallback.includes("近10日+2.8%"), "deterministic fallback must show early 10-day turn evidence");
assert(deterministicMainFallback.includes("120日位置38.5%"), "deterministic fallback must show low-position evidence");
assert(deterministicMainFallback.includes("C类"), "deterministic fallback must show share class evidence");
assert(deterministicMainFallback.includes("激进2000元以内") && deterministicMainFallback.includes("均衡1000元以内") && deterministicMainFallback.includes("保守先0元观察"), "deterministic fallback must keep three-tier execution");

const deterministicNoMainFallback = manager.buildPullbackQualityFallbackAnswer({
  userText: setupQuery,
  issues: noQualifiedQuality.issues,
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [{ ...hotDigest, code: "000003", name: "追涨观察基金A" }]
    }
  }
});
assert(deterministicNoMainFallback.includes("暂时买入0元"), "no-main fallback must explicitly avoid buying");
assert(deterministicNoMainFallback.includes("观察池（不是主推荐）"), "no-main fallback must show transparent watchlist evidence instead of sounding like no search was performed");
assert(deterministicNoMainFallback.includes("000003"), "no-main fallback may show rejected candidates as observation-only evidence");
assert(deterministicNoMainFallback.includes("还差：回调完成/启动前夜信号未确认"), "no-main fallback must explain exactly what rejected observation candidates still lack");
assert(deterministicNoMainFallback.includes("近60日+36.64%偏热"), "no-main fallback must surface concrete overheat evidence for rejected candidates");
assert(!deterministicNoMainFallback.includes("推荐清单："), "no-main fallback must not create a recommendation section");
assert(!/000003.{0,40}(?:买入|分批|配置)\d+/s.test(deterministicNoMainFallback), "no-main fallback must not assign buy amounts to rejected candidates");
const enforcedNoMainFallback = await manager.enforceFundAnswerQuality({
  text: [
    "推荐清单：",
    "1. 000003 追涨观察基金A：建议分批买入1000元。",
    "1万元执行：激进1000元，均衡500元。"
  ].join("\n"),
  workflow: "fund_recommendation",
  userText: setupQuery,
  intent: { workflow: "fund_recommendation", mode: "pullback_setup_discovery" },
  evidence: {
    marketDeepDive: {
      ok: true,
      selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
      candidates: [{ ...hotDigest, code: "000003", name: "追涨观察基金A" }]
    }
  }
});
assert(enforcedNoMainFallback.includes("直接结论：这次先不买"), "quality enforcement must immediately use deterministic fallback for severe pullback violations");
assert(enforcedNoMainFallback.includes("暂时买入0元"), "quality enforcement fallback must keep rejected pullback candidates at zero buy amount");
assert(!enforcedNoMainFallback.includes("推荐清单："), "quality enforcement fallback must not preserve a bad recommendation section when no main candidate exists");

async function assertIntent({ userText, expectedWorkflow, expectedReason, expectedMode = null, requiredSkills = [] }) {
  const routed = await manager.classifyMessageIntent({
    userText,
    messageType: "text",
    imageKeys: []
  });
  assert.equal(routed.workflow, expectedWorkflow, `${userText} should route to ${expectedWorkflow}`);
  assert.equal(routed.reason, expectedReason, `${userText} should use deterministic routing`);
  if (expectedMode) {
    assert.equal(routed.mode, expectedMode, `${userText} should use mode ${expectedMode}`);
  }
  assertSkillCoverage(routed.skillIds || [], requiredSkills, userText);
}

function assertSkillCoverage(actual, required, label) {
  for (const skill of required) {
    assert(actual.includes(skill), `${label} must load ${skill}`);
  }
}

function buildChartProfile() {
  const start = new Date("2026-01-01T00:00:00Z");
  const series = Array.from({ length: 120 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const drawdownLeg = index < 60 ? 1 - index * 0.0016 : 0.904 + (index - 60) * 0.0021;
    return {
      date: date.toISOString().slice(0, 10),
      nav: Number(drawdownLeg.toFixed(4))
    };
  });
  return {
    code: "000000",
    name: "低位修复基金C",
    trendProfile: {
      series,
      return20dPct: 4.5,
      return10dPct: 2.1,
      return5dPct: 1.2,
      return60dPct: 6.2,
      return120dPct: -2.4,
      return250dPct: 8.7,
      drawdownFromRecentHighPct: -7.4,
      lowPositionPct120: 38.5,
      pullbackSetup: { signal: "pullback_complete", score: 76 },
      entryBias: "buyable_now"
    },
    risk: {
      oneYear: {
        maxDrawdownPct: -18.6,
        sharpe: 0.82,
        annualizedReturnPct: 7.6
      }
    },
    fees: {
      shareClass: "C",
      feeImpact: {
        oneYearCostPer10000: 42
      }
    },
    scale: "42.6亿元",
    actionability: {
      action: "buy"
    }
  };
}

function buildEarlyTurnNavPoints() {
  const start = new Date("2025-11-01T00:00:00Z");
  return Array.from({ length: 140 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const nav = index < 20
      ? interpolate(1.06, 1.1, index, 19)
      : index < 90
        ? interpolate(1.1, 0.94, index - 20, 69)
        : index < 120
          ? interpolate(0.94, 0.958, index - 90, 29)
          : index < 130
            ? interpolate(0.958, 0.962, index - 120, 9)
            : interpolate(0.962, 0.974, index - 130, 9);
    return {
      date: date.toISOString().slice(0, 10),
      cumulativeNav: Number(nav.toFixed(4))
    };
  });
}

function interpolate(start, end, index, span) {
  if (!span) return end;
  return start + (end - start) * (index / span);
}
