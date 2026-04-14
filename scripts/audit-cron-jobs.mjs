import path from "node:path";
import {
  execSqlSelect,
  parseArgs,
  readManifest,
  repoRoot,
  resolveProjectRef,
} from "./_supabaseOps.mjs";

function classifyAuth(command) {
  if (/vault\.decrypted_secrets/.test(command)) return "vault";
  if (/current_setting\('app\.settings\.service_role_key'\)/.test(command)) return "current_setting";
  if (/Bearer\s+eyJ[a-zA-Z0-9_\-.]+/.test(command)) return "embedded_jwt";
  return "unknown";
}

function detectOverlap(liveMap) {
  const overlap = [];
  const hasFutureWeekJobs = [
    "compute-scheduling-matrix-cherry-hill-next-week",
    "compute-scheduling-matrix-cherry-hill-two-weeks",
    "compute-scheduling-matrix-cherry-hill-three-weeks",
  ].some((name) => liveMap.has(name));
  const hasFutureDayJobs = Array.from({ length: 21 }, (_, index) =>
    liveMap.has(`compute-scheduling-matrix-cherry-hill-day-${index + 7}`)
  ).some(Boolean);
  if (hasFutureWeekJobs && hasFutureDayJobs) {
    overlap.push("Scheduling future horizon is double-scheduled: week jobs and day fanout jobs are both active.");
  }
  return overlap;
}

const args = parseArgs(process.argv.slice(2));
const projectRef = resolveProjectRef(args);
const manifest = readManifest("cron-jobs.json");
if (!manifest) {
  throw new Error("Missing supabase/ops/cron-jobs.json manifest.");
}

const liveJobs = await execSqlSelect(
  projectRef,
  "select jobid, jobname, schedule, active, command from cron.job order by jobname",
);
const expectedJobs = manifest.jobs || [];
const expectedMap = new Map(expectedJobs.map((job) => [job.jobname, job]));
const liveMap = new Map(liveJobs.map((job) => [job.jobname, job]));

const missing = expectedJobs
  .filter((job) => !liveMap.has(job.jobname))
  .map((job) => job.jobname);

const unexpected = liveJobs
  .filter((job) => !expectedMap.has(job.jobname))
  .map((job) => job.jobname);

const mismatchedSchedule = [];
const authWarnings = [];
for (const liveJob of liveJobs) {
  const expected = expectedMap.get(liveJob.jobname);
  if (!expected) continue;
  if (String(expected.schedule).trim() !== String(liveJob.schedule).trim()) {
    mismatchedSchedule.push({
      jobname: liveJob.jobname,
      expected: expected.schedule,
      actual: liveJob.schedule,
    });
  }
  const auth = classifyAuth(String(liveJob.command || ""));
  if (expected.auth !== auth) {
    authWarnings.push({
      jobname: liveJob.jobname,
      expected: expected.auth,
      actual: auth,
    });
  }
}

const report = {
  projectRef,
  manifestPath: path.relative(repoRoot, path.join(repoRoot, "supabase", "ops", "cron-jobs.json")),
  liveCount: liveJobs.length,
  expectedCount: expectedJobs.length,
  missing,
  unexpected,
  mismatchedSchedule,
  authWarnings,
  overlapWarnings: detectOverlap(liveMap),
};

console.log(JSON.stringify(report, null, 2));

if (
  missing.length ||
  unexpected.length ||
  mismatchedSchedule.length ||
  authWarnings.length ||
  report.overlapWarnings.length
) {
  process.exitCode = 1;
}
