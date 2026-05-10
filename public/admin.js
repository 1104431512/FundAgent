const form = document.querySelector("#configForm");
const toast = document.querySelector("#toast");
const output = document.querySelector("#testOutput");
const portfolioOutput = document.querySelector("#portfolioOutput");
const modelStatus = document.querySelector("#modelStatus");
const feishuStatus = document.querySelector("#feishuStatus");
const authPanel = document.querySelector("#authPanel");
const adminTokenInput = document.querySelector("#adminToken");

let currentSkills = [];
let portfolioPollTimer = null;
let portfolioPollFailures = 0;

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
document.querySelector("#runPremarketBtn").addEventListener("click", () => runPortfolioTask("premarket"));
document.querySelector("#runDecisionBtn").addEventListener("click", () => runPortfolioTask("decision"));
document.querySelector("#runValuationBtn").addEventListener("click", () => runPortfolioTask("valuation"));
document.querySelector("#runWeeklyBtn").addEventListener("click", () => runPortfolioTask("weekly"));
document.querySelector("#cancelPortfolioBtn").addEventListener("click", () => cancelPortfolioTask());
document.querySelector("#prunePortfolioBtn").addEventListener("click", () => prunePortfolio());
document.querySelector("#resetPortfolioBtn").addEventListener("click", () => resetPortfolio());
document.querySelector("#testModelBtn").addEventListener("click", () => runTest("model"));
document.querySelector("#testFeishuBtn").addEventListener("click", () => runTest("feishu"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.modelMaxOutputTokens = Number(payload.modelMaxOutputTokens || 2800);
  payload.modelHttpTimeoutMs = Number(payload.modelHttpTimeoutMs || 0);
  payload.replyMaxChars = Number(payload.replyMaxChars || 7000);
  payload.portfolioInitialCapital = Number(payload.portfolioInitialCapital || 100000);
  payload.portfolioRetentionDays = Number(payload.portfolioRetentionDays || 90);
  payload.portfolioWeeklyReviewDay = Number(payload.portfolioWeeklyReviewDay ?? 5);

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
  setText("#statPortfolioVerifiedTrades", counters.portfolioNavVerifiedTrades || 0);
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
  const result = await apiFetch("/api/portfolio", { timeoutMs: 45000 });
  const portfolio = result.portfolio || {};
  const account = portfolio.account || {};
  setText("#portfolioTotalAsset", formatMoney(account.totalAsset));
  setText("#portfolioCash", formatMoney(account.cash));
  setText("#portfolioPositionWeight", `${account.positionWeightPct || 0}%`);
  setText("#portfolioPending", `${formatMoney(Number(account.pendingBuyAmount || 0) + Number(account.receivableCash || 0))}`);
  setText("#portfolioPnl", `${formatSigned(account.cumulativePnl)} (${formatSigned(account.cumulativePnlPct)}%)`);
  setText("#portfolioSchedule", formatPortfolioSchedule(portfolio));
  setText(
    "#portfolioPushTarget",
    portfolio.pushTarget
      ? `${portfolio.pushTarget.receiveIdType}: ${portfolio.pushTarget.receiveIdMasked}`
      : "未绑定"
  );
  setText("#portfolioRetention", `${portfolio.retentionDays || 90} 天`);
  renderOrders(portfolio.activeOrders || []);
  renderPositions(portfolio.positions || []);
  renderRuns(portfolio.recentRuns || []);
  renderTransactions(portfolio.recentTransactions || []);
  renderEquity(portfolio.recentEquity || []);
  const inFlight = Boolean(portfolio.scheduler?.inFlight);
  updatePortfolioTaskButtons(inFlight);
  if (inFlight) {
    startPortfolioPolling();
  } else {
    stopPortfolioPolling();
  }
  portfolioOutput.textContent = formatPortfolioOutput(portfolio);
}

function formatPortfolioOutput(portfolio) {
  const account = portfolio.account || {};
  const latestRun = (portfolio.recentRuns || [])[0];
  const lines = [
    `总资产：${formatMoney(account.totalAsset)}，现金：${formatMoney(account.cash)}，仓位：${account.positionWeightPct || 0}%`,
    `待确认/应收：${formatMoney(Number(account.pendingBuyAmount || 0) + Number(account.receivableCash || 0))}，累计盈亏：${formatSigned(account.cumulativePnl)} (${formatSigned(account.cumulativePnlPct)}%)`
  ];
  if (latestRun) {
    lines.push("");
    lines.push(`最近任务：${latestRun.date || "-"} · ${latestRun.type || "-"} · ${latestRun.status || "-"}`);
    lines.push(`进度：${latestRun.summary || "-"}`);
    if (latestRun.startedAt) lines.push(`开始：${formatDateTime(latestRun.startedAt)}`);
    if (latestRun.progressAt) lines.push(`更新：${formatDateTime(latestRun.progressAt)}`);
    if (latestRun.completedAt) lines.push(`结束：${formatDateTime(latestRun.completedAt)}`);
    if (latestRun.error) lines.push(`错误：${latestRun.error}`);
  }
  if (portfolio.scheduler?.dbFlushError) {
    lines.push("");
    lines.push(`数据保存异常：${portfolio.scheduler.dbFlushError}`);
  }
  return lines.join("\n");
}

function formatPortfolioSchedule(portfolio) {
  const scheduler = portfolio.scheduler || {};
  const weeklyDay = formatWeekday(scheduler.weeklyReviewDay ?? 5);
  return [
    portfolio.enabled ? "已启用" : "已停用",
    `盘前 ${scheduler.premarketTime || "-"}`,
    `决策 ${scheduler.decisionTime || "-"}`,
    `复盘 ${scheduler.reviewTime || "-"}`,
    `周总结 ${weeklyDay} ${scheduler.weeklyReviewTime || "-"}`,
    scheduler.dbFlushPending ? "数据保存中" : "",
    scheduler.dbFlushError ? "数据保存异常" : ""
  ].filter(Boolean).join(" · ");
}

function formatWeekday(value) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][Number(value)] || "周五";
}

function updatePortfolioTaskButtons(inFlight) {
  document.querySelector("#runPremarketBtn").disabled = inFlight;
  document.querySelector("#runDecisionBtn").disabled = inFlight;
  document.querySelector("#runValuationBtn").disabled = inFlight;
  document.querySelector("#runWeeklyBtn").disabled = inFlight;
  document.querySelector("#cancelPortfolioBtn").disabled = !inFlight;
}

function renderOrders(orders) {
  const list = document.querySelector("#orderList");
  if (!orders.length) {
    list.innerHTML = `<div class="empty">暂无待确认订单。申购/赎回不会下单即成交，会在这里显示估值日、确认日和到账日。</div>`;
    return;
  }
  list.innerHTML = orders
    .map(
      (item) => `
        <div class="data-row order-row">
          <div>
            <strong>${escapeHtml(item.side)} ${escapeHtml(item.code)} ${escapeHtml(item.name)}</strong>
            <p>${escapeHtml(item.scheduleReason || "")}</p>
            <small>${escapeHtml(item.limitCheck?.note || "")}</small>
          </div>
          <div>${formatMoney(item.amount)}</div>
          <div>
            <strong>${escapeHtml(item.status || "")}</strong>
            <small>${escapeHtml(item.tradingProfile?.kind || "")}</small>
          </div>
          <div>
            <strong>${escapeHtml(item.priceDate || "-")}</strong>
            <small>估值日</small>
          </div>
          <div>
            <strong>${escapeHtml(item.confirmDate || "-")}</strong>
            <small>${item.settlementDate ? `到账 ${escapeHtml(item.settlementDate)}` : "确认日"}</small>
          </div>
        </div>
      `
    )
    .join("");
}

function renderPositions(positions) {
  const list = document.querySelector("#positionList");
  if (!positions.length) {
    list.innerHTML = `<div class="empty">暂无持仓。第一次手动触发“生成今日操作”后，这里会显示虚拟买入/卖出后的账户。</div>`;
    return;
  }
  list.innerHTML = positions
    .map(
      (item) => {
        const snapshot = item.fundSnapshot || {};
        const nav = snapshot.nav || item.lastNav || "";
        const navDate = snapshot.navDate || item.lastNavDate || "";
        const trend = snapshot.trendSummary || "走势数据不足";
        const source = item.dataSource || snapshot.sources?.[0] || "";
        return `
        <div class="data-row">
          <div>
            <strong>${escapeHtml(item.code)} ${escapeHtml(item.name)}</strong>
            <p>${escapeHtml(item.lastReason || "暂无最近操作理由")}</p>
            <p>${escapeHtml(trend)}</p>
            ${source ? `<small>${escapeHtml(source)}</small>` : ""}
          </div>
          <div>${formatMoney(item.currentValue)}</div>
          <div>
            <strong>${item.weightPct || 0}%</strong>
            <small>份额 ${formatNumber(item.units, 6)}</small>
          </div>
          <div>
            <strong>${nav ? formatNumber(nav, 4) : "-"}</strong>
            <small>${escapeHtml(navDate || "无净值日期")}</small>
            <small>成本 ${item.averageCostNav ? formatNumber(item.averageCostNav, 4) : "-"}</small>
          </div>
          <div>${formatSigned(item.unrealizedPnl)} / ${formatSigned(item.unrealizedPnlPct)}%</div>
        </div>
      `;
      }
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
    .map((run) => {
      const statusClass = run.status === "failed" || run.status === "interrupted" ? "bad-text" : run.status === "running" ? "warn-text" : "ok-text";
      const orders = run.orders?.length ? run.orders.map((item) => `${item.side} ${item.code} ${item.status}`).join(" · ") : "";
      const transactions = run.transactions?.length ? `${run.transactions.length} 笔确认成交` : "";
      const notes = run.executionNotes?.length ? `${run.executionNotes.length} 条执行说明` : "";
      const durationSeconds = run.durationMs
        ? Math.round(run.durationMs / 1000)
        : run.status === "running" && run.startedAt
          ? Math.max(0, Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000))
          : 0;
      return `
        <details class="run-item">
          <summary>
            <div>
              <strong>${escapeHtml(run.date || "")} · ${escapeHtml(run.title || run.type || "")}</strong>
              <p>${escapeHtml(run.summary || "无摘要")}</p>
              <small>${escapeHtml([orders, transactions, notes].filter(Boolean).join(" · "))}</small>
            </div>
            <strong class="${statusClass}">${escapeHtml(run.status || "")}</strong>
          </summary>
          <div class="run-detail">
            <div class="run-meta">
              <span>开始：${escapeHtml(formatDateTime(run.startedAt))}</span>
              <span>进度：${escapeHtml(formatDateTime(run.progressAt))}</span>
              <span>结束：${escapeHtml(formatDateTime(run.completedAt))}</span>
              <span>耗时：${durationSeconds}s</span>
            </div>
            ${
              run.error
                ? `<p class="bad-text">${escapeHtml(run.error)}</p>`
                : ""
            }
            <pre>${escapeHtml(run.card || run.summary || (run.status === "running" ? "任务仍在运行，刷新后查看最新状态。" : "无内容"))}</pre>
          </div>
        </details>
      `;
    })
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
          <small>${escapeHtml(item.date || "")} · 净值 ${item.nav ? formatNumber(item.nav, 4) : "-"} · 份额 ${
            item.units ? formatNumber(item.units, 6) : "-"
          }</small>
          <small>${escapeHtml(item.fundSnapshot?.trendSummary || "")}</small>
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
  const buttonByType = {
    premarket: "#runPremarketBtn",
    decision: "#runDecisionBtn",
    valuation: "#runValuationBtn",
    weekly: "#runWeeklyBtn"
  };
  const button = document.querySelector(buttonByType[type] || "#runDecisionBtn");
  button.disabled = true;
  portfolioOutput.textContent = "任务已提交，后台运行中。页面会自动刷新，不需要一直等待请求返回。";
  try {
    const result = await apiFetch("/api/portfolio/run", {
      method: "POST",
      body: JSON.stringify({ type })
    });
    showToast(getPortfolioTaskLabel(type) + "任务已启动");
    renderPortfolioResult(result);
    startPortfolioPolling();
  } catch (error) {
    showError(error);
  } finally {
    await loadPortfolio().catch(() => {
      button.disabled = false;
    });
  }
}

function getPortfolioTaskLabel(type) {
  const labels = {
    premarket: "盘前观察",
    decision: "今日操作",
    valuation: "晚间估值",
    weekly: "周总结"
  };
  return labels[type] || "组合";
}

async function cancelPortfolioTask() {
  if (!confirm("确定要结束当前运行中的虚拟组合任务吗？已经提交的订单和历史记录不会被删除。")) {
    return;
  }
  const result = await apiFetch("/api/portfolio/cancel", { method: "POST" });
  showToast("运行中任务已结束");
  renderPortfolioResult(result);
  stopPortfolioPolling();
}

function startPortfolioPolling() {
  if (portfolioPollTimer) {
    return;
  }
  portfolioPollTimer = setInterval(async () => {
    try {
      const result = await apiFetch("/api/portfolio?light=1", { timeoutMs: 45000 });
      const portfolio = result.portfolio || {};
      portfolioPollFailures = 0;
      renderPortfolioResult(portfolio);
      if (!portfolio.scheduler?.inFlight) {
        stopPortfolioPolling();
        setTimeout(() => loadPortfolio().catch(showError), 0);
      }
    } catch (error) {
      portfolioPollFailures += 1;
      if (String(error.message || "").includes("/api/portfolio")) {
        portfolioOutput.textContent = `${portfolioOutput.textContent}\n\n组合状态刷新超时，正在继续重试（${portfolioPollFailures}）。`;
        return;
      }
      stopPortfolioPolling();
      showError(error);
    }
  }, 5000);
}

function stopPortfolioPolling() {
  if (portfolioPollTimer) {
    clearInterval(portfolioPollTimer);
    portfolioPollTimer = null;
  }
  portfolioPollFailures = 0;
}

async function prunePortfolio() {
  const result = await apiFetch("/api/portfolio/prune", { method: "POST" });
  showToast("过期数据已清理");
  renderPortfolioResult(result);
}

async function resetPortfolio() {
  if (!confirm("确定要彻底重置虚拟组合吗？这会清空持仓、订单、交易流水、决策日志和估值记录，并恢复初始本金。")) {
    return;
  }
  const result = await apiFetch("/api/portfolio/reset", {
    method: "POST",
    body: JSON.stringify({ initialCapital: Number(form.elements.portfolioInitialCapital.value || 100000), clearHistory: true })
  });
  showToast("组合已重置");
  renderPortfolioResult(result);
}

function renderPortfolioResult(result) {
  const portfolio = result.portfolio || result;
  loadStats().catch(showError);
  if (portfolio.account) {
    setText("#portfolioTotalAsset", formatMoney(portfolio.account.totalAsset));
    setText("#portfolioCash", formatMoney(portfolio.account.cash));
    setText("#portfolioPositionWeight", `${portfolio.account.positionWeightPct || 0}%`);
    setText("#portfolioPending", `${formatMoney(Number(portfolio.account.pendingBuyAmount || 0) + Number(portfolio.account.receivableCash || 0))}`);
    setText("#portfolioPnl", `${formatSigned(portfolio.account.cumulativePnl)} (${formatSigned(portfolio.account.cumulativePnlPct)}%)`);
    setText("#portfolioSchedule", formatPortfolioSchedule(portfolio));
    renderOrders(portfolio.activeOrders || []);
    renderPositions(portfolio.positions || []);
    renderRuns(portfolio.recentRuns || []);
    renderTransactions(portfolio.recentTransactions || []);
    renderEquity(portfolio.recentEquity || []);
    const inFlight = Boolean(portfolio.scheduler?.inFlight);
    updatePortfolioTaskButtons(inFlight);
    if (inFlight) {
      startPortfolioPolling();
    } else {
      stopPortfolioPolling();
    }
  } else {
    setTimeout(() => loadPortfolio().catch(showError), 0);
  }
  portfolioOutput.textContent = formatPortfolioOutput(portfolio);
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
  const timeoutMs = Number(options.timeoutMs || 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-admin-token": token } : {}),
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`请求超时：${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

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

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
