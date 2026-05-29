import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.FUNDAGENT_SKIP_SERVER_START = "1";
process.env.FEISHU_REPORT_CHART_PIXEL_RATIO = "1";

const serverPath = pathToFileURL(path.join(process.cwd(), "src", "server.mjs")).href;
const serverSource = fs.readFileSync(path.join(process.cwd(), "src", "server.mjs"), "utf8");
const adminSource = fs.readFileSync(path.join(process.cwd(), "public", "admin.js"), "utf8");
const adminHtmlSource = fs.readFileSync(path.join(process.cwd(), "public", "admin.html"), "utf8");
const adminStyleSource = fs.readFileSync(path.join(process.cwd(), "public", "styles.css"), "utf8");
const manager = await import(serverPath);
const todayIso = new Date().toISOString().slice(0, 10);

assert.equal(manager.shouldPersistRuntimeStats(), false, "capability checks must not write synthetic failures into runtime stats");

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
assert.equal(
  manager.isHeldFundSellTimingAsk("我需要的是对图中的我已经买的基金，告诉我多久卖"),
  true,
  "image captions that ask when to sell an already-bought fund must be recognized as held-position sell timing"
);
assert.equal(
  manager.isUserPortfolioImportRequest("建立用户“admin”的持仓情况"),
  true,
  "text commands must recognize user-level holding imports"
);
assert.equal(manager.extractUserPortfolioId("建立用户“admin”的持仓情况"), "admin", "user holding import must parse quoted user ids");
const normalizedUserPortfolios = manager.normalizeUserPortfolios([
  {
    userId: "admin",
    displayName: "admin",
    holdings: [
      { code: "021959", name: "南方黄金股指数C", visibleReturnPct: -3.07, visibleReturnLabel: "当日涨幅" }
    ]
  }
]);
assert.equal(normalizedUserPortfolios[0].holdings[0].code, "021959", "user portfolios must keep screenshot holding codes");
assert.equal(normalizedUserPortfolios[0].holdings[0].visibleReturnLabel, "当日涨幅", "user portfolios must keep the meaning of visible screenshot returns");
const rankingBoard = manager.buildPortfolioRankingBoard(manager.normalizePortfolioDb({
  account: {
    initialCapital: 100000,
    cash: 90000,
    positions: [
      {
        code: "008327",
        name: "东财通信C",
        costAmount: 10000,
        currentValue: 9700,
        weightPct: 9.7,
        unrealizedPnlPct: -3,
        peakUnrealizedPnlPct: 5,
        profitGivebackPct: 8,
        riskBudget: { level: "warning", label: "需减仓复核", triggers: ["曾浮盈后回吐，需要复核卖出"] },
        fundSnapshot: {
          actionability: {
            holdingsOutlook: {
              holdingTags: ["科技"]
            }
          }
        }
      }
    ]
  },
  watchlist: [
    {
      code: "000001",
      name: "低位启动基金C",
      status: "ready",
      priority: 1,
      reason: "低位启动条件暂已满足。",
      setupEvidence: ["低位启动前夜候选"],
      lastSnapshot: { trendProfile: { ok: true, return20dPct: 1.2, lowPositionPct120: 18 } }
    },
    {
      code: "000003",
      name: "新能源低位基金C",
      status: "waiting_pullback",
      priority: 2,
      reason: "新能源低位修复候选，前十大持仓支撑方向。",
      buyTriggers: ["5日/10日温和转强后复核"],
      lastSnapshot: {
        holdings: {
          equityDisclosureDate: "2099-03-31",
          equityTopHoldings: [
            "300750 宁德时代 4.2%",
            "002594 比亚迪 3.9%",
            "300014 亿纬锂能 3.1%",
            "300274 阳光电源 2.8%",
            "002812 恩捷股份 2.4%",
            "601012 隆基绿能 2.1%",
            "300124 汇川技术 1.9%",
            "002460 赣锋锂业 1.7%"
          ]
        }
      }
    },
    {
      code: "000004",
      name: "低费率对比基金C",
      shareClass: "C",
      status: "watch",
      priority: 1,
      reason: "低位修复但需要比较 A/C 份额。",
      feeNotes: ["C类销售服务费0.40%/年，每万元1年约40元，适合短中期战术观察。"],
      alternativeShareClasses: [
        { code: "000104", name: "低费率对比基金A", shareClass: "A", feeImpact: { oneYearCostPer10000: 15 }, feeNotes: ["A类每万元1年约15元，适合更长持有期。"] }
      ],
      sameExposureAlternatives: [
        { code: "000204", name: "同指数低费率联接C", shareClass: "C", feeImpact: { oneYearCostPer10000: 25 }, feeNotes: ["同类C份额每万元1年约25元，需比较规模和流动性。"] }
      ],
      lastSnapshot: {
        trendProfile: { ok: true, return20dPct: 2.1, lowPositionPct120: 25 },
        fees: {
          shareClass: "C",
          shareClassFeeModel: { type: "sales_service_fee", label: "C类：偏销售服务费模型", selectionRule: "适合短中期，长期需比较A类。" },
          feeImpact: {
            oneYearCostPer10000: 40,
            twoYearCostPer10000: 80,
            feeDragLevel: "medium",
            holdingPeriodFit: "short_or_tactical_holding_fit",
            missingFeeData: []
          }
        }
      }
    },
    {
      code: "000005",
      name: "医药轮动低位基金C",
      shareClass: "C",
      status: "watch",
      priority: 1,
      reason: "医药板块低位轮动，走势回调完成后刚转强。",
      setupEvidence: ["板块轮动线索", "回调完成"],
      lastSnapshot: {
        trendProfile: {
          ok: true,
          return5dPct: 1.2,
          return10dPct: 2.4,
          return20dPct: 3.2,
          lowPositionPct120: 32,
          lowPositionPct250: 44,
          pullbackSetup: { signal: "pullback_complete", signalText: "回调完成", score: 78 }
        },
        risk: {
          oneYear: {
            ok: true,
            annualizedReturnPct: 16.2,
            maxDrawdownPct: -12.4,
            sharpe: 1.18
          },
          threeYear: {
            ok: true,
            annualizedReturnPct: 12.6,
            maxDrawdownPct: -18.8,
            sharpe: 0.92
          }
        },
        managers: [
          { name: "张三", workTime: "4年又120天", fundSize: "86.2亿元", currentFundProfitPct: 42.6 }
        ],
        establishDate: "2018-06-01",
        scale: { valueYi: 18.6 },
        matchedThemes: [{
          id: "medicine",
          name: "医药/创新药",
          stage: "low_position_rotation",
          positionSignal: "low_position_rotation",
          rotationScore: 62,
          lowPositionScore: 58,
          crowdingScore: 22,
          forwardScore: 46
        }]
      }
    },
    {
      code: "000007",
      name: "同类替代优选基金C",
      shareClass: "C",
      status: "blocked",
      priority: 1,
      readinessScore: 100,
      reason: "买点接近，但同指数产品里有更低费率替代。",
      feeNotes: ["C类销售服务费0.60%/年，每万元1年约60元。"],
      alternativeShareClasses: [
        { code: "000107", name: "同类替代优选基金A", shareClass: "A", feeImpact: { oneYearCostPer10000: 18 }, feeNotes: ["A类每万元1年约18元，更适合较长持有。"] }
      ],
      sameExposureAlternatives: [
        { code: "000207", name: "同指数低费ETF联接C", shareClass: "C", feeImpact: { oneYearCostPer10000: 20 }, feeNotes: ["同指数低费份额每万元1年约20元。"] }
      ],
      lastSnapshot: {
        trendProfile: { ok: true, return20dPct: 1.8, lowPositionPct120: 28 },
        fees: {
          shareClass: "C",
          shareClassFeeModel: { type: "sales_service_fee", label: "C类：偏销售服务费模型", selectionRule: "适合短中期，长期需比较A类或低费替代。" },
          feeImpact: {
            oneYearCostPer10000: 60,
            twoYearCostPer10000: 120,
            feeDragLevel: "medium",
            missingFeeData: []
          }
        }
      }
    },
    {
      code: "000008",
      name: "特殊份额费率核验基金D",
      shareClass: "D",
      status: "watch",
      priority: 2,
      reason: "买点待复核，但D类份额渠道和费率缺口明显。",
      lastSnapshot: {
        fees: {
          shareClass: "D",
          shareClassFeeModel: { type: "special_or_platform_class", label: "D类：特殊/平台份额", selectionRule: "推荐前要确认渠道、起购门槛和普通客户是否可买。" },
          feeImpact: {
            oneYearCostPer10000: 130,
            twoYearCostPer10000: 260,
            feeDragLevel: "high",
            missingFeeData: ["subscription_fee", "subscription_rules", "redemption_rules"]
          }
        }
      }
    },
    {
      code: "000010",
      name: "数据缺口低位基金C",
      status: "ready",
      priority: 1,
      reason: "看起来像低位回调完成，但数据证据不完整，不能直接买。",
      lastSnapshot: {
        navDate: "2020-01-01",
        trendProfile: { ok: false },
        fees: {
          feeImpact: {
            missingFeeData: ["subscription_fee", "sales_service_fee", "redemption_rules"]
          }
        },
        sources: []
      }
    },
    {
      code: "000006",
      name: "高位热门科技基金C",
      shareClass: "C",
      status: "watch",
      priority: 2,
      reason: "短期涨幅偏热，等待健康回撤。",
      riskNotes: ["追涨风险高"],
      lastSnapshot: {
        trendProfile: {
          ok: true,
          return20dPct: 28,
          return60dPct: 42,
          lowPositionPct120: 96,
          lowPositionPct250: 94,
          entryBias: "wait_pullback",
          pullbackSetup: { signal: "none" }
        },
        risk: {
          oneYear: {
            ok: true,
            annualizedVolatilityPct: 36,
            maxDrawdownPct: -34,
            sharpe: 0.32
          }
        },
        matchedThemes: [{
          id: "ai_compute",
          name: "AI/算力",
          stage: "crowded",
          positionSignal: "high_chase_risk",
          rotationScore: 20,
          lowPositionScore: 15,
          crowdingScore: 72
        }]
      }
    },
    {
      code: "000009",
      name: "高回撤低位候选C",
      shareClass: "C",
      status: "watch",
      priority: 2,
      reason: "低位修复但历史回撤偏深，必须先设回撤防线。",
      lastSnapshot: {
        trendProfile: {
          ok: true,
          return20dPct: 1.6,
          lowPositionPct120: 35,
          pullbackSetup: { signal: "pullback_complete", signalText: "回调完成" }
        },
        risk: {
          oneYear: {
            ok: true,
            annualizedVolatilityPct: 35,
            maxDrawdownPct: -32,
            sharpe: 0.41
          }
        }
      }
    }
  ],
  userPortfolios: normalizedUserPortfolios
}));
assert(rankingBoard.lists.find((item) => item.id === "decision_synthesis")?.items.some((item) => item.code === "000005"), "manager ranking board must expose integrated decision-synthesis candidates");
assert(rankingBoard.lists.find((item) => item.id === "buy_preparation")?.items.some((item) => item.code === "000001"), "manager ranking board must expose buy-preparation candidates");
assert(rankingBoard.lists.find((item) => item.id === "launch_setup")?.items.some((item) => item.code === "000001"), "manager ranking board must expose low-position launch candidates");
assert(rankingBoard.lists.find((item) => item.id === "cash_redeployment")?.items.some((item) => item.code === "000001"), "manager ranking board must expose high-cash redeployment candidates");
assert(rankingBoard.lists.find((item) => item.id === "position_sizing")?.items.some((item) => item.code === "000001"), "manager ranking board must expose position-sizing candidates with explicit starter ranges");
assert(rankingBoard.lists.find((item) => item.id === "quality_score")?.items.some((item) => item.code === "000005"), "manager ranking board must expose risk-adjusted fund quality candidates");
assert(rankingBoard.lists.find((item) => item.id === "manager_stability")?.items.some((item) => item.code === "000005"), "manager ranking board must expose fund-manager stability candidates");
assert(rankingBoard.lists.find((item) => item.id === "portfolio_fit")?.items.some((item) => item.code === "000005"), "manager ranking board must expose portfolio-fit candidates that diversify current exposure");
assert(rankingBoard.lists.find((item) => item.id === "theme_allocation")?.items.some((item) => item.code === "000005"), "manager ranking board must expose theme-allocation candidates before choosing representative funds");
assert(rankingBoard.lists.find((item) => item.id === "rotation_opportunity")?.items.some((item) => item.code === "000005"), "manager ranking board must expose sector-rotation opportunity candidates");
assert(rankingBoard.lists.find((item) => item.id === "chase_risk")?.items.some((item) => item.code === "000006"), "manager ranking board must expose hot chase-risk candidates");
assert(rankingBoard.lists.find((item) => item.id === "drawdown_defense")?.items.some((item) => item.code === "008327"), "manager ranking board must expose held-position drawdown-defense candidates");
assert(rankingBoard.lists.find((item) => item.id === "drawdown_defense")?.items.some((item) => item.code === "000006"), "manager ranking board must expose high-drawdown watchlist candidates");
assert(rankingBoard.lists.find((item) => item.id === "data_confidence")?.items.some((item) => item.code === "000010"), "manager ranking board must expose stale or incomplete data-confidence candidates");
assert(rankingBoard.lists.find((item) => item.id === "holdings_outlook")?.items.some((item) => item.code === "000003"), "manager ranking board must expose candidates with supportive top-ten holdings");
assert(rankingBoard.lists.find((item) => item.id === "fee_suitability")?.items.some((item) => item.code === "000004"), "manager ranking board must expose share-class fee suitability candidates");
assert(rankingBoard.lists.find((item) => item.id === "replacement_choice")?.items.some((item) => item.code === "000004"), "manager ranking board must expose same-fund and same-exposure replacement-choice candidates");
assert(rankingBoard.lists.find((item) => item.id === "opportunity_cost")?.nextAction, "manager ranking board must include an opportunity-cost list even when it is empty");
assert(rankingBoard.lists.find((item) => item.id === "sell_risk")?.items.some((item) => item.code === "008327"), "manager ranking board must expose sell-risk positions");
assert(rankingBoard.health?.summary, "manager ranking board must explain the current board state");
assert(rankingBoard.lists.every((item) => item.nextAction), "manager ranking board empty states must include next actions");
assert(rankingBoard.customerDigest?.summary, "manager ranking board must translate ranking lanes into a customer-facing digest");
assert(rankingBoard.customerDigest?.watchFocus?.length || rankingBoard.customerDigest?.buyReview?.length || rankingBoard.customerDigest?.riskAvoid?.length, "customer-facing digest must group candidates into buy, watch, or avoid buckets");
assert(rankingBoard.decisionMatrix?.items?.length, "manager ranking board must build a cross-list decision matrix");
assert(rankingBoard.decisionMatrix.items.some((item) => item.code === "000005" && item.cells?.buy && item.cells?.sector), "decision matrix must align buy and sector evidence for the same fund");
assert(rankingBoard.decisionMatrix.items.some((item) => item.code === "000010" && item.cells?.data && /补证据|补齐|不能提交买入|数据/.test(item.nextStep || item.action || "")), "decision matrix must surface data blockers before buy execution");
assert(rankingBoard.alertCenter?.lanes?.length === 4, "manager ranking board must build a four-lane alert center");
assert(rankingBoard.alertCenter.lanes.find((lane) => lane.id === "buy")?.items.some((item) => item.code === "000001" || item.code === "000005"), "alert center must surface buy-review items");
assert(rankingBoard.alertCenter.lanes.find((lane) => lane.id === "sell")?.items.some((item) => item.code === "008327" || item.code === "000006"), "alert center must surface sell and risk-control items");
assert(rankingBoard.alertCenter.lanes.find((lane) => lane.id === "data")?.items.some((item) => item.code === "000010"), "alert center must surface data and fee blockers");
assert(rankingBoard.alertCenter.lanes.find((lane) => lane.id === "user")?.items.some((item) => item.code === "021959"), "alert center must surface user holding alerts");
assert(rankingBoard.priorityQueue?.length >= 3, "manager ranking board must build a cross-list priority queue");
assert(rankingBoard.priorityQueue.some((item) => item.code === "008327" && item.listId === "sell_risk"), "priority queue must include urgent sell-risk items");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000006" && item.listId === "chase_risk"), "priority queue must include chase-risk warning items");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000009" && item.listId === "drawdown_defense"), "priority queue must include drawdown-defense protection items");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000010" && item.listId === "data_confidence"), "priority queue must include data-confidence blockers before buy execution");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000001" && item.listId === "cash_redeployment"), "priority queue must include cash-redeployment review items");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000005" && item.listId === "rotation_opportunity"), "priority queue must include sector-rotation opportunity items");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000004" && item.listId === "fee_suitability"), "priority queue must include fee-suitability review items");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000007" && item.listId === "replacement_choice"), "priority queue must include replacement-choice review items");
assert(rankingBoard.priorityQueue.some((item) => item.code === "000003" && item.listId === "holdings_outlook"), "priority queue must include holdings-outlook review items");
assert(rankingBoard.priorityQueue.every((item) => item.queueRank && item.nextStep), "priority queue items must be ranked and actionable");
const synthesisRankingItem = rankingBoard.lists.find((item) => item.id === "decision_synthesis")?.items.find((item) => item.code === "000005");
const buyRankingItem = rankingBoard.lists.find((item) => item.id === "buy_preparation")?.items.find((item) => item.code === "000001");
const cashRedeploymentRankingItem = rankingBoard.lists.find((item) => item.id === "cash_redeployment")?.items.find((item) => item.code === "000001");
const positionSizingRankingItem = rankingBoard.lists.find((item) => item.id === "position_sizing")?.items.find((item) => item.code === "000001");
const qualityRankingItem = rankingBoard.lists.find((item) => item.id === "quality_score")?.items.find((item) => item.code === "000005");
const managerStabilityRankingItem = rankingBoard.lists.find((item) => item.id === "manager_stability")?.items.find((item) => item.code === "000005");
const portfolioFitRankingItem = rankingBoard.lists.find((item) => item.id === "portfolio_fit")?.items.find((item) => item.code === "000005");
const themeAllocationRankingItem = rankingBoard.lists.find((item) => item.id === "theme_allocation")?.items.find((item) => item.code === "000005");
const rotationRankingItem = rankingBoard.lists.find((item) => item.id === "rotation_opportunity")?.items.find((item) => item.code === "000005");
const chaseRankingItem = rankingBoard.lists.find((item) => item.id === "chase_risk")?.items.find((item) => item.code === "000006");
const drawdownDefensePositionItem = rankingBoard.lists.find((item) => item.id === "drawdown_defense")?.items.find((item) => item.code === "008327");
const drawdownDefenseWatchItem = rankingBoard.lists.find((item) => item.id === "drawdown_defense")?.items.find((item) => item.code === "000006");
const dataConfidenceRankingItem = rankingBoard.lists.find((item) => item.id === "data_confidence")?.items.find((item) => item.code === "000010");
const holdingsRankingItem = rankingBoard.lists.find((item) => item.id === "holdings_outlook")?.items.find((item) => item.code === "000003");
const feeRankingItem = rankingBoard.lists.find((item) => item.id === "fee_suitability")?.items.find((item) => item.code === "000004");
const replacementRankingItem = rankingBoard.lists.find((item) => item.id === "replacement_choice")?.items.find((item) => item.code === "000004");
const sellRankingItem = rankingBoard.lists.find((item) => item.id === "sell_risk")?.items.find((item) => item.code === "008327");
assert(synthesisRankingItem?.decision?.highlights?.some((item) => item.includes("板块轮动") || item.includes("准备度") || item.includes("回调")), "decision-synthesis ranking items must combine readable positive evidence");
assert(/交叉确认|降级为观察|缺口/.test(synthesisRankingItem?.decision?.nextStep || ""), "decision-synthesis ranking items must tell the manager how to turn combined evidence into action");
assert(buyRankingItem?.decision?.highlights?.length, "buy ranking items must explain the opportunity highlight");
assert(buyRankingItem?.decision?.nextStep, "buy ranking items must include an actionable next step");
assert(cashRedeploymentRankingItem?.reason.includes("现金偏高"), "cash-redeployment ranking items must explain why waiting is no longer enough");
assert(/0\.5%-2\.5%|小仓/.test(cashRedeploymentRankingItem?.decision?.nextStep || ""), "cash-redeployment ranking items must force small starter-buy review instead of vague waiting");
assert(/0\.5%|1\.5%|2\.5%|0元观察/.test(positionSizingRankingItem?.decision?.nextStep || ""), "position-sizing ranking items must turn buy interest into explicit weight limits");
assert(positionSizingRankingItem?.facts?.some((item) => /现金|仓位|试探仓/.test(item)), "position-sizing ranking items must include account-aware sizing facts");
assert(qualityRankingItem?.facts?.some((item) => /夏普|回撤|规模/.test(item)), "quality ranking items must expose risk-adjusted quality facts");
assert(/买入准备|质量|风险收益/.test(qualityRankingItem?.decision?.nextStep || ""), "quality ranking items must force quality evidence to be cross-checked before buying");
assert(managerStabilityRankingItem?.facts?.some((item) => /经理|任期|产品/.test(item)), "manager-stability ranking items must expose fund-manager tenure and product-history facts");
assert(/基金质量|买入准备|稳定/.test(managerStabilityRankingItem?.decision?.nextStep || ""), "manager-stability ranking items must force manager tenure to be cross-checked before buying");
assert(/组合|补位|适配/.test(portfolioFitRankingItem?.reason || portfolioFitRankingItem?.action || ""), "portfolio-fit ranking items must explain how a candidate fits the current portfolio before buying");
assert(portfolioFitRankingItem?.decision?.nextStep?.includes("买入准备"), "portfolio-fit ranking items must force cross-checking with buy-preparation evidence");
assert(themeAllocationRankingItem?.facts?.some((item) => item.includes("医药") || item.includes("代表基金")), "theme-allocation ranking items must expose the theme and representative fund");
assert(themeAllocationRankingItem?.facts?.some((item) => item.includes("低位")), "theme-allocation ranking items must expose low-position evidence at the theme level");
assert(themeAllocationRankingItem?.decision?.nextStep?.includes("先选主题") && themeAllocationRankingItem?.decision?.nextStep?.includes("代表基金"), "theme-allocation ranking items must force choosing the theme before the representative fund");
assert(themeAllocationRankingItem?.decision?.risks?.some((item) => item.includes("同一主题") || item.includes("拥挤")), "theme-allocation ranking items must prevent buying multiple same-theme funds blindly");
assert(rotationRankingItem?.facts.some((item) => item.includes("医药") || item.includes("轮动")), "rotation ranking items must expose readable sector-rotation facts");
assert(/交叉复核|小仓/.test(rotationRankingItem?.decision?.nextStep || ""), "rotation ranking items must force cross-checking before small starter buys");
assert(chaseRankingItem?.decision?.risks?.some((item) => item.includes("新闻热度") || item.includes("拥挤")), "chase-risk ranking items must explain why hot candidates cannot be chased");
assert(chaseRankingItem?.decision?.nextStep.includes("降级为观察"), "chase-risk ranking items must downgrade hot candidates before buying");
assert(drawdownDefensePositionItem?.decision?.risks?.some((item) => item.includes("补仓摊薄") || item.includes("回吐")), "drawdown-defense ranking items must protect held-position profits instead of allowing averaging down");
assert(drawdownDefenseWatchItem?.facts?.some((item) => item.includes("最大回撤") || item.includes("年化波动")), "drawdown-defense ranking items must expose candidate drawdown or volatility facts");
assert(drawdownDefenseWatchItem?.decision?.nextStep?.includes("止损") || drawdownDefenseWatchItem?.decision?.nextStep?.includes("防线"), "drawdown-defense ranking items must force buy-before-risk-boundary planning");
assert(dataConfidenceRankingItem?.facts?.some((item) => /净值日期|距今|份额|费用|持仓|来源/.test(item)), "data-confidence ranking items must expose readable NAV, fee, holdings, and source facts");
assert(dataConfidenceRankingItem?.decision?.gaps?.some((item) => /净值|过期|份额|申购费|销售服务费|持仓|来源/.test(item)), "data-confidence ranking items must expose stale NAV, share-class, fee, holdings, or source gaps");
assert(dataConfidenceRankingItem?.decision?.nextStep?.includes("不能提交买入") || dataConfidenceRankingItem?.reason?.includes("不能"), "data-confidence ranking items must block buy execution until missing evidence is refreshed");
assert(holdingsRankingItem?.reason.includes("持仓前景"), "holdings-outlook ranking items must explain top-ten holdings outlook");
assert(holdingsRankingItem?.facts.some((item) => item.includes("新能源")), "holdings-outlook ranking items must expose the holding theme");
assert(feeRankingItem?.facts.some((item) => item.includes("C类") || item.includes("每万")), "fee-suitability ranking items must expose readable share-class fee facts");
assert(/A\/C|持有期|份额类别|关键费率|渠道/.test(feeRankingItem?.decision?.nextStep || ""), "fee-suitability ranking items must force share-class and holding-period comparison");
assert(replacementRankingItem?.facts.some((item) => item.includes("同基金") || item.includes("同类替代")), "replacement-choice ranking items must expose same-fund or same-exposure alternatives");
assert(/不混买A\/C|代表|替代/.test(replacementRankingItem?.decision?.nextStep || ""), "replacement-choice ranking items must force one final product/share-class choice before buying");
assert(sellRankingItem?.decision?.risks?.some((item) => item.includes("回吐")), "sell ranking items must expose risk reasons instead of only a score");
const rankingActionAudit = manager.buildPortfolioRankingActionAudit({
  runs: [
    {
      id: "run_audit_1",
      date: "2026-05-29",
      type: "decision",
      actions: [
        { action: "BUY", code: "000001", name: "低位启动基金C", rankingBasis: "买入准备榜第1名，采纳小仓试探。", dataBasis: ["来源：manager_ranking_board"] },
        { action: "WATCH", code: "000002", name: "缺依据基金C", reason: "模型直接观察，未说明榜单。" }
      ]
    }
  ]
});
assert.equal(rankingActionAudit.totalActions, 2, "ranking action audit must count recent manager actions");
assert.equal(rankingActionAudit.citedActions, 1, "ranking action audit must count actions that cite manager ranking boards");
assert(rankingActionAudit.missing.some((item) => item.code === "000002"), "ranking action audit must expose actions missing ranking basis");
const rankingGuardActions = manager.buildPortfolioRankingBoardReviewActions(rankingBoard, [
  { action: "WATCH", code: "000001", name: "低位启动基金C" }
]);
assert(rankingGuardActions.some((item) => item.code === "008327"), "ranking board fallback must add omitted sell-risk ranking items for review");
assert(rankingGuardActions.some((item) => item.dataBasis.includes("来源：manager_ranking_board")), "ranking board fallback must leave traceable data basis");
const rankingReviewedDecision = manager.ensurePortfolioRankingBoardReviewed({
  actions: [{ action: "WATCH", code: "000001", name: "低位启动基金C", reason: "模型已观察但未引用榜单" }],
  watchlistUpdates: [],
  learningNotes: [],
  sources: []
}, rankingBoard);
const rankingReviewedBuyActions = rankingReviewedDecision.actions.filter((item) => item.code === "000001");
assert.equal(rankingReviewedBuyActions.length, 1, "ranking board guard must enrich existing ranking actions instead of duplicating them");
assert(rankingReviewedBuyActions[0].rankingBasis.includes("买入准备榜"), "ranking board guard must add ranking basis to existing actions");
assert(rankingReviewedBuyActions[0].dataBasis.includes("来源：manager_ranking_board"), "ranking board guard must tag enriched actions with ranking-board source");
assert(rankingReviewedDecision.actions.some((item) => item.code === "008327"), "ranking board guard must not silently omit top sell-risk ranking items");
assert(rankingReviewedDecision.sources.includes("manager_ranking_board_guard"), "ranking board guard must be traceable in decision sources");
assert.notEqual(
  rankingBoard.lists.find((item) => item.id === "buy_preparation")?.items.find((item) => item.code === "000001")?.action,
  "买入复核",
  "low-readiness ranking candidates must not be labeled as buy-review candidates"
);
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
const runtimeRelease = manager.getRuntimeRelease();
assert(runtimeRelease && runtimeRelease.name && runtimeRelease.startedAt, "runtime release metadata must include app name and start time");
assert(Object.prototype.hasOwnProperty.call(runtimeRelease, "shortCommit"), "runtime release metadata must expose the deployed short commit when available");
assert(serverSource.includes("release: getRuntimeRelease()"), "health/stats APIs must expose runtime release metadata");
assert(serverSource.includes("readBuildReleaseMetadata") && serverSource.includes(".fundagent-release.json"), "runtime release metadata must fall back to a Docker build release file");
assert(adminSource.includes("formatReleaseCommit") && adminHtmlSource.includes("runtimeReleaseBoard"), "admin runtime UI must show the deployed commit");
const pingzhongLatestNav = manager.parseFundPingzhongLatestNav(`
var Data_netWorthTrend = [
  {"x":1779465600000,"y":2.4100,"equityReturn":0.11,"unitMoney":""},
  {"x":1779638400000,"y":2.4229,"equityReturn":-0.05,"unitMoney":""}
];
`);
assert.deepEqual(
  pingzhongLatestNav,
  { date: "2026-05-24", unitNav: 2.4229, dailyReturnPct: -0.05 },
  "Eastmoney pingzhongdata fallback must recover the latest official NAV when fundgz lacks an intraday estimate"
);
const pingzhongHistory = manager.parseFundPingzhongNavHistoryPoints(`
var Data_netWorthTrend = [
  {"x":1779465600000,"y":2.4100,"equityReturn":0.11,"unitMoney":""},
  {"x":1779552000000,"y":2.4240,"equityReturn":0.58,"unitMoney":""},
  {"x":1779638400000,"y":2.4229,"equityReturn":-0.05,"unitMoney":""}
];
`, new Date("2026-05-23T00:00:00Z"), new Date("2026-05-24T00:00:00Z"));
assert.equal(pingzhongHistory.length, 2, "Eastmoney pingzhongdata fallback must expose enough NAV history points for trend repair");
assert.deepEqual(
  pingzhongHistory[0],
  { date: "2026-05-23", unitNav: 2.424, cumulativeNav: 2.424, dailyReturnPct: 0.58 },
  "pingzhongdata history fallback must normalize points into the same shape as F10 NAV rows"
);
const sinaEstimateNav = manager.parseSinaEstimateNetworthJsonp(`
/*<script>location.href='//sina.com';</script>*/
jsonp_sina_test({"result":{"status":{"code":0},"data":{"worth":"4.8297","worth_date":"20260526","networth":[
  {"symbol":"008327","pre_date":"2026-05-26","min_time":"14:59:00","pre_nav":"4.8205","pre_nav2":"4.8188","growthrate":"-0.0061","growthrate2":"-0.0060"},
  {"symbol":"008327","pre_date":"2026-05-26","min_time":"15:00:00","pre_nav":"4.8210","pre_nav2":"4.8190","growthrate":"-0.0060","growthrate2":"-0.0148"}
]}}})
`);
assert.equal(sinaEstimateNav.code, "008327", "Sina estimate parser must preserve fund code");
assert.equal(sinaEstimateNav.unitNav, 4.8297, "Sina estimate parser must recover latest official NAV");
assert.equal(sinaEstimateNav.estimatedNav, 4.819, "Sina estimate parser must recover latest estimated NAV");
assert.equal(sinaEstimateNav.estimatedChangePct, -1.48, "Sina estimate parser must recover latest estimated change");
assert.equal(sinaEstimateNav.navDate, "2026-05-26", "Sina estimate parser must normalize valuation date");
assert.equal(sinaEstimateNav.estimateTime, "2026-05-26 15:00", "Sina estimate parser must normalize estimate time");
assert.equal(sinaEstimateNav.sourceKind, "sina_intraday_estimate", "Sina estimate parser must label the backup source kind");
assert.equal(sinaEstimateNav.valuationBasis, "盘中估算（新浪备源）", "Sina estimate parser must expose the valuation basis");
assert.equal(sinaEstimateNav.intradaySeries.length, 2, "Sina estimate parser must preserve minute-level valuation series");
assert(sinaEstimateNav.intradayTrend.label.includes("盘中回落"), "Sina estimate parser must summarize minute-level valuation direction");
assert.equal(sinaEstimateNav.intradayTrend.changeFromOpenPct, -0.88, "Sina intraday trend must compare the latest point with the first point");
const haoetfRows = manager.parseHaoetfQdiiValuationRows(`
<p>数据更新时间：2026-05-27 05:02:20</p>
<table><tbody>
<tr>
  <td><a href="/qdii/513100">513100</a></td>
  <td>纳指ETF</td>
  <td>2.0436</td>
  <td class="text-danger">6.92%</td>
  <td>2.0126</td>
  <td class="text-danger">8.57%</td>
  <td>05-22</td>
  <td><a href="http://stocks.sina.cn/fund/?code=513100">2.185</a></td>
  <td class="text-success">-2.06%</td>
  <td>103384.09</td>
  <td>-</td>
  <td>-</td>
  <td>2.0109</td>
  <td class="text-success">-0.08%</td>
  <td>05-25</td>
  <td class="text-danger" data-toggle="tooltip2" title="业绩基准:纳斯达克100指数">0.42%</td>
  <td>100万份</td>
  <td>0.5%</td>
  <td>0.5%</td>
  <td><a href="http://fund.eastmoney.com/513100.html">天天</a></td>
</tr>
</tbody></table>`);
assert.equal(haoetfRows.length, 1, "HaoETF QDII parser must recover realtime valuation table rows");
assert.equal(haoetfRows[0].code, "513100", "HaoETF parser must recover QDII code");
assert.equal(haoetfRows[0].realtimeEstimateNav, 2.0436, "HaoETF parser must recover realtime estimate");
assert.equal(haoetfRows[0].realtimePremiumPct, 6.92, "HaoETF parser must recover realtime premium");
assert.equal(haoetfRows[0].navDate, "2026-05-25", "HaoETF parser must normalize month-day NAV dates using page update year");
assert.equal(haoetfRows[0].benchmarkName, "纳斯达克100指数", "HaoETF parser must preserve benchmark tooltip context");
const haoetfValuation = manager.normalizeHaoetfQdiiValuationRow(haoetfRows[0]);
assert.equal(haoetfValuation.sourceKind, "haoetf_qdii_realtime_estimate", "HaoETF valuation must expose a traceable realtime QDII source kind");
assert.equal(haoetfValuation.gsz, 2.0436, "HaoETF valuation must map realtime estimate into estimated NAV");
assert.equal(haoetfValuation.dwjz, 2.0109, "HaoETF valuation must keep the latest official NAV");
assert.equal(haoetfValuation.gszzl, 1.54, "HaoETF valuation must derive realtime estimate change from latest estimate");
assert.equal(haoetfValuation.realtimePremiumPct, 6.92, "HaoETF valuation must carry premium evidence for QDII timing");
assert.equal(haoetfValuation.gztime, "2026-05-27 05:02:20", "HaoETF valuation must preserve the page update time for freshness checks");
const yangjibaoHeaders = manager.buildYangjibaoPluginHeaders("/index_data", { requestTime: 1779831567 });
assert.equal(yangjibaoHeaders["Request-Sign"], "58f2e965e9bdc1e14ea1d5f5dcab9384", "Yangjibao plugin request signing must match the public browser-plugin protocol");
const yangjibaoFundRows = manager.normalizeYangjibaoFundSearchRows({
  list: [{
    fund_id: "004877",
    short_name: "汇添富全球医疗混合(QDII)人民币",
    content: {
      curr_rate: { gsz: "2.4336", gszzl: "0.40" },
      last_nv: { dwjz: "2.4240", rzzl: "1.72", net_time: "2026-05-22", true_valuation_date: "05-26 14:58" }
    },
    nv_info: { true_valuation_date: "05-26 14:58" }
  }]
});
const yangjibaoFundValuation = manager.normalizeYangjibaoFundSearchValuation(yangjibaoFundRows[0], "004877");
assert.equal(yangjibaoFundValuation.fundcode, "004877", "Yangjibao fund parser must recover the fund code from search_fund rows");
assert.equal(yangjibaoFundValuation.gsz, 2.4336, "Yangjibao fund parser must recover realtime estimated NAV");
assert.equal(yangjibaoFundValuation.gszzl, 0.4, "Yangjibao fund parser must recover realtime estimated change");
assert.equal(yangjibaoFundValuation.dwjz, 2.424, "Yangjibao fund parser must recover official unit NAV");
assert.equal(yangjibaoFundValuation.sourceKind, "yangjibao_search_fund_realtime", "Yangjibao fund valuation must leave a traceable realtime source kind");
assert(yangjibaoFundValuation.valuationBasis.includes("养基宝实时源"), "Yangjibao fund valuation must explain its realtime source in Chinese");
const yangjibaoIndexItems = manager.normalizeYangjibaoIndexData({
  "0.399006": { code: "0.399006", v: "4043.07", dir: "0.54", div: "21.91", date: "2026-05-26 16:30:02", show_code: "399006", name: "创业板指" },
  "1.000001": { code: "1.000001", v: "4145.37", dir: "-0.17", div: "-7.2", date: "2026-05-26 16:30:02", show_code: "000001", name: "上证指数" }
});
assert.equal(yangjibaoIndexItems[0].name, "上证指数", "Yangjibao index parser must keep major A-share indices first");
assert.equal(yangjibaoIndexItems[0].changePct, -0.17, "Yangjibao index parser must recover index percentage change");
assert.equal(yangjibaoIndexItems[0].sourceKind, "yangjibao_plugin_index_data", "Yangjibao index parser must leave a traceable source kind");
const eastmoneyChinaIndex = manager.normalizeEastmoneyChinaIndexQuote({
  f12: "000001",
  f13: 1,
  f14: "上证指数",
  f2: "4146.20",
  f3: "-0.15",
  f4: "-6.37",
  f24: "1.62",
  f124: "1779831600"
});
assert.equal(eastmoneyChinaIndex.secid, "1.000001", "Eastmoney China index parser must preserve secid for dedupe");
assert.equal(eastmoneyChinaIndex.sourceKind, "eastmoney_china_index_realtime", "Eastmoney China index parser must expose a traceable source kind");
const mergedChinaIndices = manager.mergeChinaRealtimeIndexQuotes(yangjibaoIndexItems, [eastmoneyChinaIndex]);
assert.equal(mergedChinaIndices.length, 2, "China realtime index merger must dedupe Yangjibao and Eastmoney rows by secid");
assert.equal(mergedChinaIndices[0].sourceKind, "yangjibao_plugin_index_data", "China realtime index merger must prefer Yangjibao when both sources cover the same index");
assert.equal(mergedChinaIndices[0].fiveDayPct, 1.62, "China realtime index merger must fill missing Yangjibao fields from the Eastmoney backup");
const manualIntradayTrend = manager.summarizeFundIntradayValuationTrend([
  { at: "2026-05-26 09:30", estimatedChangePct: 0.2 },
  { at: "2026-05-26 10:30", estimatedChangePct: 1.1 },
  { at: "2026-05-26 14:30", estimatedChangePct: 0.1 },
  { at: "2026-05-26 15:00", estimatedChangePct: -0.2 }
]);
assert(manualIntradayTrend.label.includes("冲高回落"), "intraday trend summary must flag high-to-close giveback instead of using only the latest estimate");
const tencentHoldingQuotes = manager.parseTencentRealtimeQuotes(`
v_sh688521="1~芯原股份~688521~266.15~286.27~289.20~26615007~12160660~14454347~266.14~2~266.10~5~266.07~2~266.05~4~266.04~2~266.15~27~266.16~7~266.17~15~266.18~8~266.19~152~~20260526161447~-20.12~-7.03~289.36~259.31~266.15/26615007/7178619701";
v_hk00700="100~腾讯控股~00700~439.000~441.400~438.000~32795639.0~0~0~439.000~0~0~0~0~0~0~0~0~0~439.000~0~0~0~0~0~0~0~0~0~32795639.0~2026/05/26 16:08:26~-2.400~-0.54~441.000~432.000~439.000";
`);
assert.equal(tencentHoldingQuotes.length, 2, "Tencent quote parser must recover realtime top-holding quote rows");
assert.equal(tencentHoldingQuotes[0].secid, "1.688521", "Tencent A-share quote parser must map back to Eastmoney secid");
assert.equal(tencentHoldingQuotes[0].changePct, -7.03, "Tencent A-share quote parser must recover realtime percentage change");
assert.equal(tencentHoldingQuotes[1].secid, "116.00700", "Tencent HK quote parser must map back to Eastmoney secid");
const tencentHoldingPulse = manager.buildFundHoldingRealtimePulseFromQuotes([
  { code: "688521", name: "芯原股份", pct: 5 },
  { code: "00700", name: "腾讯控股", pct: 5 }
], tencentHoldingQuotes, { sourceLabel: "腾讯前十大持仓实时行情" });
assert(tencentHoldingPulse.ok, "Tencent quote fallback must feed the top-holding realtime pulse");
assert(tencentHoldingPulse.sourceLabel.includes("腾讯"), "holding pulse must disclose Tencent as a realtime source when used");
assert(tencentHoldingPulse.risks.some((item) => item.includes("盘中走弱")), "Tencent holding pulse must turn realtime weakness into buy/wait evidence");
const mergedPrimaryValuation = manager.mergeFundValuationIntradaySupplement(
  { ok: true, fundcode: "008327", gsz: 4.8258, gszzl: -0.71, gztime: "2026-05-26 15:00", sourceKind: "tiantian_intraday_estimate", source: "https://fundgz.1234567.com.cn/js/008327.js" },
  { ok: true, sourceKind: "sina_intraday_estimate", source: "https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getEstimateNetworthPic?symbol=008327", gsz: 4.819, gszzl: -1.48, gztime: "2026-05-26 15:00", intradaySeries: sinaEstimateNav.intradaySeries, intradayTrend: sinaEstimateNav.intradayTrend }
);
assert.equal(mergedPrimaryValuation.gsz, 4.8258, "Sina intraday supplement must not overwrite the primary realtime estimate");
assert.equal(mergedPrimaryValuation.sourceKind, "tiantian_intraday_estimate", "Sina intraday supplement must preserve the primary valuation source kind");
assert(mergedPrimaryValuation.intradayTrend.label.includes("盘中回落"), "primary realtime valuation must carry supplemental minute-level trend evidence");
assert.equal(mergedPrimaryValuation.supplementalIntradaySourceKind, "sina_intraday_estimate", "merged valuation must disclose the supplemental intraday source");
const originalStaleEstimateMinutes = process.env.FUND_VALUATION_STALE_ESTIMATE_MINUTES;
process.env.FUND_VALUATION_STALE_ESTIMATE_MINUTES = "30";
assert.equal(
  manager.isStaleFundValuation({ ok: true, gsz: 1.23, gztime: "2000-01-01 15:00", jzrq: todayIso }),
  true,
  "intraday valuation freshness must check estimate time, not only official NAV date"
);
if (originalStaleEstimateMinutes === undefined) {
  delete process.env.FUND_VALUATION_STALE_ESTIMATE_MINUTES;
} else {
  process.env.FUND_VALUATION_STALE_ESTIMATE_MINUTES = originalStaleEstimateMinutes;
}
assert.equal(
  manager.summarizePortfolioEquityBrief({ totalAsset: 100000, investedValue: 30000 }).positionWeightPct,
  30,
  "equity history summaries must derive position weight when older records lack positionWeightPct"
);
assert.equal(
  manager.summarizePortfolioEquityBrief({ totalAsset: 100000, investedValue: 30000, positionWeightPct: 0 }).positionWeightPct,
  30,
  "equity history summaries must recover stale 0% position weights when invested value is present"
);
assert.equal(
  manager.summarizePortfolioEquityBrief({ totalAsset: 100000, pendingBuyAmount: 1500, receivableCash: 30000, pendingWeightPct: 0 }).pendingWeightPct,
  1.5,
  "equity history summaries must keep pending buy weight separate from unsettled redemption receivables"
);
assert.equal(
  manager.summarizePortfolioEquityBrief({ totalAsset: 100000, pendingBuyAmount: 1500, receivableCash: 30000, pendingWeightPct: 31.5 }).receivableCashPct,
  30,
  "equity history summaries must expose receivable cash as its own cash component"
);
const separatedCashComponentDb = manager.normalizePortfolioDb({
  account: {
    initialCapital: 100000,
    cash: 68599.17,
    receivableCash: 32098.68,
    positions: []
  },
  orders: [{ side: "BUY", status: "submitted", code: "004877", amount: 1533 }]
});
assert.equal(separatedCashComponentDb.account.pendingWeightPct, 1.5, "live account summaries must not count receivable cash as pending-buy exposure");
assert.equal(separatedCashComponentDb.account.receivableCashPct, 31.4, "live account summaries must keep unsettled redemption cash visible as a separate component");
const staleLiquidatedEquityBrief = manager.summarizePortfolioEquityBrief({
  date: "2026-05-26",
  totalAsset: 102230.85,
  cash: 102230.85,
  investedValue: 0,
  investedCost: 0,
  investedCostBasis: 30002.28,
  cumulativePnl: 2230.85,
  cumulativePnlPct: 0
});
assert.equal(staleLiquidatedEquityBrief.investedCostBasis, 30002.28, "equity history summaries must retain the actual invested denominator after full liquidation");
assert.equal(staleLiquidatedEquityBrief.cumulativePnlPct, 7.44, "equity history summaries must repair stale 0% invested-cost returns after full liquidation");
assert.equal(
  manager.buildPortfolioRedeploymentPlan(
    { totalAsset: 100000, cash: 70000, investedValue: 30000, positionWeightPct: 0, riskBudget: { blockNewBuys: false } },
    [],
    []
  ).pressureActive,
  false,
  "redeployment pressure must not mistake stale 0% stored weights for a truly empty portfolio"
);
const runtimeDiagnostics = manager.buildRuntimeDiagnostics({
  counters: {
    modelCalls: 100,
    modelFailures: 12,
    marketSnapshotCalls: 20,
    marketSnapshotFailures: 6,
    fundHoldingsFetches: 40,
    fundHoldingsFailures: 9,
    fundReportTrendImagesUploaded: 8,
    fundReportTrendImageFailures: 3
  },
  last: {
    lastError: "Your input exceeds the context window of this model."
  }
});
assert.equal(runtimeDiagnostics.level, "critical", "runtime diagnostics must surface severe reliability degradation");
assert(runtimeDiagnostics.items.some((item) => item.label === "模型上下文超限"), "runtime diagnostics must flag context-window failures");
assert(runtimeDiagnostics.items.some((item) => item.label === "市场快照失败"), "runtime diagnostics must flag market data source failures");
assert(runtimeDiagnostics.items.some((item) => item.label === "持仓补全失败"), "runtime diagnostics must flag top-holdings data failures");
const portfolioCapabilityDiagnostics = manager.buildPortfolioCapabilityDiagnostics({
  account: {
    cash: 70000,
    totalAsset: 99671.93,
    investedCost: 30002.28,
    cumulativePnl: -328.07,
    cumulativePnlPct: -1.09,
    positions: [{
      code: "006265",
      name: "红土创新新科技股票A",
      weightPct: 9.85,
      lastNavDate: "2026-05-21",
      profitGivebackPct: 4.82,
      peakUnrealizedPnlPct: 3.24,
      unrealizedPnlPct: -1.58,
      fundSnapshot: {
        trendProfile: { ok: true, trendLabel: "extended_uptrend", entryBias: "wait_pullback" },
        actionability: { decisionBlocker: ["短期涨幅偏热，不符合回调完成后启动的买点。"] },
        topHoldings: ["300308 中际旭创 8.54%", "300502 新易盛 8.36%"]
      }
    }, {
      code: "008327",
      name: "东财通信C",
      weightPct: 11.85,
      lastNavDate: "2000-01-01",
      fundSnapshot: {
        trendProfile: { ok: false, note: "fetch failed" },
        actionability: { holdingsOutlook: { hasHoldings: false } },
        topHoldings: []
      }
    }]
  },
  watchlist: [{ code: "001000", name: "低位候选", status: "waiting_pullback" }],
  transactions: [{ side: "BUY", code: "006265", amount: 10000, nav: null, navDate: "" }],
  runs: [{ date: "2026-05-22", type: "decision", status: "failed", error: "Your input exceeds the context window." }]
});
assert.equal(portfolioCapabilityDiagnostics.level, "critical", "portfolio capability diagnostics must flag severe ledger-derived weaknesses");
assert(portfolioCapabilityDiagnostics.items.some((item) => item.label === "盈利能力承压"), "capability diagnostics must surface actual invested-cost profitability pressure");
assert(portfolioCapabilityDiagnostics.items.some((item) => item.label === "追涨暴露待消化"), "capability diagnostics must surface hot-position chase risk");
assert(portfolioCapabilityDiagnostics.items.some((item) => item.label === "数据质量缺口"), "capability diagnostics must surface stale or missing position evidence");
assert(portfolioCapabilityDiagnostics.items.some((item) => item.label === "成交净值待核验"), "capability diagnostics must surface unverified virtual trade fills");
assert(portfolioCapabilityDiagnostics.items.some((item) => item.label === "现金闲置风险"), "capability diagnostics must flag high-cash portfolios that have stopped deploying for too long");
const pendingProbeDiagnostics = manager.buildPortfolioCapabilityDiagnostics({
  account: {
    cash: 68599.17,
    totalAsset: 102230.85,
    pendingBuyAmount: 1533,
    investedValue: 0,
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [{ code: "004877", name: "汇添富全球医疗混合(QDII)人民币", status: "ready" }],
  transactions: [{ side: "BUY", code: "000001", name: "旧买入", date: "2000-01-01" }],
  orders: [{
    side: "BUY",
    code: "004877",
    name: "汇添富全球医疗混合(QDII)人民币",
    status: "submitted",
    submittedAt: `${todayIso}T06:29:00.000Z`
  }],
  runs: []
});
assert(!pendingProbeDiagnostics.items.some((item) => item.label === "现金闲置风险"), "capability diagnostics must not call a portfolio idle when a fresh starter buy is pending confirmation");
assert(pendingProbeDiagnostics.items.some((item) => item.label === "试探仓跟踪"), "capability diagnostics must require follow-through after a pending starter buy");
assert(
  manager.buildPortfolioCapabilityActionQueue({
    account: {
      cash: 68599.17,
      totalAsset: 102230.85,
      pendingBuyAmount: 1533,
      investedValue: 0,
      riskBudget: { blockNewBuys: false }
    },
    watchlist: [{ code: "004877", name: "汇添富全球医疗混合(QDII)人民币", status: "ready" }],
    transactions: [{ side: "BUY", code: "000001", name: "旧买入", date: "2000-01-01" }],
    orders: [{
      side: "BUY",
      code: "004877",
      name: "汇添富全球医疗混合(QDII)人民币",
      status: "submitted",
      submittedAt: `${todayIso}T06:29:00.000Z`
    }],
    runs: []
  }).some((item) => item.action.includes("加到3%-5%")),
  "capability action queue must turn a pending starter buy into explicit scale/hold/exit triggers"
);
const publicPendingProbeDb = {
  account: {
    cash: 68599.17,
    totalAsset: 102230.85,
    pendingBuyAmount: 1533,
    investedValue: 0,
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [{ code: "004877", name: "汇添富全球医疗混合(QDII)人民币", status: "ready" }],
  recentTransactions: [{ side: "BUY", code: "000001", name: "旧买入", date: "2000-01-01" }],
  recentOrders: [{
    id: "ord_public_pending",
    side: "BUY",
    code: "004877",
    name: "汇添富全球医疗混合(QDII)人民币",
    status: "submitted",
    amount: 1533,
    submittedAt: `${todayIso}T06:29:00.000Z`,
    priceDate: todayIso,
    confirmDate: "2026-05-28"
  }],
  runs: []
};
assert(manager.buildPortfolioCapabilityDiagnostics(publicPendingProbeDb).items.some((item) => item.label === "试探仓跟踪"), "capability diagnostics must recognize starter buys from public recentOrders as well as raw orders");
const starterFollowUpQueue = manager.buildPortfolioStarterBuyFollowUpQueue(publicPendingProbeDb);
assert.equal(starterFollowUpQueue[0].code, "004877", "starter buy follow-up queue must identify the pending QDII starter order");
assert(starterFollowUpQueue[0].followUpAction.includes("确认前不追加"), "pending starter follow-up must forbid adding before NAV/share confirmation");
const starterFollowUpDecision = manager.ensurePortfolioStarterBuyFollowUpReviewed({ actions: [], learningNotes: [] }, publicPendingProbeDb);
assert.equal(starterFollowUpDecision.actions[0].action, "WATCH", "pending starter follow-up guard must inject a WATCH action before confirmation");
assert(starterFollowUpDecision.actions[0].riskControl.includes("加到3%-5%"), "starter follow-up action must carry scale/hold/exit triggers");
assert(serverSource.includes("capabilityDiagnostics: buildPortfolioCapabilityDiagnostics(db)"), "portfolio API must expose capability diagnostics");
assert(serverSource.includes("capabilityActionQueue: buildPortfolioCapabilityActionQueue(db)"), "portfolio API must expose capability repair action queue");
assert(serverSource.includes("backtestDiagnostics: buildPortfolioBacktestDiagnostics(db)"), "portfolio API must expose historical backtest diagnostics");
assert(adminSource.includes("buildCapabilityInsightItems") && adminHtmlSource.includes("portfolioCapabilitySummary"), "admin UI must render portfolio capability diagnostics");
assert(adminSource.includes("renderCapabilityActionQueue") && adminHtmlSource.includes("portfolioCapabilityActionQueue"), "admin UI must render concrete capability repair tasks");
assert(adminSource.includes("buildBacktestInsightItems") && adminHtmlSource.includes("portfolioBacktestSummary"), "admin UI must render historical backtest diagnostics");
const backtestFixture = {
  account: {
    cash: 88000,
    receivableCash: 8000,
    pendingBuyAmount: 1000,
    totalAsset: 100000,
    positionWeightPct: 0,
    investedValue: 0,
    positions: [],
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [{ code: "004877", name: "低位候选", status: "waiting_pullback" }],
  transactions: [
    { date: "2026-05-12", side: "BUY", code: "006265", name: "红土创新新科技股票A", amount: 10000, nav: 1, navDate: "2026-05-11" },
    { date: "2026-05-26", side: "SELL", code: "006265", name: "红土创新新科技股票A", amount: 8000, nav: 1.1, navDate: "2026-05-25" },
    { date: "2026-05-26", side: "SELL", code: "006265", name: "红土创新新科技股票A", amount: 2000, nav: 1.1, navDate: "2026-05-25" }
  ],
  orders: [
    { date: "2026-05-26", side: "SELL", code: "006265", status: "confirmed" },
    { id: "stale_sell", side: "SELL", code: "008327", name: "旧赎回订单", amount: 3000, status: "queued", priceDate: "2026-05-20", confirmDate: "2026-05-21", submittedAt: "2026-05-20T06:00:00.000Z" }
  ],
  settlements: [
    { id: "set_keep", orderId: "ord_dup_settle", code: "006265", name: "红土创新新科技股票A", amount: 8000, dueDate: "2026-05-28", status: "pending", createdAt: "2026-05-26T01:00:00.000Z" },
    { id: "set_dup", orderId: "ord_dup_settle", code: "006265", name: "红土创新新科技股票A", amount: 2000, dueDate: "2026-05-28", status: "pending", createdAt: "2026-05-26T06:00:00.000Z" }
  ],
  runs: [
    {
      date: "2026-05-13",
      type: "decision",
      status: "completed",
      summary: "买入后复核：006265 extended_uptrend，entryBias wait_pullback，近20日+18%，120日位置96%。",
      actions: [{ action: "BUY", code: "006265", reason: "趋势强但已偏热" }]
    },
    {
      date: "2026-05-21",
      type: "decision",
      status: "completed",
      summary: "006265 偏热、等待回撤、浮盈回吐，但继续HOLD。",
      actions: [{ action: "HOLD", code: "006265", reason: "偏热等待回撤，先观察" }]
    },
    {
      date: "2026-05-22",
      type: "decision",
      status: "failed",
      summary: "今日决策失败",
      error: "stream error"
    },
    {
      date: "2026-05-23",
      type: "decision",
      status: "completed",
      summary: "006265 高位集中，出现减仓线索，但继续HOLD。",
      actions: [{ action: "HOLD", code: "006265", reason: "高位集中，需减仓复核" }]
    }
  ]
};
const portfolioBacktestDiagnostics = manager.buildPortfolioBacktestDiagnostics(backtestFixture);
assert.equal(portfolioBacktestDiagnostics.level, "critical", "historical backtest diagnostics must flag severe replayed defects");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "重复成交回测"), "backtest diagnostics must catch duplicate same-day same-fund fills");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "订单卡滞回测"), "backtest diagnostics must catch stale active orders that still affect the ledger");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "重复应收回测"), "backtest diagnostics must catch duplicated settlement receivables");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "追高买入回测"), "backtest diagnostics must catch hot/chase entries after replay");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "卖出滞后回测"), "backtest diagnostics must catch delayed sell discipline");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "运行中断回测"), "backtest diagnostics must catch decision continuity failures");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "空仓等待回测"), "backtest diagnostics must catch excessive idle cash after de-risking");
assert(portfolioBacktestDiagnostics.items.some((item) => item.label === "试探仓后续回测"), "backtest diagnostics must require a scale-or-exit plan after tiny starter buys");
const idleCashBacktestItem = portfolioBacktestDiagnostics.items.find((item) => item.label === "空仓等待回测");
assert(idleCashBacktestItem.value.includes("可用现金"), "idle-cash backtest must use deployable cash rather than unsettled receivables as the headline denominator");
assert(idleCashBacktestItem.note.includes("应收赎回"), "idle-cash backtest must still disclose pending redemption cash separately");
assert(portfolioBacktestDiagnostics.phases.length >= 3, "backtest diagnostics must split history into replay phases");
const backtestCapabilityDiagnostics = manager.buildPortfolioCapabilityDiagnostics(backtestFixture);
assert(backtestCapabilityDiagnostics.items.some((item) => item.label === "重复成交回测"), "capability diagnostics must absorb historical backtest defects");
const receivableCapabilityDiagnostics = manager.buildPortfolioCapabilityDiagnostics({
  account: {
    cash: 15000,
    receivableCash: 70000,
    pendingBuyAmount: 0,
    totalAsset: 100000,
    positionWeightPct: 0,
    positions: [],
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [],
  transactions: [],
  orders: [],
  settlements: [],
  runs: []
});
assert(receivableCapabilityDiagnostics.items.some((item) => item.label === "赎回款在途"), "capability diagnostics must explain unsettled redemption cash before judging waiting behavior");
const backtestActionQueue = manager.buildPortfolioCapabilityActionQueue(backtestFixture);
assert(backtestActionQueue.some((item) => item.action.includes("重复订单")), "capability action queue must turn duplicate-fill replay into an execution repair task");
assert(backtestActionQueue.some((item) => item.action.includes("卡滞订单")), "capability action queue must turn stale active orders into an execution repair task");
assert(backtestActionQueue.some((item) => item.action.includes("重复pending应收")), "capability action queue must turn duplicated settlements into a receivable repair task");
assert(backtestActionQueue.some((item) => item.action.includes("0.5%-2.5%试探仓")), "capability action queue must turn idle-cash replay into a redeployment task");
assert(backtestActionQueue.some((item) => item.action.includes("加到3%-5%")), "capability action queue must turn starter-buy underdeployment into a scale-or-exit task");
const ledgerGuardedBuy = manager.enforcePortfolioLedgerIntegrityGuard([
  { action: "BUY", code: "004877", name: "低位医药候选", amount: 1500, targetWeightPct: 1.5, reason: "低位回调修复" }
], backtestFixture);
assert.equal(ledgerGuardedBuy[0].action, "WATCH", "ledger integrity guard must block new buys while duplicate trades or stale orders can distort cash");
assert.equal(ledgerGuardedBuy[0].amount, 0, "ledger integrity guard must zero blocked buy amounts");
assert(ledgerGuardedBuy[0].reason.includes("系统账本完整性拦截"), "ledger integrity guard must explain the buy block in user-readable Chinese");
assert(ledgerGuardedBuy[0].dataBasis.includes("来源：portfolio_ledger_integrity_guard"), "ledger integrity guard must leave a traceable source");
const givebackLossBacktestFixture = {
  account: {
    cash: 30000,
    totalAsset: 100000,
    positionWeightPct: 10,
    investedValue: 10000,
    positions: [{
      code: "000011",
      name: "热门强势主题基金A",
      currentValue: 10000,
      weightPct: 10,
      unrealizedPnlPct: 6,
      peakUnrealizedPnlPct: 12,
      profitGivebackPct: 6
    }],
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [],
  transactions: [],
  orders: [],
  settlements: [],
  runs: []
};
const givebackLossBacktest = manager.buildPortfolioBacktestDiagnostics(givebackLossBacktestFixture);
assert(givebackLossBacktest.items.some((item) => item.label === "利润回吐放任回测"), "backtest diagnostics must quantify unprotected profit giveback on still-held positions");
assert(
  givebackLossBacktest.items.find((item) => item.label === "利润回吐放任回测")?.note.includes("少保住约150元"),
  "profit-giveback diagnostics must translate missed protective trimming into an estimated yuan impact"
);
assert(
  manager.buildPortfolioCapabilityActionQueue(givebackLossBacktestFixture).some((item) => item.action.includes("浮盈回吐不是纸面波动")),
  "capability action queue must turn unprotected profit giveback into a concrete sell-discipline repair task"
);
const conservativeBacktestFixture = {
  account: {
    cash: 82000,
    receivableCash: 0,
    pendingBuyAmount: 0,
    totalAsset: 100000,
    positionWeightPct: 4,
    investedValue: 4000,
    positions: [{ code: "000001", name: "试探仓基金", currentValue: 4000, costAmount: 4000 }],
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [
    { code: "010802", name: "低位消费候选C", status: "waiting_pullback" },
    {
      code: "012046",
      name: "医药修复候选C",
      status: "ready",
      readinessScore: 92,
      readinessLabel: "低位转强",
      lastSnapshot: {
        shareClass: "C",
        fees: {
          shareClass: "C",
          shareClassFeeModel: { type: "sales_service_fee", label: "C类：销售服务费" },
          salesServiceFeePct: 0.4,
          feeImpact: { oneYearCostPer10000: 40, missingFeeData: [] }
        },
        trendProfile: {
          ok: true,
          trendLabel: "uptrend",
          entryBias: "buyable_now",
          return5dPct: 1.4,
          return10dPct: 2.8,
          return20dPct: 5.6,
          return60dPct: 8.2,
          pullbackSetup: { signal: "pullback_complete", signalText: "回调完成" }
        }
      }
    }
  ],
  runs: [
    { date: "2026-05-21", type: "decision", status: "completed", summary: "继续等待机会，暂不买入。", actions: [{ action: "WATCH", code: "010802", reason: "观察" }] },
    { date: "2026-05-22", type: "decision", status: "completed", summary: "仍然观望，没有合格买点，0元执行。", actions: [{ action: "HOLD", code: "000001", reason: "等待确认" }] },
    { date: "2026-05-25", type: "decision", status: "completed", summary: "继续看低位候选，但未提交申购。", actions: [{ action: "WATCH", code: "012046", reason: "等待机会" }] }
  ],
  transactions: [],
  orders: [],
  settlements: []
};
const conservativeBacktest = manager.buildPortfolioBacktestDiagnostics(conservativeBacktestFixture);
assert(conservativeBacktest.items.some((item) => item.label === "过度保守回测"), "backtest diagnostics must detect repeated wait-only decisions under high cash");
assert(conservativeBacktest.items.some((item) => item.label === "买点错过回测"), "backtest diagnostics must detect ready candidates that remain unexecuted under high cash");
assert(conservativeBacktest.items.some((item) => item.label === "机会成本回测"), "backtest diagnostics must estimate opportunity cost when unbought ready candidates keep rising");
const conservativeRankingBoard = manager.buildPortfolioRankingBoard(manager.normalizePortfolioDb(JSON.parse(JSON.stringify(conservativeBacktestFixture))));
const opportunityCostList = conservativeRankingBoard.lists.find((item) => item.id === "opportunity_cost");
assert(opportunityCostList?.items.some((item) => item.code === "012046"), "manager ranking board must surface missed follow-through funds in the opportunity-cost list");
assert(opportunityCostList?.items[0]?.decision?.nextStep.includes("小仓试探"), "opportunity-cost ranking items must force probe, downgrade, or review-time decisions");
assert(
  conservativeBacktest.items.find((item) => item.label === "机会成本回测")?.note.includes("少赚约140元"),
  "opportunity-cost diagnostics must translate missed starter position gains into an estimated yuan impact"
);
assert(conservativeBacktest.items.some((item) => item.label === "仓位冻结回测"), "backtest diagnostics must detect portfolios whose position structure freezes across decision runs");
assert(
  manager.buildPortfolioCapabilityActionQueue(conservativeBacktestFixture).some((item) => item.action.includes("连续等待不能算完成工作")),
  "capability action queue must turn over-conservative replay into a concrete redeployment task"
);
assert(
  manager.buildPortfolioCapabilityActionQueue(conservativeBacktestFixture).some((item) => item.action.includes("自选池ready不能只收藏")),
  "capability action queue must turn missed ready candidates into concrete trial-or-downgrade tasks"
);
assert(
  manager.buildPortfolioCapabilityActionQueue(conservativeBacktestFixture).some((item) => item.action.includes("等待后继续走强要被追责")),
  "capability action queue must turn missed follow-through into a concrete opportunity-cost repair task"
);
assert(
  manager.buildPortfolioCapabilityActionQueue(conservativeBacktestFixture).some((item) => item.action.includes("仓位不能停在第一轮操作")),
  "capability action queue must turn frozen-position replay into a concrete position-change task"
);
const blockedFollowThroughFixture = {
  account: {
    cash: 90000,
    receivableCash: 0,
    pendingBuyAmount: 0,
    totalAsset: 100000,
    positionWeightPct: 0,
    investedValue: 0,
    positions: [],
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [{
    code: "018589",
    name: "农银信息传媒股票C",
    status: "blocked",
    readinessScore: 24,
    reason: "基金规模0.24亿偏小，不能作为可直接买入候选。",
    buyTriggers: ["规模恢复至可接受水平并确认无清盘/流动性风险"],
    feeNotes: ["C类销售服务费0.40%/年"],
    lastSnapshot: {
      trendProfile: {
        ok: true,
        trendLabel: "uptrend",
        entryBias: "buyable_now",
        return5dPct: 3.2,
        return10dPct: 5.4,
        return20dPct: 6.1,
        return60dPct: 8,
        pullbackSetup: { signal: "pullback_complete", signalText: "回调完成" }
      }
    }
  }],
  runs: [
    { date: "2026-05-21", type: "decision", status: "completed", summary: "继续等待机会，暂不买入。", actions: [] },
    { date: "2026-05-22", type: "decision", status: "completed", summary: "仍然观望，没有合格买点。", actions: [] },
    { date: "2026-05-25", type: "decision", status: "completed", summary: "等待机会。", actions: [] }
  ],
  transactions: [],
  orders: [],
  settlements: []
};
const blockedFollowThroughBacktest = manager.buildPortfolioBacktestDiagnostics(blockedFollowThroughFixture);
assert(!blockedFollowThroughBacktest.items.some((item) => item.label === "机会成本回测"), "blocked follow-through candidates must not be counted as executable opportunity cost");
assert(blockedFollowThroughBacktest.items.some((item) => item.label === "候选质量缺口回测"), "blocked candidates that later rise must be attributed to candidate-quality or data-source gaps");
assert(
  manager.buildPortfolioCapabilityActionQueue(blockedFollowThroughFixture).some((item) => item.action.includes("同主题可执行替代候选")),
  "capability queue must turn blocked follow-through into data/source expansion work rather than chase pressure"
);
const dataBlockedFixture = {
  account: {
    cash: 76000,
    receivableCash: 0,
    pendingBuyAmount: 0,
    totalAsset: 100000,
    positionWeightPct: 0,
    investedValue: 0,
    positions: [],
    riskBudget: { blockNewBuys: false }
  },
  watchlist: [{
    code: "012046",
    name: "大成医药健康股票C",
    status: "waiting_pullback",
    readinessScore: 58,
    reason: "低位回调修复候选，但净值下钻暂不可用，先观察。",
    setupEvidence: ["净值验证：fetch failed", "低位启动前夜候选"],
    lastSnapshot: {
      trendProfile: { ok: false, note: "fetch failed" }
    }
  }],
  runs: [],
  transactions: [],
  orders: [],
  settlements: []
};
const dataBlockedBacktest = manager.buildPortfolioBacktestDiagnostics(dataBlockedFixture);
assert(dataBlockedBacktest.items.some((item) => item.label === "候选数据源阻塞回测"), "backtest diagnostics must distinguish data-source blockage from a true lack of fund opportunities");
assert(
  manager.buildPortfolioCapabilityActionQueue(dataBlockedFixture).some((item) => item.action.includes("抓取失败当成没有机会")),
  "capability queue must turn data-blocked candidates into explicit data-source repair work"
);
assert.equal(
  manager.shouldForcePortfolioDataBlockedSeedScan(dataBlockedFixture.account, dataBlockedFixture.watchlist),
  true,
  "data-blocked candidates should force a replacement seed scan when cash is deployable"
);
const dataBlockedKeywords = manager.inferPortfolioBlockedFollowThroughSearchKeywords(dataBlockedFixture.watchlist);
assert(dataBlockedKeywords.includes("医药"), "data-blocked replacement scan must infer theme keywords from the blocked candidate");
const dataBlockedSearchText = manager.buildPortfolioWatchlistSeedSearchText(dataBlockedFixture.watchlist);
assert(dataBlockedSearchText.includes("同主题替代"), "data-blocked seed search text must explicitly search for same-theme substitutes");
assert(dataBlockedSearchText.includes("医药"), "data-blocked seed search text must carry blocked-candidate themes into low-position recall");
assert.equal(
  manager.buildPortfolioMissedFollowThroughReviewQueue(blockedFollowThroughFixture).length,
  0,
  "missed follow-through review queue must not force reviews for blocked or structurally unbuyable candidates"
);
assert.equal(
  manager.shouldForcePortfolioBlockedFollowThroughSeedScan(blockedFollowThroughFixture.account, blockedFollowThroughFixture.watchlist),
  true,
  "blocked follow-through should force a replacement seed scan when cash is deployable"
);
const blockedFollowThroughKeywords = manager.inferPortfolioBlockedFollowThroughSearchKeywords(blockedFollowThroughFixture.watchlist);
assert(blockedFollowThroughKeywords.includes("传媒"), "blocked follow-through replacement scan must infer theme keywords from the blocked candidate");
const blockedReplacementSearchText = manager.buildPortfolioWatchlistSeedSearchText(blockedFollowThroughFixture.watchlist);
assert(blockedReplacementSearchText.includes("传媒"), "replacement seed search text must carry blocked-candidate themes into low-position recall");
const missedFollowThroughReviewQueue = manager.buildPortfolioMissedFollowThroughReviewQueue(conservativeBacktestFixture);
assert.equal(missedFollowThroughReviewQueue[0].code, "012046", "missed follow-through review queue must surface the ready candidate that kept rising");
assert(missedFollowThroughReviewQueue[0].reviewAction.includes("小仓试探"), "missed follow-through review queue must require a probe, downgrade, or review time");
const missedFollowThroughDecision = manager.ensurePortfolioMissedFollowThroughReviewed(
  { actions: [], learningNotes: [] },
  conservativeBacktestFixture
);
assert.equal(missedFollowThroughDecision.actions[0].action, "BUY", "missed follow-through guard must inject a small BUY review for a ready candidate");
assert.equal(missedFollowThroughDecision.actions[0].targetWeightPct, 1.5, "missed follow-through guard must keep the injected review to a starter size");
assert(missedFollowThroughDecision.actions[0].dataBasis.includes("来源：portfolio_missed_follow_through_guard"), "missed follow-through guard must leave a traceable source");
assert.equal(manager.findStalePortfolioActiveOrders(backtestFixture.orders, "2026-05-27").length, 1, "stale active order detector must find overdue queued/submitted/priced orders");
assert.equal(
  manager.findStalePortfolioActiveOrders([...backtestFixture.orders, backtestFixture.orders[1]], "2026-05-27").length,
  1,
  "stale active order detector must dedupe repeated API/order-list views by id"
);
assert.equal(
  manager.findStalePortfolioActiveOrders([{ side: "BUY", code: "004877", status: "submitted", priceDate: "2026-05-26", confirmDate: "2026-05-28" }], "2026-05-27").length,
  0,
  "submitted QDII or fund orders must not be marked stale before the confirmation date"
);
assert.equal(
  manager.shouldRejectImpossiblePortfolioSellOrder({ account: { positions: [] } }, { side: "SELL", code: "008327", requestedUnits: 100 }),
  true,
  "order lifecycle must reject stale sell orders when there is no remaining position to sell"
);
const capabilityActionQueue = manager.buildPortfolioCapabilityActionQueue({
  account: {
    cash: 70000,
    totalAsset: 99671.93,
    investedCost: 30002.28,
    cumulativePnl: -328.07,
    cumulativePnlPct: -1.09,
    positions: [{
      code: "006265",
      name: "红土创新新科技股票A",
      weightPct: 9.85,
      profitGivebackPct: 4.82,
      fundSnapshot: {
        trendProfile: { ok: true, trendLabel: "extended_uptrend", entryBias: "wait_pullback" },
        actionability: { decisionBlocker: ["短期涨幅偏热，不符合回调完成后启动的买点。"] },
        topHoldings: ["300308 中际旭创 8.54%"]
      }
    }]
  },
  transactions: [{ side: "BUY", code: "006265", amount: 10000, nav: null, navDate: "" }]
});
assert(capabilityActionQueue.some((item) => item.action.includes("先解释亏损来源")), "capability action queue must turn profitability pressure into a required review task");
assert(capabilityActionQueue.some((item) => item.action.includes("暂停新增同线买入")), "capability action queue must turn chase-risk exposure into a buy-discipline task");
assert(capabilityActionQueue.some((item) => item.action.includes("不能只说等待机会")), "capability action queue must force concrete work when high cash becomes idle");
const capabilityProfileContext = manager.buildPortfolioManagerProfileContext({
  portfolioPremarketTime: "09:00",
  portfolioDecisionTime: "14:20",
  portfolioReviewTime: "21:30",
  portfolioWeeklyReviewDay: 5,
  portfolioWeeklyReviewTime: "16:30",
  portfolioRiskProfile: "balanced",
  portfolioManagerProfile: "测试经理画像"
}, {
  account: {
    cash: 70000,
    totalAsset: 99671.93,
    investedCost: 30002.28,
    cumulativePnl: -328.07,
    cumulativePnlPct: -1.09,
    positions: [{
      code: "006265",
      name: "红土创新新科技股票A",
      weightPct: 9.85,
      fundSnapshot: { trendProfile: { ok: true, trendLabel: "extended_uptrend", entryBias: "wait_pullback" } }
    }]
  },
  watchlist: [],
  runs: [],
  orders: [],
  transactions: []
});
assert(capabilityProfileContext.includes("组合能力诊断") && capabilityProfileContext.includes("能力修复队列"), "manager profile context must carry capability diagnostics into every portfolio model call");
assert(capabilityProfileContext.includes("历史回测诊断"), "manager profile context must carry historical backtest diagnostics into every portfolio model call");
assert(serverSource.includes("能力修复队列（必须进入 team.主席、team.风控经理、actions 或 learningNotes）"), "portfolio decision prompt must force capability repair tasks into decisions");
assert(serverSource.includes("经理多角度榜单（系统计算，必须先看榜单再决定）"), "portfolio decision prompt must force manager ranking boards into decisions");
assert(serverSource.includes("rankingBasis"), "portfolio actions must preserve the ranking basis behind each recommendation");
assert(serverSource.includes("buildPortfolioWatchRankingCitationMap"), "portfolio status replies must be able to cite which ranking lanes reference each watchlist fund");
assert(serverSource.includes("formatPortfolioWatchRankingCitationText"), "portfolio status replies must format ranking citations in customer-readable watchlist lines");
assert(serverSource.includes("buildPortfolioCashRedeploymentRanking"), "portfolio ranking board must include a cash-redeployment lane to fight over-conservative waiting");
assert(serverSource.includes("cash_redeployment"), "portfolio decision prompt and ranking guards must reference the cash-redeployment lane");
assert(serverSource.includes("buildPortfolioPositionSizingRanking"), "portfolio ranking board must include a position-sizing lane to convert buy candidates into weight limits");
assert(serverSource.includes("position_sizing"), "portfolio decision prompt and ranking guards must reference the position-sizing lane");
assert(serverSource.includes("buildPortfolioQualityScoreRanking"), "portfolio ranking board must include a fund-quality lane to avoid buying weak products on timing alone");
assert(serverSource.includes("quality_score"), "portfolio decision prompt and ranking guards must reference the fund-quality lane");
assert(serverSource.includes("buildPortfolioManagerStabilityRanking"), "portfolio ranking board must include a manager-stability lane to avoid buying products with unstable manager history");
assert(serverSource.includes("manager_stability"), "portfolio decision prompt and ranking guards must reference the manager-stability lane");
assert(serverSource.includes("buildPortfolioFitRanking"), "portfolio ranking board must include a portfolio-fit lane to prevent duplicate same-theme buying");
assert(serverSource.includes("buildPortfolioReplacementChoiceRanking"), "portfolio ranking board must include a replacement-choice lane to compare same-fund share classes and same-exposure alternatives");
assert(serverSource.includes("replacement_choice"), "portfolio decision prompt and ranking guards must reference the replacement-choice lane");
assert(serverSource.includes("portfolio_fit"), "portfolio decision prompt and ranking guards must reference the portfolio-fit lane");
const portfolioDecisionCapabilitySource = serverSource.slice(
  serverSource.indexOf("async function executePortfolioDecision"),
  serverSource.indexOf("async function executePortfolioValuation")
);
assert(portfolioDecisionCapabilitySource.includes("const capabilityDiagnostics = buildPortfolioCapabilityDiagnostics(db)"), "portfolio decision must compute full-ledger capability diagnostics after order lifecycle processing");
assert(portfolioDecisionCapabilitySource.includes("const capabilityActionQueue = buildPortfolioCapabilityActionQueue(db)"), "portfolio decision must compute full-ledger capability repair tasks");
assert(portfolioDecisionCapabilitySource.includes("capabilityDiagnostics,") && portfolioDecisionCapabilitySource.includes("capabilityActionQueue"), "portfolio decision must pass capability diagnostics and repair tasks into the model prompt");
assert(portfolioDecisionCapabilitySource.includes("const managerRankings = buildPortfolioRankingBoard(db)"), "portfolio decision must compute current manager ranking boards before model calls");
assert(portfolioDecisionCapabilitySource.includes("managerRankings"), "portfolio decision must pass manager ranking boards into the model prompt and run audit");
const pollutedLocalStatsDiagnostics = manager.buildRuntimeDiagnostics({
  counters: {
    messageEvents: 0,
    conversations: 0,
    answersSent: 0,
    portfolioRuns: 0,
    fundAnswerQualityFailures: 132,
    fundAnswerQualityDeterministicFallbacks: 131,
    modelCalls: 7,
    modelFailures: 7
  }
});
assert(pollutedLocalStatsDiagnostics.items.some((item) => item.label === "统计样本疑似测试噪音"), "runtime diagnostics must flag stats with failures but no real customer activity as likely test noise");
assert(adminSource.includes("renderRuntimeDiagnostics") && adminHtmlSource.includes("runtimeDiagnostics"), "admin runtime UI must render diagnostics cards");
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
assert(
  serverSource.includes("MIN_EFFECTIVE_MODEL_MAX_OUTPUT_TOKENS = DEFAULT_MODEL_MAX_OUTPUT_TOKENS") &&
    serverSource.includes("next.modelMaxOutputTokens = Math.max(MIN_EFFECTIVE_MODEL_MAX_OUTPUT_TOKENS"),
  "effective config must raise stale persisted model output caps instead of letting old 1800-token settings constrain answers"
);
assert(
  serverSource.includes("MIN_EFFECTIVE_REPLY_MAX_CHARS = DEFAULT_REPLY_MAX_CHARS") &&
    serverSource.includes("next.replyMaxChars = Math.max(MIN_EFFECTIVE_REPLY_MAX_CHARS"),
  "effective config must raise stale persisted reply character caps instead of letting old 6000-char settings truncate answers"
);
assert(
  capabilityProfileContext.includes("轮动纪律") && capabilityProfileContext.includes("板块轮动、低位修复、拥挤度"),
  "stored manager profiles must be upgraded with the rotation/chase discipline even when config still contains an older profile"
);
assertSkillCoverage(manager.defaultSkillIdsForWorkflow("portfolio_status"), [
  "fund-portfolio-profile",
  "fund-portfolio-research",
  "fund-theme-radar",
  "theme-stage-analysis",
  "forward-looking-actionability",
  "fund-market-timing",
  "fund-fee-share-class",
  "fund-actionability-evaluation",
  "fund-answer-quality",
  "fund-portfolio-decision",
  "fund-portfolio-execution"
], "portfolio status default workflow");
assertSkillCoverage(manager.allowedSkillIdsForWorkflow("portfolio_status"), [
  "fund-portfolio-premarket",
  "fund-portfolio-weekly",
  "fund-portfolio-review",
  "fund-market-timing",
  "fund-answer-quality"
], "portfolio status allowed workflow");

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
assert.deepEqual(
  manager.inferPullbackSetupSearchKeywords("黄金里面找一个回调完成、低位、准备启动的基金", [
    { id: "precious_metals", name: "黄金/贵金属", positionSignal: "low_position_rotation", lowPositionScore: 58, fundKeywords: ["黄金", "贵金属", "白银"] }
  ]),
  ["黄金", "贵金属"],
  "explicit precious-metal setup requests must still search precious-metal funds"
);

await assertIntent({
  userText: "建立用户“admin”的持仓情况",
  expectedWorkflow: "user_portfolio_import",
  expectedReason: "text_requests_user_portfolio_import",
  expectedMode: "awaiting_user_holdings_screenshot",
  requiredSkills: ["fund-vision", "fund-data-enrichment", "fund-answer-quality"]
});
await assertIntent({
  userText: "建立用户admin的持仓情况",
  imageKeys: ["img_user_portfolio"],
  messageType: "image",
  expectedWorkflow: "user_portfolio_import",
  expectedReason: "message_contains_image_user_portfolio_import_request",
  expectedMode: "screenshot_user_holdings_import",
  requiredSkills: ["fund-vision", "fund-data-enrichment", "fund-actionability-evaluation", "fund-answer-quality"]
});
assert(serverSource.includes("pendingUserPortfolioImportRequests"), "text-first user holding import commands must wait for the next screenshot");
assert(adminHtmlSource.includes("用户持仓终端"), "admin UI must expose user-level holding management as a focused terminal");
assert(adminSource.includes("/api/user-portfolios/holding"), "admin UI must save user-level holdings through the API");
assert(adminSource.includes("data-user-portfolio-select"), "admin UI must switch between user holding accounts without rendering every user as one long page");
assert(adminStyleSource.includes("user-terminal"), "admin UI must style user holding management as a bounded terminal workspace");
assert(adminStyleSource.includes("user-portfolio-detail-stage"), "admin UI must keep selected user holdings in an internally scrollable detail stage");
assert(adminHtmlSource.includes("经理榜单"), "admin UI must expose manager ranking boards");
assert(adminHtmlSource.includes("data-portfolio-view-target=\"rankings\""), "admin portfolio UI must split the long virtual account page into ranking workspace entries");
assert(adminHtmlSource.includes("data-portfolio-view=\"watchlist\""), "admin portfolio UI must expose watchlist as a dedicated workspace view instead of a long mixed page");
assert(adminHtmlSource.includes("持仓终端"), "admin portfolio UI must present holdings as a focused terminal workspace");
assert(adminHtmlSource.includes("data-portfolio-view-target=\"risk\""), "admin portfolio UI must expose a dedicated risk-defense workspace entrance instead of burying risk inside a long ranking page");
assert(adminHtmlSource.includes("data-portfolio-view=\"risk\""), "admin portfolio UI must render risk defense as a dedicated workspace view");
assert(adminHtmlSource.includes("data-portfolio-view-target=\"data\""), "admin portfolio UI must expose a dedicated data-confidence workspace entrance");
assert(adminHtmlSource.includes("data-portfolio-view=\"data\""), "admin portfolio UI must render data confidence as a dedicated workspace view");
assert(adminHtmlSource.includes("data-portfolio-view-target=\"sectors\""), "admin portfolio UI must expose a dedicated sector leaderboard workspace entrance");
assert(adminHtmlSource.includes("data-portfolio-view=\"sectors\""), "admin portfolio UI must render sector opportunities as a dedicated workspace view");
assert(adminHtmlSource.includes("data-portfolio-view-target=\"actions\""), "admin portfolio UI must expose a dedicated action desk workspace entrance");
assert(adminHtmlSource.includes("data-portfolio-view=\"actions\""), "admin portfolio UI must render latest manager actions as a dedicated workspace view");
assert(adminHtmlSource.includes("data-portfolio-view-target=\"alerts\""), "admin portfolio UI must expose a dedicated alert desk workspace entrance");
assert(adminHtmlSource.includes("data-portfolio-view=\"alerts\""), "admin portfolio UI must render the alert desk as a dedicated workspace view");
assert(adminHtmlSource.includes("data-portfolio-view-target=\"matrix\""), "admin portfolio UI must expose a dedicated decision-matrix workspace entrance");
assert(adminHtmlSource.includes("data-portfolio-view=\"matrix\""), "admin portfolio UI must render the decision matrix as a dedicated workspace view");
assert(adminSource.includes("setPortfolioView"), "admin portfolio UI must switch between virtual account workspace views");
assert(adminHtmlSource.includes("portfolioWorkspaceCards"), "admin portfolio overview must expose workspace shortcut cards");
assert(adminSource.includes("renderPortfolioWorkspaceCards"), "admin portfolio overview must summarize each workspace with actionable shortcut cards");
assert(adminHtmlSource.includes("portfolioRankingRadar"), "admin portfolio overview must expose a compact ranking radar");
assert(adminSource.includes("renderPortfolioRankingRadar"), "admin portfolio overview must render buy/watch/avoid ranking radar lanes");
assert(adminSource.includes("renderPortfolioRankingRadarPriority"), "admin portfolio overview must expose the cross-ranking priority queue without opening the full ranking page");
assert(adminSource.includes("renderPortfolioRiskBoard"), "admin portfolio UI must render a compact risk-defense board outside the full ranking page");
assert(adminSource.includes("renderPortfolioSectorBoard"), "admin portfolio UI must render a compact sector leaderboard outside the full ranking page");
assert(adminSource.includes("renderPortfolioDataBoard"), "admin portfolio UI must render a compact data-confidence board outside the full ranking page");
assert(adminSource.includes("renderPortfolioDecisionMatrixBoard"), "admin portfolio UI must render a compact decision matrix outside the full ranking page");
assert(adminSource.includes("renderPortfolioActionDesk"), "admin portfolio UI must render a compact action desk outside the long run timeline");
assert(adminSource.includes("renderPortfolioAlertBoard"), "admin portfolio UI must render a compact alert desk outside the long run timeline");
assert(adminSource.includes("PORTFOLIO_POSITION_LANES"), "admin portfolio positions view must split holdings into risk, profit, core, and watch lanes");
assert(adminStyleSource.includes("portfolio-ranking-radar-grid"), "admin portfolio ranking radar must be styled as a scannable three-lane board");
assert(adminStyleSource.includes("portfolio-ranking-radar-priority"), "admin portfolio ranking radar must style the priority queue as a compact strip");
assert(adminStyleSource.includes("risk-terminal"), "admin portfolio risk-defense board must be styled as a bounded terminal panel");
assert(adminStyleSource.includes("risk-lane-grid"), "admin portfolio risk-defense board must split drawdown, sell, chase, and user alerts into lanes");
assert(adminStyleSource.includes("sector-terminal"), "admin portfolio sector leaderboard must be styled as a bounded terminal panel");
assert(adminStyleSource.includes("sector-lane-grid"), "admin portfolio sector leaderboard must split theme, rotation, holdings outlook, and quality into lanes");
assert(adminStyleSource.includes("data-terminal"), "admin portfolio data-confidence board must be styled as a bounded terminal panel");
assert(adminStyleSource.includes("data-lane-grid"), "admin portfolio data-confidence board must split NAV, fee, holdings, and source checks into lanes");
assert(adminStyleSource.includes("action-terminal"), "admin portfolio action desk must be styled as a bounded terminal panel");
assert(adminStyleSource.includes("action-lane-grid"), "admin portfolio action desk must split buy, sell, watch, and active orders into lanes");
assert(adminStyleSource.includes("alert-terminal"), "admin portfolio alert desk must be styled as a bounded terminal panel");
assert(adminStyleSource.includes("alert-lane-grid"), "admin portfolio alert desk must split buy, sell/risk, data, and user alerts into lanes");
assert(adminStyleSource.includes("position-terminal"), "admin portfolio positions view must be styled as a bounded terminal panel");
assert(adminStyleSource.includes("position-lane-grid"), "admin portfolio positions view must split holdings into scannable lanes");
assert(adminStyleSource.includes("matrix-terminal"), "admin portfolio decision matrix must be styled as a bounded terminal panel");
assert(adminStyleSource.includes("matrix-table"), "admin portfolio decision matrix must render a horizontal buy-sector-risk-data comparison table");
assert(adminHtmlSource.includes("综合决策"), "admin UI must describe integrated decision-synthesis rankings as a manager decision angle");
assert(adminHtmlSource.includes("机会成本"), "admin UI must describe opportunity-cost rankings as a manager decision angle");
assert(adminHtmlSource.includes("板块轮动"), "admin UI must describe sector-rotation rankings as a manager decision angle");
assert(adminHtmlSource.includes("追涨风险"), "admin UI must describe chase-risk rankings as a manager decision angle");
assert(adminHtmlSource.includes("数据体检"), "admin UI must describe data-confidence rankings as a manager decision angle");
assert(adminHtmlSource.includes("持仓前景"), "admin UI must describe top-ten holdings outlook rankings as a manager decision angle");
assert(adminHtmlSource.includes("仓位方案"), "admin UI must describe position-sizing rankings as a manager decision angle");
assert(adminHtmlSource.includes("基金质量"), "admin UI must describe fund-quality rankings as a manager decision angle");
assert(adminHtmlSource.includes("组合适配"), "admin UI must describe portfolio-fit rankings as a manager decision angle");
assert(adminHtmlSource.includes("费率适配"), "admin UI must describe share-class fee suitability rankings as a manager decision angle");
assert(adminHtmlSource.includes("替代优选"), "admin UI must describe replacement-choice rankings as a manager decision angle");
assert(adminSource.includes("renderManagerRankings"), "admin UI must render multi-angle ranking boards");
assert(adminSource.includes("renderManagerCustomerDigest"), "admin UI must render customer-facing ranking digest before detailed lists");
assert(adminSource.includes("renderManagerPriorityQueue"), "admin UI must render the cross-ranking priority queue");
assert(adminSource.includes("renderManagerRankingOverview"), "admin UI must render ranking board overview cards before detailed lists");
assert(adminSource.includes("setManagerRankingFilter"), "admin UI must allow focusing one manager ranking lane from overview cards");
assert(adminSource.includes("getDefaultManagerRankingFilter"), "admin UI must open the manager ranking board on the highest-priority lane instead of expanding every list by default");
assert(adminSource.includes("data-ranking-filter"), "admin UI ranking overview cards must work as compact filters");
assert(adminSource.includes("focusWatchlistFund"), "admin UI customer digest must jump from ranking advice to watchlist fund details");
assert(adminSource.includes("data-focus-watchlist-code"), "admin UI customer digest items must expose a watchlist focus action");
assert(adminSource.includes("data-watchlist-code"), "admin UI watchlist cards must be addressable from ranking digest items");
assert(adminSource.includes("ranking-detail-link"), "admin UI ranking and priority items must expose compact watchlist detail actions");
assert(adminSource.includes("renderWatchlistRankingRefs"), "admin UI watchlist details must show which manager ranking lanes cite each fund");
assert(adminSource.includes("decision_synthesis"), "admin UI must render the decision-synthesis ranking lane");
assert(adminSource.includes("cash_redeployment"), "admin UI must render the cash-redeployment ranking lane");
assert(adminSource.includes("position_sizing"), "admin UI must render the position-sizing ranking lane");
assert(adminSource.includes("quality_score"), "admin UI must render the fund-quality ranking lane");
assert(adminSource.includes("manager_stability"), "admin UI must render the manager-stability ranking lane");
assert(adminSource.includes("portfolio_fit"), "admin UI must render the portfolio-fit ranking lane");
assert(adminSource.includes("rotation_opportunity"), "admin UI must render the sector-rotation ranking lane");
assert(adminSource.includes("chase_risk"), "admin UI must render the chase-risk ranking lane");
assert(adminSource.includes("drawdown_defense"), "admin UI must render the drawdown-defense ranking lane");
assert(adminSource.includes("data_confidence"), "admin UI must render the data-confidence ranking lane");
assert(adminSource.includes("fee_suitability"), "admin UI must render the fee-suitability ranking lane");
assert(adminSource.includes("replacement_choice"), "admin UI must render the replacement-choice ranking lane");
assert(adminStyleSource.includes("ranking-list.is-filtered-out"), "admin UI must hide non-focused ranking lists when a ranking filter is active");
assert(adminStyleSource.includes("ranking-list-manager"), "admin UI must style manager-stability ranking lanes distinctly");
assert(adminHtmlSource.includes("portfolio-workspace-group"), "admin portfolio workspace entries must be grouped like a stock terminal navigation rail");
assert(/portfolio-command-panel[\s\S]{0,420}grid-template-areas:\s*"hero kpis status"/.test(adminStyleSource), "admin portfolio command header must use a compact trading-console grid");
assert(/portfolio-hero \.actions[\s\S]{0,260}overflow-x:\s*auto/.test(adminStyleSource), "admin portfolio command actions must stay compact instead of wrapping into a tall toolbar on desktop");
assert(/portfolio-command-panel \.info-grid[\s\S]{0,260}grid-area:\s*status/.test(adminStyleSource), "admin portfolio schedule and push metadata must live in the compact command header status column");
assert(adminStyleSource.includes("portfolio-workspace-switcher"), "admin portfolio workspace switcher must be styled as a first-class navigation surface");
assert(/portfolio-workspace-switcher[\s\S]{0,240}position:\s*sticky/.test(adminStyleSource), "admin portfolio workspace switcher must remain reachable while long workspace views scroll");
assert(adminStyleSource.includes("portfolio-workspace-view.active"), "admin portfolio workspace views must show one focused entry at a time");
assert(/portfolio-terminal-shell[\s\S]{0,260}--portfolio-workspace-height:\s*100%[\s\S]{0,520}height:\s*var\(--portfolio-workspace-height\)[\s\S]{0,260}max-height:\s*100%[\s\S]{0,180}overflow:\s*hidden/.test(adminStyleSource), "admin portfolio terminal shell must bound the virtual-run workspace height like a trading terminal");
assert(/portfolio-terminal-stage[\s\S]{0,320}overflow:\s*hidden/.test(adminStyleSource), "admin portfolio terminal stage must prevent long workspace content from stretching the whole page");
assert(/portfolio-workspace-view\.active[\s\S]{0,360}overflow:\s*auto/.test(adminStyleSource), "admin portfolio active workspace view must scroll internally");
assert(adminHtmlSource.includes('data-portfolio-view-target="opportunities"'), "admin portfolio UI must expose observation opportunities as a separate workspace entrance");
assert(adminHtmlSource.includes('data-portfolio-view-target="sectors"'), "admin portfolio UI must expose sector leaderboards as a separate workspace entrance");
assert(adminHtmlSource.includes('data-portfolio-view-target="actions"'), "admin portfolio UI must expose latest actions as a separate workspace entrance");
assert(adminHtmlSource.includes('data-portfolio-view-target="alerts"'), "admin portfolio UI must expose alerts as a separate workspace entrance");
assert(adminHtmlSource.includes('data-portfolio-view-target="matrix"'), "admin portfolio UI must expose the decision matrix as a separate workspace entrance");
assert(adminHtmlSource.includes('data-portfolio-view-target="data"'), "admin portfolio UI must expose data confidence as a separate workspace entrance");
assert(adminHtmlSource.includes('data-portfolio-view-target="diagnostics"'), "admin portfolio UI must expose diagnostics as a separate workspace entrance");
assert(adminSource.includes("renderPortfolioOpportunityBoard"), "admin portfolio UI must render buy, pullback, and launch-eve observation opportunities outside the long watchlist page");
assert(adminSource.includes("PORTFOLIO_SECTOR_LANES"), "admin portfolio sector board must define separate leaderboard lenses for theme, rotation, holdings, and quality");
assert(adminSource.includes("PORTFOLIO_ACTION_LANES"), "admin portfolio action desk must define separate lanes for buy, sell, watch, and order flow");
assert(adminSource.includes("PORTFOLIO_ALERT_LANES"), "admin portfolio alert desk must define separate lanes for buy, sell/risk, data, and user alerts");
assert(adminSource.includes("PORTFOLIO_POSITION_LANES"), "admin portfolio positions view must define separate lanes for holding risk, profit, core, and watch states");
assert(adminSource.includes("PORTFOLIO_DATA_LANES"), "admin portfolio data board must define separate lanes for NAV, fee, holdings, and source evidence");
assert(adminSource.includes("collectPortfolioDecisionMatrixItems"), "admin portfolio decision matrix must derive rows from backend manager rankings");
assert(/timeline-terminal-body[\s\S]{0,360}max-height:\s*calc\(var\(--portfolio-workspace-height/.test(adminStyleSource), "admin portfolio timeline must bound run history height");
assert(/watchlist-terminal-body[\s\S]{0,360}max-height:\s*calc\(var\(--portfolio-workspace-height/.test(adminStyleSource), "admin portfolio watchlist must bound category-detail height");
assert(adminStyleSource.includes("portfolio-workspace-card"), "admin portfolio overview shortcut cards must be visually scannable");
assert(adminStyleSource.includes("ranking-terminal"), "admin manager ranking board must be a focused terminal-style workspace instead of a long stacked report");
assert(adminStyleSource.includes("ranking-detail-stage"), "admin manager ranking board must separate lane navigation from the active ranking detail");
assert(adminStyleSource.includes("ranking-customer-digest"), "admin UI must style customer-facing ranking digest as a first-class panel");
assert(adminStyleSource.includes("focused-from-ranking"), "admin UI must highlight watchlist cards opened from customer digest items");
assert(adminStyleSource.includes("watchlist-ranking-refs"), "admin UI must style ranking citations inside watchlist fund details");
assert(adminStyleSource.includes("ranking-overview-synthesis"), "admin UI must visually distinguish decision-synthesis overview cards");
assert(adminStyleSource.includes("ranking-overview-redeploy"), "admin UI must visually distinguish cash-redeployment overview cards");
assert(adminStyleSource.includes("ranking-list-redeploy"), "admin UI must visually distinguish cash-redeployment ranking lists");
assert(adminStyleSource.includes("ranking-action.redeploy"), "admin UI must visually distinguish cash-redeployment action pills");
assert(adminStyleSource.includes("ranking-overview-sizing"), "admin UI must visually distinguish position-sizing overview cards");
assert(adminStyleSource.includes("ranking-list-sizing"), "admin UI must visually distinguish position-sizing ranking lists");
assert(adminStyleSource.includes("ranking-action.sizing"), "admin UI must visually distinguish position-sizing action pills");
assert(adminStyleSource.includes("ranking-overview-quality"), "admin UI must visually distinguish fund-quality overview cards");
assert(adminStyleSource.includes("ranking-list-quality"), "admin UI must visually distinguish fund-quality ranking lists");
assert(adminStyleSource.includes("ranking-action.quality"), "admin UI must visually distinguish fund-quality action pills");
assert(adminStyleSource.includes("ranking-overview-fit"), "admin UI must visually distinguish portfolio-fit overview cards");
assert(adminStyleSource.includes("ranking-list-fit"), "admin UI must visually distinguish portfolio-fit ranking lists");
assert(adminStyleSource.includes("ranking-action.fit"), "admin UI must visually distinguish portfolio-fit action pills");
assert(adminStyleSource.includes("ranking-overview-rotation"), "admin UI must visually distinguish sector-rotation overview cards");
assert(adminStyleSource.includes("ranking-overview-chase"), "admin UI must visually distinguish chase-risk overview cards");
assert(adminStyleSource.includes("ranking-overview-defense"), "admin UI must visually distinguish drawdown-defense overview cards");
assert(adminStyleSource.includes("ranking-list-defense"), "admin UI must visually distinguish drawdown-defense ranking lists");
assert(adminStyleSource.includes("ranking-action.defense"), "admin UI must visually distinguish drawdown-defense action pills");
assert(adminStyleSource.includes("ranking-overview-data"), "admin UI must visually distinguish data-confidence overview cards");
assert(adminStyleSource.includes("ranking-list-data"), "admin UI must visually distinguish data-confidence ranking lists");
assert(adminStyleSource.includes("ranking-action.data"), "admin UI must visually distinguish data-confidence action pills");
assert(adminStyleSource.includes("ranking-overview-fee"), "admin UI must visually distinguish fee-suitability overview cards");
assert(adminStyleSource.includes("ranking-overview-replacement"), "admin UI must visually distinguish replacement-choice overview cards");
assert(adminStyleSource.includes("ranking-list-replacement"), "admin UI must visually distinguish replacement-choice ranking lists");
assert(adminStyleSource.includes("ranking-action.replacement"), "admin UI must visually distinguish replacement-choice action pills");
assert(adminSource.includes("getManagerRankingActionClass"), "admin ranking items must color-code buy, watch, and sell style actions");
assert(adminSource.includes("ranking-health"), "admin UI must render ranking board state guidance");
assert(adminSource.includes("ranking-next"), "admin UI must render ranking next-action guidance");
assert(adminSource.includes("renderManagerRankingDecision"), "admin UI must render per-fund ranking decision matrices");
assert(adminSource.includes("renderRunActionAudit"), "admin run timeline must expose ranking, trend, and risk audit details for each action");
assert(adminSource.includes("action.rankingBasis"), "admin run action audit must show the ranking basis behind manager recommendations");
assert(adminSource.includes("activePortfolioRunPanel"), "admin run timeline must remember the selected run-detail entry");
assert(adminSource.includes("data-run-panel"), "admin run timeline must split one virtual run into multiple detail entries instead of a long page");
assert(adminSource.includes("renderRunPanelSwitch"), "admin run timeline must render a quote-terminal style detail switcher");
assert(adminStyleSource.includes("run-panel-switcher"), "admin run timeline detail switcher must be styled as a first-class navigation surface");
assert(adminStyleSource.includes("run-panel-stage"), "admin run timeline must place selected run detail content in a bounded stage");
assert(adminHtmlSource.includes("榜单引用"), "admin portfolio dashboard must expose ranking citation coverage");
assert(adminSource.includes("buildRankingAuditInsightItems"), "admin portfolio dashboard must render ranking citation coverage insights");

await assertIntent({
  userText: "我发的图里是我已经买的基金，告诉我大概多久卖",
  imageKeys: ["img_test_key"],
  messageType: "image",
  expectedWorkflow: "fund_screening",
  expectedReason: "message_contains_image_and_sell_timing_request",
  expectedMode: "screenshot_held_position_sell_plan",
  requiredSkills: ["fund-vision", "fund-trend-analysis", "fund-risk-analysis", "fund-market-timing", "fund-actionability-evaluation", "fund-answer-quality"]
});
await assertIntent({
  userText: "000001 我已经买了，什么时候卖比较合适",
  expectedWorkflow: "fund_screening",
  expectedReason: "text_contains_held_position_sell_timing_request",
  expectedMode: "held_position_sell_plan",
  requiredSkills: ["fund-data-enrichment", "fund-trend-analysis", "fund-risk-analysis", "fund-market-timing", "fund-portfolio-execution", "fund-answer-quality"]
});
assert(
  serverSource.includes("图文同一需求：截图事实和用户文字必须合并成一个问题"),
  "fund screening prompts must explicitly fuse screenshot facts and text instructions"
);
assert(
  serverSource.includes("已买/持有基金的卖出计划"),
  "held-position screenshot asks must produce a sell/hold plan instead of a buy template"
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
const investedReturnDb = manager.normalizePortfolioDb({
  account: {
    initialCapital: 100000,
    cash: 90000,
    positions: [
      {
        code: "000010",
        name: "中证A500ETF联接C",
        units: 10000,
        costAmount: 10000,
        currentValue: 10739.77
      }
    ]
  }
});
assert.equal(investedReturnDb.account.investedCost, 10000, "portfolio account must expose the actual invested cost denominator");
assert.equal(investedReturnDb.account.investedCostBasis, 10000, "portfolio account must expose the actual invested cost basis");
assert.equal(investedReturnDb.account.cumulativePnl, 739.77, "portfolio account PnL amount should still reflect total asset minus initial cash ledger");
assert.equal(investedReturnDb.account.cumulativePnlPct, 7.4, "portfolio PnL percentage must use actual invested amount instead of initial capital");
assert.equal(investedReturnDb.account.capitalPnlPct, 0.74, "portfolio account may still expose initial-capital return separately for reference");
const liquidatedReturnDb = manager.normalizePortfolioDb({
  account: {
    initialCapital: 100000,
    cash: 102230.85,
    positions: []
  },
  transactions: [
    { date: "2026-05-20", createdAt: "2026-05-20T06:00:00.000Z", side: "BUY", code: "008327", name: "东财通信C", amount: 30002.28 },
    { date: "2026-05-25", createdAt: "2026-05-25T08:00:00.000Z", side: "SELL", code: "008327", name: "东财通信C", amount: 32098.68 }
  ]
});
assert.equal(liquidatedReturnDb.account.investedCost, 0, "fully liquidated account must keep current open-position cost at zero");
assert.equal(liquidatedReturnDb.account.investedCostBasis, 30002.28, "fully liquidated account must recover the actual invested denominator from trade history");
assert.equal(liquidatedReturnDb.account.cumulativePnl, 2230.85, "fully liquidated account must keep realized account PnL");
assert.equal(liquidatedReturnDb.account.cumulativePnlPct, 7.44, "fully liquidated account PnL percentage must not collapse to zero after positions are sold");
const exposureSummary = manager.buildPortfolioExposureSummary([
  { code: "008327", name: "东财通信C", currentValue: 12000, weightPct: 12, fundSnapshot: { topHoldings: ["300502 新易盛 8.74%", "300308 中际旭创 7.98%"] } },
  { code: "006265", name: "红土创新新科技股票A", currentValue: 10000, weightPct: 10, fundSnapshot: { topHoldings: ["300308 中际旭创 8.54%", "300502 新易盛 8.36%"] } },
  { code: "001986", name: "前海开源人工智能主题混合A", currentValue: 8000, weightPct: 8, fundSnapshot: { topHoldings: ["300502 新易盛 9.3%", "002222 福晶科技 8.57%"] } }
]);
assert.equal(exposureSummary.riskLevel, "high", "portfolio exposure summary must flag concentrated same-theme holdings as high risk");
assert(exposureSummary.themeClusters.some((item) => item.theme === "科技" && item.positionWeightPct >= 30), "portfolio exposure summary must aggregate same-theme fund weights");
assert(exposureSummary.overlappingHoldings.some((item) => item.name === "新易盛" && item.fundCount === 3), "portfolio exposure summary must catch repeated underlying top holdings");
assert(exposureSummary.riskNotes.some((item) => item.includes("同题材暴露过度集中")), "portfolio exposure summary must produce user-readable concentration risk notes");
const exposureRiskPositions = [
  {
    code: "008327",
    name: "东财通信C",
    currentValue: 12000,
    weightPct: 12,
    unrealizedPnlPct: 1.2,
    profitGivebackPct: 2.1,
    lastNav: 4.4512,
    lastNavDate: "2026-05-21",
    fundSnapshot: { topHoldings: ["300502 新易盛 8.74%", "300308 中际旭创 7.98%"], actionability: { action: "wait" } }
  },
  {
    code: "006265",
    name: "红土创新新科技股票A",
    currentValue: 10000,
    weightPct: 10,
    unrealizedPnlPct: 0.8,
    profitGivebackPct: 1.3,
    lastNav: 9.0233,
    lastNavDate: "2026-05-21",
    fundSnapshot: { topHoldings: ["300308 中际旭创 8.54%", "300502 新易盛 8.36%"], actionability: { action: "wait" } }
  },
  {
    code: "001986",
    name: "前海开源人工智能主题混合A",
    currentValue: 8000,
    weightPct: 8,
    unrealizedPnlPct: 0.4,
    profitGivebackPct: 1.1,
    lastNav: 1.9374,
    lastNavDate: "2026-05-21",
    fundSnapshot: { topHoldings: ["300502 新易盛 9.3%", "002222 福晶科技 8.57%"], actionability: { action: "wait" } }
  }
];
const exposureRiskActions = manager.buildPortfolioRiskBudgetActions({
  totalAsset: 100000,
  peakTotalAsset: 100000,
  positions: exposureRiskPositions
}, []);
assert(exposureRiskActions.some((item) => item.dataBasis.includes("来源：portfolio_exposure_concentration_guard")), "portfolio risk budget must create deterministic reduce actions for high same-theme exposure");
assert(exposureRiskActions[0].reason.includes("系统组合集中度控制"), "exposure reduce action must explain portfolio-level concentration control");
const exposureSellGuard = manager.evaluatePortfolioSellDiscipline(
  exposureRiskActions[0],
  null,
  exposureRiskPositions.find((item) => item.code === exposureRiskActions[0].code)
);
assert.equal(exposureSellGuard.ok, true, "portfolio sell discipline must allow exposure-concentration reduction when position NAV is available");
assert(exposureSellGuard.reason.includes("组合同题材"), "exposure sell confirmation must explain same-theme or underlying overlap risk");
const decisionRunSummary = manager.buildPortfolioRunSummary({
  type: "decision",
  status: "completed",
  summary: "决策日报已生成，正在保存任务结果。",
  actions: [
    { action: "HOLD", code: "008327", name: "东财通信C", riskControl: "同题材暴露偏高，等待回撤后再评估。" },
    { action: "WATCH", code: "021958", name: "南方黄金股A", reason: "等待金价确认。" }
  ],
  orders: [],
  watchlistUpdates: [{ code: "021958", name: "南方黄金股A" }]
});
assert(decisionRunSummary.includes("今日决策：持有复核1、观察1，未提交申购/赎回"), "portfolio run summary must replace generic save-progress text with action counts");
assert(decisionRunSummary.includes("风险重点：同题材暴露偏高"), "portfolio run summary must surface the main risk rather than a generic progress line");
assert(!decisionRunSummary.includes("正在保存任务结果"), "portfolio run summary must not expose progress-only text after completion");
const customerActionLine = manager.formatPortfolioCustomerActionLine({
  action: "SELL",
  code: "008327",
  name: "东财通信C",
  amount: 11810.03,
  targetWeightPct: 8,
  reason: "系统组合集中度控制：同题材暴露科技约29.6%；底层重叠300502 新易盛涉及3只基金；同题材暴露过度集中，先分批降低同题材暴露。该基金近20日+19.64%、近60日+61.1%，120日和250日位置均为100%，且账户单仓触发回吐保护复核。",
  riskControl: "单仓回吐保护：曾浮盈+3.24%但当前转亏-1.58%，需要防止利润继续回吐。",
  feeCheck: "当前持有C类，前端申购费0，销售服务费0.25%/年，每万元1年约25元，适合战术持有。"
});
const customerActionNumbers = customerActionLine.match(/(?:[+-]?\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:元|万|亿)|近\s*\d+\s*日|\d+\s*日位置)/g) || [];
assert(customerActionLine.includes("为什么：") && customerActionLine.includes("边界："), "customer action line must keep reason and boundary sections");
assert(customerActionLine.includes("建议约1.2万元"), "customer action line must round execution amounts instead of showing precise accounting decimals");
assert(customerActionLine.includes("同题材暴露过度集中"), "customer action line must lead with the portfolio logic instead of a raw metric trigger");
assert(customerActionLine.includes("浮盈已经回吐到转亏"), "customer action line must translate dense giveback numbers into readable risk language");
assert(customerActionLine.includes("C类偏短中期"), "customer action line must translate fee details into share-class meaning");
assert(customerActionLine.length < 260, "customer action line must be compact enough for Feishu card reading");
assert(customerActionNumbers.length <= 4, "customer action line must not dump a long metric list");
assert(!customerActionLine.includes("11810.03元"), "customer action line must not expose precise accounting decimals in the user-facing decision card");
assert(!customerActionLine.includes("120日和250日位置均为100%"), "customer action line must hide dense metric clauses after the key interpretation");
assert(!customerActionLine.includes("0.25%/年"), "customer action line must hide fee-rate dumps after translating A/C share-class meaning");
const sanitizedHistoricalRun = manager.sanitizePortfolioPublicReportValue({
  card: "持仓关注：趋势 extended_uptrend，entryBias=wait_pullback，actionability 为 weak_fit，建议 watch/test only。",
  observation: {
    summary: "盘前 marketTone=defensive，marketConfirmationScore=0。",
    sources: ["https://example.com/watch/test"]
  }
});
const sanitizedHistoricalRunText = JSON.stringify({
  card: sanitizedHistoricalRun.card,
  observationSummary: sanitizedHistoricalRun.observation.summary
});
assert(sanitizedHistoricalRun.card.includes("买点判断：等待回撤"), "public run cards must localize legacy entry-bias text before admin display");
assert(sanitizedHistoricalRun.card.includes("买卖可行性评估：适配度偏弱"), "public run cards must localize legacy actionability text before admin display");
assert(sanitizedHistoricalRun.card.includes("观察/小额试探"), "public run cards must localize watch/test shorthand before admin display");
assert(sanitizedHistoricalRun.observation.summary.includes("市场姿态：防守") && sanitizedHistoricalRun.observation.summary.includes("市场确认度：0"), "public run observations must localize market-tone fields");
assert.equal(sanitizedHistoricalRun.observation.sources[0], "https://example.com/watch/test", "public run sanitization must preserve source URLs");
assert(!/\b(?:extended_uptrend|entryBias|actionability|weak_fit|watch\/test|marketTone|defensive|marketConfirmationScore)\b/i.test(sanitizedHistoricalRunText), "admin-facing historical run summaries must not keep raw internal fields");
const normalizedInvestedCostText = manager.normalizePortfolioInvestedCostReturnText(
  "累计盈亏由+1291.65转为-328.07，按初始资金口径为-0.33%。",
  { investedCost: 30002.28, cumulativePnlPct: -1.09 }
);
assert(normalizedInvestedCostText.includes("按实际投入成本30002.28元计-1.09%"), "valuation text must rewrite initial-capital return wording to actual invested-cost return");
assert(!/初始资金口径|初始本金口径|本金口径/.test(normalizedInvestedCostText), "valuation text must not keep initial-capital denominator wording");
const normalizedReview = manager.normalizePortfolioReview(JSON.stringify({
  summary: "今日回撤，按初始资金口径为-0.33%。",
  reason: "相对初始本金-0.33%，但持仓投入成本回撤更明显。",
  nextWatch: ["明天继续看，本金口径只是参考。"],
  learningNotes: ["不能把初始本金作为收益率分母。"]
}), { account: { investedCost: 30002.28, cumulativePnlPct: -1.09 } });
const normalizedReviewText = JSON.stringify(normalizedReview);
assert(normalizedReview.summary.includes("按实际投入成本30002.28元计-1.09%"), "normalized valuation review summary must use invested-cost return");
assert(!/相对初始本金|初始资金口径|初始本金口径|本金口径/.test(normalizedReviewText), "normalized valuation review must remove initial-capital denominator wording from user-facing fields");
const historicalRunWithAccount = {
  type: "valuation",
  status: "completed",
  summary: "累计盈亏由+1291.65转为-328.07，按初始资金口径为-0.33%。",
  card: "估值复盘：相对初始本金 -0.33%，需要解释亏损来源。",
  team: [{ role: "风控", reason: "按本金口径为-0.33%，但持仓投入成本回撤更明显。" }],
  observation: {
    summary: "盘前提示：按初始本金口径为-0.33%。",
    sources: ["https://example.com/portfolio/report"]
  },
  accountAfter: { investedCost: 30002.28, cumulativePnlPct: -1.09, cumulativePnl: -328.07 }
};
const publicHistoricalRunBrief = manager.summarizePortfolioRunBrief(historicalRunWithAccount);
const publicHistoricalRunFull = manager.summarizePortfolioRun(historicalRunWithAccount);
const publicHistoricalRunText = JSON.stringify({
  brief: publicHistoricalRunBrief,
  full: publicHistoricalRunFull
});
assert(publicHistoricalRunBrief.summary.includes("按实际投入成本30002.28元计-1.09%"), "public brief run summaries must use the run's invested-cost denominator");
assert(publicHistoricalRunFull.card.includes("按实际投入成本30002.28元计-1.09%"), "public full run cards must use the run's invested-cost denominator");
assert(publicHistoricalRunFull.team[0].reason.includes("按实际投入成本30002.28元计-1.09%"), "public nested run team notes must use the run's invested-cost denominator");
assert(publicHistoricalRunFull.observation.summary.includes("按实际投入成本30002.28元计-1.09%"), "public nested run reports must use the run's invested-cost denominator");
assert.equal(publicHistoricalRunFull.observation.sources[0], "https://example.com/portfolio/report", "public run account-context sanitization must still preserve source URLs");
assert(!/相对初始本金|初始资金口径|初始本金口径|本金口径/.test(publicHistoricalRunText), "public historical run output must not leak initial-capital denominator wording");
const publicHistoricalRunWithFallback = manager.summarizePortfolioRunBrief(
  {
    type: "valuation",
    status: "completed",
    summary: "估值复盘：按初始资金口径为+0.20%。",
    investedCost: 5000,
    cumulativePnlPct: 4
  },
  { investedCost: 30002.28, cumulativePnlPct: -1.09 }
);
assert(publicHistoricalRunWithFallback.summary.includes("按实际投入成本5000元计+4%"), "public run summaries must prefer the run's own account fields over current fallback account fields");
const summarizedConfirmedOrder = manager.summarizePortfolioOrder({
  id: "ord_test",
  side: "BUY",
  status: "confirmed",
  code: "000010",
  name: "中证A500ETF联接C",
  amount: 1000,
  navSnapshot: {
    date: "2026-05-22",
    nav: 1.23456,
    quality: "exact_nav_history",
    source: "https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=000010"
  },
  confirmedUnits: 810.044552,
  priceDate: "2026-05-22",
  confirmDate: "2026-05-23"
});
assert.equal(summarizedConfirmedOrder.nav, 1.2346, "confirmed portfolio order summaries must expose the verified transaction NAV");
assert.equal(summarizedConfirmedOrder.navDate, "2026-05-22", "confirmed portfolio order summaries must expose the NAV date");
assert.equal(summarizedConfirmedOrder.units, 810.044552, "confirmed portfolio order summaries must expose confirmed units");
assert.equal(summarizedConfirmedOrder.navQuality, "exact_nav_history", "confirmed portfolio order summaries must expose NAV verification quality");
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
      navDate: todayIso,
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
const rankingAwareWatchlistLines = manager.buildPortfolioWatchlistStatusLines([normalizedWatchDb.watchlist[0]], {
  managerRankings: {
    lists: [
      {
        title: "综合决策榜",
        items: [{ code: normalizedWatchDb.watchlist[0].code, rank: 1, action: "小仓试探复核" }]
      },
      {
        title: "板块轮动榜",
        items: [{ code: normalizedWatchDb.watchlist[0].code, rank: 2, action: "低位轮动观察" }]
      }
    ]
  }
}).join("\n");
assert(rankingAwareWatchlistLines.includes("上榜依据：综合决策榜#1/小仓试探复核；板块轮动榜#2/低位轮动观察"), "portfolio status answer must cite ranking lanes inside watchlist detail lines");
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
const watchlistedGapCandidate = {
  code: "000006",
  name: "观察缺口基金C",
  status: "watch",
  statusText: "继续观察",
  reason: "走势像回调完成，但规模和费用缺口未修复。",
  readinessScore: 58,
  readinessLabel: "只观察",
  readinessGaps: ["基金规模偏小，不能作为可直接买入", "费用关键字段缺失"],
  lastSnapshot: {
    snapshotDate: "2026-05-19",
    navDate: "2026-05-19",
    trendProfile: {
      ok: true,
      latestDate: "2026-05-19",
      pullbackSetup: { signal: "pullback_complete", score: 80 },
      trendLabel: "pullback_complete",
      entryBias: "buyable_now",
      return5dPct: 1.2,
      return10dPct: 2.4,
      return20dPct: 4.6,
      return60dPct: 8.8,
      lowPositionPct120: 42.1,
      lowPositionPct250: 50.2,
      drawdownFromRecentHighPct: -9.4
    },
    actionability: { action: "buy", score: 86 }
  }
};
const watchOverrideDeepDive = manager.mergeFundWorkflowWatchlistIntoDeepDive({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  candidates: [{
    ok: true,
    code: "000006",
    name: "观察缺口基金C",
    trendProfile: watchlistedGapCandidate.lastSnapshot.trendProfile,
    actionability: { action: "buy", score: 88 }
  }]
}, [watchlistedGapCandidate], setupQuery);
const watchOverrideSummary = manager.buildMarketDeepDiveSummary(watchOverrideDeepDive);
const overriddenWatchCandidate = watchOverrideDeepDive.candidates.find((item) => item.code === "000006");
assert.equal(overriddenWatchCandidate.actionability.action, "watch", "watchlist observation status must override a market deep-dive buy action");
assert(watchOverrideSummary.includes("watchOrRejectCodes=000006"), "watchlist observation candidates must stay out of pullback main recommendations even when trend looks buyable");
assert(!watchOverrideSummary.includes("mainCandidateCodes=000006"), "watchlist observation candidates must not be promoted to main candidate codes");
assert(watchOverrideSummary.includes("自选池状态为观察中"), "deep-dive gaps must explain the watchlist status blocker");
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
assert.equal(manager.inferFundShareClass("汇添富全球医疗混合(QDII)人民币"), "", "QDII人民币 must not be misread as I share class");
assert.equal(manager.inferFundShareClass("华安纳斯达克100ETF联接(QDII)A"), "A", "QDII products with explicit A suffix must still infer A share class");
assert.equal(manager.inferFundShareClass("博时黄金ETF联接C"), "C", "ordinary C share suffix must still infer C share class");

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
for (const keyword of ["黄金", "贵金属", "白银"]) {
  assert(!genericSetupKeywords.includes(keyword), `generic pullback setup recall must not default to precious-metal keyword: ${keyword}`);
}
const genericKeywordsWithPreciousRadar = manager.inferPullbackSetupSearchKeywords(setupQuery, [
  { id: "precious_metals", name: "黄金/贵金属", positionSignal: "low_position_rotation", lowPositionScore: 62, fundKeywords: ["黄金", "贵金属", "白银"] },
  { id: "medicine", name: "医药/创新药", positionSignal: "low_position_rotation", lowPositionScore: 58, fundKeywords: ["医药", "创新药"] }
]);
assert(genericKeywordsWithPreciousRadar.includes("医药"), "generic pullback setup recall may use non-precious low-position radar keywords");
for (const keyword of ["黄金", "贵金属", "白银"]) {
  assert(!genericKeywordsWithPreciousRadar.includes(keyword), "generic pullback setup recall must suppress precious-metal radar keywords unless explicitly requested");
}
assert(genericSetupKeywords.length > 24, "generic pullback setup recall must expand beyond the old narrow 24-keyword pool");
assert(
  manager.scorePullbackSetupSeedCandidate(lowSetupSeed, [], setupQuery) >
    manager.scorePullbackSetupSeedCandidate({ ...weeklyTurnSeed, name: "博时黄金ETF联接C", keywords: ["低位启动前夜候选"] }, [], setupQuery),
  "generic pullback setup scoring must not let gold funds outrank broad low-position candidates unless the user asks for gold"
);
assert(
  manager.scorePullbackSetupSeedCandidate({ ...weeklyTurnSeed, name: "博时黄金ETF联接C", keywords: ["黄金", "低位启动前夜候选"] }, [], "黄金里面找一个回调完成、低位、准备启动的基金") >
    -100,
  "explicit gold setup requests must not suppress precious-metal candidates"
);
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
  snapshotDate: todayIso,
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
  holdings: {
    ok: true,
    equityDisclosureDate: "2099-03-31",
    equityTopHoldings: [
      "600519 贵州茅台 2.7%",
      "300750 宁德时代 2.5%",
      "600036 招商银行 2.3%",
      "00700 腾讯控股 2.1%",
      "000333 美的集团 1.9%",
      "600900 长江电力 1.8%",
      "601398 工商银行 1.7%",
      "000858 五粮液 1.6%",
      "600276 恒瑞医药 1.5%",
      "601318 中国平安 1.4%"
    ]
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
const readyWatchReadiness = manager.evaluatePortfolioWatchReadiness({ ...verifiedSeedUpdates[0], updatedAt: todayIso }, verifiedSeedProfile);
assert(readyWatchReadiness.score >= 85, "verified low-position ready watchlist candidates must show high buy-preparation readiness");
assert.equal(readyWatchReadiness.label, "买入准备充分", "high-readiness watchlist candidates must have a client-readable readiness label");
const unverifiedWatchReadiness = manager.evaluatePortfolioWatchReadiness(portfolioSeedUpdates[0]);
assert(unverifiedWatchReadiness.score < 35, "unverified watchlist seeds must show low readiness until NAV/trend evidence is available");
assert.equal(unverifiedWatchReadiness.label, "暂不买入", "low-readiness watchlist seeds must not sound buyable");
const tinyConcentratedReadyProfile = {
  ...verifiedSeedProfile,
  code: "000013",
  name: "小规模高集中基金C",
  scale: "0.24亿元",
  holdingsOutlook: {
    ok: true,
    concentration: { top10Pct: 62.37 },
    evidence: "持仓前景=需要复核（前十大约62.37%）",
    risks: ["前十大集中度62.37%偏高"]
  },
  actionability: {
    ...verifiedSeedProfile.actionability,
    holdingsOutlook: {
      ok: true,
      concentration: { top10Pct: 62.37 },
      evidence: "持仓前景=需要复核（前十大约62.37%）",
      risks: ["前十大集中度62.37%偏高"]
    }
  }
};
const tinyConcentratedReadiness = manager.evaluatePortfolioWatchReadiness(
  { code: "000013", name: "小规模高集中基金C", status: "ready", priority: 1, reason: "低位回调完成" },
  tinyConcentratedReadyProfile
);
assert(tinyConcentratedReadiness.score < 85, "tiny and concentrated funds must not be labeled fully ready even when trend setup looks verified");
assert.notEqual(tinyConcentratedReadiness.label, "买入准备充分", "structural fund risks must suppress the fully-ready client label");
assert(tinyConcentratedReadiness.gaps.some((item) => item.includes("基金规模0.24亿偏小")), "readiness gaps must expose tiny fund scale");
assert(tinyConcentratedReadiness.gaps.some((item) => item.includes("前十大集中度62.4%偏高")), "readiness gaps must expose high top-ten concentration");
const guardedTinyConcentratedUpdate = manager.guardPortfolioWatchlistReadyUpdate({
  code: "000013",
  name: "小规模高集中基金C",
  status: "ready",
  priority: 1,
  reason: "模型声称小规模基金也可以买"
}, tinyConcentratedReadyProfile);
assert.equal(guardedTinyConcentratedUpdate.status, "watch", "watchlist write path must downgrade tiny concentrated funds from ready to watch");
assert(guardedTinyConcentratedUpdate.reason.includes("系统买入准备验证降级"), "structural readiness downgrades must explain the automatic guard");
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
  { code: "000011", name: "热门强势主题基金A", status: "ready", priority: 1, reason: "原本接近可买" },
  { code: "000013", name: "小规模高集中基金C", status: "ready", priority: 1, reason: "原本接近可买" }
], { profiles: [verifiedSeedProfile, hotVerifiedSeedProfile, tinyConcentratedReadyProfile] });
assert.deepEqual(
  dailyRecheckUpdates.map((item) => [item.code, item.status]).sort((a, b) => a[0].localeCompare(b[0])),
  [["000010", "ready"], ["000011", "blocked"], ["000013", "watch"]],
  "daily decision recheck must upgrade verified low-position candidates while blocking hot candidates and downgrading structurally fragile ready candidates"
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
assert.equal(heldFallbackActions[0].action, "SELL", "held position fallback must create a staged reduce action when omitted holdings have verified hot/chase risk");
assert.equal(heldFallbackActions[0].targetWeightPct, 0, "held position reduce fallback must target lower risk exposure for omitted hot holdings");
assert(heldFallbackActions[0].dataBasis.includes("来源：held_position_review_fallback"), "held position fallback must leave a traceable source");
assert(heldFallbackActions[0].dataBasis.some((item) => item.includes("系统卖出纪律确认")), "held position reduce fallback must pass the sell-discipline guard before becoming a SELL");
assert(/止盈|降仓|减仓/.test(heldFallbackActions[0].riskControl), "held position fallback must carry a concrete reduce/profit-control trigger");
const quietHeldFallback = manager.buildPortfolioHeldPositionReviewActions([
  { code: "000010", name: "中证A500ETF联接C", currentValue: 6000, weightPct: 6, unrealizedPnlPct: 2.1 }
], [], { profiles: [verifiedSeedProfile] });
assert.equal(quietHeldFallback[0].action, "HOLD", "held position fallback must not sell quiet verified holdings without reduce-risk evidence");
const reviewedHeldDecision = manager.ensurePortfolioHeldPositionsReviewed({ actions: [], watchlistUpdates: [], learningNotes: [], sources: [] }, [
  heldPosition
], { profiles: [hotVerifiedSeedProfile] });
assert(reviewedHeldDecision.actions.some((item) => item.code === "000011"), "portfolio decision must not silently omit existing holdings");
assert(reviewedHeldDecision.sources.includes("held_position_review_fallback"), "held position fallback must be traceable in decision sources");
const overriddenHotHold = manager.enforcePortfolioHeldPositionRiskOverrides([
  {
    action: "HOLD",
    code: "000011",
    name: "热门强势主题基金A",
    amount: 0,
    reason: "模型看到偏热但仍想继续持有",
    riskControl: "等下次回撤再处理"
  }
], [hotVerifiedSeedProfile], [heldPosition]);
assert.equal(overriddenHotHold[0].action, "SELL", "held-position risk override must convert under-reactive HOLD on verified hot holdings into staged SELL");
assert(overriddenHotHold[0].reason.includes("系统风控覆盖模型HOLD"), "held-position risk override must explain why it overrode model HOLD");
assert(overriddenHotHold[0].dataBasis.includes("来源：portfolio_held_position_risk_override"), "held-position risk override must leave a traceable source");
assert(overriddenHotHold[0].dataBasis.some((item) => item.includes("系统卖出纪律确认")), "held-position risk override must pass sell-discipline confirmation");
const hotHoldFromModelText = manager.enforcePortfolioHeldPositionRiskOverrides([
  {
    action: "HOLD",
    code: "000012",
    name: "模型已识别高位基金C",
    amount: 0,
    reason: "已有持仓但最新趋势为高位强势，20日+19.64%、60日+61.10%、120日位置100%，不符合新增买入。",
    riskControl: "若下次复核仍高位，降至6%-8%观察仓。"
  }
], [], [
  {
    code: "000012",
    name: "模型已识别高位基金C",
    currentValue: 8000,
    weightPct: 8,
    unrealizedPnlPct: -1.5,
    lastNav: 1.2345,
    lastNavDate: "2026-05-22",
    fundSnapshot: { trendProfile: { ok: false, note: "fetch failed" } }
  }
]);
assert.equal(hotHoldFromModelText[0].action, "SELL", "held-position risk override must use model-written hot-position evidence when structured trend fetch is temporarily missing");
assert(hotHoldFromModelText[0].dataBasis.some((item) => item.includes("模型持仓理由显示近20日")), "model-text risk override must carry parsed hot-return evidence");
const staleWaitGivebackPosition = {
  code: "008327",
  name: "东财通信C",
  currentValue: 11810.03,
  weightPct: 11.85,
  unrealizedPnlPct: -1.58,
  peakUnrealizedPnlPct: 3.24,
  profitGivebackPct: 4.82,
  lastNav: 4.4512,
  lastNavDate: "2026-05-21",
  fundSnapshot: {
    trendProfile: { ok: false, note: "fetch failed" },
    actionability: { action: "wait", actionText: "等待" }
  }
};
const staleWaitGivebackRisk = manager.buildPortfolioPositionRiskBudget(staleWaitGivebackPosition);
assert.equal(staleWaitGivebackRisk.reduceRisk, true, "profit giveback turning a stale/waiting holding negative must trigger deterministic risk reduction");
assert(staleWaitGivebackRisk.triggers.some((item) => item.includes("当前转亏")), "stale/waiting giveback risk must explain that a prior gain has turned negative");
const staleWaitGivebackOverride = manager.enforcePortfolioHeldPositionRiskOverrides([
  {
    action: "HOLD",
    code: "008327",
    name: "东财通信C",
    amount: 0,
    reason: "走势下钻失败，模型倾向继续观察。"
  }
], [], [staleWaitGivebackPosition]);
assert.equal(staleWaitGivebackOverride[0].action, "SELL", "held-position risk override must not let stale trend data hide wait/giveback risk");
assert(staleWaitGivebackOverride[0].dataBasis.some((item) => /缺少当前净值\/走势复核|浮盈已回吐|当前转亏/.test(item)), "stale wait/giveback override must carry the missing-data and giveback evidence");
assert(staleWaitGivebackOverride[0].dataBasis.some((item) => item.includes("系统卖出纪律确认")), "stale wait/giveback override must still pass sell discipline before becoming SELL");
const quietHoldOverride = manager.enforcePortfolioHeldPositionRiskOverrides([
  { action: "HOLD", code: "000010", name: "中证A500ETF联接C", amount: 0, reason: "继续观察" }
], [verifiedSeedProfile], [
  { code: "000010", name: "中证A500ETF联接C", currentValue: 6000, weightPct: 6, unrealizedPnlPct: 2.1 }
]);
assert.equal(quietHoldOverride[0].action, "HOLD", "held-position risk override must not sell quiet verified holdings");
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
const starterSetupProfile = {
  ...verifiedSeedProfile,
  code: "000020",
  name: "低位启动试探基金C",
  estimatedChangePct: "0.32",
  estimateTime: "2026-05-20 14:30",
  trendProfile: {
    ...verifiedSeedProfile.trendProfile,
    pullbackSetup: { signal: "pullback_complete", score: 74, reason: "回调完成但10日仍轻微修复中" },
    entryBias: "buyable_now",
    return5dPct: 0.8,
    return10dPct: -0.6,
    return20dPct: -2.1,
    return60dPct: -8.4,
    lowPositionPct120: 22.5,
    drawdownFromRecentHighPct: -13.2
  },
  actionability: { ...verifiedSeedProfile.actionability, action: "staged_buy", score: 78 }
};
assert.equal(manager.hasPortfolioStarterBuySetup(starterSetupProfile), true, "portfolio buy discipline must recognize low-position pullback setups that merit a small starter probe");
assert.equal(manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000020" }, starterSetupProfile).ok, true, "portfolio buy discipline should allow small starter buys before every trend metric is perfect");
const starterBuyAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 100000,
  cash: 90000,
  positions: []
}, { action: "BUY", code: "000020", amount: 50000, targetWeightPct: 20 }, "BUY", null, starterSetupProfile);
assert.equal(starterBuyAmount, 2500, "starter buy sizing must cap imperfect low-position setups to a smaller probing order");
const redeploymentAccount = {
  totalAsset: 100000,
  cash: 85000,
  receivableCash: 0,
  pendingBuyAmount: 0,
  investedValue: 0,
  positionWeightPct: 0,
  positions: [],
  riskBudget: { blockNewBuys: false }
};
const redeploymentWatchlist = [{
  code: "000020",
  name: "低位启动试探基金C",
  status: "waiting_pullback",
  priority: 2,
  reason: "回调完成后低位修复，10日仍轻微确认中。",
  buyTriggers: ["5日保持温和转强"],
  riskNotes: ["若实时估算转弱则撤回"]
}];
const redeploymentPlan = manager.buildPortfolioRedeploymentPlan(redeploymentAccount, redeploymentWatchlist, [starterSetupProfile]);
assert.equal(redeploymentPlan.pressureActive, true, "redeployment plan must activate when high cash and flat exposure persist");
assert.equal(redeploymentPlan.candidates[0].redeploymentAction, "starter_buy", "redeployment plan must surface eligible starter buys instead of generic waiting");
assert(redeploymentPlan.candidates[0].realtimeEvidence.includes("实时估算"), "redeployment plan must carry near-real-time valuation evidence into the decision prompt");
const tinyFundRedeploymentPlan = manager.buildPortfolioRedeploymentPlan(
  redeploymentAccount,
  [{ ...redeploymentWatchlist[0], code: "000021", name: "低位小规模基金C" }],
  [{ ...starterSetupProfile, code: "000021", name: "低位小规模基金C", scale: { valueYi: 0.24 } }]
);
assert.equal(tinyFundRedeploymentPlan.candidates[0].redeploymentAction, "watch", "redeployment plan must not auto-buy tiny funds even when the chart setup looks ready");
assert(tinyFundRedeploymentPlan.candidates[0].firstGap.includes("基金规模"), "tiny-fund redeployment block must explain the liquidity/scale gap");
assert.equal(
  manager.shouldForcePortfolioRedeploymentSeedScan(redeploymentAccount, redeploymentWatchlist, [starterSetupProfile]),
  false,
  "redeployment seed scan should not expand the pool when an executable starter candidate already exists"
);
assert.equal(
  manager.shouldForcePortfolioRedeploymentSeedScan(
    redeploymentAccount,
    [{ ...redeploymentWatchlist[0], code: "000021", name: "低位小规模基金C" }],
    [{ ...starterSetupProfile, code: "000021", name: "低位小规模基金C", scale: { valueYi: 0.24 } }]
  ),
  true,
  "redeployment seed scan must expand new data sources when high cash has no executable candidate"
);
const redeployedDecision = manager.ensurePortfolioRedeploymentPlanReviewed(
  { actions: [], learningNotes: [] },
  redeploymentAccount,
  redeploymentWatchlist,
  { profiles: [starterSetupProfile] }
);
assert.equal(redeployedDecision.actions[0].action, "BUY", "redeployment guard must inject a small BUY review when a starter setup is eligible");
assert.equal(redeployedDecision.actions[0].targetWeightPct, 1.5, "redeployment guard must keep starter buys small");
assert(redeployedDecision.actions[0].dataBasis.includes("来源：portfolio_redeployment_guard"), "redeployment guard must leave a traceable source");
const enforcedRedeploymentDecision = manager.enforcePortfolioBuyDiscipline(
  redeployedDecision.actions,
  [starterSetupProfile],
  [],
  redeploymentAccount
);
assert.equal(enforcedRedeploymentDecision[0].action, "BUY", "redeployment BUY should survive normal buy discipline when setup and fees are verified");
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
const unverifiedSpecialShareProfile = {
  ...verifiedSeedProfile,
  code: "000030",
  name: "特殊平台份额基金I",
  fees: {
    shareClass: "I",
    minPurchase: "10",
    shareClassFeeModel: { type: "special_or_platform_class", label: "I类：特殊/机构/平台份额" },
    feeImpact: {
      oneYearCostPer10000: 8,
      holdingPeriodFit: "channel_or_institution_only_check"
    }
  }
};
const specialShareBuyGuard = manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000030" }, unverifiedSpecialShareProfile);
assert.equal(specialShareBuyGuard.ok, false, "portfolio buy discipline must block special/platform share classes until retail channel availability is verified");
assert(
  /特殊或平台份额|可申购渠道|起购门槛/.test(specialShareBuyGuard.reason),
  "special share-class block must explain channel availability and minimum-purchase verification"
);
assert(
  manager.buildPortfolioWatchReadinessGaps({ code: "000030", status: "ready" }, unverifiedSpecialShareProfile).some((item) => /特殊\/平台份额|普通渠道可申购/.test(item)),
  "watchlist readiness gaps must expose unverified special/platform share-class availability"
);
const enforcedSpecialShareBuy = manager.enforcePortfolioBuyDiscipline([
  { action: "BUY", code: "000030", name: "特殊平台份额基金I", amount: 1500, reason: "模型想买特殊份额" }
], [unverifiedSpecialShareProfile]);
assert.equal(enforcedSpecialShareBuy[0].action, "WATCH", "execution guard must convert unverified special-share BUY actions into WATCH");
assert.equal(enforcedSpecialShareBuy[0].amount, 0, "execution guard must zero unverified special-share buy amounts");
assert(enforcedSpecialShareBuy[0].dataBasis.some((item) => item.includes("缺普通渠道可申购验证")), "special-share execution guard must preserve the missing channel evidence");
const verifiedSpecialShareProfile = {
  ...unverifiedSpecialShareProfile,
  code: "000031",
  fees: {
    ...unverifiedSpecialShareProfile.fees,
    retailAvailable: true,
    feeRules: {
      subscription: "普通渠道开放申购，10元起购。",
      redemption: "按基金公告赎回。"
    }
  }
};
assert.equal(
  manager.evaluatePortfolioBuyDiscipline({ action: "BUY", code: "000031" }, verifiedSpecialShareProfile).ok,
  true,
  "special/platform share classes may pass only when retail availability, minimum purchase, and subscription rules are explicit"
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
const duplicateOrderDb = manager.normalizePortfolioDb({
  account: {
    initialCapital: 100000,
    cash: 70000,
    positions: [{
      code: "008327",
      name: "东财通信C",
      units: 1000,
      currentValue: 10000,
      costAmount: 9000
    }]
  },
  orders: [
    { id: "older", side: "SELL", code: "008327", name: "东财通信C", amount: 3000, requestedUnits: 300, status: "priced", acceptedDate: "2026-05-25", priceDate: "2026-05-25", submittedAt: "2026-05-25T06:00:00.000Z" },
    { id: "newer", side: "SELL", code: "008327", name: "东财通信C", amount: 3000, requestedUnits: 300, status: "submitted", acceptedDate: "2026-05-25", priceDate: "2026-05-25", submittedAt: "2026-05-25T06:05:00.000Z" }
  ]
});
assert.equal(manager.hasActivePortfolioOrderForAction(duplicateOrderDb.orders, { action: "SELL", code: "008327" }, "SELL"), true, "portfolio order guard must detect active same-fund sell orders");
const cancelledDuplicates = manager.cancelDuplicatePortfolioActiveOrders(duplicateOrderDb);
assert.equal(cancelledDuplicates.length, 1, "duplicate active same-fund orders must be automatically cancelled before lifecycle confirmation");
assert.equal(duplicateOrderDb.orders.find((order) => order.id === "older").status, "priced", "duplicate order dedupe must keep the earliest active order");
assert.equal(duplicateOrderDb.orders.find((order) => order.id === "newer").status, "cancelled", "duplicate order dedupe must cancel later duplicate orders");
manager.syncPortfolioActiveOrderReservations(duplicateOrderDb);
assert.equal(duplicateOrderDb.account.positions[0].pendingSellUnits, 300, "active sell reservations must reflect only the surviving pending order");
assert.equal(manager.hasPortfolioTransactionForOrderDedupe({
  transactions: [
    { id: "txn_old", date: "2026-05-26", side: "SELL", code: "008327", amount: 4200 }
  ]
}, {
  id: "ord_dup",
  side: "SELL",
  code: "008327",
  status: "priced",
  priceDate: "2026-05-26",
  confirmDate: "2026-05-26"
}, { date: "2026-05-26" }), true, "order lifecycle must reject same-day same-fund same-side duplicate confirmations before recording another transaction");
assert.equal(manager.hasPortfolioTransactionForOrderDedupe({
  transactions: [
    { id: "txn_old", date: "2026-05-26", side: "SELL", code: "008327", amount: 4200 }
  ]
}, {
  id: "ord_next_day",
  side: "SELL",
  code: "008327",
  status: "priced",
  priceDate: "2026-05-27",
  confirmDate: "2026-05-27"
}, { date: "2026-05-27" }), false, "duplicate confirmation guard must still allow a later-day staged sell if it is explicitly generated");
const duplicateSettlementDb = manager.normalizePortfolioDb({
  account: { initialCapital: 100000, cash: 70000, receivableCash: 1500, positions: [] },
  settlements: [
    { id: "set_keep", orderId: "ord_001", code: "008327", name: "东财通信C", amount: 1000, dueDate: "2026-05-28", status: "pending", createdAt: "2026-05-26T01:00:00.000Z" },
    { id: "set_dup", orderId: "ord_001", code: "008327", name: "东财通信C", amount: 500, dueDate: "2026-05-28", status: "pending", createdAt: "2026-05-26T06:00:00.000Z" }
  ]
});
const cancelledSettlementDuplicates = manager.dedupePortfolioSettlements(duplicateSettlementDb);
assert.equal(cancelledSettlementDuplicates.length, 1, "duplicate settlement dedupe must cancel later duplicate receivables");
assert.equal(duplicateSettlementDb.settlements.find((item) => item.id === "set_dup").status, "cancelled", "duplicate settlement dedupe must mark duplicates cancelled");
assert.equal(duplicateSettlementDb.account.receivableCash, 1000, "duplicate settlement dedupe must subtract cancelled pending receivables from account receivable cash");
const duplicateBuyOrderDb = manager.normalizePortfolioDb({
  account: { initialCapital: 100000, cash: 98000, pendingBuyAmount: 2000, positions: [] },
  orders: [
    { id: "ord_buy_keep", side: "BUY", code: "004877", name: "低位医疗QDII", amount: 1000, status: "submitted", priceDate: "2026-05-26", confirmDate: "2026-05-28", submittedAt: "2026-05-26T01:00:00.000Z" },
    { id: "ord_buy_dup", side: "BUY", code: "004877", name: "低位医疗QDII", amount: 1000, status: "submitted", priceDate: "2026-05-26", confirmDate: "2026-05-28", submittedAt: "2026-05-26T02:00:00.000Z" }
  ]
});
const duplicateBuyCancelled = manager.cancelDuplicatePortfolioActiveOrders(duplicateBuyOrderDb);
assert.equal(duplicateBuyCancelled.length, 1, "duplicate active buy orders must be cancelled before they double-freeze cash");
assert.equal(duplicateBuyOrderDb.orders.find((item) => item.id === "ord_buy_dup").status, "cancelled", "duplicate active buy order must be marked cancelled");
assert.equal(duplicateBuyOrderDb.account.cash, 99000, "cancelled duplicate buy order must release its frozen cash");
assert.equal(duplicateBuyOrderDb.account.pendingBuyAmount, 1000, "active pending buy amount must be recomputed after duplicate cancellation");
const staleBuyOrderDb = manager.normalizePortfolioDb({
  account: { initialCapital: 100000, cash: 95000, pendingBuyAmount: 5000, positions: [] },
  orders: [
    { id: "ord_stale_buy", side: "BUY", code: "000111", name: "过期申购测试基金C", amount: 5000, status: "submitted", priceDate: "2026-05-19", confirmDate: "2026-05-20", submittedAt: "2026-05-19T06:00:00.000Z" }
  ]
});
const staleBuyCancelled = manager.cancelStalePortfolioActiveOrders(staleBuyOrderDb, null, "2026-05-27");
assert.equal(staleBuyCancelled.length, 1, "stale unconfirmed buy orders must be cancelled after the grace window");
assert.equal(staleBuyOrderDb.orders[0].status, "cancelled", "stale buy order must be marked cancelled");
assert(staleBuyOrderDb.orders[0].cancelReason.includes("释放冻结现金"), "stale buy cancellation must explain cash release");
assert.equal(staleBuyOrderDb.account.cash, 100000, "stale cancelled buy order must restore deployable cash");
assert.equal(staleBuyOrderDb.account.pendingBuyAmount, 0, "stale cancelled buy order must clear pending buy reservations");
const impossibleSellOrderDb = manager.normalizePortfolioDb({
  account: { initialCapital: 100000, cash: 100000, positions: [] },
  orders: [
    { id: "ord_impossible_sell", side: "SELL", code: "008327", name: "旧赎回测试基金C", amount: 3000, requestedUnits: 600, status: "queued", priceDate: "2026-05-27", confirmDate: "2026-05-28", submittedAt: "2026-05-27T06:00:00.000Z" }
  ]
});
const impossibleSellCancelled = manager.cancelStalePortfolioActiveOrders(impossibleSellOrderDb, null, "2026-05-27");
assert.equal(impossibleSellCancelled.length, 1, "impossible active sell orders must be cancelled immediately when the account has no sellable position");
assert.equal(impossibleSellOrderDb.orders[0].status, "cancelled", "impossible active sell order must be marked cancelled before it pollutes active-order views");
assert(impossibleSellOrderDb.orders[0].cancelReason.includes("已无对应持仓"), "impossible sell cancellation must explain the missing-position reason");
const duplicateTransactionDb = {
  account: { cash: 90000, totalAsset: 100000, positions: [] },
  transactions: [
    { id: "txn_keep", orderId: "ord_sell_keep", date: "2026-05-26", side: "SELL", code: "006265", name: "红土创新新科技股票A", amount: 8000, createdAt: "2026-05-26T01:00:00.000Z" },
    { id: "txn_dup", date: "2026-05-26", side: "SELL", code: "006265", name: "红土创新新科技股票A", amount: 2000, createdAt: "2026-05-26T02:00:00.000Z" }
  ],
  orders: [],
  settlements: [],
  runs: []
};
const reversedTransactions = manager.repairDuplicatePortfolioTransactions(duplicateTransactionDb);
assert.equal(reversedTransactions.length, 1, "duplicate transaction repair must mark later same-day same-fund fills as reversed");
assert.equal(duplicateTransactionDb.transactions.find((item) => item.id === "txn_dup").reversed, true, "duplicate transaction must be retained for audit but excluded by a reversed flag");
assert(!manager.buildPortfolioBacktestDiagnostics(duplicateTransactionDb).items.some((item) => item.label === "重复成交回测"), "reversed duplicate transactions must no longer keep the manager in ledger-integrity lockdown");
const accountRiskBudget = manager.buildPortfolioAccountRiskBudget({
  totalAsset: 93500,
  peakTotalAsset: 100000
});
assert.equal(accountRiskBudget.level, "breached", "portfolio account risk budget must detect drawdown budget breaches");
assert.equal(accountRiskBudget.blockNewBuys, true, "portfolio drawdown budget breaches must block new buys");
const accountDrawdownBuyGuard = manager.evaluatePortfolioBuyDiscipline(
  { action: "BUY", code: "000010", amount: 1000, targetWeightPct: 3 },
  verifiedSeedProfile,
  [],
  { totalAsset: 93500, peakTotalAsset: 100000 }
);
assert.equal(accountDrawdownBuyGuard.ok, false, "portfolio buy discipline must block buys while account drawdown exceeds budget");
assert(accountDrawdownBuyGuard.reason.includes("最大回撤预算"), "account drawdown buy block must explain the portfolio risk budget");
const drawdownBlockedBuyAmount = manager.resolvePortfolioTradeAmount({
  totalAsset: 93500,
  peakTotalAsset: 100000,
  cash: 50000,
  positions: []
}, { action: "BUY", code: "000010", amount: 5000, targetWeightPct: 5 }, "BUY", null, verifiedSeedProfile);
assert.equal(drawdownBlockedBuyAmount, 0, "portfolio buy sizing must return zero when account drawdown budget is breached");
const drawdownRiskActions = manager.buildPortfolioRiskBudgetActions({
  totalAsset: 93500,
  peakTotalAsset: 100000,
  positions: [{ code: "000010", name: "中证A500ETF联接C", currentValue: 7000, weightPct: 7, unrealizedPnlPct: -2 }]
}, [verifiedSeedProfile]);
assert.equal(drawdownRiskActions[0].action, "SELL", "account drawdown breach must create deterministic risk-reduction SELL actions");
assert(drawdownRiskActions[0].dataBasis.includes("来源：portfolio_risk_budget_guard"), "portfolio risk budget actions must be traceable");
const riskBudgetOverridesBuy = manager.enforcePortfolioRiskBudget([
  { action: "BUY", code: "000010", name: "中证A500ETF联接C", amount: 1000, targetWeightPct: 3, reason: "模型想低吸" }
], {
  totalAsset: 93500,
  peakTotalAsset: 100000,
  positions: [{ code: "000010", name: "中证A500ETF联接C", currentValue: 7000, weightPct: 7, unrealizedPnlPct: -2 }]
}, [verifiedSeedProfile]);
assert.equal(riskBudgetOverridesBuy[0].action, "SELL", "portfolio risk budget must override model-written BUY actions on risky held positions");
assert(riskBudgetOverridesBuy[0].reason.includes("系统账户回撤控制"), "risk-budget override must explain account drawdown control");
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
const stopLossPositionRisk = manager.buildPortfolioPositionRiskBudget({
  code: "000010",
  currentValue: 5450,
  costAmount: 6000,
  unrealizedPnlPct: -9.17,
  peakUnrealizedPnlPct: 2
});
assert.equal(stopLossPositionRisk.reduceRisk, true, "single-position stop loss must trigger deterministic risk reduction");
assert.equal(stopLossPositionRisk.level, "severe", "single-position stop loss must be classified as severe risk");
const stopLossSellGuard = manager.evaluatePortfolioSellDiscipline(
  { action: "SELL", code: "000010", amount: 3000, reason: "系统单仓回撤控制：浮亏-9.17%触及8%单仓止损线" },
  verifiedSeedProfile,
  { code: "000010", name: "中证A500ETF联接C", currentValue: 5450, weightPct: 5.45, unrealizedPnlPct: -9.17, peakUnrealizedPnlPct: 2 }
);
assert.equal(stopLossSellGuard.ok, true, "portfolio sell discipline must allow deterministic single-position stop-loss sells");
const givebackPositionRisk = manager.buildPortfolioPositionRiskBudget({
  code: "000011",
  currentValue: 6360,
  costAmount: 6000,
  unrealizedPnlPct: 6,
  peakUnrealizedPnlPct: 12.5
});
assert.equal(givebackPositionRisk.reduceRisk, true, "profit giveback must trigger deterministic risk reduction");
const givebackSellGuard = manager.evaluatePortfolioSellDiscipline(
  { action: "SELL", code: "000011", amount: 3000, reason: "浮盈回吐保护，先分批锁定利润" },
  hotVerifiedSeedProfile,
  { code: "000011", name: "热门强势主题基金A", currentValue: 6360, weightPct: 6.36, unrealizedPnlPct: 6, peakUnrealizedPnlPct: 12.5 }
);
assert.equal(givebackSellGuard.ok, true, "portfolio sell discipline must allow profit-giveback protection sells");
const fallbackStopLossSellGuard = manager.evaluatePortfolioSellDiscipline(
  { action: "SELL", code: "000010", amount: 3000, reason: "系统单仓回撤控制：浮亏-9.2%触及8%单仓止损线" },
  null,
  { code: "000010", name: "中证A500ETF联接C", currentValue: 5400, weightPct: 5.4, lastNav: 1.2345, lastNavDate: "2026-05-21", unrealizedPnlPct: -9.2, peakUnrealizedPnlPct: 1.2 }
);
assert.equal(fallbackStopLossSellGuard.ok, true, "held-position stop-loss sells must not be blocked just because enriched profile fetch temporarily failed");
assert(fallbackStopLossSellGuard.evidence.some((item) => item.includes("portfolio_sell_last_confirmed_nav_guard")), "fallback sell confirmation must disclose last-confirmed NAV evidence");
const fallbackNoRiskSellGuard = manager.evaluatePortfolioSellDiscipline(
  { action: "SELL", code: "000010", amount: 3000, reason: "模型想卖出" },
  null,
  { code: "000010", name: "中证A500ETF联接C", currentValue: 6200, weightPct: 6.2, lastNav: 1.2345, lastNavDate: "2026-05-21", unrealizedPnlPct: 3.2 }
);
assert.equal(fallbackNoRiskSellGuard.ok, false, "last-confirmed NAV fallback must still block sells without risk or profit-control evidence");
const missingNavGivebackSellGuard = manager.evaluatePortfolioSellDiscipline(
  { action: "SELL", code: "000011", amount: 3000, reason: "浮盈回吐保护，先分批锁定利润" },
  { ...hotVerifiedSeedProfile, unitNav: "", estimatedNav: "" },
  { code: "000011", name: "热门强势主题基金A", currentValue: 6360, weightPct: 6.36, lastNav: 1.4567, lastNavDate: "2026-05-21", unrealizedPnlPct: 6, peakUnrealizedPnlPct: 12.5 }
);
assert.equal(missingNavGivebackSellGuard.ok, true, "profile NAV failures should use held-position last NAV when profit-giveback evidence is clear");

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
    lowPositionPct250: 42.5,
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
    lowPositionPct250: 46.8,
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
    lowPositionPct250: 76.2,
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
const longHighPullbackDigest = {
  ...setupDigest,
  trendProfile: {
    ...setupDigest.trendProfile,
    lowPositionPct120: 36.4,
    lowPositionPct250: 91.6,
    return120dPct: 24.8,
    drawdownFromRecentHighPct: -4.2
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
    manager.scoreResearchDigestForPullbackSetup(longHighPullbackDigest),
  "deep-dive scoring must downgrade funds that look low in 120-day windows but are high in 250-day position"
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
    { ...stalePullbackDigest, code: "000008", name: "旧净值修复基金C" },
    { ...longHighPullbackDigest, code: "000009", name: "年线高位修复基金C" }
  ]
});
assert(highPositionSummary.includes("mainCandidateCodes=000001"), "genuinely low-position setup should remain a main candidate");
assert(/watchOrRejectCodes=.*000004/.test(highPositionSummary), "pullback-looking but high-position fund must be demoted to watch/reject");
assert(/watchOrRejectCodes=.*000005/.test(highPositionSummary), "pullback-looking fund with missing low-position evidence must be visible only as watch/reject");
assert(/watchOrRejectCodes=.*000006/.test(highPositionSummary), "pullback-looking fund without 5/10-day early turn must be visible only as watch/reject");
assert(/watchOrRejectCodes=.*000007/.test(highPositionSummary), "year-to-date high pullback-looking fund must be demoted to watch/reject");
assert(/watchOrRejectCodes=.*000008/.test(highPositionSummary), "stale pullback-looking fund must be demoted to watch/reject");
assert(/watchOrRejectCodes=.*000009/.test(highPositionSummary), "250-day high pullback-looking fund must be demoted to watch/reject");
assert(highPositionSummary.includes("今年以来=52.4%"), "deep-dive summary must expose year-to-date position evidence for pullback candidates");
assert(highPositionSummary.includes("今年以来+52.4%偏高"), "deep-dive summary must explain when a candidate is not truly low because year-to-date return is high");
assert(highPositionSummary.includes("净值日期=2000-01-01"), "deep-dive summary must expose stale NAV/trend evidence dates");
assert(highPositionSummary.includes("净值走势已过期"), "deep-dive summary must explain stale trend evidence before buying");
assert(highPositionSummary.includes("250日位置=91.6%"), "deep-dive summary must expose 250-day position evidence for pseudo-low pullbacks");
assert(highPositionSummary.includes("250日位置91.6%偏高"), "deep-dive summary must explain when a 120-day pullback is not truly low in the longer window");
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
const holdingsSupportedDigest = {
  ...setupDigest,
  code: "000031",
  name: "医药低位修复基金C",
  seed: {
    matchedThemes: [{
      id: "medicine",
      name: "医药",
      stage: "low_position_rotation",
      positionSignal: "low_position_rotation",
      rotationScore: 58,
      lowPositionScore: 62,
      crowdingScore: 18,
      forwardScore: 48
    }]
  },
  holdings: {
    ok: true,
    equityTopHoldings: [
      "600276 恒瑞医药 8.4%",
      "300760 迈瑞医疗 6.7%",
      "2269.HK 药明生物 5.2%",
      "300015 爱尔眼科 4.1%",
      "688235 百济神州 3.8%",
      "300347 泰格医药 3.4%",
      "000661 长春高新 2.8%",
      "300122 智飞生物 2.5%",
      "600436 片仔癀 2.1%",
      "300558 贝达药业 1.9%"
    ],
    equityDisclosureDate: "2099-03-31"
  }
};
const holdingsWeakDigest = {
  ...setupDigest,
  code: "000032",
  name: "医药错配集中基金C",
  seed: holdingsSupportedDigest.seed,
  holdings: {
    ok: true,
    equityTopHoldings: [
      "600519 贵州茅台 21.5%",
      "000858 五粮液 15.2%",
      "600036 招商银行 12.8%",
      "601318 中国平安 8.4%",
      "000333 美的集团 6.7%",
      "600887 伊利股份 4.2%",
      "601288 农业银行 3.8%",
      "601398 工商银行 3.2%"
    ],
    equityDisclosureDate: "2000-01-01"
  }
};
assert(
  manager.scoreResearchDigestForPullbackSetup(holdingsSupportedDigest) >
    manager.scoreResearchDigestForPullbackSetup(holdingsWeakDigest),
  "deep-dive scoring must prefer pullback candidates whose top ten holdings support the forward-looking theme"
);
const holdingsSummary = manager.buildMarketDeepDiveSummary({
  ok: true,
  focus: "pullback_setup_discovery",
  selectionDiscipline: "prefer_pullback_complete_launch_setup_not_chase",
  candidates: [holdingsSupportedDigest, holdingsWeakDigest]
});
assert(holdingsSummary.includes("mainCandidateCodes=000031"), "holdings-supported pullback candidate should remain eligible for main recommendations");
assert(holdingsSummary.includes("watchOrRejectCodes=000032"), "stale or mismatched top-ten holdings must demote an otherwise repaired trend to watch/reject");
assert(holdingsSummary.includes("持仓前景=支撑买点"), "deep-dive summary must expose top-ten holdings outlook");
assert(holdingsSummary.includes("恒瑞医药"), "deep-dive summary must name representative top holdings instead of hiding them behind a generic score");
assert(holdingsSummary.includes("前十大持仓与目标主题匹配度不足"), "deep-dive gaps must explain when holdings do not support the requested fund outlook");
const holdingsActionability = manager.buildFundActionabilitySignals(holdingsSupportedDigest);
assert(
  holdingsActionability.decisiveEvidence.some((item) => item.includes("持仓前景") && item.includes("恒瑞医药")),
  "actionability evidence must include top-ten holdings outlook, not only trend and fee signals"
);
assert.equal(holdingsActionability.holdingsOutlook.hasHoldings, true, "actionability must carry the structured holdings outlook profile");
const hotButStrongActionability = manager.buildFundActionabilitySignals({
  ...holdingsSupportedDigest,
  code: "000033",
  name: "短期偏热强势基金A",
  trendProfile: {
    ...hotDigest.trendProfile,
    ok: true,
    latestDate: "2099-05-22",
    lowPositionPct120: 96.9,
    lowPositionPct250: 97.6
  },
  risk: {
    oneYear: {
      ok: true,
      totalReturnPct: 264.88,
      annualizedReturnPct: 265.2,
      maxDrawdownPct: -10.38,
      sharpe: 6.04
    }
  },
  fees: {
    shareClass: "A",
    shareClassFeeModel: { type: "front_load_or_subscription_fee", label: "A类：偏前端申购费模型" },
    feeImpact: {
      oneYearCostPer10000: 14.98,
      feeDragLevel: "low",
      missingFeeData: []
    },
    missingFeeData: []
  }
});
assert.equal(hotButStrongActionability.action, "wait", "actionability must not say staged-buy when trend says extended uptrend and wait pullback");
assert(hotButStrongActionability.score < 62, "wait-pullback discipline must cap actionability below staged-buy threshold");
assert(
  hotButStrongActionability.decisionBlocker.some((item) => item.includes("系统动作降级") && item.includes("不能给买入或分批买入动作")),
  "actionability blocker must explain why a hot fund is downgraded instead of sounding inconsistent"
);
const intradayFadingStrongActionability = manager.buildFundActionabilitySignals({
  ...holdingsSupportedDigest,
  code: "000035",
  name: "盘中冲高回落基金C",
  trendProfile: {
    ...holdingsSupportedDigest.trendProfile,
    ok: true,
    latestDate: "2099-05-22",
    entryBias: "buyable_now",
    trendLabel: "uptrend",
    pullbackSetup: { signal: "pullback_complete", signalText: "回调完成", score: 84 },
    lowPositionPct120: 35.2,
    lowPositionPct250: 42.7,
    return5dPct: 1.2,
    return10dPct: 2.4,
    return20dPct: 4.1,
    return60dPct: 5.6
  },
  intradayTrend: {
    label: "盘中走强，冲高回落，尾盘转弱",
    changeFromOpenPct: 0.42,
    pullbackFromHighPct: -0.91,
    recentSlopePct: -0.38,
    points: 80
  },
  risk: {
    oneYear: {
      ok: true,
      totalReturnPct: 18.4,
      annualizedReturnPct: 18.6,
      maxDrawdownPct: -10.2,
      sharpe: 1.12
    }
  },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { type: "sales_service_fee", label: "C类：偏销售服务费模型" },
    feeImpact: {
      oneYearCostPer10000: 42,
      feeDragLevel: "low",
      missingFeeData: []
    },
    missingFeeData: []
  }
});
assert.equal(intradayFadingStrongActionability.action, "wait", "actionability must not say buy/staged-buy when intraday valuation fades from the high");
assert(intradayFadingStrongActionability.score < 62, "intraday fading discipline must cap actionability below staged-buy threshold");
assert(
  intradayFadingStrongActionability.decisiveEvidence.some((item) => item.includes("盘中估值") && item.includes("冲高回落")),
  "actionability evidence must include intraday valuation trend when it changes the decision"
);
assert(
  intradayFadingStrongActionability.decisionBlocker.some((item) => item.includes("系统盘中走势降级") && item.includes("不能把估算涨幅当追买理由")),
  "actionability blocker must explain intraday fading downgrades in customer-readable Chinese"
);
const valuationConflictActionability = manager.buildFundActionabilitySignals({
  ...holdingsSupportedDigest,
  code: "000036",
  name: "估值源打架基金C",
  trendProfile: {
    ...holdingsSupportedDigest.trendProfile,
    ok: true,
    latestDate: "2099-05-22",
    entryBias: "buyable_now",
    trendLabel: "uptrend",
    pullbackSetup: { signal: "pullback_complete", signalText: "回调完成", score: 84 },
    lowPositionPct120: 35.2,
    lowPositionPct250: 42.7,
    return5dPct: 1.2,
    return10dPct: 2.4,
    return20dPct: 4.1,
    return60dPct: 5.6
  },
  valuationSourceAgreement: {
    status: "conflict",
    label: "实时估值源明显分歧",
    primaryChangePct: 0.82,
    supplementalChangePct: -0.55,
    divergencePct: 1.37
  },
  risk: {
    oneYear: {
      ok: true,
      totalReturnPct: 18.4,
      annualizedReturnPct: 18.6,
      maxDrawdownPct: -10.2,
      sharpe: 1.12
    }
  },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { type: "sales_service_fee", label: "C类：偏销售服务费模型" },
    feeImpact: {
      oneYearCostPer10000: 42,
      feeDragLevel: "low",
      missingFeeData: []
    },
    missingFeeData: []
  }
});
assert.equal(valuationConflictActionability.action, "wait", "actionability must not say buy/staged-buy when realtime valuation sources disagree materially");
assert(valuationConflictActionability.score < 62, "valuation-source conflict discipline must cap actionability below staged-buy threshold");
assert(
  valuationConflictActionability.decisiveEvidence.some((item) => item.includes("估值源") && item.includes("明显分歧")),
  "actionability evidence must include realtime valuation-source disagreement when it changes the decision"
);
assert(
  valuationConflictActionability.decisionBlocker.some((item) => item.includes("系统估值源分歧降级") && item.includes("不能把单一估算源当作买点确认")),
  "actionability blocker must explain valuation-source conflict downgrades in customer-readable Chinese"
);
const staleButStrongDigest = {
  ...holdingsSupportedDigest,
  code: "000034",
  name: "旧净值强势基金C",
  snapshotDate: "2000-01-01",
  nav: { navDate: "2000-01-01", nav: 1.2345 },
  trendProfile: {
    ...holdingsSupportedDigest.trendProfile,
    ok: true,
    latestDate: "2000-01-01",
    entryBias: "buyable_now",
    trendLabel: "uptrend",
    pullbackSetup: { signal: "pullback_complete", signalText: "回调完成", score: 82 },
    lowPositionPct120: 38.5,
    lowPositionPct250: 46.2,
    return5dPct: 1.4,
    return10dPct: 2.8,
    return20dPct: 4.5,
    return60dPct: 7.2
  },
  risk: {
    oneYear: {
      ok: true,
      totalReturnPct: 18.4,
      annualizedReturnPct: 18.6,
      maxDrawdownPct: -10.2,
      sharpe: 1.12
    }
  },
  fees: {
    shareClass: "C",
    shareClassFeeModel: { type: "sales_service_fee", label: "C类：偏销售服务费模型" },
    feeImpact: {
      oneYearCostPer10000: 42,
      feeDragLevel: "low",
      missingFeeData: []
    },
    missingFeeData: []
  }
};
const staleButStrongActionability = manager.buildFundActionabilitySignals(staleButStrongDigest);
assert.equal(staleButStrongActionability.action, "wait", "actionability must not say buy/staged-buy when NAV or trend evidence is stale");
assert(staleButStrongActionability.score < 62, "stale-data discipline must cap actionability below staged-buy threshold");
assert(
  staleButStrongActionability.decisionBlocker.some((item) => item.includes("系统数据时效降级") && item.includes("重新下钻复核") && item.includes("不能给买入或分批买入动作")),
  "actionability blocker must explain stale NAV/trend data instead of presenting stale evidence as buyable"
);
const staleBuyAnswerQuality = manager.evaluateFundAnswerQuality({
  text: "直接结论：000034 旧净值强势基金C 可以分批买入1000元。依据是净值走势回调完成、120日位置38.5%。",
  workflow: "fund_qa",
  userText: "000034 现在能买吗",
  evidence: { enrichments: [{ ...staleButStrongDigest, actionability: staleButStrongActionability }] }
});
assert(
  staleBuyAnswerQuality.issues.includes("stale_data_candidate_given_buy_execution"),
  "quality gate must reject buy amounts when the candidate's NAV/trend evidence is stale"
);
assert(
  staleBuyAnswerQuality.issues.includes("stale_data_candidate_given_buy_signal"),
  "quality gate must reject buy-intent language when the candidate's NAV/trend evidence is stale"
);
const staleWaitAnswerQuality = manager.evaluateFundAnswerQuality({
  text: "直接结论：000034 旧净值强势基金C 先等待，1万元执行为0元。原因是净值/走势已过期，需要重新下钻复核后再判断买点。",
  workflow: "fund_qa",
  userText: "000034 现在能买吗",
  evidence: { enrichments: [{ ...staleButStrongDigest, actionability: staleButStrongActionability }] }
});
assert(
  !staleWaitAnswerQuality.issues.some((issue) => issue.startsWith("stale_data_candidate")),
  "quality gate should allow stale candidates when the answer explicitly says 0 yuan and recheck first"
);
const earlyTurnTrend = manager.computeTrendProfile(buildEarlyTurnNavPoints());
assert.equal(earlyTurnTrend.ok, true, "early-turn synthetic series should produce a trend profile");
assert(
  ["pullback_complete", "launch_setup"].includes(earlyTurnTrend.pullbackSetup.signal),
  "5/10-day early turn from a low 120-day position must count as a pullback/setup signal"
);
assert.notEqual(earlyTurnTrend.entryBias, "wait_pullback", "early low-position turn should not be treated as a wait-for-pullback chase");
assert(Number(earlyTurnTrend.lowPositionPct120) <= 55, "early low-position turn should expose 120-day low-position evidence");
assert(Number.isFinite(Number(earlyTurnTrend.lowPositionPct250)), "trend profiles must expose 250-day position evidence for long-window pseudo-low checks");
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
const numericDumpAnswer = [
  "直接结论：分批买入1000元。",
  "000001 低位基金C：近5日+1.1%，近10日+2.2%，近20日+3.3%，近60日-4.4%，近120日+5.5%，120日位置38.5%，250日位置42.2%，距高点-7.1%，夏普0.8，回撤-12.3%，规模42亿，费率0.4%。",
  "000002 备选基金A：近5日+1.4%，近10日+2.5%，近20日+3.6%，近60日-4.1%，120日位置35.5%，250日位置40.2%，距高点-8.1%，夏普0.9，回撤-11.3%，规模36亿。",
  "000003 观察基金C：近5日+1.6%，近10日+2.7%，近20日+3.8%，近60日-3.8%，120日位置39.5%，250日位置41.2%，距高点-6.1%，夏普0.7，回撤-10.3%，规模18亿。"
].join("\n");
const numericDumpQuality = manager.evaluateFundAnswerQuality({
  text: numericDumpAnswer,
  workflow: "fund_recommendation",
  userText: setupQuery,
  evidence: { marketDeepDive: { candidates: [setupDigest, setupDigestSecond] } }
});
assert(numericDumpQuality.issues.includes("numeric_dump_without_interpretation"), "quality gate must reject numeric dumps that lack enough trend interpretation");
assert(manager.hasNumericDumpWithoutInterpretation(numericDumpAnswer), "numeric dump detector must be exported for deterministic regression coverage");
const denseSingleFundLine = "000001 低位基金C：近5日+1.1%，近10日+2.2%，近20日+3.3%，近60日-4.4%，近120日+5.5%，120日位置38.5%，250日位置42.2%，距高点-7.1%，夏普0.8，回撤-12.3%，规模42亿，费率0.4%，走势低位修复，买点需要等待启动确认。";
assert(manager.hasNumericDumpWithoutInterpretation(`直接结论：分批观察。\n${denseSingleFundLine}\n风险边界：不追涨。`), "quality gate must reject a single dense fund line that reads like a metric dump");
const compactedDenseSingleFundLine = manager.normalizeUserFacingFundAnswer(denseSingleFundLine);
assert(compactedDenseSingleFundLine.includes("走势低位修复"), "numeric compaction must keep the trend interpretation rather than only raw figures");
assert(compactedDenseSingleFundLine.includes("其余明细交给配图和后续复盘"), "numeric compaction must tell users where the detailed figures went");
assert((compactedDenseSingleFundLine.match(/(?:[+-]?\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:元|万|亿)|近\s*\d+\s*日|\d+\s*日位置|夏普\s*\d+(?:\.\d+)?|回撤\s*[+-]?\d+(?:\.\d+)?)/g) || []).length <= 3, "numeric compaction must leave only a few decision-changing numbers per fund line");
const readablePortfolioReport = manager.normalizePortfolioUserFacingText([
  "虚拟基金经理日报 2026-05-25",
  "今日手法：不追涨，只做低位启动候选复核。",
  "市场判断：现金充足但候选需要重新验证。",
  "投委会意见：",
  "市场分析师 中：科技偏热，医药低位待确认。",
  "今日操作：",
  "卖出 008327 东财通信C 建议11810.03元：近20日+19.64%，近60日+61.1%，120日位置100%，250日位置100%，距高点0%，浮盈回吐5.2个百分点，走势高位拥挤，原因是先保护利润。"
].join("\n"));
assert(readablePortfolioReport.includes("\n\n今日手法"), "portfolio reports must insert blank lines between major sections");
assert(readablePortfolioReport.includes("\n\n市场判断"), "portfolio reports must keep market view visually separated");
assert(readablePortfolioReport.includes("\n\n投委会意见"), "portfolio committee sections must not be glued to the prior paragraph");
assert(readablePortfolioReport.includes("其余明细交给配图和后续复盘"), "portfolio dense action reasons must be compacted for card readability");
const readableDecisionCard = manager.buildPortfolioDecisionCard({
  decision: {
    summary: "今日采取高位科技减仓复核 + 低位医药小额试探 + 购买准备队列继续等待触发的虚拟组合操作，不做重仓追涨。",
    marketView: "账户总资产99671.93元，较峰值回撤-1.6%，低于3%预警线，账户级风险预算允许小额买入；但组合当前权益仓约29.64%，且几乎集中在通信、AI、芯片等高位科技链。",
    team: [
      {
        agent: "风控经理",
        stance: "负",
        reason: "008327、006265、001986均显示单仓回吐保护复核信号，且008327、006265、001986在新易盛、中际旭创、东山精密等底层持仓上明显重叠。"
      }
    ],
    actions: [
      {
        action: "SELL",
        code: "008327",
        name: "东财通信C",
        amount: 11810.03,
        targetWeightPct: 8,
        reason: "系统组合集中度控制：同题材暴露科技约29.6%；底层重叠300502 新易盛涉及3只基金；同题材暴露过度集中，先分批降低同题材暴露。该基金近20日+19.64%、近60日+61.1%，120日和250日位置均为100%，且账户单仓触发回吐保护复核。",
        rotationCheck: "通信/光模块方向不是低位轮动，而是高位延伸；没有完整市场快照支持继续追高。",
        positionCheck: "过热追涨，高位趋势延伸，距近期高点0%。",
        riskControl: "曾浮盈+3.24%但当前转亏-1.58%，需要回吐保护。",
        feeCheck: "当前持有C类，前端申购费0，销售服务费0.25%/年，每万元1年约25元，适合战术持有；本次是赎回减仓，不新增同基金其他份额。"
      }
    ],
    riskNotes: [
      "本次未提供完整marketSnapshot.dataQuality、主要指数、板块资金和新闻模块，按partial数据处理；因此新增012046只做2.5%小额试仓，不做重仓买入。",
      "科技仓穿透重叠较高：008327、006265、001986共同暴露新易盛、中际旭创、东山精密等方向，且多只处于高位短期涨幅偏热，今日以降风险为先。"
    ],
    learningNotes: [
      "今日购买准备队列不能只看readinessScore，必须逐只检查5日/10日转强、120日位置、QDII滞后、份额类别和费用完整性。"
    ]
  },
  watchlistUpdates: [
    {
      code: "010802",
      name: "长江量化消费精选股票C",
      status: "waiting_pullback",
      statusText: "等待回调",
      reason: "净值验证：趋势回调完成，5日+0.47%，10日-0.89%，20日+0.45%，60日-7.74%，120日位置6.1%，距高点-14.21%",
      buyTriggers: ["备选候选需等回踩确认或5日/10日重新转强。"],
      riskNotes: ["规模、费用和集中度风险仍需复核，不能只因低位就重仓。"],
      feeNotes: ["C类销售服务费0.40%/年，每万元1年约40元，适合30-180天战术观察。"]
    }
  ],
  account: {
    totalAsset: 100980.4,
    cash: 70132.17,
    pendingBuyAmount: 0,
    receivableCash: 0,
    positionWeightPct: 30.55,
    peakTotalAsset: 101291.65,
    drawdownFromPeakPct: -0.31,
    riskBudget: { label: "回撤正常", blockNewBuys: false }
  },
  orders: [],
  transactions: [],
  executionNotes: [],
  settlementEvents: [],
  run: { date: "2026-05-25", sources: [] }
});
assert(readableDecisionCard.includes("直接结论："), "portfolio decision card must start with a customer-readable conclusion");
assert(readableDecisionCard.includes("下一步："), "portfolio decision card must state the next validation step instead of only listing metrics");
assert(readableDecisionCard.includes("不急着追进同一热门方向"), "portfolio next-step copy must explain the manager's operating logic in plain Chinese");
assert(readableDecisionCard.includes("走势：") && readableDecisionCard.includes("为什么：") && readableDecisionCard.includes("边界："), "portfolio action cards must explain trend, reason, and operating boundary in separate readable lines");
assert(readableDecisionCard.includes("关注点：") && readableDecisionCard.includes("触发：") && readableDecisionCard.includes("风险："), "watchlist updates must be split into readable reason/trigger/risk lines");
assert(readableDecisionCard.includes("当前资产：仓位中等") && readableDecisionCard.includes("现金很充足"), "account section must describe position and cash state instead of dumping raw account figures");
assert(!readableDecisionCard.includes("marketSnapshot.dataQuality") && !readableDecisionCard.includes("readinessScore"), "portfolio reports must hide raw internal field names from customers");
const settlementAwareDecisionCard = manager.buildPortfolioDecisionCard({
  decision: {
    summary: "赎回结算中，先复核低位候选。",
    marketView: "市场正常，但执行上不把未到账赎回款当作买入资金。",
    team: [],
    actions: [],
    riskNotes: [],
    learningNotes: []
  },
  watchlistUpdates: [],
  account: {
    totalAsset: 100000,
    cash: 15000,
    pendingBuyAmount: 0,
    receivableCash: 70000,
    positionWeightPct: 0,
    peakTotalAsset: 100000,
    drawdownFromPeakPct: 0,
    riskBudget: { label: "回撤正常", blockNewBuys: false }
  },
  orders: [],
  transactions: [],
  executionNotes: [],
  settlementEvents: [],
  run: { date: "2026-05-26", sources: [] }
});
assert(settlementAwareDecisionCard.includes("现金不算多，可动用约15"), "customer account line must use deployable cash rather than cash plus receivables");
assert(settlementAwareDecisionCard.includes("赎回款约70") && settlementAwareDecisionCard.includes("不当作买入火力"), "customer account line must explain unsettled redemption cash separately");
const readableDecisionCardLines = readableDecisionCard.split(/\n+/);
assert(readableDecisionCardLines.every((line) => line.length < 180), "portfolio decision card lines must stay short enough for Feishu reading");
assert(readableDecisionCardLines.filter((line) => /(?:风险控制|回溯学习点|关注点|触发|风险)/.test(line)).every((line) =>
  (line.match(/(?:[+-]?\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:元|万|亿)|近\s*\d+\s*日|\d+\s*日位置|\d{6})/g) || []).length <= 4
), "customer-facing report support lines must avoid dense numeric dumps");

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
const partialDataQualityEvidence = {
  marketSnapshot: {
    dataQuality: {
      level: "partial",
      summary: "市场数据部分可用，但存在缺口。",
      missing: [
        { key: "preciousMetals", label: "贵金属行情", status: "missing", error: "timeout" },
        { key: "industryBoards", label: "行业板块", status: "missing", error: "timeout" }
      ],
      notes: ["市场数据部分缺失：贵金属行情、行业板块，相关结论需要降低把握度。"]
    },
    fundCandidates: { preciousMetalFunds: [{ code: "000001", name: "黄金ETF联接C" }] }
  }
};
const missingDataQualityDisclosure = manager.evaluateFundAnswerQuality({
  text: "直接结论：分批买入1000元。依据是黄金ETF方向近20日+4.5%，120日位置38.5%。",
  workflow: "fund_qa",
  userText: "黄金最近值得买吗",
  evidence: partialDataQualityEvidence
});
assert(
  missingDataQualityDisclosure.issues.includes("missing_market_data_quality_disclosure"),
  "quality gate must reject answers that ignore partial/poor market data quality"
);
const disclosedDataQuality = manager.evaluateFundAnswerQuality({
  text: "直接结论：先观察，1万元暂不重仓，只看0-500元试探。公开数据有缺口：贵金属行情和行业板块暂未抓到，因此这条判断把握度中等，待复核后再买。依据是黄金ETF方向近20日+4.5%，120日位置38.5%。",
  workflow: "fund_qa",
  userText: "黄金最近值得买吗",
  evidence: partialDataQualityEvidence
});
assert(
  !disclosedDataQuality.issues.includes("missing_market_data_quality_disclosure"),
  "quality gate must pass answers that disclose data gaps and downgrade conviction"
);
const deterministicDataQualityFallback = await manager.enforceFundAnswerQuality({
  text: "直接结论：分批买入1000元。依据是黄金ETF方向近20日+4.5%，120日位置38.5%。",
  workflow: "fund_qa",
  userText: "黄金最近值得买吗",
  intent: { workflow: "fund_qa" },
  evidence: partialDataQualityEvidence
});
assert(deterministicDataQualityFallback.includes("数据缺口提示"), "quality enforcement must deterministically add market data gap disclosure when model rewrite is unnecessary");
assert(deterministicDataQualityFallback.includes("贵金属行情") && deterministicDataQualityFallback.includes("降低把握度"), "deterministic market data fallback must name missing modules and downgrade conviction");
const localizationOnlyAnswer = await manager.enforceFundAnswerQuality({
  text: "Verdict: staged buy. Confidence: high. Score: 82/100. 依据：净值近20日+4.5%，距高点回撤7%，120日位置38.5%。新资金先买1000元。",
  workflow: "fund_qa",
  userText: "黄金最近值得买吗",
  intent: { workflow: "fund_qa" },
  evidence: { marketDeepDive: { candidates: [setupDigest] } }
});
assert(localizationOnlyAnswer.includes("结论：分批买入"), "quality enforcement should accept deterministic localization when it fixes English labels");
assert(localizationOnlyAnswer.includes("我对这条判断把握度较高"), "quality enforcement should rewrite stiff confidence labels before model rewrite");
assert(!/\b(?:Verdict|Confidence|Score|staged buy)\b/i.test(localizationOnlyAnswer), "quality enforcement localization pass must remove raw English labels");
const noChartGuideSanitized = manager.appendFundReportChartReadingGuide(
  "Verdict: staged buy. Confidence: high. Score: 82/100.",
  []
);
assert(noChartGuideSanitized.includes("结论：分批买入"), "chart guide finalizer must sanitize fund answers even when no charts are appended");
assert(!/\b(?:Verdict|Confidence|Score|staged buy)\b/i.test(noChartGuideSanitized), "chart guide finalizer must not return raw English labels");
assert(manager.isFundChartGlossaryQuestion("这些基金图里的 stage 和 120日位置都是什么意思？"), "fund QA must detect chart metric glossary questions");
const chartGlossaryAnswer = manager.buildFundReportChartGlossaryAnswer();
assert(chartGlossaryAnswer.includes("后续新图会直接显示中文短标签和决策理由"), "chart glossary answer must promise Chinese-first decision labels");
assert(chartGlossaryAnswer.includes("本质上就是这个"), "chart glossary answer must explain the old stage wording in natural Chinese");
assert(chartGlossaryAnswer.includes("先看能不能买，再看是不是低位，最后看成本和风险"), "chart glossary answer must give a simple chart reading order");
const chartGuideWithThemeStage = manager.appendFundReportChartReadingGuide(
  "推荐清单：000000 低位修复基金C，可以作为买入参考。",
  [buildChartProfile()]
);
assert(chartGuideWithThemeStage.includes("读图顺序：先看底部“为什么买或备选”"), "chart guide must give users a plain decision-first reading order");
assert(chartGuideWithThemeStage.includes("板块位置=这条赛道现在处在低位、确认、扩散还是拥挤"), "chart guide must explain theme-stage metrics as Chinese board-position wording");
assert(chartGuideWithThemeStage.includes("指标速读：近20日/近60日看是否追涨"), "chart guide must include a plain metric quick-read");
assert(chartGuideWithThemeStage.includes("医药，板块位置低位轮动"), "per-chart guide must translate theme stage evidence into Chinese");
assert(!chartGuideWithThemeStage.includes("题材阶段"), "chart guide should avoid opaque theme-stage wording in customer-facing text");
assert(!/\b(?:stage|low_position_rotation|crowdingScore|rotationScore)\b/i.test(chartGuideWithThemeStage), "chart guide must not leak raw theme-stage fields");

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
assert(serverSource.includes("CJK_CHART_FONT"), "summary chart renderer must carry readable Chinese bitmap glyphs for fixed chart labels");
assert(serverSource.includes("drawChartTextFit"), "summary chart renderer must fit Chinese and numeric metric labels instead of shrinking them into QR-like bitmap text");
assert(serverSource.includes("REPORT_CHART_MIN_TEXT_SCALE = 3"), "summary chart must keep thumbnail-safe minimum text scale");
assert(serverSource.includes("showAxisLabels: false"), "summary chart must hide dense axis tick text in Feishu thumbnails");
assert(serverSource.includes("drawFundReportDecisionReasonPanel"), "summary chart must include in-image buy/watch decision reasons");
assert(serverSource.includes("本次动作") && serverSource.includes("待确认"), "summary chart must show buy/watch reasons and data confirmation needs");
assert(serverSource.includes("越低越接近低位") && serverSource.includes("越高越接近高位"), "summary chart legend must explain 120/250-day position metrics in Chinese");
assert(serverSource.includes('const chartMode = "summary"'), "fund report image generation must force Chinese summary report cards");
assert(!serverSource.includes('chartMode === "trend"'), "fund report image generation must not fall back to sparse trend-only images");
assert(serverSource.includes("板块位置=这条赛道现在处在低位、确认、扩散还是拥挤"), "summary chart guide must explain theme position instead of opaque stage wording");
assert(serverSource.includes("看不懂指标时先看底部决策理由"), "chart guide must reassure users that opaque metrics are explained through decision reasons");
assert(serverSource.includes("经理动作=经理建议"), "summary chart guide must explain manager action states without exposing STAGE");
assert(serverSource.includes("每万成本=每1万元持有估算成本") && serverSource.includes("分批=不一次买完"), "summary chart guide must explain staged buying and per-10k cost");
assert(serverSource.includes("风险边界"), "summary chart must explain risk evidence inside the image");
assert(serverSource.includes('const title = [code || "基金"'), "summary chart title should use a Chinese fallback instead of an English title");
assert(serverSource.includes("120日位置") && serverSource.includes("250日位置"), "summary chart must label low-position evidence with plain Chinese time-window labels");
assert(serverSource.includes("每万成本"), "summary chart must label fee evidence as per-10k cost");
assert(serverSource.includes("回撤风险") && serverSource.includes("阶段收益"), "legacy chart panels must use Chinese labels instead of RISK/RET");
assert(serverSource.includes('staged_buy: "分批买"'), "summary chart must render staged-buy states in Chinese instead of the ambiguous STAGE value");
assert(serverSource.includes('STAGE: "分批买"'), "summary chart must translate legacy STAGE/BATCH values if upstream evidence still uses them");
assert(!serverSource.includes('staged_buy: "STAGE"'), "summary chart must not show STAGE for staged-buy states in new images");
assert(serverSource.includes('extended_uptrend: "高位"') && serverSource.includes('range_or_mixed: "观察"'), "summary chart signal renderer must translate non-buyable trend states into readable Chinese chart values");
assert(serverSource.includes('none: "等待"'), "summary chart must translate no setup signal into a readable Chinese waiting state");
assert(!serverSource.includes('none: "无信号"'), "summary chart must not show no-signal wording to customers");
assert(serverSource.includes('raw === "[object Object]"'), "summary chart must sanitize object-valued metrics instead of drawing [object Object]");
for (const label of ["基金", "净值", "区间涨跌", "净值走势", "买点成本", "买点", "回调启动", "板块位置", "120日位置", "250日位置", "经理动作", "份额", "每万成本", "近20日", "近60日", "回撤", "规模"]) {
  assert(serverSource.includes(label), `summary chart must use readable compact label: ${label}`);
}
for (const glyph of ["板", "块", "置", "轮", "确", "认", "扩", "散", "拥", "挤", "经", "理", "少", "追"]) {
  assert(serverSource.includes(`"${glyph}": [`), `summary chart CJK font must include glyph for ${glyph}`);
}
for (const staleLabel of ["FUND SETUP", "NAV TREND", "DRAWDOWN FROM HIGH", "STAGE RETURN", "SETUP / RISK", "20D", "60D", "120D", "250D"]) {
  assert(!serverSource.includes(staleLabel), `summary chart should not expose stale English label: ${staleLabel}`);
}
for (const staleLabel of ['"RISK"', '"RET"', '"NO DATA"']) {
  assert(!serverSource.includes(staleLabel), `report chart should not expose unexplained English label: ${staleLabel}`);
}
assert(!/drawText\([^)]*[\u4e00-\u9fff]/.test(serverSource), "chart renderer must route Chinese text through the readable CJK glyph renderer");
assert(!/drawText\([^;\n]*,\s*1\)/.test(serverSource), "summary chart must not use scale-1 bitmap text that becomes QR-like in Feishu thumbnails");
const tinyFontSource = serverSource.slice(serverSource.indexOf("const TINY_FONT"), serverSource.indexOf("function encodePngRgba"));
assert(!/[\u4e00-\u9fff]/.test(tinyFontSource), "tiny chart font must not keep Chinese bitmap glyphs that render like QR codes");
assert(!/drawYAxisTickLabels\([^;\n]*["'][\u4e00-\u9fff]/.test(serverSource), "summary chart must not use Chinese axis labels in bitmap text");
const localizedStageTerms = manager.normalizeUserFacingFundAnswer("stage=low_position_rotation，actionBias=early_staged_buy，positionSignal=high_chase_risk。");
assert(localizedStageTerms.includes("板块位置：低位轮动"), "localization must translate raw stage labels into natural Chinese");
assert(localizedStageTerms.includes("操作倾向：早期分批买入"), "localization must translate raw action-bias labels into natural Chinese");
assert(!/\b(?:stage|actionBias|positionSignal|low_position_rotation|early_staged_buy|high_chase_risk)\b/i.test(localizedStageTerms), "localized stage text must not keep raw theme radar fields");
const localizedLegacyChartTerms = manager.normalizeUserFacingFundAnswer("STAGE/BATCH，ENTRY=wait_pullback，score=68，FEEY=80。");
assert(localizedLegacyChartTerms.includes("分批买入/分批买入"), "localization must translate legacy chart STAGE/BATCH labels");
assert(localizedLegacyChartTerms.includes("买点：等待回撤"), "localization must translate legacy chart entry labels");
assert(localizedLegacyChartTerms.includes("评分：68"), "localization must translate raw score fields");
assert(localizedLegacyChartTerms.includes("每万成本：80"), "localization must translate raw fee chart fields");
assert(!/\b(?:STAGE|BATCH|ENTRY|FEEY|score|wait_pullback)\b/i.test(localizedLegacyChartTerms), "localized chart terms must not keep raw legacy metric labels");
const localizedLegacyMetricTerms = manager.normalizeUserFacingFundAnswer("ACT=staged_buy，SIZE=42亿，SHRP=0.8，20D=4%，DROP=-7%。");
assert(localizedLegacyMetricTerms.includes("动作：分批买入"), "localization must translate raw action metric labels");
assert(localizedLegacyMetricTerms.includes("规模：42亿"), "localization must translate raw scale metric labels");
assert(localizedLegacyMetricTerms.includes("夏普比率：0.8"), "localization must translate raw Sharpe metric labels");
assert(localizedLegacyMetricTerms.includes("近20日：4%") && localizedLegacyMetricTerms.includes("回撤：-7%"), "localization must translate raw return and drawdown metric labels");
assert(!/\b(?:ACT|SIZE|SHRP|20D|DROP|staged_buy)\b/i.test(localizedLegacyMetricTerms), "localized chart metrics must not keep raw metric labels");
const localizedInternalRelationText = manager.normalizeUserFacingFundAnswer("actionability 为 tactical only / staged_buy，但 entryBias 是 wait_pullback。");
assert(localizedInternalRelationText.includes("买卖可行性评估：只适合战术小仓位 / 分批买入"), "localization must clean mixed Chinese-English actionability relation text");
assert(localizedInternalRelationText.includes("买点判断：等待回撤"), "localization must clean mixed Chinese-English entry-bias relation text");
assert(!/\b(?:actionability|entryBias|tactical only|staged_buy|wait_pullback)\b/i.test(localizedInternalRelationText), "mixed internal relation text must not keep raw fund fields or enums");
const localizedPortfolioReportText = manager.normalizePortfolioUserFacingText("盘前为 defensive，趋势 extended_uptrend，entryBias=wait_pullback，actionability 为 weak_fit，marketConfirmationScore=0，建议 watch/test only。");
assert(localizedPortfolioReportText.includes("买点判断：等待回撤"), "portfolio report localization must translate raw entry-bias fields");
assert(localizedPortfolioReportText.includes("买卖可行性评估：适配度偏弱"), "portfolio report localization must translate raw actionability fields");
assert(localizedPortfolioReportText.includes("市场确认度：0"), "portfolio report localization must translate market confirmation fields");
assert(localizedPortfolioReportText.includes("观察/小额试探"), "portfolio report localization must translate watch/test shorthand");
assert(!/\b(?:defensive|extended_uptrend|entryBias|actionability|weak_fit|marketConfirmationScore|watch\/test)\b/i.test(localizedPortfolioReportText), "portfolio reports must not keep raw internal fields or English shorthand");
const chartMetricSource = serverSource.slice(serverSource.indexOf("function formatChartMetricValue"), serverSource.indexOf("function getChartShareClass"));
assert(chartMetricSource.includes("formatChartStringValue(value, 8)"), "chart metric formatter must localize string values before rendering");
assert(!chartMetricSource.includes(".toUpperCase()"), "chart metric formatter must not uppercase raw unknown labels into English-looking chart text");
assert(serverSource.includes("function formatChartStringValue"), "chart renderer must carry a string localization fallback");
assert(serverSource.includes("hasInternalFundSignalLeak(raw)") && serverSource.includes("normalizeUserFacingFundAnswer(raw)"), "chart string fallback must translate raw internal fund signals before drawing");
assert(serverSource.includes("题材雷达："), "market evidence summary must present theme radar evidence in Chinese");
assert(!serverSource.includes("theme.stage ? `stage=${theme.stage}`"), "market evidence summary must not feed raw stage enums to the final answer path");
const partialMarketQuality = manager.buildMarketDataQuality([
  { key: "conceptBoards", label: "概念板块", critical: true, result: { ok: true, items: [{ name: "机器人" }] } },
  { key: "industryBoards", label: "行业板块", critical: true, result: { ok: false, error: "timeout", items: [] } },
  { key: "stockFunds", label: "股票型基金排行", critical: true, result: { ok: true, items: [{ code: "000001" }, { code: "000002" }] } },
  { key: "hybridFunds", label: "混合型基金排行", critical: true, result: { ok: true, items: [{ code: "000003" }] } },
  { key: "indexFunds", label: "指数型基金排行", critical: true, result: { ok: true, items: [{ code: "000004" }] } },
  { key: "preciousMetals", label: "贵金属行情", critical: false, result: { ok: true, items: [{ name: "COMEX黄金" }] } },
  { key: "fastNews", label: "实时财经新闻", critical: true, result: { ok: true, items: [{ title: "政策催化" }] } }
], {
  fetchedAt: "2026-05-23T06:20:05.155Z",
  fundCandidates: {
    stockFunds: [{ code: "000001" }, { code: "000002" }],
    hybridFunds: [{ code: "000003" }],
    indexFunds: [{ code: "000004" }],
    qdiiFunds: [],
    preciousMetalFunds: []
  }
});
assert.equal(partialMarketQuality.level, "partial", "market data quality must classify recoverable source failures as partial");
assert(partialMarketQuality.notes.some((item) => item.includes("行业板块") && item.includes("降低把握度")), "partial market data quality must explain missing modules in Chinese");
assert.equal(manager.compactMarketDataQuality(partialMarketQuality).missing[0].label, "行业板块", "summarized market snapshots must preserve data-quality gaps");
const staleRealtimeMarketQuality = manager.buildMarketDataQuality([
  { key: "conceptBoards", label: "概念板块", critical: true, result: { ok: true, items: [{ name: "机器人" }] } },
  { key: "industryBoards", label: "行业板块", critical: true, result: { ok: true, items: [{ name: "医药" }] } },
  { key: "stockFunds", label: "股票型基金排行", critical: true, result: { ok: true, items: [{ code: "000001" }] } },
  { key: "hybridFunds", label: "混合型基金排行", critical: true, result: { ok: true, items: [{ code: "000002" }] } },
  { key: "realtimeFundValuations", label: "实时估算净值", critical: false, result: { ok: true, freshCount: 0, staleCount: 2, sourceKinds: ["tiantian_intraday_estimate"], items: [{ code: "000001" }, { code: "000002" }] } }
], {
  fundCandidates: {
    stockFunds: Array.from({ length: 12 }, (_, index) => ({ code: String(index).padStart(6, "0") }))
  }
});
assert(staleRealtimeMarketQuality.missing.some((item) => item.key === "realtimeFundValuations" && item.status === "stale"), "market data quality must not treat stale realtime valuations as fully available");
assert(staleRealtimeMarketQuality.notes.some((item) => item.includes("实时估算净值全部偏旧")), "market data quality must explain stale realtime valuation coverage in Chinese");
const yangjibaoTokenMissingQuality = manager.buildMarketDataQuality([
  { key: "conceptBoards", label: "概念板块", critical: true, result: { ok: true, items: [{ name: "医药" }] } },
  { key: "industryBoards", label: "行业板块", critical: true, result: { ok: true, items: [{ name: "医疗服务" }] } },
  { key: "stockFunds", label: "股票型基金排行", critical: true, result: { ok: true, items: [{ code: "000001" }] } },
  { key: "realtimeFundValuations", label: "实时估算净值", critical: false, result: { ok: true, freshCount: 1, staleCount: 0, sourceKinds: ["tiantian_intraday_estimate"], items: [{ code: "000001" }] } }
], {
  fundCandidates: { stockFunds: Array.from({ length: 12 }, (_, index) => ({ code: String(index).padStart(6, "0") })) },
  yangjibaoFundRealtimeConfigured: false
});
assert(yangjibaoTokenMissingQuality.notes.some((item) => item.includes("养基宝基金级实时估值未配置授权")), "market data quality must not imply Yangjibao fund realtime coverage when the token is absent");
assert.equal(manager.compactMarketDataQuality(yangjibaoTokenMissingQuality).sourceCapabilities.yangjibaoFundRealtime, "token_required", "compact market snapshots must preserve Yangjibao fund realtime availability");
const poorMarketQuality = manager.buildMarketDataQuality([
  { key: "conceptBoards", label: "概念板块", critical: true, result: { ok: false, error: "blocked", items: [] } },
  { key: "industryBoards", label: "行业板块", critical: true, result: { ok: false, error: "blocked", items: [] } },
  { key: "stockFunds", label: "股票型基金排行", critical: true, result: { ok: true, items: [{ code: "000001" }] } },
  { key: "fastNews", label: "实时财经新闻", critical: true, result: { ok: false, error: "blocked", items: [] } }
], { fundCandidates: { stockFunds: [{ code: "000001" }] } });
assert.equal(poorMarketQuality.level, "poor", "market data quality must mark severe source loss as poor");
assert(serverSource.includes("必须检查 marketSnapshot.dataQuality"), "fund and portfolio prompts must force market data-quality checks");
assert(serverSource.includes("数据缺口") && serverSource.includes("降低把握度"), "prompts must require user-facing disclosure when market data is partial or poor");
assert.equal(manager.inferEastmoneySecidFromHolding({ code: "300502", name: "新易盛" }), "0.300502", "holding realtime mapper must convert SZ/A-share holdings to Eastmoney secids");
assert.equal(manager.inferEastmoneySecidFromHolding({ text: "105.NVDA 英伟达 4.18%" }), "105.NVDA", "holding realtime mapper must preserve Eastmoney overseas stock secids");
const holdingRealtimePulse = manager.buildFundHoldingRealtimePulseFromQuotes([
  { code: "300502", name: "新易盛", netValuePct: 9.3 },
  { code: "300308", name: "中际旭创", netValuePct: 8.63 },
  { code: "00700.HK", name: "腾讯控股", netValuePct: 4.2 }
], [
  { secid: "0.300502", code: "300502", name: "新易盛", latest: 150, changePct: 0.8, quoteTime: "14:30" },
  { secid: "0.300308", code: "300308", name: "中际旭创", latest: 120, changePct: 0.4, quoteTime: "14:30" },
  { secid: "116.00700", code: "00700", name: "腾讯控股", latest: 420, changePct: -0.2, quoteTime: "14:30" }
], { sourceLabel: "测试实时行情", fetchedAt: "2026-05-27T06:30:00.000Z" });
assert.equal(holdingRealtimePulse.ok, true, "holding realtime pulse must build from top-holding quotes");
assert(holdingRealtimePulse.label.includes("偏强"), "holding realtime pulse must classify weighted top-holding strength");
assert.equal(holdingRealtimePulse.quoteCount, 3, "holding realtime pulse must retain covered quote count");
assert(holdingRealtimePulse.coveredHoldingPct > 20, "holding realtime pulse must estimate top-holding coverage");
const holdingPulseOutlook = manager.buildHoldingsOutlookProfile({
  name: "通信低位修复基金C",
  seed: { keywords: ["通信"] },
  holdings: {
    equityTopHoldings: [
      { code: "300502", name: "新易盛", netValuePct: 9.3 },
      { code: "300308", name: "中际旭创", netValuePct: 8.63 },
      { code: "00700.HK", name: "腾讯控股", netValuePct: 4.2 }
    ]
  },
  holdingRealtimePulse
});
assert(holdingPulseOutlook.evidence.includes("实时="), "holdings outlook must include top-holding realtime pulse evidence");
assert(holdingPulseOutlook.positives.some((item) => item.includes("盘中温和转强") || item.includes("底层持仓")), "holdings outlook must turn realtime top-holding strength into a positive or explanatory signal");
const holdingPulseActionability = manager.buildFundActionabilitySignals({
  name: "通信低位修复基金C",
  trendProfile: {
    ok: true,
    trendLabel: "pullback_complete",
    entryBias: "staged_buy",
    pullbackSetup: { signal: "pullback_complete", signalText: "回调完成", score: 72 },
    return20dPct: 4,
    return60dPct: -2
  },
  risk: { oneYear: { ok: true, totalReturnPct: 12, annualizedReturnPct: 12, maxDrawdownPct: -14, sharpe: 1.1 } },
  fees: {
    shareClassFeeModel: { type: "sales_service_fee", label: "C类：按销售服务费计提" },
    feeImpact: { oneYearCostPer10000: 40, missingFeeData: [] },
    missingFeeData: []
  },
  holdings: {
    equityTopHoldings: [
      { code: "300502", name: "新易盛", netValuePct: 9.3 },
      { code: "300308", name: "中际旭创", netValuePct: 8.63 },
      { code: "00700.HK", name: "腾讯控股", netValuePct: 4.2 }
    ]
  },
  holdingRealtimePulse
});
assert(JSON.stringify(holdingPulseActionability).includes("实时="), "actionability evidence must carry realtime top-holding pulse into manager prompts");
const noisyMarketSnapshot = {
  fetchedAt: "2026-05-23T06:20:05.155Z",
  note: "公开数据快照可能延迟。",
  dataQuality: partialMarketQuality,
  marketIndicators: {
    preciousMetals: Array.from({ length: 12 }, (_, index) => ({
      code: `PM${index}`,
      name: `贵金属${index}`,
      latest: 3000 + index,
      changePct: index / 10,
      fiveDayPct: index / 5,
      quoteTime: "10:00",
      noisyRawPayload: "NOISY_MARKET_PAYLOAD".repeat(300)
    })),
    globalMarkets: Array.from({ length: 12 }, (_, index) => ({
      code: index === 0 ? "NDX" : `GM${index}`,
      name: index === 0 ? "纳斯达克" : `海外市场${index}`,
      latest: 20000 + index,
      changePct: index / 5,
      fiveDayPct: index / 3,
      quoteTime: "22:30",
      noisyRawPayload: "NOISY_GLOBAL_PAYLOAD".repeat(300)
    })),
    realtimeFundValuations: Array.from({ length: 18 }, (_, index) => ({
      code: `0001${String(index).padStart(2, "0")}`,
      name: `实时估值基金${index}`,
      estimatedChangePct: index / 10,
      estimateTime: "2026-05-27 14:30",
      freshnessLabel: "半小时内更新",
      isFresh: true,
      intradayTrend: index === 0 ? { label: "盘中回落，冲高回落", changeFromOpenPct: -0.8, recentSlopePct: -0.2 } : null,
      noisyRawPayload: "NOISY_REALTIME_PAYLOAD".repeat(300)
    }))
  },
  themes: {
    conceptBoards: Array.from({ length: 12 }, (_, index) => ({
      boardCode: `BK${index}`,
      name: `概念${index}`,
      changePct: index,
      mainNetInflowPct: index / 2,
      leadStock: `龙头${index}`,
      quoteTime: "10:00",
      constituents: "NOISY_BOARD_PAYLOAD".repeat(300)
    })),
    industryBoards: []
  },
  themeRadar: [{
    id: "gold",
    name: "黄金",
    stage: "crowded",
    forwardScore: 62,
    crowdingScore: 70,
    rotationScore: 35,
    lowPositionScore: 20,
    positionSignal: "high_chase_risk",
    actionBias: "wait_or_small_starter",
    primaryCatalyst: "避险",
    evidence: {
      boards: [{ name: "贵金属", changePct: 1.2 }],
      news: [{ title: "金价波动", body: "NOISY_NEWS_PAYLOAD".repeat(300) }]
    }
  }],
  fastNews: [{ title: "政策催化", body: "NOISY_NEWS_PAYLOAD".repeat(300), time: "10:00" }],
  fundCandidates: {
    stockFunds: Array.from({ length: 18 }, (_, index) => ({
      code: `0000${String(index).padStart(2, "0")}`,
      name: `候选基金${index}`,
      shareClass: index % 2 ? "A" : "C",
      oneMonthPct: index,
      dailyPct: index / 10,
      rawRankingPage: "NOISY_FUND_PAYLOAD".repeat(300)
    })),
    hybridFunds: [],
    indexFunds: [],
    qdiiFunds: [],
    preciousMetalFunds: []
  },
  errors: ["timeout"],
  sources: ["https://example.com/noisy"]
};
const compactMarketSnapshot = manager.compactMarketSnapshotForModel(noisyMarketSnapshot);
const compactMarketSnapshotJson = JSON.stringify(compactMarketSnapshot);
assert(compactMarketSnapshot.dataQuality.level === "partial", "compact market snapshot must preserve data-quality level");
assert.equal(compactMarketSnapshot.fundCandidates.stockFunds.length, 6, "compact market snapshot must cap fund ranking candidates before model prompts");
assert.equal(compactMarketSnapshot.marketIndicators.preciousMetals.length, 6, "compact market snapshot must cap market quote candidates before model prompts");
assert.equal(compactMarketSnapshot.marketIndicators.globalMarkets.length, 8, "compact market snapshot must include capped overseas market and FX quotes");
assert.equal(compactMarketSnapshot.marketIndicators.globalMarkets[0].name, "纳斯达克", "compact market snapshot must preserve overseas market quote names");
assert.equal(compactMarketSnapshot.marketIndicators.realtimeFundValuations.length, 12, "compact market snapshot must include capped real-time valuation candidates");
assert(compactMarketSnapshot.marketIndicators.realtimeFundValuations[0].freshness === "半小时内更新", "compact market snapshot must preserve real-time valuation freshness labels");
assert.equal(compactMarketSnapshot.marketIndicators.realtimeFundValuations[0]["盘中走势"], "盘中回落，冲高回落", "compact market snapshot must preserve intraday valuation direction for timing decisions");
assert(compactMarketSnapshot.themeRadar[0]["板块位置"] === "交易拥挤", "compact market snapshot must carry Chinese theme-stage labels");
assert(compactMarketSnapshot.themeRadar[0]["操作倾向"] === "等待或小额试探", "compact market snapshot must carry Chinese action-bias labels");
assert(!/"(?:stage|positionSignal|actionBias|stageText|positionSignalText|actionBiasText)"\s*:/.test(compactMarketSnapshotJson), "compact market snapshot must not expose raw theme-radar field names to the model");
assert(!compactMarketSnapshotJson.includes("NOISY_"), "compact market snapshot must strip raw payloads that cause context-window failures");
assert(compactMarketSnapshotJson.length < 9000, "compact market snapshot must stay small enough for recommendation and QA prompts");
assert(serverSource.includes("compactMarketSnapshotForModel(marketSnapshot)"), "fund recommendation, QA, and portfolio prompts must use compact market snapshots");
assert(!serverSource.includes("JSON.stringify(marketSnapshot || {}, null, 2)"), "fund recommendation prompt must not send the raw market snapshot");
assert(!serverSource.includes("JSON.stringify(marketSnapshot, null, 2)"), "fund QA prompt must not send the raw market snapshot");

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
assert(guidedChartAnswer.includes("新图只使用中文短标签和决策理由"), "chart reading guide must tell users new images are Chinese-first and decision-first");
assert(guidedChartAnswer.includes("买点=是否到了可买位置"), "chart reading guide must explain the entry label for users");
assert(guidedChartAnswer.includes("120日位置/250日位置=区间相对位置"), "chart reading guide must translate low-position chart labels");
assert(guidedChartAnswer.includes("规模=基金规模"), "chart reading guide must explain fund scale labels");
assert(guidedChartAnswer.includes("分批买=分几次买入"), "chart reading guide must explain staged buying in Chinese");
assert(guidedChartAnswer.includes("看不懂指标时先看底部决策理由"), "chart reading guide must tell users they do not need to understand raw system metrics");
assert(!/\b(?:ENTRY|SIG|LOW\/YLOW|BATCH|STAGE|stage)\b/.test(guidedChartAnswer), "chart reading guide must not reintroduce raw legacy English labels");
assert(guidedChartAnswer.includes("用来确认是否适合分批买入"), "buy-reference chart guide must say how the chart supports a buy decision");
assert(guidedChartAnswer.includes("用来观察是否能从备选转入买点"), "backup chart guide must say how the chart supports a backup decision");
const previousCardImageChunkSize = process.env.FEISHU_CARD_IMAGE_CHUNK_SIZE;
delete process.env.FEISHU_CARD_IMAGE_CHUNK_SIZE;
assert.equal(manager.getFeishuCardImageChunkSize(), 4, "fund report image card chunks should keep each Feishu card readable");
const imageChunks = manager.splitFeishuCardImages(Array.from({ length: 12 }, (_, index) => ({ imageKey: `img_${index}` })));
assert.deepEqual(imageChunks.map((chunk) => chunk.length), [4, 4, 4], "fund report images should be split into supplemental cards instead of crowding one card");
const fundImageCaption = manager.buildFeishuImageCaption({
  imageKey: "img_caption",
  fundReportChart: true,
  role: "买入参考图",
  code: "000001",
  name: "低位修复基金A",
  alt: "买入参考图：000001 低位修复基金A 走势 / 回撤 / 买点 / 成本证据"
});
assert(fundImageCaption.includes("买入参考图：000001 低位修复基金A"), "fund image captions must keep the fund and chart role next to the image");
assert(fundImageCaption.includes("先看底部“为什么买或备选”"), "fund image captions must tell users how to read the chart next to the image");
assert(fundImageCaption.includes("“每万成本/回撤/规模”控制成本和风险"), "fund image captions must explain the right-side risk evidence next to the image");
const fundImageLegend = manager.buildFeishuFundImageLegendNote([{ imageKey: "img_legend", fundReportChart: true }]);
assert(fundImageLegend.includes("图上底部会直接写“为什么买或备选”"), "fund image cards must carry decision reasons next to the images");
assert(fundImageLegend.includes("结论、支持证据、风险边界和下一步"), "fund image card guide must explain the decision panel in Chinese");
assert(!/\b(?:BATCH|STAGE|stage)\b/.test(fundImageLegend), "fund image card legend must not keep raw legacy English labels");
const decisionFeishuCard = manager.buildFeishuCard([
  "直接结论：等待回调，不追涨，暂不买入。",
  "关键证据：近20日+18%，120日位置86%，已经偏热。",
  "风险边界：若没有回撤到低位，不给买入金额。",
  "执行：放入备选观察，等回调完成后复核。"
].join("\n"), "answer");
const decisionCardText = JSON.stringify(decisionFeishuCard);
assert.equal(decisionFeishuCard.header.template, "red", "risk-first Feishu cards must use a warning header color");
assert(decisionFeishuCard.header.title.content.includes("风险优先"), "Feishu card headers must expose the decision tone");
assert(decisionCardText.includes("<font color='red'>"), "Feishu card summaries must color the key conclusion");
assert(decisionCardText.includes("**关键证据**"), "Feishu cards must split key evidence away from the full text body");
assert(decisionCardText.includes("**风险/待确认**"), "Feishu cards must split risk and confirmation needs away from the full text body");
assert(decisionCardText.includes("**详细分析**"), "Feishu cards must keep the original analysis below the highlighted summary");
const portfolioFeishuCard = manager.buildFeishuCard([
  "虚拟基金经理日报 2026-05-25",
  "今日手法：高位科技减仓复核 + 低位医药小额试探，不做重仓追涨。",
  "市场判断：账户回撤正常但缺少完整指数、板块资金和新闻模块，只允许小额试探。",
  "投委会意见：",
  "市场分析师 中：账户回撤正常且现金充足，但缺少完整市场指数和板块资金，不能把当前数据当成完整联网市场证据。",
  "风控经理 负：008327、006265、001986底层持仓重叠较高，不能用加仓摊薄替代止损或止盈。",
  "主席 中：批准执行高位科技减仓复核，低位医药只做小仓试探。",
  "今日操作：",
  "卖出 008327 东财通信C 建议11810.03元：系统组合集中度控制，同题材暴露过度集中，先分批降低同题材暴露。近20日+19.64%、近60日+61.1%，120日和250日位置均为100%，属于高位趋势延伸，不是低位轮动。",
  "观察 012046 大成医药健康股票C：作为低位医药卫星仓小额试探。5日+0.34%、20日-3.41%、60日-7.19%，120日位置25.3、250日位置13.1，但规模0.17亿偏小，只能小仓。",
  "申购/赎回申请：",
  "卖出 008327 东财通信C 8024.95元：已提交，估值日 2026-05-25，确认日 2026-05-26，到账日 2026-05-29。",
  "已确认成交：",
  "无实际账本变动。",
  "自选基金池：",
  "010802 长江量化消费精选股票C（等待回调，优先级3）：净值验证：趋势回调完成，5日+0.47%，10日-0.89%，20日+0.45%，60日-7.74%，120日位置6.1%，距高点-14.21%；观察缺口：规模、费用和集中度风险仍需复核。",
  "风险控制：",
  "科技仓穿透重叠较高，多只处于高位短期涨幅偏热，今日以降风险为先。",
  "回溯学习点：",
  "账户级回撤正常并不代表可以忽略单仓回吐保护；当浮盈回吐和底层重叠同时出现时，先做减仓复核。"
].join("\n"), "portfolio");
const portfolioTextBlocks = portfolioFeishuCard.elements
  .map((element) => element?.text?.content)
  .filter(Boolean);
const portfolioCardText = JSON.stringify(portfolioFeishuCard);
assert(portfolioTextBlocks.length >= 10, "portfolio Feishu reports must split daily reports into multiple readable card blocks");
assert(portfolioCardText.includes("<font color='blue'>**投委会意见**</font>"), "portfolio Feishu reports must color committee sections");
assert(portfolioCardText.includes("<font color='orange'>**今日操作**</font>"), "portfolio Feishu reports must color action sections");
assert(portfolioCardText.includes("<font color='green'>**自选基金池**</font>"), "portfolio Feishu reports must color watchlist sections");
assert(portfolioCardText.includes("<font color='red'>**风险控制**</font>"), "portfolio Feishu reports must color risk sections");
assert(portfolioTextBlocks.some((block) => block.includes("\n\n<font color='red'>**卖出**</font> 008327")), "portfolio Feishu reports must separate sell actions with blank space and colored action words");
assert(portfolioTextBlocks.every((block) => block.length < 1800), "portfolio Feishu detail blocks must stay short enough to scan in Feishu");
const buyFeishuCard = manager.buildFeishuCard("直接结论：可以分批买入，小仓验证。\n买点依据：回调完成，120日位置38%。", "answer");
assert.equal(buyFeishuCard.header.template, "green", "buyable Feishu cards must use a positive header color");
const supplementText = manager.buildFeishuImageSupplementText([
  { imageKey: "img_supp", fundReportChart: true, role: "备选观察图", code: "000004", name: "备选回踩基金C" }
], 1, 3);
assert(supplementText.includes("配图补充（第 2/3 组）"), "supplemental image cards must keep their group index");
assert(supplementText.includes("图上底部会直接写“为什么买或备选”"), "supplemental image cards must include the decision reason guide without relying on the first answer body");
assert(supplementText.includes("备选观察图：000004 备选回踩基金C"), "supplemental image card captions must preserve backup/watch chart context");
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

const noisyTrendProfile = {
  ok: true,
  latestDate: "2026-05-22",
  trendLabel: "pullback_complete",
  entryBias: "buyable_now",
  return5dPct: 1.2,
  return10dPct: 2.4,
  return20dPct: 4.8,
  return60dPct: 7.6,
  lowPositionPct120: 38,
  drawdownFromRecentHighPct: -11.2,
  pullbackSetup: { signal: "pullback_complete", score: 82, reason: "回调完成" },
  series: Array.from({ length: 220 }, (_, index) => ({ date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`, nav: 1 + index / 1000, dailyReturnPct: 0.1 }))
};
const noisyActionability = {
  score: 88,
  action: "staged_buy",
  actionText: "分批",
  fitLabel: "tactical_only",
  confidence: "high",
  allocationBand: "0%-3% watch/test only",
  decisiveEvidence: [
    "trend=extended_uptrend, entryBias=wait_pullback, 20d=31.9%, 60d=56.02%",
    "actionability 为 tactical only / staged_buy",
    ...Array.from({ length: 6 }, (_, index) => `证据${index + 1}`)
  ],
  decisionBlocker: [
    "entryBias 是 wait_pullback，等待20日涨幅降温。",
    ...Array.from({ length: 7 }, (_, index) => `缺口${index + 1}`)
  ],
  holdingsOutlook: {
    label: "支撑买点",
    evidence: "前十大持仓/前景支持低位启动",
    risks: ["集中度待复核"],
    positives: ["行业线索清晰"],
    concentration: { top10Pct: 42.6 },
    disclosureDate: "2026-03-31",
    topHoldings: Array.from({ length: 12 }, (_, index) => `${index + 1}号持仓 ${(index + 1) * 1.1}%`)
  }
};
const compactReviewProfile = manager.compactPortfolioReviewProfile({
  code: "000099",
  name: "周报压缩测试基金C",
  snapshotDate: "2026-05-22",
  unitNav: 1.2345,
  trendProfile: noisyTrendProfile,
  actionability: noisyActionability,
  holdings: {
    equityTopHoldings: Array.from({ length: 12 }, (_, index) => `${index + 1}号持仓 ${(index + 1) * 1.1}%`)
  },
  riskMetrics: { periods: { "1y": { ok: true, totalReturnPct: 12, annualizedReturnPct: 12, annualizedVolatilityPct: 16, maxDrawdownPct: -8, sharpe: 0.7, startDate: "2025-05-22", endDate: "2026-05-22" } } }
});
assert(!Object.hasOwn(compactReviewProfile.trendProfile, "series"), "weekly/profile compact context must strip NAV series from trendProfile");
assert.equal(compactReviewProfile.topHoldings.length, 10, "compact review profiles must still preserve top-ten holdings");
assert.equal(compactReviewProfile.actionability.decisiveEvidence.length, 5, "compact actionability must cap evidence lists for context safety");
assert.equal(compactReviewProfile.actionability.holdingsOutlook.topHoldings.length, 10, "compact actionability must preserve the full top-ten holdings view without extra overflow");
assert(compactReviewProfile.actionability.fitLabel.includes("只适合战术小仓位"), "compact actionability must localize raw fit labels");
assert(compactReviewProfile.actionability.allocationBand.includes("观察/小额试探"), "compact actionability must localize watch/test allocation bands");
assert.equal(compactReviewProfile.actionability.confidence, "较高", "compact actionability must localize confidence labels");
assert(!/\b(?:extended_uptrend|entryBias|actionability|tactical_only|staged_buy|wait_pullback|watch\/test)\b/i.test(compactReviewProfile.actionability.decisiveEvidence.join("\n")), "compact actionability evidence must not leak raw internal labels to prompts");
const compactPublicSnapshot = manager.compactPublicFundSnapshot({
  code: "000098",
  name: "后台轻量接口测试基金C",
  nav: 1.2345,
  navDate: "2026-05-22",
  trendProfile: noisyTrendProfile,
  actionability: noisyActionability,
  fees: {
    shareClass: "C",
    feeImpact: {
      oneYearCostPer10000: 42,
      twoYearCostPer10000: 84
    }
  },
  holdings: {
    equityTopHoldings: Array.from({ length: 12 }, (_, index) => `${index + 1}号持仓 ${(index + 1) * 1.1}%`)
  }
});
assert(compactPublicSnapshot.trendProfile.series.length <= 32, "portfolio summary API snapshots must thin NAV series for fast admin rendering");
assert(!JSON.stringify(compactPublicSnapshot).includes("dailyReturnPct"), "portfolio summary API snapshots must strip per-day chart fields");
assert.equal(compactPublicSnapshot.topHoldings.length, 10, "portfolio summary API snapshots must preserve top-ten holdings");
assert.equal(compactPublicSnapshot.actionability.holdingsOutlook.topHoldings.length, 10, "portfolio summary API snapshots must preserve actionability holding outlook");
assert.equal(compactPublicSnapshot.fees.feeImpact.oneYearCostPer10000, 42, "portfolio summary API snapshots must preserve share-class fee impact");
assert(!/\b(?:extended_uptrend|entryBias|actionability|tactical_only|wait_pullback|watch\/test)\b/i.test([
  compactPublicSnapshot.actionability.fitLabel,
  compactPublicSnapshot.actionability.allocationBand,
  compactPublicSnapshot.actionability.confidence,
  ...compactPublicSnapshot.actionability.decisiveEvidence,
  ...compactPublicSnapshot.actionability.decisionBlocker
].join("\n")), "portfolio summary API actionability text must be localized for admin/customer-facing views");
const storedDb = manager.compactPortfolioDbForStorage({
  account: {
    positions: [{
      code: "000098",
      name: "后台轻量接口测试基金C",
      fundSnapshot: {
        code: "000098",
        name: "后台轻量接口测试基金C",
        trendProfile: noisyTrendProfile,
        actionability: noisyActionability,
        holdings: { equityTopHoldings: Array.from({ length: 12 }, (_, index) => `${index + 1}号持仓`) },
        rawPayload: "RAW_POSITION_SNAPSHOT".repeat(2000)
      }
    }]
  },
  watchlist: [{
    code: "000099",
    name: "自选轻量接口测试基金C",
    lastSnapshot: {
      code: "000099",
      name: "自选轻量接口测试基金C",
      trendProfile: noisyTrendProfile,
      actionability: noisyActionability,
      rawPayload: "RAW_WATCH_SNAPSHOT".repeat(2000)
    }
  }],
  orders: [{
    code: "000100",
    name: "订单轻量接口测试基金C",
    fundSnapshot: {
      code: "000100",
      name: "订单轻量接口测试基金C",
      trendProfile: noisyTrendProfile,
      rawPayload: "RAW_ORDER_SNAPSHOT".repeat(2000)
    }
  }],
  transactions: [],
  settlements: [],
  dailyEquity: [],
  runs: [{
    accountAfter: {
      positions: [{
        code: "000101",
        name: "运行轻量接口测试基金C",
        fundSnapshot: {
          code: "000101",
          name: "运行轻量接口测试基金C",
          trendProfile: noisyTrendProfile,
          rawPayload: "RAW_RUN_SNAPSHOT".repeat(2000)
        }
      }]
    },
    orders: [],
    transactions: [],
    watchlistUpdates: [],
    positionUpdates: [],
    rawModelOutput: "R".repeat(5000),
    card: "C".repeat(13000)
  }]
});
const storedDbJson = JSON.stringify(storedDb);
assert(!storedDbJson.includes("dailyReturnPct"), "portfolio storage compaction must strip per-day chart fields before writing DB");
assert(!storedDbJson.includes("RAW_POSITION_SNAPSHOT") && !storedDbJson.includes("RAW_ORDER_SNAPSHOT") && !storedDbJson.includes("RAW_RUN_SNAPSHOT"), "portfolio storage compaction must remove raw oversized snapshots");
assert(storedDb.account.positions[0].fundSnapshot.trendProfile.series.length <= 32, "stored position snapshots must keep only thinned NAV series");
assert(storedDb.watchlist[0].lastSnapshot.actionability.holdingsOutlook.topHoldings.length === 10, "stored watchlist snapshots must preserve top-ten holding outlook");
assert(storedDb.runs[0].rawModelOutput.length < 4100 && storedDb.runs[0].card.length < 12150, "portfolio storage compaction must truncate long run text fields");
const compactWeeklyContext = manager.compactPortfolioWeeklyContext({
  startDate: "2026-05-16",
  endDate: "2026-05-22",
  runs: [
    { type: "decision", status: "failed", date: "2026-05-22", summary: "资料已准备", error: "stream error: stream ID 1; INTERNAL_ERROR" }
  ],
  orders: [{ side: "BUY", status: "pending", code: "000099", name: "周报压缩测试基金C", amount: 1000, submitDate: "2026-05-22" }],
  transactions: [{ date: "2026-05-22", side: "BUY", code: "000099", name: "周报压缩测试基金C", amount: 1000, nav: 1.23, units: 812.34 }],
  settlements: [{ date: "2026-05-22", status: "pending", side: "BUY", code: "000099", amount: 1000 }],
  equity: [{ date: "2026-05-22", totalAsset: 100100, cash: 90000, investedValue: 10100, investedCost: 10000, cumulativePnlPct: 1 }],
  account: {
    totalAsset: 100100,
    cash: 90000,
    investedValue: 10100,
    investedCost: 10000,
    positionWeightPct: 10.1,
    cumulativePnlPct: 1,
    positions: [{
      code: "000099",
      name: "周报压缩测试基金C",
      currentValue: 10100,
      costAmount: 10000,
      weightPct: 10.1,
      unrealizedPnlPct: 1,
      fundSnapshot: {
        trendSummary: "20日+4.8%，趋势回调完成",
        trendProfile: noisyTrendProfile,
        actionability: noisyActionability,
        topHoldings: Array.from({ length: 10 }, (_, index) => `${index + 1}号持仓`)
      }
    }]
  }
});
const compactWeeklyJson = JSON.stringify(compactWeeklyContext);
assert(!compactWeeklyJson.includes("\"series\""), "weekly model context must not carry raw chart series");
assert(!compactWeeklyJson.includes("dailyReturnPct"), "weekly model context must not carry per-day chart details");
assert.equal(compactWeeklyContext.failedRuns.length, 1, "weekly compact context must preserve failed task evidence for reliability review");
assert.equal(compactWeeklyContext.account.positions[0].topHoldings.length, 10, "weekly compact context must preserve top-ten holdings for position review");
const portfolioDecisionSource = serverSource.slice(
  serverSource.indexOf("async function buildPortfolioDecisionWithModel"),
  serverSource.indexOf("async function buildPortfolioValuationWithModel")
);
assert(portfolioDecisionSource.includes("const compactHeldProfiles = (heldProfiles || []).map(compactPortfolioReviewProfile);"), "portfolio decision prompts must compact held profiles before model calls");
assert(portfolioDecisionSource.includes("JSON.stringify(compactHeldProfiles, null, 2)"), "portfolio decision prompts must stringify compact held profiles");
assert(!portfolioDecisionSource.includes("JSON.stringify(heldProfiles || [], null, 2)"), "portfolio decision prompts must not send raw held profiles");
const portfolioPremarketSource = serverSource.slice(
  serverSource.indexOf("async function buildPortfolioPremarketWithModel"),
  serverSource.indexOf("async function buildPortfolioWeeklyWithModel")
);
assert(portfolioPremarketSource.includes("const compactProfiles = (profiles || []).map(compactPortfolioReviewProfile);"), "portfolio premarket prompts must compact holding profiles before model calls");
assert(portfolioPremarketSource.includes("JSON.stringify(compactProfiles, null, 2)"), "portfolio premarket prompts must stringify compact holding profiles");
assert(!portfolioPremarketSource.includes("JSON.stringify(profiles || [], null, 2)"), "portfolio premarket prompts must not send raw holding profiles");
assert.equal(manager.parseDotEnvValue("gpt-5.5 # 改成你的服务商支持的模型"), "gpt-5.5", "dotenv parser must strip unquoted inline comments from model names");
assert.equal(manager.parseDotEnvValue('"gpt-5.5 # quoted model" # comment'), "gpt-5.5 # quoted model", "dotenv parser must preserve quoted hash characters while ignoring trailing comments");
assert.equal(manager.normalizeModelName("gpt-5.5 # 改成你的服务商支持的模型"), "gpt-5.5", "effective config must sanitize model names polluted by inline comments");
const dirtyModelNameDiagnostics = manager.buildRuntimeDiagnostics({
  counters: { modelCalls: 7, modelFailures: 7 },
  last: { lastError: 'HTTP 502: {"error":{"message":"unknown provider for model \\"gpt-5.5 # 改成你的服务商支持的模型\\""}}' }
});
assert(dirtyModelNameDiagnostics.items.some((item) => item.label === "模型名称疑似带注释"), "runtime diagnostics must explicitly flag model names polluted by inline comments");
const answerQualityIssueDiagnostics = manager.buildRuntimeDiagnostics({
  counters: { fundAnswerQualityFailures: 9, fundAnswerQualityPasses: 1 },
  last: {
    lastFundAnswerQualityIssues: "missing_no_qualified_pullback_message,recommends_without_qualified_pullback_candidate,missing_pullback_share_class_fee"
  }
});
const answerIssueDiagnostic = answerQualityIssueDiagnostics.items.find((item) => item.label === "最近质检问题");
assert(answerIssueDiagnostic, "runtime diagnostics must translate recent answer-quality issue codes into a visible diagnostic");
assert(answerIssueDiagnostic.note.includes("回调/低位启动请求存在硬凑或错推风险"), "answer-quality diagnostic must explain pullback/setup hard-pick failures in Chinese");
assert(answerIssueDiagnostic.note.includes("主推荐缺少A/C份额和费用依据"), "answer-quality diagnostic must explain missing share-class fee evidence");
const previousModelMaxInputChars = process.env.MODEL_MAX_INPUT_CHARS;
process.env.MODEL_MAX_INPUT_CHARS = "24000";
const compactedModelInput = manager.compactModelInputForContext({
  systemText: `系统头${"指令".repeat(4000)}系统尾`,
  userPrompt: [
    "用户任务开头：必须总结真实账本。",
    "A".repeat(90000),
    "用户任务末尾：最新失败原因 input exceeds the context window，必须保留。"
  ].join("\n"),
  maxTokens: 9600
});
assert(compactedModelInput.compacted, "model input guard must compact oversized prompts before sending them to the API");
assert(compactedModelInput.finalChars <= compactedModelInput.maxInputChars, "model input guard must enforce the configured input character ceiling");
assert(compactedModelInput.userPrompt.includes("用户任务开头：必须总结真实账本"), "model input guard must preserve the task opening");
assert(compactedModelInput.userPrompt.includes("用户任务末尾：最新失败原因 input exceeds the context window，必须保留"), "model input guard must preserve the newest evidence at the prompt tail");
assert(compactedModelInput.userPrompt.includes("用户上下文已压缩"), "model input guard must visibly mark automatic compaction for debugging");
const retryCompactedModelInput = manager.compactModelInputForContext({
  systemText: `系统头${"指令".repeat(3000)}系统尾`,
  userPrompt: [
    "用户任务开头：周报必须总结真实账本。",
    "B".repeat(70000),
    "用户任务末尾：第一次模型报错 Your input exceeds the context window，二次压缩仍要保留。"
  ].join("\n"),
  maxTokens: 9600,
  maxInputCharsOverride: 14000,
  compressionMarker: "模型上下文超限后已二次压缩"
});
assert(retryCompactedModelInput.compacted, "model context retry must force a smaller second-pass compaction");
assert(retryCompactedModelInput.finalChars <= 14000, "model context retry must honor the lower retry input budget");
assert(retryCompactedModelInput.userPrompt.includes("模型上下文超限后已二次压缩"), "model context retry must mark second-pass compression for diagnostics");
assert(retryCompactedModelInput.userPrompt.includes("用户任务末尾：第一次模型报错 Your input exceeds the context window，二次压缩仍要保留。"), "model context retry must preserve the newest failure evidence");
assert(serverSource.includes("modelContextWindowRetries"), "model call layer must record context-window retry attempts");
assert(serverSource.includes("getModelContextRetryInputChars"), "model call layer must compute a lower retry input budget after context-window errors");
if (previousModelMaxInputChars === undefined) {
  delete process.env.MODEL_MAX_INPUT_CHARS;
} else {
  process.env.MODEL_MAX_INPUT_CHARS = previousModelMaxInputChars;
}

async function assertIntent({ userText, imageKeys = [], messageType = "text", expectedWorkflow, expectedReason, expectedMode = null, requiredSkills = [] }) {
  const routed = await manager.classifyMessageIntent({
    userText,
    messageType,
    imageKeys
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
      lowPositionPct250: 44.2,
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
    matchedThemes: [{
      name: "医药",
      stage: "low_position_rotation",
      positionSignal: "low_position_rotation",
      rotationScore: 62,
      lowPositionScore: 58,
      crowdingScore: 22
    }],
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
