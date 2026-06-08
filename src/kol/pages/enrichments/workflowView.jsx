import React, { useMemo } from "react";
import { I } from "../../../shared/icons";
import {
  ENRICHMENT_WORKFLOW_FILTERS,
  ENRICHMENT_WORKFLOW_REFRESH_MS,
  ENRICHMENT_WORKFLOW_SORTS,
  applyEnrichmentWorkflowView,
  countEnrichmentWorkflowFilter,
  formatHealthAge,
} from "../../enrichments/enrichmentWorkflowData";
import { formatHealthDuration, getWorkflowExtraServiceDetail, healthTone } from "./formatters";
import { HealthFact } from "./formFields";
import {
  WorkflowDogAvatar,
  WorkflowPlaygroupBadges,
  WorkflowPlaygroupLegend,
  WorkflowReservationLine,
  WorkflowTimingCell,
} from "./workflowCells";

export function WorkflowHealthButton({ health, refreshState, onClick, compact = false }) {
  const tone = healthTone(health?.status);
  const progressPct = `${Math.round((refreshState?.progress || 0) * 100)}%`;
  return (
    <button
      type="button"
      className="workflow-health-btn"
      title="Open Enrichment health"
      onClick={onClick}
      style={{ borderColor: tone.color, color: tone.color, background: tone.bg }}
    >
      <span className="workflow-health-sweep" style={{ background: `linear-gradient(90deg, transparent, ${tone.color}22, transparent)`, animation: refreshState?.isRefreshing ? "enrichmentHealthSweep 1.1s ease-in-out infinite" : "none" }} />
      <span className="workflow-health-progressbar" style={{ width: progressPct, background: tone.color, opacity: refreshState?.isRefreshing ? 0.95 : 0.65 }} />
      <span className="workflow-health-dot" style={{ background: tone.color, boxShadow: `0 0 18px ${tone.color}99`, animation: refreshState?.isRefreshing ? "enrichmentHealthPulse .9s ease-in-out infinite" : "none" }} />
      <span className={compact ? "workflow-health-copy compact" : "workflow-health-copy"}>
        <span>{tone.label}</span>
        <small>{refreshState?.label || "Waiting"}</small>
      </span>
    </button>
  );
}

export function WorkflowView({ workflowState, filter, onFilterChange, sort, onSortChange }) {
  const { workflow, completions, loading, toggleDog } = workflowState;
  const visibleDogs = useMemo(
    () => applyEnrichmentWorkflowView(workflow.dogs, { filter, sort }),
    [workflow.dogs, filter, sort]
  );
  return (
    <section className="workflow-command workflow-command-tight">
      <div className="workflow-table-card">
        <div className="workflow-table-toolbar">
          <div>
            <span className="section-title">Dogs for This Date</span>
            <p>{visibleDogs.length} of {workflow.rowCount} rows shown. Default order is earliest scheduled departure first.</p>
          </div>
          <div className="workflow-table-controls">
            <div className="workflow-filter-pills" aria-label="Filter enrichment workflow dogs">
              {ENRICHMENT_WORKFLOW_FILTERS.map((option) => {
                const count = countEnrichmentWorkflowFilter(workflow.dogs, option.id);
                if (option.id !== "all" && count === 0) return null;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={filter === option.id ? "active" : ""}
                    onClick={() => onFilterChange(option.id)}
                  >
                    {option.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="workflow-sort-select">
              <span>Sort</span>
              <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
                {ENRICHMENT_WORKFLOW_SORTS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <WorkflowPlaygroupLegend />
          </div>
        </div>
        {renderWorkflowTable({ loading, workflow, visibleDogs, completions, toggleDog })}
      </div>
    </section>
  );
}

function renderWorkflowTable({ loading, workflow, visibleDogs, completions, toggleDog }) {
  if (loading && !workflow.rowCount) {
    return (
      <div className="workflow-loading">
        <div className="workflow-loading-orbit" />
        <span>Loading Enrichment workflow...</span>
      </div>
    );
  }
  if (workflow.rowCount === 0) {
    return (
      <div className="empty-state compact">
        <I.Sparkle />
        <h2>No scheduled enrichments</h2>
        <p>No Gingr Enrichment services are scheduled for this date.</p>
      </div>
    );
  }
  return (
    <div className="workflow-table-wrap">
      <table className="workflow-table">
        <thead>
          <tr>
            <th>Dog</th>
            <th>Room / Wing</th>
            <th>Timing</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {visibleDogs.map((dog) => {
            const completion = completions[dog.id];
            const serviceDetail = getWorkflowExtraServiceDetail(dog.services);
            return (
              <tr key={dog.id} className={completion ? "complete" : dog.status === "needs_review" ? "review" : ""}>
                <td>
                  <div className="workflow-dog-cell">
                    <WorkflowDogAvatar dog={dog} />
                    <div>
                      <div className="workflow-dog-name-line">
                        <strong>{dog.animalName}</strong>
                        <WorkflowPlaygroupBadges tags={dog.playgroupTags} />
                      </div>
                      <WorkflowReservationLine dog={dog} />
                      {serviceDetail ? <span className="workflow-service-line">{serviceDetail}</span> : null}
                      {dog.reason ? <small className="workflow-review-reason">{dog.reason}</small> : null}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="workflow-room-cell">
                    <strong>{dog.roomLabel || "-"}</strong>
                    <span>{dog.roomWing || "Unassigned"}</span>
                  </div>
                </td>
                <td>
                  <WorkflowTimingCell dog={dog} />
                </td>
                <td>{dog.ownerName}</td>
                <td><span className={`workflow-status ${dog.status}`}>{dog.status === "needs_review" ? "Needs review" : "Scheduled"}</span></td>
                <td>
                  <button
                    type="button"
                    className={completion ? "workflow-check complete" : "workflow-check"}
                    onClick={() => {
                      Promise.resolve(toggleDog(dog)).catch((err) => console.error("[enrichment workflow] completion save failed:", err));
                    }}
                  >
                    {completion ? <I.Check /> : null}
                  </button>
                  {completion ? <small>{completion.by || "Staff"} · {formatHealthAge(completion.at)}</small> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EnrichmentHealthModal({ workflowState, onClose }) {
  const { workflow, health, refreshState, lastSuccessAt, lastStartedAt, refreshing, auditLog, refresh } = workflowState;
  const tone = healthTone(health?.status);
  return (
    <div className="enrichment-health-modal" role="dialog" aria-modal="true" aria-label={`Enrichment Health: ${tone.label}`}>
      <div className="enrichment-health-shell">
        <div className="enrichment-health-head">
          <div>
            <h2>Enrichment Health: {tone.label}</h2>
            <p>Gingr Enrichment service-date pull, workflow counts, manual refresh history, and recent run evidence.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>x</button>
        </div>
        <div className="enrichment-health-body">
          <div className="enrichment-health-section">
            <div className="enrichment-health-section-title">
              <span style={{ background: tone.color, boxShadow: `0 0 14px ${tone.color}88` }} />
              <strong>Gingr Enrichment Pull</strong>
            </div>
            <div className="enrichment-health-fact-grid">
              <HealthFact label="Status" value={tone.label} color={tone.color} />
              <HealthFact label="Frequency" value={`Every ${Math.round(ENRICHMENT_WORKFLOW_REFRESH_MS / 1000)}s`} />
              <HealthFact label="Last Sync" value={formatHealthAge(lastSuccessAt)} />
              <HealthFact label="Next Sync" value={refreshState?.label || "Waiting"} />
              <HealthFact label="Scheduled" value={workflow.scheduledCount} />
              <HealthFact label="Needs Review" value={workflow.needsReviewCount} />
              <HealthFact label="Rows" value={workflow.rowCount} />
              <HealthFact label="Started" value={lastStartedAt ? formatHealthAge(lastStartedAt) : "None"} />
            </div>
            <button
              type="button"
              className="enrichment-health-refresh"
              disabled={refreshing}
              onClick={() => {
                Promise.resolve(refresh()).catch((err) => console.error("[enrichment workflow] modal refresh failed:", err));
              }}
            >
              <I.RefreshCw /> {refreshing ? "Refreshing..." : "Force Refresh Gingr Pull"}
            </button>
          </div>
          <div className="enrichment-health-section">
            <div className="enrichment-health-section-title">
              <span style={{ background: "#38BDF8", boxShadow: "0 0 14px rgba(56,189,248,.55)" }} />
              <strong>Recent Runs</strong>
            </div>
            <div className="enrichment-audit-list">
              {auditLog?.length ? auditLog.map((run) => (
                <div key={run.id} className="enrichment-audit-row">
                  <div>
                    <strong>{run.status === "error" ? "Error" : "Success"}</strong>
                    <span>{run.source || "refresh"} · {run.completedAt ? formatHealthAge(run.completedAt) : "running"}</span>
                    {run.error ? <small>{run.error}</small> : null}
                  </div>
                  <div className="enrichment-audit-metrics">
                    <HealthFact label="Scheduled" value={run.scheduledCount ?? "-"} />
                    <HealthFact label="Review" value={run.needsReviewCount ?? "-"} />
                    <HealthFact label="Rows" value={run.rowCount ?? "-"} />
                    <HealthFact label="Duration" value={formatHealthDuration(run.durationMs)} />
                  </div>
                </div>
              )) : <p>No refresh runs in this session yet. Force refresh to write the first audit entry.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
