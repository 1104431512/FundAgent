const form = document.querySelector("#configForm");
const toast = document.querySelector("#toast");
const output = document.querySelector("#testOutput");
const portfolioOutput = document.querySelector("#portfolioOutput");
const modelStatus = document.querySelector("#modelStatus");
const feishuStatus = document.querySelector("#feishuStatus");
const authPanel = document.querySelector("#authPanel");
const adminTokenInput = document.querySelector("#adminToken");
const userHoldingForm = document.querySelector("#userHoldingForm");

let currentSkills = [];
let portfolioPollTimer = null;
let portfolioPollFailures = 0;
let currentPortfolio = null;

const WATCHLIST_STATUS_ORDER = ["ready", "waiting_pullback", "watch", "blocked", "in_position", "removed"];
const TOP_HOLDINGS_DISPLAY_LIMIT = 10;
const WATCHLIST_STATUS_LABELS = {
  ready: "接近可买",
  waiting_pullback: "等待回调",
  watch: "观察",
  blocked: "暂不买",
  in_position: "已持仓",
  removed: "已移出"
};

const tokenFromUrl = new URLSearchParams(location.search).get("token");
if (tokenFromUrl) {
  localStorage.setItem("fundagent_admin_token", tokenFromUrl);
  history.replaceState(null, "", location.pathname);
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
});

const initialTab = new URLSearchParams(location.search).get("tab") || location.hash.replace(/^#/, "");
if (initialTab) {
  activateTab(initialTab);
}

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
if (userHoldingForm) {
  userHoldingForm.addEventListener("submit", (event) => saveUserHolding(event));
}
document.querySelector("#userPortfolioList")?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-user-holding]");
  if (removeButton) {
    removeUserHolding(removeButton.dataset.userId, removeButton.dataset.code);
    return;
  }
  const editButton = event.target.closest("[data-edit-user-holding]");
  if (editButton) {
    fillUserHoldingForm(editButton.dataset.userId, editButton.dataset.code);
  }
});
document.querySelector("#managerRankingBoard")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scroll-target]");
  if (!button) return;
  const scrollTarget = button.dataset.scrollTarget || "";
  const target = [...document.querySelectorAll("[data-ranking-id]")].find((node) => node.dataset.rankingId === scrollTarget);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.modelMaxOutputTokens = Number(payload.modelMaxOutputTokens || 12000);
  payload.modelHttpTimeoutMs = Number(payload.modelHttpTimeoutMs || 0);
  payload.replyMaxChars = Number(payload.replyMaxChars || 18000);
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
  const release = stats.release || {};
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
  setText("#statPreciousMetalQuotes", counters.preciousMetalQuoteFetches || 0);
  setText("#statPreciousMetalFunds", counters.preciousMetalFundSearches || 0);
  setText("#statEnrich", counters.fundEnrichmentSuccess || 0);
  setText("#statFeePages", counters.fundFeePageFetches || 0);
  setText("#statHoldings", counters.fundHoldingsFetches || 0);
  setText("#statPortfolioStatus", counters.portfolioStatusRequests || 0);
  setText("#statPortfolioRuns", counters.portfolioRuns || 0);
  setText("#statPortfolioVerifiedTrades", counters.portfolioNavVerifiedTrades || 0);
  setText("#statPortfolioPushes", counters.portfolioPushes || 0);
  setText("#statErrors", counters.errors || 0);
  setText("#statEvents", counters.messageEvents || 0);
  setText("#statReleaseVersion", formatReleaseVersion(release));
  setText("#statReleaseCommit", formatReleaseCommit(release));
  setText("#statReleaseBranch", release.branch || "-");
  setText("#statReleaseStartedAt", formatDateTime(release.startedAt || stats.startedAt));
  renderRuntimeDiagnostics(stats.diagnostics);
  document.querySelector("#statsOutput").textContent = JSON.stringify(
    {
      startedAt: stats.startedAt,
      updatedAt: stats.updatedAt,
      release,
      diagnostics: stats.diagnostics,
      last: stats.last,
      counters
    },
    null,
    2
  );
}

function renderRuntimeDiagnostics(diagnostics = {}) {
  const list = Array.isArray(diagnostics.items) ? diagnostics.items : [];
  const target = document.querySelector("#runtimeDiagnostics");
  setText("#runtimeDiagnosticSummary", diagnostics.summary || "运行状态暂无明显异常。");
  if (!list.length) {
    target.innerHTML = `
      <div class="diagnostic-card ok">
        <span>暂无明显异常</span>
        <strong>运行正常</strong>
        <p>错误、数据源和模型链路没有触发诊断阈值。</p>
      </div>
    `;
    return;
  }
  target.innerHTML = list.map((item) => `
    <div class="diagnostic-card ${escapeHtml(item.severity || "info")}">
      <span>${escapeHtml(formatDiagnosticSeverity(item.severity))}</span>
      <strong>${escapeHtml(item.label || "运行信号")}</strong>
      <em>${escapeHtml(item.value || "-")}</em>
      <p>${escapeHtml(item.note || "")}</p>
    </div>
  `).join("");
}

async function loadPortfolio() {
  const result = await apiFetch("/api/portfolio?summary=1", { timeoutMs: 45000 });
  const portfolio = result.portfolio || {};
  currentPortfolio = portfolio;
  const account = portfolio.account || {};
  setText("#portfolioTotalAsset", formatMoney(account.totalAsset));
  setText("#portfolioCash", formatMoney(account.cash));
  setText("#portfolioPositionWeight", `${account.positionWeightPct || 0}%`);
  setText("#portfolioPending", `${formatMoney(Number(account.pendingBuyAmount || 0) + Number(account.receivableCash || 0))}`);
  setText("#portfolioPnl", formatPortfolioPnl(account));
  setText("#portfolioSchedule", formatPortfolioSchedule(portfolio));
  setText(
    "#portfolioPushTarget",
    portfolio.pushTarget
      ? `${portfolio.pushTarget.receiveIdType}: ${portfolio.pushTarget.receiveIdMasked}`
      : "未绑定"
  );
  setText("#portfolioRetention", `${portfolio.retentionDays || 90} 天`);
  renderPortfolioDashboard(portfolio);
  renderManagerRankings(portfolio.managerRankings || {});
  renderOrders(portfolio.activeOrders || []);
  renderPositions(portfolio.positions || []);
  renderUserPortfolios(portfolio.userPortfolios || []);
  renderWatchlist(portfolio.watchlist || []);
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
    `待确认/应收：${formatMoney(Number(account.pendingBuyAmount || 0) + Number(account.receivableCash || 0))}，累计盈亏：${formatPortfolioPnl(account)}`
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
  const watchlist = portfolio.watchlist || [];
  if (watchlist.length) {
    const ready = watchlist.filter((item) => item.status === "ready").length;
    const waiting = watchlist.filter((item) => item.status === "waiting_pullback").length;
    lines.push("");
    lines.push(`自选基金池：${watchlist.length} 只，接近可买 ${ready} 只，等待回调 ${waiting} 只。`);
  }
  const userPortfolios = portfolio.userPortfolios || [];
  if (userPortfolios.length) {
    const holdings = userPortfolios.reduce((sum, item) => sum + Number(item.holdingCount || item.holdings?.length || 0), 0);
    const alerts = userPortfolios.reduce((sum, item) => sum + Number(item.alertCount || 0), 0);
    lines.push("");
    lines.push(`用户持仓关注：${userPortfolios.length} 个用户，${holdings} 只基金，${alerts} 条优先提醒。`);
  }
  return lines.join("\n");
}

function formatPortfolioPnl(account = {}) {
  return `${formatSigned(account.cumulativePnl)} (${formatSigned(account.cumulativePnlPct)}%)`;
}

function renderPortfolioDashboard(portfolio = {}) {
  const account = portfolio.account || {};
  const positions = portfolio.positions || [];
  const watchlist = portfolio.watchlist || [];
  const userPortfolios = portfolio.userPortfolios || [];
  const runs = portfolio.recentRuns || [];
  const latestRun = runs[0] || null;
  const activeOrders = portfolio.activeOrders || [];
  const ready = watchlist.filter((item) => item.status === "ready");
  const waiting = watchlist.filter((item) => item.status === "waiting_pullback");
  const launchEve = watchlist.filter(isWatchlistLaunchEveCandidate);
  const blocked = watchlist.filter((item) => item.status === "blocked");

  const briefParts = [
    portfolio.enabled ? "自动运行已启用" : "自动运行停用",
    `${positions.length} 只持仓`,
    userPortfolios.length ? `${userPortfolios.length} 个用户持仓关注` : "",
    `${watchlist.length} 只自选候选`,
    latestRun ? `最近：${latestRun.title || latestRun.type || "组合任务"} ${latestRun.status || ""}` : "暂无运行记录"
  ];
  setText("#portfolioBrief", briefParts.filter(Boolean).join(" · "));
  setText("#portfolioAssetFootnote", `初始本金 ${formatMoney(account.initialCapital)}，今日 ${formatSigned(account.dayPnl)}`);
  setText("#portfolioExposureFootnote", `持仓市值 ${formatMoney(account.investedValue)}，当前成本 ${formatMoney(account.investedCost)}，距峰值 ${formatSigned(account.drawdownFromPeakPct || 0)}%`);
  setText("#portfolioPnlFootnote", `按实际投入基准 ${formatMoney(account.investedCostBasis || account.investedCost)} 计算`);
  setText("#portfolioPositionCount", `${positions.length} 只`);
  setText("#portfolioReadinessCount", `${ready.length + waiting.length} 只`);
  updateRunStateBadge(latestRun, portfolio.scheduler || {});

  renderInsightList("#portfolioManagerSummary", buildManagerInsightItems(portfolio, latestRun, activeOrders), "暂无经理运行摘要。");
  renderInsightList("#portfolioHoldingSummary", buildHoldingInsightItems(account, positions, portfolio.exposureSummary || null), "暂无持仓暴露。");
  renderInsightList("#portfolioReadinessSummary", buildReadinessInsightItems({ ready, waiting, launchEve, blocked }), "暂无接近买点的候选。");
  updatePortfolioCapabilityBadge(portfolio.capabilityDiagnostics || {});
  renderInsightList("#portfolioCapabilitySummary", buildCapabilityInsightItems(portfolio.capabilityDiagnostics || {}), "暂无明显能力短板。");
  renderCapabilityActionQueue(portfolio.capabilityActionQueue || []);
  updatePortfolioBacktestBadge(portfolio.backtestDiagnostics || {});
  renderInsightList("#portfolioBacktestSummary", buildBacktestInsightItems(portfolio.backtestDiagnostics || {}), "暂无历史回测缺口。");
  updatePortfolioRankingAuditBadge(portfolio.rankingActionAudit || {});
  renderInsightList("#portfolioRankingAuditSummary", buildRankingAuditInsightItems(portfolio.rankingActionAudit || {}), "暂无榜单引用审计。");
}

function renderManagerRankings(board = {}) {
  const root = document.querySelector("#managerRankingBoard");
  const updated = document.querySelector("#managerRankingUpdatedAt");
  if (!root) return;
  const lists = Array.isArray(board.lists) ? board.lists : [];
  if (updated) {
    updated.textContent = board.updatedAt ? `更新 ${formatDateTime(board.updatedAt)}` : "未加载";
  }
  if (!lists.length) {
    root.innerHTML = `<div class="empty">暂无榜单数据。自选池、持仓或用户持仓关注有数据后会自动生成。</div>`;
    return;
  }
  root.innerHTML = `${renderManagerRankingHealth(board.health || {})}${renderManagerPriorityQueue(board.priorityQueue || [])}${renderManagerRankingOverview(lists)}${lists.map(renderManagerRankingList).join("")}`;
}

function renderManagerRankingHealth(health = {}) {
  const actions = Array.isArray(health.actions) ? health.actions : [];
  if (!health.title && !health.summary && !actions.length) return "";
  return `
    <div class="ranking-health ${getManagerRankingHealthClass(health.level)}">
      <div>
        <strong>${escapeHtml(health.title || "榜单状态")}</strong>
        <p>${escapeHtml(health.summary || "等待经理下一次复核后更新。")}</p>
      </div>
      ${actions.length ? `<div class="ranking-health-actions">${actions.slice(0, 3).map((action) => `<span>${escapeHtml(action)}</span>`).join("")}</div>` : ""}
    </div>
  `;
}

function renderManagerPriorityQueue(queue = []) {
  const items = Array.isArray(queue) ? queue : [];
  if (!items.length) return "";
  return `
    <section class="ranking-priority">
      <div class="ranking-priority-head">
        <div>
          <strong>今日优先处理</strong>
          <small>跨榜单排序，先复核最影响买入、卖出和客户提醒的对象。</small>
        </div>
        <span>${items.length} 项</span>
      </div>
      <div class="ranking-priority-items">
        ${items.slice(0, 6).map(renderManagerPriorityItem).join("")}
      </div>
    </section>
  `;
}

function renderManagerPriorityItem(item = {}) {
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.listTitle || ""}`);
  return `
    <article class="ranking-priority-item">
      <div class="ranking-priority-rank">${escapeHtml(String(item.queueRank || "-"))}</div>
      <div class="ranking-priority-body">
        <div class="ranking-priority-title">
          <strong>${escapeHtml(item.code || "")} ${escapeHtml(item.name || "")}</strong>
          <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.listTitle || "复核")}</span>
        </div>
        <p>${escapeHtml(item.reason || "等待经理复核。")}</p>
        <div class="ranking-priority-meta">
          <span>${escapeHtml(item.listTitle || "经理榜单")}${item.rank ? ` #${escapeHtml(String(item.rank))}` : ""}</span>
          ${Number.isFinite(Number(item.priorityScore)) ? `<span>优先级 ${formatNumber(item.priorityScore, 0)}</span>` : ""}
        </div>
        ${item.nextStep ? `<small>${escapeHtml(item.nextStep)}</small>` : ""}
      </div>
    </article>
  `;
}

function renderManagerRankingOverview(lists = []) {
  if (!lists.length) return "";
  return `
    <div class="ranking-overview">
      ${lists.map((list) => {
        const items = Array.isArray(list.items) ? list.items : [];
        const top = items[0] || null;
        return `
          <button class="ranking-overview-card ranking-overview-${getManagerRankingListClass(list.id)}" type="button" data-scroll-target="${escapeHtml(list.id || "")}">
            <span>${escapeHtml(list.title || "榜单")}</span>
            <strong>${items.length} 只</strong>
            <small>${top ? `${top.code || ""} ${top.name || ""}`.trim() : (list.emptyText || "暂无触发项")}</small>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderManagerRankingList(list = {}) {
  const items = Array.isArray(list.items) ? list.items : [];
  return `
    <section class="ranking-list ranking-list-${getManagerRankingListClass(list.id)}" data-ranking-id="${escapeHtml(list.id || "")}">
      <div class="ranking-list-head">
        <div>
          <strong>${escapeHtml(list.title || "榜单")}</strong>
          <small>${escapeHtml(list.subtitle || "")}</small>
        </div>
        <span>${items.length} 只</span>
      </div>
      <div class="ranking-items">
        ${items.length ? items.map(renderManagerRankingItem).join("") : `<div class="compact-empty">${escapeHtml(list.emptyText || "暂无候选。")}</div>`}
      </div>
      ${list.nextAction ? `<div class="ranking-next">${escapeHtml(list.nextAction)}</div>` : ""}
    </section>
  `;
}

function renderManagerRankingItem(item = {}) {
  const rankClass = item.rank <= 3 ? "top" : "";
  const facts = Array.isArray(item.facts) ? item.facts : [];
  const actionClass = getManagerRankingActionClass(item.action || item.status || "");
  return `
    <article class="ranking-item ${rankClass}">
      <div class="ranking-index">${escapeHtml(String(item.rank || "-"))}</div>
      <div class="ranking-body">
        <div class="ranking-title">
          <strong>${escapeHtml(item.code || "")} ${escapeHtml(item.name || "")}</strong>
          <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.status || "")}</span>
        </div>
        <p>${escapeHtml(item.reason || "等待下一次复核。")}</p>
        <div class="ranking-meta">
          <small>${escapeHtml(item.source || "")}</small>
          ${Number.isFinite(Number(item.score)) ? `<small>评分 ${formatNumber(item.score, 0)}</small>` : ""}
          ${item.userId ? `<small>用户 ${escapeHtml(item.userId)}</small>` : ""}
        </div>
        ${facts.length ? `<div class="fact-strip compact">${facts.slice(0, 5).map((fact) => `<span>${escapeHtml(fact)}</span>`).join("")}</div>` : ""}
        ${renderManagerRankingDecision(item.decision || {})}
      </div>
    </article>
  `;
}

function renderManagerRankingDecision(decision = {}) {
  const cells = [
    buildRankingDecisionCell("看点", decision.highlights),
    buildRankingDecisionCell("风险", decision.risks),
    buildRankingDecisionCell("缺口", decision.gaps),
    buildRankingDecisionCell("下一步", decision.nextStep)
  ].filter(Boolean);
  if (!cells.length) return "";
  return `<div class="ranking-decision">${cells.join("")}</div>`;
}

function buildRankingDecisionCell(label, value) {
  const items = Array.isArray(value) ? value.filter(Boolean).slice(0, 2) : String(value || "").trim() ? [String(value).trim()] : [];
  if (!items.length) return "";
  return `
    <div class="ranking-decision-cell">
      <span>${escapeHtml(label)}</span>
      <div>${items.map((item) => `<strong>${escapeHtml(item)}</strong>`).join("")}</div>
    </div>
  `;
}

function getManagerRankingHealthClass(level = "") {
  if (level === "ok") return "ok";
  if (level === "warning") return "warning";
  return "watch";
}

function getManagerRankingListClass(id = "") {
  if (id === "buy_preparation") return "buy";
  if (id === "launch_setup") return "launch";
  if (id === "holdings_outlook") return "holdings";
  if (id === "fee_suitability") return "fee";
  if (id === "opportunity_cost") return "opportunity";
  if (id === "sell_risk") return "sell";
  if (id === "user_holding_alerts") return "user";
  return "default";
}

function getManagerRankingActionClass(text = "") {
  if (/卖出|减仓|止损|止盈|回吐/.test(text)) return "sell";
  if (/买入|启动|触发/.test(text)) return "buy";
  if (/持仓|前景|行业/.test(text)) return "holdings";
  if (/费用|费率|份额|申购|销售服务费|赎回|持有期/.test(text)) return "fee";
  if (/机会|错过|复核|小仓/.test(text)) return "opportunity";
  if (/补证据|缺口|等待|观察/.test(text)) return "watch";
  return "default";
}

function updateRunStateBadge(latestRun, scheduler = {}) {
  const node = document.querySelector("#portfolioRunState");
  if (!node) return;
  const status = scheduler.inFlight ? "running" : latestRun?.status || "idle";
  const label = {
    running: "运行中",
    completed: "已完成",
    failed: "异常",
    interrupted: "已中断",
    cancelled: "已结束",
    idle: "待运行"
  }[status] || status;
  node.textContent = label;
  node.className = `badge ${status === "failed" || status === "interrupted" ? "bad" : status === "running" ? "warn" : "ok"}`;
}

function buildManagerInsightItems(portfolio, latestRun, activeOrders) {
  const scheduler = portfolio.scheduler || {};
  return [
    {
      label: "最近结论",
      value: latestRun?.summary || "暂无复盘记录",
      meta: latestRun ? `${latestRun.date || "-"} · ${latestRun.title || latestRun.type || "-"}` : "等待盘前观察或今日操作生成"
    },
    {
      label: "运行节奏",
      value: formatPortfolioSchedule(portfolio),
      meta: scheduler.activeRunStartedAt ? `本轮开始 ${formatDateTime(scheduler.activeRunStartedAt)}` : "盘前、决策、复盘、周总结按配置执行"
    },
    {
      label: "订单状态",
      value: activeOrders.length ? `${activeOrders.length} 笔订单流转中` : "暂无待确认订单",
      meta: activeOrders[0] ? `${activeOrders[0].side || ""} ${activeOrders[0].code || ""} ${activeOrders[0].status || ""}` : "没有待确认申购、赎回或到账"
    }
  ];
}

function buildHoldingInsightItems(account, positions, exposureSummary = null) {
  if (!positions.length) return [];
  const sorted = [...positions].sort((a, b) => Number(b.weightPct || 0) - Number(a.weightPct || 0));
  const biggest = sorted[0];
  const pnlSorted = [...positions].sort((a, b) => Number(b.unrealizedPnl || 0) - Number(a.unrealizedPnl || 0));
  const topHoldings = collectPortfolioTopHoldings(positions).slice(0, TOP_HOLDINGS_DISPLAY_LIMIT);
  const exposureItems = buildExposureInsightItems(exposureSummary);
  return [
    {
      label: "仓位结构",
      value: `${account.positionWeightPct || 0}% 已投入`,
      meta: biggest ? `第一大持仓 ${biggest.code} ${biggest.name || ""}，占 ${biggest.weightPct || 0}%` : "暂无集中持仓"
    },
    {
      label: "回撤预算",
      value: formatPortfolioRiskBudget(account),
      meta: `账户峰值 ${formatMoney(account.peakTotalAsset || account.totalAsset)}，买入状态：${account.riskBudget?.blockNewBuys ? "暂停新增" : account.riskBudget?.throttleNewBuys ? "缩小试探" : "正常"}`
    },
    {
      label: "盈亏贡献",
      value: formatPortfolioPnl(account),
      meta: pnlSorted[0] ? `当前贡献最高：${pnlSorted[0].code} ${formatSigned(pnlSorted[0].unrealizedPnl)} / ${formatSigned(pnlSorted[0].unrealizedPnlPct)}%` : "等待估值更新"
    },
    {
      label: "持仓穿透",
      value: topHoldings.length ? topHoldings.join(" / ") : "暂无前十大持仓",
      meta: topHoldings.length ? "来自持仓基金快照的代表性前十大持仓" : "下次净值下钻后补充"
    },
    ...exposureItems
  ];
}

function buildExposureInsightItems(summary = null) {
  if (!summary || typeof summary !== "object") return [];
  const items = [];
  const topTheme = (summary.themeClusters || [])[0];
  if (topTheme) {
    items.push({
      label: "同题材暴露",
      value: `${topTheme.theme} ${formatNumber(topTheme.positionWeightPct, 1)}%`,
      meta: topTheme.funds?.length ? `涉及 ${topTheme.fundCount || topTheme.funds.length} 只：${topTheme.funds.slice(0, 3).join(" / ")}` : "按底层持仓和基金名称估算"
    });
  }
  const repeated = (summary.overlappingHoldings || [])[0];
  if (repeated) {
    items.push({
      label: "底层重叠",
      value: `${[repeated.code, repeated.name].filter(Boolean).join(" ")} · ${repeated.fundCount} 只`,
      meta: `穿透估算 ${formatNumber(repeated.estimatedAccountPct, 2)}%，基金壳暴露 ${formatNumber(repeated.fundEnvelopePct, 1)}%`
    });
  }
  if (summary.riskNotes?.length) {
    items.push({
      label: "集中风险",
      value: summary.riskLevel === "high" ? "需要降温" : "需要复核",
      meta: summary.riskNotes[0]
    });
  }
  return items;
}

function formatPortfolioRiskBudget(account = {}) {
  const budget = account.riskBudget || {};
  const label = budget.label || "回撤正常";
  const drawdown = formatSigned(account.drawdownFromPeakPct || budget.drawdownFromPeakPct || 0);
  const limit = budget.maxDrawdownPct ?? 6;
  return `${label} ${drawdown}% / ${limit}%`;
}

function buildReadinessInsightItems({ ready, waiting, launchEve, blocked }) {
  const bestReady = ready[0];
  const bestWaiting = waiting[0];
  return [
    {
      label: "接近可买",
      value: bestReady ? `${bestReady.code} ${bestReady.name || ""}` : `${ready.length} 只`,
      meta: bestReady ? `${formatWatchlistReadiness(bestReady) || "等待复查"}；${selectWatchlistPrimaryGap(bestReady)}` : "没有通过买点验证的候选"
    },
    {
      label: "等待回调",
      value: bestWaiting ? `${bestWaiting.code} ${bestWaiting.name || ""}` : `${waiting.length} 只`,
      meta: bestWaiting ? selectWatchlistPrimaryGap(bestWaiting) : "没有正在等待回调的候选"
    },
    {
      label: "纪律拦截",
      value: `启动前夜 ${launchEve.length} · 暂不买 ${blocked.length}`,
      meta: "启动前夜只做复核，偏热或证据不足不进入买入执行"
    }
  ];
}

function updatePortfolioCapabilityBadge(diagnostics = {}) {
  const node = document.querySelector("#portfolioCapabilityState");
  if (!node) return;
  const level = diagnostics.level || "ok";
  const label = {
    critical: "严重",
    warning: "预警",
    info: "观察",
    ok: "正常"
  }[level] || "观察";
  node.textContent = label;
  node.className = `badge ${level === "critical" ? "bad" : level === "warning" ? "warn" : "ok"}`;
}

function buildCapabilityInsightItems(diagnostics = {}) {
  const items = Array.isArray(diagnostics.items) ? diagnostics.items : [];
  if (!items.length) {
    return [{
      label: "能力状态",
      value: diagnostics.summary || "组合能力暂无明显短板",
      meta: "继续跟踪盈利、回撤、召回质量、数据质量和交易确认"
    }];
  }
  return items.slice(0, 4).map((item) => ({
    label: item.label || "能力信号",
    value: item.value || formatDiagnosticSeverity(item.severity),
    meta: item.note || diagnostics.summary || ""
  }));
}

function updatePortfolioBacktestBadge(diagnostics = {}) {
  const node = document.querySelector("#portfolioBacktestState");
  if (!node) return;
  const level = diagnostics.level || "ok";
  const label = {
    critical: "严重",
    warning: "待修复",
    info: "观察",
    ok: "正常"
  }[level] || "观察";
  node.textContent = label;
  node.className = `badge ${level === "critical" ? "bad" : level === "warning" ? "warn" : "ok"}`;
}

function buildBacktestInsightItems(diagnostics = {}) {
  const items = Array.isArray(diagnostics.items) ? diagnostics.items : [];
  if (!items.length) {
    const phases = Array.isArray(diagnostics.phases) ? diagnostics.phases : [];
    return [{
      label: "回测状态",
      value: diagnostics.summary || "历史回测暂未发现明确漏洞",
      meta: phases.length ? `已划分 ${phases.length} 个历史阶段` : "等待更多运行和交易记录"
    }];
  }
  const phaseItems = (Array.isArray(diagnostics.phases) ? diagnostics.phases : [])
    .slice(-2)
    .map((phase) => ({
      label: phase.phase || "历史阶段",
      value: phase.date || "未知日期",
      meta: phase.note || `买入${phase.buys || 0}，卖出${phase.sells || 0}，预警${phase.warnings || 0}`
    }));
  return [
    ...items.slice(0, 4).map((item) => ({
      label: item.label || "回测信号",
      value: item.value || formatDiagnosticSeverity(item.severity),
      meta: item.note || diagnostics.summary || item.phase || ""
    })),
    ...phaseItems
  ].slice(0, 6);
}

function updatePortfolioRankingAuditBadge(audit = {}) {
  const node = document.querySelector("#portfolioRankingAuditState");
  if (!node) return;
  const level = audit.level || "watch";
  const label = {
    critical: "断裂",
    warning: "待补",
    watch: "待审计",
    ok: "已引用"
  }[level] || "待审计";
  node.textContent = label;
  node.className = `badge ${level === "critical" ? "bad" : level === "warning" ? "warn" : "ok"}`;
}

function buildRankingAuditInsightItems(audit = {}) {
  const total = Number(audit.totalActions || 0);
  const coverage = Number(audit.coveragePct);
  const items = [{
    label: "覆盖率",
    value: total ? `${audit.citedActions || 0}/${total}` : "暂无动作",
    meta: total && Number.isFinite(coverage) ? `最近动作榜单引用率 ${formatNumber(coverage, 1)}%` : audit.summary || "等待今日操作生成后审计"
  }];
  const missing = Array.isArray(audit.missing) ? audit.missing : [];
  const cited = Array.isArray(audit.citedSamples) ? audit.citedSamples : [];
  if (missing.length) {
    items.push(...missing.slice(0, 3).map((item) => ({
      label: "未引用",
      value: [item.action, item.code, item.name].filter(Boolean).join(" "),
      meta: item.reason || "动作缺少榜单依据，下一轮需要补 rankingBasis"
    })));
  } else if (cited.length) {
    items.push(...cited.slice(0, 2).map((item) => ({
      label: "已引用",
      value: [item.action, item.code, item.name].filter(Boolean).join(" "),
      meta: item.rankingBasis || "已引用经理榜单"
    })));
  }
  const next = Array.isArray(audit.nextActions) ? audit.nextActions[0] : "";
  if (next) {
    items.push({ label: "下一步", value: next, meta: audit.summary || "" });
  }
  return items.slice(0, 5);
}

function renderCapabilityActionQueue(tasks = []) {
  const list = document.querySelector("#portfolioCapabilityActionQueue");
  if (!list) return;
  const items = Array.isArray(tasks) ? tasks.slice(0, 6) : [];
  if (!items.length) {
    list.innerHTML = `<div class="empty compact-empty">暂无待执行修复动作。</div>`;
    return;
  }
  list.innerHTML = `
    <div class="capability-action-title">修复队列</div>
    ${items.map((item) => `
      <div class="capability-action ${escapeHtml(item.severity || "info")}">
        <div>
          <span>${escapeHtml(item.owner || "经理")}</span>
          <strong>${escapeHtml(item.label || "能力修复")}</strong>
        </div>
        <p>${escapeHtml(item.action || "")}</p>
        <small>${escapeHtml(item.evidence || item.note || "")}</small>
      </div>
    `).join("")}
  `;
}

function renderInsightList(selector, items, emptyText) {
  const list = document.querySelector(selector);
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<div class="empty compact-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  list.innerHTML = items.map((item) => `
    <div class="insight-item">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <small>${escapeHtml(item.meta || "")}</small>
    </div>
  `).join("");
}

function collectPortfolioTopHoldings(positions = []) {
  const values = [];
  for (const position of positions) {
    values.push(...getSnapshotTopHoldings(position.fundSnapshot || {}));
  }
  return [...new Set(values.map(formatHoldingText).filter(Boolean))];
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
            <small>${escapeHtml([item.tradingProfile?.kind || "", formatOrderNavLine(item)].filter(Boolean).join(" · "))}</small>
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

function formatOrderNavLine(item = {}) {
  const nav = Number(item.nav);
  const units = Number(item.units);
  const navLine = Number.isFinite(nav) && nav > 0
    ? `确认净值 ${formatNumber(nav, 4)}${item.navDate ? `（${item.navDate}）` : ""}`
    : "";
  const unitsLine = Number.isFinite(units) && units > 0 ? `份额 ${formatNumber(units, 2)}` : "";
  return [navLine, unitsLine, item.navQuality ? String(item.navQuality) : ""].filter(Boolean).join("，");
}

function renderPositions(positions) {
  const list = document.querySelector("#positionList");
  if (!positions.length) {
    list.innerHTML = `<div class="empty">暂无持仓。第一次手动触发“生成今日操作”后，这里会显示虚拟买入/卖出后的账户。</div>`;
    return;
  }
  list.innerHTML = `<div class="fund-card-grid">${positions.map(renderPositionCard).join("")}</div>`;
}

function renderUserPortfolios(userPortfolios = []) {
  const list = document.querySelector("#userPortfolioList");
  const count = document.querySelector("#userPortfolioCount");
  if (!list || !count) return;
  const users = Array.isArray(userPortfolios) ? userPortfolios : [];
  const holdingCount = users.reduce((sum, item) => sum + Number(item.holdingCount || item.holdings?.length || 0), 0);
  count.textContent = `${users.length} 个用户 / ${holdingCount} 只`;
  if (!users.length) {
    list.innerHTML = `<div class="empty">暂无用户持仓。可以在这里手动添加，也可以在飞书里说“建立用户admin的持仓情况”后发送截图。</div>`;
    return;
  }
  list.innerHTML = users.map(renderUserPortfolioCard).join("");
}

function renderUserPortfolioCard(user = {}) {
  const alerts = Array.isArray(user.alerts) ? user.alerts : [];
  const holdings = Array.isArray(user.holdings) ? user.holdings : [];
  const warningCount = alerts.filter((item) => item.level === "warning").length;
  return `
    <section class="user-portfolio-card">
      <div class="user-portfolio-head">
        <div>
          <strong>${escapeHtml(user.displayName || user.userId || "用户")}</strong>
          <span>${escapeHtml(user.userId || "")} · ${holdings.length} 只持仓 · ${warningCount} 条优先提醒</span>
        </div>
        <small>${user.updatedAt ? `更新 ${escapeHtml(formatDateTime(user.updatedAt))}` : ""}</small>
      </div>
      ${alerts.length ? `<div class="user-alert-strip">${alerts.slice(0, 4).map(renderUserPortfolioAlert).join("")}</div>` : ""}
      <div class="fund-card-grid compact-fund-grid">
        ${holdings.map((holding) => renderUserHoldingCard(user, holding)).join("")}
      </div>
    </section>
  `;
}

function renderUserPortfolioAlert(alert = {}) {
  const cls = alert.level === "warning" ? "warn" : alert.level === "positive" ? "ok" : "";
  return `
    <div class="user-alert ${cls}">
      <strong>${escapeHtml(alert.code || "")} ${escapeHtml(alert.name || "")}</strong>
      <span>${escapeHtml(alert.action || "观察")}</span>
      <small>${escapeHtml(alert.reason || "")}</small>
    </div>
  `;
}

function renderUserHoldingCard(user = {}, holding = {}) {
  const snapshot = holding.lastSnapshot || {};
  const trend = getFundSnapshotTrendText(snapshot);
  const facts = renderSnapshotFactStrip(snapshot, {
    leadingFacts: buildUserHoldingLeadingFacts(holding),
    includeAction: true
  });
  const alertClass = /卖出|减仓|回落|风险|止盈|止损/.test(holding.alertHint || "") ? "bad-text" : "ok-text";
  return `
    <details class="fund-card user-holding-card">
      <summary class="fund-card-summary">
        <div class="fund-card-title">
          <strong>${escapeHtml(holding.code)} ${escapeHtml(holding.name || "")}</strong>
          <span>${escapeHtml(formatUserHoldingStatus(holding.status))}</span>
        </div>
        <div class="fund-card-kpis">
          ${Number.isFinite(Number(holding.visibleReturnPct)) ? `<span>${escapeHtml(holding.visibleReturnLabel || "截图涨跌幅")} ${formatSigned(holding.visibleReturnPct)}%</span>` : ""}
          ${holding.currentNav ? `<span>净值 ${formatNumber(holding.currentNav, 4)}</span>` : ""}
          ${holding.shareClass ? `<span>${escapeHtml(holding.shareClass)}类</span>` : ""}
        </div>
        <small class="${alertClass}">${escapeHtml(holding.alertHint || trend || "已纳入持仓关注")}</small>
      </summary>
      <div class="fund-card-detail">
        ${facts}
        ${holding.managerNote ? `<p>${escapeHtml(holding.managerNote)}</p>` : ""}
        ${holding.userNote ? `<p>备注：${escapeHtml(holding.userNote)}</p>` : ""}
        ${holding.rowText ? `<small>截图行：${escapeHtml(holding.rowText)}</small>` : ""}
        <div class="user-holding-actions">
          <button type="button" class="secondary" data-edit-user-holding="1" data-user-id="${escapeHtml(user.userId || "")}" data-code="${escapeHtml(holding.code || "")}">编辑</button>
          <button type="button" class="secondary danger-button" data-remove-user-holding="1" data-user-id="${escapeHtml(user.userId || "")}" data-code="${escapeHtml(holding.code || "")}">移出</button>
        </div>
      </div>
    </details>
  `;
}

function buildUserHoldingLeadingFacts(holding = {}) {
  return [
    holding.visibleReturnLabel && Number.isFinite(Number(holding.visibleReturnPct))
      ? `${holding.visibleReturnLabel} ${formatSigned(holding.visibleReturnPct)}%`
      : "",
    holding.relatedTheme
      ? `${holding.relatedTheme}${Number.isFinite(Number(holding.relatedThemeReturnPct)) ? ` ${formatSigned(holding.relatedThemeReturnPct)}%` : ""}`
      : "",
    holding.source ? `来源 ${holding.source}` : ""
  ].filter(Boolean);
}

function formatUserHoldingStatus(status) {
  if (status === "watch") return "观察";
  if (status === "removed") return "已移出";
  return "持有";
}

function renderPositionCard(item) {
  const snapshot = item.fundSnapshot || {};
  const nav = snapshot.nav || item.lastNav || "";
  const navDate = snapshot.navDate || item.lastNavDate || "";
  const trend = getFundSnapshotTrendText(snapshot);
  const trendChart = renderTrendChart(snapshot);
  const facts = renderSnapshotFactStrip(snapshot);
  const riskLine = renderPositionRiskLine(item);
  const holdings = renderHoldingChips(getSnapshotTopHoldings(snapshot), "前十大持仓");
  const source = item.dataSource || snapshot.sources?.[0] || "";
  const pnlClass = Number(item.unrealizedPnl || 0) >= 0 ? "ok-text" : "bad-text";
  return `
    <details class="fund-card holding-fund-card">
      <summary class="fund-card-summary">
        <div class="fund-card-title">
          <strong>${escapeHtml(item.code)} ${escapeHtml(item.name)}</strong>
          <span>持仓 ${escapeHtml(String(item.weightPct || 0))}%</span>
        </div>
        <div class="fund-card-kpis">
          <span>${formatMoney(item.currentValue)}</span>
          <span class="${pnlClass}">${formatSigned(item.unrealizedPnl)} / ${formatSigned(item.unrealizedPnlPct)}%</span>
        </div>
        <small>${escapeHtml(trend && trend !== "走势数据不足" ? trend : (item.lastReason || "点击查看持仓细节"))}</small>
      </summary>
      <div class="fund-card-detail">
        <div class="position-body">
          <div class="position-chart-block">
            <p>${escapeHtml(item.lastReason || trend || "暂无最近操作理由")}</p>
            ${trendChart}
            ${facts}
            ${source ? `<small>${escapeHtml(source)}</small>` : ""}
          </div>
          <div class="position-metrics">
            <div><span>市值</span><strong>${formatMoney(item.currentValue)}</strong></div>
            <div><span>仓位</span><strong>${item.weightPct || 0}%</strong></div>
            <div><span>净值</span><strong>${nav ? formatNumber(nav, 4) : "-"}</strong><small>${escapeHtml(navDate || "无日期")}</small></div>
            <div><span>份额</span><strong>${formatNumber(item.units, 2)}</strong><small>成本 ${item.averageCostNav ? formatNumber(item.averageCostNav, 4) : "-"}</small></div>
          </div>
        </div>
        ${riskLine}
        ${holdings}
      </div>
    </details>
  `;
}

function renderPositionRiskLine(item = {}) {
  const budget = item.riskBudget || {};
  const facts = [
    Number.isFinite(Number(item.peakUnrealizedPnlPct)) ? `浮盈峰值 ${formatSigned(item.peakUnrealizedPnlPct)}%` : "",
    Number.isFinite(Number(item.profitGivebackPct)) && Number(item.profitGivebackPct) > 0 ? `已回吐 ${formatNumber(item.profitGivebackPct, 2)}pct` : "",
    budget.label || budget.level ? `风控 ${budget.label || budget.level}` : "",
    Array.isArray(budget.triggers) && budget.triggers.length ? budget.triggers[0] : ""
  ].filter(Boolean);
  if (!facts.length) return "";
  const severity = budget.level === "severe" || budget.level === "warning" ? " warn" : "";
  return `<div class="position-risk-line${severity}">${facts.slice(0, 4).map((text) => `<span>${escapeHtml(text)}</span>`).join("")}</div>`;
}

function renderSnapshotFactStrip(snapshot = {}, options = {}) {
  const trend = snapshot.trendProfile || {};
  const actionability = snapshot.actionability || {};
  const fees = snapshot.fees || {};
  const oneYear = snapshot.risk?.oneYear || {};
  const leadingFacts = Array.isArray(options.leadingFacts) ? options.leadingFacts : [];
  const includeAction = options.includeAction !== false;
  const facts = [
    ...leadingFacts,
    includeAction && actionability.action ? `动作 ${formatActionabilityAction(actionability.action)}` : "",
    Number.isFinite(Number(trend.return20dPct)) ? `20日 ${formatSigned(trend.return20dPct)}%` : "",
    Number.isFinite(Number(trend.lowPositionPct120)) ? `120日位置 ${formatNumber(trend.lowPositionPct120, 1)}%` : "",
    Number.isFinite(Number(trend.drawdownFromRecentHighPct)) ? `距高点 ${formatSigned(trend.drawdownFromRecentHighPct)}%` : "",
    Number.isFinite(Number(oneYear.maxDrawdownPct)) ? `1年回撤 ${formatSigned(oneYear.maxDrawdownPct)}%` : "",
    fees.shareClass ? `${fees.shareClass}类` : ""
  ].filter(Boolean);
  if (!facts.length) return "";
  return `<div class="fact-strip">${facts.slice(0, 6).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderWatchlistFactStrip(item = {}, snapshot = item.lastSnapshot || {}) {
  const rawAction = snapshot.actionability?.action ? `下钻倾向 ${formatActionabilityAction(snapshot.actionability.action)}` : "";
  return renderSnapshotFactStrip(snapshot, {
    includeAction: false,
    leadingFacts: [
      `池内状态 ${item.statusText || formatWatchlistStatus(item.status)}`,
      rawAction
    ].filter(Boolean)
  });
}

function getSnapshotTopHoldings(snapshot = {}) {
  const outlookHoldings = snapshot.actionability?.holdingsOutlook?.topHoldings || [];
  const holdings = snapshot.topHoldings?.length ? snapshot.topHoldings : outlookHoldings;
  return (holdings || []).map(formatHoldingText).filter(Boolean);
}

function formatHoldingText(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return [
    item.code || "",
    item.name || "",
    Number.isFinite(Number(item.pct ?? item.netValuePct)) ? `${formatNumber(item.pct ?? item.netValuePct, 2)}%` : ""
  ].filter(Boolean).join(" ");
}

function renderHoldingChips(holdings = [], title = "持仓") {
  const values = [...new Set((holdings || []).map(formatHoldingText).filter(Boolean))].slice(0, TOP_HOLDINGS_DISPLAY_LIMIT);
  if (!values.length) return "";
  return `
    <div class="holding-strip">
      <span>${escapeHtml(title)}</span>
      <div>${values.map((item) => `<small>${escapeHtml(item)}</small>`).join("")}</div>
    </div>
  `;
}

function renderWatchlist(items) {
  const list = document.querySelector("#watchlistList");
  const count = document.querySelector("#watchlistCount");
  count.textContent = `${items.length}`;
  if (!items.length) {
    list.innerHTML = `<div class="empty">暂无自选基金。盘前观察、今日操作或周总结会把值得等待的候选沉淀到这里。</div>`;
    return;
  }
  const groups = groupWatchlistItems(items);
  list.innerHTML = [
    renderWatchlistSummary(items),
    renderWatchlistCategoryDeck(groups)
  ].join("");
}

function renderWatchlistCategoryDeck(groups) {
  const categories = [
    { status: "ready", title: "接近买点", hint: "低位、费用和买入触发基本满足" },
    { status: "waiting_pullback", title: "等待回调", hint: "方向可跟踪，但还没到执行价格或形态" },
    { status: "watch", title: "观察中", hint: "有研究价值，继续补数据和等确认" },
    { status: "blocked", title: "暂不买", hint: "偏热、数据缺口或风险约束未通过" },
    { status: "in_position", title: "已持仓", hint: "与当前组合已有暴露相关" },
    { status: "removed", title: "已移出", hint: "历史候选，暂不参与决策" }
  ];
  return `
    <div class="watchlist-category-deck">
      ${categories
        .filter((category) => groups.get(category.status)?.length)
        .map((category) => renderWatchlistCategory(category, groups.get(category.status)))
        .join("")}
    </div>
  `;
}

function renderWatchlistCategory(category, items = []) {
  const best = items[0];
  const statusClass = getWatchlistStatusClass(category.status);
  return `
    <section class="watchlist-category">
      <div class="watchlist-category-head">
        <div>
          <h3>${escapeHtml(category.title)}</h3>
          <p>${escapeHtml(category.hint)}</p>
        </div>
        <span class="watchlist-pill ${statusClass}">${items.length} 只</span>
      </div>
      ${best ? `<small class="category-lead">优先看：${escapeHtml(best.code)} ${escapeHtml(best.name || "")} · ${escapeHtml(selectWatchlistPrimaryGap(best))}</small>` : ""}
      <div class="fund-card-grid compact-fund-grid">
        ${items.map(renderWatchlistItem).join("")}
      </div>
    </section>
  `;
}

function groupWatchlistItems(items) {
  const groups = new Map(WATCHLIST_STATUS_ORDER.map((status) => [status, []]));
  for (const item of items || []) {
    const status = WATCHLIST_STATUS_ORDER.includes(item.status) ? item.status : "watch";
    groups.get(status).push(item);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.priority || 3) - Number(b.priority || 3)
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }
  return groups;
}

function renderWatchlistSummary(items) {
  const counts = WATCHLIST_STATUS_ORDER
    .map((status) => ({
      status,
      count: (items || []).filter((item) => (WATCHLIST_STATUS_ORDER.includes(item.status) ? item.status : "watch") === status).length
    }))
    .filter((item) => item.count);
  if (!counts.length) return "";
  return `
    <div class="watchlist-summary">
      ${counts.map((item) => `<span class="watchlist-pill ${getWatchlistStatusClass(item.status)}">${escapeHtml(WATCHLIST_STATUS_LABELS[item.status] || item.status)} ${item.count}</span>`).join("")}
    </div>
  `;
}

function renderWatchlistSetupFocus(items = []) {
  const focusItems = selectWatchlistSetupFocusItems(items);
  if (!focusItems.length) return "";
  return `
    <section class="watchlist-setup-focus">
      <div class="watchlist-action-head">
        <strong>启动前夜重点复核</strong>
        <span>${focusItems.length} 只 · 等净值下钻确认后再进入买点评估</span>
      </div>
      <div class="watchlist-setup-list">
        ${focusItems.map(renderWatchlistSetupFocusItem).join("")}
      </div>
    </section>
  `;
}

function selectWatchlistSetupFocusItems(items = []) {
  return (items || [])
    .filter(isWatchlistLaunchEveCandidate)
    .filter((item) => !["blocked", "removed", "in_position"].includes(item.status))
    .sort((a, b) => Number(b.readinessScore || 0) - Number(a.readinessScore || 0)
      || Number(a.priority || 3) - Number(b.priority || 3)
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, 5);
}

function renderWatchlistSetupFocusItem(item) {
  const gap = selectWatchlistPrimaryGap(item);
  const trend = getFundSnapshotTrendText(item.lastSnapshot || {});
  return `
    <article class="watchlist-setup-item">
      <div>
        <strong>${escapeHtml(item.code)} ${escapeHtml(item.name || "")}</strong>
        <small>${escapeHtml([item.statusText || formatWatchlistStatus(item.status), formatWatchlistReadiness(item)].filter(Boolean).join(" · "))}</small>
      </div>
      <div>
        <span class="watchlist-setup-badge">启动前夜</span>
        <small>${escapeHtml(gap)}</small>
        ${trend && trend !== "走势数据不足" ? `<small>${escapeHtml(trend)}</small>` : ""}
      </div>
    </article>
  `;
}

function renderWatchlistActionQueue(items = []) {
  const ready = selectWatchlistActionItems(items, "ready", 3);
  const waiting = selectWatchlistActionItems(items, "waiting_pullback", 3);
  const queue = [...ready, ...waiting];
  if (!queue.length) {
    return `
      <section class="watchlist-action-queue">
        <div class="watchlist-action-head">
          <strong>购买准备队列</strong>
          <span>暂无接近可买或等待回调候选</span>
        </div>
      </section>
    `;
  }
  return `
    <section class="watchlist-action-queue">
      <div class="watchlist-action-head">
        <strong>购买准备队列</strong>
        <span>接近可买 ${ready.length} · 等待回调 ${waiting.length}</span>
      </div>
      <div class="watchlist-action-grid">
        ${queue.map(renderWatchlistActionCard).join("")}
      </div>
    </section>
  `;
}

function selectWatchlistActionItems(items = [], status, limit) {
  return (items || [])
    .filter((item) => item.status === status)
    .sort((a, b) => Number(b.readinessScore || 0) - Number(a.readinessScore || 0)
      || Number(a.priority || 3) - Number(b.priority || 3)
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
}

function renderWatchlistActionCard(item) {
  const statusClass = getWatchlistStatusClass(item.status);
  const snapshot = item.lastSnapshot || {};
  const trigger = item.buyTriggers?.[0] || item.positionPlan || "等待下一次复查";
  const gap = selectWatchlistPrimaryGap(item);
  const risk = item.riskNotes?.[0] || "风险边界待补充";
  const fee = item.feeNotes?.[0] || "费用/份额待复核";
  const trend = getFundSnapshotTrendText(snapshot);
  const readiness = formatWatchlistReadiness(item);
  const setupBadge = isWatchlistLaunchEveCandidate(item) ? `<span class="watchlist-setup-badge">启动前夜</span>` : "";
  const facts = renderWatchlistFactStrip(item, snapshot);
  const holdings = renderHoldingChips(getSnapshotTopHoldings(snapshot), "持仓看点");
  return `
    <article class="watchlist-action-card">
      <div class="watchlist-action-title">
        <strong>${escapeHtml(item.code)} ${escapeHtml(item.name || "")}</strong>
        <span class="${statusClass}">${escapeHtml(item.statusText || formatWatchlistStatus(item.status))}</span>
      </div>
      ${setupBadge}
      ${readiness ? `<div class="watchlist-readiness">${readiness}</div>` : ""}
      <p>${escapeHtml(item.reason || item.candidateRole || "暂无备选理由")}</p>
      ${trend && trend !== "走势数据不足" ? `<small>${escapeHtml(trend)}</small>` : ""}
      ${facts}
      ${holdings}
      <small>触发：${escapeHtml(trigger)}</small>
      <small class="watchlist-gap-line">缺口：${escapeHtml(gap)}</small>
      <small>风险：${escapeHtml(risk)}</small>
      <small>费用：${escapeHtml(fee)}</small>
      <small>${escapeHtml(item.reviewDate || "下一次盘前观察复查")}</small>
    </article>
  `;
}

function renderWatchlistGroup(status, items = []) {
  return `
    <section class="watchlist-group" data-watchlist-status="${escapeHtml(status)}">
      <div class="watchlist-group-head">
        <strong>${escapeHtml(WATCHLIST_STATUS_LABELS[status] || formatWatchlistStatus(status))}</strong>
        <span>${items.length} 只</span>
      </div>
      ${items.map(renderWatchlistItem).join("")}
    </section>
  `;
}

function renderWatchlistItem(item) {
  const snapshot = item.lastSnapshot || {};
  const trend = getFundSnapshotTrendText(snapshot);
  const trendChart = renderTrendChart(snapshot);
  const statusClass = getWatchlistStatusClass(item.status);
  const snapshotEvidence = formatWatchlistSnapshotEvidence(snapshot);
  const source = item.source || snapshot.sources?.[0] || "";
  const observationGaps = selectWatchlistObservationGaps(item);
  const setupBadge = isWatchlistLaunchEveCandidate(item) ? `<span class="watchlist-setup-badge">启动前夜</span>` : "";
  const facts = renderWatchlistFactStrip(item, snapshot);
  const holdings = renderHoldingChips(getSnapshotTopHoldings(snapshot), "持仓看点");
  return `
    <details class="fund-card watchlist-fund-card">
      <summary class="fund-card-summary">
        <div class="fund-card-title">
          <strong>${escapeHtml(item.code)} ${escapeHtml(item.name || "")}</strong>
          <span class="${statusClass}">${escapeHtml(item.statusText || formatWatchlistStatus(item.status))}</span>
        </div>
        <div class="fund-card-kpis">
          ${formatWatchlistReadiness(item) ? `<span>${formatWatchlistReadiness(item)}</span>` : `<span>优先级 ${escapeHtml(item.priority || 3)}</span>`}
          ${setupBadge}
        </div>
        <small>${escapeHtml(selectWatchlistPrimaryGap(item) || item.reason || "点击查看候选细节")}</small>
      </summary>
      <div class="fund-card-detail">
        <p>${escapeHtml(item.reason || "暂无备选理由")}</p>
        ${trend && trend !== "走势数据不足" ? `<p>${escapeHtml(trend)}</p>` : ""}
        ${facts}
        ${renderWatchlistObservationGapPanel(observationGaps)}
        ${trendChart}
        ${holdings}
        <small>${escapeHtml([item.type, item.shareClass ? `${item.shareClass}类` : "", item.candidateRole, item.reviewDate || "待复查"].filter(Boolean).join(" · "))}</small>
        <div class="watchlist-evidence-grid">
          ${renderWatchlistEvidenceBlock("备选证据", item.setupEvidence)}
          ${renderWatchlistEvidenceBlock("买入触发", item.buyTriggers)}
          ${renderWatchlistEvidenceBlock("买入缺口", item.readinessGaps)}
          ${renderWatchlistEvidenceBlock("风险边界", item.riskNotes)}
          ${renderWatchlistEvidenceBlock("费用/份额", item.feeNotes)}
          ${renderWatchlistEvidenceBlock("替代份额", formatWatchlistAlternativeItems(item.alternativeShareClasses))}
          ${renderWatchlistEvidenceBlock("同类替代", formatWatchlistAlternativeItems(item.sameExposureAlternatives))}
          ${renderWatchlistEvidenceBlock("净值快照", snapshotEvidence)}
          ${renderWatchlistEvidenceBlock("数据依据", [...(item.dataBasis || []), source].filter(Boolean))}
          ${item.positionPlan ? renderWatchlistEvidenceBlock("仓位计划", [item.positionPlan]) : ""}
        </div>
      </div>
    </details>
  `;
}

function formatWatchlistReadiness(item = {}) {
  const score = Number(item.readinessScore);
  if (!Number.isFinite(score)) return "";
  const label = item.readinessLabel || "买入准备度";
  return `准备度 ${formatNumber(score, 0)} · ${escapeHtml(label)}`;
}

function selectWatchlistPrimaryGap(item = {}) {
  return selectWatchlistObservationGaps(item)[0]
    || item.readinessGaps?.[0]
    || "等待下一次复查";
}

function selectWatchlistObservationGaps(item = {}) {
  const values = [
    item.reason,
    ...(item.setupEvidence || []),
    ...(item.riskNotes || []),
    ...(item.readinessGaps || [])
  ];
  const gaps = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const matched = text.match(/观察缺口：[^。；\n]+[。]?/g) || [];
    for (const itemText of matched) {
      gaps.push(itemText.replace(/^观察缺口：/, "").replace(/[。；\s]+$/g, ""));
    }
    if (!matched.length && /(还差|缺少|等待|偏热|未温和转强|低位.*不足|暂不买入)/.test(text)) {
      gaps.push(text);
    }
  }
  return [...new Set(gaps.filter(Boolean))].slice(0, 4);
}

function isWatchlistLaunchEveCandidate(item = {}) {
  const values = [
    item.candidateRole,
    item.reason,
    item.positionPlan,
    item.source,
    ...(item.setupEvidence || []),
    ...(item.dataBasis || [])
  ];
  return values.some((value) => /启动前夜|低位启动前夜|low_base_turn_scan/.test(String(value || "")));
}

function renderWatchlistObservationGapPanel(gaps = []) {
  if (!gaps.length) return "";
  return `
    <div class="watchlist-gap-panel">
      <strong>观察缺口</strong>
      <span>${escapeHtml(gaps.join("；"))}</span>
    </div>
  `;
}

function formatWatchlistAlternativeItems(items = []) {
  return (items || []).map((item) => [
    item.code,
    item.name || "",
    item.shareClass ? `${item.shareClass}类` : "",
    item.statusText || (item.status ? formatWatchlistStatus(item.status) : "")
  ].filter(Boolean).join(" "));
}

function renderWatchlistEvidenceBlock(title, values = []) {
  return `
    <div class="watchlist-evidence-block">
      <strong>${escapeHtml(title)}</strong>
      ${renderWatchlistTags(values) || `<small>暂无</small>`}
    </div>
  `;
}

function formatWatchlistSnapshotEvidence(snapshot = {}) {
  const trend = snapshot.trendProfile || {};
  return [
    snapshot.nav ? `净值 ${formatNumber(snapshot.nav, 4)}${snapshot.navDate ? `（${snapshot.navDate}）` : ""}` : "",
    snapshot.navBasis && snapshot.navBasis !== "missing" ? `净值依据 ${snapshot.navBasis}` : "",
    Number.isFinite(Number(trend.return20dPct)) ? `20日 ${formatSigned(trend.return20dPct)}%` : "",
    Number.isFinite(Number(trend.return60dPct)) ? `60日 ${formatSigned(trend.return60dPct)}%` : "",
    Number.isFinite(Number(trend.lowPositionPct120)) ? `120日位置 ${formatNumber(trend.lowPositionPct120, 1)}%` : "",
    Number.isFinite(Number(trend.drawdownFromRecentHighPct)) ? `距高点 ${formatSigned(trend.drawdownFromRecentHighPct)}%` : ""
  ].filter(Boolean);
}

function renderWatchlistTags(values = []) {
  return (values || [])
    .map((value) => `<small>${escapeHtml(value)}</small>`)
    .join("");
}

function renderRuns(runs) {
  const list = document.querySelector("#runList");
  if (!runs.length) {
    list.innerHTML = `<div class="empty">暂无决策记录。</div>`;
    return;
  }
  list.innerHTML = `<div class="manager-timeline">${runs
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
        <details class="run-item timeline-card">
          <summary>
            <div class="timeline-marker"></div>
            <div>
              <strong>${escapeHtml(run.date || "")} · ${escapeHtml(run.title || formatRunTypeLabel(run.type))}</strong>
              <p>${escapeHtml(run.summary || "无摘要")}</p>
              <small>${escapeHtml([orders, transactions, notes].filter(Boolean).join(" · ") || "点击查看经理分析、动作和原始日报")}</small>
            </div>
            <strong class="${statusClass}">${escapeHtml(formatRunStatus(run.status))}</strong>
          </summary>
          <div class="run-detail">
            <div class="run-meta">
              <span>开始：${escapeHtml(formatDateTime(run.startedAt))}</span>
              <span>进度：${escapeHtml(formatDateTime(run.progressAt))}</span>
              <span>结束：${escapeHtml(formatDateTime(run.completedAt))}</span>
              <span>耗时：${durationSeconds}s</span>
            </div>
            ${run.error ? `<p class="bad-text">${escapeHtml(run.error)}</p>` : ""}
            ${renderRunThinkingCards(run)}
            <details class="raw-run-card">
              <summary>完整日报文本</summary>
              <pre>${escapeHtml(run.card || run.summary || (run.status === "running" ? "任务仍在运行，刷新后查看最新状态。" : "无内容"))}</pre>
            </details>
          </div>
        </details>
      `;
    })
    .join("")}</div>`;
}

function renderRunThinkingCards(run = {}) {
  const team = Array.isArray(run.team) ? run.team : [];
  const cardPreview = String(run.card || "").split("\n").slice(0, 3).join(" ");
  const actionCards = (run.actions || []).map((action) => `
    <article class="thought-card">
      <span>${escapeHtml(action.action || "ACTION")}</span>
      <strong>${escapeHtml([action.code, action.name].filter(Boolean).join(" ") || "组合动作")}</strong>
      <p>${escapeHtml(action.reason || "暂无动作理由")}</p>
      ${renderRunActionAudit(action)}
    </article>
  `);
  const teamCards = team.map((item) => `
    <article class="thought-card">
      <span>${escapeHtml(item.agent || "投委会")}</span>
      <strong>${escapeHtml(item.stance || "中")}</strong>
      <p>${escapeHtml(item.reason || "暂无观点")}</p>
      <small>${escapeHtml((item.dataBasis || []).join("；"))}</small>
    </article>
  `);
  const operationalCards = [
    ...(run.orders || []).map((order) => `
      <article class="thought-card">
        <span>订单</span>
        <strong>${escapeHtml(order.side || "")} ${escapeHtml(order.code || "")}</strong>
        <p>${escapeHtml(`${formatMoney(order.amount)} · ${order.status || ""}`)}</p>
        <small>${escapeHtml(`估值日 ${order.priceDate || "-"}，确认日 ${order.confirmDate || "-"}`)}</small>
      </article>
    `),
    ...(run.executionNotes || []).map((note) => `
      <article class="thought-card">
        <span>执行说明</span>
        <strong>${escapeHtml([note.action, note.code].filter(Boolean).join(" ") || "说明")}</strong>
        <p>${escapeHtml(note.reason || "")}</p>
      </article>
    `)
  ];
  const fallbackCards = !teamCards.length && !actionCards.length && !operationalCards.length
    ? [`<article class="thought-card"><span>${escapeHtml(formatRunTypeLabel(run.type))}</span><strong>${escapeHtml(run.summary || "暂无摘要")}</strong><p>${escapeHtml(cardPreview || "暂无可展示分析")}</p></article>`]
    : [];
  return `
    <div class="thought-section">
      <div class="thought-section-head">
        <h3>经理分析卡片</h3>
        <span>展示投委会观点与执行依据，不展示隐藏思考链</span>
      </div>
      <div class="thought-grid">
        ${[...teamCards, ...actionCards, ...operationalCards, ...fallbackCards].join("")}
      </div>
    </div>
  `;
}

function renderRunActionAudit(action = {}) {
  const items = [
    { label: "榜单", value: action.rankingBasis, className: "ranking" },
    { label: "走势", value: action.positionCheck || action.rotationCheck, className: "trend" },
    { label: "边界", value: action.riskControl || action.chaseRisk, className: "risk" }
  ].filter((item) => String(item.value || "").trim());
  if (!items.length) {
    const fallback = [action.rotationCheck, action.positionCheck, action.chaseRisk, action.riskControl].filter(Boolean).join("；");
    return fallback ? `<small>${escapeHtml(fallback)}</small>` : "";
  }
  return `
    <div class="action-audit-list">
      ${items.map((item) => `
        <div class="action-audit-item ${escapeHtml(item.className)}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function formatRunTypeLabel(type) {
  return {
    premarket: "盘前观察",
    decision: "今日操作",
    valuation: "晚间估值",
    weekly: "周总结"
  }[type] || type || "组合任务";
}

function formatRunStatus(status) {
  return {
    running: "运行中",
    completed: "完成",
    failed: "异常",
    interrupted: "中断",
    cancelled: "结束"
  }[status] || status || "";
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
          <small>${escapeHtml(getFundSnapshotTrendText(item.fundSnapshot || {}))}</small>
          ${renderTrendChart(item.fundSnapshot || {})}
        </div>
      `
    )
    .join("");
}

function getFundSnapshotTrendText(snapshot = {}) {
  if (snapshot.trendSummary && snapshot.trendSummary !== "走势数据不足") {
    return snapshot.trendSummary;
  }
  const trend = snapshot.trendProfile || {};
  const actionability = snapshot.actionability || {};
  if (trend.ok) {
    const parts = [
      trend.return20dPct !== null && trend.return20dPct !== undefined ? `20日${formatSigned(trend.return20dPct)}%` : "",
      trend.return60dPct !== null && trend.return60dPct !== undefined ? `60日${formatSigned(trend.return60dPct)}%` : "",
      trend.return120dPct !== null && trend.return120dPct !== undefined ? `120日${formatSigned(trend.return120dPct)}%` : "",
      trend.drawdownFromRecentHighPct !== null && trend.drawdownFromRecentHighPct !== undefined ? `距高点${formatSigned(trend.drawdownFromRecentHighPct)}%` : "",
      trend.trendLabel ? `趋势${formatTrendLabel(trend.trendLabel)}` : "",
      trend.entryBias ? `入场${formatEntryBias(trend.entryBias)}` : "",
      actionability.action ? `自评${formatActionabilityAction(actionability.action)}${actionability.allocationBand ? ` ${actionability.allocationBand}` : ""}` : ""
    ].filter(Boolean);
    return parts.join("，");
  }
  return snapshot.trendSummary || "走势数据不足";
}

function renderTrendChart(snapshot = {}) {
  const series = Array.isArray(snapshot.trendProfile?.series) ? snapshot.trendProfile.series : [];
  const points = series
    .map((item) => ({
      date: item.date || "",
      nav: Number(item.nav)
    }))
    .filter((item) => Number.isFinite(item.nav));
  if (points.length < 2) return "";

  const width = 260;
  const height = 58;
  const pad = 5;
  const min = Math.min(...points.map((item) => item.nav));
  const max = Math.max(...points.map((item) => item.nav));
  const range = max - min || 1;
  const coordinates = points.map((item, index) => {
    const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((item.nav - min) / range) * (height - pad * 2);
    return `${roundForSvg(x)},${roundForSvg(y)}`;
  });
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = first.nav > 0 ? ((last.nav / first.nav - 1) * 100) : 0;
  const strokeClass = changePct >= 0 ? "up" : "down";
  const label = `${first.date || "-"} 到 ${last.date || "-"}：${formatSigned(changePct)}%`;

  return `
    <div class="trend-chart-wrap">
      <svg class="trend-chart ${strokeClass}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}" preserveAspectRatio="none">
        <polyline points="${coordinates.join(" ")}"></polyline>
      </svg>
      <small>${escapeHtml(label)}</small>
    </div>
  `;
}

function roundForSvg(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function formatTrendLabel(value) {
  return {
    breakdown: "破位",
    extended_uptrend: "偏热",
    pullback_complete: "回调完成",
    launch_setup: "启动前夜",
    rebound_repair: "修复",
    uptrend: "上行",
    weakening: "转弱",
    range_or_mixed: "震荡"
  }[value] || value || "未知";
}

function formatEntryBias(value) {
  return {
    buyable_now: "可买",
    staged_buy: "分批",
    BUY: "可买",
    BATCH: "分批",
    STAGE: "分批",
    WAIT: "等回撤",
    AVOID: "回避",
    wait_pullback: "等回撤",
    hold_observe: "持有观察",
    avoid_now: "回避"
  }[value] || value || "观察";
}

function formatActionabilityAction(value) {
  return {
    buy: "买入",
    staged_buy: "分批",
    BUY: "买入",
    BATCH: "分批",
    STAGE: "分批",
    WAIT: "等待",
    AVOID: "回避",
    hold: "持有",
    wait: "等待",
    watch: "观察",
    avoid: "回避",
    need_specific_fund: "需具体基金"
  }[value] || value || "观察";
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

async function saveUserHolding(event) {
  event.preventDefault();
  const formData = new FormData(userHoldingForm);
  const payload = Object.fromEntries(formData.entries());
  payload.visibleReturnPct = payload.visibleReturnPct === "" ? null : Number(payload.visibleReturnPct);
  payload.currentNav = payload.currentNav === "" ? null : Number(payload.currentNav);
  const result = await apiFetch("/api/user-portfolios/holding", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  showToast("用户持仓已保存");
  renderPortfolioResult(result);
  userHoldingForm.reset();
}

async function removeUserHolding(userId, code) {
  if (!userId || !code) return;
  if (!confirm(`确定从用户 ${userId} 的持仓关注中移出 ${code} 吗？`)) {
    return;
  }
  const result = await apiFetch("/api/user-portfolios/holding", {
    method: "POST",
    body: JSON.stringify({ userId, code, operation: "REMOVE" })
  });
  showToast("用户持仓已移出");
  renderPortfolioResult(result);
}

function fillUserHoldingForm(userId, code) {
  const user = (currentPortfolio?.userPortfolios || []).find((item) => item.userId === userId);
  const holding = (user?.holdings || []).find((item) => item.code === code);
  if (!user || !holding || !userHoldingForm) return;
  userHoldingForm.elements.userId.value = user.userId || "";
  userHoldingForm.elements.displayName.value = user.displayName || "";
  userHoldingForm.elements.code.value = holding.code || "";
  userHoldingForm.elements.name.value = holding.name || "";
  userHoldingForm.elements.visibleReturnPct.value = holding.visibleReturnPct ?? "";
  userHoldingForm.elements.visibleReturnLabel.value = holding.visibleReturnLabel || "";
  userHoldingForm.elements.currentNav.value = holding.currentNav ?? "";
  userHoldingForm.elements.status.value = holding.status || "holding";
  userHoldingForm.elements.userNote.value = holding.userNote || "";
  userHoldingForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderPortfolioResult(result) {
  const portfolio = result.portfolio || result;
  currentPortfolio = portfolio;
  loadStats().catch(showError);
  if (portfolio.account) {
    setText("#portfolioTotalAsset", formatMoney(portfolio.account.totalAsset));
    setText("#portfolioCash", formatMoney(portfolio.account.cash));
    setText("#portfolioPositionWeight", `${portfolio.account.positionWeightPct || 0}%`);
    setText("#portfolioPending", `${formatMoney(Number(portfolio.account.pendingBuyAmount || 0) + Number(portfolio.account.receivableCash || 0))}`);
    setText("#portfolioPnl", formatPortfolioPnl(portfolio.account));
    setText("#portfolioSchedule", formatPortfolioSchedule(portfolio));
    renderPortfolioDashboard(portfolio);
    renderManagerRankings(portfolio.managerRankings || {});
    renderOrders(portfolio.activeOrders || []);
    renderPositions(portfolio.positions || []);
    renderUserPortfolios(portfolio.userPortfolios || []);
    renderWatchlist(portfolio.watchlist || []);
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

function formatReleaseVersion(release = {}) {
  const name = release.name || "FundAgent";
  const version = release.version ? `v${release.version}` : "";
  return [name, version].filter(Boolean).join(" ");
}

function formatReleaseCommit(release = {}) {
  return release.shortCommit || (release.commit ? String(release.commit).slice(0, 7) : "-");
}

function formatDiagnosticSeverity(value) {
  const labels = {
    critical: "严重",
    warning: "预警",
    info: "观察",
    ok: "正常"
  };
  return labels[value] || labels.info;
}

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  return number.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function formatWatchlistStatus(value) {
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

function getWatchlistStatusClass(value) {
  if (value === "ready" || value === "in_position") return "ok-text";
  if (value === "waiting_pullback" || value === "watch") return "warn-text";
  return "bad-text";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
