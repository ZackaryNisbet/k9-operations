import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  deployFunction,
  parseArgs,
  parseFunctionList,
  readManifest,
  repoRoot,
  resolveProjectRef,
  updateLastKnownGood,
} from "./_supabaseOps.mjs";

const args = parseArgs(process.argv.slice(2));
const projectRef = resolveProjectRef(args, { requireExplicit: true });
const targetCommit = String(args.commit || "").trim();
if (!targetCommit) {
  throw new Error("Pass --commit <sha> to roll back Edge Functions.");
}

const manifest = readManifest("risky-functions.json");
if (!manifest) {
  throw new Error("Missing supabase/ops/risky-functions.json manifest.");
}
const functions = parseFunctionList(args.functions, manifest);
const note = String(args.note || "").trim();

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k9-ops-rollback-"));
try {
  execFileSync("git", ["worktree", "add", "--detach", tempRoot, targetCommit], {
    cwd: repoRoot,
    stdio: "pipe",
  });
  for (const functionName of functions) {
    const config = manifest.functions[functionName];
    process.stdout.write(`Rolling back ${functionName} to ${targetCommit} on ${projectRef}...\n`);
    const output = deployFunction({
      projectRef,
      workdir: tempRoot,
      functionName,
      verifyJwt: config.verifyJwt,
    });
    process.stdout.write(output);
  }

  updateLastKnownGood({
    projectRef,
    functions,
    commit: targetCommit,
    note,
    action: "rollback",
    sourceRef: targetCommit,
  });
} finally {
  try {
    execFileSync("git", ["worktree", "remove", "--force", tempRoot], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch {
    // best-effort cleanup
  }
}
