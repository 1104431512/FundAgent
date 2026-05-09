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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const PUBLIC_DIR = path.join(ROOT, "public");
const SKILLS_DIR = path.join(ROOT, "skills");
const STARTED_AT = new Date();

let tenantAccessTokenCache = null;
const seenEventIds = new Map();

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
      "请发送基金截图，或直接发送基金名称、代码和关键指标，我会按 fund-screening 规则做简要评价。",
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
    await replyToMessage(message.message_id, buildProgressMessage(imageKeys.length, userText), {
      kind: "progress"
    }).catch((error) => {
      console.error("[progress-reply-error]", error);
      recordError(error, { replyFailures: 1 });
    });

    await replyToMessage(message.message_id, "进度：正在识别截图中的基金代码和关键字段。", {
      kind: "progress"
    }).catch((error) => {
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

    const analysis = await analyzeFundWithModel({
      images,
      userText,
      messageType: message.message_type,
      extracted,
      enrichments
    });
    await replyToMessage(
      message.message_id,
      normalizeFeishuText([buildCompletionPrefix(images.length, userText), analysis].filter(Boolean).join("\n\n")),
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

async function extractFundFactsWithModel({ images, userText, messageType }) {
  if (!images?.length) {
    return { fundCodes: extractFundCodes(userText), visibleFacts: userText ? [userText] : [], missingFields: [] };
  }

  const systemText = [
    "你只负责从基金截图中提取可见事实，不做投资评价。",
    "请只返回 JSON，不要 Markdown，不要解释。",
    "如果看不清，不要猜。基金代码必须是截图中可见或用户文字中明确出现的 6 位数字。"
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

async function analyzeFundWithModel({ images, userText, messageType, extracted, enrichments }) {
  const skill = loadPrimarySkill();
  const systemText = [
    "你是飞书机器人“基金助手”。你的任务是根据用户发送的基金截图或基金文字信息做教育性基金筛选分析。",
    "必须严格遵循下面的 fund-screening skill：截图先保守提取可见事实；字段缺失或看不清要明确写 N/A 或“缺失”；不要编造收益、回撤、费率、排名、持仓或基金经理信息。",
    "不要对截图逐字念稿。要先吸收截图事实和联网补全资料，再给出投资筛选评价。",
    "如果联网补全资料与截图冲突，要明确分开“截图可见”和“联网补全”，不要硬合并。",
    "回答中文，优先简洁。默认使用 normal screening mode，除非输入明显高风险或数据严重不足。不要保证收益，不要给出个性化承诺。",
    "",
    skill.content
  ].join("\n");

  const userPrompt = [
    "用户通过飞书发送了一条基金相关消息。",
    `消息类型：${messageType || "unknown"}`,
    userText ? `用户文字：${userText}` : "用户文字：无",
    images?.length
      ? `图片：已附上 ${images.length} 张。请逐张识别截图中的基金信息；如果多张图属于同一只基金，请合并分析；如果是多只基金，请分别给出简短结论并说明对比。`
      : "图片：无，请只根据用户文字分析。",
    "",
    "截图事实提取结果：",
    JSON.stringify(extracted || {}, null, 2),
    "",
    "联网补全资料：",
    JSON.stringify(enrichments || [], null, 2),
    "",
    "请输出：Verdict、Confidence、可见事实/缺失字段、评分或无法评分原因、前三个优点、前三个主要风险、下一步需要补充的数据。"
  ].join("\n");

  return callModel({ systemText, userPrompt, images, maxTokens: getEffectiveConfig().modelMaxOutputTokens });
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
    max_output_tokens: Number(maxTokens || config.modelMaxOutputTokens || 1800)
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
      max_tokens: Number(maxTokens || config.modelMaxOutputTokens || 1800)
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

async function fetchFundProfile(code) {
  const [valuation, profileText] = await Promise.all([
    fetchFundValuation(code).catch((error) => ({ ok: false, error: error.message })),
    fetchFundPingzhongData(code)
  ]);

  const profile = parseFundPingzhongData(profileText);
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
    scale: profile.scale,
    assetAllocation: profile.assetAllocation,
    performanceEvaluation: profile.performanceEvaluation,
    managers: profile.managers,
    topStocks: profile.topStocks,
    sources: [
      `https://fundgz.1234567.com.cn/js/${code}.js`,
      `https://fund.eastmoney.com/pingzhongdata/${code}.js`,
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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 FundAgent/1.0",
      referer: "https://fund.eastmoney.com/"
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

async function replyToMessage(messageId, text, options = {}) {
  const config = getEffectiveConfig();
  const token = await getTenantAccessToken(config);
  const url = new URL(`/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, config.feishuBaseUrl);

  await postJson(
    url,
    {
      msg_type: "text",
      content: JSON.stringify({ text })
    },
    {
      Authorization: `Bearer ${token}`
    }
  );
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
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  if (json && typeof json.code === "number" && json.code !== 0 && !json.output && !json.choices) {
    throw new Error(json.msg || JSON.stringify(json));
  }

  return json ?? text;
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
    modelMaxOutputTokens: Number(process.env.MODEL_MAX_OUTPUT_TOKENS || 1800),
    replyMaxChars: Number(process.env.FEISHU_REPLY_MAX_CHARS || 6000)
  };

  return {
    ...envConfig,
    ...safeReadJson(CONFIG_PATH)
  };
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
      modelMaxOutputTokens: Number(config.modelMaxOutputTokens || 1800),
      replyMaxChars: Number(config.replyMaxChars || 6000)
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
    "modelReasoningEffort"
  ];
  const numericFields = ["modelMaxOutputTokens", "replyMaxChars"];
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

  next.modelWireApi = normalizeWireApi(next.modelWireApi || "responses");
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
      extractionCalls: 0,
      extractionFailures: 0,
      extractedFundCodes: 0,
      fundEnrichmentCalls: 0,
      fundEnrichmentSuccess: 0,
      fundEnrichmentFailures: 0,
      modelCalls: 0,
      modelFailures: 0,
      repliesSent: 0,
      progressReplies: 0,
      answersSent: 0,
      errorReplies: 0,
      replyFailures: 0,
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

function loadPrimarySkill() {
  const skills = listSkills(true);
  const preferred =
    skills.find((skill) => skill.id === "fund-screening") ||
    skills.find((skill) => skill.name.toLowerCase().includes("fund")) ||
    skills[0];
  if (!preferred) {
    throw new Error("未找到任何 skill，请在 skills 目录添加 .md 文件。");
  }
  return preferred;
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
    return content.text.trim();
  }
  if (typeof content.text === "string") {
    return content.text.trim();
  }
  if (content.title || content.content) {
    const pieces = [];
    collectText(content, pieces);
    return pieces.join("\n").trim();
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
  parts.push("我会先识别截图，再联网补全基金资料，最后按 fund-screening 给出评价。");
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
  const cleaned = String(text || "").trim();
  const maxLength = Number(config.replyMaxChars || 6000);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 80)}\n\n（回复过长，已截断。可继续发送“详细分析”并附基金名称/代码。）`;
}

function normalizeWireApi(value) {
  const wireApi = String(value || "responses").toLowerCase().replace("-", "_");
  if (wireApi === "chat" || wireApi === "chat_completions") {
    return "chat_completions";
  }
  return "responses";
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "").toLowerCase();
  if (!effort || effort === "none") return "";
  if (effort === "xhigh") return "high";
  if (["minimal", "low", "medium", "high"].includes(effort)) return effort;
  return "high";
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
