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
assert(
  manager.scoreResearchDigestForPullbackSetup(setupDigest) >
    manager.scoreResearchDigestForPullbackSetup(hotDigest),
  "deep-dive scoring must rank pullback-complete candidates above extended uptrends"
);
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
  width: 980,
  height: 620
});
assert(Buffer.isBuffer(png), "summary chart renderer must return a PNG buffer");
assert.equal(png.slice(0, 8).toString("hex"), "89504e470d0a1a0a", "summary chart must be a PNG");
assert.equal(png.readUInt32BE(16), 980, "summary chart width must match requested width");
assert.equal(png.readUInt32BE(20), 620, "summary chart height must match requested height");
assert(png.length > 8000, "summary chart should contain dense report-card evidence, not only a sparse legacy line");
assert(serverSource.includes("sanitizeChartText"), "summary chart renderer must sanitize non-ASCII labels before bitmap drawing");
for (const label of ["FUND", "NAV", "RANGE", "RET", "BUY/FEE", "ENTRY", "SIG", "LOW", "ACT", "CLASS", "FEE", "SHRP", "YRET", "SIZE"]) {
  assert(serverSource.includes(label), `summary chart must use readable compact label: ${label}`);
}
for (const staleLabel of ["FUND SETUP", "NAV TREND", "DRAWDOWN FROM HIGH", "STAGE RETURN", "SETUP / RISK", "PULLBK", "FEEY", "20D", "60D", "120D", "250D"]) {
  assert(!serverSource.includes(staleLabel), `summary chart should not expose stale English label: ${staleLabel}`);
}
assert(!/drawText\([^)]*[\u4e00-\u9fff]/.test(serverSource), "chart renderer must not draw tiny bitmap Chinese text inside PNGs");
const tinyFontSource = serverSource.slice(serverSource.indexOf("const TINY_FONT"), serverSource.indexOf("function encodePngRgba"));
assert(!/[\u4e00-\u9fff]/.test(tinyFontSource), "tiny chart font must not keep Chinese bitmap glyphs that render like QR codes");
assert(!/drawYAxisTickLabels\([^;\n]*["'][\u4e00-\u9fff]/.test(serverSource), "summary chart must not use Chinese axis labels in bitmap text");

const selectedChartCodes = manager.selectFundReportProfilesForAnswer([
  { code: "000001", name: "低位修复基金A", trendProfile: { series: [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.01 }] } },
  { code: "000002", name: "启动前夜基金C", trendProfile: { series: [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.02 }] } },
  { code: "000003", name: "追涨观察基金A", trendProfile: { series: [{ date: "2026-01-01", nav: 1 }, { date: "2026-01-02", nav: 1.03 }] } }
], [
  "推荐清单：",
  "1. 000001 低位修复基金A：回调完成，可分批。",
  "2. 000002 启动前夜基金C：低位修复，适合小仓位。",
  "观察名单：",
  "000003 追涨观察基金A：短期偏热，只观察，不作为主推荐。"
].join("\n")).map((profile) => profile.code);
assert.deepEqual(
  selectedChartCodes,
  ["000001", "000002"],
  "report images must align with the recommendation list and exclude watch/reject candidates"
);

const deepDiveSummary = manager.buildMarketDeepDiveSummary({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  searchKeywords: ["中证500"],
  candidates: [
    { ...setupDigest, code: "000001", name: "低位修复基金A" },
    { ...hotDigest, code: "000003", name: "追涨观察基金A" }
  ]
});
assert(deepDiveSummary.includes("pullbackSetupRanking"), "deep dive summary must expose pullback/setup ranking evidence");
assert(deepDiveSummary.includes("mainCandidateCodes=000001"), "deep dive summary must identify main pullback/setup candidates");
assert(deepDiveSummary.includes("watchOrRejectCodes=000003"), "deep dive summary must keep hot candidates out of main recommendations");

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
assert(!/\b\d{6}\b/.test(deterministicNoMainFallback), "no-main fallback must not hard-code candidate fund codes");

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
