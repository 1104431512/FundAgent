import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const server = fs.readFileSync(path.join(root, "src", "server.mjs"), "utf8");

const forbiddenPatterns = [
  {
    pattern: /reboundFromRecentLowPct,\s*\n/,
    message: "computeTrendProfile must map reboundFromRecentLowPct from reboundFromLowPct; shorthand causes ReferenceError."
  }
];

const failures = forbiddenPatterns
  .filter((item) => item.pattern.test(server))
  .map((item) => item.message);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
