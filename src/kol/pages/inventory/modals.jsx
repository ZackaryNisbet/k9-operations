// Inventory count workflow modals (submit / reopen / schedule) extracted from
// InventoryPage.jsx.

import React, { useState } from "react";
import { C } from "../../../shared/theme";
import { Btn, Modal, Inp, CustomSelect } from "../../../shared/ui";

export function SubmitModal({ onClose, onConfirm, saving }) {
  return (
    <Modal title="Complete Inventory Count" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 16, borderRadius: 12, background: C.sucLt, border: `1px solid ${C.suc}30` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.suc, marginBottom: 6 }}>
            Mark this count as completed?
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
            Once submitted, this inventory count will be locked for editing. All counts will be saved and this cycle's snapshot will be marked complete.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="success" onClick={onConfirm} disabled={saving}>
            {saving ? "Submitting..." : "Submit Count"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export function ReopenModal({ onClose, onConfirm, saving }) {
  const [reason, setReason] = useState("");
  const [showError, setShowError] = useState(false);

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setShowError(true);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Modal title="Mark Inventory Incomplete" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 16, borderRadius: 12, background: C.warnLt, border: `1px solid ${C.warn}30` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.warn, marginBottom: 6 }}>
            Reopen this completed count?
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
            This will unlock the cycle for editing and write an audit trail showing who reopened it and why.
          </div>
        </div>

        <div>
          <Inp
            label="Reason"
            type="textarea"
            value={reason}
            onChange={(value) => {
              setReason(value);
              if (showError && value.trim()) setShowError(false);
            }}
            placeholder="Explain what still needs to be fixed or counted..."
            rows={3}
          />
          {showError && (
            <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>
              A reason is required to reopen a completed inventory count.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="danger" onClick={handleConfirm} disabled={saving}>
            {saving ? "Reopening..." : "Mark Incomplete"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export function InventoryScheduleModal({ draft, onChange, onClose, onConfirm, saving }) {
  const cadenceOptions = [
    { value: "7", label: "Every week" },
    { value: "14", label: "Every 2 weeks" },
    { value: "28", label: "Every 4 weeks" },
  ];
  const weekdayOptions = [
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
  ];

  return (
    <Modal title="Inventory Schedule" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 14, borderRadius: 12, background: C.bg, border: `1px solid ${C.borderLight}`, fontSize: 13, color: C.textSec, lineHeight: 1.55 }}>
          Control the resort-level cadence, due day, and due time here. Enterprise overrides can layer on later without changing the local data shape.
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Cadence</div>
            <CustomSelect value={String(draft.cadenceDays)} onChange={(value) => onChange({ ...draft, cadenceDays: Number(value) })} options={cadenceOptions} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Due Day</div>
            <CustomSelect value={String(draft.dueWeekday)} onChange={(value) => onChange({ ...draft, dueWeekday: Number(value) })} options={weekdayOptions} />
          </div>
          <Inp
            label="Due Time"
            type="time"
            value={draft.dueTime || "09:00"}
            onChange={(value) => onChange({ ...draft, dueTime: value || "09:00" })}
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={onConfirm} disabled={saving}>{saving ? "Saving..." : "Save Schedule"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
