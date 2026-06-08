// Marketing Directory (Linear K9-11) — organizations + affiliated contacts for
// marketing outreach. Organizations hold many contacts; a contact with no org is a
// standalone individual (the org-vs-individual pill filter). Business cards and
// files attach to either; a History subtab shows the change log. The directory
// cross-references the grassroots marketing tracker: "Import from tracker" pulls in
// event organizers + visited/partnership businesses, and saving a linked org writes
// its contact fields back to the tracker.
//
// The list surfaces (directory + history) compose the shared THE-STANDARD chrome
// from ../../shared/listSurface (ListSurfaceTitle / ListTabBar / ListSearchRow /
// PillFilter / ListExplainer / DenseTable) — the same primitives Labor, Resort
// Upkeep, and Grassroots use. All data/UI rules live in ../marketingDirectoryData.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtPhoneInput } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, LogEntryModal, Modal } from "../../shared/ui";
import {
  DenseTable,
  IconButton,
  ListExplainer,
  ListSearchRow,
  ListSurface,
  ListSurfaceTitle,
  ListTabBar,
  RowActionButton,
  StatusPill,
} from "../../shared/listSurface";
import { hasLeanPermission } from "../../shared/permissions";
import { normalizeOptionalUuid } from "../trainingData";
import {
  MARKETING_DIRECTORY_ATTACHMENT_BUCKET,
  buildDirectoryAttachmentPath,
  buildDirectoryContactPayload,
  buildDirectoryEntries,
  buildDirectoryImportCandidates,
  buildDirectoryNotePayload,
  buildDirectoryOrgPayload,
  buildDirectoryUpdatesFeed,
  buildGrassrootsTargetWriteback,
  countDirectoryPairedTargets,
  getDirectoryLastInteractedAt,
  diffDirectoryPeople,
  makeOrgDraftFromIndividual,
  filterDirectoryEntries,
  getDirectoryBusinessCard,
  getDirectoryContactName,
  getDirectoryHistoryEventLabel,
  getDirectoryOrgAddressText,
  getDirectoryOrgName,
  groupDirectoryAttachments,
  inferDirectoryAttachmentMimeType,
  isValidDirectoryEmail,
  makeBlankDirectoryContact,
  makeBlankDirectoryOrg,
  summarizeDirectory,
  validateDirectoryAttachmentFiles,
} from "../marketingDirectoryData";
import { MUTED } from "./marketingDirectory/styles";
import { fmtDateTime, fmtDate } from "./marketingDirectory/format";
import { clientUuid, normalizeUploadFile } from "./marketingDirectory/upload";
import { Glyph } from "./marketingDirectory/Glyph";
import { AttachmentPreviewModal } from "./marketingDirectory/attachments";
import { ImportModal } from "./marketingDirectory/ImportModal";
import { DirectoryExpansion } from "./marketingDirectory/DirectoryExpansion";
import { UpdatesExpansion } from "./marketingDirectory/UpdatesExpansion";
import { DirectoryEditorModal } from "./marketingDirectory/DirectoryEditorModal";

// ─── page ───────────────────────────────────────────────────────────────────
export default function MarketingDirectoryPage({ profile, nav, locationId, addGlobalToast = () => {} }) {
  const canManage = hasLeanPermission(profile, "Marketing Directory Access");
  const actor = useMemo(() => ({
    userId: normalizeOptionalUuid(profile?.user_id || profile?.id) || "",
    name: profile?.name || profile?.full_name || profile?.email || "Staff",
  }), [profile?.email, profile?.full_name, profile?.id, profile?.name, profile?.user_id]);

  const [tab, setTab] = useState("directory");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [orgs, setOrgs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [history, setHistory] = useState([]);
  const [targets, setTargets] = useState([]);
  const [notes, setNotes] = useState([]);

  const [expandedRow, setExpandedRow] = useState(null); // { id, mode: "contacts"|"updates", logging }
  const [editor, setEditor] = useState(null); // { mode, draft }
  const [stagedCard, setStagedCard] = useState(null);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [editorPeople, setEditorPeople] = useState([]);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState(null); // { attachment, url, loading }
  const [savingLog, setSavingLog] = useState(false);

  const toast = useCallback((message, type = "success") => addGlobalToast(message, type), [addGlobalToast]);

  const loadDirectory = useCallback(async () => {
    if (!locationId) { setLoading(false); return; }
    setLoading(true);
    setSchemaMissing(false);
    const [orgRes, contactRes, attRes, histRes, targetRes, notesRes] = await Promise.all([
      supabase.from("marketing_directory_orgs").select("*").eq("location_id", locationId).order("name", { ascending: true }),
      supabase.from("marketing_directory_contacts").select("*").eq("location_id", locationId),
      supabase.from("marketing_directory_attachments").select("*").eq("location_id", locationId).is("deleted_at", null).order("uploaded_at", { ascending: false }),
      supabase.from("marketing_directory_history").select("*").eq("location_id", locationId).order("event_at", { ascending: false }).limit(250),
      supabase.from("grassroots_targets").select("*").eq("location_id", locationId),
      supabase.from("marketing_directory_notes").select("*").eq("location_id", locationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
    ]);

    const missing = (err) => err?.code === "42P01" || err?.code === "PGRST205" || /marketing_directory_/.test(err?.message || "");
    if (orgRes.error || contactRes.error) {
      if (missing(orgRes.error) || missing(contactRes.error)) {
        setSchemaMissing(true);
      } else {
        console.error("Failed to load marketing directory", orgRes.error || contactRes.error);
        toast((orgRes.error || contactRes.error).message || "Failed to load directory", "error");
      }
      setOrgs([]); setContacts([]); setAttachments([]); setHistory([]); setTargets([]); setNotes([]);
      setLoading(false);
      return;
    }

    setOrgs(orgRes.data || []);
    setContacts(contactRes.data || []);
    setAttachments(attRes.error ? [] : (attRes.data || []));
    setHistory(histRes.error ? [] : (histRes.data || []));
    // Tracker read is best-effort: it only powers the Import dialog.
    setTargets(targetRes.error ? [] : (targetRes.data || []));
    setNotes(notesRes.error ? [] : (notesRes.data || []));
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => { loadDirectory(); }, [loadDirectory]);

  const attachmentsByEntity = useMemo(() => groupDirectoryAttachments(attachments), [attachments]);
  const entries = useMemo(() => buildDirectoryEntries({ orgs, contacts, attachmentsByEntity }), [orgs, contacts, attachmentsByEntity]);
  const visibleEntries = useMemo(() => filterDirectoryEntries(entries, { entryType: "organizations", query }), [entries, query]);
  const counts = useMemo(() => {
    const summary = summarizeDirectory(orgs, contacts);
    return { ...summary, total: summary.organizations };
  }, [orgs, contacts]);
  // People not attached to an org — surfaced as a cleanup tray, not directory rows.
  const unassignedContacts = useMemo(() => contacts.filter((c) => !c.org_id), [contacts]);

  const importCandidates = useMemo(
    () => buildDirectoryImportCandidates({ targets, existingOrgs: orgs, existingContacts: contacts }),
    [targets, orgs, contacts],
  );
  const importCount = importCandidates.orgs.length + importCandidates.individuals.length;

  // One inline expansion per row, in either "contacts" or "updates" mode — the
  // updates mode is a verbatim copy of the marketing tracker's updates column.
  const toggleContacts = useCallback((id) => setExpandedRow((prev) => (prev && prev.id === id && prev.mode === "contacts" ? null : { id, mode: "contacts" })), []);
  const openUpdates = useCallback((id) => setExpandedRow((prev) => (prev && prev.id === id && prev.mode === "updates" && !prev.logging ? null : { id, mode: "updates", logging: false })), []);
  const openLog = useCallback((id) => { setExpandedRow((prev) => (prev && prev.id === id && prev.mode === "updates" && prev.logging ? null : { id, mode: "updates", logging: true })); }, []);
  const cancelLog = useCallback(() => setExpandedRow((prev) => (prev ? { ...prev, logging: false } : prev)), []);

  // ── editor lifecycle ──
  const openOrgEditor = (org) => {
    setStagedCard(null); setStagedFiles([]);
    setEditorPeople(org
      ? contacts.filter((c) => c.org_id === org.id).map((c) => ({ id: c.id, first_name: c.first_name || "", last_name: c.last_name || "", title: c.title || "", email: c.email || "", phone: c.phone || "" }))
      : []);
    setEditor({ mode: "org", draft: org ? { ...org, isDraft: false } : makeBlankDirectoryOrg(locationId) });
  };
  const openContactEditor = (contact, orgId = null) => { setStagedCard(null); setStagedFiles([]); setEditorPeople([]); setEditor({ mode: "contact", draft: contact ? { ...contact, isDraft: false } : makeBlankDirectoryContact(locationId, orgId) }); };
  const closeEditor = () => { setEditor(null); setStagedCard(null); setStagedFiles([]); setEditorPeople([]); };
  const updateDraft = (key, value) => setEditor((prev) => (prev ? { ...prev, draft: { ...prev.draft, [key]: value } } : prev));
  const addPerson = () => setEditorPeople((prev) => [...prev, { _key: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, first_name: "", last_name: "", title: "", email: "", phone: "" }]);
  const changePerson = (index, key, value) => setEditorPeople((prev) => prev.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
  const removePerson = (index) => setEditorPeople((prev) => prev.filter((_, i) => i !== index));

  const pickStagedFiles = (fileList) => {
    const { acceptedFiles, errors } = validateDirectoryAttachmentFiles([...stagedFiles, ...Array.from(fileList || [])]);
    setStagedFiles(acceptedFiles);
    if (errors.length) toast(errors[0], "error");
  };

  const editorAttachments = useMemo(() => {
    if (!editor || editor.draft.isDraft) return [];
    const key = editor.mode === "org" ? `org:${editor.draft.id}` : `contact:${editor.draft.id}`;
    return attachmentsByEntity[key] || [];
  }, [editor, attachmentsByEntity]);

  // Upload one file to storage + insert its attachment row (entity must already exist).
  const uploadAttachment = useCallback(async ({ entityType, entityId, file, attachmentType }) => {
    const normalized = await normalizeUploadFile(file);
    const attachmentId = clientUuid();
    const mimeType = inferDirectoryAttachmentMimeType(normalized);
    const storagePath = buildDirectoryAttachmentPath({ locationId, entityType, entityId, attachmentId, fileName: normalized.name });
    const { error: uploadError } = await supabase.storage.from(MARKETING_DIRECTORY_ATTACHMENT_BUCKET).upload(storagePath, normalized, { cacheControl: "3600", contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const row = {
      id: attachmentId,
      location_id: locationId,
      org_id: entityType === "org" ? entityId : null,
      contact_id: entityType === "contact" ? entityId : null,
      attachment_type: attachmentType,
      file_name: normalized.name || "attachment",
      storage_bucket: MARKETING_DIRECTORY_ATTACHMENT_BUCKET,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size_bytes: Number(normalized.size || 0),
      metadata: { source_module: "marketing_directory", original_file_name: file.name || normalized.name || "attachment" },
      uploaded_by_user_id: actor.userId || null,
      uploaded_by_name: actor.name || null,
    };
    const { error: insertError } = await supabase.from("marketing_directory_attachments").insert(row);
    if (insertError) throw insertError;
  }, [actor.name, actor.userId, locationId]);

  const saveEditor = async () => {
    if (!editor || !locationId) return;
    const { mode, draft } = editor;
    if (mode === "org" && !String(draft.name || "").trim()) { toast("Organization name is required", "error"); return; }
    if (mode === "contact" && !String(draft.first_name || "").trim() && !String(draft.last_name || "").trim()) { toast("A contact name is required", "error"); return; }
    if (!isValidDirectoryEmail(draft.email)) { toast("Enter a valid email address", "error"); return; }

    setSaving(true);
    try {
      let entityId = draft.id;
      if (mode === "org") {
        const payload = buildDirectoryOrgPayload(draft, locationId, actor);
        if (draft.isDraft) {
          const { data, error } = await supabase.from("marketing_directory_orgs").insert(payload).select("*").single();
          if (error) throw error;
          entityId = data.id;
        } else {
          const { error } = await supabase.from("marketing_directory_orgs").update(payload).eq("id", draft.id);
          if (error) throw error;
        }
        // "Write" half of the field↔directory wiring: keep a linked tracker record's
        // contact fields in sync with the directory.
        const targetId = draft.grassroots_target_id;
        if (targetId) {
          const writeback = buildGrassrootsTargetWriteback(draft);
          if (Object.keys(writeback).length) {
            const { error: wbError } = await supabase.from("grassroots_targets").update({ ...writeback, updated_by_user_id: actor.userId || null, updated_by_name: actor.name || null }).eq("id", targetId);
            if (wbError) console.warn("Tracker write-back skipped:", wbError.message);
          }
        }
        // Persist the inline People list: insert new, update edited, delete removed.
        const originalPeople = draft.isDraft ? [] : contacts.filter((c) => c.org_id === entityId);
        const { toInsert, toUpdate, toDeleteIds } = diffDirectoryPeople(originalPeople, editorPeople);
        for (const row of toInsert) {
          const { error } = await supabase.from("marketing_directory_contacts").insert(buildDirectoryContactPayload({ ...row, org_id: entityId, isDraft: true }, locationId, actor));
          if (error) throw error;
        }
        for (const row of toUpdate) {
          const { error } = await supabase.from("marketing_directory_contacts").update(buildDirectoryContactPayload({ ...row, org_id: entityId, isDraft: false }, locationId, actor)).eq("id", row.id);
          if (error) throw error;
        }
        if (toDeleteIds.length) {
          const { error } = await supabase.from("marketing_directory_contacts").delete().in("id", toDeleteIds);
          if (error) throw error;
        }
      } else {
        const payload = buildDirectoryContactPayload(draft, locationId, actor);
        if (draft.isDraft) {
          const { data, error } = await supabase.from("marketing_directory_contacts").insert(payload).select("*").single();
          if (error) throw error;
          entityId = data.id;
        } else {
          const { error } = await supabase.from("marketing_directory_contacts").update(payload).eq("id", draft.id);
          if (error) throw error;
        }
      }

      // Replace an existing card if a new one was staged.
      if (stagedCard) {
        const existingCard = getDirectoryBusinessCard(editorAttachments);
        if (existingCard) {
          await supabase.from("marketing_directory_attachments").update({ deleted_at: new Date().toISOString(), deleted_by_user_id: actor.userId || null, deleted_by_name: actor.name || null }).eq("id", existingCard.id);
        }
        await uploadAttachment({ entityType: mode, entityId, file: stagedCard, attachmentType: "business_card" });
      }
      for (const file of stagedFiles) {
        await uploadAttachment({ entityType: mode, entityId, file, attachmentType: "attachment" });
      }

      await loadDirectory();
      closeEditor();
      toast(mode === "org" ? "Organization saved" : "Contact saved");
    } catch (err) {
      console.error("Failed to save directory record", err);
      const msg = err?.code === "23505" ? "An organization with that name already exists." : (err?.message || "Failed to save");
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteOrg = async (org) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${getDirectoryOrgName(org)}” and its contacts? This cannot be undone.`)) return;
    const { error } = await supabase.from("marketing_directory_orgs").delete().eq("id", org.id);
    if (error) { toast(error.message || "Failed to delete organization", "error"); return; }
    await loadDirectory();
    toast("Organization deleted");
  };

  const deleteContact = async (contact) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete contact “${getDirectoryContactName(contact)}”?`)) return;
    const { error } = await supabase.from("marketing_directory_contacts").delete().eq("id", contact.id);
    if (error) { toast(error.message || "Failed to delete contact", "error"); return; }
    await loadDirectory();
    toast("Contact deleted");
  };

  // Promote a standalone individual into an organization (so it can hold people).
  const convertToOrg = async (contact) => {
    if (!contact?.id || !locationId) return;
    if (typeof window !== "undefined" && !window.confirm(`Convert “${getDirectoryContactName(contact)}” into an organization? You can then add people to it.`)) return;
    setSaving(true);
    try {
      const payload = buildDirectoryOrgPayload(makeOrgDraftFromIndividual(contact, locationId), locationId, actor);
      const { data, error } = await supabase.from("marketing_directory_orgs").insert(payload).select("*").single();
      if (error) throw error;
      const { error: delErr } = await supabase.from("marketing_directory_contacts").delete().eq("id", contact.id);
      if (delErr) throw delErr;
      await loadDirectory();
      closeEditor();
      toast("Converted to organization");
    } catch (err) {
      console.error("Convert failed", err);
      toast(err?.message || "Failed to convert", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteAttachment = async (attachment) => {
    const { error } = await supabase.from("marketing_directory_attachments").update({ deleted_at: new Date().toISOString(), deleted_by_user_id: actor.userId || null, deleted_by_name: actor.name || null }).eq("id", attachment.id);
    if (error) { toast(error.message || "Failed to remove attachment", "error"); return; }
    setAttachments((prev) => prev.filter((att) => att.id !== attachment.id));
    toast("Attachment removed");
  };

  const previewAttachment = async (attachment) => {
    if (!attachment?.storage_path) return;
    setPreview({ attachment, url: "", loading: true });
    const { data, error } = await supabase.storage.from(attachment.storage_bucket || MARKETING_DIRECTORY_ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 300);
    if (error) { setPreview({ attachment, url: "", loading: false }); toast("Could not load attachment", "error"); return; }
    setPreview({ attachment, url: data?.signedUrl || "", loading: false });
  };

  // Save a Log Update (a directory note) for the expanded org. The composer now
  // lives in the shared LogEntryModal, which owns its own notes/date state and
  // hands them back here on save.
  const saveLog = async ({ notes: body, date: nextContactDate }) => {
    const trimmed = String(body || "").trim();
    const orgId = expandedRow?.id;
    if (!trimmed || !orgId || !locationId) return;
    setSavingLog(true);
    try {
      const { error } = await supabase.from("marketing_directory_notes").insert(buildDirectoryNotePayload(trimmed, locationId, actor, { orgId, nextContactDate: nextContactDate || "" }));
      if (error) throw error;
      setExpandedRow((prev) => (prev ? { ...prev, logging: false } : prev));
      await loadDirectory();
      toast("Update logged");
    } catch (err) {
      console.error("Log update failed", err);
      toast(err?.message || "Failed to log update", "error");
    } finally {
      setSavingLog(false);
    }
  };

  const importSelected = async (selected) => {
    if (!selected.length || !locationId) return;
    setSaving(true);
    try {
      for (const candidate of selected) {
        if (candidate.kind === "org") {
          const orgPayload = buildDirectoryOrgPayload({ ...makeBlankDirectoryOrg(locationId), ...candidate, isDraft: true }, locationId, actor);
          const { data, error } = await supabase.from("marketing_directory_orgs").insert(orgPayload).select("*").single();
          if (error) { if (error.code === "23505") continue; throw error; }
          if (candidate.contact) {
            const contactPayload = buildDirectoryContactPayload({ ...makeBlankDirectoryContact(locationId, data.id), ...candidate.contact, org_id: data.id, grassroots_target_id: candidate.grassroots_target_id, isDraft: true }, locationId, actor);
            const { error: cErr } = await supabase.from("marketing_directory_contacts").insert(contactPayload);
            if (cErr) throw cErr;
          }
        } else {
          const contactPayload = buildDirectoryContactPayload({ ...makeBlankDirectoryContact(locationId, null), ...candidate, org_id: null, isDraft: true }, locationId, actor);
          const { error } = await supabase.from("marketing_directory_contacts").insert(contactPayload);
          if (error) throw error;
        }
      }
      await loadDirectory();
      setImportOpen(false);
      toast(`Imported ${selected.length} record${selected.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error("Import failed", err);
      toast(err?.message || "Import failed", "error");
    } finally {
      setSaving(false);
    }
  };

  // Stop a row-level action from also toggling the row's expansion.
  const rowAction = (fn) => (ev) => { if (ev) ev.stopPropagation(); fn(); };

  // ── Directory table columns (shared DenseTable) — organizations only ──
  const directoryColumns = [
    {
      key: "name",
      header: "Name",
      width: "minmax(190px, 2fr)",
      sortable: true,
      sortValue: (e) => e.sortName,
      render: (e) => {
        const sub = getDirectoryOrgAddressText(e.org);
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 12, lineHeight: 1.25, wordBreak: "break-word" }}>{getDirectoryOrgName(e.org)}</div>
            {sub ? <div style={{ marginTop: 2, fontSize: 11, color: C.textMut, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div> : null}
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      width: 132,
      sortable: true,
      sortValue: (e) => e.org.org_type || "~",
      render: (e) => (e.org.org_type ? <StatusPill tone="primary">{e.org.org_type}</StatusPill> : <span style={MUTED}>—</span>),
    },
    {
      key: "contact",
      header: "Contact",
      width: "minmax(150px, 1.3fr)",
      render: (e) => {
        const { phone, email } = e.org;
        if (!phone && !email) return <span style={MUTED}>—</span>;
        return (
          <div style={{ minWidth: 0, fontSize: 11, lineHeight: 1.4 }}>
            {phone ? <div style={{ color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtPhoneInput(phone)}</div> : null}
            {email ? <div style={{ color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div> : null}
          </div>
        );
      },
    },
    {
      key: "contacts",
      header: "Contacts",
      width: 80,
      align: "center",
      sortable: true,
      sortValue: (e) => e.contacts.length,
      render: (e) => <span style={{ fontSize: 12, fontWeight: 700, color: e.contacts.length ? C.text : C.textMut }}>{e.contacts.length}</span>,
    },
    {
      key: "events",
      header: "Events",
      width: 76,
      align: "center",
      sortable: true,
      sortValue: (e) => countDirectoryPairedTargets(e.org, targets),
      headerTitle: "Paired marketing-tracker events / visits / partnerships",
      render: (e) => {
        const n = countDirectoryPairedTargets(e.org, targets);
        return <span style={{ fontSize: 12, fontWeight: 700, color: n ? C.text : C.textMut }}>{n}</span>;
      },
    },
    {
      key: "last",
      header: "Last interacted",
      width: "minmax(118px, 1fr)",
      sortable: true,
      sortValue: (e) => getDirectoryLastInteractedAt(e.org, { history, targets }) || "",
      render: (e) => {
        const last = getDirectoryLastInteractedAt(e.org, { history, targets });
        return <span style={{ fontSize: 11, color: C.textMut, whiteSpace: "nowrap" }}>{last ? fmtDate(last) : "—"}</span>;
      },
    },
    {
      key: "updates",
      header: "Updates",
      width: 96,
      align: "start",
      sortable: true,
      headerTitle: "Notes + activity on this organization",
      sortValue: (e) => buildDirectoryUpdatesFeed(e.org, { notes, history }).length,
      render: (e) => {
        const count = buildDirectoryUpdatesFeed(e.org, { notes, history }).length;
        const exp = expandedRow && expandedRow.id === e.id && expandedRow.mode === "updates";
        const logging = Boolean(exp && expandedRow.logging);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={rowAction(() => openUpdates(e.id))}
              title={`${count} updates — click to ${exp && !logging ? "collapse" : "expand"}`}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 4px", borderRadius: 5, fontSize: 10, fontWeight: 800, border: exp && !logging ? `1px solid ${C.pri}` : "none", cursor: "pointer", fontFamily: "inherit", background: exp && !logging ? C.pri : (count > 0 ? `${C.pri}14` : C.bg), color: exp && !logging ? "#fff" : (count > 0 ? C.pri : C.textMut) }}
            >
              {count}
            </button>
            {canManage ? (
              <button
                onClick={rowAction(() => openLog(e.id))}
                title={logging ? "Close log composer" : "Log an update"}
                style={logging
                  ? { padding: "1px 6px", borderRadius: 5, border: `1px solid ${C.pri}`, background: C.pri, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }
                  : { padding: "1px 6px", borderRadius: 5, border: `1px solid ${C.pri}35`, background: `${C.pri}0A`, color: C.pri, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Log
              </button>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: 76,
      align: "end",
      render: (e) => (canManage ? (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <IconButton tone="primary" title="Edit organization" icon={<Glyph icon={I.Pencil} size={12} />} onClick={rowAction(() => openOrgEditor(e.org))} />
          <IconButton tone="danger" title="Delete organization" icon={<Glyph icon={I.Trash} size={12} />} onClick={rowAction(() => deleteOrg(e.org))} />
        </div>
      ) : null),
    },
  ];

  // ── History table columns (shared DenseTable) ──
  const historyColumns = [
    {
      key: "when",
      header: "When",
      width: 150,
      sortable: true,
      sortValue: (r) => r.event_at || "",
      render: (r) => <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec, whiteSpace: "nowrap" }}>{fmtDateTime(r.event_at)}</span>,
    },
    {
      key: "action",
      header: "Action",
      width: 112,
      sortable: true,
      sortValue: (r) => r.event_type || "",
      render: (r) => <StatusPill tone={r.event_type === "created" ? "success" : r.event_type === "deleted" ? "danger" : "info"}>{getDirectoryHistoryEventLabel(r.event_type)}</StatusPill>,
    },
    {
      key: "record",
      header: "Record",
      width: "minmax(180px, 2fr)",
      sortable: true,
      sortValue: (r) => String(r.entity_name || "").toLowerCase(),
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 12, wordBreak: "break-word" }}>{r.entity_name || "Untitled record"}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: C.textMut }}>{r.entity_type === "org" ? "Organization" : "Contact"}</div>
        </div>
      ),
    },
    {
      key: "by",
      header: "By",
      width: "minmax(120px, 1fr)",
      sortable: true,
      sortValue: (r) => String(r.changed_by_name || "").toLowerCase(),
      render: (r) => <span style={{ fontSize: 11, color: C.textSec }}>{r.changed_by_name || "Unknown"}</span>,
    },
  ];

  const titleActions = canManage && !schemaMissing ? (
    <>
      {importCount > 0 ? <Btn variant="secondary" icon={<Glyph icon={I.Download} size={15} />} onClick={() => setImportOpen(true)}>Import from tracker ({importCount})</Btn> : null}
      <Btn variant="primary" icon={<Glyph icon={I.Plus} size={15} />} onClick={() => openOrgEditor(null)}>Add organization</Btn>
    </>
  ) : null;

  const schemaNotice = (
    <div style={{ marginTop: 12, padding: "20px 18px", border: `1px solid ${C.warn}55`, borderRadius: 12, background: C.warnLt, fontSize: 13, color: C.textSec }}>
      <strong style={{ color: C.text }}>Directory tables aren’t set up yet.</strong> Run the latest database migration to create the marketing directory, then refresh.
    </div>
  );

  // ── render ──
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0 48px" }}>
      <style>{`.md-glyph > svg { width: 100%; height: 100%; display: block; }`}</style>

      <ListSurfaceTitle actions={titleActions}>Marketing Directory</ListSurfaceTitle>

      <ListSurface>
      <ListTabBar
        tabs={[{ id: "directory", label: "Directory", count: counts.total }, { id: "history", label: "History", count: history.length }]}
        activeId={tab}
        onChange={setTab}
      />

      {schemaMissing ? (
        schemaNotice
      ) : loading ? (
        <div style={{ padding: "40px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading directory…</div>
      ) : tab === "directory" ? (
        <>
          <ListSearchRow value={query} onChange={setQuery} placeholder="Search organizations, people, type…" />
          <ListExplainer>
            Organizations and their affiliated contacts for marketing outreach. “Import from tracker” pulls in event organizers and visited businesses; saving a linked org syncs its contact info back.
          </ListExplainer>
          {unassignedContacts.length ? (
            <div style={{ marginTop: 12, padding: "10px 14px", border: `1px solid ${C.warn}55`, borderRadius: 12, background: C.warnLt }}>
              <div style={{ fontSize: 12.5, color: C.textSec, fontWeight: 600, marginBottom: 8 }}>
                {unassignedContacts.length} {unassignedContacts.length === 1 ? "person isn’t" : "people aren’t"} attached to an organization yet — every person belongs to an org.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {unassignedContacts.map((c) => (
                  <div key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 6px 4px 12px", border: `1px solid ${C.border}`, borderRadius: 999, background: C.surface }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{getDirectoryContactName(c)}</span>
                    {canManage ? <RowActionButton tone="primary" onClick={() => convertToOrg(c)}>Make org</RowActionButton> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <DenseTable
              columns={directoryColumns}
              rows={visibleEntries}
              getRowKey={(e) => `${e.kind}:${e.id}`}
              minWidth={1000}
              style={{ border: "none", borderRadius: 0 }}
              onRowClick={(e) => toggleContacts(e.id)}
              isRowExpanded={(e) => Boolean(expandedRow && expandedRow.id === e.id)}
              renderExpansion={(e) => (expandedRow && expandedRow.mode === "updates" ? (
                <UpdatesExpansion feed={buildDirectoryUpdatesFeed(e.org, { notes, history })} />
              ) : (
                <DirectoryExpansion
                  entry={e}
                  canManage={canManage}
                  onAddContact={(org) => openContactEditor(null, org.id)}
                  onEditContact={(contact) => openContactEditor(contact, contact.org_id)}
                  onDeleteContact={deleteContact}
                  onPreviewAttachment={previewAttachment}
                />
              ))}
              defaultSort={{ key: "name", direction: "asc" }}
              emptyText={entries.length === 0
                ? "Your directory is empty — add an organization or individual, or import from the marketing tracker."
                : "No matches for the current filter."}
            />
          </div>
        </>
      ) : (
        <>
          <ListExplainer>Every change to the directory — additions, edits, and removals, with who made each change and when.</ListExplainer>
          <div style={{ marginTop: 12 }}>
            <DenseTable
              columns={historyColumns}
              rows={history}
              getRowKey={(r) => r.id}
              minWidth={560}
              defaultSort={{ key: "when", direction: "desc" }}
              emptyText="No changes recorded yet."
              style={{ border: "none", borderRadius: 0 }}
            />
          </div>
        </>
      )}
      </ListSurface>

      {editor ? (
        <DirectoryEditorModal
          mode={editor.mode}
          draft={editor.draft}
          existingAttachments={editorAttachments}
          saving={saving}
          onChange={updateDraft}
          onClose={closeEditor}
          onSave={saveEditor}
          onPreviewAttachment={previewAttachment}
          onDeleteAttachment={deleteAttachment}
          stagedCard={stagedCard}
          stagedFiles={stagedFiles}
          onPickCard={setStagedCard}
          onClearCard={() => setStagedCard(null)}
          onPickFiles={pickStagedFiles}
          onRemoveStagedFile={(index) => setStagedFiles((prev) => prev.filter((_, i) => i !== index))}
          people={editorPeople}
          onAddPerson={addPerson}
          onChangePerson={changePerson}
          onRemovePerson={removePerson}
          onConvertToOrg={() => convertToOrg(editor.draft)}
        />
      ) : null}

      {importOpen ? (
        <ImportModal candidates={importCandidates} saving={saving} onClose={() => setImportOpen(false)} onImport={importSelected} />
      ) : null}

      {expandedRow && expandedRow.mode === "updates" && expandedRow.logging && canManage ? (
        (() => {
          const logOrg = orgs.find((o) => o.id === expandedRow.id);
          const logName = logOrg ? getDirectoryOrgName(logOrg) : "";
          return (
            <LogEntryModal
              title={logName ? `Log update — ${logName}` : "Log update"}
              types={null}
              notesLabel="Notes"
              notesPlaceholder="Notes about this outreach / development…"
              followUpLabel="Next follow-up date"
              followUpOptional
              today={new Date().toISOString().slice(0, 10)}
              saveLabel="Save log"
              saving={savingLog}
              onClose={cancelLog}
              onSave={saveLog}
            />
          );
        })()
      ) : null}

      {preview ? (
        <AttachmentPreviewModal attachment={preview.attachment} url={preview.url} loading={preview.loading} onClose={() => setPreview(null)} />
      ) : null}

    </div>
  );
}
