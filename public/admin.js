const form = document.querySelector("#configForm");
const toast = document.querySelector("#toast");
const output = document.querySelector("#testOutput");
const portfolioOutput = document.querySelector("#portfolioOutput");
const modelStatus = document.querySelector("#modelStatus");
const feishuStatus = document.querySelector("#feishuStatus");
const authPanel = document.querySelector("#authPanel");
const adminTokenInput = document.querySelector("#adminToken");

let currentSkills = [];

const tokenFromUrl = new URLSearchParams(location.search).get("token");
if (tokenFromUrl) {
  localStorage.setItem("fundagent_admin_token", tokenFromUrl);
  history.replaceState(null, "", location.pathname);
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
});

document.querySelector("#saveTokenBtn").addEventListener("click", () => {
  localStorage.setItem("fundagent_admin_token", adminTokenInput.value.trim());
  showToast("令牌已保存");
  loadAll().catch(showError);
});

document.querySelector("#reloadBtn").addEventListener("click", () => loadAll().catch(showError));
document.querySelector("#refreshStatsBtn").addEventListener("click", () => loadStats().catch(showError));
document.querySelector("#refreshPortfolioBtn").addEventListener("click", () => loadPortfolio().catch(showError));
document.querySelector("#runDecisionBtn").addEventListener("click", () => runPortfolioTask("decision"));
document.querySelector("#runValuationBtn").addEventListener("click", () => runPortfolioTask("valuation"));
document.querySelector("#prunePortfolioBtn").addEventListener("click", () => prunePortfolio());
document.querySelector("#resetPortfolioBtn").addEventListener("click", () => resetPortfolio());
document.querySelector("#testModelBtn").addEventListener("click", () => runTest("model"));
document.querySelector("#testFeishuBtn").addEventListener("click", () => runTest("feishu"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.modelMaxOutputTokens = Number(payload.modelMaxOutputTokens || 2800);
  payload.replyMaxChars = Number(payload.replyMaxChars || 7000);
  payload.portfolioInitialCapital = Number(payload.portfolioInitialCapital || 100000);
  payload.portfolioRetentionDays = Number(payload.portfolioRetentionDays || 90);

  const result = await apiFetch("/api/config", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  applyConfig(result.config);
  await loadPortfolio();
  showToast("配置已保存");
});

loadAll().catch(showError);

function activateTab(tab) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
}

async function loadAll() {
  await loadConfig();
  await Promise.all([loadStats(), loadSkills(), loadPortfolio()]);
}

async function loadConfig() {
  const config = await apiFetch("/api/config");
  applyConfig(config);
  authPanel.classList.toggle("hidden", !config.adminProtected);
}

function applyConfig(payload) {
  const values = payload.values || {};
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements[name];
    if (field) {
      field.value = value ?? "";
    }
  }

  setSecretHint("modelApiKeyHint", payload.masked?.modelApiKey);
  setSecretHint("feishuAppSecretHint", payload.masked?.feishuAppSecret);
  setSecretHint("feishuVerificationTokenHint", payload.masked?.feishuVerificationToken);
  setSecretHint("feishuEncryptKeyHint", payload.masked?.feishuEncryptKey);
  updateStatus(modelStatus, payload.status?.model, "Model configured", "Model missing");
  updateStatus(feishuStatus, payload.status?.feishu, "Feishu configured", "Feishu missing");
}

function setSecretHint(id, value) {
  const node = document.querySelector(`#${id}`);
  node.textContent = value ? `当前：${value}。留空会保持不变。` : "未配置";
}

async function loadSkills() {
  const result = await apiFetch("/api/skills");
  currentSkills = result.skills || [];
  document.querySelector("#skillCount").textContent = `${result.count || 0}`;

  const list = document.querySelector("#skillList");
  list.innerHTML = "";

  for (const skill of currentSkills) {
    const item = document.createElement("div");
    item.className = "skill-item";
    item.innerHTML = `
      <div>
        <h3>${escapeHtml(skill.name)}</h3>
        <p>${escapeHtml(skill.description)}</p>
        <div class="skill-meta">${escapeHtml(skill.path)} · ${skill.bytes} bytes</div>
      </div>
      <button type="button" class="secondary" data-skill="${escapeHtml(skill.id)}">查看</button>
    `;
    list.appendChild(item);
  }

  list.querySelectorAll("button[data-skill]").forEach((button) => {
    button.addEventListener("click", () => {
      const skill = currentSkills.find((item) => item.id === button.dataset.skill);
      document.querySelector("#skillDetail").value = skill?.content || "";
    });
  });

  document.querySelector("#skillDetail").value = currentSkills[0]?.content || "";
}

async function loadStats() {
  const result = await apiFetch("/api/stats");
  const stats = result.stats || {};
  const counters = stats.counters || {};
  setText("#statConversations", counters.conversations || 0);
  setText("#statImages", counters.imagesReceived || 0);
  setText("#statAnswers", counters.answersSent || 0);
  setText("#statChat", counters.conversationRequests || 0);
  setText("#statScreening", counters.screeningRequests || 0);
  setText("#statRecommendation", counters.fundRecommendationRequests || 0);
  setText("#statQa", counters.fundQaRequests || 0);
  setText("#statRouter", counters.intentRouterCalls || 0);
  setText("#statProgress", counters.progressReplies || 0);
  setText("#statModelCalls", counters.modelCalls || 0);
  setText("#statAnalyst", counters.analystReviewCalls || 0);
  setText("#statVote", counters.committeeVoteCalls || 0);
  setText("#statManager", counters.managerReviewCalls || 0);
  setText("#statMarket", counters.marketSnapshotCalls || 0);
  setText("#statEnrich", counters.fundEnrichmentSuccess || 0);
  setText("#statHoldings", counters.fundHoldingsFetches || 0);
  setText("#statPortfolioStatus", counters.portfolioStatusRequests || 0);
  setText("#statPortfolioRuns", counters.portfolioRuns || 0);
  setText("#statPortfolioPushes", counters.portfolioPushes || 0);
  setText("#statErrors", counters.errors || 0);
  setText("#statEvents", counters.messageEvents || 0);
  document.querySelector("#statsOutput").textContent = JSON.stringify(
    {
      startedAt: stats.startedAt,
      updatedAt: stats.updatedAt,
      last: stats.last,
      counters
    },
    null,
    2
  );
}

async function loadPortfolio() {
  const result = await apiFetch("/api/portfolio");
  const portfolio = result.portfolio || {};
  const account = portfolio.account || {};
  setText("#portfolioTotalAsset", formatMoney(account.totalAsset));
  setText("#portfolioCash", formatMoney(account.cash));
  setText("#portfolioPositionWeight", `${account.positionWeightPct || 0}%`);
  setText("#portfolioPnl", `${formatSigned(account.cumulativePnl)} (${formatSigned(account.cumulativePnlPct)}%)`);
  setText(
    "#portfolioSchedule",
    `${portfolio.enabled ? "已启用" : "已停用"} · 决策 ${portfolio.scheduler?.decisionTime || "-"} · 复盘 ${
      portfolio.scheduler?.reviewTime || "-"
    }`
  );
  setText(
    "#portfolioPushTarget",
    portfolio.pushTarget
      ? `${portfolio.pushTarget.receiveIdType}: ${portfolio.pushTarget.receiveIdMasked}`
      : "未绑定"
  );
  setText("#portfolioRetention", `${portfolio.retentionDays || 90} 天`);
  renderPositions(portfolio.positions || []);
  renderRuns(portfolio.recentRuns || []);
  renderTransactions(portfolio.recentTransactions || []);
  renderEquity(portfolio.recentEquity || []);
  portfolioOutput.textContent = JSON.stringify(portfolio, null, 2);
}

function renderPositions(positions) {
  const list = document.querySelector("#positionList");
  if (!positions.length) {
    list.innerHTML = `<div class="empty">暂无持仓。第一次手动触发“生成今日操作”后，这里会显示虚拟买入/卖出后的账户。</div>`;
    return;
  }
  list.innerHTML = positions
    .map(
      (item) => `
        <div class="data-row">
          <div>
            <strong>${escapeHtml(item.code)} ${escapeHtml(item.name)}</strong>
            <p>${escapeHtml(item.lastReason || "暂无最近操作理由")}</p>
          </div>
          <div>${formatMoney(item.currentValue)}</div>
          <div>${item.weightPct || 0}%</div>
          <div>${formatSigned(item.unrealizedPnl)} / ${formatSigned(item.unrealizedPnlPct)}%</div>
        </div>
      `
    )
    .join("");
}

function renderRuns(runs) {
  const list = document.querySelector("#runList");
  if (!runs.length) {
    list.innerHTML = `<div class="empty">暂无决策记录。</div>`;
    return;
  }
  list.innerHTML = runs
    .map(
      (run) => `
        <details class="run-item">
          <summary>
            <span>${escapeHtml(run.date || "")} · ${escapeHtml(run.title || run.type || "")}</span>
            <strong class="${run.status === "failed" ? "bad-text" : "ok-text"}">${escapeHtml(run.status || "")}</strong>
          </summary>
          <pre>${escapeHtml(run.card || run.error || "无内容")}</pre>
        </details>
      `
    )
    .join("");
}

function renderTransactions(transactions) {
  const list = document.querySelector("#transactionList");
  if (!transactions.length) {
    list.innerHTML = `<div class="empty">暂无交易流水。</div>`;
    return;
  }
  list.innerHTML = transactions
    .map(
      (item) => `
        <div class="mini-row">
          <strong>${escapeHtml(item.side || "")} ${escapeHtml(item.code || "")}</strong>
          <span>${formatMoney(item.amount)}</span>
          <small>${escapeHtml(item.date || "")}</small>
        </div>
      `
    )
    .join("");
}

function renderEquity(equity) {
  const list = document.querySelector("#equityList");
  if (!equity.length) {
    list.innerHTML = `<div class="empty">暂无估值记录。</div>`;
    return;
  }
  list.innerHTML = equity
    .map(
      (item) => `
        <div class="mini-row">
          <strong>${escapeHtml(item.date || "")}</strong>
          <span>${formatMoney(item.totalAsset)}</span>
          <small>${formatSigned(item.dayPnl)} 当日</small>
        </div>
      `
    )
    .join("");
}

async function runPortfolioTask(type) {
  const button = document.querySelector(type === "decision" ? "#runDecisionBtn" : "#runValuationBtn");
  button.disabled = true;
  portfolioOutput.textContent = "运行中。这个任务会调用模型和公开数据源，可能需要几十秒。";
  try {
    const result = await apiFetch("/api/portfolio/run", {
      method: "POST",
      body: JSON.stringify({ type })
    });
    showToast(type === "decision" ? "今日操作已生成" : "晚间估值已更新");
    renderPortfolioResult(result);
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}

async function prunePortfolio() {
  const result = await apiFetch("/api/portfolio/prune", { method: "POST" });
  showToast("过期数据已清理");
  renderPortfolioResult(result);
}

async function resetPortfolio() {
  if (!confirm("确定要重置虚拟组合账户吗？历史决策记录会保留，但当前现金和持仓会回到初始本金。")) {
    return;
  }
  const result = await apiFetch("/api/portfolio/reset", {
    method: "POST",
    body: JSON.stringify({ initialCapital: Number(form.elements.portfolioInitialCapital.value || 100000) })
  });
  showToast("组合已重置");
  renderPortfolioResult(result);
}

function renderPortfolioResult(result) {
  const portfolio = result.portfolio || result;
  loadStats().catch(showError);
  setTimeout(() => loadPortfolio().catch(showError), 0);
  portfolioOutput.textContent = JSON.stringify(portfolio, null, 2);
}

async function runTest(type) {
  const button = document.querySelector(type === "model" ? "#testModelBtn" : "#testFeishuBtn");
  const textNode = document.querySelector(type === "model" ? "#modelTestText" : "#feishuTestText");
  const statusNode = type === "model" ? modelStatus : feishuStatus;
  button.disabled = true;
  textNode.textContent = "Running";
  output.textContent = "";

  try {
    const result = await apiFetch(`/api/test/${type}`, { method: "POST" });
    textNode.textContent = result.message || "OK";
    output.textContent = JSON.stringify(result, null, 2);
    statusNode.textContent = type === "model" ? "Model OK" : "Feishu OK";
    statusNode.className = "badge ok";
  } catch (error) {
    textNode.textContent = error.message;
    output.textContent = error.stack || error.message;
    statusNode.textContent = type === "model" ? "Model failed" : "Feishu failed";
    statusNode.className = "badge bad";
  } finally {
    button.disabled = false;
  }
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("fundagent_admin_token") || "";
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-admin-token": token } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (response.status === 401) {
    authPanel.classList.remove("hidden");
    throw new Error(data.error || "Admin token required");
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function updateStatus(node, ok, okText, badText) {
  node.textContent = ok ? okText : badText;
  node.className = ok ? "badge ok" : "badge warn";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2200);
}

function showError(error) {
  const target = document.querySelector("[data-panel='portfolio'].active") ? portfolioOutput : output;
  target.textContent = error.stack || error.message;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function formatMoney(value) {
  const number = Number(value || 0);
  return `${number.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 元`;
}

function formatSigned(value) {
  const number = Number(value || 0);
  const text = number.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  return number > 0 ? `+${text}` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
