const form = document.querySelector("#configForm");
const toast = document.querySelector("#toast");
const output = document.querySelector("#testOutput");
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

document.querySelector("#saveTokenBtn").addEventListener("click", () => {
  localStorage.setItem("fundagent_admin_token", adminTokenInput.value.trim());
  showToast("Token saved");
  loadAll().catch(showError);
});

document.querySelector("#reloadBtn").addEventListener("click", () => loadAll().catch(showError));
document.querySelector("#refreshStatsBtn").addEventListener("click", () => loadStats().catch(showError));
document.querySelector("#testModelBtn").addEventListener("click", () => runTest("model"));
document.querySelector("#testFeishuBtn").addEventListener("click", () => runTest("feishu"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.modelMaxOutputTokens = Number(payload.modelMaxOutputTokens || 2800);
  payload.replyMaxChars = Number(payload.replyMaxChars || 7000);

  const result = await apiFetch("/api/config", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  applyConfig(result.config);
  showToast("Config saved");
});

loadAll().catch(showError);

async function loadAll() {
  await loadConfig();
  await loadStats();
  await loadSkills();
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
  node.textContent = value ? `Current: ${value}. Leave blank to keep it.` : "Not configured";
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
      <button type="button" class="secondary" data-skill="${escapeHtml(skill.id)}">View</button>
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
  setText("#statProgress", counters.progressReplies || 0);
  setText("#statModelCalls", counters.modelCalls || 0);
  setText("#statAnalyst", counters.analystReviewCalls || 0);
  setText("#statVote", counters.committeeVoteCalls || 0);
  setText("#statManager", counters.managerReviewCalls || 0);
  setText("#statEnrich", counters.fundEnrichmentSuccess || 0);
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
  output.textContent = error.stack || error.message;
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
