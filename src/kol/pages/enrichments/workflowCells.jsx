import React, { useState } from "react";

export function WorkflowTimingCell({ dog }) {
  const isCheckedOut = dog?.timing?.isCheckedOut;
  return (
    <div className="workflow-timing-cell">
      <span><strong>In</strong>{dog.arrivalLabel || "-"}</span>
      <span><strong>Out</strong>{dog.departureLabel || "-"}</span>
      {isCheckedOut ? <small>Checked out {dog.actualDepartureLabel || ""}</small> : null}
    </div>
  );
}

export function WorkflowReservationLine({ dog }) {
  if (!dog?.reservationLabel && !dog?.reservationWindow) return null;
  return (
    <div className="workflow-reservation-line">
      {dog.reservationLabel ? <span className={`workflow-reservation-kind ${dog.reservationCategory || "other"}`}>{dog.reservationLabel}</span> : null}
      {dog.reservationWindow ? <span className="workflow-reservation-window">{dog.reservationWindow}</span> : null}
    </div>
  );
}

export function WorkflowDogAvatar({ dog }) {
  const [failed, setFailed] = useState(false);
  const initial = (dog?.animalName || "?").trim().charAt(0).toUpperCase() || "?";
  if (dog?.imageUrl && !failed) {
    return (
      <img
        className="workflow-dog-avatar"
        src={dog.imageUrl}
        alt={dog.animalName}
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="workflow-dog-avatar fallback">{initial}</span>;
}

const WORKFLOW_PLAYGROUP_BADGE_META = {
  large: { label: "LG", title: "Large daycare", bg: "#DCFCE7", color: "#166534" },
  small: { label: "SM", title: "Small daycare", bg: "#DBEAFE", color: "#1D4ED8" },
  private_play: { label: "PP", title: "Private play", bg: "#FEE2E2", color: "#DC2626" },
  evaluation: { label: "EV", title: "Evaluation", bg: "#FEF9C3", color: "#CA8A04" },
};
const WORKFLOW_PLAYGROUP_LEGEND_ORDER = ["large", "small", "private_play", "evaluation"];

export function WorkflowPlaygroupBadges({ tags = [] }) {
  const visibleTags = Array.isArray(tags) ? tags.filter((tag) => WORKFLOW_PLAYGROUP_BADGE_META[tag]) : [];
  if (!visibleTags.length) return null;
  return (
    <span className="workflow-playgroup-badges" aria-label={visibleTags.map((tag) => WORKFLOW_PLAYGROUP_BADGE_META[tag].title).join(", ")}>
      {visibleTags.map((tag) => <WorkflowPlaygroupBadge key={tag} tag={tag} />)}
    </span>
  );
}

export function WorkflowPlaygroupLegend() {
  return (
    <div className="workflow-playgroup-legend" aria-label="Playgroup key">
      {WORKFLOW_PLAYGROUP_LEGEND_ORDER.map((tag) => {
        const badge = WORKFLOW_PLAYGROUP_BADGE_META[tag];
        return (
          <span key={tag} className="workflow-playgroup-legend-item" title={badge.title}>
            <WorkflowPlaygroupBadge tag={tag} />
            <span>{badge.title}</span>
          </span>
        );
      })}
    </div>
  );
}

export function WorkflowPlaygroupBadge({ tag }) {
  const badge = WORKFLOW_PLAYGROUP_BADGE_META[tag];
  if (!badge) return null;
  return (
    <span
      className="workflow-playgroup-badge"
      title={badge.title}
      style={{ background: badge.bg, color: badge.color }}
    >
      {badge.label}
    </span>
  );
}
