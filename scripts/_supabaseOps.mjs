import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, "..");
export const opsDir = path.join(repoRoot, "supabase", "ops");
export const historyPath = path.join(opsDir, "deploy-history.jsonl");
const linkedProjectRefPath = path.join(repoRoot, "supabase", ".temp", "project-ref");

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

export function ensureOpsDir() {
  fs.mkdirSync(opsDir, { recursive: true });
}

export function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readManifest(fileName) {
  return readJson(path.join(opsDir, fileName));
}

export function linkedProjectRef() {
  return fs.existsSync(linkedProjectRefPath)
    ? fs.readFileSync(linkedProjectRefPath, "utf8").trim()
    : null;
}

export function resolveProjectRef(args, { requireExplicit = false } = {}) {
  const explicit = String(args["project-ref"] || "").trim();
  if (explicit) return explicit;
  if (requireExplicit) {
    throw new Error("Pass --project-ref explicitly for production-affecting scripts.");
  }
  const linked = linkedProjectRef();
  if (!linked) {
    throw new Error("No linked Supabase project found. Pass --project-ref explicitly.");
  }
  return linked;
}

export function gitCommit(ref = "HEAD") {
  return execFileSync("git", ["rev-parse", ref], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

export function gitBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

export function runSupabase(args, { cwd = repoRoot } = {}) {
  return execFileSync("supabase", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function fetchApiKeys(projectRef) {
  return JSON.parse(
    runSupabase(["projects", "api-keys", "--project-ref", projectRef, "-o", "json"]),
  );
}

export function fetchLegacyServiceRoleKey(projectRef) {
  const keys = fetchApiKeys(projectRef);
  const serviceRole = keys.find((key) => key.id === "service_role" && typeof key.api_key === "string");
  if (!serviceRole?.api_key) {
    throw new Error(
      "Unable to retrieve the legacy service_role key from Supabase CLI. Ensure the CLI is authenticated to this project.",
    );
  }
  return serviceRole.api_key;
}

export async function execSqlSelect(projectRef, query, params = []) {
  const serviceRoleKey = fetchLegacyServiceRoleKey(projectRef);
  const response = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query, params }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`exec_sql failed (${response.status}): ${text}`);
  }
  return JSON.parse(text);
}

export function parseFunctionList(value, manifest) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("Pass --functions with a comma-separated list.");
  }
  const requested = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  const allowed = new Set(Object.keys(manifest.functions || {}));
  const invalid = requested.filter((fn) => !allowed.has(fn));
  if (invalid.length) {
    throw new Error(`Unknown risky functions: ${invalid.join(", ")}`);
  }
  return requested;
}

export function appendHistory(entry) {
  ensureOpsDir();
  fs.appendFileSync(historyPath, `${JSON.stringify(entry)}\n`);
}

export function updateLastKnownGood({ projectRef, functions, commit, note, action, sourceRef = "HEAD" }) {
  ensureOpsDir();
  const filePath = path.join(opsDir, "last-known-good.json");
  const state = readJson(filePath, { projectRef, functions: {} });
  const timestamp = new Date().toISOString();
  for (const fn of functions) {
    state.functions[fn] = {
      commit,
      sourceRef,
      action,
      note: note || "",
      updatedAt: timestamp,
    };
  }
  writeJson(filePath, state);
  appendHistory({
    timestamp,
    projectRef,
    functions,
    commit,
    sourceRef,
    action,
    note: note || "",
    branch: gitBranch(),
  });
}

export function deployFunction({ projectRef, workdir, functionName, verifyJwt }) {
  const args = [
    "functions",
    "deploy",
    functionName,
    "--project-ref",
    projectRef,
    "--use-api",
  ];
  if (verifyJwt === false) {
    args.push("--no-verify-jwt");
  }
  return runSupabase(args, { cwd: workdir });
}
