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
  "有回撤企稳准备走强的标的吗"
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
  "帮我看000001是不是回踩完成准备向上"
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
const watchlistStatusLines = manager.buildPortfolioWatchlistStatusLines([
  {
    ...normalizedWatchDb.watchlist[0],
    lastSnapshot: {
      nav: 1.2345,
      navDate: "2026-05-19",
      trendSummary: "20日+4.8%，60日+7.6%，趋势回调完成，入场可买",
      trendProfile: {
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
    reason: "近20日涨幅略快，等待回踩。",
    buyTriggers: ["回踩不破前低"],
    riskNotes: ["若继续放量冲高则不追"],
    feeNotes: ["C类适合短期观察"]
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
assert(watchlistStatusLines.includes("【接近可买】"), "portfolio status answer must group ready watchlist candidates");
assert(watchlistStatusLines.includes("【等待回调】"), "portfolio status answer must group waiting watchlist candidates");
assert(watchlistStatusLines.includes("【暂不买入】"), "portfolio status answer must group blocked watchlist candidates");
assert(watchlistStatusLines.includes("备选理由：回调完成后低位修复"), "portfolio status answer must include detailed watchlist reasons");
assert(watchlistStatusLines.includes("触发：放量站回20日均线"), "portfolio status answer must include buy triggers");
assert(watchlistStatusLines.includes("风险边界：若近20日涨幅超过10%则暂停追入"), "portfolio status answer must include risk boundaries");
assert(watchlistStatusLines.includes("费用/份额：C类更适合短中期观察"), "portfolio status answer must include fee/share-class notes");
assert(watchlistStatusLines.includes("最新走势：20日+4.8%"), "portfolio status answer must include latest trend evidence");
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
  oneYearPct: 92.5,
  dailyPct: 4.9
};
assert(
  manager.scorePullbackSetupSeedCandidate(lowSetupSeed, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate(chaseSeed, [], setupQuery),
  "pullback setup seed scoring must prefer low-position repair over recent surge/chase candidates"
);
const weeklyTurnSeed = {
  code: "000010",
  name: "中证A500ETF联接C",
  type: "指数型基金",
  oneWeekPct: 2.4,
  oneMonthPct: 1.2,
  threeMonthPct: -7.5,
  sixMonthPct: -12.4,
  dailyPct: 0.6
};
const weeklyChaseSeed = {
  code: "000011",
  name: "热门强势主题基金A",
  type: "股票型基金",
  oneWeekPct: 9.2,
  oneMonthPct: 26.8,
  threeMonthPct: 42.1,
  sixMonthPct: 66.5,
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
assert(serverSource.includes('metric: "zzf"'), "pullback setup recall must directly scan one-week ranking data");
assert(serverSource.includes("PULLBACK_SETUP_WEEKLY_RANK_LIMIT || 160"), "one-week ranking scan must use a wider pool to catch mild early turns after hot weekly leaders");
assert(serverSource.includes("PULLBACK_SETUP_BACKFILL_ROUNDS || 3"), "pullback setup deep-dive must keep searching beyond a single backfill batch");
const mergedWeeklyEvidence = manager.mergeCandidateFunds([
  { code: "000010", name: "中证A500ETF联接C", keywords: ["中证A500"], setupDiscoverySource: "keyword_search" }
], [
  { ...weeklyTurnSeed, keywords: ["近1周低位转强候选"], setupDiscoverySource: "weekly_reversal_scan" }
])[0];
assert.equal(mergedWeeklyEvidence.oneWeekPct, 2.4, "candidate merge must preserve ranking return evidence when keyword search sees the fund first");
assert(mergedWeeklyEvidence.keywords.includes("近1周低位转强候选"), "candidate merge must preserve setup discovery tags");
assert(mergedWeeklyEvidence.setupDiscoverySource.includes("keyword_search"), "candidate merge must preserve original discovery source");
assert(mergedWeeklyEvidence.setupDiscoverySource.includes("weekly_reversal_scan"), "candidate merge must preserve later ranking discovery source");
assert(
  manager.scorePullbackSetupSeedCandidate({ ...weeklyTurnSeed, name: "中证A500ETF联接C", shareClass: "C" }, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate({ ...weeklyTurnSeed, name: "中证A500ETF联接A", shareClass: "A" }, [], setupQuery),
  "tactical pullback setup scoring should prefer C share class over A when return evidence is otherwise equal"
);
const portfolioWatchlistSeeds = manager.selectPortfolioWatchlistSeedCandidates([
  weeklyChaseSeed,
  weeklyTurnSeed,
  { code: "000013", name: "已有候选基金C", type: "指数型基金", oneWeekPct: 2.1, oneMonthPct: 3.2, threeMonthPct: -4.5, sixMonthPct: -8.4 }
], [
  { code: "000013", name: "已有候选基金C", status: "watch" }
], [], { limit: 3, minScore: 52 });
assert.deepEqual(
  portfolioWatchlistSeeds.map((item) => item.code),
  ["000010"],
  "portfolio watchlist seed selection must add low-position weekly turns while rejecting chases and existing watchlist items"
);
const portfolioSeedUpdates = manager.buildPortfolioWatchlistUpdatesFromSeedCandidates(portfolioWatchlistSeeds);
assert.equal(portfolioSeedUpdates[0].source, "deterministic_pullback_recall", "portfolio watchlist seeds must be traceable to deterministic pullback recall");
assert.equal(portfolioSeedUpdates[0].status, "waiting_pullback", "portfolio watchlist seeds without NAV verification must not be marked ready");
assert(portfolioSeedUpdates[0].reason.includes("系统低位回调召回评分"), "portfolio watchlist seed must keep a detailed backup reason");
assert(portfolioSeedUpdates[0].reason.includes("待净值下钻确认"), "portfolio watchlist seed must say unverified ranking recalls are only watch candidates");
assert(portfolioSeedUpdates[0].setupEvidence.length > 0, "portfolio watchlist seed must include setup evidence");
assert(portfolioSeedUpdates[0].buyTriggers.length > 0, "portfolio watchlist seed must include buy triggers");
assert(portfolioSeedUpdates[0].riskNotes.length > 0, "portfolio watchlist seed must include risk notes");
assert(portfolioSeedUpdates[0].feeNotes.length > 0, "portfolio watchlist seed must include fee/share-class notes");
const verifiedSeedProfile = {
  ok: true,
  code: "000010",
  name: "中证A500ETF联接C",
  snapshotDate: "2026-05-19",
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
const verifiedSeedUpdates = manager.buildPortfolioWatchlistUpdatesFromSeedCandidates([
  { ...portfolioWatchlistSeeds[0], portfolioWatchlistSeedScore: 72 }
], { profiles: [verifiedSeedProfile] });
assert.equal(verifiedSeedUpdates[0].status, "ready", "verified low-position pullback seed can become ready");
assert(verifiedSeedUpdates[0].reason.includes("已用净值下钻验证"), "ready seed must explain that NAV trend verification passed");
assert(verifiedSeedUpdates[0].setupEvidence.some((item) => item.includes("净值验证")), "ready seed must include verified trend evidence");
assert(verifiedSeedUpdates[0].feeNotes.some((item) => item.includes("42")), "ready seed must keep fee impact evidence");
const hotVerifiedSeedProfile = {
  ok: true,
  code: "000011",
  name: "热门强势主题基金A",
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
const highPositionSummary = manager.buildMarketDeepDiveSummary({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  candidates: [
    { ...setupDigest, code: "000001", name: "低位修复基金A" },
    { ...highPositionPullbackDigest, code: "000004", name: "位置偏高修复基金C" },
    { ...missingLowPositionDigest, code: "000005", name: "低位缺失修复基金C" }
  ]
});
assert(highPositionSummary.includes("mainCandidateCodes=000001"), "genuinely low-position setup should remain a main candidate");
assert(/watchOrRejectCodes=.*000004/.test(highPositionSummary), "pullback-looking but high-position fund must be demoted to watch/reject");
assert(/watchOrRejectCodes=.*000005/.test(highPositionSummary), "pullback-looking fund with missing low-position evidence must be visible only as watch/reject");
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
