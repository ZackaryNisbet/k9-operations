import React from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import {
  getGrassrootsActivityType,
  getGrassrootsAttachmentPreviewKind,
  formatGrassrootsAttachmentFileSize,
} from "../../grassrootsData";
import { fmtDate, fmtDateTime } from "./dateUtils";

export function activityActorName(activity) {
  return activity?.created_by_name || "Unknown user";
}

export function AttachmentButtons({ attachments = [], onPreview, previewingAttachmentId }) {
  if (!attachments.length) return null;
  return (
    <div className="grassroots-activity-attachments">
      {attachments.map((attachment) => (
        <button
          key={attachment.id || attachment.storage_path}
          type="button"
          className="grassroots-activity-attachment-button"
          onClick={() => onPreview?.(attachment)}
          disabled={previewingAttachmentId === attachment.id}
          title={attachment.file_name || "Attachment"}
        >
          {getGrassrootsAttachmentPreviewKind(attachment) === "image" ? <I.Image /> : <I.FileText />}
          <span>{attachment.file_name || "Attachment"}</span>
          {formatGrassrootsAttachmentFileSize(attachment.file_size_bytes) && (
            <em>{formatGrassrootsAttachmentFileSize(attachment.file_size_bytes)}</em>
          )}
        </button>
      ))}
    </div>
  );
}

export function ActivityList({ activities, categoryConfig, attachmentsByActivity = {}, onPreviewAttachment, previewingAttachmentId }) {
  const activityType = getGrassrootsActivityType(categoryConfig.id);
  const rows = [...(activities || [])]
    .filter((activity) => {
      const rowType = activity.activity_type || activityType;
      if (activityType === "development") {
        return ["development", "event_update", "note"].includes(rowType);
      }
      return rowType === activityType;
    })
    .sort((a, b) => String(b.created_at || b.activity_date || "").localeCompare(String(a.created_at || a.activity_date || "")));

  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: C.textMut }}>No logged {categoryConfig.id === "events" ? "comments" : categoryConfig.countLabel.toLowerCase()} yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((activity) => {
        const personSpokenWith = activity.metadata?.person_spoken_with || activity.metadata?.person_interacted_with || "";
        const materialsLeft = activity.metadata?.materials_left || "";
        const attachments = attachmentsByActivity[activity.id] || [];
        return (
          <div
            key={activity.id}
            style={{
              display: "grid",
              gridTemplateColumns: "112px minmax(0, 1fr) 190px",
              gap: 10,
              alignItems: "start",
              fontSize: 12,
            }}
          >
            <div style={{ display: "inline-flex", width: "fit-content", padding: "4px 8px", borderRadius: 8, background: C.priLt, color: C.pri, fontWeight: 900 }}>
              {categoryConfig.id === "events" ? "Comment" : activityType === "drop" ? "Drop" : "Development"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: 800, lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                {activity.notes || "No notes entered."}
              </div>
              <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 8, color: C.textMut, lineHeight: 1.35 }}>
                <span>{fmtDate(activity.activity_date)} · {activityActorName(activity)}</span>
                {personSpokenWith && <span>Spoke with {personSpokenWith}</span>}
                {materialsLeft && <span>Left {materialsLeft}</span>}
                {activity.next_contact_date && <span>Next: {fmtDate(activity.next_contact_date)}</span>}
              </div>
              <AttachmentButtons attachments={attachments} onPreview={onPreviewAttachment} previewingAttachmentId={previewingAttachmentId} />
            </div>
            <div style={{ color: C.textMut, fontWeight: 800, textAlign: "right" }}>
              {fmtDateTime(activity.created_at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
