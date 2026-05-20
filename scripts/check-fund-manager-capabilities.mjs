import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.FUNDAGENT_SKIP_SERVER_START = "1";
process.env.FEISHU_REPORT_CHART_PIXEL_RATIO = "1";

const serverPath = pathToFileURL(path.join(process.cwd(), "src", "server.mjs")).href;
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

const lowSetupSeed = {
  name: "中证500ETF联接C",
  type: "指数型基金",
  oneMonthPct: 4.2,
  threeMonthPct: -6.5,
  sixMonthPct: -11.8,
  oneYearPct: -8.4,
  dailyPct: 0.8
};
const chaseSeed = {
  name: "热门黄金主题基金A",
  type: "股票型基金",
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

const setupDigest = {
  ok: true,
  trendProfile: {
    pullbackSetup: { signal: "pullback_complete", score: 76 },
    trendLabel: "pullback_complete",
    entryBias: "buyable_now",
    return20dPct: 4.5,
    return60dPct: 6.2,
    drawdownFromRecentHighPct: -7.4
  },
  actionability: { score: 74 }
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

const leakQuality = manager.evaluateFundAnswerQuality({
  text: "趋势/动作：extended_uptrend，actionability 为 tactical only / staged_buy，但 entryBias 是 wait_pullback。",
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: { marketDeepDive: { candidates: [hotDigest] } }
});
assert(leakQuality.issues.includes("internal_signal_leak"), "quality gate must reject internal enum leaks");

const png = manager.renderFundReportSummaryPng({
  profile: buildChartProfile(),
  width: 900,
  height: 520
});
assert(Buffer.isBuffer(png), "summary chart renderer must return a PNG buffer");
assert.equal(png.slice(0, 8).toString("hex"), "89504e470d0a1a0a", "summary chart must be a PNG");
assert.equal(png.readUInt32BE(16), 900, "summary chart width must match requested width");
assert.equal(png.readUInt32BE(20), 520, "summary chart height must match requested height");
assert(png.length > 5000, "summary chart should contain more than a sparse legacy line");

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
    trendProfile: {
      series,
      return20dPct: 4.5,
      return60dPct: 6.2,
      return120dPct: -2.4,
      return250dPct: 8.7,
      drawdownFromRecentHighPct: -7.4,
      pullbackSetup: { signal: "pullback_complete", score: 76 },
      entryBias: "buyable_now"
    },
    risk: {
      oneYear: {
        maxDrawdownPct: -18.6,
        sharpe: 0.82
      }
    },
    fees: {
      feeImpact: {
        oneYearCostPer10000: 42
      }
    },
    actionability: {
      action: "buy"
    }
  };
}
