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
let currentDeployment = null;
let activeManagerRankingFilter = "";
let managerRankingFilterInitialized = false;
let activePortfolioView = "overview";
let activeRuntimeView = "overview";
let activePortfolioOrderView = "active";
let activePortfolioDiagnosticView = "capability";
let activePortfolioRunnerView = "control";
let activePortfolioRunKey = "";
let activePortfolioRunPanel = "brief";
let portfolioTimelineFullLoaded = false;
let portfolioTimelineFullLoading = false;
let activeWatchlistStatus = "";
let activeUserPortfolioId = "";

const WATCHLIST_STATUS_ORDER = ["ready", "waiting_pullback", "watch", "blocked", "in_position", "removed"];
const TOP_HOLDINGS_DISPLAY_LIMIT = 10;
const RUN_DETAIL_PANEL_ORDER = ["brief", "actions", "committee", "execution", "report"];
const PORTFOLIO_RISK_LANES = [
  { id: "drawdown_defense", title: "回撤防线", tone: "defense", empty: "暂无需要单独拉响的回撤防线。" },
  { id: "sell_risk", title: "卖出风险", tone: "sell", empty: "暂无明确卖出风险。" },
  { id: "chase_risk", title: "追涨风险", tone: "chase", empty: "暂无偏热追涨提醒。" },
  { id: "user_holding_alerts", title: "用户持仓提醒", tone: "user", empty: "暂无客户持仓提醒。" }
];
const PORTFOLIO_SECTOR_LANES = [
  { id: "theme_allocation", title: "主题配置", tone: "theme", empty: "暂无主题配置线索。" },
  { id: "rotation_opportunity", title: "轮动启动", tone: "rotation", empty: "暂无低位轮动线索。" },
  { id: "holdings_outlook", title: "持仓前景", tone: "holdings", empty: "暂无前十大持仓前景线索。" },
  { id: "quality_score", title: "质量优选", tone: "quality", empty: "暂无风险收益质量线索。" }
];
const PORTFOLIO_ACTION_LANES = [
  { id: "buy", title: "买入动作", tone: "buy", empty: "暂无买入或试探动作。" },
  { id: "sell", title: "卖出动作", tone: "sell", empty: "暂无卖出或减仓动作。" },
  { id: "watch", title: "观察动作", tone: "watch", empty: "暂无观察或持有动作。" },
  { id: "orders", title: "执行流转", tone: "order", empty: "暂无待确认订单。" }
];
const PORTFOLIO_ALERT_LANES = [
  { id: "buy", title: "买入复核", tone: "buy", empty: "暂无需要置顶的买入复核。" },
  { id: "sell", title: "卖出/风控", tone: "sell", empty: "暂无卖出或风控预警。" },
  { id: "data", title: "数据/费率补证", tone: "data", empty: "暂无关键数据或费率补证。" },
  { id: "user", title: "用户持仓提醒", tone: "user", empty: "暂无用户持仓提醒。" }
];
const PORTFOLIO_POSITION_LANES = [
  { id: "risk", title: "风险预警", tone: "risk", empty: "暂无需要立即处理的持仓风险。" },
  { id: "profit", title: "止盈/回吐", tone: "profit", empty: "暂无明显止盈或浮盈回吐项。" },
  { id: "core", title: "核心持有", tone: "core", empty: "暂无核心持仓。" },
  { id: "watch", title: "小仓观察", tone: "watch", empty: "暂无小仓观察项。" }
];
const PORTFOLIO_DATA_LANES = [
  { id: "nav", title: "净值/走势", tone: "nav", empty: "暂无过期净值或走势缺口。" },
  { id: "fee", title: "份额/费率", tone: "fee", empty: "暂无份额或费率缺口。" },
  { id: "holdings", title: "持仓/前景", tone: "holdings", empty: "暂无前十大持仓缺口。" },
  { id: "source", title: "来源/补证", tone: "source", empty: "暂无来源补证事项。" }
];
const MANAGER_RANKING_GROUPS = [
  {
    id: "action",
    title: "行动",
    hint: "买卖与仓位",
    listIds: ["decision_synthesis", "buy_preparation", "cash_redeployment", "position_sizing", "sell_risk", "opportunity_cost"]
  },
  {
    id: "opportunity",
    title: "机会",
    hint: "低位与轮动",
    listIds: ["launch_setup", "theme_allocation", "rotation_opportunity", "holdings_outlook"]
  },
  {
    id: "risk",
    title: "风控",
    hint: "追涨与回撤",
    listIds: ["chase_risk", "drawdown_defense", "portfolio_fit", "user_holding_alerts"]
  },
  {
    id: "evidence",
    title: "证据",
    hint: "质量与费率",
    listIds: ["quality_score", "manager_stability", "data_confidence", "fee_suitability", "replacement_choice"]
  }
];
const PORTFOLIO_WORKSPACE_OVERVIEW_GROUPS = [
  { id: "account", title: "账户", hint: "持仓与客户", focusViews: ["positions", "users"] },
  { id: "opportunity", title: "机会", hint: "低位、轮动与自选", focusViews: ["opportunities", "sectors", "watchlist"] },
  { id: "decision", title: "决策", hint: "行动、预警、榜单与风控", focusViews: ["runner", "alerts", "actions", "rankings", "matrix"] },
  { id: "records", title: "记录", hint: "时间线与订单", focusViews: ["timeline", "orders"] }
];
const PORTFOLIO_VIEW_GROUPS = {
  overview: "overview",
  positions: "account",
  users: "account",
  sectors: "opportunity",
  opportunities: "opportunity",
  watchlist: "opportunity",
  runner: "decision",
  actions: "decision",
  alerts: "decision",
  matrix: "decision",
  risk: "decision",
  data: "decision",
  rankings: "decision",
  diagnostics: "decision",
  timeline: "records",
  orders: "records"
};
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
document.body.dataset.activeTab = document.querySelector("[data-tab].active")?.dataset.tab || "config";
setRuntimeView(localStorage.getItem("fundagent_runtime_view") || activeRuntimeView);
setPortfolioView(localStorage.getItem("fundagent_portfolio_view") || activePortfolioView);
setPortfolioOrderView(localStorage.getItem("fundagent_portfolio_order_view") || activePortfolioOrderView);
setPortfolioDiagnosticView(localStorage.getItem("fundagent_portfolio_diagnostic_view") || activePortfolioDiagnosticView);
setPortfolioRunnerView(localStorage.getItem("fundagent_portfolio_runner_view") || activePortfolioRunnerView);

document.querySelector("#saveTokenBtn").addEventListener("click", () => {
  localStorage.setItem("fundagent_admin_token", adminTokenInput.value.trim());
  showToast("令牌已保存");
  loadAll().catch(showError);
});

document.querySelector("#reloadBtn").addEventListener("click", () => loadAll().catch(showError));
document.querySelector("#refreshStatsBtn").addEventListener("click", () => loadStats().catch(showError));
document.querySelector("[data-panel='runtime']")?.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-runtime-view-target]");
  if (!viewButton) return;
  setRuntimeView(viewButton.dataset.runtimeViewTarget || "overview");
});
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
document.querySelector("#userPortfolioRail")?.addEventListener("click", (event) => {
  const userPortfolioButton = event.target.closest("[data-user-portfolio-select]");
  if (!userPortfolioButton) return;
  event.stopPropagation();
  activeUserPortfolioId = userPortfolioButton.dataset.userPortfolioSelect || "";
  renderUserPortfolios(currentPortfolio?.userPortfolios || []);
});
document.querySelector("[data-panel='portfolio']")?.addEventListener("click", (event) => {
  const focusButton = event.target.closest("[data-focus-watchlist-code]");
  if (focusButton) {
    focusWatchlistFund(focusButton.dataset.focusWatchlistCode || "");
    return;
  }
  const runButton = event.target.closest("[data-run-select]");
  if (runButton) {
    activePortfolioRunKey = runButton.dataset.runSelect || "";
    if (runButton.dataset.portfolioViewTarget) {
      setPortfolioView(runButton.dataset.portfolioViewTarget);
    }
    renderRuns(currentPortfolio?.recentRuns || []);
    return;
  }
  const runPanelButton = event.target.closest("[data-run-panel]");
  if (runPanelButton) {
    activePortfolioRunPanel = runPanelButton.dataset.runPanel || "brief";
    if (runPanelButton.dataset.portfolioViewTarget) {
      setPortfolioView(runPanelButton.dataset.portfolioViewTarget);
    }
    renderRuns(currentPortfolio?.recentRuns || []);
    if (activePortfolioRunPanel === "report") {
      ensurePortfolioTimelineDetails().catch(showError);
    }
    return;
  }
  const watchlistStatusButton = event.target.closest("[data-watchlist-status-filter]");
  if (watchlistStatusButton) {
    activeWatchlistStatus = watchlistStatusButton.dataset.watchlistStatusFilter || "";
    renderWatchlist(currentPortfolio?.watchlist || []);
    return;
  }
  const userPortfolioButton = event.target.closest("[data-user-portfolio-select]");
  if (userPortfolioButton) {
    activeUserPortfolioId = userPortfolioButton.dataset.userPortfolioSelect || "";
    renderUserPortfolios(currentPortfolio?.userPortfolios || []);
    return;
  }
  const orderViewButton = event.target.closest("[data-order-view-target]");
  if (orderViewButton) {
    setPortfolioOrderView(orderViewButton.dataset.orderViewTarget || "active");
    return;
  }
  const diagnosticViewButton = event.target.closest("[data-diagnostic-view-target]");
  if (diagnosticViewButton) {
    setPortfolioDiagnosticView(diagnosticViewButton.dataset.diagnosticViewTarget || "capability");
    return;
  }
  const runnerViewButton = event.target.closest("[data-runner-view-target]");
  if (runnerViewButton) {
    setPortfolioRunnerView(runnerViewButton.dataset.runnerViewTarget || "control");
    return;
  }
  const rankingFilterButton = event.target.closest("[data-open-ranking-filter]");
  if (rankingFilterButton) {
    setPortfolioView("rankings");
    setManagerRankingFilter(rankingFilterButton.dataset.openRankingFilter || "");
    return;
  }
  const viewButton = event.target.closest("[data-portfolio-view-target]");
  if (!viewButton) return;
  setPortfolioView(viewButton.dataset.portfolioViewTarget || "overview");
});
document.querySelector("#managerRankingBoard")?.addEventListener("click", (event) => {
  const focusButton = event.target.closest("[data-focus-watchlist-code]");
  if (focusButton) {
    focusWatchlistFund(focusButton.dataset.focusWatchlistCode || "");
    return;
  }
  const filterButton = event.target.closest("[data-ranking-filter]");
  if (filterButton) {
    const nextFilter = filterButton.dataset.rankingFilter || "";
    setManagerRankingFilter(nextFilter);
    if (activeManagerRankingFilter) {
      const target = [...document.querySelectorAll("[data-ranking-id]")].find((node) => node.dataset.rankingId === activeManagerRankingFilter);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
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
  document.body.dataset.activeTab = tab || "config";
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
}

function setPortfolioView(view = "overview") {
  const nextView = document.querySelector(`[data-portfolio-view="${view}"]`) ? view : "overview";
  const nextGroup = PORTFOLIO_VIEW_GROUPS[nextView] || "overview";
  activePortfolioView = nextView;
  document.body.dataset.activePortfolioView = nextView;
  document.body.dataset.activePortfolioGroup = nextGroup;
  localStorage.setItem("fundagent_portfolio_view", nextView);
  document.querySelectorAll("[data-portfolio-view-target]").forEach((button) => {
    const active = button.dataset.portfolioViewTarget === nextView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-portfolio-group-target]").forEach((button) => {
    const active = button.dataset.portfolioGroupTarget === nextGroup;
    button.classList.toggle("group-active", active);
    if (!button.dataset.portfolioViewTarget || button.dataset.portfolioViewTarget !== nextView) {
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  });
  document.querySelectorAll("[data-portfolio-nav-group]").forEach((group) => {
    group.classList.toggle("active", group.dataset.portfolioNavGroup === nextGroup);
  });
  document.querySelectorAll("[data-portfolio-view]").forEach((section) => {
    section.classList.toggle("active", section.dataset.portfolioView === nextView);
  });
  if (nextView === "timeline") {
    ensurePortfolioTimelineDetails().catch(showError);
  }
}

function setRuntimeView(view = "overview") {
  const nextView = document.querySelector(`[data-runtime-view="${view}"]`) ? view : "overview";
  activeRuntimeView = nextView;
  localStorage.setItem("fundagent_runtime_view", nextView);
  document.querySelectorAll("[data-runtime-view-target]").forEach((button) => {
    const active = button.dataset.runtimeViewTarget === nextView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-runtime-view]").forEach((section) => {
    section.classList.toggle("active", section.dataset.runtimeView === nextView);
  });
}

function setPortfolioOrderView(view = "active") {
  const nextView = document.querySelector(`[data-order-view="${view}"]`) ? view : "active";
  activePortfolioOrderView = nextView;
  localStorage.setItem("fundagent_portfolio_order_view", nextView);
  document.querySelectorAll("[data-order-view-target]").forEach((button) => {
    const active = button.dataset.orderViewTarget === nextView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-order-view]").forEach((section) => {
    section.classList.toggle("active", section.dataset.orderView === nextView);
  });
}

function setPortfolioDiagnosticView(view = "capability") {
  const nextView = document.querySelector(`[data-diagnostic-view="${view}"]`) ? view : "capability";
  activePortfolioDiagnosticView = nextView;
  localStorage.setItem("fundagent_portfolio_diagnostic_view", nextView);
  document.querySelectorAll("[data-diagnostic-view-target]").forEach((button) => {
    const active = button.dataset.diagnosticViewTarget === nextView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-diagnostic-view]").forEach((section) => {
    section.classList.toggle("active", section.dataset.diagnosticView === nextView);
  });
}

function setPortfolioRunnerView(view = "control") {
  const nextView = document.querySelector(`[data-runner-view="${view}"]`) ? view : "control";
  activePortfolioRunnerView = nextView;
  localStorage.setItem("fundagent_portfolio_runner_view", nextView);
  document.querySelectorAll("[data-runner-view-target]").forEach((button) => {
    const active = button.dataset.runnerViewTarget === nextView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-runner-view]").forEach((section) => {
    section.classList.toggle("active", section.dataset.runnerView === nextView);
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
  const [statsResult, deploymentResult] = await Promise.allSettled([
    apiFetch("/api/stats"),
    apiFetch("/api/deployment", { timeoutMs: 12000 })
  ]);
  if (statsResult.status === "rejected") throw statsResult.reason;
  const stats = statsResult.value.stats || {};
  const deployment = deploymentResult.status === "fulfilled" ? deploymentResult.value.deployment || null : {
    status: "unknown",
    label: "无法确认",
    message: deploymentResult.reason?.message || "部署状态检查失败。",
    updateHint: "稍后刷新，或在服务器运行部署检查。",
    runtime: stats.release || {},
    latest: {}
  };
  currentDeployment = deployment;
  const release = stats.release || {};
  renderRuntimeTerminal(stats, deployment);
  renderPortfolioDeploymentStatus(deployment);
  renderRuntimeDiagnostics(stats.diagnostics);
  document.querySelector("#statsOutput").textContent = JSON.stringify(
    {
      startedAt: stats.startedAt,
      updatedAt: stats.updatedAt,
      release,
      deployment,
      diagnostics: stats.diagnostics,
      last: stats.last,
      counters: stats.counters || {}
    },
    null,
    2
  );
}

function renderRuntimeTerminal(stats = {}, deployment = null) {
  const counters = stats.counters || {};
  const diagnostics = stats.diagnostics || {};
  const release = stats.release || {};
  const diagnosticItems = Array.isArray(diagnostics.items) ? diagnostics.items : [];
  const conversationTotal = getRuntimeCounter(counters, "conversations");
  const dataSourceTotal = [
    "marketSnapshotCalls",
    "preciousMetalQuoteFetches",
    "preciousMetalFundSearches",
    "fundEnrichmentSuccess",
    "fundFeePageFetches",
    "fundHoldingsFetches"
  ].reduce((sum, key) => sum + getRuntimeCounter(counters, key), 0);
  const portfolioTotal = [
    "portfolioStatusRequests",
    "portfolioRuns",
    "portfolioNavVerifiedTrades",
    "portfolioPushes"
  ].reduce((sum, key) => sum + getRuntimeCounter(counters, key), 0);

  setText("#runtimeBrief", formatRuntimeBrief(diagnostics, deployment));
  setText("#runtimeNavOverviewCount", diagnosticItems.length ? String(diagnosticItems.length) : "OK");
  setText("#runtimeNavConversationCount", formatRuntimeCount(conversationTotal));
  setText("#runtimeNavDataCount", formatRuntimeCount(dataSourceTotal));
  setText("#runtimeNavPortfolioCount", formatRuntimeCount(portfolioTotal));
  setText("#runtimeNavReleaseCount", deployment?.status === "stale" ? "旧版" : release.branch || "-");

  renderRuntimeCards("#runtimeOverviewCards", [
    {
      label: "健康状态",
      value: formatRuntimeDiagnosticLevel(diagnostics.level),
      meta: diagnostics.summary || "暂无明显异常",
      tone: diagnostics.level === "critical" ? "bad" : diagnostics.level === "warning" ? "warn" : "ok"
    },
    {
      label: "用户对话",
      value: formatRuntimeCount(conversationTotal),
      meta: `图片 ${formatRuntimeCount(getRuntimeCounter(counters, "imagesReceived"))} · 回答 ${formatRuntimeCount(getRuntimeCounter(counters, "answersSent"))}`,
      tone: "info"
    },
    {
      label: "模型链路",
      value: formatRuntimeCount(getRuntimeCounter(counters, "modelCalls")),
      meta: `路由 ${formatRuntimeCount(getRuntimeCounter(counters, "intentRouterCalls"))} · 错误 ${formatRuntimeCount(getRuntimeCounter(counters, "errors"))}`,
      tone: getRuntimeCounter(counters, "errors") ? "warn" : "ok"
    },
    {
      label: "经理自动化",
      value: formatRuntimeCount(getRuntimeCounter(counters, "portfolioRuns")),
      meta: `查询 ${formatRuntimeCount(getRuntimeCounter(counters, "portfolioStatusRequests"))} · 推送 ${formatRuntimeCount(getRuntimeCounter(counters, "portfolioPushes"))}`,
      tone: "portfolio"
    }
  ]);

  renderRuntimeLanes("#runtimeConversationBoard", [
    {
      title: "用户入口",
      items: [
        { label: "对话数", value: conversationTotal, meta: "所有进入机器人链路的会话" },
        { label: "收到图片", value: getRuntimeCounter(counters, "imagesReceived"), meta: "截图识别与持仓导入入口" },
        { label: "回答次数", value: getRuntimeCounter(counters, "answersSent"), meta: "已发送给用户的回复" },
        { label: "进度消息", value: getRuntimeCounter(counters, "progressReplies"), meta: "长任务过程反馈" }
      ]
    },
    {
      title: "意图路由",
      items: [
        { label: "自然对话", value: getRuntimeCounter(counters, "conversationRequests"), meta: "不应强行触发基金分析" },
        { label: "单基分析", value: getRuntimeCounter(counters, "screeningRequests"), meta: "具体基金画像与买卖建议" },
        { label: "推荐发现", value: getRuntimeCounter(counters, "fundRecommendationRequests"), meta: "找基金、榜单、备选池" },
        { label: "基金问答", value: getRuntimeCounter(counters, "fundQaRequests"), meta: "概念解释和客户追问" }
      ]
    },
    {
      title: "模型投委会",
      items: [
        { label: "意图路由", value: getRuntimeCounter(counters, "intentRouterCalls"), meta: "决定是否调用 skill" },
        { label: "分析师阶段", value: getRuntimeCounter(counters, "analystReviewCalls"), meta: "多角色分析" },
        { label: "投票阶段", value: getRuntimeCounter(counters, "committeeVoteCalls"), meta: "观点汇总" },
        { label: "主席验收", value: getRuntimeCounter(counters, "managerReviewCalls"), meta: "最终质量控制" }
      ]
    }
  ]);

  renderRuntimeLanes("#runtimeDataBoard", [
    {
      title: "市场与贵金属",
      items: [
        { label: "市场快照", value: getRuntimeCounter(counters, "marketSnapshotCalls"), meta: "指数、板块、资金面" },
        { label: "贵金属行情", value: getRuntimeCounter(counters, "preciousMetalQuoteFetches"), meta: "黄金、白银等行情补证" },
        { label: "贵金属基金", value: getRuntimeCounter(counters, "preciousMetalFundSearches"), meta: "避免只凭叙事推荐黄金" }
      ]
    },
    {
      title: "基金资料",
      items: [
        { label: "联网补全", value: getRuntimeCounter(counters, "fundEnrichmentSuccess"), meta: "净值、规模、经理、风险" },
        { label: "费率页", value: getRuntimeCounter(counters, "fundFeePageFetches"), meta: "A/C/D/I 份额费用" },
        { label: "持仓补全", value: getRuntimeCounter(counters, "fundHoldingsFetches"), meta: "前十大持仓与行业前景" }
      ]
    }
  ]);

  renderRuntimeLanes("#runtimePortfolioBoard", [
    {
      title: "经理任务",
      items: [
        { label: "组合查询", value: getRuntimeCounter(counters, "portfolioStatusRequests"), meta: "用户询问经理持仓、仓位、操作" },
        { label: "组合任务", value: getRuntimeCounter(counters, "portfolioRuns"), meta: "盘前、决策、估值、周总结" },
        { label: "净值成交", value: getRuntimeCounter(counters, "portfolioNavVerifiedTrades"), meta: "按确认净值写入交易" },
        { label: "主动推送", value: getRuntimeCounter(counters, "portfolioPushes"), meta: "日报和预警推送" }
      ]
    },
    {
      title: "运行风险",
      items: [
        { label: "错误数", value: getRuntimeCounter(counters, "errors"), meta: "接口、模型或执行异常", tone: getRuntimeCounter(counters, "errors") ? "warn" : "ok" },
        { label: "飞书事件", value: getRuntimeCounter(counters, "messageEvents"), meta: "机器人收到的事件" },
        { label: "启动时间", value: formatDateTime(release.startedAt || stats.startedAt), meta: "服务本轮启动时间" }
      ]
    }
  ]);

  renderRuntimeCards("#runtimeReleaseBoard", [
    {
      label: "部署状态",
      value: formatDeploymentStatus(deployment),
      meta: formatDeploymentMeta(deployment),
      tone: getDeploymentTone(deployment)
    },
    { label: "当前版本", value: formatReleaseVersion(release), meta: release.name || "FundAgent", tone: "info" },
    { label: "当前提交", value: formatReleaseCommit(release), meta: "部署代码指纹", tone: "info" },
    { label: "当前分支", value: release.branch || "-", meta: "线上运行分支", tone: "info" },
    { label: "启动时间", value: formatDateTime(release.startedAt || stats.startedAt), meta: `更新 ${formatDateTime(stats.updatedAt)}`, tone: "info" }
  ]);
}

function renderRuntimeCards(selector, items = []) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = items.map((item) => `
    <article class="runtime-card ${escapeHtml(item.tone || "info")}">
      <span>${escapeHtml(item.label || "")}</span>
      <strong>${escapeHtml(item.value ?? "-")}</strong>
      <small>${escapeHtml(item.meta || "")}</small>
    </article>
  `).join("");
}

function renderRuntimeLanes(selector, lanes = []) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = lanes.map((lane) => `
    <section class="runtime-lane">
      <div class="runtime-lane-head">
        <strong>${escapeHtml(lane.title || "运行信号")}</strong>
        <span>${(lane.items || []).length} 项</span>
      </div>
      <div class="runtime-lane-list">
        ${(lane.items || []).map((item) => `
          <article class="runtime-stat-row ${escapeHtml(item.tone || "")}">
            <span>${escapeHtml(item.label || "")}</span>
            <strong>${escapeHtml(Number.isFinite(Number(item.value)) ? formatRuntimeCount(item.value) : item.value ?? "-")}</strong>
            <small>${escapeHtml(item.meta || "")}</small>
          </article>
        `).join("") || `<div class="empty compact-empty">暂无运行信号。</div>`}
      </div>
    </section>
  `).join("");
}

function getRuntimeCounter(counters = {}, key) {
  return Number(counters[key] || 0);
}

function formatRuntimeCount(value) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatRuntimeDiagnosticLevel(level = "") {
  return {
    ok: "正常",
    warning: "预警",
    critical: "严重"
  }[level] || "正常";
}

function formatRuntimeBrief(diagnostics = {}, deployment = null) {
  if (deployment?.status === "stale") {
    const current = deployment.runtime?.shortCommit || formatReleaseCommit(deployment.runtime || {});
    const latest = deployment.latest?.shortCommit || "-";
    return `部署落后：当前 ${current}，最新 ${latest}。请先更新服务器，否则后台页面和经理能力仍可能是旧版本。`;
  }
  if (deployment?.status === "unknown") {
    return `${diagnostics.summary || "运行状态暂无明显异常。"} 部署状态暂时无法确认。`;
  }
  return diagnostics.summary || "运行状态暂无明显异常。";
}

function formatDeploymentStatus(deployment = null) {
  if (!deployment) return "未检查";
  return deployment.label || {
    current: "已是最新",
    stale: "部署落后",
    unknown: "无法确认"
  }[deployment.status] || "无法确认";
}

function formatDeploymentMeta(deployment = null) {
  if (!deployment) return "等待部署检查。";
  const current = deployment.runtime?.shortCommit || "-";
  const latest = deployment.latest?.shortCommit || "-";
  const branch = deployment.branch || "main";
  const hint = deployment.status === "stale"
    ? deployment.updateHint || "需要拉取最新镜像或重新构建。"
    : deployment.message || deployment.updateHint || "部署检查完成。";
  return `当前 ${current} · ${branch} 最新 ${latest}。${hint}`;
}

function getDeploymentTone(deployment = null) {
  if (deployment?.status === "current") return "ok";
  if (deployment?.status === "stale") return "bad";
  return "warn";
}

function renderPortfolioDeploymentStatus(deployment = currentDeployment) {
  const card = document.querySelector("#portfolioDeploymentCard");
  if (!card) return;
  const tone = getDeploymentTone(deployment);
  card.className = `portfolio-deployment-status ${tone}`;
  setText("#portfolioDeploymentStatus", formatDeploymentStatus(deployment));
  setText("#portfolioDeploymentHint", formatDeploymentMeta(deployment));
  const rail = document.querySelector("#portfolioRailDeploymentStatus");
  if (rail) {
    rail.className = `portfolio-rail-deployment ${tone}`;
    rail.textContent = deployment?.status === "current"
      ? `最新 ${deployment.runtime?.shortCommit || ""}`.trim()
      : deployment?.status === "stale"
        ? `旧版 ${deployment.runtime?.shortCommit || ""}`.trim()
        : "版本待确认";
    rail.title = formatDeploymentMeta(deployment);
  }
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
  portfolioTimelineFullLoaded = !portfolio.lightweight;
  portfolioTimelineFullLoading = false;
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
  renderPortfolioDeploymentStatus(currentDeployment);
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
  if (activePortfolioView === "timeline") {
    ensurePortfolioTimelineDetails().catch(showError);
  }
}

async function ensurePortfolioTimelineDetails() {
  if (!currentPortfolio || portfolioTimelineFullLoaded || portfolioTimelineFullLoading || !currentPortfolio.lightweight) return;
  portfolioTimelineFullLoading = true;
  renderRuns(currentPortfolio.recentRuns || []);
  try {
    const result = await apiFetch("/api/portfolio?full=1", { timeoutMs: 60000 });
    currentPortfolio = result.portfolio || currentPortfolio;
    portfolioTimelineFullLoaded = !currentPortfolio.lightweight;
    renderRuns(currentPortfolio.recentRuns || []);
    portfolioOutput.textContent = formatPortfolioOutput(currentPortfolio);
  } finally {
    portfolioTimelineFullLoading = false;
    if (!portfolioTimelineFullLoaded) {
      renderRuns(currentPortfolio?.recentRuns || []);
    }
  }
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
  const transactions = portfolio.recentTransactions || [];
  const equity = portfolio.recentEquity || [];
  const latestRun = runs[0] || null;
  const activeOrders = portfolio.activeOrders || [];
  const actionDeskItems = collectPortfolioActionDeskItems(latestRun, activeOrders);
  const alertItems = collectPortfolioAlertCenterItems(portfolio.managerRankings || {});
  const riskItems = collectPortfolioRiskBoardItems(portfolio.managerRankings || {});
  const sectorItems = collectPortfolioSectorBoardItems(portfolio.managerRankings || {});
  const dataItems = collectPortfolioDataBoardItems(portfolio.managerRankings || {});
  const matrixItems = collectPortfolioDecisionMatrixItems(portfolio.managerRankings || {});
  const ready = watchlist.filter((item) => item.status === "ready");
  const waiting = watchlist.filter((item) => item.status === "waiting_pullback");
  const launchEve = watchlist.filter(isWatchlistLaunchEveCandidate);
  const blocked = watchlist.filter((item) => item.status === "blocked");
  const diagnosticCounts = buildPortfolioDiagnosticCounts(portfolio);
  const diagnosticCount = diagnosticCounts.total;

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
  setText("#portfolioNavPositionCount", String(positions.length));
  setText("#portfolioNavWatchlistCount", String(watchlist.length));
  setText("#portfolioNavUserCount", String(userPortfolios.length));
  setText("#portfolioNavRunCount", String(runs.length));
  setText("#portfolioNavOrderCount", String(activeOrders.length + transactions.length + equity.length));
  setText("#portfolioNavOpportunityCount", String(ready.length + waiting.length + launchEve.length));
  setText("#portfolioNavDiagnosticCount", String(diagnosticCount));
  setText("#portfolioNavActionCount", String(actionDeskItems.length));
  setText("#portfolioNavAlertCount", String(alertItems.length));
  setText("#portfolioNavMatrixCount", String(matrixItems.length));
  setText("#portfolioNavRiskCount", String(riskItems.length));
  setText("#portfolioNavSectorCount", String(sectorItems.length));
  setText("#portfolioNavDataCount", String(dataItems.length));
  setText("#portfolioNavOverviewCount", "15");
  setText("#portfolioNavRunnerCount", portfolio.scheduler?.inFlight ? "运行中" : latestRun ? formatRunStatus(latestRun.status) : "控制");
  updateRunStateBadge(latestRun, portfolio.scheduler || {});
  renderPortfolioRunConsole(portfolio, latestRun, { runs, activeOrders, transactions, equity });

  renderPortfolioWorkspaceCards(portfolio, { positions, watchlist, userPortfolios, runs, activeOrders, transactions, equity, ready, waiting, launchEve, blocked, diagnosticCount, alertItems });
  renderPortfolioRankingRadar(portfolio.managerRankings || {});
  renderPortfolioActionDesk(latestRun, activeOrders);
  renderPortfolioAlertBoard(portfolio.managerRankings || {});
  renderPortfolioDecisionMatrixBoard(portfolio.managerRankings || {});
  renderPortfolioRiskBoard(portfolio.managerRankings || {});
  renderPortfolioSectorBoard(portfolio.managerRankings || {});
  renderPortfolioDataBoard(portfolio.managerRankings || {});
  renderPortfolioOpportunityBoard({ ready, waiting, launchEve, blocked });
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
  renderPortfolioDiagnosticTerminal(portfolio, diagnosticCounts);
}

function buildPortfolioDiagnosticCounts(portfolio = {}) {
  const capabilityItems = Array.isArray(portfolio.capabilityDiagnostics?.items)
    ? portfolio.capabilityDiagnostics.items.length
    : portfolio.capabilityDiagnostics?.summary ? 1 : 0;
  const actionItems = Array.isArray(portfolio.capabilityActionQueue)
    ? portfolio.capabilityActionQueue.length
    : 0;
  const backtestItems = Array.isArray(portfolio.backtestDiagnostics?.items)
    ? portfolio.backtestDiagnostics.items.length
    : portfolio.backtestDiagnostics?.summary ? 1 : 0;
  const rankingMissing = Array.isArray(portfolio.rankingActionAudit?.missing)
    ? portfolio.rankingActionAudit.missing.length
    : 0;
  const rankingTotal = Number(portfolio.rankingActionAudit?.totalActions || 0);
  const rankingItems = rankingMissing || (rankingTotal ? 1 : portfolio.rankingActionAudit?.summary ? 1 : 0);
  return {
    capability: capabilityItems,
    actions: actionItems,
    backtest: backtestItems,
    rankings: rankingItems,
    total: capabilityItems + actionItems + backtestItems + rankingItems
  };
}

function renderPortfolioDiagnosticTerminal(portfolio = {}, counts = buildPortfolioDiagnosticCounts(portfolio)) {
  setText("#diagnosticNavCapabilityCount", String(counts.capability || 0));
  setText("#diagnosticNavActionCount", String(counts.actions || 0));
  setText("#diagnosticNavBacktestCount", String(counts.backtest || 0));
  setText("#diagnosticNavRankingCount", String(counts.rankings || 0));
  const level = getPortfolioDiagnosticLevel(portfolio);
  const label = counts.total
    ? `${counts.total} 项待复核`
    : "体检正常";
  setText("#portfolioDiagnosticTerminalState", label);
  const node = document.querySelector("#portfolioDiagnosticTerminalState");
  if (node) {
    node.className = `badge ${level === "critical" ? "bad" : level === "warning" ? "warn" : "ok"}`;
  }
}

function getPortfolioDiagnosticLevel(portfolio = {}) {
  const levels = [
    portfolio.capabilityDiagnostics?.level,
    portfolio.backtestDiagnostics?.level,
    portfolio.rankingActionAudit?.level
  ].filter(Boolean);
  if (levels.includes("critical")) return "critical";
  if (levels.includes("warning")) return "warning";
  if (levels.includes("info") || levels.includes("watch")) return "info";
  return "ok";
}

function renderPortfolioWorkspaceCards(portfolio = {}, context = {}) {
  const root = document.querySelector("#portfolioWorkspaceCards");
  if (!root) return;
  const account = portfolio.account || {};
  const positions = context.positions || [];
  const watchlist = context.watchlist || [];
  const userPortfolios = context.userPortfolios || [];
  const runs = context.runs || [];
  const activeOrders = context.activeOrders || [];
  const transactions = context.transactions || [];
  const equity = context.equity || [];
  const ready = context.ready || [];
  const waiting = context.waiting || [];
  const launchEve = context.launchEve || [];
  const blocked = context.blocked || [];
  const diagnosticCount = context.diagnosticCount || 0;
  const alertItems = context.alertItems || collectPortfolioAlertCenterItems(portfolio.managerRankings || {});
  const rankingLists = Array.isArray(portfolio.managerRankings?.lists) ? portfolio.managerRankings.lists : [];
  const rankingCount = rankingLists.reduce((sum, list) => sum + (Array.isArray(list.items) ? list.items.length : 0), 0);
  const riskItems = collectPortfolioRiskBoardItems(portfolio.managerRankings || {});
  const sectorItems = collectPortfolioSectorBoardItems(portfolio.managerRankings || {});
  const dataItems = collectPortfolioDataBoardItems(portfolio.managerRankings || {});
  const matrixItems = collectPortfolioDecisionMatrixItems(portfolio.managerRankings || {});
  const priority = portfolio.managerRankings?.priorityQueue?.[0] || null;
  const actionLeaderboard = portfolio.managerRankings?.customerActionLeaderboard || {};
  const actionLeaderboardLanes = Array.isArray(actionLeaderboard.lanes) ? actionLeaderboard.lanes : [];
  const actionLeaderboardActive = actionLeaderboardLanes.filter((lane) => Number(lane.count || 0) > 0);
  const topActionLane = actionLeaderboardActive[0] || null;
  const topActionItem = Array.isArray(topActionLane?.items) ? topActionLane.items[0] : null;
  const userAlerts = userPortfolios.reduce((sum, item) => sum + Number(item.alertCount || 0), 0);
  const latestRun = runs[0] || null;
  const scheduler = portfolio.scheduler || {};
  const topPosition = [...positions].sort((a, b) => Number(b.weightPct || 0) - Number(a.weightPct || 0))[0] || null;
  const topWatch = ready[0] || waiting[0] || watchlist[0] || null;
  const actionDeskItems = collectPortfolioActionDeskItems(latestRun, activeOrders);
  const cards = [
    {
      view: "runner",
      group: "decision",
      label: "运行台",
      value: scheduler.inFlight ? "运行中" : latestRun ? formatRunStatus(latestRun.status) : "待运行",
      detail: scheduler.inFlight ? "后台任务正在执行，页面会自动刷新" : "盘前、今日操作、估值、周总结集中控制",
      meta: latestRun?.summary || formatPortfolioSchedule(portfolio)
    },
    {
      view: "actions",
      group: "decision",
      label: "行动台",
      value: `${actionDeskItems.length} 项`,
      detail: actionDeskItems[0] ? `${actionDeskItems[0].action || actionDeskItems[0].laneTitle}：${actionDeskItems[0].code || ""} ${actionDeskItems[0].name || ""}`.trim() : "最近动作、待确认订单和执行状态",
      meta: actionDeskItems[0]?.reason || "先看该做什么，再看为什么"
    },
    {
      view: "alerts",
      group: "decision",
      label: "预警台",
      value: `${alertItems.length} 项`,
      detail: alertItems[0] ? `${alertItems[0].laneTitle || "预警"}：${alertItems[0].code || ""} ${alertItems[0].name || ""}`.trim() : "买入、卖出、数据和用户持仓预警",
      meta: alertItems[0]?.nextStep || "今天必须先处理的事项"
    },
    {
      view: "rankings",
      group: "decision",
      label: "行动排行",
      value: actionLeaderboardActive.length ? `${actionLeaderboardActive.length} 类` : `${rankingCount} 项`,
      detail: topActionItem
        ? `${topActionLane.title || "行动榜"}：${topActionItem.code || ""} ${topActionItem.name || ""}`.trim()
        : priority ? `${priority.listTitle || "优先处理"}：${priority.code || ""} ${priority.name || ""}`.trim()
          : "买、等、避、卖、补证据分线排序",
      meta: topActionItem?.nextStep || topActionItem?.action || priority?.action || "辅助买入/卖出复核"
    },
    {
      view: "matrix",
      group: "decision",
      label: "决策矩阵",
      value: `${matrixItems.length} 行`,
      detail: matrixItems[0] ? `${matrixItems[0].code || ""} ${matrixItems[0].name || ""}：${matrixItems[0].action || "复核"}`.trim() : "买点、板块、风险、数据横向对比",
      meta: matrixItems[0]?.nextStep || "先看冲突，再决定动作"
    },
    {
      view: "opportunities",
      group: "opportunity",
      label: "观察机会",
      value: `${ready.length + waiting.length + launchEve.length} 项`,
      detail: ready[0] ? `${ready[0].code || ""} ${ready[0].name || ""} 接近可买` : waiting[0] ? `${waiting[0].code || ""} ${waiting[0].name || ""} 等待回调` : "把可买、回调、启动前夜拆开看",
      meta: `可买 ${ready.length} · 回调 ${waiting.length} · 启动前夜 ${launchEve.length}`
    },
    {
      view: "sectors",
      group: "opportunity",
      label: "板块榜",
      value: `${sectorItems.length} 项`,
      detail: sectorItems[0] ? `${sectorItems[0].listTitle || "板块"}：${sectorItems[0].code || ""} ${sectorItems[0].name || ""}`.trim() : "主题配置、轮动、持仓前景和质量优选",
      meta: sectorItems[0]?.action || "先看方向，再选代表基金"
    },
    {
      view: "positions",
      group: "account",
      label: "持仓",
      value: `${positions.length} 只`,
      detail: topPosition ? `${topPosition.code || ""} ${topPosition.name || ""}，仓位 ${formatNumber(topPosition.weightPct || 0, 2)}%` : "当前暂无基金持仓",
      meta: `组合仓位 ${account.positionWeightPct || 0}%`
    },
    {
      view: "watchlist",
      group: "opportunity",
      label: "自选池",
      value: `${watchlist.length} 只`,
      detail: topWatch ? `${topWatch.code || ""} ${topWatch.name || ""}，${topWatch.statusText || formatWatchlistStatus(topWatch.status)}` : "等待盘前观察沉淀候选",
      meta: `接近可买 ${ready.length} · 等待回调 ${waiting.length} · 暂不买 ${blocked.length}`
    },
    {
      view: "risk",
      group: "decision",
      label: "风控防线",
      value: `${riskItems.length} 条`,
      detail: riskItems[0] ? `${riskItems[0].listTitle || "风险"}：${riskItems[0].code || ""} ${riskItems[0].name || ""}`.trim() : "回撤、止盈、追涨和客户持仓提醒",
      meta: riskItems[0]?.action || "先处理风险，再讨论买入"
    },
    {
      view: "data",
      group: "decision",
      label: "数据体检",
      value: `${dataItems.length} 条`,
      detail: dataItems[0] ? `${dataItems[0].laneTitle || "数据"}：${dataItems[0].code || ""} ${dataItems[0].name || ""}`.trim() : "净值、费率、持仓和来源先补齐",
      meta: dataItems[0]?.action || "证据完整后再推进买入"
    },
    {
      view: "users",
      group: "account",
      label: "用户持仓",
      value: `${userPortfolios.length} 人`,
      detail: userPortfolios[0] ? `${userPortfolios[0].displayName || userPortfolios[0].userId}：${userPortfolios[0].holdingCount || 0} 只持仓` : "可从截图或后台录入客户真实持仓",
      meta: `${userAlerts} 条优先提醒`
    },
    {
      view: "timeline",
      group: "records",
      label: "经理时间线",
      value: `${runs.length} 条`,
      detail: latestRun ? `${latestRun.date || "-"} ${latestRun.title || latestRun.type || "组合任务"}` : "暂无观察、决策或复盘记录",
      meta: latestRun?.summary || "运行后沉淀经理分析"
    },
    {
      view: "orders",
      group: "records",
      label: "订单流水",
      value: `${activeOrders.length + transactions.length + equity.length} 条`,
      detail: activeOrders.length ? `${activeOrders.length} 笔订单待确认` : "暂无待确认订单",
      meta: `流水 ${transactions.length} · 估值 ${equity.length}`
    },
    {
      view: "diagnostics",
      group: "decision",
      label: "诊断",
      value: `${diagnosticCount} 项`,
      detail: "能力诊断、历史回测、榜单引用单独归档",
      meta: "修复经理能力时优先看这里"
    }
  ];
  root.innerHTML = renderPortfolioWorkspaceGroups(cards);
}

function renderPortfolioWorkspaceGroups(cards = []) {
  return PORTFOLIO_WORKSPACE_OVERVIEW_GROUPS.map((group) => {
    const items = cards.filter((card) => card.group === group.id);
    if (!items.length) return "";
    const focus = selectPortfolioWorkspaceGroupFocus(group, items);
    const secondary = items.filter((card) => card !== focus);
    const visibleSecondary = secondary.slice(0, 3);
    const hiddenCount = Math.max(0, secondary.length - visibleSecondary.length);
    return `
      <section class="portfolio-workspace-cluster portfolio-workspace-cluster-${escapeHtml(group.id)}">
        <div class="portfolio-workspace-cluster-head">
          <div>
            <span>${escapeHtml(group.title)}</span>
            <strong>${escapeHtml(group.hint)}</strong>
          </div>
          <em>${items.length} 个入口</em>
        </div>
        ${renderPortfolioWorkspaceCard(focus, { primary: true })}
        <div class="portfolio-workspace-mini-list">
          ${visibleSecondary.map(renderPortfolioWorkspaceMiniButton).join("")}
          ${hiddenCount ? renderPortfolioWorkspaceMoreButton(group, focus, hiddenCount) : ""}
        </div>
      </section>
    `;
  }).join("");
}

function selectPortfolioWorkspaceGroupFocus(group = {}, items = []) {
  const byView = new Map(items.map((item) => [item.view, item]));
  for (const view of group.focusViews || []) {
    const item = byView.get(view);
    if (item && hasPortfolioWorkspaceCardSignal(item)) return item;
  }
  for (const view of group.focusViews || []) {
    if (byView.has(view)) return byView.get(view);
  }
  return items.find(hasPortfolioWorkspaceCardSignal) || items[0] || {};
}

function hasPortfolioWorkspaceCardSignal(card = {}) {
  const value = String(card.value || "");
  return Boolean(value && !/^0(?:\s|只|项|条|人|行|$)/.test(value) && !/待运行|控制/.test(value));
}

function renderPortfolioWorkspaceCard(card = {}) {
  return `
    <button type="button" class="portfolio-workspace-card" data-portfolio-view-target="${escapeHtml(card.view || "overview")}">
      <span>${escapeHtml(card.label || "")}</span>
      <strong>${escapeHtml(card.value || "-")}</strong>
      <small>${escapeHtml(card.detail || "")}</small>
      <em>${escapeHtml(card.meta || "")}</em>
    </button>
  `;
}

function renderPortfolioWorkspaceMiniButton(card = {}) {
  return `
    <button type="button" class="portfolio-workspace-mini" data-portfolio-view-target="${escapeHtml(card.view || "overview")}">
      <span>${escapeHtml(card.label || "")}</span>
      <strong>${escapeHtml(card.value || "-")}</strong>
    </button>
  `;
}

function renderPortfolioWorkspaceMoreButton(group = {}, focus = {}, hiddenCount = 0) {
  const targetView = (group.focusViews || []).find((view) => view && view !== focus.view) || focus.view || "overview";
  return `
    <button type="button" class="portfolio-workspace-mini portfolio-workspace-more" data-portfolio-view-target="${escapeHtml(targetView)}">
      <span>更多</span>
      <strong>+${escapeHtml(String(hiddenCount))}</strong>
    </button>
  `;
}

function renderPortfolioRankingRadar(board = {}) {
  const root = document.querySelector("#portfolioRankingRadar");
  if (!root) return;
  const decisionSummary = board.customerDecisionSummary || {};
  const actionDeck = board.customerActionDeck || {};
  const actionCards = Array.isArray(actionDeck.cards) ? actionDeck.cards : [];
  const digest = board.customerDigest || {};
  const priorityQueue = Array.isArray(board.priorityQueue) ? board.priorityQueue : [];
  const groups = actionCards.length ? actionCards : [
    { id: "buy", key: "buyReview", title: "可买复核", tone: "buy", emptyText: "暂无进入买入复核的候选。", items: digest.buyReview || [] },
    { id: "wait", key: "watchFocus", title: "等待触发", tone: "watch", emptyText: "暂无需要重点盯盘的候选。", items: digest.watchFocus || [] },
    { id: "avoid", key: "riskAvoid", title: "先回避", tone: "avoid", emptyText: "暂无明确回避提醒。", items: digest.riskAvoid || [] }
  ];
  const hasDigestItems = groups.some((group) => Array.isArray(digest[group.key]) && digest[group.key].length);
  const hasActionItems = groups.some((group) => Array.isArray(group.items) && group.items.length);
  const hasPriorityItems = priorityQueue.length > 0;
  const command = buildPortfolioRankingCommandStrip({ groups, priorityQueue, actionDeck, digest });
  if (!hasActionItems && !hasDigestItems && !hasPriorityItems && !digest.summary && !actionDeck.summary) {
    root.innerHTML = `
      <div class="portfolio-ranking-radar-empty portfolio-launch-center">
        <div>
          <span>今日行动中心</span>
          <strong>暂无强制买卖信号，先按入口处理</strong>
          <small>经理生成自选池、持仓复核或用户持仓提醒后，这里会直接显示可买、等待、回避、卖出和补数据。</small>
        </div>
        <div class="portfolio-launch-actions">
          <button type="button" data-portfolio-view-target="runner">运行台</button>
          <button type="button" class="secondary" data-portfolio-view-target="opportunities">观察机会</button>
          <button type="button" class="secondary" data-portfolio-view-target="rankings">经理榜单</button>
        </div>
      </div>
    `;
    return;
  }
  root.innerHTML = `
    <div class="portfolio-ranking-radar-head">
      <div>
        <span>客户行动牌</span>
        <strong>${escapeHtml(actionDeck.title || "今天先看这五类")}</strong>
        <small>${escapeHtml(actionDeck.summary || digest.summary || "从经理多角度榜单提炼出可买、等待、回避、卖出和补数据。")}</small>
      </div>
      <button type="button" class="secondary" data-portfolio-view-target="rankings">进入经理榜单</button>
    </div>
    ${renderPortfolioCustomerDecisionSummary(decisionSummary)}
    ${renderPortfolioCustomerActionLeaderboard(board.customerActionLeaderboard || {})}
    ${renderPortfolioRankingCommandStrip(command)}
    <div class="portfolio-ranking-radar-grid">
      ${groups.map((group) => renderPortfolioRankingRadarGroup(group, group.items || digest[group.key] || [])).join("")}
    </div>
    ${hasPriorityItems ? renderPortfolioRankingRadarPriority(priorityQueue) : ""}
  `;
}

function renderPortfolioCustomerActionLeaderboard(board = {}) {
  const lanes = Array.isArray(board.lanes) ? board.lanes.filter((lane) => Number(lane.count || 0) > 0) : [];
  if (!lanes.length) return "";
  return `
    <section class="portfolio-action-leaderboard" aria-label="客户行动排行">
      <div class="portfolio-action-leaderboard-head">
        <div>
          <span>${escapeHtml(board.title || "客户行动排行")}</span>
          <strong>${escapeHtml(board.summary || "把买、等、避、卖和补证据分开排队。")}</strong>
        </div>
        <button type="button" class="ranking-detail-link" data-portfolio-view-target="rankings">完整榜单</button>
      </div>
      <div class="portfolio-action-leaderboard-grid">
        ${lanes.map(renderPortfolioCustomerActionLeaderboardLane).join("")}
      </div>
    </section>
  `;
}

function renderPortfolioCustomerActionLeaderboardLane(lane = {}) {
  const top = Array.isArray(lane.items) ? lane.items[0] : null;
  return `
    <button type="button" class="portfolio-action-leaderboard-lane portfolio-action-leaderboard-${escapeHtml(lane.id || lane.tone || "watch")}" data-portfolio-view-target="${escapeHtml(lane.target || "rankings")}">
      <span>${escapeHtml(lane.title || "行动排行")}</span>
      <strong>${escapeHtml(top ? `${top.code || ""} ${top.name || ""}`.trim() : `${lane.count || 0} 项`)}</strong>
      <small>${escapeHtml(top?.reason || lane.purpose || "查看对应行动线。")}</small>
      <em>${escapeHtml(top?.reviewWindow || top?.action || lane.topAction || "复核")}</em>
    </button>
  `;
}

function renderPortfolioCustomerDecisionSummary(summary = {}) {
  const lines = Array.isArray(summary.lines) ? summary.lines.filter(Boolean).slice(0, 5) : [];
  if (!lines.length && !summary.primaryAction) return "";
  const chips = Array.isArray(summary.chips) ? summary.chips : [];
  return `
    <section class="portfolio-decision-summary" aria-label="客户决策摘要">
      <div class="portfolio-decision-summary-main">
        <span>${escapeHtml(summary.title || "客户决策摘要")}</span>
        <strong>${escapeHtml(summary.primaryAction || summary.summary || "先看今天最需要处理的动作。")}</strong>
        ${summary.summary ? `<small>${escapeHtml(summary.summary)}</small>` : ""}
      </div>
      <div class="portfolio-decision-summary-lines">
        ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      </div>
      ${chips.length ? `
        <div class="portfolio-decision-summary-chips">
          ${chips.map((chip) => `
            <button type="button" class="portfolio-decision-chip portfolio-decision-chip-${escapeHtml(chip.tone || chip.id || "watch")}" data-portfolio-view-target="${escapeHtml(chip.target || "rankings")}">
              <span>${escapeHtml(chip.title || "复核")}</span>
              <strong>${escapeHtml(String(chip.count || 0))}</strong>
            </button>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function buildPortfolioRankingCommandStrip({ groups = [], priorityQueue = [], actionDeck = {}, digest = {} } = {}) {
  const normalizedGroups = Array.isArray(groups) ? groups : [];
  const priority = (Array.isArray(priorityQueue) ? priorityQueue : [])[0]
    || normalizedGroups.map((group) => (Array.isArray(group.items) ? group.items[0] : null)).find(Boolean)
    || null;
  const lanes = normalizedGroups.map((group) => {
    const items = Array.isArray(group.items) ? group.items : [];
    return {
      title: group.title || "行动",
      tone: group.tone || group.id || "watch",
      count: items.length,
      filter: getPortfolioRankingRadarLensTarget(group),
      emptyText: group.emptyText || group.empty || "暂无"
    };
  });
  return {
    priority,
    lanes,
    summary: actionDeck.summary || digest.summary || "把榜单转成今天先处理的买、等、避、卖和补证据。",
    title: actionDeck.title || "今日买卖指挥"
  };
}

function getPortfolioRankingRadarLensTarget(group = {}) {
  const key = `${group.id || ""} ${group.key || ""} ${group.tone || ""} ${group.title || ""}`;
  if (/buy|可买|买入/.test(key)) return "buy_preparation";
  if (/wait|watch|等待|观察/.test(key)) return "launch_setup";
  if (/avoid|回避|追涨/.test(key)) return "chase_risk";
  if (/sell|卖出|减仓/.test(key)) return "sell_risk";
  if (/data|证据|数据|补/.test(key)) return "data_confidence";
  return "decision_synthesis";
}

function renderPortfolioRankingCommandStrip(command = {}) {
  const priority = command.priority || null;
  const code = String(priority?.code || "").trim();
  const actionClass = getManagerRankingActionClass(priority?.action || priority?.listTitle || "");
  return `
    <section class="portfolio-ranking-command" aria-label="今日买卖指挥">
      <div class="portfolio-ranking-command-main">
        <span>${escapeHtml(command.title || "今日买卖指挥")}</span>
        <strong>${escapeHtml(code ? `${code} ${priority?.name || ""}`.trim() : "暂无第一优先对象")}</strong>
        <small>${escapeHtml(priority?.reason || command.summary || "等待经理生成榜单后给出第一处理对象。")}</small>
      </div>
      <div class="portfolio-ranking-command-lanes">
        ${(command.lanes || []).map((lane) => `
          <button type="button" data-open-ranking-filter="${escapeHtml(lane.filter || "decision_synthesis")}">
            <span>${escapeHtml(lane.title)}</span>
            <strong>${escapeHtml(String(lane.count || 0))}</strong>
          </button>
        `).join("")}
      </div>
      <div class="portfolio-ranking-command-actions">
        <em class="ranking-action ${actionClass}">${escapeHtml(priority?.action || priority?.listTitle || "等待信号")}</em>
        ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">自选详情</button>` : ""}
        <button type="button" class="ranking-detail-link" data-portfolio-view-target="rankings">完整榜单</button>
      </div>
    </section>
  `;
}

function renderPortfolioRankingRadarGroup(group, items = []) {
  const values = Array.isArray(items) ? items.slice(0, 2) : [];
  const tone = group.tone || group.id || "watch";
  return `
    <section class="portfolio-ranking-radar-lane portfolio-ranking-radar-${escapeHtml(tone)}">
      <div class="portfolio-ranking-radar-lane-head">
        <strong>${escapeHtml(group.title)}</strong>
        <span>${values.length} 项</span>
      </div>
      ${values.length ? values.map((item) => renderPortfolioRankingRadarItem(item, tone)).join("") : `<small class="portfolio-ranking-radar-empty-text">${escapeHtml(group.emptyText || group.empty || "暂无触发项。")}</small>`}
    </section>
  `;
}

function renderPortfolioRankingRadarItem(item = {}, tone = "watch") {
  const code = String(item.code || "").trim();
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.reason || ""}`) || tone;
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
  return `
    <article class="portfolio-ranking-radar-item">
      <div>
        <strong>${escapeHtml(code)} ${escapeHtml(item.name || "")}</strong>
        <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.status || "复核")}</span>
      </div>
      <p>${escapeHtml(item.reason || "等待经理下一轮复核。")}</p>
      ${tags.length ? `<div class="portfolio-ranking-radar-tags">${tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</div>` : ""}
      <footer>
        <small>${escapeHtml(item.nextStep || "进入榜单查看完整依据。")}</small>
        ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">自选详情</button>` : ""}
      </footer>
    </article>
  `;
}

function renderPortfolioRankingRadarPriority(queue = []) {
  const items = (Array.isArray(queue) ? queue : []).slice(0, 4);
  if (!items.length) return "";
  return `
    <div class="portfolio-ranking-radar-priority">
      <span>优先队列</span>
      ${items.map((item) => `
        <button type="button" data-focus-watchlist-code="${escapeHtml(item.code || "")}">
          <b>${escapeHtml(item.queueRank || item.rank || "-")}</b>
          <strong>${escapeHtml([item.code, item.name].filter(Boolean).join(" "))}</strong>
          <small>${escapeHtml(item.listTitle || item.action || "经理榜单")}</small>
        </button>
      `).join("")}
    </div>
  `;
}

function collectPortfolioActionDeskItems(latestRun = null, activeOrders = []) {
  const actions = Array.isArray(latestRun?.actions) ? latestRun.actions : [];
  const actionItems = actions.map((action, index) => {
    const laneId = getPortfolioActionLaneId(action.action || action.side || action.reason || "");
    return {
      ...action,
      laneId,
      sourceType: "run_action",
      sourceIndex: index,
      action: action.action || "WATCH",
      reason: action.reason || action.rankingBasis || "等待经理下一轮复核。"
    };
  });
  const orderItems = (Array.isArray(activeOrders) ? activeOrders : []).map((order, index) => ({
    ...order,
    laneId: "orders",
    sourceType: "active_order",
    sourceIndex: index,
    action: order.side || "ORDER",
    reason: order.scheduleReason || order.limitCheck?.note || "订单正在确认或等待到账。"
  }));
  return [...actionItems, ...orderItems];
}

function getPortfolioActionLaneId(text = "") {
  const value = String(text || "").toUpperCase();
  if (/SELL|卖出|减仓|赎回|止盈|止损/.test(value)) return "sell";
  if (/BUY|买入|申购|加仓|试探/.test(value)) return "buy";
  return "watch";
}

function renderPortfolioActionDesk(latestRun = null, activeOrders = []) {
  const root = document.querySelector("#portfolioActionDesk");
  if (!root) return;
  const items = collectPortfolioActionDeskItems(latestRun, activeOrders);
  const runLabel = latestRun ? `${latestRun.date || "-"} ${latestRun.title || formatRunTypeLabel(latestRun.type)}` : "暂无运行记录";
  setText("#portfolioActionState", items.length ? `${items.length} 个动作` : "暂无动作");
  root.innerHTML = `
    <section class="action-terminal">
      <div class="action-terminal-head">
        <div>
          <strong>今天先看动作</strong>
          <small>${escapeHtml(runLabel)}；动作卡只放结论、理由和风险线，完整推演留在时间线。</small>
        </div>
        <button type="button" class="secondary" data-portfolio-view-target="timeline">进入时间线</button>
      </div>
      <div class="action-lane-grid">
        ${PORTFOLIO_ACTION_LANES.map((lane) => renderPortfolioActionLane(lane, items.filter((item) => item.laneId === lane.id))).join("")}
      </div>
    </section>
  `;
}

function renderPortfolioActionLane(lane = {}, items = []) {
  return `
    <section class="action-lane action-lane-${escapeHtml(lane.tone || "watch")}">
      <div class="action-lane-head">
        <div>
          <strong>${escapeHtml(lane.title || "动作")}</strong>
          <small>${escapeHtml(getPortfolioActionLaneHint(lane.id))}</small>
        </div>
        <span>${items.length}</span>
      </div>
      <div class="action-item-list">
        ${items.length ? items.slice(0, 6).map((item) => renderPortfolioActionItem(item, lane)).join("") : `<div class="empty compact-empty">${escapeHtml(lane.empty || "暂无动作。")}</div>`}
      </div>
    </section>
  `;
}

function getPortfolioActionLaneHint(id = "") {
  if (id === "buy") return "只放已经进入申购/试探复核的动作。";
  if (id === "sell") return "优先看止盈、减仓、赎回和风控动作。";
  if (id === "orders") return "显示确认日、到账日和流转状态。";
  return "观察、持有和等待触发的基金。";
}

function renderPortfolioActionItem(item = {}, lane = {}) {
  const code = String(item.code || "").trim();
  const actionText = item.sourceType === "active_order"
    ? `${item.action || "订单"} ${item.status || ""}`.trim()
    : item.action || "观察";
  const actionClass = getManagerRankingActionClass(`${actionText} ${item.reason || ""}`) || lane.tone || "watch";
  const facts = buildPortfolioActionFacts(item);
  return `
    <article class="action-item">
      <div class="action-item-title">
        <strong>${escapeHtml([code, item.name].filter(Boolean).join(" ") || "组合动作")}</strong>
        <span class="ranking-action ${actionClass}">${escapeHtml(actionText)}</span>
      </div>
      <p>${escapeHtml(item.reason || "等待经理下一轮复核。")}</p>
      ${facts.length ? `<div class="action-facts">${facts.map((fact) => `<small>${escapeHtml(fact)}</small>`).join("")}</div>` : ""}
      <footer>
        <small>${escapeHtml(selectPortfolioActionNextStep(item))}</small>
        <div>
          ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">详情</button>` : ""}
          <button type="button" class="ranking-detail-link" data-portfolio-view-target="${item.sourceType === "active_order" ? "orders" : "timeline"}">${item.sourceType === "active_order" ? "订单" : "时间线"}</button>
        </div>
      </footer>
    </article>
  `;
}

function collectPortfolioAlertCenterItems(board = {}) {
  const lanes = Array.isArray(board.alertCenter?.lanes) ? board.alertCenter.lanes : [];
  return lanes.flatMap((lane) => (Array.isArray(lane.items) ? lane.items : []).map((item) => ({
    ...item,
    laneId: lane.id || item.laneId || "",
    laneTitle: lane.title || item.laneTitle || "",
    laneTone: lane.tone || item.laneTone || ""
  })));
}

function renderPortfolioAlertBoard(board = {}) {
  const root = document.querySelector("#portfolioAlertBoard");
  if (!root) return;
  const alertCenter = board.alertCenter || {};
  const laneById = new Map((Array.isArray(alertCenter.lanes) ? alertCenter.lanes : []).map((lane) => [lane.id, lane]));
  const items = collectPortfolioAlertCenterItems(board);
  setText("#portfolioAlertState", items.length ? `${items.length} 项预警` : "暂无预警");
  root.innerHTML = `
    <section class="alert-terminal">
      <div class="alert-terminal-head">
        <div>
          <strong>${escapeHtml(alertCenter.title || "预警台")}</strong>
          <small>${escapeHtml(alertCenter.summary || "把今天必须处理的事项压缩到一屏，减少在长页面里找重点。")}</small>
        </div>
        <div class="alert-terminal-actions">
          <button type="button" class="secondary" data-portfolio-view-target="matrix">决策矩阵</button>
          <button type="button" class="secondary" data-portfolio-view-target="rankings">完整榜单</button>
        </div>
      </div>
      <div class="alert-lane-grid">
        ${PORTFOLIO_ALERT_LANES.map((lane) => renderPortfolioAlertLane(lane, laneById.get(lane.id))).join("")}
      </div>
    </section>
  `;
}

function renderPortfolioAlertLane(lane = {}, sourceLane = {}) {
  const items = Array.isArray(sourceLane?.items) ? sourceLane.items.slice(0, 6) : [];
  return `
    <section class="alert-lane alert-lane-${escapeHtml(lane.tone || "watch")}">
      <div class="alert-lane-head">
        <div>
          <strong>${escapeHtml(sourceLane?.title || lane.title || "预警")}</strong>
          <small>${escapeHtml(sourceLane?.hint || getPortfolioAlertLaneHint(lane.id))}</small>
        </div>
        <span>${items.length}</span>
      </div>
      <div class="alert-item-list">
        ${items.length ? items.map((item) => renderPortfolioAlertItem(item, lane)).join("") : `<div class="empty compact-empty">${escapeHtml(sourceLane?.emptyText || lane.empty || "暂无预警。")}</div>`}
      </div>
    </section>
  `;
}

function getPortfolioAlertLaneHint(id = "") {
  if (id === "buy") return "低位启动、现金再部署和小仓试探先在这里复核。";
  if (id === "sell") return "止盈、回吐、追涨和回撤防线优先处理。";
  if (id === "data") return "数据、份额、费率、持仓缺口补齐前不推进买入。";
  if (id === "user") return "客户真实持仓的买卖提醒优先置顶。";
  return "今日必须先处理的事项。";
}

function renderPortfolioAlertItem(item = {}, lane = {}) {
  const code = String(item.code || "").trim();
  const facts = Array.isArray(item.facts) ? item.facts.slice(0, 3) : [];
  const gaps = Array.isArray(item.gaps) ? item.gaps.slice(0, 2) : [];
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.reason || ""}`) || lane.tone || "watch";
  return `
    <article class="alert-item">
      <div class="alert-item-title">
        <strong>${escapeHtml([code, item.name].filter(Boolean).join(" ") || lane.title || "预警项")}</strong>
        <span class="ranking-action ${actionClass}">${escapeHtml(item.action || "复核")}</span>
      </div>
      <p>${escapeHtml(item.reason || "等待经理下一轮复核。")}</p>
      ${facts.length || gaps.length ? `<div class="alert-facts">${[...facts, ...gaps].slice(0, 4).map((fact) => `<small>${escapeHtml(fact)}</small>`).join("")}</div>` : ""}
      <footer>
        <small>${escapeHtml(item.nextStep || "进入对应榜单查看处理边界。")}</small>
        <div>
          ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">详情</button>` : ""}
          ${item.listId ? `<button type="button" class="ranking-detail-link" data-open-ranking-filter="${escapeHtml(item.listId)}">榜单</button>` : ""}
        </div>
      </footer>
    </article>
  `;
}

function collectPortfolioDecisionMatrixItems(board = {}) {
  return Array.isArray(board.decisionMatrix?.items) ? board.decisionMatrix.items : [];
}

function renderPortfolioDecisionMatrixBoard(board = {}) {
  const root = document.querySelector("#portfolioDecisionMatrix");
  if (!root) return;
  const matrix = board.decisionMatrix || {};
  const items = collectPortfolioDecisionMatrixItems(board);
  setText("#portfolioMatrixState", items.length ? `${items.length} 只基金` : "暂无矩阵");
  root.innerHTML = `
    <section class="matrix-terminal">
      <div class="matrix-terminal-head">
        <div>
          <strong>${escapeHtml(matrix.title || "决策矩阵")}</strong>
          <small>${escapeHtml(matrix.summary || "把候选基金横向对齐，先看买点、板块、风险和数据是否互相支持。")}</small>
        </div>
        <button type="button" class="secondary" data-portfolio-view-target="rankings">进入经理榜单</button>
      </div>
      <div class="matrix-table" role="table" aria-label="基金决策矩阵">
        <div class="matrix-row matrix-head" role="row">
          <span>基金</span>
          <span>结论</span>
          <span>买点</span>
          <span>板块/质量</span>
          <span>风险</span>
          <span>数据/费率</span>
          <span>下一步</span>
        </div>
        <div class="matrix-body">
          ${items.length ? items.slice(0, 12).map(renderPortfolioDecisionMatrixRow).join("") : `<div class="empty compact-empty">${escapeHtml(matrix.emptyText || "暂无决策矩阵。")}</div>`}
        </div>
      </div>
    </section>
  `;
}

function renderPortfolioDecisionMatrixRow(item = {}) {
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.reason || ""}`);
  const verdict = item.verdict || {};
  const verdictTone = verdict.tone || actionClass || "neutral";
  const blockers = Array.isArray(verdict.blockers) ? verdict.blockers : [];
  const constraints = Array.isArray(verdict.constraints) ? verdict.constraints : [];
  const supports = Array.isArray(verdict.supports) ? verdict.supports : [];
  return `
    <article class="matrix-row matrix-item" role="row">
      <div class="matrix-fund">
        <b>${escapeHtml(String(item.matrixRank || item.queueRank || "-"))}</b>
        <div>
          <strong>${escapeHtml([item.code, item.name].filter(Boolean).join(" "))}</strong>
          <small>${escapeHtml(item.reason || "等待经理复核。")}</small>
        </div>
      </div>
      <div class="matrix-verdict matrix-verdict-${escapeHtml(verdictTone)}">
        <b>${escapeHtml(verdict.label || item.action || "复核")}</b>
        <span class="ranking-action ${actionClass}">${escapeHtml(item.action || "复核")}</span>
        ${verdict.permission ? `<strong>${escapeHtml(verdict.permission)}</strong>` : ""}
        ${verdict.summary ? `<p>${escapeHtml(verdict.summary)}</p>` : ""}
        ${blockers.length ? `<small>阻断：${escapeHtml(blockers.join("；"))}</small>` : constraints.length ? `<small>约束：${escapeHtml(constraints.join("；"))}</small>` : supports.length ? `<small>支持：${escapeHtml(supports.join("；"))}</small>` : ""}
        ${Number.isFinite(Number(item.matrixScore)) ? `<small>矩阵 ${formatNumber(item.matrixScore, 0)}</small>` : ""}
      </div>
      ${renderPortfolioDecisionMatrixCell(item.cells?.buy, "buy")}
      ${renderPortfolioDecisionMatrixCell(item.cells?.sector, "sector")}
      ${renderPortfolioDecisionMatrixCell(item.cells?.risk, "risk")}
      ${renderPortfolioDecisionMatrixCell(item.cells?.data, "data")}
      <div class="matrix-next">
        <small>${escapeHtml(item.nextStep || "进入榜单查看完整依据。")}</small>
        <div>
          ${item.code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(item.code)}">详情</button>` : ""}
          <button type="button" class="ranking-detail-link" data-portfolio-view-target="rankings">榜单</button>
        </div>
      </div>
    </article>
  `;
}

function renderPortfolioDecisionMatrixCell(cell = null, tone = "watch") {
  if (!cell) {
    return `<div class="matrix-cell matrix-cell-empty"><span>未上榜</span><small>暂无对应证据。</small></div>`;
  }
  const actionClass = getManagerRankingActionClass(`${cell.action || ""} ${cell.text || ""}`) || tone;
  return `
    <div class="matrix-cell matrix-cell-${escapeHtml(tone)}">
      <button type="button" data-open-ranking-filter="${escapeHtml(cell.listId || "")}">
        <span>${escapeHtml(cell.listTitle || "榜单")}${cell.rank ? `#${escapeHtml(String(cell.rank))}` : ""}</span>
        <strong>${escapeHtml(cell.action || "复核")}</strong>
      </button>
      <small>${escapeHtml(cell.text || cell.nextStep || "进入榜单查看。")}</small>
      ${Number.isFinite(Number(cell.score)) ? `<em>${formatNumber(cell.score, 0)}</em>` : ""}
      <i class="ranking-action ${actionClass}">${escapeHtml(cell.action || "复核")}</i>
    </div>
  `;
}

function buildPortfolioActionFacts(item = {}) {
  if (item.sourceType === "active_order") {
    return [
      Number.isFinite(Number(item.amount)) ? `金额 ${formatMoney(item.amount)}` : "",
      item.priceDate ? `估值日 ${item.priceDate}` : "",
      item.confirmDate ? `确认 ${item.confirmDate}` : "",
      item.settlementDate ? `到账 ${item.settlementDate}` : ""
    ].filter(Boolean);
  }
  return [
    item.targetWeightPct !== undefined && item.targetWeightPct !== null ? `目标仓位 ${formatNumber(item.targetWeightPct, 2)}%` : "",
    item.amount !== undefined && item.amount !== null ? `金额 ${formatMoney(item.amount)}` : "",
    item.rankingBasis ? "有榜单依据" : "",
    item.riskControl || item.chaseRisk || item.positionCheck || ""
  ].filter(Boolean).slice(0, 4);
}

function selectPortfolioActionNextStep(item = {}) {
  if (item.sourceType === "active_order") {
    return [item.tradingProfile?.kind, item.limitCheck?.note, formatOrderNavLine(item)].filter(Boolean).join("；") || "等待确认和到账后再复盘。";
  }
  return item.riskControl
    || item.rankingBasis
    || item.positionCheck
    || item.rotationCheck
    || "进入时间线查看完整依据。";
}

function collectPortfolioRiskBoardItems(board = {}) {
  const lists = Array.isArray(board.lists) ? board.lists : [];
  const items = [];
  for (const lane of PORTFOLIO_RISK_LANES) {
    const list = lists.find((candidate) => candidate.id === lane.id);
    for (const item of (Array.isArray(list?.items) ? list.items : []).slice(0, 4)) {
      items.push({
        ...item,
        listId: lane.id,
        listTitle: list?.title || lane.title,
        laneTone: lane.tone
      });
    }
  }
  return items;
}

function renderPortfolioRiskBoard(board = {}) {
  const root = document.querySelector("#portfolioRiskBoard");
  if (!root) return;
  const listById = new Map((Array.isArray(board.lists) ? board.lists : []).map((list) => [list.id, list]));
  const total = collectPortfolioRiskBoardItems(board).length;
  setText("#portfolioRiskState", total ? `${total} 条风险线` : "暂无风险");
  root.innerHTML = `
    <section class="risk-terminal">
      <div class="risk-terminal-head">
        <div>
          <strong>先防守，再进攻</strong>
          <small>这里把长榜单中的风险项抽出来，适合开盘前快速确认该卖、该等还是该盯。</small>
        </div>
        <button type="button" class="secondary" data-portfolio-view-target="rankings">进入完整榜单</button>
      </div>
      <div class="risk-lane-grid">
        ${PORTFOLIO_RISK_LANES.map((lane) => renderPortfolioRiskLane(lane, listById.get(lane.id))).join("")}
      </div>
    </section>
  `;
}

function renderPortfolioRiskLane(lane = {}, list = {}) {
  const items = Array.isArray(list?.items) ? list.items.slice(0, 3) : [];
  return `
    <section class="risk-lane risk-lane-${escapeHtml(lane.tone || "watch")}">
      <div class="risk-lane-head">
        <div>
          <strong>${escapeHtml(lane.title || list?.title || "风险")}</strong>
          <small>${escapeHtml(list?.subtitle || lane.empty || "")}</small>
        </div>
        <button type="button" data-open-ranking-filter="${escapeHtml(lane.id || "")}">${items.length}</button>
      </div>
      <div class="risk-item-list">
        ${items.length ? items.map((item) => renderPortfolioRiskItem(item, lane)).join("") : `<div class="empty compact-empty">${escapeHtml(lane.empty || "暂无风险项。")}</div>`}
      </div>
    </section>
  `;
}

function renderPortfolioRiskItem(item = {}, lane = {}) {
  const code = String(item.code || "").trim();
  const facts = Array.isArray(item.facts) ? item.facts.slice(0, 3) : [];
  const nextStep = item.decision?.nextStep || item.nextStep || facts[0] || "进入完整榜单查看处理边界。";
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.reason || ""}`) || lane.tone || "watch";
  return `
    <article class="risk-item">
      <div class="risk-item-title">
        <strong>${escapeHtml([code, item.name].filter(Boolean).join(" ") || lane.title || "风险项")}</strong>
        <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.status || "复核")}</span>
      </div>
      <p>${escapeHtml(item.reason || "等待经理下一轮复核。")}</p>
      ${facts.length ? `<div class="risk-facts">${facts.map((fact) => `<small>${escapeHtml(fact)}</small>`).join("")}</div>` : ""}
      <footer>
        <small>${escapeHtml(nextStep)}</small>
        <div>
          ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">详情</button>` : ""}
          <button type="button" class="ranking-detail-link" data-open-ranking-filter="${escapeHtml(lane.id || "")}">榜单</button>
        </div>
      </footer>
    </article>
  `;
}

function collectPortfolioSectorBoardItems(board = {}) {
  const lists = Array.isArray(board.lists) ? board.lists : [];
  const items = [];
  for (const lane of PORTFOLIO_SECTOR_LANES) {
    const list = lists.find((candidate) => candidate.id === lane.id);
    for (const item of (Array.isArray(list?.items) ? list.items : []).slice(0, 4)) {
      items.push({
        ...item,
        listId: lane.id,
        listTitle: list?.title || lane.title,
        laneTone: lane.tone
      });
    }
  }
  return items;
}

function renderPortfolioSectorBoard(board = {}) {
  const root = document.querySelector("#portfolioSectorBoard");
  if (!root) return;
  const listById = new Map((Array.isArray(board.lists) ? board.lists : []).map((list) => [list.id, list]));
  const total = collectPortfolioSectorBoardItems(board).length;
  setText("#portfolioSectorState", total ? `${total} 个方向` : "暂无板块");
  root.innerHTML = `
    <section class="sector-terminal">
      <div class="sector-terminal-head">
        <div>
          <strong>先看方向，再选基金</strong>
          <small>把主题配置、轮动启动、持仓前景和基金质量合在一屏，减少新闻追涨和同题材重复买入。</small>
        </div>
        <button type="button" class="secondary" data-portfolio-view-target="rankings">进入完整榜单</button>
      </div>
      <div class="sector-lane-grid">
        ${PORTFOLIO_SECTOR_LANES.map((lane) => renderPortfolioSectorLane(lane, listById.get(lane.id))).join("")}
      </div>
    </section>
  `;
}

function renderPortfolioSectorLane(lane = {}, list = {}) {
  const items = Array.isArray(list?.items) ? list.items.slice(0, 3) : [];
  return `
    <section class="sector-lane sector-lane-${escapeHtml(lane.tone || "theme")}">
      <div class="sector-lane-head">
        <div>
          <strong>${escapeHtml(lane.title || list?.title || "板块")}</strong>
          <small>${escapeHtml(list?.subtitle || lane.empty || "")}</small>
        </div>
        <button type="button" data-open-ranking-filter="${escapeHtml(lane.id || "")}">${items.length}</button>
      </div>
      <div class="sector-item-list">
        ${items.length ? items.map((item) => renderPortfolioSectorItem(item, lane)).join("") : `<div class="empty compact-empty">${escapeHtml(lane.empty || "暂无板块线索。")}</div>`}
      </div>
    </section>
  `;
}

function renderPortfolioSectorItem(item = {}, lane = {}) {
  const code = String(item.code || "").trim();
  const facts = Array.isArray(item.facts) ? item.facts.slice(0, 4) : [];
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.reason || ""}`) || lane.tone || "watch";
  const nextStep = item.decision?.nextStep || item.nextStep || "进入完整榜单查看代表基金、买点和风险边界。";
  return `
    <article class="sector-item">
      <div class="sector-item-title">
        <strong>${escapeHtml([code, item.name].filter(Boolean).join(" ") || lane.title || "板块项")}</strong>
        <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.status || "复核")}</span>
      </div>
      <p>${escapeHtml(item.reason || "等待经理下一轮复核。")}</p>
      ${facts.length ? `<div class="sector-facts">${facts.map((fact) => `<small>${escapeHtml(fact)}</small>`).join("")}</div>` : ""}
      <footer>
        <small>${escapeHtml(nextStep)}</small>
        <div>
          ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">详情</button>` : ""}
          <button type="button" class="ranking-detail-link" data-open-ranking-filter="${escapeHtml(lane.id || "")}">榜单</button>
        </div>
      </footer>
    </article>
  `;
}

function collectPortfolioDataBoardItems(board = {}) {
  const list = (Array.isArray(board.lists) ? board.lists : []).find((candidate) => candidate.id === "data_confidence");
  const items = Array.isArray(list?.items) ? list.items : [];
  const results = [];
  for (const item of items.slice(0, 8)) {
    for (const laneId of getPortfolioDataLaneIds(item)) {
      const lane = PORTFOLIO_DATA_LANES.find((candidate) => candidate.id === laneId) || PORTFOLIO_DATA_LANES[3];
      results.push({
        ...item,
        listId: "data_confidence",
        listTitle: list?.title || "数据体检榜",
        laneId,
        laneTitle: lane.title,
        laneTone: lane.tone
      });
    }
  }
  return results;
}

function getPortfolioDataLaneIds(item = {}) {
  const text = [
    item.action,
    item.reason,
    item.source,
    ...(Array.isArray(item.facts) ? item.facts : []),
    ...(Array.isArray(item.decision?.highlights) ? item.decision.highlights : []),
    ...(Array.isArray(item.decision?.risks) ? item.decision.risks : []),
    ...(Array.isArray(item.decision?.gaps) ? item.decision.gaps : []),
    item.decision?.nextStep
  ].filter(Boolean).join(" ");
  const lanes = [];
  if (/净值|走势|过期|NAV/i.test(text)) lanes.push("nav");
  if (/份额|费率|费用|申购|销售服务费|赎回|A\/C|A类|C类|D类|I类/.test(text)) lanes.push("fee");
  if (/持仓|前十大|行业|前景/.test(text)) lanes.push("holdings");
  if (/来源|补证|证据|缺口|数据/.test(text)) lanes.push("source");
  return lanes.length ? [...new Set(lanes)] : ["source"];
}

function renderPortfolioDataBoard(board = {}) {
  const root = document.querySelector("#portfolioDataBoard");
  if (!root) return;
  const list = (Array.isArray(board.lists) ? board.lists : []).find((candidate) => candidate.id === "data_confidence") || {};
  const items = collectPortfolioDataBoardItems(board);
  setText("#portfolioDataState", items.length ? `${items.length} 条缺口` : "数据正常");
  root.innerHTML = `
    <section class="data-terminal">
      <div class="data-terminal-head">
        <div>
          <strong>先体检，再推荐</strong>
          <small>${escapeHtml(list.subtitle || "净值、走势、份额费率、持仓和来源会影响买入可信度，单独放在这里先处理。")}</small>
        </div>
        <button type="button" class="secondary" data-open-ranking-filter="data_confidence">进入完整榜单</button>
      </div>
      <div class="data-lane-grid">
        ${PORTFOLIO_DATA_LANES.map((lane) => renderPortfolioDataLane(lane, items.filter((item) => item.laneId === lane.id), list)).join("")}
      </div>
    </section>
  `;
}

function renderPortfolioDataLane(lane = {}, items = [], list = {}) {
  return `
    <section class="data-lane data-lane-${escapeHtml(lane.tone || "source")}">
      <div class="data-lane-head">
        <div>
          <strong>${escapeHtml(lane.title || "数据")}</strong>
          <small>${escapeHtml(getPortfolioDataLaneHint(lane.id, list))}</small>
        </div>
        <button type="button" data-open-ranking-filter="data_confidence">${items.length}</button>
      </div>
      <div class="data-item-list">
        ${items.length ? items.slice(0, 5).map((item) => renderPortfolioDataItem(item, lane)).join("") : `<div class="empty compact-empty">${escapeHtml(lane.empty || "暂无数据缺口。")}</div>`}
      </div>
    </section>
  `;
}

function getPortfolioDataLaneHint(id = "", list = {}) {
  if (id === "nav") return "过期净值、走势缺失和启动信号不明先在这里处理。";
  if (id === "fee") return "份额类别、申购费、销售服务费和赎回规则要先核验。";
  if (id === "holdings") return "没有前十大持仓，就不要把行业前景说满。";
  return list?.nextAction || "把来源和补证动作留痕，避免结论像凭感觉。";
}

function renderPortfolioDataItem(item = {}, lane = {}) {
  const code = String(item.code || "").trim();
  const facts = Array.isArray(item.facts) ? item.facts.slice(0, 4) : [];
  const gaps = Array.isArray(item.decision?.gaps) ? item.decision.gaps.slice(0, 3) : [];
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.reason || ""} ${facts.join(" ")}`) || "data";
  return `
    <article class="data-item">
      <div class="data-item-title">
        <strong>${escapeHtml([code, item.name].filter(Boolean).join(" ") || lane.title || "数据项")}</strong>
        <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.status || "补证")}</span>
      </div>
      <p>${escapeHtml(item.reason || "等待经理补齐证据后再给结论。")}</p>
      ${gaps.length ? `<div class="data-gaps">${gaps.map((gap) => `<em>${escapeHtml(gap)}</em>`).join("")}</div>` : ""}
      ${facts.length ? `<div class="data-facts">${facts.map((fact) => `<small>${escapeHtml(fact)}</small>`).join("")}</div>` : ""}
      <footer>
        <small>${escapeHtml(item.decision?.nextStep || "进入完整榜单查看补证要求。")}</small>
        <div>
          ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">详情</button>` : ""}
          <button type="button" class="ranking-detail-link" data-open-ranking-filter="data_confidence">榜单</button>
        </div>
      </footer>
    </article>
  `;
}

function renderPortfolioOpportunityBoard(context = {}) {
  const root = document.querySelector("#portfolioOpportunityBoard");
  if (!root) return;
  const ready = context.ready || [];
  const waiting = context.waiting || [];
  const launchEve = context.launchEve || [];
  const blocked = context.blocked || [];
  const total = ready.length + waiting.length + launchEve.length;
  setText("#portfolioOpportunityState", total ? `${total} 个观察入口` : "暂无机会");
  root.innerHTML = `
    ${renderPortfolioOpportunityCommand({ ready, waiting, launchEve, blocked })}
    <div class="opportunity-lane-grid">
      ${renderOpportunityLane("接近可买", ready, "buy", "暂无可买复核候选。")}
      ${renderOpportunityLane("等待回调", waiting, "watch", "暂无等待回调候选。")}
      ${renderOpportunityLane("启动前夜", launchEve, "launch", "暂无低位启动前夜候选。")}
      ${renderOpportunityLane("暂不买", blocked, "risk", "暂无被拦截候选。", 4)}
    </div>
  `;
}

function renderPortfolioOpportunityCommand({ ready = [], waiting = [], launchEve = [], blocked = [] } = {}) {
  const lead = selectPortfolioOpportunityLead({ ready, waiting, launchEve, blocked });
  const code = String(lead.item?.code || "").trim();
  return `
    <section class="opportunity-command-row" aria-label="机会指挥条">
      <article class="opportunity-command-primary opportunity-command-${escapeHtml(lead.tone || "watch")}">
        <span>${escapeHtml(lead.label || "今日机会指挥")}</span>
        <strong>${escapeHtml(code ? `${code} ${lead.item?.name || ""}`.trim() : "暂无第一优先候选")}</strong>
        <small>${escapeHtml(lead.reason || "等待经理生成接近可买、等待回调或启动前夜候选。")}</small>
      </article>
      <div class="opportunity-command-counts">
        ${renderOpportunityCommandCount("接近可买", ready.length, "buy_preparation")}
        ${renderOpportunityCommandCount("启动前夜", launchEve.length, "launch_setup")}
        ${renderOpportunityCommandCount("等待回调", waiting.length, "launch_setup")}
        ${renderOpportunityCommandCount("暂不买", blocked.length, "chase_risk")}
      </div>
      <div class="opportunity-command-actions">
        <em class="ranking-action ${getManagerRankingActionClass(lead.action || lead.label || "")}">${escapeHtml(lead.action || "等待信号")}</em>
        ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">自选详情</button>` : ""}
        <button type="button" class="ranking-detail-link" data-open-ranking-filter="${escapeHtml(lead.rankingFilter || "buy_preparation")}">对应榜单</button>
      </div>
    </section>
  `;
}

function selectPortfolioOpportunityLead({ ready = [], waiting = [], launchEve = [], blocked = [] } = {}) {
  const candidates = [
    { item: ready[0], tone: "buy", label: "先看可买", action: "买入复核", rankingFilter: "buy_preparation" },
    { item: launchEve[0], tone: "launch", label: "盯启动前夜", action: "启动确认", rankingFilter: "launch_setup" },
    { item: waiting[0], tone: "watch", label: "等待回调", action: "等触发", rankingFilter: "launch_setup" },
    { item: blocked[0], tone: "risk", label: "先排风险", action: "暂不买", rankingFilter: "chase_risk" }
  ];
  const selected = candidates.find((candidate) => candidate.item) || candidates[0];
  const item = selected.item || null;
  return {
    ...selected,
    item,
    reason: item
      ? item.buyTriggers?.[0] || item.positionPlan || item.reason || selectWatchlistPrimaryGap(item)
      : "暂无通过机会池筛选的候选；先运行盘前观察或补充自选池。"
  };
}

function renderOpportunityCommandCount(label, count, rankingFilter) {
  return `
    <button type="button" data-open-ranking-filter="${escapeHtml(rankingFilter || "decision_synthesis")}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(count || 0))}</strong>
    </button>
  `;
}

function renderOpportunityLane(title, items = [], tone = "watch", empty = "暂无候选。", limit = 5) {
  const values = (items || []).slice(0, limit);
  return `
    <section class="opportunity-lane opportunity-lane-${escapeHtml(tone)}">
      <div class="opportunity-lane-head">
        <strong>${escapeHtml(title)}</strong>
        <span>${values.length} 只</span>
      </div>
      ${values.length ? values.map((item) => renderOpportunityCard(item, tone)).join("") : `<div class="empty compact-empty">${escapeHtml(empty)}</div>`}
    </section>
  `;
}

function renderOpportunityCard(item = {}, tone = "watch") {
  const snapshot = item.lastSnapshot || {};
  const trend = getFundSnapshotTrendText(snapshot);
  const gap = selectWatchlistPrimaryGap(item);
  const trigger = item.buyTriggers?.[0] || item.positionPlan || item.reason || "等待下一次复查";
  const statusText = item.statusText || formatWatchlistStatus(item.status);
  const readiness = formatWatchlistReadiness(item);
  return `
    <article class="opportunity-card opportunity-card-${escapeHtml(tone)}">
      <div class="opportunity-card-head">
        <strong>${escapeHtml(item.code)} ${escapeHtml(item.name || "")}</strong>
        <span>${escapeHtml(statusText)}</span>
      </div>
      ${readiness ? `<small>${readiness}</small>` : ""}
      <p>${escapeHtml(trigger)}</p>
      ${trend && trend !== "走势数据不足" ? `<small>${escapeHtml(trend)}</small>` : ""}
      <em>${escapeHtml(gap)}</em>
      <button type="button" class="secondary" data-focus-watchlist-code="${escapeHtml(item.code || "")}">查看自选池</button>
    </article>
  `;
}

function renderManagerRankings(board = {}) {
  const root = document.querySelector("#managerRankingBoard");
  const updated = document.querySelector("#managerRankingUpdatedAt");
  if (!root) return;
  const lists = Array.isArray(board.lists) ? board.lists : [];
  if (updated) {
    updated.textContent = board.updatedAt ? `更新 ${formatDateTime(board.updatedAt)}` : "未加载";
  }
  setText("#portfolioNavRankingCount", String(lists.reduce((sum, list) => sum + (Array.isArray(list.items) ? list.items.length : 0), 0)));
  if (!lists.length) {
    root.innerHTML = `<div class="empty">暂无榜单数据。自选池、持仓或用户持仓关注有数据后会自动生成。</div>`;
    return;
  }
  root.innerHTML = `
    <section class="ranking-terminal">
      <div class="ranking-terminal-head">
        <div>
          <strong>榜单中枢</strong>
          <small>左侧选择决策视角，右侧只展开当前榜单；需要总览时再点全部榜单。</small>
        </div>
        <span>${lists.length} 个视角</span>
      </div>
      <div class="ranking-terminal-body">
        ${renderManagerRankingOverview(lists)}
        <div class="ranking-detail-stage">
          ${renderManagerRankingLensGuide(board, lists)}
          ${renderManagerCustomerDecisionSummary(board.customerDecisionSummary || {})}
          ${renderManagerCustomerActionLeaderboard(board.customerActionLeaderboard || {})}
          ${renderManagerRankingActionDeck(board.customerActionDeck || {})}
          <div class="ranking-list-stage">
            ${lists.map(renderManagerRankingList).join("")}
          </div>
          ${renderManagerRankingDigestDeck(board)}
        </div>
      </div>
    </section>
  `;
  if (!managerRankingFilterInitialized) {
    activeManagerRankingFilter = getDefaultManagerRankingFilter(board, lists);
    managerRankingFilterInitialized = true;
  } else if (activeManagerRankingFilter && !lists.some((list) => list.id === activeManagerRankingFilter)) {
    activeManagerRankingFilter = getDefaultManagerRankingFilter(board, lists);
  }
  setManagerRankingFilter(activeManagerRankingFilter);
}

function getDefaultManagerRankingFilter(board = {}, lists = []) {
  const available = new Set((lists || []).map((list) => list.id).filter(Boolean));
  const priorityListId = (Array.isArray(board.priorityQueue) ? board.priorityQueue : [])
    .map((item) => item.listId)
    .find((id) => available.has(id));
  if (priorityListId) return priorityListId;
  return (lists || []).find((list) => Array.isArray(list.items) && list.items.length)?.id || lists?.[0]?.id || "";
}

function renderManagerRankingDigestDeck(board = {}) {
  return `
    <div class="ranking-digest-deck">
      ${renderManagerRankingHealth(board.health || {})}
      ${renderManagerCustomerDigest(board.customerDigest || {})}
      ${renderManagerPriorityQueue(board.priorityQueue || [])}
    </div>
  `;
}

function renderManagerRankingLensGuide(board = {}, lists = []) {
  const totalItems = (lists || []).reduce((sum, list) => sum + (Array.isArray(list.items) ? list.items.length : 0), 0);
  const priority = Array.isArray(board.priorityQueue) ? board.priorityQueue[0] : null;
  const allGuide = {
    id: "",
    title: "全部榜单",
    subtitle: board.summary || `共 ${lists.length} 个视角，${totalItems} 个复核对象。`,
    purpose: "先看客户行动牌和今日优先处理，再进入单个视角核对买点、风险、数据和费用。",
    top: priority,
    count: totalItems,
    nextAction: priority ? "先处理跨榜单优先项" : "等待经理生成榜单"
  };
  return `
    <div class="ranking-lens-guide" aria-label="榜单视角说明">
      ${renderManagerRankingGuideCard(allGuide)}
      ${(lists || []).map((list) => renderManagerRankingGuideCard(buildManagerRankingGuide(list))).join("")}
    </div>
  `;
}

function buildManagerRankingGuide(list = {}) {
  const items = Array.isArray(list.items) ? list.items : [];
  const top = items[0] || null;
  const group = MANAGER_RANKING_GROUPS.find((candidate) => candidate.listIds.includes(list.id));
  return {
    id: list.id || "",
    title: list.title || "榜单视角",
    subtitle: list.subtitle || group?.hint || "从一个角度复核基金是否值得买、继续等、卖出或补证据。",
    purpose: getManagerRankingLensPurpose(list, group),
    top,
    count: items.length,
    nextAction: top?.nextStep || list.nextAction || "查看榜单明细"
  };
}

function getManagerRankingLensPurpose(list = {}, group = null) {
  if (list.nextAction) return list.nextAction;
  const id = list.id || "";
  if (id === "decision_synthesis") return "把买点、轮动、追涨、费用和持仓前景汇总成最终复核顺序。";
  if (id === "buy_preparation") return "只看接近买点的候选，确认是不是能小仓试探。";
  if (id === "launch_setup") return "专门找回调完成、低位、准备启动的基金，防止追涨。";
  if (id === "cash_redeployment") return "现金过高时找小额再部署对象，避免一直空等。";
  if (id === "position_sizing") return "把候选转成 0 元观察、小仓试探或分批加仓的仓位方案。";
  if (id === "theme_allocation" || id === "rotation_opportunity") return "先判断板块和轮动，再选代表基金。";
  if (id === "chase_risk" || id === "drawdown_defense" || id === "sell_risk") return "先处理追涨、回撤和止盈风险，再讨论新增买入。";
  if (id === "data_confidence") return "净值、费率、份额、前十大持仓和来源缺失时，先补证据。";
  if (id === "fee_suitability" || id === "replacement_choice") return "比较 A/C/D/I 份额和同类替代，避免费用侵蚀收益。";
  if (id === "user_holding_alerts") return "把客户真实持仓的卖出、止盈和买入提醒置顶。";
  return group ? `${group.title}视角：${group.hint}。` : "从这个视角复核基金是否值得行动。";
}

function renderManagerRankingGuideCard(guide = {}) {
  const top = guide.top || null;
  const code = String(top?.code || "").trim();
  const actionClass = getManagerRankingActionClass(top?.action || guide.nextAction || "");
  return `
    <section class="ranking-lens-guide-card" data-ranking-guide-id="${escapeHtml(guide.id || "")}">
      <div>
        <span>${escapeHtml(guide.title || "榜单视角")}</span>
        <strong>${escapeHtml(guide.purpose || "查看这个视角的复核对象。")}</strong>
        <small>${escapeHtml(guide.subtitle || "")}</small>
      </div>
      <div class="ranking-lens-guide-focus">
        <span>${escapeHtml(guide.count ? `${guide.count} 项` : "暂无触发")}</span>
        <strong>${escapeHtml(code ? `${code} ${top?.name || ""}`.trim() : "暂无第一处理对象")}</strong>
        <small>${escapeHtml(top?.reason || guide.nextAction || "等待经理下一轮复核。")}</small>
      </div>
      <div class="ranking-lens-guide-actions">
        <em class="ranking-action ${actionClass}">${escapeHtml(top?.action || guide.nextAction || "查看")}</em>
        ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">自选详情</button>` : ""}
      </div>
    </section>
  `;
}

function renderManagerCustomerDecisionSummary(summary = {}) {
  const lines = Array.isArray(summary.lines) ? summary.lines.filter(Boolean).slice(0, 5) : [];
  if (!lines.length && !summary.primaryAction) return "";
  const chips = Array.isArray(summary.chips) ? summary.chips : [];
  return `
    <section class="ranking-decision-summary">
      <div class="ranking-decision-summary-head">
        <div>
          <strong>${escapeHtml(summary.title || "客户决策摘要")}</strong>
          <small>${escapeHtml(summary.primaryAction || summary.summary || "先看今天最需要处理的动作。")}</small>
        </div>
        ${summary.evidence?.priorityTop ? `<span>${escapeHtml(`优先：${summary.evidence.priorityTop.code || ""} ${summary.evidence.priorityTop.name || ""}`.trim())}</span>` : ""}
      </div>
      <div class="ranking-decision-summary-body">
        ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
      </div>
      ${chips.length ? `
        <div class="ranking-decision-summary-chips">
          ${chips.map((chip) => `
            <button type="button" class="ranking-decision-chip ranking-decision-chip-${escapeHtml(chip.tone || chip.id || "watch")}" data-portfolio-view-target="${escapeHtml(chip.target || "rankings")}">
              <span>${escapeHtml(chip.title || "复核")}</span>
              <strong>${escapeHtml(String(chip.count || 0))}</strong>
            </button>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderManagerCustomerActionLeaderboard(board = {}) {
  const lanes = Array.isArray(board.lanes) ? board.lanes : [];
  if (!lanes.length) return "";
  return `
    <section class="ranking-action-leaderboard">
      <div class="ranking-action-leaderboard-head">
        <div>
          <strong>${escapeHtml(board.title || "客户行动排行")}</strong>
          <small>${escapeHtml(board.summary || "按买入、等待、回避、卖出和补证据拆开排序。")}</small>
        </div>
      </div>
      <div class="ranking-action-leaderboard-grid">
        ${lanes.map(renderManagerCustomerActionLeaderboardLane).join("")}
      </div>
    </section>
  `;
}

function renderManagerCustomerActionLeaderboardLane(lane = {}) {
  const items = Array.isArray(lane.items) ? lane.items : [];
  return `
    <section class="ranking-action-leaderboard-lane ranking-action-leaderboard-${escapeHtml(lane.id || lane.tone || "watch")}">
      <div class="ranking-action-leaderboard-lane-head">
        <div>
          <strong>${escapeHtml(lane.title || "行动排行")}</strong>
          <small>${escapeHtml(lane.purpose || "查看这条行动线的排序。")}</small>
        </div>
        <span>${escapeHtml(String(lane.count || 0))}</span>
      </div>
      <div class="ranking-action-leaderboard-items">
        ${items.length ? items.slice(0, 5).map(renderManagerCustomerActionLeaderboardItem).join("") : `<div class="compact-empty">${escapeHtml(lane.purpose || "暂无触发项。")}</div>`}
      </div>
    </section>
  `;
}

function renderManagerCustomerActionLeaderboardItem(item = {}) {
  const code = String(item.code || "").trim();
  const badges = Array.isArray(item.badges) ? item.badges : [];
  return `
    <article class="ranking-action-leaderboard-item">
      <div>
        <b>${escapeHtml(item.rank ? `#${item.rank}` : "-")}</b>
        <strong>${escapeHtml(code ? `${code} ${item.name || ""}`.trim() : item.name || "待复核对象")}</strong>
      </div>
      <p>${escapeHtml(item.reason || item.action || "等待经理复核。")}</p>
      <small>${escapeHtml(item.nextStep || "进入对应工作区查看边界。")}</small>
      ${renderManagerCustomerActionCrossCheck(item)}
      <div class="ranking-action-boundary">
        ${item.reviewWindow ? `<span>复核：${escapeHtml(item.reviewWindow)}</span>` : ""}
        ${item.trigger ? `<span>触发：${escapeHtml(item.trigger)}</span>` : ""}
        ${item.invalidation ? `<span>失效：${escapeHtml(item.invalidation)}</span>` : ""}
      </div>
      <footer>
        ${badges.slice(0, 4).map((badge) => `<em>${escapeHtml(badge)}</em>`).join("")}
        ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">自选详情</button>` : ""}
      </footer>
    </article>
  `;
}

function renderManagerCustomerActionCrossCheck(item = {}) {
  const supporting = Array.isArray(item.supportingEvidence) ? item.supportingEvidence : [];
  const constraints = Array.isArray(item.constraintEvidence) ? item.constraintEvidence : [];
  if (!supporting.length && !constraints.length && !item.crossCheckSummary) return "";
  return `
    <div class="ranking-action-crosscheck">
      ${supporting.length ? `<span>验证：${escapeHtml(supporting.join(" / "))}</span>` : ""}
      ${constraints.length ? `<span>约束：${escapeHtml(constraints.join(" / "))}</span>` : ""}
      ${!supporting.length && !constraints.length ? `<span>${escapeHtml(item.crossCheckSummary || "")}</span>` : ""}
    </div>
  `;
}

function renderManagerRankingActionDeck(deck = {}) {
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  if (!cards.length) return "";
  return `
    <section class="ranking-action-deck">
      <div class="ranking-action-deck-head">
        <div>
          <strong>${escapeHtml(deck.title || "客户行动牌")}</strong>
          <small>${escapeHtml(deck.summary || "把榜单翻译成客户今天先看什么。")}</small>
        </div>
      </div>
      <div class="ranking-action-deck-grid">
        ${cards.map(renderManagerRankingActionCard).join("")}
      </div>
    </section>
  `;
}

function renderManagerRankingActionCard(card = {}) {
  const items = Array.isArray(card.items) ? card.items : [];
  return `
    <article class="ranking-action-card ranking-action-card-${escapeHtml(card.tone || card.id || "watch")}">
      <div>
        <span>${escapeHtml(card.title || "行动")}</span>
        <strong>${escapeHtml(items[0] ? `${items[0].code || ""} ${items[0].name || ""}`.trim() || card.summary : card.emptyText || card.summary || "暂无")}</strong>
      </div>
      <small>${escapeHtml(items[0]?.reason || card.summary || "")}</small>
      <div class="ranking-action-card-items">
        ${items.length ? items.slice(0, 3).map((item) => renderManagerRankingActionChip(item)).join("") : `<em>${escapeHtml(card.emptyText || "暂无触发项")}</em>`}
      </div>
      <p>${escapeHtml(items[0]?.nextStep || card.nextStep || "")}</p>
    </article>
  `;
}

function renderManagerRankingActionChip(item = {}) {
  if (!item.code) {
    return `<em>${escapeHtml(item.action || item.reason || "复核")}</em>`;
  }
  return `
    <button type="button" class="ranking-action-chip" data-focus-watchlist-code="${escapeHtml(item.code || "")}">
      <b>${escapeHtml(item.code || "-")}</b>
      <span>${escapeHtml(item.action || "复核")}</span>
    </button>
  `;
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
        ${items.slice(0, 8).map(renderManagerPriorityItem).join("")}
      </div>
    </section>
  `;
}

function renderManagerCustomerDigest(digest = {}) {
  const groups = [
    { key: "buyReview", title: "可买复核", empty: "暂无可买复核。", tone: "buy" },
    { key: "watchFocus", title: "观察重点", empty: "暂无观察重点。", tone: "watch" },
    { key: "riskAvoid", title: "回避提醒", empty: "暂无回避提醒。", tone: "sell" }
  ];
  const hasItems = groups.some((group) => Array.isArray(digest[group.key]) && digest[group.key].length);
  if (!hasItems && !digest.summary) return "";
  return `
    <section class="ranking-customer-digest">
      <div class="ranking-customer-head">
        <strong>${escapeHtml(digest.title || "客户视角摘要")}</strong>
        <small>${escapeHtml(digest.summary || "把榜单翻译成客户容易理解的买、看、避三类。")}</small>
      </div>
      <div class="ranking-customer-groups">
        ${groups.map((group) => renderManagerCustomerDigestGroup(group, digest[group.key] || [])).join("")}
      </div>
    </section>
  `;
}

function renderManagerCustomerDigestGroup(group, items = []) {
  return `
    <div class="ranking-customer-group ranking-customer-${group.tone}">
      <span>${escapeHtml(group.title)}</span>
      ${items.length ? items.slice(0, 3).map(renderManagerCustomerDigestItem).join("") : `<small>${escapeHtml(group.empty)}</small>`}
    </div>
  `;
}

function renderManagerCustomerDigestItem(item = {}) {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const code = String(item.code || "").trim();
  return `
    <article>
      <strong>${escapeHtml(code)} ${escapeHtml(item.name || "")}</strong>
      <p>${escapeHtml(item.reason || item.action || "等待复核。")}</p>
      ${tags.length ? `<div>${tags.slice(0, 3).map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</div>` : ""}
      <div class="ranking-customer-foot">
        <small>${escapeHtml(item.nextStep || "下一轮继续复核。")}</small>
        ${code ? `<button type="button" class="ranking-customer-focus" data-focus-watchlist-code="${escapeHtml(code)}">查看自选池</button>` : ""}
      </div>
    </article>
  `;
}

function renderManagerPriorityItem(item = {}) {
  const actionClass = getManagerRankingActionClass(`${item.action || ""} ${item.listTitle || ""}`);
  const code = String(item.code || "").trim();
  return `
    <article class="ranking-priority-item">
      <div class="ranking-priority-rank">${escapeHtml(String(item.queueRank || "-"))}</div>
      <div class="ranking-priority-body">
        <div class="ranking-priority-title">
          <strong>${escapeHtml(code)} ${escapeHtml(item.name || "")}</strong>
          <div class="ranking-title-actions">
            <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.listTitle || "复核")}</span>
            ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">详情</button>` : ""}
          </div>
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
  const totalItems = lists.reduce((sum, list) => sum + (Array.isArray(list.items) ? list.items.length : 0), 0);
  const groups = buildManagerRankingOverviewGroups(lists);
  const allSummary = {
    id: "all",
    title: "全部",
    hint: `${lists.length} 类视角`,
    count: totalItems,
    focus: groups.map(selectManagerRankingGroupFocus).filter(Boolean).slice(0, 4)
  };
  return `
    <div class="ranking-overview">
      <div class="ranking-overview-groups" aria-label="榜单大类入口">
        <button class="ranking-overview-group-tab ranking-overview-all-card" type="button" data-ranking-filter="" data-ranking-group-target="all">
          <span>全部</span>
          <strong>${lists.length} 类</strong>
          <small>${totalItems} 项</small>
        </button>
        ${groups.map(renderManagerRankingOverviewGroupTab).join("")}
      </div>
      <div class="ranking-overview-lens-stage">
        ${renderManagerRankingAllGroupPanel(allSummary)}
        ${groups.map(renderManagerRankingOverviewGroup).join("")}
      </div>
    </div>
  `;
}

function buildManagerRankingOverviewGroups(lists = []) {
  const byId = new Map((lists || []).map((list) => [list.id, list]));
  const used = new Set();
  const groups = MANAGER_RANKING_GROUPS.map((group) => {
    const groupLists = group.listIds.map((id) => byId.get(id)).filter(Boolean);
    groupLists.forEach((list) => used.add(list.id));
    return { ...group, lists: groupLists };
  }).filter((group) => group.lists.length);
  const otherLists = (lists || []).filter((list) => !used.has(list.id));
  if (otherLists.length) {
    groups.push({ id: "other", title: "其他", hint: "补充视角", lists: otherLists });
  }
  return groups;
}

function renderManagerRankingOverviewGroupTab(group = {}) {
  const focus = selectManagerRankingGroupFocus(group);
  const count = (group.lists || []).reduce((sum, list) => sum + (Array.isArray(list.items) ? list.items.length : 0), 0);
  return `
    <button class="ranking-overview-group-tab ranking-overview-group-tab-${escapeHtml(group.id || "other")}" type="button" data-ranking-filter="${escapeHtml(focus?.listId || "")}" data-ranking-group-target="${escapeHtml(group.id || "other")}">
      <span>${escapeHtml(group.title || "榜单")}</span>
      <strong>${escapeHtml(String((group.lists || []).length))} 类</strong>
      <small>${escapeHtml(`${count} 项`)}</small>
    </button>
  `;
}

function renderManagerRankingAllGroupPanel(summary = {}) {
  const focusItems = Array.isArray(summary.focus) ? summary.focus : [];
  return `
    <section class="ranking-overview-group ranking-overview-group-all" data-ranking-group-id="all">
      <div class="ranking-overview-group-head">
        <strong>全部榜单</strong>
        <span>${escapeHtml(summary.hint || "")} · ${escapeHtml(String(summary.count || 0))} 项</span>
      </div>
      <button class="ranking-overview-group-focus" type="button" data-ranking-filter="">
        <span>总览模式</span>
        <strong>显示全部榜单明细</strong>
        <small>适合全局复盘；日常买卖请优先选择行动、机会、风控或证据大类。</small>
      </button>
      <div class="ranking-overview-group-list">
        ${focusItems.map((focus) => `
          <button class="ranking-overview-card ranking-overview-${escapeHtml(getManagerRankingListClass(focus.listId))}" type="button" data-ranking-filter="${escapeHtml(focus.listId || "")}" data-scroll-target="${escapeHtml(focus.listId || "")}">
            <span>${escapeHtml(focus.listTitle || "榜单")}</span>
            <strong>${escapeHtml(String(focus.count || 0))} 只</strong>
            <small>${escapeHtml(focus.label || "暂无触发项")}</small>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderManagerRankingOverviewGroup(group = {}) {
  const count = (group.lists || []).reduce((sum, list) => sum + (Array.isArray(list.items) ? list.items.length : 0), 0);
  const focus = selectManagerRankingGroupFocus(group);
  return `
    <section class="ranking-overview-group ranking-overview-group-${escapeHtml(group.id || "other")}" data-ranking-group-id="${escapeHtml(group.id || "other")}">
      <div class="ranking-overview-group-head">
        <strong>${escapeHtml(group.title || "榜单")}</strong>
        <span>${escapeHtml(group.hint || "")} · ${count} 项</span>
      </div>
      ${renderManagerRankingGroupFocus(focus, group)}
      <div class="ranking-overview-group-list">
        ${(group.lists || []).map(renderManagerRankingOverviewCard).join("")}
      </div>
    </section>
  `;
}

function selectManagerRankingGroupFocus(group = {}) {
  const lists = Array.isArray(group.lists) ? group.lists : [];
  const nonEmpty = lists.find((list) => Array.isArray(list.items) && list.items.length);
  const list = nonEmpty || lists[0] || null;
  if (!list) return null;
  const item = Array.isArray(list.items) ? list.items[0] : null;
  return {
    listId: list.id || "",
    listTitle: list.title || "榜单",
    label: item ? `${item.code || ""} ${item.name || ""}`.trim() : list.emptyText || "暂无触发项",
    action: item?.action || list.nextAction || "查看榜单",
    count: Array.isArray(list.items) ? list.items.length : 0
  };
}

function getManagerRankingGroupIdForList(rankingId = "") {
  const id = String(rankingId || "");
  if (!id) return "all";
  const group = MANAGER_RANKING_GROUPS.find((candidate) => candidate.listIds.includes(id));
  return group?.id || "other";
}

function renderManagerRankingGroupFocus(focus = null, group = {}) {
  if (!focus) return "";
  return `
    <button class="ranking-overview-group-focus" type="button" data-ranking-filter="${escapeHtml(focus.listId || "")}" data-scroll-target="${escapeHtml(focus.listId || "")}">
      <span>${escapeHtml(group.title || "分组")}重点</span>
      <strong>${escapeHtml(focus.label || "暂无触发项")}</strong>
      <small>${escapeHtml(focus.listTitle || "榜单")} · ${escapeHtml(focus.action || "查看榜单")} · ${escapeHtml(String(focus.count || 0))} 项</small>
    </button>
  `;
}

function renderManagerRankingOverviewCard(list = {}) {
  const items = Array.isArray(list.items) ? list.items : [];
  const top = items[0] || null;
  return `
    <button class="ranking-overview-card ranking-overview-${getManagerRankingListClass(list.id)}" type="button" data-ranking-filter="${escapeHtml(list.id || "")}" data-scroll-target="${escapeHtml(list.id || "")}">
      <span>${escapeHtml(list.title || "榜单")}</span>
      <strong>${items.length} 只</strong>
      <small>${top ? `${top.code || ""} ${top.name || ""}`.trim() : (list.emptyText || "暂无触发项")}</small>
    </button>
  `;
}

function setManagerRankingFilter(rankingId = "") {
  const root = document.querySelector("#managerRankingBoard");
  if (!root) return;
  activeManagerRankingFilter = String(rankingId || "");
  if (activeManagerRankingFilter) {
    root.dataset.activeRanking = activeManagerRankingFilter;
  } else {
    delete root.dataset.activeRanking;
  }
  const activeGroup = getManagerRankingGroupIdForList(activeManagerRankingFilter);
  root.dataset.activeRankingGroup = activeGroup;
  root.querySelectorAll("[data-ranking-filter]").forEach((button) => {
    const active = (button.dataset.rankingFilter || "") === activeManagerRankingFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  root.querySelectorAll("[data-ranking-group-target]").forEach((button) => {
    const active = (button.dataset.rankingGroupTarget || "") === activeGroup;
    button.classList.toggle("group-active", active);
  });
  root.querySelectorAll("[data-ranking-group-id]").forEach((section) => {
    const visible = (section.dataset.rankingGroupId || "") === activeGroup;
    section.classList.toggle("is-group-hidden", !visible);
  });
  root.querySelectorAll("[data-ranking-id]").forEach((section) => {
    const visible = !activeManagerRankingFilter || section.dataset.rankingId === activeManagerRankingFilter;
    section.classList.toggle("is-filtered-out", !visible);
  });
  root.querySelectorAll("[data-ranking-guide-id]").forEach((section) => {
    const visible = (section.dataset.rankingGuideId || "") === activeManagerRankingFilter;
    section.classList.toggle("is-filtered-out", !visible);
  });
  root.querySelector(".ranking-detail-stage")?.scrollTo({ top: 0, behavior: "smooth" });
}

function focusWatchlistFund(code = "") {
  const normalizedCode = String(code || "").trim();
  if (!normalizedCode) return;
  activateTab("portfolio");
  setPortfolioView("watchlist");
  const cards = [...document.querySelectorAll("[data-watchlist-code]")];
  const target = cards.find((card) => card.dataset.watchlistCode === normalizedCode);
  if (!target) {
    showToast(`自选池暂未找到 ${normalizedCode}`);
    return;
  }
  document.querySelectorAll(".focused-from-ranking").forEach((card) => card.classList.remove("focused-from-ranking"));
  if ("open" in target) {
    target.open = true;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("focused-from-ranking");
  clearTimeout(focusWatchlistFund.timer);
  focusWatchlistFund.timer = setTimeout(() => {
    target.classList.remove("focused-from-ranking");
  }, 4200);
  showToast(`已定位到 ${normalizedCode} 自选池详情`);
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
  const code = String(item.code || "").trim();
  return `
    <article class="ranking-item ${rankClass}">
      <div class="ranking-index">${escapeHtml(String(item.rank || "-"))}</div>
      <div class="ranking-body">
        <div class="ranking-title">
          <strong>${escapeHtml(code)} ${escapeHtml(item.name || "")}</strong>
          <div class="ranking-title-actions">
            <span class="ranking-action ${actionClass}">${escapeHtml(item.action || item.status || "")}</span>
            ${code ? `<button type="button" class="ranking-detail-link" data-focus-watchlist-code="${escapeHtml(code)}">详情</button>` : ""}
          </div>
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
  if (id === "decision_synthesis") return "synthesis";
  if (id === "buy_preparation") return "buy";
  if (id === "launch_setup") return "launch";
  if (id === "cash_redeployment") return "redeploy";
  if (id === "position_sizing") return "sizing";
  if (id === "quality_score") return "quality";
  if (id === "manager_stability") return "manager";
  if (id === "portfolio_fit") return "fit";
  if (id === "theme_allocation") return "theme";
  if (id === "rotation_opportunity") return "rotation";
  if (id === "chase_risk") return "chase";
  if (id === "drawdown_defense") return "defense";
  if (id === "data_confidence") return "data";
  if (id === "holdings_outlook") return "holdings";
  if (id === "fee_suitability") return "fee";
  if (id === "replacement_choice") return "replacement";
  if (id === "opportunity_cost") return "opportunity";
  if (id === "sell_risk") return "sell";
  if (id === "user_holding_alerts") return "user";
  return "default";
}

function getManagerRankingActionClass(text = "") {
  if (/卖出|减仓|止损|止盈|回吐/.test(text)) return "sell";
  if (/综合|优先买入复核|小仓试探复核/.test(text)) return "synthesis";
  if (/现金再部署|再部署|0\.5%-2\.5%试探/.test(text)) return "redeploy";
  if (/仓位|启动仓|0元观察|试探仓/.test(text)) return "sizing";
  if (/质量|夏普|回撤|风险收益/.test(text)) return "quality";
  if (/经理|任期|主理|稳定|产品历史/.test(text)) return "manager";
  if (/组合|适配|补位|同线|重叠/.test(text)) return "fit";
  if (/主题|赛道|配置|代表基金/.test(text)) return "theme";
  if (/追涨|偏热|高位|拥挤|过热/.test(text)) return "chase";
  if (/回撤防线|防线|利润保护|高回撤|回撤/.test(text)) return "defense";
  if (/数据|证据|补证|净值|走势|过期|缺份额|缺费率|缺申购|缺销售服务费|缺数据来源/.test(text)) return "data";
  if (/板块轮动|轮动启动|轮动观察|轮动降温|轮动/.test(text)) return "rotation";
  if (/买入|启动|触发/.test(text)) return "buy";
  if (/持仓|前景|行业/.test(text)) return "holdings";
  if (/替代|优选|同类|同基金|低费/.test(text)) return "replacement";
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

function renderPortfolioRunConsole(portfolio = {}, latestRun = null, context = {}) {
  const root = document.querySelector("#portfolioRunConsoleSummary");
  if (!root) return;
  const commandRoot = document.querySelector("#portfolioRunCommandStrip");
  const latestRoot = document.querySelector("#portfolioRunLatestBoard");
  const executionRoot = document.querySelector("#portfolioRunExecutionBoard");
  const historyRoot = document.querySelector("#portfolioRunHistoryBoard");
  const outputRoot = document.querySelector("#portfolioRunOutput");
  const scheduler = portfolio.scheduler || {};
  const status = scheduler.inFlight ? "running" : latestRun?.status || "idle";
  const label = {
    running: "运行中",
    completed: "已完成",
    failed: "异常",
    interrupted: "已中断",
    cancelled: "已结束",
    idle: "待运行"
  }[status] || status;
  const stateNode = document.querySelector("#portfolioRunConsoleState");
  if (stateNode) {
    stateNode.textContent = label;
    stateNode.className = `badge ${status === "failed" || status === "interrupted" ? "bad" : status === "running" ? "warn" : "ok"}`;
  }
  const runs = Array.isArray(context.runs) ? context.runs : [];
  const activeOrders = Array.isArray(context.activeOrders) ? context.activeOrders : [];
  const transactions = Array.isArray(context.transactions) ? context.transactions : [];
  const equity = Array.isArray(context.equity) ? context.equity : [];
  const executionCount = activeOrders.length + transactions.length + equity.length;
  setText("#runnerNavControlCount", scheduler.inFlight ? "运行中" : portfolio.enabled ? "启用" : "停用");
  setText("#runnerNavLatestCount", latestRun ? "1" : "0");
  setText("#runnerNavExecutionCount", String(executionCount));
  setText("#runnerNavHistoryCount", String(runs.length));
  setText("#runnerNavRawCount", portfolio.lightweight ? "摘要" : "完整");
  if (commandRoot) {
    commandRoot.innerHTML = renderPortfolioRunCommandStrip({ portfolio, latestRun, scheduler, status, label, activeOrders, runs });
  }
  const cards = [
    {
      label: "当前任务",
      value: scheduler.inFlight ? "任务正在后台执行" : portfolio.enabled ? "自动运行已启用" : "自动运行停用",
      meta: scheduler.inFlight
        ? `开始于 ${formatDateTime(scheduler.activeRunStartedAt)}，页面会自动刷新`
        : formatPortfolioSchedule(portfolio),
      tone: scheduler.inFlight ? "warn" : portfolio.enabled ? "ok" : "muted",
      runnerTarget: "history",
      action: "看运行"
    },
    {
      label: "最近结论",
      value: latestRun?.summary || "暂无经理结论",
      meta: latestRun ? `${latestRun.date || "-"} · ${latestRun.title || formatRunTypeLabel(latestRun.type)}` : "先从左侧选择盘前观察或今日操作",
      tone: latestRun?.status === "failed" || latestRun?.status === "interrupted" ? "bad" : "info",
      runnerTarget: "latest",
      action: "看结论"
    },
    {
      label: "执行流转",
      value: activeOrders.length ? `${activeOrders.length} 笔待确认订单` : "暂无待确认订单",
      meta: activeOrders[0]
        ? `${activeOrders[0].side || ""} ${activeOrders[0].code || ""} ${activeOrders[0].name || ""}`.trim()
        : `已确认成交 ${transactions.length} 笔，估值记录 ${equity.length} 条`,
      tone: activeOrders.length ? "warn" : "ok",
      runnerTarget: "execution",
      action: "看执行"
    },
    {
      label: "记录规模",
      value: `${runs.length} 条运行记录`,
      meta: portfolio.lightweight && !portfolioTimelineFullLoaded ? "当前先加载轻量摘要，打开原文时再取完整日报" : "记录已按时间线收纳，不再铺成长页面",
      tone: "info",
      runnerTarget: "history",
      action: "看历史"
    }
  ];
  root.innerHTML = cards.map((card) => `
    <article class="run-console-card ${escapeHtml(card.tone || "info")}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(compactRunnerConsoleText(card.value, 78))}</strong>
      <p>${escapeHtml(compactRunnerConsoleText(card.meta || "", 96))}</p>
      <button type="button" class="secondary" data-runner-view-target="${escapeHtml(card.runnerTarget || "control")}">${escapeHtml(card.action || "查看")}</button>
    </article>
  `).join("");
  if (latestRoot) {
    latestRoot.innerHTML = renderPortfolioRunLatestBoard(latestRun);
  }
  if (executionRoot) {
    executionRoot.innerHTML = renderPortfolioRunExecutionBoard({ activeOrders, transactions, equity });
  }
  if (historyRoot) {
    historyRoot.innerHTML = renderPortfolioRunHistoryBoard(runs);
  }
  if (outputRoot) {
    outputRoot.textContent = formatPortfolioOutput(portfolio);
  }
}

function compactRunnerConsoleText(value = "", limit = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function renderPortfolioRunCommandStrip({ portfolio = {}, latestRun = null, scheduler = {}, status = "idle", label = "待运行", activeOrders = [], runs = [] } = {}) {
  const nextAction = scheduler.inFlight
    ? "等待后台任务完成"
    : activeOrders.length
      ? "先复核订单"
      : latestRun
        ? "查看最近结论"
        : "先运行盘前观察";
  const tone = status === "failed" || status === "interrupted" ? "bad" : status === "running" ? "warn" : "ok";
  return `
    <div class="run-command-main ${tone}">
      <span>运行指挥</span>
      <strong>${escapeHtml(nextAction)}</strong>
      <small>${escapeHtml(scheduler.inFlight ? `本轮开始 ${formatDateTime(scheduler.activeRunStartedAt)}` : latestRun?.summary || formatPortfolioSchedule(portfolio))}</small>
    </div>
    <div class="run-command-facts">
      <span><b>${escapeHtml(label)}</b><small>当前状态</small></span>
      <span><b>${escapeHtml(String(activeOrders.length))}</b><small>待确认</small></span>
      <span><b>${escapeHtml(String(runs.length))}</b><small>运行记录</small></span>
    </div>
    <div class="run-command-actions">
      <button type="button" data-runner-view-target="latest">看结论</button>
      <button type="button" class="secondary" data-runner-view-target="execution">看执行</button>
      <button type="button" class="secondary" data-runner-view-target="history">看历史</button>
    </div>
  `;
}

function renderPortfolioRunLatestBoard(latestRun = null) {
  if (!latestRun) {
    return `
      <div class="runner-empty-state">
        <strong>暂无经理结论</strong>
        <p>先在任务控制里运行盘前观察或今日操作，运行完成后这里只展示最新一条结论。</p>
      </div>
    `;
  }
  const actions = Array.isArray(latestRun.actions) ? latestRun.actions : [];
  const team = Array.isArray(latestRun.team) ? latestRun.team : [];
  const orders = Array.isArray(latestRun.orders) ? latestRun.orders : [];
  const statusClass = getRunStatusClass(latestRun.status);
  return `
    <article class="runner-latest-card">
      <div class="runner-latest-head">
        <div>
          <span>${escapeHtml(formatRunTypeLabel(latestRun.type))}</span>
          <strong>${escapeHtml(latestRun.date || "")} · ${escapeHtml(latestRun.title || formatRunTypeLabel(latestRun.type))}</strong>
          <p>${escapeHtml(latestRun.summary || "暂无摘要")}</p>
        </div>
        <em class="${statusClass}">${escapeHtml(formatRunStatus(latestRun.status))}</em>
      </div>
      <div class="runner-latest-grid">
        <button type="button" data-portfolio-view-target="timeline"><span>完整时间线</span><strong>打开记录</strong><small>查看日报分面板</small></button>
        <button type="button" data-run-panel="actions" data-portfolio-view-target="timeline"><span>本次操作</span><strong>${actions.length} 项</strong><small>${escapeHtml(actions[0] ? `${actions[0].action || ""} ${actions[0].code || ""} ${actions[0].name || ""}`.trim() : "暂无买卖动作")}</small></button>
        <button type="button" data-run-panel="committee" data-portfolio-view-target="timeline"><span>投委会</span><strong>${team.length} 人</strong><small>${escapeHtml(team[0] ? `${team[0].agent || "角色"}：${team[0].stance || "中"}` : "暂无角色观点")}</small></button>
        <button type="button" data-run-panel="execution" data-portfolio-view-target="timeline"><span>执行</span><strong>${orders.length} 笔</strong><small>${escapeHtml(orders[0] ? `${orders[0].side || ""} ${orders[0].code || ""}`.trim() : "暂无运行内订单")}</small></button>
      </div>
    </article>
  `;
}

function renderPortfolioRunExecutionBoard({ activeOrders = [], transactions = [], equity = [] } = {}) {
  const latestEquity = equity[0] || null;
  const lanes = [
    {
      title: "待确认订单",
      count: activeOrders.length,
      empty: "暂无申购或赎回排队。",
      items: activeOrders.slice(0, 5).map((item) => ({
        title: `${item.side || ""} ${item.code || ""} ${item.name || ""}`.trim(),
        meta: `${formatMoney(item.amount)} · ${item.status || ""}`,
        foot: `确认 ${item.confirmDate || "-"} · 到账 ${item.settleDate || "-"}`
      }))
    },
    {
      title: "最近成交",
      count: transactions.length,
      empty: "暂无已确认成交。",
      items: transactions.slice(0, 5).map((item) => ({
        title: `${item.side || ""} ${item.code || ""} ${item.name || ""}`.trim(),
        meta: `${formatMoney(item.amount)} · 净值 ${item.nav ? formatNumber(item.nav, 4) : "-"}`,
        foot: item.date || item.confirmDate || ""
      }))
    },
    {
      title: "估值快照",
      count: equity.length,
      empty: "暂无估值记录。",
      items: latestEquity ? [{
        title: latestEquity.date || "最新估值",
        meta: `总资产 ${formatMoney(latestEquity.totalAsset)} · 仓位 ${formatNumber(latestEquity.positionWeightPct || 0, 2)}%`,
        foot: `现金 ${formatMoney(latestEquity.cash)} · 盈亏 ${formatSigned(latestEquity.cumulativePnlPct || 0)}%`
      }] : []
    }
  ];
  return `
    <div class="runner-execution-lanes">
      ${lanes.map((lane) => `
        <section class="runner-execution-lane">
          <div class="runner-execution-head">
            <strong>${escapeHtml(lane.title)}</strong>
            <span>${escapeHtml(String(lane.count || 0))}</span>
          </div>
          <div class="runner-execution-list">
            ${lane.items.length ? lane.items.map((item) => `
              <article>
                <strong>${escapeHtml(item.title || "-")}</strong>
                <p>${escapeHtml(item.meta || "")}</p>
                <small>${escapeHtml(item.foot || "")}</small>
              </article>
            `).join("") : `<div class="compact-empty">${escapeHtml(lane.empty)}</div>`}
          </div>
        </section>
      `).join("")}
    </div>
    <div class="runner-execution-actions">
      <button type="button" data-portfolio-view-target="orders">进入订单终端</button>
      <button type="button" class="secondary" data-runner-view-target="raw">看原始状态</button>
    </div>
  `;
}

function renderPortfolioRunHistoryBoard(runs = []) {
  const items = Array.isArray(runs) ? runs.slice(0, 8) : [];
  if (!items.length) {
    return `
      <div class="runner-empty-state">
        <strong>暂无运行历史</strong>
        <p>运行盘前观察、今日操作或周总结后，这里会先显示最近记录；完整日报仍在时间线入口里。</p>
      </div>
    `;
  }
  const counts = buildRunStatusCounts(items);
  return `
    <section class="runner-history-terminal">
      <div class="runner-history-head">
        <div>
          <strong>最近运行</strong>
          <small>运行台只放最近记录，长日报和角色明细进入时间线下钻。</small>
        </div>
        <div class="runner-history-counts">
          <span>完成 ${escapeHtml(String(counts.completed || 0))}</span>
          <span>运行 ${escapeHtml(String(counts.running || 0))}</span>
          <span>异常 ${escapeHtml(String((counts.failed || 0) + (counts.interrupted || 0)))}</span>
        </div>
      </div>
      <div class="runner-history-list">
        ${items.map((run, index) => {
          const key = getRunKey(run, index);
          return `
            <button type="button" class="runner-history-item" data-run-select="${escapeHtml(key)}" data-portfolio-view-target="timeline">
              <span class="run-index-dot ${escapeHtml(getRunStatusClass(run.status))}"></span>
              <div>
                <strong>${escapeHtml([run.date, run.title || formatRunTypeLabel(run.type)].filter(Boolean).join(" · ") || "运行记录")}</strong>
                <small>${escapeHtml(run.summary || buildRunCompactMeta(run))}</small>
              </div>
              <em class="${escapeHtml(getRunStatusClass(run.status))}">${escapeHtml(formatRunStatus(run.status))}</em>
            </button>
          `;
        }).join("")}
      </div>
      <div class="runner-history-actions">
        <button type="button" data-portfolio-view-target="timeline">进入完整时间线</button>
      </div>
    </section>
  `;
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
  ["#runPremarketBtn", "#runDecisionBtn", "#runValuationBtn", "#runWeeklyBtn"].forEach((selector) => {
    const button = document.querySelector(selector);
    if (button) button.disabled = inFlight;
  });
  const cancelButton = document.querySelector("#cancelPortfolioBtn");
  if (cancelButton) cancelButton.disabled = !inFlight;
}

function renderOrders(orders) {
  const list = document.querySelector("#orderList");
  setText("#orderNavActiveCount", String(orders.length));
  setText("#portfolioOrderTerminalState", orders.length ? `${orders.length} 笔待确认` : "无待确认");
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
  const lanes = buildPortfolioPositionLanes(positions);
  const totalValue = positions.reduce((sum, item) => sum + Number(item.currentValue || 0), 0);
  const totalPnl = positions.reduce((sum, item) => sum + Number(item.unrealizedPnl || 0), 0);
  const topWeight = [...positions].sort((a, b) => Number(b.weightPct || 0) - Number(a.weightPct || 0))[0] || null;
  const riskCount = lanes.find((lane) => lane.id === "risk")?.items.length || 0;
  list.innerHTML = `
    <section class="position-terminal">
      <div class="position-terminal-head">
        <div>
          <strong>持仓分屏</strong>
          <small>先看风险和止盈，再看核心仓与小仓观察；每栏独立滚动，不再把所有持仓堆成一条长列表。</small>
        </div>
        <span>${positions.length} 只基金</span>
      </div>
      <div class="position-command-row">
        <article>
          <span>持仓市值</span>
          <strong>${formatMoney(totalValue)}</strong>
          <small>当前已投入基金估值</small>
        </article>
        <article class="${totalPnl >= 0 ? "ok" : "warn"}">
          <span>持仓盈亏</span>
          <strong>${formatSigned(totalPnl)}</strong>
          <small>按持仓成本，不用初始本金做分母</small>
        </article>
        <article class="${riskCount ? "warn" : "ok"}">
          <span>风险预警</span>
          <strong>${riskCount} 项</strong>
          <small>${riskCount ? "优先复核减仓、止损或降风险" : "暂无急需处理项"}</small>
        </article>
        <article>
          <span>最大单仓</span>
          <strong>${topWeight ? `${formatNumber(topWeight.weightPct || 0, 2)}%` : "-"}</strong>
          <small>${topWeight ? `${topWeight.code || ""} ${topWeight.name || ""}`.trim() : "暂无"}</small>
        </article>
      </div>
      <div class="position-lane-grid">
        ${lanes.map(renderPortfolioPositionLane).join("")}
      </div>
    </section>
  `;
}

function buildPortfolioPositionLanes(positions = []) {
  const buckets = new Map(PORTFOLIO_POSITION_LANES.map((lane) => [lane.id, []]));
  for (const position of positions || []) {
    const laneId = getPortfolioPositionLaneId(position);
    buckets.get(laneId)?.push(position);
  }
  return PORTFOLIO_POSITION_LANES.map((lane) => ({
    ...lane,
    items: (buckets.get(lane.id) || []).sort(comparePortfolioPositionsForLane)
  }));
}

function getPortfolioPositionLaneId(item = {}) {
  const riskBudget = item.riskBudget || {};
  const text = [
    item.lastReason,
    riskBudget.level,
    riskBudget.label,
    ...(Array.isArray(riskBudget.triggers) ? riskBudget.triggers : [])
  ].filter(Boolean).join(" ");
  const pnlPct = Number(item.unrealizedPnlPct);
  const weightPct = Number(item.weightPct);
  const peakPct = Number(item.peakUnrealizedPnlPct);
  const givebackPct = Number(item.profitGivebackPct);
  if (/severe|warning|风险|止损|减仓|卖出|防线|回撤/.test(text) || (Number.isFinite(pnlPct) && pnlPct <= -3)) return "risk";
  if (/止盈|回吐|兑现/.test(text) || (Number.isFinite(givebackPct) && givebackPct >= 2.5) || (Number.isFinite(peakPct) && peakPct >= 4 && Number.isFinite(pnlPct) && pnlPct < peakPct - 2)) return "profit";
  if (/观察|试探|卫星/.test(text) || (Number.isFinite(weightPct) && weightPct <= 3)) return "watch";
  return "core";
}

function comparePortfolioPositionsForLane(a = {}, b = {}) {
  return Number(b.weightPct || 0) - Number(a.weightPct || 0)
    || Math.abs(Number(b.unrealizedPnlPct || 0)) - Math.abs(Number(a.unrealizedPnlPct || 0))
    || String(a.code || "").localeCompare(String(b.code || ""));
}

function renderPortfolioPositionLane(lane = {}) {
  const items = Array.isArray(lane.items) ? lane.items : [];
  return `
    <section class="position-lane position-lane-${escapeHtml(lane.tone || "core")}">
      <div class="position-lane-head">
        <div>
          <strong>${escapeHtml(lane.title || "持仓")}</strong>
          <small>${escapeHtml(getPortfolioPositionLaneHint(lane.id))}</small>
        </div>
        <span>${items.length}</span>
      </div>
      <div class="position-item-list">
        ${items.length ? items.map(renderPositionCard).join("") : `<div class="empty compact-empty">${escapeHtml(lane.empty || "暂无持仓。")}</div>`}
      </div>
    </section>
  `;
}

function getPortfolioPositionLaneHint(id = "") {
  if (id === "risk") return "亏损、回撤、防线或减仓信号先处理。";
  if (id === "profit") return "浮盈回吐、止盈和兑现边界集中查看。";
  if (id === "watch") return "小仓、卫星仓和试探仓单独盯。";
  return "仓位较稳定的核心持有。";
}

function renderUserPortfolios(userPortfolios = []) {
  const list = document.querySelector("#userPortfolioList");
  const rail = document.querySelector("#userPortfolioRail");
  const count = document.querySelector("#userPortfolioCount");
  if (!list || !count) return;
  const users = Array.isArray(userPortfolios) ? userPortfolios : [];
  const holdingCount = users.reduce((sum, item) => sum + Number(item.holdingCount || item.holdings?.length || 0), 0);
  count.textContent = `${users.length} 个用户 / ${holdingCount} 只`;
  if (!users.length) {
    if (rail) {
      rail.innerHTML = `<div class="empty compact-empty">暂无用户。</div>`;
    }
    list.innerHTML = `<div class="empty">暂无用户持仓。可以在这里手动添加，也可以在飞书里说“建立用户admin的持仓情况”后发送截图。</div>`;
    return;
  }
  const selected = resolveActiveUserPortfolio(users);
  if (rail) {
    rail.innerHTML = `
      <div class="user-portfolio-rail-head">
        <strong>用户列表</strong>
        <span>${users.length}</span>
      </div>
      <div class="user-portfolio-tab-list">
        ${users.map((user) => renderUserPortfolioTab(user, selected?.userId)).join("")}
      </div>
    `;
  }
  list.innerHTML = `
    <section class="user-portfolio-terminal">
      <div class="user-portfolio-terminal-head">
        <div>
          <strong>${escapeHtml(selected?.displayName || selected?.userId || "用户持仓")}</strong>
          <small>${escapeHtml(buildUserPortfolioTerminalSubtitle(selected))}</small>
        </div>
        <span>${selected?.updatedAt ? `更新 ${escapeHtml(formatDateTime(selected.updatedAt))}` : "等待更新"}</span>
      </div>
      <div class="user-portfolio-detail-stage">
        ${selected ? renderUserPortfolioCard(selected) : `<div class="empty compact-empty">请选择一个用户。</div>`}
      </div>
    </section>
  `;
}

function resolveActiveUserPortfolio(users = []) {
  if (!users.length) {
    activeUserPortfolioId = "";
    return null;
  }
  const selected = users.find((user) => user.userId === activeUserPortfolioId) || users[0];
  activeUserPortfolioId = selected.userId || "";
  return selected;
}

function buildUserPortfolioTerminalSubtitle(user = {}) {
  if (!user) return "暂无用户持仓。";
  const holdings = Array.isArray(user.holdings) ? user.holdings : [];
  const alerts = Array.isArray(user.alerts) ? user.alerts : [];
  const warningCount = alerts.filter((item) => item.level === "warning").length;
  return `${holdings.length} 只持仓，${warningCount} 条优先提醒；右侧卡片可直接编辑或移出基金。`;
}

function renderUserPortfolioTab(user = {}, selectedId = "") {
  const holdings = Array.isArray(user.holdings) ? user.holdings : [];
  const alerts = Array.isArray(user.alerts) ? user.alerts : [];
  const warningCount = alerts.filter((item) => item.level === "warning").length;
  const active = user.userId === selectedId;
  const firstAlert = alerts[0] || null;
  return `
    <button type="button" class="user-portfolio-tab${active ? " active" : ""}" data-user-portfolio-select="${escapeHtml(user.userId || "")}" aria-pressed="${active ? "true" : "false"}">
      <div>
        <strong>${escapeHtml(user.displayName || user.userId || "用户")}</strong>
        <small>${escapeHtml(user.userId || "")} · ${holdings.length} 只持仓</small>
      </div>
      <span class="${warningCount ? "warn" : ""}">${warningCount}</span>
      <em>${escapeHtml(firstAlert?.action || firstAlert?.reason || "暂无优先提醒")}</em>
    </button>
  `;
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
  list.classList.toggle("is-empty", !items.length);
  const groups = groupWatchlistItems(items);
  if (!activeWatchlistStatus || !(groups.get(activeWatchlistStatus)?.length)) {
    activeWatchlistStatus = getDefaultWatchlistStatus(groups);
  }
  list.innerHTML = [
    renderWatchlistSummary(items),
    renderWatchlistTerminal(groups)
  ].join("");
}

function getWatchlistCategories() {
  return [
    { status: "ready", title: "接近买点", hint: "低位、费用和买入触发基本满足" },
    { status: "waiting_pullback", title: "等待回调", hint: "方向可跟踪，但还没到执行价格或形态" },
    { status: "watch", title: "观察中", hint: "有研究价值，继续补数据和等确认" },
    { status: "blocked", title: "暂不买", hint: "偏热、数据缺口或风险约束未通过" },
    { status: "in_position", title: "已持仓", hint: "与当前组合已有暴露相关" },
    { status: "removed", title: "已移出", hint: "历史候选，暂不参与决策" }
  ];
}

function getDefaultWatchlistStatus(groups) {
  return getWatchlistCategories().find((category) => groups.get(category.status)?.length)?.status || "watch";
}

function renderWatchlistTerminal(groups) {
  const allCategories = getWatchlistCategories();
  const populatedCategories = allCategories.filter((category) => groups.get(category.status)?.length);
  const categories = populatedCategories.length ? populatedCategories : allCategories.filter((category) => ["ready", "waiting_pullback", "watch", "blocked"].includes(category.status));
  const activeCategory = categories.find((category) => category.status === activeWatchlistStatus) || categories[0];
  const activeItems = groups.get(activeCategory?.status) || [];
  const emptyText = "暂无自选基金。盘前观察、今日操作或周总结会把值得等待的候选沉淀到这里。";
  return `
    <section class="watchlist-terminal">
      <div class="watchlist-terminal-head">
        <div>
          <strong>自选池工作台</strong>
          <small>左侧按买点状态筛选，右侧只展开当前分类，避免候选基金铺成长页面。</small>
        </div>
        <span>${populatedCategories.length || 0} 类 · ${activeItems.length} 只当前候选</span>
      </div>
      <div class="watchlist-terminal-body">
        <div class="watchlist-status-rail" role="list">
          ${categories.map((category) => renderWatchlistStatusButton(category, groups.get(category.status) || [])).join("")}
        </div>
        <div class="watchlist-status-stage">
          ${activeItems.length ? renderWatchlistCategory(activeCategory, activeItems) : renderWatchlistEmptyCategory(activeCategory, emptyText)}
        </div>
      </div>
    </section>
  `;
}

function renderWatchlistStatusButton(category, items = []) {
  const statusClass = getWatchlistStatusClass(category.status);
  const best = items[0];
  const active = category.status === activeWatchlistStatus;
  return `
    <button type="button" class="watchlist-status-tab${active ? " active" : ""}" data-watchlist-status-filter="${escapeHtml(category.status)}">
      <span class="watchlist-pill ${statusClass}">${items.length} 只</span>
      <strong>${escapeHtml(category.title)}</strong>
      <small>${escapeHtml(best ? `${best.code || ""} ${best.name || ""}`.trim() : category.hint)}</small>
      <em>${escapeHtml(best ? selectWatchlistPrimaryGap(best) : category.hint)}</em>
    </button>
  `;
}

function renderWatchlistCategoryDeck(groups) {
  const categories = getWatchlistCategories();
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

function renderWatchlistEmptyCategory(category = {}, text = "暂无自选基金分类。") {
  return `
    <section class="watchlist-category">
      <div class="watchlist-category-head">
        <div>
          <h3>${escapeHtml(category.title || "自选池")}</h3>
          <p>${escapeHtml(category.hint || "等待经理把候选基金沉淀到这里。")}</p>
        </div>
        <span class="watchlist-pill ${getWatchlistStatusClass(category.status)}">0 只</span>
      </div>
      <div class="empty">${escapeHtml(text)}</div>
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
  const rankingRefs = renderWatchlistRankingRefs(item.code);
  return `
    <details class="fund-card watchlist-fund-card" data-watchlist-code="${escapeHtml(item.code || "")}">
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
        ${rankingRefs}
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

function renderWatchlistRankingRefs(code = "") {
  const refs = collectWatchlistRankingRefs(code);
  if (!refs.length) return "";
  return `
    <div class="watchlist-ranking-refs">
      <strong>上榜依据</strong>
      <div>
        ${refs.map((ref) => `
          <span class="watchlist-ranking-ref ranking-ref-${getManagerRankingListClass(ref.listId)}">
            <small>${escapeHtml(ref.title)}${ref.rank ? ` #${escapeHtml(String(ref.rank))}` : ""}</small>
            <em class="ranking-action ${getManagerRankingActionClass(ref.action)}">${escapeHtml(ref.action || "复核")}</em>
          </span>
        `).join("")}
      </div>
    </div>
  `;
}

function collectWatchlistRankingRefs(code = "") {
  const targetCode = String(code || "").trim();
  if (!targetCode) return [];
  const lists = Array.isArray(currentPortfolio?.managerRankings?.lists) ? currentPortfolio.managerRankings.lists : [];
  const refs = [];
  for (const list of lists) {
    const items = Array.isArray(list?.items) ? list.items : [];
    const item = items.find((candidate) => String(candidate?.code || "").trim() === targetCode);
    if (!item) continue;
    refs.push({
      listId: list.id || "",
      title: list.title || "经理榜单",
      rank: item.rank || "",
      action: item.action || item.status || ""
    });
  }
  return refs.slice(0, 6);
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
  setText("#timelineCount", `${runs.length}`);
  list.classList.toggle("is-empty", !runs.length);
  if (!runs.length) {
    list.innerHTML = `
      <div class="timeline-terminal">
        <div class="timeline-terminal-head">
          <div>
            <strong>经理时间线</strong>
            <small>暂无决策记录。盘前观察、今日操作和周总结会沉淀到这里。</small>
          </div>
          <div class="timeline-status-strip">
            <span>记录 0</span>
            <span>完成 0</span>
            <span>运行 0</span>
            <span>异常 0</span>
          </div>
        </div>
        <div class="timeline-terminal-body">
          <div class="run-index-list" role="list">
            <div class="run-panel-empty">暂无记录</div>
          </div>
          <div class="run-stage">
            <div class="run-panel-empty">经理运行后，会在这里展示摘要、操作、投委会、执行和原始日报入口。</div>
          </div>
        </div>
      </div>
    `;
    return;
  }
  const keyedRuns = runs.map((run, index) => ({ run, index, key: getRunKey(run, index) }));
  if (!activePortfolioRunKey || !keyedRuns.some((item) => item.key === activePortfolioRunKey)) {
    activePortfolioRunKey = keyedRuns[0].key;
  }
  const active = keyedRuns.find((item) => item.key === activePortfolioRunKey) || keyedRuns[0];
  const statusCounts = buildRunStatusCounts(runs);
  list.innerHTML = `
    <div class="timeline-terminal">
      <div class="timeline-terminal-head">
        <div>
          <strong>经理时间线</strong>
          <small>${escapeHtml(getTimelineDetailStateText())}</small>
        </div>
        <div class="timeline-status-strip">
          <span>记录 ${runs.length}</span>
          <span>完成 ${statusCounts.completed || 0}</span>
          <span>运行 ${statusCounts.running || 0}</span>
          <span>异常 ${(statusCounts.failed || 0) + (statusCounts.interrupted || 0)}</span>
        </div>
      </div>
      <div class="timeline-terminal-body">
        <div class="run-index-list" role="list">
          ${keyedRuns.map((item) => renderRunIndexButton(item, item.key === activePortfolioRunKey)).join("")}
        </div>
        <div class="run-stage">
          ${renderRunDetail(active.run)}
        </div>
      </div>
    </div>
  `;
}

function getRunKey(run = {}, index = 0) {
  return String(run.id || [run.date, run.type, run.startedAt, index].filter(Boolean).join("-") || index);
}

function buildRunStatusCounts(runs = []) {
  return runs.reduce((counts, run) => {
    const key = run.status || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function getTimelineDetailStateText() {
  if (portfolioTimelineFullLoading) return "正在按需加载完整日报，先展示轻量摘要。";
  if (currentPortfolio?.lightweight && !portfolioTimelineFullLoaded) return "当前为轻量摘要，进入时间线后自动加载完整日报。";
  return "左侧选择记录，右侧查看经理分析、执行依据和完整日报。";
}

function getRunStatusClass(status = "") {
  if (status === "failed" || status === "interrupted") return "bad-text";
  if (status === "running") return "warn-text";
  return "ok-text";
}

function buildRunCompactMeta(run = {}) {
  const orders = run.orders?.length ? `${run.orders.length} 笔订单` : "";
  const transactions = run.transactions?.length ? `${run.transactions.length} 笔确认成交` : "";
  const notes = run.executionNotes?.length ? `${run.executionNotes.length} 条执行说明` : "";
  return [orders, transactions, notes].filter(Boolean).join(" · ") || "查看经理分析、动作和原始日报";
}

function renderRunIndexButton(item = {}, active = false) {
  const run = item.run || {};
  const statusClass = getRunStatusClass(run.status);
  return `
    <button type="button" class="run-index-item${active ? " active" : ""}" data-run-select="${escapeHtml(item.key || "")}">
      <span class="run-index-dot ${statusClass}"></span>
      <span class="run-index-main">
        <strong>${escapeHtml(run.date || "")} · ${escapeHtml(run.title || formatRunTypeLabel(run.type))}</strong>
        <small>${escapeHtml(run.summary || "无摘要")}</small>
        <em>${escapeHtml(buildRunCompactMeta(run))}</em>
      </span>
      <span class="run-index-status ${statusClass}">${escapeHtml(formatRunStatus(run.status))}</span>
    </button>
  `;
}

function renderRunDetail(run = {}) {
  const statusClass = getRunStatusClass(run.status);
  const durationSeconds = run.durationMs
    ? Math.round(run.durationMs / 1000)
    : run.status === "running" && run.startedAt
      ? Math.max(0, Math.round((Date.now() - new Date(run.startedAt).getTime()) / 1000))
      : 0;
  const report = run.card
    || run.summary
    || (portfolioTimelineFullLoading ? "完整日报正在加载，稍后会自动刷新。" : run.status === "running" ? "任务仍在运行，刷新后查看最新状态。" : "无内容");
  const panel = getActiveRunDetailPanel(run);
  return `
    <article class="run-detail-card">
      <div class="run-detail-head">
        <div>
          <span>${escapeHtml(formatRunTypeLabel(run.type))}</span>
          <strong>${escapeHtml(run.date || "")} · ${escapeHtml(run.title || formatRunTypeLabel(run.type))}</strong>
          <p>${escapeHtml(run.summary || "暂无摘要")}</p>
        </div>
        <strong class="${statusClass}">${escapeHtml(formatRunStatus(run.status))}</strong>
      </div>
      <div class="run-detail">
        <div class="run-meta">
          <span>开始：${escapeHtml(formatDateTime(run.startedAt))}</span>
          <span>进度：${escapeHtml(formatDateTime(run.progressAt))}</span>
          <span>结束：${escapeHtml(formatDateTime(run.completedAt))}</span>
          <span>耗时：${durationSeconds}s</span>
        </div>
        ${run.error ? `<p class="bad-text">${escapeHtml(run.error)}</p>` : ""}
        <div class="run-detail-console">
          ${renderRunPanelSwitch(run, panel)}
          <div class="run-panel-stage">
            ${renderRunPanelContent(run, panel, report)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function getActiveRunDetailPanel(run = {}) {
  const panels = buildRunDetailPanels(run);
  const available = new Set(panels.map((panel) => panel.id));
  if (available.has(activePortfolioRunPanel)) return activePortfolioRunPanel;
  return panels.find((panel) => panel.id !== "report" && panel.count)?.id || "brief";
}

function buildRunDetailPanels(run = {}) {
  const actions = Array.isArray(run.actions) ? run.actions.length : 0;
  const committee = Array.isArray(run.team) ? run.team.length : 0;
  const execution = (Array.isArray(run.orders) ? run.orders.length : 0) + (Array.isArray(run.executionNotes) ? run.executionNotes.length : 0);
  const panels = {
    brief: { id: "brief", label: "摘要", hint: "先看结论", count: null },
    actions: { id: "actions", label: "操作", hint: "买卖依据", count: actions },
    committee: { id: "committee", label: "投委会", hint: "多角色观点", count: committee },
    execution: { id: "execution", label: "执行", hint: "订单/说明", count: execution },
    report: { id: "report", label: currentPortfolio?.lightweight && !portfolioTimelineFullLoaded ? "日报摘要" : "原文", hint: "隐藏长文", count: null }
  };
  return RUN_DETAIL_PANEL_ORDER.map((id) => panels[id]).filter(Boolean);
}

function renderRunPanelSwitch(run = {}, activePanel = "brief") {
  const panels = buildRunDetailPanels(run);
  return `
    <nav class="run-panel-switcher" aria-label="运行记录详情入口">
      ${panels.map((panel) => `
        <button type="button" class="${panel.id === activePanel ? "active" : ""}" data-run-panel="${escapeHtml(panel.id)}" aria-pressed="${panel.id === activePanel ? "true" : "false"}">
          <span>${escapeHtml(panel.label)}</span>
          <small>${escapeHtml(Number.isFinite(panel.count) ? `${panel.count} 项` : panel.hint)}</small>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderRunPanelContent(run = {}, panel = "brief", report = "") {
  if (panel === "actions") return renderRunActionsPanel(run);
  if (panel === "committee") return renderRunCommitteePanel(run);
  if (panel === "execution") return renderRunExecutionPanel(run);
  if (panel === "report") return renderRunReportPanel(report);
  return renderRunBriefPanel(run, report);
}

function renderRunBriefPanel(run = {}, report = "") {
  const actions = Array.isArray(run.actions) ? run.actions : [];
  const team = Array.isArray(run.team) ? run.team : [];
  const orders = Array.isArray(run.orders) ? run.orders : [];
  const notes = Array.isArray(run.executionNotes) ? run.executionNotes : [];
  const cardPreview = String(report || "").split("\n").filter(Boolean).slice(0, 2).join(" ");
  const cards = [
    {
      label: "经理结论",
      value: run.summary || cardPreview || "暂无摘要",
      meta: run.title || formatRunTypeLabel(run.type)
    },
    {
      label: "本次操作",
      value: actions.length ? `${actions.length} 个动作需要看` : "暂无买卖动作",
      meta: actions[0] ? `${actions[0].action || ""} ${actions[0].code || ""} ${actions[0].name || ""}`.trim() : "没有触发买入、卖出或观察动作"
    },
    {
      label: "投委会",
      value: team.length ? `${team.length} 个角色给出观点` : "暂无角色意见",
      meta: team[0] ? `${team[0].agent || "投委会"}：${team[0].stance || "中"}` : "等待经理生成复盘"
    },
    {
      label: "执行状态",
      value: orders.length ? `${orders.length} 笔订单` : "无待执行订单",
      meta: notes[0]?.reason || formatRunStatus(run.status) || "查看执行入口了解细节"
    }
  ];
  return `
    <div class="run-brief-grid">
      ${cards.map((card) => `
        <article class="run-brief-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.meta || "")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRunActionsPanel(run = {}) {
  const actions = Array.isArray(run.actions) ? run.actions : [];
  if (!actions.length) {
    return `<div class="run-panel-empty">这条记录没有买入、卖出或观察动作。</div>`;
  }
  return `
    <div class="run-action-board">
      ${actions.map((action) => `
        <article class="run-action-row">
          <div>
            <span>${escapeHtml(action.action || "操作")}</span>
            <strong>${escapeHtml([action.code, action.name].filter(Boolean).join(" ") || "组合动作")}</strong>
          </div>
          <p>${escapeHtml(action.reason || "暂无动作理由")}</p>
          ${renderRunActionAudit(action)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderRunCommitteePanel(run = {}) {
  const team = Array.isArray(run.team) ? run.team : [];
  if (!team.length) {
    return `<div class="run-panel-empty">这条记录没有投委会角色观点。</div>`;
  }
  return `
    <div class="run-committee-grid">
      ${team.map((item) => `
        <article class="thought-card">
          <span>${escapeHtml(item.agent || "投委会")}</span>
          <strong>${escapeHtml(item.stance || "中")}</strong>
          <p>${escapeHtml(item.reason || "暂无观点")}</p>
          <small>${escapeHtml((item.dataBasis || []).join("；"))}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRunExecutionPanel(run = {}) {
  const orders = Array.isArray(run.orders) ? run.orders : [];
  const notes = Array.isArray(run.executionNotes) ? run.executionNotes : [];
  if (!orders.length && !notes.length) {
    return `<div class="run-panel-empty">暂无订单或执行说明。</div>`;
  }
  return `
    <div class="run-execution-grid">
      ${orders.map((order) => `
        <article class="thought-card">
          <span>订单</span>
          <strong>${escapeHtml(order.side || "")} ${escapeHtml(order.code || "")}</strong>
          <p>${escapeHtml(`${formatMoney(order.amount)} · ${order.status || ""}`)}</p>
          <small>${escapeHtml(`估值日 ${order.priceDate || "-"}，确认日 ${order.confirmDate || "-"}`)}</small>
        </article>
      `).join("")}
      ${notes.map((note) => `
        <article class="thought-card">
          <span>执行说明</span>
          <strong>${escapeHtml([note.action, note.code].filter(Boolean).join(" ") || "说明")}</strong>
          <p>${escapeHtml(note.reason || "")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRunReportPanel(report = "") {
  return `
    <div class="run-report-card">
      <div>
        <strong>${currentPortfolio?.lightweight && !portfolioTimelineFullLoaded ? "日报摘要" : "完整日报文本"}</strong>
        <span>${portfolioTimelineFullLoading ? "正在加载完整日报" : "原始内容只在这里展开，避免时间线默认变成长文页面。"}</span>
      </div>
      <pre>${escapeHtml(report || "无内容")}</pre>
    </div>
  `;
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
  setText("#orderNavTransactionCount", String(transactions.length));
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
  setText("#orderNavEquityCount", String(equity.length));
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
  if (button) button.disabled = true;
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
      if (button) button.disabled = false;
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
  portfolioTimelineFullLoaded = !portfolio.lightweight;
  portfolioTimelineFullLoading = false;
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
  if (activePortfolioView === "timeline") {
    ensurePortfolioTimelineDetails().catch(showError);
  }
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
