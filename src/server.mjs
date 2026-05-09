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
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const PUBLIC_DIR = path.join(ROOT, "public");
const SKILLS_DIR = path.join(ROOT, "skills");

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
      sendJson(res, 200, {
        ok: true,
        service: "feishu-fund-assistant",
        configured: getConfigStatus(config),
        skills: listSkills(false).length
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
    sendJson(res, 200, { code: 0, msg: "duplicate ignored" });
    return;
  }

  sendJson(res, 200, { code: 0, msg: "ok" });

  if (isMessageReceiveEvent(payload)) {
    setImmediate(() => {
      handleMessageEvent(payload).catch((error) => {
        console.error("[message-event-error]", error);
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

  const imageKey = extractFirstImageKey(parsedContent);
  const userText = extractUserText(message.message_type, parsedContent);

  if (!imageKey && !userText) {
    await replyToMessage(
      message.message_id,
      "请发送基金截图，或直接发送基金名称、代码和关键指标，我会按 fund-screening 规则做简要评价。"
    );
    return;
  }

  try {
    const image = imageKey ? await downloadMessageImage(message.message_id, imageKey) : null;
    const analysis = await analyzeFundWithModel({
      image,
      userText,
      messageType: message.message_type
    });
    await replyToMessage(message.message_id, normalizeFeishuText(analysis));
  } catch (error) {
    console.error("[analysis-error]", error);
    await replyToMessage(
      message.message_id,
      [
        "这次没有完成基金分析。",
        `原因：${error.message}`,
        "可以稍后重试，或直接发送基金名称/代码、近 1/3/5 年收益、最大回撤、费率、基金经理任期等关键数据。"
      ].join("\n")
    );
  }
}

async function analyzeFundWithModel({ image, userText, messageType }) {
  const skill = loadPrimarySkill();
  const systemText = [
    "你是飞书机器人“基金助手”。你的任务是根据用户发送的基金截图或基金文字信息做教育性基金筛选分析。",
    "必须严格遵循下面的 fund-screening skill：截图先保守提取可见事实；字段缺失或看不清要明确写 N/A 或“缺失”；不要编造收益、回撤、费率、排名、持仓或基金经理信息。",
    "回答中文，优先简洁。默认使用 normal screening mode，除非输入明显高风险或数据严重不足。不要保证收益，不要给出个性化承诺。",
    "",
    skill.content
  ].join("\n");

  const userPrompt = [
    "用户通过飞书发送了一条基金相关消息。",
    `消息类型：${messageType || "unknown"}`,
    userText ? `用户文字：${userText}` : "用户文字：无",
    image ? "图片：已附上，请直接识别截图中的基金信息。" : "图片：无，请只根据用户文字分析。",
    "",
    "请输出：Verdict、Confidence、可见事实/缺失字段、评分或无法评分原因、前三个优点、前三个主要风险、下一步需要补充的数据。"
  ].join("\n");

  return callModel({ systemText, userPrompt, image, maxTokens: getEffectiveConfig().modelMaxOutputTokens });
}

async function testModelConnection() {
  const text = await callModel({
    systemText: "你是一个连通性测试助手。",
    userPrompt: "请只回复：OK",
    image: null,
    maxTokens: 80
  });

  return {
    ok: true,
    message: "模型通信正常",
    response: text.slice(0, 500)
  };
}

async function testFeishuConnection() {
  const token = await getTenantAccessToken();
  return {
    ok: true,
    message: "飞书 app_id/app_secret 通信正常，tenant_access_token 获取成功。消息收发权限请用真实飞书消息做最终验证。",
    tokenPreview: `${token.slice(0, 8)}...${token.slice(-6)}`
  };
}

async function callModel({ systemText, userPrompt, image, maxTokens }) {
  const config = getEffectiveConfig();
  validateModelConfig(config);

  if (normalizeWireApi(config.modelWireApi) === "chat_completions") {
    return callChatCompletionsApi({ config, systemText, userPrompt, image, maxTokens });
  }
  return callResponsesApi({ config, systemText, userPrompt, image, maxTokens });
}

async function callResponsesApi({ config, systemText, userPrompt, image, maxTokens }) {
  const content = [{ type: "input_text", text: userPrompt }];
  if (image) {
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

async function callChatCompletionsApi({ config, systemText, userPrompt, image, maxTokens }) {
  const userContent = [{ type: "text", text: userPrompt }];
  if (image) {
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
  return { mimeType, buffer };
}

async function replyToMessage(messageId, text) {
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

function extractFirstImageKey(value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  if (typeof value.image_key === "string") {
    return value.image_key;
  }
  if (typeof value.file_key === "string") {
    return value.file_key;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = extractFirstImageKey(item);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = extractFirstImageKey(child);
      if (found) return found;
    }
  }
  return "";
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

function collectText(value, pieces) {
  if (!value) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) pieces.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, pieces);
    return;
  }
  if (typeof value === "object") {
    if (typeof value.text === "string" && value.text.trim()) pieces.push(value.text.trim());
    for (const child of Object.values(value)) {
      if (child !== value.text) collectText(child, pieces);
    }
  }
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
