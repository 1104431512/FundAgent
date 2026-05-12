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
const PUBLIC_DATA_TIMEOUT_MS = Number(process.env.PUBLIC_DATA_TIMEOUT_MS || 20000);
const DEFAULT_PORTFOLIO_MANAGER_PROFILE = [
  "定位：教育性虚拟基金经理，不进行真实交易；先保护本金，再在证据明确时参与基金主题轮动。",
  "买入纪律：优先选择净值、持仓、风险指标和数据来源可验证的基金；避免仅凭热点重仓追涨。",
  "卖出纪律：当主题证据减弱、目标仓位下降、回撤超出风格承受范围，或复盘发现原假设失效时减仓。",
  "沟通纪律：只展示专业阶段、结论、证据和约束，不展示模型隐藏思考链。"
].join("\n");
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

server.listen(PORT, HOST, () => {
  console.log(`Feishu Fund Manager listening on http://${HOST}:${PORT}`);
  console.log(`Admin UI: http://127.0.0.1:${PORT}/admin`);
  startPortfolioScheduler();
});

let eventLoopLagExpectedAt = Date.now() + 5000;
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
    const reportImagesPromise = buildFundReportCardImages(enrichments, getEffectiveConfig()).catch((error) => {
      console.error("[fund-report-trend-image-error]", error);
      recordError(error, { fundReportTrendImageFailures: 1 });
      return [];
    });

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
    await replyToMessage(
      message.message_id,
      [buildCompletionPrefix(images.length, userText), analysis].filter(Boolean).join("\n\n"),
      { kind: "answer", images: await reportImagesPromise }
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
  await replyToMessage(message.message_id, answer, { kind: "portfolio" });
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
  markPortfolioRunProgress(db, run, "正在补全当前持仓基金资料。");
  await yieldToEventLoop();
  const heldCodes = db.account.positions.map((position) => position.code).filter(Boolean);
  const heldProfiles = heldCodes.length ? await enrichFunds(heldCodes) : [];
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, `资料已准备，模型正在以 ${config.modelReasoningEffort || "high"} 深度生成今日操作。`);
  await yieldToEventLoop();
  const raw = await buildPortfolioDecisionWithModel({
    account: accountBefore,
    marketSnapshot,
    heldProfiles,
    config,
    profileContext
  });
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "模型已返回，正在解析投委会决策。");
  await yieldToEventLoop();
  const decision = normalizePortfolioDecision(raw);
  markPortfolioRunProgress(db, run, `已解析 ${decision.actions.length} 条动作，正在补全拟交易基金净值。`);
  await yieldToEventLoop();
  const profileCodes = decision.actions.map((action) => action.code).filter(Boolean);
  const actionProfiles = profileCodes.length ? await enrichFunds(profileCodes) : [];
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, "正在校验交易规则并生成虚拟订单。");
  await yieldToEventLoop();
  const execution = await submitPortfolioOrders(db, decision.actions, actionProfiles, run, config);
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
  run.orders = execution.orders;
  run.transactions = transactions;
  run.executionNotes = [...lifecycleBefore.notes, ...execution.notes];
  run.settlementEvents = lifecycleBefore.settlementEvents;
  run.sources = collectPortfolioSources(marketSnapshot, heldProfiles, actionProfiles, decision);
  run.rawModelOutput = decision.rawModelOutput;
  run.card = buildPortfolioDecisionCard({
    decision,
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
    dayPnl,
    cumulativePnl: db.account.cumulativePnl,
    cumulativePnlPct: db.account.cumulativePnlPct,
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
  markPortfolioRunProgress(db, run, "正在补全盘前持仓观察资料。");
  await yieldToEventLoop();
  const codes = db.account.positions.map((position) => position.code).filter(Boolean);
  const profiles = codes.length ? await enrichFunds(codes) : [];
  const activeOrders = (db.orders || []).filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status));
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, `盘前资料已准备，模型正在以 ${config.modelReasoningEffort || "high"} 深度生成观察清单。`);
  await yieldToEventLoop();
  const raw = await buildPortfolioPremarketWithModel({
    account,
    marketSnapshot,
    profiles,
    activeOrders,
    lifecycle,
    config,
    profileContext
  });
  assertPortfolioRunActive(run);
  const observation = normalizePortfolioPremarket(raw);
  markPortfolioRunProgress(db, run, "盘前观察已生成，正在保存任务结果。");

  run.title = "盘前观察";
  run.summary = observation.summary;
  run.accountAfter = summarizePortfolioAccount(db.account);
  run.observation = observation;
  run.orderUpdates = lifecycle.orderUpdates;
  run.transactions = lifecycle.transactions;
  run.settlementEvents = lifecycle.settlementEvents;
  run.executionNotes = lifecycle.notes;
  run.sources = collectPortfolioSources(marketSnapshot, profiles, observation);
  run.rawModelOutput = observation.rawModelOutput;
  run.card = buildPortfolioPremarketCard({
    observation,
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
  markPortfolioRunProgress(db, run, "正在补全周总结所需持仓资料。");
  await yieldToEventLoop();
  const codes = mergeFundCodes(
    db.account.positions.map((position) => position.code),
    weeklyContext.transactions.map((item) => item.code),
    weeklyContext.orders.map((item) => item.code)
  );
  const profiles = codes.length ? await enrichFunds(codes) : [];
  assertPortfolioRunActive(run);
  markPortfolioRunProgress(db, run, `周度资料已准备，模型正在以 ${config.modelReasoningEffort || "high"} 深度总结。`);
  await yieldToEventLoop();
  const raw = await buildPortfolioWeeklyWithModel({
    account: summarizePortfolioAccount(db.account),
    weeklyContext,
    profiles,
    lifecycle,
    config,
    profileContext
  });
  assertPortfolioRunActive(run);
  const weekly = normalizePortfolioWeekly(raw);
  markPortfolioRunProgress(db, run, "周总结已生成，正在保存任务结果。");

  run.title = "周计划与总结";
  run.summary = weekly.summary;
  run.accountAfter = summarizePortfolioAccount(db.account);
  run.weeklyContext = weeklyContext;
  run.weekly = weekly;
  run.orderUpdates = lifecycle.orderUpdates;
  run.transactions = weeklyContext.transactions;
  run.settlementEvents = lifecycle.settlementEvents;
  run.executionNotes = lifecycle.notes;
  run.sources = collectPortfolioSources(profiles, weekly);
  run.rawModelOutput = weekly.rawModelOutput;
  run.card = buildPortfolioWeeklyCard({ weekly, weeklyContext, account: db.account, run });

  updateStats({
    counters: {
      portfolioOrderUpdates: lifecycle.updatedOrders,
      portfolioWeeklyModelCalls: 1
    },
    last: { lastPortfolioWeeklyAt: new Date().toISOString() }
  });
}

async function buildPortfolioDecisionWithModel({ account, marketSnapshot, heldProfiles, config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { skillIds: ["fund-portfolio-profile", "fund-portfolio-research", "fund-portfolio-decision", "fund-portfolio-execution"] },
    []
  );
  const systemText = [
    "你是飞书机器人“基金经理”的虚拟基金经理。你每天管理一个教育性虚拟组合，不进行真实交易。",
    "你的目标不是永远保守，而是在证据足够时敢于出击；但每次动作都必须写清数据来源、风险控制和复盘条件。",
    "你有一个投委会：市场分析师、题材分析师、基金研究员、组合经理、风控经理、主席。每个角色必须贡献可保存的观点。",
    "只能基于传入的公开市场快照、基金候选池和当前持仓做判断；不要编造快照中不存在的基金代码、涨跌幅或排名。",
    "同一基金不同份额类别不能混着推荐；必须比较 A/C/D/I 等份额的申购费、销售服务费、赎回费、起购门槛和渠道可得性。",
    "交易建议应以 targetWeightPct 为主，amount 只是建议值；系统执行时会按公开净值、现金和已有持仓重新计算真实份额。",
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
            riskControl: "止损、复查或减仓触发条件"
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
    maxTokens: Math.min(Number(config.modelMaxOutputTokens || 2800), 3600)
  });
  updateStats({
    counters: { portfolioManagerModelCalls: 1 },
    last: { lastPortfolioManagerModelAt: new Date().toISOString() }
  });
  return text;
}

async function buildPortfolioValuationWithModel({ accountBefore, accountAfter, positionUpdates, profiles, config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { skillIds: ["fund-portfolio-profile", "fund-portfolio-review", "fund-portfolio-execution"] },
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
    maxTokens: Math.max(Number(config.modelMaxOutputTokens || 2800), 3600)
  });
  updateStats({
    counters: { portfolioReviewModelCalls: 1 },
    last: { lastPortfolioReviewModelAt: new Date().toISOString() }
  });
  return text;
}

function compactPortfolioReviewProfile(profile = {}) {
  const oneYear = profile.riskMetrics?.periods?.["1y"] || {};
  const topHoldings = (profile.holdings?.equityTopHoldings || profile.topStocks || []).slice(0, 5).map((item) => {
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

async function buildPortfolioPremarketWithModel({ account, marketSnapshot, profiles, activeOrders, lifecycle, config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { skillIds: ["fund-portfolio-profile", "fund-portfolio-premarket", "fund-portfolio-research", "fund-portfolio-execution"] },
    []
  );
  const systemText = [
    "你是飞书机器人“基金经理”的虚拟基金经理，正在做盘前观察。",
    "盘前观察只给观察清单和下午决策偏向，不生成 BUY/SELL 订单。",
    "请基于传入的市场快照、持仓资料、订单生命周期和经理画像输出 JSON，不要编造资料之外的数据。",
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
    "活动订单与生命周期更新：",
    JSON.stringify({ activeOrders, lifecycle }, null, 2),
    "",
    "输出 JSON 结构：",
    '{"summary":"盘前一句话结论","marketTone":"aggressive/neutral/defensive/wait","positionFocus":["持仓观察点"],"riskAlerts":["风险提醒"],"todayPlan":["今天观察什么"],"afternoonDecisionBias":"下午决策偏向","sources":["数据源"]}'
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.min(Number(config.modelMaxOutputTokens || 2800), 1800)
  });
  return text;
}

async function buildPortfolioWeeklyWithModel({ account, weeklyContext, profiles, lifecycle, config, profileContext }) {
  const skillContext = buildSkillContextForIntent(
    { skillIds: ["fund-portfolio-profile", "fund-portfolio-weekly", "fund-portfolio-review", "fund-portfolio-execution"] },
    []
  );
  const systemText = [
    "你是飞书机器人“基金经理”的虚拟基金经理，正在做周计划与总结。",
    "周总结只复盘和规划，不生成 BUY/SELL 订单；下周具体交易由每日决策任务决定。",
    "请基于传入的账本、持仓资料和经理画像输出 JSON，不要编造资料之外的数据。",
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
    "订单生命周期更新：",
    JSON.stringify(lifecycle, null, 2),
    "",
    "输出 JSON 结构：",
    '{"summary":"本周一句话总结","pnlAttribution":["盈亏归因"],"operationReview":["操作复盘"],"disciplineReview":["纪律执行情况"],"mistakes":["错误或不足"],"nextWeekPlan":["下周计划"],"watchlist":["观察清单"],"riskNotes":["风险提醒"],"sources":["数据源"]}'
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.min(Number(config.modelMaxOutputTokens || 2800), 2200)
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
        riskControl: String(item?.riskControl || "").trim()
      };
    })
    .filter((item) => item.action === "HOLD" || item.action === "WATCH" || item.code)
    .slice(0, 10);
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
      const amount = resolvePortfolioTradeAmount(db.account, action, "BUY");
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

function resolvePortfolioTradeAmount(account, action, side, position = null) {
  const totalAsset = Number(account.totalAsset || 0);
  const targetWeightPct = Number(action.targetWeightPct || 0);
  const requestedAmount = Number(action.amount || 0);

  if (side === "BUY") {
    const currentPosition = account.positions.find((item) => item.code === action.code);
    const currentValue = Number(currentPosition?.currentValue || 0);
    const targetValue = targetWeightPct > 0 ? (totalAsset * targetWeightPct) / 100 : null;
    const targetDelta = targetValue === null ? requestedAmount : Math.max(0, targetValue - currentValue);
    const proposedAmount = requestedAmount > 0 && targetDelta > 0 ? Math.min(requestedAmount, targetDelta) : targetDelta;
    return round(Math.min(Number(account.cash || 0), Math.max(0, proposedAmount || 0)), 2);
  }

  if (side === "SELL") {
    const currentValue = Number(position?.currentValue || 0);
    const targetValue = targetWeightPct > 0 ? (totalAsset * targetWeightPct) / 100 : null;
    const targetDelta = targetValue === null ? requestedAmount : Math.max(0, currentValue - targetValue);
    const proposedAmount = requestedAmount > 0 && targetDelta > 0 ? Math.min(requestedAmount, targetDelta) : targetDelta;
    return round(Math.min(currentValue, Math.max(0, proposedAmount || 0)), 2);
  }

  return 0;
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
  const topHoldings = (profile.holdings?.equityTopHoldings || profile.topStocks || []).slice(0, 5).map((item) => {
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

function buildPortfolioDecisionCard({ decision, account, orders = [], transactions, executionNotes = [], settlementEvents = [], run }) {
  const actionLines = decision.actions.length
    ? decision.actions.map((action) => {
        const name = [action.code, action.name].filter(Boolean).join(" ");
        const amount = action.amount ? ` 建议${action.amount}元` : "";
        const target = action.targetWeightPct ? ` 目标${action.targetWeightPct}%` : "";
        return `${action.action} ${name}${amount}${target}：${action.reason || "见投委会意见"}`;
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
    `当前资产：${account.totalAsset}元，可用现金 ${account.cash}元，待确认申购 ${account.pendingBuyAmount || 0}元，应收赎回 ${account.receivableCash || 0}元，仓位 ${account.positionWeightPct}%`,
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
    `累计盈亏：${formatSignedNumber(account.cumulativePnl)}元（${formatSignedNumber(account.cumulativePnlPct)}%）`,
    `可用现金：${account.cash}元，待确认申购：${account.pendingBuyAmount || 0}元，应收赎回：${account.receivableCash || 0}元，仓位：${account.positionWeightPct}%`,
    review.nextWatch.length ? ["", "明日观察：", ...review.nextWatch].join("\n") : "",
    review.learningNotes.length ? ["", "回溯学习点：", ...review.learningNotes].join("\n") : "",
    "",
    `数据来源：${(run.sources || []).slice(0, 6).join("；") || "基金公开净值与持仓资料"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPortfolioPremarketCard({ observation, account, activeOrders = [], lifecycle = {}, run }) {
  const orderLines = activeOrders.length
    ? activeOrders.slice(0, 8).map((order) => `${order.side} ${order.code} ${order.name}：${order.status}，估值日 ${order.priceDate}，确认日 ${order.confirmDate}`)
    : ["暂无未完成订单。"];

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

function buildPortfolioWeeklyCard({ weekly, weeklyContext, account, run }) {
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
    weekly.watchlist.length ? "" : "",
    weekly.watchlist.length ? "观察清单：" : "",
    ...weekly.watchlist,
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
  return {
    currentPositionWeightPct: account.positionWeightPct,
    currentCash: account.cash,
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
  const wantsSchedule = isPortfolioScheduleQuestion(userText);
  const wantsProfile = isPortfolioProfileQuestion(userText);
  const wantsOnlyProfileOrSchedule = (wantsSchedule || wantsProfile) && !wantsOperation && !wantsPosition;

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
    lines.push(`累计盈亏：${formatSignedNumber(account.cumulativePnl)}元（${formatSignedNumber(account.cumulativePnlPct)}%）`);
  }

  if (wantsPosition || (!wantsOperation && !wantsOnlyProfileOrSchedule)) {
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
  if (Array.isArray(db.runs) && db.runs.length > maxRuns) {
    db.runs = db.runs.slice(-maxRuns);
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
    runs: [],
    orders: [],
    transactions: [],
    settlements: [],
    dailyEquity: [],
    scheduler: {},
    ...value
  };
  db.pushTargets = Array.isArray(db.pushTargets) ? db.pushTargets : [];
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
    totalAsset: initialCapital,
    positionWeightPct: 0,
    dayPnl: 0,
    cumulativePnl: 0,
    cumulativePnlPct: 0,
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
    fundSnapshot: position.fundSnapshot || null,
    lastNav: position.lastNav ? Number(position.lastNav) : null
  };
}

function recalculatePortfolioAccount(account) {
  account.cash = round(Number(account.cash || 0), 2);
  account.pendingBuyAmount = round(Number(account.pendingBuyAmount || 0), 2);
  account.receivableCash = round(Number(account.receivableCash || 0), 2);
  account.investedValue = round(account.positions.reduce((sum, position) => sum + Number(position.currentValue || 0), 0), 2);
  account.totalAsset = round(account.cash + account.investedValue + account.pendingBuyAmount + account.receivableCash, 2);
  account.availableCash = account.cash;
  account.positionWeightPct = account.totalAsset > 0 ? round((account.investedValue / account.totalAsset) * 100, 2) : 0;
  account.pendingWeightPct = account.totalAsset > 0 ? round(((account.pendingBuyAmount + account.receivableCash) / account.totalAsset) * 100, 2) : 0;
  account.cumulativePnl = round(account.totalAsset - Number(account.initialCapital || 0), 2);
  account.cumulativePnlPct = account.initialCapital > 0 ? round((account.cumulativePnl / account.initialCapital) * 100, 2) : 0;
  account.positions = account.positions.map((position) => ({
    ...position,
    weightPct: account.totalAsset > 0 ? round((Number(position.currentValue || 0) / account.totalAsset) * 100, 2) : 0,
    unrealizedPnl: round(Number(position.currentValue || 0) - Number(position.costAmount || 0), 2),
    unrealizedPnlPct: position.costAmount > 0
      ? round(((Number(position.currentValue || 0) - Number(position.costAmount || 0)) / Number(position.costAmount || 1)) * 100, 2)
      : 0
  }));
  account.updatedAt = new Date().toISOString();
}

function summarizePortfolioAccount(account) {
  return {
    initialCapital: round(Number(account.initialCapital || 0), 2),
    cash: round(Number(account.cash || 0), 2),
    availableCash: round(Number(account.availableCash || account.cash || 0), 2),
    pendingBuyAmount: round(Number(account.pendingBuyAmount || 0), 2),
    receivableCash: round(Number(account.receivableCash || 0), 2),
    investedValue: round(Number(account.investedValue || 0), 2),
    totalAsset: round(Number(account.totalAsset || 0), 2),
    positionWeightPct: round(Number(account.positionWeightPct || 0), 2),
    pendingWeightPct: round(Number(account.pendingWeightPct || 0), 2),
    dayPnl: round(Number(account.dayPnl || 0), 2),
    cumulativePnl: round(Number(account.cumulativePnl || 0), 2),
    cumulativePnlPct: round(Number(account.cumulativePnlPct || 0), 2),
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
  const limit = Math.max(0, Number(process.env.FEISHU_REPORT_TREND_IMAGE_LIMIT || 3) || 3);
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
            width: 760,
            height: 360
          });
      if (!png) continue;
      const imageKey = await uploadFeishuImage(png, `fund-report-${chartMode}-${item.code || "fund"}.png`, config);
      images.push({
        imageKey,
        alt: `${item.code} ${item.name} 走势 / 回撤 / 阶段收益图`.trim() || "基金报告图"
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

function collectTrendSnapshotsFromProfiles(profiles) {
  const byCode = new Map();
  const list = Array.isArray(profiles) ? profiles : [profiles].filter(Boolean);
  const add = (profile) => {
    if (!profile?.trendProfile?.series?.length) return;
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

async function buildPortfolioTrendCardImages(run, config) {
  if (String(process.env.FEISHU_PORTFOLIO_TREND_IMAGES ?? "true") === "false") {
    return [];
  }
  const snapshots = collectTrendSnapshotsForRun(run).slice(0, Number(process.env.FEISHU_PORTFOLIO_TREND_IMAGE_LIMIT || 3));
  const images = [];
  for (const item of snapshots) {
    const png = renderTrendSeriesPng({
      title: `${item.code} ${item.name}`.trim(),
      series: item.snapshot.trendProfile?.series || [],
      width: 720,
      height: 260
    });
    if (!png) continue;
    const imageKey = await uploadFeishuImage(png, `trend-${item.code || "fund"}.png`, config);
    images.push({
      imageKey,
      alt: `${item.code} ${item.name} 走势曲线`.trim() || "基金走势曲线"
    });
  }
  if (images.length) {
    updateStats({ counters: { portfolioTrendImagesUploaded: images.length } });
  }
  return images;
}

function collectTrendSnapshotsForRun(run) {
  const byCode = new Map();
  const add = (code, name, snapshot) => {
    if (!snapshot?.trendProfile?.series?.length) return;
    const key = code || snapshot.code || name;
    if (!key || byCode.has(key)) return;
    byCode.set(key, {
      code: code || snapshot.code || "",
      name: name || snapshot.name || "",
      snapshot
    });
  };

  for (const tx of run.transactions || []) {
    add(tx.code, tx.name, tx.fundSnapshot);
  }
  for (const position of run.accountAfter?.positions || []) {
    add(position.code, position.name, position.fundSnapshot);
  }
  for (const order of run.orders || []) {
    add(order.code, order.name, order.fundSnapshot);
  }
  return [...byCode.values()];
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
  return JSON.stringify(deepDive, null, 2);
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
    return { fundCodes: extractFundCodes(userText), visibleFacts: userText ? [userText] : [], missingFields: [] };
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
    const raw = await callModel({ systemText, userPrompt, images, maxTokens: 900 });
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
    "fund-market-timing",
    "fund-trend-analysis",
    ...extra,
    "fund-actionability-evaluation",
    "fund-answer-quality",
    "fund-synthesis"
  ];
}

function buildFundCommitteeSystemText(skillIds = getFundAnalysisSkillIds()) {
  const skillContext = buildSkillContextForIntent({ skillIds }, []);
  return [
    "你是飞书机器人“基金经理”。你的任务是根据用户发送的基金截图或基金文字信息做教育性基金筛选分析。",
    "必须严格遵循当前阶段加载的 modular skills。只使用与当前任务相关的 skill，不要把所有基金流程强行套到用户请求上。",
    "不要对截图逐字念稿。要先吸收截图事实和联网补全资料，再给出投资筛选评价。",
    "必须识别份额类别并解释费用差异；A/C/D/I 等同基金不同份额要按申购费、销售服务费、赎回费和预计持有期比较。",
    "如果联网补全资料与截图冲突，要明确分开“截图可见”和“联网补全”，不要硬合并。",
    "最终回复会以飞书卡片展示，可使用少量 Markdown 加粗和编号列表，但不要输出 Markdown 表格或代码块。",
    "回答中文，优先简洁、明确、可执行。不要保证收益，不要给出个性化承诺；但如果证据偏正面，要敢于给出买入/分批买入方案，不要机械地总是建议等待回撤或极低仓位。",
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
    "如果联网补全资料中包含 holdings，请优先使用 equityTopHoldings / bondTopHoldings 做持仓风格分析。港股通、QDII、债基和指数基金可能分别出现在股票投资明细、债券投资明细或资产配置字段中；不要在已有 holdings 时说缺少十大持仓。",
    "如果资料中包含 trendProfile 或 actionability，请优先使用它们判断入场时机、适合对象和仓位上限。",
    "分析时必须拆开走势/买点、风险/回撤、持仓/风格、份额/费率、经理质量这五块；最终汇总必须经过 fund-actionability-evaluation 和 fund-answer-quality，避免只给“可以配置但别追高”这类泛泛结论。"
  ].join("\n");
}

async function buildAnalystReviewWithModel({ images, userText, messageType, extracted, enrichments }) {
  const isComparison = detectComparisonNeed({ userText, extracted, enrichments });
  const systemText = buildFundCommitteeSystemText(
    isComparison
      ? getFundAnalysisSkillIds(["fund-comparison"])
      : getFundAnalysisSkillIds()
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

  const maxTokens = Math.min(Number(getEffectiveConfig().modelMaxOutputTokens || 2800), 1800);
  const review = await callModel({ systemText, userPrompt, images, maxTokens });
  updateStats({
    counters: { analystReviewCalls: 1 },
    last: { lastAnalystReviewAt: new Date().toISOString() }
  });
  return review;
}

async function buildCommitteeVoteWithModel({ userText, messageType, extracted, enrichments, analystReview }) {
  const isComparison = detectComparisonNeed({ userText, extracted, enrichments });
  const systemText = buildFundCommitteeSystemText(isComparison ? getFundAnalysisSkillIds(["fund-comparison"]) : getFundAnalysisSkillIds());
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

  const maxTokens = Math.min(Number(getEffectiveConfig().modelMaxOutputTokens || 2800), 1400);
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
        : getFundAnalysisSkillIds(["fund-synthesis"])
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
      ? "1. 开场结论：首选哪只/哪几只、Confidence、选择理由；不需要给每只基金都打完整单基分。"
      : "1. 开场结论：Verdict、Confidence、Score，并用一句话解释这个分数的含义，例如“61/100 = 可观察但还没到重仓”。",
    isComparison
      ? "2. 多基金选择：给出排名、首选、备选、为什么不选其他基金；不要给每只基金都套 8 角色长流程。"
      : "2. 投研团队视角：产品、业绩、持仓、市场、风险等角色各 1 行，给出正/中/负倾向和关键理由。",
    "3. Manager Decision：最终动作必须是买入 / 分批买入 / 持有 / 换基 / 观察 / 回避之一，并说明最大买点和最大不买理由。",
    "4. 1万元执行方案：假设用户准备新增 10000 元，给出激进、均衡、保守三档的金额或比例；如果基金适合出击，激进档可以给到更高比例，但要写清止损/再评估触发条件。",
    "5. 自评估结果：是否适合当前用户真实需求，适合谁，不适合谁，confidence。",
    "6. 决策边界：最多 2 条，只列会改变买入/持有/回避动作的条件，不要写通用风险清单。",
    "7. 缺失数据：只列真正影响结论的字段；不要把已联网补全的夏普率、回撤、波动率重复列为缺失。"
  ].join("\n");

  const finalText = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: getEffectiveConfig().modelMaxOutputTokens
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
  const skillContext = buildSkillContextForIntent(intent, getFundRecommendationSkillIds());
  const marketEvidence = buildMarketEvidenceSummary(userText, marketSnapshot);
  const marketDeepDive = await fetchMarketDeepDive(userText, marketSnapshot, { forRecommendation: true });
  const marketDeepDiveSummary = buildMarketDeepDiveSummary(marketDeepDive);
  const systemText = [
    "你是飞书机器人“基金经理”的基金发现与配置工作流。",
    "当前任务不是分析用户已经给出的某一只基金，也不是截图 screening；当前任务是根据用户文字、公开市场快照和基金候选池，给出教育性的基金方向与候选清单。",
    "必须优先使用传入的 marketSnapshot；涉及黄金、白银或贵金属时，优先使用 marketIndicators.preciousMetals 和 fundCandidates.preciousMetalFunds。不要声称自己额外联网。",
    "如果提供了 marketDeepDive，必须使用其中的 trendProfile、risk、fees、holdings 和 actionability 来筛掉不适合的候选；不要只复述市场快照。",
    "不要编造 marketSnapshot 里没有的基金代码、涨跌幅、排名、金价或新闻。",
    "推荐基金时不要默认偏向 A 类；同一基金存在 A/C/D/I 等份额时，按用户持有期和费用模型说明为什么选这个份额，并提示可替代份额。",
    "必须通过 fund-actionability-evaluation 和 fund-answer-quality 质量门槛：先给直接结论，再给适合/不适合的自评估，再给执行方案。",
    "如果数据不足以支持具体基金代码，就推荐基金方向/筛选条件，并把具体代码标为待复核。",
    "回答要大胆但有边界：证据偏正面时可以给出买入或分批买入候选；不要机械地总是等待回撤。",
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
    "请输出：",
    "1. 直接结论：买 / 分批买 / 等 / 回避，以及一句理由。",
    "2. 自评估：这类需求是否适合现在做，confidence，适合激进/均衡/保守哪类。",
    "3. 推荐清单：优先 3-5 个候选基金或 ETF。每个候选包含代码、名称、份额类别、费用模型、趋势/自评估动作、为什么入选。只能使用快照或下钻中的候选代码；如果没有足够代码，就写“待复核方向”。",
    "4. 1万元执行：直接给激进、均衡、保守三档金额或比例。",
    "5. 决策边界：最多 2 条，只写会导致少买/不买/暂停加仓的条件。"
  ].join("\n");

  const draft = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: getEffectiveConfig().modelMaxOutputTokens
  });
  const text = await enforceFundAnswerQuality({
    text: draft,
    workflow: "fund_recommendation",
    userText,
    intent,
    evidence: {
      marketEvidence,
      marketSnapshot: summarizeMarketSnapshot(marketSnapshot),
      marketDeepDive
    }
  });
  updateStats({
    counters: { fundRecommendationModelCalls: 1 },
    last: { lastFundRecommendationAt: new Date().toISOString() }
  });
  return {
    text,
    chartProfiles: marketDeepDive?.candidates || []
  };
}

async function answerFundQuestionWithModel({ userText, intent, marketSnapshot }) {
  const skillContext = buildSkillContextForIntent(intent, getFundQaSkillIds());
  const marketEvidence = buildMarketEvidenceSummary(userText, marketSnapshot);
  const marketDeepDive = await fetchMarketDeepDive(userText, marketSnapshot, { forRecommendation: false });
  const marketDeepDiveSummary = buildMarketDeepDiveSummary(marketDeepDive);
  const systemText = [
    "你是飞书机器人“基金经理”的基金问答工作流。",
    "当前任务是回答用户问题，不是单只基金 screening；除非用户给出明确基金代码或截图，否则不要强行输出 Verdict/Score/8 角色评审。",
    "如果传入 marketSnapshot，可用它回答近期市场/题材问题；涉及黄金、白银或贵金属时，优先引用 marketIndicators.preciousMetals 和相关基金候选。",
    "如果提供了 marketDeepDive，必须使用下钻候选的 trendProfile、risk、fees、holdings 和 actionability 来形成买/等/回避判断。",
    "如果没有抓到对应行情数据，要说明是公开数据源暂时不可用或滞后，不要简单说自己没有实时数据能力。",
    "必须通过 fund-actionability-evaluation 和 fund-answer-quality 质量门槛：前两行直接回答；有快照/下钻就引用具体字段；给明确行动、适合对象和仓位建议。",
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
    "请直接回答用户问题。若用户问“值得买吗”，必须给 buy/staged/wait/avoid 之一，并给新资金和已有持仓分别怎么做。若用户实际是在要推荐基金，请提示他可以说“按最近题材推荐几个基金”，系统会进入基金发现工作流。"
  ].join("\n");

  const draft = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.min(Number(getEffectiveConfig().modelMaxOutputTokens || 2800), 1800)
  });
  const text = await enforceFundAnswerQuality({
    text: draft,
    workflow: "fund_qa",
    userText,
    intent,
    evidence: {
      marketEvidence,
      marketSnapshot: summarizeMarketSnapshot(marketSnapshot),
      marketDeepDive
    }
  });
  updateStats({
    counters: { fundQaModelCalls: 1 },
    last: { lastFundQaAt: new Date().toISOString() }
  });
  return {
    text,
    chartProfiles: marketDeepDive?.candidates || []
  };
}

async function enforceFundAnswerQuality({ text, workflow, userText, intent, evidence }) {
  if (String(process.env.FUND_ANSWER_QUALITY_GATE ?? "true") === "false") {
    return text;
  }

  const evaluation = evaluateFundAnswerQuality({ text, workflow, userText, evidence });
  if (evaluation.ok) {
    updateStats({ counters: { fundAnswerQualityPasses: 1 } });
    return text;
  }

  updateStats({
    counters: { fundAnswerQualityFailures: 1 },
    last: {
      lastFundAnswerQualityFailureAt: new Date().toISOString(),
      lastFundAnswerQualityIssues: evaluation.issues.join(",")
    }
  });

  if (String(process.env.FUND_ANSWER_QUALITY_REWRITE ?? "true") === "false") {
    return text;
  }

  try {
    const skillContext = buildSkillContextForIntent(
      { skillIds: ["fund-answer-quality", "fund-synthesis"] },
      ["fund-answer-quality", "fund-synthesis"]
    );
    const systemText = [
      "You are the quality-control editor for a Feishu fund manager bot.",
      "Rewrite only the final user-facing answer. Do not expose hidden reasoning or internal chain-of-thought.",
      "The rewrite must answer the user's question in the first two lines, give a concrete action, cite available evidence, and convert risk into sizing, waiting conditions, or review triggers.",
      "Do not invent fund codes or market figures not present in the evidence.",
      "Use Chinese. Keep it concise and suitable for a Feishu card. Do not use Markdown tables or code blocks.",
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
      String(text || "").slice(0, 8000),
      "",
      "Rewrite the answer now. Keep concrete numbers, fund codes, action, sizing, confidence, and decision boundaries when evidence supports them."
    ].join("\n");
    const rewritten = await callModel({
      systemText,
      userPrompt,
      images: [],
      maxTokens: Math.min(Number(getEffectiveConfig().modelMaxOutputTokens || 2800), 1800)
    });
    const secondPass = evaluateFundAnswerQuality({ text: rewritten, workflow, userText, evidence });
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
    return rewritten || text;
  } catch (error) {
    console.error("[fund-answer-quality-rewrite-error]", error);
    recordError(error, { fundAnswerQualityRewriteFailures: 1 });
    return text;
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
  const hasAction = /(买入|分批|持有|等待|观望|回避|卖出|换基|暂停|加仓|减仓|买|卖|buy|staged|wait|avoid|hold|sell)/i.test(firstScreen);
  const hasSizing = /(\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*(?:元|万)|仓位|比例|成|批|底仓|第一笔|上限|下限)/.test(body);
  const hasEvidence = /(\d{6}|20日|60日|120日|250日|净值|夏普|回撤|波动|费率|持仓|金价|美元指数|COMEX|黄金ETF|QDII|trend|drawdown|sharpe|nav|\d+(?:\.\d+)?%\s*(?:收益|回撤|波动|费率|涨幅|跌幅|涨|跌|return|drawdown|change))/i.test(body);
  const evidenceAvailable = hasQualityEvidence(evidence);
  const clicheCount = [
    /可以配置.{0,16}(但|不过).{0,12}(不|别)追高/,
    /不建议一把梭/,
    /取决于.{0,16}风险承受/,
    /长期.{0,8}小比例.{0,8}配置/,
    /需要结合自身情况/
  ].filter((pattern) => pattern.test(body)).length;
  const riskCount = (body.match(/风险/g) || []).length;

  if (actionSeeking && !hasAction) issues.push("missing_direct_action");
  if (actionSeeking && !hasSizing) issues.push("missing_sizing_or_execution");
  if (evidenceAvailable && !hasEvidence) issues.push("missing_concrete_evidence");
  if (clicheCount >= 1 && (!hasSizing || !hasEvidence)) issues.push("generic_cliche_answer");
  if (riskCount >= 6 && !/(边界|触发|仓位|等待|暂停|回避|上限|下限)/.test(body)) {
    issues.push("risk_dump_without_decision_boundary");
  }

  return { ok: issues.length === 0, issues };
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
  return /(trendProfile|marketSnapshot|marketDeepDive|enrichments|riskMetrics|fundCandidates|preciousMetals|candidates|return20dPct|drawdown)/i.test(compact);
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
    maxTokens: Math.min(Number(getEffectiveConfig().modelMaxOutputTokens || 2800), 1000)
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
    max_output_tokens: Number(maxTokens || config.modelMaxOutputTokens || 2800)
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
      max_tokens: Number(maxTokens || config.modelMaxOutputTokens || 2800)
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
    preciousMetalFunds
  ] = await Promise.all([
    fetchEastmoneyBoards("concept").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchEastmoneyBoards("industry").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("gp", "股票型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("hh", "混合型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("zs", "指数型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("qdii", "QDII基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchPreciousMetalQuotes().catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchPreciousMetalFundCandidates().catch((error) => ({ ok: false, error: error.message, items: [] }))
  ]);

  const snapshotParts = [
    conceptBoards,
    industryBoards,
    stockFunds,
    hybridFunds,
    indexFunds,
    qdiiFunds,
    preciousMetals,
    preciousMetalFunds
  ];
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
    fundCandidates: {
      stockFunds: stockFunds.items || [],
      hybridFunds: hybridFunds.items || [],
      indexFunds: indexFunds.items || [],
      qdiiFunds: qdiiFunds.items || [],
      preciousMetalFunds: preciousMetalFunds.items || []
    },
    errors: snapshotParts
      .filter((item) => item && item.ok === false)
      .map((item) => item.error),
    sources: [
      "https://push2.eastmoney.com/api/qt/clist/get",
      "https://push2.eastmoney.com/api/qt/ulist.np/get",
      "https://fund.eastmoney.com/data/rankhandler.aspx",
      "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx"
    ]
  };
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

function mergeCandidateFunds(...groups) {
  const byCode = new Map();
  for (const item of groups.flat()) {
    if (!item?.code) continue;
    const existing = byCode.get(item.code);
    if (existing) {
      existing.keywords = [...new Set([...(existing.keywords || []), ...(item.keywords || [])])];
    } else {
      byCode.set(item.code, { ...item });
    }
  }
  return [...byCode.values()];
}

function scoreDeepDiveCandidate(item) {
  const text = `${item.name || ""} ${item.type || ""}`;
  let score = 0;
  if (/ETF|联接|指数/.test(text)) score += 6;
  if (/C$|C类/.test(text)) score += 2;
  if (/A$|A类/.test(text)) score += 1;
  for (const value of [item.oneMonthPct, item.threeMonthPct, item.sixMonthPct, item.oneYearPct, item.dailyPct]) {
    const numeric = toNumber(value);
    if (Number.isFinite(numeric)) score += Math.max(-8, Math.min(12, numeric / 2));
  }
  if (item.unitNav) score += 1;
  if (item.manager) score += 1;
  return score;
}

async function fetchMarketDeepDive(userText, marketSnapshot, options = {}) {
  if (!marketSnapshot) return null;
  const focusedCandidates = await fetchFocusedFundCandidates(userText);
  const precious = isPreciousMetalQuestion(userText);
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
  const merged = mergeCandidateFunds(focusedCandidates, snapshotCandidates)
    .sort((a, b) => scoreDeepDiveCandidate(b) - scoreDeepDiveCandidate(a));
  const defaultLimit = precious ? 4 : 3;
  const limit = Math.max(0, Number(process.env.MARKET_DEEP_DIVE_FUND_LIMIT ?? defaultLimit));
  const selected = merged.slice(0, limit);
  if (!selected.length) {
    return {
      ok: false,
      focus: precious ? "precious_metals" : "market_theme",
      note: "未找到可下钻的候选基金，最终回答只能基于市场快照。"
    };
  }

  const candidates = await Promise.all(selected.map(async (candidate) => {
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

  updateStats({
    counters: { marketDeepDiveCalls: 1, marketDeepDiveCandidates: candidates.length },
    last: { lastMarketDeepDiveAt: new Date().toISOString() }
  });

  return {
    ok: true,
    focus: precious ? "precious_metals" : focusedCandidates.length ? "focused_theme_search" : "market_recommendation",
    searchKeywords: inferFocusedFundSearchKeywords(userText),
    selectedCodes: selected.map((item) => item.code),
    candidates
  };
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
      oneMonthPct: seed.oneMonthPct ?? "",
      threeMonthPct: seed.threeMonthPct ?? "",
      sixMonthPct: seed.sixMonthPct ?? "",
      oneYearPct: seed.oneYearPct ?? ""
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
      minPurchase: feeProfile.minPurchase
    },
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
  const equity = (holdings.equityTopHoldings || []).slice(0, 5).map((item) =>
    [item.code, item.name, item.netValuePct ? `${item.netValuePct}%` : ""].filter(Boolean).join(" ")
  );
  const bond = (holdings.bondTopHoldings || []).slice(0, 5).map((item) =>
    [item.code, item.name, item.netValuePct ? `${item.netValuePct}%` : ""].filter(Boolean).join(" ")
  );
  return {
    ok: Boolean(holdings.ok || equity.length || bond.length || fallbackTopStocks.length),
    equityDisclosureDate: holdings.equityDisclosureDate || "",
    bondDisclosureDate: holdings.bondDisclosureDate || "",
    equityTopHoldings: equity.length ? equity : fallbackTopStocks.slice(0, 5),
    bondTopHoldings: bond,
    note: holdings.ok ? "已下钻持仓摘要。" : "持仓下钻不足，使用可见候选信息。"
  };
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
  const recentHigh = Math.max(...recent.map((point) => point.cumulativeNav));
  const recentLow = Math.min(...recent.map((point) => point.cumulativeNav));
  const drawdownFromHighPct = recentHigh > 0 ? round((latest.cumulativeNav / recentHigh - 1) * 100, 2) : null;
  const reboundFromLowPct = recentLow > 0 ? round((latest.cumulativeNav / recentLow - 1) * 100, 2) : null;
  const r20 = returnOver(20);
  const r60 = returnOver(60);
  const r120 = returnOver(120);
  const r250 = returnOver(250);
  const extended = (Number.isFinite(r20) && r20 > 8) || (Number.isFinite(r60) && r60 > 18 && drawdownFromHighPct > -3);
  const breakdown = (Number.isFinite(r60) && r60 < -8) && (Number.isFinite(r120) && r120 < -10);
  const uptrend = (Number.isFinite(r20) && r20 > 0) && (Number.isFinite(r60) && r60 > 0) && (!Number.isFinite(r120) || r120 > 0);
  const rebound = (Number.isFinite(r20) && r20 > 0) && (Number.isFinite(r60) && r60 > 0) && Number.isFinite(drawdownFromHighPct) && drawdownFromHighPct < -5;
  const weakening = (Number.isFinite(r20) && r20 < 0) && (Number.isFinite(r60) && r60 < 0);
  const trendLabel = breakdown
    ? "breakdown"
    : extended
      ? "extended_uptrend"
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
      : rebound || uptrend
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
    return60dPct: r60,
    return120dPct: r120,
    return250dPct: r250,
    drawdownFromRecentHighPct: drawdownFromHighPct,
    reboundFromRecentLowPct: reboundFromLowPct,
    trendLabel,
    entryBias,
    invalidationHint: entryBias === "staged_buy"
      ? "若60日收益转负或跌破近60日低点，暂停加仓。"
      : entryBias === "wait_pullback"
        ? "等待20日涨幅降温或从高点回撤后再评估。"
        : "等待趋势重新转强后再评估。"
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

  const canvas = createRgbaCanvas(width, height, [255, 255, 255, 255]);
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

function renderFundReportSummaryPng({ profile, width = 760, height = 360 } = {}) {
  const trend = profile?.trendProfile || {};
  const points = normalizeChartSeries(trend.series || []);
  if (points.length < 2) return null;

  const canvas = createRgbaCanvas(width, height, [255, 255, 255, 255]);
  const code = String(profile?.code || "").slice(0, 12) || "FUND";
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = first.nav > 0 ? (last.nav / first.nav - 1) * 100 : 0;
  const lineColor = changePct >= 0 ? [22, 130, 93, 255] : [194, 65, 12, 255];
  const muted = [100, 116, 139, 255];
  const ink = [15, 23, 42, 255];

  drawText(canvas, 28, 18, `${code} FUND REPORT`, ink, 3);
  drawText(canvas, 28, 44, `${first.date || "START"} / ${last.date || "LAST"}`, muted, 2);
  drawText(canvas, 552, 24, `RANGE ${formatChartPct(changePct)}`, lineColor, 3);

  drawLineChartPanel(canvas, {
    x: 28,
    y: 72,
    width: 472,
    height: 162,
    points,
    color: lineColor,
    label: "NAV TREND"
  });

  drawDrawdownPanel(canvas, {
    x: 28,
    y: 262,
    width: 472,
    height: 64,
    points
  });

  drawReturnBarsPanel(canvas, {
    x: 540,
    y: 82,
    width: 182,
    height: 228,
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

function drawLineChartPanel(canvas, { x, y, width, height, points, color, label }) {
  const values = points.map((item) => item.nav);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  drawText(canvas, x, y - 22, label, [51, 65, 85, 255], 2);
  drawChartFrame(canvas, x, y, width, height);

  const px = points.map((item, index) => ({
    x: x + 10 + (index / Math.max(1, points.length - 1)) * (width - 20),
    y: y + 10 + (1 - (item.nav - min) / range) * (height - 20)
  }));
  for (let i = 1; i < px.length; i += 1) {
    drawLine(canvas, px[i - 1].x, px[i - 1].y, px[i].x, px[i].y, color, 4);
  }
  drawCircle(canvas, px[0].x, px[0].y, 4, [100, 116, 139, 255]);
  drawCircle(canvas, px[px.length - 1].x, px[px.length - 1].y, 5, color);
  drawText(canvas, x + 8, y + 10, `HIGH ${formatChartNumber(max)}`, [100, 116, 139, 255], 2);
  drawText(canvas, x + 8, y + height - 22, `LOW ${formatChartNumber(min)}`, [100, 116, 139, 255], 2);
}

function drawDrawdownPanel(canvas, { x, y, width, height, points }) {
  let peak = points[0].nav;
  const drawdowns = points.map((item) => {
    peak = Math.max(peak, item.nav);
    return peak > 0 ? (item.nav / peak - 1) * 100 : 0;
  });
  const min = Math.min(...drawdowns, -1);
  const range = Math.abs(min) || 1;
  drawText(canvas, x, y - 22, "DRAWDOWN FROM HIGH", [51, 65, 85, 255], 2);
  drawChartFrame(canvas, x, y, width, height);
  const zeroY = y + 10;
  drawLine(canvas, x + 8, zeroY, x + width - 8, zeroY, [203, 213, 225, 255], 1);
  const px = drawdowns.map((value, index) => ({
    x: x + 10 + (index / Math.max(1, drawdowns.length - 1)) * (width - 20),
    y: y + 10 + (Math.abs(value) / range) * (height - 20)
  }));
  for (let i = 1; i < px.length; i += 1) {
    drawLine(canvas, px[i - 1].x, px[i - 1].y, px[i].x, px[i].y, [217, 119, 6, 255], 3);
  }
  drawText(canvas, x + width - 104, y + height - 18, `MAX ${formatChartPct(min)}`, [217, 119, 6, 255], 2);
}

function drawReturnBarsPanel(canvas, { x, y, width, height, trend }) {
  drawText(canvas, x, y - 28, "STAGE RETURN", [51, 65, 85, 255], 2);
  drawRect(canvas, x, y, width, height, [226, 232, 240, 255], 1);
  const items = [
    ["20D", trend.return20dPct],
    ["60D", trend.return60dPct],
    ["120D", trend.return120dPct],
    ["250D", trend.return250dPct]
  ].map(([label, value]) => ({ label, value: Number(value) })).filter((item) => Number.isFinite(item.value));
  if (!items.length) {
    drawText(canvas, x + 18, y + 92, "NO DATA", [100, 116, 139, 255], 3);
    return;
  }
  const maxAbs = Math.max(5, ...items.map((item) => Math.abs(item.value)));
  const center = x + Math.round(width / 2);
  drawLine(canvas, center, y + 26, center, y + height - 20, [203, 213, 225, 255], 1);
  const rowGap = Math.floor((height - 44) / items.length);
  items.forEach((item, index) => {
    const rowY = y + 32 + index * rowGap;
    const barWidth = Math.round((Math.abs(item.value) / maxAbs) * (width / 2 - 36));
    const color = item.value >= 0 ? [22, 130, 93, 255] : [194, 65, 12, 255];
    drawText(canvas, x + 10, rowY - 7, item.label, [71, 85, 105, 255], 2);
    if (item.value >= 0) {
      fillRect(canvas, center, rowY - 7, barWidth, 14, color);
    } else {
      fillRect(canvas, center - barWidth, rowY - 7, barWidth, 14, color);
    }
    drawText(canvas, x + 82, rowY - 7, formatChartPct(item.value), color, 2);
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

function formatChartNumber(value) {
  if (!Number.isFinite(value)) return "NA";
  return String(round(value, value >= 10 ? 2 : 4));
}

function formatChartPct(value) {
  if (!Number.isFinite(value)) return "NA";
  const number = round(value, 1);
  return `${number > 0 ? "+" : ""}${number}%`;
}

function createRgbaCanvas(width, height, color) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
    pixels[i * 4 + 3] = color[3];
  }
  return { width, height, pixels };
}

function setPixel(canvas, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
  const offset = (py * canvas.width + px) * 4;
  canvas.pixels[offset] = color[0];
  canvas.pixels[offset + 1] = color[1];
  canvas.pixels[offset + 2] = color[2];
  canvas.pixels[offset + 3] = color[3];
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

function drawText(canvas, x, y, text, color = [15, 23, 42, 255], scale = 2) {
  let cursor = Math.round(x);
  const top = Math.round(y);
  for (const rawChar of String(text || "").toUpperCase()) {
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

const TINY_FONT = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "A": ["010", "101", "111", "101", "101"],
  "B": ["110", "101", "110", "101", "110"],
  "C": ["111", "100", "100", "100", "111"],
  "D": ["110", "101", "101", "101", "110"],
  "E": ["111", "100", "110", "100", "111"],
  "F": ["111", "100", "110", "100", "100"],
  "G": ["111", "100", "101", "101", "111"],
  "H": ["101", "101", "111", "101", "101"],
  "I": ["111", "010", "010", "010", "111"],
  "J": ["001", "001", "001", "101", "111"],
  "K": ["101", "101", "110", "101", "101"],
  "L": ["100", "100", "100", "100", "111"],
  "M": ["101", "111", "111", "101", "101"],
  "N": ["101", "111", "111", "111", "101"],
  "O": ["111", "101", "101", "101", "111"],
  "P": ["111", "101", "111", "100", "100"],
  "Q": ["111", "101", "101", "111", "001"],
  "R": ["110", "101", "110", "101", "101"],
  "S": ["111", "100", "111", "001", "111"],
  "T": ["111", "010", "010", "010", "010"],
  "U": ["101", "101", "101", "101", "111"],
  "V": ["101", "101", "101", "101", "010"],
  "W": ["101", "101", "111", "111", "101"],
  "X": ["101", "101", "010", "101", "101"],
  "Y": ["101", "101", "010", "010", "010"],
  "Z": ["111", "001", "010", "100", "111"],
  "+": ["000", "010", "111", "010", "000"],
  "-": ["000", "000", "111", "000", "000"],
  ".": ["000", "000", "000", "000", "010"],
  "%": ["101", "001", "010", "100", "101"],
  "/": ["001", "001", "010", "100", "100"],
  ":": ["000", "010", "000", "010", "000"],
  "?": ["111", "001", "010", "000", "010"]
};

function encodePngRgba(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rowOffset = y * (canvas.width * 4 + 1);
    raw[rowOffset] = 0;
    canvas.pixels.copy(raw, rowOffset + 1, y * canvas.width * 4, (y + 1) * canvas.width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", Buffer.concat([
      uint32be(canvas.width),
      uint32be(canvas.height),
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
  const feeType = digest.fees?.shareClassFeeModel?.type || "unknown";
  let score = 50;

  if (trend.entryBias === "staged_buy") score += 14;
  if (trend.entryBias === "buyable_now") score += 18;
  if (trend.entryBias === "wait_pullback") score -= 6;
  if (trend.entryBias === "avoid_now") score -= 18;
  if (trend.entryBias === "hold_observe") score -= 2;

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
  if (digest.holdings?.ok) score += 3;

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
  const allocationBand = action === "buy"
    ? (highDrawdown ? "5%-10%" : "10%-20%")
    : action === "staged_buy"
      ? (highDrawdown ? "3%-8%" : "5%-15%")
      : action === "wait"
        ? "0%-3% watch/test only"
        : "0%";
  const evidenceCount = [trend.ok, risk.ok, digest.holdings?.ok, feeType !== "unknown"].filter(Boolean).length;
  const confidence = evidenceCount >= 4 ? "high" : evidenceCount >= 2 ? "medium" : "low";
  const decisiveEvidence = [
    trend.ok ? `trend=${trend.trendLabel}, entryBias=${trend.entryBias}, 20d=${trend.return20dPct}%, 60d=${trend.return60dPct}%` : "",
    risk.ok ? `1yReturn=${risk.totalReturnPct}%, maxDrawdown=${risk.maxDrawdownPct}%, sharpe=${risk.sharpe}` : "",
    digest.fees?.shareClassFeeModel?.label || "",
    digest.holdings?.equityTopHoldings?.length ? `topHolding=${digest.holdings.equityTopHoldings[0]}` : ""
  ].filter(Boolean).slice(0, 4);
  const decisionBlocker = [
    trend.invalidationHint || "",
    feeType === "unknown" ? "费率/份额类别未确认前不做重仓。" : "",
    highDrawdown ? "近一年回撤偏深，只能按卫星仓或战术仓处理。" : ""
  ].filter(Boolean).slice(0, 2);

  return {
    score: boundedScore,
    fitLabel,
    action,
    allocationBand,
    confidence,
    decisiveEvidence,
    decisionBlocker
  };
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
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 1);

  const url = new URL("https://fund.eastmoney.com/data/rankhandler.aspx");
  const params = {
    op: "ph",
    dt: "kf",
    ft: fundType,
    rs: "",
    gs: "0",
    sc: "1yzf",
    st: "desc",
    sd: formatDate(startDate),
    ed: formatDate(endDate),
    qdii: "",
    tabSubtype: ",,,,,",
    pi: "1",
    pn: String(Number(process.env.FUND_DISCOVERY_RANK_LIMIT || 10)),
    dx: "1",
    v: String(Date.now())
  };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const text = await fetchText(url.href);
  updateStats({ counters: { fundRankingFetches: 1 } });
  return {
    ok: true,
    fundType,
    label,
    rankingMetric: "近1月涨幅",
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    items: parseFundRankData(text, label)
  };
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
    fees: {
      shareClass: feeProfile.shareClass,
      shareClassFeeModel: feeProfile.shareClassFeeModel
    },
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
    netValueAlreadyDeductsOperatingFees: Boolean(text),
    feeRules: {
      subscription: subscriptionRules,
      redemption: redemptionRules
    },
    source: feePageText && code ? `https://fundf10.eastmoney.com/jjfl_${code}.html` : ""
  };
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
    managers: summarizeManagers(managers),
    topStocks: extractTopStockCodes(text)
  };
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

async function replyToMessage(messageId, text, options = {}) {
  const config = getEffectiveConfig();
  const token = await getTenantAccessToken(config);
  const url = new URL(`/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, config.feishuBaseUrl);
  const payload = buildFeishuReplyPayload(text, options);

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
  const kind = options.kind || "reply";
  updateStats({
    counters: {
      repliesSent: 1,
      progressReplies: kind === "progress" ? 1 : 0,
      answersSent: kind === "answer" ? 1 : 0,
      errorReplies: kind === "error" ? 1 : 0
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
  const payload = {
    receive_id: receiveId,
    ...buildFeishuReplyPayload(text, options)
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

  updateStats({
    counters: { proactiveRepliesSent: 1 },
    last: {
      lastProactiveReplyAt: new Date().toISOString(),
      lastProactiveReplyType: options.kind || "reply"
    }
  });
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
    modelMaxOutputTokens: Number(process.env.MODEL_MAX_OUTPUT_TOKENS || 2800),
    modelHttpTimeoutMs: Number(process.env.MODEL_HTTP_TIMEOUT_MS ?? DEFAULT_MODEL_HTTP_TIMEOUT_MS),
    modelResponsesStream: parseBoolean(process.env.MODEL_RESPONSES_STREAM, true),
    replyMaxChars: Number(process.env.FEISHU_REPLY_MAX_CHARS || 7000),
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
  next.modelMaxOutputTokens = Number(next.modelMaxOutputTokens || 2800);
  next.modelHttpTimeoutMs = Math.max(0, Number(next.modelHttpTimeoutMs ?? DEFAULT_MODEL_HTTP_TIMEOUT_MS) || 0);
  next.modelResponsesStream = parseBoolean(next.modelResponsesStream, true);
  next.replyMaxChars = Number(next.replyMaxChars || 7000);
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
      modelMaxOutputTokens: Number(config.modelMaxOutputTokens || 2800),
      modelHttpTimeoutMs: Math.max(0, Number(config.modelHttpTimeoutMs || 0)),
      modelResponsesStream: String(Boolean(config.modelResponsesStream)),
      replyMaxChars: Number(config.replyMaxChars || 7000),
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
      navHistoryFetches: 0,
      navHistoryPoints: 0,
      analystReviewCalls: 0,
      committeeVoteCalls: 0,
      managerReviewCalls: 0,
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
  const hasFundWord = hasAny(text, ["基金", "etf", "lof", "qdii", "指数", "主动", "混合", "股票型", "债基", "货币"]);

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
    return {
      workflow: "fund_screening",
      mode: fundCodes.length > 1 ? "comparison_or_specific_fund" : "specific_fund_or_fund_name",
      reason: "text_contains_fund_code",
      fundCodes,
      skillIds: getFundAnalysisSkillIds(["fund-comparison", "fund-synthesis"]),
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

  const asksRecommendation =
    hasAny(text, ["推荐", "筛选", "找几个", "几个基金", "哪些基金", "买什么", "投什么", "配什么", "配置", "候选", "清单"]) ||
    (hasAny(text, ["最近", "最新", "当前", "现在", "市场", "行情", "题材", "热点", "板块", "赛道", "机会"]) &&
      hasAny(text, ["基金", "etf", "买", "投", "配置", "推荐"]));

  const asksCompare = hasAny(text, ["对比", "比较", "哪个更好", "哪只更好", "二选一", "三选一", "pk"]);
  const asksSpecificAction = hasAny(text, [
    "这只基金",
    "这个基金",
    "该基金",
    "基金代码",
    "值得买吗",
    "还能买吗",
    "能买吗",
    "要不要买",
    "要不要卖",
    "持有",
    "卖出",
    "买入",
    "定投",
    "仓位",
    "评分",
    "评价",
    "分析一下"
  ]);

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
    "- portfolio_status：用户询问机器人/虚拟基金经理自己的仓位、持仓、今日操作、买卖、现金、盈亏、账户或虚拟组合。",
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

function buildSkillContextForIntent(intent, fallbackSkillIds = []) {
  const requestedIds = Array.isArray(intent?.skillIds) ? intent.skillIds : [];
  const ids = [...new Set([...requestedIds, ...fallbackSkillIds].map(String).filter(Boolean))];
  const skills = listSkills(true).filter((skill) => ids.includes(skill.id));
  if (!skills.length) {
    return "本工作流没有加载额外 skill。";
  }

  return [
    "本工作流按需加载以下 skills。只在用户意图需要时使用，不要把 skill 模板强行套到无关对话：",
    ...skills.map((skill) => [`# Skill: ${skill.id}`, skill.content].join("\n"))
  ].join("\n\n");
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
  const maxLength = Number(config.replyMaxChars || 7000);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 80)}\n\n（回复过长，已截断。可继续发送“详细分析”并附基金名称/代码。）`;
}

function normalizeFeishuCardMarkdown(text, kind) {
  const config = getEffectiveConfig();
  const maxLength = Number(config.replyMaxChars || 7000);
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
