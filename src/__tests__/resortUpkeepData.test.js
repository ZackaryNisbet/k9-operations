import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };

  return {
    rpc: vi.fn(),
    from: vi.fn(),
    storage: { from: storageFrom },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    __upload: upload,
    __createSignedUrl: createSignedUrl,
    __channel: channel,
  };
});

vi.mock("../supabaseClient", () => ({ supabase: supabaseMock }));

import {
  RESORT_UPKEEP_ATTACHMENT_BUCKET,
  buildUpkeepDueItems,
  createResortUpkeepSignedUrl,
  loadMaintenanceTemplates,
  loadResortUpkeepDashboard,
  normalizeDashboard,
  recordResortUpkeepAttachment,
  saveMaintenanceItemState,
  subscribeToResortUpkeep,
  uploadResortUpkeepAttachment,
} from "../kol/resortUpkeepData.js";

describe("resortUpkeepData", () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset();
    supabaseMock.from.mockReset();
    supabaseMock.storage.from.mockClear();
    supabaseMock.channel.mockClear();
    supabaseMock.removeChannel.mockClear();
    supabaseMock.__upload.mockReset();
    supabaseMock.__createSignedUrl.mockReset();
    supabaseMock.__channel.on.mockClear();
    supabaseMock.__channel.subscribe.mockClear();
  });

  it("uses server-provided maintenance summary instead of deriving counts from returned periods", () => {
    const dashboard = normalizeDashboard({
      maintenance_summary: {
        active: 7,
        overdue: 0,
        ready_to_submit: 2,
        submitted: 3,
        open: 4,
      },
      maintenance: [
        { id: "period-a", computed_status: "overdue" },
        { id: "period-b", computed_status: "overdue" },
      ],
    });

    expect(dashboard.maintenance).toHaveLength(2);
    expect(dashboard.maintenanceSummary).toEqual({
      active: 7,
      overdue: 0,
      ready_to_submit: 2,
      submitted: 3,
      open: 4,
    });
  });

  it("defaults dashboard aggregates only when the server omits them", () => {
    expect(normalizeDashboard(null)).toMatchObject({
      maintenance: [],
      maintenanceSummary: {
        active: 0,
        overdue: 0,
        ready_to_submit: 0,
        submitted: 0,
        open: 0,
      },
      vendors: { active: 0, archived: 0 },
      licenses: { active: 0, non_compliant: 0, expiring_soon: 0 },
      troubleshooting: [],
    });
  });

  it("loads the dashboard through the canonical server RPC and only normalizes the response shape", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({
      data: {
        maintenance_summary: { active: 4, overdue: 1, ready_to_submit: 2, submitted: 3, open: 1 },
        maintenance: [{ id: "period-1" }],
        troubleshooting: [{ id: "article-1" }],
      },
      error: null,
    });

    const dashboard = await loadResortUpkeepDashboard("loc-1");

    expect(supabaseMock.rpc).toHaveBeenCalledWith("resort_upkeep_get_dashboard", { p_location_id: "loc-1" });
    expect(dashboard.maintenanceSummary).toEqual({ active: 4, overdue: 1, ready_to_submit: 2, submitted: 3, open: 1 });
    expect(dashboard.maintenance).toEqual([{ id: "period-1" }]);
    expect(dashboard.troubleshooting).toEqual([{ id: "article-1" }]);
  });

  it("loads effective maintenance templates through the canonical server RPC", async () => {
    const source = readFileSync(new URL("../kol/resortUpkeepData.js", import.meta.url), "utf8");
    supabaseMock.rpc.mockResolvedValueOnce({
      data: [
        {
          id: "local-monthly",
          slug: "building-maintenance-monthly",
          location_id: "loc-1",
          latest_version: { id: "version-1", version_number: 3 },
        },
      ],
      error: null,
    });

    await expect(loadMaintenanceTemplates("loc-1")).resolves.toEqual([
      {
        id: "local-monthly",
        slug: "building-maintenance-monthly",
        location_id: "loc-1",
        latest_version: { id: "version-1", version_number: 3 },
      },
    ]);

    expect(supabaseMock.rpc).toHaveBeenCalledWith("resort_upkeep_list_maintenance_templates", { p_location_id: "loc-1" });
    expect(source).toContain('"resort_upkeep_list_maintenance_templates"');
    expect(source).not.toContain('.from("resort_upkeep_templates")');
    expect(source).not.toContain('.from("resort_upkeep_template_versions")');
  });

  it("saves maintenance item state through the canonical write RPC", async () => {
    supabaseMock.rpc.mockResolvedValueOnce({ data: { itemState: { id: "state-1" } }, error: null });

    await expect(saveMaintenanceItemState({
      periodId: "period-1",
      itemKey: "hvac-filter",
      checked: true,
      notes: "Clean",
      actorName: "Zack",
    })).resolves.toEqual({ itemState: { id: "state-1" } });

    expect(supabaseMock.rpc).toHaveBeenCalledWith("resort_upkeep_save_item_state", {
      p_period_id: "period-1",
      p_item_key: "hvac-filter",
      p_checked: true,
      p_notes: "Clean",
      p_actor_name: "Zack",
    });
  });

  it("records attachment metadata through the canonical RPC with one explicit parent shape", async () => {
    const file = { name: "panel photo.png", type: "image/png", size: 1234 };
    supabaseMock.rpc.mockResolvedValueOnce({ data: { id: "attachment-1" }, error: null });

    await recordResortUpkeepAttachment({
      locationId: "loc-1",
      attachmentScope: "maintenance_item_photo",
      periodId: "period-1",
      itemStateId: "state-1",
      file,
      storagePath: "loc-1/maintenance/period-1/state-1/file.png",
      actorName: "Zack",
    });

    expect(supabaseMock.rpc).toHaveBeenCalledWith("resort_upkeep_record_attachment", {
      p_attachment: {
        location_id: "loc-1",
        attachment_scope: "maintenance_item_photo",
        period_id: "period-1",
        item_state_id: "state-1",
        vendor_id: null,
        license_id: null,
        file_name: "panel photo.png",
        storage_bucket: RESORT_UPKEEP_ATTACHMENT_BUCKET,
        storage_path: "loc-1/maintenance/period-1/state-1/file.png",
        mime_type: "image/png",
        file_size_bytes: 1234,
        uploaded_by_name: "Zack",
      },
      p_actor_name: "Zack",
    });
  });

  it("uploads attachments into the private location-scoped Resort Upkeep bucket", async () => {
    const file = { name: "bad chars ! panel photo.png", type: "image/png" };
    supabaseMock.__upload.mockResolvedValueOnce({ error: null });

    const uploaded = await uploadResortUpkeepAttachment({
      locationId: "loc-1",
      file,
      pathParts: ["maintenance", "period-1", "state-1"],
    });

    expect(supabaseMock.storage.from).toHaveBeenCalledWith(RESORT_UPKEEP_ATTACHMENT_BUCKET);
    expect(uploaded.path).toMatch(/^loc-1\/maintenance\/period-1\/state-1\/.+-bad-chars-panel-photo\.png$/);
    expect(supabaseMock.__upload).toHaveBeenCalledWith(uploaded.path, file, {
      cacheControl: "3600",
      contentType: "image/png",
      upsert: false,
    });
  });

  it("creates signed URLs from stored attachment metadata without exposing the bucket publicly", async () => {
    supabaseMock.__createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "https://signed.example/file" }, error: null });

    await expect(createResortUpkeepSignedUrl({
      storage_bucket: RESORT_UPKEEP_ATTACHMENT_BUCKET,
      storage_path: "loc-1/vendors/vendor-1/contracts/file.pdf",
    })).resolves.toBe("https://signed.example/file");

    expect(supabaseMock.storage.from).toHaveBeenCalledWith(RESORT_UPKEEP_ATTACHMENT_BUCKET);
    expect(supabaseMock.__createSignedUrl).toHaveBeenCalledWith("loc-1/vendors/vendor-1/contracts/file.pdf", 300);
  });

  it("subscribes web Resort Upkeep screens to canonical realtime tables", () => {
    const unsubscribe = subscribeToResortUpkeep("loc-1", () => {});

    expect(supabaseMock.channel).toHaveBeenCalledWith("resort-upkeep-web-loc-1");
    expect(supabaseMock.__channel.on.mock.calls).toEqual(expect.arrayContaining([
      ["postgres_changes", { event: "*", schema: "public", table: "resort_upkeep_periods", filter: "location_id=eq.loc-1" }, expect.any(Function)],
      ["postgres_changes", { event: "*", schema: "public", table: "resort_upkeep_item_states", filter: "location_id=eq.loc-1" }, expect.any(Function)],
      ["postgres_changes", { event: "*", schema: "public", table: "resort_upkeep_attachments", filter: "location_id=eq.loc-1" }, expect.any(Function)],
      ["postgres_changes", { event: "*", schema: "public", table: "resort_upkeep_template_versions" }, expect.any(Function)],
      ["postgres_changes", { event: "*", schema: "public", table: "resort_upkeep_troubleshooting_articles" }, expect.any(Function)],
    ]));
    expect(supabaseMock.__channel.subscribe).toHaveBeenCalled();

    unsubscribe();
    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(supabaseMock.__channel);
  });

  it("asks before submitting and locking a completed maintenance checklist", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("window.confirm");
    expect(source).toContain("Submit this checklist?");
    expect(source).toContain("This checklist is complete. Submit it now?");
    expect(source).toContain('computedStatus !== "ready_to_submit"');
    expect(source).toContain("canComplete={canComplete}");
    expect(source).toContain("function MaintenancePanel({ locationId, actor, dashboard, canComplete, canManage, onRefresh, toast })");
    expect(source).toContain("if (!confirmed) return;");
    expect(source).toContain("submitMaintenancePeriod(period.id, actor)");
  });

  it("autosaves web maintenance item progress and refreshes from realtime snapshots", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");
    const dataSource = readFileSync(new URL("../kol/resortUpkeepData.js", import.meta.url), "utf8");

    expect(source).toContain("skipNextAutosave");
    expect(source).toContain("const [checked, setChecked] = useState(Boolean(item.state?.checked));");
    expect(source).toContain("const [notes, setNotes] = useState(item.state?.notes || \"\");");
    expect(source).toContain("window.setTimeout(async () =>");
    expect(source).toContain("Autosaves");
    expect(source).toContain("saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked, notes, actorName: actor })");
    expect(source).toContain("localValueRef.current");
    expect(source).toContain("serverValueRef.current");
    expect(source).toContain("const hasUnsavedLocalValue =");
    expect(dataSource).toContain("canEdit: data?.canEdit ?? data?.can_edit ?? false");
    expect(source).toContain("const serverAllowsEdit = snapshot?.canEdit ?? period?.can_edit ?? false;");
  });

  it("keeps the last loaded web dashboard visible if a realtime refresh fails", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");
    const catchStart = source.indexOf("console.warn(\"Failed to load Resort Upkeep\", nextError);");
    const catchEnd = source.indexOf("} finally {", catchStart);
    const catchBlock = source.slice(catchStart, catchEnd);

    expect(catchStart).toBeGreaterThan(-1);
    expect(catchBlock).not.toContain("setDashboard(EMPTY_DASHBOARD)");
    expect(catchBlock).toContain("if (isInitialLocationLoad)");
    expect(catchBlock).toContain("setError(friendlyErrorMessage(nextError, \"Resort Upkeep could not be loaded.\"));");
  });

  it("does not blank dashboard metrics during resort upkeep realtime refreshes", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("const loadedLocationRef = useRef(\"\");");
    expect(source).toContain("const isInitialLocationLoad = loadedLocationRef.current !== locationId;");
    expect(source).toContain("if (isInitialLocationLoad) {\n      setLoading(true);");
    expect(source).toContain("loadedLocationRef.current = locationId;");
    expect(source).not.toContain("loadSeq.current = seq;\n    setLoading(true);");
  });

  it("does not show raw background fetch failures after resort upkeep has loaded", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("if (isInitialLocationLoad) {\n      setLoading(true);\n      setError(\"\");\n    }");
    expect(source).toContain("loadedLocationRef.current = locationId;\n      setError(\"\");");
    expect(source).toContain("if (isInitialLocationLoad) {\n        setError(friendlyErrorMessage(nextError, \"Resort Upkeep could not be loaded.\"));\n      }");
    expect(source).toContain("Resort Upkeep dashboard took too long to load.");
    expect(source).not.toContain('setError(friendlyErrorMessage(nextError, "Resort Upkeep could not be loaded."));\n    } finally');
  });

  it("keeps resort upkeep tab loaders from triggering Recovery Mode", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("friendlyErrorMessage");
    expect(source).toContain("withUpkeepTimeout");
    expect(source).toContain("loadVendors(locationId, includeArchived)");
    expect(source).toContain("Local vendors took too long to load.");
    expect(source).toContain("setError(friendlyErrorMessage(nextError, \"Local vendors could not be loaded.\"));");
    expect(source).toContain("return subscribeToResortUpkeep(locationId, () => load({ silent: true }));");
    expect(source).toContain("loadLicenses(locationId, includeInactive)");
    expect(source).toContain("Licenses took too long to load.");
    expect(source).toContain("setError(friendlyErrorMessage(nextError, \"Licenses could not be loaded.\"));");
    expect(source).toContain("Checklist details took too long to load.");
    expect(source).toContain("Vendor detail load failed");
    expect(source).toContain("License detail load failed");
    expect(source).not.toContain("loadVendors(locationId, includeArchived).then(setVendors)");
    expect(source).not.toContain("loadLicenses(locationId, includeInactive).then(setLicenses)");
    expect(source).not.toContain("useEffect(() => { if (draft.id) loadVendorLogs");
    expect(source).not.toContain("useEffect(() => { if (draft.id) loadLicenseLogs");
  });

  it("adds a polished operational shell around Resort Upkeep web tabs", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("Admin Workspace");
    expect(source).toContain("Live Supabase");
    expect(source).toContain("tabRail");
    expect(source).toContain("Checklist command center");
    expect(source).toContain("Track contractors, service partners, contract proof, and development notes.");
    expect(source).toContain("Keep permits, compliance requirements, proof files, and renewal timing in one view.");
    expect(source).toContain("Search the facilities reference without leaving the upkeep workflow.");
    expect(source).toContain("LoadingRows");
  });

  it("creates the item state before uploading the first web maintenance attachment", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("const saved = await saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked, notes, actorName: actor });");
    expect(source).toContain("const itemStateId = saved?.itemState?.id || item.state?.id;");
    expect(source).toContain('pathParts: ["maintenance", period.id, itemStateId]');
    expect(source).toContain("itemStateId,");
  });

  it("keeps web vendor and license writes behind manager controls and required fields", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("disabled={!canManage}");
    expect(source).toContain("Only managers can save vendors.");
    expect(source).toContain("Only managers can archive vendors.");
    expect(source).toContain("Business name is required.");
    expect(source).toContain("Upload the contract before marking this vendor contract on file.");
    expect(source).toContain("needsContractBeforeFlag ? { ...nextVendor, has_contract: false } : nextVendor");
    expect(source).toContain("finalSaved = await saveVendor({ ...nextVendor, id: saved.id, location_id: saved.location_id, has_contract: true }, actor);");
    expect(source).toContain("Only managers can save licenses.");
    expect(source).toContain("Only managers can deactivate licenses.");
    expect(source).toContain("Requirement name is required.");
    expect(source).toContain("Upload proof of compliance before marking this license compliant.");
    expect(source).toContain('attachment.attachment_scope === "license_evidence" && !attachment.deleted_at');
    expect(source).toContain('needsEvidenceBeforeCompliance ? { ...nextLicense, status: "non_compliant" } : nextLicense');
    expect(source).toContain('finalSaved = await saveLicense({ ...nextLicense, id: saved.id, location_id: saved.location_id, status: "compliant" }, actor);');
    expect(source).toContain("canManage={canManage}");
  });

  it("keeps template edits from reusing item keys by line position", () => {
    const source = readFileSync(new URL("../kol/pages/ResortUpkeepPage.jsx", import.meta.url), "utf8");

    expect(source).toContain("normalizeTemplateLabel");
    expect(source).toContain("previousByLabel");
    expect(source).toContain("buildTemplateItemKey");
    expect(source).toContain("while (usedKeys.has(candidate))");
    expect(source).not.toContain("previousItems[index]?.key");
  });

  it("keeps checklist lifecycle and realtime wiring server-owned in the migration layer", () => {
    const adminSql = readFileSync(new URL("../../supabase/migrations/20260516151412_resort_upkeep_admin.sql", import.meta.url), "utf8");
    const hardenedSql = readFileSync(new URL("../../supabase/migrations/20260516154646_resort_upkeep_period_history.sql", import.meta.url), "utf8");
    const editLockSql = readFileSync(new URL("../../supabase/migrations/20260516165413_resort_upkeep_history_backfill_and_edit_lock.sql", import.meta.url), "utf8");
    const policyAlignmentSql = readFileSync(new URL("../../supabase/migrations/20260516181926_resort_upkeep_policy_permission_alignment.sql", import.meta.url), "utf8");
    const storagePolicySql = readFileSync(new URL("../../supabase/migrations/20260516183029_resort_upkeep_storage_policy_alignment.sql", import.meta.url), "utf8");
    const vendorLicenseRpcSql = readFileSync(new URL("../../supabase/migrations/20260516194042_resort_upkeep_vendor_license_rpc_writes.sql", import.meta.url), "utf8");
    const ensureReadFixSql = readFileSync(new URL("../../supabase/migrations/20260516220700_resort_upkeep_ensure_period_read_side_effect_fix.sql", import.meta.url), "utf8");
    const templateListSql = readFileSync(new URL("../../supabase/migrations/20260516223352_resort_upkeep_template_list_rpc.sql", import.meta.url), "utf8");
    const serverSql = `${adminSql}\n${hardenedSql}\n${editLockSql}\n${policyAlignmentSql}\n${storagePolicySql}\n${vendorLicenseRpcSql}\n${ensureReadFixSql}\n${templateListSql}`;

    expect(adminSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_period_bounds");
    expect(adminSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_computed_status");
    expect(serverSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_get_dashboard");
    expect(serverSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_list_maintenance_templates");
    expect(templateListSql).toContain("row_number() OVER");
    expect(templateListSql).toContain("latest_version");
    expect(templateListSql).toContain("REVOKE ALL ON FUNCTION public.resort_upkeep_list_maintenance_templates(uuid) FROM PUBLIC");
    expect(templateListSql).toContain("GRANT EXECUTE ON FUNCTION public.resort_upkeep_list_maintenance_templates(uuid) TO authenticated");
    expect(serverSql).toContain("current_setting('app.resort_upkeep_rpc_write', true) = 'on'");
    expect(serverSql).toContain("public.resort_upkeep_can_manage(location_id)");
    expect(hardenedSql).toContain("items_snapshot = p_items");
    expect(hardenedSql).toContain("AND first_submitted_at IS NULL");
    expect(serverSql).toContain("CASE");
    expect(serverSql).toContain("THEN public.resort_upkeep_can_access(((storage.foldername(name))[1])::uuid)");
    expect(serverSql).toContain("public.resort_upkeep_can_complete(((storage.foldername(name))[1])::uuid)");
    expect(serverSql).toContain("THEN public.resort_upkeep_can_manage(((storage.foldername(name))[1])::uuid)");
    expect(storagePolicySql).toContain("AND (storage.foldername(name))[2] = 'maintenance'");
    expect(storagePolicySql).toContain("(storage.foldername(name))[2] IN ('vendors', 'licenses')");
    expect(storagePolicySql).toContain("AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)");
    expect(serverSql).toContain("split_part(storage_path, '/', 1) = location_id::text");
    expect(serverSql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_template_versions");
    expect(serverSql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.resort_upkeep_troubleshooting_articles");
    expect(ensureReadFixSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_ensure_period");
    expect(ensureReadFixSql).not.toContain("UPDATE public.resort_upkeep_templates");
    expect(ensureReadFixSql.indexOf("PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);")).toBeLessThan(
      ensureReadFixSql.indexOf("INSERT INTO public.resort_upkeep_periods")
    );
  });

  it("keeps checklist period and item writes behind RPC-only policy gates", () => {
    const hardenedSql = readFileSync(new URL("../../supabase/migrations/20260516154646_resort_upkeep_period_history.sql", import.meta.url), "utf8");
    const rpcSql = readFileSync(new URL("../../supabase/migrations/20260516194042_resort_upkeep_vendor_license_rpc_writes.sql", import.meta.url), "utf8");

    expect(hardenedSql).toContain("CREATE POLICY resort_upkeep_periods_insert ON public.resort_upkeep_periods");
    expect(hardenedSql).toContain("CREATE POLICY resort_upkeep_periods_update ON public.resort_upkeep_periods");
    expect(hardenedSql).toContain("CREATE POLICY resort_upkeep_item_states_write ON public.resort_upkeep_item_states");
    expect(hardenedSql).toContain("CREATE POLICY resort_upkeep_item_states_update ON public.resort_upkeep_item_states");
    expect(hardenedSql.match(/current_setting\('app\.resort_upkeep_rpc_write', true\) = 'on'/g)?.length).toBeGreaterThanOrEqual(6);
    expect(hardenedSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_save_item_state");
    expect(hardenedSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_submit_period");
    expect(hardenedSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_reopen_period");
    expect(hardenedSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_publish_template_version");
    expect(hardenedSql).toContain("IF NOT public.resort_upkeep_can_manage(v_period.location_id) THEN");
    expect(hardenedSql).toContain("IF NOT public.resort_upkeep_can_manage(v_before.location_id) THEN");
    expect(hardenedSql).toContain("IF NOT public.resort_upkeep_can_manage(p_location_id) THEN");
    expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_can_complete(p_location_id uuid)");
    expect(rpcSql).toContain("IF NOT public.resort_upkeep_can_complete(v_period.location_id) THEN");
    expect(rpcSql).toContain("CREATE POLICY resort_upkeep_item_states_write ON public.resort_upkeep_item_states");
    expect(rpcSql).toContain("AND public.resort_upkeep_can_complete(location_id)");
    expect(rpcSql).toContain("GRANT EXECUTE ON FUNCTION public.resort_upkeep_submit_period(uuid, text, text) TO authenticated");
    expect(hardenedSql).not.toContain("IF NOT public.labor_has_management_access");
  });

  it("routes vendor, license, log, and attachment metadata writes through server RPCs", () => {
    const source = readFileSync(new URL("../kol/resortUpkeepData.js", import.meta.url), "utf8");
    const rpcSql = readFileSync(new URL("../../supabase/migrations/20260516194042_resort_upkeep_vendor_license_rpc_writes.sql", import.meta.url), "utf8");

    [
      "resort_upkeep_save_vendor",
      "resort_upkeep_add_vendor_log",
      "resort_upkeep_save_license",
      "resort_upkeep_add_license_log",
      "resort_upkeep_record_attachment",
    ].forEach((functionName) => {
      expect(source).toContain(`"${functionName}"`);
      expect(rpcSql).toContain(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      expect(rpcSql).toContain(`GRANT EXECUTE ON FUNCTION public.${functionName}(jsonb, text) TO authenticated`);
    });
    [
      "resort_upkeep_archive_vendor",
      "resort_upkeep_deactivate_license",
    ].forEach((functionName) => {
      expect(source).toContain(`"${functionName}"`);
      expect(rpcSql).toContain(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      expect(rpcSql).toContain(`REVOKE ALL ON FUNCTION public.${functionName}(uuid, text, text) FROM PUBLIC`);
      expect(rpcSql).toContain(`GRANT EXECUTE ON FUNCTION public.${functionName}(uuid, text, text) TO authenticated`);
    });

    expect(source).not.toContain('.from("resort_upkeep_vendors").upsert');
    expect(source).not.toContain('.from("resort_upkeep_licenses").upsert');
    expect(source).not.toContain('.from("resort_upkeep_vendor_logs")\n    .insert');
    expect(source).not.toContain('.from("resort_upkeep_license_logs")\n    .insert');
    expect(source).not.toContain('.from("resort_upkeep_attachments")\n    .insert');
    expect(source).toContain('.from("resort_upkeep_attachments")');
    expect(source).toContain('.is("deleted_at", null)');
    expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_can_access(p_location_id uuid)");
    expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_can_complete(p_location_id uuid)");
    expect(rpcSql).toContain("public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Complete')");
    expect(rpcSql).toContain("IF v_is_maintenance_attachment AND split_part(v_storage_path, '/', 2) <> 'maintenance' THEN");
    expect(rpcSql).toContain("IF v_attachment_scope IN ('vendor_contract', 'vendor_log_attachment') AND split_part(v_storage_path, '/', 2) <> 'vendors' THEN");
    expect(rpcSql).toContain("IF v_attachment_scope IN ('license_evidence', 'license_log_attachment') AND split_part(v_storage_path, '/', 2) <> 'licenses' THEN");
    expect(rpcSql).toContain("Attachment scope does not match exactly one supported parent entity");
    expect(rpcSql).toContain("Maintenance attachments cannot be added to locked checklist periods");
    expect(rpcSql).toContain("Contract upload is required before marking a new vendor contract on file");
    expect(rpcSql).toContain("Contract upload is required before marking this vendor contract on file");
    expect(rpcSql).toContain("a.attachment_scope = 'vendor_contract'");
    expect(rpcSql).toContain("Proof of compliance must be uploaded before marking a new license compliant");
    expect(rpcSql).toContain("Proof of compliance must be uploaded before marking this license compliant");
    expect(rpcSql).toContain("a.attachment_scope = 'license_evidence'");
    expect(rpcSql).toContain("a.deleted_at IS NULL");
    expect(rpcSql).toContain("OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage')");
    expect(rpcSql).toContain("GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_access(uuid) TO authenticated");
    expect(rpcSql).toContain("GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_complete(uuid) TO authenticated");
    expect(rpcSql.match(/current_setting\('app\.resort_upkeep_rpc_write', true\) = 'on'/g)?.length).toBeGreaterThanOrEqual(10);
    expect(rpcSql).toContain("v.id = resort_upkeep_vendor_logs.vendor_id");
    expect(rpcSql).toContain("v.location_id = resort_upkeep_vendor_logs.location_id");
    expect(rpcSql).toContain("l.id = resort_upkeep_license_logs.license_id");
    expect(rpcSql).toContain("l.location_id = resort_upkeep_license_logs.location_id");
    expect(rpcSql).toContain("p.id = resort_upkeep_attachments.period_id");
    expect(rpcSql).toContain("s.id = resort_upkeep_attachments.item_state_id");
    expect(rpcSql).toContain("vl.id = resort_upkeep_attachments.vendor_log_id");
    expect(rpcSql).toContain("ll.id = resort_upkeep_attachments.license_log_id");
    expect(rpcSql).toContain("attachment_scope = 'vendor_contract'");
    expect(rpcSql).toContain("attachment_scope = 'license_evidence'");
    expect(rpcSql).toContain("split_part(storage_path, '/', 2) = 'maintenance'");
    expect(rpcSql.match(/split_part\(storage_path, '\/', 2\) = 'vendors'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rpcSql.match(/split_part\(storage_path, '\/', 2\) = 'licenses'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rpcSql.match(/resort_upkeep_period_can_edit\(p\.status, p\.period_end, p\.first_submitted_at, CURRENT_DATE\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(rpcSql).not.toContain("v.id = vendor_id\n        AND v.location_id = location_id");
    expect(rpcSql).not.toContain("l.id = license_id\n        AND l.location_id = location_id");
  });

  it("keeps seeded checklist JSON aligned with the source workbooks", () => {
    const adminSql = readFileSync(new URL("../../supabase/migrations/20260516151412_resort_upkeep_admin.sql", import.meta.url), "utf8");
    const reconciliationSql = readFileSync(new URL("../../supabase/migrations/20260516163039_resort_upkeep_source_file_text_reconciliation.sql", import.meta.url), "utf8");
    const directRepairSql = readFileSync(new URL("../../supabase/migrations/20260516163602_resort_upkeep_direct_source_text_repair.sql", import.meta.url), "utf8");
    const checklistJsonBlocks = [...adminSql.matchAll(/'\s*(\[[\s\S]*?\])\s*'::jsonb/g)]
      .map((match) => JSON.parse(match[1].replaceAll("''", "'")))
      .filter((items) => items[0]?.label);

    expect(checklistJsonBlocks.map((items) => items.length)).toEqual([12, 5, 3, 14]);
    expect(reconciliationSql).toContain("manufacturer's suggested maintenance plan");
    expect(reconciliationSql).toContain("owner's manual");
    expect(reconciliationSql).toContain("infrared (IR) electrical inspection");
    expect(reconciliationSql).toContain("Reconciled task wording against the attached source checklist file.");
    expect(directRepairSql).toContain("AND t.location_id IS NULL");
    expect(directRepairSql).toContain("template_version_id = s.version_id");
    expect(directRepairSql).toContain("items_snapshot = s.items");
    expect(directRepairSql).toContain("AND p.first_submitted_at IS NULL");
  });

  it("gates global Resort Upkeep rows behind Resort Upkeep permissions", () => {
    const policyAlignmentSql = readFileSync(new URL("../../supabase/migrations/20260516181926_resort_upkeep_policy_permission_alignment.sql", import.meta.url), "utf8");
    const vendorLicenseRpcSql = readFileSync(new URL("../../supabase/migrations/20260516194042_resort_upkeep_vendor_license_rpc_writes.sql", import.meta.url), "utf8");
    const hasAnyAccessSql = readFileSync(new URL("../../supabase/migrations/20260516222337_resort_upkeep_has_any_access_lite_only.sql", import.meta.url), "utf8");

    expect(policyAlignmentSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_has_any_access()");
    expect(policyAlignmentSql).toContain("location_id IS NULL AND public.resort_upkeep_has_any_access()");
    expect(policyAlignmentSql).toContain("USING (is_active = true AND public.resort_upkeep_has_any_access())");
    expect(policyAlignmentSql).toContain("REVOKE ALL ON SCHEMA app_private FROM PUBLIC");
    expect(policyAlignmentSql).toContain("REVOKE ALL ON FUNCTION app_private.resort_upkeep_audit_row_change() FROM PUBLIC");
    expect(policyAlignmentSql).toContain("CREATE POLICY resort_upkeep_templates_write ON public.resort_upkeep_templates");
    expect(policyAlignmentSql).toContain("CREATE POLICY resort_upkeep_template_versions_write ON public.resort_upkeep_template_versions");
    expect(policyAlignmentSql.match(/current_setting\('app\.resort_upkeep_rpc_write', true\) = 'on'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(policyAlignmentSql).toContain("DROP FUNCTION IF EXISTS public.resort_upkeep_audit_row_change()");
    expect(policyAlignmentSql).toContain("CREATE OR REPLACE FUNCTION app_private.resort_upkeep_audit_row_change()");
    expect(policyAlignmentSql).not.toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_audit_row_change()");
    expect(policyAlignmentSql).not.toContain("OR p.location_id = p_location_id");
    expect(policyAlignmentSql).not.toContain("p.role IN ('manager', 'location_admin')");
    expect(policyAlignmentSql).toContain("multi_location_admin");
    expect(policyAlignmentSql).toContain("multi_loc_admin");
    expect(policyAlignmentSql).toContain("role_owner");
    expect(policyAlignmentSql).toContain("OR l.id = p_location_id");
    expect(policyAlignmentSql).toContain("WHEN p_permission_key IN ('Resort Upkeep Access', 'Resort Upkeep Complete') THEN");
    expect(policyAlignmentSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_can_complete(p_location_id uuid)");
    expect(policyAlignmentSql).toContain("OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Complete')");
    expect(policyAlignmentSql).toContain("SELECT public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage');");
    expect(vendorLicenseRpcSql.indexOf("CREATE OR REPLACE FUNCTION public.resort_upkeep_can_access")).toBeGreaterThan(-1);
    expect(vendorLicenseRpcSql).toContain("public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Access')");
    expect(vendorLicenseRpcSql).toContain("OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Complete')");
    expect(vendorLicenseRpcSql).toContain("OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage')");
    expect(vendorLicenseRpcSql).toContain("REVOKE ALL ON FUNCTION public.resort_upkeep_get_dashboard(uuid, date) FROM PUBLIC");
    expect(vendorLicenseRpcSql).toContain("REVOKE ALL ON FUNCTION public.resort_upkeep_list_periods(uuid, text, integer) FROM PUBLIC");
    expect(vendorLicenseRpcSql).toContain("REVOKE ALL ON FUNCTION public.resort_upkeep_get_period_snapshot(uuid) FROM PUBLIC");
    expect(vendorLicenseRpcSql).toContain("REVOKE ALL ON FUNCTION public.resort_upkeep_reopen_period(uuid, text, text) FROM PUBLIC");
    expect(vendorLicenseRpcSql).toContain("REVOKE ALL ON FUNCTION public.labor_has_lite_permission(uuid, text) FROM PUBLIC");
    expect(vendorLicenseRpcSql).toContain("REVOKE ALL ON FUNCTION public.resort_upkeep_touch_updated_at() FROM PUBLIC");
    expect(vendorLicenseRpcSql).toContain("GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_access(uuid) TO authenticated");
    expect(vendorLicenseRpcSql).toContain("GRANT EXECUTE ON FUNCTION public.resort_upkeep_get_dashboard(uuid, date) TO authenticated");
    expect(hasAnyAccessSql).toContain("CREATE OR REPLACE FUNCTION public.resort_upkeep_has_any_access()");
    expect(hasAnyAccessSql).toContain("FROM public.lite_profiles lp");
    expect(hasAnyAccessSql).toContain("FROM public.lite_permissions perm");
    expect(hasAnyAccessSql).toContain("Resort Upkeep Complete");
    expect(hasAnyAccessSql).toContain("Resort Upkeep Manage");
    expect(hasAnyAccessSql).not.toContain("FROM public.locations");
    expect(hasAnyAccessSql).not.toContain("FROM public.profiles");
    expect(hasAnyAccessSql).toContain("REVOKE ALL ON FUNCTION public.resort_upkeep_has_any_access() FROM PUBLIC");
  });

  it("keeps migration hardening internally applyable", () => {
    const windowCleanupSql = readFileSync(new URL("../../supabase/migrations/20260516165750_resort_upkeep_window_lint_cleanup.sql", import.meta.url), "utf8");
    const policyAlignmentSql = readFileSync(new URL("../../supabase/migrations/20260516181926_resort_upkeep_policy_permission_alignment.sql", import.meta.url), "utf8");
    const oldAuditDropIndex = policyAlignmentSql.indexOf("DROP FUNCTION IF EXISTS public.resort_upkeep_audit_row_change()");

    expect(windowCleanupSql).toContain("v_offset integer;");
    expect(windowCleanupSql).toContain("FOR v_offset IN 0..v_back LOOP");
    [
      "trg_resort_upkeep_periods_audit",
      "trg_resort_upkeep_item_states_audit",
      "trg_resort_upkeep_vendors_audit",
      "trg_resort_upkeep_vendor_logs_audit",
      "trg_resort_upkeep_licenses_audit",
      "trg_resort_upkeep_license_logs_audit",
      "trg_resort_upkeep_attachments_audit",
    ].forEach((triggerName) => {
      const triggerIndex = policyAlignmentSql.indexOf(`DROP TRIGGER IF EXISTS ${triggerName}`);
      expect(triggerIndex).toBeGreaterThan(-1);
      expect(triggerIndex).toBeLessThan(oldAuditDropIndex);
    });
    expect(policyAlignmentSql).not.toContain("EXECUTE FUNCTION public.resort_upkeep_audit_row_change()");
  });
});

describe("buildUpkeepDueItems", () => {
  const TODAY = "2026-05-30";
  const maintenance = [
    { id: "m1", template_name: "HVAC Quarterly", due_date: "2026-05-28", computed_status: "overdue", period_start: "2026-04-01", period_end: "2026-06-30", progress: { completedRequired: 2, totalRequired: 5 } },
    { id: "m2", template_name: "Monthly Walkthrough", due_date: "2026-06-15", status: "open", progress: { completedRequired: 0, totalRequired: 4 } },
    { id: "m3", template_name: "Closed Period", due_date: "2026-05-20", computed_status: "submitted" },
  ];
  const licenses = [
    { id: "l1", requirement_name: "Fire Inspection", issuing_organization: "City FD", status: "compliant", expiration_date: "2026-06-02" },
    { id: "l2", requirement_name: "Kennel Permit", status: "non_compliant", expiration_date: null },
    { id: "l3", requirement_name: "Annual Far License", status: "compliant", expiration_date: "2026-12-01" },
    { id: "l4", requirement_name: "Retired License", status: "compliant", expiration_date: "2026-06-01", is_active: false },
    { id: "l5", requirement_name: "Pest Control Permit", status: "compliant", expiration_date: "2026-07-10" },
  ];
  const vendors = [
    { id: "v1", business_name: "Ace Plumbing", has_contract: true, contract_effective_end: "2026-06-10" },
    { id: "v2", business_name: "No Contract Co", has_contract: false, contract_effective_end: "2026-06-05" },
    { id: "v3", business_name: "Lapsed HVAC", has_contract: true, contract_effective_end: "2026-05-01" },
    { id: "v4", business_name: "Archived Vendor", has_contract: true, contract_effective_end: "2026-06-01", is_archived: true },
  ];

  it("aggregates all three domains, sorted by urgency with attention-no-date pinned to the top", () => {
    const items = buildUpkeepDueItems({ maintenance, licenses, vendors, today: TODAY });
    expect(items.map((item) => item.id)).toEqual([
      "license:l2", // non-compliant, no date -> needs attention now
      "vendor:v3", // contract lapsed 29 days ago
      "maintenance:m1", // 2 days overdue
      "license:l1", // renews in 3 days
      "vendor:v1", // contract ends in 11 days
      "maintenance:m2", // due in 16 days
      "license:l5", // renews in 41 days (inside default 60-day window)
    ]);
    expect(items[0]).toMatchObject({ id: "license:l2", attention: true, tone: "danger", dueBadge: "No date", statusLabel: "Non-compliant" });
    const m1 = items.find((item) => item.id === "maintenance:m1");
    expect(m1).toMatchObject({ tone: "danger", dueBadge: "Overdue 2d", statusLabel: "Overdue", targetTab: "maintenance" });
    expect(m1.subtitle).toContain("2/5 done");
  });

  it("excludes completed periods, inactive licenses, archived vendors, and vendors without a contract end date", () => {
    const ids = buildUpkeepDueItems({ maintenance, licenses, vendors, today: TODAY }).map((item) => item.id);
    expect(ids).not.toContain("maintenance:m3"); // submitted -> done
    expect(ids).not.toContain("license:l4"); // is_active === false
    expect(ids).not.toContain("vendor:v2"); // has_contract === false
    expect(ids).not.toContain("vendor:v4"); // archived
  });

  it("respects the window horizon and treats Infinity as no horizon", () => {
    const within30 = buildUpkeepDueItems({ maintenance, licenses, vendors, today: TODAY, windowDays: 30 }).map((item) => item.id);
    expect(within30).not.toContain("license:l5"); // 41 days out
    expect(within30).toContain("license:l2"); // attention items ignore the horizon

    const allHorizons = buildUpkeepDueItems({ maintenance, licenses, vendors, today: TODAY, windowDays: Infinity }).map((item) => item.id);
    expect(allHorizons).toContain("license:l3"); // ~185 days out
    expect(allHorizons).toContain("license:l5");
  });

  it("labels vendor and license urgency with tone and due badges", () => {
    const items = buildUpkeepDueItems({ vendors, today: TODAY });
    expect(items.find((item) => item.id === "vendor:v3")).toMatchObject({ tone: "danger", statusLabel: "Contract expired", dueBadge: "Overdue 29d", kindLabel: "Vendor" });
    expect(items.find((item) => item.id === "vendor:v1")).toMatchObject({ tone: "warn", statusLabel: "Contract ending", dueBadge: "Due in 11d" });
  });

  it("renders a Due today badge when the date is the anchor day", () => {
    const items = buildUpkeepDueItems({ licenses: [{ id: "today", requirement_name: "Today Permit", status: "compliant", expiration_date: TODAY }], today: TODAY });
    expect(items[0]).toMatchObject({ id: "license:today", dueBadge: "Due today", tone: "warn", statusLabel: "Renewal due" });
  });

  it("returns an empty array for empty or missing input", () => {
    expect(buildUpkeepDueItems({})).toEqual([]);
    expect(buildUpkeepDueItems()).toEqual([]);
  });
});
