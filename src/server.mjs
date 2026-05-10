import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

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

let tenantAccessTokenCache = null;
const seenEventIds = new Map();
let portfolioSchedulerTimer = null;
let portfolioRunInFlight = false;

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
  console.log(`Feishu Fund Assistant listening on http://${HOST}:${PORT}`);
  console.log(`Admin UI: http://127.0.0.1:${PORT}/admin`);
  startPortfolioScheduler();
});

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
    sendJson(res, 200, { ok: true, portfolio: getPortfolioPublicState() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/portfolio/run") {
    const body = await readJsonBody(req);
    const result = await runPortfolioTask(body.type || "decision", { manual: true });
    sendJson(res, 200, { ok: true, portfolio: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/portfolio/reset") {
    const body = await readJsonBody(req);
    const result = resetPortfolioAccount(body.initialCapital);
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
    await replyToMessage(
      message.message_id,
      [buildCompletionPrefix(images.length, userText), analysis].filter(Boolean).join("\n\n"),
      { kind: "answer" }
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

  const answer = await recommendFundsWithModel({ userText, intent, marketSnapshot });
  await replyToMessage(message.message_id, answer, { kind: "answer" });
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
  const answer = await answerFundQuestionWithModel({ userText, intent, marketSnapshot });
  await replyToMessage(message.message_id, answer, { kind: "answer" });
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
    { type: "decision", time: config.portfolioDecisionTime },
    { type: "valuation", time: config.portfolioReviewTime }
  ].filter((item) => item.time && item.time === now.hhmm);

  for (const task of dueTasks) {
    if (!markPortfolioScheduledRun(task.type, now.date)) {
      continue;
    }
    runPortfolioTask(task.type, { manual: false, scheduledDate: now.date }).catch((error) => {
      console.error("[portfolio-run-error]", error);
      recordError(error, { portfolioErrors: 1 });
    });
  }
}

function markPortfolioScheduledRun(type, date) {
  const db = readPortfolioDb();
  const key = type === "valuation" ? "lastValuationDate" : "lastDecisionDate";
  db.scheduler = db.scheduler || {};
  if (db.scheduler[key] === date) {
    return false;
  }
  db.scheduler[key] = date;
  writePortfolioDb(db);
  return true;
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

  let db = readPortfolioDb();
  ensurePortfolioAccount(db, config);
  db.runs.push(run);
  writePortfolioDb(db);

  try {
    updateStats({
      counters: {
        portfolioRuns: 1,
        portfolioDecisionRuns: taskType === "decision" ? 1 : 0,
        portfolioValuationRuns: taskType === "valuation" ? 1 : 0
      },
      last: { lastPortfolioRunAt: startedAt, lastPortfolioRunType: taskType }
    });

    if (taskType === "decision") {
      await executePortfolioDecision(db, run, config);
    } else {
      await executePortfolioValuation(db, run, config);
    }

    run.status = "completed";
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.parse(run.completedAt) - Date.parse(startedAt);
    prunePortfolioDb(db, config.portfolioRetentionDays);
    db.updatedAt = new Date().toISOString();
    writePortfolioDb(db);
    await pushPortfolioRunIfConfigured(db, run, config);
    return getPortfolioPublicState(db);
  } catch (error) {
    run.status = "failed";
    run.error = error.message;
    run.completedAt = new Date().toISOString();
    db.updatedAt = run.completedAt;
    writePortfolioDb(db);
    recordError(error, { portfolioErrors: 1 });
    throw error;
  } finally {
    portfolioRunInFlight = false;
  }
}

async function executePortfolioDecision(db, run, config) {
  const lifecycleBefore = await processPortfolioOrderLifecycle(db, run, config);
  const accountBefore = summarizePortfolioAccount(db.account);
  const marketSnapshot = await fetchMarketSnapshot();
  const heldCodes = db.account.positions.map((position) => position.code).filter(Boolean);
  const heldProfiles = heldCodes.length ? await enrichFunds(heldCodes) : [];
  const raw = await buildPortfolioDecisionWithModel({
    account: accountBefore,
    marketSnapshot,
    heldProfiles,
    config
  });
  const decision = normalizePortfolioDecision(raw);
  const profileCodes = decision.actions.map((action) => action.code).filter(Boolean);
  const actionProfiles = profileCodes.length ? await enrichFunds(profileCodes) : [];
  const execution = submitPortfolioOrders(db, decision.actions, actionProfiles, run, config);
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
  const lifecycle = await processPortfolioOrderLifecycle(db, run, config);
  const accountBefore = summarizePortfolioAccount(db.account);
  const positionsBefore = new Map(db.account.positions.map((position) => [position.code, { ...position }]));
  const codes = db.account.positions.map((position) => position.code).filter(Boolean);
  const profiles = codes.length ? await enrichFunds(codes) : [];
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

  const raw = await buildPortfolioValuationWithModel({
    accountBefore,
    accountAfter: summarizePortfolioAccount(db.account),
    positionUpdates,
    profiles,
    config
  });
  const review = normalizePortfolioReview(raw);

  run.title = "晚间估值复盘";
  run.accountBefore = accountBefore;
  run.accountAfter = summarizePortfolioAccount(db.account);
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

async function buildPortfolioDecisionWithModel({ account, marketSnapshot, heldProfiles, config }) {
  const skillContext = buildSkillContextForIntent({ skillIds: ["fund-portfolio-manager"] }, []);
  const systemText = [
    "你是飞书机器人“基金助手”的虚拟基金经理。你每天管理一个教育性虚拟组合，不进行真实交易。",
    "你的目标不是永远保守，而是在证据足够时敢于出击；但每次动作都必须写清数据来源、风险控制和复盘条件。",
    "你有一个投委会：市场分析师、题材分析师、基金研究员、组合经理、风控经理、主席。每个角色必须贡献可保存的观点。",
    "只能基于传入的公开市场快照、基金候选池和当前持仓做判断；不要编造快照中不存在的基金代码、涨跌幅或排名。",
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

async function buildPortfolioValuationWithModel({ accountBefore, accountAfter, positionUpdates, profiles, config }) {
  const skillContext = buildSkillContextForIntent({ skillIds: ["fund-portfolio-manager"] }, []);
  const systemText = [
    "你是飞书机器人“基金助手”的虚拟基金经理，正在做晚间估值复盘。",
    "请解释今日盈亏、仓位变化和明天观察重点。不要编造传入资料之外的数据。",
    "请只返回 JSON，不要 Markdown，不要代码块。",
    "",
    skillContext
  ].join("\n");
  const userPrompt = [
    "估值前账户：",
    JSON.stringify(accountBefore, null, 2),
    "",
    "估值后账户：",
    JSON.stringify(accountAfter, null, 2),
    "",
    "持仓估值变化：",
    JSON.stringify(positionUpdates, null, 2),
    "",
    "持仓联网资料：",
    JSON.stringify(profiles || [], null, 2),
    "",
    "输出 JSON 结构：",
    '{"summary":"今日盈亏复盘","reason":"为什么变动","nextWatch":["明天观察点"],"learningNotes":["可回溯学习点"],"sources":["数据源"]}'
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.min(Number(config.modelMaxOutputTokens || 2800), 1800)
  });
  updateStats({
    counters: { portfolioReviewModelCalls: 1 },
    last: { lastPortfolioReviewModelAt: new Date().toISOString() }
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
    .filter((item) => item.action === "HOLD" || item.action === "WATCH" || item.code);
}

function submitPortfolioOrders(db, actions, profiles, run, config = getEffectiveConfig()) {
  const profileByCode = new Map((profiles || []).map((profile) => [profile.code, profile]));
  const orders = [];
  const notes = [];
  recalculatePortfolioAccount(db.account);

  for (const action of actions) {
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
  const topHoldings = (profile.holdings?.equityTopHoldings || profile.topStocks || []).slice(0, 5).map((item) => {
    if (typeof item === "string") return item;
    return [item.code, item.name, item.netValuePct ? `${item.netValuePct}%` : ""].filter(Boolean).join(" ");
  });

  const trendParts = [
    oneYear.ok ? `1年${formatSignedNumber(oneYear.totalReturnPct)}%` : "",
    threeYear.ok ? `3年${formatSignedNumber(threeYear.totalReturnPct)}%` : "",
    oneYear.ok ? `回撤${oneYear.maxDrawdownPct}%` : "",
    oneYear.ok && oneYear.sharpe !== null ? `夏普${oneYear.sharpe}` : ""
  ].filter(Boolean);

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
    scale: profile.scale || null,
    topHoldings,
    trendSummary: trendParts.join("，") || "走势数据不足",
    sources: profile.sources || []
  };
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
  const day = new Date(`${date}T00:00:00+08:00`).getDay();
  return day !== 0 && day !== 6;
}

function nextPortfolioTradingDay(date) {
  let current = addDays(date, 1);
  while (!isPortfolioTradingDay(current)) {
    current = addDays(current, 1);
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
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setDate(value.getDate() + Number(days || 0));
  return formatDate(value);
}

async function pushPortfolioRunIfConfigured(db, run, config) {
  const target = resolvePortfolioPushTarget(config, db);
  if (!target?.receiveId) {
    run.push = { ok: false, skipped: true, reason: "未配置飞书推送目标；在飞书里和机器人说一句话后可自动记录 chat_id。" };
    writePortfolioDb(db);
    return;
  }

  try {
    await sendFeishuMessage(target.receiveId, run.card || "虚拟基金经理任务完成。", {
      receiveIdType: target.receiveIdType || "chat_id",
      kind: "portfolio"
    });
    run.push = {
      ok: true,
      receiveIdType: target.receiveIdType || "chat_id",
      receiveId: maskSecret(target.receiveId),
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

  const lines = ["虚拟基金经理账本"];
  lines.push("");
  lines.push(`总资产：${account.totalAsset}元`);
  lines.push(`可用现金：${account.cash}元`);
  if (account.pendingBuyAmount || account.receivableCash) {
    lines.push(`待确认申购：${account.pendingBuyAmount || 0}元，应收赎回：${account.receivableCash || 0}元`);
  }
  lines.push(`当前仓位：${account.positionWeightPct}%`);
  lines.push(`累计盈亏：${formatSignedNumber(account.cumulativePnl)}元（${formatSignedNumber(account.cumulativePnlPct)}%）`);

  if (wantsPosition || !wantsOperation) {
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

function getPortfolioPublicState(db = readPortfolioDb()) {
  const config = getEffectiveConfig();
  ensurePortfolioAccount(db, config);
  const target = resolvePortfolioPushTarget(config, db);
  return {
    dbPath: PORTFOLIO_DB_PATH,
    enabled: Boolean(config.portfolioEnabled),
    retentionDays: Number(config.portfolioRetentionDays || 90),
    scheduler: {
      decisionTime: config.portfolioDecisionTime,
      reviewTime: config.portfolioReviewTime,
      timezone: config.portfolioTimezone,
      inFlight: portfolioRunInFlight
    },
    pushTarget: target
      ? {
          receiveIdType: target.receiveIdType || "chat_id",
          receiveIdMasked: maskSecret(target.receiveId),
          label: target.label || ""
        }
      : null,
    knownPushTargets: (db.pushTargets || []).slice(-10).reverse().map((target) => ({
      receiveIdType: target.receiveIdType,
      receiveIdMasked: maskSecret(target.receiveId),
      label: target.label,
      firstSeenAt: target.firstSeenAt,
      lastSeenAt: target.lastSeenAt
    })),
    account: summarizePortfolioAccount(db.account),
    positions: db.account.positions.map(summarizePortfolioPosition),
    activeOrders: (db.orders || []).filter((order) => !["confirmed", "cancelled", "rejected", "settled"].includes(order.status)).map(summarizePortfolioOrder),
    recentRuns: (db.runs || []).slice(-20).reverse().map(summarizePortfolioRun),
    recentOrders: (db.orders || []).slice(-30).reverse().map(summarizePortfolioOrder),
    recentTransactions: (db.transactions || []).slice(-30).reverse(),
    pendingSettlements: (db.settlements || []).filter((item) => item.status === "pending").slice(-20).reverse(),
    recentEquity: (db.dailyEquity || []).slice(-30).reverse()
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
    completedAt: run.completedAt,
    durationMs: run.durationMs,
    summary: run.type === "decision" ? run?.actions?.map((item) => `${item.action} ${item.code || ""} ${item.name || ""}`).join("；") : run?.card?.split("\n")?.[2] || "",
    card: run.card || "",
    sources: run.sources || [],
    push: run.push || null,
    error: run.error || ""
  };
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

function resetPortfolioAccount(initialCapital) {
  const config = getEffectiveConfig();
  const db = readPortfolioDb();
  db.account = createPortfolioAccount({
    ...config,
    portfolioInitialCapital: Number(initialCapital || config.portfolioInitialCapital || 100000)
  });
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
  return normalizePortfolioDb(safeReadJson(PORTFOLIO_DB_PATH));
}

function writePortfolioDb(db) {
  ensureDir(path.dirname(PORTFOLIO_DB_PATH));
  fs.writeFileSync(PORTFOLIO_DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
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
  return db;
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
    themes: {
      conceptBoards: (snapshot.themes?.conceptBoards || []).slice(0, 10),
      industryBoards: (snapshot.themes?.industryBoards || []).slice(0, 10)
    },
    fundCandidates: {
      stockFunds: (snapshot.fundCandidates?.stockFunds || []).slice(0, 8),
      hybridFunds: (snapshot.fundCandidates?.hybridFunds || []).slice(0, 8),
      indexFunds: (snapshot.fundCandidates?.indexFunds || []).slice(0, 8),
      qdiiFunds: (snapshot.fundCandidates?.qdiiFunds || []).slice(0, 8)
    },
    errors: snapshot.errors || [],
    sources: snapshot.sources || []
  };
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
  if (["decision", "valuation"].includes(type)) return type;
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

function buildFundCommitteeSystemText(skillIds = ["fund-analysis", "fund-data-enrichment"]) {
  const skillContext = buildSkillContextForIntent({ skillIds }, []);
  return [
    "你是飞书机器人“基金助手”。你的任务是根据用户发送的基金截图或基金文字信息做教育性基金筛选分析。",
    "必须严格遵循当前阶段加载的 modular skills。只使用与当前任务相关的 skill，不要把所有基金流程强行套到用户请求上。",
    "不要对截图逐字念稿。要先吸收截图事实和联网补全资料，再给出投资筛选评价。",
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
    "如果联网补全资料中包含 holdings，请优先使用 equityTopHoldings / bondTopHoldings 做持仓风格分析。港股通、QDII、债基和指数基金可能分别出现在股票投资明细、债券投资明细或资产配置字段中；不要在已有 holdings 时说缺少十大持仓。"
  ].join("\n");
}

async function buildAnalystReviewWithModel({ images, userText, messageType, extracted, enrichments }) {
  const isComparison = detectComparisonNeed({ userText, extracted, enrichments });
  const systemText = buildFundCommitteeSystemText(
    isComparison
      ? ["fund-analysis", "fund-comparison", "fund-data-enrichment"]
      : ["fund-analysis", "fund-data-enrichment"]
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
  const systemText = buildFundCommitteeSystemText(isComparison ? ["fund-comparison", "fund-analysis"] : ["fund-analysis"]);
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
        ? ["fund-synthesis", "fund-comparison", "fund-analysis"]
        : ["fund-synthesis", "fund-analysis"]
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
    "5. 主要风险与复查触发：最多 3 条。",
    "6. 缺失数据：只列真正影响结论的字段；不要把已联网补全的夏普率、回撤、波动率重复列为缺失。"
  ].join("\n");

  const finalText = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: getEffectiveConfig().modelMaxOutputTokens
  });
  updateStats({
    counters: { managerReviewCalls: 1 },
    last: { lastManagerReviewAt: new Date().toISOString() }
  });
  return finalText;
}

async function recommendFundsWithModel({ userText, intent, marketSnapshot }) {
  const skillContext = buildSkillContextForIntent(intent, ["fund-recommendation", "fund-synthesis"]);
  const systemText = [
    "你是飞书机器人“基金助手”的基金发现与配置工作流。",
    "当前任务不是分析用户已经给出的某一只基金，也不是截图 screening；当前任务是根据用户文字、公开市场快照和基金候选池，给出教育性的基金方向与候选清单。",
    "必须优先使用传入的 marketSnapshot，不要声称自己额外联网。不要编造 marketSnapshot 里没有的基金代码、涨跌幅、排名或新闻。",
    "如果数据不足以支持具体基金代码，就推荐基金方向/筛选条件，并把具体代码标为待复核。",
    "回答要大胆但有边界：证据偏正面时可以给出买入或分批买入候选；不要机械地总是等待回撤。",
    "必须说明数据滞后风险和复查条件。不要保证收益，不要给出个性化承诺。",
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
    "请输出：",
    "1. 结论：今天这类请求应看哪 2-4 个主题/方向，按优先级排序。",
    "2. 推荐清单：3-6 个候选基金或 ETF。每个候选包含代码、名称、类型/主题、为什么入选、适合激进/均衡/保守哪类、最大风险。只能使用快照中的候选代码；如果没有足够代码，就写“待复核方向”。",
    "3. 1万元配置：激进、均衡、保守三档，给具体金额或比例。",
    "4. 不买/少买条件：最多 3 条。",
    "5. 数据来源与滞后：用一句话说明来自公开市场/基金排行快照，不是实时成交建议。"
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: getEffectiveConfig().modelMaxOutputTokens
  });
  updateStats({
    counters: { fundRecommendationModelCalls: 1 },
    last: { lastFundRecommendationAt: new Date().toISOString() }
  });
  return text;
}

async function answerFundQuestionWithModel({ userText, intent, marketSnapshot }) {
  const skillContext = buildSkillContextForIntent(intent, []);
  const systemText = [
    "你是飞书机器人“基金助手”的基金问答工作流。",
    "当前任务是回答用户问题，不是单只基金 screening；除非用户给出明确基金代码或截图，否则不要强行输出 Verdict/Score/8 角色评审。",
    "如果传入 marketSnapshot，可用它回答近期市场/题材问题；如果没有实时数据，就明确说明限制。",
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
    "请直接回答用户问题。若用户实际是在要推荐基金，请提示他可以说“按最近题材推荐几个基金”，系统会进入基金发现工作流。"
  ].join("\n");

  const text = await callModel({
    systemText,
    userPrompt,
    images: [],
    maxTokens: Math.min(Number(getEffectiveConfig().modelMaxOutputTokens || 2800), 1800)
  });
  updateStats({
    counters: { fundQaModelCalls: 1 },
    last: { lastFundQaAt: new Date().toISOString() }
  });
  return text;
}

async function answerConversationWithModel({ userText, intent }) {
  const skills = listSkills(false).map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description
  }));
  const systemText = [
    "你是飞书机器人“基金助手”，也是一个可以自然对话的 GPT 助手。",
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
    maxTokens: 80
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

async function callModel({ systemText, userPrompt, images = [], maxTokens }) {
  const config = getEffectiveConfig();
  validateModelConfig(config);

  updateStats({ counters: { modelCalls: 1 }, last: { lastModelCallAt: new Date().toISOString() } });

  try {
    if (normalizeWireApi(config.modelWireApi) === "chat_completions") {
      return await callChatCompletionsApi({ config, systemText, userPrompt, images, maxTokens });
    }
    return await callResponsesApi({ config, systemText, userPrompt, images, maxTokens });
  } catch (error) {
    updateStats({ counters: { modelFailures: 1 }, last: { lastModelFailureAt: new Date().toISOString() } });
    throw error;
  }
}

async function callResponsesApi({ config, systemText, userPrompt, images, maxTokens }) {
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

  const json = await postJson(modelUrl(config, "responses"), body, {
    Authorization: `Bearer ${config.modelApiKey}`
  });

  const text = extractResponsesText(json);
  if (!text) {
    throw new Error("模型返回为空。");
  }
  return text;
}

async function callChatCompletionsApi({ config, systemText, userPrompt, images, maxTokens }) {
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
    }
  );

  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("模型返回为空。");
  }
  return text;
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

async function enrichFunds(fundCodes) {
  const uniqueCodes = mergeFundCodes(fundCodes);
  if (!uniqueCodes.length) {
    return [];
  }

  const results = [];
  for (const code of uniqueCodes.slice(0, 6)) {
    try {
      results.push(await fetchFundProfile(code));
      updateStats({ counters: { fundEnrichmentSuccess: 1 } });
    } catch (error) {
      console.error("[fund-enrichment-error]", code, error);
      recordError(error, { fundEnrichmentFailures: 1 });
      results.push({
        code,
        ok: false,
        error: error.message,
        sources: [`https://fund.eastmoney.com/${code}.html`]
      });
    }
  }

  updateStats({
    counters: { fundEnrichmentCalls: uniqueCodes.length },
    last: { lastFundEnrichmentAt: new Date().toISOString() }
  });
  return results;
}

async function fetchMarketSnapshot() {
  const fetchedAt = new Date().toISOString();
  const [conceptBoards, industryBoards, stockFunds, hybridFunds, indexFunds, qdiiFunds] = await Promise.all([
    fetchEastmoneyBoards("concept").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchEastmoneyBoards("industry").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("gp", "股票型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("hh", "混合型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("zs", "指数型基金").catch((error) => ({ ok: false, error: error.message, items: [] })),
    fetchFundRanking("qdii", "QDII基金").catch((error) => ({ ok: false, error: error.message, items: [] }))
  ]);

  const failures = [conceptBoards, industryBoards, stockFunds, hybridFunds, indexFunds, qdiiFunds].filter(
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
    ok: failures < 6,
    fetchedAt,
    note: "公开数据快照可能有延迟，基金排行更偏近期动量，不等于长期质量。",
    themes: {
      conceptBoards: conceptBoards.items || [],
      industryBoards: industryBoards.items || []
    },
    fundCandidates: {
      stockFunds: stockFunds.items || [],
      hybridFunds: hybridFunds.items || [],
      indexFunds: indexFunds.items || [],
      qdiiFunds: qdiiFunds.items || []
    },
    errors: [conceptBoards, industryBoards, stockFunds, hybridFunds, indexFunds, qdiiFunds]
      .filter((item) => item && item.ok === false)
      .map((item) => item.error),
    sources: [
      "https://push2.eastmoney.com/api/qt/clist/get",
      "https://fund.eastmoney.com/data/rankhandler.aspx"
    ]
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
      quoteTime: item.f124 ? new Date(Number(item.f124) * 1000).toISOString() : ""
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
    return {
      code: columns[0] || "",
      name: columns[1] || "",
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
  const [valuation, profileText, navHistory, holdings] = await Promise.all([
    fetchFundValuation(code).catch((error) => ({ ok: false, error: error.message })),
    fetchFundPingzhongData(code).catch(() => ""),
    fetchFundNavHistory(code).catch((error) => ({ ok: false, error: error.message, points: [] })),
    fetchFundHoldings(code).catch((error) => ({ ok: false, error: error.message, equityTopHoldings: [], bondTopHoldings: [] }))
  ]);

  const profile = parseFundPingzhongData(profileText);
  const riskMetrics = navHistory.ok
    ? computeRiskMetrics(navHistory.points)
    : { ok: false, error: navHistory.error, note: "历史净值抓取失败，无法计算夏普率/波动/回撤。" };
  return {
    ok: true,
    code,
    name: profile.name || valuation.name || "",
    snapshotDate: valuation.jzrq || "",
    unitNav: valuation.dwjz || "",
    estimatedNav: valuation.gsz || "",
    estimatedChangePct: valuation.gszzl || "",
    estimateTime: valuation.gztime || "",
    fees: {
      sourceRatePct: profile.sourceRate || "",
      currentRatePct: profile.rate || "",
      minPurchase: profile.minPurchase || ""
    },
    returns: {
      oneMonthPct: profile.syl_1y || "",
      threeMonthPct: profile.syl_3y || "",
      sixMonthPct: profile.syl_6y || "",
      oneYearPct: profile.syl_1n || ""
    },
    riskMetrics,
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
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 FundAgent/1.0",
      referer
    }
  });
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
    content: JSON.stringify(buildFeishuCard(text, kind))
  };
}

function buildFeishuCard(text, kind) {
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

  if (kind === "answer") {
    elements.push(
      { tag: "hr" },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "基金助手会按请求选择截图识别、公开数据补全或市场快照；结论仅供研究参考，不构成收益承诺。"
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
    progress: { template: "blue", title: "🔎 基金助手正在处理" },
    answer: { template: "turquoise", title: "📊 基金分析完成" },
    portfolio: { template: "green", title: "🧭 虚拟基金经理" },
    error: { template: "red", title: "⚠️ 分析遇到问题" },
    noContent: { template: "yellow", title: "📷 请发送基金截图" },
    reply: { template: "wathet", title: "基金助手" }
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

async function postJson(url, body, headers = {}) {
  const attempts = Number(process.env.HTTP_RETRY_ATTEMPTS || 3);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...headers
        },
        body: JSON.stringify(body)
      });

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

function isRetryableHttpError(error) {
  const code = error?.cause?.code || error?.code || "";
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
    replyMaxChars: Number(process.env.FEISHU_REPLY_MAX_CHARS || 7000),
    portfolioEnabled: parseBoolean(process.env.PORTFOLIO_ENABLED, false),
    portfolioInitialCapital: Number(process.env.PORTFOLIO_INITIAL_CAPITAL || 100000),
    portfolioDecisionTime: process.env.PORTFOLIO_DECISION_TIME || "14:20",
    portfolioReviewTime: process.env.PORTFOLIO_REVIEW_TIME || "21:30",
    portfolioTimezone: process.env.PORTFOLIO_TIMEZONE || "Asia/Shanghai",
    portfolioRetentionDays: Number(process.env.PORTFOLIO_RETENTION_DAYS || 90),
    portfolioPushReceiveId: process.env.PORTFOLIO_PUSH_RECEIVE_ID || "",
    portfolioPushReceiveType: process.env.PORTFOLIO_PUSH_RECEIVE_TYPE || "chat_id",
    portfolioAutoBindLastChat: parseBoolean(process.env.PORTFOLIO_AUTO_BIND_LAST_CHAT, true),
    portfolioRiskProfile: process.env.PORTFOLIO_RISK_PROFILE || "balanced"
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
  next.replyMaxChars = Number(next.replyMaxChars || 7000);
  next.portfolioEnabled = parseBoolean(next.portfolioEnabled, false);
  next.portfolioInitialCapital = Math.max(1000, Number(next.portfolioInitialCapital || 100000));
  next.portfolioDecisionTime = normalizeClockTime(next.portfolioDecisionTime, "14:20");
  next.portfolioReviewTime = normalizeClockTime(next.portfolioReviewTime, "21:30");
  next.portfolioTimezone = String(next.portfolioTimezone || "Asia/Shanghai").trim() || "Asia/Shanghai";
  next.portfolioRetentionDays = Math.max(7, Math.min(3650, Number(next.portfolioRetentionDays || 90)));
  next.portfolioPushReceiveId = String(next.portfolioPushReceiveId || "").trim();
  next.portfolioPushReceiveType = String(next.portfolioPushReceiveType || "chat_id").trim() || "chat_id";
  next.portfolioAutoBindLastChat = parseBoolean(next.portfolioAutoBindLastChat, true);
  next.portfolioRiskProfile = String(next.portfolioRiskProfile || "balanced").trim() || "balanced";
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
      replyMaxChars: Number(config.replyMaxChars || 7000),
      portfolioEnabled: String(Boolean(config.portfolioEnabled)),
      portfolioInitialCapital: Number(config.portfolioInitialCapital || 100000),
      portfolioDecisionTime: config.portfolioDecisionTime || "14:20",
      portfolioReviewTime: config.portfolioReviewTime || "21:30",
      portfolioTimezone: config.portfolioTimezone || "Asia/Shanghai",
      portfolioRetentionDays: Number(config.portfolioRetentionDays || 90),
      portfolioPushReceiveId: config.portfolioPushReceiveId || "",
      portfolioPushReceiveType: config.portfolioPushReceiveType || "chat_id",
      portfolioAutoBindLastChat: String(Boolean(config.portfolioAutoBindLastChat)),
      portfolioRiskProfile: config.portfolioRiskProfile || "balanced"
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
    "portfolioDecisionTime",
    "portfolioReviewTime",
    "portfolioTimezone",
    "portfolioPushReceiveId",
    "portfolioPushReceiveType",
    "portfolioRiskProfile"
  ];
  const numericFields = ["modelMaxOutputTokens", "replyMaxChars", "portfolioInitialCapital", "portfolioRetentionDays"];
  const booleanFields = ["portfolioEnabled", "portfolioAutoBindLastChat"];
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
      fundHoldingsFetches: 0,
      fundHoldingsFailures: 0,
      marketSnapshotCalls: 0,
      marketSnapshotFailures: 0,
      marketBoardFetches: 0,
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
      portfolioDecisionRuns: 0,
      portfolioValuationRuns: 0,
      portfolioManagerModelCalls: 0,
      portfolioReviewModelCalls: 0,
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
    .replace(/@\s*基金助手/g, " ")
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
      skillIds: ["fund-vision", "fund-data-enrichment", "fund-analysis", "fund-comparison", "fund-synthesis"],
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
      skillIds: ["fund-portfolio-manager"],
      messageType
    };
  }

  if (fundCodes.length) {
    return {
      workflow: "fund_screening",
      mode: fundCodes.length > 1 ? "comparison_or_specific_fund" : "specific_fund_or_fund_name",
      reason: "text_contains_fund_code",
      fundCodes,
      skillIds: ["fund-data-enrichment", "fund-analysis", "fund-comparison", "fund-synthesis"],
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
      skillIds: ["fund-recommendation", "fund-synthesis"],
      messageType
    };
  }

  if (fundCodes.length || (hasFundWord && (asksSpecificAction || asksCompare))) {
    return {
      workflow: "fund_screening",
      mode: asksCompare || fundCodes.length > 1 ? "comparison_or_specific_fund" : "specific_fund_or_fund_name",
      reason: "fallback_text_mentions_specific_fund_action",
      fundCodes,
      skillIds: ["fund-data-enrichment", "fund-analysis", "fund-synthesis"],
      messageType
    };
  }

  return {
    workflow: looksLikeConversation(text) ? "conversation" : "fund_qa",
    mode: shouldFetchMarketSnapshotForQuestion(text) ? "market_question" : "general_fund_question",
    reason: "fallback_no_image_no_specific_fund_recommendation",
    fundCodes,
    skillIds: looksLikeConversation(text) ? [] : [],
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
    "你是基金助手的意图路由器。只返回 JSON，不要解释。",
    "你的任务是先理解用户想做什么，再选择工作流和需要加载的 skill。",
    "不要因为机器人名称叫基金助手，就把自我介绍、寒暄、能力询问、普通聊天强行归类到基金工作流。",
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
    '{"workflow":"conversation|portfolio_status|fund_recommendation|fund_screening|fund_qa","mode":"short label","reason":"brief reason","skillIds":["fund-portfolio-manager"],"confidence":0.0}'
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
  const availableSkillIds = new Set(listSkills(false).map((skill) => skill.id));
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
  if (workflow === "portfolio_status") return ["fund-portfolio-manager"];
  if (workflow === "fund_recommendation") return ["fund-recommendation", "fund-synthesis"];
  if (workflow === "fund_screening") return ["fund-data-enrichment", "fund-analysis", "fund-synthesis"];
  if (workflow === "fund_qa") return [];
  return [];
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
  return hasAny(normalized, ["最近", "最新", "当前", "现在", "市场", "行情", "题材", "热点", "板块", "赛道", "机会"]);
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
    "你现在卖了"
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
    "复盘"
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
