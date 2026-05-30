import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const targetBase = normalizeBaseUrl(process.argv[2] || process.env.FUNDAGENT_DEPLOY_URL || "http://107.148.181.68:30001");
const adminToken = process.env.FUNDAGENT_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "";
const timeoutMs = Number(process.env.FUNDAGENT_DEPLOY_CHECK_TIMEOUT_MS || 20000);

const localRelease = resolveLocalRelease();
const checks = [];

await main();

async function main() {
  const health = await fetchJson("/health", { required: true, label: "health endpoint" });
  if (health) {
    assertCheck(Boolean(health.release), "/health exposes release metadata", "critical", "Current online build is too old to prove which code is serving users.");
    if (health.release) {
      const remoteCommit = String(health.release.commit || health.release.shortCommit || "");
      assertCheck(Boolean(remoteCommit), "/health release includes commit", "critical", "Deployment must expose a commit so stale builds are visible.");
      if (localRelease.commit && remoteCommit) {
        const matches = localRelease.commit.startsWith(remoteCommit) || remoteCommit.startsWith(localRelease.shortCommit);
        assertCheck(matches, "deployed commit matches local HEAD", "critical", `local=${localRelease.shortCommit}, remote=${remoteCommit.slice(0, 12)}`);
      }
    }
  }

  const adminHtml = await fetchText("/admin", { required: true, label: "admin page" });
  const adminJs = await fetchText("/public/admin.js", { required: true, label: "admin JavaScript" });
  const adminCss = await fetchText("/public/styles.css", { required: true, label: "admin stylesheet" });
  if (adminHtml) {
    assertCheck(adminHtml.includes('data-tab="portfolio"'), "admin page exposes portfolio tab", "critical", "Managers need the portfolio dashboard to inspect holdings and actions.");
    assertCheck(adminHtml.includes("portfolioCapabilityActionQueue"), "admin page contains capability repair queue node", "critical", "The online UI is missing the concrete manager repair queue.");
    assertCheck(adminHtml.includes("portfolio-terminal-shell") && adminHtml.includes("portfolio-entry-tabs"), "admin page uses terminal-style portfolio entries", "critical", "The online portfolio page is still the old long vertical page instead of grouped stock-terminal entries.");
    assertCheck(adminHtml.includes('data-runner-view-target="latest"') && adminHtml.includes('data-runner-view-target="execution"') && adminHtml.includes('data-runner-view-target="history"'), "admin page splits virtual runner into sub-entries", "critical", "The online virtual run page is still a long mixed report instead of task, conclusion, execution, history, and raw-state entries.");
    assertCheck(adminHtml.includes("portfolioDeploymentStatus") && adminHtml.includes("portfolioRailDeploymentStatus"), "admin portfolio page exposes deployment status", "critical", "Managers should see stale deployment warnings directly in the virtual portfolio workspace.");
  }
  if (adminJs) {
    assertCheck(adminJs.includes("renderCapabilityActionQueue"), "admin JavaScript renders capability repair queue", "critical", "The online client cannot show the repair queue even if the API returns it.");
    assertCheck(adminJs.includes("TOP_HOLDINGS_DISPLAY_LIMIT = 10"), "admin JavaScript preserves top-ten holdings display", "critical", "The UI must show all top-ten holdings, not only five.");
    assertCheck(adminJs.includes("按实际投入成本"), "admin JavaScript labels PnL denominator as actual invested cost", "critical", "PnL percentages must not use initial capital as denominator.");
    assertCheck(adminJs.includes("PORTFOLIO_VIEW_GROUPS") && adminJs.includes("data-portfolio-nav-group"), "admin JavaScript switches portfolio entry groups", "critical", "The online client cannot hide inactive portfolio groups, so the virtual manager page remains too long.");
    assertCheck(adminJs.includes("compactRunnerConsoleText") && adminJs.includes("data-runner-view-target"), "admin JavaScript keeps runner cards inside runner sub-entries", "critical", "The online virtual runner still pushes users into long report pages from the summary cards.");
    assertCheck(adminJs.includes("renderPortfolioConsensusRadar"), "admin JavaScript renders ranking consensus radar", "critical", "The online manager board still forces users to jump across many lists instead of showing cross-list consensus.");
    assertCheck(adminJs.includes("renderPortfolioDeploymentStatus") && adminJs.includes("currentDeployment") && adminJs.includes("portfolioRailDeploymentStatus"), "admin JavaScript renders portfolio deployment status", "critical", "The online portfolio workspace cannot warn that the running server is stale.");
    assertCheck(adminJs.includes("matrix-verdict-") && adminJs.includes("约束："), "admin JavaScript renders decision-matrix traffic lights", "warning", "The online decision matrix cannot distinguish supports, fee constraints, and hard blockers.");
  }
  if (adminCss) {
    assertCheck(adminCss.includes(".portfolio-terminal-shell") && adminCss.includes(".portfolio-workspace-view.active"), "admin stylesheet bounds portfolio workspace height", "critical", "The online stylesheet does not bound portfolio workspaces, so long reports stretch the whole page.");
    assertCheck(adminCss.includes('.runner-workspace-view[data-runner-view="control"].active') && adminCss.includes(".run-console-grid"), "admin stylesheet bounds virtual runner control cards", "critical", "The online runner control page can still stretch instead of scrolling inside the terminal stage.");
    assertCheck(adminCss.includes(".consensus-radar") && adminCss.includes(".consensus-radar-grid"), "admin stylesheet styles ranking consensus radar", "warning", "The online manager board lacks a compact cross-list consensus layout.");
    assertCheck(adminCss.includes(".portfolio-command-panel .portfolio-deployment-status") && adminCss.includes(".portfolio-rail-deployment"), "admin stylesheet styles portfolio deployment status", "warning", "The online portfolio workspace has no compact deployment freshness status cell.");
    assertCheck(adminCss.includes(".matrix-verdict-buy") && adminCss.includes(".matrix-verdict-risk"), "admin stylesheet styles decision-matrix verdict tones", "warning", "The online decision matrix lacks visual buy/risk/data verdict cues.");
  }

  const portfolio = await fetchJson("/api/portfolio?summary=1", { required: true, label: "portfolio summary API", admin: true });
  if (portfolio?.portfolio) {
    const body = portfolio.portfolio;
    assertCheck(Boolean(body.exposureSummary), "portfolio API exposes exposure summary", "critical", "Exposure and overlap risk must be visible online.");
    assertCheck(Boolean(body.capabilityDiagnostics), "portfolio API exposes capability diagnostics", "critical", "The online manager must surface profitability, chase-risk, and data-quality weaknesses.");
    assertCheck(Array.isArray(body.capabilityActionQueue), "portfolio API exposes capability repair queue", "critical", "Diagnostics need concrete next actions.");
    assertCheck(Boolean(body.managerRankings?.consensusRadar), "portfolio API exposes ranking consensus radar", "critical", "The manager must provide a cross-list consensus board so users do not read disconnected fund lists.");
    assertCheck(body.account && Object.prototype.hasOwnProperty.call(body.account, "investedCost"), "portfolio API exposes invested cost", "critical", "Return percentages must be based on actual invested amount, even when current positions are fully settled or flat.");
  }

  printReport();
  if (checks.some((item) => item.status === "fail" && item.severity === "critical")) {
    process.exit(1);
  }
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) throw new Error("Missing deployment URL.");
  return text.replace(/\/+$/, "");
}

async function fetchJson(route, options = {}) {
  const text = await fetchText(route, options);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    checks.push({
      status: "fail",
      severity: options.required ? "critical" : "warning",
      label: `${options.label || route} returns JSON`,
      detail: error.message
    });
    return null;
  }
}

async function fetchText(route, options = {}) {
  const url = `${targetBase}${route}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {};
    if (options.admin && adminToken) headers["x-admin-token"] = adminToken;
    const response = await fetch(url, { headers, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const authHint = response.status === 401 && options.admin
        ? "Set FUNDAGENT_ADMIN_TOKEN when the deployment protects admin APIs."
        : text.slice(0, 180);
      checks.push({
        status: "fail",
        severity: options.required ? "critical" : "warning",
        label: `${options.label || route} reachable`,
        detail: `HTTP ${response.status}. ${authHint}`.trim()
      });
      return null;
    }
    checks.push({ status: "pass", severity: "info", label: `${options.label || route} reachable`, detail: url });
    return text;
  } catch (error) {
    checks.push({
      status: "fail",
      severity: options.required ? "critical" : "warning",
      label: `${options.label || route} reachable`,
      detail: error.message
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function assertCheck(ok, label, severity = "critical", detail = "") {
  checks.push({
    status: ok ? "pass" : "fail",
    severity,
    label,
    detail
  });
}

function resolveLocalRelease() {
  const pkg = safeReadJson(path.join(root, "package.json"));
  const commit = runGit(["rev-parse", "HEAD"]);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  return {
    name: pkg.name || "feishu-fund-assistant",
    version: pkg.version || "0.0.0",
    commit,
    shortCommit: commit ? commit.slice(0, 7) : "",
    branch
  };
}

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function runGit(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function printReport() {
  const failed = checks.filter((item) => item.status === "fail");
  console.log(`Deployment check: ${targetBase}`);
  console.log(`Local release: ${localRelease.shortCommit || "-"} ${localRelease.branch || ""}`.trim());
  for (const item of checks) {
    const mark = item.status === "pass" ? "OK" : "FAIL";
    const detail = item.detail ? ` - ${item.detail}` : "";
    console.log(`[${mark}] ${item.label}${detail}`);
  }
  if (failed.length) {
    console.log(`Result: ${failed.length} deployment check(s) failed.`);
  } else {
    console.log("Result: deployment matches the current capability baseline.");
  }
}
