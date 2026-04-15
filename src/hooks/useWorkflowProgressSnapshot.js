import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

export const SNAPSHOT_TO_TYPE_SUB = {
  bathing: "bathing",
  pamper: "pamper",
  enrichment: "svc",
  ice_cream: "ice_cream",
  rooms: "room_cleaning",
  play: "pp",
  "weekly-maintenance": "weekly_maintenance",
  belongings: "belongings",
  collars: "collars",
  "lodging-transfer": "lodging_transfer",
  "roll-call-opening": "roll_call_opening",
  "roll-call-closing": "roll_call_closing",
};

export const ROLE_WORKFLOW_TO_SNAPSHOT = {
  bathing: "bathing",
  pamper: "pamper",
  enrichment: "enrichment",
  ice_cream: "ice_cream",
  room_cleaning: "rooms",
  pp: "play",
  weekly_maintenance: "weekly-maintenance",
  belongings: "belongings",
  collars: "collars",
  lodging_transfer: "lodging-transfer",
  roll_call: "roll-call-closing",
  roll_call_opening: "roll-call-opening",
  roll_call_closing: "roll-call-closing",
};

export function formatWorkflowCountLabel(row) {
  return `${row?.completed || 0}/${row?.total || 0}`;
}

function nextDate(viewDate) {
  const date = new Date(`${viewDate}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function isRelevantSettingsKey(settingKey, viewDate, tomorrow) {
  if (!settingKey) return false;
  return (
    settingKey === `ops_bathing_${viewDate}` ||
    settingKey === `ops_pamper_${viewDate}` ||
    settingKey === `ops_svc_Enrichment_${viewDate}` ||
    settingKey === `ops_svc_Ice_Cream_${viewDate}` ||
    settingKey === `ops_lodging_transfer_completions_${viewDate}` ||
    settingKey === `ops_belongings_completions_${tomorrow}` ||
    settingKey === `ops_collars_completions_${tomorrow}`
  );
}

function isRelevantOpsRowId(rowId, viewDate, tomorrow) {
  if (!rowId) return false;
  return (
    rowId === `ops_bathing_${viewDate}` ||
    rowId === `ops_pamper_${viewDate}` ||
    rowId === `ops_svc_${viewDate}` ||
    rowId === `ops_room_cleaning_${viewDate}` ||
    rowId === `ops_pp_${viewDate}` ||
    rowId === `ops_weekly_maintenance_${viewDate}` ||
    rowId === `ops_lodging_transfer_${viewDate}` ||
    rowId === `ops_roll_call_opening_${viewDate}` ||
    rowId === `ops_roll_call_closing_${viewDate}` ||
    rowId === `ops_belongings_${tomorrow}` ||
    rowId === `ops_collars_${tomorrow}`
  );
}

export default function useWorkflowProgressSnapshot(locationId, viewDate) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadTimerRef = useRef(null);

  const load = useCallback(async () => {
    if (!locationId || !viewDate) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("workflow_progress_snapshot", {
      p_location_id: locationId,
      p_view_date: viewDate,
    });

    if (error) {
      console.error("[workflow_progress_snapshot] load failed:", error);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [locationId, viewDate]);

  const scheduleLoad = useCallback(() => {
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      loadTimerRef.current = null;
      load();
    }, 60);
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!locationId || !viewDate) return undefined;

    const tomorrow = nextDate(viewDate);
    const channel = supabase
      .channel(`workflow-progress-${locationId}-${viewDate}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lite_daily_ops",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const rowId = payload?.new?.id || payload?.old?.id;
          if (isRelevantOpsRowId(rowId, viewDate, tomorrow)) {
            scheduleLoad();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lite_settings",
          filter: `location_id=eq.${locationId}`,
        },
        (payload) => {
          const settingKey = payload?.new?.setting_key || payload?.old?.setting_key;
          if (isRelevantSettingsKey(settingKey, viewDate, tomorrow)) {
            scheduleLoad();
          }
        }
      )
      .subscribe();

    const poll = setInterval(() => {
      if (!document.hidden) scheduleLoad();
    }, 60000);

    const handleVisibility = () => {
      if (!document.hidden) scheduleLoad();
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [locationId, scheduleLoad, viewDate]);

  const rowMap = useMemo(
    () =>
      rows.reduce((acc, row) => {
        acc[row.workflow_id] = row;
        return acc;
      }, {}),
    [rows]
  );

  return { rows, rowMap, loading, refresh: load };
}
