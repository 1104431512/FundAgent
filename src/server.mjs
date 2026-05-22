import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

const ROOT = process.cwd();
loadDotEnv(path.join(ROOT, ".env"));
loadDotEnv(path.join(ROOT, ".env.local"));

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3001);
const CONFIG_PATH = path.resolve(process.env.CONFIG_PATH || path.join(ROOT, "data", "config.json"));
const STATS_PATH = path.resolve(process.env.STATS_PATH || path.join(ROOT, "data", "stats.json"));
const PORTFOLIO_DB_PATH = path.resolve(process.env.PORTFOLIO_DB_PATH || path.join(ROOT, "data", "portfolio-db.json"));
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const PUBLIC_DIR = path.join(ROOT, "public");
const SKILLS_DIR = path.join(ROOT, "skills");
const STARTED_AT = new Date();
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 120000);
const DEFAULT_MODEL_HTTP_TIMEOUT_MS = Number(process.env.MODEL_HTTP_TIMEOUT_MS ?? 0);
const DEFAULT_MODEL_MAX_OUTPUT_TOKENS = 9600;
const DEFAULT_REPLY_MAX_CHARS = 18000;
const MIN_FUND_EXTRACTION_OUTPUT_TOKENS = 1800;
const MIN_FUND_ANALYST_OUTPUT_TOKENS = 7200;
const MIN_FUND_COMMITTEE_OUTPUT_TOKENS = 6400;
const MIN_FUND_QA_OUTPUT_TOKENS = 8000;
const MIN_FUND_RECOMMENDATION_OUTPUT_TOKENS = 9600;
const MIN_FUND_REWRITE_OUTPUT_TOKENS = 6400;
const DEFAULT_FUND_REPORT_IMAGE_MIN = 12;
const DEFAULT_FUND_REPORT_BUY_IMAGE_MIN = 6;
const DEFAULT_FUND_REPORT_BACKUP_IMAGE_MIN = 6;
const DEFAULT_FUND_REPORT_CHART_BACKFILL_DIVE_LIMIT = 12;
const DEFAULT_FUND_REPORT_CHART_BACKFILL_ROUNDS = 2;
const DEFAULT_FEISHU_CARD_IMAGE_CHUNK_SIZE = 4;
const DEFAULT_PORTFOLIO_REPORT_IMAGE_MIN = 8;
const DEFAULT_PORTFOLIO_REPORT_IMAGE_LIMIT = 8;
const PUBLIC_DATA_TIMEOUT_MS = Number(process.env.PUBLIC_DATA_TIMEOUT_MS || 20000);
const DEFAULT_PULLBACK_SETUP_FUND_KEYWORDS = [
  "沪深300",
  "中证500",
  "中证1000",
  "创业板",
  "科创50",
  "红利",
  "中证A500",
  "银行",
  "证券",
  "医药",
  "消费",
  "新能源",
  "军工",
  "港股",
  "半导体",
  "传媒",
  "机器人",
  "人工智能",
  "中证2000",
  "科创100",
  "上证50",
  "央企",
  "国企",
  "基建",
  "房地产",
  "家电",
  "农业",
  "畜牧",
  "有色金属",
  "电力",
  "公用事业"
];
const DEFAULT_PORTFOLIO_MANAGER_PROFILE = [
  "定位：教育性虚拟基金经理，不进行真实交易；先保护本金，再在证据明确时参与基金主题轮动。",
  "买入纪律：优先选择净值、持仓、风险指标和数据来源可验证的基金；避免仅凭热点重仓追涨。",
  "轮动纪律：新闻只作为催化，买入前必须同时检查板块轮动、低位修复、拥挤度和回撤空间；高位热门主题优先等待回撤或小额试探。",
  "卖出纪律：当主题证据减弱、目标仓位下降、回撤超出风格承受范围，或复盘发现原假设失效时减仓。",
  "沟通纪律：只展示专业阶段、结论、证据和约束，不展示模型隐藏思考链。"
].join("\n");
const USER_FACING_FUND_LABELS = [
  ["extended_uptrend", "短期涨幅偏热"],
  ["pullback_complete", "回调完成待启动"],
  ["launch_setup", "启动前夜"],
  ["rebound_repair", "回撤后修复"],
  ["range_or_mixed", "震荡或信号混杂"],
  ["breakdown", "趋势破位"],
  ["weakening", "趋势转弱"],
  ["uptrend", "趋势上行"],
  ["germination", "题材萌芽"],
  ["confirmation", "题材确认"],
  ["diffusion", "题材扩散"],
  ["crowded", "交易拥挤"],
  ["buyable_now", "当前可考虑买入"],
  ["staged_buy", "分批买入"],
  ["wait_pullback", "等待回撤"],
  ["hold_observe", "持有观察"],
  ["avoid_now", "暂时回避"],
  ["buy", "买入"],
  ["sell", "卖出"],
  ["hold", "持有"],
  ["wait", "等待"],
  ["avoid", "回避"],
  ["watch", "观察"],
  ["tactical_only", "只适合战术小仓位"],
  ["tactical only", "只适合战术小仓位"],
  ["weak_fit", "适配度偏弱"],
  ["not_suitable", "不适合当前买入"],
  ["need_specific_fund", "需要具体基金代码"],
  ["high_chase_risk", "追高风险偏高"],
  ["low_position_rotation", "低位轮动"],
  ["acceptable_position", "位置尚可"],
  ["neutral_or_wait", "中性偏等待"],
  ["early_staged_buy", "早期分批买入"],
  ["watch_confirm", "观察确认"],
  ["avoid_chasing", "避免追涨"],
  ["wait_or_small_starter", "等待或小额试探"],
  ["rotation_starter", "低位轮动试探"]
];
const USER_FACING_FUND_FIELD_LABELS = [
  ["trendProfile", "走势画像"],
  ["actionability", "可操作性评估"],
  ["action", "动作"],
  ["stage", "阶段"],
  ["entryBias", "入场判断"],
  ["fitLabel", "适配度"],
  ["trendLabel", "趋势状态"],
  ["forwardScore", "前瞻评分"],
  ["crowdingScore", "拥挤度"],
  ["rotationScore", "轮动评分"],
  ["lowPositionScore", "低位评分"],
  ["positionSignal", "位置判断"],
  ["actionBias", "操作倾向"],
  ["pullbackSetup", "回调启动信号"],
  ["lowPositionPct120", "120日区间位置"],
  ["lowPositionPct250", "250日区间位置"],
  ["return5dPct", "近5日收益"],
  ["return10dPct", "近10日收益"],
  ["drawdownFromRecentHighPct", "距近期高点回撤"],
  ["return20dPct", "近20日收益"],
  ["return60dPct", "近60日收益"],
  ["return120dPct", "近120日收益"]
];
const PORTFOLIO_DB_REPAIRED = Symbol("portfolioDbRepaired");

let tenantAccessTokenCache = null;
const seenEventIds = new Map();
let portfolioSchedulerTimer = null;
let portfolioRunInFlight = false;
let activePortfolioRunId = "";
const cancelledPortfolioRunIds = new Set();
let portfolioDbCache = null;
let portfolioDbFlushTimer = null;
let portfolioDbFlushInFlight = false;
let portfolioDbFlushPending = false;
let portfolioDbLastFlushError = "";
const portfolioProgressFlushTimes = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "OPTIONS") {
      sendText(res, 204, "");
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      redirect(res, "/admin");
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const config = getEffectiveConfig();
      const stats = getRuntimeStats();
      sendJson(res, 200, {
        ok: true,
        service: "feishu-fund-assistant",
        configured: getConfigStatus(config),
        skills: listSkills(false).length,
        counters: {
          conversations: stats.counters.conversations,
          imagesReceived: stats.counters.imagesReceived,
          answersSent: stats.counters.answersSent,
          errors: stats.counters.errors
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/admin") {
      await serveStaticFile(res, path.join(PUBLIC_DIR, "admin.html"));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/public/")) {
      const relativePath = decodeURIComponent(url.pathname.replace(/^\/public\//, ""));
      await serveStaticFile(res, path.join(PUBLIC_DIR, relativePath));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (!isAdminAuthorized(req, url)) {
        sendJson(res, 401, { ok: false, error: "需要管理令牌" });
        return;
      }
      await handleApiRequest(req, res, url);
      return;
    }

    if (req.method === "POST" && url.pathname === "/feishu/events") {
      await handleFeishuEventRequest(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    console.error("[request-error]", error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

if (process.env.FUNDAGENT_SKIP_SERVER_START !== "1") {
  server.listen(PORT, HOST, () => {
    console.log(`Feishu Fund Manager listening on http://${HOST}:${PORT}`);
    console.log(`Admin UI: http://127.0.0.1:${PORT}/admin`);
    startPortfolioScheduler();
  });
}

let eventLoopLagExpectedAt = Date.now() + 5000;
if (process.env.FUNDAGENT_SKIP_SERVER_START !== "1") {
  setInterval(() => {
    const now = Date.now();
    const lagMs = now - eventLoopLagExpectedAt;
    if (lagMs > Number(process.env.EVENT_LOOP_LAG_WARN_MS || 3000)) {
      console.warn(`[event-loop-lag] ${lagMs}ms`);
    }
    eventLoopLagExpectedAt = now + 5000;
  }, 5000).unref?.();

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      try {
        flushPortfolioDbSync();
      } finally {
        process.exit(0);
      }
    });
  }
}

async function handleApiRequest(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/config") {
    sendJson(res, 200, getPublicConfig());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/config") {
    const patch = await readJsonBody(req);
    const saved = saveConfigPatch(patch);
    tenantAccessTokenCache = null;
    sendJson(res, 200, { ok: true, config: getPublicConfig(saved) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/test/model") {
    const result = await testModelConnection();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/test/feishu") {
    const result = await testFeishuConnection();
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/skills") {
    sendJson(res, 200, { ok: true, count: listSkills(true).length, skills: listSkills(true) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    sendJson(res, 200, { ok: true, stats: getRuntimeStats() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/portfolio") {
    const startedAt = Date.now();
    const forceFull = url.searchParams.get("full") === "1";
    const lightweight = !forceFull && (portfolioRunInFlight || url.searchParams.get("light") === "1" || url.searchParams.get("summary") === "1");
    const portfolio = getPortfolioPublicState(undefined, { lightweight });
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > 1000) {
      console.warn(`[portfolio-api-slow] /api/portfolio${lightweight ? "?light=1" : ""} ${elapsedMs}ms`);
    }
    sendJson(res, 200, { ok: true, portfolio });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/portfolio/run") {
    const body = await readJsonBody(req);
    const portfolioState = getPortfolioPublicState();
    if (portfolioState.scheduler?.inFlight) {
      sendJson(res, 409, { ok: false, error: "虚拟组合任务正在运行，请先等待完成或手动结束。", portfolio: portfolioState });
      return;
    }
    runPortfolioTask(body.type || "decision", { manual: true }).catch((error) => {
      console.error("[portfolio-run-error]", error);
    });
    sendJson(res, 202, { ok: true, accepted: true, portfolio: getPortfolioPublicState() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/portfolio/cancel") {
    const result = cancelPortfolioTask();
    sendJson(res, 200, { ok: true, portfolio: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/portfolio/reset") {
    const body = await readJsonBody(req);
    const result = resetPortfolioAccount(body.initialCapital, { clearHistory: body.clearHistory !== false });
    sendJson(res, 200, { ok: true, portfolio: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/portfolio/prune") {
    const result = prunePortfolioDatabase();
    sendJson(res, 200, { ok: true, portfolio: result });
    return;
  }

  sendJson(res, 404, { ok: false, error: "api_not_found" });
}

async function handleFeishuEventRequest(req, res) {
  const config = getEffectiveConfig();
  const rawBody = await readRequestBody(req);

  if (config.feishuEncryptKey) {
    maybeVerifyFeishuSignature(req.headers, rawBody, config.feishuEncryptKey);
  }

  const payload = decodeFeishuPayload(rawBody, config);
  verifyFeishuToken(payload, config);

  const challenge = getChallenge(payload);
  if (challenge) {
    sendJson(res, 200, { challenge });
    return;
  }

  const eventId = payload?.header?.event_id || payload?.uuid || "";
  if (eventId && wasSeenRecently(eventId)) {
    updateStats({ counters: { duplicateEvents: 1 } });
    sendJson(res, 200, { code: 0, msg: "duplicate ignored" });
    return;
  }

  sendJson(res, 200, { code: 0, msg: "ok" });

  if (isMessageReceiveEvent(payload)) {
    updateStats({
      counters: { messageEvents: 1 },
      last: { lastMessageEventAt: new Date().toISOString() }
    });
    setImmediate(() => {
      handleMessageEvent(payload).catch((error) => {
        console.error("[message-event-error]", error);
        recordError(error);
      });
    });
  }
}

async function handleMessageEvent(payload) {
  const message = payload?.event?.message;
  if (!message?.message_id) {
    return;
  }

  capturePortfolioPushTarget(payload);

  let parsedContent = {};
  try {
    parsedContent = message.content ? JSON.parse(message.content) : {};
  } catch {
    parsedContent = {};
  }

  const imageKeys = extractImageKeys(parsedContent);
  const userText = extractUserText(message.message_type, parsedContent);

  if (!imageKeys.length && !userText) {
    await replyToMessage(
      message.message_id,
      "请发送基金截图、基金代码/名称，或直接问“按最近题材推荐几个基金”。我会先判断工作流，再选择单基分析、基金推荐或基金问答。",
      { kind: "noContent" }
    );
    updateStats({ counters: { noContentMessages: 1 } });
    return;
  }

  updateStats({
    counters: {
      conversations: 1,
      imagesReceived: imageKeys.length,
      textMessages: userText ? 1 : 0
    },
    last: {
      lastConversationAt: new Date().toISOString(),
      lastMessageType: message.message_type || "unknown"
    }
  });

  try {
    const intent = await classifyMessageIntent({ imageKeys, userText, messageType: message.message_type });
    recordWorkflowIntent(intent);

    if (intent.workflow === "conversation") {
      await handleConversationWorkflow({ message, userText, intent });
      return;
    }

    if (intent.workflow === "portfolio_status") {
      await handlePortfolioStatusWorkflow({ message, userText, intent });
      return;
    }

    if (intent.workflow === "fund_recommendation") {
      await handleFundRecommendationWorkflow({ message, userText, intent });
      return;
    }

    if (intent.workflow === "fund_qa") {
      await handleFundQaWorkflow({ message, userText, intent });
      return;
    }

    await replyToMessage(message.message_id, buildProgressMessage(imageKeys.length, userText), {
      kind: "progress"
    }).catch((error) => {
      console.error("[progress-reply-error]", error);
      recordError(error, { replyFailures: 1 });
    });

    await replyToMessage(
      message.message_id,
      imageKeys.length
        ? "进度：正在识别截图中的基金代码和关键字段。"
        : "进度：正在识别文字中的基金名称、代码和关键字段。",
      {
        kind: "progress"
      }
    ).catch((error) => {
      console.error("[progress-reply-error]", error);
      recordError(error, { replyFailures: 1 });
    });

    const images = [];
    for (const imageKey of imageKeys) {
      images.push(await downloadMessageImage(message.message_id, imageKey));
    }

    const extracted = await extractFundFactsWithModel({ images, userText, messageType: message.message_type });
    const fundCodes = mergeFundCodes(extractFundCodes(userText), extracted.fundCodes);

    await replyToMessage(
      message.message_id,
      fundCodes.length
        ? `进度：已识别到基金代码 ${fundCodes.join("、")}，正在联网补全基金资料。`
        : "进度：截图中未稳定识别到基金代码，将先按可见信息分析。",
      { kind: "progress" }
    ).catch((error) => {
      console.error("[progress-reply-error]", error);
      recordError(error, { replyFailures: 1 });
    });

    const enrichments = await enrichFunds(fundCodes);

    await replyToMessage(
      message.message_id,
      "进度：分析师分析中。产品、业绩指标、持仓风格、市场主题、情绪新闻 5 个角度正在整理证据。",
      { kind: "progress" }
    ).catch((error) => {
      console.error("[progress-reply-error]", error);
      recordError(error, { replyFailures: 1 });
    });

    const analystReview = await buildAnalystReviewWithModel({
      images,
      userText,
      messageType: message.message_type,
      extracted,
      enrichments
    });

    await replyToMessage(
      message.message_id,
      "进度：委员会投票中。正在汇总牛方、熊方、风险经理的倾向，并判断是买入、分批买入、观察还是回避。",
      { kind: "progress" }
    ).catch((error) => {
      console.error("[progress-reply-error]", error);
      recordError(error, { replyFailures: 1 });
    });

    const committeeVote = await buildCommitteeVoteWithModel({
      userText,
      messageType: message.message_type,
      extracted,
      enrichments,
      analystReview
    });

    await replyToMessage(
      message.message_id,
      "进度：主席验收中。正在把投票结果压缩成飞书卡片，并生成 1 万元执行方案。",
      { kind: "progress" }
    ).catch((error) => {
      console.error("[progress-reply-error]", error);
      recordError(error, { replyFailures: 1 });
    });

    const analysis = await analyzeFundWithModel({
      userText,
      messageType: message.message_type,
      extracted,
      enrichments,
      analystReview,
      committeeVote
    });
    const screeningChartProfiles = selectFundReportProfilesForAnswer(
      selectFundScreeningWatchlistProfiles(enrichments, analysis, userText),
      analysis,
      {
        minCount: Math.min(getFundReportChartMinCount(), countEligibleFundReportProfiles(enrichments)),
        limit: getFundReportChartLimit()
      }
    );
    persistAnswerWatchlistCandidates({
      userText,
      answerText: analysis,
      chartProfiles: screeningChartProfiles,
      source: "fund_screening_answer"
    });
    const reportImages = await buildFundReportCardImages(screeningChartProfiles, getEffectiveConfig()).catch((error) => {
      console.error("[fund-report-trend-image-error]", error);
      recordError(error, { fundReportTrendImageFailures: 1 });
      return [];
    });
    await replyToMessage(
      message.message_id,
      [buildCompletionPrefix(images.length, userText), appendFundReportChartReadingGuide(analysis, screeningChartProfiles)].filter(Boolean).join("\n\n"),
      { kind: "answer", images: reportImages }
    );
  } catch (error) {
    console.error("[analysis-error]", error);
    recordError(error);
    await replyToMessage(
      message.message_id,
      [
        "这次没有完成基金分析。",
        `原因：${error.message}`,
        "可以稍后重试，或直接发送基金名称/代码、近 1/3/5 年收益、最大回撤、费率、基金经理任期等关键数据。"
      ].join("\n"),
      { kind: "error" }
    );
  }
}

async function handleConversationWorkflow({ message, userText, intent }) {
  const answer = await answerConversationWithModel({ userText, intent });
  await replyToMessage(message.message_id, answer, { kind: "answer" });
}

async function handlePortfolioStatusWorkflow({ message, userText, intent }) {
  await replyToMessage(
    message.message_id,
    "进度：已识别为虚拟基金经理账本查询，正在读取当前仓位、持仓和最近操作记录。",
    { kind: "progress" }
  ).catch((error) => {
    console.error("[progress-reply-error]", error);
    recordError(error, { replyFailures: 1 });
  });

  const answer = buildPortfolioStatusAnswer(userText, intent);
  const reportImages = await buildPortfolioStatusCardImages(getEffectiveConfig()).catch((error) => {
    console.error("[portfolio-status-image-error]", error);
    recordError(error, { portfolioTrendImageFailures: 1 });
    return [];
  });
  await replyToMessage(message.message_id, answer, { kind: "portfolio", images: reportImages });
}

async function handleFundRecommendationWorkflow({ message, userText, intent }) {
  await replyToMessage(
    message.message_id,
    "进度：已识别为“基金发现/推荐”请求，不进入单只基金截图 screening。",
    { kind: "progress" }
  ).catch((error) => {
    console.error("[progress-reply-error]", error);
    recordError(error, { replyFailures: 1 });
  });

  await replyToMessage(
    message.message_id,
    "进度：正在抓取市场题材、行业/概念热度和近期基金候选池。",
    { kind: "progress" }
  ).catch((error) => {
    console.error("[progress-reply-error]", error);
    recordError(error, { replyFailures: 1 });
  });

  const marketSnapshot = await fetchMarketSnapshot();

  await replyToMessage(
    message.message_id,
    "进度：策略委员会筛选中。正在把市场热点、基金候选池和 1 万元配置方案合并成推荐清单。",
    { kind: "progress" }
  ).catch((error) => {
    console.error("[progress-reply-error]", error);
    recordError(error, { replyFailures: 1 });
  });

  const result = await recommendFundsWithModel({ userText, intent, marketSnapshot });
  persistAnswerWatchlistCandidates({
    userText,
    answerText: result.text,
    chartProfiles: result.chartProfiles,
    source: "fund_recommendation_answer"
  });
  const reportImages = await buildFundReportCardImages(result.chartProfiles, getEffectiveConfig()).catch((error) => {
    console.error("[fund-report-trend-image-error]", error);
    recordError(error, { fundReportTrendImageFailures: 1 });
    return [];
  });
  await replyToMessage(message.message_id, result.text, { kind: "answer", images: reportImages });
}

async function handleFundQaWorkflow({ message, userText, intent }) {
  const needsMarketSnapshot = shouldFetchMarketSnapshotForQuestion(userText);
  await replyToMessage(
    message.message_id,
    needsMarketSnapshot
      ? "进度：已识别为基金/市场问答，正在补充市场快照后回答。"
      : "进度：已识别为基金问答，将直接回答，不进入单只基金 screening。",
    { kind: "progress" }
  ).catch((error) => {
    console.error("[progress-reply-error]", error);
    recordError(error, { replyFailures: 1 });
  });

  const marketSnapshot = needsMarketSnapshot ? await fetchMarketSnapshot() : null;
  const result = await answerFundQuestionWithModel({ userText, intent, marketSnapshot });
  persistAnswerWatchlistCandidates({
    userText,
    answerText: result.text,
    chartProfiles: result.chartProfiles,
    source: "fund_qa_answer"
  });
  const reportImages = await buildFundReportCardImages(result.chartProfiles, getEffectiveConfig()).catch((error) => {
    console.error("[fund-report-trend-image-error]", error);
    recordError(error, { fundReportTrendImageFailures: 1 });
    return [];
  });
  await replyToMessage(message.message_id, result.text, { kind: "answer", images: reportImages });
}

function startPortfolioScheduler() {
  if (portfolioSchedulerTimer) {
    return;
  }

  portfolioSchedulerTimer = setInterval(() => {
    checkPortfolioSchedule().catch((error) => {
      console.error("[portfolio-scheduler-error]", error);
      recordError(error, { portfolioErrors: 1 });
    });
  }, Number(process.env.PORTFOLIO_SCHEDULER_INTERVAL_MS || 30_000));

  setTimeout(() => {
    checkPortfolioSchedule().catch((error) => {
      console.error("[portfolio-scheduler-error]", error);
      recordError(error, { portfolioErrors: 1 });
    });
  }, 3000);
}

async function checkPortfolioSchedule() {
  const config = getEffectiveConfig();
  if (!config.portfolioEnabled) {
    return;
  }

  const now = getZonedDateTime(config.portfolioTimezone);
  const dueTasks = [
    { type: "premarket", time: config.portfolioPremarketTime },
    { type: "decision", time: config.portfolioDecisionTime },
    { type: "valuation", time: config.portfolioReviewTime },
    { type: "weekly", time: config.portfolioWeeklyReviewTime, weekday: config.portfolioWeeklyReviewDay }
  ].filter((item) => {
    if (!item.time || item.time !== now.hhmm) return false;
    if (item.type !== "weekly") return true;
    return getDateOnlyWeekday(now.date) === Number(item.weekday);
  });

  for (const task of dueTasks) {
    if (!markPortfolioScheduledRun(task.type, now.date)) {
      continue;
    }
    runPortfolioTask(task.type, { manual: false, scheduledDate: now.date }).catch((error) => {
      console.error("[portfolio-run-error]", error);
    });
  }
}

function markPortfolioScheduledRun(type, date) {
  const db = readPortfolioDb();
  const keyByType = {
    premarket: "lastPremarketDate",
    decision: "lastDecisionDate",
    valuation: "lastValuationDate",
    weekly: "lastWeeklyReviewDate"
  };
  const key = keyByType[type] || "lastDecisionDate";
  db.scheduler = db.scheduler || {};
  if (db.scheduler[key] === date) {
    return false;
  }
  db.scheduler[key] = date;
  writePortfolioDb(db);
  return true;
}

function cancelPortfolioTask() {
  const db = readPortfolioDb();
  const now = new Date().toISOString();
  let cancelled = 0;

  for (const run of db.runs || []) {
    if (run.status !== "running") continue;
    run.status = "cancelled";
    run.error = "管理后台手动结束。";
    run.completedAt = now;
    run.durationMs = Date.parse(now) - Date.parse(run.startedAt || now);
    cancelledPortfolioRunIds.add(run.id);
    cancelled += 1;
  }

  if (activePortfolioRunId) {
    cancelledPortfolioRunIds.add(activePortfolioRunId);
  }
  portfolioRunInFlight = false;
  activePortfolioRunId = "";
  db.updatedAt = now;
  writePortfolioDb(db);
  updateStats({
    counters: { portfolioCancelledRuns: cancelled },
    last: { lastPortfolioCancelAt: now }
  });
  return getPortfolioPublicState(db);
}

function assertPortfolioRunActive(run) {
  if (isPortfolioRunCancelled(run.id)) {
    throw new Error("任务已被管理后台手动结束。");
  }
}

function isPortfolioRunCancelled(runId) {
  return cancelledPortfolioRunIds.has(runId);
}

async function runPortfolioTask(type, options = {}) {
  const taskType = normalizePortfolioTaskType(type);
  if (portfolioRunInFlight) {
    throw new Error("虚拟基金经理已有任务正在运行，请稍后再试。");
  }

  portfolioRunInFlight = true;
  const config = getEffectiveConfig();
  const startedAt = new Date().toISOString();
  const run = {
    id: createId("run"),
    type: taskType,
    date: getZonedDateTime(config.portfolioTimezone).date,
    manual: Boolean(options.manual),
    scheduledDate: options.scheduledDate || "",
    status: "running",
    startedAt
  };
  activePortfolioRunId = run.id;

  let db = readPortfolioDb();
  ensurePortfolioAccount(db, config);
  db.runs.push(run);
  writePortfolioDb(db);

  try {
    updateStats({
      counters: {
        portfolioRuns: 1,
        portfolioPremarketRuns: taskType === "premarket" ? 1 : 0,
        portfolioDecisionRuns: taskType === "decision" ? 1 : 0,
        portfolioValuationRuns: taskType === "valuation" ? 1 : 0,
        portfolioWeeklyRuns: taskType === "weekly" ? 1 : 0
      },
      last: { lastPortfolioRunAt: startedAt, lastPortfolioRunType: taskType }
    });

    if (taskType === "decision") {
      await executePortfolioDecision(db, run, config);
    } else if (taskType === "valuation") {
      await executePortfolioValuation(db, run, config);
    } else if (taskType === "premarket") {
      await executePortfolioPremarket(db, run, config);
    } else {
      await executePortfolioWeekly(db, run, config);
    }

    assertPortfolioRunActive(run);
    run.status = "completed";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.parse(run.completedAt) - Date.parse(startedAt);
    prunePortfolioDb(db, config.portfolioRetentionDays);
    db.updatedAt = new Date().toISOString();
    writePortfolioDb(db);
    await pushPortfolioRunIfConfigured(db, run, config);
    return getPortfolioPublicState(db);
  } catch (error) {
    if (isPortfolioRunCancelled(run.id)) {
      return finishCancelledPortfolioRun(run, error, startedAt);
    }
    run.status = "failed";
    run.error = error.message;
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.parse(run.completedAt) - Date.parse(startedAt);
    db.updatedAt = run.completedAt;
    writePortfolioDb(db);
    recordError(error, { portfolioErrors: 1 });
    throw error;
  } finally {
    if (activePortfolioRunId === run.id) {
      portfolioRunInFlight = false;
      activePortfolioRunId = "";
    }
    portfolioProgressFlushTimes.delete(run.id);
    cancelledPortfolioRunIds.delete(run.id);
  }
}

function finishCancelledPortfolioRun(run, error, startedAt) {
  const now = new Date().toISOString();
  run.status = "cancelled";
  run.error = error.message;
  run.completedAt = now;
  run.durationMs = Date.parse(now) - Date.parse(startedAt);

  const currentDb = readPortfolioDb();
  const storedRun = (currentDb.runs || []).find((item) => item.id === run.id);
  if (storedRun) {
    storedRun.status = run.status;
    storedRun.error = run.error;
    storedRun.completedAt = run.completedAt;
    storedRun.durationMs = run.durationMs;
    currentDb.updatedAt = now;
    writePortfolioDb(currentDb);
    return getPortfolioPublicState(currentDb);
  }
  return getPortfolioPublicState(currentDb);
}

function markPortfolioRunProgress(db, run, summary) {
  const now = new Date().toISOString();
  run.summary = summary;
  run.progressAt = now;
  db.updatedAt = now;
  console.log(`[portfolio-progress] ${run.id} ${run.type} ${summary}`);
  const flushEveryMs = Math.max(0, Number(process.env.PORTFOLIO_PROGRESS_FLUSH_MS || 5000));
  const nowMs = Date.parse(now);
  const lastFlushAt = portfolioProgressFlushTimes.get(run.id) || 0;
  if (flushEveryMs === 0 || !lastFlushAt || nowMs - lastFlushAt >= flushEveryMs) {
    portfolioProgressFlushTimes.set(run.id, nowMs);
    writePortfolioDb(db);
  } else {
    portfolioDbCache = db;
  }
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function executePortfolioDecision(db, run, config) {
  const profileContext = buildPortfolioManagerProfileContext(config, db);
  markPortfolioRunProgress(db, run, "正在处理上一轮订单和确认状态。");
  await yieldToEventLoop();
  const lifecycleBefore = await processPortfolioOrderLifecycle(db, run, config);
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "正在抓取市场快照和近期题材线索。");
  await yieldToEventLoop();
  const accountBefore = summarizePortfolioAccount(db.account);
  const marketSnapshot = await fetchMarketSnapshot();
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "正在补全当前持仓和自选基金池资料。");
  await yieldToEventLoop();
  const heldCodes = db.account.positions.map((position) => position.code).filter(Boolean);
  const heldProfiles = heldCodes.length ? await enrichFunds(heldCodes) : [];
  let watchlist = getActivePortfolioWatchlist(db);
  const watchlistCodes = mergeFundCodes(watchlist.map((item) => item.code));
  const watchlistProfiles = watchlistCodes.length ? await enrichFunds(watchlistCodes) : [];
  const preDecisionWatchlistUpdates = applyPortfolioWatchlistUpdates(
    db,
    buildPortfolioWatchlistRecheckUpdates(watchlist, { profiles: watchlistProfiles }),
    { run, profiles: watchlistProfiles, source: "decision_watchlist_recheck" }
  );
  if (preDecisionWatchlistUpdates.length) {
    watchlist = getActivePortfolioWatchlist(db);
  }
  markPortfolioRunProgress(db, run, "正在扫描低位回调候选，补充经理自选基金池。");
  await yieldToEventLoop();
  const watchlistSeedCandidates = await fetchPortfolioWatchlistSeedCandidates(marketSnapshot, watchlist).catch((error) => {
    console.warn("[portfolio-watchlist-seed-error]", error.message);
    recordError(error, { portfolioWatchlistSeedFailures: 1 });
    return [];
  });
  const seedProfiles = watchlistSeedCandidates.length
    ? await enrichFunds(watchlistSeedCandidates.map((item) => item.code))
    : [];
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, `资料已准备，模型正在以 ${config.modelReasoningEffort || "high"} 深度生成今日操作。`);
  await yieldToEventLoop();
  const raw = await buildPortfolioDecisionWithModel({
    account: accountBefore,
    marketSnapshot,
    heldProfiles,
    watchlist,
    watchlistProfiles,
    watchlistSeedCandidates,
    seedProfiles,
    config,
    profileContext
  });
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "模型已返回，正在解析投委会决策。");
  await yieldToEventLoop();
  const decision = ensurePortfolioHeldPositionsReviewed(
    ensurePortfolioReadyWatchlistReviewed(
      normalizePortfolioDecision(raw),
      watchlist,
      { profiles: watchlistProfiles }
    ),
    db.account.positions,
    { profiles: heldProfiles }
  );
  markPortfolioRunProgress(db, run, `已解析 ${decision.actions.length} 条动作，正在补全拟交易基金净值。`);
  await yieldToEventLoop();
  const profileCodes = decision.actions.map((action) => action.code).filter(Boolean);
  const actionProfiles = profileCodes.length ? await enrichFunds(profileCodes) : [];
  const executionProfiles = mergePortfolioProfiles(heldProfiles, actionProfiles);
  decision.actions = enforcePortfolioRiskBudget(decision.actions, db.account, executionProfiles);
  decision.actions = enforcePortfolioBuyDiscipline(decision.actions, executionProfiles, db.account.positions, db.account);
  decision.actions = enforcePortfolioSellDiscipline(decision.actions, executionProfiles, db.account.positions);
  const watchlistUpdates = applyPortfolioWatchlistUpdates(
    db,
    [
      ...buildPortfolioWatchlistUpdatesFromSeedCandidates(watchlistSeedCandidates, { profiles: seedProfiles }),
      ...decision.watchlistUpdates,
      ...buildPortfolioWatchlistUpdatesFromActions(decision.actions)
    ],
    { run, profiles: [...heldProfiles, ...watchlistProfiles, ...seedProfiles, ...actionProfiles], source: "decision" }
  );
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "正在校验交易规则并生成虚拟订单。");
  await yieldToEventLoop();
  const execution = await submitPortfolioOrders(db, decision.actions, executionProfiles, run, config);
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, `已生成 ${execution.orders.length} 张虚拟订单，正在生成决策日报。`);
  await yieldToEventLoop();
  const transactions = lifecycleBefore.transactions;
  recalculatePortfolioAccount(db.account);

  run.title = "每日操作决策";
  run.marketSnapshot = summarizeMarketSnapshot(marketSnapshot);
  run.accountBefore = accountBefore;
  run.accountAfter = summarizePortfolioAccount(db.account);
  run.team = decision.team;
  run.actions = decision.actions;
  run.watchlistUpdates = [...preDecisionWatchlistUpdates, ...watchlistUpdates];
  run.orders = execution.orders;
  run.transactions = transactions;
  run.executionNotes = [...lifecycleBefore.notes, ...execution.notes];
  run.settlementEvents = lifecycleBefore.settlementEvents;
  run.sources = collectPortfolioSources(marketSnapshot, heldProfiles, watchlistProfiles, seedProfiles, actionProfiles, decision);
  run.rawModelOutput = decision.rawModelOutput;
  run.card = buildPortfolioDecisionCard({
    decision,
    watchlistUpdates: run.watchlistUpdates,
    account: db.account,
    orders: execution.orders,
    transactions,
    executionNotes: run.executionNotes,
    settlementEvents: lifecycleBefore.settlementEvents,
    run
  });
  markPortfolioRunProgress(db, run, "决策日报已生成，正在保存任务结果。");

  updateStats({
    counters: {
      portfolioTransactions: transactions.length,
      portfolioOrdersSubmitted: execution.orders.length,
      portfolioOrderUpdates: lifecycleBefore.updatedOrders,
      portfolioSkippedTrades: execution.notes.length + lifecycleBefore.notes.length,
      portfolioNavVerifiedTrades: transactions.filter((item) => item.nav).length,
      portfolioSettlementEvents: lifecycleBefore.settlementEvents.length
    },
    last: { lastPortfolioDecisionAt: new Date().toISOString() }
  });
}

async function executePortfolioValuation(db, run, config) {
  const profileContext = buildPortfolioManagerProfileContext(config, db);
  markPortfolioRunProgress(db, run, "正在处理订单生命周期和晚间确认状态。");
  await yieldToEventLoop();
  const lifecycle = await processPortfolioOrderLifecycle(db, run, config);
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "正在补全持仓净值和走势数据。");
  await yieldToEventLoop();
  const accountBefore = summarizePortfolioAccount(db.account);
  const positionsBefore = new Map(db.account.positions.map((position) => [position.code, { ...position }]));
  const codes = db.account.positions.map((position) => position.code).filter(Boolean);
  const profiles = codes.length ? await enrichFunds(codes) : [];
  assertPortfolioRunActive(run);
  const profileByCode = new Map(profiles.map((profile) => [profile.code, profile]));
  const positionUpdates = [];

  for (const position of db.account.positions) {
    const before = positionsBefore.get(position.code) || {};
    const profile = profileByCode.get(position.code);
    const nav = getProfileNav(profile);
    if (nav && position.units) {
      position.currentValue = round(position.units * nav, 2);
      position.lastNav = nav;
      position.lastNavDate = profile?.snapshotDate || "";
    } else if (nav && position.lastNav && position.currentValue) {
      position.currentValue = round(position.currentValue * (nav / position.lastNav), 2);
      position.lastNav = nav;
      position.lastNavDate = profile?.snapshotDate || "";
    }
    position.name = position.name || profile?.name || "";
    position.fundSnapshot = buildPortfolioFundSnapshot(profile, position);
    position.dataSource = profile?.sources?.[0] || position.dataSource || "";
    position.lastValuedAt = new Date().toISOString();
    positionUpdates.push({
      code: position.code,
      name: position.name,
      beforeValue: round(Number(before.currentValue || 0), 2),
      afterValue: round(Number(position.currentValue || 0), 2),
      dayPnl: round(Number(position.currentValue || 0) - Number(before.currentValue || 0), 2),
      latestNav: nav,
      navDate: profile?.snapshotDate || "",
      trend: position.fundSnapshot?.trendSummary || "",
      source: profile?.sources?.[0] || ""
    });
  }

  recalculatePortfolioAccount(db.account);
  const previousEquity = [...db.dailyEquity].reverse().find((item) => item.date !== run.date);
  const dayPnl = previousEquity ? round(db.account.totalAsset - Number(previousEquity.totalAsset || 0), 2) : 0;
  db.account.dayPnl = dayPnl;
  db.dailyEquity.push({
    id: createId("equity"),
    date: run.date,
    createdAt: new Date().toISOString(),
    totalAsset: db.account.totalAsset,
    cash: db.account.cash,
    pendingBuyAmount: db.account.pendingBuyAmount,
    receivableCash: db.account.receivableCash,
    investedValue: db.account.investedValue,
    investedCost: db.account.investedCost,
    peakTotalAsset: db.account.peakTotalAsset,
    peakTotalAssetDate: db.account.peakTotalAssetDate,
    drawdownFromPeakPct: db.account.drawdownFromPeakPct,
    riskBudget: db.account.riskBudget,
    dayPnl,
    cumulativePnl: db.account.cumulativePnl,
    cumulativePnlPct: db.account.cumulativePnlPct,
    capitalPnlPct: db.account.capitalPnlPct,
    positions: db.account.positions.map(summarizePortfolioPosition)
  });

  markPortfolioRunProgress(db, run, `估值资料已准备，模型正在以 ${config.modelReasoningEffort || "high"} 深度复盘。`);
  await yieldToEventLoop();
  const accountAfter = summarizePortfolioAccount(db.account);
  let raw = "";
  try {
    raw = await buildPortfolioValuationWithModel({
      accountBefore,
      accountAfter,
      positionUpdates,
      profiles,
      config,
      profileContext
    });
  } catch (error) {
    if (!isEmptyModelResponse(error)) {
      throw error;
    }
    console.warn("[portfolio-valuation-model-empty]", run.id, error.message);
    updateStats({ counters: { portfolioValuationModelEmptyFallbacks: 1 } });
    raw = buildFallbackPortfolioValuationRaw({
      accountBefore,
      accountAfter,
      positionUpdates,
      lifecycle,
      profiles
    });
  }
  assertPortfolioRunActive(run);
  const review = normalizePortfolioReview(raw);
  markPortfolioRunProgress(db, run, "估值复盘已生成，正在保存任务结果。");

  run.title = "晚间估值复盘";
  run.summary = review.summary;
  run.accountBefore = accountBefore;
  run.accountAfter = accountAfter;
  run.positionUpdates = positionUpdates;
  run.transactions = lifecycle.transactions;
  run.orderUpdates = lifecycle.orderUpdates;
  run.settlementEvents = lifecycle.settlementEvents;
  run.executionNotes = lifecycle.notes;
  run.sources = collectPortfolioSources(null, profiles, review);
  run.rawModelOutput = review.rawModelOutput;
  run.card = buildPortfolioValuationCard({ review, account: db.account, positionUpdates, lifecycle, run });

  updateStats({
    counters: {
      portfolioEquitySnapshots: 1,
      portfolioTransactions: lifecycle.transactions.length,
      portfolioOrderUpdates: lifecycle.updatedOrders,
      portfolioNavVerifiedTrades: lifecycle.transactions.filter((item) => item.nav).length,
      portfolioSettlementEvents: lifecycle.settlementEvents.length
    },
    last: { lastPortfolioValuationAt: new Date().toISOString() }
  });
}

async function executePortfolioPremarket(db, run, config) {
  const profileContext = buildPortfolioManagerProfileContext(config, db);
  markPortfolioRunProgress(db, run, "正在处理隔夜订单状态和盘前账本。");
  await yieldToEventLoop();
  const lifecycle = await processPortfolioOrderLifecycle(db, run, config);
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "正在抓取盘前市场快照。");
  await yieldToEventLoop();
  const account = summarizePortfolioAccount(db.account);
  const marketSnapshot = await fetchMarketSnapshot();
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "正在补全盘前持仓和自选基金池资料。");
  await yieldToEventLoop();
  const codes = db.account.positions.map((position) => position.code).filter(Boolean);
  const profiles = codes.length ? await enrichFunds(codes) : [];
  const watchlist = getActivePortfolioWatchlist(db);
  const watchlistCodes = mergeFundCodes(watchlist.map((item) => item.code));
  const watchlistProfiles = watchlistCodes.length ? await enrichFunds(watchlistCodes) : [];
  const watchlistSeedCandidates = await fetchPortfolioWatchlistSeedCandidates(marketSnapshot, watchlist).catch((error) => {
    console.warn("[portfolio-watchlist-seed-error]", error.message);
    recordError(error, { portfolioWatchlistSeedFailures: 1 });
    return [];
  });
  const seedProfiles = watchlistSeedCandidates.length
    ? await enrichFunds(watchlistSeedCandidates.map((item) => item.code))
    : [];
  const activeOrders = (db.orders || []).filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status));
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, `盘前资料已准备，模型正在以 ${config.modelReasoningEffort || "high"} 深度生成观察清单。`);
  await yieldToEventLoop();
  const raw = await buildPortfolioPremarketWithModel({
    account,
    marketSnapshot,
    profiles,
    watchlist,
    watchlistProfiles,
    watchlistSeedCandidates,
    seedProfiles,
    activeOrders,
    lifecycle,
    config,
    profileContext
  });
  assertPortfolioRunActive(run);
  const observation = normalizePortfolioPremarket(raw);
  const watchlistUpdates = applyPortfolioWatchlistUpdates(db, [
    ...buildPortfolioWatchlistUpdatesFromSeedCandidates(watchlistSeedCandidates, { profiles: seedProfiles }),
    ...observation.watchlistUpdates
  ], {
    run,
    profiles: [...profiles, ...watchlistProfiles, ...seedProfiles],
    source: "premarket"
  });
  markPortfolioRunProgress(db, run, "盘前观察已生成，正在保存任务结果。");

  run.title = "盘前观察";
  run.summary = observation.summary;
  run.accountAfter = summarizePortfolioAccount(db.account);
  run.observation = observation;
  run.watchlistUpdates = watchlistUpdates;
  run.orderUpdates = lifecycle.orderUpdates;
  run.transactions = lifecycle.transactions;
  run.settlementEvents = lifecycle.settlementEvents;
  run.executionNotes = lifecycle.notes;
  run.sources = collectPortfolioSources(marketSnapshot, profiles, watchlistProfiles, seedProfiles, observation);
  run.rawModelOutput = observation.rawModelOutput;
  run.card = buildPortfolioPremarketCard({
    observation,
    watchlistUpdates,
    account: db.account,
    activeOrders,
    lifecycle,
    run
  });

  updateStats({
    counters: {
      portfolioOrderUpdates: lifecycle.updatedOrders,
      portfolioPremarketModelCalls: 1
    },
    last: { lastPortfolioPremarketAt: new Date().toISOString() }
  });
}

async function executePortfolioWeekly(db, run, config) {
  const profileContext = buildPortfolioManagerProfileContext(config, db);
  markPortfolioRunProgress(db, run, "正在整理本周订单、流水和估值记录。");
  await yieldToEventLoop();
  const lifecycle = await processPortfolioOrderLifecycle(db, run, config);
  assertPortfolioRunActive(run);
  const weeklyContext = buildPortfolioWeeklyContext(db, run.date);
  markPortfolioRunProgress(db, run, "正在补全周总结所需持仓和自选基金池资料。");
  await yieldToEventLoop();
  const codes = mergeFundCodes(
    db.account.positions.map((position) => position.code),
    weeklyContext.transactions.map((item) => item.code),
    weeklyContext.orders.map((item) => item.code),
    getActivePortfolioWatchlist(db).map((item) => item.code)
  );
  const profiles = codes.length ? await enrichFunds(codes) : [];
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, `周度资料已准备，模型正在以 ${config.modelReasoningEffort || "high"} 深度总结。`);
  await yieldToEventLoop();
  const raw = await buildPortfolioWeeklyWithModel({
    account: summarizePortfolioAccount(db.account),
    weeklyContext,
    profiles,
    watchlist: getActivePortfolioWatchlist(db),
    lifecycle,
    config,
    profileContext
  });
  assertPortfolioRunActive(run);
  const weekly = normalizePortfolioWeekly(raw);
  const watchlistUpdates = applyPortfolioWatchlistUpdates(db, weekly.watchlistUpdates, {
    run,
    profiles,
    source: "weekly"
  });
  markPortfolioRunProgress(db, run, "周总结已生成，正在保存任务结果。");

  run.title = "周计划与总结";
  run.summary = weekly.summary;
  run.accountAfter = summarizePortfolioAccount(db.account);
  run.weeklyContext = weeklyContext;
  run.weekly = weekly;
  run.watchlistUpdates = watchlistUpdates;
  run.orderUpdates = lifecycle.orderUpdates;
  run.transactions = weeklyContext.transactions;
  run.settlementEvents = lifecycle.settlementEvents;
  run.executionNotes = lifecycle.notes;
  run.sources = collectPortfolioSources(profiles, weekly);
  run.rawModelOutput = weekly.rawModelOutput;
  run.card = buildPortfolioWeeklyCard({ weekly, weeklyContext, watchlistUpdates, account: db.account, run });

  updateStats({
    counters: {
      portfolioOrderUpdates: lifecycle.updatedOrders,
      portfolioWeeklyModelCalls: 1
    },
    last: { lastPortfolioWeeklyAt: new Date().toISOString() }
  });
}

async function buildPortfolioDecisionWithModel({ account, marketSnapshot, heldProfiles, watchlist = [], watchlistProfiles = [], watchlistSeedCandidates = [], seedProfiles = [], config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { workflow: "portfolio_status", skillIds: ["fund-portfolio-profile", "fund-portfolio-research", "fund-portfolio-decision", "fund-portfolio-execution"] },
    []
  );
  const systemText = [
    "你是飞书机器人“基金经理”的虚拟基金经理。你每天管理一个教育性虚拟组合，不进行真实交易。",
    "你的目标不是永远保守，而是在证据足够时敢于出击；但每次动作都必须写清数据来源、风险控制和复盘条件。",
    "你有一个投委会：市场分析师、题材分析师、基金研究员、组合经理、风控经理、主席。每个角色必须贡献可保存的观点。",
    "只能基于传入的公开市场快照、基金候选池、当前持仓和自选基金池做判断；不要编造快照中不存在的基金代码、涨跌幅或排名。",
    "你必须维护自己的自选基金池：暂时不买但值得盯的基金要写入 watchlistUpdates，已有候选要复核是否 ready、waiting_pullback、watch 或 blocked，不能只围绕已有持仓转。",
    "自选基金池是未来随时准备购入的候选账本，每只候选都必须有备选理由、买入触发条件、风险备注和费用/份额说明。",
    "新闻只能作为催化证据，不能单独触发 BUY。每次买入前必须通过“轮动/低位/拥挤度”检查：优先低位轮动、回撤修复和早期确认，回避仅因新闻热度和短期涨幅追高。",
    "如果 themeRadar.positionSignal 是 high_chase_risk，或 crowdingScore 高但 lowPositionScore/rotationScore 不支持，只能 WATCH、HOLD 或小额试探，不能重仓追涨。",
    "同一基金不同份额类别不能混着推荐；必须比较 A/C/D/I 等份额的申购费、销售服务费、赎回费、起购门槛和渠道可得性，并说明费用拖累是否适合本次持有期。",
    "交易建议应以 targetWeightPct 为主，amount 只是建议值；系统执行时会按公开净值、现金和已有持仓重新计算真实份额。",
    "必须执行账户级回撤预算：账户回撤到预警线时缩小买入，到最大回撤预算时暂停新增买入并优先分批降风险；不能用加仓摊薄替代止损。",
    "必须执行单仓风控：浮亏触及止损线、浮盈大幅回吐或趋势破位时，先给 SELL/减仓复核，不要只写 HOLD。",
    "如果候选基金缺少可验证净值或走势数据，倾向 WATCH，不要强行 BUY。",
    "请只返回 JSON，不要 Markdown，不要代码块。",
    "",
    skillContext
  ].join("\n");
  const userPrompt = [
    `组合本金：${account.initialCapital} 元`,
    `当前账户：${JSON.stringify(account, null, 2)}`,
    `风险风格：${config.portfolioRiskProfile || "balanced"}`,
    "",
    "基金经理画像与行为证据：",
    profileContext,
    "",
    "今日公开市场/基金候选快照：",
    JSON.stringify(summarizeMarketSnapshot(marketSnapshot), null, 2),
    "",
    "当前持仓联网资料：",
    JSON.stringify(heldProfiles || [], null, 2),
    "",
    "当前持仓复核队列（系统复核后）：",
    JSON.stringify(buildPortfolioHeldPositionReviewQueue(account.positions || [], heldProfiles), null, 2),
    "要求：持仓复核队列中的每只基金必须在 actions 中逐只给 HOLD/SELL/WATCH 理由；如果继续持有，要写清减仓或止损触发条件，不能忽略。",
    "",
    "当前自选基金池：",
    JSON.stringify(summarizePortfolioWatchlistForModel(watchlist), null, 2),
    "",
    "自选基金池联网资料：",
    JSON.stringify((watchlistProfiles || []).map(compactPortfolioReviewProfile), null, 2),
    "",
    "今日购买准备队列（系统复核后）：",
    JSON.stringify(buildPortfolioDecisionReadinessQueue(watchlist, watchlistProfiles), null, 2),
    "要求：队列中的接近可买候选必须在 actions 中逐只给 BUY 或 WATCH/HOLD 理由；如果不买，要写清仍差的触发条件，不能忽略。",
    "",
    "系统确定性召回的低位/回调候选：",
    JSON.stringify((watchlistSeedCandidates || []).map(compactPortfolioSeedCandidateForModel), null, 2),
    "",
    "低位/回调候选联网资料：",
    JSON.stringify((seedProfiles || []).map(compactPortfolioReviewProfile), null, 2),
    "",
    "输出 JSON 结构：",
    JSON.stringify(
      {
        summary: "一句话今日操作手法",
        marketView: "市场判断和关键数据",
        team: [
          { agent: "市场分析师", stance: "正/中/负", reason: "理由", dataBasis: ["数据来源或字段"] },
          { agent: "题材分析师", stance: "正/中/负", reason: "理由", dataBasis: ["数据来源或字段"] },
          { agent: "基金研究员", stance: "正/中/负", reason: "理由", dataBasis: ["数据来源或字段"] },
          { agent: "组合经理", stance: "正/中/负", reason: "理由", dataBasis: ["数据来源或字段"] },
          { agent: "风控经理", stance: "正/中/负", reason: "理由", dataBasis: ["数据来源或字段"] },
          { agent: "主席", stance: "正/中/负", reason: "最终拍板理由", dataBasis: ["数据来源或字段"] }
        ],
        actions: [
          {
            action: "BUY/SELL/HOLD/WATCH",
            code: "6位基金代码，只有 HOLD 组合现金时可为空",
            name: "基金名称",
            amount: 0,
            targetWeightPct: 0,
            reason: "为什么今天这么做",
            dataBasis: ["使用了哪些数据"],
            rotationCheck: "板块轮动、低位、拥挤度和新闻催化是否共同支持，不支持就写不买/少买原因",
            positionCheck: "基金/主题当前位置：低位轮动、回撤修复、正常确认、过热追涨之一",
            chaseRisk: "追涨和大回调风险如何处理",
            feeCheck: "A/C/D/I 等份额类别、申购费、销售服务费和预计持有期是否匹配",
            riskControl: "止损、复查或减仓触发条件"
          }
        ],
        watchlistUpdates: [
          {
            operation: "UPSERT/REMOVE",
            code: "6位基金代码",
            name: "基金名称",
            shareClass: "A/C/D/I/未知",
            type: "基金类型或主题",
            status: "ready/waiting_pullback/watch/blocked/in_position",
            priority: 1,
            candidateRole: "核心候选/卫星候选/观察/替代份额",
            reason: "为什么放入或保留自选池，必须具体",
            setupEvidence: ["低位、回调、轮动、走势、基本面证据"],
            buyTriggers: ["什么条件出现就可以考虑买入或分批"],
            riskNotes: ["不买或少买的风险边界"],
            feeNotes: ["A/C 等份额费率、持有期、赎回费或销售服务费说明"],
            positionPlan: "若触发买点，准备作为几成仓/核心或卫星",
            reviewDate: "YYYY-MM-DD 或复查条件",
            dataBasis: ["使用了哪些快照字段或资料"]
          }
        ],
        riskNotes: ["最多3条"],
        learningNotes: ["这次值得回溯学习的点"],
        sources: ["数据源 URL 或快照字段名"]
      },
      null,
      2
    )
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.max(Number(config.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS), 7600)
  });
  updateStats({
    counters: { portfolioManagerModelCalls: 1 },
    last: { lastPortfolioManagerModelAt: new Date().toISOString() }
  });
  return text;
}

async function buildPortfolioValuationWithModel({ accountBefore, accountAfter, positionUpdates, profiles, config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { workflow: "portfolio_status", skillIds: ["fund-portfolio-profile", "fund-portfolio-review", "fund-portfolio-execution"] },
    []
  );
  const compactProfiles = (profiles || []).map(compactPortfolioReviewProfile);
  const systemText = [
    "你是飞书机器人“基金经理”的虚拟基金经理，正在做晚间估值复盘。",
    "请解释今日盈亏、仓位变化和明天观察重点。不要编造传入资料之外的数据。",
    "请只返回 JSON，不要 Markdown，不要代码块。",
    "",
    skillContext
  ].join("\n");
  const userPrompt = [
    "基金经理画像与行为证据：",
    profileContext,
    "",
    "估值前账户：",
    JSON.stringify(accountBefore, null, 2),
    "",
    "估值后账户：",
    JSON.stringify(accountAfter, null, 2),
    "",
    "持仓估值变化：",
    JSON.stringify(positionUpdates, null, 2),
    "",
    "持仓联网资料摘要：",
    JSON.stringify(compactProfiles, null, 2),
    "",
    "输出 JSON 结构：",
    '{"summary":"今日盈亏复盘","reason":"为什么变动","nextWatch":["明天观察点"],"learningNotes":["可回溯学习点"],"sources":["数据源"]}'
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.max(Number(config.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS), 3600)
  });
  updateStats({
    counters: { portfolioReviewModelCalls: 1 },
    last: { lastPortfolioReviewModelAt: new Date().toISOString() }
  });
  return text;
}

function compactPortfolioReviewProfile(profile = {}) {
  const oneYear = profile.riskMetrics?.periods?.["1y"] || {};
  const topHoldings = (profile.holdings?.equityTopHoldings || profile.topStocks || []).slice(0, 10).map((item) => {
    if (typeof item === "string") return item;
    return [item.code, item.name, item.netValuePct ? `${item.netValuePct}%` : ""].filter(Boolean).join(" ");
  });
  return {
    code: profile.code || "",
    name: profile.name || "",
    navDate: profile.snapshotDate || "",
    unitNav: profile.unitNav || "",
    estimatedNav: profile.estimatedNav || "",
    estimatedChangePct: profile.estimatedChangePct || "",
    trendProfile: profile.trendProfile || null,
    actionability: profile.actionability || null,
    oneYearRisk: oneYear.ok ? pickRiskPeriod(oneYear) : null,
    returns: profile.returns || {},
    shareClass: profile.shareClass || "",
    feeModel: profile.shareClassFeeModel || null,
    feeImpact: profile.fees?.feeImpact || null,
    feeDecisionRule: profile.fees?.feeDecisionRule || "",
    scale: profile.scale || null,
    topHoldings,
    sources: (profile.sources || []).slice(0, 4)
  };
}

function buildFallbackPortfolioValuationRaw({ accountBefore, accountAfter, positionUpdates, lifecycle = {}, profiles = [] }) {
  const changes = [...positionUpdates].sort((a, b) => Math.abs(Number(b.dayPnl || 0)) - Math.abs(Number(a.dayPnl || 0)));
  const biggest = changes[0];
  const dayPnl = round(Number(accountAfter?.dayPnl || 0), 2);
  const summary = dayPnl > 0
    ? `今日组合估值上升 ${formatSignedNumber(dayPnl)} 元。`
    : dayPnl < 0
      ? `今日组合估值回落 ${formatSignedNumber(dayPnl)} 元。`
      : "今日组合估值基本持平。";
  const reasonParts = [
    biggest ? `主要变动来自 ${biggest.code} ${biggest.name || ""}，单项 ${formatSignedNumber(biggest.dayPnl)} 元。` : "当前没有明显持仓估值变动。",
    `总资产 ${accountAfter?.totalAsset ?? 0} 元，仓位 ${accountAfter?.positionWeightPct ?? 0}%。`,
    lifecycle.orderUpdates?.length ? `有 ${lifecycle.orderUpdates.length} 笔订单状态更新。` : "",
    lifecycle.transactions?.length ? `有 ${lifecycle.transactions.length} 笔确认成交。` : ""
  ].filter(Boolean);
  const nextWatch = changes.slice(0, 3).map((item) =>
    `${item.code} ${item.name || ""}：关注净值 ${item.latestNav || "缺失"} 后续是否延续，当前单日影响 ${formatSignedNumber(item.dayPnl)} 元。`
  );
  if (!nextWatch.length) nextWatch.push("明日继续观察持仓净值更新和未完成订单确认状态。");
  const learningNotes = [
    accountAfter?.positionWeightPct > 80 ? "仓位偏高，下一轮决策应优先评估加仓必要性。" : "",
    accountAfter?.cash > 0 ? "保留现金可提高下一轮调仓机动性。" : "",
    "本次为模型空返回后的规则兜底复盘，应在下一轮正常模型复盘中复核。"
  ].filter(Boolean);

  return JSON.stringify({
    summary,
    reason: reasonParts.join(" "),
    nextWatch,
    learningNotes,
    sources: collectPortfolioSources(null, profiles).slice(0, 8)
  });
}

async function buildPortfolioPremarketWithModel({ account, marketSnapshot, profiles, watchlist = [], watchlistProfiles = [], watchlistSeedCandidates = [], seedProfiles = [], activeOrders, lifecycle, config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { workflow: "portfolio_status", skillIds: ["fund-portfolio-profile", "fund-portfolio-premarket", "fund-portfolio-research", "fund-portfolio-execution"] },
    []
  );
  const systemText = [
    "你是飞书机器人“基金经理”的虚拟基金经理，正在做盘前观察。",
    "盘前观察只给观察清单和下午决策偏向，不生成 BUY/SELL 订单。",
    "请基于传入的市场快照、持仓资料、自选基金池、订单生命周期和经理画像输出 JSON，不要编造资料之外的数据。",
    "盘前必须复核自选基金池：哪些已经接近可买、哪些还要等回调、哪些因为追高/费用/数据不足应降级。",
    "请只返回 JSON，不要 Markdown，不要代码块。",
    "",
    skillContext
  ].join("\n");
  const userPrompt = [
    "基金经理画像与行为证据：",
    profileContext,
    "",
    "当前账户：",
    JSON.stringify(account, null, 2),
    "",
    "盘前市场快照：",
    JSON.stringify(summarizeMarketSnapshot(marketSnapshot), null, 2),
    "",
    "当前持仓资料：",
    JSON.stringify(profiles || [], null, 2),
    "",
    "当前自选基金池：",
    JSON.stringify(summarizePortfolioWatchlistForModel(watchlist), null, 2),
    "",
    "自选基金池联网资料：",
    JSON.stringify((watchlistProfiles || []).map(compactPortfolioReviewProfile), null, 2),
    "",
    "系统确定性召回的低位/回调候选：",
    JSON.stringify((watchlistSeedCandidates || []).map(compactPortfolioSeedCandidateForModel), null, 2),
    "",
    "低位/回调候选联网资料：",
    JSON.stringify((seedProfiles || []).map(compactPortfolioReviewProfile), null, 2),
    "",
    "活动订单与生命周期更新：",
    JSON.stringify({ activeOrders, lifecycle }, null, 2),
    "",
    "输出 JSON 结构：",
    '{"summary":"盘前一句话结论","marketTone":"aggressive/neutral/defensive/wait","positionFocus":["持仓观察点"],"riskAlerts":["风险提醒"],"todayPlan":["今天观察什么"],"afternoonDecisionBias":"下午决策偏向","watchlistUpdates":[{"operation":"UPSERT/REMOVE","code":"6位基金代码","name":"基金名称","shareClass":"A/C/D/I/未知","type":"基金类型或主题","status":"ready/waiting_pullback/watch/blocked/in_position","priority":1,"candidateRole":"核心候选/卫星候选/观察/替代份额","reason":"备选理由","setupEvidence":["低位/轮动/走势证据"],"buyTriggers":["买入触发条件"],"riskNotes":["风险边界"],"feeNotes":["份额和费用说明"],"positionPlan":"触发后仓位计划","reviewDate":"复查日期或条件","dataBasis":["数据字段"]}],"sources":["数据源"]}'
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.max(Number(config.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS), 5200)
  });
  return text;
}

async function buildPortfolioWeeklyWithModel({ account, weeklyContext, profiles, watchlist = [], lifecycle, config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { workflow: "portfolio_status", skillIds: ["fund-portfolio-profile", "fund-portfolio-weekly", "fund-portfolio-review", "fund-portfolio-execution"] },
    []
  );
  const systemText = [
    "你是飞书机器人“基金经理”的虚拟基金经理，正在做周计划与总结。",
    "周总结只复盘和规划，不生成 BUY/SELL 订单；下周具体交易由每日决策任务决定。",
    "请基于传入的账本、持仓资料、自选基金池和经理画像输出 JSON，不要编造资料之外的数据。",
    "周计划必须维护下周自选基金池：保留、升级、降级或移除候选，并写清备选理由、触发条件、风险和费用。",
    "请只返回 JSON，不要 Markdown，不要代码块。",
    "",
    skillContext
  ].join("\n");
  const userPrompt = [
    "基金经理画像与行为证据：",
    profileContext,
    "",
    "当前账户：",
    JSON.stringify(account, null, 2),
    "",
    "本周账本摘要：",
    JSON.stringify(weeklyContext, null, 2),
    "",
    "持仓联网资料：",
    JSON.stringify(profiles || [], null, 2),
    "",
    "当前自选基金池：",
    JSON.stringify(summarizePortfolioWatchlistForModel(watchlist), null, 2),
    "",
    "订单生命周期更新：",
    JSON.stringify(lifecycle, null, 2),
    "",
    "输出 JSON 结构：",
    '{"summary":"本周一句话总结","pnlAttribution":["盈亏归因"],"operationReview":["操作复盘"],"disciplineReview":["纪律执行情况"],"mistakes":["错误或不足"],"nextWeekPlan":["下周计划"],"watchlist":["简短观察清单"],"watchlistUpdates":[{"operation":"UPSERT/REMOVE","code":"6位基金代码","name":"基金名称","shareClass":"A/C/D/I/未知","type":"基金类型或主题","status":"ready/waiting_pullback/watch/blocked/in_position","priority":1,"candidateRole":"核心候选/卫星候选/观察/替代份额","reason":"备选理由","setupEvidence":["低位/轮动/走势证据"],"buyTriggers":["买入触发条件"],"riskNotes":["风险边界"],"feeNotes":["份额和费用说明"],"positionPlan":"触发后仓位计划","reviewDate":"复查日期或条件","dataBasis":["数据字段"]}],"riskNotes":["风险提醒"],"sources":["数据源"]}'
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.max(Number(config.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS), 6200)
  });
  return text;
}

function normalizePortfolioDecision(raw) {
  let parsed = null;
  try {
    parsed = parseJsonFromModel(raw);
  } catch {
    parsed = {};
  }

  return {
    summary: String(parsed.summary || "今日不做强制交易，先保存投委会观察。").trim(),
    marketView: String(parsed.marketView || "").trim(),
    team: normalizePortfolioTeam(parsed.team),
    actions: normalizePortfolioActions(parsed.actions),
    watchlistUpdates: normalizePortfolioWatchlistUpdates(parsed.watchlistUpdates),
    riskNotes: normalizeStringArray(parsed.riskNotes).slice(0, 5),
    learningNotes: normalizeStringArray(parsed.learningNotes).slice(0, 5),
    sources: normalizeStringArray(parsed.sources).slice(0, 20),
    rawModelOutput: String(raw || "").slice(0, 12000)
  };
}

function normalizePortfolioReview(raw) {
  let parsed = null;
  try {
    parsed = parseJsonFromModel(raw);
  } catch {
    parsed = {};
  }
  return {
    summary: String(parsed.summary || "今日估值已更新。").trim(),
    reason: String(parsed.reason || "").trim(),
    nextWatch: normalizeStringArray(parsed.nextWatch).slice(0, 5),
    learningNotes: normalizeStringArray(parsed.learningNotes).slice(0, 5),
    sources: normalizeStringArray(parsed.sources).slice(0, 20),
    rawModelOutput: String(raw || "").slice(0, 12000)
  };
}

function normalizePortfolioPremarket(raw) {
  let parsed = null;
  try {
    parsed = parseJsonFromModel(raw);
  } catch {
    parsed = {};
  }
  return {
    summary: String(parsed.summary || "盘前观察已生成。").trim(),
    marketTone: String(parsed.marketTone || "neutral").trim(),
    positionFocus: normalizeStringArray(parsed.positionFocus).slice(0, 8),
    riskAlerts: normalizeStringArray(parsed.riskAlerts).slice(0, 8),
    todayPlan: normalizeStringArray(parsed.todayPlan).slice(0, 8),
    afternoonDecisionBias: String(parsed.afternoonDecisionBias || "").trim(),
    watchlistUpdates: normalizePortfolioWatchlistUpdates(parsed.watchlistUpdates),
    sources: normalizeStringArray(parsed.sources).slice(0, 20),
    rawModelOutput: String(raw || "").slice(0, 12000)
  };
}

function normalizePortfolioWeekly(raw) {
  let parsed = null;
  try {
    parsed = parseJsonFromModel(raw);
  } catch {
    parsed = {};
  }
  return {
    summary: String(parsed.summary || "本周组合总结已生成。").trim(),
    pnlAttribution: normalizeStringArray(parsed.pnlAttribution).slice(0, 8),
    operationReview: normalizeStringArray(parsed.operationReview).slice(0, 8),
    disciplineReview: normalizeStringArray(parsed.disciplineReview).slice(0, 8),
    mistakes: normalizeStringArray(parsed.mistakes).slice(0, 8),
    nextWeekPlan: normalizeStringArray(parsed.nextWeekPlan).slice(0, 8),
    watchlist: normalizeStringArray(parsed.watchlist).slice(0, 8),
    watchlistUpdates: normalizePortfolioWatchlistUpdates(parsed.watchlistUpdates),
    riskNotes: normalizeStringArray(parsed.riskNotes).slice(0, 8),
    sources: normalizeStringArray(parsed.sources).slice(0, 20),
    rawModelOutput: String(raw || "").slice(0, 12000)
  };
}

function normalizePortfolioTeam(value) {
  const defaults = ["市场分析师", "题材分析师", "基金研究员", "组合经理", "风控经理", "主席"];
  const input = Array.isArray(value) ? value : [];
  const byAgent = new Map(input.map((item) => [String(item?.agent || "").trim(), item]));
  return defaults.map((agent) => {
    const item = byAgent.get(agent) || {};
    return {
      agent,
      stance: String(item.stance || "中").trim(),
      reason: String(item.reason || "暂无明确意见。").trim(),
      dataBasis: normalizeStringArray(item.dataBasis).slice(0, 5)
    };
  });
}

function normalizePortfolioActions(value) {
  const input = Array.isArray(value) ? value : [];
  return input
    .map((item) => {
      const action = String(item?.action || "WATCH").trim().toUpperCase();
      const normalizedAction = ["BUY", "SELL", "HOLD", "WATCH"].includes(action) ? action : "WATCH";
      const code = String(item?.code || "").match(/^\d{6}$/)?.[0] || "";
      return {
        action: normalizedAction,
        code,
        name: String(item?.name || "").trim(),
        amount: Math.max(0, round(Number(item?.amount || 0), 2) || 0),
        targetWeightPct: round(Number(item?.targetWeightPct || 0), 2) || 0,
        reason: String(item?.reason || "").trim(),
        dataBasis: normalizeStringArray(item?.dataBasis).slice(0, 8),
        rotationCheck: String(item?.rotationCheck || "").trim(),
        positionCheck: String(item?.positionCheck || "").trim(),
        chaseRisk: String(item?.chaseRisk || "").trim(),
        feeCheck: String(item?.feeCheck || "").trim(),
        riskControl: String(item?.riskControl || "").trim()
      };
    })
    .filter((item) => item.action === "HOLD" || item.action === "WATCH" || item.code)
    .slice(0, 10);
}

function getActivePortfolioWatchlist(db) {
  db.watchlist = normalizePortfolioWatchlist(db.watchlist);
  return db.watchlist.filter((item) => item.status !== "removed").slice(0, 60);
}

function normalizePortfolioWatchlist(value) {
  const input = Array.isArray(value) ? value : [];
  const byCode = new Map();
  for (const item of input) {
    const normalized = normalizePortfolioWatchItem(item);
    if (!normalized) continue;
    const existing = byCode.get(normalized.code);
    if (!existing || Date.parse(normalized.updatedAt || "") >= Date.parse(existing.updatedAt || "")) {
      byCode.set(normalized.code, normalized);
    }
  }
  return sortPortfolioWatchlist(consolidatePortfolioWatchlistAlternatives([...byCode.values()]));
}

function sortPortfolioWatchlist(items = []) {
  return [...items].sort((a, b) => {
    if (a.status === "removed" && b.status !== "removed") return 1;
    if (a.status !== "removed" && b.status === "removed") return -1;
    return Number(a.priority || 3) - Number(b.priority || 3)
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
}

function normalizePortfolioWatchItem(item = {}, defaults = {}) {
  const now = defaults.now || new Date().toISOString();
  const code = String(item?.code || defaults.code || "").match(/^\d{6}$/)?.[0] || "";
  if (!code) return null;
  const status = normalizePortfolioWatchStatus(item.status || defaults.status || "watch");
  return {
    code,
    name: String(item.name || defaults.name || "").trim(),
    shareClass: String(item.shareClass || defaults.shareClass || "").trim().toUpperCase(),
    type: String(item.type || defaults.type || "").trim(),
    status,
    priority: normalizePortfolioWatchPriority(item.priority ?? defaults.priority ?? 3),
    candidateRole: String(item.candidateRole || defaults.candidateRole || "").trim(),
    reason: String(item.reason || defaults.reason || "").trim().slice(0, 1200),
    setupEvidence: normalizeStringArray(item.setupEvidence || defaults.setupEvidence).slice(0, 8),
    buyTriggers: normalizeStringArray(item.buyTriggers || defaults.buyTriggers).slice(0, 8),
    riskNotes: normalizeStringArray(item.riskNotes || defaults.riskNotes).slice(0, 8),
    feeNotes: normalizeStringArray(item.feeNotes || defaults.feeNotes).slice(0, 8),
    positionPlan: String(item.positionPlan || defaults.positionPlan || "").trim().slice(0, 600),
    reviewDate: String(item.reviewDate || defaults.reviewDate || "").trim().slice(0, 80),
    dataBasis: normalizeStringArray(item.dataBasis || defaults.dataBasis).slice(0, 8),
    source: String(item.source || defaults.source || "").trim().slice(0, 120),
    sourceRunId: String(item.sourceRunId || defaults.sourceRunId || "").trim().slice(0, 80),
    alternativeShareClasses: normalizePortfolioWatchAlternatives(item.alternativeShareClasses || defaults.alternativeShareClasses).slice(0, 8),
    sameExposureAlternatives: normalizePortfolioWatchAlternatives(item.sameExposureAlternatives || defaults.sameExposureAlternatives).slice(0, 8),
    lastSnapshot: item.lastSnapshot || defaults.lastSnapshot || null,
    addedAt: String(item.addedAt || defaults.addedAt || now),
    updatedAt: String(item.updatedAt || defaults.updatedAt || now)
  };
}

function normalizePortfolioWatchAlternatives(value) {
  const input = Array.isArray(value) ? value : [];
  const byCode = new Map();
  for (const item of input) {
    const code = String(item?.code || "").match(/^\d{6}$/)?.[0] || "";
    if (!code || byCode.has(code)) continue;
    byCode.set(code, {
      code,
      name: String(item.name || "").trim(),
      shareClass: String(item.shareClass || "").trim().toUpperCase(),
      type: String(item.type || "").trim(),
      status: item.status ? normalizePortfolioWatchStatus(item.status) : "",
      statusText: item.statusText || (item.status ? formatPortfolioWatchStatus(item.status) : ""),
      priority: item.priority === undefined || item.priority === null || item.priority === "" ? null : normalizePortfolioWatchPriority(item.priority),
      reason: String(item.reason || "").trim().slice(0, 260),
      feeNotes: normalizeStringArray(item.feeNotes).slice(0, 3),
      riskNotes: normalizeStringArray(item.riskNotes).slice(0, 3),
      source: String(item.source || "").trim().slice(0, 120),
      updatedAt: String(item.updatedAt || "").trim()
    });
  }
  return [...byCode.values()];
}

function consolidatePortfolioWatchlistAlternatives(items = []) {
  const active = (items || []).filter((item) => item?.status !== "removed");
  const removed = (items || []).filter((item) => item?.status === "removed");
  const byProduct = consolidatePortfolioWatchlistByKey(active, getPortfolioWatchProductKey, "alternativeShareClasses", "watchlist_product_consolidation");
  const byExposure = consolidatePortfolioWatchlistByKey(byProduct, getPortfolioWatchExposureKey, "sameExposureAlternatives", "watchlist_exposure_consolidation");
  return [...byExposure, ...removed];
}

function consolidatePortfolioWatchlistByKey(items = [], keyFn, field, sourceLabel) {
  const groups = new Map();
  const passthrough = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key) {
      passthrough.push(item);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const consolidated = [];
  for (const group of groups.values()) {
    if (group.length <= 1) {
      consolidated.push(group[0]);
      continue;
    }
    const sorted = [...group].sort(comparePortfolioWatchPrimaryCandidate);
    const primary = sorted[0];
    const alternatives = sorted.slice(1).map(buildPortfolioWatchAlternative);
    consolidated.push({
      ...primary,
      [field]: mergePortfolioWatchAlternatives(primary[field], alternatives),
      dataBasis: mergeStringLists(primary.dataBasis, [`来源：${sourceLabel}`]),
      riskNotes: mergeStringLists(
        primary.riskNotes,
        field === "alternativeShareClasses"
          ? ["同一基金不同份额已归并为替代份额，主列表只保留最可操作的一只。"]
          : ["同一指数/同主题暴露已归并为同类替代，避免重复占用自选池名额。"]
      )
    });
  }
  return [...passthrough, ...consolidated];
}

function comparePortfolioWatchPrimaryCandidate(a = {}, b = {}) {
  return portfolioWatchStatusRank(a.status) - portfolioWatchStatusRank(b.status)
    || Number(a.priority || 3) - Number(b.priority || 3)
    || portfolioWatchShareClassRank(a.shareClass) - portfolioWatchShareClassRank(b.shareClass)
    || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
}

function portfolioWatchStatusRank(status) {
  const ranks = {
    in_position: 0,
    ready: 1,
    waiting_pullback: 2,
    watch: 3,
    blocked: 5,
    removed: 9
  };
  return ranks[status] ?? 4;
}

function portfolioWatchShareClassRank(shareClass) {
  const ranks = { C: 0, E: 1, I: 1, A: 2, B: 3, D: 3 };
  return ranks[String(shareClass || "").toUpperCase()] ?? 4;
}

function buildPortfolioWatchAlternative(item = {}) {
  return {
    code: item.code || "",
    name: item.name || "",
    shareClass: item.shareClass || "",
    type: item.type || "",
    status: item.status || "",
    statusText: formatPortfolioWatchStatus(item.status),
    priority: item.priority || null,
    reason: item.reason || "",
    feeNotes: item.feeNotes || [],
    riskNotes: item.riskNotes || [],
    source: item.source || "",
    updatedAt: item.updatedAt || ""
  };
}

function mergePortfolioWatchAlternatives(...groups) {
  return normalizePortfolioWatchAlternatives(groups.flat()).slice(0, 8);
}

function getPortfolioWatchProductKey(item = {}) {
  return getCandidateProductKey(item);
}

function getPortfolioWatchExposureKey(item = {}) {
  return getCandidateExposureKey(item);
}

function normalizePortfolioWatchStatus(value) {
  const raw = String(value || "watch").trim().toLowerCase();
  const aliases = {
    buy: "ready",
    buyable: "ready",
    ready_to_buy: "ready",
    staged_buy: "ready",
    wait: "waiting_pullback",
    waiting: "waiting_pullback",
    wait_pullback: "waiting_pullback",
    hold_observe: "watch",
    avoid: "blocked",
    avoid_now: "blocked",
    reject: "blocked",
    remove: "removed",
    deleted: "removed",
    bought: "in_position",
    holding: "in_position"
  };
  const status = aliases[raw] || raw;
  return ["ready", "waiting_pullback", "watch", "blocked", "in_position", "removed"].includes(status)
    ? status
    : "watch";
}

function normalizePortfolioWatchPriority(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

function normalizePortfolioWatchlistUpdates(value) {
  const input = Array.isArray(value) ? value : [];
  return input
    .map((item) => {
      const code = String(item?.code || "").match(/^\d{6}$/)?.[0] || "";
      if (!code) return null;
      return {
        operation: normalizePortfolioWatchOperation(item.operation || item.updateAction || item.action || "UPSERT"),
        code,
        name: String(item.name || "").trim(),
        shareClass: String(item.shareClass || "").trim().toUpperCase(),
        type: String(item.type || "").trim(),
        status: item.status ? normalizePortfolioWatchStatus(item.status) : "",
        priority: item.priority === undefined || item.priority === null || item.priority === ""
          ? null
          : normalizePortfolioWatchPriority(item.priority),
        candidateRole: String(item.candidateRole || "").trim(),
        reason: String(item.reason || "").trim(),
        setupEvidence: normalizeStringArray(item.setupEvidence).slice(0, 8),
        buyTriggers: normalizeStringArray(item.buyTriggers).slice(0, 8),
        riskNotes: normalizeStringArray(item.riskNotes).slice(0, 8),
        feeNotes: normalizeStringArray(item.feeNotes).slice(0, 8),
        positionPlan: String(item.positionPlan || "").trim(),
        reviewDate: String(item.reviewDate || "").trim(),
        dataBasis: normalizeStringArray(item.dataBasis).slice(0, 8),
        alternativeShareClasses: normalizePortfolioWatchAlternatives(item.alternativeShareClasses).slice(0, 8),
        sameExposureAlternatives: normalizePortfolioWatchAlternatives(item.sameExposureAlternatives).slice(0, 8),
        source: String(item.source || "").trim()
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizePortfolioWatchOperation(value) {
  const text = String(value || "UPSERT").trim().toUpperCase();
  if (["REMOVE", "DELETE", "DROP"].includes(text)) return "REMOVE";
  return "UPSERT";
}

function buildPortfolioWatchlistUpdatesFromActions(actions = []) {
  return (actions || [])
    .filter((action) => action?.code && ["BUY", "WATCH", "HOLD", "SELL"].includes(action.action))
    .map((action) => {
      const status = inferPortfolioWatchStatusFromAction(action);
      return {
        operation: "UPSERT",
        code: action.code,
        name: action.name || "",
        status,
        priority: status === "ready" ? 1 : status === "waiting_pullback" ? 2 : status === "blocked" ? 5 : 3,
        candidateRole: action.action === "BUY"
          ? "已触发买入候选"
          : action.action === "WATCH"
            ? "自选观察候选"
            : action.action === "SELL"
              ? "卖出后复查候选"
              : "持仓复查候选",
        reason: action.reason || "",
        setupEvidence: [action.rotationCheck, action.positionCheck].filter(Boolean),
        buyTriggers: action.action === "WATCH" ? [action.riskControl].filter(Boolean) : [],
        riskNotes: [action.chaseRisk, action.riskControl].filter(Boolean),
        feeNotes: [action.feeCheck].filter(Boolean),
        positionPlan: action.targetWeightPct
          ? `触发后目标仓位约 ${action.targetWeightPct}%。`
          : action.amount
            ? `触发后先观察 ${action.amount} 元级别试探。`
            : "",
        dataBasis: action.dataBasis || [],
        source: "portfolio_action"
      };
    });
}

async function fetchPortfolioWatchlistSeedCandidates(marketSnapshot, watchlist = []) {
  if (String(process.env.PORTFOLIO_WATCHLIST_SEED_ENABLED ?? "true") === "false") {
    return [];
  }
  const activeWatchlist = getActivePortfolioWatchlist({ watchlist });
  const targetSize = Math.max(0, finiteNumberOr(process.env.PORTFOLIO_WATCHLIST_TARGET_SIZE, 10));
  const deficit = targetSize - activeWatchlist.filter((item) => !["blocked", "removed"].includes(item.status)).length;
  if (deficit <= 0) return [];

  const userText = "回调完成 低位 准备启动 基金";
  const themeRadar = Array.isArray(marketSnapshot?.themeRadar) ? marketSnapshot.themeRadar : [];
  const candidates = await fetchPullbackSetupCandidates(userText, marketSnapshot, themeRadar);
  return selectPortfolioWatchlistSeedCandidates(candidates, activeWatchlist, themeRadar, {
    limit: Math.min(deficit, finiteNumberOr(process.env.PORTFOLIO_WATCHLIST_SEED_LIMIT, 6))
  });
}

function selectPortfolioWatchlistSeedCandidates(candidates = [], watchlist = [], themeRadar = [], options = {}) {
  const activeCodes = new Set(normalizePortfolioWatchlist(watchlist)
    .filter((item) => item.status !== "removed")
    .map((item) => item.code));
  const minScore = finiteNumberOr(options.minScore ?? process.env.PORTFOLIO_WATCHLIST_SEED_MIN_SCORE, 52);
  const limit = Math.max(0, finiteNumberOr(options.limit ?? process.env.PORTFOLIO_WATCHLIST_SEED_LIMIT, 6));
  if (!limit) return [];

  const scored = (candidates || [])
    .filter((candidate) => candidate?.code && !activeCodes.has(candidate.code))
    .map((candidate) => {
      const matchedThemes = candidate.matchedThemes?.length ? candidate.matchedThemes : matchCandidateThemes(candidate, themeRadar);
      const enriched = { ...candidate, matchedThemes };
      return {
        ...enriched,
        portfolioWatchlistSeedScore: round(scorePullbackSetupSeedCandidate(enriched, themeRadar, "回调完成 低位 准备启动 基金"), 1)
      };
    })
    .filter((candidate) =>
      Number(candidate.portfolioWatchlistSeedScore || 0) >= minScore
      && !isPortfolioWatchlistChaseSeed(candidate)
    )
    .sort((a, b) => {
      const scoreDiff = Number(b.portfolioWatchlistSeedScore || 0) - Number(a.portfolioWatchlistSeedScore || 0);
      if (scoreDiff) return scoreDiff;
      return Number(isLowBaseLaunchWatchSeed(b)) - Number(isLowBaseLaunchWatchSeed(a));
    });

  return selectDiversifiedDeepDiveCandidates(scored, limit, { diversifyExposure: true });
}

function finiteNumberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isPortfolioWatchlistChaseSeed(candidate = {}) {
  const oneWeek = toNumber(candidate.oneWeekPct);
  const oneMonth = toNumber(candidate.oneMonthPct);
  const threeMonth = toNumber(candidate.threeMonthPct);
  const sixMonth = toNumber(candidate.sixMonthPct);
  if (Number.isFinite(oneWeek) && oneWeek > 7) return true;
  if (Number.isFinite(oneMonth) && oneMonth > 12) return true;
  if (Number.isFinite(threeMonth) && threeMonth > 25) return true;
  if (Number.isFinite(sixMonth) && sixMonth > 45) return true;
  return (candidate.matchedThemes || []).some((theme) =>
    theme.positionSignal === "high_chase_risk" || theme.stage === "crowded"
  );
}

function isLowBaseLaunchWatchSeed(candidate = {}) {
  const text = [
    candidate.name || "",
    candidate.type || "",
    candidate.candidateRole || "",
    candidate.reason || "",
    candidate.positionPlan || "",
    candidate.setupDiscoverySource || "",
    candidate.source || "",
    ...(candidate.discoverySources || []),
    ...(candidate.keywords || []),
    ...(candidate.setupEvidence || []),
    ...(candidate.dataBasis || [])
  ].join(" ");
  return /低位启动前夜候选|low_base_turn_scan/.test(text);
}

function formatPortfolioWatchSeedKind(candidate = {}) {
  if (isLowBaseLaunchWatchSeed(candidate)) return "低位启动前夜候选";
  const text = `${candidate.name || ""} ${(candidate.keywords || []).join(" ")} ${candidate.setupDiscoverySource || ""}`;
  if (/近1周低位转强候选|weekly_reversal_scan/.test(text)) return "近1周低位转强候选";
  return "低位回调召回候选";
}

function formatPortfolioWatchSeedCandidateRole(status, seedKind) {
  if (status === "blocked") return "追涨风险拦截候选";
  if (status === "ready") {
    return seedKind === "低位启动前夜候选" ? "净值验证低位启动前夜备选" : "净值验证低位启动备选";
  }
  return seedKind === "低位启动前夜候选" ? "低位启动前夜观察备选" : "回调观察备选";
}

function buildPortfolioWatchlistUpdatesFromSeedCandidates(candidates = [], options = {}) {
  const profiles = Array.isArray(options) ? options : options.profiles || [];
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  return (candidates || []).map((candidate) => {
    const profile = profileByCode.get(candidate.code) || null;
    const shareClass = profile?.fees?.shareClass || profile?.shareClass || candidate.shareClass || inferFundShareClass(candidate.name || "");
    const feeModel = profile?.fees?.shareClassFeeModel || profile?.shareClassFeeModel || candidate.shareClassFeeModel || inferShareClassFeeModel(shareClass, {
      sourceRatePct: candidate.sourceRatePct || "",
      currentRatePct: candidate.currentRatePct || "",
      salesServiceFeePct: ""
    });
    const seedScore = Number(candidate.portfolioWatchlistSeedScore || scorePullbackSetupSeedCandidate(candidate, candidate.matchedThemes || [], "回调完成 低位 准备启动 基金"));
    const status = inferPortfolioWatchStatusFromSeedCandidate(candidate, seedScore, profile);
    const themeEvidence = formatPortfolioSeedThemeEvidence(candidate);
    const returnEvidence = formatPortfolioSeedReturnEvidence(candidate);
    const verifiedTrendEvidence = formatPortfolioSeedVerifiedTrendEvidence(profile);
    const statusReason = formatPortfolioSeedStatusReason(status, profile);
    const oneYearFeeCost = toNumber(profile?.fees?.feeImpact?.oneYearCostPer10000);
    const seedKind = formatPortfolioWatchSeedKind(candidate);
    return {
      operation: "UPSERT",
      code: candidate.code,
      name: profile?.name || candidate.name || "",
      shareClass,
      type: candidate.type || profile?.type || "",
      status,
      priority: scorePortfolioWatchSeedPriority(seedScore, status, seedKind),
      candidateRole: formatPortfolioWatchSeedCandidateRole(status, seedKind),
      reason: [
        `系统低位回调召回评分 ${round(seedScore, 1)}。`,
        `召回定位：${seedKind}。`,
        statusReason,
        returnEvidence || "短期收益结构待复核。",
        verifiedTrendEvidence,
        themeEvidence || "题材轮动信号待复核。"
      ].filter(Boolean).join(" "),
      setupEvidence: [
        `召回定位：${seedKind}`,
        verifiedTrendEvidence,
        returnEvidence,
        themeEvidence,
        ...(candidate.keywords || []).slice(0, 3).map((keyword) => `召回标签：${keyword}`)
      ].filter(Boolean),
      buyTriggers: [
        "后续5日/10日继续温和转强，且近20日涨幅不超过10%。",
        "主题不进入拥挤状态，120日低位或距高点回撤证据得到净值下钻确认。",
        "费用和份额类别适合计划持有期后，再小仓位分批。"
      ],
      riskNotes: [
        profile?.trendProfile?.ok
          ? "候选已做净值下钻，但仍需在下一次盘前观察复核是否继续低位转强。"
          : "候选来自公开排行和搜索召回，缺少可用净值下钻时不能标记为可买。",
        status === "blocked" ? "净值下钻显示偏热、等待回撤或缺少低位证据，已拦截为非买入候选。" : "",
        "如果近1周或近1月涨幅突然扩大，降级为等待回调，避免追涨。"
      ].filter(Boolean),
      feeNotes: [
        feeModel?.label || "份额类别和费率待基金详情页复核。",
        Number.isFinite(oneYearFeeCost)
          ? `估算持有1年每万元费用约 ${round(oneYearFeeCost, 0)} 元。`
          : ""
      ].filter(Boolean),
      positionPlan: status === "ready"
        ? "触发后先作为卫星仓小额分批，不直接重仓。"
        : status === "blocked"
          ? "暂不买入；只有重新回到低位、回撤完成并消化追涨风险后才复核。"
          : seedKind === "低位启动前夜候选"
            ? "先放入启动前夜观察池；只等净值下钻确认回调完成、低位和早期转强后小额分批。"
            : "先放入观察池，等待回调完成和走势确认。",
      reviewDate: "下一次盘前观察或每日决策复核",
      dataBasis: [
        candidate.setupDiscoverySource ? `召回来源：${candidate.setupDiscoverySource}` : "",
        candidate.source || "",
        profile?.sources?.[0] ? `净值下钻来源：${profile.sources[0]}` : "",
        returnEvidence
      ].filter(Boolean),
      source: "deterministic_pullback_recall"
    };
  });
}

function buildPortfolioWatchlistUpdatesFromAnswerProfiles(profiles = [], options = {}) {
  const input = Array.isArray(profiles) ? profiles : [profiles].filter(Boolean);
  const userText = String(options.userText || "").trim();
  const answerText = String(options.answerText || "").trim();
  const source = String(options.source || "fund_answer_watchlist").trim() || "fund_answer_watchlist";
  const seen = new Set();
  return input
    .map((profile) => {
      const code = String(profile?.code || profile?.seed?.code || "").match(/^\d{6}$/)?.[0] || "";
      if (!code || seen.has(code)) return null;
      seen.add(code);
      const context = extractAnswerWatchlistProfileContext(answerText, profile);
      const role = inferAnswerWatchlistRole(profile, context);
      const rejectedByAnswer = isAnswerWatchlistRejectedContext(context);
      const status = rejectedByAnswer ? "blocked" : inferPortfolioWatchStatusFromAnswerProfile(profile, role);
      const trendEvidence = formatPortfolioSeedVerifiedTrendEvidence(profile);
      const shareClass = profile?.fees?.shareClass || profile?.shareClass || profile?.seed?.shareClass || inferFundShareClass(profile?.name || profile?.seed?.name || "");
      const feeModel = profile?.fees?.shareClassFeeModel || profile?.shareClassFeeModel || profile?.seed?.shareClassFeeModel || inferShareClassFeeModel(shareClass, profile?.fees || {});
      const oneYearFeeCost = toNumber(profile?.fees?.feeImpact?.oneYearCostPer10000);
      const answerRole = rejectedByAnswer ? "暂不买入/排除" : role === "backup" ? "备选观察" : "买入参考";
      const originLabel = formatAnswerWatchlistSourceLabel(source);
      const statusReason = rejectedByAnswer
        ? "回答中明确写了暂不买入、回避或排除，系统写入暂不买入而不是可买。"
        : formatAnswerWatchlistStatusReason(status, role);
      const gapEvidence = formatAnswerWatchlistGapEvidence(profile, {
        status,
        role,
        userText,
        context
      });
      return {
        operation: "UPSERT",
        code,
        name: profile.name || profile.seed?.name || "",
        shareClass,
        type: profile.type || profile.seed?.type || "",
        status,
        priority: scoreAnswerWatchPriority(status, role),
        candidateRole: rejectedByAnswer
          ? `${originLabel}排除候选`
          : role === "backup" ? `${originLabel}备选观察候选` : `${originLabel}主推荐候选`,
        reason: [
          `${originLabel}沉淀：本次回答将其列为${answerRole}。`,
          statusReason,
          gapEvidence,
          trendEvidence,
          userText ? `用户原始需求：${userText.slice(0, 80)}` : ""
        ].filter(Boolean).join(" "),
        setupEvidence: [
          `回答角色：${answerRole}`,
          gapEvidence,
          trendEvidence,
          profile.actionability?.action ? `自评动作：${formatActionabilityAction(profile.actionability.action)}${profile.actionability.allocationBand ? ` ${profile.actionability.allocationBand}` : ""}` : "",
          Number.isFinite(Number(profile.trendProfile?.lowPositionPct120)) ? `120日位置${round(Number(profile.trendProfile.lowPositionPct120), 1)}%` : ""
        ].filter(Boolean),
        buyTriggers: buildAnswerWatchBuyTriggers(status, role),
        riskNotes: [...buildAnswerWatchRiskNotes(status, profile), gapEvidence].filter(Boolean),
        feeNotes: [
          feeModel?.label || "份额类别和费率待基金详情页复核。",
          Number.isFinite(oneYearFeeCost) ? `估算持有1年每万元费用约 ${round(oneYearFeeCost, 0)} 元。` : ""
        ].filter(Boolean),
        positionPlan: formatAnswerWatchPositionPlan(status, role),
        reviewDate: "下一次盘前观察或用户复问时复查",
        dataBasis: [
          `来源：${source}`,
          `来自本次回答的${answerRole}候选`,
          profile.sources?.[0] ? `资料源：${profile.sources[0]}` : ""
        ].filter(Boolean),
        source
      };
    })
    .filter(Boolean);
}

function selectFundScreeningWatchlistProfiles(profiles = [], answerText = "", userText = "") {
  if (String(process.env.PORTFOLIO_SCREENING_WATCHLIST_ENABLED ?? "true") === "false") return [];
  const input = Array.isArray(profiles) ? profiles : [profiles].filter(Boolean);
  if (!input.length) return [];
  const actionSeeking = isActionSeekingFundQuestion(userText)
    || isPullbackSetupRequest(userText)
    || /(买入|分批|持有|观察|备选|等待|回避|不买|换基|加仓|减仓|止盈|止损)/.test(String(answerText || ""));
  if (!actionSeeking) return [];
  return input
    .filter((profile) => profile?.code && profile.trendProfile?.ok)
    .map((profile) => {
      const context = extractAnswerWatchlistProfileContext(answerText, profile);
      return {
        ...profile,
        reportChartRole: inferAnswerWatchlistRole(profile, context) === "backup" ? "备选观察图" : "买入参考图"
      };
    });
}

function extractAnswerWatchlistProfileContext(answerText = "", profile = {}) {
  const body = String(answerText || "");
  if (!body.trim()) return "";
  const code = profile?.code || profile?.seed?.code || "";
  const name = profile?.name || profile?.seed?.name || "";
  const codeIndex = code ? body.indexOf(code) : -1;
  const nameIndex = name ? body.indexOf(name) : -1;
  const indexes = [codeIndex, nameIndex].filter((index) => index >= 0).sort((a, b) => a - b);
  if (!indexes.length) return "";
  return extractFundChartContext(body, code, name, indexes[0]);
}

function inferAnswerWatchlistRole(profile = {}, context = "") {
  if (profile.reportChartRole === "备选观察图") return "backup";
  const text = String(context || "");
  if (/(备选|观察|只观察|等待|等回撤|等回调|回踩|可关注|接近可买)/.test(text)) return "backup";
  return "buy_reference";
}

function isAnswerWatchlistRejectedContext(context = "") {
  const text = String(context || "");
  if (!text.trim()) return false;
  return /(回避|剔除|排除|不推荐|不作为主推荐|不是主推|暂不买|暂不加仓|不买|追涨|偏热|过热|不符合|风险偏高)/.test(text);
}

function formatAnswerWatchlistSourceLabel(source = "") {
  if (source === "fund_screening_answer") return "具体基金分析";
  if (source === "fund_recommendation_answer") return "基金推荐回答";
  if (source === "fund_qa_answer") return "基金问答";
  return "用户问答";
}

function buildPortfolioWatchlistRecheckUpdates(watchlist = [], options = {}) {
  const profiles = Array.isArray(options) ? options : options.profiles || [];
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  return normalizePortfolioWatchlist(watchlist)
    .filter((item) => ["ready", "waiting_pullback"].includes(item.status))
    .map((item) => {
      const freshProfile = profileByCode.get(item.code) || null;
      const profile = freshProfile || item.lastSnapshot || null;
      if (!profile) return null;
      const score = item.status === "ready" ? 72 : 64;
      const inferredStatus = inferPortfolioWatchStatusFromSeedCandidate(item, score, profile);
      const freshness = evaluatePortfolioWatchlistFreshness({ ...item, status: inferredStatus }, profile, {
        ignoreReviewAge: Boolean(freshProfile)
      });
      const status = inferredStatus === "ready" && !freshness.ok ? "waiting_pullback" : inferredStatus;
      const trendEvidence = formatPortfolioSeedVerifiedTrendEvidence(profile);
      const freshnessNotes = freshness.issues.map((issue) => `系统时效复核：${issue}`);
      return {
        operation: "UPSERT",
        code: item.code,
        name: item.name || profile?.name || "",
        shareClass: item.shareClass || profile?.fees?.shareClass || profile?.shareClass || "",
        type: item.type || profile?.type || "",
        status,
        priority: status === "ready" ? Math.min(Number(item.priority || 2), 2) : status === "blocked" ? 5 : Math.max(Number(item.priority || 3), 3),
        candidateRole: item.candidateRole || (status === "ready" ? "每日复核接近可买候选" : "每日复核等待回调候选"),
        reason: [
          `系统每日复核自选池：${formatPortfolioWatchStatus(item.status)} -> ${formatPortfolioWatchStatus(status)}。`,
          formatPortfolioSeedStatusReason(status, profile),
          ...freshnessNotes,
          trendEvidence,
          item.reason || ""
        ].filter(Boolean).join(" "),
        setupEvidence: mergeStringLists(item.setupEvidence, [trendEvidence]),
        buyTriggers: mergeStringLists(item.buyTriggers, buildAnswerWatchBuyTriggers(status, item.status === "waiting_pullback" ? "backup" : "buy_reference")),
        riskNotes: mergeStringLists(item.riskNotes, buildAnswerWatchRiskNotes(status, profile), freshnessNotes),
        feeNotes: item.feeNotes || [],
        positionPlan: item.positionPlan || formatAnswerWatchPositionPlan(status, item.status === "waiting_pullback" ? "backup" : "buy_reference"),
        reviewDate: freshness.ok ? "本次每日决策已复核，下一次盘前继续确认" : "需重新下钻刷新净值后再评估买入",
        dataBasis: mergeStringLists(item.dataBasis, ["来源：decision_watchlist_recheck", "来源：watchlist_freshness_guard", trendEvidence]),
        source: "decision_watchlist_recheck"
      };
    })
    .filter(Boolean);
}

function buildPortfolioDecisionReadinessQueue(watchlist = [], profiles = []) {
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  return normalizePortfolioWatchlist(watchlist)
    .filter((item) => ["ready", "waiting_pullback"].includes(item.status))
    .map((item) => {
      const profile = profileByCode.get(item.code) || item.lastSnapshot || null;
      const readiness = evaluatePortfolioWatchReadiness(item, profile);
      return {
        code: item.code,
        name: item.name,
        status: item.status,
        priority: item.priority,
        readinessScore: readiness.score,
        readinessLabel: readiness.label,
        reason: item.reason,
        firstTrigger: item.buyTriggers?.[0] || "",
        firstRisk: item.riskNotes?.[0] || "",
        positionPlan: item.positionPlan || "",
        trendEvidence: profile ? formatPortfolioSeedVerifiedTrendEvidence(profile) : item.lastSnapshot?.trendSummary || "",
        readinessGaps: readiness.gaps,
        feeNotes: item.feeNotes || [],
        reviewDate: item.reviewDate || ""
      };
    })
    .sort(comparePortfolioWatchReadiness)
    .slice(0, 8);
}

function buildPortfolioHeldPositionReviewQueue(positions = [], profiles = []) {
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  return (positions || [])
    .filter((position) => position?.code && Number(position.currentValue || 0) > 0)
    .slice(0, 12)
    .map((position) => {
      const profile = profileByCode.get(position.code) || position.fundSnapshot || null;
      const riskReview = buildPortfolioHeldPositionRiskReview(position, profile);
      return {
        code: position.code,
        name: position.name || profile?.name || "",
        currentValue: round(Number(position.currentValue || 0), 2),
        weightPct: round(Number(position.weightPct || 0), 2),
        unrealizedPnlPct: round(Number(position.unrealizedPnlPct || 0), 2),
        trendEvidence: profile ? formatPortfolioSeedVerifiedTrendEvidence(profile) : position.fundSnapshot?.trendSummary || "",
        riskReview,
        firstRisk: riskReview[0] || "",
        reduceTrigger: inferPortfolioHeldPositionReduceTrigger(riskReview),
        feeEvidence: profile ? formatPortfolioFeeVerificationEvidence(profile) : "",
        reviewSource: "held_position_review_queue"
      };
    });
}

function buildPortfolioHeldPositionRiskReview(position = {}, profile = null) {
  const trend = profile?.trendProfile || position.fundSnapshot?.trendProfile || {};
  const actionability = profile?.actionability || position.fundSnapshot?.actionability || {};
  const review = [];
  if (!profile || !trend.ok) {
    review.push("缺少当前净值/走势复核，不能默认放任持仓。");
    return review;
  }
  if (trend.trendLabel === "breakdown") review.push("趋势破位，需评估减仓或止损。");
  if (trend.trendLabel === "weakening") review.push("趋势转弱，需降低仓位或收紧复查。");
  if (trend.trendLabel === "extended_uptrend" || trend.entryBias === "wait_pullback") review.push("短期偏热或等待回撤，需防止利润回吐。");
  const return20d = finiteMetricNumber(trend.return20dPct);
  const drawdown = finiteMetricNumber(trend.drawdownFromRecentHighPct);
  if (Number.isFinite(return20d) && return20d > 12) review.push(`近20日${formatFallbackPct(return20d)}，需要止盈/减仓边界。`);
  if (Number.isFinite(drawdown) && drawdown <= -10) review.push(`距高点${formatFallbackPct(drawdown)}，回撤扩大需复核止损。`);
  if (actionability.action === "avoid") review.push("可操作性已转为回避，不能继续无条件持有。");
  if (actionability.action === "wait") review.push("可操作性偏等待，暂不加仓并设置复查。");
  if (!review.length) review.push("持仓走势未触发减仓警报，继续按纪律持有。");
  return review;
}

function inferPortfolioHeldPositionReduceTrigger(riskReview = []) {
  const text = (riskReview || []).join("；");
  if (/破位|止损|回避/.test(text)) return "若下一次复核仍破位或可操作性回避，优先减仓。";
  if (/转弱|回撤扩大/.test(text)) return "若20日/60日继续转弱或距高点回撤扩大，减仓观察。";
  if (/偏热|等待回撤|止盈/.test(text)) return "若短期继续冲高后量能转弱，分批止盈或降仓。";
  return "维持持仓，但下一次每日决策仍需逐只复核。";
}

function buildPortfolioReadyWatchlistReviewActions(watchlist = [], existingActions = [], options = {}) {
  const profiles = Array.isArray(options) ? options : options.profiles || [];
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  const existingCodes = new Set((existingActions || []).map((action) => action.code).filter(Boolean));
  return normalizePortfolioWatchlist(watchlist)
    .filter((item) => item.status === "ready" && item.code && !existingCodes.has(item.code))
    .slice(0, 5)
    .map((item) => {
      const profile = profileByCode.get(item.code) || item.lastSnapshot || null;
      const trendEvidence = profile ? formatPortfolioSeedVerifiedTrendEvidence(profile) : item.lastSnapshot?.trendSummary || "";
      return {
        action: "WATCH",
        code: item.code,
        name: item.name || profile?.name || "",
        amount: 0,
        targetWeightPct: 0,
        reason: "系统补充复查动作：接近可买自选候选未被模型逐项评估，本轮先列入观察，不允许静默遗漏。",
        dataBasis: ["来源：ready_watchlist_review_fallback", trendEvidence, item.reason].filter(Boolean),
        rotationCheck: item.setupEvidence?.[0] || trendEvidence || "等待轮动/低位证据复查。",
        positionCheck: trendEvidence || "等待净值复核。",
        chaseRisk: item.riskNotes?.[0] || "若短期涨幅扩大，继续等待回撤，不能追涨。",
        feeCheck: item.feeNotes?.[0] || "份额和费用待复核。",
        riskControl: item.buyTriggers?.[0] || "下一次盘前继续复查买入触发条件。"
      };
    });
}

function buildPortfolioHeldPositionReviewActions(positions = [], existingActions = [], options = {}) {
  const profiles = Array.isArray(options) ? options : options.profiles || [];
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  const existingCodes = new Set((existingActions || []).map((action) => action.code).filter(Boolean));
  return (positions || [])
    .filter((position) => position?.code && Number(position.currentValue || 0) > 0 && !existingCodes.has(position.code))
    .slice(0, 8)
    .map((position) => {
      const profile = profileByCode.get(position.code) || position.fundSnapshot || null;
      const trendEvidence = profile ? formatPortfolioSeedVerifiedTrendEvidence(profile) : position.fundSnapshot?.trendSummary || "";
      const riskReview = buildPortfolioHeldPositionRiskReview(position, profile);
      return {
        action: "HOLD",
        code: position.code,
        name: position.name || profile?.name || "",
        amount: 0,
        targetWeightPct: round(Number(position.weightPct || 0), 2),
        reason: "系统补充持仓复查动作：已有持仓未被模型逐项评估，本轮先按纪律持有，不允许静默遗漏。",
        dataBasis: ["来源：held_position_review_fallback", trendEvidence, ...riskReview.slice(0, 2)].filter(Boolean),
        rotationCheck: riskReview[0] || "持仓轮动状态待复核。",
        positionCheck: trendEvidence || "等待净值复核。",
        chaseRisk: riskReview.find((item) => /偏热|回撤|破位|转弱|回避/.test(item)) || "未触发主要持仓风险警报。",
        feeCheck: profile ? formatPortfolioFeeVerificationEvidence(profile) : "份额和费用待复核。",
        riskControl: inferPortfolioHeldPositionReduceTrigger(riskReview)
      };
    });
}

function ensurePortfolioReadyWatchlistReviewed(decision, watchlist = [], options = {}) {
  const normalized = {
    ...decision,
    actions: normalizePortfolioActions(decision?.actions),
    watchlistUpdates: normalizePortfolioWatchlistUpdates(decision?.watchlistUpdates),
    team: Array.isArray(decision?.team) ? decision.team : [],
    riskNotes: Array.isArray(decision?.riskNotes) ? decision.riskNotes : [],
    learningNotes: Array.isArray(decision?.learningNotes) ? decision.learningNotes : [],
    sources: Array.isArray(decision?.sources) ? decision.sources : []
  };
  const fallbackActions = buildPortfolioReadyWatchlistReviewActions(watchlist, normalized.actions, options);
  if (!fallbackActions.length) return normalized;
  return {
    ...normalized,
    actions: [...normalized.actions, ...fallbackActions],
    learningNotes: mergeStringLists(
      normalized.learningNotes,
      [`系统补充了 ${fallbackActions.length} 条接近可买自选候选复查动作，防止每日决策遗漏购买准备队列。`]
    ),
    sources: mergeStringLists(normalized.sources, ["ready_watchlist_review_fallback"])
  };
}

function ensurePortfolioHeldPositionsReviewed(decision, positions = [], options = {}) {
  const normalized = {
    ...decision,
    actions: normalizePortfolioActions(decision?.actions),
    watchlistUpdates: normalizePortfolioWatchlistUpdates(decision?.watchlistUpdates),
    team: Array.isArray(decision?.team) ? decision.team : [],
    riskNotes: Array.isArray(decision?.riskNotes) ? decision.riskNotes : [],
    learningNotes: Array.isArray(decision?.learningNotes) ? decision.learningNotes : [],
    sources: Array.isArray(decision?.sources) ? decision.sources : []
  };
  const fallbackActions = buildPortfolioHeldPositionReviewActions(positions, normalized.actions, options);
  if (!fallbackActions.length) return normalized;
  return {
    ...normalized,
    actions: [...normalized.actions, ...fallbackActions],
    learningNotes: mergeStringLists(
      normalized.learningNotes,
      [`系统补充了 ${fallbackActions.length} 条已有持仓复查动作，防止每日决策忽略仓位风险。`]
    ),
    sources: mergeStringLists(normalized.sources, ["held_position_review_fallback"])
  };
}

function inferPortfolioWatchStatusFromAnswerProfile(profile = {}, role = "buy_reference") {
  const seedScore = Math.max(60, Number(scoreResearchDigestForPullbackSetup(profile)) || 0);
  const seedStatus = inferPortfolioWatchStatusFromSeedCandidate(profile, seedScore, profile);
  if (seedStatus === "blocked") return "blocked";
  if (profile?.actionability?.action === "avoid" || profile?.trendProfile?.entryBias === "avoid_now") return "blocked";
  if (role === "backup") return seedStatus === "blocked" ? "blocked" : "waiting_pullback";
  if (seedStatus === "ready") return "ready";
  if (profile?.trendProfile?.entryBias === "wait_pullback" || profile?.actionability?.action === "wait") return "waiting_pullback";
  return "watch";
}

function formatAnswerWatchlistStatusReason(status, role) {
  if (status === "ready") return "净值和走势证据已满足低位回调/启动候选条件，可作为接近可买自选复核。";
  if (status === "blocked") return "系统复核识别到偏热、追涨或回避风险，写入暂不买入而不是可买。";
  if (status === "waiting_pullback") {
    return role === "backup"
      ? "回答中属于备选观察，必须等待触发条件满足后再升级。"
      : "暂未完全证明低位启动，先等待回调/确认。";
  }
  return "作为普通观察候选保留，等待更多数据确认。";
}

function formatAnswerWatchlistGapEvidence(profile = {}, options = {}) {
  const status = String(options.status || "");
  const role = String(options.role || "");
  const userText = String(options.userText || "");
  const context = String(options.context || "");
  const text = normalizeIntentText(`${userText} ${context}`);
  const shouldExplainGap = isPullbackSetupRequest(userText)
    || /(回调|回踩|回撤|低位|启动|追涨|备选|观察|等待)/.test(text);
  if (!shouldExplainGap) return "";

  const gaps = buildPullbackSetupCandidateGaps(profile);
  if (gaps.length) {
    return `观察缺口：${gaps.slice(0, 4).join("；")}。`;
  }
  if (status === "ready") {
    return "观察缺口：低位启动条件暂已满足，等待下一次净值确认。";
  }
  if (role === "backup") {
    return "观察缺口：回答定位为备选，仍需下一次盘前触发确认。";
  }
  return "";
}

function buildAnswerWatchBuyTriggers(status, role) {
  if (status === "blocked") {
    return ["重新回到低位、回撤消化且5日/10日温和转强后，才允许重新评估。"];
  }
  if (status === "ready") {
    return [
      "下一次净值更新后仍保持回调完成或启动前夜，且近20日涨幅不超过10%。",
      "主题没有进入拥挤/追涨状态，费用和份额类别适合计划持有期。"
    ];
  }
  return [
    role === "backup" ? "备选候选需等回踩确认或5日/10日重新转强。" : "等待低位和回调完成证据更完整。",
    "若近20日或近60日涨幅快速扩大，继续降级观察，避免追涨。"
  ];
}

function buildAnswerWatchRiskNotes(status, profile = {}) {
  const trend = profile.trendProfile || {};
  return [
    status === "blocked" ? "已被系统写入暂不买入，不能在执行方案中给买入金额。" : "",
    Number.isFinite(Number(trend.return20dPct)) ? `近20日${formatFallbackPct(trend.return20dPct)}，需防止短线过热。` : "",
    Number.isFinite(Number(trend.drawdownFromRecentHighPct)) ? `距近期高点${formatFallbackPct(trend.drawdownFromRecentHighPct)}，回撤深度需复查。` : "",
    "自选池只记录候选，不等同于自动下单。"
  ].filter(Boolean);
}

function formatAnswerWatchPositionPlan(status, role) {
  if (status === "ready") return "触发后只做卫星仓小额分批，先验证不追涨。";
  if (status === "blocked") return "暂不买入；只有重新形成低位启动证据后才复查。";
  if (role === "backup") return "先作为备选观察，不给买入金额，等待触发条件。";
  return "先观察，等回调完成和低位证据确认后再进入分批评估。";
}

function scoreAnswerWatchPriority(status, role) {
  if (status === "ready") return 1;
  if (status === "waiting_pullback" && role === "backup") return 3;
  if (status === "waiting_pullback") return 2;
  if (status === "blocked") return 5;
  return 4;
}

function persistAnswerWatchlistCandidates({ userText = "", answerText = "", chartProfiles = [], source = "fund_answer_watchlist" } = {}) {
  if (String(process.env.PORTFOLIO_ANSWER_WATCHLIST_ENABLED ?? "true") === "false") return [];
  const updates = buildPortfolioWatchlistUpdatesFromAnswerProfiles(chartProfiles, { userText, answerText, source });
  if (!updates.length) return [];
  try {
    const db = readPortfolioDb();
    ensurePortfolioAccount(db, getEffectiveConfig());
    const applied = applyPortfolioWatchlistUpdates(db, updates, {
      profiles: Array.isArray(chartProfiles) ? chartProfiles : [chartProfiles].filter(Boolean),
      source
    });
    if (applied.length) {
      writePortfolioDb(db);
      updateStats({
        counters: {
          answerWatchlistUpdates: 1,
          answerWatchlistCandidates: applied.length
        },
        last: { lastAnswerWatchlistUpdateAt: new Date().toISOString() }
      });
    }
    return applied;
  } catch (error) {
    console.warn("[answer-watchlist-update-error]", error.message);
    recordError(error, { answerWatchlistUpdateFailures: 1 });
    return [];
  }
}

function inferPortfolioWatchStatusFromSeedCandidate(candidate = {}, seedScore = 0, profile = null) {
  if (!profile || !profile.trendProfile?.ok) {
    return "waiting_pullback";
  }
  if (hasPortfolioVerifiedSeedChaseRisk(candidate, profile)) {
    return "blocked";
  }
  const verifiedReady = Number(seedScore) >= 60 && hasVerifiedPortfolioBuySetup(profile);
  if (verifiedReady) {
    return "ready";
  }
  return "waiting_pullback";
}

function hasVerifiedPortfolioBuySetup(profile = {}) {
  const trend = profile?.trendProfile || {};
  if (!trend.ok) return false;
  const signal = trend.pullbackSetup?.signal || "";
  const return20d = finiteMetricNumber(trend.return20dPct);
  const return60d = finiteMetricNumber(trend.return60dPct);
  return ["pullback_complete", "launch_setup"].includes(signal)
    && trend.trendLabel !== "extended_uptrend"
    && trend.entryBias !== "wait_pullback"
    && trend.entryBias !== "avoid_now"
    && isEarlyTurnSetupTrend(trend)
    && hasPullbackLowPositionEvidence(trend)
    && Number.isFinite(return20d)
    && return20d <= 10
    && Number.isFinite(return60d)
    && return60d <= 24;
}

function hasVerifiedPortfolioFeeEvidence(profile = {}) {
  const fees = profile?.fees || {};
  const shareClass = String(fees.shareClass || profile.shareClass || "").toUpperCase();
  const feeModel = fees.shareClassFeeModel || profile.shareClassFeeModel || {};
  const impact = fees.feeImpact || profile.feeImpact || {};
  const missing = new Set(normalizeStringArray(impact.missingFeeData || fees.missingFeeData));
  const oneYearCost = toNumber(impact.oneYearCostPer10000);
  if (!shareClass || !feeModel.label || feeModel.type === "unknown") return false;
  if (["share_class", "subscription_or_sales_service_fee", "sales_service_fee", "subscription_fee"].some((item) => missing.has(item))) {
    return false;
  }
  if (Number.isFinite(oneYearCost)) return true;
  if (["C", "E"].includes(shareClass)) {
    return Number.isFinite(toNumber(fees.salesServiceFeePct)) && feeModel.type === "sales_service_fee";
  }
  if (["A", "B"].includes(shareClass)) {
    return Number.isFinite(toNumber(fees.currentRatePct)) || Number.isFinite(toNumber(fees.sourceRatePct));
  }
  return Boolean(fees.source || fees.feeRules?.subscription || fees.feeRules?.redemption);
}

function hasPortfolioVerifiedSeedChaseRisk(candidate = {}, profile = {}) {
  const trend = profile?.trendProfile || {};
  const return20d = finiteMetricNumber(trend.return20dPct);
  const return60d = finiteMetricNumber(trend.return60dPct);
  if (trend.trendLabel === "extended_uptrend" || trend.entryBias === "avoid_now") return true;
  if (Number.isFinite(return20d) && return20d > 10) return true;
  if (Number.isFinite(return60d) && return60d > 24) return true;
  if (profile?.actionability?.action === "avoid") return true;
  return hasHighChaseTheme(profile) || hasHighChaseTheme(candidate);
}

function formatPortfolioSeedStatusReason(status, profile = null) {
  if (!profile) {
    return "待净值下钻确认，先观察，不能仅凭榜单召回标记可买。";
  }
  if (!profile.trendProfile?.ok) {
    return "净值下钻暂不可用，先观察，不标记可买。";
  }
  if (status === "ready") {
    return "已用净值下钻验证低位/回撤证据，且20日、60日涨幅未过热。";
  }
  if (status === "blocked") {
    return "净值下钻显示偏热、等待消化或追涨风险，暂不作为可买候选。";
  }
  return "净值下钻尚未证明回调完成和低位启动，等待下一轮信号确认。";
}

function formatPortfolioSeedVerifiedTrendEvidence(profile = null) {
  if (!profile) return "净值验证：待下钻确认";
  const trend = profile.trendProfile || {};
  if (!trend.ok) return `净值验证：${trend.note || profile.error || "走势数据不足"}`;
  return [
    `净值验证：趋势${formatTrendLabel(trend.trendLabel)}`,
    `入场${formatEntryBias(trend.entryBias)}`,
    Number.isFinite(Number(trend.return5dPct)) ? `5日${formatFallbackPct(trend.return5dPct)}` : "",
    Number.isFinite(Number(trend.return10dPct)) ? `10日${formatFallbackPct(trend.return10dPct)}` : "",
    Number.isFinite(Number(trend.return20dPct)) ? `20日${formatFallbackPct(trend.return20dPct)}` : "",
    Number.isFinite(Number(trend.return60dPct)) ? `60日${formatFallbackPct(trend.return60dPct)}` : "",
    Number.isFinite(Number(trend.lowPositionPct120)) ? `120日位置${round(Number(trend.lowPositionPct120), 1)}%` : "",
    Number.isFinite(Number(trend.drawdownFromRecentHighPct)) ? `距高点${formatFallbackPct(trend.drawdownFromRecentHighPct)}` : ""
  ].filter(Boolean).join("，");
}

function formatPortfolioFeeVerificationEvidence(profile = {}) {
  const fees = profile?.fees || {};
  const shareClass = fees.shareClass || profile.shareClass || "";
  const feeModel = fees.shareClassFeeModel || profile.shareClassFeeModel || {};
  const impact = fees.feeImpact || profile.feeImpact || {};
  const missing = normalizeStringArray(impact.missingFeeData || fees.missingFeeData);
  return [
    "费用验证：",
    shareClass ? `${shareClass}类` : "份额未知",
    feeModel.label || "费用模型未知",
    Number.isFinite(toNumber(impact.oneYearCostPer10000)) ? `每万元1年约${round(toNumber(impact.oneYearCostPer10000), 0)}元` : "",
    missing.length ? `缺失${missing.slice(0, 3).join("/")}` : ""
  ].filter(Boolean).join("，");
}

function scorePortfolioWatchSeedPriority(seedScore, status, seedKind = "") {
  if (status === "blocked") return 5;
  if (status === "ready" && (seedScore >= 72 || seedKind === "低位启动前夜候选")) return 1;
  if (status === "ready") return 2;
  if (status === "waiting_pullback" && (seedScore >= 64 || seedKind === "低位启动前夜候选")) return 3;
  if (seedScore >= 56) return 4;
  return 4;
}

function formatPortfolioSeedReturnEvidence(candidate = {}) {
  return [
    Number.isFinite(toNumber(candidate.oneWeekPct)) ? `近1周${formatFallbackPct(candidate.oneWeekPct)}` : "",
    Number.isFinite(toNumber(candidate.oneMonthPct)) ? `近1月${formatFallbackPct(candidate.oneMonthPct)}` : "",
    Number.isFinite(toNumber(candidate.threeMonthPct)) ? `近3月${formatFallbackPct(candidate.threeMonthPct)}` : "",
    Number.isFinite(toNumber(candidate.sixMonthPct)) ? `近6月${formatFallbackPct(candidate.sixMonthPct)}` : ""
  ].filter(Boolean).join("，");
}

function formatPortfolioSeedThemeEvidence(candidate = {}) {
  const theme = (candidate.matchedThemes || [])[0];
  if (!theme) return "";
  return [
    `题材${theme.name || ""}`,
    theme.positionSignal === "low_position_rotation" ? "低位轮动" : "",
    theme.positionSignal === "acceptable_position" ? "位置尚可" : "",
    Number.isFinite(Number(theme.rotationScore)) ? `轮动${round(Number(theme.rotationScore), 1)}` : "",
    Number.isFinite(Number(theme.lowPositionScore)) ? `低位${round(Number(theme.lowPositionScore), 1)}` : "",
    Number.isFinite(Number(theme.crowdingScore)) ? `拥挤${round(Number(theme.crowdingScore), 1)}` : ""
  ].filter(Boolean).join("，");
}

function compactPortfolioSeedCandidateForModel(candidate = {}) {
  return {
    code: candidate.code || "",
    name: candidate.name || "",
    shareClass: candidate.shareClass || "",
    type: candidate.type || "",
    score: candidate.portfolioWatchlistSeedScore ?? null,
    oneWeekPct: candidate.oneWeekPct ?? "",
    oneMonthPct: candidate.oneMonthPct ?? "",
    threeMonthPct: candidate.threeMonthPct ?? "",
    sixMonthPct: candidate.sixMonthPct ?? "",
    oneYearPct: candidate.oneYearPct ?? "",
    keywords: (candidate.keywords || []).slice(0, 8),
    matchedThemes: candidate.matchedThemes || [],
    setupDiscoverySource: candidate.setupDiscoverySource || "",
    source: candidate.source || ""
  };
}

function inferPortfolioWatchStatusFromAction(action = {}) {
  if (action.action === "BUY") return "in_position";
  const text = [
    action.reason,
    action.rotationCheck,
    action.positionCheck,
    action.chaseRisk,
    action.riskControl
  ].filter(Boolean).join(" ");
  if (/(回避|不买|过热|偏热|追涨|拥挤|风险高|不符合)/.test(text)) return "blocked";
  if (/(等待|等回撤|等回调|回踩|回撤|回调)/.test(text)) return "waiting_pullback";
  if (/(可买|分批|低位|启动|回调完成|修复|轮动)/.test(text)) return "ready";
  return "watch";
}

function mergePortfolioProfiles(...groups) {
  const byCode = new Map();
  for (const profile of groups.flat().filter(Boolean)) {
    if (profile.code) byCode.set(profile.code, profile);
  }
  return [...byCode.values()];
}

function enforcePortfolioRiskBudget(actions = [], account = {}, profiles = []) {
  const normalized = normalizePortfolioActions(actions);
  const riskActions = buildPortfolioRiskBudgetActions(account, profiles);
  if (!riskActions.length) return normalized;

  const merged = [...normalized];
  for (const riskAction of riskActions) {
    const index = merged.findIndex((action) => action.code && action.code === riskAction.code);
    if (index < 0) {
      merged.push(riskAction);
      continue;
    }
    const current = merged[index];
    const currentTarget = Number.isFinite(Number(current.targetWeightPct)) ? Number(current.targetWeightPct) : 0;
    const riskTarget = Number.isFinite(Number(riskAction.targetWeightPct)) ? Number(riskAction.targetWeightPct) : 0;
    merged[index] = {
      ...current,
      ...riskAction,
      action: "SELL",
      amount: Math.max(Number(current.amount || 0), Number(riskAction.amount || 0)),
      targetWeightPct: Math.min(currentTarget, riskTarget),
      reason: [riskAction.reason, current.reason].filter(Boolean).join(" "),
      dataBasis: mergeStringLists(current.dataBasis, riskAction.dataBasis, ["来源：portfolio_risk_budget_guard"]),
      rotationCheck: current.rotationCheck || riskAction.rotationCheck,
      positionCheck: current.positionCheck || riskAction.positionCheck,
      chaseRisk: [current.chaseRisk, riskAction.chaseRisk].filter(Boolean).join("；"),
      feeCheck: current.feeCheck || riskAction.feeCheck,
      riskControl: [riskAction.riskControl, current.riskControl].filter(Boolean).join(" ")
    };
  }
  return merged.slice(0, 10);
}

function buildPortfolioRiskBudgetActions(account = {}, profiles = []) {
  const positions = Array.isArray(account.positions) ? account.positions : [];
  if (!positions.length) return [];
  const accountBudget = buildPortfolioAccountRiskBudget(account);
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  const byCode = new Map();
  const addRiskAction = (position, reason, dataBasis, options = {}) => {
    if (!position?.code || Number(position.currentValue || 0) <= 0) return;
    const existing = byCode.get(position.code);
    const action = {
      action: "SELL",
      code: position.code,
      name: position.name || profileByCode.get(position.code)?.name || "",
      amount: round(Number(position.currentValue || 0), 2),
      targetWeightPct: 0,
      reason,
      dataBasis: mergeStringLists(dataBasis, [`持仓市值 ${round(Number(position.currentValue || 0), 2)}元`], ["来源：portfolio_risk_budget_guard"]),
      rotationCheck: "风控优先于轮动加仓，先降低回撤暴露。",
      positionCheck: options.positionCheck || "触发组合风控复核",
      chaseRisk: options.chaseRisk || "回撤预算触发，暂停追涨和新增风险。",
      feeCheck: "赎回费按平台实际规则复核；系统只提交分批赎回计划。",
      riskControl: options.riskControl || "先按系统卖出上限分批降风险，下一轮继续复核是否追加。"
    };
    if (!existing) {
      byCode.set(position.code, action);
      return;
    }
    byCode.set(position.code, {
      ...existing,
      reason: [existing.reason, reason].filter(Boolean).join(" "),
      dataBasis: mergeStringLists(existing.dataBasis, action.dataBasis),
      positionCheck: [existing.positionCheck, action.positionCheck].filter(Boolean).join("；"),
      chaseRisk: [existing.chaseRisk, action.chaseRisk].filter(Boolean).join("；"),
      riskControl: [existing.riskControl, action.riskControl].filter(Boolean).join(" ")
    });
  };

  if (accountBudget.reduceRisk) {
    const ordered = [...positions].sort((a, b) => Number(b.weightPct || 0) - Number(a.weightPct || 0));
    for (const position of ordered.slice(0, 5)) {
      addRiskAction(
        position,
        `系统账户回撤控制：组合距峰值回撤${formatFallbackPct(accountBudget.drawdownFromPeakPct)}，已超过${accountBudget.maxDrawdownPct}%预算，必须分批降风险。`,
        [
          `账户峰值 ${accountBudget.peakTotalAsset}元`,
          `账户回撤 ${formatFallbackPct(accountBudget.drawdownFromPeakPct)}`,
          `最大回撤预算 ${accountBudget.maxDrawdownPct}%`
        ],
        {
          positionCheck: "账户级最大回撤预算触发",
          chaseRisk: "账户回撤超预算，所有新增买入暂停，优先降低仓位。",
          riskControl: "账户级回撤超预算，本轮只允许风控减仓或持有复核，不允许新增风险。"
        }
      );
    }
  }

  for (const position of positions) {
    const profile = profileByCode.get(position.code);
    const positionBudget = buildPortfolioPositionRiskBudget(position, profile);
    if (!positionBudget.reduceRisk) continue;
    addRiskAction(
      position,
      `系统单仓回撤控制：${positionBudget.triggers.slice(0, 2).join("；")}。`,
      [
        `单仓浮盈亏 ${formatFallbackPct(positionBudget.unrealizedPnlPct)}`,
        `历史浮盈峰值 ${formatFallbackPct(positionBudget.peakUnrealizedPnlPct)}`,
        `浮盈回吐 ${formatFallbackPct(-positionBudget.profitGivebackPct)}`
      ],
      {
        positionCheck: positionBudget.level === "severe" ? "单仓止损线触发" : "浮盈回吐保护触发",
        chaseRisk: "单仓风险触发，禁止用加仓摊薄替代止损或止盈。",
        riskControl: positionBudget.level === "severe"
          ? "先按严重风险上限纪律性减仓；若下一次复核仍低于止损线，继续追加。"
          : "先分批锁定部分利润；若重新转强再评估是否保留剩余仓位。"
      }
    );
  }

  return [...byCode.values()];
}

function buildPortfolioAccountRiskBudget(account = {}) {
  const totalAsset = round(Number(account.totalAsset || 0), 2) || 0;
  const peakTotalAsset = round(Number(account.peakTotalAsset || account.initialCapital || totalAsset), 2) || totalAsset;
  const derivedDrawdownFromPeakPct = peakTotalAsset > 0 ? round((totalAsset / peakTotalAsset - 1) * 100, 2) : null;
  const drawdownFromPeakPct = Number.isFinite(Number(derivedDrawdownFromPeakPct))
    ? derivedDrawdownFromPeakPct
    : (Number.isFinite(Number(account.drawdownFromPeakPct)) ? round(Number(account.drawdownFromPeakPct), 2) : 0);
  const drawdownAbs = Math.abs(Math.min(0, Number(drawdownFromPeakPct || 0)));
  const warningThresholdPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_ACCOUNT_DRAWDOWN_WARN_PCT, 3));
  const maxDrawdownPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_MAX_ACCOUNT_DRAWDOWN_PCT, 6));
  const severeDrawdownPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_SEVERE_ACCOUNT_DRAWDOWN_PCT, 9));
  const level = drawdownAbs >= severeDrawdownPct
    ? "severe"
    : drawdownAbs >= maxDrawdownPct
      ? "breached"
      : drawdownAbs >= warningThresholdPct
        ? "warning"
        : "normal";
  return {
    level,
    label: {
      normal: "回撤正常",
      warning: "回撤预警",
      breached: "回撤超预算",
      severe: "严重回撤"
    }[level],
    totalAsset,
    peakTotalAsset,
    drawdownFromPeakPct,
    warningThresholdPct,
    maxDrawdownPct,
    severeDrawdownPct,
    blockNewBuys: ["breached", "severe"].includes(level),
    reduceRisk: ["breached", "severe"].includes(level),
    throttleNewBuys: level === "warning"
  };
}

function buildPortfolioPositionRiskBudget(position = {}, profile = null) {
  const unrealizedPnlPct = finiteMetricNumber(position.unrealizedPnlPct);
  const peakUnrealizedPnlPct = finiteMetricNumber(position.peakUnrealizedPnlPct);
  const profitGivebackPct = Number.isFinite(peakUnrealizedPnlPct) && Number.isFinite(unrealizedPnlPct)
    ? Math.max(0, round(peakUnrealizedPnlPct - unrealizedPnlPct, 2))
    : 0;
  const stopLossPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_POSITION_STOP_LOSS_PCT, 8));
  const profitProtectionStartPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_PROFIT_PROTECTION_START_PCT, 8));
  const profitGivebackLimitPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_PROFIT_GIVEBACK_PCT, 4));
  const trend = profile?.trendProfile || position.fundSnapshot?.trendProfile || {};
  const trendDrawdown = finiteMetricNumber(trend.drawdownFromRecentHighPct);
  const triggers = [];

  if (Number.isFinite(unrealizedPnlPct) && unrealizedPnlPct <= -stopLossPct) {
    triggers.push(`浮亏${formatFallbackPct(unrealizedPnlPct)}触及${stopLossPct}%单仓止损线`);
  }
  if (
    Number.isFinite(peakUnrealizedPnlPct)
    && Number.isFinite(unrealizedPnlPct)
    && peakUnrealizedPnlPct >= profitProtectionStartPct
    && profitGivebackPct >= profitGivebackLimitPct
  ) {
    triggers.push(`曾浮盈${formatFallbackPct(peakUnrealizedPnlPct)}，已回吐${round(profitGivebackPct, 2)}个百分点`);
  }
  if (Number.isFinite(trendDrawdown) && trendDrawdown <= -12 && ["breakdown", "weakening"].includes(trend.trendLabel)) {
    triggers.push(`走势${formatTrendLabel(trend.trendLabel)}且距高点${formatFallbackPct(trendDrawdown)}`);
  }

  const level = triggers.some((item) => /止损|破位/.test(item)) ? "severe" : triggers.length ? "warning" : "normal";
  return {
    level,
    label: {
      normal: "正常",
      warning: "需减仓复核",
      severe: "止损风险"
    }[level],
    reduceRisk: triggers.length > 0,
    unrealizedPnlPct,
    peakUnrealizedPnlPct,
    profitGivebackPct,
    stopLossPct,
    profitProtectionStartPct,
    profitGivebackLimitPct,
    triggers
  };
}

function enforcePortfolioBuyDiscipline(actions = [], profiles = [], positions = [], account = null) {
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  return normalizePortfolioActions(actions).map((action) => {
    if (action.action !== "BUY") return action;
    const guard = evaluatePortfolioBuyDiscipline(action, profileByCode.get(action.code), positions, account);
    if (guard.ok) return action;
    return {
      ...action,
      action: "WATCH",
      amount: 0,
      targetWeightPct: 0,
      reason: [action.reason, guard.reason].filter(Boolean).join(" "),
      dataBasis: mergeStringLists(action.dataBasis, guard.evidence, ["来源：portfolio_buy_discipline_guard"]),
      chaseRisk: [action.chaseRisk, guard.reason].filter(Boolean).join("；"),
      riskControl: action.riskControl || "本轮不提交虚拟申购，下一次盘前复核低位/回调/拥挤度证据。"
    };
  });
}

function evaluatePortfolioBuyDiscipline(action = {}, profile = null, positions = [], account = null) {
  if (!action.code) {
    return {
      ok: false,
      reason: "系统买入纪律拦截：缺少基金代码，不能提交虚拟申购。",
      evidence: []
    };
  }
  if (account) {
    const accountBudget = buildPortfolioAccountRiskBudget(account);
    if (accountBudget.blockNewBuys) {
      return {
        ok: false,
        reason: `系统买入纪律拦截：账户距峰值回撤${formatFallbackPct(accountBudget.drawdownFromPeakPct)}，已超过${accountBudget.maxDrawdownPct}%最大回撤预算，暂停新增买入。`,
        evidence: [
          `账户峰值 ${accountBudget.peakTotalAsset}元`,
          `账户回撤 ${formatFallbackPct(accountBudget.drawdownFromPeakPct)}`,
          "来源：portfolio_account_drawdown_guard"
        ]
      };
    }
  }
  if (!profile) {
    return {
      ok: false,
      reason: "系统买入纪律拦截：缺少联网补全资料，不能提交虚拟申购。",
      evidence: []
    };
  }
  const nav = getProfileNav(profile);
  if (!nav) {
    return {
      ok: false,
      reason: "系统买入纪律拦截：缺少可验证单位净值，不能提交虚拟申购。",
      evidence: [profile.error || ""].filter(Boolean)
    };
  }
  const trend = profile.trendProfile || {};
  if (!trend.ok) {
    return {
      ok: false,
      reason: "系统买入纪律拦截：缺少可验证走势、回调和低位证据，不能提交虚拟申购。",
      evidence: [trend.note || profile.error || ""].filter(Boolean)
    };
  }
  const trendEvidence = formatPortfolioSeedVerifiedTrendEvidence(profile);
  if (hasPortfolioVerifiedSeedChaseRisk(action, profile)
    || trend.entryBias === "wait_pullback"
    || trend.entryBias === "avoid_now"
    || profile.actionability?.action === "wait"
    || profile.actionability?.action === "avoid") {
    return {
      ok: false,
      reason: "系统买入纪律拦截：净值下钻显示偏热、等待回撤或追涨风险，不能提交虚拟申购。",
      evidence: [trendEvidence]
    };
  }
  if (!hasVerifiedPortfolioBuySetup(profile)) {
    return {
      ok: false,
      reason: "系统买入纪律拦截：缺少回调完成/启动前夜、5日/10日刚转强和低位证据，不能提交虚拟申购。",
      evidence: [trendEvidence]
    };
  }
  const feeEvidence = formatPortfolioFeeVerificationEvidence(profile);
  if (!hasVerifiedPortfolioFeeEvidence(profile)) {
    return {
      ok: false,
      reason: "系统买入纪律拦截：缺少可验证费用/份额证据，不能提交虚拟申购。",
      evidence: [trendEvidence, feeEvidence].filter(Boolean)
    };
  }
  const exposureGuard = evaluatePortfolioBuyExposureDiscipline(action, profile, positions);
  if (!exposureGuard.ok) {
    return {
      ok: false,
      reason: exposureGuard.reason,
      evidence: [trendEvidence, feeEvidence, ...exposureGuard.evidence].filter(Boolean)
    };
  }
  return { ok: true, reason: "", evidence: [trendEvidence, feeEvidence].filter(Boolean) };
}

function evaluatePortfolioBuyExposureDiscipline(action = {}, profile = null, positions = []) {
  const exposureKey = getPortfolioExposureKey(profile || action);
  if (!exposureKey) return { ok: true, reason: "", evidence: [] };
  const sameExposure = findPortfolioSameExposurePositions(positions, exposureKey, action.code);
  const sameExposureValue = sameExposure.reduce((sum, position) => sum + Number(position.currentValue || 0), 0);
  if (sameExposureValue <= 0) return { ok: true, reason: "", evidence: [] };
  const evidence = [
    `同类暴露：${exposureKey}`,
    `已有同类持仓：${sameExposure.map((item) => `${item.code} ${item.name || ""} ${round(Number(item.currentValue || 0), 2)}元`).join("；")}`
  ];
  if (sameExposure.length >= finiteNumberOr(process.env.PORTFOLIO_BUY_MAX_SAME_EXPOSURE_FUNDS, 1)) {
    return {
      ok: false,
      reason: "系统买入纪律拦截：组合中已有同一指数/同主题暴露，不能用另一只基金重复买入；应复核原持仓或替代份额。",
      evidence
    };
  }
  return { ok: true, reason: "", evidence };
}

function enforcePortfolioSellDiscipline(actions = [], profiles = [], positions = []) {
  const profileByCode = new Map((profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  const positionByCode = new Map((positions || []).filter(Boolean).map((position) => [position.code, position]));
  return normalizePortfolioActions(actions).map((action) => {
    if (action.action !== "SELL") return action;
    const position = positionByCode.get(action.code);
    const guard = evaluatePortfolioSellDiscipline(action, profileByCode.get(action.code), position);
    if (guard.ok) {
      return {
        ...action,
        reason: [action.reason, guard.reason].filter(Boolean).join(" "),
        dataBasis: mergeStringLists(action.dataBasis, guard.evidence, ["来源：portfolio_sell_discipline_guard"]),
        riskControl: action.riskControl || guard.riskControl || "本轮只做纪律性分批减仓，下一次每日决策继续复核是否需要追加卖出。"
      };
    }
    return {
      ...action,
      action: "HOLD",
      amount: 0,
      targetWeightPct: round(Number(position?.weightPct || action.targetWeightPct || 0), 2),
      reason: [action.reason, guard.reason].filter(Boolean).join(" "),
      dataBasis: mergeStringLists(action.dataBasis, guard.evidence, ["来源：portfolio_sell_discipline_guard"]),
      chaseRisk: [action.chaseRisk, guard.reason].filter(Boolean).join("；"),
      riskControl: action.riskControl || "本轮不提交虚拟赎回，下一次复核破位、转弱、回撤扩大或止盈证据后再决定。"
    };
  });
}

function evaluatePortfolioSellDiscipline(action = {}, profile = null, position = null) {
  if (!action.code) {
    return {
      ok: false,
      reason: "系统卖出纪律拦截：缺少基金代码，不能提交虚拟赎回。",
      evidence: []
    };
  }
  if (!position || Number(position.currentValue || 0) <= 0) {
    return {
      ok: false,
      reason: "系统卖出纪律拦截：组合中没有可卖持仓，不能提交虚拟赎回。",
      evidence: []
    };
  }
  if (!profile) {
    return {
      ok: false,
      reason: "系统卖出纪律拦截：缺少联网补全资料，不能提交虚拟赎回。",
      evidence: [formatPortfolioPositionEvidence(position)]
    };
  }
  const nav = getProfileNav(profile);
  if (!nav) {
    return {
      ok: false,
      reason: "系统卖出纪律拦截：缺少可验证单位净值，不能提交虚拟赎回。",
      evidence: [formatPortfolioPositionEvidence(position), profile.error || ""].filter(Boolean)
    };
  }
  const trend = profile.trendProfile || {};
  if (!trend.ok) {
    return {
      ok: false,
      reason: "系统卖出纪律拦截：缺少可验证走势、破位、转弱或止盈证据，不能提交虚拟赎回。",
      evidence: [formatPortfolioPositionEvidence(position), trend.note || profile.error || ""].filter(Boolean)
    };
  }

  const evidence = [
    formatPortfolioPositionEvidence(position),
    formatPortfolioSeedVerifiedTrendEvidence(profile)
  ].filter(Boolean);
  const signals = collectPortfolioSellDisciplineSignals(action, profile, position);
  if (!signals.length) {
    return {
      ok: false,
      reason: "系统卖出纪律拦截：缺少破位、转弱、回撤扩大或止盈证据，不能提交虚拟赎回。",
      evidence
    };
  }

  return {
    ok: true,
    reason: `系统卖出纪律确认：${signals.slice(0, 3).join("；")}。`,
    evidence: mergeStringLists(evidence, signals.map((signal) => `卖出证据：${signal}`)),
    riskControl: signals.some((signal) => /破位|回避|止损/.test(signal))
      ? "先按系统上限纪律性减仓，若下一次复核仍破位或回避，再评估追加卖出。"
      : "先按系统上限分批止盈/降仓，不做一次性清仓。"
  };
}

function collectPortfolioSellDisciplineSignals(action = {}, profile = {}, position = {}) {
  const trend = profile.trendProfile || {};
  const actionability = profile.actionability || {};
  const return20d = finiteMetricNumber(trend.return20dPct);
  const return60d = finiteMetricNumber(trend.return60dPct);
  const drawdown = finiteMetricNumber(trend.drawdownFromRecentHighPct);
  const unrealized = finiteMetricNumber(position.unrealizedPnlPct);
  const peakUnrealized = finiteMetricNumber(position.peakUnrealizedPnlPct);
  const profitGiveback = Number.isFinite(peakUnrealized) && Number.isFinite(unrealized)
    ? Math.max(0, round(peakUnrealized - unrealized, 2))
    : 0;
  const stopLossPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_POSITION_STOP_LOSS_PCT, 8));
  const givebackPct = Math.abs(finiteNumberOr(process.env.PORTFOLIO_PROFIT_GIVEBACK_PCT, 4));
  const actionText = [
    action.reason,
    action.rotationCheck,
    action.positionCheck,
    action.chaseRisk,
    action.riskControl
  ].filter(Boolean).join(" ");
  const signals = [];
  if (trend.trendLabel === "breakdown") signals.push("趋势破位，需要止损或降低风险敞口");
  if (trend.trendLabel === "weakening") signals.push("趋势转弱，需要减仓观察");
  if (actionability.action === "avoid" || trend.entryBias === "avoid_now") signals.push("可操作性已转为回避");
  if (Number.isFinite(drawdown) && drawdown <= -10) signals.push(`距高点${formatFallbackPct(drawdown)}，回撤扩大`);
  if (trend.trendLabel === "extended_uptrend" || trend.entryBias === "wait_pullback") signals.push("短期偏热或等待回撤，适合分批止盈");
  if (Number.isFinite(return20d) && return20d > 12) signals.push(`近20日${formatFallbackPct(return20d)}，需止盈防回吐`);
  if (Number.isFinite(return60d) && return60d > 24) signals.push(`近60日${formatFallbackPct(return60d)}，需降仓控制追涨暴露`);
  if (/账户回撤|组合回撤|最大回撤预算/.test(actionText)) signals.push("账户级最大回撤预算触发，需要降低组合风险");
  if (Number.isFinite(unrealized) && unrealized <= -stopLossPct) signals.push(`持仓浮亏${formatFallbackPct(unrealized)}，触及单仓止损线`);
  if (/浮盈回吐|利润回吐|回吐保护/.test(actionText) && profitGiveback >= givebackPct) {
    signals.push(`历史浮盈${formatFallbackPct(peakUnrealized)}，已回吐${round(profitGiveback, 2)}个百分点`);
  }
  if (Number.isFinite(unrealized) && unrealized >= 8 && /(止盈|减仓|降仓|锁定|兑现)/.test(actionText)) {
    signals.push(`持仓浮盈${formatFallbackPct(unrealized)}，模型给出止盈/减仓意图`);
  }
  return mergeStringLists(signals);
}

function formatPortfolioPositionEvidence(position = {}) {
  return [
    "持仓验证：",
    position.code || "",
    position.name || "",
    Number.isFinite(Number(position.currentValue)) ? `市值${round(Number(position.currentValue), 2)}元` : "",
    Number.isFinite(Number(position.weightPct)) ? `仓位${round(Number(position.weightPct), 2)}%` : "",
    Number.isFinite(Number(position.unrealizedPnlPct)) ? `浮盈亏${formatFallbackPct(position.unrealizedPnlPct)}` : ""
  ].filter(Boolean).join("，");
}

function getPortfolioExposureKey(item = {}) {
  return item?.exposureKey
    || item?.seed?.exposureKey
    || item?.fundSnapshot?.exposureKey
    || getCandidateExposureKey(item)
    || getCandidateExposureKey(item?.seed || {})
    || getCandidateExposureKey(item?.fundSnapshot || {});
}

function findPortfolioSameExposurePositions(positions = [], exposureKey = "", excludeCode = "") {
  if (!exposureKey) return [];
  return (positions || []).filter((position) => {
    if (!position?.code || position.code === excludeCode) return false;
    return getPortfolioExposureKey(position) === exposureKey;
  });
}

function getPortfolioSameExposureValue(positions = [], item = {}) {
  const exposureKey = getPortfolioExposureKey(item);
  if (!exposureKey) return 0;
  return (positions || [])
    .filter((position) => getPortfolioExposureKey(position) === exposureKey)
    .reduce((sum, position) => sum + Number(position.currentValue || 0), 0);
}

function applyPortfolioWatchlistUpdates(db, updates = [], options = {}) {
  db.watchlist = normalizePortfolioWatchlist(db.watchlist);
  const normalizedUpdates = normalizePortfolioWatchlistUpdates(updates);
  if (!normalizedUpdates.length) return [];
  const now = new Date().toISOString();
  const profileByCode = new Map((options.profiles || []).filter(Boolean).map((profile) => [profile.code, profile]));
  const byCode = new Map(db.watchlist.map((item) => [item.code, item]));
  const applied = [];

  for (const update of normalizedUpdates) {
    const profile = profileByCode.get(update.code);
    const existing = byCode.get(update.code);
    const evidenceProfile = profile || existing?.lastSnapshot || null;
    const guardedUpdate = update.operation === "REMOVE"
      ? update
      : guardPortfolioWatchlistReadyUpdate(update, evidenceProfile, existing);
    const snapshot = profile ? buildPortfolioFundSnapshot(profile) : update.lastSnapshot || existing?.lastSnapshot || null;
    const defaults = {
      now,
      addedAt: existing?.addedAt || now,
      updatedAt: now,
      name: guardedUpdate.name || existing?.name || profile?.name || "",
      shareClass: guardedUpdate.shareClass || existing?.shareClass || profile?.fees?.shareClass || profile?.shareClass || inferFundShareClass(profile?.name || guardedUpdate.name || existing?.name || ""),
      type: guardedUpdate.type || existing?.type || profile?.type || "",
      source: guardedUpdate.source || options.source || existing?.source || "",
      sourceRunId: options.run?.id || existing?.sourceRunId || "",
      lastSnapshot: snapshot
    };

    if (guardedUpdate.operation === "REMOVE") {
      const removed = normalizePortfolioWatchItem({
        ...(existing || guardedUpdate),
        status: "removed",
        reason: guardedUpdate.reason || existing?.reason || "模型建议移出自选基金池。",
        updatedAt: now
      }, defaults);
      if (removed) {
        byCode.set(removed.code, removed);
        applied.push(removed);
      }
      continue;
    }

    const merged = normalizePortfolioWatchItem({
      ...(existing || {}),
      ...guardedUpdate,
      status: guardedUpdate.status || existing?.status || "watch",
      priority: guardedUpdate.priority || existing?.priority || 3,
      reason: guardedUpdate.reason || existing?.reason || "",
      setupEvidence: mergeStringLists(guardedUpdate.setupEvidence, existing?.setupEvidence),
      buyTriggers: mergeStringLists(guardedUpdate.buyTriggers, existing?.buyTriggers),
      riskNotes: mergeStringLists(guardedUpdate.riskNotes, existing?.riskNotes),
      feeNotes: mergeStringLists(guardedUpdate.feeNotes, existing?.feeNotes),
      dataBasis: mergeStringLists(guardedUpdate.dataBasis, existing?.dataBasis),
      alternativeShareClasses: mergePortfolioWatchAlternatives(guardedUpdate.alternativeShareClasses, existing?.alternativeShareClasses),
      sameExposureAlternatives: mergePortfolioWatchAlternatives(guardedUpdate.sameExposureAlternatives, existing?.sameExposureAlternatives),
      updatedAt: now
    }, defaults);
    if (!merged) continue;
    byCode.set(merged.code, merged);
    applied.push(merged);
  }

  db.watchlist = normalizePortfolioWatchlist([...byCode.values()]);
  if (applied.length) {
    db.updatedAt = now;
  }
  return applied.map(summarizePortfolioWatchItem);
}

function guardPortfolioWatchlistReadyUpdate(update = {}, profile = null, existing = null) {
  if (update.status !== "ready") {
    return update;
  }
  const verifiedStatus = inferPortfolioWatchStatusFromSeedCandidate(update, 60, profile);
  if (verifiedStatus === "ready") {
    const freshness = evaluatePortfolioWatchlistFreshness({ ...(existing || {}), ...update, status: "ready" }, profile);
    if (!freshness.ok) {
      const guardReason = `系统时效验证降级：${freshness.issues[0]}`;
      return {
        ...update,
        status: "waiting_pullback",
        priority: Math.max(Number(update.priority || 3), 3),
        reason: [update.reason, guardReason].filter(Boolean).join(" "),
        riskNotes: mergeStringLists(update.riskNotes, [guardReason]),
        dataBasis: mergeStringLists(update.dataBasis, ["来源：watchlist_freshness_guard"])
      };
    }
    return update;
  }
  const guardReason = verifiedStatus === "blocked"
    ? "系统净值验证拦截：候选偏热、仍需回撤或存在追涨风险，不能写入可买状态。"
    : "系统净值验证降级：缺少低位回调完成证据，不能仅凭描述写入可买状态。";
  return {
    ...update,
    status: verifiedStatus,
    priority: verifiedStatus === "blocked" ? 5 : Math.max(Number(update.priority || 3), 3),
    reason: [update.reason, guardReason].filter(Boolean).join(" "),
    riskNotes: mergeStringLists(update.riskNotes, [guardReason]),
    dataBasis: mergeStringLists(update.dataBasis, [
      profile?.trendProfile?.ok ? formatPortfolioSeedVerifiedTrendEvidence(profile) : "净值验证：缺失或不足"
    ])
  };
}

function mergeStringLists(...groups) {
  const values = [];
  for (const item of groups.flat()) {
    const text = String(item || "").trim();
    if (text && !values.includes(text)) values.push(text);
  }
  return values;
}

function summarizePortfolioWatchlistForModel(watchlist = []) {
  return normalizePortfolioWatchlist(watchlist)
    .filter((item) => item.status !== "removed")
    .slice(0, 30)
    .map((item) => {
      const readiness = evaluatePortfolioWatchReadiness(item);
      return {
        code: item.code,
        name: item.name,
        shareClass: item.shareClass,
        type: item.type,
        status: item.status,
        priority: item.priority,
        readinessScore: readiness.score,
        readinessLabel: readiness.label,
        candidateRole: item.candidateRole,
        reason: item.reason,
        setupEvidence: item.setupEvidence,
        buyTriggers: item.buyTriggers,
        riskNotes: item.riskNotes,
        feeNotes: item.feeNotes,
        positionPlan: item.positionPlan,
        readinessGaps: readiness.gaps,
        reviewDate: item.reviewDate,
        alternativeShareClasses: item.alternativeShareClasses || [],
        sameExposureAlternatives: item.sameExposureAlternatives || [],
        trendSummary: item.lastSnapshot?.trendSummary || "",
        updatedAt: item.updatedAt
      };
    });
}

async function getFundWorkflowWatchlistContext(userText = "", options = {}) {
  if (String(process.env.FUND_WORKFLOW_WATCHLIST_CONTEXT ?? "true") === "false") {
    return { candidates: [], summary: "经理自选候选池：未启用。" };
  }
  try {
    const db = options.db || readPortfolioDb();
    const limit = options.limit ?? 6;
    let activeWatchlist = getActivePortfolioWatchlist(db);
    let candidates = selectFundWorkflowWatchlistCandidates(activeWatchlist, userText, {
      limit,
      now: options.now
    });
    const staleRefreshCandidates = selectFundWorkflowStaleWatchlistRefreshCandidates(activeWatchlist, userText, {
      limit: Math.max(0, Number(limit || 0) - candidates.length),
      now: options.now
    });
    if (staleRefreshCandidates.length) {
      const profiles = await enrichFunds(staleRefreshCandidates.map((item) => item.code));
      const refreshUpdates = buildPortfolioWatchlistRecheckUpdates(staleRefreshCandidates, { profiles })
        .map((update) => ({
          ...update,
          source: "fund_workflow_watchlist_refresh",
          dataBasis: mergeStringLists(update.dataBasis, ["来源：fund_workflow_watchlist_refresh"])
        }));
      if (refreshUpdates.length) {
        applyPortfolioWatchlistUpdates(db, refreshUpdates, {
          profiles,
          source: "fund_workflow_watchlist_refresh"
        });
        if (options.persist !== false) writePortfolioDb(db);
        activeWatchlist = getActivePortfolioWatchlist(db);
        candidates = selectFundWorkflowWatchlistCandidates(activeWatchlist, userText, {
          limit,
          now: options.now
        });
      }
      updateStats({ counters: { fundWorkflowWatchlistRefreshes: staleRefreshCandidates.length } });
    }
    return {
      candidates,
      summary: buildFundWorkflowWatchlistSummary(candidates)
    };
  } catch (error) {
    console.warn("[fund-workflow-watchlist-context-error]", error.message);
    recordError(error, { fundWorkflowWatchlistContextFailures: 1 });
    return { candidates: [], summary: "经理自选候选池：读取失败，本轮只使用市场候选。" };
  }
}

function selectFundWorkflowWatchlistCandidates(watchlist = [], userText = "", options = {}) {
  const limit = Math.max(0, Number(options.limit ?? 6) || 0);
  if (!limit) return [];
  const wantsPullbackSetup = isPullbackSetupRequest(userText);
  return normalizePortfolioWatchlist(watchlist)
    .filter((item) => ["ready", "waiting_pullback", "watch"].includes(item.status))
    .filter((item) => isFundWorkflowWatchlistFreshEnough(item, options))
    .map((item) => {
      const readiness = evaluatePortfolioWatchReadiness(item);
      const setupFocus = isLowBaseLaunchWatchSeed(item) || /回调完成|启动前夜|低位|刚转强/.test([
        item.reason,
        item.candidateRole,
        item.positionPlan,
        ...(item.setupEvidence || []),
        ...(item.readinessGaps || [])
      ].join(" "));
      const score = Number(readiness.score || 0)
        + (item.status === "ready" ? 28 : item.status === "waiting_pullback" ? 14 : 0)
        + (setupFocus ? 18 : 0)
        - Number(item.priority || 3);
      return {
        ...summarizePortfolioWatchItem(item),
        workflowWatchlistScore: wantsPullbackSetup ? score : score - (setupFocus ? 0 : 8)
      };
    })
    .sort((a, b) => Number(b.workflowWatchlistScore || 0) - Number(a.workflowWatchlistScore || 0)
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
}

function selectFundWorkflowStaleWatchlistRefreshCandidates(watchlist = [], userText = "", options = {}) {
  const limit = Math.max(0, Number(options.limit ?? 3) || 0);
  if (!limit) return [];
  const wantsPullbackSetup = isPullbackSetupRequest(userText);
  return normalizePortfolioWatchlist(watchlist)
    .filter((item) => ["ready", "waiting_pullback"].includes(item.status))
    .filter((item) => !isFundWorkflowWatchlistFreshEnough(item, options))
    .filter((item) => !wantsPullbackSetup || isLowBaseLaunchWatchSeed(item) || /回调完成|启动前夜|低位|刚转强/.test([
      item.reason,
      item.candidateRole,
      item.positionPlan,
      ...(item.setupEvidence || []),
      ...(item.readinessGaps || [])
    ].join(" ")))
    .sort((a, b) => Number(a.priority || 3) - Number(b.priority || 3)
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
}

function isFundWorkflowWatchlistFreshEnough(item = {}, options = {}) {
  const status = normalizePortfolioWatchStatus(item.status || "watch");
  if (!["ready", "waiting_pullback"].includes(status)) return true;
  const freshness = evaluatePortfolioWatchlistFreshness(item, item.lastSnapshot, {
    now: options.now,
    ignoreReviewAge: false
  });
  return freshness.ok;
}

function buildFundWorkflowWatchlistSummary(candidates = []) {
  if (!candidates.length) return "经理自选候选池：暂无可复用的接近可买或等待回调候选。";
  return [
    "经理自选候选池（优先复核，不自动买入）：",
    ...candidates.map((item) => {
      const fields = [
        `${item.code} ${item.name || ""}`.trim(),
        `状态=${item.statusText || formatPortfolioWatchStatus(item.status)}`,
        `准备度=${item.readinessScore}/${item.readinessLabel || ""}`,
        item.candidateRole ? `角色=${item.candidateRole}` : "",
        item.reason ? `备选理由=${item.reason}` : "",
        item.readinessGaps?.length ? `缺口=${item.readinessGaps.slice(0, 2).join("/")}` : "",
        item.buyTriggers?.length ? `触发=${item.buyTriggers.slice(0, 2).join("/")}` : "",
        item.feeNotes?.length ? `费用=${item.feeNotes.slice(0, 1).join("/")}` : "",
        item.alternativeShareClasses?.length ? `替代份额=${formatPortfolioWatchAlternativesText(item.alternativeShareClasses)}` : "",
        item.sameExposureAlternatives?.length ? `同类替代=${formatPortfolioWatchAlternativesText(item.sameExposureAlternatives)}` : ""
      ].filter(Boolean);
      return `- ${fields.join("，")}`;
    })
  ].join("\n");
}

function mergeFundWorkflowWatchlistIntoDeepDive(deepDive, watchlistCandidates = [], userText = "") {
  const converted = (watchlistCandidates || []).map(portfolioWatchItemToDeepDiveCandidate).filter((item) => item.code);
  if (!converted.length) return deepDive;
  const base = deepDive && typeof deepDive === "object"
    ? { ...deepDive, candidates: Array.isArray(deepDive.candidates) ? [...deepDive.candidates] : [] }
    : {
        ok: true,
        focus: "portfolio_watchlist_reuse",
        selectionDiscipline: isPullbackSetupRequest(userText) ? "prefer_pullback_complete_launch_setup_not_chase" : "balanced_theme_relevance",
        candidates: []
      };
  const byCode = new Map();
  for (const item of converted) {
    byCode.set(item.code, item);
  }
  for (const candidate of base.candidates || []) {
    const code = candidate?.code || candidate?.seed?.code || "";
    if (!code) continue;
    const watchCandidate = byCode.get(code);
    byCode.set(code, watchCandidate ? mergePortfolioWatchCandidateDigest(watchCandidate, candidate) : candidate);
  }
  const candidates = [...byCode.values()];
  base.candidates = base.selectionDiscipline === "prefer_pullback_complete_launch_setup_not_chase"
    ? candidates.sort((a, b) => scoreResearchDigestForPullbackSetup(b) - scoreResearchDigestForPullbackSetup(a))
    : candidates;
  base.portfolioWatchlistCandidates = watchlistCandidates;
  return base;
}

function portfolioWatchItemToDeepDiveCandidate(item = {}) {
  const snapshot = item.lastSnapshot || {};
  const trendProfile = snapshot.trendProfile || {};
  const readiness = item.readinessScore === undefined
    ? evaluatePortfolioWatchReadiness(item)
    : { score: item.readinessScore, label: item.readinessLabel || "", gaps: item.readinessGaps || [] };
  const action = item.status === "ready" ? "staged_buy" : item.status === "waiting_pullback" ? "wait" : "watch";
  return {
    ok: Boolean(trendProfile.ok),
    code: item.code || "",
    name: item.name || "",
    type: item.type || "",
    shareClass: item.shareClass || "",
    trendProfile,
    actionability: {
      action,
      actionText: formatActionabilityAction(action),
      score: readiness.score,
      decisionBlocker: readiness.gaps || item.readinessGaps || [],
      decisiveEvidence: [
        item.reason,
        ...(item.setupEvidence || []),
        ...(item.buyTriggers || [])
      ].filter(Boolean).slice(0, 4)
    },
    fees: snapshot.fees || {
      shareClass: item.shareClass || "",
      shareClassFeeModel: item.feeNotes?.[0] ? { label: item.feeNotes[0] } : null
    },
    seed: {
      code: item.code || "",
      name: item.name || "",
      keywords: ["经理自选候选池", ...(isLowBaseLaunchWatchSeed(item) ? ["低位启动前夜候选"] : [])],
      setupDiscoverySource: item.source || item.dataBasis?.find((value) => /来源|召回/.test(value)) || "portfolio_watchlist_context",
      alternativeShareClasses: item.alternativeShareClasses || [],
      sameExposureAlternatives: item.sameExposureAlternatives || []
    },
    portfolioWatchlist: {
      status: item.status || "",
      statusText: item.statusText || formatPortfolioWatchStatus(item.status),
      readinessScore: readiness.score,
      readinessLabel: readiness.label,
      readinessGaps: readiness.gaps || item.readinessGaps || [],
      candidateRole: item.candidateRole || "",
      reason: item.reason || "",
      positionPlan: item.positionPlan || ""
    },
    sources: [
      ...(Array.isArray(snapshot.sources) ? snapshot.sources : []),
      ...(item.dataBasis || [])
    ].filter(Boolean)
  };
}

function mergePortfolioWatchCandidateDigest(watchCandidate = {}, marketCandidate = {}) {
  const preferMarket = marketCandidate?.ok !== false && marketCandidate?.trendProfile?.ok;
  const primary = preferMarket ? marketCandidate : watchCandidate;
  const fallback = preferMarket ? watchCandidate : marketCandidate;
  return {
    ...fallback,
    ...primary,
    portfolioWatchlist: watchCandidate.portfolioWatchlist || marketCandidate.portfolioWatchlist,
    seed: {
      ...(watchCandidate.seed || {}),
      ...(marketCandidate.seed || {}),
      keywords: [...new Set([...(watchCandidate.seed?.keywords || []), ...(marketCandidate.seed?.keywords || [])].filter(Boolean))]
    },
    sources: [...new Set([...(watchCandidate.sources || []), ...(marketCandidate.sources || [])].filter(Boolean))]
  };
}

function summarizePortfolioWatchItem(item = {}) {
  const readiness = evaluatePortfolioWatchReadiness(item);
  return {
    code: item.code,
    name: item.name,
    shareClass: item.shareClass || "",
    type: item.type || "",
    status: item.status || "watch",
    statusText: formatPortfolioWatchStatus(item.status),
    priority: item.priority || 3,
    readinessScore: readiness.score,
    readinessLabel: readiness.label,
    candidateRole: item.candidateRole || "",
    reason: item.reason || "",
    setupEvidence: item.setupEvidence || [],
    buyTriggers: item.buyTriggers || [],
    riskNotes: item.riskNotes || [],
    feeNotes: item.feeNotes || [],
    positionPlan: item.positionPlan || "",
    readinessGaps: readiness.gaps,
    reviewDate: item.reviewDate || "",
    dataBasis: item.dataBasis || [],
    alternativeShareClasses: item.alternativeShareClasses || [],
    sameExposureAlternatives: item.sameExposureAlternatives || [],
    source: item.source || "",
    sourceRunId: item.sourceRunId || "",
    lastSnapshot: item.lastSnapshot || null,
    addedAt: item.addedAt || "",
    updatedAt: item.updatedAt || ""
  };
}

function buildPortfolioWatchReadinessGaps(item = {}, profile = null) {
  const evidence = profile || item.lastSnapshot || null;
  const trend = evidence?.trendProfile || {};
  const gaps = [];
  if (!evidence || !trend.ok) {
    gaps.push("缺少可验证净值/走势下钻，不能进入买入执行。");
    return gaps;
  }
  const signal = trend.pullbackSetup?.signal || "";
  if (!["pullback_complete", "launch_setup"].includes(signal)) {
    gaps.push("还差回调完成或启动前夜信号。");
  }
  if (!isEarlyTurnSetupTrend(trend)) {
    gaps.push("还差5日/10日刚转强证据。");
  }
  if (!hasPullbackLowPositionEvidence(trend)) {
    gaps.push("还差120日低位或距高点回撤证据。");
  }
  const return20d = finiteMetricNumber(trend.return20dPct);
  const return60d = finiteMetricNumber(trend.return60dPct);
  if (!Number.isFinite(return20d)) {
    gaps.push("缺少近20日涨幅验证。");
  } else if (return20d > 10) {
    gaps.push(`近20日${formatFallbackPct(return20d)}，需降温到10%以内。`);
  }
  if (!Number.isFinite(return60d)) {
    gaps.push("缺少近60日涨幅验证。");
  } else if (return60d > 24) {
    gaps.push(`近60日${formatFallbackPct(return60d)}，需消化到24%以内。`);
  }
  if (trend.entryBias === "wait_pullback") {
    gaps.push("入场判断仍是等待回撤。");
  } else if (trend.entryBias === "avoid_now") {
    gaps.push("入场判断仍是暂时回避。");
  }
  if (evidence.actionability?.action === "wait") {
    gaps.push("可操作性仍是等待。");
  } else if (evidence.actionability?.action === "avoid") {
    gaps.push("可操作性仍是回避。");
  }
  if (hasHighChaseTheme(evidence) || hasHighChaseTheme(item)) {
    gaps.push("题材拥挤或追涨风险仍需下降。");
  }
  if (!hasVerifiedPortfolioFeeEvidence(evidence)) {
    gaps.push("还差可验证费用/份额证据。");
  }
  const freshness = evaluatePortfolioWatchlistFreshness(item, evidence);
  gaps.push(...freshness.issues);
  if (!gaps.length && item.status === "ready") {
    return ["低位/启动/刚转强/不过热/费用条件已满足，下一次盘前确认后再分批评估。"];
  }
  return gaps;
}

function evaluatePortfolioWatchReadiness(item = {}, profile = null) {
  const status = normalizePortfolioWatchStatus(item.status || "watch");
  const evidence = profile || item.lastSnapshot || null;
  const trend = evidence?.trendProfile || {};
  const gaps = buildPortfolioWatchReadinessGaps(item, profile);
  let score = evidence && trend.ok ? 100 : 18;
  for (const gap of gaps) {
    score -= scorePortfolioWatchReadinessGapPenalty(gap);
  }
  if (gaps.some((gap) => gap.includes("条件已满足"))) {
    score = Math.max(score, 88);
  }
  const statusCaps = {
    ready: 100,
    waiting_pullback: 78,
    watch: 58,
    blocked: 24,
    in_position: 68,
    removed: 0
  };
  score = Math.min(score, statusCaps[status] ?? 58);
  const bounded = Math.round(clampScore(score));
  return {
    score: bounded,
    label: formatPortfolioWatchReadinessLabel(bounded),
    gaps
  };
}

function scorePortfolioWatchReadinessGapPenalty(gap = "") {
  const text = String(gap || "");
  if (/缺少可验证净值|走势下钻/.test(text)) return 70;
  if (/回调完成|启动前夜/.test(text)) return 18;
  if (/120日低位|距高点回撤/.test(text)) return 16;
  if (/近20日.*需降温|近60日.*需消化/.test(text)) return 16;
  if (/等待回撤|可操作性仍是等待|入场判断仍是等待/.test(text)) return 14;
  if (/暂时回避|仍是回避/.test(text)) return 28;
  if (/题材拥挤|追涨风险/.test(text)) return 16;
  if (/费用\/份额/.test(text)) return 10;
  if (/快照已过期|重新下钻|复核已过期/.test(text)) return 18;
  if (/缺少近20日|缺少近60日/.test(text)) return 8;
  return 7;
}

function formatPortfolioWatchReadinessLabel(score) {
  const value = Number(score);
  if (value >= 85) return "买入准备充分";
  if (value >= 70) return "接近可买，等盘前确认";
  if (value >= 55) return "备选观察";
  if (value >= 35) return "条件不足";
  return "暂不买入";
}

function comparePortfolioWatchReadiness(a = {}, b = {}) {
  return getPortfolioWatchReadinessScore(b) - getPortfolioWatchReadinessScore(a)
    || Number(a.priority || 3) - Number(b.priority || 3)
    || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
}

function getPortfolioWatchReadinessScore(item = {}) {
  const score = Number(item.readinessScore ?? item.score);
  return Number.isFinite(score) ? score : evaluatePortfolioWatchReadiness(item).score;
}

function evaluatePortfolioWatchlistFreshness(item = {}, profile = null, options = {}) {
  const status = normalizePortfolioWatchStatus(item.status || "watch");
  if (!["ready", "waiting_pullback"].includes(status)) {
    return { ok: true, issues: [] };
  }
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const issues = [];
  const maxSnapshotAgeDays = status === "ready"
    ? finiteNumberOr(process.env.PORTFOLIO_WATCH_READY_MAX_SNAPSHOT_AGE_DAYS, 5)
    : finiteNumberOr(process.env.PORTFOLIO_WATCH_WAITING_MAX_SNAPSHOT_AGE_DAYS, 10);
  const maxReviewAgeDays = finiteNumberOr(process.env.PORTFOLIO_WATCH_MAX_REVIEW_AGE_DAYS, 14);
  const snapshotDate = extractPortfolioWatchSnapshotDate(profile || item.lastSnapshot || {});
  const snapshotAge = daysSincePortfolioDate(snapshotDate, nowMs);
  if (Number.isFinite(snapshotAge)) {
    if (snapshotAge > maxSnapshotAgeDays) {
      issues.push(`净值快照已过期${snapshotAge}天，需要重新下钻后才能买入。`);
    }
  } else {
    issues.push("缺少净值快照日期，需要重新下钻后才能买入。");
  }

  if (!options.ignoreReviewAge) {
    const reviewAge = daysSincePortfolioDate(item.updatedAt || item.addedAt || "", nowMs);
    if (Number.isFinite(reviewAge) && reviewAge > maxReviewAgeDays) {
      issues.push(`自选复查已超过${reviewAge}天，需要重新复核后才能买入。`);
    }
  }

  return { ok: issues.length === 0, issues };
}

function extractPortfolioWatchSnapshotDate(snapshot = {}) {
  return String(
    snapshot.snapshotDate
    || snapshot.navDate
    || snapshot.date
    || snapshot.trendProfile?.latestDate
    || snapshot.trendProfile?.snapshotDate
    || ""
  ).trim();
}

function daysSincePortfolioDate(value, nowMs = Date.now()) {
  const text = String(value || "").trim();
  if (!text || !Number.isFinite(nowMs)) return null;
  const dateText = text.match(/\d{4}-\d{2}-\d{2}/)?.[0] || text;
  const parsed = Date.parse(dateText.length === 10 ? `${dateText}T00:00:00Z` : dateText);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 86400000));
}

function formatPortfolioWatchStatus(value) {
  const labels = {
    ready: "接近可买",
    waiting_pullback: "等待回调",
    watch: "继续观察",
    blocked: "暂不买入",
    in_position: "已进入持仓",
    removed: "已移出"
  };
  return labels[value] || labels.watch;
}

async function submitPortfolioOrders(db, actions, profiles, run, config = getEffectiveConfig()) {
  const profileByCode = new Map((profiles || []).map((profile) => [profile.code, profile]));
  const orders = [];
  const notes = [];
  recalculatePortfolioAccount(db.account);

  for (const [index, action] of actions.entries()) {
    assertPortfolioRunActive(run);
    if (index > 0) {
      await yieldToEventLoop();
    }
    markPortfolioRunProgress(
      db,
      run,
      `正在校验交易规则并生成虚拟订单（${index + 1}/${actions.length} ${action.action} ${action.code || action.name || ""}）。`
    );
    await yieldToEventLoop();
    if (action.action === "BUY") {
      const profile = profileByCode.get(action.code);
      const nav = getProfileNav(profile);
      if (!action.code) {
        notes.push({ action: "BUY", status: "skipped", reason: "缺少基金代码，无法提交申购申请。", originalAction: action });
        continue;
      }
      if (!nav) {
        notes.push({
          action: "BUY",
          code: action.code,
          name: action.name || profile?.name || "",
          status: "skipped",
          reason: "未抓取到可验证单位净值，不提交申购申请。",
          originalAction: action
        });
        continue;
      }
      const existingPosition = db.account.positions.find((item) => item.code === action.code);
      if (existingPosition?.units) {
        existingPosition.currentValue = round(Number(existingPosition.units || 0) * nav, 2);
        existingPosition.lastNav = nav;
        existingPosition.lastNavDate = profile?.snapshotDate || existingPosition.lastNavDate || "";
        existingPosition.fundSnapshot = buildPortfolioFundSnapshot(profile, existingPosition);
        recalculatePortfolioAccount(db.account);
      }
      const amount = resolvePortfolioTradeAmount(db.account, action, "BUY", null, profile);
      if (amount <= 0) {
        notes.push({
          action: "BUY",
          code: action.code,
          name: action.name || profile?.name || "",
          status: "skipped",
          reason: "目标仓位未高于当前持仓，或现金不足，未执行买入。",
          originalAction: action
        });
        continue;
      }
      const order = createPortfolioOrder({
        side: "BUY",
        action,
        amount,
        profile,
        run,
        config
      });
      db.account.cash = round(Number(db.account.cash || 0) - amount, 2);
      db.account.pendingBuyAmount = round(Number(db.account.pendingBuyAmount || 0) + amount, 2);
      db.orders.push(order);
      orders.push(order);
    }

    if (action.action === "SELL") {
      const position = db.account.positions.find((item) => item.code === action.code);
      if (!position || Number(position.currentValue || 0) <= 0) {
        notes.push({
          action: "SELL",
          code: action.code,
          name: action.name,
          status: "skipped",
          reason: "组合中没有这只基金的可卖持仓。",
          originalAction: action
        });
        continue;
      }
      const profile = profileByCode.get(action.code);
      const nav = getProfileNav(profile) || position.lastNav || null;
      if (!nav) {
        notes.push({
          action: "SELL",
          code: action.code,
          name: position.name || action.name,
          status: "skipped",
          reason: "缺少当前净值，无法计算赎回份额，未提交赎回申请。",
          originalAction: action
        });
        continue;
      }
      if (position.units) {
        position.currentValue = round(Number(position.units || 0) * nav, 2);
        position.lastNav = nav;
        position.lastNavDate = profile?.snapshotDate || position.lastNavDate || "";
        position.fundSnapshot = buildPortfolioFundSnapshot(profile, position);
        recalculatePortfolioAccount(db.account);
      }
      const amount = resolvePortfolioTradeAmount(db.account, action, "SELL", position);
      if (amount <= 0) {
        notes.push({
          action: "SELL",
          code: action.code,
          name: position.name || action.name,
          status: "skipped",
          reason: "目标仓位未低于当前持仓，未执行卖出。",
          originalAction: action
        });
        continue;
      }
      const ratio = amount / Number(position.currentValue || 1);
      const requestedUnits = round(Number(position.units || 0) * ratio, 6);
      const order = createPortfolioOrder({
        side: "SELL",
        action,
        amount,
        units: requestedUnits,
        profile,
        position,
        run,
        config
      });
      position.pendingSellUnits = round(Number(position.pendingSellUnits || 0) + requestedUnits, 6);
      position.pendingSellAmount = round(Number(position.pendingSellAmount || 0) + amount, 2);
      position.updatedAt = new Date().toISOString();
      db.orders.push(order);
      orders.push(order);
    }
  }

  db.account.positions = db.account.positions.filter((position) => Number(position.currentValue || 0) > 0.5);
  recalculatePortfolioAccount(db.account);
  return { orders, notes };
}

function createPortfolioOrder({ side, action, amount, units = 0, profile, position = null, run, config }) {
  const submittedAt = new Date();
  const tradingProfile = inferFundTradingProfile(profile, action);
  const submission = buildFundOrderSchedule(submittedAt, tradingProfile, config);
  const limitCheck = buildFundLimitCheck(profile, amount, tradingProfile);
  const code = action.code || profile?.code || position?.code || "";
  const name = action.name || profile?.name || position?.name || "";
  return {
    id: createId("ord"),
    runId: run.id,
    side,
    status: submission.status,
    code,
    name,
    amount: round(amount, 2),
    requestedUnits: units ? round(units, 6) : 0,
    targetWeightPct: action.targetWeightPct || 0,
    submittedAt: submittedAt.toISOString(),
    submitDate: submission.submitDate,
    acceptedDate: submission.acceptedDate,
    priceDate: submission.priceDate,
    confirmDate: side === "BUY" ? submission.buyConfirmDate : submission.sellConfirmDate,
    settlementDate: side === "SELL" ? submission.sellSettlementDate : "",
    cutoffTime: tradingProfile.cutoffTime,
    beforeCutoff: submission.beforeCutoff,
    scheduleReason: submission.reason,
    tradingProfile,
    limitCheck,
    reason: action.reason,
    dataBasis: action.dataBasis,
    riskControl: action.riskControl,
    fundSnapshot: buildPortfolioFundSnapshot(profile, position),
    navSnapshot: null,
    timeline: [
      {
        at: submittedAt.toISOString(),
        status: submission.status,
        note: submission.reason
      }
    ],
    source: profile?.sources?.[0] || ""
  };
}

async function processPortfolioOrderLifecycle(db, run, config = getEffectiveConfig()) {
  ensurePortfolioAccount(db, config);
  db.orders = Array.isArray(db.orders) ? db.orders : [];
  db.settlements = Array.isArray(db.settlements) ? db.settlements : [];

  const now = getZonedDateTime(config.portfolioTimezone);
  const result = {
    transactions: [],
    orderUpdates: [],
    settlementEvents: [],
    notes: [],
    updatedOrders: 0
  };

  for (const settlement of db.settlements) {
    if (settlement.status !== "pending") continue;
    if (settlement.dueDate && settlement.dueDate <= now.date) {
      settlement.status = "settled";
      settlement.settledAt = new Date().toISOString();
      db.account.cash = round(Number(db.account.cash || 0) + Number(settlement.amount || 0), 2);
      db.account.receivableCash = round(Math.max(0, Number(db.account.receivableCash || 0) - Number(settlement.amount || 0)), 2);
      result.settlementEvents.push(settlement);
      result.updatedOrders += 1;
    }
  }

  const activeOrders = db.orders.filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status));
  if (!activeOrders.length) {
    recalculatePortfolioAccount(db.account);
    return result;
  }

  const profileCodes = mergeFundCodes(activeOrders.map((order) => order.code));
  const profiles = profileCodes.length ? await enrichFunds(profileCodes) : [];
  const profileByCode = new Map(profiles.map((profile) => [profile.code, profile]));

  for (const order of activeOrders) {
    const beforeStatus = order.status;
    const profile = profileByCode.get(order.code);

    if (order.status === "queued" && order.acceptedDate <= now.date) {
      order.status = "submitted";
      addOrderTimeline(order, "submitted", `已到达估值交易日 ${order.acceptedDate}，等待净值。`);
    }

    if (!order.navSnapshot && order.priceDate <= now.date) {
      const navSnapshot = await resolveOrderNavSnapshot(order, profile).catch((error) => {
        result.notes.push({
          action: order.side,
          code: order.code,
          name: order.name,
          status: "pending",
          reason: `净值抓取失败：${error.message}`
        });
        return null;
      });
      if (navSnapshot?.nav) {
        order.navSnapshot = navSnapshot;
        order.status = "priced";
        order.fundSnapshot = buildPortfolioFundSnapshot(profile) || order.fundSnapshot;
        addOrderTimeline(order, "priced", `已取得 ${navSnapshot.date} 单位净值 ${navSnapshot.nav}，等待 ${order.confirmDate} 确认。`);
      } else if (order.acceptedDate < now.date) {
        addOrderTimeline(order, order.status, `仍未取得估值日 ${order.priceDate} 的可验证净值，暂不确认。`);
      }
    }

    if (order.navSnapshot?.nav && order.confirmDate <= now.date && order.status !== "confirmed") {
      const transaction =
        order.side === "BUY"
          ? confirmPortfolioBuyOrder(db, order, profile, run)
          : confirmPortfolioSellOrder(db, order, profile, run);
      if (transaction) {
        result.transactions.push(transaction);
        result.updatedOrders += 1;
      }
    }

    if (beforeStatus !== order.status) {
      result.orderUpdates.push({
        id: order.id,
        code: order.code,
        name: order.name,
        side: order.side,
        beforeStatus,
        afterStatus: order.status,
        priceDate: order.priceDate,
        confirmDate: order.confirmDate
      });
      result.updatedOrders += 1;
    }
  }

  recalculatePortfolioAccount(db.account);
  return result;
}

async function resolveOrderNavSnapshot(order, profile) {
  const profileNav = getProfileNav(profile);
  if (profileNav && profile?.snapshotDate === order.priceDate) {
    return {
      date: profile.snapshotDate,
      nav: round(profileNav, 4),
      source: profile.sources?.[0] || "",
      quality: "exact_profile_nav"
    };
  }

  const point = await fetchFundNavPointForDate(order.code, order.priceDate);
  if (point?.unitNav) {
    return {
      date: point.date,
      nav: round(point.unitNav, 4),
      cumulativeNav: point.cumulativeNav,
      source: `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${order.code}`,
      quality: point.date === order.priceDate ? "exact_nav_history" : "nearest_nav_history"
    };
  }

  return null;
}

function confirmPortfolioBuyOrder(db, order, profile, run) {
  const nav = Number(order.navSnapshot?.nav || 0);
  if (!nav) return null;

  let position = db.account.positions.find((item) => item.code === order.code);
  if (!position) {
    position = {
      code: order.code,
      name: order.name || profile?.name || "",
      units: 0,
      costAmount: 0,
      currentValue: 0,
      realizedPnl: 0,
      createdAt: new Date().toISOString()
    };
    db.account.positions.push(position);
  }

  const previousUnits = Number(position.units || 0);
  const boughtUnits = Number(order.amount || 0) / nav;
  position.name = order.name || position.name || profile?.name || "";
  position.units = round(previousUnits + boughtUnits, 6);
  position.costAmount = round(Number(position.costAmount || 0) + Number(order.amount || 0), 2);
  position.currentValue = round(position.units * nav, 2);
  position.averageCostNav = position.units > 0 ? round(position.costAmount / position.units, 4) : null;
  position.lastNav = nav;
  position.lastNavDate = order.navSnapshot.date;
  position.lastTradeNav = nav;
  position.lastTradeUnits = round(boughtUnits, 6);
  position.lastTradeAmount = order.amount;
  position.lastReason = order.reason;
  position.lastRiskControl = order.riskControl;
  position.fundSnapshot = buildPortfolioFundSnapshot(profile, position) || order.fundSnapshot;
  position.dataSource = profile?.sources?.[0] || order.source || "";
  position.updatedAt = new Date().toISOString();

  db.account.pendingBuyAmount = round(Math.max(0, Number(db.account.pendingBuyAmount || 0) - Number(order.amount || 0)), 2);
  order.status = "confirmed";
  order.confirmedAt = new Date().toISOString();
  addOrderTimeline(order, "confirmed", `申购确认：${order.amount}元 / ${nav} = ${round(boughtUnits, 6)}份。`);

  return recordPortfolioTransaction(db, run, order, order.amount, "BUY", profile, {
    nav,
    navDate: order.navSnapshot.date,
    units: boughtUnits,
    beforeUnits: previousUnits,
    afterUnits: position.units,
    order
  });
}

function confirmPortfolioSellOrder(db, order, profile, run) {
  const nav = Number(order.navSnapshot?.nav || 0);
  const position = db.account.positions.find((item) => item.code === order.code);
  if (!nav || !position) return null;

  const requestedUnits = Math.min(Number(order.requestedUnits || 0), Number(position.units || 0));
  if (requestedUnits <= 0) return null;

  const previousUnits = Number(position.units || 0);
  const amount = round(requestedUnits * nav, 2);
  const ratio = requestedUnits / Number(position.units || 1);
  const costReduced = round(Number(position.costAmount || 0) * ratio, 2);
  position.costAmount = round(Number(position.costAmount || 0) - costReduced, 2);
  position.currentValue = round(Math.max(0, Number(position.currentValue || 0) - amount), 2);
  position.units = round(Number(position.units || 0) - requestedUnits, 6);
  position.averageCostNav = position.units > 0 ? round(position.costAmount / position.units, 4) : null;
  position.realizedPnl = round(Number(position.realizedPnl || 0) + amount - costReduced, 2);
  position.pendingSellUnits = round(Math.max(0, Number(position.pendingSellUnits || 0) - requestedUnits), 6);
  position.pendingSellAmount = round(Math.max(0, Number(position.pendingSellAmount || 0) - Number(order.amount || 0)), 2);
  position.lastNav = nav;
  position.lastNavDate = order.navSnapshot.date;
  position.lastTradeNav = nav;
  position.lastTradeUnits = requestedUnits;
  position.lastTradeAmount = amount;
  position.lastReason = order.reason;
  position.lastRiskControl = order.riskControl;
  position.fundSnapshot = buildPortfolioFundSnapshot(profile, position) || order.fundSnapshot;
  position.dataSource = profile?.sources?.[0] || order.source || "";
  position.updatedAt = new Date().toISOString();

  db.account.receivableCash = round(Number(db.account.receivableCash || 0) + amount, 2);
  const settlement = {
    id: createId("set"),
    orderId: order.id,
    runId: run.id,
    code: order.code,
    name: order.name,
    amount,
    dueDate: order.settlementDate,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  db.settlements.push(settlement);
  order.status = "confirmed";
  order.confirmedAt = new Date().toISOString();
  order.actualAmount = amount;
  addOrderTimeline(order, "confirmed", `赎回确认：${requestedUnits}份 * ${nav} = ${amount}元，预计 ${order.settlementDate} 到账。`);

  return recordPortfolioTransaction(db, run, order, amount, "SELL", profile, {
    nav,
    navDate: order.navSnapshot.date,
    units: requestedUnits,
    beforeUnits: previousUnits,
    afterUnits: position.units,
    order
  });
}

function addOrderTimeline(order, status, note) {
  order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
  const latest = order.timeline[order.timeline.length - 1];
  if (latest?.status === status && latest?.note === note) {
    return;
  }
  order.timeline.push({
    at: new Date().toISOString(),
    status,
    note
  });
}

function recordPortfolioTransaction(db, run, action, amount, side, profile, execution = {}) {
  const transaction = {
    id: createId("txn"),
    runId: run.id,
    date: run.date,
    createdAt: new Date().toISOString(),
    side,
    code: action.code,
    name: action.name || profile?.name || "",
    amount: round(amount, 2),
    nav: execution.nav ? round(Number(execution.nav), 4) : null,
    navDate: execution.navDate || profile?.snapshotDate || "",
    units: execution.units ? round(Number(execution.units), 6) : 0,
    beforeUnits: execution.beforeUnits === undefined ? null : round(Number(execution.beforeUnits || 0), 6),
    afterUnits: execution.afterUnits === undefined ? null : round(Number(execution.afterUnits || 0), 6),
    reason: action.reason,
    dataBasis: action.dataBasis,
    riskControl: action.riskControl,
    fundSnapshot: buildPortfolioFundSnapshot(profile),
    orderId: execution.order?.id || "",
    orderStatus: execution.order?.status || "",
    source: profile?.sources?.[0] || action.source || ""
  };
  db.transactions.push(transaction);
  return transaction;
}

function resolvePortfolioTradeAmount(account, action, side, position = null, profile = null) {
  const totalAsset = Number(account.totalAsset || 0);
  const targetWeightPct = Number(action.targetWeightPct || 0);
  const requestedAmount = Number(action.amount || 0);

  if (side === "BUY") {
    const currentPosition = (account.positions || []).find((item) => item.code === action.code);
    const currentValue = Number(currentPosition?.currentValue || 0);
    const targetValue = targetWeightPct > 0 ? (totalAsset * targetWeightPct) / 100 : null;
    const targetDelta = targetValue === null ? requestedAmount : Math.max(0, targetValue - currentValue);
    const proposedAmount = requestedAmount > 0 && targetDelta > 0 ? Math.min(requestedAmount, targetDelta) : targetDelta;
    const cashLimitedAmount = Math.min(Number(account.cash || 0), Math.max(0, proposedAmount || 0));
    return capPortfolioBuyAmountByDiscipline(account, action, cashLimitedAmount, currentValue, profile);
  }

  if (side === "SELL") {
    const currentValue = Number(position?.currentValue || 0);
    const targetValue = targetWeightPct > 0 ? (totalAsset * targetWeightPct) / 100 : null;
    const targetDelta = targetValue === null ? requestedAmount : Math.max(0, currentValue - targetValue);
    const proposedAmount = requestedAmount > 0 && targetDelta > 0 ? Math.min(requestedAmount, targetDelta) : targetDelta;
    const positionLimitedAmount = Math.min(currentValue, Math.max(0, proposedAmount || 0));
    return capPortfolioSellAmountByDiscipline(account, action, positionLimitedAmount, position);
  }

  return 0;
}

function capPortfolioBuyAmountByDiscipline(account = {}, action = {}, amount = 0, currentValue = 0, profile = null) {
  const totalAsset = Number(account.totalAsset || 0);
  const cash = Number(account.cash || 0);
  if (!Number.isFinite(totalAsset) || totalAsset <= 0 || !Number.isFinite(cash) || cash <= 0) return 0;
  const maxSingleFundWeightPct = finiteNumberOr(process.env.PORTFOLIO_BUY_MAX_SINGLE_FUND_WEIGHT_PCT, 6);
  const maxSingleOrderWeightPct = finiteNumberOr(process.env.PORTFOLIO_BUY_MAX_SINGLE_ORDER_WEIGHT_PCT, 4);
  const maxSameExposureWeightPct = finiteNumberOr(process.env.PORTFOLIO_BUY_MAX_SAME_EXPOSURE_WEIGHT_PCT, 8);
  const minCashReservePct = finiteNumberOr(process.env.PORTFOLIO_BUY_MIN_CASH_RESERVE_PCT, 20);
  const accountBudget = buildPortfolioAccountRiskBudget(account);
  if (accountBudget.blockNewBuys) return 0;
  const drawdownThrottleWeightPct = accountBudget.throttleNewBuys
    ? Math.max(0, finiteNumberOr(process.env.PORTFOLIO_DRAWDOWN_BUY_MAX_SINGLE_ORDER_WEIGHT_PCT, 1))
    : maxSingleOrderWeightPct;
  const maxSingleFundValue = Math.max(0, totalAsset * maxSingleFundWeightPct / 100);
  const maxSingleOrderAmount = Math.max(0, totalAsset * Math.min(maxSingleOrderWeightPct, drawdownThrottleWeightPct) / 100);
  const maxSameExposureValue = Math.max(0, totalAsset * maxSameExposureWeightPct / 100);
  const minCashReserve = Math.max(0, totalAsset * minCashReservePct / 100);
  const availableAfterReserve = Math.max(0, cash - minCashReserve);
  const remainingFundRoom = Math.max(0, maxSingleFundValue - Number(currentValue || 0));
  const sameExposureValue = getPortfolioSameExposureValue(account.positions || [], profile || action);
  const remainingExposureRoom = sameExposureValue > 0
    ? Math.max(0, maxSameExposureValue - sameExposureValue)
    : maxSameExposureValue;
  const capped = Math.min(
    Math.max(0, Number(amount || 0)),
    maxSingleOrderAmount,
    remainingFundRoom,
    remainingExposureRoom,
    availableAfterReserve
  );
  return round(capped, 2);
}

function capPortfolioSellAmountByDiscipline(account = {}, action = {}, amount = 0, position = null) {
  const totalAsset = Number(account.totalAsset || 0);
  const currentValue = Number(position?.currentValue || 0);
  if (!Number.isFinite(totalAsset) || totalAsset <= 0 || !Number.isFinite(currentValue) || currentValue <= 0) return 0;
  const severe = isSeverePortfolioSellAction(action);
  const maxPositionPct = severe
    ? finiteNumberOr(process.env.PORTFOLIO_SELL_SEVERE_MAX_POSITION_PCT, 80)
    : finiteNumberOr(process.env.PORTFOLIO_SELL_MAX_POSITION_PCT, 50);
  const maxSingleOrderWeightPct = severe
    ? finiteNumberOr(process.env.PORTFOLIO_SELL_SEVERE_MAX_SINGLE_ORDER_WEIGHT_PCT, 8)
    : finiteNumberOr(process.env.PORTFOLIO_SELL_MAX_SINGLE_ORDER_WEIGHT_PCT, 6);
  const maxPositionAmount = Math.max(0, currentValue * maxPositionPct / 100);
  const maxSingleOrderAmount = Math.max(0, totalAsset * maxSingleOrderWeightPct / 100);
  const capped = Math.min(
    Math.max(0, Number(amount || 0)),
    currentValue,
    maxPositionAmount,
    maxSingleOrderAmount
  );
  return round(capped, 2);
}

function isSeverePortfolioSellAction(action = {}) {
  const text = [
    action.reason,
    action.rotationCheck,
    action.positionCheck,
    action.chaseRisk,
    action.riskControl,
    ...(action.dataBasis || [])
  ].filter(Boolean).join(" ");
  return /(破位|止损|回避|假设失效|风控|风险失效|清仓)/.test(text);
}

function buildPortfolioFundSnapshot(profile, position = null) {
  if (!profile) {
    return null;
  }

  const nav = getProfileNav(profile);
  const periods = profile.riskMetrics?.periods || {};
  const oneYear = periods["1y"] || {};
  const threeYear = periods["3y"] || {};
  const fiveYear = periods["5y"] || {};
  const trendProfile = profile.trendProfile || null;
  const actionability = profile.actionability || null;
  const topHoldings = (profile.holdings?.equityTopHoldings || profile.topStocks || []).slice(0, 10).map((item) => {
    if (typeof item === "string") return item;
    return [item.code, item.name, item.netValuePct ? `${item.netValuePct}%` : ""].filter(Boolean).join(" ");
  });

  return {
    code: profile.code || position?.code || "",
    name: profile.name || position?.name || "",
    nav: nav ? round(nav, 4) : null,
    navDate: profile.snapshotDate || "",
    navBasis: profile.unitNav ? "latest_confirmed_unit_nav" : profile.estimatedNav ? "estimated_nav" : "missing",
    estimatedNav: toNumber(profile.estimatedNav),
    estimatedChangePct: toNumber(profile.estimatedChangePct),
    estimateTime: profile.estimateTime || "",
    returns: profile.returns || {},
    risk: {
      oneYear: pickRiskPeriod(oneYear),
      threeYear: pickRiskPeriod(threeYear),
      fiveYear: pickRiskPeriod(fiveYear)
    },
    trendProfile,
    actionability,
    fees: profile.fees ? {
      shareClass: profile.fees.shareClass || profile.shareClass || "",
      shareClassFeeModel: profile.fees.shareClassFeeModel || profile.shareClassFeeModel || null,
      currentRatePct: profile.fees.currentRatePct || "",
      salesServiceFeePct: profile.fees.salesServiceFeePct || "",
      feeImpact: profile.fees.feeImpact || null,
      feeDecisionRule: profile.fees.feeDecisionRule || "",
      missingFeeData: profile.fees.missingFeeData || []
    } : null,
    scale: profile.scale || null,
    topHoldings,
    trendSummary: buildPortfolioTrendSummary({ trendProfile, actionability, oneYear, threeYear }),
    sources: profile.sources || []
  };
}

function buildPortfolioTrendSummary({ trendProfile, actionability, oneYear = {}, threeYear = {} }) {
  if (trendProfile?.ok) {
    const parts = [
      trendProfile.return20dPct !== null && trendProfile.return20dPct !== undefined ? `20日${formatSignedNumber(trendProfile.return20dPct)}%` : "",
      trendProfile.return60dPct !== null && trendProfile.return60dPct !== undefined ? `60日${formatSignedNumber(trendProfile.return60dPct)}%` : "",
      trendProfile.return120dPct !== null && trendProfile.return120dPct !== undefined ? `120日${formatSignedNumber(trendProfile.return120dPct)}%` : "",
      trendProfile.drawdownFromRecentHighPct !== null && trendProfile.drawdownFromRecentHighPct !== undefined ? `距高点${formatSignedNumber(trendProfile.drawdownFromRecentHighPct)}%` : "",
      `趋势${formatTrendLabel(trendProfile.trendLabel)}`,
      `入场${formatEntryBias(trendProfile.entryBias)}`,
      actionability?.action ? `自评${formatActionabilityAction(actionability.action)}${actionability.allocationBand ? ` ${actionability.allocationBand}` : ""}` : ""
    ].filter(Boolean);
    return parts.join("，");
  }

  const trendParts = [
    oneYear.ok ? `1年${formatSignedNumber(oneYear.totalReturnPct)}%` : "",
    threeYear.ok ? `3年${formatSignedNumber(threeYear.totalReturnPct)}%` : "",
    oneYear.ok ? `回撤${oneYear.maxDrawdownPct}%` : "",
    oneYear.ok && oneYear.sharpe !== null ? `夏普${oneYear.sharpe}` : ""
  ].filter(Boolean);
  return trendParts.join("，") || "走势数据不足";
}

function formatTrendLabel(value) {
  const labels = {
    breakdown: "破位",
    extended_uptrend: "偏热",
    pullback_complete: "回调完成",
    launch_setup: "启动前夜",
    rebound_repair: "修复",
    uptrend: "上行",
    weakening: "转弱",
    range_or_mixed: "震荡"
  };
  return labels[value] || value || "未知";
}

function formatEntryBias(value) {
  const labels = {
    buyable_now: "可买",
    staged_buy: "分批",
    wait_pullback: "等回撤",
    hold_observe: "持有观察",
    avoid_now: "回避"
  };
  return labels[value] || value || "观察";
}

function formatActionabilityAction(value) {
  const labels = {
    buy: "买入",
    staged_buy: "分批",
    hold: "持有",
    wait: "等待",
    avoid: "回避",
    need_specific_fund: "需具体基金"
  };
  return labels[value] || value || "观察";
}

function formatFitLabel(value) {
  const labels = {
    fit: "适合",
    tactical_only: "只适合战术小仓位",
    weak_fit: "适配度偏弱",
    not_suitable: "不适合当前买入",
    strong_fit: "高度适配"
  };
  return labels[value] || value || "观察";
}

function pickRiskPeriod(period) {
  if (!period?.ok) {
    return { ok: false, note: period?.note || "数据不足" };
  }
  return {
    ok: true,
    totalReturnPct: period.totalReturnPct,
    annualizedReturnPct: period.annualizedReturnPct,
    annualizedVolatilityPct: period.annualizedVolatilityPct,
    maxDrawdownPct: period.maxDrawdownPct,
    sharpe: period.sharpe,
    startDate: period.startDate,
    endDate: period.endDate
  };
}

function inferFundTradingProfile(profile = {}, action = {}) {
  const text = `${profile.name || ""} ${action.name || ""} ${profile.code || action.code || ""}`.toLowerCase();
  const holdings = profile.holdings || {};
  const qdii = /qdii|全球|海外|美国|纳斯达克|标普|日经|越南|印度|德国|法国|香港|港股/.test(text);
  const money = /货币|现金|添利宝|余额/.test(text);
  const bond = /债券|债基|短债|中短债|纯债|可转债/.test(text) || Boolean(holdings.bondTopHoldings?.length);
  const etf = /etf/.test(text) && !/联接/.test(text);
  const crossBorderEtf = etf && /港股|香港|纳斯达克|标普|日经|海外|qdii/.test(text);
  const kind = qdii ? "qdii_or_overseas" : money ? "money_market" : bond ? "bond" : etf ? "exchange_etf_or_feeder" : "domestic_open_end";

  return {
    kind,
    cutoffTime: "15:00",
    calendar: qdii || crossBorderEtf ? "cn_trading_day_plus_overseas_delay" : "cn_trading_day_weekend_only",
    buyConfirmLag: qdii ? 2 : 1,
    sellConfirmLag: qdii ? 2 : 1,
    sellCashLag: qdii ? 5 : money ? 1 : bond ? 2 : 3,
    navDelayDays: qdii ? 1 : 0,
    canIntradayTrade: crossBorderEtf,
    timezoneSensitive: qdii || crossBorderEtf,
    notes: [
      "模拟规则按公开基金常见申购/赎回流程处理：交易日 15:00 截止，非交易日或 15:00 后顺延。",
      qdii || crossBorderEtf ? "海外/QDII 类产品存在净值披露和确认时差，本系统会延后确认。" : "",
      etf ? "ETF/联接/场内场外规则可能不同，当前按基金申赎账本模拟，不模拟真实场内撮合。" : "",
      "节假日历、基金暂停申购、限购额度以基金公告为准；未抓到公告时只做风险标记。"
    ].filter(Boolean)
  };
}

function buildFundOrderSchedule(date, tradingProfile, config = getEffectiveConfig()) {
  const zoned = getZonedDateTime(config.portfolioTimezone);
  const submitDate = zoned.date;
  const hhmm = zoned.hhmm;
  const beforeCutoff = hhmm < tradingProfile.cutoffTime;
  let acceptedDate = submitDate;
  let reason = "交易日 15:00 前提交，按当日估值日排队。";

  if (!isPortfolioTradingDay(acceptedDate)) {
    acceptedDate = nextPortfolioTradingDay(acceptedDate);
    reason = `非交易日提交，顺延至 ${acceptedDate} 作为估值日。`;
  } else if (!beforeCutoff) {
    acceptedDate = nextPortfolioTradingDay(acceptedDate);
    reason = `15:00 后提交，顺延至 ${acceptedDate} 作为估值日。`;
  }

  const buyConfirmDate = addPortfolioTradingDays(acceptedDate, tradingProfile.buyConfirmLag);
  const sellConfirmDate = addPortfolioTradingDays(acceptedDate, tradingProfile.sellConfirmLag);
  const sellSettlementDate = addPortfolioTradingDays(sellConfirmDate, tradingProfile.sellCashLag);
  return {
    submitDate,
    acceptedDate,
    priceDate: acceptedDate,
    buyConfirmDate,
    sellConfirmDate,
    sellSettlementDate,
    beforeCutoff,
    status: acceptedDate === submitDate && beforeCutoff ? "submitted" : "queued",
    reason
  };
}

function buildFundLimitCheck(profile, amount, tradingProfile) {
  const minPurchase = toNumber(profile?.fees?.minPurchase);
  const softCap = Number(process.env.PORTFOLIO_SINGLE_ORDER_SOFT_CAP || 20000);
  return {
    status: "unknown",
    minPurchase,
    amount: round(Number(amount || 0), 2),
    softCap,
    passedSoftCap: Number(amount || 0) <= softCap,
    note:
      Number(amount || 0) > softCap
        ? `单笔超过本系统软上限 ${softCap} 元，需要复查基金公告中的限购/暂停申购。`
        : "未接入基金公司实时公告限购数据，按软上限和净值可验证性先做模拟。"
  };
}

function isPortfolioTradingDay(date) {
  const day = getDateOnlyWeekday(date);
  return day !== 0 && day !== 6;
}

function getDateOnlyWeekday(date) {
  return parseDateOnlyUtc(date).getUTCDay();
}

function nextPortfolioTradingDay(date) {
  let current = addDays(date, 1);
  let guard = 0;
  while (!isPortfolioTradingDay(current)) {
    current = addDays(current, 1);
    guard += 1;
    if (guard > 14) {
      throw new Error(`无法计算下一个交易日：${date}`);
    }
  }
  return current;
}

function addPortfolioTradingDays(date, days) {
  let current = date;
  let remaining = Math.max(0, Number(days || 0));
  while (remaining > 0) {
    current = nextPortfolioTradingDay(current);
    remaining -= 1;
  }
  return current;
}

function addDays(date, days) {
  const value = parseDateOnlyUtc(date);
  value.setUTCDate(value.getUTCDate() + Number(days || 0));
  return formatUtcDate(value);
}

function parseDateOnlyUtc(date) {
  const match = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`无效日期：${date}`);
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatUtcDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekdayLabel(value) {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return labels[normalizeWeekday(value, 5)] || "周五";
}

async function pushPortfolioRunIfConfigured(db, run, config) {
  const target = resolvePortfolioPushTarget(config, db);
  if (!target?.receiveId) {
    run.push = { ok: false, skipped: true, reason: "未配置飞书推送目标；在飞书里和机器人说一句话后可自动记录 chat_id。" };
    writePortfolioDb(db);
    return;
  }

  try {
    const trendImages = await buildPortfolioTrendCardImages(run, config).catch((error) => {
      console.warn("[portfolio-trend-image-error]", run.id, error.message);
      recordError(error, { portfolioTrendImageFailures: 1 });
      return [];
    });
    await sendFeishuMessage(target.receiveId, run.card || "虚拟基金经理任务完成。", {
      receiveIdType: target.receiveIdType || "chat_id",
      kind: "portfolio",
      images: trendImages
    });
    run.push = {
      ok: true,
      receiveIdType: target.receiveIdType || "chat_id",
      receiveId: maskSecret(target.receiveId),
      trendImages: trendImages.length,
      pushedAt: new Date().toISOString()
    };
    updateStats({ counters: { portfolioPushes: 1 }, last: { lastPortfolioPushAt: run.push.pushedAt } });
    writePortfolioDb(db);
  } catch (error) {
    run.push = { ok: false, error: error.message, failedAt: new Date().toISOString() };
    writePortfolioDb(db);
    recordError(error, { portfolioPushFailures: 1 });
  }
}

function resolvePortfolioPushTarget(config, db) {
  if (config.portfolioPushReceiveId) {
    return {
      receiveId: config.portfolioPushReceiveId,
      receiveIdType: config.portfolioPushReceiveType || "chat_id"
    };
  }
  if (config.portfolioAutoBindLastChat && db.autoPushTarget?.receiveId) {
    return db.autoPushTarget;
  }
  return null;
}

function capturePortfolioPushTarget(payload) {
  const message = payload?.event?.message;
  const chatId = message?.chat_id || "";
  if (!chatId) {
    return;
  }

  const config = getEffectiveConfig();
  const now = new Date().toISOString();
  const db = readPortfolioDb();
  db.pushTargets = Array.isArray(db.pushTargets) ? db.pushTargets : [];
  const existing = db.pushTargets.find((target) => target.receiveId === chatId && target.receiveIdType === "chat_id");
  const target = existing || {
    receiveId: chatId,
    receiveIdType: "chat_id",
    label: message.chat_type || "feishu_chat",
    firstSeenAt: now
  };
  target.lastSeenAt = now;
  target.messageId = message.message_id || "";
  if (!existing) {
    db.pushTargets.push(target);
  }
  if (config.portfolioAutoBindLastChat && !config.portfolioPushReceiveId) {
    db.autoPushTarget = {
      receiveId: chatId,
      receiveIdType: "chat_id",
      label: target.label,
      updatedAt: now
    };
  }
  db.updatedAt = now;
  writePortfolioDb(db);
}

function buildPortfolioDecisionCard({ decision, watchlistUpdates = [], account, orders = [], transactions, executionNotes = [], settlementEvents = [], run }) {
  const actionLines = decision.actions.length
    ? decision.actions.map((action) => {
        const name = [action.code, action.name].filter(Boolean).join(" ");
        const amount = action.amount ? ` 建议${action.amount}元` : "";
        const target = action.targetWeightPct ? ` 目标${action.targetWeightPct}%` : "";
        const checks = [action.rotationCheck, action.positionCheck, action.chaseRisk, action.feeCheck]
          .filter(Boolean)
          .join("；");
        return `${action.action} ${name}${amount}${target}：${action.reason || "见投委会意见"}${checks ? `（${checks}）` : ""}`;
      })
    : ["今日没有生成买卖动作。"];
  const teamLines = decision.team.map((item) => `${item.agent} ${item.stance}：${item.reason}`);
  const transactionLines = transactions.length
    ? transactions.map((item) => {
        const nav = item.nav ? `，净值 ${item.nav}${item.navDate ? `（${item.navDate}）` : ""}` : "";
        const units = item.units ? `，份额 ${item.units}` : "";
        const trend = item.fundSnapshot?.trendSummary ? `，走势 ${item.fundSnapshot.trendSummary}` : "";
        return `${item.side} ${item.code} ${item.name} ${item.amount}元${nav}${units}${trend}`;
      })
    : ["无实际账本变动。"];
  const orderLines = orders.length
    ? orders.map((order) => {
        const dateLine = `估值日 ${order.priceDate}，确认日 ${order.confirmDate}${order.settlementDate ? `，到账日 ${order.settlementDate}` : ""}`;
        return `${order.side} ${order.code} ${order.name} ${order.amount}元：${order.status}，${dateLine}；${order.scheduleReason}`;
      })
    : ["本次没有提交新的申购/赎回申请。"];
  const settlementLines = settlementEvents.length
    ? settlementEvents.map((item) => `${item.code} ${item.name} ${item.amount}元已到账。`)
    : [];
  const noteLines = executionNotes.length
    ? executionNotes.map((item) => `${item.action || "SKIP"} ${item.code || ""} ${item.name || ""}：${item.reason}`)
    : [];
  const watchlistLines = watchlistUpdates.length
    ? watchlistUpdates.slice(0, 8).map(formatPortfolioWatchLine)
    : ["本次没有更新自选基金池。"];

  return [
    `虚拟基金经理日报 ${run.date}`,
    "",
    `今日手法：${decision.summary}`,
    decision.marketView ? `市场判断：${decision.marketView}` : "",
    "",
    "投委会意见：",
    ...teamLines,
    "",
    "今日操作：",
    ...actionLines,
    "",
    "申购/赎回申请：",
    ...orderLines,
    settlementLines.length ? "" : "",
    settlementLines.length ? "到账更新：" : "",
    ...settlementLines,
    "",
    "已确认成交：",
    ...transactionLines,
    noteLines.length ? "" : "",
    noteLines.length ? "未执行说明：" : "",
    ...noteLines,
    "",
    "自选基金池：",
    ...watchlistLines,
    "",
    `当前资产：${account.totalAsset}元，可用现金 ${account.cash}元，待确认申购 ${account.pendingBuyAmount || 0}元，应收赎回 ${account.receivableCash || 0}元，仓位 ${account.positionWeightPct}%`,
    `回撤预算：峰值 ${account.peakTotalAsset || account.totalAsset}元，当前距峰值 ${formatFallbackPct(account.drawdownFromPeakPct || 0)}，状态 ${account.riskBudget?.label || "回撤正常"}`,
    decision.riskNotes.length ? ["", "风险控制：", ...decision.riskNotes].join("\n") : "",
    decision.learningNotes.length ? ["", "回溯学习点：", ...decision.learningNotes].join("\n") : "",
    "",
    `数据来源：${(run.sources || []).slice(0, 6).join("；") || "公开市场快照与基金公开资料"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPortfolioValuationCard({ review, account, positionUpdates, lifecycle = {}, run }) {
  const updateLines = positionUpdates.length
    ? positionUpdates.map((item) => {
        const nav = item.latestNav ? `，净值 ${item.latestNav}${item.navDate ? `（${item.navDate}）` : ""}` : "";
        const trend = item.trend ? `，走势 ${item.trend}` : "";
        return `${item.code} ${item.name}：${item.beforeValue} -> ${item.afterValue}，今日 ${formatSignedNumber(item.dayPnl)}元${nav}${trend}`;
      })
    : ["当前没有持仓，净值复盘只更新现金账户。"];

  return [
    `虚拟基金经理晚间复盘 ${run.date}`,
    "",
    `复盘结论：${review.summary}`,
    review.reason ? `原因：${review.reason}` : "",
    "",
    "持仓估值：",
    ...updateLines,
    lifecycle.orderUpdates?.length ? "" : "",
    lifecycle.orderUpdates?.length ? "订单进度：" : "",
    ...(lifecycle.orderUpdates || []).map((item) => `${item.side} ${item.code} ${item.name}：${item.beforeStatus} -> ${item.afterStatus}，估值日 ${item.priceDate}，确认日 ${item.confirmDate}`),
    lifecycle.transactions?.length ? "" : "",
    lifecycle.transactions?.length ? "确认成交：" : "",
    ...(lifecycle.transactions || []).map((item) => `${item.side} ${item.code} ${item.name} ${item.amount}元，净值 ${item.nav}，份额 ${item.units}`),
    lifecycle.settlementEvents?.length ? "" : "",
    lifecycle.settlementEvents?.length ? "到账更新：" : "",
    ...(lifecycle.settlementEvents || []).map((item) => `${item.code} ${item.name} ${item.amount}元已到账。`),
    "",
    `总资产：${account.totalAsset}元`,
    `今日盈亏：${formatSignedNumber(account.dayPnl)}元`,
    `累计盈亏：${formatSignedNumber(account.cumulativePnl)}元（按实际投入成本 ${account.investedCost || 0} 元计 ${formatSignedNumber(account.cumulativePnlPct)}%）`,
    `可用现金：${account.cash}元，待确认申购：${account.pendingBuyAmount || 0}元，应收赎回：${account.receivableCash || 0}元，仓位：${account.positionWeightPct}%`,
    `回撤预算：峰值 ${account.peakTotalAsset || account.totalAsset}元，当前距峰值 ${formatFallbackPct(account.drawdownFromPeakPct || 0)}，状态 ${account.riskBudget?.label || "回撤正常"}`,
    review.nextWatch.length ? ["", "明日观察：", ...review.nextWatch].join("\n") : "",
    review.learningNotes.length ? ["", "回溯学习点：", ...review.learningNotes].join("\n") : "",
    "",
    `数据来源：${(run.sources || []).slice(0, 6).join("；") || "基金公开净值与持仓资料"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPortfolioPremarketCard({ observation, watchlistUpdates = [], account, activeOrders = [], lifecycle = {}, run }) {
  const orderLines = activeOrders.length
    ? activeOrders.slice(0, 8).map((order) => `${order.side} ${order.code} ${order.name}：${order.status}，估值日 ${order.priceDate}，确认日 ${order.confirmDate}`)
    : ["暂无未完成订单。"];
  const watchlistLines = watchlistUpdates.length
    ? watchlistUpdates.slice(0, 8).map(formatPortfolioWatchLine)
    : ["盘前未更新自选基金池。"];

  return [
    `虚拟基金经理盘前观察 ${run.date}`,
    "",
    `盘前结论：${observation.summary}`,
    observation.marketTone ? `市场姿态：${observation.marketTone}` : "",
    observation.afternoonDecisionBias ? `下午决策偏向：${observation.afternoonDecisionBias}` : "",
    "",
    "持仓关注：",
    ...(observation.positionFocus.length ? observation.positionFocus : ["当前无特别持仓关注点。"]),
    "",
    "今日观察计划：",
    ...(observation.todayPlan.length ? observation.todayPlan : ["等待公开数据和下午决策任务。"]),
    observation.riskAlerts.length ? "" : "",
    observation.riskAlerts.length ? "风险提醒：" : "",
    ...observation.riskAlerts,
    "",
    "自选基金池：",
    ...watchlistLines,
    "",
    "订单状态：",
    ...orderLines,
    lifecycle.orderUpdates?.length ? "" : "",
    lifecycle.orderUpdates?.length ? "隔夜订单更新：" : "",
    ...(lifecycle.orderUpdates || []).map((item) => `${item.side} ${item.code} ${item.name}：${item.beforeStatus} -> ${item.afterStatus}`),
    "",
    `当前资产：${account.totalAsset}元，可用现金 ${account.cash}元，仓位 ${account.positionWeightPct}%`,
    "",
    `数据来源：${(run.sources || []).slice(0, 6).join("；") || "公开市场快照与组合账本"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPortfolioWeeklyCard({ weekly, weeklyContext, watchlistUpdates = [], account, run }) {
  const watchlistLines = watchlistUpdates.length
    ? watchlistUpdates.slice(0, 10).map(formatPortfolioWatchLine)
    : weekly.watchlist;
  return [
    `虚拟基金经理周计划与总结 ${weeklyContext.startDate} 至 ${weeklyContext.endDate}`,
    "",
    `周总结：${weekly.summary}`,
    "",
    "盈亏归因：",
    ...(weekly.pnlAttribution.length ? weekly.pnlAttribution : ["本周暂无足够成交或估值变化可归因。"]),
    "",
    "操作复盘：",
    ...(weekly.operationReview.length ? weekly.operationReview : ["本周没有形成明确操作样本。"]),
    weekly.disciplineReview.length ? "" : "",
    weekly.disciplineReview.length ? "纪律执行：" : "",
    ...weekly.disciplineReview,
    weekly.mistakes.length ? "" : "",
    weekly.mistakes.length ? "错误与不足：" : "",
    ...weekly.mistakes,
    "",
    "下周计划：",
    ...(weekly.nextWeekPlan.length ? weekly.nextWeekPlan : ["等待下周盘前观察和每日决策任务更新。"]),
    watchlistLines.length ? "" : "",
    watchlistLines.length ? "自选基金池：" : "",
    ...watchlistLines,
    weekly.riskNotes.length ? "" : "",
    weekly.riskNotes.length ? "风险提醒：" : "",
    ...weekly.riskNotes,
    "",
    `本周运行：${weeklyContext.runs.length} 次任务，${weeklyContext.orders.length} 张订单，${weeklyContext.transactions.length} 笔流水。`,
    `当前资产：${account.totalAsset}元，可用现金 ${account.cash}元，仓位 ${account.positionWeightPct}%`,
    "",
    `数据来源：${(run.sources || []).slice(0, 6).join("；") || "组合账本与基金公开资料"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPortfolioWatchLine(item = {}) {
  const head = `${item.code || ""} ${item.name || ""}`.trim();
  const status = item.statusText || formatPortfolioWatchStatus(item.status);
  const reason = item.reason ? `：${item.reason}` : "";
  const trigger = item.buyTriggers?.length ? `；触发=${item.buyTriggers.slice(0, 2).join(" / ")}` : "";
  const risk = item.riskNotes?.length ? `；风险=${item.riskNotes.slice(0, 2).join(" / ")}` : "";
  const fee = item.feeNotes?.length ? `；费用=${item.feeNotes.slice(0, 1).join(" / ")}` : "";
  return `${head}（${status}，优先级${item.priority || 3}）${reason}${trigger}${risk}${fee}`;
}

function buildPortfolioWatchlistStatusLines(watchlist = [], options = {}) {
  const normalized = normalizePortfolioWatchlist(watchlist).filter((item) => item.status !== "removed");
  if (!normalized.length) return ["暂无自选基金。"];
  const limitPerStatus = Math.max(1, Number(options.limitPerStatus || 4));
  const statusOrder = ["ready", "waiting_pullback", "watch", "blocked", "in_position"];
  const groups = statusOrder
    .map((status) => ({
      status,
      label: formatPortfolioWatchStatus(status),
      items: normalized.filter((item) => item.status === status)
    }))
    .filter((group) => group.items.length);
  const lines = [
    `合计 ${normalized.length} 只：${groups.map((group) => `${group.label}${group.items.length}只`).join("，")}。`
  ];
  lines.push(...buildPortfolioWatchlistLaunchEveLines(normalized));
  lines.push(...buildPortfolioWatchlistActionQueueLines(normalized));

  for (const group of groups) {
    lines.push(`【${group.label}】${group.items.length}只`);
    for (const rawItem of group.items.slice(0, limitPerStatus)) {
      lines.push(formatPortfolioWatchDetailLine(summarizePortfolioWatchItem(rawItem)));
    }
    if (group.items.length > limitPerStatus) {
      lines.push(`还有 ${group.items.length - limitPerStatus} 只同状态候选，可在管理页自选基金池查看。`);
    }
  }
  return lines;
}

function buildPortfolioWatchlistLaunchEveLines(watchlist = []) {
  const focusItems = normalizePortfolioWatchlist(watchlist)
    .filter((item) => isLowBaseLaunchWatchSeed(item))
    .filter((item) => !["blocked", "removed", "in_position"].includes(item.status))
    .map((item) => ({ ...item, ...evaluatePortfolioWatchReadiness(item) }))
    .sort(comparePortfolioWatchReadiness)
    .slice(0, 3);
  if (!focusItems.length) return [];
  const lines = ["启动前夜重点复核："];
  for (const item of focusItems) {
    const gap = item.gaps?.[0] || buildPortfolioWatchReadinessGaps(item)[0] || "等待净值下钻确认";
    const trigger = item.buyTriggers?.[0] || "下一次净值更新后复核是否低位转强";
    lines.push(`- ${item.code} ${item.name || ""}（准备度${item.score}，${item.label}）：${gap}；触发=${trigger}；纪律=等净值下钻确认后再进入买点评估，不自动买入。`);
  }
  return lines;
}

function buildPortfolioWatchlistActionQueueLines(watchlist = []) {
  const ready = normalizePortfolioWatchlist(watchlist)
    .filter((item) => item.status === "ready")
    .map((item) => ({ ...item, ...evaluatePortfolioWatchReadiness(item) }))
    .sort(comparePortfolioWatchReadiness)
    .slice(0, 3);
  const waiting = normalizePortfolioWatchlist(watchlist)
    .filter((item) => item.status === "waiting_pullback")
    .map((item) => ({ ...item, ...evaluatePortfolioWatchReadiness(item) }))
    .sort(comparePortfolioWatchReadiness)
    .slice(0, 3);
  if (!ready.length && !waiting.length) return ["购买准备队列：暂无接近可买或等待回调候选。"];
  const lines = ["购买准备队列："];
  for (const item of [...ready, ...waiting]) {
    const status = item.status === "ready" ? "接近可买" : "等待回调";
    const trigger = item.buyTriggers?.[0] || item.positionPlan || "等待下一次复查";
    const risk = item.riskNotes?.[0] || "风险边界待补充";
    const gap = item.gaps?.[0] || buildPortfolioWatchReadinessGaps(item)[0] || "等待下一次复查";
    lines.push(`- ${item.code} ${item.name || ""}（${status}，准备度${item.score}，${item.label}）：触发=${trigger}；缺口=${gap}；风险=${risk}；复查=${item.reviewDate || "下一次盘前观察"}`);
  }
  return lines;
}

function formatPortfolioWatchDetailLine(item = {}) {
  const head = `${item.code || ""} ${item.name || ""}`.trim();
  const readiness = item.readinessScore === undefined ? evaluatePortfolioWatchReadiness(item) : { score: item.readinessScore, label: item.readinessLabel || "" };
  const meta = [
    item.shareClass ? `${item.shareClass}类` : "",
    item.type || "",
    item.candidateRole || "",
    `准备度${readiness.score}${readiness.label ? `/${readiness.label}` : ""}`,
    `优先级${item.priority || 3}`
  ].filter(Boolean).join("，");
  const trendEvidence = formatPortfolioWatchSnapshotEvidence(item.lastSnapshot || {});
  const parts = [
    `${head}${meta ? `（${meta}）` : ""}`,
    item.reason ? `备选理由：${item.reason}` : "",
    item.setupEvidence?.length ? `证据：${item.setupEvidence.slice(0, 3).join("；")}` : "",
    item.buyTriggers?.length ? `触发：${item.buyTriggers.slice(0, 2).join("；")}` : "",
    item.riskNotes?.length ? `风险边界：${item.riskNotes.slice(0, 2).join("；")}` : "",
    item.feeNotes?.length ? `费用/份额：${item.feeNotes.slice(0, 2).join("；")}` : "",
    item.alternativeShareClasses?.length ? `替代份额：${formatPortfolioWatchAlternativesText(item.alternativeShareClasses)}` : "",
    item.sameExposureAlternatives?.length ? `同类替代：${formatPortfolioWatchAlternativesText(item.sameExposureAlternatives)}` : "",
    item.positionPlan ? `仓位计划：${item.positionPlan}` : "",
    item.readinessGaps?.length ? `买入缺口：${item.readinessGaps.slice(0, 3).join("；")}` : "",
    trendEvidence ? `最新走势：${trendEvidence}` : "",
    item.reviewDate ? `复查：${item.reviewDate}` : ""
  ].filter(Boolean);
  return `- ${parts.join("；")}`;
}

function formatPortfolioWatchAlternativesText(items = []) {
  return (items || [])
    .slice(0, 3)
    .map((item) => [item.code, item.name || "", item.shareClass ? `${item.shareClass}类` : "", item.statusText || formatPortfolioWatchStatus(item.status)].filter(Boolean).join(" "))
    .join(" / ");
}

function formatPortfolioWatchSnapshotEvidence(snapshot = {}) {
  const trend = snapshot.trendProfile || {};
  return [
    snapshot.trendSummary && snapshot.trendSummary !== "走势数据不足" ? snapshot.trendSummary : "",
    snapshot.nav ? `净值${snapshot.nav}${snapshot.navDate ? `（${snapshot.navDate}）` : ""}` : "",
    Number.isFinite(Number(trend.lowPositionPct120)) ? `120日位置${round(Number(trend.lowPositionPct120), 1)}%` : "",
    Number.isFinite(Number(trend.drawdownFromRecentHighPct)) ? `距高点${formatSignedNumber(trend.drawdownFromRecentHighPct)}%` : ""
  ].filter(Boolean).join("，");
}

function buildPortfolioManagerProfileContext(config, db = null) {
  const schedule = [
    `盘前观察：${config.portfolioPremarketTime || "09:00"}`,
    `操作决策：${config.portfolioDecisionTime || "14:20"}`,
    `晚间复盘：${config.portfolioReviewTime || "21:30"}`,
    `周计划与总结：每${formatWeekdayLabel(config.portfolioWeeklyReviewDay)} ${config.portfolioWeeklyReviewTime || "16:30"}`
  ].join("；");
  const behavior = db ? summarizePortfolioManagerBehavior(db) : null;
  return [
    `规定性画像：${normalizePortfolioManagerProfile(config.portfolioManagerProfile)}`,
    `风险风格：${config.portfolioRiskProfile || "balanced"}`,
    `自动汇报节奏：${schedule}`,
    behavior ? `账本行为画像：${JSON.stringify(behavior, null, 2)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizePortfolioManagerProfile(value) {
  const text = String(value || "").trim();
  return (text || DEFAULT_PORTFOLIO_MANAGER_PROFILE).slice(0, 4000);
}

function summarizePortfolioManagerBehavior(db) {
  const account = summarizePortfolioAccount(db.account || createPortfolioAccount(getEffectiveConfig()));
  const transactions = (db.transactions || []).filter((item) => ["BUY", "SELL"].includes(item.side)).slice(-50);
  const buys = transactions.filter((item) => item.side === "BUY");
  const sells = transactions.filter((item) => item.side === "SELL");
  const recentRuns = (db.runs || []).slice(-20);
  const recentOrders = (db.orders || []).slice(-30);
  const watchlist = getActivePortfolioWatchlist(db);
  return {
    currentPositionWeightPct: account.positionWeightPct,
    currentCash: account.cash,
    accountDrawdownFromPeakPct: account.drawdownFromPeakPct,
    accountRiskBudgetLevel: account.riskBudget?.level || "normal",
    accountRiskBudgetLabel: account.riskBudget?.label || "回撤正常",
    watchlistCount: watchlist.length,
    readyWatchlistCount: watchlist.filter((item) => item.status === "ready").length,
    waitingWatchlistCount: watchlist.filter((item) => item.status === "waiting_pullback").length,
    recentTradeCount: transactions.length,
    recentBuyCount: buys.length,
    recentSellCount: sells.length,
    averageBuyAmount: averageAmount(buys),
    averageSellAmount: averageAmount(sells),
    activeOrderCount: recentOrders.filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status)).length,
    latestRunTypes: recentRuns.slice(-6).map((run) => `${run.date || ""}:${run.type || ""}:${run.status || ""}`).filter(Boolean)
  };
}

function averageAmount(items) {
  if (!items.length) return 0;
  return round(items.reduce((sum, item) => sum + Number(item.amount || 0), 0) / items.length, 2);
}

function buildPortfolioWeeklyContext(db, endDate) {
  const startDate = addDays(endDate, -6);
  const inRange = (item) => isDateStringInRange(item.date || item.submitDate || item.createdAt || item.startedAt || item.completedAt, startDate, endDate);
  return {
    startDate,
    endDate,
    runs: (db.runs || []).filter(inRange).map(summarizePortfolioRunBrief),
    orders: (db.orders || []).filter(inRange).map(summarizePortfolioOrder),
    transactions: (db.transactions || []).filter(inRange).slice(-50),
    settlements: (db.settlements || []).filter(inRange).slice(-30),
    equity: (db.dailyEquity || []).filter(inRange).slice(-10),
    account: summarizePortfolioAccount(db.account)
  };
}

function isDateStringInRange(value, startDate, endDate) {
  const date = extractDateOnly(value);
  return Boolean(date && date >= startDate && date <= endDate);
}

function extractDateOnly(value) {
  return String(value || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
}

function buildPortfolioStatusAnswer(userText, intent) {
  const db = readPortfolioDb();
  const config = getEffectiveConfig();
  ensurePortfolioAccount(db, config);
  const account = summarizePortfolioAccount(db.account);
  const recentDecision = [...(db.runs || [])]
    .reverse()
    .find((run) => run.type === "decision" && run.status === "completed");
  const recentValuation = [...(db.runs || [])]
    .reverse()
    .find((run) => run.type === "valuation" && run.status === "completed");
  const today = getZonedDateTime(config.portfolioTimezone).date;
  const todayRuns = [...(db.runs || [])].filter((run) => run.date === today && run.status === "completed");
  const todayTransactions = [...(db.transactions || [])].filter((item) => item.date === today && ["BUY", "SELL"].includes(item.side));
  const positions = account.positions || [];
  const wantsOperation = isPortfolioOperationQuestion(userText);
  const wantsPosition = isPortfolioPositionQuestion(userText);
  const wantsWatchlist = isPortfolioWatchlistQuestion(userText);
  const wantsSchedule = isPortfolioScheduleQuestion(userText);
  const wantsProfile = isPortfolioProfileQuestion(userText);
  const wantsOnlyProfileOrSchedule = (wantsSchedule || wantsProfile) && !wantsOperation && !wantsPosition && !wantsWatchlist;

  const lines = ["虚拟基金经理账本"];
  lines.push("");
  if (wantsSchedule || wantsProfile) {
    lines.push("自动汇报节奏：");
    lines.push(`盘前观察：每天 ${config.portfolioPremarketTime}，只观察市场和持仓，不下单。`);
    lines.push(`操作决策：每天 ${config.portfolioDecisionTime}，生成今日手法并提交虚拟申购/赎回申请。`);
    lines.push(`晚间复盘：每天 ${config.portfolioReviewTime}，处理订单确认、估值和当日复盘。`);
    lines.push(`周计划与总结：每${formatWeekdayLabel(config.portfolioWeeklyReviewDay)} ${config.portfolioWeeklyReviewTime}，总结本周并规划下周。`);
    lines.push(`时区：${config.portfolioTimezone}。`);
    lines.push("");
  }
  if (wantsProfile) {
    const behavior = summarizePortfolioManagerBehavior(db);
    lines.push("基金经理画像：");
    lines.push(`规定性画像：${normalizePortfolioManagerProfile(config.portfolioManagerProfile)}`);
    lines.push(`当前配置风格：${config.portfolioRiskProfile || "balanced"}。`);
    lines.push(
      `账本行为画像：当前仓位 ${behavior.currentPositionWeightPct}%，可用现金 ${behavior.currentCash}元；` +
        `自选基金 ${behavior.watchlistCount} 只，其中接近可买 ${behavior.readyWatchlistCount} 只、等待回调 ${behavior.waitingWatchlistCount} 只；` +
        `最近 ${behavior.recentTradeCount} 笔确认交易，买入 ${behavior.recentBuyCount} 笔、卖出 ${behavior.recentSellCount} 笔；` +
        `平均买入 ${behavior.averageBuyAmount}元，平均卖出 ${behavior.averageSellAmount}元，未完成订单 ${behavior.activeOrderCount} 张。`
    );
    lines.push("");
  }
  if (wantsOnlyProfileOrSchedule) {
    lines.push(`当前自动运行：${config.portfolioEnabled ? "已启用" : "已停用"}。`);
  } else {
    lines.push(`总资产：${account.totalAsset}元`);
    lines.push(`可用现金：${account.cash}元`);
    if (account.pendingBuyAmount || account.receivableCash) {
      lines.push(`待确认申购：${account.pendingBuyAmount || 0}元，应收赎回：${account.receivableCash || 0}元`);
    }
    lines.push(`当前仓位：${account.positionWeightPct}%`);
    lines.push(`累计盈亏：${formatSignedNumber(account.cumulativePnl)}元（按实际投入成本 ${account.investedCost || 0} 元计 ${formatSignedNumber(account.cumulativePnlPct)}%）`);
  }

  if (wantsPosition || (!wantsOperation && !wantsOnlyProfileOrSchedule && !wantsWatchlist)) {
    lines.push("");
    lines.push("当前持仓：");
    if (positions.length) {
      for (const position of positions) {
        lines.push(
          `${position.code} ${position.name || ""}：${position.currentValue}元，占比 ${position.weightPct}%` +
            `，浮动盈亏 ${formatSignedNumber(position.unrealizedPnl)}元（${formatSignedNumber(position.unrealizedPnlPct)}%）`
        );
        const snapshot = position.fundSnapshot || {};
        const navLine = [
          snapshot.nav ? `净值 ${snapshot.nav}` : position.lastNav ? `净值 ${position.lastNav}` : "",
          snapshot.navDate || position.lastNavDate ? `日期 ${snapshot.navDate || position.lastNavDate}` : "",
          position.units ? `份额 ${position.units}` : "",
          position.averageCostNav ? `成本净值 ${position.averageCostNav}` : ""
        ].filter(Boolean);
        if (navLine.length) {
          lines.push(navLine.join("，"));
        }
        if (snapshot.trendSummary) {
          lines.push(`走势/风险：${snapshot.trendSummary}`);
        }
        if (position.lastReason) {
          lines.push(`理由：${position.lastReason}`);
        }
      }
    } else {
      lines.push("暂无基金持仓，当前为 100% 现金。");
    }
  }

  if (wantsWatchlist || (!wantsOperation && !wantsOnlyProfileOrSchedule)) {
    const watchlist = getActivePortfolioWatchlist(db);
    lines.push("");
    lines.push("自选基金池：");
    if (watchlist.length) {
      lines.push(...buildPortfolioWatchlistStatusLines(watchlist, { limitPerStatus: wantsWatchlist ? 5 : 3 }));
    } else {
      lines.push("暂无自选基金。下一次盘前观察、今日操作或周总结会开始沉淀候选池。");
    }
  }

  if (wantsOperation || todayRuns.length || todayTransactions.length) {
    lines.push("");
    lines.push(`今日操作 ${today}：`);
    if (todayTransactions.length) {
      for (const item of todayTransactions) {
        const tradeDetail = [
          `${item.side} ${item.code || ""} ${item.name || ""} ${item.amount}元`,
          item.nav ? `净值${item.nav}` : "",
          item.units ? `份额${item.units}` : ""
        ].filter(Boolean).join("，");
        lines.push(`${tradeDetail}：${item.reason || "见当日投委会记录"}`);
      }
    } else if (recentDecision?.date === today) {
      lines.push("今天已生成投委会决策，但买入/卖出需要经过申购/赎回申请、估值日净值、确认日，不会下单即成交。");
    } else {
      lines.push("今天还没有生成新的买入/卖出流水。可以在后台“虚拟组合”页点击“生成今日操作”，或等定时任务自动运行。");
    }

    const activeOrders = (db.orders || []).filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status));
    if (activeOrders.length) {
      lines.push("");
      lines.push("待处理订单：");
      for (const order of activeOrders.slice(0, 8)) {
        lines.push(
          `${order.side} ${order.code} ${order.name} ${order.amount}元：${order.status}，估值日 ${order.priceDate}，确认日 ${order.confirmDate}` +
            `${order.settlementDate ? `，到账日 ${order.settlementDate}` : ""}`
        );
      }
    }

    if (recentDecision) {
      lines.push("");
      lines.push(`最近一次决策：${recentDecision.date}`);
      if (recentDecision.card) {
        lines.push(...recentDecision.card.split("\n").slice(2, 12));
      } else if (recentDecision.actions?.length) {
        for (const action of recentDecision.actions) {
          lines.push(`${action.action} ${action.code || ""} ${action.name || ""} ${action.amount || 0}元：${action.reason || ""}`);
        }
      }
    }
  }

  if (recentValuation) {
    lines.push("");
    lines.push(`最近复盘：${recentValuation.date}`);
    if (recentValuation.accountAfter) {
      lines.push(
        `复盘后资产 ${recentValuation.accountAfter.totalAsset}元，仓位 ${recentValuation.accountAfter.positionWeightPct}%` +
          `，累计盈亏 ${formatSignedNumber(recentValuation.accountAfter.cumulativePnl)}元。`
      );
    }
  }

  lines.push("");
  lines.push(`数据来源：服务器虚拟组合账本 ${path.basename(PORTFOLIO_DB_PATH)}。`);
  lines.push(`路由：${intent.reason || "portfolio_status"}。`);
  return lines.join("\n");
}

function getPortfolioPublicState(db = readPortfolioDb(), options = {}) {
  const config = getEffectiveConfig();
  const lightweight = Boolean(options.lightweight);
  ensurePortfolioAccount(db, config);
  const target = resolvePortfolioPushTarget(config, db);
  const recentRunLimit = lightweight ? 6 : 20;
  const recentItemLimit = lightweight ? 10 : 30;
  return {
    dbPath: PORTFOLIO_DB_PATH,
    enabled: Boolean(config.portfolioEnabled),
    lightweight,
    retentionDays: Number(config.portfolioRetentionDays || 90),
    scheduler: {
      premarketTime: config.portfolioPremarketTime,
      decisionTime: config.portfolioDecisionTime,
      reviewTime: config.portfolioReviewTime,
      weeklyReviewTime: config.portfolioWeeklyReviewTime,
      weeklyReviewDay: config.portfolioWeeklyReviewDay,
      timezone: config.portfolioTimezone,
      inFlight: portfolioRunInFlight,
      activeRunId: activePortfolioRunId || "",
      activeRunStartedAt: (db.runs || []).find((run) => run.id === activePortfolioRunId)?.startedAt || "",
      dbFlushPending: portfolioDbFlushPending || Boolean(portfolioDbFlushTimer) || portfolioDbFlushInFlight,
      dbFlushError: portfolioDbLastFlushError
    },
    pushTarget: target
      ? {
          receiveIdType: target.receiveIdType || "chat_id",
          receiveIdMasked: maskSecret(target.receiveId),
          label: target.label || ""
        }
      : null,
    knownPushTargets: (db.pushTargets || []).slice(lightweight ? -3 : -10).reverse().map((target) => ({
      receiveIdType: target.receiveIdType,
      receiveIdMasked: maskSecret(target.receiveId),
      label: target.label,
      firstSeenAt: target.firstSeenAt,
      lastSeenAt: target.lastSeenAt
    })),
    account: summarizePortfolioAccount(db.account),
    positions: db.account.positions.map(summarizePortfolioPosition),
    watchlist: getActivePortfolioWatchlist(db).slice(0, lightweight ? 12 : 50).map(summarizePortfolioWatchItem),
    activeOrders: (db.orders || []).filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status)).map(summarizePortfolioOrder),
    recentRuns: (db.runs || []).slice(-recentRunLimit).reverse().map(lightweight ? summarizePortfolioRunBrief : summarizePortfolioRun),
    recentOrders: (db.orders || []).slice(-recentItemLimit).reverse().map(summarizePortfolioOrder),
    recentTransactions: (db.transactions || []).slice(-recentItemLimit).reverse(),
    pendingSettlements: (db.settlements || []).filter((item) => item.status === "pending").slice(-20).reverse(),
    recentEquity: (db.dailyEquity || []).slice(-recentItemLimit).reverse()
  };
}

function summarizePortfolioRunBrief(run) {
  return {
    id: run.id,
    type: run.type,
    title: run.title || "",
    date: run.date,
    status: run.status,
    manual: run.manual,
    startedAt: run.startedAt,
    progressAt: run.progressAt || "",
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    summary: buildPortfolioRunSummary(run),
    error: run.error || ""
  };
}

function summarizePortfolioRun(run) {
  return {
    id: run.id,
    type: run.type,
    title: run.title || "",
    date: run.date,
    status: run.status,
    manual: run.manual,
    startedAt: run.startedAt,
    progressAt: run.progressAt || "",
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    summary: buildPortfolioRunSummary(run),
    card: run.card || "",
    actions: (run.actions || []).slice(0, 10),
    orders: (run.orders || []).slice(0, 10).map(summarizePortfolioOrder),
    transactions: (run.transactions || []).slice(0, 10),
    orderUpdates: (run.orderUpdates || []).slice(0, 10),
    executionNotes: (run.executionNotes || []).slice(0, 10),
    settlementEvents: (run.settlementEvents || []).slice(0, 10),
    sources: run.sources || [],
    push: run.push || null,
    error: run.error || ""
  };
}

function buildPortfolioRunSummary(run) {
  if (run.summary) return run.summary;
  if (run.status === "running") return "任务运行中，等待模型或公开数据源返回。";
  if (run.status === "cancelled") return run.error || "任务已手动结束。";
  if (run.error) return run.error;
  if (run.type === "decision") {
    const orders = run?.orders?.map((item) => `${item.side} ${item.code || ""} ${item.name || ""}`).filter(Boolean);
    if (orders?.length) return `提交订单：${orders.join("；")}`;
    const actions = run?.actions?.map((item) => `${item.action} ${item.code || ""} ${item.name || ""}`).filter(Boolean);
    if (actions?.length) return actions.join("；");
  }
  if (run.type === "valuation" && run?.positionUpdates?.length) {
    return `估值更新 ${run.positionUpdates.length} 个持仓`;
  }
  if (run.type === "premarket" && run?.observation?.summary) {
    return run.observation.summary;
  }
  if (run.type === "weekly" && run?.weekly?.summary) {
    return run.weekly.summary;
  }
  return run?.card?.split("\n")?.find((line) => line.trim()) || "无摘要";
}

function summarizePortfolioOrder(order) {
  return {
    id: order.id,
    side: order.side,
    status: order.status,
    code: order.code,
    name: order.name,
    amount: order.amount,
    requestedUnits: order.requestedUnits || 0,
    submittedAt: order.submittedAt,
    submitDate: order.submitDate,
    acceptedDate: order.acceptedDate,
    priceDate: order.priceDate,
    confirmDate: order.confirmDate,
    settlementDate: order.settlementDate || "",
    cutoffTime: order.cutoffTime,
    beforeCutoff: order.beforeCutoff,
    scheduleReason: order.scheduleReason,
    tradingProfile: order.tradingProfile,
    limitCheck: order.limitCheck,
    navSnapshot: order.navSnapshot,
    reason: order.reason,
    timeline: order.timeline || []
  };
}

function resetPortfolioAccount(initialCapital, options = {}) {
  const config = getEffectiveConfig();
  const db = readPortfolioDb();
  const activeRunId = activePortfolioRunId;
  if (activeRunId) {
    cancelledPortfolioRunIds.add(activeRunId);
  }
  db.account = createPortfolioAccount({
    ...config,
    portfolioInitialCapital: Number(initialCapital || config.portfolioInitialCapital || 100000)
  });
  if (options.clearHistory !== false) {
    db.runs = [];
    db.orders = [];
    db.transactions = [];
    db.settlements = [];
    db.dailyEquity = [];
    db.watchlist = [];
    db.scheduler = {};
  } else {
    db.orders = [];
    db.settlements = [];
    db.transactions.push({
      id: createId("txn"),
      side: "RESET",
      date: getZonedDateTime(config.portfolioTimezone).date,
      createdAt: new Date().toISOString(),
      amount: db.account.initialCapital,
      reason: "管理后台重置虚拟组合。"
    });
  }
  portfolioRunInFlight = false;
  activePortfolioRunId = "";
  for (const runId of [...cancelledPortfolioRunIds]) {
    if (runId !== activeRunId) {
      cancelledPortfolioRunIds.delete(runId);
    }
  }
  db.updatedAt = new Date().toISOString();
  writePortfolioDb(db);
  updateStats({ counters: { portfolioResets: 1 }, last: { lastPortfolioResetAt: db.updatedAt } });
  return getPortfolioPublicState(db);
}

function prunePortfolioDatabase() {
  const config = getEffectiveConfig();
  const db = readPortfolioDb();
  const removed = prunePortfolioDb(db, config.portfolioRetentionDays);
  db.updatedAt = new Date().toISOString();
  writePortfolioDb(db);
  updateStats({
    counters: { portfolioPruneRuns: 1, portfolioPrunedItems: removed },
    last: { lastPortfolioPruneAt: db.updatedAt }
  });
  return getPortfolioPublicState(db);
}

function prunePortfolioDb(db, retentionDays) {
  const days = Math.max(7, Number(retentionDays || 90));
  const cutoff = Date.now() - days * 86400000;
  let removed = 0;
  for (const key of ["runs", "orders", "transactions", "settlements", "dailyEquity"]) {
    const before = Array.isArray(db[key]) ? db[key].length : 0;
    db[key] = keepRecentPortfolioItems(db[key], cutoff, 10, key === "orders" || key === "settlements");
    removed += before - db[key].length;
  }
  return removed;
}

function keepRecentPortfolioItems(items, cutoff, keepLatest, keepActive = false) {
  const input = Array.isArray(items) ? items : [];
  const tail = new Set(input.slice(-keepLatest).map((item) => item.id || item.startedAt || item.createdAt));
  return input.filter((item) => {
    const key = item.id || item.startedAt || item.createdAt;
    if (tail.has(key)) return true;
    if (keepActive && !["confirmed", "cancelled", "rejected", "settled"].includes(item.status)) return true;
    const time = Date.parse(item.completedAt || item.createdAt || item.startedAt || `${item.date || ""}T00:00:00Z`);
    return !Number.isFinite(time) || time >= cutoff;
  });
}

function readPortfolioDb() {
  if (portfolioDbCache) {
    if (repairStalePortfolioRuns(portfolioDbCache)) {
      writePortfolioDb(portfolioDbCache);
    }
    return portfolioDbCache;
  }
  const db = normalizePortfolioDb(safeReadJson(PORTFOLIO_DB_PATH));
  portfolioDbCache = db;
  if (db[PORTFOLIO_DB_REPAIRED]) {
    writePortfolioDb(db);
  }
  return db;
}

function writePortfolioDb(db) {
  portfolioDbCache = compactPortfolioDbForStorage(db);
  portfolioDbFlushPending = true;
  if (portfolioDbFlushTimer || portfolioDbFlushInFlight) {
    return;
  }
  portfolioDbFlushTimer = setTimeout(() => {
    portfolioDbFlushTimer = null;
    flushPortfolioDbAsync().catch((error) => {
      portfolioDbLastFlushError = error.message;
      console.error("[portfolio-db-write-error]", error);
    });
  }, Math.max(50, Number(process.env.PORTFOLIO_DB_FLUSH_DELAY_MS || 1000)));
  portfolioDbFlushTimer.unref?.();
}

async function flushPortfolioDbAsync() {
  if (portfolioDbFlushInFlight) {
    portfolioDbFlushPending = true;
    return;
  }
  portfolioDbFlushInFlight = true;
  try {
    while (portfolioDbFlushPending) {
      portfolioDbFlushPending = false;
      const db = portfolioDbCache || normalizePortfolioDb(safeReadJson(PORTFOLIO_DB_PATH));
      const body = `${JSON.stringify(compactPortfolioDbForStorage(db))}\n`;
      ensureDir(path.dirname(PORTFOLIO_DB_PATH));
      await fs.promises.writeFile(PORTFOLIO_DB_PATH, body, "utf8");
      portfolioDbLastFlushError = "";
    }
  } finally {
    portfolioDbFlushInFlight = false;
    if (portfolioDbFlushPending && !portfolioDbFlushTimer) {
      writePortfolioDb(portfolioDbCache);
    }
  }
}

function flushPortfolioDbSync() {
  if (!portfolioDbCache) return;
  ensureDir(path.dirname(PORTFOLIO_DB_PATH));
  fs.writeFileSync(PORTFOLIO_DB_PATH, `${JSON.stringify(compactPortfolioDbForStorage(portfolioDbCache))}\n`, "utf8");
  portfolioDbFlushPending = false;
  portfolioDbLastFlushError = "";
}

function compactPortfolioDbForStorage(db) {
  if (!db || typeof db !== "object") {
    return db;
  }
  const maxRuns = Math.max(20, Number(process.env.PORTFOLIO_DB_MAX_RUNS || 120));
  const maxList = Math.max(50, Number(process.env.PORTFOLIO_DB_MAX_LIST_ITEMS || 300));
  const maxWatchlist = Math.max(20, Number(process.env.PORTFOLIO_DB_MAX_WATCHLIST_ITEMS || 100));
  if (Array.isArray(db.runs) && db.runs.length > maxRuns) {
    db.runs = db.runs.slice(-maxRuns);
  }
  if (Array.isArray(db.watchlist)) {
    db.watchlist = normalizePortfolioWatchlist(db.watchlist).slice(0, maxWatchlist);
  }
  for (const key of ["orders", "transactions", "settlements", "dailyEquity"]) {
    if (Array.isArray(db[key]) && db[key].length > maxList) {
      db[key] = db[key].slice(-maxList);
    }
  }
  for (const run of db.runs || []) {
    if (typeof run.rawModelOutput === "string" && run.rawModelOutput.length > 4000) {
      run.rawModelOutput = `${run.rawModelOutput.slice(0, 4000)}\n...(truncated)`;
    }
    if (typeof run.card === "string" && run.card.length > 12000) {
      run.card = `${run.card.slice(0, 12000)}\n...(truncated)`;
    }
    if (Array.isArray(run.sources)) run.sources = run.sources.slice(0, 30);
    if (Array.isArray(run.actions)) run.actions = run.actions.slice(0, 20);
    if (Array.isArray(run.orders)) run.orders = run.orders.slice(0, 20);
    if (Array.isArray(run.transactions)) run.transactions = run.transactions.slice(0, 20);
    if (Array.isArray(run.executionNotes)) run.executionNotes = run.executionNotes.slice(0, 30);
  }
  return db;
}

function normalizePortfolioDb(value) {
  const config = getEffectiveConfig();
  const now = new Date().toISOString();
  const db = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    account: createPortfolioAccount(config),
    pushTargets: [],
    watchlist: [],
    runs: [],
    orders: [],
    transactions: [],
    settlements: [],
    dailyEquity: [],
    scheduler: {},
    ...value
  };
  db.pushTargets = Array.isArray(db.pushTargets) ? db.pushTargets : [];
  db.watchlist = normalizePortfolioWatchlist(db.watchlist || db.selfSelectedFunds || db.candidatePool || []);
  db.runs = Array.isArray(db.runs) ? db.runs : [];
  db.orders = Array.isArray(db.orders) ? db.orders : [];
  db.transactions = Array.isArray(db.transactions) ? db.transactions : [];
  db.settlements = Array.isArray(db.settlements) ? db.settlements : [];
  db.dailyEquity = Array.isArray(db.dailyEquity) ? db.dailyEquity : [];
  db.scheduler = db.scheduler && typeof db.scheduler === "object" ? db.scheduler : {};
  ensurePortfolioAccount(db, config);
  if (repairStalePortfolioRuns(db)) {
    db[PORTFOLIO_DB_REPAIRED] = true;
  }
  return db;
}

function repairStalePortfolioRuns(db) {
  const staleMs = Number(process.env.PORTFOLIO_RUN_STALE_MINUTES || 180) * 60_000;
  const now = Date.now();
  let repaired = false;
  for (const run of db.runs || []) {
    if (run.status !== "running") continue;
    const isActiveInThisProcess = portfolioRunInFlight && activePortfolioRunId === run.id;
    if (!isActiveInThisProcess) {
      run.status = "interrupted";
      run.error = "服务已重启或运行任务已丢失，已自动标记为中断。";
      run.completedAt = new Date().toISOString();
      const started = Date.parse(run.startedAt || "");
      run.durationMs = Number.isFinite(started) ? now - started : 0;
      repaired = true;
      continue;
    }
    const progressAt = Date.parse(run.progressAt || run.updatedAt || run.startedAt || "");
    if (!Number.isFinite(progressAt) || now - progressAt > staleMs) {
      run.status = "interrupted";
      run.error = "任务超时未完成，已自动标记为中断。";
      run.completedAt = new Date().toISOString();
      const started = Date.parse(run.startedAt || "");
      run.durationMs = Number.isFinite(started) ? now - started : 0;
      if (activePortfolioRunId === run.id) {
        cancelledPortfolioRunIds.add(run.id);
        portfolioRunInFlight = false;
        activePortfolioRunId = "";
      }
      repaired = true;
    }
  }
  if (repaired) {
    db.updatedAt = new Date().toISOString();
  }
  return repaired;
}

function ensurePortfolioAccount(db, config = getEffectiveConfig()) {
  if (!db.account || typeof db.account !== "object") {
    db.account = createPortfolioAccount(config);
  }
  db.account.initialCapital = Number(db.account.initialCapital || config.portfolioInitialCapital || 100000);
  db.account.cash = round(Number(db.account.cash ?? db.account.initialCapital), 2);
  db.account.pendingBuyAmount = round(Number(db.account.pendingBuyAmount || 0), 2);
  db.account.receivableCash = round(Number(db.account.receivableCash || 0), 2);
  db.account.positions = Array.isArray(db.account.positions) ? db.account.positions.map(normalizePortfolioPosition).filter(Boolean) : [];
  recalculatePortfolioAccount(db.account);
  return db.account;
}

function createPortfolioAccount(config) {
  const initialCapital = round(Number(config.portfolioInitialCapital || 100000), 2);
  return {
    initialCapital,
    cash: initialCapital,
    pendingBuyAmount: 0,
    receivableCash: 0,
    positions: [],
    investedValue: 0,
    investedCost: 0,
    totalAsset: initialCapital,
    peakTotalAsset: initialCapital,
    peakTotalAssetDate: new Date().toISOString().slice(0, 10),
    drawdownFromPeakPct: 0,
    riskBudget: buildPortfolioAccountRiskBudget({ totalAsset: initialCapital, peakTotalAsset: initialCapital }),
    positionWeightPct: 0,
    dayPnl: 0,
    cumulativePnl: 0,
    cumulativePnlPct: 0,
    capitalPnlPct: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizePortfolioPosition(position) {
  if (!position?.code) return null;
  return {
    ...position,
    code: String(position.code || ""),
    name: String(position.name || ""),
    units: round(Number(position.units || 0), 6),
    costAmount: round(Number(position.costAmount || 0), 2),
    currentValue: round(Number(position.currentValue || 0), 2),
    realizedPnl: round(Number(position.realizedPnl || 0), 2),
    pendingSellUnits: round(Number(position.pendingSellUnits || 0), 6),
    pendingSellAmount: round(Number(position.pendingSellAmount || 0), 2),
    averageCostNav: position.averageCostNav ? round(Number(position.averageCostNav), 4) : null,
    peakUnrealizedPnlPct: position.peakUnrealizedPnlPct === undefined || position.peakUnrealizedPnlPct === null
      ? null
      : round(Number(position.peakUnrealizedPnlPct), 2),
    peakUnrealizedPnlPctDate: String(position.peakUnrealizedPnlPctDate || ""),
    profitGivebackPct: round(Number(position.profitGivebackPct || 0), 2),
    riskBudget: position.riskBudget || null,
    fundSnapshot: position.fundSnapshot || null,
    lastNav: position.lastNav ? Number(position.lastNav) : null
  };
}

function recalculatePortfolioAccount(account) {
  const nowIso = new Date().toISOString();
  account.cash = round(Number(account.cash || 0), 2);
  account.pendingBuyAmount = round(Number(account.pendingBuyAmount || 0), 2);
  account.receivableCash = round(Number(account.receivableCash || 0), 2);
  account.investedValue = round(account.positions.reduce((sum, position) => sum + Number(position.currentValue || 0), 0), 2);
  account.investedCost = round(account.positions.reduce((sum, position) => sum + Number(position.costAmount || 0), 0), 2);
  account.totalAsset = round(account.cash + account.investedValue + account.pendingBuyAmount + account.receivableCash, 2);
  account.cumulativePnl = round(account.totalAsset - Number(account.initialCapital || 0), 2);
  account.cumulativePnlPct = account.investedCost > 0 ? round((account.cumulativePnl / account.investedCost) * 100, 2) : 0;
  account.capitalPnlPct = account.initialCapital > 0 ? round((account.cumulativePnl / account.initialCapital) * 100, 2) : 0;
  const previousPeak = Number(account.peakTotalAsset || account.initialCapital || account.totalAsset || 0);
  if (!Number.isFinite(previousPeak) || previousPeak <= 0 || Number(account.totalAsset || 0) > previousPeak) {
    account.peakTotalAsset = round(Number(account.totalAsset || 0), 2);
    account.peakTotalAssetDate = nowIso.slice(0, 10);
  } else {
    account.peakTotalAsset = round(Math.max(previousPeak, Number(account.initialCapital || 0), Number(account.totalAsset || 0)), 2);
    account.peakTotalAssetDate = account.peakTotalAssetDate || nowIso.slice(0, 10);
  }
  account.drawdownFromPeakPct = account.peakTotalAsset > 0
    ? round((Number(account.totalAsset || 0) / account.peakTotalAsset - 1) * 100, 2)
    : 0;
  account.riskBudget = buildPortfolioAccountRiskBudget(account);
  account.availableCash = account.cash;
  account.positionWeightPct = account.totalAsset > 0 ? round((account.investedValue / account.totalAsset) * 100, 2) : 0;
  account.pendingWeightPct = account.totalAsset > 0 ? round(((account.pendingBuyAmount + account.receivableCash) / account.totalAsset) * 100, 2) : 0;
  account.positions = account.positions.map((position) => ({
    ...position,
    weightPct: account.totalAsset > 0 ? round((Number(position.currentValue || 0) / account.totalAsset) * 100, 2) : 0,
    unrealizedPnl: round(Number(position.currentValue || 0) - Number(position.costAmount || 0), 2),
    unrealizedPnlPct: position.costAmount > 0
      ? round(((Number(position.currentValue || 0) - Number(position.costAmount || 0)) / Number(position.costAmount || 1)) * 100, 2)
      : 0
  })).map((position) => {
    const currentPct = Number(position.unrealizedPnlPct || 0);
    const previousPeakPct = finiteMetricNumber(position.peakUnrealizedPnlPct);
    const nextPeakPct = Number.isFinite(previousPeakPct) ? Math.max(previousPeakPct, currentPct) : currentPct;
    const peakChanged = !Number.isFinite(previousPeakPct) || nextPeakPct > previousPeakPct;
    const nextPosition = {
      ...position,
      peakUnrealizedPnlPct: round(nextPeakPct, 2),
      peakUnrealizedPnlPctDate: peakChanged ? nowIso.slice(0, 10) : (position.peakUnrealizedPnlPctDate || nowIso.slice(0, 10)),
      profitGivebackPct: round(Math.max(0, nextPeakPct - currentPct), 2)
    };
    return {
      ...nextPosition,
      riskBudget: buildPortfolioPositionRiskBudget(nextPosition)
    };
  });
  account.updatedAt = nowIso;
}

function summarizePortfolioAccount(account) {
  return {
    initialCapital: round(Number(account.initialCapital || 0), 2),
    cash: round(Number(account.cash || 0), 2),
    availableCash: round(Number(account.availableCash || account.cash || 0), 2),
    pendingBuyAmount: round(Number(account.pendingBuyAmount || 0), 2),
    receivableCash: round(Number(account.receivableCash || 0), 2),
    investedValue: round(Number(account.investedValue || 0), 2),
    investedCost: round(Number(account.investedCost || 0), 2),
    totalAsset: round(Number(account.totalAsset || 0), 2),
    peakTotalAsset: round(Number(account.peakTotalAsset || account.totalAsset || 0), 2),
    peakTotalAssetDate: account.peakTotalAssetDate || "",
    drawdownFromPeakPct: round(Number(account.drawdownFromPeakPct || 0), 2),
    riskBudget: account.riskBudget || buildPortfolioAccountRiskBudget(account),
    positionWeightPct: round(Number(account.positionWeightPct || 0), 2),
    pendingWeightPct: round(Number(account.pendingWeightPct || 0), 2),
    dayPnl: round(Number(account.dayPnl || 0), 2),
    cumulativePnl: round(Number(account.cumulativePnl || 0), 2),
    cumulativePnlPct: round(Number(account.cumulativePnlPct || 0), 2),
    capitalPnlPct: round(Number(account.capitalPnlPct || 0), 2),
    positions: account.positions.map(summarizePortfolioPosition)
  };
}

function summarizePortfolioPosition(position) {
  return {
    code: position.code,
    name: position.name,
    currentValue: round(Number(position.currentValue || 0), 2),
    costAmount: round(Number(position.costAmount || 0), 2),
    units: round(Number(position.units || 0), 6),
    weightPct: round(Number(position.weightPct || 0), 2),
    lastNav: position.lastNav || null,
    lastNavDate: position.lastNavDate || "",
    averageCostNav: position.averageCostNav || null,
    lastTradeNav: position.lastTradeNav || null,
    lastTradeUnits: position.lastTradeUnits || null,
    pendingSellUnits: position.pendingSellUnits || 0,
    pendingSellAmount: position.pendingSellAmount || 0,
    fundSnapshot: position.fundSnapshot || null,
    dataSource: position.dataSource || "",
    unrealizedPnl: round(Number(position.unrealizedPnl || 0), 2),
    unrealizedPnlPct: round(Number(position.unrealizedPnlPct || 0), 2),
    peakUnrealizedPnlPct: position.peakUnrealizedPnlPct === null || position.peakUnrealizedPnlPct === undefined
      ? null
      : round(Number(position.peakUnrealizedPnlPct), 2),
    peakUnrealizedPnlPctDate: position.peakUnrealizedPnlPctDate || "",
    profitGivebackPct: round(Number(position.profitGivebackPct || 0), 2),
    riskBudget: position.riskBudget || buildPortfolioPositionRiskBudget(position),
    lastReason: position.lastReason || "",
    lastRiskControl: position.lastRiskControl || ""
  };
}

function summarizeMarketSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    fetchedAt: snapshot.fetchedAt,
    note: snapshot.note,
    marketIndicators: {
      preciousMetals: (snapshot.marketIndicators?.preciousMetals || []).slice(0, 10)
    },
    themes: {
      conceptBoards: (snapshot.themes?.conceptBoards || []).slice(0, 10),
      industryBoards: (snapshot.themes?.industryBoards || []).slice(0, 10)
    },
    themeRadar: (snapshot.themeRadar || []).slice(0, 8),
    fastNews: (snapshot.fastNews || []).slice(0, 8),
    fundCandidates: {
      stockFunds: (snapshot.fundCandidates?.stockFunds || []).slice(0, 8),
      hybridFunds: (snapshot.fundCandidates?.hybridFunds || []).slice(0, 8),
      indexFunds: (snapshot.fundCandidates?.indexFunds || []).slice(0, 8),
      qdiiFunds: (snapshot.fundCandidates?.qdiiFunds || []).slice(0, 8),
      preciousMetalFunds: (snapshot.fundCandidates?.preciousMetalFunds || []).slice(0, 10)
    },
    errors: snapshot.errors || [],
    sources: snapshot.sources || []
  };
}

async function buildFundReportCardImages(profiles, config) {
  if (String(process.env.FEISHU_REPORT_TREND_IMAGES ?? "true") === "false") {
    return [];
  }
  const limit = getFundReportChartLimit();
  const chartMode = String(process.env.FEISHU_REPORT_CHART_MODE || "summary").toLowerCase();
  const snapshots = collectTrendSnapshotsFromProfiles(profiles).slice(0, limit);
  const images = [];
  for (const item of snapshots) {
    try {
      const png = chartMode === "trend"
        ? renderTrendSeriesPng({
            series: item.snapshot.trendProfile?.series || [],
            width: 720,
            height: 260
          })
        : renderFundReportSummaryPng({
            profile: item.snapshot,
            width: 1280,
            height: 760
          });
      if (!png) continue;
      const imageKey = await uploadFeishuImage(png, `fund-report-${chartMode}-${item.code || "fund"}.png`, config);
      images.push({
        imageKey,
        alt: `${item.snapshot.reportChartRole ? `${item.snapshot.reportChartRole}：` : ""}${item.code} ${item.name} 走势 / 回撤 / 阶段收益 / 买点费用风险图`.trim() || "基金报告图"
      });
    } catch (error) {
      console.error("[fund-report-trend-image-error]", item.code || item.name || "unknown", error);
      recordError(error, { fundReportTrendImageFailures: 1 });
    }
  }
  if (images.length) {
    updateStats({ counters: { fundReportTrendImagesUploaded: images.length } });
  }
  return images;
}

function getFundReportChartLimit() {
  const configured = Math.max(0, Number(process.env.FEISHU_REPORT_TREND_IMAGE_LIMIT || 12) || 12);
  return Math.max(DEFAULT_FUND_REPORT_IMAGE_MIN, configured);
}

function getFundReportChartMinCount() {
  const configured = Number(process.env.FEISHU_REPORT_TREND_IMAGE_MIN || DEFAULT_FUND_REPORT_IMAGE_MIN);
  return Math.min(
    getFundReportChartLimit(),
    Math.max(DEFAULT_FUND_REPORT_IMAGE_MIN, configured || DEFAULT_FUND_REPORT_IMAGE_MIN)
  );
}

function collectTrendSnapshotsFromProfiles(profiles) {
  const byCode = new Map();
  const list = Array.isArray(profiles) ? profiles : [profiles].filter(Boolean);
  const add = (profile) => {
    if (!hasFundReportChartSeries(profile)) return;
    const code = profile.code || profile.seed?.code || "";
    const name = profile.name || profile.seed?.name || "";
    const key = code || name;
    if (!key || byCode.has(key)) return;
    byCode.set(key, { code, name, snapshot: profile });
  };

  for (const item of list) {
    if (Array.isArray(item?.candidates)) {
      for (const candidate of item.candidates) add(candidate);
    } else {
      add(item);
    }
  }
  return [...byCode.values()];
}

function hasFundReportChartSeries(profile) {
  return Boolean(profile?.trendProfile?.series?.length);
}

function selectFundReportProfilesForAnswer(profiles, answerText, options = {}) {
  const list = Array.isArray(profiles) ? profiles.filter(Boolean) : [profiles].filter(Boolean);
  const chartableList = list.filter(hasFundReportChartSeries);
  if (!chartableList.length) return [];
  const limit = Math.max(0, Number(options.limit ?? getFundReportChartLimit()) || 0);
  if (!limit) return [];
  const minCount = Math.min(limit, Math.max(0, Number(options.minCount || 0) || 0));

  const text = String(answerText || "");
  const selectionSections = extractAnswerChartEvidenceSections(text);
  const sectionCodes = new Set(selectionSections.flatMap((section) => extractFundCodes(section.text)));
  const explicitCodes = sectionCodes.size ? sectionCodes : new Set(extractFundCodes(text));
  const ranked = [];
  for (const profile of chartableList) {
    const code = profile?.code || profile?.seed?.code || "";
    const name = profile?.name || profile?.seed?.name || "";
    if (explicitCodes.size && code && !explicitCodes.has(code)) continue;

    let best = null;
    for (const section of selectionSections) {
      const codeIndex = code && explicitCodes.has(code) ? section.text.indexOf(code) : -1;
      const nameIndex = !explicitCodes.size && name ? section.text.indexOf(name) : -1;
      const index = [codeIndex, nameIndex].filter((value) => value >= 0).sort((a, b) => a - b)[0];
      if (index === undefined) continue;
      const context = extractFundChartContext(section.text, code, name, index);
      if (isChartExcludedByAnswerContext(context)) continue;
      const score = section.priority
        + index
        - scorePositiveChartContext(context)
        - scoreBackupChartContext(context)
        + scoreNegativeChartContext(context);
      if (!best || score < best.score) {
        best = {
          index,
          context,
          score
        };
      }
    }
    if (!best) continue;
    ranked.push({
      profile: withFundReportChartMeta(profile, {
        role: classifyAnswerChartRole(best.context)
      }),
      key: code || name,
      index: best.index,
      score: best.score
    });
  }

  const seen = new Set();
  const selected = ranked
    .sort((a, b) => a.score - b.score)
    .filter((item) => {
      if (!item.key || seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    })
    .map((item) => item.profile);
  const selectedChartCount = collectTrendSnapshotsFromProfiles(selected).length;
  if (selectedChartCount < minCount) {
    selected.push(...selectSupplementalFundReportProfiles(chartableList, selected, minCount - selectedChartCount, {
      roleTargets: getFundReportChartRoleTargets(minCount)
    }));
  }
  return selected.slice(0, limit);
}

function selectSupplementalFundReportProfiles(profiles, selected, needed, options = {}) {
  if (needed <= 0) return [];
  const picked = [];
  while (picked.length < needed) {
    const selectedKeys = new Set([...(selected || []), ...picked].map(getFundReportProfileKey).filter(Boolean));
    const roleCounts = countFundReportChartRoles([...(selected || []), ...picked]);
    const next = (profiles || [])
      .filter((profile) => isSupplementalFundReportProfileEligible(profile))
      .map((profile) => {
        const role = inferSupplementalFundReportChartRole(profile);
        return {
          profile,
          role,
          key: getFundReportProfileKey(profile),
          score: scoreSupplementalFundReportProfile(profile, {
            role,
            roleCounts,
            roleTargets: options.roleTargets
          })
        };
      })
      .filter((item) => item.key && !selectedKeys.has(item.key))
      .sort((a, b) => a.score - b.score)[0];
    if (!next) break;
    picked.push(withFundReportChartMeta(next.profile, { role: next.role }));
  }
  return picked;
}

function isSupplementalFundReportProfileEligible(profile) {
  if (!hasFundReportChartSeries(profile)) return false;
  const trend = profile.trendProfile || {};
  if (profile.ok === false || profile.actionability?.action === "avoid") return false;
  if (trend.entryBias === "avoid_now" || trend.trendLabel === "extended_uptrend") return false;
  if (hasPortfolioVerifiedSeedChaseRisk(profile, profile)) return false;
  return true;
}

function scoreSupplementalFundReportProfile(profile, options = {}) {
  let score = 1000 - scoreResearchDigestForPullbackSetup(profile);
  const trend = profile?.trendProfile || {};
  const bucket = classifyPullbackSetupCandidateForSummary(profile);
  const role = options.role || inferSupplementalFundReportChartRole(profile);
  const roleCounts = options.roleCounts || {};
  const roleTargets = options.roleTargets || {};
  if (bucket === "main_candidate") score -= 300;
  if (["pullback_complete", "launch_setup"].includes(trend.pullbackSetup?.signal)) score -= 120;
  if (["buyable_now", "staged_buy"].includes(trend.entryBias)) score -= 80;
  if (trend.entryBias === "wait_pullback") score += 60;
  if (String(profile?.reportChartRole || "").includes("备选")) score -= 20;
  if (String(role).includes("买入") && Number(roleCounts.buy || 0) < Number(roleTargets.buy || 0)) score -= 420;
  if (String(role).includes("备选") && Number(roleCounts.backup || 0) < Number(roleTargets.backup || 0)) score -= 420;
  return score;
}

function inferSupplementalFundReportChartRole(profile) {
  if (String(profile?.reportChartRole || "").includes("备选")) return "备选观察图";
  if (classifyPullbackSetupCandidateForSummary(profile) === "main_candidate") return "买入参考图";
  return "备选观察图";
}

function getFundReportChartRoleTargets(total = getFundReportChartMinCount()) {
  const count = Math.max(0, Number(total || 0) || 0);
  if (!count) return { buy: 0, backup: 0 };
  const buy = count >= DEFAULT_FUND_REPORT_IMAGE_MIN
    ? Math.min(count, DEFAULT_FUND_REPORT_BUY_IMAGE_MIN)
    : Math.min(count, Math.max(1, Math.round(count * 0.4)));
  return {
    buy,
    backup: Math.min(Math.max(0, count - buy), DEFAULT_FUND_REPORT_BACKUP_IMAGE_MIN)
  };
}

function countFundReportChartRoles(profiles = []) {
  const snapshots = collectTrendSnapshotsFromProfiles(profiles);
  let buy = 0;
  let backup = 0;
  for (const item of snapshots) {
    const role = item.snapshot?.reportChartRole || inferSupplementalFundReportChartRole(item.snapshot);
    if (String(role).includes("买入")) {
      buy += 1;
    } else {
      backup += 1;
    }
  }
  return { total: snapshots.length, buy, backup };
}

function getFundReportProfileKey(profile) {
  return profile?.code || profile?.seed?.code || profile?.name || profile?.seed?.name || "";
}

function appendFundReportChartReadingGuide(text, chartProfiles = []) {
  const body = String(text || "").trim();
  const snapshots = collectTrendSnapshotsFromProfiles(chartProfiles).slice(0, getFundReportChartLimit());
  if (!body || !snapshots.length || /配图阅读/.test(body)) return body;
  const lines = snapshots.map((item, index) => {
    const profile = item.snapshot || {};
    const role = profile.reportChartRole || inferSupplementalFundReportChartRole(profile);
    return `${index + 1}. ${[item.code, item.name].filter(Boolean).join(" ")}（${role}）：${formatFundReportChartGuideEvidence(profile, role)}`;
  });
  const buyCount = snapshots.filter((item) => String(item.snapshot?.reportChartRole || inferSupplementalFundReportChartRole(item.snapshot)).includes("买入")).length;
  const backupCount = snapshots.length - buyCount;
  return [body, "", "配图阅读：", `本次配图共 ${snapshots.length} 张：买入参考 ${buyCount} 张，备选观察 ${backupCount} 张。`, ...lines].join("\n");
}

function formatFundReportChartGuideEvidence(profile = {}, role = "") {
  const trend = profile.trendProfile || {};
  const fees = profile.fees || {};
  const actionLead = String(role || "").includes("买入")
    ? "用来确认是否适合分批买入"
    : "用来观察是否能从备选转入买点";
  const fields = [
    trend.pullbackSetup?.signalText || formatTrendLabel(trend.trendLabel),
    formatEntryBias(trend.entryBias),
    Number.isFinite(Number(trend.return5dPct)) ? `近5日${formatFallbackPct(trend.return5dPct)}` : "",
    Number.isFinite(Number(trend.return10dPct)) ? `近10日${formatFallbackPct(trend.return10dPct)}` : "",
    Number.isFinite(Number(trend.return20dPct)) ? `近20日${formatFallbackPct(trend.return20dPct)}` : "",
    Number.isFinite(Number(trend.lowPositionPct120)) ? `120日位置${round(Number(trend.lowPositionPct120), 1)}%` : "",
    Number.isFinite(Number(trend.lowPositionPct250)) ? `250日位置${round(Number(trend.lowPositionPct250), 1)}%` : "",
    formatHoldingsOutlookEvidence(profile),
    fees.shareClassFeeModel?.label || profile.shareClassFeeModel?.label || ""
  ].filter(Boolean);
  const compact = fields.join("，");
  return compact
    ? `${actionLead}：图上看 ${compact.slice(0, 150)}。`
    : `${actionLead}：图上看净值趋势、回撤位置、阶段收益和费用栏，作为买入或备选的证据。`;
}

function withFundReportChartMeta(profile, meta = {}) {
  if (!profile || typeof profile !== "object") return profile;
  return {
    ...profile,
    reportChartRole: meta.role || profile.reportChartRole || ""
  };
}

function extractAnswerChartEvidenceSections(text) {
  const body = String(text || "");
  if (!body.trim()) return [];
  const sections = [];
  const pushSection = (sectionText, priority) => {
    const normalized = String(sectionText || "").trim();
    if (!normalized || sections.some((section) => section.text === normalized)) return;
    sections.push({ text: normalized, priority });
  };

  pushSection(extractAnswerRecommendationSection(body), 0);

  const backupMarkers = [
    "备选观察",
    "备选",
    "观察名单",
    "观察池",
    "候选池",
    "自选基金池",
    "等待回调",
    "等待回撤",
    "接近可买",
    "可关注"
  ];
  for (const marker of backupMarkers) {
    const index = body.indexOf(marker);
    if (index >= 0) {
      pushSection(sliceAnswerChartSectionFromMarker(body, index), 20000 + index);
    }
  }

  if (!sections.length) pushSection(body, 40000);
  return sections.sort((a, b) => a.priority - b.priority);
}

function extractAnswerRecommendationSection(text) {
  const body = String(text || "");
  if (!body.trim()) return "";
  const startMarkers = ["推荐清单", "推荐候选", "主推荐", "候选基金", "推荐：", "推荐:"];
  const starts = startMarkers.map((marker) => body.indexOf(marker)).filter((index) => index >= 0);
  if (!starts.length) return body;
  const start = Math.min(...starts);
  const endMarkers = [
    "1万元执行",
    "一万元执行",
    "执行方案",
    "决策边界",
    "观察名单",
    "观察池",
    "为什么不选",
    "回避",
    "风险",
    "缺失数据"
  ];
  const ends = endMarkers
    .map((marker) => body.indexOf(marker, start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b);
  return body.slice(start, ends[0] || body.length);
}

function sliceAnswerChartSectionFromMarker(body, start) {
  const endMarkers = [
    "1万元执行",
    "一万元执行",
    "执行方案",
    "决策边界",
    "为什么不选",
    "回避",
    "剔除",
    "排除",
    "缺失数据",
    "免责声明"
  ];
  const ends = endMarkers
    .map((marker) => body.indexOf(marker, start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b);
  return body.slice(start, ends[0] || body.length);
}

function extractFundChartContext(text, code, name, index = -1) {
  const body = String(text || "");
  const targets = [code, name].map((value) => String(value || "").trim()).filter(Boolean);
  if (targets.length) {
    const lines = body.split(/\r?\n/);
    const lineIndex = lines.findIndex((line) => targets.some((target) => line.includes(target)));
    if (lineIndex >= 0) {
      return lines.slice(Math.max(0, lineIndex - 1), Math.min(lines.length, lineIndex + 2)).join("\n");
    }
  }
  if (index < 0) return "";
  return body.slice(Math.max(0, index - 96), index + 160);
}

function isChartExcludedByAnswerContext(context) {
  const supportScore = scorePositiveChartContext(context) + scoreBackupChartContext(context);
  if (hasHardRejectedChartContext(context) && !hasClearPositiveChartContext(context)) return true;
  if (hasHardRejectedChartContext(context) && supportScore < 12) return true;
  return scoreNegativeChartContext(context) >= 12 && supportScore < 8;
}

function scorePositiveChartContext(context) {
  const text = String(context || "");
  let score = 0;
  if (hasMainRecommendationChartContext(text) || /(入选|可以买|买入|分批|配置|候选|优先)/.test(text)) score += 8;
  if (/(回调完成|低位|启动|修复|可买|分批买)/.test(text)) score += 4;
  return score;
}

function scoreBackupChartContext(context) {
  const text = String(context || "");
  let score = 0;
  if (/(备选|观察名单|观察池|候选池|自选基金池|等待回调|等待回撤|可关注|接近可买)/.test(text)) score += 8;
  if (/(触发|满足条件|回踩确认|放量站回|复查|启动前夜|低位修复)/.test(text)) score += 4;
  return score;
}

function scoreNegativeChartContext(context) {
  const text = String(context || "");
  let score = 0;
  if (/(只观察|回避|剔除|排除|不推荐|不作为主推荐|不是主推|暂不|少买|不买)/.test(text)) score += 12;
  if (/(追涨|偏热|过热|不符合|风险偏高)/.test(text)) score += 8;
  if (/(等待|等回撤)/.test(text)) score += 3;
  return score;
}

function hasHardRejectedChartContext(context) {
  return /(只观察|回避|剔除|排除|不推荐|不作为主推荐|不是主推|追涨|偏热|过热|不符合|风险偏高|暂不|少买|不买)/.test(String(context || ""));
}

function hasMainRecommendationChartContext(context) {
  return /(?:^|[\n；;。:：])\s*主推荐|首选|推荐清单|推荐候选/.test(String(context || ""));
}

function hasClearPositiveChartContext(context) {
  const text = String(context || "");
  return hasMainRecommendationChartContext(text)
    || /(可以买|买入|分批|配置|可买|分批买)/.test(text);
}

function classifyAnswerChartRole(context) {
  const text = String(context || "");
  if (scoreBackupChartContext(text) >= 8 && !hasMainRecommendationChartContext(text)) {
    return "备选观察图";
  }
  return "买入参考图";
}

async function buildPortfolioTrendCardImages(run, config) {
  if (String(process.env.FEISHU_PORTFOLIO_TREND_IMAGES ?? "true") === "false") {
    return [];
  }
  const snapshots = collectTrendSnapshotsForRun(run).slice(0, getPortfolioTrendImageLimit());
  const images = [];
  for (const item of snapshots) {
    const png = renderFundReportSummaryPng({
      profile: {
        ...item.snapshot,
        code: item.code || item.snapshot?.code || "",
        name: item.name || item.snapshot?.name || "",
        reportChartRole: item.role || item.snapshot?.reportChartRole || ""
      },
      width: 1280,
      height: 760
    });
    if (!png) continue;
    const imageKey = await uploadFeishuImage(png, `portfolio-report-${item.code || "fund"}.png`, config);
    images.push({
      imageKey,
      alt: `${item.role ? `${item.role}：` : ""}${item.code} ${item.name} 走势 / 回撤 / 买点 / 费用证据`.trim() || "基金走势证据图"
    });
  }
  if (images.length) {
    updateStats({ counters: { portfolioTrendImagesUploaded: images.length } });
  }
  return images;
}

async function buildPortfolioStatusCardImages(config = getEffectiveConfig()) {
  if (String(process.env.FEISHU_PORTFOLIO_STATUS_IMAGES ?? "true") === "false") {
    return [];
  }
  const db = readPortfolioDb();
  ensurePortfolioAccount(db, config);
  const activeOrders = (db.orders || []).filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status));
  const recentTransactions = (db.transactions || []).filter((item) => ["BUY", "SELL"].includes(item.side)).slice(-8);
  const statusRun = {
    id: "portfolio-status",
    type: "portfolio_status",
    orders: activeOrders,
    transactions: recentTransactions,
    watchlistUpdates: getActivePortfolioWatchlist(db).map(summarizePortfolioWatchItem),
    accountAfter: summarizePortfolioAccount(db.account)
  };
  return buildPortfolioTrendCardImages(statusRun, config);
}

function getPortfolioTrendImageLimit() {
  const configured = Math.max(0, Number(process.env.FEISHU_PORTFOLIO_TREND_IMAGE_LIMIT || DEFAULT_PORTFOLIO_REPORT_IMAGE_LIMIT) || DEFAULT_PORTFOLIO_REPORT_IMAGE_LIMIT);
  return Math.max(DEFAULT_PORTFOLIO_REPORT_IMAGE_MIN, configured);
}

function collectTrendSnapshotsForRun(run) {
  const byCode = new Map();
  const add = ({ code, name, snapshot, role = "", priority = 50 } = {}) => {
    if (!snapshot?.trendProfile?.series?.length) return;
    const key = code || snapshot.code || name;
    if (!key) return;
    const current = byCode.get(key);
    if (current && Number(current.priority ?? 50) <= priority) return;
    byCode.set(key, {
      code: code || snapshot.code || "",
      name: name || snapshot.name || "",
      role,
      priority,
      snapshot: {
        ...snapshot,
        reportChartRole: role || snapshot.reportChartRole || ""
      }
    });
  };

  for (const tx of run.transactions || []) {
    add({
      code: tx.code,
      name: tx.name,
      snapshot: tx.fundSnapshot,
      role: tx.side === "BUY" ? "买入执行图" : "卖出复盘图",
      priority: tx.side === "BUY" ? 0 : 8
    });
  }
  for (const order of run.orders || []) {
    add({
      code: order.code,
      name: order.name,
      snapshot: order.fundSnapshot,
      role: order.side === "BUY" ? "买入准备图" : "卖出/减仓跟踪图",
      priority: order.side === "BUY" ? 2 : 10
    });
  }
  for (const item of run.watchlistUpdates || []) {
    const role = item.status === "ready"
      ? "买入准备图"
      : item.status === "waiting_pullback" || item.status === "watch"
        ? "备选观察图"
        : item.status === "blocked"
          ? "风险排除图"
          : "自选复核图";
    add({
      code: item.code,
      name: item.name,
      snapshot: item.lastSnapshot,
      role,
      priority: item.status === "ready" ? 4 : item.status === "waiting_pullback" ? 12 : item.status === "watch" ? 20 : 40
    });
  }
  for (const position of run.accountAfter?.positions || []) {
    add({
      code: position.code,
      name: position.name,
      snapshot: position.fundSnapshot,
      role: "持仓跟踪图",
      priority: 30
    });
  }
  return [...byCode.values()].sort((a, b) => Number(a.priority ?? 50) - Number(b.priority ?? 50));
}

function isPreciousMetalQuestion(text) {
  return hasAny(normalizeIntentText(text), ["黄金", "金价", "贵金属", "白银", "沪金", "沪银", "comex", "美元指数", "避险"]);
}

function formatEvidenceField(label, value, suffix = "") {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  const formatted = Number.isFinite(numeric) ? round(numeric, 2) : String(value);
  return `${label}=${formatted}${suffix}`;
}

function formatFeeModelLabel(feeModel) {
  if (!feeModel) return "feeModel=unknown";
  if (typeof feeModel === "string") return `feeModel=${feeModel}`;
  return `feeModel=${feeModel.label || feeModel.type || "unknown"}`;
}

function buildMarketEvidenceSummary(userText, marketSnapshot) {
  if (!marketSnapshot) {
    return "未抓取市场快照：只能按通用基金知识回答，不能声称已看到近期行情。";
  }

  const lines = [
    `snapshot.fetchedAt=${marketSnapshot.fetchedAt || "unknown"}`,
    marketSnapshot.note ? `snapshot.note=${marketSnapshot.note}` : ""
  ].filter(Boolean);
  const themeRadar = selectRelevantThemeRadar(userText, marketSnapshot).slice(0, 5);
  if (themeRadar.length) {
    lines.push("themeRadar:");
    lines.push(...themeRadar.map((theme) => {
      const fields = [
        theme.name || theme.id || "unknown",
        theme.stage ? `stage=${theme.stage}` : "",
        formatEvidenceField("forwardScore", theme.forwardScore),
        formatEvidenceField("crowdingScore", theme.crowdingScore),
        formatEvidenceField("rotationScore", theme.rotationScore),
        formatEvidenceField("lowPositionScore", theme.lowPositionScore),
        theme.positionSignal ? `positionSignal=${theme.positionSignal}` : "",
        theme.actionBias ? `actionBias=${theme.actionBias}` : "",
        theme.primaryCatalyst ? `primaryCatalyst=${theme.primaryCatalyst}` : "",
        theme.evidence?.boards?.length ? `boards=${theme.evidence.boards.slice(0, 2).map((item) => `${item.name}:${formatSignedNumber(item.changePct)}%`).join("/")}` : "",
        theme.evidence?.news?.length ? `news=${theme.evidence.news.slice(0, 2).map((item) => item.title).join(" / ")}` : ""
      ].filter(Boolean);
      return `- ${fields.join(", ")}`;
    }));
    lines.push("qualityInstruction=themeRadar exists; first judge theme stage, rotationScore, lowPositionScore, crowdingScore, and forward payoff before recommending funds. Do not chase high_chase_risk themes just because news is hot.");
  }

  if (isPreciousMetalQuestion(userText)) {
    const metals = marketSnapshot.marketIndicators?.preciousMetals || [];
    const funds = marketSnapshot.fundCandidates?.preciousMetalFunds || [];
    lines.push("questionFocus=precious_metals");

    if (metals.length) {
      lines.push("preciousMetals:");
      lines.push(...metals.slice(0, 8).map((item) => {
        const fields = [
          item.name || item.code || "unknown",
          item.code ? `code=${item.code}` : "",
          item.secid ? `secid=${item.secid}` : "",
          formatEvidenceField("latest", item.latest),
          formatEvidenceField("changePct", item.changePct, "%"),
          formatEvidenceField("fiveDayPct", item.fiveDayPct, "%"),
          item.quoteTime ? `quoteTime=${item.quoteTime}` : ""
        ].filter(Boolean);
        return `- ${fields.join(", ")}`;
      }));
      lines.push("qualityInstruction=precious metal quote data exists; do not say there is no gold/precious-metal market data.");
    } else {
      lines.push("preciousMetals=empty");
    }

    if (funds.length) {
      lines.push("preciousMetalFundCandidates:");
      lines.push(...funds.slice(0, 8).map((item) => {
        const fields = [
          `${item.code || "unknown"} ${item.name || ""}`.trim(),
          item.shareClass ? `shareClass=${item.shareClass}` : "",
          formatFeeModelLabel(item.shareClassFeeModel),
          item.type ? `type=${item.type}` : "",
          formatEvidenceField("unitNav", item.unitNav),
          item.navDate ? `navDate=${item.navDate}` : "",
          Array.isArray(item.keywords) && item.keywords.length ? `keywords=${item.keywords.join("/")}` : ""
        ].filter(Boolean);
        return `- ${fields.join(", ")}`;
      }));
    } else {
      lines.push("preciousMetalFundCandidates=empty");
    }

    if (marketSnapshot.errors?.length) {
      lines.push(`snapshot.errors=${marketSnapshot.errors.slice(0, 5).join(" | ")}`);
    }
    return lines.join("\n");
  }

  const concepts = marketSnapshot.themes?.conceptBoards || [];
  const industries = marketSnapshot.themes?.industryBoards || [];
  const fundCandidates = [
    ...(marketSnapshot.fundCandidates?.stockFunds || []),
    ...(marketSnapshot.fundCandidates?.hybridFunds || []),
    ...(marketSnapshot.fundCandidates?.indexFunds || []),
    ...(marketSnapshot.fundCandidates?.qdiiFunds || [])
  ];

  if (concepts.length) {
    lines.push("topConceptBoards:");
    lines.push(...concepts.slice(0, 5).map((item) => {
      const fields = [
        item.name || item.boardCode || "unknown",
        formatEvidenceField("changePct", item.changePct, "%"),
        item.leadStock ? `leadStock=${item.leadStock}` : "",
        item.quoteTime ? `quoteTime=${item.quoteTime}` : ""
      ].filter(Boolean);
      return `- ${fields.join(", ")}`;
    }));
  }

  if (industries.length) {
    lines.push("topIndustryBoards:");
    lines.push(...industries.slice(0, 5).map((item) => {
      const fields = [
        item.name || item.boardCode || "unknown",
        formatEvidenceField("changePct", item.changePct, "%"),
        item.leadStock ? `leadStock=${item.leadStock}` : "",
        item.quoteTime ? `quoteTime=${item.quoteTime}` : ""
      ].filter(Boolean);
      return `- ${fields.join(", ")}`;
    }));
  }

  if (fundCandidates.length) {
    lines.push("fundCandidates:");
    lines.push(...fundCandidates.slice(0, 8).map((item) => {
      const fields = [
        `${item.code || "unknown"} ${item.name || ""}`.trim(),
        item.shareClass ? `shareClass=${item.shareClass}` : "",
        formatFeeModelLabel(item.shareClassFeeModel),
        item.type ? `type=${item.type}` : "",
        formatEvidenceField("oneMonthPct", item.oneMonthPct, "%"),
        formatEvidenceField("dailyPct", item.dailyPct, "%")
      ].filter(Boolean);
      return `- ${fields.join(", ")}`;
    }));
  }

  if (marketSnapshot.errors?.length) {
    lines.push(`snapshot.errors=${marketSnapshot.errors.slice(0, 5).join(" | ")}`);
  }

  return lines.join("\n");
}

function buildMarketDeepDiveSummary(deepDive) {
  if (!deepDive) return "未执行候选基金下钻。";
  const lines = [
    `deepDive.ok=${Boolean(deepDive.ok)}`,
    deepDive.focus ? `deepDive.focus=${deepDive.focus}` : "",
    deepDive.selectionDiscipline ? `selectionDiscipline=${deepDive.selectionDiscipline}` : "",
    Array.isArray(deepDive.backfillCodes) && deepDive.backfillCodes.length ? `backfillCodes=${deepDive.backfillCodes.join("/")}` : "",
    Array.isArray(deepDive.chartBackfillCodes) && deepDive.chartBackfillCodes.length ? `chartBackfillCodes=${deepDive.chartBackfillCodes.join("/")}` : "",
    Array.isArray(deepDive.searchKeywords) && deepDive.searchKeywords.length ? `searchKeywords=${deepDive.searchKeywords.join("/")}` : ""
  ].filter(Boolean);

  if (deepDive.selectionDiscipline === "prefer_pullback_complete_launch_setup_not_chase") {
    const ranked = (deepDive.candidates || [])
      .map((candidate) => ({
        candidate,
        setupRankScore: scoreResearchDigestForPullbackSetup(candidate),
        bucket: classifyPullbackSetupCandidateForSummary(candidate)
      }))
      .sort((a, b) => b.setupRankScore - a.setupRankScore);
    const mainCandidates = ranked.filter((item) => item.bucket === "main_candidate").slice(0, 5);
    const watchCandidates = ranked.filter((item) => item.bucket !== "main_candidate").slice(0, 8);
    lines.push("pullbackSetupRanking:");
    lines.push(...ranked.slice(0, 8).map((item) => formatPullbackSetupCandidateLine(item.candidate, item)));
    lines.push(`mainCandidateCodes=${mainCandidates.map((item) => item.candidate.code).filter(Boolean).join("/") || "none"}`);
    lines.push(`watchOrRejectCodes=${watchCandidates.map((item) => item.candidate.code).filter(Boolean).join("/") || "none"}`);
    if (!mainCandidates.length) {
      lines.push("qualityInstruction=没有形成回调完成/启动前夜的主候选时，必须直接说明“暂未筛到合格主推荐”，不要把短期暴涨或等待回撤的基金包装成低位启动。");
    } else {
      lines.push("qualityInstruction=主推荐只能从 main_candidate 中选择；watch_or_reject 只能放观察或排除原因，不能出现在主推荐图表里。");
    }
  }

  lines.push("compactDeepDiveJson:");
  lines.push(compactQualityEvidence(deepDive));
  return lines.join("\n");
}

function classifyPullbackSetupCandidateForSummary(candidate = {}) {
  if (!candidate?.ok) return "watch_or_reject";
  const trend = candidate.trendProfile || {};
  const signal = trend.pullbackSetup?.signal || "";
  if (hasHighChaseTheme(candidate)) return "watch_or_reject";
  if (hasSevereHoldingsOutlookRisk(candidate)) return "watch_or_reject";
  if (hasPullbackYearToDateChaseRisk(candidate)) return "watch_or_reject";
  if (hasPullbackLongPositionChaseRisk(candidate)) return "watch_or_reject";
  if (!isPullbackTrendFreshEnough(candidate)) return "watch_or_reject";
  if (["pullback_complete", "launch_setup"].includes(signal)
    && isEarlyTurnSetupTrend(trend)
    && trend.trendLabel !== "extended_uptrend"
    && trend.entryBias !== "wait_pullback"
    && hasPullbackLowPositionEvidence(trend)
    && Number(trend.return20dPct) <= 10
    && Number(trend.return60dPct) <= 24) {
    return "main_candidate";
  }
  return "watch_or_reject";
}

function hasPullbackLowPositionEvidence(trend = {}) {
  const lowPosition = finiteMetricNumber(trend.lowPositionPct120);
  const drawdown120 = finiteMetricNumber(trend.drawdownFrom120HighPct);
  const drawdownRecent = finiteMetricNumber(trend.drawdownFromRecentHighPct);
  const drawdown = Number.isFinite(drawdown120) ? drawdown120 : drawdownRecent;
  if (Number.isFinite(lowPosition)) return lowPosition >= 0 && lowPosition <= 60;
  return Number.isFinite(drawdown) && drawdown <= -5;
}

function finiteMetricNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatPullbackSetupCandidateLine(candidate = {}, ranked = {}) {
  const trend = candidate.trendProfile || {};
  const actionability = candidate.actionability || {};
  const seedThisYear = getCandidateSeedThisYearPct(candidate);
  const trendDate = getPullbackTrendEvidenceDate(candidate);
  const fields = [
    `${candidate.code || "unknown"} ${candidate.name || candidate.seed?.name || ""}`.trim(),
    `bucket=${ranked.bucket || classifyPullbackSetupCandidateForSummary(candidate)}`,
    `setupRankScore=${round(Number(ranked.setupRankScore ?? scoreResearchDigestForPullbackSetup(candidate)), 1)}`,
    trend.pullbackSetup?.signalText ? `signal=${trend.pullbackSetup.signalText}` : "",
    Number.isFinite(Number(trend.pullbackSetup?.score)) ? `setupScore=${trend.pullbackSetup.score}` : "",
    Number.isFinite(Number(trend.return5dPct)) ? `5日=${trend.return5dPct}%` : "",
    Number.isFinite(Number(trend.return10dPct)) ? `10日=${trend.return10dPct}%` : "",
    Number.isFinite(Number(trend.return20dPct)) ? `20日=${trend.return20dPct}%` : "",
    Number.isFinite(Number(trend.return60dPct)) ? `60日=${trend.return60dPct}%` : "",
    trendDate ? `净值日期=${trendDate}` : "",
    Number.isFinite(seedThisYear) ? `今年以来=${seedThisYear}%` : "",
    Number.isFinite(Number(trend.drawdownFromRecentHighPct)) ? `距高点=${trend.drawdownFromRecentHighPct}%` : "",
    Number.isFinite(Number(trend.lowPositionPct120)) ? `120日位置=${trend.lowPositionPct120}%` : "",
    Number.isFinite(Number(trend.lowPositionPct250)) ? `250日位置=${trend.lowPositionPct250}%` : "",
    formatCandidateThemeEvidence(candidate),
    formatHoldingsOutlookEvidence(candidate),
    trend.trendLabelText ? `趋势=${trend.trendLabelText}` : "",
    trend.entryBiasText ? `入场=${trend.entryBiasText}` : "",
    actionability.actionText ? `动作=${actionability.actionText}` : "",
    `缺口=${formatPullbackSetupCandidateGaps(candidate)}`
  ].filter(Boolean);
  return `- ${fields.join(", ")}`;
}

function formatPullbackSetupCandidateGaps(candidate = {}) {
  const gaps = buildPullbackSetupCandidateGaps(candidate);
  return gaps.length ? gaps.slice(0, 5).join("/") : "无";
}

function buildPullbackSetupCandidateGaps(candidate = {}) {
  const trend = candidate.trendProfile || {};
  const gaps = [];
  if (candidate?.ok === false || trend.ok === false) {
    gaps.push("缺少可验证净值下钻");
    return gaps;
  }
  const signal = trend.pullbackSetup?.signal || "";
  if (!["pullback_complete", "launch_setup"].includes(signal)) {
    gaps.push("回调完成/启动前夜信号未确认");
  }
  if (!isEarlyTurnSetupTrend(trend)) {
    gaps.push("5日/10日未温和转强");
  }
  if (!hasPullbackLowPositionEvidence(trend)) {
    gaps.push("120日低位或距高点回撤证据不足");
  }
  const return20d = finiteMetricNumber(trend.return20dPct);
  const return60d = finiteMetricNumber(trend.return60dPct);
  if (Number.isFinite(return20d) && return20d > 10) {
    gaps.push(`近20日${formatFallbackPct(return20d)}偏热`);
  } else if (!Number.isFinite(return20d)) {
    gaps.push("缺少近20日温和转强验证");
  }
  if (Number.isFinite(return60d) && return60d > 24) {
    gaps.push(`近60日${formatFallbackPct(return60d)}偏热`);
  } else if (!Number.isFinite(return60d)) {
    gaps.push("缺少近60日不过热验证");
  }
  const seedThisYear = getCandidateSeedThisYearPct(candidate);
  if (Number.isFinite(seedThisYear) && seedThisYear > 30) {
    gaps.push(`今年以来${formatFallbackPct(seedThisYear)}偏高`);
  }
  if (hasPullbackLongPositionChaseRisk(candidate)) {
    const longPosition = finiteMetricNumber(trend.lowPositionPct250);
    gaps.push(Number.isFinite(longPosition) ? `250日位置${formatFallbackPlainPct(longPosition)}偏高` : "250日长周期位置偏高");
  }
  gaps.push(...evaluatePullbackTrendFreshness(candidate).issues);
  if (trend.trendLabel === "extended_uptrend" || trend.entryBias === "wait_pullback") {
    gaps.push("仍是等待回撤而非低位启动");
  } else if (trend.entryBias === "avoid_now") {
    gaps.push("入场判断仍是回避");
  }
  if (hasHighChaseTheme(candidate)) {
    gaps.push("题材拥挤或追涨风险未消化");
  }
  const holdingsOutlook = buildHoldingsOutlookProfile(candidate);
  if (!holdingsOutlook.hasHoldings) {
    gaps.push("缺少前十大持仓/行业前景验证");
  } else {
    const mismatchRisk = holdingsOutlook.risks.find((item) => /匹配度不足|目标主题/.test(item));
    const orderedHoldingRisks = [
      mismatchRisk,
      ...holdingsOutlook.risks.filter((item) => item !== mismatchRisk)
    ].filter(Boolean);
    gaps.push(...orderedHoldingRisks.slice(0, 3));
  }
  return [...new Set(gaps)];
}

function getCandidateThemeSignals(candidate = {}) {
  const raw = [
    ...(Array.isArray(candidate.matchedThemes) ? candidate.matchedThemes : []),
    ...(Array.isArray(candidate.seed?.matchedThemes) ? candidate.seed.matchedThemes : [])
  ];
  const seen = new Set();
  return raw
    .map((theme) => ({
      id: String(theme?.id || theme?.name || "").trim(),
      name: String(theme?.name || theme?.id || "").trim(),
      stage: theme?.stage || "",
      positionSignal: theme?.positionSignal || "",
      actionBias: theme?.actionBias || "",
      forwardScore: Number(theme?.forwardScore),
      crowdingScore: Number(theme?.crowdingScore),
      rotationScore: Number(theme?.rotationScore),
      lowPositionScore: Number(theme?.lowPositionScore)
    }))
    .filter((theme) => theme.id || theme.name)
    .filter((theme) => {
      const key = `${theme.id}|${theme.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function hasHighChaseTheme(candidate = {}) {
  return getCandidateThemeSignals(candidate).some((theme) =>
    theme.positionSignal === "high_chase_risk"
    || theme.stage === "crowded"
    || Number(theme.crowdingScore) >= 55
  );
}

function getCandidateSeedThisYearPct(candidate = {}) {
  return finiteMetricNumber(candidate.seed?.thisYearPct ?? candidate.thisYearPct);
}

function hasPullbackYearToDateChaseRisk(candidate = {}) {
  const thisYear = getCandidateSeedThisYearPct(candidate);
  return Number.isFinite(thisYear) && thisYear > 30;
}

function hasPullbackLongPositionChaseRisk(candidate = {}) {
  const trend = candidate.trendProfile || {};
  const longPosition = finiteMetricNumber(trend.lowPositionPct250);
  if (!Number.isFinite(longPosition) || longPosition < 80) return false;
  const drawdown = finiteMetricNumber(trend.drawdownFromRecentHighPct);
  const return120 = finiteMetricNumber(trend.return120dPct);
  return !Number.isFinite(drawdown)
    || drawdown > -8
    || (Number.isFinite(return120) && return120 > 20);
}

function getPullbackTrendEvidenceDate(candidate = {}) {
  return extractPortfolioWatchSnapshotDate({
    snapshotDate: candidate.snapshotDate,
    navDate: candidate.nav?.navDate || candidate.navDate,
    date: candidate.date,
    trendProfile: candidate.trendProfile || {}
  });
}

function evaluatePullbackTrendFreshness(candidate = {}, options = {}) {
  const evidenceDate = getPullbackTrendEvidenceDate(candidate);
  if (!evidenceDate) return { ok: true, issues: [] };
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const age = daysSincePortfolioDate(evidenceDate, nowMs);
  const maxAge = finiteNumberOr(process.env.PULLBACK_SETUP_MAX_TREND_AGE_DAYS, 10);
  if (Number.isFinite(age) && age > maxAge) {
    return { ok: false, issues: [`净值走势已过期${age}天，需要重新下钻后再判断买点`] };
  }
  return { ok: true, issues: [] };
}

function isPullbackTrendFreshEnough(candidate = {}) {
  return evaluatePullbackTrendFreshness(candidate).ok;
}

function scorePullbackThemeRotation(candidate = {}) {
  const themes = getCandidateThemeSignals(candidate);
  if (!themes.length) return 0;
  let score = 0;
  for (const theme of themes.slice(0, 2)) {
    const crowding = Number(theme.crowdingScore);
    const rotation = Number(theme.rotationScore);
    const lowPosition = Number(theme.lowPositionScore);
    if (theme.positionSignal === "high_chase_risk") score -= 28;
    if (theme.stage === "crowded") score -= 20;
    if (Number.isFinite(crowding)) {
      if (crowding >= 55) score -= 18;
      else if (crowding >= 40) score -= 8;
    }
    if (theme.positionSignal === "low_position_rotation") score += 18;
    if (theme.positionSignal === "acceptable_position") score += 10;
    if (theme.stage === "low_position_rotation") score += 10;
    if (Number.isFinite(rotation) && Number.isFinite(lowPosition)) {
      if (rotation >= 45 && lowPosition >= 45) score += 14;
      else if (rotation >= 35 && lowPosition >= 35) score += 8;
    }
    if (Number.isFinite(lowPosition) && lowPosition < 20 && Number.isFinite(crowding) && crowding >= 35) score -= 8;
  }
  return Math.max(-50, Math.min(34, score));
}

function formatCandidateThemeEvidence(candidate = {}) {
  const theme = getCandidateThemeSignals(candidate)[0];
  if (!theme) return "";
  const parts = [
    theme.name || "题材",
    theme.positionSignal === "high_chase_risk" || theme.stage === "crowded" ? "偏拥挤" : "",
    theme.positionSignal === "low_position_rotation" || theme.stage === "low_position_rotation" ? "低位轮动" : "",
    theme.positionSignal === "acceptable_position" ? "位置尚可" : "",
    Number.isFinite(theme.rotationScore) ? `轮动=${round(theme.rotationScore, 1)}` : "",
    Number.isFinite(theme.lowPositionScore) ? `低位=${round(theme.lowPositionScore, 1)}` : "",
    Number.isFinite(theme.crowdingScore) ? `拥挤=${round(theme.crowdingScore, 1)}` : ""
  ].filter(Boolean);
  return parts.length ? `题材=${parts.join("/")}` : "";
}

function collectPortfolioSources(...items) {
  const sources = [];
  for (const item of items.flat(Infinity)) {
    if (!item) continue;
    if (Array.isArray(item.sources)) sources.push(...item.sources);
    if (Array.isArray(item.source)) sources.push(...item.source);
    if (typeof item.source === "string") sources.push(item.source);
  }
  return [...new Set(sources.map(String).filter(Boolean))].slice(0, 30);
}

function getProfileNav(profile) {
  return toNumber(profile?.unitNav) || toNumber(profile?.estimatedNav) || null;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function normalizePortfolioTaskType(value) {
  const type = String(value || "decision").toLowerCase();
  if (["premarket", "decision", "valuation", "weekly"].includes(type)) return type;
  throw new Error("未知虚拟基金经理任务类型。");
}

function getZonedDateTime(timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${hour}:${parts.minute}`,
    timeZone
  };
}

function formatSignedNumber(value) {
  const number = round(Number(value || 0), 2);
  return number > 0 ? `+${number}` : String(number);
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

async function extractFundFactsWithModel({ images, userText, messageType }) {
  if (!images?.length) {
    const fundCodes = extractFundCodes(userText);
    const resolvedFunds = fundCodes.length ? [] : await resolveFundMentionsFromText(userText);
    const resolvedCodes = resolvedFunds.map((item) => item.code);
    return {
      fundCodes: mergeFundCodes(fundCodes, resolvedCodes),
      fundNames: resolvedFunds.map((item) => item.name).filter(Boolean),
      visibleFacts: userText ? [userText] : [],
      missingFields: [],
      textResolvedFunds: resolvedFunds
    };
  }

  const skillContext = buildSkillContextForIntent({ skillIds: ["fund-vision"] }, []);
  const systemText = [
    "你只负责从基金截图中提取可见事实，不做投资评价。",
    "请只返回 JSON，不要 Markdown，不要解释。",
    "如果看不清，不要猜。基金代码必须是截图中可见或用户文字中明确出现的 6 位数字。",
    "",
    skillContext
  ].join("\n");
  const userPrompt = [
    `消息类型：${messageType || "unknown"}`,
    userText ? `用户文字：${userText}` : "用户文字：无",
    `图片数量：${images.length}`,
    "",
    "返回 JSON 结构：",
    '{"fundCodes":["000001"],"fundNames":["示例基金"],"visibleFacts":["截图中可见的关键事实"],"missingFields":["看不清或缺失字段"]}'
  ].join("\n");

  try {
    const raw = await callModel({
      systemText,
      userPrompt,
      images,
      maxTokens: getFundWorkflowMaxOutputTokens(MIN_FUND_EXTRACTION_OUTPUT_TOKENS)
    });
    const parsed = parseJsonFromModel(raw);
    const fundCodes = mergeFundCodes(extractFundCodes(userText), parsed.fundCodes || []);
    updateStats({
      counters: { extractionCalls: 1, extractedFundCodes: fundCodes.length },
      last: { lastExtractionAt: new Date().toISOString() }
    });
    return {
      fundCodes,
      fundNames: Array.isArray(parsed.fundNames) ? parsed.fundNames.map(String).filter(Boolean) : [],
      visibleFacts: Array.isArray(parsed.visibleFacts) ? parsed.visibleFacts.map(String).filter(Boolean) : [],
      missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields.map(String).filter(Boolean) : [],
      raw: raw.slice(0, 2000)
    };
  } catch (error) {
    recordError(error, { extractionFailures: 1 });
    return {
      fundCodes: extractFundCodes(userText),
      fundNames: [],
      visibleFacts: userText ? [userText] : [],
      missingFields: ["截图事实提取失败，已退回到可见文字/图片整体分析。"],
      extractionError: error.message
    };
  }
}

async function resolveFundMentionsFromText(userText, limit = 4) {
  const text = String(userText || "").trim();
  if (!text || isGenericFundReference(text)) return [];

  const result = await fetchFundSearchCandidates(text).catch((error) => {
    recordError(error, { textFundResolutionFailures: 1 });
    return { ok: false, items: [] };
  });
  const items = Array.isArray(result.items) ? result.items : [];
  if (!items.length) return [];

  const directMatches = items.filter((item) => fundNameAppearsInText(text, item));
  if (!directMatches.length) return [];

  const productKeys = new Set(directMatches.map(getCandidateProductKey).filter(Boolean));
  const selected = [];
  for (const item of items) {
    if (!item?.code) continue;
    const sameProduct = productKeys.has(getCandidateProductKey(item));
    const direct = directMatches.some((match) => match.code === item.code);
    if (!direct && !sameProduct) continue;
    if (selected.some((existing) => existing.code === item.code)) continue;
    selected.push({
      code: item.code,
      name: item.name || "",
      shareClass: item.shareClass || "",
      type: item.type || "",
      source: item.source || ""
    });
    if (selected.length >= limit) break;
  }

  updateStats({
    counters: {
      textFundNameResolutions: selected.length ? 1 : 0,
      textFundNameResolvedCodes: selected.length
    },
    last: selected.length ? { lastTextFundNameResolutionAt: new Date().toISOString() } : {}
  });
  return selected;
}

function isGenericFundReference(text) {
  const normalized = normalizeIntentText(text)
    .replace(/[，。！？、,.!?]/g, "")
    .replace(/\s+/g, "");
  const genericWords = [
    "基金",
    "这个基金",
    "这只基金",
    "最近基金",
    "帮我看看基金",
    "基金能买吗",
    "基金值得买吗",
    "推荐基金"
  ];
  if (genericWords.includes(normalized)) return true;
  return normalized.length < 5;
}

function fundNameAppearsInText(text, item = {}) {
  const normalizedText = normalizeFundMentionText(text);
  const name = normalizeFundMentionText(item.name || "");
  if (name.length >= 4 && normalizedText.includes(name)) return true;

  const productName = normalizeCandidateFundName(item.name || "");
  const compactProduct = normalizeFundMentionText(productName);
  if (compactProduct.length >= 4 && normalizedText.includes(compactProduct)) return true;

  const withoutFundSuffix = compactProduct.replace(/基金$/i, "");
  return withoutFundSuffix.length >= 4 && normalizedText.includes(withoutFundSuffix);
}

function normalizeFundMentionText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[（）()【】\[\]·._\-—]/g, "")
    .replace(/问题|请问|帮我|看看|分析一下|分析|怎么样|能买吗|还能买吗|值得买吗|适合买吗|要不要买|要不要卖|哪个好|哪只好|对比|比较|最近|现在|当前/g, "")
    .toLowerCase()
    .trim();
}

function getFundAnalysisSkillIds(extra = []) {
  return [
    "fund-data-enrichment",
    "fund-trend-analysis",
    "fund-risk-analysis",
    "fund-holdings-style",
    "fund-fee-share-class",
    "fund-manager-quality",
    "fund-analysis",
    ...extra,
    "fund-actionability-evaluation",
    "fund-answer-quality"
  ];
}

function getFundRecommendationSkillIds(extra = []) {
  return [
    "fund-theme-radar",
    "theme-stage-analysis",
    "theme-to-fund-mapping",
    "forward-looking-actionability",
    "fund-recommendation",
    "fund-market-timing",
    "fund-fee-share-class",
    ...extra,
    "fund-actionability-evaluation",
    "fund-answer-quality",
    "fund-synthesis"
  ];
}

function getFundQaSkillIds(extra = []) {
  return [
    "fund-theme-radar",
    "theme-stage-analysis",
    "forward-looking-actionability",
    "fund-market-timing",
    "fund-trend-analysis",
    ...extra,
    "fund-actionability-evaluation",
    "fund-answer-quality",
    "fund-synthesis"
  ];
}

function buildFundCommitteeSystemText(skillIds = getFundAnalysisSkillIds(), { userText = "" } = {}) {
  const skillContext = buildSkillContextForIntent({ workflow: "fund_screening", skillIds, userText }, [], { userText });
  return [
    "你是飞书机器人“基金经理”。你的任务是根据用户发送的基金截图或基金文字信息做教育性基金筛选分析。",
    "必须严格遵循当前阶段加载的 modular skills。只使用与当前任务相关的 skill，不要把所有基金流程强行套到用户请求上。",
    "不要对截图逐字念稿。要先吸收截图事实和联网补全资料，再给出投资筛选评价。",
    "必须识别份额类别并解释费用差异；A/C/D/I 等同基金不同份额要按申购费、销售服务费、赎回费和预计持有期比较。",
    "如果联网补全资料与截图冲突，要明确分开“截图可见”和“联网补全”，不要硬合并。",
    "最终回复会以飞书卡片展示，可使用少量 Markdown 加粗和编号列表，但不要输出 Markdown 表格或代码块。",
    "回答中文，优先简洁、明确、可执行。不要保证收益，不要给出个性化承诺；但如果证据偏正面，要敢于给出买入/分批买入方案，不要机械地总是建议等待回撤或极低仓位。",
    "面向用户时禁止输出内部字段名或英文枚举，例如 trendProfile、actionability、entryBias、fitLabel、extended_uptrend、tactical_only、staged_buy、wait_pullback；必须转成自然中文。",
    "最终给用户的回答禁止输出 Manager Decision、Evidence、Confidence、Verdict、Score 等英文栏目词；必须改成结论、证据、把握度、评分、经理判断等自然中文。",
    "",
    skillContext
  ].join("\n");
}

function buildFundCommitteeEvidencePrompt({ images = [], userText, messageType, extracted, enrichments }) {
  return [
    "用户通过飞书发送了一条基金相关消息。",
    `消息类型：${messageType || "unknown"}`,
    userText ? `用户文字：${userText}` : "用户文字：无",
    images?.length
      ? `图片：已附上 ${images.length} 张。请逐张识别截图中的基金信息；如果多张图属于同一只基金，请合并分析；如果是多只基金，请分别给出简短结论并说明对比。`
      : "图片：无，请只根据已提取事实和用户文字分析。",
    "",
    "截图事实提取结果：",
    JSON.stringify(extracted || {}, null, 2),
    "",
    "联网补全资料：",
    JSON.stringify(enrichments || [], null, 2),
    "",
    "如果联网补全资料中包含 riskMetrics，请优先使用其中的 1y/3y/5y 夏普率、年化波动、最大回撤、年化收益来评分；不要再要求用户手动补这些指标。只有 riskMetrics.ok=false 或点数不足时，才把这些列为缺失。",
    "如果联网补全资料中包含 holdings，请优先使用 equityTopHoldings / bondTopHoldings 做前十大持仓、行业前景、集中度、披露日期和风格匹配分析。港股通、QDII、债基和指数基金可能分别出现在股票投资明细、债券投资明细或资产配置字段中；不要在已有 holdings 时说缺少十大持仓。",
    "如果联网补全资料中包含 moneyMarket，请按现金管理产品分析，优先看7日年化、万份收益、流动性和收益稳定性，不要套用权益基金追涨/回撤框架。",
    "如果资料中包含 trendProfile 或 actionability，请优先使用它们判断入场时机、适合对象和仓位上限。",
    "分析时必须拆开走势/买点、风险/回撤、前十大持仓/前景、份额/费率、经理质量这五块；最终汇总必须经过 fund-actionability-evaluation 和 fund-answer-quality，避免只给“可以配置但别追高”这类泛泛结论。"
  ].join("\n");
}

async function buildAnalystReviewWithModel({ images, userText, messageType, extracted, enrichments }) {
  const isComparison = detectComparisonNeed({ userText, extracted, enrichments });
  const systemText = buildFundCommitteeSystemText(
    isComparison
      ? getFundAnalysisSkillIds(["fund-comparison"])
      : getFundAnalysisSkillIds(),
    { userText }
  );
  const userPrompt = [
    buildFundCommitteeEvidencePrompt({ images, userText, messageType, extracted, enrichments }),
    "",
    "阶段：分析师分析中。",
    "请只输出内部投研简报，不要给最终用户话术，不要输出 Markdown 表格。",
    "结构：",
    "1. Evidence intake：截图可见、联网补全、推断分别列出。",
    isComparison
      ? "2. 多基金对比分析：按产品、业绩、持仓、市场、风险 5 个角度比较候选基金，目标是选出更好的一只或组合，不要为每只基金生成完整单基报告。"
      : "2. 5 个证据分析师：产品资料员、业绩指标员、持仓风格员、市场主题员、情绪新闻员。每个角色给出倾向：正 / 中 / 负，以及一句关键理由。",
    "3. 数据质量：哪些关键数据可靠，哪些缺失或可能滞后。",
    isComparison ? "4. 初步排序：给出首选、备选、观察/剔除对象和原因，不要给最终用户话术。" : "4. 初步评分区间：给一个区间和原因，不要给最终动作。"
  ].join("\n");

  const maxTokens = getFundWorkflowMaxOutputTokens(MIN_FUND_ANALYST_OUTPUT_TOKENS);
  const review = await callModel({ systemText, userPrompt, images, maxTokens });
  updateStats({
    counters: { analystReviewCalls: 1 },
    last: { lastAnalystReviewAt: new Date().toISOString() }
  });
  return review;
}

function getConfiguredMaxOutputTokens() {
  return Number(getEffectiveConfig().modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS);
}

function getFundWorkflowMaxOutputTokens(minimum) {
  return Math.max(getConfiguredMaxOutputTokens(), Number(minimum || 0));
}

async function buildCommitteeVoteWithModel({ userText, messageType, extracted, enrichments, analystReview }) {
  const isComparison = detectComparisonNeed({ userText, extracted, enrichments });
  const systemText = buildFundCommitteeSystemText(isComparison ? getFundAnalysisSkillIds(["fund-comparison"]) : getFundAnalysisSkillIds(), { userText });
  const userPrompt = [
    buildFundCommitteeEvidencePrompt({ images: [], userText, messageType, extracted, enrichments }),
    "",
    "分析师简报：",
    analystReview,
    "",
    "阶段：委员会投票中。",
    "请基于分析师简报进行紧凑投票，不要输出最终用户完整卡片，不要输出 Markdown 表格。",
    "结构：",
    isComparison
      ? "1. 选择票：首选、备选、剔除/观察分别是谁。"
      : "1. 牛方研究员：正/中/负，最强买入理由。",
    isComparison
      ? "2. 分歧点：为什么不是每只都买。"
      : "2. 熊方研究员：正/中/负，最强反对理由。",
    "3. 风险经理：激进、均衡、保守三档仓位约束。",
    "4. 委员会票数：正向 x、 neutral x、负向 x。",
    isComparison
      ? "5. 建议动作草案：选哪只 / 组合买入 / 继续观察 / 全部回避。"
      : "5. 建议动作草案：买入 / 分批买入 / 持有 / 换基 / 观察 / 回避。",
    "6. 10000 元草案：激进、均衡、保守各自金额。"
  ].join("\n");

  const maxTokens = getFundWorkflowMaxOutputTokens(MIN_FUND_COMMITTEE_OUTPUT_TOKENS);
  const vote = await callModel({ systemText, userPrompt, images: [], maxTokens });
  updateStats({
    counters: { committeeVoteCalls: 1 },
    last: { lastCommitteeVoteAt: new Date().toISOString() }
  });
  return vote;
}

async function analyzeFundWithModel({ userText, messageType, extracted, enrichments, analystReview, committeeVote }) {
  const isComparison = detectComparisonNeed({ userText, extracted, enrichments });
  const systemText = [
    buildFundCommitteeSystemText(
      isComparison
        ? getFundAnalysisSkillIds(["fund-comparison", "fund-synthesis"])
        : getFundAnalysisSkillIds(["fund-synthesis"]),
      { userText }
    ),
    "",
    isComparison
      ? "现在进入汇总阶段。你要回答用户“多个基金怎么选”，不要为每只基金输出完整单基长报告。"
      : "现在进入汇总阶段。你要把分析师简报和委员会投票整理成最终发给用户的飞书卡片文案。"
  ].join("\n");

  const userPrompt = [
    buildFundCommitteeEvidencePrompt({ images: [], userText, messageType, extracted, enrichments }),
    "",
    "分析师简报：",
    analystReview || "缺失",
    "",
    "委员会投票：",
    committeeVote || "缺失",
    "",
    "阶段：主席验收中。",
    "",
    "请按以下结构输出，不要输出 Markdown 表格：",
    isComparison
      ? "1. 开场结论：首选哪只/哪几只、把握度、选择理由；不需要给每只基金都打完整单基分。"
      : "1. 开场结论：结论、把握度、评分，并用一句话解释这个分数的含义，例如“61/100 = 可观察但还没到重仓”。",
    isComparison
      ? "2. 多基金选择：给出排名、首选、备选、为什么不选其他基金；不要给每只基金都套 8 角色长流程。"
      : "2. 投研团队视角：产品、业绩、持仓、市场、风险等角色各 1 行，给出正/中/负倾向和关键理由。",
    "3. 经理最终判断：最终动作必须是买入 / 分批买入 / 持有 / 换基 / 观察 / 回避之一，并说明最大买点和最大不买理由。",
    "4. 1万元执行方案：假设用户准备新增 10000 元，给出激进、均衡、保守三档的金额或比例；如果基金适合出击，激进档可以给到更高比例，但要写清止损/再评估触发条件。",
    "5. 自评估结果：是否适合当前用户真实需求，适合谁，不适合谁；把把握度写成自然句，不要写 confidence 或“信心：高”这类字段。",
    "6. 决策边界：最多 2 条，只列会改变买入/持有/回避动作的条件，不要写通用风险清单。",
    "7. 缺失数据：只列真正影响结论的字段；不要把已联网补全的夏普率、回撤、波动率重复列为缺失。"
  ].join("\n");

  const finalText = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: getFundWorkflowMaxOutputTokens(MIN_FUND_QA_OUTPUT_TOKENS)
  });
  const guardedText = await enforceFundAnswerQuality({
    text: finalText,
    workflow: isComparison ? "fund_comparison" : "fund_screening",
    userText,
    intent: { workflow: isComparison ? "fund_comparison" : "fund_screening" },
    evidence: {
      extracted,
      enrichments,
      analystReview,
      committeeVote
    }
  });
  updateStats({
    counters: { managerReviewCalls: 1 },
    last: { lastManagerReviewAt: new Date().toISOString() }
  });
  return guardedText;
}

async function recommendFundsWithModel({ userText, intent, marketSnapshot }) {
  const skillContext = buildSkillContextForIntent(intent, getFundRecommendationSkillIds(), { userText });
  const marketEvidence = buildMarketEvidenceSummary(userText, marketSnapshot);
  const portfolioWatchlistContext = await getFundWorkflowWatchlistContext(userText);
  const marketDeepDive = mergeFundWorkflowWatchlistIntoDeepDive(
    await fetchMarketDeepDive(userText, marketSnapshot, { forRecommendation: true }),
    portfolioWatchlistContext.candidates,
    userText
  );
  const marketDeepDiveSummary = buildMarketDeepDiveSummary(marketDeepDive);
  const systemText = [
    "你是飞书机器人“基金经理”的基金发现与配置工作流。",
    "当前任务不是分析用户已经给出的某一只基金，也不是截图 screening；当前任务是根据用户文字、公开市场快照和基金候选池，给出教育性的基金方向与候选清单。",
    "推荐顺序必须是：先判断题材/事件/催化阶段，再判断基金承载工具；基金净值走势只能作为确认信号，不能作为第一推荐理由。",
    "如果 marketSnapshot.themeRadar 或 marketDeepDive.themeRadar 存在，必须先使用其中的 stage、forwardScore、crowdingScore、actionBias 判断题材赔率，再筛选基金。",
    "必须优先使用传入的 marketSnapshot；涉及黄金、白银或贵金属时，优先使用 marketIndicators.preciousMetals 和 fundCandidates.preciousMetalFunds。不要声称自己额外联网。",
    "如果提供了 marketDeepDive，必须使用其中的 trendProfile、risk、fees、holdings 和 actionability 来筛掉不适合的候选；不要只复述市场快照。",
    "如果提供了经理自选候选池，必须先复核这些已经沉淀的 ready/waiting/启动前夜候选；ready 可以进入主推荐评估，waiting 或启动前夜只能写备选观察和触发条件，不能当成自动买入。",
    "marketDeepDive 中的 trendProfile、actionability、entryBias、fitLabel 等是内部字段；最终回答必须翻译成中文用户话术，不要原样输出字段名或 extended_uptrend/staged_buy/wait_pullback 这类枚举。",
    "如果用户要求找“回调完成、准备启动、低位启动、不要追涨”的基金，必须优先选择 pullbackSetup.signal 为 pullback_complete 或 launch_setup 的候选；同时检查5日/10日是否刚转强、120日区间位置是否偏低。短期涨幅偏热、20日/60日大涨且 entryBias 为 wait_pullback 的候选只能列入观察，不得作为主推荐。",
    "不要编造 marketSnapshot 里没有的基金代码、涨跌幅、排名、金价或新闻。",
    "推荐基金时不要默认偏向 A 类；同一基金存在 A/C/D/I 等份额时，按用户持有期和费用模型说明为什么选这个份额，并提示可替代份额。",
    "如果候选下钻里出现 seed.alternativeShareClasses 或 seed.sameExposureAlternatives，不要把它们当成独立推荐名额；主推荐只列一个代表，替代份额/同指数替代品放在该条下面说明。",
    "必须通过 fund-actionability-evaluation 和 fund-answer-quality 质量门槛：先给直接结论，再给适合/不适合的自评估，再给执行方案。",
    "如果数据不足以支持具体基金代码，就推荐基金方向/筛选条件，并把具体代码标为待复核。",
    "回答要大胆但有边界：证据偏正面时可以给出买入或分批买入候选；不要机械地总是等待回撤。",
    "如果下钻候选足够，回答要服务 12 张左右报告配图：主买入参考和备选观察各 6 张左右；每只都用代码说明图上看的走势、回撤、低位、费用或风险证据。",
    "回答要像专业经理在和客户沟通：用自然中文解释把握度，不要写“信心：高。”、“Confidence: high”这类字段式短句。",
    "不要把风险写成免责声明清单。只保留会改变买入/等待/回避动作的决策边界。",
    "输出适合飞书卡片阅读，不要 Markdown 表格，不要代码块。",
    "",
    skillContext
  ].join("\n");

  const userPrompt = [
    `用户需求：${userText || "无"}`,
    "",
    "路由判断：",
    JSON.stringify(intent || {}, null, 2),
    "",
    "公开市场/基金候选快照：",
    JSON.stringify(marketSnapshot || {}, null, 2),
    "",
    "已提炼的市场证据摘要：",
    marketEvidence,
    "",
    "候选基金下钻摘要：",
    marketDeepDiveSummary,
    "",
    "经理自选候选池：",
    portfolioWatchlistContext.summary,
    "",
    "请输出：",
    "1. 直接结论：买 / 分批买 / 等 / 回避，以及一句理由。",
    "2. 题材雷达：先列 1-3 个相关题材的中文阶段、前瞻评分、拥挤度、为什么现在值得/不值得看；不要输出 stage/forwardScore/crowdingScore 这些字段名。",
    "3. 自评估：这类需求是否适合现在做、把握度如何、适合激进/均衡/保守哪类。",
    "4. 推荐清单：优先 3-4 个候选基金或 ETF。每个候选包含代码、名称、份额类别、费用模型、主题承载逻辑、回调/启动信号、5日/10日早期转强、120日区间低位、趋势/自评估动作、为什么入选，以及“配图看什么”。只能使用快照、下钻或经理自选候选池中的候选代码；如果没有足够代码，就写“待复核方向”。",
    "   同一基金 A/C 类只能占 1 个推荐名额；同一指数/同一 ETF 联接只列 1 个主品种，其他代码只能作为替代项说明。",
    "5. 1万元执行：直接给激进、均衡、保守三档金额或比例。",
    "6. 备选观察：如果有未到买点但值得等的候选，列 3-5 个备选，说明还差什么触发，以及对应配图看什么；偏热、追涨或回避对象单独写排除原因，不要混进备选。",
    "7. 决策边界：最多 2 条，只写会导致少买/不买/暂停加仓的题材或价格条件。"
  ].join("\n");

  const draft = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: getFundWorkflowMaxOutputTokens(MIN_FUND_RECOMMENDATION_OUTPUT_TOKENS)
  });
  const text = await enforceFundAnswerQuality({
    text: draft,
    workflow: "fund_recommendation",
    userText,
    intent,
    evidence: {
      marketEvidence,
      marketSnapshot: summarizeMarketSnapshot(marketSnapshot),
      marketDeepDive,
      portfolioWatchlist: portfolioWatchlistContext.candidates
    }
  });
  updateStats({
    counters: { fundRecommendationModelCalls: 1 },
    last: { lastFundRecommendationAt: new Date().toISOString() }
  });
  const chartProfiles = selectFundReportProfilesForAnswer(marketDeepDive?.candidates || [], text, {
    minCount: getFundReportChartMinCount(),
    limit: getFundReportChartLimit()
  });
  return {
    text: appendFundReportChartReadingGuide(text, chartProfiles),
    chartProfiles
  };
}

async function answerFundQuestionWithModel({ userText, intent, marketSnapshot }) {
  const skillContext = buildSkillContextForIntent(intent, getFundQaSkillIds(), { userText });
  const marketEvidence = buildMarketEvidenceSummary(userText, marketSnapshot);
  const portfolioWatchlistContext = await getFundWorkflowWatchlistContext(userText);
  const marketDeepDive = mergeFundWorkflowWatchlistIntoDeepDive(
    await fetchMarketDeepDive(userText, marketSnapshot, { forRecommendation: false }),
    portfolioWatchlistContext.candidates,
    userText
  );
  const marketDeepDiveSummary = buildMarketDeepDiveSummary(marketDeepDive);
  const systemText = [
    "你是飞书机器人“基金经理”的基金问答工作流。",
    "当前任务是回答用户问题，不是单只基金 screening；除非用户给出明确基金代码或截图，否则不要强行输出 Verdict/Score/8 角色评审。",
    "遇到“某主题最近值不值得买”时，必须先判断题材/新闻/市场阶段，再判断基金或 ETF 工具；基金净值走势只是确认信号。",
    "如果传入 marketSnapshot，可用它回答近期市场/题材问题；涉及黄金、白银或贵金属时，优先引用 marketIndicators.preciousMetals 和相关基金候选。",
    "如果 marketSnapshot.themeRadar 或 marketDeepDive.themeRadar 存在，优先引用 stage、forwardScore、crowdingScore、actionBias，避免只按历史涨幅回答。",
    "如果提供了 marketDeepDive，必须使用下钻候选的 trendProfile、risk、fees、holdings 和 actionability 来形成买/等/回避判断。",
    "如果提供了经理自选候选池，必须把它当成已经沉淀的备选来源先复核；ready 可以进入买入参考，waiting 或启动前夜只能说明等待条件。",
    "marketDeepDive 中的 trendProfile、actionability、entryBias、fitLabel 等是内部字段；最终回答必须翻译成中文用户话术，不要原样输出字段名或 extended_uptrend/staged_buy/wait_pullback 这类枚举。",
    "如果用户要求找“回调完成、准备启动、低位启动、不要追涨”的基金，必须优先判断 pullbackSetup.signal、5日/10日早期转强和120日区间低位；短期涨幅偏热、20日/60日大涨且等待回撤的候选不能被包装成启动机会。",
    "如果没有抓到对应行情数据，要说明是公开数据源暂时不可用或滞后，不要简单说自己没有实时数据能力。",
    "必须通过 fund-actionability-evaluation 和 fund-answer-quality 质量门槛：前两行直接回答；有快照/下钻就引用具体字段；给明确行动、适合对象和仓位建议。",
    "当问题涉及买入、配置、推荐或备选时，如果下钻候选足够，回答要服务 12 张左右报告配图：主买入参考和备选观察都要写代码，并说明图上看的走势、低位、回撤、费用或风险证据。",
    "回答要像专业经理在和客户沟通：用自然中文解释把握度，不要写“信心：高。”、“Confidence: high”这类字段式短句。",
    "不要把风险写成免责声明清单。只保留会改变买入/等待/回避动作的决策边界。",
    "回答中文、简洁、可执行。不要保证收益，不要给出个性化承诺。",
    "输出适合飞书卡片阅读，不要 Markdown 表格，不要代码块。",
    "",
    skillContext
  ].join("\n");

  const userPrompt = [
    `用户问题：${userText || "无"}`,
    "",
    "路由判断：",
    JSON.stringify(intent || {}, null, 2),
    "",
    marketSnapshot ? "市场快照：" : "市场快照：未抓取，此问题按通用基金知识回答。",
    marketSnapshot ? JSON.stringify(marketSnapshot, null, 2) : "",
    "",
    "已提炼的市场证据摘要：",
    marketEvidence,
    "",
    "候选基金下钻摘要：",
    marketDeepDiveSummary,
    "",
    "经理自选候选池：",
    portfolioWatchlistContext.summary,
    "",
    "请直接回答用户问题。若用户问“值得买吗”，必须给中文动作“买入 / 分批买入 / 等待 / 回避”之一，并给新资金和已有持仓分别怎么做。如回答里给出具体基金候选，主买入和备选观察都要写代码、中文走势证据、触发条件和配图看点；偏热回避对象不要和备选混写。若用户实际是在要推荐基金，请提示他可以说“按最近题材推荐几个基金”，系统会进入基金发现工作流。"
  ].join("\n");

  const draft = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: getFundWorkflowMaxOutputTokens(MIN_FUND_QA_OUTPUT_TOKENS)
  });
  const text = await enforceFundAnswerQuality({
    text: draft,
    workflow: "fund_qa",
    userText,
    intent,
    evidence: {
      marketEvidence,
      marketSnapshot: summarizeMarketSnapshot(marketSnapshot),
      marketDeepDive,
      portfolioWatchlist: portfolioWatchlistContext.candidates
    }
  });
  updateStats({
    counters: { fundQaModelCalls: 1 },
    last: { lastFundQaAt: new Date().toISOString() }
  });
  const chartProfiles = selectFundReportProfilesForAnswer(marketDeepDive?.candidates || [], text, {
    minCount: shouldRequireExpandedFundReportCharts({ workflow: "fund_qa", userText, evidence: { marketDeepDive } })
      ? getFundReportChartMinCount()
      : 0,
    limit: getFundReportChartLimit()
  });
  return {
    text: appendFundReportChartReadingGuide(text, chartProfiles),
    chartProfiles
  };
}

async function enforceFundAnswerQuality({ text, workflow, userText, intent, evidence }) {
  const localizedText = normalizeUserFacingFundAnswer(text);
  if (String(process.env.FUND_ANSWER_QUALITY_GATE ?? "true") === "false") {
    return localizedText;
  }

  const evaluation = evaluateFundAnswerQuality({ text, workflow, userText, evidence });
  if (evaluation.ok) {
    updateStats({ counters: { fundAnswerQualityPasses: 1 } });
    return localizedText;
  }

  updateStats({
    counters: { fundAnswerQualityFailures: 1 },
    last: {
      lastFundAnswerQualityFailureAt: new Date().toISOString(),
      lastFundAnswerQualityIssues: evaluation.issues.join(",")
    }
  });

  const deterministicFallback = buildPullbackQualityFallbackAnswer({ userText, evidence, issues: evaluation.issues });
  if (deterministicFallback) {
    updateStats({ counters: { fundAnswerQualityDeterministicFallbacks: 1 } });
    return deterministicFallback;
  }

  if (String(process.env.FUND_ANSWER_QUALITY_REWRITE ?? "true") === "false") {
    return localizedText;
  }

  try {
    const skillContext = buildSkillContextForIntent(
      { skillIds: ["fund-answer-quality", "fund-synthesis"] },
      ["fund-answer-quality", "fund-synthesis"]
    );
    const systemText = [
      "你是飞书机器人“基金经理”的最终质检编辑。",
      "只重写最终给用户看的回答，不要暴露隐藏推理或内部思考链。",
      "前两行必须直接回答用户问题，给出明确动作，引用已有证据，并把风险转成仓位、等待条件或复查触发。",
      "不要编造证据里没有的基金代码、市场数字或行情。",
      "必须使用自然中文。禁止输出内部字段名或英文枚举，例如 trendProfile、actionability、entryBias、fitLabel、extended_uptrend、tactical_only、staged_buy、wait_pullback。",
      "遇到内部标签时要翻译成客户能读懂的话：extended_uptrend=短期涨幅偏热，tactical_only=只适合战术小仓位，staged_buy=分批买入，wait_pullback=等待回撤。",
      "禁止机械写“信心：高。”、“把握度：高。”、“Confidence: high”。要改成自然句，例如“我对这条判断把握度较高，主要因为证据比较一致。”",
      "禁止输出 Manager Decision、Evidence、Research debate、Allocation proposal、Risk committee、Missing data、Verdict、Confidence、Score、buy、staged、wait、avoid、hold、switch 等英文动作/栏目词；全部改成经理最终判断、证据、投研分歧、配置方案、风控检查、缺失数据、结论、把握度、评分、买入、分批买入、等待、回避、持有、换基。",
      "若质检问题包含 watch_candidate_promoted_to_recommendation、recommendation_not_from_pullback_main_candidates 或 recommends_without_qualified_pullback_candidate，必须按证据里的 mainCandidateCodes 重写主推荐；watchOrRejectCodes 只能写进观察/排除原因。",
      "若质检问题包含 watch_candidate_given_buy_execution 或 watch_candidate_given_buy_signal，观察/排除候选不能获得买入金额，也不能写“可以买、小仓位试探、少买一点、建仓”等买入暗示；只能写0元观察或等待条件。",
      "若质检问题包含 missing_pullback_timing_evidence，主推荐每条必须写出5日/10日早期转强、120日区间低位或距高点回撤等数字证据；若包含 missing_pullback_three_tier_execution，必须给激进/均衡/保守三档金额。",
      "若质检问题包含 missing_pullback_share_class_fee，主推荐每条必须写份额类别和费用模型，例如 C类无前端申购费但有销售服务费，或 A类有申购费但长期持有持续费率较低。",
      "若质检问题包含 insufficient_chart_linked_candidates，必须补足 12 张左右可配图候选：主买入参考和备选观察分开写，每只都写代码、买入/备选角色、图上看的走势/回撤/低位/费用证据。",
      "若证据没有 mainCandidateCodes，必须直接说明暂未筛到合格的回调完成/低位启动主推荐，不能硬凑基金代码。",
      "保持适合飞书卡片阅读，不要 Markdown 表格或代码块。",
      "",
      skillContext
    ].join("\n");
    const userPrompt = [
      `workflow=${workflow || "fund"}`,
      `userQuestion=${userText || ""}`,
      "",
      "routerIntent:",
      JSON.stringify(intent || {}, null, 2),
      "",
      "qualityIssues:",
      evaluation.issues.join(", "),
      "",
      "availableEvidence:",
      compactQualityEvidence(evidence),
      "",
      "draftAnswer:",
      String(text || "").slice(0, 12000),
      "",
      "现在重写回答。保留证据支持的具体数字、基金代码、动作、仓位、把握度和决策边界，但必须把内部字段和英文栏目转成自然中文。"
    ].join("\n");
    const rewritten = await callModel({
      systemText,
      userPrompt,
      images: [],
      maxTokens: getFundWorkflowMaxOutputTokens(MIN_FUND_REWRITE_OUTPUT_TOKENS)
    });
    const cleanedRewrite = normalizeUserFacingFundAnswer(rewritten || localizedText);
    const secondPass = evaluateFundAnswerQuality({ text: cleanedRewrite, workflow, userText, evidence });
    updateStats({
      counters: {
        fundAnswerQualityRewrites: 1,
        fundAnswerQualityRewritePasses: secondPass.ok ? 1 : 0
      },
      last: {
        lastFundAnswerQualityRewriteAt: new Date().toISOString(),
        lastFundAnswerQualityRewriteIssues: secondPass.issues.join(",")
      }
    });
    if (!secondPass.ok) {
      const deterministicFallback = buildPullbackQualityFallbackAnswer({ userText, evidence, issues: secondPass.issues });
      if (deterministicFallback) {
        updateStats({ counters: { fundAnswerQualityDeterministicFallbacks: 1 } });
        return deterministicFallback;
      }
    }
    return cleanedRewrite || localizedText;
  } catch (error) {
    console.error("[fund-answer-quality-rewrite-error]", error);
    recordError(error, { fundAnswerQualityRewriteFailures: 1 });
    const deterministicFallback = buildPullbackQualityFallbackAnswer({ userText, evidence, issues: evaluation.issues });
    if (deterministicFallback) {
      updateStats({ counters: { fundAnswerQualityDeterministicFallbacks: 1 } });
      return deterministicFallback;
    }
    return localizedText;
  }
}

function evaluateFundAnswerQuality({ text, workflow, userText, evidence }) {
  const body = String(text || "").replace(/\s+/g, " ").trim();
  const firstScreen = body.slice(0, 650);
  const issues = [];
  const actionSeeking = workflow !== "conversation" && (
    ["fund_screening", "fund_comparison", "fund_recommendation"].includes(workflow)
    || isActionSeekingFundQuestion(userText)
  );
  const hasAction = /(买入|分批|持有|等待|观望|回避|卖出|换基|暂停|加仓|减仓|止盈|止损|少买|不买|买|卖)/.test(firstScreen);
  const hasSizing = /(\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*(?:元|万)|仓位|比例|成|批|底仓|第一笔|上限|下限)/.test(body);
  const hasEvidence = /(\d{6}|题材|阶段|催化|拥挤|确认|扩散|萌芽|净值|夏普|回撤|波动|费率|持仓|金价|美元指数|COMEX|黄金ETF|QDII|ETF|NAV|\d+(?:\.\d+)?%\s*(?:收益|回撤|波动|费率|涨幅|跌幅|涨|跌))/i.test(body);
  const evidenceAvailable = hasQualityEvidence(evidence);
  const clicheCount = [
    /可以配置.{0,16}(但|不过).{0,12}(不|别)追高/,
    /不建议一把梭/,
    /取决于.{0,16}风险承受/,
    /长期.{0,8}小比例.{0,8}配置/,
    /需要结合自身情况/
  ].filter((pattern) => pattern.test(body)).length;
  const riskCount = (body.match(/风险/g) || []).length;
  const stiffConfidenceLabel = /(^|[\n。；;])\s*(?:信心|把握度|confidence)\s*[：:]\s*(?:高|中|低|high|medium|low)\s*[。.]?(?=\s|$)/i.test(String(text || ""));
  const rawEnglishActionLeak = workflow !== "conversation"
    && /\b(?:verdict|confidence|score|buy|staged\s*buy|staged|wait|avoid|hold|switch)\b\s*[：:]?/i.test(String(text || ""));
  const rawEnglishSectionLeak = workflow !== "conversation" && hasRawEnglishFundSectionLeak(text);

  if (hasInternalFundSignalLeak(body)) issues.push("internal_signal_leak");
  if (stiffConfidenceLabel) issues.push("stiff_confidence_label");
  if (rawEnglishActionLeak) issues.push("raw_english_action_leak");
  if (rawEnglishSectionLeak) issues.push("raw_english_section_leak");
  issues.push(...evaluatePullbackAnswerDiscipline({ text, userText, evidence }));
  issues.push(...evaluateFundAnswerChartCoverage({ text, workflow, userText, evidence }));
  if (actionSeeking && !hasAction) issues.push("missing_direct_action");
  if (actionSeeking && !hasSizing) issues.push("missing_sizing_or_execution");
  if (evidenceAvailable && !hasEvidence) issues.push("missing_concrete_evidence");
  if (isPullbackSetupRequest(userText) && !/(回调|低位|启动|修复|追涨|偏热|高点|低点|5日|10日|20日|60日|120日)/.test(body)) {
    issues.push("missing_pullback_setup_assessment");
  }
  if (clicheCount >= 1 && (!hasSizing || !hasEvidence)) issues.push("generic_cliche_answer");
  if (riskCount >= 6 && !/(边界|触发|仓位|等待|暂停|回避|上限|下限)/.test(body)) {
    issues.push("risk_dump_without_decision_boundary");
  }

  return { ok: issues.length === 0, issues };
}

function evaluateFundAnswerChartCoverage({ text, workflow, userText, evidence }) {
  if (!shouldRequireExpandedFundReportCharts({ workflow, userText, evidence })) return [];
  const profiles = evidence?.marketDeepDive?.candidates || [];
  const minCount = Math.min(getFundReportChartMinCount(), countEligibleFundReportProfiles(profiles));
  if (minCount <= 0) return [];
  const selected = selectFundReportProfilesForAnswer(profiles, text, { minCount: 0, limit: getFundReportChartLimit() });
  const chartBackedCodes = new Set(selected.map((profile) => profile.code || profile.seed?.code || "").filter(Boolean));
  return chartBackedCodes.size >= minCount ? [] : ["insufficient_chart_linked_candidates"];
}

function shouldRequireExpandedFundReportCharts({ workflow, userText, evidence }) {
  const profiles = evidence?.marketDeepDive?.candidates || [];
  if (!Array.isArray(profiles) || profiles.length < 2) return false;
  if (workflow === "fund_recommendation") return true;
  return workflow === "fund_qa" && (isActionSeekingFundQuestion(userText) || isPullbackSetupRequest(userText));
}

function countEligibleFundReportProfiles(profiles = []) {
  return (profiles || []).filter((profile) => isSupplementalFundReportProfileEligible(profile)).length;
}

function evaluatePullbackAnswerDiscipline({ text, userText, evidence }) {
  if (!isPullbackSetupRequest(userText)) return [];
  const deepDive = evidence?.marketDeepDive || null;
  if (deepDive?.selectionDiscipline !== "prefer_pullback_complete_launch_setup_not_chase") return [];

  const ranked = (deepDive.candidates || []).map((candidate) => ({
    candidate,
    bucket: classifyPullbackSetupCandidateForSummary(candidate)
  }));
  const mainCodes = new Set(ranked
    .filter((item) => item.bucket === "main_candidate")
    .map((item) => item.candidate?.code)
    .filter(Boolean));
  const watchCodes = new Set(ranked
    .filter((item) => item.bucket !== "main_candidate")
    .map((item) => item.candidate?.code)
    .filter(Boolean));
  const body = String(text || "");
  const recommendationSection = extractAnswerRecommendationSection(body);
  const recommendedCodes = extractFundCodes(recommendationSection);
  const issues = [];

  if (mainCodes.size) {
    const promotedWatchCodes = recommendedCodes.filter((code) => watchCodes.has(code) && !mainCodes.has(code));
    const mainRecommended = recommendedCodes.filter((code) => mainCodes.has(code));
    if (promotedWatchCodes.length) {
      issues.push("watch_candidate_promoted_to_recommendation");
    }
    if ([...watchCodes].some((code) => hasPositiveBuyExecutionForFundCode(body, code))) {
      issues.push("watch_candidate_given_buy_execution");
    }
    if ([...watchCodes].some((code) => hasPositiveBuyIntentForFundCode(body, code))) {
      issues.push("watch_candidate_given_buy_signal");
    }
    if (recommendedCodes.length && !mainRecommended.length) {
      issues.push("recommendation_not_from_pullback_main_candidates");
    }
    if (!recommendedCodes.length && !hasNoQualifiedPullbackMessage(body)) {
      issues.push("missing_pullback_main_candidate_code");
    }
    const mainRecommendedItems = ranked.filter((item) => mainCodes.has(item.candidate?.code) && recommendedCodes.includes(item.candidate?.code));
    if (mainRecommendedItems.some((item) => {
      const context = extractFundRecommendationContext(recommendationSection || body, item.candidate?.code);
      return hasPullbackTimingEvidenceAvailable([item]) && !hasPullbackTimingEvidenceInAnswer(context);
    })) {
      issues.push("missing_pullback_timing_evidence");
    }
    if (mainRecommendedItems.some((item) => {
      const context = extractFundRecommendationContext(recommendationSection || body, item.candidate?.code);
      return hasShareClassFeeEvidenceAvailable(item.candidate) && !hasShareClassFeeEvidenceInAnswer(context);
    })) {
      issues.push("missing_pullback_share_class_fee");
    }
    if (mainRecommended.length && !hasThreeTierPullbackExecution(body)) {
      issues.push("missing_pullback_three_tier_execution");
    }
  } else {
    if (!hasNoQualifiedPullbackMessage(body)) {
      issues.push("missing_no_qualified_pullback_message");
    }
    if (recommendedCodes.length) {
      issues.push("recommends_without_qualified_pullback_candidate");
    }
  }

  return issues;
}

function buildPullbackQualityFallbackAnswer({ userText, evidence, issues = [] }) {
  if (!isPullbackSetupRequest(userText)) return "";
  const severeIssues = new Set([
    "watch_candidate_promoted_to_recommendation",
    "watch_candidate_given_buy_execution",
    "watch_candidate_given_buy_signal",
    "recommendation_not_from_pullback_main_candidates",
    "missing_pullback_main_candidate_code",
    "missing_no_qualified_pullback_message",
    "recommends_without_qualified_pullback_candidate",
    "missing_pullback_timing_evidence",
    "missing_pullback_share_class_fee",
    "missing_pullback_three_tier_execution"
  ]);
  if (!(issues || []).some((issue) => severeIssues.has(issue))) return "";
  const deepDive = evidence?.marketDeepDive || null;
  if (deepDive?.selectionDiscipline !== "prefer_pullback_complete_launch_setup_not_chase") return "";

  const ranked = (deepDive.candidates || [])
    .map((candidate) => ({
      candidate,
      bucket: classifyPullbackSetupCandidateForSummary(candidate),
      score: scoreResearchDigestForPullbackSetup(candidate)
    }))
    .sort((a, b) => b.score - a.score);
  const main = ranked.filter((item) => item.bucket === "main_candidate").slice(0, 3);
  const watch = ranked.filter((item) => item.bucket !== "main_candidate").slice(0, 3);

  if (!main.length) {
    const hottest = watch[0]?.candidate?.trendProfile || {};
    const evidenceLine = Number.isFinite(Number(hottest.return20dPct)) || Number.isFinite(Number(hottest.return60dPct))
      ? `候选池里偏热样本的近20日约${formatFallbackPct(hottest.return20dPct)}、近60日约${formatFallbackPct(hottest.return60dPct)}，不符合“回调完成后低位启动”。`
      : "候选池没有同时满足回调完成、低位修复和不过热的标的。";
    const watchLines = watch.map((item, index) =>
      `${index + 1}. ${formatPullbackFallbackWatchCandidate(item.candidate)}`
    );
    return [
      "直接结论：这次先不买，也不硬凑基金代码。",
      `原因：${evidenceLine}`,
      ...(watchLines.length ? ["", "观察池（不是主推荐）：", ...watchLines] : []),
      "",
      "执行方案：1万元新资金暂时买入0元；激进、均衡、保守三档都先等待下一轮筛选。",
      "复查条件：等候选出现回调幅度适中、处在120日区间偏低位置、5日/10日刚转强且近60日不过热，再进入分批买入评估。",
      "我对这条纪律判断把握度较高，因为当前证据不足以支持“回调完成、低位、准备启动”的主推荐。"
    ].join("\n");
  }

  const recommendationLines = main.map((item, index) =>
    `${index + 1}. ${formatPullbackFallbackCandidate(item.candidate)}`
  );
  const watchLines = watch.map((item, index) =>
    `${index + 1}. ${formatPullbackFallbackWatchCandidate(item.candidate)}`
  );
  return [
    "直接结论：只保留符合回调启动纪律的候选，偏热或等待回撤的标的不放进主推荐。",
    "我对这条筛选把握度中等偏高，依据是下钻信号已经把主候选和观察池分开。",
    "",
    "推荐清单：",
    ...recommendationLines,
    "",
    "1万元执行：激进2000元以内，均衡1000元以内，保守先0元观察；只分批，不追单。",
    watchLines.length ? "观察/排除：" : "",
    ...watchLines,
    "决策边界：若近20日涨幅继续快速扩大，或近60日收益进入偏热区间，暂停买入并等下一次回撤确认。"
  ].filter(Boolean).join("\n");
}

function formatPullbackFallbackCandidate(candidate = {}) {
  const trend = candidate.trendProfile || {};
  const actionability = candidate.actionability || {};
  const parts = [
    `${candidate.code || "待复核"} ${candidate.name || candidate.seed?.name || ""}`.trim(),
    formatPullbackFallbackShareAndFee(candidate),
    trend.pullbackSetup?.signalText || "回调启动信号待复核",
    `近5日${formatFallbackPct(trend.return5dPct)}`,
    `近10日${formatFallbackPct(trend.return10dPct)}`,
    `120日位置${formatFallbackPlainPct(trend.lowPositionPct120)}`,
    `250日位置${formatFallbackPlainPct(trend.lowPositionPct250)}`,
    `近20日${formatFallbackPct(trend.return20dPct)}`,
    `近60日${formatFallbackPct(trend.return60dPct)}`,
    `距高点${formatFallbackPct(trend.drawdownFromRecentHighPct)}`,
    actionability.allocationBand ? `仓位上限${actionability.allocationBand}` : "小仓位分批"
  ].filter(Boolean);
  return `${parts.join("；")}。`;
}

function formatPullbackFallbackShareAndFee(candidate = {}) {
  const fees = candidate.fees || {};
  const shareClass = fees.shareClass || candidate.shareClass || candidate.seed?.shareClass || inferFundShareClass(candidate.name || candidate.seed?.name || "");
  const feeLabel = fees.shareClassFeeModel?.label || candidate.shareClassFeeModel?.label || candidate.seed?.shareClassFeeModel?.label || "";
  const parts = [
    shareClass ? `${shareClass}类` : "",
    feeLabel
  ].filter(Boolean);
  return parts.join("，");
}

function formatPullbackFallbackWatchCandidate(candidate = {}) {
  const trend = candidate.trendProfile || {};
  const reason = trend.trendLabel === "extended_uptrend" || trend.entryBias === "wait_pullback"
    ? "短期偏热或仍需等待回撤"
    : "暂未形成主推荐信号";
  const gaps = formatPullbackSetupCandidateGaps(candidate);
  return `${candidate.code || "待复核"} ${candidate.name || candidate.seed?.name || ""}：${reason}，近20日${formatFallbackPct(trend.return20dPct)}，近60日${formatFallbackPct(trend.return60dPct)}；还差：${gaps}。`;
}

function formatFallbackPct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "缺失";
  return `${numeric > 0 ? "+" : ""}${round(numeric, 2)}%`;
}

function formatFallbackPlainPct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "缺失";
  return `${round(numeric, 1)}%`;
}

function hasPullbackTimingEvidenceAvailable(ranked = []) {
  return (ranked || []).some((item) => {
    if (item.bucket !== "main_candidate") return false;
    const trend = item.candidate?.trendProfile || {};
    return Number.isFinite(Number(trend.return5dPct))
      || Number.isFinite(Number(trend.return10dPct))
      || Number.isFinite(Number(trend.lowPositionPct120))
      || Number.isFinite(Number(trend.lowPositionPct250))
      || Number.isFinite(Number(trend.drawdownFromRecentHighPct));
  });
}

function hasPullbackTimingEvidenceInAnswer(text) {
  const body = String(text || "");
  const numericTiming = /(?:近?\s*(?:5|10|20|60|120|250)\s*日|(?:120|250)日(?:区间)?位置|区间低位|低位|距高点|回撤).{0,18}[+-]?\d+(?:\.\d+)?%|[+-]?\d+(?:\.\d+)?%.{0,18}(?:近?\s*(?:5|10|20|60|120|250)\s*日|(?:120|250)日(?:区间)?位置|区间低位|低位|距高点|回撤)/;
  return numericTiming.test(body);
}

function extractFundRecommendationContext(text, code) {
  const body = String(text || "");
  const fundCode = String(code || "");
  if (!fundCode) return body;
  const lines = body.split(/\r?\n/);
  const lineIndex = lines.findIndex((line) => line.includes(fundCode));
  if (lineIndex >= 0) {
    return [lines[lineIndex], lines[lineIndex + 1] || ""].join("\n");
  }
  const index = body.indexOf(fundCode);
  if (index < 0) return "";
  return body.slice(Math.max(0, index - 80), index + 180);
}

function hasPositiveBuyExecutionForFundCode(text, code) {
  const fundCode = String(code || "");
  if (!fundCode) return false;
  const lines = String(text || "").split(/\r?\n/);
  return lines.some((line, index) => {
    if (!line.includes(fundCode)) return false;
    const contextLines = [line, lines[index + 1] || ""];
    return contextLines.some((contextLine, offset) => {
      const clauses = String(contextLine || "").split(/[，,。；;\n]/);
      return clauses.some((clause) => {
        const hasTargetCode = clause.includes(fundCode);
        const isContinuation = offset > 0 && !/\b\d{6}\b/.test(clause);
        if (!hasTargetCode && !isContinuation) return false;
        return hasPositiveBuyExecutionText(clause);
      });
    });
  });
}

function hasPositiveBuyIntentForFundCode(text, code) {
  const fundCode = String(code || "");
  if (!fundCode) return false;
  const lines = String(text || "").split(/\r?\n/);
  return lines.some((line, index) => {
    if (!line.includes(fundCode)) return false;
    const contextLines = [line, lines[index + 1] || ""];
    return contextLines.some((contextLine, offset) => {
      if (contextLine.includes(fundCode) && hasPositiveBuyIntentText(contextLine)) return true;
      const clauses = String(contextLine || "").split(/[，,。；;\n]/);
      return clauses.some((clause) => {
        const hasTargetCode = clause.includes(fundCode);
        const isContinuation = offset > 0 && !/\b\d{6}\b/.test(clause);
        if (!hasTargetCode && !isContinuation) return false;
        return hasPositiveBuyIntentText(clause);
      });
    });
  });
}

function hasPositiveBuyExecutionText(text) {
  const body = String(text || "");
  if (!/(买入|买|加仓|配置|投入|建仓|申购)/.test(body)) return false;
  if (/(不买|不建议买|暂停买|停止买|别买|不要买|回避买|(?:^|[^\d.])0(?:\.0+)?\s*(?:元|%|成)|零元)/.test(body)) return false;
  return /(?:(?:[1-9]\d*(?:\.\d+)?|0\.[1-9]\d*)\s*(?:元|万|%|成)|[一二三四五六七八九十]+成|半仓|底仓)/.test(body);
}

function hasPositiveBuyIntentText(text) {
  const body = String(text || "");
  if (/(不买|不建议买|不能买|暂不买|暂停买|停止买|别买|不要买|回避|只观察|只放观察|等待条件|等.*再(?:买|加|配)|(?:^|[^\d.])0(?:\.0+)?\s*(?:元|%|成)|零元)/.test(body)) return false;
  return /(可以买|可买|买入|分批|小仓位|试探|底仓|建仓|配置|申购|加仓|少买一点|买一点)/.test(body);
}

function hasShareClassFeeEvidenceAvailable(candidate = {}) {
  const fees = candidate.fees || {};
  return Boolean(
    fees.shareClass
    || fees.shareClassFeeModel?.label
    || candidate.shareClass
    || candidate.shareClassFeeModel?.label
    || candidate.seed?.shareClass
    || candidate.seed?.shareClassFeeModel?.label
    || inferFundShareClass(candidate.name || candidate.seed?.name || "")
  );
}

function hasShareClassFeeEvidenceInAnswer(text) {
  return /(A类|B类|C类|D类|I类|Y类|份额|申购费|销售服务费|赎回费|费率|费用|无前端|前端收费|持有期)/.test(String(text || ""));
}

function hasThreeTierPullbackExecution(text) {
  const body = String(text || "");
  return /激进/.test(body)
    && /均衡/.test(body)
    && /保守/.test(body)
    && /(1万|一万|10000|万元|\d+(?:\.\d+)?\s*(?:元|%))/.test(body);
}

function hasNoQualifiedPullbackMessage(text) {
  return /(暂未|没有|未筛到|没筛到|不足以|不建议|先观察|等待|观望|不做主推荐|没有合格|无合格)/.test(String(text || ""));
}

function hasInternalFundSignalLeak(text) {
  const body = String(text || "");
  const tokenPattern = /\b(?:extended_uptrend|pullback_complete|launch_setup|rebound_repair|range_or_mixed|germination|confirmation|diffusion|crowded|buyable_now|staged_buy|wait_pullback|hold_observe|avoid_now|tactical_only|weak_fit|not_suitable|need_specific_fund|high_chase_risk|low_position_rotation|acceptable_position|neutral_or_wait|early_staged_buy|watch_confirm|avoid_chasing|wait_or_small_starter|rotation_starter|trendProfile|actionability|entryBias|fitLabel|trendLabel|forwardScore|crowdingScore|rotationScore|lowPositionScore|positionSignal|actionBias|pullbackSetup|drawdownFromRecentHighPct|drawdownFrom120HighPct|lowPositionPct120|lowPositionPct250|return5dPct|return10dPct|return20dPct|return60dPct|return120dPct)\b/i;
  return tokenPattern.test(body)
    || /\b(?:tactical\s+only|staged\s+buy|wait\s+pullback)\b/i.test(body)
    || /\b(?:stage|trend|action|fit)\s*[=:：]\s*[a-z_ -]{3,}/i.test(body);
}

function hasRawEnglishFundSectionLeak(text) {
  return /(^|[\n。；;])\s*(?:Manager\s+Decision|Evidence|Evidence\s+intake|Research\s+debate|Allocation\s+proposal|Risk\s+committee|Committee\s+consensus|Execution|Missing\s+data(?:\s+to\s+check)?|Key\s+disagreement)\s*[：:]/i.test(String(text || ""));
}

function normalizeUserFacingFundAnswer(text) {
  let output = String(text || "");
  for (const [raw, label] of [...USER_FACING_FUND_FIELD_LABELS, ...USER_FACING_FUND_LABELS]) {
    output = output.replace(new RegExp(`\\b${escapeRegExp(raw)}\\b`, "gi"), label);
  }
  return output
    .replace(/\bNAV\b/g, "净值")
    .replace(/\bManager\s+Decision\s*[：:]/gi, "经理最终判断：")
    .replace(/\bEvidence\s+intake\s*[：:]/gi, "证据整理：")
    .replace(/\bEvidence\s*[：:]/gi, "证据：")
    .replace(/\bResearch\s+debate\s*[：:]/gi, "投研分歧：")
    .replace(/\bAllocation\s+proposal\s*[：:]/gi, "配置方案：")
    .replace(/\bRisk\s+committee\s*[：:]/gi, "风控检查：")
    .replace(/\bCommittee\s+consensus\s*[：:]/gi, "委员会共识：")
    .replace(/\bExecution\s*[：:]/gi, "执行复查：")
    .replace(/\bMissing\s+data(?:\s+to\s+check)?\s*[：:]/gi, "缺失数据：")
    .replace(/\bKey\s+disagreement\s*[：:]/gi, "关键分歧：")
    .replace(/\bVerdict\s*[：:]/gi, "结论：")
    .replace(/\bConfidence\s*[：:]/gi, "把握度：")
    .replace(/\bScore\s*[：:]/gi, "评分：")
    .replace(/\bstaged\s+buy\b/gi, "分批买入")
    .replace(/\bbuy\b/gi, "买入")
    .replace(/\bstaged\b/gi, "分批")
    .replace(/\bwait\b/gi, "等待")
    .replace(/\bavoid\b/gi, "回避")
    .replace(/\bhold\b/gi, "持有")
    .replace(/\bswitch\b/gi, "换基")
    .replace(/分批\s+买入/g, "分批买入")
    .replace(/(经理最终判断|证据整理|证据|投研分歧|配置方案|风控检查|委员会共识|执行复查|缺失数据|关键分歧|结论|把握度|评分)：\s+/g, "$1：")
    .replace(/(^|[\n。；;])\s*把握度\s*[：:]\s*(?:高|high)\s*[。.]?/gi, "$1我对这条判断把握度较高。")
    .replace(/(^|[\n。；;])\s*把握度\s*[：:]\s*(?:中|medium)\s*[。.]?/gi, "$1这条判断把握度中等，需要按条件执行。")
    .replace(/(^|[\n。；;])\s*把握度\s*[：:]\s*(?:低|low)\s*[。.]?/gi, "$1这条判断把握度偏低，只适合先观察。")
    .replace(/(^|[\n。；;])\s*信心\s*[：:]\s*高\s*[。.]?/g, "$1我对这条判断把握度较高。")
    .replace(/(^|[\n。；;])\s*信心\s*[：:]\s*中\s*[。.]?/g, "$1这条判断把握度中等，需要按条件执行。")
    .replace(/(^|[\n。；;])\s*信心\s*[：:]\s*低\s*[。.]?/g, "$1这条判断把握度偏低，只适合先观察。")
    .replace(/\bConfidence\s*[：:]\s*high\b/gi, "把握度较高")
    .replace(/\bConfidence\s*[：:]\s*medium\b/gi, "把握度中等")
    .replace(/\bConfidence\s*[：:]\s*low\b/gi, "把握度偏低")
    .replace(/(趋势|动作|入场判断|适配度)[:：]\s*/g, "$1：")
    .trim();
}

function isActionSeekingFundQuestion(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, [
    "值得买",
    "能买吗",
    "能不能买",
    "买不买",
    "买入",
    "加仓",
    "减仓",
    "卖出",
    "持有",
    "配置",
    "推荐",
    "选哪个",
    "怎么投",
    "怎么买"
  ]) || (normalized.includes("黄金") && hasAny(normalized, ["最近", "现在", "买", "配置", "机会", "行情", "还能"]));
}

function hasQualityEvidence(evidence) {
  const compact = compactQualityEvidence(evidence);
  return /(themeRadar|forwardScore|crowdingScore|trendProfile|marketSnapshot|marketDeepDive|portfolioWatchlist|enrichments|riskMetrics|fundCandidates|preciousMetals|candidates|return20dPct|drawdown)/i.test(compact);
}

function compactQualityEvidence(evidence) {
  try {
    return JSON.stringify(evidence || {}, (key, value) => {
      if (key === "series" && Array.isArray(value)) {
        const first = value[0] || null;
        const last = value[value.length - 1] || null;
        return { points: value.length, first, last };
      }
      if (Array.isArray(value) && value.length > 12) {
        return value.slice(0, 12);
      }
      return value;
    }, 2).slice(0, 9000);
  } catch {
    return String(evidence || "").slice(0, 9000);
  }
}

async function answerConversationWithModel({ userText, intent }) {
  const skills = listSkills(false).map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description
  }));
  const systemText = [
    "你是飞书机器人“基金经理”，也是一个可以自然对话的 GPT 助手。",
    "当前工作流是 conversation：不要调用基金筛选、基金推荐或单基评分模板，除非用户明确要求。",
    "如果用户问你是谁、能做什么、怎么使用，就做简洁自我介绍，并说明你会先理解意图再选择工作流。",
    "语气自然、专业、简短，适合飞书卡片阅读。不要输出 Markdown 表格或代码块。"
  ].join("\n");
  const userPrompt = [
    `用户消息：${userText || "无"}`,
    "",
    "路由判断：",
    JSON.stringify(intent || {}, null, 2),
    "",
    "当前可用 skills：",
    JSON.stringify(skills, null, 2),
    "",
    "请直接回答用户。"
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.min(getConfiguredMaxOutputTokens(), 1200)
  });
  updateStats({
    counters: { conversationModelCalls: 1 },
    last: { lastConversationWorkflowAt: new Date().toISOString() }
  });
  return text;
}

async function testModelConnection() {
  updateStats({ counters: { modelTests: 1 }, last: { lastModelTestAt: new Date().toISOString() } });
  const text = await callModel({
    systemText: "你是一个连通性测试助手。",
    userPrompt: "请只回复：OK",
    images: [],
    maxTokens: 80,
    timeoutMs: Number(process.env.MODEL_TEST_TIMEOUT_MS || 120000)
  });

  return {
    ok: true,
    message: "模型通信正常",
    response: text.slice(0, 500)
  };
}

async function testFeishuConnection() {
  updateStats({ counters: { feishuTests: 1 }, last: { lastFeishuTestAt: new Date().toISOString() } });
  const token = await getTenantAccessToken();
  return {
    ok: true,
    message: "飞书 app_id/app_secret 通信正常，tenant_access_token 获取成功。消息收发权限请用真实飞书消息做最终验证。",
    tokenPreview: `${token.slice(0, 8)}...${token.slice(-6)}`
  };
}

async function callModel({ systemText, userPrompt, images = [], maxTokens, timeoutMs }) {
  const config = getEffectiveConfig();
  validateModelConfig(config);

  updateStats({ counters: { modelCalls: 1 }, last: { lastModelCallAt: new Date().toISOString() } });

  try {
    if (normalizeWireApi(config.modelWireApi) === "chat_completions") {
      return await callChatCompletionsApi({ config, systemText, userPrompt, images, maxTokens, timeoutMs });
    }
    return await callResponsesApi({ config, systemText, userPrompt, images, maxTokens, timeoutMs });
  } catch (error) {
    updateStats({ counters: { modelFailures: 1 }, last: { lastModelFailureAt: new Date().toISOString() } });
    throw error;
  }
}

async function callResponsesApi({ config, systemText, userPrompt, images, maxTokens, timeoutMs }) {
  const content = [{ type: "input_text", text: userPrompt }];
  for (const image of images || []) {
    content.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`
    });
  }

  const body = {
    model: config.modelName,
    instructions: systemText,
    input: [{ role: "user", content }],
    max_output_tokens: Number(maxTokens || config.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS)
  };

  const reasoningEffort = normalizeReasoningEffort(config.modelReasoningEffort);
  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }

  if (config.modelResponsesStream) {
    try {
      const streamedText = await postResponsesStream(
        modelUrl(config, "responses"),
        body,
        {
          Authorization: `Bearer ${config.modelApiKey}`
        },
        { timeoutMs: resolveModelTimeoutMs(config, timeoutMs) }
      );
      if (!streamedText) {
        throw createEmptyModelResponseError("stream");
      }
      return streamedText;
    } catch (error) {
      if (!isResponsesStreamFallbackError(error) && !isEmptyModelResponse(error)) {
        throw error;
      }
    }
  }

  const json = await postJson(modelUrl(config, "responses"), body, {
    Authorization: `Bearer ${config.modelApiKey}`
  }, { timeoutMs: resolveModelTimeoutMs(config, timeoutMs) });

  const text = extractResponsesText(json);
  if (!text) {
    throw createEmptyModelResponseError("responses");
  }
  return text;
}

async function callChatCompletionsApi({ config, systemText, userPrompt, images, maxTokens, timeoutMs }) {
  const userContent = [{ type: "text", text: userPrompt }];
  for (const image of images || []) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}` }
    });
  }

  const json = await postJson(
    modelUrl(config, "chat/completions"),
    {
      model: config.modelName,
      messages: [
        { role: "system", content: systemText },
        { role: "user", content: userContent }
      ],
      max_tokens: Number(maxTokens || config.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS)
    },
    {
      Authorization: `Bearer ${config.modelApiKey}`
    },
    { timeoutMs: resolveModelTimeoutMs(config, timeoutMs) }
  );

  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw createEmptyModelResponseError("chat_completions");
  }
  return text;
}

function createEmptyModelResponseError(source = "model") {
  const error = new Error("模型返回为空。");
  error.code = "MODEL_EMPTY_RESPONSE";
  error.source = source;
  return error;
}

function isEmptyModelResponse(error) {
  return error?.code === "MODEL_EMPTY_RESPONSE" || String(error?.message || "").includes("模型返回为空");
}

async function downloadMessageImage(messageId, imageKey) {
  const config = getEffectiveConfig();
  const token = await getTenantAccessToken(config);
  const url = new URL(
    `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(imageKey)}`,
    config.feishuBaseUrl
  );
  url.searchParams.set("type", "image");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`下载飞书图片失败：HTTP ${response.status}${detail ? ` ${detail.slice(0, 200)}` : ""}`);
  }

  const mimeType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("飞书图片内容为空。");
  }
  updateStats({ counters: { downloadedImages: 1 }, last: { lastImageDownloadedAt: new Date().toISOString() } });
  return { mimeType, buffer };
}

async function uploadFeishuImage(buffer, fileName, config = getEffectiveConfig()) {
  const token = await getTenantAccessToken(config);
  const url = new URL("/open-apis/im/v1/images", config.feishuBaseUrl);
  const form = new FormData();
  form.set("image_type", "message");
  form.set("image", new Blob([buffer], { type: "image/png" }), fileName || "trend.png");

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    },
    HTTP_TIMEOUT_MS
  );
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = null;
  }
  if (!response.ok || json?.code !== 0 || !json?.data?.image_key) {
    throw new Error(`飞书图片上传失败：HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  return json.data.image_key;
}

async function enrichFunds(fundCodes) {
  const uniqueCodes = mergeFundCodes(fundCodes);
  if (!uniqueCodes.length) {
    return [];
  }

  const codes = uniqueCodes.slice(0, 6);
  const results = await Promise.all(codes.map(async (code) => {
    try {
      const profile = await fetchFundProfile(code);
      updateStats({ counters: { fundEnrichmentSuccess: 1 } });
      return profile;
    } catch (error) {
      console.error("[fund-enrichment-error]", code, error);
      recordError(error, { fundEnrichmentFailures: 1 });
      return {
        code,
        ok: false,
        error: error.message,
        sources: [`https://fund.eastmoney.com/${code}.html`]
      };
    }
  }));

  updateStats({
    counters: { fundEnrichmentCalls: uniqueCodes.length },
    last: { lastFundEnrichmentAt: new Date().toISOString() }
  });
  return results;
}

async function fetchMarketSnapshot() {
  const fetchedAt = new Date().toISOString();
  const [
    conceptBoards,
    industryBoards,
    stockFunds,
    hybridFunds,
    indexFunds,
    qdiiFunds,
    preciousMetals,
    preciousMetalFunds,
    fastNews
  ] = await Promise.all([
    fetchEastmoneyBoards("concept").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchEastmoneyBoards("industry").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("gp", "股票型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("hh", "混合型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("zs", "指数型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("qdii", "QDII基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchPreciousMetalQuotes().catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchPreciousMetalFundCandidates().catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchEastmoneyFastNews().catch((error) => ({ ok: false, error: error.message, items: [] }))
  ]);

  const snapshotParts = [
    conceptBoards,
    industryBoards,
    stockFunds,
    hybridFunds,
    indexFunds,
    qdiiFunds,
    preciousMetals,
    preciousMetalFunds,
    fastNews
  ];
  const fundCandidates = {
    stockFunds: stockFunds.items || [],
    hybridFunds: hybridFunds.items || [],
    indexFunds: indexFunds.items || [],
    qdiiFunds: qdiiFunds.items || [],
    preciousMetalFunds: preciousMetalFunds.items || []
  };
  const themeRadar = buildThemeRadar({
    conceptBoards: conceptBoards.items || [],
    industryBoards: industryBoards.items || [],
    preciousMetals: preciousMetals.items || [],
    fastNews: fastNews.items || [],
    fundCandidates
  });
  const failures = snapshotParts.filter(
    (item) => item && item.ok === false
  ).length;
  updateStats({
    counters: {
      marketSnapshotCalls: 1,
      marketSnapshotFailures: failures ? 1 : 0
    },
    last: { lastMarketSnapshotAt: fetchedAt }
  });

  return {
    ok: failures < snapshotParts.length,
    fetchedAt,
    note: "公开数据快照可能有延迟；贵金属行情为公开报价，基金排行更偏近期动量，不等于长期质量。",
    marketIndicators: {
      preciousMetals: preciousMetals.items || []
    },
    themes: {
      conceptBoards: conceptBoards.items || [],
      industryBoards: industryBoards.items || []
    },
    themeRadar,
    fastNews: fastNews.items || [],
    fundCandidates,
    errors: snapshotParts
      .filter((item) => item && item.ok === false)
      .map((item) => item.error),
    sources: [
      "https://push2.eastmoney.com/api/qt/clist/get",
      "https://push2.eastmoney.com/api/qt/ulist.np/get",
      "https://fund.eastmoney.com/data/rankhandler.aspx",
      "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx",
      "https://np-listapi.eastmoney.com/comm/web/getFastNews"
    ]
  };
}

async function fetchEastmoneyFastNews() {
  const url = new URL("https://np-listapi.eastmoney.com/comm/web/getFastNews");
  url.searchParams.set("client", "web");
  url.searchParams.set("biz", "web_724");
  url.searchParams.set("fastColumn", "102");
  url.searchParams.set("pageSize", String(Number(process.env.MARKET_FAST_NEWS_LIMIT || 30)));
  url.searchParams.set("req_trace", String(Date.now()));
  const json = JSON.parse(await fetchText(url.href, "https://finance.eastmoney.com/"));
  const rows = Array.isArray(json?.data) ? json.data : [];
  updateStats({ counters: { marketFastNewsFetches: 1 } });
  return {
    ok: json?.code === "1" || json?.code === 1 || json?.message === "success",
    label: "东方财富7x24快讯",
    items: rows.map((item) => ({
      title: item.title || "",
      showTime: item.showTime || "",
      mediaName: item.mediaName || "",
      url: item.url || "",
      code: item.code || ""
    })).filter((item) => item.title).slice(0, Number(process.env.MARKET_FAST_NEWS_LIMIT || 30))
  };
}

const THEME_RADAR_RULES = [
  {
    id: "semiconductor",
    name: "半导体/芯片",
    keywords: ["半导体", "芯片", "科创芯片", "集成电路", "晶圆", "封测", "光刻", "存储", "美光", "国产替代"],
    fundKeywords: ["半导体", "芯片", "科创芯片", "集成电路", "电子"]
  },
  {
    id: "ai_compute",
    name: "AI/算力",
    keywords: ["人工智能", "AI", "算力", "数据中心", "CPO", "光模块", "机器人", "大模型", "服务器"],
    fundKeywords: ["人工智能", "AI", "算力", "云计算", "通信", "机器人", "信息技术"]
  },
  {
    id: "precious_metals",
    name: "黄金/贵金属",
    keywords: ["黄金", "贵金属", "白银", "金价", "美联储", "降息", "美元", "美债", "COMEX"],
    fundKeywords: ["黄金", "贵金属", "白银", "有色"]
  },
  {
    id: "new_energy",
    name: "新能源/电池",
    keywords: ["新能源", "光伏", "锂电", "电池", "储能", "风电", "充电桩"],
    fundKeywords: ["新能源", "光伏", "电池", "锂电", "储能"]
  },
  {
    id: "medicine",
    name: "医药/创新药",
    keywords: ["医药", "医疗", "创新药", "CXO", "生物医药", "医保", "药品"],
    fundKeywords: ["医药", "医疗", "创新药", "生物医药"]
  },
  {
    id: "dividend",
    name: "红利/高股息",
    keywords: ["红利", "高股息", "央企", "中特估", "分红", "银行", "煤炭", "公用事业"],
    fundKeywords: ["红利", "高股息", "央企", "价值", "银行", "煤炭"]
  },
  {
    id: "hongkong",
    name: "港股/恒生",
    keywords: ["港股", "恒生", "香港", "互联网", "南向", "港股通"],
    fundKeywords: ["港股", "恒生", "香港", "中概", "互联网"]
  },
  {
    id: "bond_rate",
    name: "债券/利率",
    keywords: ["债券", "债基", "纯债", "短债", "利率", "降准", "MLF", "国债"],
    fundKeywords: ["债券", "纯债", "短债", "中短债", "利率债"]
  },
  {
    id: "rare_earth",
    name: "稀土/有色",
    keywords: ["稀土", "有色", "小金属", "铜", "铝", "资源", "金属"],
    fundKeywords: ["稀土", "有色", "资源", "金属"]
  },
  {
    id: "overseas_us",
    name: "美股/海外科技",
    keywords: ["纳斯达克", "标普", "美股", "英伟达", "特斯拉", "苹果", "微软"],
    fundKeywords: ["纳斯达克", "标普", "美股", "QDII", "海外"]
  }
];

function buildThemeRadar({ conceptBoards = [], industryBoards = [], preciousMetals = [], fastNews = [], fundCandidates = {} } = {}) {
  const allFunds = [
    ...(fundCandidates.stockFunds || []),
    ...(fundCandidates.hybridFunds || []),
    ...(fundCandidates.indexFunds || []),
    ...(fundCandidates.qdiiFunds || []),
    ...(fundCandidates.preciousMetalFunds || [])
  ];
  const themes = THEME_RADAR_RULES.map((rule) => {
    const boards = [...conceptBoards, ...industryBoards]
      .filter((board) => textMatchesKeywords(`${board.name || ""} ${board.leadStock || ""}`, rule.keywords))
      .slice(0, 5)
      .map((board) => ({
        name: board.name || board.boardCode || "",
        boardCode: board.boardCode || "",
        changePct: board.changePct,
        mainNetInflowPct: board.mainNetInflowPct,
        leadStock: board.leadStock || "",
        quoteTime: board.quoteTime || ""
      }));
    const news = fastNews
      .filter((item) => textMatchesKeywords(`${item.title || ""} ${item.mediaName || ""}`, rule.keywords))
      .slice(0, 5)
      .map((item) => ({
        title: item.title || "",
        showTime: item.showTime || "",
        mediaName: item.mediaName || "",
        url: item.url || ""
      }));
    const funds = allFunds
      .filter((fund) => textMatchesKeywords(`${fund.name || ""} ${fund.type || ""} ${(fund.keywords || []).join(" ")}`, rule.fundKeywords || rule.keywords))
      .slice(0, 6)
      .map((fund) => ({
        code: fund.code || "",
        name: fund.name || "",
        type: fund.type || "",
        oneMonthPct: fund.oneMonthPct,
        oneYearPct: fund.oneYearPct,
        dailyPct: fund.dailyPct,
        shareClass: fund.shareClass || ""
      }));
    const metals = rule.id === "precious_metals"
      ? preciousMetals.slice(0, 6).map((item) => ({
          name: item.name || item.code || "",
          latest: item.latest,
          changePct: item.changePct,
          fiveDayPct: item.fiveDayPct,
          quoteTime: item.quoteTime || ""
        }))
      : [];

    const catalystScore = clampScore(news.length * 12 + metals.filter((item) => Number.isFinite(item.changePct)).length * 4);
    const boardScore = clampScore(
      boards.reduce((sum, item) => sum + Math.max(0, Number(item.changePct || 0)) * 4 + Math.max(0, Number(item.mainNetInflowPct || 0)) / 8, 0)
    );
    const vehicleScore = clampScore(funds.length * 5);
    const maxBoardChange = Math.max(0, ...boards.map((item) => Number(item.changePct || 0)));
    const fundOneMonthReturns = funds.map((item) => Number(item.oneMonthPct)).filter(Number.isFinite);
    const maxFundOneMonth = Math.max(0, ...fundOneMonthReturns);
    const avgFundOneMonth = averageNumeric(fundOneMonthReturns);
    const metalFiveDay = Math.max(0, ...metals.map((item) => Number(item.fiveDayPct || 0)));
    const crowdingScore = clampScore(Math.max(0, maxBoardChange - 3) * 9 + Math.max(0, maxFundOneMonth - 15) * 1.2 + Math.max(0, metalFiveDay - 4) * 5);
    const lowPositionScore = clampScore(
      Math.max(0, 18 - maxFundOneMonth) * 2.4
      + Math.max(0, 8 - Math.max(0, avgFundOneMonth)) * 1.4
      + Math.max(0, 4 - maxBoardChange) * 4
      + Math.max(0, 5 - metalFiveDay) * 2
    );
    const rotationScore = clampScore(
      catalystScore * 0.35
      + vehicleScore * 0.25
      + lowPositionScore * 0.45
      + Math.max(0, 28 - boardScore) * 0.25
      - crowdingScore * 0.25
    );
    const forwardScore = clampScore(catalystScore * 0.4 + boardScore * 0.34 + vehicleScore * 0.2 + rotationScore * 0.18 - crowdingScore * 0.34);
    const stage = inferThemeStage({ catalystScore, boardScore, vehicleScore, crowdingScore, rotationScore, lowPositionScore });
    const actionBias = inferThemeActionBias({ stage, forwardScore, crowdingScore, rotationScore, lowPositionScore });
    const positionSignal = inferThemePositionSignal({ crowdingScore, rotationScore, lowPositionScore, maxFundOneMonth, maxBoardChange });

    return {
      id: rule.id,
      name: rule.name,
      keywords: rule.keywords,
      fundKeywords: rule.fundKeywords || rule.keywords,
      stage,
      forwardScore: round(forwardScore, 1),
      catalystScore: round(catalystScore, 1),
      marketConfirmationScore: round(boardScore, 1),
      vehicleScore: round(vehicleScore, 1),
      crowdingScore: round(crowdingScore, 1),
      rotationScore: round(rotationScore, 1),
      lowPositionScore: round(lowPositionScore, 1),
      positionSignal,
      actionBias,
      primaryCatalyst: news[0]?.title || boards[0]?.name || metals[0]?.name || "",
      evidence: { news, boards, metals, funds }
    };
  }).filter((theme) =>
    theme.forwardScore >= 8
    || theme.catalystScore >= 12
    || theme.marketConfirmationScore >= 12
    || theme.vehicleScore >= 10
  );

  return themes.sort((a, b) => b.forwardScore - a.forwardScore).slice(0, 12);
}

function inferThemeStage({ catalystScore, boardScore, vehicleScore, crowdingScore, rotationScore = 0, lowPositionScore = 0 }) {
  if (crowdingScore >= 55) return "crowded";
  if (rotationScore >= 50 && lowPositionScore >= 45 && catalystScore >= 8) return "low_position_rotation";
  if (catalystScore >= 18 && boardScore < 14) return "germination";
  if (boardScore >= 35 && vehicleScore >= 10) return "diffusion";
  if (boardScore >= 14 || (catalystScore >= 12 && vehicleScore >= 8)) return "confirmation";
  if (catalystScore >= 8) return "germination";
  return "watch";
}

function inferThemeActionBias({ stage, forwardScore, crowdingScore, rotationScore = 0, lowPositionScore = 0 }) {
  if (stage === "crowded" || crowdingScore >= 55) return "wait_or_small_starter";
  if (rotationScore >= 45 && lowPositionScore >= 45 && forwardScore >= 32) return "rotation_starter";
  if (forwardScore >= 55 && ["germination", "confirmation", "low_position_rotation"].includes(stage)) return "early_staged_buy";
  if (forwardScore >= 42) return "staged_buy";
  if (forwardScore >= 25) return "watch_confirm";
  return "avoid_chasing";
}

function inferThemePositionSignal({ crowdingScore, rotationScore, lowPositionScore, maxFundOneMonth, maxBoardChange }) {
  if (crowdingScore >= 55 || maxFundOneMonth >= 25 || maxBoardChange >= 8) return "high_chase_risk";
  if (rotationScore >= 45 && lowPositionScore >= 45) return "low_position_rotation";
  if (lowPositionScore >= 35 && crowdingScore < 35) return "acceptable_position";
  return "neutral_or_wait";
}

function selectRelevantThemeRadar(userText, marketSnapshot) {
  const radar = Array.isArray(marketSnapshot?.themeRadar) ? marketSnapshot.themeRadar : [];
  if (!radar.length) return [];
  const text = normalizeIntentText(userText);
  const matched = radar
    .map((theme) => ({
      ...theme,
      relevance: textMatchesKeywords(text, [...(theme.keywords || []), ...(theme.fundKeywords || []), theme.name || ""]) ? 20 : 0
    }))
    .filter((theme) => theme.relevance > 0);
  return (matched.length ? matched : radar)
    .sort((a, b) => (b.relevance || 0) + Number(b.forwardScore || 0) - ((a.relevance || 0) + Number(a.forwardScore || 0)))
    .slice(0, 6);
}

function matchCandidateThemes(candidate, themes = []) {
  const text = `${candidate?.name || ""} ${candidate?.type || ""} ${(candidate?.keywords || []).join(" ")}`;
  return (themes || [])
    .filter((theme) => textMatchesKeywords(text, theme.fundKeywords || theme.keywords || []))
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      stage: theme.stage,
      forwardScore: theme.forwardScore,
      crowdingScore: theme.crowdingScore,
      rotationScore: theme.rotationScore,
      lowPositionScore: theme.lowPositionScore,
      positionSignal: theme.positionSignal,
      actionBias: theme.actionBias
    }))
    .slice(0, 3);
}

function textMatchesKeywords(text, keywords = []) {
  const value = normalizeIntentText(text);
  return (keywords || []).some((keyword) => keyword && value.includes(String(keyword).toLowerCase()));
}

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function averageNumeric(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

async function fetchPreciousMetalQuotes() {
  const defaultSecids = [
    "101.GC00Y",
    "113.aum",
    "101.SI00Y",
    "113.agm",
    "100.UDI"
  ];
  const secids = String(process.env.PRECIOUS_METAL_SECIDS || defaultSecids.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!secids.length) {
    return { ok: true, label: "贵金属与美元指数", items: [] };
  }
  const url = new URL("https://push2.eastmoney.com/api/qt/ulist.np/get");
  const params = {
    fltt: "2",
    secids: secids.join(","),
    fields: "f12,f13,f14,f2,f3,f4,f15,f16,f17,f18,f22,f24,f25,f124,f152"
  };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const json = JSON.parse(await fetchText(url.href, "https://gold.eastmoney.com/"));
  const diff = Array.isArray(json?.data?.diff) ? json.data.diff : [];
  updateStats({ counters: { preciousMetalQuoteFetches: 1 } });
  return {
    ok: true,
    label: "贵金属与美元指数",
    items: diff.map((item) => {
      const secid = item.f13 && item.f12 ? `${item.f13}.${item.f12}` : "";
      return {
        code: item.f12 || "",
        secid,
        name: item.f14 || "",
        latest: toNumber(item.f2),
        change: toNumber(item.f4),
        changePct: toNumber(item.f3),
        open: toNumber(item.f17),
        high: toNumber(item.f15),
        low: toNumber(item.f16),
        previousClose: toNumber(item.f18),
        amplitudePct: toNumber(item.f22),
        fiveDayPct: toNumber(item.f24),
        quoteTime: formatEpochSeconds(item.f124),
        source: secid ? `https://quote.eastmoney.com/unify/r/${secid}` : "https://push2.eastmoney.com/api/qt/ulist.np/get"
      };
    }).filter((item) => item.code && item.name)
  };
}

async function fetchPreciousMetalFundCandidates() {
  const keywords = String(process.env.PRECIOUS_METAL_FUND_KEYWORDS || "黄金,贵金属,白银")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!keywords.length) {
    return { ok: true, label: "黄金/贵金属相关基金搜索候选", items: [] };
  }
  const limit = Math.max(1, Number(process.env.PRECIOUS_METAL_FUND_LIMIT || 12));
  const groups = await Promise.all(keywords.map((keyword) => fetchFundSearchCandidates(keyword)));
  const byCode = new Map();
  for (const group of groups) {
    for (const item of group.items || []) {
      const existing = byCode.get(item.code);
      if (existing) {
        existing.keywords = [...new Set([...(existing.keywords || []), ...(item.keywords || [])])];
      } else {
        byCode.set(item.code, item);
      }
    }
  }

  return {
    ok: true,
    label: "黄金/贵金属相关基金搜索候选",
    items: [...byCode.values()].slice(0, limit)
  };
}

async function fetchFundSearchCandidates(keyword) {
  const url = new URL("https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx");
  url.searchParams.set("m", "1");
  url.searchParams.set("key", keyword);
  const json = JSON.parse(await fetchText(url.href));
  const rows = Array.isArray(json?.Datas) ? json.Datas : [];
  updateStats({ counters: { fundSearches: 1, preciousMetalFundSearches: isPreciousMetalQuestion(keyword) ? 1 : 0 } });
  return {
    ok: true,
    keyword,
    items: rows.map((row) => {
      const base = row.FundBaseInfo || {};
      const code = row.CODE || base.FCODE || row._id || "";
      const name = row.NAME || base.SHORTNAME || "";
      const shareClass = inferFundShareClass(name);
      return {
        code,
        name,
        shareClass,
        shareClassFeeModel: inferShareClassFeeModel(shareClass, {
          sourceRatePct: "",
          currentRatePct: "",
          salesServiceFeePct: ""
        }),
        type: base.FTYPE || row.CATEGORYDESC || "",
        navDate: base.FSRQ || "",
        unitNav: toNumber(base.DWJZ),
        company: base.JJGS || "",
        manager: base.JJJL || "",
        minPurchase: toNumber(base.MINSG),
        keywords: [keyword],
        source: code ? `https://fund.eastmoney.com/${code}.html` : "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx"
      };
    }).filter((item) => item.code && item.name)
  };
}

function inferFocusedFundSearchKeywords(userText) {
  const text = normalizeIntentText(userText);
  const groups = [
    { needles: ["黄金", "金价", "贵金属"], keywords: ["黄金", "贵金属"] },
    { needles: ["白银", "沪银"], keywords: ["白银", "贵金属"] },
    { needles: ["半导体", "芯片"], keywords: ["半导体", "芯片"] },
    { needles: ["人工智能", "ai", "算力"], keywords: ["人工智能", "算力"] },
    { needles: ["机器人"], keywords: ["机器人"] },
    { needles: ["新能源", "光伏", "锂电", "电池"], keywords: ["新能源", "光伏", "锂电池"] },
    { needles: ["医药", "医疗", "创新药"], keywords: ["医药", "医疗", "创新药"] },
    { needles: ["港股", "恒生", "香港"], keywords: ["港股", "恒生"] },
    { needles: ["红利", "高股息"], keywords: ["红利", "高股息"] },
    { needles: ["小盘", "微盘", "中证2000"], keywords: ["中证2000", "中证1000"] },
    { needles: ["国企", "央企", "中特估"], keywords: ["国企", "央企"] },
    { needles: ["基建", "建筑"], keywords: ["基建", "建筑"] },
    { needles: ["地产", "房地产"], keywords: ["房地产", "地产"] },
    { needles: ["家电"], keywords: ["家电"] },
    { needles: ["农业", "养殖", "畜牧"], keywords: ["农业", "畜牧"] },
    { needles: ["有色", "铜", "铝"], keywords: ["有色金属", "有色"] },
    { needles: ["电力", "公用"], keywords: ["电力", "公用事业"] },
    { needles: ["纳斯达克", "标普", "美股"], keywords: ["纳斯达克", "标普500"] },
    { needles: ["越南"], keywords: ["越南"] },
    { needles: ["印度"], keywords: ["印度"] },
    { needles: ["债券", "债基", "纯债", "短债"], keywords: ["纯债", "短债"] }
  ];

  const keywords = [];
  for (const group of groups) {
    if (hasAny(text, group.needles)) {
      keywords.push(...group.keywords);
    }
  }

  return [...new Set(keywords)].slice(0, 4);
}

async function fetchFocusedFundCandidates(userText) {
  const keywords = inferFocusedFundSearchKeywords(userText);
  if (!keywords.length) return [];
  const groups = await Promise.all(keywords.map((keyword) =>
    fetchFundSearchCandidates(keyword).catch((error) => ({ ok: false, keyword, error: error.message, items: [] }))
  ));
  const byCode = new Map();
  for (const group of groups) {
    for (const item of group.items || []) {
      const existing = byCode.get(item.code);
      if (existing) {
        existing.keywords = [...new Set([...(existing.keywords || []), ...(item.keywords || []), group.keyword].filter(Boolean))];
      } else {
        byCode.set(item.code, { ...item, keywords: [...new Set([...(item.keywords || []), group.keyword].filter(Boolean))] });
      }
    }
  }
  return [...byCode.values()];
}

function inferPullbackSetupSearchKeywords(userText, themeRadar = []) {
  const explicit = inferFocusedFundSearchKeywords(userText);
  if (explicit.length) return explicit;

  const radarKeywords = (themeRadar || [])
    .filter((theme) => Number(theme.lowPositionScore || 0) >= 35 || ["low_position_rotation", "acceptable_position"].includes(theme.positionSignal))
    .flatMap((theme) => [theme.name, ...(theme.fundKeywords || []), ...(theme.keywords || [])])
    .filter(Boolean);
  const configured = String(process.env.PULLBACK_SETUP_FUND_KEYWORDS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...(configured.length ? configured : DEFAULT_PULLBACK_SETUP_FUND_KEYWORDS), ...radarKeywords])]
    .slice(0, Number(process.env.PULLBACK_SETUP_KEYWORD_LIMIT || 32));
}

async function fetchPullbackSetupCandidates(userText, marketSnapshot, themeRadar = []) {
  const focusedKeywords = inferFocusedFundSearchKeywords(userText);
  const keywordGroups = await Promise.all(inferPullbackSetupSearchKeywords(userText, themeRadar).map((keyword) =>
    fetchFundSearchCandidates(keyword).catch((error) => ({ ok: false, keyword, error: error.message, items: [] }))
  ));
  const rankingGroups = await fetchPullbackSetupRankingCandidates();
  const keywordItems = keywordGroups.flatMap((group) =>
    (group.items || []).map((item) => ({
      ...item,
      keywords: [...new Set([...(item.keywords || []), group.keyword, "回调启动候选"].filter(Boolean))],
      setupDiscoverySource: "keyword_search"
    }))
  );
  const snapshotItems = [
    ...(marketSnapshot?.fundCandidates?.stockFunds || []),
    ...(marketSnapshot?.fundCandidates?.hybridFunds || []),
    ...(marketSnapshot?.fundCandidates?.indexFunds || []),
    ...(marketSnapshot?.fundCandidates?.qdiiFunds || [])
  ].map((item) => ({
    ...item,
    keywords: [...new Set([...(item.keywords || []), "市场候选池"].filter(Boolean))],
    setupDiscoverySource: "market_snapshot"
  }));

  const rankingItems = filterFocusedPullbackRankingCandidates(rankingGroups, focusedKeywords);
  const scopedSnapshotItems = filterFocusedPullbackRankingCandidates(snapshotItems, focusedKeywords);

  return mergeCandidateFunds(keywordItems, rankingItems, scopedSnapshotItems)
    .sort((a, b) => scorePullbackSetupSeedCandidate(b, themeRadar, userText) - scorePullbackSetupSeedCandidate(a, themeRadar, userText))
    .slice(0, Number(process.env.PULLBACK_SETUP_SEED_LIMIT || 80));
}

function filterFocusedPullbackRankingCandidates(items = [], focusedKeywords = []) {
  const aliases = buildFocusedKeywordAliases(focusedKeywords);
  if (!aliases.length) return items || [];
  return (items || []).filter((item) => candidateMatchesFocusedKeywordAliases(item, aliases));
}

function buildFocusedKeywordAliases(keywords = []) {
  const aliasGroups = [
    [["黄金", "贵金属"], ["黄金", "贵金属", "白银", "有色金属"]],
    [["白银"], ["白银", "贵金属"]],
    [["半导体", "芯片"], ["半导体", "芯片", "集成电路", "科创芯片"]],
    [["人工智能", "ai", "算力"], ["人工智能", "ai", "算力", "云计算"]],
    [["机器人"], ["机器人", "智能制造", "高端制造"]],
    [["新能源", "光伏", "锂电池"], ["新能源", "光伏", "锂电", "电池"]],
    [["医药", "医疗", "创新药"], ["医药", "医疗", "创新药", "生物医药"]],
    [["港股", "恒生"], ["港股", "恒生", "香港"]],
    [["红利", "高股息"], ["红利", "高股息"]],
    [["小盘", "微盘", "中证2000"], ["小盘", "微盘", "中证2000", "中证1000"]],
    [["国企", "央企", "中特估"], ["国企", "央企", "中特估", "一带一路"]],
    [["基建", "建筑"], ["基建", "建筑", "工程"]],
    [["地产", "房地产"], ["地产", "房地产"]],
    [["家电"], ["家电"]],
    [["农业", "养殖", "畜牧"], ["农业", "养殖", "畜牧"]],
    [["有色", "有色金属", "铜", "铝"], ["有色", "有色金属", "铜", "铝"]],
    [["电力", "公用事业"], ["电力", "公用事业", "公用"]],
    [["纳斯达克", "标普500"], ["纳斯达克", "标普", "美股"]],
    [["越南"], ["越南"]],
    [["印度"], ["印度"]],
    [["纯债", "短债"], ["纯债", "短债", "债券"]]
  ];
  const normalized = (keywords || []).map((keyword) => normalizeIntentText(keyword)).filter(Boolean);
  const aliases = new Set(normalized);
  for (const keyword of normalized) {
    for (const [needles, values] of aliasGroups) {
      if (needles.some((needle) => keyword.includes(normalizeIntentText(needle)))) {
        for (const value of values) aliases.add(normalizeIntentText(value));
      }
    }
  }
  return [...aliases].filter(Boolean);
}

function candidateMatchesFocusedKeywordAliases(item = {}, aliases = []) {
  const text = normalizeIntentText(`${item.name || ""} ${item.type || ""} ${item.company || ""} ${(item.keywords || []).join(" ")}`);
  return aliases.some((alias) => text.includes(alias));
}

async function fetchPullbackSetupRankingCandidates() {
  const fundTypes = [
    ["gp", "股票型基金"],
    ["hh", "混合型基金"],
    ["zs", "指数型基金"],
    ["qdii", "QDII基金"]
  ];
  const metrics = [
    { metric: "zzf", sort: "desc", label: "近1周转强候选", limit: Number(process.env.PULLBACK_SETUP_WEEKLY_RANK_LIMIT || 160) },
    { metric: "1yzf", sort: "desc", label: "近1月转强候选" },
    { metric: "3yzf", sort: "asc", label: "近3月低位候选" },
    { metric: "6yzf", sort: "asc", label: "近6月低位候选" }
  ];
  const limit = Number(process.env.PULLBACK_SETUP_RANK_LIMIT || 60);
  const groups = await Promise.all(fundTypes.flatMap(([fundType, label]) =>
    metrics.map((metric) =>
      fetchFundRankingByMetric(fundType, label, {
        metric: metric.metric,
        sort: metric.sort,
        rankingMetric: metric.label,
        limit: metric.limit || limit
      }).catch((error) => ({ ok: false, error: error.message, items: [] }))
    )
  ));

  const rankedItems = groups.flatMap((group) =>
    (group.items || []).map((item) => ({
      ...item,
      keywords: [...new Set([...(item.keywords || []), group.rankingMetric || "低位候选"].filter(Boolean))],
      setupDiscoverySource: "ranking_scan"
    }))
  );
  const weeklyReversalItems = selectWeeklyReversalRankCandidates(rankedItems).map((item) => ({
    ...item,
    keywords: [...new Set([...(item.keywords || []), "近1周低位转强候选"].filter(Boolean))],
    setupDiscoverySource: "weekly_reversal_scan"
  }));
  const lowBaseTurnItems = selectLowBaseTurnRankCandidates(rankedItems).map((item) => ({
    ...item,
    keywords: [...new Set([...(item.keywords || []), "低位启动前夜候选"].filter(Boolean))],
    setupDiscoverySource: "low_base_turn_scan"
  }));

  return mergeCandidateFunds(lowBaseTurnItems, weeklyReversalItems, rankedItems);
}

function selectWeeklyReversalRankCandidates(items = []) {
  return (items || [])
    .filter(isWeeklyReversalSeedCandidate)
    .sort((a, b) => scoreWeeklyReversalSeed(b) - scoreWeeklyReversalSeed(a))
    .slice(0, Number(process.env.PULLBACK_SETUP_REVERSAL_LIMIT || 72));
}

function selectLowBaseTurnRankCandidates(items = []) {
  return (items || [])
    .filter(isLowBaseTurnSeedCandidate)
    .sort((a, b) => scoreLowBaseTurnSeed(b) - scoreLowBaseTurnSeed(a))
    .slice(0, Number(process.env.PULLBACK_SETUP_LOW_BASE_LIMIT || 96));
}

function isWeeklyReversalSeedCandidate(item = {}) {
  const oneWeek = toNumber(item.oneWeekPct);
  const oneMonth = toNumber(item.oneMonthPct);
  const threeMonth = toNumber(item.threeMonthPct);
  const sixMonth = toNumber(item.sixMonthPct);
  const thisYear = toNumber(item.thisYearPct);
  const daily = toNumber(item.dailyPct);
  return Number.isFinite(oneWeek)
    && oneWeek >= 0.3
    && oneWeek <= 5
    && (!Number.isFinite(oneMonth) || (oneMonth >= -5 && oneMonth <= 8))
    && (!Number.isFinite(threeMonth) || threeMonth <= 12)
    && (!Number.isFinite(sixMonth) || sixMonth <= 24)
    && (!Number.isFinite(thisYear) || thisYear <= 38)
    && (!Number.isFinite(daily) || daily <= 4.5);
}

function isLowBaseTurnSeedCandidate(item = {}) {
  const oneWeek = toNumber(item.oneWeekPct);
  const oneMonth = toNumber(item.oneMonthPct);
  const threeMonth = toNumber(item.threeMonthPct);
  const sixMonth = toNumber(item.sixMonthPct);
  const thisYear = toNumber(item.thisYearPct);
  const daily = toNumber(item.dailyPct);
  return Number.isFinite(oneWeek)
    && oneWeek >= 0.2
    && oneWeek <= 4
    && Number.isFinite(oneMonth)
    && oneMonth >= -8
    && oneMonth <= 5.5
    && Number.isFinite(threeMonth)
    && threeMonth >= -28
    && threeMonth <= 4
    && (!Number.isFinite(sixMonth) || (sixMonth >= -35 && sixMonth <= 12))
    && (!Number.isFinite(thisYear) || thisYear <= 32)
    && (!Number.isFinite(daily) || daily <= 3.5);
}

function scoreWeeklyReversalSeed(item = {}) {
  const oneWeek = toNumber(item.oneWeekPct);
  const oneMonth = toNumber(item.oneMonthPct);
  const threeMonth = toNumber(item.threeMonthPct);
  const sixMonth = toNumber(item.sixMonthPct);
  const thisYear = toNumber(item.thisYearPct);
  let score = 0;
  if (Number.isFinite(oneWeek)) score += 16 - Math.abs(oneWeek - 2.2) * 2;
  if (Number.isFinite(oneMonth)) score += oneMonth >= -2 && oneMonth <= 6 ? 12 : 0;
  if (Number.isFinite(threeMonth) && threeMonth <= 3) score += 8;
  if (Number.isFinite(sixMonth) && sixMonth <= 8) score += 6;
  if (Number.isFinite(thisYear)) {
    if (thisYear >= -30 && thisYear <= 12) score += 6;
    if (thisYear > 38) score -= Math.min(18, (thisYear - 38) * 0.8 + 6);
  }
  return score;
}

function scoreLowBaseTurnSeed(item = {}) {
  const oneWeek = toNumber(item.oneWeekPct);
  const oneMonth = toNumber(item.oneMonthPct);
  const threeMonth = toNumber(item.threeMonthPct);
  const sixMonth = toNumber(item.sixMonthPct);
  const thisYear = toNumber(item.thisYearPct);
  let score = 0;
  if (Number.isFinite(oneWeek)) score += 18 - Math.abs(oneWeek - 1.8) * 2.2;
  if (Number.isFinite(oneMonth)) score += oneMonth >= -3 && oneMonth <= 4.5 ? 14 : 0;
  if (Number.isFinite(threeMonth)) score += threeMonth >= -18 && threeMonth <= 1 ? 14 : 0;
  if (Number.isFinite(sixMonth)) score += sixMonth >= -28 && sixMonth <= 6 ? 8 : 0;
  if (Number.isFinite(thisYear)) {
    if (thisYear >= -35 && thisYear <= 8) score += 10;
    if (thisYear > 32) score -= Math.min(24, (thisYear - 32) * 0.9 + 8);
  }
  return score;
}

function mergeCandidateFunds(...groups) {
  const byCode = new Map();
  for (const item of groups.flat()) {
    if (!item?.code) continue;
    const existing = byCode.get(item.code);
    if (existing) {
      byCode.set(item.code, mergeCandidateFundRecord(existing, item));
    } else {
      byCode.set(item.code, { ...item });
    }
  }
  return [...byCode.values()];
}

function mergeCandidateFundRecord(existing = {}, incoming = {}) {
  const merged = { ...existing };
  for (const key of [
    "name",
    "shareClass",
    "type",
    "navDate",
    "unitNav",
    "company",
    "manager",
    "minPurchase",
    "dailyPct",
    "oneWeekPct",
    "oneMonthPct",
    "threeMonthPct",
    "sixMonthPct",
    "oneYearPct",
    "twoYearPct",
    "threeYearPct",
    "thisYearPct",
    "sourceRatePct",
    "currentRatePct",
    "source"
  ]) {
    if (isMissingCandidateValue(merged[key]) && !isMissingCandidateValue(incoming[key])) {
      merged[key] = incoming[key];
    }
  }
  if (isMissingCandidateValue(merged.shareClassFeeModel) && !isMissingCandidateValue(incoming.shareClassFeeModel)) {
    merged.shareClassFeeModel = incoming.shareClassFeeModel;
  }
  merged.keywords = [...new Set([...(existing.keywords || []), ...(incoming.keywords || [])].filter(Boolean))];
  merged.discoverySources = [...new Set([
    ...(existing.discoverySources || []),
    existing.setupDiscoverySource,
    ...(incoming.discoverySources || []),
    incoming.setupDiscoverySource
  ].filter(Boolean))];
  if (merged.discoverySources.length) {
    merged.setupDiscoverySource = merged.discoverySources.join("/");
  }
  return merged;
}

function isMissingCandidateValue(value) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number" && Number.isNaN(value)) return true;
  if (typeof value === "object" && !Array.isArray(value)) return !Object.keys(value).length;
  return false;
}

function scorePullbackSetupSeedCandidate(item, themeRadar = [], userText = "") {
  const text = `${item.name || ""} ${item.type || ""} ${(item.keywords || []).join(" ")}`;
  const oneMonth = toNumber(item?.oneMonthPct);
  const oneWeek = toNumber(item?.oneWeekPct);
  const threeMonth = toNumber(item?.threeMonthPct);
  const sixMonth = toNumber(item?.sixMonthPct);
  const oneYear = toNumber(item?.oneYearPct);
  const thisYear = toNumber(item?.thisYearPct);
  const daily = toNumber(item?.dailyPct);
  let score = 0;

  score += scoreCandidateReturnSetup(item) * 1.8;
  if (/ETF|联接|指数/.test(text)) score += 8;
  if (/C$|C类/.test(text) || item.shareClass === "C") score += 3;
  if (/A$|A类/.test(text) || item.shareClass === "A") score += 1;
  if (/股票|混合|指数|ETF|QDII|LOF/i.test(text)) score += 4;
  if (/货币|短债|纯债|债券/.test(text) && !hasAny(normalizeIntentText(userText), ["债", "固收", "现金"])) score -= 24;
  if (/近1周低位转强候选/.test(text)) score += 10;
  if (/低位启动前夜候选/.test(text)) score += 16;

  if (Number.isFinite(oneWeek)) {
    if (oneWeek >= 0.3 && oneWeek <= 5) score += 18;
    else if (oneWeek > 7) score -= Math.min(18, (oneWeek - 7) * 2);
    else if (oneWeek < -5) score -= 8;
  }
  if (Number.isFinite(oneMonth)) {
    if (oneMonth >= -2 && oneMonth <= 8) score += 22;
    else if (oneMonth > 12) score -= Math.min(40, (oneMonth - 12) * 2.2 + 12);
    else if (oneMonth < -10) score -= 8;
  }
  if (Number.isFinite(threeMonth)) {
    if (threeMonth >= -15 && threeMonth <= 12) score += 12;
    else if (threeMonth > 25) score -= Math.min(28, (threeMonth - 25) * 1.1 + 8);
  }
  if (Number.isFinite(sixMonth)) {
    if (sixMonth >= -30 && sixMonth <= 18) score += 8;
    if (sixMonth <= 0 && Number.isFinite(oneMonth) && oneMonth > 0 && oneMonth <= 8) score += 8;
    if (sixMonth <= 8 && Number.isFinite(threeMonth) && threeMonth <= 4 && Number.isFinite(oneWeek) && oneWeek > 0 && oneWeek <= 4) score += 10;
    if (sixMonth > 45) score -= 16;
  }
  if (Number.isFinite(oneYear) && oneYear >= -35 && oneYear <= 35) score += 4;
  if (Number.isFinite(thisYear)) {
    if (thisYear >= -35 && thisYear <= 15) score += 8;
    if (thisYear <= 5 && Number.isFinite(oneMonth) && oneMonth > 0 && oneMonth <= 8) score += 8;
    if (thisYear > 30) score -= Math.min(28, (thisYear - 30) * 0.9 + 8);
    if (thisYear > 55) score -= 10;
  }
  if (Number.isFinite(daily) && daily > 5) score -= 10;

  const matchedThemes = item.matchedThemes?.length ? item.matchedThemes : matchCandidateThemes(item, themeRadar);
  for (const theme of matchedThemes.slice(0, 2)) {
    score += Math.min(14, Number(theme.lowPositionScore || 0) / 6);
    score += Math.min(12, Number(theme.rotationScore || 0) / 8);
    if (theme.positionSignal === "high_chase_risk") score -= 16;
    if (theme.stage === "crowded") score -= 10;
  }

  if (isGenericPullbackSetupRequest(userText) && /黄金|贵金属|白银/.test(text)) score -= 18;
  return score;
}

function scoreDeepDiveCandidate(item, themeRadar = []) {
  const text = `${item.name || ""} ${item.type || ""}`;
  let score = 0;
  if (/ETF|联接|指数/.test(text)) score += 6;
  if (/C$|C类/.test(text)) score += 2;
  if (/A$|A类/.test(text)) score += 1;
  const matchedThemes = item.matchedThemes?.length ? item.matchedThemes : matchCandidateThemes(item, themeRadar);
  for (const theme of matchedThemes.slice(0, 2)) {
    score += 8 + Math.min(16, Number(theme.forwardScore || 0) / 5);
    if (theme.stage === "crowded") score -= 4;
    if (theme.positionSignal === "high_chase_risk") score -= 6;
    if (["low_position_rotation", "acceptable_position"].includes(theme.positionSignal)) score += 5;
  }
  score += scoreCandidateReturnSetup(item);
  if (item.unitNav) score += 1;
  if (item.manager) score += 1;
  return score;
}

function scoreCandidateReturnSetup(item) {
  const oneMonth = toNumber(item?.oneMonthPct);
  const oneWeek = toNumber(item?.oneWeekPct);
  const threeMonth = toNumber(item?.threeMonthPct);
  const sixMonth = toNumber(item?.sixMonthPct);
  const oneYear = toNumber(item?.oneYearPct);
  const thisYear = toNumber(item?.thisYearPct);
  const daily = toNumber(item?.dailyPct);
  let score = 0;

  if (Number.isFinite(oneWeek)) {
    if (oneWeek >= 0.3 && oneWeek <= 5) score += 12;
    else if (oneWeek > 7) score -= Math.min(12, (oneWeek - 7) * 1.8);
    else if (oneWeek < -5) score -= 5;
  }

  if (Number.isFinite(oneMonth)) {
    if (oneMonth >= 1 && oneMonth <= 8) score += 10;
    else if (oneMonth >= -5 && oneMonth < 1) score += 6;
    else if (oneMonth > 8 && oneMonth <= 12) score += 2;
    else if (oneMonth > 12) score -= Math.min(16, (oneMonth - 12) * 0.9);
    else if (oneMonth < -12) score -= 6;
  }

  if (Number.isFinite(threeMonth)) {
    if (threeMonth >= -6 && threeMonth <= 12) score += 6;
    else if (threeMonth > 12 && threeMonth <= 22) score += 1;
    else if (threeMonth > 22) score -= Math.min(14, (threeMonth - 22) * 0.55);
    else if (threeMonth < -18) score -= 5;
  }

  if (Number.isFinite(sixMonth)) {
    if (sixMonth >= -10 && sixMonth <= 18) score += 3;
    else if (sixMonth > 35) score -= 6;
  }

  if (Number.isFinite(oneYear)) {
    if (oneYear >= -18 && oneYear <= 35) score += 2;
    else if (oneYear > 60) score -= 5;
  }

  if (Number.isFinite(thisYear)) {
    if (thisYear >= -25 && thisYear <= 12) score += 4;
    else if (thisYear > 30) score -= Math.min(12, (thisYear - 30) * 0.45 + 4);
  }

  if (Number.isFinite(daily)) {
    if (daily > 5) score -= 5;
    else if (daily >= -1 && daily <= 2) score += 1;
  }

  return score;
}

function selectDiversifiedDeepDiveCandidates(candidates, limit, options = {}) {
  const max = Math.max(0, Number(limit || 0));
  if (!max) return [];
  const selected = [];
  const byProduct = new Map();
  const byExposure = new Map();
  const diversifyExposure = options.diversifyExposure !== false;

  for (const candidate of candidates || []) {
    if (!candidate?.code) continue;
    const productKey = getCandidateProductKey(candidate);
    const exposureKey = getCandidateExposureKey(candidate);

    if (productKey && byProduct.has(productKey)) {
      appendCandidateAlternative(byProduct.get(productKey), candidate, "alternativeShareClasses");
      continue;
    }

    if (diversifyExposure && exposureKey && byExposure.has(exposureKey)) {
      appendCandidateAlternative(byExposure.get(exposureKey), candidate, "sameExposureAlternatives");
      continue;
    }

    if (selected.length >= max) {
      continue;
    }

    const item = {
      ...candidate,
      productKey,
      exposureKey,
      alternativeShareClasses: [],
      sameExposureAlternatives: []
    };
    selected.push(item);
    if (productKey) byProduct.set(productKey, item);
    if (exposureKey) byExposure.set(exposureKey, item);
  }

  return selected;
}

function appendCandidateAlternative(base, candidate, field) {
  if (!base || !candidate?.code || base.code === candidate.code) return;
  const existing = Array.isArray(base[field]) ? base[field] : [];
  if (existing.some((item) => item.code === candidate.code)) return;
  base[field] = [
    ...existing,
    {
      code: candidate.code,
      name: candidate.name || "",
      shareClass: candidate.shareClass || "",
      shareClassFeeModel: candidate.shareClassFeeModel || null,
      type: candidate.type || "",
      company: candidate.company || "",
      oneWeekPct: candidate.oneWeekPct ?? "",
      oneMonthPct: candidate.oneMonthPct ?? "",
      oneYearPct: candidate.oneYearPct ?? "",
      unitNav: candidate.unitNav ?? "",
      source: candidate.source || ""
    }
  ].slice(0, 6);
}

function getCandidateProductKey(candidate) {
  const name = normalizeCandidateFundName(candidate?.name);
  return name ? name.toLowerCase() : "";
}

function getCandidateExposureKey(candidate) {
  const name = normalizeCandidateFundName(candidate?.name)
    .replace(/发起式/g, "")
    .replace(/发起/g, "")
    .replace(/增强/g, "")
    .replace(/指数证券投资基金/g, "指数")
    .replace(/交易型开放式/g, "")
    .replace(/证券投资基金/g, "")
    .replace(/基金中基金/g, "FOF")
    .replace(/基金$/g, "");
  if (!name) return "";
  if (!/(ETF|联接|指数|QDII|LOF|FOF|上证|中证|沪深|创业板|科创|恒生|纳斯达克|标普|黄金|白银)/i.test(name)) {
    return "";
  }

  const markers = ["上证", "中证", "沪深", "创业板", "科创", "恒生", "纳斯达克", "标普", "黄金", "白银"];
  const markerIndex = markers
    .map((marker) => name.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const exposure = markerIndex >= 0 ? name.slice(markerIndex) : name;
  return exposure
    .replace(/ETF联接/g, "ETF")
    .replace(/联接/g, "")
    .replace(/连接/g, "")
    .replace(/[-_·.]/g, "")
    .toLowerCase();
}

function normalizeCandidateFundName(name) {
  return String(name || "")
    .replace(/\s+/g, "")
    .replace(/[（）()]/g, "")
    .replace(/(?:人民币|美元|港币)?[ABCDEIY]类?$/i, "")
    .replace(/[·._-]/g, "")
    .trim();
}

async function fetchMarketDeepDive(userText, marketSnapshot, options = {}) {
  if (!marketSnapshot) return null;
  const relevantThemeRadar = selectRelevantThemeRadar(userText, marketSnapshot);
  const precious = isPreciousMetalQuestion(userText);
  const preferPullbackSetup = isPullbackSetupRequest(userText);
  const focusedKeywords = inferFocusedFundSearchKeywords(userText);
  const [focusedCandidates, pullbackSetupCandidates] = await Promise.all([
    fetchFocusedFundCandidates(userText),
    preferPullbackSetup
      ? fetchPullbackSetupCandidates(userText, marketSnapshot, relevantThemeRadar).catch((error) => {
          recordError(error, { pullbackSetupDiscoveryFailures: 1 });
          return [];
        })
      : Promise.resolve([])
  ]);
  const snapshotCandidates = precious
    ? (marketSnapshot.fundCandidates?.preciousMetalFunds || [])
    : options.forRecommendation
      ? [
          ...(marketSnapshot.fundCandidates?.stockFunds || []),
          ...(marketSnapshot.fundCandidates?.hybridFunds || []),
          ...(marketSnapshot.fundCandidates?.indexFunds || []),
          ...(marketSnapshot.fundCandidates?.qdiiFunds || [])
        ]
      : [];
  const scopedSnapshotCandidates = preferPullbackSetup && focusedKeywords.length
    ? filterFocusedPullbackRankingCandidates(snapshotCandidates, focusedKeywords)
    : snapshotCandidates;
  const merged = mergeCandidateFunds(focusedCandidates, pullbackSetupCandidates, scopedSnapshotCandidates)
    .map((item) => ({ ...item, matchedThemes: matchCandidateThemes(item, relevantThemeRadar) }))
    .sort((a, b) => {
      if (preferPullbackSetup) {
        return scorePullbackSetupSeedCandidate(b, relevantThemeRadar, userText) - scorePullbackSetupSeedCandidate(a, relevantThemeRadar, userText);
      }
      return scoreDeepDiveCandidate(b, relevantThemeRadar) - scoreDeepDiveCandidate(a, relevantThemeRadar);
    });
  const defaultLimit = preferPullbackSetup ? 24 : precious ? 10 : options.forRecommendation ? 14 : 10;
  const limit = Math.max(0, Number(process.env.MARKET_DEEP_DIVE_FUND_LIMIT ?? defaultLimit));
  const selected = selectDiversifiedDeepDiveCandidates(merged, limit, {
    diversifyExposure: options.forRecommendation || precious
  });
  if (!selected.length) {
    return {
      ok: false,
      focus: precious ? "precious_metals" : "market_theme",
      note: "未找到可下钻的候选基金，最终回答只能基于市场快照。"
    };
  }

  let selectedForDive = selected;
  const candidates = await fetchMarketResearchDigests(selected);
  const backfillLimit = Math.max(0, Number(process.env.PULLBACK_SETUP_BACKFILL_DIVE_LIMIT || 8));
  const backfillRounds = Math.max(1, Number(process.env.PULLBACK_SETUP_BACKFILL_ROUNDS || 3));
  let backfillSelected = [];
  for (let roundIndex = 0; preferPullbackSetup
    && backfillLimit
    && roundIndex < backfillRounds
    && !hasQualifiedPullbackMainCandidate(candidates); roundIndex += 1) {
    const nextBackfill = selectPullbackBackfillCandidates(merged, selectedForDive, backfillLimit);
    if (!nextBackfill.length) break;
    backfillSelected = [...backfillSelected, ...nextBackfill];
    selectedForDive = [...selectedForDive, ...nextBackfill];
    candidates.push(...await fetchMarketResearchDigests(nextBackfill));
  }
  const chartBackfillTarget = getFundReportChartBackfillTarget({ userText, options, preferPullbackSetup, precious });
  const chartBackfillLimit = Math.max(0, Number(process.env.FUND_REPORT_CHART_BACKFILL_DIVE_LIMIT || DEFAULT_FUND_REPORT_CHART_BACKFILL_DIVE_LIMIT));
  const chartBackfillRounds = Math.max(1, Number(process.env.FUND_REPORT_CHART_BACKFILL_ROUNDS || DEFAULT_FUND_REPORT_CHART_BACKFILL_ROUNDS));
  let chartBackfillSelected = [];
  for (let roundIndex = 0; chartBackfillTarget
    && chartBackfillLimit
    && roundIndex < chartBackfillRounds
    && countEligibleFundReportProfiles(candidates) < chartBackfillTarget; roundIndex += 1) {
    const nextChartBackfill = selectFundReportChartBackfillCandidates(merged, selectedForDive, chartBackfillLimit, {
      preferPullbackSetup,
      diversifyExposure: options.forRecommendation || precious
    });
    if (!nextChartBackfill.length) break;
    chartBackfillSelected = [...chartBackfillSelected, ...nextChartBackfill];
    selectedForDive = [...selectedForDive, ...nextChartBackfill];
    candidates.push(...await fetchMarketResearchDigests(nextChartBackfill));
  }
  const orderedCandidates = preferPullbackSetup
    ? [...candidates].sort((a, b) => scoreResearchDigestForPullbackSetup(b) - scoreResearchDigestForPullbackSetup(a))
    : candidates;

  updateStats({
    counters: { marketDeepDiveCalls: 1, marketDeepDiveCandidates: orderedCandidates.length },
    last: { lastMarketDeepDiveAt: new Date().toISOString() }
  });

  return {
    ok: true,
    focus: preferPullbackSetup
      ? "pullback_setup_discovery"
      : precious
        ? "precious_metals"
        : focusedCandidates.length ? "focused_theme_search" : "market_recommendation",
    themeRadar: relevantThemeRadar,
    searchKeywords: preferPullbackSetup
      ? inferPullbackSetupSearchKeywords(userText, relevantThemeRadar)
      : inferFocusedFundSearchKeywords(userText),
    selectionDiscipline: preferPullbackSetup ? "prefer_pullback_complete_launch_setup_not_chase" : "balanced_theme_relevance",
    selectedCodes: selectedForDive.map((item) => item.code),
    backfillCodes: backfillSelected.map((item) => item.code),
    chartBackfillCodes: chartBackfillSelected.map((item) => item.code),
    candidates: orderedCandidates
  };
}

function getFundReportChartBackfillTarget({ userText = "", options = {}, preferPullbackSetup = false, precious = false } = {}) {
  const needsCharts = options.forRecommendation
    || preferPullbackSetup
    || precious
    || isActionSeekingFundQuestion(userText)
    || isPullbackSetupRequest(userText);
  return needsCharts ? getFundReportChartMinCount() : 0;
}

function selectFundReportChartBackfillCandidates(merged = [], selectedForDive = [], limit = 0, options = {}) {
  const selectedCodes = new Set((selectedForDive || []).map((item) => item.code).filter(Boolean));
  const selectedProductKeys = new Set((selectedForDive || []).map(getCandidateProductKey).filter(Boolean));
  const pool = (merged || []).filter((item) => {
    if (!item?.code || selectedCodes.has(item.code)) return false;
    const productKey = getCandidateProductKey(item);
    return !productKey || !selectedProductKeys.has(productKey);
  });
  return selectDiversifiedDeepDiveCandidates(pool, limit, {
    diversifyExposure: Boolean(options.diversifyExposure) && !options.preferPullbackSetup
  });
}

function selectPullbackBackfillCandidates(merged = [], selectedForDive = [], limit = 0) {
  const selectedCodes = new Set((selectedForDive || []).map((item) => item.code).filter(Boolean));
  const selectedProductKeys = new Set((selectedForDive || []).map(getCandidateProductKey).filter(Boolean));
  const backfillPool = (merged || []).filter((item) => {
    if (!item?.code || selectedCodes.has(item.code)) return false;
    const productKey = getCandidateProductKey(item);
    return !productKey || !selectedProductKeys.has(productKey);
  });
  return selectDiversifiedDeepDiveCandidates(backfillPool, limit, {
    diversifyExposure: false
  });
}

async function fetchMarketResearchDigests(candidates = []) {
  return Promise.all((candidates || []).map(async (candidate) => {
    try {
      return await fetchFundResearchDigest(candidate.code, candidate);
    } catch (error) {
      recordError(error, { marketDeepDiveFailures: 1 });
      return {
        ok: false,
        code: candidate.code,
        name: candidate.name,
        keywords: candidate.keywords || [],
        error: error.message,
        seed: candidate
      };
    }
  }));
}

function hasQualifiedPullbackMainCandidate(candidates = []) {
  return (candidates || []).some((candidate) => classifyPullbackSetupCandidateForSummary(candidate) === "main_candidate");
}

function isPullbackSetupRequest(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, [
    "回调完成",
    "回调结束",
    "回调企稳",
    "回调到位",
    "回踩完成",
    "回踩结束",
    "回踩到位",
    "调整完成",
    "调整结束",
    "调整到位",
    "回撤企稳",
    "回撤到位",
    "跌下来",
    "跌下来后",
    "准备启动",
    "准备要启动",
    "准备向上",
    "准备走强",
    "开始走强",
    "要启动",
    "刚要启动",
    "刚启动",
    "刚拐头",
    "拐头",
    "即将启动",
    "启动前",
    "启动前夜",
    "启动机会",
    "低位启动",
    "低位刚要启动",
    "低位刚启动",
    "低位修复",
    "低位企稳",
    "低位反转",
    "低位横盘",
    "底部启动",
    "筑底",
    "筑底企稳",
    "止跌反弹",
    "止跌企稳",
    "企稳反弹",
    "蓄势",
    "别追涨",
    "不要追涨",
    "不追涨",
    "追涨"
  ]);
}

function isPullbackSetupDiscoveryAsk(text) {
  const normalized = normalizeIntentText(text);
  return isPullbackSetupRequest(normalized) && hasAny(normalized, [
    "找",
    "筛",
    "帮我",
    "想要",
    "想找",
    "有没有",
    "有无",
    "哪些",
    "哪个",
    "标的",
    "机会",
    "候选",
    "清单",
    "名单",
    "买什么",
    "配置"
  ]);
}

function isGenericPullbackSetupRequest(text) {
  return isPullbackSetupRequest(text) && !inferFocusedFundSearchKeywords(text).length;
}

function scoreResearchDigestForPullbackSetup(digest = {}) {
  if (!digest?.ok) return -100;
  const trend = digest.trendProfile || {};
  const actionability = digest.actionability || {};
  const seedThisYear = getCandidateSeedThisYearPct(digest);
  let score = Number(actionability.score || 0) * 0.35;
  const setupScore = Number(trend.pullbackSetup?.score || 0);
  const lowPosition = finiteMetricNumber(trend.lowPositionPct120);
  const earlyTurn = isEarlyTurnSetupTrend(trend);
  if (Number.isFinite(setupScore)) score += setupScore * 0.75;
  if (trend.pullbackSetup?.signal === "pullback_complete") score += 28;
  if (trend.pullbackSetup?.signal === "launch_setup") score += 16;
  if (earlyTurn) score += 12;
  if (!earlyTurn) score -= 14;
  if (Number.isFinite(lowPosition) && lowPosition >= 12 && lowPosition <= 55) score += 10;
  if (Number.isFinite(lowPosition) && lowPosition > 60 && lowPosition <= 85) score -= 10;
  if (Number.isFinite(lowPosition) && lowPosition > 85) score -= 12;
  const longPosition = finiteMetricNumber(trend.lowPositionPct250);
  if (Number.isFinite(longPosition) && longPosition >= 0 && longPosition <= 65) score += 6;
  if (Number.isFinite(longPosition) && longPosition > 75 && longPosition <= 85) score -= 8;
  if (Number.isFinite(longPosition) && longPosition > 85) score -= 18;
  if (!hasPullbackLowPositionEvidence(trend)) score -= 18;
  if (trend.trendLabel === "extended_uptrend" || trend.entryBias === "wait_pullback") score -= 34;
  if (Number(trend.return5dPct) > 5 || Number(trend.return10dPct) > 9) score -= 12;
  if (Number(trend.return20dPct) > 10) score -= 18;
  if (Number(trend.return60dPct) > 24) score -= 16;
  if (Number(trend.drawdownFromRecentHighPct) > -2 && Number(trend.return20dPct) > 6) score -= 14;
  if (!isPullbackTrendFreshEnough(digest)) score -= 30;
  if (Number.isFinite(seedThisYear)) {
    if (seedThisYear >= -35 && seedThisYear <= 12) score += 6;
    if (seedThisYear <= 5 && Number(trend.return20dPct) > 0 && Number(trend.return20dPct) <= 8) score += 6;
    if (seedThisYear > 30) score -= Math.min(30, (seedThisYear - 30) * 0.9 + 10);
  }
  if (hasPullbackLongPositionChaseRisk(digest)) score -= 18;
  score += scorePullbackThemeRotation(digest);
  score += scoreHoldingsOutlookForCandidate(digest);
  return score;
}

function isEarlyTurnSetupTrend(trend = {}) {
  const r5 = Number(trend.return5dPct);
  const r10 = Number(trend.return10dPct);
  const r20 = Number(trend.return20dPct);
  return Number.isFinite(r5)
    && Number.isFinite(r10)
    && r5 > 0
    && r5 <= 4.5
    && r10 > 0
    && r10 <= 7
    && (!Number.isFinite(r20) || (r20 >= -4 && r20 <= 6));
}

async function fetchFundResearchDigest(code, seed = {}) {
  const [valuation, profileText, navHistory, holdings, feePageText] = await Promise.all([
    fetchFundValuation(code).catch((error) => ({ ok: false, error: error.message })),
    fetchFundPingzhongData(code).catch(() => ""),
    fetchFundRecentNavHistory(code).catch((error) => ({ ok: false, error: error.message, points: [] })),
    fetchFundHoldings(code).catch((error) => ({ ok: false, error: error.message, equityTopHoldings: [], bondTopHoldings: [] })),
    fetchFundFeePage(code).catch(() => "")
  ]);
  const profile = profileText ? parseFundPingzhongData(profileText) : {};
  const name = profile.name || valuation.name || seed.name || "";
  const feeProfile = buildFundFeeProfile({
    code,
    name,
    sourceRate: profile.sourceRate || seed.sourceRatePct || "",
    rate: profile.rate || seed.currentRatePct || "",
    minPurchase: profile.minPurchase || seed.minPurchase || ""
  }, feePageText);
  const trendProfile = navHistory.ok ? computeTrendProfile(navHistory.points) : { ok: false, note: navHistory.error || "近一年净值下钻失败。" };
  const latest = navHistory.points?.[navHistory.points.length - 1] || null;
  const oneYearRisk = navHistory.ok && latest
    ? computePeriodRiskMetrics(navHistory.points, latest, 1, Number(process.env.RISK_FREE_RATE_PCT || 2))
    : { ok: false, note: "近一年风险指标不足。" };
  const holdingsSummary = buildHoldingsDigest(holdings, profile.topStocks);
  const digest = {
    ok: true,
    code,
    name,
    seed: {
      type: seed.type || "",
      keywords: seed.keywords || [],
      oneWeekPct: seed.oneWeekPct ?? "",
      oneMonthPct: seed.oneMonthPct ?? "",
      threeMonthPct: seed.threeMonthPct ?? "",
      sixMonthPct: seed.sixMonthPct ?? "",
      oneYearPct: seed.oneYearPct ?? "",
      thisYearPct: seed.thisYearPct ?? "",
      productKey: seed.productKey || "",
      exposureKey: seed.exposureKey || "",
      matchedThemes: (seed.matchedThemes || []).slice(0, 3),
      alternativeShareClasses: (seed.alternativeShareClasses || []).slice(0, 6),
      sameExposureAlternatives: (seed.sameExposureAlternatives || []).slice(0, 6)
    },
    nav: {
      unitNav: valuation.dwjz || seed.unitNav || "",
      estimatedNav: valuation.gsz || "",
      estimatedChangePct: valuation.gszzl || "",
      navDate: valuation.jzrq || seed.navDate || "",
      estimateTime: valuation.gztime || ""
    },
    returns: {
      oneMonthPct: profile.syl_1y || seed.oneMonthPct || "",
      threeMonthPct: profile.syl_3y || seed.threeMonthPct || "",
      sixMonthPct: profile.syl_6y || seed.sixMonthPct || "",
      oneYearPct: profile.syl_1n || seed.oneYearPct || ""
    },
    trendProfile,
    risk: { oneYear: pickRiskPeriod(oneYearRisk) },
    fees: {
      shareClass: feeProfile.shareClass,
      shareClassFeeModel: feeProfile.shareClassFeeModel,
      currentRatePct: feeProfile.currentRatePct,
      salesServiceFeePct: feeProfile.salesServiceFeePct,
      minPurchase: feeProfile.minPurchase,
      estimatedSubscriptionFeePer10000: feeProfile.estimatedSubscriptionFeePer10000,
      estimatedSalesServiceFeePer10000PerYear: feeProfile.estimatedSalesServiceFeePer10000PerYear,
      feeImpact: feeProfile.feeImpact,
      holdingPeriodFit: feeProfile.holdingPeriodFit,
      feeDecisionRule: feeProfile.feeDecisionRule,
      missingFeeData: feeProfile.missingFeeData,
      feeRules: feeProfile.feeRules
    },
    moneyMarket: profile.moneyMarket || null,
    scale: profile.scale,
    managers: (profile.managers || []).slice(0, 2),
    holdings: holdingsSummary,
    sources: [
      `https://fund.eastmoney.com/${code}.html`,
      `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}`,
      `https://fundf10.eastmoney.com/jjfl_${code}.html`
    ]
  };
  digest.actionability = buildFundActionabilitySignals(digest);
  return digest;
}

async function fetchFundRecentNavHistory(code) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - Number(process.env.FUND_DEEP_DIVE_NAV_MONTHS || 18));
  const firstPage = await fetchFundNavHistoryPage(code, 1, startDate, endDate);
  const points = [...firstPage.points];
  const totalPages = Math.min(firstPage.pages || 1, Number(process.env.FUND_DEEP_DIVE_NAV_MAX_PAGES || 10));

  for (let page = 2; page <= totalPages; page += 1) {
    const pageData = await fetchFundNavHistoryPage(code, page, startDate, endDate);
    points.push(...pageData.points);
  }

  const deduped = [...new Map(points.map((point) => [point.date, point])).values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  updateStats({
    counters: { deepDiveNavHistoryFetches: 1, deepDiveNavHistoryPoints: deduped.length },
    last: { lastDeepDiveNavHistoryFetchAt: new Date().toISOString() }
  });

  return {
    ok: deduped.length >= 20,
    code,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    points: deduped
  };
}

function buildHoldingsDigest(holdings = {}, fallbackTopStocks = []) {
  const equitySource = holdings.equityTopHoldings?.length ? holdings.equityTopHoldings : fallbackTopStocks;
  const equity = normalizeHoldingItems(equitySource).slice(0, 10).map(formatNormalizedHoldingItem);
  const bond = normalizeHoldingItems(holdings.bondTopHoldings || []).slice(0, 10).map(formatNormalizedHoldingItem);
  return {
    ok: Boolean(holdings.ok || equity.length || bond.length || fallbackTopStocks.length),
    equityDisclosureDate: holdings.equityDisclosureDate || "",
    bondDisclosureDate: holdings.bondDisclosureDate || "",
    equityTopHoldings: equity.length ? equity : fallbackTopStocks.slice(0, 10),
    bondTopHoldings: bond,
    note: holdings.ok ? "已下钻前十大持仓摘要。" : "持仓下钻不足，使用可见候选信息。"
  };
}

const HOLDING_THEME_GROUPS = [
  ["贵金属", "黄金", "有色", "资源", "矿业", "铜", "铝", "锂"],
  ["医药", "医疗", "创新药", "生物医药", "CXO", "医疗器械"],
  ["科技", "半导体", "芯片", "AI", "人工智能", "算力", "通信", "电子"],
  ["新能源", "电池", "光伏", "储能", "电力设备", "智能车", "汽车"],
  ["消费", "白酒", "食品饮料", "家电", "农业"],
  ["金融", "银行", "保险", "券商", "证券"],
  ["红利", "央企", "煤炭", "电力", "公用事业", "运营商"],
  ["港股", "互联网", "恒生科技", "中概"]
];

const HOLDING_THEME_PATTERNS = [
  { tag: "贵金属", pattern: /紫金矿业|山东黄金|中金黄金|赤峰黄金|湖南黄金|银泰黄金|招金矿业|黄金|白银|贵金属|铜|铝|锂|洛阳钼业|江西铜业|中国铝业|天齐锂业|赣锋锂业/ },
  { tag: "医药", pattern: /恒瑞医药|药明康德|药明生物|迈瑞医疗|爱尔眼科|片仔癀|泰格医药|百济神州|智飞生物|长春高新|康方生物|医疗|医药|创新药|生物/ },
  { tag: "科技", pattern: /中芯国际|海光信息|寒武纪|北方华创|兆易创新|韦尔股份|中际旭创|新易盛|工业富联|沪电股份|立讯精密|紫光国微|长电科技|中微公司|澜起科技|半导体|芯片|算力|人工智能|AI/i },
  { tag: "新能源", pattern: /宁德时代|比亚迪|阳光电源|隆基绿能|通威股份|亿纬锂能|天赐材料|华友钴业|三花智控|光伏|储能|电池|新能源|电动车|智能车/ },
  { tag: "消费", pattern: /贵州茅台|五粮液|泸州老窖|山西汾酒|伊利股份|海天味业|美的集团|格力电器|牧原股份|温氏股份|消费|白酒|食品饮料|家电|农业/ },
  { tag: "金融", pattern: /招商银行|宁波银行|工商银行|建设银行|农业银行|中国平安|中国人寿|中信证券|东方财富|银行|保险|证券|券商|金融/ },
  { tag: "红利", pattern: /中国神华|陕西煤业|长江电力|中国移动|中国电信|中国海油|中国石油|中国石化|兖矿能源|煤炭|电力|运营商|红利|央企/ },
  { tag: "港股互联网", pattern: /腾讯控股|阿里巴巴|美团|小米集团|快手|京东|网易|百度|港股|互联网|恒生科技|中概/ }
];

function normalizeHoldingItems(items = []) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const holding = normalizeHoldingItem(item);
    if (!holding) continue;
    const key = `${holding.code || ""}|${holding.name || ""}|${holding.text || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(holding);
  }
  return normalized;
}

function normalizeHoldingItem(item) {
  if (!item) return null;
  if (typeof item === "string") return parseHoldingText(item);
  const code = String(item.code || item.stockCode || item.bondCode || item.f12 || "").trim();
  const name = String(item.name || item.stockName || item.bondName || item.f14 || "").trim();
  const pct = parseHoldingPct(item.netValuePct ?? item.navPct ?? item.percent ?? item.ratio ?? item.zjzbl);
  if (!code && !name) return parseHoldingText(String(item.text || item.title || ""));
  const text = [code, name, Number.isFinite(pct) ? `${round(pct, 2)}%` : ""].filter(Boolean).join(" ");
  return { code, name, pct, text };
}

function parseHoldingText(value) {
  const text = stripHtml(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const pctMatch = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  const pct = pctMatch ? Number(pctMatch[1]) : null;
  const withoutPct = text.replace(/-?\d+(?:\.\d+)?\s*%/g, " ").replace(/\s+/g, " ").trim();
  const codeMatch = withoutPct.match(/(?:^|\s)([A-Z]?\d{4,6}(?:\.[A-Z]+)?|\d{5}\.HK)(?=\s|$)/i);
  const code = codeMatch ? codeMatch[1].trim() : "";
  const name = codeMatch
    ? withoutPct.replace(codeMatch[0], " ").replace(/\s+/g, " ").trim()
    : withoutPct;
  return { code, name, pct: Number.isFinite(pct) ? pct : null, text };
}

function parseHoldingPct(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const numeric = toNumber(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatNormalizedHoldingItem(item = {}) {
  return [item.code, item.name, Number.isFinite(item.pct) ? `${round(item.pct, 2)}%` : ""]
    .filter(Boolean)
    .join(" ") || item.text || "";
}

function buildHoldingsOutlookProfile(candidate = {}) {
  const equityHoldings = collectCandidateHoldings(candidate, "equity").slice(0, 10);
  const bondHoldings = collectCandidateHoldings(candidate, "bond").slice(0, 10);
  const primaryHoldings = equityHoldings.length ? equityHoldings : bondHoldings;
  const hasHoldings = primaryHoldings.length > 0;
  if (!hasHoldings) {
    return {
      ok: false,
      hasHoldings: false,
      score: -8,
      label: "缺少前十大持仓",
      evidence: "持仓前景=缺少前十大持仓/行业前景验证",
      risks: ["缺少前十大持仓/行业前景验证"],
      topHoldings: []
    };
  }

  const holdingsText = primaryHoldings.map((item) => `${item.code || ""} ${item.name || ""}`.trim()).join(" ");
  const holdingTags = [...new Set(primaryHoldings.flatMap((item) => inferHoldingThemeTags(`${item.code || ""} ${item.name || ""}`)))].slice(0, 5);
  const themeSignals = getCandidateThemeSignals(candidate);
  const intentTerms = getCandidateOutlookTerms(candidate);
  const focusedTerms = intentTerms.filter(isSpecificThemeTerm);
  const matchedTags = holdingTags.filter((tag) => focusedTerms.some((term) => areThemeTermsRelated(term, tag))).slice(0, 4);
  const matchedThemeSignals = themeSignals.filter((theme) =>
    holdingTags.some((tag) => areThemeTermsRelated(theme.name || theme.id, tag))
  );
  const top1Pct = primaryHoldings[0] ? primaryHoldings[0].pct : null;
  const top3Pct = sumFinitePct(primaryHoldings.slice(0, 3));
  const top10Pct = sumFinitePct(primaryHoldings);
  const disclosureDate = equityHoldings.length
    ? candidate.holdings?.equityDisclosureDate
    : candidate.holdings?.bondDisclosureDate;
  const disclosureAge = daysSincePortfolioDate(disclosureDate);
  const risks = [];
  const positives = [];
  let score = equityHoldings.length ? 6 : 3;
  if (primaryHoldings.length >= 8) score += 2;

  if (Number.isFinite(top10Pct)) {
    if (top10Pct >= 20 && top10Pct <= 58) score += 4;
    if (top10Pct > 70) {
      score -= 9;
      risks.push(`前十大集中度${formatFallbackPlainPct(top10Pct)}偏高`);
    }
  }
  if (Number.isFinite(top3Pct)) {
    if (top3Pct <= 32) score += 2;
    if (top3Pct > 42) {
      score -= 7;
      risks.push(`前三大集中度${formatFallbackPlainPct(top3Pct)}偏高`);
    }
  }
  if (Number.isFinite(top1Pct) && top1Pct > 18) {
    score -= 5;
    risks.push(`第一大持仓${formatFallbackPlainPct(top1Pct)}偏重`);
  }

  if (holdingTags.length) {
    score += 2;
    positives.push(`行业线索=${holdingTags.join("/")}`);
  }
  if (matchedTags.length) {
    score += 9;
    positives.push(`持仓匹配目标主题=${matchedTags.join("/")}`);
  } else if (focusedTerms.length && holdingTags.length) {
    score -= 6;
    risks.push("前十大持仓与目标主题匹配度不足");
  }
  if (matchedThemeSignals.some((theme) => theme.positionSignal === "low_position_rotation" || theme.stage === "low_position_rotation")) {
    score += 5;
    positives.push("持仓方向与低位轮动线索一致");
  }
  if (matchedThemeSignals.some((theme) => theme.positionSignal === "high_chase_risk" || theme.stage === "crowded" || Number(theme.crowdingScore) >= 55)) {
    score -= 8;
    risks.push("持仓方向对应题材拥挤，前景兑现风险偏高");
  }

  if (Number.isFinite(disclosureAge)) {
    const maxAge = finiteNumberOr(process.env.FUND_HOLDINGS_MAX_DISCLOSURE_AGE_DAYS, 150);
    if (disclosureAge > maxAge) {
      score -= 8;
      risks.push(`持仓披露已滞后${disclosureAge}天`);
    } else {
      score += 2;
    }
  }

  const boundedScore = Math.max(-24, Math.min(24, Math.round(score)));
  const label = boundedScore >= 14
    ? "支撑买点"
    : boundedScore >= 7
      ? "中性偏正"
      : boundedScore >= 0
        ? "需要复核"
        : "拖累买点";
  const topNames = primaryHoldings.slice(0, 3).map(formatNormalizedHoldingItem).filter(Boolean);
  const evidenceParts = [
    topNames.length ? `前三=${topNames.join("/")}` : "",
    Number.isFinite(top10Pct) ? `前十大约${formatFallbackPlainPct(top10Pct)}` : "",
    Number.isFinite(top3Pct) ? `前三约${formatFallbackPlainPct(top3Pct)}` : "",
    holdingTags.length ? `行业=${holdingTags.join("/")}` : "",
    matchedTags.length ? `匹配=${matchedTags.join("/")}` : "",
    disclosureDate ? `披露=${disclosureDate}` : ""
  ].filter(Boolean);
  return {
    ok: true,
    hasHoldings: true,
    score: boundedScore,
    label,
    evidence: `持仓前景=${label}${evidenceParts.length ? `（${evidenceParts.join("，")}）` : ""}`,
    risks: [...new Set(risks)].slice(0, 4),
    positives: [...new Set(positives)].slice(0, 4),
    topHoldings: primaryHoldings,
    holdingTags,
    matchedTags,
    concentration: {
      top1Pct: Number.isFinite(top1Pct) ? round(top1Pct, 2) : null,
      top3Pct: Number.isFinite(top3Pct) ? round(top3Pct, 2) : null,
      top10Pct: Number.isFinite(top10Pct) ? round(top10Pct, 2) : null
    },
    disclosureDate: disclosureDate || "",
    disclosureAgeDays: Number.isFinite(disclosureAge) ? disclosureAge : null,
    holdingsText
  };
}

function collectCandidateHoldings(candidate = {}, kind = "equity") {
  const holdings = candidate.holdings || {};
  const source = kind === "bond"
    ? holdings.bondTopHoldings || candidate.bondTopHoldings || []
    : [
      ...(holdings.equityTopHoldings || []),
      ...(candidate.topStocks || []),
      ...(candidate.seed?.topStocks || [])
    ];
  return normalizeHoldingItems(source);
}

function inferHoldingThemeTags(text) {
  const value = String(text || "");
  return HOLDING_THEME_PATTERNS
    .filter((item) => item.pattern.test(value))
    .map((item) => item.tag);
}

function getCandidateOutlookTerms(candidate = {}) {
  const themeTerms = getCandidateThemeSignals(candidate).flatMap((theme) => [theme.name, theme.id]);
  return [
    candidate.name,
    candidate.seed?.name,
    candidate.seed?.productKey,
    candidate.seed?.exposureKey,
    ...(Array.isArray(candidate.seed?.keywords) ? candidate.seed.keywords : []),
    ...(Array.isArray(candidate.keywords) ? candidate.keywords : []),
    ...themeTerms
  ].map((item) => String(item || "").trim()).filter(Boolean);
}

function isSpecificThemeTerm(term = "") {
  const text = String(term || "");
  return HOLDING_THEME_GROUPS.some((group) => group.some((keyword) => text.includes(keyword)))
    || HOLDING_THEME_PATTERNS.some((item) => item.pattern.test(text));
}

function areThemeTermsRelated(left = "", right = "") {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  return HOLDING_THEME_GROUPS.some((group) =>
    group.some((term) => a.includes(term)) && group.some((term) => b.includes(term))
  );
}

function sumFinitePct(items = []) {
  const values = items.map((item) => item.pct).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0), 2);
}

function scoreHoldingsOutlookForCandidate(candidate = {}) {
  return buildHoldingsOutlookProfile(candidate).score;
}

function formatHoldingsOutlookEvidence(candidate = {}) {
  const profile = candidate.holdingsOutlook || buildHoldingsOutlookProfile(candidate);
  return profile.evidence || "";
}

function hasSevereHoldingsOutlookRisk(candidate = {}) {
  const profile = candidate.holdingsOutlook || buildHoldingsOutlookProfile(candidate);
  return Boolean(profile.hasHoldings && profile.score <= -10 && profile.risks?.length);
}

function computeTrendProfile(points = []) {
  const ordered = [...points]
    .filter((point) => Number.isFinite(point.cumulativeNav) && point.cumulativeNav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 20) {
    return { ok: false, points: ordered.length, note: "净值点不足，趋势判断置信度低。" };
  }

  const latest = ordered[ordered.length - 1];
  const returnOver = (tradingDays) => {
    if (ordered.length <= tradingDays) return null;
    const start = ordered[ordered.length - tradingDays - 1];
    return round((latest.cumulativeNav / start.cumulativeNav - 1) * 100, 2);
  };
  const recent = ordered.slice(-Math.min(ordered.length, 250));
  const setupWindow = ordered.slice(-Math.min(ordered.length, 120));
  const recentHigh = Math.max(...recent.map((point) => point.cumulativeNav));
  const recentLow = Math.min(...recent.map((point) => point.cumulativeNav));
  const setupHigh = Math.max(...setupWindow.map((point) => point.cumulativeNav));
  const setupLow = Math.min(...setupWindow.map((point) => point.cumulativeNav));
  const drawdownFromHighPct = recentHigh > 0 ? round((latest.cumulativeNav / recentHigh - 1) * 100, 2) : null;
  const reboundFromLowPct = recentLow > 0 ? round((latest.cumulativeNav / recentLow - 1) * 100, 2) : null;
  const drawdownFrom120HighPct = setupHigh > 0 ? round((latest.cumulativeNav / setupHigh - 1) * 100, 2) : null;
  const reboundFrom120LowPct = setupLow > 0 ? round((latest.cumulativeNav / setupLow - 1) * 100, 2) : null;
  const pullbackDepth120Pct = setupHigh > 0 && setupLow > 0 ? round((setupLow / setupHigh - 1) * 100, 2) : null;
  const lowPositionPct120 = setupHigh > setupLow
    ? round(((latest.cumulativeNav - setupLow) / (setupHigh - setupLow)) * 100, 1)
    : null;
  const lowPositionPct250 = recentHigh > recentLow
    ? round(((latest.cumulativeNav - recentLow) / (recentHigh - recentLow)) * 100, 1)
    : null;
  const r5 = returnOver(5);
  const r10 = returnOver(10);
  const r20 = returnOver(20);
  const r60 = returnOver(60);
  const r120 = returnOver(120);
  const r250 = returnOver(250);
  const extended = (Number.isFinite(r20) && r20 > 8) || (Number.isFinite(r60) && r60 > 18 && drawdownFromHighPct > -3);
  const pullbackSetup = inferPullbackSetupSignal({
    return20dPct: r20,
    return10dPct: r10,
    return5dPct: r5,
    return60dPct: r60,
    return120dPct: r120,
    drawdownFromHighPct,
    drawdownFrom120HighPct,
    reboundFrom120LowPct,
    pullbackDepth120Pct,
    lowPositionPct120,
    lowPositionPct250,
    extended
  });
  const breakdown = (Number.isFinite(r60) && r60 < -8) && (Number.isFinite(r120) && r120 < -10);
  const uptrend = (Number.isFinite(r20) && r20 > 0) && (Number.isFinite(r60) && r60 > 0) && (!Number.isFinite(r120) || r120 > 0);
  const rebound = (Number.isFinite(r20) && r20 > 0) && (Number.isFinite(r60) && r60 > 0) && Number.isFinite(drawdownFromHighPct) && drawdownFromHighPct < -5;
  const weakening = (Number.isFinite(r20) && r20 < 0) && (Number.isFinite(r60) && r60 < 0);
  const trendLabel = breakdown
    ? "breakdown"
    : extended
      ? "extended_uptrend"
      : pullbackSetup.signal === "pullback_complete"
        ? "pullback_complete"
        : pullbackSetup.signal === "launch_setup"
          ? "launch_setup"
          : rebound
            ? "rebound_repair"
            : uptrend
              ? "uptrend"
              : weakening
                ? "weakening"
                : "range_or_mixed";
  const entryBias = breakdown
    ? "avoid_now"
    : extended
      ? "wait_pullback"
      : pullbackSetup.signal === "pullback_complete" && pullbackSetup.score >= 72
        ? "buyable_now"
        : ["pullback_complete", "launch_setup"].includes(pullbackSetup.signal) || rebound || uptrend
        ? "staged_buy"
        : weakening
          ? "hold_observe"
          : "hold_observe";

  return {
    ok: true,
    latestDate: latest.date,
    latestCumulativeNav: round(latest.cumulativeNav, 4),
    series: buildTrendSeries(ordered, 120),
    return20dPct: r20,
    return10dPct: r10,
    return5dPct: r5,
    return60dPct: r60,
    return120dPct: r120,
    return250dPct: r250,
    drawdownFromRecentHighPct: drawdownFromHighPct,
    reboundFromRecentLowPct: reboundFromLowPct,
    drawdownFrom120HighPct,
    reboundFrom120LowPct,
    pullbackDepth120Pct,
    lowPositionPct120,
    lowPositionPct250,
    pullbackSetup,
    trendLabel,
    trendLabelText: formatTrendLabel(trendLabel),
    entryBias,
    entryBiasText: formatEntryBias(entryBias),
    invalidationHint: entryBias === "staged_buy"
      ? "若60日收益转负或跌破近60日低点，暂停加仓。"
      : entryBias === "wait_pullback"
        ? "等待20日涨幅降温或从高点回撤后再评估。"
        : "等待趋势重新转强后再评估。"
  };
}

function inferPullbackSetupSignal({
  return5dPct,
  return10dPct,
  return20dPct,
  return60dPct,
  return120dPct,
  drawdownFromHighPct,
  drawdownFrom120HighPct,
  reboundFrom120LowPct,
  pullbackDepth120Pct,
  lowPositionPct120,
  lowPositionPct250,
  extended = false
} = {}) {
  const r5 = Number(return5dPct);
  const r10 = Number(return10dPct);
  const r20 = Number(return20dPct);
  const r60 = Number(return60dPct);
  const r120 = Number(return120dPct);
  const drawdown = Number.isFinite(Number(drawdownFrom120HighPct)) ? Number(drawdownFrom120HighPct) : Number(drawdownFromHighPct);
  const rebound = Number(reboundFrom120LowPct);
  const pullbackDepth = Number.isFinite(Number(pullbackDepth120Pct)) ? Math.abs(Math.min(0, Number(pullbackDepth120Pct))) : 0;
  const lowPosition = Number(lowPositionPct120);
  const longPosition = Number(lowPositionPct250);
  const earlyTurn = Number.isFinite(r5)
    && Number.isFinite(r10)
    && r5 > 0
    && r5 <= 4.5
    && r10 > 0
    && r10 <= 7
    && (!Number.isFinite(r20) || (r20 >= -4 && r20 <= 6));
  let score = 0;
  const evidence = [];

  if (Number.isFinite(drawdown) && drawdown <= -3 && drawdown >= -15) {
    score += 24;
    evidence.push(`距120日高点回撤${drawdown}%`);
  } else if (Number.isFinite(drawdown) && drawdown > -3) {
    score -= 12;
  } else if (Number.isFinite(drawdown) && drawdown < -22) {
    score -= 10;
  }

  if (pullbackDepth >= 5 && pullbackDepth <= 25) {
    score += 14;
    evidence.push(`120日内曾回调约${round(pullbackDepth, 2)}%`);
  }

  if (Number.isFinite(lowPosition)) {
    if (lowPosition >= 12 && lowPosition <= 55) {
      score += 16;
      evidence.push(`处于120日区间低位${round(lowPosition, 1)}%`);
    } else if (lowPosition > 55 && lowPosition <= 72) {
      score += 6;
    } else if (lowPosition > 85) {
      score -= 10;
    }
  }

  if (Number.isFinite(longPosition)) {
    if (longPosition >= 0 && longPosition <= 65) {
      score += 8;
      evidence.push(`250日位置仍不高${round(longPosition, 1)}%`);
    } else if (longPosition > 80) {
      score -= 16;
    }
  }

  if (earlyTurn) {
    score += 18;
    evidence.push(`5日/10日刚转强：${r5}%/${r10}%`);
  } else {
    if (Number.isFinite(r5) && r5 > 5) score -= Math.min(12, (r5 - 5) * 2);
    if (Number.isFinite(r10) && r10 > 9) score -= Math.min(12, (r10 - 9) * 1.5);
  }

  if (Number.isFinite(r20)) {
    if (r20 > 0 && r20 <= 8) {
      score += 22;
      evidence.push(`近20日温和转强${r20}%`);
    } else if (r20 > 8) {
      score -= Math.min(24, (r20 - 8) * 2.2);
    } else if (r20 <= 0 && !earlyTurn) {
      score -= 8;
    }
  }

  if (Number.isFinite(r60)) {
    if (r60 >= -8 && r60 <= 15) score += 12;
    else if (r60 > 18) score -= Math.min(22, (r60 - 18) * 1.1);
    else if (r60 < -15) score -= 8;
  }

  if (Number.isFinite(rebound)) {
    if (rebound >= 3 && rebound <= 18) {
      score += 14;
      evidence.push(`已从120日低点修复${rebound}%`);
    } else if (rebound > 28) {
      score -= 10;
    }
  }

  if (Number.isFinite(r120) && r120 >= -12) score += 6;
  if (extended) score -= 30;
  if (Number.isFinite(longPosition) && longPosition > 80 && (!Number.isFinite(drawdownFromHighPct) || Number(drawdownFromHighPct) > -8)) {
    score -= 16;
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const signal = boundedScore >= 58
    ? "pullback_complete"
    : boundedScore >= 42
      ? "launch_setup"
      : "none";

  return {
    signal,
    signalText: signal === "pullback_complete"
      ? "回调完成待启动"
      : signal === "launch_setup"
        ? "启动前夜观察"
        : "未形成回调启动信号",
    score: boundedScore,
    evidence,
    rule: "优先回调幅度适中、120日区间位置偏低、5日/10日刚转强、20日温和转强且60日不过热的基金；短期暴涨视为追涨风险。"
  };
}

function buildTrendSeries(points = [], limit = 120) {
  const ordered = [...points]
    .filter((point) => Number.isFinite(point.cumulativeNav) && point.cumulativeNav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const slice = ordered.slice(-Math.max(2, Number(limit || 120)));
  return slice.map((point) => ({
    date: point.date,
    nav: round(point.cumulativeNav, 4),
    dailyReturnPct: point.dailyReturnPct === null || point.dailyReturnPct === undefined ? null : round(point.dailyReturnPct, 2)
  }));
}

function renderTrendSeriesPng({ series = [], width = 720, height = 260 } = {}) {
  const points = series
    .map((item) => ({ date: item.date || "", nav: Number(item.nav) }))
    .filter((item) => Number.isFinite(item.nav) && item.nav > 0);
  if (points.length < 2) return null;

  const canvas = createRgbaCanvas(width, height, [255, 255, 255, 255], getChartPixelRatio());
  const padX = 34;
  const padTop = 22;
  const padBottom = 30;
  const values = points.map((item) => item.nav);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = first.nav > 0 ? (last.nav / first.nav - 1) * 100 : 0;
  const lineColor = changePct >= 0 ? [22, 130, 93, 255] : [194, 65, 12, 255];
  const gridColor = [229, 235, 243, 255];
  const axisColor = [148, 163, 184, 255];
  const pointsPx = points.map((item, index) => {
    const x = padX + (index / Math.max(1, points.length - 1)) * (width - padX * 2);
    const y = padTop + (1 - (item.nav - min) / range) * (height - padTop - padBottom);
    return { x, y };
  });

  for (let i = 0; i <= 4; i += 1) {
    const y = padTop + (i / 4) * (height - padTop - padBottom);
    drawLine(canvas, padX, y, width - padX, y, gridColor, 1);
  }
  drawLine(canvas, padX, padTop, padX, height - padBottom, axisColor, 1);
  drawLine(canvas, padX, height - padBottom, width - padX, height - padBottom, axisColor, 1);

  for (let i = 1; i < pointsPx.length; i += 1) {
    drawLine(canvas, pointsPx[i - 1].x, pointsPx[i - 1].y, pointsPx[i].x, pointsPx[i].y, lineColor, 4);
  }
  drawCircle(canvas, pointsPx[0].x, pointsPx[0].y, 4, [100, 116, 139, 255]);
  drawCircle(canvas, pointsPx[pointsPx.length - 1].x, pointsPx[pointsPx.length - 1].y, 5, lineColor);

  return encodePngRgba(canvas);
}

const REPORT_CHART_MIN_TEXT_SCALE = 3;
const REPORT_CHART_VALUE_SCALE = 5;

function renderFundReportSummaryPng({ profile, width = 1280, height = 760 } = {}) {
  const trend = profile?.trendProfile || {};
  const points = normalizeChartSeries(trend.series || []);
  if (points.length < 2) return null;

  const canvas = createRgbaCanvas(width, height, [255, 255, 255, 255], getChartPixelRatio());
  const code = String(profile?.code || "").slice(0, 12) || "FUND";
  const shareClass = getChartShareClass(profile);
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = first.nav > 0 ? (last.nav / first.nav - 1) * 100 : 0;
  const lineColor = changePct >= 0 ? [22, 130, 93, 255] : [194, 65, 12, 255];
  const muted = [100, 116, 139, 255];
  const ink = [15, 23, 42, 255];

  drawTextFit(canvas, 32, 22, `${code}${shareClass ? ` ${shareClass}` : ""} FUND`, ink, 5, 560, 4);
  drawText(canvas, 32, 72, `NAV ${formatChartNumber(last.nav)}  ${shortChartDate(first.date)}-${shortChartDate(last.date)}`, muted, REPORT_CHART_MIN_TEXT_SCALE);
  drawTextFit(canvas, width - 416, 28, `RANGE ${formatChartPct(changePct)}`, lineColor, REPORT_CHART_VALUE_SCALE, 384, 4);
  drawDecisionEvidenceStrip(canvas, {
    x: 32,
    y: 108,
    width: width - 64,
    profile,
    trend
  });

  drawLineChartPanel(canvas, {
    x: 56,
    y: 264,
    width: Math.max(420, width - 456),
    height: 374,
    points,
    color: lineColor,
    label: "NAV",
    showAxisLabels: false,
    labelScale: REPORT_CHART_MIN_TEXT_SCALE,
    endpointScale: REPORT_CHART_MIN_TEXT_SCALE
  });

  drawSignalMetricsPanel(canvas, {
    x: width - 360,
    y: 264,
    width: 328,
    height: 374,
    profile,
    trend
  });

  drawRect(canvas, 16, 12, width - 32, height - 24, [226, 232, 240, 255], 1);
  return encodePngRgba(canvas);
}

function normalizeChartSeries(series = []) {
  return series
    .map((item) => ({ date: item.date || "", nav: Number(item.nav) }))
    .filter((item) => Number.isFinite(item.nav) && item.nav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function drawLineChartPanel(canvas, {
  x,
  y,
  width,
  height,
  points,
  color,
  label,
  showAxisLabels = true,
  labelScale = 2,
  endpointScale = 2
}) {
  const values = points.map((item) => item.nav);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  drawText(canvas, x, y - 30, label, [51, 65, 85, 255], labelScale);
  drawChartFrame(canvas, x, y, width, height);
  if (showAxisLabels) {
    drawYAxisTickLabels(canvas, x, y, height, [max, min + range / 2, min], formatChartNumber);
    drawXAxisDateLabels(canvas, x, y + height + 8, width, points);
  } else {
    drawChartEndpointDateLabels(canvas, x, y + height + 14, width, points, endpointScale);
  }

  const px = points.map((item, index) => ({
    x: x + 10 + (index / Math.max(1, points.length - 1)) * (width - 20),
    y: y + 10 + (1 - (item.nav - min) / range) * (height - 20)
  }));
  for (let i = 1; i < px.length; i += 1) {
    drawLine(canvas, px[i - 1].x, px[i - 1].y, px[i].x, px[i].y, color, 4);
  }
  drawCircle(canvas, px[0].x, px[0].y, 4, [100, 116, 139, 255]);
  drawCircle(canvas, px[px.length - 1].x, px[px.length - 1].y, 5, color);
}

function drawChartEndpointDateLabels(canvas, x, y, width, points, scale = REPORT_CHART_MIN_TEXT_SCALE) {
  const color = [100, 116, 139, 255];
  const first = shortChartDate(points[0]?.date || "");
  const last = shortChartDate(points[points.length - 1]?.date || "");
  drawText(canvas, x, y, first, color, scale);
  drawText(canvas, x + width - Math.max(92, measureChartText(last, scale)), y, last, color, scale);
}

function drawDrawdownPanel(canvas, { x, y, width, height, points }) {
  let peak = points[0].nav;
  const drawdowns = points.map((item) => {
    peak = Math.max(peak, item.nav);
    return peak > 0 ? (item.nav / peak - 1) * 100 : 0;
  });
  const min = Math.min(...drawdowns, -1);
  const range = Math.abs(min) || 1;
  drawText(canvas, x, y - 22, "RISK", [51, 65, 85, 255], 2);
  drawChartFrame(canvas, x, y, width, height);
  drawYAxisTickLabels(canvas, x, y, height, [0, min], formatChartPct);
  drawXAxisDateLabels(canvas, x, y + height + 8, width, points);
  const zeroY = y + 10;
  drawLine(canvas, x + 8, zeroY, x + width - 8, zeroY, [203, 213, 225, 255], 1);
  const px = drawdowns.map((value, index) => ({
    x: x + 10 + (index / Math.max(1, drawdowns.length - 1)) * (width - 20),
    y: y + 10 + (Math.abs(value) / range) * (height - 20)
  }));
  for (let i = 1; i < px.length; i += 1) {
    drawLine(canvas, px[i - 1].x, px[i - 1].y, px[i].x, px[i].y, [217, 119, 6, 255], 3);
  }
  drawText(canvas, x + width - 118, y + height - 18, `MAX ${formatChartPct(min)}`, [217, 119, 6, 255], 2);
}

function drawReturnBarsPanel(canvas, { x, y, width, height, trend }) {
  drawText(canvas, x, y - 28, "RET", [51, 65, 85, 255], 2);
  drawRect(canvas, x, y, width, height, [226, 232, 240, 255], 1);
  const items = [
    ["5", trend.return5dPct],
    ["10", trend.return10dPct],
    ["20", trend.return20dPct],
    ["60", trend.return60dPct],
    ["120", trend.return120dPct],
    ["Y", trend.return250dPct]
  ].map(([label, value]) => ({ label, value: Number(value) })).filter((item) => Number.isFinite(item.value));
  if (!items.length) {
    drawText(canvas, x + 18, y + 92, "NO DATA", [100, 116, 139, 255], 3);
    return;
  }
  const maxAbs = Math.max(5, ...items.map((item) => Math.abs(item.value)));
  const barStart = x + 58;
  const barMaxWidth = Math.max(36, width - 152);
  drawLine(canvas, barStart, y + 26, barStart, y + height - 20, [203, 213, 225, 255], 1);
  drawText(canvas, barStart - 6, y + height - 16, "0", [100, 116, 139, 255], 2);
  drawText(canvas, x + width - 86, y + height - 16, formatChartPct(maxAbs), [100, 116, 139, 255], 2);
  const rowGap = Math.floor((height - 44) / items.length);
  items.forEach((item, index) => {
    const rowY = y + 32 + index * rowGap;
    const barWidth = Math.round((Math.abs(item.value) / maxAbs) * barMaxWidth);
    const color = item.value >= 0 ? [22, 130, 93, 255] : [194, 65, 12, 255];
    drawText(canvas, x + 10, rowY - 7, item.label, [71, 85, 105, 255], 2);
    fillRect(canvas, barStart, rowY - 7, barWidth, 14, color);
    drawText(canvas, x + width - 86, rowY - 7, formatChartPct(item.value), color, 2);
  });
}

function drawDecisionEvidenceStrip(canvas, { x, y, width, profile = {}, trend = {} }) {
  const actionability = profile?.actionability || {};
  const items = [
    ["ENTRY", formatChartEntryBias(trend.entryBias), chartDecisionColor(trend.entryBias)],
    ["SIG", formatChartSetupSignal(trend.pullbackSetup?.signal), chartSignalColor(trend.pullbackSetup?.signal)],
    ["LOW", formatChartMetricValue("LOW", trend.lowPositionPct120), chartLowPositionColor(trend.lowPositionPct120)],
    ["YLOW", formatChartMetricValue("YLOW", trend.lowPositionPct250), chartLowPositionColor(trend.lowPositionPct250)],
    ["ACT", formatChartAction(actionability.action), chartActionColor(actionability.action)]
  ];
  const gap = 10;
  const tileW = Math.floor((width - gap * (items.length - 1)) / items.length);
  const tileH = 96;
  drawRect(canvas, x, y, width, tileH, [226, 232, 240, 255], 1);
  items.forEach(([label, value, color], index) => {
    const tileX = x + index * (tileW + gap);
    fillRect(canvas, tileX, y, tileW, tileH, [248, 250, 252, 255]);
    drawRect(canvas, tileX, y, tileW, tileH, [226, 232, 240, 255], 1);
    drawText(canvas, tileX + 14, y + 12, label, [100, 116, 139, 255], REPORT_CHART_MIN_TEXT_SCALE);
    drawTextFit(canvas, tileX + 14, y + 50, value, color, REPORT_CHART_VALUE_SCALE, tileW - 28, 4);
  });
}

function drawSignalMetricsPanel(canvas, { x, y, width, height, profile = {}, trend = {} }) {
  drawText(canvas, x, y - 30, "BUY/FEE", [51, 65, 85, 255], REPORT_CHART_MIN_TEXT_SCALE);
  const feeImpact = profile?.fees?.feeImpact || profile?.feeImpact || {};
  const shareClass = getChartShareClass(profile);
  const rows = [
    ["CLASS", shareClass || "MISS"],
    ["FEE", feeImpact.oneYearCostPer10000],
    ["20", trend.return20dPct],
    ["60", trend.return60dPct],
    ["DROP", trend.drawdownFromRecentHighPct],
    ["SIZE", formatChartScale(profile?.scale || profile?.seed?.scale)]
  ];
  const gap = 10;
  const columns = 2;
  const tileW = Math.floor((width - gap * (columns - 1)) / columns);
  const tileH = Math.floor((height - gap * 2) / 3);
  drawRect(canvas, x, y, width, height, [226, 232, 240, 255], 1);
  rows.forEach(([label, rawValue], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const tileX = x + column * (tileW + gap);
    const tileY = y + row * (tileH + gap);
    const value = formatChartMetricValue(label, rawValue);
    const color = chartMetricColor(label, rawValue);
    fillRect(canvas, tileX, tileY, tileW, tileH, [248, 250, 252, 255]);
    drawRect(canvas, tileX, tileY, tileW, tileH, [226, 232, 240, 255], 1);
    drawText(canvas, tileX + 12, tileY + 12, label, [100, 116, 139, 255], REPORT_CHART_MIN_TEXT_SCALE);
    drawTextFit(canvas, tileX + 12, tileY + 58, value, color, REPORT_CHART_VALUE_SCALE, tileW - 24, 4);
  });
}

function drawChartFrame(canvas, x, y, width, height) {
  const grid = [229, 235, 243, 255];
  for (let i = 1; i <= 3; i += 1) {
    const gy = y + (i / 4) * height;
    drawLine(canvas, x, gy, x + width, gy, grid, 1);
  }
  drawRect(canvas, x, y, width, height, [203, 213, 225, 255], 1);
}

function drawYAxisTickLabels(canvas, x, y, height, values, formatter, axisLabel = "") {
  const color = [100, 116, 139, 255];
  if (axisLabel) {
    drawText(canvas, Math.max(4, x - 58), y - 18, axisLabel, color, 2);
  }
  values.forEach((value, index) => {
    const ty = values.length === 1 ? y + height : y + (index / (values.length - 1)) * height;
    drawLine(canvas, x - 4, ty, x, ty, [148, 163, 184, 255], 1);
    drawText(canvas, Math.max(4, x - 82), ty - 6, formatter(value), color, 2);
  });
}

function drawXAxisDateLabels(canvas, x, y, width, points) {
  const color = [100, 116, 139, 255];
  const first = points[0]?.date || "";
  const middle = points[Math.floor(points.length / 2)]?.date || "";
  const last = points[points.length - 1]?.date || "";
  const labels = [
    { text: shortChartDate(first), x },
    { text: shortChartDate(middle), x: x + width / 2 - 34 },
    { text: shortChartDate(last), x: x + width - 68 }
  ];
  for (const item of labels) {
    drawText(canvas, item.x, y, item.text, color, 2);
  }
}

function shortChartDate(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}` : text.slice(-5) || "NA";
}

function formatChartNumber(value) {
  if (!Number.isFinite(value)) return "NA";
  return String(round(value, value >= 10 ? 2 : 4));
}

function formatChartPct(value) {
  if (!Number.isFinite(value)) return "NA";
  const number = round(value, 1);
  return `${number > 0 ? "+" : ""}${number}%`;
}

function formatChartMetricValue(label, value) {
  if (value === null || value === undefined || value === "") return "NA";
  if (["SIG", "ENT", "ENTRY", "ACT", "CLS", "CLASS", "SIZE"].includes(label)) return String(value || "NA").slice(0, 8);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value || "NA").slice(0, 6).toUpperCase();
  if (label === "LOW") return `${round(numeric, 1)}%`;
  if (["DD", "YDD", "DROP", "MAX", "YRET", "5d", "10d", "5", "10", "20", "60", "120"].includes(label)) return formatChartPct(numeric);
  if (label === "YLOW") return `${round(numeric, 1)}%`;
  if (label === "FEE") return `${round(numeric, 0)}`;
  if (label === "SHRP") return String(round(numeric, 2));
  return String(round(numeric, 0));
}

function getChartShareClass(profile = {}) {
  return String(
    profile?.fees?.shareClass
      || profile?.shareClass
      || profile?.seed?.shareClass
      || inferFundShareClass(profile?.name || profile?.seed?.name || "")
      || ""
  ).toUpperCase();
}

function formatChartScale(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const number = toNumber(text) ?? Number(text.match(/-?\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(number)) return sanitizeChartText(text).slice(0, 8);
  return String(round(number, number >= 100 ? 0 : 1));
}

function chartMetricColor(label, value) {
  if (label === "LOW" || label === "YLOW") return chartLowPositionColor(value);
  if (label === "ENT" || label === "ENTRY") return chartDecisionColor(value);
  if (label === "ACT") return chartActionColor(value);
  if (label === "SIG") return chartSignalColor(value);
  if (label === "FEE") return chartFeeColor(value);
  if (label === "SHRP") return chartSharpeColor(value);
  const numeric = Number(value);
  if (["DD", "YDD", "DROP", "MAX"].includes(label)) return [194, 65, 12, 255];
  if (Number.isFinite(numeric) && numeric > 0) return [22, 130, 93, 255];
  return [15, 23, 42, 255];
}

function chartDecisionColor(value) {
  return ["buyable_now", "staged_buy", "BUY", "STAGE"].includes(String(value || ""))
    ? [22, 130, 93, 255]
    : ["wait_pullback", "avoid_now", "WAIT", "AVOID"].includes(String(value || ""))
      ? [194, 65, 12, 255]
      : [15, 23, 42, 255];
}

function chartSignalColor(value) {
  return ["pullback_complete", "launch_setup", "PULL", "LAUNCH"].includes(String(value || ""))
    ? [22, 130, 93, 255]
    : [15, 23, 42, 255];
}

function chartLowPositionColor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return [15, 23, 42, 255];
  if (numeric <= 55) return [22, 130, 93, 255];
  if (numeric >= 85) return [194, 65, 12, 255];
  return [15, 23, 42, 255];
}

function chartActionColor(value) {
  return ["buy", "staged_buy", "BUY", "STAGE"].includes(String(value || ""))
    ? [22, 130, 93, 255]
    : ["wait", "avoid", "WAIT", "AVOID"].includes(String(value || ""))
      ? [194, 65, 12, 255]
      : [15, 23, 42, 255];
}

function chartFeeColor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return [15, 23, 42, 255];
  if (numeric >= 120) return [194, 65, 12, 255];
  if (numeric >= 60) return [217, 119, 6, 255];
  return [22, 130, 93, 255];
}

function chartSharpeColor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return [15, 23, 42, 255];
  if (numeric >= 0.8) return [22, 130, 93, 255];
  if (numeric < 0) return [194, 65, 12, 255];
  return [15, 23, 42, 255];
}

function formatChartSetupSignal(value) {
  const labels = {
    pullback_complete: "PULL",
    launch_setup: "LAUNCH",
    none: "NO"
  };
  return labels[value] || "MISS";
}

function formatChartEntryBias(value) {
  const labels = {
    buyable_now: "BUY",
    staged_buy: "STAGE",
    wait_pullback: "WAIT",
    hold_observe: "OBS",
    avoid_now: "AVOID"
  };
  return labels[value] || "OBS";
}

function formatChartAction(value) {
  const labels = {
    buy: "BUY",
    staged_buy: "STAGE",
    wait: "WAIT",
    avoid: "AVOID",
    hold: "HOLD"
  };
  return labels[value] || "MISS";
}

function getChartPixelRatio() {
  const ratio = Number(process.env.FEISHU_REPORT_CHART_PIXEL_RATIO || 2);
  if (!Number.isFinite(ratio)) return 2;
  return Math.max(1, Math.min(3, Math.round(ratio)));
}

function createRgbaCanvas(width, height, color, pixelRatio = 1) {
  const ratio = Math.max(1, Math.min(3, Math.round(Number(pixelRatio || 1))));
  const physicalWidth = Math.max(1, Math.round(width * ratio));
  const physicalHeight = Math.max(1, Math.round(height * ratio));
  const pixels = Buffer.alloc(physicalWidth * physicalHeight * 4);
  for (let i = 0; i < physicalWidth * physicalHeight; i += 1) {
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
    pixels[i * 4 + 3] = color[3];
  }
  return { width, height, physicalWidth, physicalHeight, pixelRatio: ratio, pixels };
}

function setPixel(canvas, x, y, color) {
  const logicalX = Math.round(x);
  const logicalY = Math.round(y);
  if (logicalX < 0 || logicalY < 0 || logicalX >= canvas.width || logicalY >= canvas.height) return;
  const ratio = canvas.pixelRatio || 1;
  const px = Math.round(logicalX * ratio);
  const py = Math.round(logicalY * ratio);
  for (let yy = 0; yy < ratio; yy += 1) {
    for (let xx = 0; xx < ratio; xx += 1) {
      const targetX = px + xx;
      const targetY = py + yy;
      if (targetX < 0 || targetY < 0 || targetX >= canvas.physicalWidth || targetY >= canvas.physicalHeight) continue;
      const offset = (targetY * canvas.physicalWidth + targetX) * 4;
      canvas.pixels[offset] = color[0];
      canvas.pixels[offset + 1] = color[1];
      canvas.pixels[offset + 2] = color[2];
      canvas.pixels[offset + 3] = color[3];
    }
  }
}

function drawCircle(canvas, cx, cy, radius, color) {
  const r = Math.max(1, Math.round(radius));
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r * r) {
        setPixel(canvas, cx + x, cy + y, color);
      }
    }
  }
}

function drawLine(canvas, x1, y1, x2, y2, color, width = 1) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const radius = Math.max(0, Math.floor(width / 2));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    if (radius <= 0) {
      setPixel(canvas, x, y, color);
    } else {
      drawCircle(canvas, x, y, radius, color);
    }
  }
}

function fillRect(canvas, x, y, width, height, color) {
  const startX = Math.round(x);
  const startY = Math.round(y);
  const endX = Math.round(x + width);
  const endY = Math.round(y + height);
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      setPixel(canvas, px, py, color);
    }
  }
}

function drawRect(canvas, x, y, width, height, color, strokeWidth = 1) {
  drawLine(canvas, x, y, x + width, y, color, strokeWidth);
  drawLine(canvas, x + width, y, x + width, y + height, color, strokeWidth);
  drawLine(canvas, x + width, y + height, x, y + height, color, strokeWidth);
  drawLine(canvas, x, y + height, x, y, color, strokeWidth);
}

function sanitizeChartText(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function drawText(canvas, x, y, text, color = [15, 23, 42, 255], scale = 2) {
  let cursor = Math.round(x);
  const top = Math.round(y);
  const safeText = sanitizeChartText(text);
  if (!safeText) return;
  for (const rawChar of safeText.toUpperCase()) {
    const glyph = TINY_FONT[rawChar] || TINY_FONT["?"];
    if (rawChar === " ") {
      cursor += 4 * scale;
      continue;
    }
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;
        fillRect(canvas, cursor + col * scale, top + row * scale, scale, scale, color);
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

function drawTextFit(canvas, x, y, text, color = [15, 23, 42, 255], scale = 2, maxWidth = Infinity, minScale = 2) {
  const safeText = sanitizeChartText(text);
  if (!safeText) return;
  for (let nextScale = scale; nextScale >= minScale; nextScale -= 1) {
    if (measureChartText(safeText, nextScale) <= maxWidth) {
      drawText(canvas, x, y, safeText, color, nextScale);
      return;
    }
  }
  drawText(canvas, x, y, truncateChartText(safeText, minScale, maxWidth), color, minScale);
}

function measureChartText(text, scale = 2) {
  const safeText = sanitizeChartText(text);
  let width = 0;
  for (const rawChar of safeText.toUpperCase()) {
    if (rawChar === " ") {
      width += 4 * scale;
      continue;
    }
    const glyph = TINY_FONT[rawChar] || TINY_FONT["?"];
    width += (glyph[0].length + 1) * scale;
  }
  return width;
}

function truncateChartText(text, scale, maxWidth) {
  let output = "";
  for (const char of sanitizeChartText(text)) {
    const next = `${output}${char}`;
    if (measureChartText(next, scale) > maxWidth) break;
    output = next;
  }
  return output || "NA";
}

const TINY_FONT = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "11100"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"]
};

function encodePngRgba(canvas) {
  const width = canvas.physicalWidth || canvas.width;
  const height = canvas.physicalHeight || canvas.height;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    canvas.pixels.copy(raw, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", Buffer.concat([
      uint32be(width),
      uint32be(height),
      Buffer.from([8, 6, 0, 0, 0])
    ])),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([
    uint32be(data.length),
    typeBuffer,
    data,
    uint32be(crc32(crcInput))
  ]);
}

function uint32be(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildFundActionabilitySignals(digest) {
  const trend = digest.trendProfile || {};
  const risk = digest.risk?.oneYear || {};
  const fees = digest.fees || {};
  const isMoneyMarket = Boolean(digest.moneyMarket?.ok) || /货币/.test(`${digest.name || ""} ${digest.seed?.type || ""}`);
  const feeType = fees.shareClassFeeModel?.type || "unknown";
  const feeImpact = fees.feeImpact || null;
  const oneYearFeeCost = toNumber(feeImpact?.oneYearCostPer10000);
  const missingFeeData = Array.isArray(fees.missingFeeData)
    ? fees.missingFeeData
    : Array.isArray(feeImpact?.missingFeeData)
      ? feeImpact.missingFeeData
      : [];
  const holdingsOutlook = buildHoldingsOutlookProfile(digest);
  let score = 50;

  if (trend.entryBias === "staged_buy") score += 14;
  if (trend.entryBias === "buyable_now") score += 18;
  if (trend.entryBias === "wait_pullback") score -= 6;
  if (trend.entryBias === "avoid_now") score -= 18;
  if (trend.entryBias === "hold_observe") score -= 2;
  if (trend.pullbackSetup?.signal === "pullback_complete") score += 18;
  if (trend.pullbackSetup?.signal === "launch_setup") score += 10;
  if (trend.trendLabel === "extended_uptrend") score -= 12;
  if (Number(trend.return20dPct) > 12) score -= 8;
  if (Number(trend.return60dPct) > 24) score -= 8;
  if (isMoneyMarket) {
    score += digest.moneyMarket?.ok ? 16 : 0;
  }

  if (Number.isFinite(risk.sharpe)) {
    if (risk.sharpe >= 1) score += 10;
    else if (risk.sharpe >= 0.5) score += 6;
    else if (risk.sharpe < 0) score -= 8;
  }
  if (Number.isFinite(risk.annualizedReturnPct)) {
    if (risk.annualizedReturnPct >= 10) score += 6;
    else if (risk.annualizedReturnPct < 0) score -= 6;
  }
  if (Number.isFinite(risk.maxDrawdownPct)) {
    if (risk.maxDrawdownPct <= -35) score -= 12;
    else if (risk.maxDrawdownPct <= -25) score -= 7;
    else if (risk.maxDrawdownPct >= -15) score += 5;
  }
  if (feeType === "unknown") score -= 4;
  if (["special_or_platform_class"].includes(feeType)) score -= 4;
  if (Number.isFinite(oneYearFeeCost)) {
    if (oneYearFeeCost >= 120) score -= 7;
    else if (oneYearFeeCost >= 60) score -= 3;
  }
  if (feeImpact?.holdingPeriodFit === "short_term_only_high_long_holding_drag") score -= 4;
  if (missingFeeData.length) score -= Math.min(6, missingFeeData.length * 2);
  score += Math.round(holdingsOutlook.score * 0.45);

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const action = boundedScore >= 78
    ? "buy"
    : boundedScore >= 62
      ? "staged_buy"
      : boundedScore >= 48
        ? "wait"
        : "avoid";
  const fitLabel = boundedScore >= 78
    ? "fit"
    : boundedScore >= 62
      ? "tactical_only"
      : boundedScore >= 48
        ? "weak_fit"
        : "not_suitable";
  const highDrawdown = Number.isFinite(risk.maxDrawdownPct) && risk.maxDrawdownPct <= -25;
  const allocationBand = isMoneyMarket
    ? (action === "avoid" ? "0%" : "现金管理仓，按闲置资金和流动性需求配置")
    : action === "buy"
      ? (highDrawdown ? "5%-10%" : "10%-20%")
      : action === "staged_buy"
        ? (highDrawdown ? "3%-8%" : "5%-15%")
        : action === "wait"
          ? "0%-3% watch/test only"
          : "0%";
  const feeEvidenceOk = feeType !== "unknown" && !missingFeeData.length;
  const evidenceCount = [trend.ok, risk.ok, holdingsOutlook.hasHoldings, feeEvidenceOk].filter(Boolean).length;
  const confidence = evidenceCount >= 4 ? "high" : evidenceCount >= 2 ? "medium" : "low";
  const decisiveEvidence = [
    trend.ok ? formatTrendActionabilityEvidence(trend) : "",
    trend.pullbackSetup?.signal && trend.pullbackSetup.signal !== "none" ? `回调启动信号=${trend.pullbackSetup.signalText}，评分=${trend.pullbackSetup.score}` : "",
    risk.ok ? `1yReturn=${risk.totalReturnPct}%, maxDrawdown=${risk.maxDrawdownPct}%, sharpe=${risk.sharpe}` : "",
    holdingsOutlook.evidence,
    formatMoneyMarketEvidence(digest.moneyMarket),
    fees.shareClassFeeModel?.label || "",
    formatFeeImpactForEvidence(fees)
  ].filter(Boolean).slice(0, 5);
  const decisionBlocker = [
    trend.invalidationHint || "",
    isMoneyMarket ? "货币基金主要用于现金管理，不适合作为权益进攻仓或追求高弹性的配置。" : "",
    trend.trendLabel === "extended_uptrend" ? "短期涨幅偏热，不符合回调完成后启动的买点。" : "",
    ...holdingsOutlook.risks.slice(0, 2),
    feeType === "unknown" ? "费率/份额类别未确认前不做重仓。" : "",
    missingFeeData.length ? `费用数据缺口：${missingFeeData.slice(0, 3).join("/")}` : "",
    feeImpact?.feeDragLevel === "high" ? "持有期费用拖累偏高，买入强度需下调或改选低费率份额。" : "",
    highDrawdown ? "近一年回撤偏深，只能按卫星仓或战术仓处理。" : ""
  ].filter(Boolean).slice(0, 2);

  return {
    score: boundedScore,
    fitLabel,
    fitLabelText: formatFitLabel(fitLabel),
    action,
    actionText: formatActionabilityAction(action),
    allocationBand,
    confidence,
    decisiveEvidence,
    decisionBlocker,
    holdingsOutlook
  };
}

function formatTrendActionabilityEvidence(trend = {}) {
  return [
    `走势=${trend.trendLabelText || formatTrendLabel(trend.trendLabel)}`,
    `入场=${trend.entryBiasText || formatEntryBias(trend.entryBias)}`,
    Number.isFinite(Number(trend.return5dPct)) ? `5日=${trend.return5dPct}%` : "",
    Number.isFinite(Number(trend.return10dPct)) ? `10日=${trend.return10dPct}%` : "",
    Number.isFinite(Number(trend.return20dPct)) ? `20日=${trend.return20dPct}%` : "",
    Number.isFinite(Number(trend.return60dPct)) ? `60日=${trend.return60dPct}%` : "",
    Number.isFinite(Number(trend.lowPositionPct120)) ? `120日位置=${trend.lowPositionPct120}%` : "",
    Number.isFinite(Number(trend.lowPositionPct250)) ? `250日位置=${trend.lowPositionPct250}%` : ""
  ].filter(Boolean).join("，");
}

async function fetchEastmoneyBoards(kind) {
  const isConcept = kind === "concept";
  const url = new URL("https://push2.eastmoney.com/api/qt/clist/get");
  const params = {
    pn: "1",
    pz: String(Number(process.env.MARKET_BOARD_LIMIT || 12)),
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: isConcept ? "m:90+t:3" : "m:90+t:2",
    fields: "f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f204,f205,f124"
  };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const json = JSON.parse(await fetchText(url.href));
  const diff = Array.isArray(json?.data?.diff) ? json.data.diff : [];
  updateStats({ counters: { marketBoardFetches: 1 } });
  return {
    ok: true,
    kind: isConcept ? "concept" : "industry",
    items: diff.map((item) => ({
      boardCode: item.f12 || "",
      name: item.f14 || "",
      latest: item.f2 ?? "",
      changePct: toNumber(item.f3),
      mainNetInflow: item.f62 ?? "",
      mainNetInflowPct: toNumber(item.f184),
      leadStock: item.f204 || "",
      leadStockCode: item.f205 || "",
      quoteTime: formatEpochSeconds(item.f124)
    }))
  };
}

async function fetchFundRanking(fundType, label) {
  return fetchFundRankingByMetric(fundType, label, {
    metric: "1yzf",
    sort: "desc",
    rankingMetric: "近1月涨幅",
    limit: Number(process.env.FUND_DISCOVERY_RANK_LIMIT || 24)
  });
}

async function fetchFundRankingByMetric(fundType, label, options = {}) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 1);
  const metric = options.metric || "1yzf";
  const sort = options.sort || "desc";
  const limit = Number(options.limit || process.env.FUND_DISCOVERY_RANK_LIMIT || 24);
  const datedStartDate = formatDate(startDate);
  const datedEndDate = formatDate(endDate);
  const datedUrl = buildFundRankingUrl({ fundType, metric, sort, limit, startDate: datedStartDate, endDate: datedEndDate });
  const text = await fetchText(datedUrl.href);
  let items = parseFundRankData(text, label);
  let usedStartDate = datedStartDate;
  let usedEndDate = datedEndDate;
  let dateFallback = false;
  let fetches = 1;
  if (!items.length && options.allowDateFallback !== false) {
    const fallbackUrl = buildFundRankingUrl({ fundType, metric, sort, limit });
    const fallbackText = await fetchText(fallbackUrl.href);
    fetches += 1;
    const fallbackItems = parseFundRankData(fallbackText, label);
    if (fallbackItems.length) {
      items = fallbackItems;
      usedStartDate = "latest";
      usedEndDate = "latest";
      dateFallback = true;
    }
  }
  updateStats({ counters: { fundRankingFetches: fetches, fundRankingDateFallbacks: dateFallback ? 1 : 0 } });
  return {
    ok: true,
    fundType,
    label,
    rankingMetric: options.rankingMetric || "近1月涨幅",
    rankingSort: sort,
    startDate: usedStartDate,
    endDate: usedEndDate,
    dateFallback,
    items
  };
}

function buildFundRankingUrl({ fundType, metric, sort, limit, startDate = "", endDate = "" } = {}) {
  const url = new URL("https://fund.eastmoney.com/data/rankhandler.aspx");
  const params = {
    op: "ph",
    dt: "kf",
    ft: fundType,
    rs: "",
    gs: "0",
    sc: metric,
    st: sort,
    qdii: "",
    tabSubtype: ",,,,,",
    pi: "1",
    pn: String(Number(limit || 24)),
    dx: "1",
    v: String(Date.now())
  };
  if (startDate && endDate) {
    params.sd = startDate;
    params.ed = endDate;
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function parseFundRankData(text, label) {
  const match = String(text || "").match(/datas:\s*(\[[\s\S]*?\])\s*,\s*allRecords/);
  if (!match) {
    return [];
  }

  let rows = [];
  try {
    rows = JSON.parse(match[1]);
  } catch {
    return [];
  }

  return rows.map((row) => {
    const columns = String(row).split(",");
    const name = columns[1] || "";
    const shareClass = inferFundShareClass(name);
    return {
      code: columns[0] || "",
      name,
      shareClass,
      shareClassFeeModel: inferShareClassFeeModel(shareClass, {
        sourceRatePct: columns[19] || "",
        currentRatePct: columns[20] || "",
        salesServiceFeePct: ""
      }),
      type: label,
      navDate: columns[3] || "",
      unitNav: toNumber(columns[4]),
      dailyPct: toNumber(columns[6]),
      oneWeekPct: toNumber(columns[7]),
      oneMonthPct: toNumber(columns[8]),
      threeMonthPct: toNumber(columns[9]),
      sixMonthPct: toNumber(columns[10]),
      oneYearPct: toNumber(columns[11]),
      twoYearPct: toNumber(columns[12]),
      threeYearPct: toNumber(columns[13]),
      thisYearPct: toNumber(columns[14]),
      inceptionDate: columns[16] || "",
      sourceRatePct: columns[19] || "",
      currentRatePct: columns[20] || "",
      source: `https://fund.eastmoney.com/${columns[0] || ""}.html`
    };
  });
}

async function fetchFundProfile(code) {
  const [valuation, profileText, navHistory, holdings, feePageText] = await Promise.all([
    fetchFundValuation(code).catch((error) => ({ ok: false, error: error.message })),
    fetchFundPingzhongData(code).catch(() => ""),
    fetchFundNavHistory(code).catch((error) => ({ ok: false, error: error.message, points: [] })),
    fetchFundHoldings(code).catch((error) => ({ ok: false, error: error.message, equityTopHoldings: [], bondTopHoldings: [] })),
    fetchFundFeePage(code).catch(() => "")
  ]);

  const profile = parseFundPingzhongData(profileText);
  const name = profile.name || valuation.name || "";
  const feeProfile = buildFundFeeProfile({
    code,
    name,
    sourceRate: profile.sourceRate,
    rate: profile.rate,
    minPurchase: profile.minPurchase
  }, feePageText);
  const riskMetrics = navHistory.ok
    ? computeRiskMetrics(navHistory.points)
    : { ok: false, error: navHistory.error, note: "历史净值抓取失败，无法计算夏普率/波动/回撤。" };
  const trendProfile = navHistory.ok
    ? computeTrendProfile(navHistory.points)
    : { ok: false, note: navHistory.error || "历史净值抓取失败，无法判断走势。" };
  const holdingsSummary = buildHoldingsDigest(holdings, profile.topStocks);
  const actionability = buildFundActionabilitySignals({
    trendProfile,
    risk: { oneYear: pickRiskPeriod(riskMetrics.periods?.["1y"] || {}) },
    fees: feeProfile,
    holdings: holdingsSummary
  });
  return {
    ok: true,
    code,
    name,
    shareClass: feeProfile.shareClass,
    shareClassFeeModel: feeProfile.shareClassFeeModel,
    snapshotDate: valuation.jzrq || "",
    unitNav: valuation.dwjz || "",
    estimatedNav: valuation.gsz || "",
    estimatedChangePct: valuation.gszzl || "",
    estimateTime: valuation.gztime || "",
    fees: feeProfile,
    returns: {
      oneMonthPct: profile.syl_1y || "",
      threeMonthPct: profile.syl_3y || "",
      sixMonthPct: profile.syl_6y || "",
      oneYearPct: profile.syl_1n || ""
    },
    moneyMarket: profile.moneyMarket || null,
    riskMetrics,
    trendProfile,
    actionability,
    scale: profile.scale,
    assetAllocation: profile.assetAllocation,
    performanceEvaluation: profile.performanceEvaluation,
    managers: profile.managers,
    holdings,
    topStocks: holdings.equityTopHoldings?.length ? holdings.equityTopHoldings : profile.topStocks,
    sources: [
      `https://fundgz.1234567.com.cn/js/${code}.js`,
      `https://fund.eastmoney.com/pingzhongdata/${code}.js`,
      `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=lsjz&code=${code}`,
      `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}`,
      `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=zqcc&code=${code}`,
      `https://fundf10.eastmoney.com/jjfl_${code}.html`,
      `https://fund.eastmoney.com/${code}.html`
    ]
  };
}

async function fetchFundValuation(code) {
  const text = await fetchText(`https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`);
  const match = text.match(/jsonpgz\((\{[\s\S]*\})\);?/);
  if (!match) {
    return { ok: false };
  }
  return { ok: true, ...JSON.parse(match[1]) };
}

async function fetchFundPingzhongData(code) {
  return fetchText(`https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`);
}

async function fetchFundFeePage(code) {
  const text = await fetchText(`https://fundf10.eastmoney.com/jjfl_${code}.html`);
  updateStats({ counters: { fundFeePageFetches: 1 } });
  return text;
}

function buildFundFeeProfile({ code, name, sourceRate, rate, minPurchase }, feePageText) {
  const shareClass = inferFundShareClass(name);
  const text = normalizeFeePageText(feePageText);
  const managementFeePct = extractFeeLabelValue(text, "管理费率");
  const custodyFeePct = extractFeeLabelValue(text, "托管费率");
  const salesServiceFeePct = extractFeeLabelValue(text, "销售服务费率");
  const currentRatePct = normalizeFeeValue(rate);
  const sourceRatePct = normalizeFeeValue(sourceRate);
  const normalizedSalesServiceFeePct = normalizeFeeValue(salesServiceFeePct);
  const subscriptionRules = summarizeFeeSection(text, "申购费率", ["赎回费率", "友情提示： 赎回"]);
  const redemptionRules = summarizeFeeSection(text, "赎回费率", ["注：", "基金申购费用计算公式"]);
  const frontLoadRateForEstimate = toNumber(currentRatePct) ?? toNumber(sourceRatePct);
  const salesServiceRateForEstimate = toNumber(normalizedSalesServiceFeePct);
  const feeImpact = buildFeeImpactEstimate({
    shareClass,
    sourceRatePct,
    currentRatePct,
    salesServiceFeePct: normalizedSalesServiceFeePct,
    hasFeePage: Boolean(text),
    subscriptionRules,
    redemptionRules
  });

  return {
    shareClass,
    shareClassFeeModel: inferShareClassFeeModel(shareClass, {
      sourceRatePct,
      currentRatePct,
      salesServiceFeePct: normalizedSalesServiceFeePct
    }),
    sourceRatePct,
    currentRatePct,
    minPurchase: normalizeMissingValue(minPurchase),
    managementFeePct: normalizeFeeValue(managementFeePct),
    custodyFeePct: normalizeFeeValue(custodyFeePct),
    salesServiceFeePct: normalizedSalesServiceFeePct,
    estimatedSubscriptionFeePer10000: Number.isFinite(frontLoadRateForEstimate)
      ? round(10000 - 10000 / (1 + frontLoadRateForEstimate / 100), 2)
      : null,
    estimatedSalesServiceFeePer10000PerYear: Number.isFinite(salesServiceRateForEstimate)
      ? round(10000 * salesServiceRateForEstimate / 100, 2)
      : null,
    feeImpact,
    holdingPeriodFit: feeImpact.holdingPeriodFit,
    feeDecisionRule: feeImpact.feeDecisionRule,
    missingFeeData: feeImpact.missingFeeData,
    netValueAlreadyDeductsOperatingFees: Boolean(text),
    feeRules: {
      subscription: subscriptionRules,
      redemption: redemptionRules
    },
    source: feePageText && code ? `https://fundf10.eastmoney.com/jjfl_${code}.html` : ""
  };
}

function formatFeeImpactForEvidence(fees = {}) {
  const impact = fees.feeImpact || null;
  if (!impact) return "";
  const parts = [
    fees.shareClass ? `shareClass=${fees.shareClass}` : "",
    impact.holdingPeriodFit ? `holdingFit=${impact.holdingPeriodFit}` : "",
    Number.isFinite(toNumber(impact.oneYearCostPer10000)) ? `1yFeePer10000=${impact.oneYearCostPer10000}` : "",
    impact.feeDragLevel ? `feeDrag=${impact.feeDragLevel}` : ""
  ].filter(Boolean);
  return parts.join(", ");
}

function formatMoneyMarketEvidence(moneyMarket) {
  if (!moneyMarket?.ok) return "";
  const fields = [
    moneyMarket.latestDate ? `货币数据日期=${moneyMarket.latestDate}` : "",
    Number.isFinite(toNumber(moneyMarket.latestSevenDayAnnualizedPct)) ? `7日年化=${moneyMarket.latestSevenDayAnnualizedPct}%` : "",
    Number.isFinite(toNumber(moneyMarket.latestMillionIncome)) ? `万份收益=${moneyMarket.latestMillionIncome}` : ""
  ].filter(Boolean);
  return fields.join(", ");
}

function buildFeeImpactEstimate({
  shareClass,
  sourceRatePct,
  currentRatePct,
  salesServiceFeePct,
  hasFeePage = false,
  subscriptionRules = "",
  redemptionRules = ""
} = {}) {
  const className = String(shareClass || "").toUpperCase();
  const currentRate = toNumber(currentRatePct);
  const sourceRate = toNumber(sourceRatePct);
  const salesService = toNumber(salesServiceFeePct);
  const frontLoadRate = Number.isFinite(currentRate) ? currentRate : sourceRate;
  const frontLoadCostPer10000 = Number.isFinite(frontLoadRate)
    ? round(10000 - 10000 / (1 + frontLoadRate / 100), 2)
    : null;
  const salesServiceCostPer10000PerYear = Number.isFinite(salesService)
    ? round(10000 * salesService / 100, 2)
    : null;
  const criticalFeeMissing = (["C", "E"].includes(className) && !Number.isFinite(salesService))
    || (["A", "B"].includes(className) && !Number.isFinite(frontLoadRate));
  const horizons = [30, 90, 180, 365, 730].map((days) => {
    const frontCost = Number.isFinite(frontLoadCostPer10000) ? frontLoadCostPer10000 : 0;
    const serviceCost = Number.isFinite(salesServiceCostPer10000PerYear)
      ? salesServiceCostPer10000PerYear * days / 365
      : 0;
    return {
      days,
      costPer10000: !criticalFeeMissing && (Number.isFinite(frontLoadCostPer10000) || Number.isFinite(salesServiceCostPer10000PerYear))
        ? round(frontCost + serviceCost, 2)
        : null
    };
  });
  const oneYearCostPer10000 = horizons.find((item) => item.days === 365)?.costPer10000 ?? null;
  const twoYearCostPer10000 = horizons.find((item) => item.days === 730)?.costPer10000 ?? null;
  const salesServiceBreakEvenDays = Number.isFinite(frontLoadCostPer10000)
    && Number.isFinite(salesServiceCostPer10000PerYear)
    && salesServiceCostPer10000PerYear > 0
    ? Math.round(frontLoadCostPer10000 / salesServiceCostPer10000PerYear * 365)
    : null;
  const missingFeeData = [];
  if (!className) missingFeeData.push("share_class");
  if (!hasFeePage) missingFeeData.push("fee_page");
  if (!Number.isFinite(frontLoadRate) && !Number.isFinite(salesService)) missingFeeData.push("subscription_or_sales_service_fee");
  if (["C", "E"].includes(className) && !Number.isFinite(salesService)) missingFeeData.push("sales_service_fee");
  if (["A", "B"].includes(className) && !Number.isFinite(frontLoadRate)) missingFeeData.push("subscription_fee");
  if (!subscriptionRules) missingFeeData.push("subscription_rules");
  if (!redemptionRules) missingFeeData.push("redemption_rules");

  return {
    costBase: "per_10000_cny",
    frontLoadRatePct: Number.isFinite(frontLoadRate) ? frontLoadRate : null,
    frontLoadCostPer10000,
    salesServiceFeePct: Number.isFinite(salesService) ? salesService : null,
    salesServiceCostPer10000PerYear,
    horizons,
    oneYearCostPer10000,
    twoYearCostPer10000,
    salesServiceBreakEvenDays,
    holdingPeriodFit: inferFeeHoldingPeriodFit({
      className,
      frontLoadCostPer10000,
      salesServiceCostPer10000PerYear,
      oneYearCostPer10000,
      missingFeeData
    }),
    feeDragLevel: inferFeeDragLevel(oneYearCostPer10000),
    feeDecisionRule: buildFeeDecisionRule({
      className,
      frontLoadCostPer10000,
      salesServiceCostPer10000PerYear,
      oneYearCostPer10000,
      twoYearCostPer10000,
      salesServiceBreakEvenDays,
      missingFeeData
    }),
    missingFeeData
  };
}

function inferFeeHoldingPeriodFit({
  className,
  frontLoadCostPer10000,
  salesServiceCostPer10000PerYear,
  oneYearCostPer10000,
  missingFeeData = []
}) {
  if (missingFeeData.includes("subscription_or_sales_service_fee")) return "needs_fee_verification";
  if (missingFeeData.includes("sales_service_fee") || missingFeeData.includes("subscription_fee")) return "needs_fee_verification";
  if (["D", "I", "Y"].includes(className)) return "channel_or_institution_only_check";
  if (["C", "E"].includes(className) || Number.isFinite(salesServiceCostPer10000PerYear) && salesServiceCostPer10000PerYear > 0) {
    if (Number.isFinite(oneYearCostPer10000) && oneYearCostPer10000 >= 100) return "short_term_only_high_long_holding_drag";
    return "short_or_tactical_holding_fit";
  }
  if (Number.isFinite(frontLoadCostPer10000) && frontLoadCostPer10000 >= 80) return "medium_long_holding_preferred";
  if (Number.isFinite(frontLoadCostPer10000)) return "holding_period_flexible";
  return "needs_fee_verification";
}

function inferFeeDragLevel(oneYearCostPer10000) {
  if (!Number.isFinite(oneYearCostPer10000)) return "unknown";
  if (oneYearCostPer10000 >= 120) return "high";
  if (oneYearCostPer10000 >= 60) return "medium";
  return "low";
}

function buildFeeDecisionRule({
  className,
  frontLoadCostPer10000,
  salesServiceCostPer10000PerYear,
  oneYearCostPer10000,
  twoYearCostPer10000,
  salesServiceBreakEvenDays,
  missingFeeData = []
}) {
  if (missingFeeData.includes("subscription_or_sales_service_fee")) {
    return "费率数据不足；买入前必须核对同基金不同份额的申购费、销售服务费和赎回规则。";
  }
  if (missingFeeData.includes("sales_service_fee") || missingFeeData.includes("subscription_fee")) {
    return "关键费率字段缺失；买入前必须复核该份额是否存在持续销售服务费或前端申购费。";
  }
  const costText = Number.isFinite(oneYearCostPer10000)
    ? `按每1万元估算，持有1年费用拖累约${oneYearCostPer10000}元${Number.isFinite(twoYearCostPer10000) ? `，2年约${twoYearCostPer10000}元` : ""}。`
    : "";
  if (salesServiceBreakEvenDays) {
    return `${costText} 申购费与销售服务费粗略平衡点约${salesServiceBreakEvenDays}天，短于该周期偏向低前端费用，长于该周期要警惕持续费率拖累。`;
  }
  if (["C", "E"].includes(className) || Number.isFinite(salesServiceCostPer10000PerYear) && salesServiceCostPer10000PerYear > 0) {
    return `${costText} 该份额更适合短期/战术持有，若计划长期持有应复核A类或低费率替代。`;
  }
  if (Number.isFinite(frontLoadCostPer10000)) {
    return `${costText} 该份额偏前端申购费模型，短线交易需用收益空间覆盖申购与赎回摩擦。`;
  }
  return "份额类别和费用模型仍需复核，不应作为重仓买入依据。";
}

function inferFundShareClass(name) {
  const compact = String(name || "").replace(/\s+/g, "").replace(/[（）()]/g, "");
  const match = compact.match(/([A-Z])类?(?:人民币|美元)?$/i);
  if (!match) {
    return "";
  }

  const suffix = compact.match(/[A-Za-z]+$/)?.[0] || "";
  if (suffix.length > 1) {
    const prefix = suffix.slice(0, -1).toUpperCase();
    const knownProductSuffixes = ["QDII", "ETF", "LOF", "FOF", "REIT"];
    if (!knownProductSuffixes.some((item) => prefix.endsWith(item))) {
      return "";
    }
  }

  return match[1].toUpperCase();
}

function inferShareClassFeeModel(shareClass, fees = {}) {
  const sourceRate = toNumber(fees.sourceRatePct);
  const currentRate = toNumber(fees.currentRatePct);
  const salesService = toNumber(fees.salesServiceFeePct);
  const className = String(shareClass || "").toUpperCase();

  if (Number.isFinite(salesService) && salesService > 0) {
    return {
      type: "sales_service_fee",
      label: `${className || "未知"}类：偏持续销售服务费模型`,
      selectionRule: "更适合短期或不想付前端申购费的候选，但持有越久销售服务费越需要折算比较。"
    };
  }

  if (["C", "E"].includes(className)) {
    return {
      type: "likely_sales_service_fee",
      label: `${className}类：通常需重点核对销售服务费`,
      selectionRule: "不能只因无前端申购费就优先推荐，必须和A类按预计持有期比较。"
    };
  }

  if (["D", "I", "Y"].includes(className)) {
    return {
      type: "special_or_platform_class",
      label: `${className}类：特殊/机构/平台份额`,
      selectionRule: "推荐前要确认销售渠道、起购门槛和是否面向普通投资者开放。"
    };
  }

  if (Number.isFinite(currentRate) || Number.isFinite(sourceRate) || ["A", "B"].includes(className)) {
    return {
      type: "front_load_or_subscription_fee",
      label: `${className || "未知"}类：偏前端申购费模型`,
      selectionRule: "长期持有时可能比持续销售服务费份额更合适，但短持要同时看赎回费和平台折扣。"
    };
  }

  return {
    type: "unknown",
    label: "份额类别未识别",
    selectionRule: "推荐前应核对同基金不同份额的申购费、销售服务费、赎回费和可购买渠道。"
  };
}

function normalizeFeePageText(html) {
  return stripHtml(String(html || ""))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFeeLabelValue(text, label) {
  const match = String(text || "").match(new RegExp(`${escapeRegExp(label)}\\s*([0-9.]+%|---|--)`));
  return match ? match[1] : "";
}

function normalizeFeeValue(value) {
  const text = normalizeMissingValue(value);
  return text === "---" ? "" : text;
}

function summarizeFeeSection(text, startLabel, endLabels = []) {
  const value = String(text || "");
  const start = value.indexOf(startLabel);
  if (start < 0) return "";
  let end = value.length;
  for (const label of endLabels) {
    const index = value.indexOf(label, start + startLabel.length);
    if (index > start && index < end) {
      end = index;
    }
  }
  return value.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 280);
}

async function fetchFundHoldings(code) {
  const [equity, bond] = await Promise.all([
    fetchFundArchiveHoldings(code, "jjcc").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundArchiveHoldings(code, "zqcc").catch((error) => ({ ok: false, error: error.message, items: [] }))
  ]);

  updateStats({
    counters: {
      fundHoldingsFetches: 1,
      fundHoldingsFailures: equity.ok || bond.ok ? 0 : 1
    },
    last: { lastFundHoldingsFetchAt: new Date().toISOString() }
  });

  return {
    ok: Boolean(equity.ok || bond.ok),
    equityTopHoldings: equity.items || [],
    bondTopHoldings: bond.items || [],
    equityDisclosureDate: equity.disclosureDate || "",
    bondDisclosureDate: bond.disclosureDate || "",
    notes: [
      "股票/港股/QDII 持仓来自基金 F10 季报股票投资明细；债基持仓来自债券投资明细。",
      "持仓披露通常按季度更新，可能滞后于当前真实仓位。"
    ],
    errors: [equity, bond]
      .filter((item) => item && item.ok === false && item.error)
      .map((item) => item.error),
    sources: [
      `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}`,
      `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=zqcc&code=${code}`
    ]
  };
}

async function fetchFundArchiveHoldings(code, type) {
  const url = new URL("https://fundf10.eastmoney.com/FundArchivesDatas.aspx");
  url.searchParams.set("type", type);
  url.searchParams.set("code", code);
  url.searchParams.set("topline", "10");
  url.searchParams.set("year", "");
  url.searchParams.set("month", "");
  url.searchParams.set("rt", String(Date.now()));

  const text = await fetchText(url.href, `https://fundf10.eastmoney.com/ccmx_${code}.html`);
  const rows = parseFundArchiveRows(text);
  const disclosureDate = extractDisclosureDate(text);
  const items = (type === "zqcc" ? rows.map(mapBondHoldingRow) : rows.map(mapEquityHoldingRow)).filter(Boolean);
  return {
    ok: items.length > 0,
    type,
    disclosureDate,
    items: items.slice(0, 10)
  };
}

async function fetchFundNavHistory(code) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 5);

  const firstPage = await fetchFundNavHistoryPage(code, 1, startDate, endDate);
  const points = [...firstPage.points];
  const totalPages = Math.min(firstPage.pages || 1, Number(process.env.FUND_NAV_MAX_PAGES || 35));

  for (let page = 2; page <= totalPages; page += 1) {
    const pageData = await fetchFundNavHistoryPage(code, page, startDate, endDate);
    points.push(...pageData.points);
  }

  const deduped = [...new Map(points.map((point) => [point.date, point])).values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  updateStats({
    counters: { navHistoryFetches: 1, navHistoryPoints: deduped.length },
    last: { lastNavHistoryFetchAt: new Date().toISOString() }
  });

  return {
    ok: true,
    code,
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    points: deduped
  };
}

async function fetchFundNavHistoryPage(code, page, startDate, endDate) {
  const url = [
    "https://fund.eastmoney.com/f10/F10DataApi.aspx",
    `?type=lsjz&code=${encodeURIComponent(code)}`,
    `&page=${page}`,
    "&per=49",
    `&sdate=${formatDate(startDate)}`,
    `&edate=${formatDate(endDate)}`
  ].join("");
  const text = await fetchText(url);
  const pages = Number(text.match(/pages:(\d+)/)?.[1] || 1);
  return {
    pages,
    points: parseFundNavRows(text)
  };
}

async function fetchFundNavPointForDate(code, date) {
  const target = new Date(`${date}T00:00:00`);
  const startDate = new Date(target);
  const endDate = new Date(target);
  const page = await fetchFundNavHistoryPage(code, 1, startDate, endDate);
  const exact = page.points.find((point) => point.date === date);
  if (exact) return exact;
  return page.points[0] || null;
}

function parseFundNavRows(text) {
  const rows = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let rowMatch = null;
  while ((rowMatch = rowRegex.exec(text))) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) =>
      stripHtml(match[1]).trim()
    );
    if (cells.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) {
      continue;
    }
    rows.push({
      date: cells[0],
      unitNav: toNumber(cells[1]),
      cumulativeNav: toNumber(cells[2]),
      dailyReturnPct: toNumber(cells[3].replace("%", ""))
    });
  }
  return rows.filter((row) => Number.isFinite(row.cumulativeNav) && row.cumulativeNav > 0);
}

function computeRiskMetrics(points) {
  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length < 20) {
    return { ok: false, note: "历史净值点不足，无法稳定计算风险指标。", points: ordered.length };
  }

  const latest = ordered[ordered.length - 1];
  const riskFreeRatePct = Number(process.env.RISK_FREE_RATE_PCT || 2);
  const periods = {};
  for (const years of [1, 3, 5]) {
    periods[`${years}y`] = computePeriodRiskMetrics(ordered, latest, years, riskFreeRatePct);
  }

  return {
    ok: true,
    source: "computed_from_eastmoney_nav_history",
    latestDate: latest.date,
    points: ordered.length,
    riskFreeRatePct,
    periods
  };
}

function computePeriodRiskMetrics(points, latest, years, riskFreeRatePct) {
  const cutoff = new Date(`${latest.date}T00:00:00`);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const periodPoints = points.filter((point) => new Date(`${point.date}T00:00:00`) >= cutoff);
  if (periodPoints.length < 20) {
    return { ok: false, years, points: periodPoints.length, note: "区间净值点不足。" };
  }

  const first = periodPoints[0];
  const last = periodPoints[periodPoints.length - 1];
  const days = Math.max(1, (new Date(`${last.date}T00:00:00`) - new Date(`${first.date}T00:00:00`)) / 86400000);
  const totalReturn = last.cumulativeNav / first.cumulativeNav - 1;
  const annualizedReturn = Math.pow(1 + totalReturn, 365.25 / days) - 1;
  const dailyReturns = [];
  for (let i = 1; i < periodPoints.length; i += 1) {
    const prev = periodPoints[i - 1].cumulativeNav;
    const current = periodPoints[i].cumulativeNav;
    if (prev > 0 && current > 0) {
      dailyReturns.push(current / prev - 1);
    }
  }
  const annualizedVolatility = standardDeviation(dailyReturns) * Math.sqrt(252);
  const maxDrawdown = computeMaxDrawdown(periodPoints.map((point) => point.cumulativeNav));
  const sharpe =
    annualizedVolatility > 0
      ? (annualizedReturn - riskFreeRatePct / 100) / annualizedVolatility
      : null;

  return {
    ok: true,
    years,
    startDate: first.date,
    endDate: last.date,
    points: periodPoints.length,
    totalReturnPct: round(totalReturn * 100, 2),
    annualizedReturnPct: round(annualizedReturn * 100, 2),
    annualizedVolatilityPct: round(annualizedVolatility * 100, 2),
    maxDrawdownPct: round(maxDrawdown * 100, 2),
    sharpe: sharpe === null ? null : round(sharpe, 2)
  };
}

function computeMaxDrawdown(values) {
  let peak = values[0] || 0;
  let maxDrawdown = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
    }
  }
  return maxDrawdown;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

async function fetchText(url, referer = "https://fund.eastmoney.com/") {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "user-agent": "Mozilla/5.0 FundAgent/1.0",
        referer
      }
    },
    PUBLIC_DATA_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }
  return response.text();
}

function parseFundPingzhongData(text) {
  const scale = parseJsAssignment(text, "Data_fluctuationScale");
  const assetAllocation = parseJsAssignment(text, "Data_assetAllocation");
  const performanceEvaluation = parseJsAssignment(text, "Data_performanceEvaluation");
  const managers = parseJsAssignment(text, "Data_currentFundManager");
  const millionCopiesIncome = parseJsAssignment(text, "Data_millionCopiesIncome");
  const sevenDaysYearIncome = parseJsAssignment(text, "Data_sevenDaysYearIncome");
  return {
    name: extractJsString(text, "fS_name"),
    code: extractJsString(text, "fS_code"),
    sourceRate: extractJsString(text, "fund_sourceRate"),
    rate: extractJsString(text, "fund_Rate"),
    minPurchase: extractJsString(text, "fund_minsg"),
    syl_1n: extractJsString(text, "syl_1n"),
    syl_6y: extractJsString(text, "syl_6y"),
    syl_3y: extractJsString(text, "syl_3y"),
    syl_1y: extractJsString(text, "syl_1y"),
    scale: summarizeScale(scale),
    assetAllocation: summarizeAssetAllocation(assetAllocation),
    performanceEvaluation: summarizePerformanceEvaluation(performanceEvaluation),
    moneyMarket: summarizeMoneyMarketData({ millionCopiesIncome, sevenDaysYearIncome }),
    managers: summarizeManagers(managers),
    topStocks: extractTopStockCodes(text)
  };
}

function summarizeMoneyMarketData({ millionCopiesIncome, sevenDaysYearIncome } = {}) {
  const million = normalizeMoneyMarketSeries(millionCopiesIncome);
  const sevenDay = normalizeMoneyMarketSeries(sevenDaysYearIncome);
  const latestMillion = million[million.length - 1] || null;
  const latestSevenDay = sevenDay[sevenDay.length - 1] || null;
  const latestDate = latestSevenDay?.date || latestMillion?.date || "";
  return {
    ok: Boolean(latestMillion || latestSevenDay),
    latestDate,
    latestMillionIncome: latestMillion?.value ?? null,
    latestSevenDayAnnualizedPct: latestSevenDay?.value ?? null,
    avg7dMillionIncome: averageRecentMoneyValue(million, 7),
    avg30dSevenDayAnnualizedPct: averageRecentMoneyValue(sevenDay, 30),
    seriesPoints: {
      millionIncome: million.length,
      sevenDayAnnualized: sevenDay.length
    },
    note: latestMillion || latestSevenDay ? "货币基金收益指标来自公开万份收益和7日年化序列。" : ""
  };
}

function normalizeMoneyMarketSeries(series) {
  if (!Array.isArray(series)) return [];
  return series
    .map((point) => {
      const timestamp = Array.isArray(point) ? Number(point[0]) : Number(point?.[0] ?? point?.date);
      const value = Array.isArray(point) ? toNumber(point[1]) : toNumber(point?.value);
      return {
        date: Number.isFinite(timestamp) ? formatEpochMsDate(timestamp) : "",
        value
      };
    })
    .filter((point) => point.date && Number.isFinite(point.value));
}

function averageRecentMoneyValue(series = [], days = 7) {
  const values = series.slice(-Math.max(1, Number(days || 7))).map((item) => item.value).filter(Number.isFinite);
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 4) : null;
}

function parseFundArchiveRows(text) {
  const bodyMatch = String(text || "").match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!bodyMatch) {
    return [];
  }

  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch = null;
  while ((rowMatch = rowRegex.exec(bodyMatch[1]))) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      normalizeCellText(match[1])
    );
    if (cells.length) {
      rows.push(cells);
    }
  }
  return rows;
}

function mapEquityHoldingRow(cells) {
  if (cells.length < 7) return null;
  return {
    rank: toNumber(cells[0]),
    code: cells[1] || "",
    name: cells[2] || "",
    latestPrice: normalizeMissingValue(cells[3]),
    changePct: normalizeMissingValue(cells[4]),
    netValuePct: toNumber(cells[6]),
    sharesWan: toNumber(cells[7]),
    marketValueWan: toNumber(cells[8]),
    assetType: inferHoldingAssetType(cells[1])
  };
}

function mapBondHoldingRow(cells) {
  if (cells.length < 5) return null;
  return {
    rank: toNumber(cells[0]),
    code: cells[1] || "",
    name: cells[2] || "",
    netValuePct: toNumber(cells[3]),
    marketValueWan: toNumber(cells[4]),
    assetType: "bond"
  };
}

function extractDisclosureDate(text) {
  const normalized = normalizeCellText(String(text || ""));
  return normalized.match(/截止至[:：]?\s*(\d{4}-\d{2}-\d{2})/)?.[1] || "";
}

function inferHoldingAssetType(code) {
  const value = String(code || "").trim().toUpperCase();
  if (/^[A-Z]{1,5}$/.test(value)) return "overseas_stock";
  if (/^\d{4}$/.test(value)) return "overseas_stock";
  if (/^\d{5}$/.test(value)) return "hk_stock";
  if (/^\d{6}$/.test(value)) return "stock";
  return "stock_or_equity";
}

function normalizeCellText(value) {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/^--$/, "")
    .trim();
}

function normalizeMissingValue(value) {
  const text = String(value || "").trim();
  return text === "--" ? "" : text;
}

function extractJsString(text, name) {
  const match = text.match(new RegExp(`var\\s+${escapeRegExp(name)}\\s*=\\s*\"([\\s\\S]*?)\"\\s*;`));
  return match ? match[1] : "";
}

function parseJsAssignment(text, name) {
  const startMatch = text.match(new RegExp(`var\\s+${escapeRegExp(name)}\\s*=\\s*`));
  if (!startMatch?.index && startMatch?.index !== 0) {
    return null;
  }
  const start = startMatch.index + startMatch[0].length;
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") depth -= 1;
    if (char === ";" && depth <= 0) {
      const raw = text.slice(start, i).trim();
      return JSON.parse(raw);
    }
  }
  return null;
}

function summarizeScale(value) {
  if (!value?.categories?.length || !value?.series?.length) return null;
  const lastIndex = value.categories.length - 1;
  return {
    date: value.categories[lastIndex],
    valueYi: value.series[lastIndex]?.y ?? "",
    mom: value.series[lastIndex]?.mom ?? ""
  };
}

function summarizeAssetAllocation(value) {
  if (!value?.categories?.length || !value?.series?.length) return null;
  const lastIndex = value.categories.length - 1;
  const out = { date: value.categories[lastIndex] };
  for (const item of value.series) {
    out[item.name] = item.data?.[lastIndex] ?? "";
  }
  return out;
}

function summarizePerformanceEvaluation(value) {
  if (!value) return null;
  return {
    average: value.avr || "",
    categories: value.categories || [],
    data: value.data || []
  };
}

function summarizeManagers(value) {
  if (!Array.isArray(value)) return [];
  return value.map((manager) => ({
    name: manager.name || "",
    star: manager.star || "",
    workTime: manager.workTime || "",
    fundSize: manager.fundSize || "",
    currentFundProfitPct: manager.profit?.series?.[0]?.data?.[0]?.y ?? ""
  }));
}

function extractTopStockCodes(text) {
  const match = text.match(/var\s+stockCodesNew\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]).slice(0, 10);
  } catch {
    return [];
  }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function toNumber(value) {
  const cleaned = String(value || "").replace(/,/g, "").replace(/%/g, "").trim();
  if (!cleaned || cleaned === "--") return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEpochSeconds(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : "";
}

function formatEpochMsDate(value) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : "";
}

async function replyToMessage(messageId, text, options = {}) {
  const config = getEffectiveConfig();
  const token = await getTenantAccessToken(config);
  const url = new URL(`/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, config.feishuBaseUrl);
  const imageChunks = splitFeishuCardImages(options.images);
  const primaryOptions = imageChunks.length ? { ...options, images: imageChunks[0] } : options;
  const payload = buildFeishuReplyPayload(text, primaryOptions);

  try {
    await postJson(url, payload, { Authorization: `Bearer ${token}` });
  } catch (error) {
    if (payload.msg_type === "interactive") {
      await postJson(
        url,
        {
          msg_type: "text",
          content: JSON.stringify({ text: normalizeFeishuText(text) })
        },
        {
          Authorization: `Bearer ${token}`
        }
      );
    } else {
      throw error;
    }
  }

  if (payload.msg_type === "interactive" && imageChunks.length > 1) {
    for (let index = 1; index < imageChunks.length; index += 1) {
      const supplementText = buildFeishuImageSupplementText(imageChunks[index], index, imageChunks.length);
      const supplementPayload = buildFeishuReplyPayload(supplementText, {
        ...options,
        kind: "chart",
        images: imageChunks[index]
      });
      try {
        await postJson(url, supplementPayload, { Authorization: `Bearer ${token}` });
      } catch (error) {
        console.error("[fund-report-image-chunk-reply-error]", error);
        recordError(error, { fundReportImageChunkReplyFailures: 1 });
        await postJson(
          url,
          {
            msg_type: "text",
            content: JSON.stringify({ text: normalizeFeishuText(supplementText) })
          },
          {
            Authorization: `Bearer ${token}`
          }
        ).catch((fallbackError) => {
          console.error("[fund-report-image-chunk-fallback-error]", fallbackError);
          recordError(fallbackError, { fundReportImageChunkReplyFailures: 1 });
        });
      }
    }
  }
  const kind = options.kind || "reply";
  updateStats({
    counters: {
      repliesSent: 1,
      progressReplies: kind === "progress" ? 1 : 0,
      answersSent: kind === "answer" ? 1 : 0,
      errorReplies: kind === "error" ? 1 : 0,
      fundReportImageReplyChunks: imageChunks.length > 1 ? imageChunks.length : 0,
      fundReportImageSupplementReplies: Math.max(0, imageChunks.length - 1)
    },
    last: {
      lastReplyAt: new Date().toISOString(),
      lastReplyKind: kind
    }
  });
}

async function sendFeishuMessage(receiveId, text, options = {}) {
  const config = getEffectiveConfig();
  const token = await getTenantAccessToken(config);
  const receiveIdType = options.receiveIdType || "chat_id";
  const url = new URL("/open-apis/im/v1/messages", config.feishuBaseUrl);
  url.searchParams.set("receive_id_type", receiveIdType);
  const imageChunks = splitFeishuCardImages(options.images);
  const primaryOptions = imageChunks.length ? { ...options, images: imageChunks[0] } : options;
  const payload = {
    receive_id: receiveId,
    ...buildFeishuReplyPayload(text, primaryOptions)
  };

  try {
    await postJson(url, payload, { Authorization: `Bearer ${token}` });
  } catch (error) {
    if (payload.msg_type === "interactive") {
      await postJson(
        url,
        {
          receive_id: receiveId,
          msg_type: "text",
          content: JSON.stringify({ text: normalizeFeishuText(text) })
        },
        { Authorization: `Bearer ${token}` }
      );
    } else {
      throw error;
    }
  }

  if (payload.msg_type === "interactive" && imageChunks.length > 1) {
    for (let index = 1; index < imageChunks.length; index += 1) {
      const supplementText = buildFeishuImageSupplementText(imageChunks[index], index, imageChunks.length);
      const supplementPayload = {
        receive_id: receiveId,
        ...buildFeishuReplyPayload(supplementText, {
          ...options,
          kind: "chart",
          images: imageChunks[index]
        })
      };
      try {
        await postJson(url, supplementPayload, { Authorization: `Bearer ${token}` });
      } catch (error) {
        console.error("[fund-report-image-chunk-send-error]", error);
        recordError(error, { fundReportImageChunkReplyFailures: 1 });
        await postJson(
          url,
          {
            receive_id: receiveId,
            msg_type: "text",
            content: JSON.stringify({ text: normalizeFeishuText(supplementText) })
          },
          { Authorization: `Bearer ${token}` }
        ).catch((fallbackError) => {
          console.error("[fund-report-image-chunk-send-fallback-error]", fallbackError);
          recordError(fallbackError, { fundReportImageChunkReplyFailures: 1 });
        });
      }
    }
  }

  updateStats({
    counters: {
      proactiveRepliesSent: 1,
      fundReportImageReplyChunks: imageChunks.length > 1 ? imageChunks.length : 0,
      fundReportImageSupplementReplies: Math.max(0, imageChunks.length - 1)
    },
    last: {
      lastProactiveReplyAt: new Date().toISOString(),
      lastProactiveReplyType: options.kind || "reply"
    }
  });
}

function splitFeishuCardImages(images = []) {
  const list = Array.isArray(images) ? images.filter((image) => image?.imageKey) : [];
  if (!list.length) return [];
  const chunkSize = getFeishuCardImageChunkSize();
  const chunks = [];
  for (let index = 0; index < list.length; index += chunkSize) {
    chunks.push(list.slice(index, index + chunkSize));
  }
  return chunks;
}

function getFeishuCardImageChunkSize() {
  const configured = Math.floor(Number(process.env.FEISHU_CARD_IMAGE_CHUNK_SIZE || DEFAULT_FEISHU_CARD_IMAGE_CHUNK_SIZE));
  return Math.max(1, Math.min(6, Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_FEISHU_CARD_IMAGE_CHUNK_SIZE));
}

function buildFeishuImageSupplementText(images = [], chunkIndex = 0, chunkTotal = 1) {
  const lines = (images || []).map((image, index) => {
    const label = String(image?.alt || "基金报告图").replace(/\s+/g, " ").trim();
    return `${index + 1}. ${label.slice(0, 120)}`;
  });
  return [
    `配图补充（第 ${chunkIndex + 1}/${chunkTotal} 组）：`,
    "这组继续对应上一条的买入参考和备选观察，请对照正文里的配图阅读。",
    ...lines
  ].filter(Boolean).join("\n");
}

function buildFeishuReplyPayload(text, options = {}) {
  const config = getEffectiveConfig();
  const kind = options.kind || "reply";
  const useCards = String(config.feishuUseCards ?? process.env.FEISHU_USE_CARDS ?? "true") !== "false";

  if (!useCards) {
    return {
      msg_type: "text",
      content: JSON.stringify({ text: normalizeFeishuText(text) })
    };
  }

  return {
    msg_type: "interactive",
    content: JSON.stringify(buildFeishuCard(text, kind, options))
  };
}

function buildFeishuCard(text, kind, options = {}) {
  const meta = getCardMeta(kind);
  const content = normalizeFeishuCardMarkdown(text, kind);
  const elements = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content
      }
    }
  ];

  const cardImages = Array.isArray(options.images) ? options.images : [];
  for (const image of cardImages) {
    if (!image?.imageKey) continue;
    elements.push(
      { tag: "hr" },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: image.alt || "走势曲线"
          }
        ]
      },
      {
        tag: "img",
        img_key: image.imageKey,
        alt: {
          tag: "plain_text",
          content: image.alt || "走势曲线"
        },
        mode: "fit_horizontal"
      }
    );
  }

  if (kind === "answer") {
    elements.push(
      { tag: "hr" },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "基金经理会按请求选择截图识别、公开数据补全或市场快照；结论仅供研究参考，不构成收益承诺。"
          }
        ]
      }
    );
  }

  return {
    config: {
      wide_screen_mode: true,
      enable_forward: true
    },
    header: {
      template: meta.template,
      title: {
        tag: "plain_text",
        content: meta.title
      }
    },
    elements
  };
}

function getCardMeta(kind) {
  const meta = {
    progress: { template: "blue", title: "🔎 基金经理正在处理" },
    answer: { template: "turquoise", title: "📊 基金分析完成" },
    chart: { template: "turquoise", title: "📈 基金配图补充" },
    portfolio: { template: "green", title: "🧭 虚拟基金经理" },
    error: { template: "red", title: "⚠️ 分析遇到问题" },
    noContent: { template: "yellow", title: "📷 请发送基金截图" },
    reply: { template: "wathet", title: "基金经理" }
  };
  return meta[kind] || meta.reply;
}

async function getTenantAccessToken(config = getEffectiveConfig()) {
  validateFeishuConfig(config);
  const cacheKey = [config.feishuBaseUrl, config.feishuAppId, config.feishuAppSecret].join("|");
  const now = Date.now();
  if (tenantAccessTokenCache?.cacheKey === cacheKey && tenantAccessTokenCache.expiresAt > now + 60_000) {
    return tenantAccessTokenCache.token;
  }

  const url = new URL("/open-apis/auth/v3/tenant_access_token/internal", config.feishuBaseUrl);
  const json = await postJson(url, {
    app_id: config.feishuAppId,
    app_secret: config.feishuAppSecret
  });

  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`获取飞书 tenant_access_token 失败：${json.msg || JSON.stringify(json)}`);
  }

  tenantAccessTokenCache = {
    cacheKey,
    token: json.tenant_access_token,
    expiresAt: now + Math.max(60, Number(json.expire || 7200) - 600) * 1000
  };
  return tenantAccessTokenCache.token;
}

async function postResponsesStream(url, body, headers = {}, options = {}) {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...headers
      },
      body: JSON.stringify({ ...body, stream: true })
    },
    Number(options.timeoutMs ?? DEFAULT_MODEL_HTTP_TIMEOUT_MS)
  );

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`HTTP ${response.status}: ${detail.slice(0, 500)}`);
    error.httpStatus = response.status;
    throw error;
  }

  if (!contentType.includes("text/event-stream")) {
    const text = await response.text();
    const json = JSON.parse(text || "{}");
    return extractResponsesText(json);
  }

  return readResponsesEventStream(response);
}

async function readResponsesEventStream(response) {
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let completedResponse = null;

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseEvent(block);
      if (event?.data && event.data !== "[DONE]") {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
          output += parsed.delta;
        } else if (parsed.type === "response.output_text.done" && !output && typeof parsed.text === "string") {
          output = parsed.text;
        } else if (parsed.type === "response.completed" && parsed.response) {
          completedResponse = parsed.response;
        } else if (parsed.type === "response.failed" || parsed.type === "error") {
          throw new Error(parsed.error?.message || parsed.message || "模型流式响应失败。");
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  const tail = decoder.decode();
  if (tail) {
    buffer += tail;
    buffer = buffer.replace(/\r\n/g, "\n");
  }
  if (buffer.trim()) {
    const event = parseSseEvent(buffer);
    if (event?.data && event.data !== "[DONE]") {
      const parsed = JSON.parse(event.data);
      if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
        output += parsed.delta;
      } else if (parsed.type === "response.completed" && parsed.response) {
        completedResponse = parsed.response;
      }
    }
  }

  const text = output.trim();
  if (text) return text;
  return completedResponse ? extractResponsesText(completedResponse) : "";
}

function parseSseEvent(block) {
  const event = { event: "", data: "" };
  for (const line of String(block || "").split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator >= 0 ? line.slice(0, separator) : line;
    const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, "") : "";
    if (field === "event") event.event = value;
    if (field === "data") event.data += `${event.data ? "\n" : ""}${value}`;
  }
  return event.data || event.event ? event : null;
}

function resolveModelTimeoutMs(config, override) {
  const value = override ?? config.modelHttpTimeoutMs ?? DEFAULT_MODEL_HTTP_TIMEOUT_MS;
  const timeoutMs = Number(value);
  return Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 0;
}

function isResponsesStreamFallbackError(error) {
  return [400, 404, 405, 415, 422].includes(Number(error?.httpStatus || 0));
}

async function postJson(url, body, headers = {}, options = {}) {
  const attempts = Number(options.attempts || process.env.HTTP_RETRY_ATTEMPTS || 3);
  const timeoutMs = Number(options.timeoutMs ?? process.env.HTTP_POST_TIMEOUT_MS ?? HTTP_TIMEOUT_MS);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "content-type": "application/json; charset=utf-8",
            ...headers
          },
          body: JSON.stringify(body)
        },
        timeoutMs
      );

      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = null;
      }

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        error.httpStatus = response.status;
        throw error;
      }

      if (json && typeof json.code === "number" && json.code !== 0 && !json.output && !json.choices) {
        throw new Error(json.msg || JSON.stringify(json));
      }

      return json ?? text;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableHttpError(error)) {
        throw error;
      }
      await sleep(Math.min(2000, 300 * 2 ** (attempt - 1)));
    }
  }

  throw lastError;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = HTTP_TIMEOUT_MS) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    return fetch(url, options);
  }
  const boundedMs = Math.max(1000, ms);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), boundedMs);
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`HTTP request timeout after ${boundedMs}ms: ${url}`);
      timeoutError.code = "HTTP_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableHttpError(error) {
  const code = error?.cause?.code || error?.code || "";
  if (code === "HTTP_TIMEOUT" || error?.name === "AbortError") {
    return false;
  }
  if (["EAI_AGAIN", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return true;
  }
  if (error?.name === "TypeError" && /fetch failed/i.test(error.message || "")) {
    return true;
  }
  return Number(error?.httpStatus || 0) >= 500 || Number(error?.httpStatus || 0) === 429;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEffectiveConfig() {
  const codexDefaults = loadCodexDefaults();
  const envConfig = {
    feishuBaseUrl: process.env.FEISHU_BASE_URL || "https://open.feishu.cn",
    feishuAppId: process.env.FEISHU_APP_ID || "",
    feishuAppSecret: process.env.FEISHU_APP_SECRET || "",
    feishuVerificationToken: process.env.FEISHU_VERIFICATION_TOKEN || "",
    feishuEncryptKey: process.env.FEISHU_ENCRYPT_KEY || "",
    modelBaseUrl: process.env.MODEL_BASE_URL || codexDefaults.modelBaseUrl || "https://api.openai.com/v1",
    modelName: process.env.MODEL_NAME || codexDefaults.modelName || "gpt-5.5",
    modelApiKey: process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY || codexDefaults.modelApiKey || "",
    modelWireApi: process.env.MODEL_WIRE_API || codexDefaults.modelWireApi || "responses",
    modelReasoningEffort: process.env.MODEL_REASONING_EFFORT || codexDefaults.modelReasoningEffort || "high",
    modelMaxOutputTokens: Number(process.env.MODEL_MAX_OUTPUT_TOKENS || DEFAULT_MODEL_MAX_OUTPUT_TOKENS),
    modelHttpTimeoutMs: Number(process.env.MODEL_HTTP_TIMEOUT_MS ?? DEFAULT_MODEL_HTTP_TIMEOUT_MS),
    modelResponsesStream: parseBoolean(process.env.MODEL_RESPONSES_STREAM, true),
    replyMaxChars: Number(process.env.FEISHU_REPLY_MAX_CHARS || DEFAULT_REPLY_MAX_CHARS),
    portfolioEnabled: parseBoolean(process.env.PORTFOLIO_ENABLED, false),
    portfolioInitialCapital: Number(process.env.PORTFOLIO_INITIAL_CAPITAL || 100000),
    portfolioPremarketTime: process.env.PORTFOLIO_PREMARKET_TIME || "09:00",
    portfolioDecisionTime: process.env.PORTFOLIO_DECISION_TIME || "14:20",
    portfolioReviewTime: process.env.PORTFOLIO_REVIEW_TIME || "21:30",
    portfolioWeeklyReviewTime: process.env.PORTFOLIO_WEEKLY_REVIEW_TIME || "16:30",
    portfolioWeeklyReviewDay: Number(process.env.PORTFOLIO_WEEKLY_REVIEW_DAY || 5),
    portfolioTimezone: process.env.PORTFOLIO_TIMEZONE || "Asia/Shanghai",
    portfolioRetentionDays: Number(process.env.PORTFOLIO_RETENTION_DAYS || 90),
    portfolioPushReceiveId: process.env.PORTFOLIO_PUSH_RECEIVE_ID || "",
    portfolioPushReceiveType: process.env.PORTFOLIO_PUSH_RECEIVE_TYPE || "chat_id",
    portfolioAutoBindLastChat: parseBoolean(process.env.PORTFOLIO_AUTO_BIND_LAST_CHAT, true),
    portfolioRiskProfile: process.env.PORTFOLIO_RISK_PROFILE || "balanced",
    portfolioManagerProfile: process.env.PORTFOLIO_MANAGER_PROFILE || DEFAULT_PORTFOLIO_MANAGER_PROFILE
  };

  return normalizeEffectiveConfig({
    ...envConfig,
    ...safeReadJson(CONFIG_PATH)
  });
}

function normalizeEffectiveConfig(config) {
  const next = { ...config };
  next.modelWireApi = normalizeWireApi(next.modelWireApi || "responses");
  next.modelReasoningEffort = normalizeReasoningEffort(next.modelReasoningEffort) || "high";
  next.modelMaxOutputTokens = Number(next.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS);
  next.modelHttpTimeoutMs = Math.max(0, Number(next.modelHttpTimeoutMs ?? DEFAULT_MODEL_HTTP_TIMEOUT_MS) || 0);
  next.modelResponsesStream = parseBoolean(next.modelResponsesStream, true);
  next.replyMaxChars = Number(next.replyMaxChars || DEFAULT_REPLY_MAX_CHARS);
  next.portfolioEnabled = parseBoolean(next.portfolioEnabled, false);
  next.portfolioInitialCapital = Math.max(1000, Number(next.portfolioInitialCapital || 100000));
  next.portfolioPremarketTime = normalizeClockTime(next.portfolioPremarketTime, "09:00");
  next.portfolioDecisionTime = normalizeClockTime(next.portfolioDecisionTime, "14:20");
  next.portfolioReviewTime = normalizeClockTime(next.portfolioReviewTime, "21:30");
  next.portfolioWeeklyReviewTime = normalizeClockTime(next.portfolioWeeklyReviewTime, "16:30");
  next.portfolioWeeklyReviewDay = normalizeWeekday(next.portfolioWeeklyReviewDay, 5);
  next.portfolioTimezone = String(next.portfolioTimezone || "Asia/Shanghai").trim() || "Asia/Shanghai";
  next.portfolioRetentionDays = Math.max(7, Math.min(3650, Number(next.portfolioRetentionDays || 90)));
  next.portfolioPushReceiveId = String(next.portfolioPushReceiveId || "").trim();
  next.portfolioPushReceiveType = String(next.portfolioPushReceiveType || "chat_id").trim() || "chat_id";
  next.portfolioAutoBindLastChat = parseBoolean(next.portfolioAutoBindLastChat, true);
  next.portfolioRiskProfile = String(next.portfolioRiskProfile || "balanced").trim() || "balanced";
  next.portfolioManagerProfile = normalizePortfolioManagerProfile(next.portfolioManagerProfile);
  return next;
}

function getPublicConfig(config = getEffectiveConfig()) {
  return {
    ok: true,
    configPath: CONFIG_PATH,
    adminProtected: Boolean(ADMIN_TOKEN),
    values: {
      feishuBaseUrl: config.feishuBaseUrl || "https://open.feishu.cn",
      feishuAppId: config.feishuAppId || "",
      modelBaseUrl: config.modelBaseUrl || "",
      modelName: config.modelName || "gpt-5.5",
      modelWireApi: normalizeWireApi(config.modelWireApi),
      modelReasoningEffort: config.modelReasoningEffort || "high",
      modelMaxOutputTokens: Number(config.modelMaxOutputTokens || DEFAULT_MODEL_MAX_OUTPUT_TOKENS),
      modelHttpTimeoutMs: Math.max(0, Number(config.modelHttpTimeoutMs || 0)),
      modelResponsesStream: String(Boolean(config.modelResponsesStream)),
      replyMaxChars: Number(config.replyMaxChars || DEFAULT_REPLY_MAX_CHARS),
      portfolioEnabled: String(Boolean(config.portfolioEnabled)),
      portfolioInitialCapital: Number(config.portfolioInitialCapital || 100000),
      portfolioPremarketTime: config.portfolioPremarketTime || "09:00",
      portfolioDecisionTime: config.portfolioDecisionTime || "14:20",
      portfolioReviewTime: config.portfolioReviewTime || "21:30",
      portfolioWeeklyReviewTime: config.portfolioWeeklyReviewTime || "16:30",
      portfolioWeeklyReviewDay: Number(config.portfolioWeeklyReviewDay ?? 5),
      portfolioTimezone: config.portfolioTimezone || "Asia/Shanghai",
      portfolioRetentionDays: Number(config.portfolioRetentionDays || 90),
      portfolioPushReceiveId: config.portfolioPushReceiveId || "",
      portfolioPushReceiveType: config.portfolioPushReceiveType || "chat_id",
      portfolioAutoBindLastChat: String(Boolean(config.portfolioAutoBindLastChat)),
      portfolioRiskProfile: config.portfolioRiskProfile || "balanced",
      portfolioManagerProfile: normalizePortfolioManagerProfile(config.portfolioManagerProfile)
    },
    secrets: {
      feishuAppSecret: Boolean(config.feishuAppSecret),
      feishuVerificationToken: Boolean(config.feishuVerificationToken),
      feishuEncryptKey: Boolean(config.feishuEncryptKey),
      modelApiKey: Boolean(config.modelApiKey)
    },
    masked: {
      feishuAppSecret: maskSecret(config.feishuAppSecret),
      feishuVerificationToken: maskSecret(config.feishuVerificationToken),
      feishuEncryptKey: maskSecret(config.feishuEncryptKey),
      modelApiKey: maskSecret(config.modelApiKey)
    },
    status: getConfigStatus(config)
  };
}

function saveConfigPatch(patch) {
  const currentStored = safeReadJson(CONFIG_PATH);
  const next = { ...currentStored };
  const textFields = [
    "feishuBaseUrl",
    "feishuAppId",
    "modelBaseUrl",
    "modelName",
    "modelWireApi",
    "modelReasoningEffort",
    "portfolioPremarketTime",
    "portfolioDecisionTime",
    "portfolioReviewTime",
    "portfolioWeeklyReviewTime",
    "portfolioTimezone",
    "portfolioPushReceiveId",
    "portfolioPushReceiveType",
    "portfolioRiskProfile",
    "portfolioManagerProfile"
  ];
  const numericFields = ["modelMaxOutputTokens", "replyMaxChars", "portfolioInitialCapital", "portfolioRetentionDays"];
  const zeroableNumericFields = ["modelHttpTimeoutMs"];
  const booleanFields = ["modelResponsesStream", "portfolioEnabled", "portfolioAutoBindLastChat"];
  const secretFields = ["feishuAppSecret", "feishuVerificationToken", "feishuEncryptKey", "modelApiKey"];

  for (const field of textFields) {
    if (Object.hasOwn(patch, field)) {
      next[field] = String(patch[field] ?? "").trim();
    }
  }

  for (const field of numericFields) {
    if (Object.hasOwn(patch, field)) {
      const value = Number(patch[field]);
      if (Number.isFinite(value) && value > 0) {
        next[field] = value;
      }
    }
  }

  if (Object.hasOwn(patch, "portfolioWeeklyReviewDay")) {
    next.portfolioWeeklyReviewDay = normalizeWeekday(patch.portfolioWeeklyReviewDay, 5);
  }

  for (const field of zeroableNumericFields) {
    if (Object.hasOwn(patch, field)) {
      const value = Number(patch[field]);
      if (Number.isFinite(value) && value >= 0) {
        next[field] = value;
      }
    }
  }

  for (const field of secretFields) {
    if (Object.hasOwn(patch, field)) {
      const value = String(patch[field] ?? "");
      if (value.trim()) {
        next[field] = value.trim();
      }
    }
  }

  for (const field of booleanFields) {
    if (Object.hasOwn(patch, field)) {
      next[field] = parseBoolean(patch[field], false);
    }
  }

  next.modelWireApi = normalizeWireApi(next.modelWireApi || "responses");
  Object.assign(next, normalizeEffectiveConfig(next));
  ensureDir(path.dirname(CONFIG_PATH));
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return getEffectiveConfig();
}

function getConfigStatus(config) {
  return {
    model: Boolean(config.modelBaseUrl && config.modelName && config.modelApiKey),
    feishu: Boolean(config.feishuBaseUrl && config.feishuAppId && config.feishuAppSecret)
  };
}

function getDefaultStats() {
  return {
    startedAt: STARTED_AT.toISOString(),
    updatedAt: STARTED_AT.toISOString(),
    counters: {
      messageEvents: 0,
      duplicateEvents: 0,
      conversations: 0,
      imagesReceived: 0,
      textMessages: 0,
      noContentMessages: 0,
      downloadedImages: 0,
      routedMessages: 0,
      conversationRequests: 0,
      screeningRequests: 0,
      fundRecommendationRequests: 0,
      fundQaRequests: 0,
      portfolioStatusRequests: 0,
      intentRouterCalls: 0,
      intentRouterFailures: 0,
      extractionCalls: 0,
      extractionFailures: 0,
      extractedFundCodes: 0,
      fundEnrichmentCalls: 0,
      fundEnrichmentSuccess: 0,
      fundEnrichmentFailures: 0,
      fundFeePageFetches: 0,
      fundHoldingsFetches: 0,
      fundHoldingsFailures: 0,
      marketSnapshotCalls: 0,
      marketSnapshotFailures: 0,
      marketBoardFetches: 0,
      preciousMetalQuoteFetches: 0,
      preciousMetalFundSearches: 0,
      fundRankingFetches: 0,
      pullbackSetupDiscoveryFailures: 0,
      navHistoryFetches: 0,
      navHistoryPoints: 0,
      analystReviewCalls: 0,
      committeeVoteCalls: 0,
      managerReviewCalls: 0,
      fundAnswerQualityPasses: 0,
      fundAnswerQualityFailures: 0,
      fundAnswerQualityRewrites: 0,
      fundAnswerQualityRewritePasses: 0,
      fundAnswerQualityRewriteFailures: 0,
      fundAnswerQualityDeterministicFallbacks: 0,
      conversationModelCalls: 0,
      fundRecommendationModelCalls: 0,
      fundQaModelCalls: 0,
      modelCalls: 0,
      modelFailures: 0,
      repliesSent: 0,
      proactiveRepliesSent: 0,
      progressReplies: 0,
      answersSent: 0,
      errorReplies: 0,
      replyFailures: 0,
      portfolioRuns: 0,
      portfolioPremarketRuns: 0,
      portfolioDecisionRuns: 0,
      portfolioValuationRuns: 0,
      portfolioWeeklyRuns: 0,
      portfolioManagerModelCalls: 0,
      portfolioReviewModelCalls: 0,
      portfolioPremarketModelCalls: 0,
      portfolioWeeklyModelCalls: 0,
      portfolioTransactions: 0,
      portfolioOrdersSubmitted: 0,
      portfolioOrderUpdates: 0,
      portfolioNavVerifiedTrades: 0,
      portfolioSkippedTrades: 0,
      portfolioSettlementEvents: 0,
      portfolioEquitySnapshots: 0,
      portfolioPushes: 0,
      portfolioPushFailures: 0,
      portfolioPruneRuns: 0,
      portfolioPrunedItems: 0,
      portfolioResets: 0,
      portfolioCancelledRuns: 0,
      portfolioErrors: 0,
      errors: 0,
      modelTests: 0,
      feishuTests: 0
    },
    last: {}
  };
}

function getRuntimeStats() {
  return normalizeStats(safeReadJson(STATS_PATH));
}

function updateStats(patch = {}) {
  const stats = getRuntimeStats();
  for (const [key, value] of Object.entries(patch.counters || {})) {
    stats.counters[key] = Number(stats.counters[key] || 0) + Number(value || 0);
  }
  stats.last = { ...stats.last, ...(patch.last || {}) };
  stats.updatedAt = new Date().toISOString();
  ensureDir(path.dirname(STATS_PATH));
  fs.writeFileSync(STATS_PATH, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
  return stats;
}

function normalizeStats(value) {
  const defaults = getDefaultStats();
  return {
    ...defaults,
    ...value,
    counters: { ...defaults.counters, ...(value?.counters || {}) },
    last: { ...defaults.last, ...(value?.last || {}) }
  };
}

function recordError(error, extraCounters = {}) {
  updateStats({
    counters: { errors: 1, ...extraCounters },
    last: {
      lastErrorAt: new Date().toISOString(),
      lastError: error?.message || String(error)
    }
  });
}

function validateModelConfig(config) {
  if (!config.modelBaseUrl || !config.modelName || !config.modelApiKey) {
    throw new Error("模型配置不完整，请在管理界面填写 Base URL、模型名和 API Key。");
  }
}

function validateFeishuConfig(config) {
  if (!config.feishuBaseUrl || !config.feishuAppId || !config.feishuAppSecret) {
    throw new Error("飞书配置不完整，请在管理界面填写 App ID 和 App Secret。");
  }
}

function loadCodexDefaults() {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const configPath = process.env.CODEX_CONFIG_PATH || path.join(codexHome, "config.toml");
  const authPath = process.env.CODEX_AUTH_PATH || path.join(codexHome, "auth.json");
  const parsedConfig = parseCodexToml(safeReadText(configPath));
  const providerName = parsedConfig.root.model_provider || Object.keys(parsedConfig.modelProviders)[0] || "";
  const provider = parsedConfig.modelProviders[providerName] || {};
  const auth = safeReadJson(authPath);

  return {
    modelName: parsedConfig.root.model || "",
    modelBaseUrl: provider.base_url || "",
    modelWireApi: provider.wire_api || "",
    modelReasoningEffort: parsedConfig.root.model_reasoning_effort || "",
    modelApiKey: auth.OPENAI_API_KEY || ""
  };
}

function parseCodexToml(text) {
  const root = {};
  const modelProviders = {};
  let section = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }

    const keyValue = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!keyValue) continue;

    const key = keyValue[1];
    const value = parseTomlValue(keyValue[2]);
    const providerMatch = section.match(/^model_providers\.("?)([^"]+)\1$/);
    if (providerMatch) {
      const providerName = providerMatch[2];
      modelProviders[providerName] ||= {};
      modelProviders[providerName][key] = value;
    } else if (!section) {
      root[key] = value;
    }
  }

  return { root, modelProviders };
}

function parseTomlValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? trimmed : numeric;
}

function listSkills(includeContent) {
  if (!fs.existsSync(SKILLS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => {
      const filePath = path.join(SKILLS_DIR, entry.name);
      const content = safeReadText(filePath);
      const stat = fs.statSync(filePath);
      const meta = parseSkillMeta(content, entry.name);
      return {
        id: path.basename(entry.name, ".md"),
        name: meta.name,
        description: meta.description,
        path: path.relative(ROOT, filePath).replace(/\\/g, "/"),
        updatedAt: stat.mtime.toISOString(),
        bytes: stat.size,
        content: includeContent ? content : undefined
      };
    });
}

function parseSkillMeta(content, fileName) {
  const frontMatter = content.match(/^---\n([\s\S]*?)\n---/);
  const frontMatterValues = {};
  if (frontMatter) {
    for (const line of frontMatter[1].split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
      if (match) {
        frontMatterValues[match[1]] = match[2].trim();
      }
    }
  }

  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const paragraph = content
    .replace(/^---[\s\S]*?---/, "")
    .split(/\r?\n\r?\n/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#") && !part.startsWith("|"));

  return {
    name: frontMatterValues.name || title || path.basename(fileName, ".md"),
    description: frontMatterValues.description || paragraph || "No description"
  };
}

function decodeFeishuPayload(rawBody, config) {
  const bodyText = rawBody.toString("utf8");
  const parsed = JSON.parse(bodyText || "{}");
  if (!parsed.encrypt) {
    return parsed;
  }
  if (!config.feishuEncryptKey) {
    throw new Error("收到加密事件，但未配置 Encrypt Key。");
  }
  return JSON.parse(decryptFeishuPayload(parsed.encrypt, config.feishuEncryptKey));
}

function decryptFeishuPayload(encryptedText, encryptKey) {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const encrypted = Buffer.from(encryptedText, "base64");
  const iv = encrypted.subarray(0, 16);
  const ciphertext = encrypted.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

function maybeVerifyFeishuSignature(headers, rawBody, encryptKey) {
  const timestamp = headerValue(headers, "x-lark-request-timestamp");
  const nonce = headerValue(headers, "x-lark-request-nonce");
  const signature = headerValue(headers, "x-lark-signature");
  if (!timestamp && !nonce && !signature) {
    return;
  }
  if (!timestamp || !nonce || !signature) {
    throw new Error("缺少飞书签名请求头。");
  }

  const expected = crypto
    .createHash("sha256")
    .update(`${timestamp}${nonce}${encryptKey}${rawBody.toString("utf8")}`)
    .digest("hex");

  if (!timingSafeEqualHex(expected, signature)) {
    throw new Error("飞书事件签名校验失败。");
  }
}

function verifyFeishuToken(payload, config) {
  if (!config.feishuVerificationToken) {
    return;
  }
  const token = payload?.header?.token || payload?.token || payload?.event?.token || "";
  if (token && token !== config.feishuVerificationToken) {
    throw new Error("飞书 Verification Token 校验失败。");
  }
}

function isMessageReceiveEvent(payload) {
  const eventType = payload?.header?.event_type || payload?.event?.type || payload?.type;
  return eventType === "im.message.receive_v1";
}

function getChallenge(payload) {
  const eventType = payload?.header?.event_type || payload?.event?.type || payload?.type;
  if (eventType !== "url_verification") {
    return "";
  }
  return payload?.challenge || payload?.event?.challenge || "";
}

function extractImageKeys(value, output = []) {
  if (!value || typeof value !== "object") {
    return output;
  }
  if (typeof value.image_key === "string") {
    output.push(value.image_key);
  }
  if (typeof value.file_key === "string") {
    output.push(value.file_key);
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        extractImageKeys(item, output);
      }
    } else if (child && typeof child === "object") {
      extractImageKeys(child, output);
    }
  }
  return [...new Set(output)];
}

function extractUserText(messageType, content) {
  if (!content || typeof content !== "object") {
    return "";
  }
  if (messageType === "text" && typeof content.text === "string") {
    return cleanFeishuUserText(content.text, content);
  }
  if (typeof content.text === "string") {
    return cleanFeishuUserText(content.text, content);
  }
  if (content.title || content.content) {
    const pieces = [];
    collectText(content, pieces);
    return cleanFeishuUserText(pieces.join("\n"), content);
  }
  return "";
}

function collectText(value, pieces, key = "") {
  if (!value) return;
  if (["image_key", "file_key"].includes(key)) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) pieces.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, pieces, key);
    return;
  }
  if (typeof value === "object") {
    if (typeof value.text === "string" && value.text.trim()) pieces.push(value.text.trim());
    for (const [childKey, child] of Object.entries(value)) {
      if (child !== value.text) collectText(child, pieces, childKey);
    }
  }
}

function cleanFeishuUserText(text, content = {}) {
  let cleaned = String(text || "");
  const mentions = Array.isArray(content?.mentions) ? content.mentions : [];

  for (const mention of mentions) {
    for (const value of [mention?.key, mention?.name].filter(Boolean)) {
      cleaned = cleaned.replace(new RegExp(escapeRegExp(String(value)), "g"), " ");
      cleaned = cleaned.replace(new RegExp(`@\\s*${escapeRegExp(String(value))}`, "g"), " ");
    }
  }

  cleaned = cleaned
    .replace(/<at\b[^>]*>[\s\S]*?<\/at>/gi, " ")
    .replace(/@\s*(基金助手|基金经理)/g, " ")
    .replace(/@\s*FundAgent/gi, " ")
    .replace(/@\s*Fund\s*Agent/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

async function classifyMessageIntent({ imageKeys = [], userText = "", messageType = "" }) {
  const text = normalizeIntentText(userText);
  const fundCodes = extractFundCodes(text);
  const hasFundWord = hasAny(text, ["基金", "etf", "lof", "qdii", "指数", "主动", "混合", "股票型", "债基", "债券", "纯债", "短债", "货币"]);
  const asksRecommendation =
    hasAny(text, ["推荐", "筛选", "筛一下", "帮我筛", "找一个", "找一只", "找几个", "几个基金", "哪些基金", "买什么", "投什么", "配什么", "配置", "候选", "清单", "名单", "标的", "机会", "有没有", "有无", "回调完成", "准备启动", "准备向上", "准备走强", "低位启动", "低位修复", "不要追涨"]) ||
    (hasAny(text, ["最近", "最新", "当前", "现在", "市场", "行情", "题材", "热点", "板块", "赛道", "机会"]) &&
      hasAny(text, ["基金", "etf", "配置", "推荐", "候选", "清单"]));
  const asksCompare = hasAny(text, ["对比", "比较", "哪个好", "哪个更好", "哪只好", "哪只更好", "哪一个好", "选哪", "挑一个", "二选一", "三选一", "排名", "pk"]);
  const asksSpecificAction = hasAny(text, [
    "这只基金",
    "这个基金",
    "该基金",
    "基金代码",
    "值得买吗",
    "适合买吗",
    "还能买吗",
    "能买吗",
    "能不能买",
    "买不买",
    "要不要买",
    "要不要卖",
    "持有",
    "卖出",
    "买入",
    "加仓",
    "减仓",
    "定投",
    "仓位",
    "评分",
    "评价",
    "怎么样",
    "分析一下"
  ]);

  if (imageKeys.length) {
    return {
      workflow: "fund_screening",
      mode: "screenshot_or_mixed",
      reason: "message_contains_image",
      fundCodes,
      skillIds: ["fund-vision", ...getFundAnalysisSkillIds(["fund-comparison", "fund-synthesis"])],
      messageType
    };
  }

  if (!text) {
    return {
      workflow: "conversation",
      mode: "empty_text",
      reason: "no_text_after_parsing",
      fundCodes,
      skillIds: [],
      messageType
    };
  }

  if (looksLikePortfolioStatusQuestion(text)) {
    return {
      workflow: "portfolio_status",
      mode: "virtual_portfolio_status",
      reason: "hard_rule_virtual_manager_account_query",
      fundCodes,
      skillIds: [],
      messageType
    };
  }

  if (fundCodes.length) {
    const specificPullbackSetup = isPullbackSetupRequest(text);
    return {
      workflow: "fund_screening",
      mode: specificPullbackSetup
        ? "specific_pullback_setup_assessment"
        : fundCodes.length > 1 ? "comparison_or_specific_fund" : "specific_fund_or_fund_name",
      reason: specificPullbackSetup ? "text_contains_fund_code_pullback_setup_request" : "text_contains_fund_code",
      fundCodes,
      skillIds: getFundAnalysisSkillIds(specificPullbackSetup ? ["fund-market-timing", "fund-synthesis"] : ["fund-comparison", "fund-synthesis"]),
      messageType
    };
  }

  if (isPullbackSetupRequest(text) && (hasFundWord || asksRecommendation || isPullbackSetupDiscoveryAsk(text))) {
    return {
      workflow: "fund_recommendation",
      mode: "pullback_setup_discovery",
      reason: "hard_rule_pullback_setup_request",
      fundCodes,
      skillIds: getFundRecommendationSkillIds(),
      messageType
    };
  }

  if (!fundCodes.length && asksRecommendation) {
    return {
      workflow: "fund_recommendation",
      mode: "market_theme_discovery",
      reason: "hard_rule_text_requests_recommendations_without_specific_fund",
      fundCodes,
      skillIds: getFundRecommendationSkillIds(),
      messageType
    };
  }

  if (hasFundWord && (asksSpecificAction || asksCompare)) {
    return {
      workflow: "fund_screening",
      mode: asksCompare ? "comparison_or_specific_fund" : "specific_fund_or_fund_name",
      reason: "hard_rule_text_mentions_specific_fund_action",
      fundCodes,
      skillIds: getFundAnalysisSkillIds(asksCompare ? ["fund-comparison", "fund-synthesis"] : ["fund-synthesis"]),
      messageType
    };
  }

  if (looksLikeConversation(text)) {
    return {
      workflow: "conversation",
      mode: "plain_conversation",
      reason: "hard_rule_plain_conversation",
      fundCodes,
      skillIds: [],
      messageType
    };
  }

  if (shouldFetchMarketSnapshotForQuestion(text) && isActionSeekingFundQuestion(text)) {
    return {
      workflow: "fund_qa",
      mode: "market_question",
      reason: "hard_rule_market_action_question",
      fundCodes,
      skillIds: getFundQaSkillIds(),
      messageType
    };
  }

  const modelIntent = await classifyTextIntentWithModel({ userText, messageType }).catch((error) => {
    console.error("[intent-router-error]", error);
    recordError(error, { intentRouterFailures: 1 });
    return null;
  });
  if (modelIntent?.workflow) {
    return normalizeIntentResult(modelIntent, { fundCodes, messageType, source: "model_router" });
  }

  if (!fundCodes.length && asksRecommendation) {
    return {
      workflow: "fund_recommendation",
      mode: "market_theme_discovery",
      reason: "fallback_text_requests_recommendations_without_specific_fund",
      fundCodes,
      skillIds: getFundRecommendationSkillIds(),
      messageType
    };
  }

  if (fundCodes.length || (hasFundWord && (asksSpecificAction || asksCompare))) {
    return {
      workflow: "fund_screening",
      mode: asksCompare || fundCodes.length > 1 ? "comparison_or_specific_fund" : "specific_fund_or_fund_name",
      reason: "fallback_text_mentions_specific_fund_action",
      fundCodes,
      skillIds: getFundAnalysisSkillIds(asksCompare ? ["fund-comparison", "fund-synthesis"] : ["fund-synthesis"]),
      messageType
    };
  }

  return {
    workflow: looksLikeConversation(text) ? "conversation" : "fund_qa",
    mode: shouldFetchMarketSnapshotForQuestion(text) ? "market_question" : "general_fund_question",
    reason: "fallback_no_image_no_specific_fund_recommendation",
    fundCodes,
    skillIds: looksLikeConversation(text) ? [] : getFundQaSkillIds(),
    messageType
  };
}

async function classifyTextIntentWithModel({ userText, messageType }) {
  const skills = listSkills(false).map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description
  }));
  const systemText = [
    "你是基金经理的意图路由器。只返回 JSON，不要解释。",
    "你的任务是先理解用户想做什么，再选择工作流和需要加载的 skill。",
    "不要因为机器人名称叫基金经理，就把自我介绍、寒暄、能力询问、普通聊天强行归类到基金工作流。",
    "可选 workflow：",
    "- conversation：自我介绍、能做什么、寒暄、帮助、普通非基金对话。",
    "- portfolio_status：用户询问机器人/虚拟基金经理自己的仓位、持仓、自选基金池、候选池、今日操作、买卖、现金、盈亏、账户或虚拟组合。",
    "- fund_recommendation：用户让你推荐几个基金、按最近题材/市场/热点找基金、给配置清单。",
    "- fund_screening：用户提供具体基金名称/代码、问某只基金能买吗/要不要卖/评分/对比。",
    "- fund_qa：基金知识、市场题材解释、投资方法问题，但没有要求给候选基金清单。",
    "如果要加载技能，只能从 availableSkills 里选择 id。"
  ].join("\n");
  const userPrompt = [
    `messageType: ${messageType || "unknown"}`,
    `userText: ${userText || ""}`,
    "",
    "availableSkills:",
    JSON.stringify(skills, null, 2),
    "",
    "返回 JSON：",
    '{"workflow":"conversation|portfolio_status|fund_recommendation|fund_screening|fund_qa","mode":"short label","reason":"brief reason","skillIds":["fund-recommendation"],"confidence":0.0}'
  ].join("\n");

  const raw = await callModel({ systemText, userPrompt, images: [], maxTokens: 500 });
  updateStats({
    counters: { intentRouterCalls: 1 },
    last: { lastIntentRouterAt: new Date().toISOString() }
  });
  return parseJsonFromModel(raw);
}

function normalizeIntentResult(intent, defaults = {}) {
  const validWorkflows = new Set(["conversation", "portfolio_status", "fund_recommendation", "fund_screening", "fund_qa"]);
  const workflow = validWorkflows.has(String(intent.workflow || "")) ? String(intent.workflow) : "fund_qa";
  const availableSkillIds = new Set(allowedSkillIdsForWorkflow(workflow).filter((id) =>
    listSkills(false).some((skill) => skill.id === id)
  ));
  let skillIds = Array.isArray(intent.skillIds)
    ? intent.skillIds.map(String).filter((id) => availableSkillIds.has(id))
    : [];
  if (!skillIds.length) {
    skillIds = defaultSkillIdsForWorkflow(workflow).filter((id) => availableSkillIds.has(id));
  }

  return {
    workflow,
    mode: String(intent.mode || defaults.mode || workflow),
    reason: String(intent.reason || defaults.reason || defaults.source || "model_router"),
    fundCodes: mergeFundCodes(defaults.fundCodes || [], intent.fundCodes || []),
    skillIds: workflow === "conversation" ? [] : skillIds,
    confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : null,
    source: defaults.source || "router",
    messageType: defaults.messageType || ""
  };
}

function defaultSkillIdsForWorkflow(workflow) {
  if (workflow === "portfolio_status") return [];
  if (workflow === "fund_recommendation") return getFundRecommendationSkillIds();
  if (workflow === "fund_screening") return getFundAnalysisSkillIds(["fund-synthesis"]);
  if (workflow === "fund_qa") return getFundQaSkillIds();
  return [];
}

function allowedSkillIdsForWorkflow(workflow) {
  const byWorkflow = {
    conversation: [],
    portfolio_status: [],
    fund_recommendation: [...getFundRecommendationSkillIds(), "fund-data-enrichment"],
    fund_screening: [
      "fund-vision",
      ...getFundAnalysisSkillIds(["fund-comparison", "fund-synthesis"]),
      "fund-screening"
    ],
    fund_qa: ["fund-data-enrichment", ...getFundQaSkillIds()]
  };
  return byWorkflow[workflow] || [];
}

function recordWorkflowIntent(intent) {
  const counters = { routedMessages: 1 };
  if (intent.workflow === "conversation") counters.conversationRequests = 1;
  if (intent.workflow === "fund_screening") counters.screeningRequests = 1;
  if (intent.workflow === "fund_recommendation") counters.fundRecommendationRequests = 1;
  if (intent.workflow === "fund_qa") counters.fundQaRequests = 1;
  if (intent.workflow === "portfolio_status") counters.portfolioStatusRequests = 1;
  updateStats({
    counters,
    last: {
      lastWorkflow: intent.workflow,
      lastWorkflowMode: intent.mode,
      lastWorkflowReason: intent.reason
    }
  });
}

function shouldFetchMarketSnapshotForQuestion(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, [
    "最近",
    "最新",
    "当前",
    "现在",
    "市场",
    "行情",
    "题材",
    "热点",
    "板块",
    "赛道",
    "机会",
    "黄金",
    "金价",
    "贵金属",
    "白银",
    "沪金",
    "沪银",
    "comex",
    "美元指数",
    "避险"
  ]);
}

function detectComparisonNeed({ userText = "", extracted = {}, enrichments = [] }) {
  const text = normalizeIntentText(userText);
  const explicitCompare = hasAny(text, ["对比", "比较", "哪个更好", "哪只更好", "选哪", "挑一个", "二选一", "三选一", "排名", "pk"]);
  const codeCount = mergeFundCodes(
    extractFundCodes(text),
    extracted?.fundCodes || [],
    Array.isArray(enrichments) ? enrichments.map((item) => item?.code) : []
  ).length;
  const extractedFundCount = Array.isArray(extracted?.funds) ? extracted.funds.length : 0;
  return explicitCompare || codeCount > 1 || extractedFundCount > 1;
}

function looksLikeConversation(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, [
    "你是谁",
    "自我介绍",
    "介绍一下你",
    "你能做什么",
    "有什么功能",
    "怎么使用",
    "帮助",
    "help",
    "你好",
    "hello",
    "hi",
    "谢谢",
    "thanks"
  ]);
}

function looksLikePortfolioStatusQuestion(text) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  const explicitPortfolioTerms = [
    "虚拟组合",
    "虚拟基金经理",
    "你的组合",
    "你的账户",
    "你的账本",
    "你的仓位",
    "你现在的仓位",
    "你现在仓位",
    "你的持仓",
    "你的自选",
    "你的自选基金",
    "你的候选池",
    "你的观察池",
    "自选基金池",
    "自选基金",
    "候选基金池",
    "候选池",
    "观察池",
    "观察名单",
    "备选基金",
    "备选理由",
    "待买基金",
    "准备购入",
    "买入候选",
    "你现在持仓",
    "当前仓位",
    "现在仓位",
    "目前仓位",
    "仓位多少",
    "仓位是",
    "当前持仓",
    "现在持仓",
    "持仓情况",
    "持仓状态",
    "今天操作",
    "今日操作",
    "你今天的操作",
    "你今天怎么操作",
    "你今天是怎么操作",
    "今天你怎么操作",
    "今天你买",
    "今天你卖",
    "你买了什么",
    "你卖了什么",
    "你现在买了",
    "你现在卖了",
    "什么时候汇报",
    "几点汇报",
    "自动汇报",
    "定时汇报",
    "汇报手法",
    "盘前观察",
    "周计划",
    "周总结",
    "你的画像",
    "人物画像",
    "你的性格",
    "购买习惯",
    "投资习惯",
    "买入习惯",
    "卖出习惯",
    "投资纪律"
  ];
  if (hasAny(normalized, explicitPortfolioTerms)) return true;

  const refersToAssistant =
    /(^|[，。！？\s])你/.test(normalized) ||
    hasAny(normalized, ["助手", "经理", "基金经理", "机器人"]);
  const asksAccountState = hasAny(normalized, [
    "仓位",
    "持仓",
    "自选",
    "候选池",
    "观察池",
    "备选",
    "待买",
    "准备购入",
    "总资产",
    "现金",
    "盈亏",
    "收益",
    "亏损",
    "账户",
    "账本",
    "本金",
    "操作",
    "买入",
    "卖出",
    "交易",
    "复盘",
    "汇报",
    "定时",
    "几点",
    "什么时候",
    "手法",
    "画像",
    "性格",
    "习惯",
    "纪律",
    "风格",
    "盘前",
    "周计划",
    "周总结"
  ]);

  return refersToAssistant && asksAccountState;
}

function isPortfolioOperationQuestion(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, ["操作", "买入", "卖出", "买了", "卖了", "交易", "今天", "今日", "复盘"]);
}

function isPortfolioPositionQuestion(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, ["仓位", "持仓", "总资产", "现金", "盈亏", "收益", "亏损", "账户", "组合", "本金"]);
}

function isPortfolioWatchlistQuestion(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, ["自选", "自选基金", "候选池", "观察池", "观察名单", "备选", "备选基金", "备选理由", "待买", "准备购入", "买入候选"]);
}

function isPortfolioScheduleQuestion(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, ["什么时候", "几点", "定时", "自动", "汇报", "盘前", "决策时间", "复盘时间", "周计划", "周总结"]);
}

function isPortfolioProfileQuestion(text) {
  const normalized = normalizeIntentText(text);
  return hasAny(normalized, ["画像", "性格", "风格", "习惯", "偏好", "纪律", "手法", "买入习惯", "卖出习惯", "购买习惯"]);
}

function normalizeIntentText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function buildSkillContextForIntent(intent, fallbackSkillIds = [], options = {}) {
  const requestedIds = Array.isArray(intent?.skillIds) ? intent.skillIds : [];
  const ids = [...new Set([...requestedIds, ...fallbackSkillIds].map(String).filter(Boolean))];
  const skillById = new Map(listSkills(true).map((skill) => [skill.id, skill]));
  const skills = ids.map((id) => skillById.get(id)).filter(Boolean);
  const focusDirective = buildSkillFocusDirective({ ...intent, userText: options.userText || intent?.userText || "" }, skills);
  if (!skills.length) {
    return [focusDirective, "本工作流没有加载额外 skill。"].filter(Boolean).join("\n");
  }

  return [
    focusDirective,
    `已按优先级加载 ${skills.length} 个 skills：${skills.map((skill) => skill.id).join(" / ")}`,
    "本工作流按需加载以下 skills。只在用户意图需要时使用，不要把 skill 模板强行套到无关对话：",
    ...skills.map((skill) => [`# Skill: ${skill.id}`, skill.content].join("\n"))
  ].filter(Boolean).join("\n\n");
}

function buildSkillFocusDirective(intent = {}, skills = []) {
  const workflow = String(intent.workflow || "");
  const mode = String(intent.mode || "");
  const userText = String(intent.userText || "");
  const skillList = (skills || []).map((skill) => skill.id).filter(Boolean).join(" / ");
  const lines = [
    "Skill 使用纪律：先执行本次任务焦点，再引用相关 skill；如果多个 skill 表述有冲突，以用户需求、已验证数据和质量门槛为准。",
    skillList ? `本次 skill 顺序：${skillList}` : ""
  ];

  if (workflow === "fund_recommendation" && (mode === "pullback_setup_discovery" || isPullbackSetupRequest(userText))) {
    lines.push(
      "本次任务焦点：回调完成/低位启动，不追热点。",
      "判断顺序：先看 5日/10日是否刚转强、120日区间位置是否偏低、20日/60日是否不过热，再看题材催化和基金质量。",
      "推荐纪律：主推荐只能来自合格的回调/启动候选；短期大涨、等待回撤、只适合观察的基金只能进观察/排除，1万元执行中必须是0元或等待条件。",
      "如果没有合格主候选，要明确说暂未筛到，不要用黄金、贵金属或其他热门基金硬凑。"
    );
  } else if (workflow === "fund_recommendation") {
    lines.push(
      "本次任务焦点：给候选清单时先判断题材阶段、板块轮动、低位程度和拥挤度，再选择基金承载工具。",
      "不要把新闻热度或近期涨幅当成买入理由；推荐必须同时交代份额类别、费用模型、仓位和复查边界。"
    );
  } else if (workflow === "fund_screening") {
    const normalized = normalizeIntentText(userText);
    lines.push(
      "本次任务焦点：评价用户给出的具体基金，必须分开基金长期质量、当前买点、份额费用和适合对象。",
      "不要把基金质量好直接等同于现在可以买；A/C/D/I 等份额类别要按预计持有期解释。"
    );
    if (mode === "specific_pullback_setup_assessment" || isPullbackSetupRequest(userText)) {
      lines.push(
        "本次任务焦点：具体基金的回调完成/低位启动评估，不追热点。",
        "判断顺序：先看 5日/10日是否刚转强、120日区间位置是否偏低、20日/60日是否不过热，再看基金质量、风险、费用和适合对象。",
        "回答纪律：必须明确这只基金是否符合“回调完成、低位、准备启动”；如果不符合，要说等待什么条件，不要给买入金额。"
      );
    }
    if (/(货币|余额宝|现金管理|零钱)/.test(normalized)) {
      lines.push(
        "产品类型焦点：货币基金按现金管理评估，优先看7日年化、万份收益、流动性、规模和收益稳定性。",
        "不要套用权益基金追涨/回调/启动框架，也不要把货币基金当进攻仓推荐。"
      );
    } else if (/(债券|债基|短债|中短债|纯债|固收)/.test(normalized)) {
      lines.push(
        "产品类型焦点：债基按久期、信用风险、利率环境、历史回撤和赎回流动性评估。",
        "不要只看近短期收益；短债/纯债更重视波动和回撤控制。"
      );
    } else if (/(qdii|纳斯达克|标普|美股|港股|恒生|印度|越南|海外)/.test(normalized)) {
      lines.push(
        "产品类型焦点：QDII/海外基金要额外检查海外市场估值、汇率、净值披露时差、申赎确认延迟和场内溢价折价。",
        "不能把滞后的净值当实时买点，也不能忽略人民币汇率风险。"
      );
    }
    if (/(对比|比较|哪个好|哪个更好|哪只好|选哪|a类|c类|份额|申购费|销售服务费)/i.test(normalized)) {
      lines.push(
        "对比焦点：同一基金 A/C 等份额先比较费用和预计持有期，再比较代码；同一指数/主题产品要比较跟踪误差、规模、费率和流动性。"
      );
    }
  } else if (workflow === "fund_qa") {
    lines.push(
      "本次任务焦点：直接回答问题，不套推荐清单模板；如果问题带有买卖意图，要给出买入、分批买入、等待或回避的中文动作和理由。",
      "市场或题材问题要先看阶段、拥挤度和低位/回撤修复，再谈相关基金。"
    );
  } else if (workflow === "portfolio_status") {
    lines.push(
      "本次任务焦点：解释虚拟组合操作和复盘，不把组合任务扩写成普通基金推荐；所有动作必须有数据来源、纪律检查和风险边界。"
    );
  }

  return lines.filter(Boolean).join("\n");
}

function extractFundCodes(text) {
  const codes = String(text || "").match(/(?<!\d)(\d{6})(?!\d)/g) || [];
  return mergeFundCodes(codes);
}

function mergeFundCodes(...groups) {
  const codes = [];
  for (const group of groups.flat()) {
    const code = String(group || "").trim();
    if (/^\d{6}$/.test(code) && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}

function buildProgressMessage(imageCount, userText) {
  const parts = ["已收到，开始处理。"];
  if (imageCount) parts.push(`图片 ${imageCount} 张`);
  if (userText) parts.push("包含文字说明");
  parts.push(
    imageCount
      ? "我会先识别截图，再联网补全基金资料，最后按投研委员会流程给出评价。"
      : "我会先识别基金代码/名称，再联网补全基金资料，最后按投研委员会流程给出评价。"
  );
  return parts.join("\n");
}

function buildCompletionPrefix(imageCount, userText) {
  const facts = [];
  if (imageCount) facts.push(`已处理图片 ${imageCount} 张`);
  if (userText) facts.push("已结合你的文字说明");
  return facts.length ? `处理完成：${facts.join("，")}。` : "";
}

function parseJsonFromModel(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("模型没有返回可解析 JSON。");
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function modelUrl(config, endpoint) {
  const base = config.modelBaseUrl.endsWith("/") ? config.modelBaseUrl : `${config.modelBaseUrl}/`;
  return new URL(endpoint, base);
}

function extractResponsesText(json) {
  if (typeof json?.output_text === "string") {
    return json.output_text.trim();
  }

  const parts = [];
  for (const output of json?.output || []) {
    for (const content of output?.content || []) {
      if (typeof content?.text === "string") {
        parts.push(content.text);
      } else if (typeof content?.output_text === "string") {
        parts.push(content.output_text);
      }
    }
  }
  return parts.join("\n").trim();
}

function normalizeFeishuText(text) {
  const config = getEffectiveConfig();
  const cleaned = stripMarkdownForFeishu(String(text || "")).trim();
  const maxLength = Number(config.replyMaxChars || DEFAULT_REPLY_MAX_CHARS);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 80)}\n\n（回复过长，已截断。可继续发送“详细分析”并附基金名称/代码。）`;
}

function normalizeFeishuCardMarkdown(text, kind) {
  const config = getEffectiveConfig();
  const maxLength = Number(config.replyMaxChars || DEFAULT_REPLY_MAX_CHARS);
  let cleaned = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[a-zA-Z0-9_-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, "**$1**")
    .replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (kind === "progress") {
    cleaned = `⏳ ${cleaned}`;
  } else if (kind === "error") {
    cleaned = `请稍后重试，或补充基金代码/名称。\n\n${cleaned}`;
  } else if (kind === "noContent") {
    cleaned = `可以发送一张或多张基金截图，也可以附上文字说明。\n\n${cleaned}`;
  }

  if (cleaned.length > maxLength) {
    cleaned = `${cleaned.slice(0, maxLength - 80)}\n\n（回复过长，已截断。可继续发送“详细分析”并附基金名称/代码。）`;
  }

  return cleaned || "已收到。";
}

function stripMarkdownForFeishu(value) {
  let text = String(value || "").replace(/\r\n/g, "\n");
  text = text
    .replace(/```[a-zA-Z0-9_-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1（$2）")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1");

  const lines = [];
  for (const rawLine of text.split("\n")) {
    let line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      lines.push("");
      continue;
    }
    if (/^[-*_]{3,}$/.test(trimmed)) {
      continue;
    }
    if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) {
      continue;
    }
    line = line
      .replace(/^\s{0,3}#{1,6}\s*/, "")
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^\s*[-*+]\s+/, "• ")
      .replace(/^\s*\[\s\]\s+/, "□ ")
      .replace(/^\s*\[x\]\s+/i, "☑ ")
      .replace(/\s*\|\s*/g, "  ");
    lines.push(line.trimEnd());
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function normalizeWireApi(value) {
  const wireApi = String(value || "responses").toLowerCase().replace("-", "_");
  if (wireApi === "chat" || wireApi === "chat_completions") {
    return "chat_completions";
  }
  return "responses";
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!effort || effort === "none") return "";
  if (["xhigh", "extra_high", "extra"].includes(effort)) return "xhigh";
  if (["minimal", "low", "medium", "high"].includes(effort)) return effort;
  return "high";
}

function normalizeClockTime(value, fallback) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeWeekday(value, fallback = 5) {
  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number <= 6) return number;
  return fallback;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled", "启用"].includes(text)) return true;
  if (["0", "false", "no", "off", "disabled", "停用"].includes(text)) return false;
  return fallback;
}

function wasSeenRecently(eventId) {
  const now = Date.now();
  for (const [id, expiresAt] of seenEventIds) {
    if (expiresAt <= now) seenEventIds.delete(id);
  }
  if (seenEventIds.has(eventId)) {
    return true;
  }
  seenEventIds.set(eventId, now + 10 * 60 * 1000);
  return false;
}

function isAdminAuthorized(req, url) {
  if (!ADMIN_TOKEN) {
    return true;
  }
  const token = headerValue(req.headers, "x-admin-token") || url.searchParams.get("token") || "";
  return timingSafeEqualString(token, ADMIN_TOKEN);
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 10) return "已配置";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonBody(req) {
  return readRequestBody(req).then((buffer) => JSON.parse(buffer.toString("utf8") || "{}"));
}

function readRequestBody(req) {
  const maxBytes = Number(process.env.MAX_EVENT_BODY_BYTES || 1_048_576);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body too large: ${total} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function serveStaticFile(res, filePath) {
  const resolved = path.resolve(filePath);
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    sendJson(res, 404, { ok: false, error: "static_not_found" });
    return;
  }
  const contentType = getContentType(resolved);
  const body = fs.readFileSync(resolved);
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length
  });
  res.end(body);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, value) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(value)
  });
  res.end(value);
}

function headerValue(headers, name) {
  return headers[name] || headers[name.toLowerCase()] || "";
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export {
  allowedSkillIdsForWorkflow,
  appendFundReportChartReadingGuide,
  buildFundActionabilitySignals,
  buildHoldingsOutlookProfile,
  buildSkillContextForIntent,
  buildMarketDeepDiveSummary,
  buildPortfolioHeldPositionReviewActions,
  buildPortfolioHeldPositionReviewQueue,
  buildPortfolioDecisionReadinessQueue,
  buildPortfolioAccountRiskBudget,
  buildPortfolioReadyWatchlistReviewActions,
  buildPortfolioPositionRiskBudget,
  buildPortfolioRiskBudgetActions,
  buildPortfolioWatchReadinessGaps,
  buildPortfolioWatchlistRecheckUpdates,
  buildPortfolioWatchlistStatusLines,
  buildPortfolioWatchlistLaunchEveLines,
  buildPortfolioWatchlistUpdatesFromAnswerProfiles,
  buildPullbackQualityFallbackAnswer,
  buildFundWorkflowWatchlistSummary,
  classifyMessageIntent,
  computeTrendProfile,
  defaultSkillIdsForWorkflow,
  enforceFundAnswerQuality,
  enforcePortfolioBuyDiscipline,
  enforcePortfolioRiskBudget,
  enforcePortfolioSellDiscipline,
  evaluatePortfolioBuyDiscipline,
  evaluatePortfolioSellDiscipline,
  evaluatePortfolioWatchReadiness,
  evaluatePortfolioWatchlistFreshness,
  evaluateFundAnswerQuality,
  filterFocusedPullbackRankingCandidates,
  getFeishuCardImageChunkSize,
  getFundReportChartLimit,
  getFundReportChartMinCount,
  getPortfolioTrendImageLimit,
  getFundAnalysisSkillIds,
  getFundQaSkillIds,
  getFundRecommendationSkillIds,
  guardPortfolioWatchlistReadyUpdate,
  ensurePortfolioHeldPositionsReviewed,
  ensurePortfolioReadyWatchlistReviewed,
  mergeFundWorkflowWatchlistIntoDeepDive,
  inferPullbackSetupSearchKeywords,
  isGenericPullbackSetupRequest,
  isPullbackSetupRequest,
  mergeCandidateFunds,
  normalizeUserFacingFundAnswer,
  normalizePortfolioDb,
  normalizePortfolioWatchlist,
  normalizePortfolioWatchlistUpdates,
  renderFundReportSummaryPng,
  capPortfolioSellAmountByDiscipline,
  resolvePortfolioTradeAmount,
  buildPortfolioWatchlistUpdatesFromSeedCandidates,
  getFundReportChartBackfillTarget,
  selectFundReportChartBackfillCandidates,
  selectPullbackBackfillCandidates,
  selectFundReportProfilesForAnswer,
  selectFundScreeningWatchlistProfiles,
  selectFundWorkflowStaleWatchlistRefreshCandidates,
  collectTrendSnapshotsForRun,
  selectLowBaseTurnRankCandidates,
  selectPortfolioWatchlistSeedCandidates,
  selectFundWorkflowWatchlistCandidates,
  selectWeeklyReversalRankCandidates,
  summarizePortfolioWatchItem,
  scorePullbackSetupSeedCandidate,
  scoreResearchDigestForPullbackSetup,
  splitFeishuCardImages
};
