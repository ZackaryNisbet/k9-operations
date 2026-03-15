// K9 Operations — Test Health Dashboard
// Displays vitest test results with plain-English descriptions for every test.

import React, { useState, useEffect, useMemo } from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";

export default function TestHealthPage() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSuite, setExpandedSuite] = useState(null);
  const [expandedTest, setExpandedTest] = useState(null);

  useEffect(() => {
    fetch("/test-results.json")
      .then(r => {
        if (!r.ok) throw new Error("Test results not found. Run npm run test:report to generate.");
        return r.json();
      })
      .then(data => { setResults(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const lastRun = useMemo(() => {
    if (!results?.timestamp) return null;
    const d = new Date(results.timestamp);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  }, [results?.timestamp]);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: C.textMut }}>
        <div style={{ fontSize: 14 }}>Loading test results...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ padding: 24, borderRadius: 12, background: C.danLt, border: `1px solid ${C.dan}`, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.dan, marginBottom: 8 }}>Could not load test results</div>
          <div style={{ fontSize: 13, color: C.textMut }}>{error}</div>
        </div>
      </div>
    );
  }

  const { summary, suites } = results;
  const allGreen = summary.failed === 0;
  const statusColor = allGreen ? C.suc : C.dan;
  const statusBg = allGreen ? C.sucLt : C.danLt;
  const statusLabel = allGreen ? "All Tests Passing" : `${summary.failed} Test${summary.failed !== 1 ? "s" : ""} Failing`;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <I.CheckCircle />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>Test Health</h1>
        </div>
        {lastRun && (
          <div style={{ fontSize: 12, color: C.textMut, marginLeft: 26 }}>Last run: {lastRun}</div>
        )}
      </div>

      {/* Overall Status Banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "18px 24px", borderRadius: 14,
        background: statusBg, border: `1.5px solid ${statusColor}`,
        marginBottom: 24,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: statusColor, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {allGreen
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: statusColor }}>{statusLabel}</div>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 2 }}>
            {summary.passed} passed · {summary.failed} failed · {summary.total} total · {summary.passRate}% pass rate
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 28 }}>
        <SummaryCard label="Total Tests" value={summary.total} color={C.info} bg={C.infoLt} />
        <SummaryCard label="Passed" value={summary.passed} color={C.suc} bg={C.sucLt} />
        <SummaryCard label="Failed" value={summary.failed} color={C.dan} bg={C.danLt} />
        <SummaryCard label="Pass Rate" value={`${summary.passRate}%`} color={allGreen ? C.suc : C.warn} bg={allGreen ? C.sucLt : C.warnLt} />
      </div>

      {/* Intro Text */}
      <div style={{
        padding: "14px 18px", borderRadius: 10,
        background: C.infoLt, border: `1px solid ${C.info}20`,
        marginBottom: 22, fontSize: 13, lineHeight: 1.55, color: C.textMut,
      }}>
        Each test below verifies a specific piece of math or logic in the system. Click any test to see a plain-English explanation of what it checks and why it matters.
      </div>

      {/* Per-file Breakdown */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.text }}>Test Suites</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {suites.map(suite => {
          const suiteGreen = suite.failed === 0;
          const isExpanded = expandedSuite === suite.file;

          // Group tests by their top-level ancestor (describe block)
          const groups = [];
          const groupMap = {};
          suite.tests.forEach(test => {
            const groupName = (test.ancestors && test.ancestors.length > 0) ? test.ancestors[0] : "General";
            if (!groupMap[groupName]) {
              groupMap[groupName] = { name: groupName, tests: [] };
              groups.push(groupMap[groupName]);
            }
            groupMap[groupName].tests.push(test);
          });

          return (
            <div key={suite.file} style={{
              border: `1px solid ${C.border}`, borderRadius: 12,
              background: C.surface, overflow: "hidden",
            }}>
              {/* Suite Header */}
              <button
                onClick={() => setExpandedSuite(isExpanded ? null : suite.file)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 18px", border: "none", background: "transparent",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
              >
                {/* Status Dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: suiteGreen ? C.suc : C.dan,
                }} />
                {/* File Name & friendly label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{friendlyFileName(suite.file)}</div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>
                    {suite.passed} passed{suite.failed > 0 ? ` · ${suite.failed} failed` : ""} · {suite.total} tests · {suite.duration.toFixed(0)}ms
                  </div>
                </div>
                {/* Pass Rate Pill */}
                <div style={{
                  padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: suiteGreen ? C.sucLt : C.danLt,
                  color: suiteGreen ? C.suc : C.dan,
                }}>
                  {suite.total > 0 ? Math.round((suite.passed / suite.total) * 100) : 0}%
                </div>
                {/* Chevron */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round"
                  style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Expanded Test List — grouped by describe block */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "4px 0 10px" }}>
                  {groups.map((group, gi) => (
                    <div key={gi}>
                      {/* Group Header */}
                      <div style={{
                        padding: "10px 18px 6px",
                        fontSize: 12, fontWeight: 700, color: C.textMut, textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        borderTop: gi > 0 ? `1px solid ${C.borderLight}` : "none",
                        marginTop: gi > 0 ? 4 : 0,
                      }}>
                        {group.name}
                      </div>

                      {group.tests.map((test, ti) => {
                        const testKey = `${suite.file}::${test.name}`;
                        const isTestExpanded = expandedTest === testKey;
                        return (
                          <div key={ti}>
                            <button
                              onClick={() => setExpandedTest(isTestExpanded ? null : testKey)}
                              style={{
                                display: "flex", alignItems: "flex-start", gap: 10, width: "100%",
                                padding: "8px 18px", border: "none", background: isTestExpanded ? `${C.info}08` : "transparent",
                                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={e => { if (!isTestExpanded) e.currentTarget.style.background = `${C.text}06`; }}
                              onMouseLeave={e => { if (!isTestExpanded) e.currentTarget.style.background = "transparent"; }}
                            >
                              {/* Status icon */}
                              <div style={{ marginTop: 1, flexShrink: 0 }}>
                                {test.status === "passed"
                                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  : test.status === "failed"
                                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.dan} strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>}
                              </div>
                              {/* Test title */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.35 }}>
                                  {test.title || test.name}
                                </div>
                              </div>
                              {/* Duration + expand indicator */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <div style={{ fontSize: 11, color: C.textMut }}>{test.duration.toFixed(1)}ms</div>
                                {test.description && (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round"
                                    style={{ transform: isTestExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                )}
                              </div>
                            </button>

                            {/* Description panel */}
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
    </div>
  );
}

function SummaryCard({ label, value, color, bg }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 12,
      background: bg, border: `1px solid ${color}20`,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginTop: 6 }}>{label}</div>
    </div>
  );
}

// Convert test file names to friendly labels
function friendlyFileName(file) {
  const map = {
    "nightCounting.test.js": "Night Counting & Time Math",
    "revenueCalculations.test.js": "Revenue Calculations",
    "occupancyRates.test.js": "Occupancy Rates & RevPAR",
    "dogCounting.test.js": "Dog Counting & Classification",
  };
  return map[file] || file;
}
