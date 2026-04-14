import {
  deployFunction,
  gitCommit,
  parseArgs,
  parseFunctionList,
  readManifest,
  repoRoot,
  resolveProjectRef,
  updateLastKnownGood,
} from "./_supabaseOps.mjs";

const args = parseArgs(process.argv.slice(2));
const projectRef = resolveProjectRef(args, { requireExplicit: true });
const manifest = readManifest("risky-functions.json");
if (!manifest) {
  throw new Error("Missing supabase/ops/risky-functions.json manifest.");
}

const functions = parseFunctionList(args.functions, manifest);
const commit = gitCommit();
const note = String(args.note || "").trim();

for (const functionName of functions) {
  const config = manifest.functions[functionName];
  process.stdout.write(`Deploying ${functionName} to ${projectRef} from ${commit}...\n`);
  const output = deployFunction({
    projectRef,
    workdir: repoRoot,
    functionName,
    verifyJwt: config.verifyJwt,
  });
  process.stdout.write(output);
}

updateLastKnownGood({
  projectRef,
  functions,
  commit,
  note,
  action: "deploy",
});

process.stdout.write(`Updated last-known-good commit to ${commit} for: ${functions.join(", ")}\n`);
