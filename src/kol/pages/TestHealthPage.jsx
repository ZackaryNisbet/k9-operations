// K9 Operations — hidden health surface
// Keeps automated test health and platform/Supabase health in one admin page.

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthProvider";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";

const TABS = [
  { id: "tests", label: "Automated Tests" },
  { id: "platform", label: "Supabase Health" },
];

export default function TestHealthPage() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";

  const [activeTab, setActiveTab] = useState("tests");

  const [results, setResults] = useState(null);
  const [loadingTests, setLoadingTests] = useState(true);
  const [testsError, setTestsError] = useState(null);
  const [expandedSuite, setExpandedSuite] = useState(null);
  const [expandedTest, setExpandedTest] = useState(null);

  const [platformHealth, setPlatformHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [healthError, setHealthError] = useState(null);

  useEffect(() => {
    fetch("/test-results.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Test results not found. Run npm run test:report to generate.");
        }
        return response.json();
      })
      .then((data) => {
        setResults(data);
        setLoadingTests(false);
      })
      .catch((error) => {
        setTestsError(error.message);
        setLoadingTests(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingHealth(true);
    setHealthError(null);

    supabase.functions
      .invoke("ops-platform-health", { body: { location_id: locationId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        setPlatformHealth(data || null);
        setLoadingHealth(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setHealthError(error.message || "Failed to load platform health.");
        setLoadingHealth(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const lastRun = useMemo(() => formatTimestamp(results?.timestamp), [results?.timestamp]);

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <I.CheckCircle />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Test Health</h1>
        </div>
        <div style={{ fontSize: 12, color: C.textMut, marginLeft: 26 }}>
          Hidden admin surface for logic validation and Supabase freshness monitoring.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? C.info : C.border}`,
                background: active ? C.infoLt : C.surface,
                color: active ? C.info : C.text,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "tests" ? (
        <TestsPanel
          results={results}
          loading={loadingTests}
          error={testsError}
          lastRun={lastRun}
          expandedSuite={expandedSuite}
          expandedTest={expandedTest}
          setExpandedSuite={setExpandedSuite}
          setExpandedTest={setExpandedTest}
        />
      ) : (
        <PlatformPanel
          platformHealth={platformHealth}
          loading={loadingHealth}
          error={healthError}
        />
      )}
    </div>
  );
}

function TestsPanel({
  results,
  loading,
  error,
  lastRun,
  expandedSuite,
  expandedTest,
  setExpandedSuite,
  setExpandedTest,
}) {
  if (loading) {
    return <LoadingCard label="Loading test results..." />;
  }

  if (error) {
    return <ErrorCard title="Could not load test results" body={error} />;
  }

  const { summary, suites } = results;
  const allGreen = summary.failed === 0;
  const statusColor = allGreen ? C.suc : C.dan;
  const statusBg = allGreen ? C.sucLt : C.danLt;
  const statusLabel = allGreen
    ? "All Tests Passing"
    : `${summary.failed} Test${summary.failed !== 1 ? "s" : ""} Failing`;

  return (
    <>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 24px",
        borderRadius: 14,
        background: statusBg,
        border: `1.5px solid ${statusColor}`,
        marginBottom: 24,
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: statusColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {allGreen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: statusColor }}>{statusLabel}</div>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 2 }}>
            {summary.passed} passed · {summary.failed} failed · {summary.total} total · {summary.passRate}% pass rate
            {lastRun ? ` · Last run ${lastRun}` : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 28 }}>
        <SummaryCard label="Total Tests" value={summary.total} color={C.info} bg={C.infoLt} />
        <SummaryCard label="Passed" value={summary.passed} color={C.suc} bg={C.sucLt} />
        <SummaryCard label="Failed" value={summary.failed} color={C.dan} bg={C.danLt} />
        <SummaryCard label="Pass Rate" value={`${summary.passRate}%`} color={allGreen ? C.suc : C.warn} bg={allGreen ? C.sucLt : C.warnLt} />
      </div>

      <InfoCallout>
        Each test below verifies a specific piece of math or logic in the system. Click any test to see a plain-English explanation of what it checks and why it matters.
      </InfoCallout>

      <SectionTitle>Test Suites</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suites.map((suite) => {
          const suiteGreen = suite.failed === 0;
          const isExpanded = expandedSuite === suite.file;

          const groups = [];
          const groupMap = {};
          suite.tests.forEach((test) => {
            const groupName = test.ancestors && test.ancestors.length > 0 ? test.ancestors[0] : "General";
            if (!groupMap[groupName]) {
              groupMap[groupName] = { name: groupName, tests: [] };
              groups.push(groupMap[groupName]);
            }
            groupMap[groupName].tests.push(test);
          });

          return (
            <div key={suite.file} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, overflow: "hidden" }}>
              <button
                onClick={() => setExpandedSuite(isExpanded ? null : suite.file)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "14px 18px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: suiteGreen ? C.suc : C.dan,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{friendlyFileName(suite.file)}</div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>
                    {suite.passed} passed{suite.failed > 0 ? ` · ${suite.failed} failed` : ""} · {suite.total} tests · {suite.duration.toFixed(0)}ms
                  </div>
                </div>
                <div style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: suiteGreen ? C.sucLt : C.danLt,
                  color: suiteGreen ? C.suc : C.dan,
                }}>
                  {suite.total > 0 ? Math.round((suite.passed / suite.total) * 100) : 0}%
                </div>
                <Chevron expanded={isExpanded} />
              </button>

              {isExpanded && (
                <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "4px 0 10px" }}>
                  {groups.map((group, groupIndex) => (
                    <div key={group.name}>
                      <div style={{
                        padding: "10px 18px 6px",
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.textMut,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        borderTop: groupIndex > 0 ? `1px solid ${C.borderLight}` : "none",
                        marginTop: groupIndex > 0 ? 4 : 0,
                      }}>
                        {group.name}
                      </div>

                      {group.tests.map((test, testIndex) => {
                        const testKey = `${suite.file}::${test.name}`;
                        const isTestExpanded = expandedTest === testKey;
                        return (
                          <div key={`${testKey}_${testIndex}`}>
                            <button
                              onClick={() => setExpandedTest(isTestExpanded ? null : testKey)}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                                width: "100%",
                                padding: "8px 18px",
                                border: "none",
                                background: isTestExpanded ? `${C.info}08` : "transparent",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                textAlign: "left",
                              }}
                            >
                              <div style={{ marginTop: 1, flexShrink: 0 }}>
                                {test.status === "passed" ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="3" strokeLinecap="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                ) : test.status === "failed" ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.dan} strokeWidth="3" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="8" y1="12" x2="16" y2="12" />
                                  </svg>
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.35 }}>{test.title || test.name}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <div style={{ fontSize: 11, color: C.textMut }}>{test.duration.toFixed(1)}ms</div>
                                {test.description && <Chevron expanded={isTestExpanded} size={12} />}
                              </div>
                            </button>

                            {isTestExpanded && test.description && (
                              <div style={{
                                margin: "0 18px 6px 42px",
                                padding: "10px 14px",
                                borderRadius: 8,
                                background: C.infoLt,
                                border: `1px solid ${C.info}18`,
                                fontSize: 13,
                                lineHeight: 1.55,
                                color: C.text,
                              }}>
                                {test.description}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PlatformPanel({ platformHealth, loading, error }) {
  if (loading) {
    return <LoadingCard label="Loading platform health..." />;
  }

  if (error) {
    return <ErrorCard title="Could not load platform health" body={error} />;
  }

  if (!platformHealth) {
    return <ErrorCard title="No platform health payload" body="The health function returned an empty response." />;
  }

  const statusTone = {
    healthy: { color: C.suc, bg: C.sucLt, label: "Healthy" },
    warning: { color: C.warn, bg: C.warnLt, label: "Needs Attention" },
    critical: { color: C.dan, bg: C.danLt, label: "Critical" },
  }[platformHealth.overall_status || "warning"];

  const reservationsFreshness = platformHealth?.freshness?.reservations || {};
  const notesFreshness = platformHealth?.freshness?.gingr_notes_today || {};
  const reportHealth = platformHealth?.reports || {};
  const cronHealth = platformHealth?.cron_health || {};
  const bohCache = platformHealth?.boh_cache || {};
  const criticalCronCount = countByStatus(cronHealth.jobs, "critical");
  const warningCronCount = countByStatus(cronHealth.jobs, "warning");

  return (
    <>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 24px",
        borderRadius: 14,
        background: statusTone.bg,
        border: `1.5px solid ${statusTone.color}`,
        marginBottom: 24,
      }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: statusTone.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 800,
          fontSize: 18,
        }}>
          {platformHealth.alerts?.length || 0}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: statusTone.color }}>
            Supabase Health: {statusTone.label}
          </div>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 2 }}>
            Location {platformHealth.location_id} · Generated {formatTimestamp(platformHealth.generated_at)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
        <SummaryCard
          label="Reservation Freshness"
          value={formatAge(reservationsFreshness.age_minutes)}
          color={toneForHealth(reservationsFreshness.freshness_status).color}
          bg={toneForHealth(reservationsFreshness.freshness_status).bg}
        />
        <SummaryCard
          label="Today's Notes Freshness"
          value={formatAge(notesFreshness.age_minutes)}
          color={toneForHealth(notesFreshness.freshness_status).color}
          bg={toneForHealth(notesFreshness.freshness_status).bg}
        />
        <SummaryCard
          label="Report Freshness"
          value={(reportHealth.status || "unknown").toUpperCase()}
          color={toneForHealth(reportHealth.status).color}
          bg={toneForHealth(reportHealth.status).bg}
        />
        <SummaryCard
          label="Scheduled Jobs"
          value={criticalCronCount ? `${criticalCronCount} Critical` : warningCronCount ? `${warningCronCount} Warning` : "OK"}
          color={criticalCronCount ? C.dan : warningCronCount ? C.warn : C.suc}
          bg={criticalCronCount ? C.danLt : warningCronCount ? C.warnLt : C.sucLt}
        />
        <SummaryCard
          label="Supabase Status Page"
          value={(platformHealth.supabase_status?.indicator || "unknown").toUpperCase()}
          color={toneForHealth(platformHealth.supabase_status?.indicator === "none" ? "healthy" : "warning").color}
          bg={toneForHealth(platformHealth.supabase_status?.indicator === "none" ? "healthy" : "warning").bg}
        />
        <SummaryCard
          label="PITR"
          value="Manual"
          color={C.info}
          bg={C.infoLt}
        />
      </div>

      <InfoCallout>
        {platformHealth.pitr?.note}
      </InfoCallout>

      <SectionTitle>Freshness</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        {Object.entries(platformHealth.freshness || {}).map(([key, value]) => (
          <MetricCard
            key={key}
            title={humanizeKey(key)}
            tone={toneForHealth(value?.freshness_status)}
            lines={[
              value?.count != null ? `${value.count.toLocaleString("en-US")} records` : null,
              value?.latest_type_sub ? `Latest type: ${value.latest_type_sub}` : null,
              value?.updated_at ? `Updated ${formatTimestamp(value.updated_at)}` : null,
              value?.age_minutes != null ? `Age ${formatAge(value.age_minutes)}` : null,
            ].filter(Boolean)}
          />
        ))}
      </div>

      <SectionTitle>Critical Reports</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        {(reportHealth.reports || []).map((report) => (
          <MetricCard
            key={report.id}
            title={report.label}
            tone={toneForHealth(report.status)}
            lines={[
              `Status: ${report.status}`,
              report.total != null ? `${report.total.toLocaleString("en-US")} items` : "No item count available",
              report.computed_at ? `Computed ${formatTimestamp(report.computed_at)}` : null,
              report.updated_at ? `Updated ${formatTimestamp(report.updated_at)}` : null,
              report.age_minutes != null ? `Age ${formatAge(report.age_minutes)}` : "No refresh timestamp",
            ].filter(Boolean)}
          />
        ))}
      </div>

      <SectionTitle>Scheduled Jobs</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 24 }}>
        {(cronHealth.jobs || []).map((job) => (
          <MetricCard
            key={job.jobname}
            title={job.label}
            tone={toneForHealth(job.status)}
            lines={[
              `Status: ${job.status}`,
              job.message,
              job.last_success_at ? `Last success ${formatTimestamp(job.last_success_at)}` : "No recent success",
              job.status !== "healthy" && job.last_failure_at ? `Last failure ${formatTimestamp(job.last_failure_at)}` : null,
              job.status !== "healthy" && job.last_failure_status_code ? `Failure status ${job.last_failure_status_code}` : null,
              job.status !== "healthy" && job.recent_failure_count ? `${job.recent_failure_count} failures in window` : null,
            ].filter(Boolean)}
          />
        ))}
        {cronHealth.error ? (
          <MetricCard
            title="Cron Health Check"
            tone={toneForHealth("warning")}
            lines={[cronHealth.error]}
          />
        ) : null}
      </div>

      <SectionTitle>BOH Cache</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MetricCard
          title="Back-of-House Cache"
          tone={toneForHealth(bohCache.freshness_status)}
          lines={[
            `${(bohCache.rows || 0).toLocaleString("en-US")} rows`,
            bohCache.latest_synced_at ? `Latest sync ${formatTimestamp(bohCache.latest_synced_at)}` : "No sync rows currently cached",
            bohCache.age_minutes != null ? `Age ${formatAge(bohCache.age_minutes)}` : null,
          ].filter(Boolean)}
        />
      </div>

      <SectionTitle>Sync State</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        {(platformHealth.sync_state || []).map((row) => (
          <MetricCard
            key={row.entity_type}
            title={humanizeKey(row.entity_type)}
            tone={toneForHealth(row.freshness_status)}
            lines={[
              `Status: ${row.status}`,
              `${(row.records_synced || 0).toLocaleString("en-US")} records synced`,
              row.last_sync_at ? `Last sync ${formatTimestamp(row.last_sync_at)}` : "No sync timestamp recorded",
              row.sync_duration_ms != null ? `Duration ${row.sync_duration_ms}ms` : null,
              row.error_message || null,
            ].filter(Boolean)}
          />
        ))}
      </div>

      <SectionTitle>Alerts</SectionTitle>
      {platformHealth.alerts?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {platformHealth.alerts.map((alert, index) => {
            const tone = toneForHealth(alert.severity === "critical" ? "critical" : "warning");
            return (
              <div key={`${alert.message}_${index}`} style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: tone.bg,
                border: `1px solid ${tone.color}25`,
                color: C.text,
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                <span style={{ color: tone.color, fontWeight: 700, marginRight: 8 }}>
                  {alert.severity.toUpperCase()}
                </span>
                {alert.message}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: C.sucLt,
          border: `1px solid ${C.suc}20`,
          color: C.text,
          fontSize: 13,
        }}>
          No active health alerts. Sync freshness and Supabase public status both look clean.
        </div>
      )}
    </>
  );
}

function LoadingCard({ label }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 14 }}>{label}</div>
    </div>
  );
}

function ErrorCard({ title, body }) {
  return (
    <div style={{ padding: 32 }}>
      <div style={{
        padding: 24,
        borderRadius: 12,
        background: C.danLt,
        border: `1px solid ${C.dan}`,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.dan, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.textMut }}>{body}</div>
      </div>
    </div>
  );
}

function InfoCallout({ children }) {
  return (
    <div style={{
      padding: "14px 18px",
      borderRadius: 10,
      background: C.infoLt,
      border: `1px solid ${C.info}20`,
      marginBottom: 22,
      fontSize: 13,
      lineHeight: 1.55,
      color: C.textMut,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.text }}>{children}</h2>
  );
}

function MetricCard({ title, lines, tone }) {
  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: 12,
      border: `1px solid ${tone.color}20`,
      background: tone.bg,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: tone.color, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {lines.map((line, index) => (
          <div key={`${title}_${index}`} style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bg }) {
  return (
    <div style={{
      padding: "16px 18px",
      borderRadius: 12,
      background: bg,
      border: `1px solid ${color}20`,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Chevron({ expanded, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={C.textMut}
      strokeWidth="2"
      strokeLinecap="round"
      style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function toneForHealth(status) {
  switch (status) {
    case "healthy":
      return { color: C.suc, bg: C.sucLt };
    case "critical":
      return { color: C.dan, bg: C.danLt };
    case "warning":
    default:
      return { color: C.warn, bg: C.warnLt };
  }
}

function countByStatus(rows, status) {
  return (rows || []).filter((row) => row.status === status).length;
}

function humanizeKey(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatAge(minutes) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function friendlyFileName(file) {
  const map = {
    "nightCounting.test.js": "Night Counting & Time Math",
    "revenueCalculations.test.js": "Revenue Calculations",
    "occupancyRates.test.js": "Occupancy Rates & RevPAR",
    "dogCounting.test.js": "Dog Counting & Classification",
  };
  return map[file] || file;
}
