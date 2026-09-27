import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

// Runs deterministic local checks and records their actual outputs. Source is
// checkpointed on the existing feature branch as a DRAFT, even when unfinished.
// This script never provisions infrastructure, publishes a deployment or merges.
const cwd = process.cwd();
const log = [];
const results = [];
function run(command, args, options = {}) {
  const windows = process.platform === "win32";
  const isNpm = command === "npm";
  const executable = windows && isNpm ? process.env.ComSpec || "cmd.exe" : command;
  const parameters = windows && isNpm ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args;
  const execution = spawnSync(executable, parameters, { cwd, encoding: "utf8", timeout: options.timeout ?? 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const output = `${execution.stdout ?? ""}${execution.stderr ?? ""}`;
  const result = { command: [command, ...args].join(" "), exitCode: execution.status, error: execution.error?.message ?? null };
  results.push(result); log.push(`\n$ ${result.command}\n${output}\nExit: ${result.exitCode}\n`);
  return { ...result, output };
}
function record(extra = {}) {
  writeFileSync("event-beast-verification.log", log.join("\n"));
  writeFileSync("docs/verification-run.json", JSON.stringify({ timestamp: new Date().toISOString(), results, ...extra }, null, 2) + "\n");
}
const remote = run("git", ["remote", "get-url", "origin"]);
const branch = run("git", ["branch", "--show-current"]);
if (!/github\.com[/:]jzferrell26\/event-beast(?:\.git)?\s*$/i.test(remote.output.trim()) || branch.output.trim() !== "feat/event-beast-launch") {
  record({ checkpoint: "stopped", reason: "Repository identity or branch differs from the authorized feature branch." });
  console.log("Stopped: repository identity or feature branch needs review.");
  process.exit(1);
}
const checks = [
  run("npm", ["run", "icons"]),
  run(process.execPath, ["scripts/generate-seed.mjs"]),
  run("npm", ["run", "typecheck"]),
  run("npm", ["run", "lint"]),
  run("npm", ["test"]),
  run("npm", ["run", "build"], { timeout: 180000 }),
];
const passed = checks.every((check) => check.exitCode === 0);
record({ automatedChecksPassed: passed, liveInfrastructureQualified: false, deploymentVerified: false });
console.log(checks.map((check) => `${check.exitCode === 0 ? "PASS" : "REVIEW"} ${check.command}`).join("\n"));
const files = [".env.example", ".gitignore", "AGENTS.md", "README.md", "package.json", "package-lock.json", "next-env.d.ts", "next.config.ts", "eslint.config.mjs", "tsconfig.json", "vitest.config.ts", "src", "supabase", "public", "scripts", "tests", "docs"].filter((file) => existsSync(path.join(cwd, file)));
const staged = run("git", ["add", "--", ...files]);
const whitespace = run("git", ["diff", "--cached", "--check"]);
const names = run("git", ["diff", "--cached", "--name-only"]);
if (staged.exitCode !== 0 || whitespace.exitCode !== 0 || names.output.split(/\r?\n/).some((name) => /(^|\/)\.env(\.|$)/.test(name) && name !== ".env.example")) {
  record({ automatedChecksPassed: passed, checkpoint: "stopped", reason: "Review staging/whitespace or environment-file checks before committing." });
  console.log("Checkpoint stopped for staging review. See event-beast-verification.log.");
  process.exit(1);
}
const committed = run("git", ["commit", "-m", "Build Event Beast attendee app and organizer foundation"]);
if (committed.exitCode !== 0) {
  record({ automatedChecksPassed: passed, checkpoint: "commit unconfirmed" });
  console.log("Commit unconfirmed. Review event-beast-verification.log before retrying.");
  process.exit(1);
}
const sha = run("git", ["rev-parse", "HEAD"]).output.trim();
const pushed = run("git", ["push", "-u", "origin", "feat/event-beast-launch"], { timeout: 120000 });
if (pushed.exitCode !== 0) {
  record({ automatedChecksPassed: passed, commit: sha, pushVerified: false });
  console.log(`Local checkpoint ${sha}. Push needs review.`);
  process.exit(1);
}
const body = `Builds the Momentum Builder LIVE 2026 attendee companion and organizer tools. The source includes event-scoped Supabase migrations, eligibility and directory privacy, durable one-to-one messaging with idempotent retry, structured agenda and sponsors, profiles, onboarding, content administration, attendee imports, reports and a public-only offline reader.\n\nThe demo uses clearly labeled sample content and refuses live writes. SMS remains outside this application.\n\nQualification: ${passed ? "Local automated checks completed successfully in the checkpoint runner." : "One or more local automated checks need review; see docs/verification-run.json and the local verification log."} Hosted two-account messaging, mobile/browser qualification and production deployment are not signed off. The dedicated Supabase project has not been created; its quoted recurring cost still needs owner approval.\n\nKeep this PR in draft until the remaining checks in docs/QUALIFICATION.md are complete.\n`;
writeFileSync("event-beast-pr-body.log", body);
const existing = run("gh", ["pr", "list", "--repo", "jzferrell26/event-beast", "--head", "feat/event-beast-launch", "--state", "open", "--json", "url", "--limit", "1"]);
let prUrl = null;
try { prUrl = JSON.parse(existing.output)[0]?.url ?? null; } catch { /* Leave creation result explicit. */ }
if (!prUrl) {
  const created = run("gh", ["pr", "create", "--repo", "jzferrell26/event-beast", "--base", "main", "--head", "feat/event-beast-launch", "--draft", "--title", "Build Event Beast attendee companion and organizer tools", "--body-file", "event-beast-pr-body.log"]);
  if (created.exitCode === 0) prUrl = created.output.trim().split(/\r?\n/).find((line) => line.startsWith("https://github.com/")) ?? null;
}
record({ automatedChecksPassed: passed, commit: sha, pushVerified: true, pullRequest: prUrl, deploymentVerified: false, liveInfrastructureQualified: false });
console.log(JSON.stringify({ commit: sha, pushed: true, pullRequest: prUrl, checksPassed: passed, productionQualified: false }));
