import { execSqlSelect, parseArgs, readManifest, resolveProjectRef } from "./_supabaseOps.mjs";

const LEGACY_SCHEDULING_JOBS = [
  "compute-scheduling-matrix-cherry-hill",
  "compute-scheduling-matrix-cherry-hill-next-week",
  "compute-scheduling-matrix-cherry-hill-two-weeks",
  "compute-scheduling-matrix-cherry-hill-three-weeks",
  "compute-scheduling-matrix-cherry-hill-week-1",
  "compute-scheduling-matrix-cherry-hill-week-2",
  "compute-scheduling-matrix-cherry-hill-week-3",
  "compute-scheduling-matrix-cherry-hill-week-4",
];

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function authHeadersSql() {
  return [
    "jsonb_build_object(",
    "'Content-Type', 'application/json',",
    "'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),",
    "'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')",
    ")",
  ].join(" ");
}

function buildCommand(job) {
  const headers = authHeadersSql();
  if (job.payloadMode === "current_week") {
    return [
      "select net.http_post(",
      `url := ${quoteLiteral(`https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/${job.function}`)},`,
      `headers := ${headers},`,
      "body := jsonb_build_object(",
      "'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',",
      "'date_from', (now() at time zone 'America/New_York')::date::text,",
      "'date_to', (((now() at time zone 'America/New_York')::date) + 6)::text",
      "),",
      "timeout_milliseconds := 120000",
      ");",
    ].join(" ");
  }

  if (job.payloadMode === "single_day") {
    return [
      "select net.http_post(",
      `url := ${quoteLiteral(`https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/${job.function}`)},`,
      `headers := ${headers},`,
      "body := jsonb_build_object(",
      "'location_id', '8ea382b0-63f7-44ac-b6f8-83243c03d946',",
      `'date_from', (((now() at time zone 'America/New_York')::date) + ${job.dayOffset})::text,`,
      `'date_to', (((now() at time zone 'America/New_York')::date) + ${job.dayOffset})::text`,
      "),",
      "timeout_milliseconds := 120000",
      ");",
    ].join(" ");
  }

  return [
    "select net.http_post(",
    `url := ${quoteLiteral(`https://xuzvqcpthqikyroqhypw.supabase.co/functions/v1/${job.function}`)},`,
    `headers := ${headers},`,
    `body := ${quoteLiteral(JSON.stringify(job.payload))}::jsonb,`,
    "timeout_milliseconds := 120000",
    ");",
  ].join(" ");
}

async function unscheduleJob(projectRef, jobname) {
  return execSqlSelect(
    projectRef,
    `select cron.unschedule(jobid) as unscheduled from cron.job where jobname = ${quoteLiteral(jobname)}`,
  );
}

async function scheduleJob(projectRef, job) {
  return execSqlSelect(
    projectRef,
    `select cron.schedule(${quoteLiteral(job.jobname)}, ${quoteLiteral(job.schedule)}, ${quoteLiteral(buildCommand(job))}) as jobid`,
  );
}

const args = parseArgs(process.argv.slice(2));
const projectRef = resolveProjectRef(args, { requireExplicit: true });
const apply = Boolean(args.apply);
const manifest = readManifest("cron-jobs.json");
if (!manifest) {
  throw new Error("Missing supabase/ops/cron-jobs.json manifest.");
}

const liveJobs = await execSqlSelect(
  projectRef,
  "select jobid, jobname, schedule, active, command from cron.job order by jobid",
);

const targetJobNames = new Set(manifest.jobs.map((job) => job.jobname));
const jobsToUnschedule = liveJobs
  .map((job) => job.jobname)
  .filter((jobname) => targetJobNames.has(jobname) || LEGACY_SCHEDULING_JOBS.includes(jobname));

if (!apply) {
  console.log(
    JSON.stringify(
      {
        projectRef,
        apply: false,
        unschedule: jobsToUnschedule,
        schedule: manifest.jobs.map((job) => ({ jobname: job.jobname, schedule: job.schedule })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

for (const jobname of jobsToUnschedule) {
  await unscheduleJob(projectRef, jobname);
}

for (const job of manifest.jobs) {
  await scheduleJob(projectRef, job);
}

console.log(
  JSON.stringify(
    {
      projectRef,
      unscheduledCount: jobsToUnschedule.length,
      scheduledCount: manifest.jobs.length,
    },
    null,
    2,
  ),
);
