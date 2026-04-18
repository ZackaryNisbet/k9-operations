import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, Card, CustomSelect, Inp, Modal } from "../../shared/ui";
import {
  buildInterviewAudioPath,
  buildInterviewArtifactPath,
  buildInterviewTemplatePdfPath,
  buildInterviewTemplateSnapshot,
  buildInterviewTranscriptPath,
  buildPdfResponseMap,
  extractPdfFieldManifest,
  fillInterviewPdfBytes,
  getInterviewAudioContentType,
  getInterviewRoleLabel,
  getPdfFieldTypeLabel,
  groupQuestionsByCategory,
  INTERVIEW_AUDIO_ACCEPT,
  INTERVIEW_PDF_ACCEPT,
  INTERVIEW_TRANSCRIPT_ACCEPT,
  LABOR_INTERVIEW_DOCUMENT_BUCKET,
  LABOR_INTERVIEW_ROLES,
  LABOR_INTERVIEW_STATUS_LABELS,
  LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS,
  normalizeInterviewCandidateDraft,
  normalizeQuestionKey,
  pdfFieldsFromSnapshot,
  PDF_VERIFICATION_LABELS,
  questionRowsFromSnapshot,
  validateInterviewAudioFile,
} from "../interviewData";
import { normalizeOptionalUuid, resolveTrainingLocationId } from "../trainingData";

function defaultInterviewDate() {
  try {
    return todayStr();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildNewInterviewDraft() {
  return {
    candidate_full_name: "",
    candidate_email: "",
    candidate_phone: "",
    candidate_position: "",
    interview_date: defaultInterviewDate(),
    interview_time: "",
    interviewer_name: "",
    zoom_recording_url: "",
    zoom_passcode: "",
    template_version_id: "",
  };
}

const STATUS_BADGE_COLORS = {
  draft: "default",
  in_progress: "info",
  ai_drafted: "warning",
  reviewed: "accent",
  completed: "success",
  archived: "default",
};

const TEMPLATE_STATUS_COLORS = {
  draft: "warning",
  published: "success",
  archived: "default",
};

const VERIFY_STATUS_COLORS = {
  verified_fields: "success",
  missing_pdf: "warning",
  pending_verification: "warning",
  failed_no_fields: "danger",
  failed_invalid_pdf: "danger",
};

function fieldKey(responseType, key) {
  return `${responseType}:${key}`;
}

function responseKeyForQuestion(question) {
  return fieldKey("custom_question", question.question_key);
}

function responseKeyForPdfField(field) {
  return fieldKey("pdf_field", field.name);
}

function compactDateTime(row) {
  if (!row?.interview_date && !row?.interview_time) return "No date set";
  return [row.interview_date ? fmtDate(row.interview_date) : "", row.interview_time || ""].filter(Boolean).join(" at ");
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function snapshotForRecord(record) {
  if (!record) return {};
  const snapshot = record.template_snapshot || {};
  if (Array.isArray(snapshot.questions)) return snapshot;
  return {
    template: {
      role_key: record.candidate_position,
      role_label: record.candidate_position,
    },
    version: {
      id: record.template_version_id,
      pdf_field_manifest: record.pdf_field_manifest_snapshot || [],
    },
    questions: record.question_snapshot || [],
  };
}

function mapResponsesByTarget(responses = []) {
  return (responses || []).reduce((map, response) => {
    if (response.response_type === "custom_question" && response.question_key) {
      map[fieldKey("custom_question", response.question_key)] = response;
    }
    if (response.response_type === "pdf_field" && response.pdf_field_name) {
      map[fieldKey("pdf_field", response.pdf_field_name)] = response;
    }
    return map;
  }, {});
}

function getResponseDraft(response) {
  return response?.response_text ?? response?.ai_draft_text ?? "";
}

function Metric({ label, value, helper }) {
  return (
    <Card style={{ borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.textSec, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      {helper && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>{helper}</div>}
    </Card>
  );
}

function SectionHeading({ title, detail, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>{title}</h3>
        {detail && <div style={{ marginTop: 3, color: C.textMut, fontSize: 13 }}>{detail}</div>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div style={{ padding: 38, border: `1.5px dashed ${C.border}`, borderRadius: 12, background: C.surfaceHover, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</div>
      <div style={{ fontSize: 13, color: C.textMut, marginTop: 6, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

export default function LaborInterviewsPage({ data, profile, addGlobalToast, locationName }) {
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const locationRef = profile?.location_id || data?.locationId || "";
  const [locationId, setLocationId] = useState("");
  const [view, setView] = useState("records");
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [records, setRecords] = useState([]);
  const [responses, setResponses] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [showNewInterview, setShowNewInterview] = useState(false);
  const [newInterviewDraft, setNewInterviewDraft] = useState(() => buildNewInterviewDraft());
  const [savingNewInterview, setSavingNewInterview] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState({});
  const [savingResponseKey, setSavingResponseKey] = useState("");
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [newQuestionDrafts, setNewQuestionDrafts] = useState({});
  const [templateActionId, setTemplateActionId] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [transcriptFileName, setTranscriptFileName] = useState("");
  const [audioFileName, setAudioFileName] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);
  const [audioTranscribing, setAudioTranscribing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const pdfInputRefs = useRef({});
  const transcriptInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const versionsByTemplate = useMemo(() => {
    return versions.reduce((map, version) => {
      if (!map[version.template_id]) map[version.template_id] = [];
      map[version.template_id].push(version);
      return map;
    }, {});
  }, [versions]);

  const questionsByVersion = useMemo(() => {
    return questions.reduce((map, question) => {
      if (!map[question.template_version_id]) map[question.template_version_id] = [];
      map[question.template_version_id].push(question);
      return map;
    }, {});
  }, [questions]);

  const publishedVersions = useMemo(() => {
    return versions.filter((version) => version.status === "published" && version.is_current);
  }, [versions]);

  const selectedRecord = useMemo(() => {
    return records.find((record) => record.id === selectedRecordId) || records[0] || null;
  }, [records, selectedRecordId]);

  const selectedSnapshot = useMemo(() => snapshotForRecord(selectedRecord), [selectedRecord]);
  const selectedQuestions = useMemo(() => questionRowsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const selectedPdfFields = useMemo(() => pdfFieldsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const responsesByTarget = useMemo(() => mapResponsesByTarget(responses), [responses]);
  const selectedAudioTranscription = selectedRecord?.metadata?.audio_transcription || null;

  const metrics = useMemo(() => {
    const completed = records.filter((record) => record.status === "completed").length;
    const aiDrafted = records.filter((record) => record.status === "ai_drafted").length;
    const verifiedTemplates = versions.filter((version) => version.pdf_verification_status === "verified_fields").length;
    return {
      total: records.length,
      completed,
      aiDrafted,
      verifiedTemplates,
    };
  }, [records, versions]);

  const selectedTemplateVersion = useMemo(() => {
    return versions.find((version) => version.id === newInterviewDraft.template_version_id) || null;
  }, [newInterviewDraft.template_version_id, versions]);

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedTemplateVersion?.template_id) || null;
  }, [selectedTemplateVersion, templates]);

  const showToast = useCallback((message, type = "success") => {
    addGlobalToast?.(message, type);
  }, [addGlobalToast]);

  const loadAll = useCallback(async (resolvedLocationId = locationId) => {
    if (!resolvedLocationId) return;
    setLoading(true);
    setSchemaError("");
    try {
      const templateRes = await supabase
        .from("labor_interview_templates")
        .select("*")
        .eq("location_id", resolvedLocationId)
        .order("role_label", { ascending: true });
      if (templateRes.error) throw templateRes.error;
      const templateRows = templateRes.data || [];
      const templateIds = templateRows.map((template) => template.id);

      const versionRes = templateIds.length
        ? await supabase
            .from("labor_interview_template_versions")
            .select("*")
            .in("template_id", templateIds)
            .order("template_id")
            .order("version_no", { ascending: false })
        : { data: [], error: null };
      if (versionRes.error) throw versionRes.error;
      const versionRows = versionRes.data || [];
      const versionIds = versionRows.map((version) => version.id);

      const questionRes = versionIds.length
        ? await supabase
            .from("labor_interview_template_questions")
            .select("*")
            .in("template_version_id", versionIds)
            .order("sequence_order", { ascending: true })
        : { data: [], error: null };
      if (questionRes.error) throw questionRes.error;

      const recordRes = await supabase
        .from("labor_interview_records")
        .select("*")
        .eq("location_id", resolvedLocationId)
        .order("interview_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (recordRes.error) throw recordRes.error;

      setTemplates(templateRows);
      setVersions(versionRows);
      setQuestions(questionRes.data || []);
      setRecords(recordRes.data || []);
      if (!selectedRecordId && recordRes.data?.[0]?.id) setSelectedRecordId(recordRes.data[0].id);
    } catch (error) {
      const missing = error?.code === "PGRST205" || /labor_interview_/i.test(error?.message || "");
      setSchemaError(missing ? "Interview database tables are not available in this environment yet." : (error?.message || "Unable to load interviews."));
    } finally {
      setLoading(false);
    }
  }, [locationId, selectedRecordId]);

  useEffect(() => {
    let active = true;
    resolveTrainingLocationId(supabase, locationRef, actorUserId).then((resolved) => {
      if (!active) return;
      setLocationId(resolved || "");
      if (resolved) loadAll(resolved);
      else setLoading(false);
    });
    return () => { active = false; };
  }, [actorUserId, loadAll, locationRef]);

  useEffect(() => {
    const loadRecordDetail = async () => {
      if (!selectedRecord?.id) {
        setResponses([]);
        setArtifacts([]);
        return;
      }
      const [responseRes, artifactRes] = await Promise.all([
        supabase.from("labor_interview_responses").select("*").eq("interview_id", selectedRecord.id).order("created_at"),
        supabase.from("labor_interview_artifacts").select("*").eq("interview_id", selectedRecord.id).order("created_at", { ascending: false }),
      ]);
      if (responseRes.error) {
        showToast("Failed to load interview responses", "error");
        return;
      }
      setResponses(responseRes.data || []);
      setArtifacts(artifactRes.data || []);
    };
    loadRecordDetail();
  }, [selectedRecord?.id, showToast]);

  useEffect(() => {
    setTranscriptFileName("");
    setAudioFileName("");
  }, [selectedRecord?.id]);

  useEffect(() => {
    const nextDrafts = {};
    (responses || []).forEach((response) => {
      if (response.response_type === "custom_question" && response.question_key) {
        nextDrafts[fieldKey("custom_question", response.question_key)] = getResponseDraft(response);
      }
      if (response.response_type === "pdf_field" && response.pdf_field_name) {
        nextDrafts[fieldKey("pdf_field", response.pdf_field_name)] = getResponseDraft(response);
      }
    });
    setResponseDrafts(nextDrafts);
  }, [responses]);

  useEffect(() => {
    const path = selectedSnapshot?.version?.source_pdf_path;
    const bucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!path) {
      setPdfPreviewUrl("");
      return;
    }
    let active = true;
    supabase.storage.from(bucket).createSignedUrl(path, 60 * 30).then(({ data: signed, error }) => {
      if (!active) return;
      setPdfPreviewUrl(error ? "" : signed?.signedUrl || "");
    });
    return () => { active = false; };
  }, [selectedSnapshot]);

  const createNewInterview = async () => {
    const normalized = normalizeInterviewCandidateDraft(newInterviewDraft);
    if (!normalized.candidate_full_name || !selectedTemplate || !selectedTemplateVersion) {
      showToast("Candidate name and a published role template are required.", "error");
      return;
    }
    const versionQuestions = questionsByVersion[selectedTemplateVersion.id] || [];
    const snapshot = buildInterviewTemplateSnapshot({
      template: selectedTemplate,
      version: selectedTemplateVersion,
      questions: versionQuestions,
    });
    setSavingNewInterview(true);
    try {
      const { data: created, error } = await supabase.from("labor_interview_records").insert({
        location_id: locationId,
        template_id: selectedTemplate.id,
        template_version_id: selectedTemplateVersion.id,
        ...normalized,
        status: "draft",
        interviewer_user_id: actorUserId,
        template_snapshot: snapshot,
        pdf_field_manifest_snapshot: selectedTemplateVersion.pdf_field_manifest || [],
        question_snapshot: snapshot.questions || [],
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
      }).select("*").single();
      if (error) throw error;
      setRecords((prev) => [created, ...prev]);
      setSelectedRecordId(created.id);
      setShowNewInterview(false);
      setNewInterviewDraft(buildNewInterviewDraft());
      showToast("Interview created");
    } catch (error) {
      showToast(error?.message || "Failed to create interview", "error");
    } finally {
      setSavingNewInterview(false);
    }
  };

  const saveRecordPatch = async (patch) => {
    if (!selectedRecord?.id) return;
    setRecordSaving(true);
    try {
      const { data: updated, error } = await supabase
        .from("labor_interview_records")
        .update({ ...patch, updated_by_user_id: actorUserId, updated_at: new Date().toISOString() })
        .eq("id", selectedRecord.id)
        .select("*")
        .single();
      if (error) throw error;
      setRecords((prev) => prev.map((record) => record.id === updated.id ? updated : record));
    } catch (error) {
      showToast(error?.message || "Failed to save interview", "error");
    } finally {
      setRecordSaving(false);
    }
  };

  const saveResponse = async ({ responseType, key, prompt, value }) => {
    if (!selectedRecord?.id || !key) return;
    const targetKey = fieldKey(responseType, key);
    const existing = responsesByTarget[targetKey];
    setSavingResponseKey(targetKey);
    try {
      if (existing?.id) {
        const { data: updated, error } = await supabase
          .from("labor_interview_responses")
          .update({
            response_text: value || null,
            prompt_snapshot: prompt,
            updated_by_user_id: actorUserId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        setResponses((prev) => prev.map((response) => response.id === updated.id ? updated : response));
      } else {
        const insertRow = {
          interview_id: selectedRecord.id,
          response_type: responseType,
          question_key: responseType === "custom_question" ? key : null,
          pdf_field_name: responseType === "pdf_field" ? key : null,
          prompt_snapshot: prompt,
          response_text: value || null,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        };
        const { data: created, error } = await supabase
          .from("labor_interview_responses")
          .insert(insertRow)
          .select("*")
          .single();
        if (error) throw error;
        setResponses((prev) => [...prev, created]);
      }
      if (selectedRecord.status === "draft") {
        await saveRecordPatch({ status: "in_progress" });
      }
    } catch (error) {
      showToast(error?.message || "Failed to save response", "error");
    } finally {
      setSavingResponseKey("");
    }
  };

  const handleTranscriptUpload = async (file) => {
    if (!selectedRecord?.id || !file) return;
    try {
      const text = await fileToText(file);
      const path = buildInterviewTranscriptPath({ locationId, interviewId: selectedRecord.id, fileName: file.name });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || "text/plain" });
      if (uploadError) throw uploadError;
      setTranscriptFileName(file.name);
      await saveRecordPatch({
        transcript_text: text,
        transcript_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
        transcript_file_path: path,
      });
      showToast("Transcript uploaded");
    } catch (error) {
      showToast(error?.message || "Failed to upload transcript", "error");
    }
  };

  const handleAudioUpload = async (file) => {
    if (!selectedRecord?.id || !file) return;
    const validation = validateInterviewAudioFile(file);
    if (!validation.ok) {
      showToast(validation.error, "error");
      return;
    }
    setAudioTranscribing(true);
    try {
      const path = buildInterviewAudioPath({ locationId, interviewId: selectedRecord.id, fileName: file.name });
      const contentType = validation.contentType || getInterviewAudioContentType(file);
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(path, file, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      setAudioFileName(file.name);

      const { data: result, error } = await supabase.functions.invoke("interview-transcribe-audio", {
        body: {
          interview_id: selectedRecord.id,
          audio_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          audio_file_path: path,
          audio_file_name: file.name,
          audio_mime_type: contentType,
        },
      });
      if (error) throw error;
      if (!result?.transcript_text) throw new Error("Grok returned no transcript text.");

      const minutes = Number(result.duration_seconds) > 0 ? Math.max(1, Math.round(Number(result.duration_seconds) / 60)) : null;
      showToast(minutes ? `Grok transcribed ${minutes} min of audio` : "Grok transcribed the audio");
      await loadAll(locationId);
      setSelectedRecordId(selectedRecord.id);
    } catch (error) {
      showToast(error?.message || "Failed to transcribe audio", "error");
    } finally {
      setAudioTranscribing(false);
    }
  };

  const runAiDraft = async () => {
    if (!selectedRecord?.id || !String(selectedRecord.transcript_text || "").trim()) {
      showToast("Paste or upload a transcript before generating drafts.", "error");
      return;
    }
    setAiDrafting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("interview-ai-draft", {
        body: { interview_id: selectedRecord.id },
      });
      if (error) throw error;
      showToast(`Grok drafted ${result?.saved_count || 0} response${result?.saved_count === 1 ? "" : "s"}`);
      await loadAll(locationId);
      setSelectedRecordId(selectedRecord.id);
    } catch (error) {
      showToast(error?.message || "Grok draft failed", "error");
    } finally {
      setAiDrafting(false);
    }
  };

  const exportFinalPdf = async () => {
    const path = selectedSnapshot?.version?.source_pdf_path;
    const bucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!selectedRecord?.id || !path) return;
    setExportingPdf(true);
    try {
      const { data: sourceBlob, error: downloadError } = await supabase.storage.from(bucket).download(path);
      if (downloadError) throw downloadError;
      const bytes = await sourceBlob.arrayBuffer();
      const filledBytes = await fillInterviewPdfBytes(bytes, buildPdfResponseMap(responses), { flatten: true });
      const outputName = `${selectedRecord.candidate_full_name.replace(/[^a-z0-9]+/gi, "-") || "candidate"}-interview.pdf`;
      const artifactPath = buildInterviewArtifactPath({ locationId, interviewId: selectedRecord.id, fileName: outputName });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(artifactPath, new Blob([filledBytes], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      const { data: artifact, error: artifactError } = await supabase
        .from("labor_interview_artifacts")
        .insert({
          interview_id: selectedRecord.id,
          artifact_type: "final_pdf",
          file_name: outputName,
          storage_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          storage_path: artifactPath,
          mime_type: "application/pdf",
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        })
        .select("*")
        .single();
      if (artifactError) throw artifactError;
      setArtifacts((prev) => [artifact, ...prev]);
      await saveRecordPatch({ status: "completed" });
      showToast("Final PDF exported");
    } catch (error) {
      showToast(error?.message || "Failed to export PDF", "error");
    } finally {
      setExportingPdf(false);
    }
  };

  const uploadTemplatePdf = async (version, file) => {
    if (!version || !file || version.status !== "draft") return;
    setTemplateActionId(version.id);
    try {
      const bytes = await file.arrayBuffer();
      const verification = await extractPdfFieldManifest(bytes);
      if (verification.status === "failed_invalid_pdf") {
        await supabase.from("labor_interview_template_versions").update({
          pdf_verification_status: verification.status,
          pdf_field_manifest: [],
          pdf_page_count: null,
        }).eq("id", version.id);
        throw new Error(verification.error || "Invalid PDF file.");
      }
      const path = buildInterviewTemplatePdfPath({
        locationId,
        templateId: version.template_id,
        versionNo: version.version_no,
        fileName: file.name,
      });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
      if (uploadError) throw uploadError;
      const { data: updated, error } = await supabase
        .from("labor_interview_template_versions")
        .update({
          source_pdf_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          source_pdf_path: path,
          source_pdf_file_name: file.name,
          source_pdf_mime_type: file.type || "application/pdf",
          source_pdf_file_size_bytes: file.size,
          pdf_page_count: verification.pageCount,
          pdf_field_manifest: verification.manifest,
          pdf_verification_status: verification.status,
          metadata: {
            ...(version.metadata || {}),
            verified_at: new Date().toISOString(),
            verified_by: actorUserId,
          },
        })
        .eq("id", version.id)
        .select("*")
        .single();
      if (error) throw error;
      setVersions((prev) => prev.map((row) => row.id === updated.id ? updated : row));
      showToast(verification.ok ? `PDF verified with ${verification.manifest.length} field${verification.manifest.length === 1 ? "" : "s"}` : "PDF uploaded but no form fields were found", verification.ok ? "success" : "error");
    } catch (error) {
      showToast(error?.message || "Failed to upload PDF", "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const publishVersion = async (template, version) => {
    if (!template || !version || version.pdf_verification_status !== "verified_fields") return;
    setTemplateActionId(version.id);
    try {
      const snapshot = buildInterviewTemplateSnapshot({
        template,
        version,
        questions: questionsByVersion[version.id] || [],
      });
      await supabase
        .from("labor_interview_template_versions")
        .update({ is_current: false })
        .eq("template_id", template.id);
      const { data: updated, error } = await supabase
        .from("labor_interview_template_versions")
        .update({
          status: "published",
          is_current: true,
          published_at: new Date().toISOString(),
          published_snapshot: snapshot,
        })
        .eq("id", version.id)
        .select("*")
        .single();
      if (error) throw error;
      setVersions((prev) => prev.map((row) => {
        if (row.template_id === template.id && row.id !== version.id) return { ...row, is_current: false };
        return row.id === version.id ? updated : row;
      }));
      showToast(`${template.role_label} template published`);
    } catch (error) {
      showToast(error?.message || "Failed to publish template", "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const createDraftVersion = async (template) => {
    const templateVersions = versionsByTemplate[template.id] || [];
    const baseVersion = templateVersions.find((version) => version.is_current) || templateVersions[0];
    const nextNo = Math.max(0, ...templateVersions.map((version) => Number(version.version_no || 0))) + 1;
    setTemplateActionId(template.id);
    try {
      const { data: created, error } = await supabase
        .from("labor_interview_template_versions")
        .insert({
          template_id: template.id,
          version_no: nextNo,
          status: "draft",
          is_current: false,
          source_pdf_bucket: baseVersion?.source_pdf_bucket || null,
          source_pdf_path: baseVersion?.source_pdf_path || null,
          source_pdf_file_name: baseVersion?.source_pdf_file_name || null,
          source_pdf_mime_type: baseVersion?.source_pdf_mime_type || null,
          source_pdf_file_size_bytes: baseVersion?.source_pdf_file_size_bytes || null,
          pdf_page_count: baseVersion?.pdf_page_count || null,
          pdf_field_manifest: baseVersion?.pdf_field_manifest || [],
          pdf_verification_status: baseVersion?.pdf_verification_status || "missing_pdf",
          changelog: `Draft copied from version ${baseVersion?.version_no || 1}.`,
          created_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      const baseQuestions = baseVersion ? (questionsByVersion[baseVersion.id] || []) : [];
      if (baseQuestions.length) {
        const clonedQuestions = baseQuestions.map((question) => ({
          template_version_id: created.id,
          question_key: question.question_key,
          category: question.category,
          prompt: question.prompt,
          helper_text: question.helper_text,
          sequence_order: question.sequence_order,
          required: question.required,
          answer_format: question.answer_format,
          mapped_pdf_field_name: question.mapped_pdf_field_name,
          metadata: question.metadata || {},
        }));
        const { error: cloneError } = await supabase.from("labor_interview_template_questions").insert(clonedQuestions);
        if (cloneError) throw cloneError;
      }
      await loadAll(locationId);
      showToast(`Draft version ${nextNo} created`);
    } catch (error) {
      showToast(error?.message || "Failed to create draft", "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const saveQuestion = async (question) => {
    const draft = questionDrafts[question.id] || {};
    try {
      const { data: updated, error } = await supabase
        .from("labor_interview_template_questions")
        .update({
          category: draft.category ?? question.category,
          prompt: draft.prompt ?? question.prompt,
          helper_text: draft.helper_text ?? question.helper_text,
          required: !!(draft.required ?? question.required),
          mapped_pdf_field_name: draft.mapped_pdf_field_name ?? question.mapped_pdf_field_name,
        })
        .eq("id", question.id)
        .select("*")
        .single();
      if (error) throw error;
      setQuestions((prev) => prev.map((row) => row.id === updated.id ? updated : row));
      showToast("Question saved");
    } catch (error) {
      showToast(error?.message || "Failed to save question", "error");
    }
  };

  const addQuestion = async (version) => {
    const draft = newQuestionDrafts[version.id] || {};
    const prompt = String(draft.prompt || "").trim();
    if (!prompt) return;
    const existing = questionsByVersion[version.id] || [];
    const sequence = Math.max(0, ...existing.map((question) => Number(question.sequence_order || 0))) + 10;
    try {
      const { data: created, error } = await supabase
        .from("labor_interview_template_questions")
        .insert({
          template_version_id: version.id,
          question_key: normalizeQuestionKey(prompt, existing.length),
          category: draft.category || "Custom",
          prompt,
          sequence_order: sequence,
          required: !!draft.required,
          answer_format: "long_text",
          mapped_pdf_field_name: draft.mapped_pdf_field_name || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      setQuestions((prev) => [...prev, created]);
      setNewQuestionDrafts((prev) => ({ ...prev, [version.id]: { category: "Custom", prompt: "", mapped_pdf_field_name: "" } }));
      showToast("Question added");
    } catch (error) {
      showToast(error?.message || "Failed to add question", "error");
    }
  };

  const deleteQuestion = async (question) => {
    if (!window.confirm("Delete this draft question? Published interviews and old records will not be changed.")) return;
    try {
      const { error } = await supabase.from("labor_interview_template_questions").delete().eq("id", question.id);
      if (error) throw error;
      setQuestions((prev) => prev.filter((row) => row.id !== question.id));
      showToast("Question deleted");
    } catch (error) {
      showToast(error?.message || "Failed to delete question", "error");
    }
  };

  const moveQuestion = async (versionId, question, direction) => {
    const rows = [...(questionsByVersion[versionId] || [])].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
    const index = rows.findIndex((row) => row.id === question.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= rows.length) return;
    const swap = rows[swapIndex];
    try {
      await Promise.all([
        supabase.from("labor_interview_template_questions").update({ sequence_order: swap.sequence_order }).eq("id", question.id),
        supabase.from("labor_interview_template_questions").update({ sequence_order: question.sequence_order }).eq("id", swap.id),
      ]);
      setQuestions((prev) => prev.map((row) => {
        if (row.id === question.id) return { ...row, sequence_order: swap.sequence_order };
        if (row.id === swap.id) return { ...row, sequence_order: question.sequence_order };
        return row;
      }));
    } catch (error) {
      showToast(error?.message || "Failed to reorder question", "error");
    }
  };

  const templateOptions = useMemo(() => {
    return publishedVersions.map((version) => {
      const template = templates.find((row) => row.id === version.template_id);
      return {
        value: version.id,
        label: `${template?.role_label || "Role"} - v${version.version_no}`,
      };
    });
  }, [publishedVersions, templates]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 50, color: C.textMut }}>Loading interviews...</div>;
  }

  if (!locationId) {
    return <EmptyState title="Location Required" body="Labor interviews need a resolved location before templates, records, and private PDFs can be loaded." />;
  }

  if (schemaError) {
    return <EmptyState title="Interview Tables Pending" body={schemaError} />;
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Metric label="Interviews" value={metrics.total} helper={locationName || data?.locationName || "Current location"} />
        <Metric label="AI Drafts" value={metrics.aiDrafted} helper="Waiting on manager review" />
        <Metric label="Completed" value={metrics.completed} helper="Final PDF exported" />
        <Metric label="Verified PDFs" value={metrics.verifiedTemplates} helper="AcroForm templates" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div style={{ display: "inline-flex", border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {[
            { id: "records", label: "Interviews" },
            { id: "config", label: "Configuration" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              style={{
                border: "none",
                borderRight: item.id === "records" ? `1px solid ${C.border}` : "none",
                background: view === item.id ? C.pri : C.surface,
                color: view === item.id ? "#fff" : C.textSec,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Btn variant="primary" onClick={() => setShowNewInterview(true)} disabled={templateOptions.length === 0}>Add New Interview</Btn>
      </div>

      {view === "records" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 10 }}>
            {records.length === 0 && <EmptyState title="No Interviews Yet" body={templateOptions.length ? "Create the first interview from a published role template." : "Publish at least one verified role template before interviews can be created."} />}
            {records.map((record) => (
              <Card
                key={record.id}
                hoverable
                onClick={() => setSelectedRecordId(record.id)}
                style={{
                  borderRadius: 10,
                  padding: 16,
                  borderColor: selectedRecord?.id === record.id ? C.pri : C.border,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{record.candidate_full_name}</div>
                    <div style={{ fontSize: 12, color: C.textMut, marginTop: 3 }}>{record.candidate_position || getInterviewRoleLabel(record.template_snapshot?.template?.role_key)}</div>
                  </div>
                  <Badge color={STATUS_BADGE_COLORS[record.status] || "default"}>{LABOR_INTERVIEW_STATUS_LABELS[record.status] || record.status}</Badge>
                </div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 12 }}>{compactDateTime(record)}</div>
              </Card>
            ))}
          </div>

          {selectedRecord ? (
            <div style={{ display: "grid", gap: 16 }}>
              <Card style={{ borderRadius: 10 }}>
                <SectionHeading
                  title={selectedRecord.candidate_full_name}
                  detail={`${selectedRecord.candidate_position || "Interview"} - ${compactDateTime(selectedRecord)}`}
                  action={<Badge color={STATUS_BADGE_COLORS[selectedRecord.status] || "default"}>{LABOR_INTERVIEW_STATUS_LABELS[selectedRecord.status] || selectedRecord.status}</Badge>}
                />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
                  <Inp label="Email" value={selectedRecord.candidate_email || ""} onChange={(value) => setRecords((prev) => prev.map((row) => row.id === selectedRecord.id ? { ...row, candidate_email: value } : row))} onBlur={() => {}} />
                  <Inp label="Phone" value={selectedRecord.candidate_phone || ""} onChange={(value) => setRecords((prev) => prev.map((row) => row.id === selectedRecord.id ? { ...row, candidate_phone: value } : row))} />
                  <Inp label="Interviewer" value={selectedRecord.interviewer_name || ""} onChange={(value) => setRecords((prev) => prev.map((row) => row.id === selectedRecord.id ? { ...row, interviewer_name: value } : row))} />
                  <Inp label="Status" type="select" value={selectedRecord.status || "draft"} onChange={(value) => saveRecordPatch({ status: value })} options={Object.entries(LABOR_INTERVIEW_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 160px", gap: 12, marginTop: 12 }}>
                  <Inp label="Zoom Recording Link" value={selectedRecord.zoom_recording_url || ""} onChange={(value) => setRecords((prev) => prev.map((row) => row.id === selectedRecord.id ? { ...row, zoom_recording_url: value } : row))} />
                  <Inp label="Passcode" value={selectedRecord.zoom_passcode || ""} onChange={(value) => setRecords((prev) => prev.map((row) => row.id === selectedRecord.id ? { ...row, zoom_passcode: value } : row))} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <Btn variant="secondary" onClick={() => saveRecordPatch({
                    candidate_email: selectedRecord.candidate_email || null,
                    candidate_phone: selectedRecord.candidate_phone || null,
                    interviewer_name: selectedRecord.interviewer_name || null,
                    zoom_recording_url: selectedRecord.zoom_recording_url || null,
                    zoom_passcode: selectedRecord.zoom_passcode || null,
                  })} disabled={recordSaving}>{recordSaving ? "Saving..." : "Save Metadata"}</Btn>
                </div>
              </Card>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.95fr) minmax(360px, 1.05fr)", gap: 16, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 16 }}>
                  <Card style={{ borderRadius: 10 }}>
                    <SectionHeading title="Transcript and Grok Draft" detail="Drafting is limited to the saved transcript." />
                    <Inp
                      label="Transcript"
                      type="textarea"
                      rows={7}
                      value={selectedRecord.transcript_text || ""}
                      onChange={(value) => setRecords((prev) => prev.map((row) => row.id === selectedRecord.id ? { ...row, transcript_text: value } : row))}
                      placeholder="Paste Zoom transcript text here."
                    />
                    <div style={{ display: "grid", gap: 4, marginTop: 10, fontSize: 12, color: C.textMut }}>
                      <div>{audioFileName || selectedAudioTranscription?.source_audio?.file_name || "No audio file uploaded"}</div>
                      {selectedAudioTranscription?.provider && (
                        <div>
                          {selectedAudioTranscription.provider === "xai" ? "Grok STT" : selectedAudioTranscription.provider}
                          {selectedAudioTranscription.duration_seconds ? ` • ${Math.round(selectedAudioTranscription.duration_seconds / 60)} min` : ""}
                          {selectedAudioTranscription.generated_at ? ` • ${fmtDate(selectedAudioTranscription.generated_at)}` : ""}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", marginTop: 12, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, color: C.textMut }}>{transcriptFileName || selectedRecord.transcript_file_path || "No transcript file uploaded"}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input ref={audioInputRef} type="file" accept={INTERVIEW_AUDIO_ACCEPT} style={{ display: "none" }} onChange={(event) => { handleAudioUpload(event.target.files?.[0]); event.target.value = ""; }} />
                        <input ref={transcriptInputRef} type="file" accept={INTERVIEW_TRANSCRIPT_ACCEPT} style={{ display: "none" }} onChange={(event) => { handleTranscriptUpload(event.target.files?.[0]); event.target.value = ""; }} />
                        <Btn variant="secondary" size="sm" disabled={audioTranscribing} onClick={() => audioInputRef.current?.click()}>{audioTranscribing ? "Transcribing..." : "Upload Audio"}</Btn>
                        <Btn variant="secondary" size="sm" onClick={() => transcriptInputRef.current?.click()}>Upload Transcript</Btn>
                        <Btn variant="secondary" size="sm" onClick={() => saveRecordPatch({ transcript_text: selectedRecord.transcript_text || null })}>Save Transcript</Btn>
                        <Btn variant="primary" size="sm" disabled={aiDrafting || audioTranscribing || !String(selectedRecord.transcript_text || "").trim()} onClick={runAiDraft}>{aiDrafting ? "Drafting..." : "Generate With Grok"}</Btn>
                      </div>
                    </div>
                  </Card>

                  <Card style={{ borderRadius: 10 }}>
                    <SectionHeading title="Custom Questions" detail={`${selectedQuestions.length} question${selectedQuestions.length === 1 ? "" : "s"} pinned to this interview version`} />
                    {Object.entries(groupQuestionsByCategory(selectedQuestions)).map(([category, rows]) => (
                      <div key={category} style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{category}</div>
                        <div style={{ display: "grid", gap: 10 }}>
                          {rows.map((question) => {
                            const key = responseKeyForQuestion(question);
                            return (
                              <div key={question.question_key} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 12, background: C.surfaceHover }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{question.prompt}</div>
                                  {responsesByTarget[key]?.ai_draft_text && <Badge color="warning">AI Draft</Badge>}
                                </div>
                                <textarea
                                  value={responseDrafts[key] || ""}
                                  onChange={(event) => setResponseDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                                  onBlur={(event) => saveResponse({ responseType: "custom_question", key: question.question_key, prompt: question.prompt, value: event.target.value })}
                                  rows={4}
                                  style={{ width: "100%", boxSizing: "border-box", marginTop: 8, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 10, resize: "vertical", fontFamily: "inherit", fontSize: 13, lineHeight: 1.45, color: C.text, outline: "none" }}
                                />
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: C.textMut, fontSize: 11 }}>
                                  <span>Autosaves on blur</span>
                                  <span>{savingResponseKey === key ? "Saving..." : "Saved by field key"}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                  <Card style={{ borderRadius: 10 }}>
                    <SectionHeading
                      title="Branded PDF"
                      detail="Responses are saved by AcroForm field name and exported into PDF-native coordinates."
                      action={<Btn variant="success" size="sm" onClick={exportFinalPdf} disabled={exportingPdf || !selectedSnapshot?.version?.source_pdf_path}>{exportingPdf ? "Exporting..." : "Export Final PDF"}</Btn>}
                    />
                    {pdfPreviewUrl ? (
                      <iframe title="Interview PDF Preview" src={pdfPreviewUrl} style={{ width: "100%", height: 540, border: `1px solid ${C.border}`, borderRadius: 10, background: C.surfaceHover }} />
                    ) : (
                      <EmptyState title="No PDF Source" body="This interview was pinned to a template that does not have a verified source PDF path." />
                    )}
                    {artifacts.length > 0 && (
                      <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                        {artifacts.map((artifact) => (
                          <div key={artifact.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, color: C.textSec, borderTop: `1px solid ${C.borderLight}`, paddingTop: 8 }}>
                            <span>{artifact.file_name}</span>
                            <span>{artifact.created_at ? new Date(artifact.created_at).toLocaleString() : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card style={{ borderRadius: 10 }}>
                    <SectionHeading title="PDF Fields" detail={`${selectedPdfFields.length} field${selectedPdfFields.length === 1 ? "" : "s"} detected in the template`} />
                    <div style={{ display: "grid", gap: 10 }}>
                      {selectedPdfFields.map((field) => {
                        const key = responseKeyForPdfField(field);
                        return (
                          <div key={field.name} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 12, background: C.surfaceHover }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{field.name}</div>
                                <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{getPdfFieldTypeLabel(field.type)}{field.page_number ? ` - page ${field.page_number}` : ""}</div>
                              </div>
                              {responsesByTarget[key]?.ai_draft_text && <Badge color="warning">AI Draft</Badge>}
                            </div>
                            <textarea
                              value={responseDrafts[key] || ""}
                              onChange={(event) => setResponseDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                              onBlur={(event) => saveResponse({ responseType: "pdf_field", key: field.name, prompt: field.name, value: event.target.value })}
                              rows={field.type === "text" ? 3 : 1}
                              style={{ width: "100%", boxSizing: "border-box", marginTop: 8, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 10, resize: "vertical", fontFamily: "inherit", fontSize: 13, lineHeight: 1.45, color: C.text, outline: "none" }}
                            />
                            <div style={{ marginTop: 6, color: C.textMut, fontSize: 11 }}>{savingResponseKey === key ? "Saving..." : "Saved by PDF field name"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState title="Select An Interview" body="Choose an interview record to edit responses, run Grok drafting, and export the final branded PDF." />
          )}
        </div>
      )}

      {view === "config" && (
        <div style={{ display: "grid", gap: 16 }}>
          <SectionHeading title="Interview Configuration" detail="Published versions are immutable. Draft changes only affect future interviews after publish." />
          {templates.map((template) => {
            const templateVersions = versionsByTemplate[template.id] || [];
            const current = templateVersions.find((version) => version.is_current);
            return (
              <Card key={template.id} style={{ borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: C.text }}>{template.role_label}</div>
                    <div style={{ fontSize: 12, color: C.textMut, marginTop: 3 }}>{current ? `Current published v${current.version_no}` : "No published version yet"}</div>
                  </div>
                  <Btn variant="secondary" size="sm" onClick={() => createDraftVersion(template)} disabled={templateActionId === template.id}>{templateActionId === template.id ? "Creating..." : "New Draft Version"}</Btn>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  {templateVersions.map((version) => {
                    const versionQuestions = [...(questionsByVersion[version.id] || [])].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
                    const editable = version.status === "draft";
                    const pdfFields = Array.isArray(version.pdf_field_manifest) ? version.pdf_field_manifest : [];
                    const addDraft = newQuestionDrafts[version.id] || { category: "Custom", prompt: "", mapped_pdf_field_name: "" };
                    return (
                      <div key={version.id} style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>Version {version.version_no}</div>
                            <Badge color={TEMPLATE_STATUS_COLORS[version.status] || "default"}>{LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS[version.status] || version.status}</Badge>
                            <Badge color={VERIFY_STATUS_COLORS[version.pdf_verification_status] || "default"}>{PDF_VERIFICATION_LABELS[version.pdf_verification_status] || version.pdf_verification_status}</Badge>
                            <span style={{ fontSize: 12, color: C.textMut }}>{pdfFields.length} PDF field{pdfFields.length === 1 ? "" : "s"} / {versionQuestions.length} question{versionQuestions.length === 1 ? "" : "s"}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              ref={(node) => { if (node) pdfInputRefs.current[version.id] = node; }}
                              type="file"
                              accept={INTERVIEW_PDF_ACCEPT}
                              style={{ display: "none" }}
                              disabled={!editable}
                              onChange={(event) => uploadTemplatePdf(version, event.target.files?.[0])}
                            />
                            <Btn variant="secondary" size="sm" onClick={() => pdfInputRefs.current[version.id]?.click()} disabled={!editable || templateActionId === version.id}>Upload PDF</Btn>
                            <Btn variant="primary" size="sm" onClick={() => publishVersion(template, version)} disabled={!editable || version.pdf_verification_status !== "verified_fields" || templateActionId === version.id}>Publish</Btn>
                          </div>
                        </div>

                        {version.source_pdf_file_name && (
                          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 10 }}>PDF: {version.source_pdf_file_name}{version.pdf_page_count ? ` - ${version.pdf_page_count} page${version.pdf_page_count === 1 ? "" : "s"}` : ""}</div>
                        )}

                        <div style={{ display: "grid", gap: 8 }}>
                          {versionQuestions.map((question, index) => {
                            const draft = questionDrafts[question.id] || question;
                            return (
                              <div key={question.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr) minmax(120px, 180px) auto", gap: 8, alignItems: "start", padding: 10, borderRadius: 10, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
                                <Inp label="Category" value={draft.category || ""} disabled={!editable} onChange={(value) => setQuestionDrafts((prev) => ({ ...prev, [question.id]: { ...draft, category: value } }))} />
                                <Inp label="Question" type="textarea" rows={2} value={draft.prompt || ""} disabled={!editable} onChange={(value) => setQuestionDrafts((prev) => ({ ...prev, [question.id]: { ...draft, prompt: value } }))} />
                                <Inp label="PDF Field" value={draft.mapped_pdf_field_name || ""} disabled={!editable} onChange={(value) => setQuestionDrafts((prev) => ({ ...prev, [question.id]: { ...draft, mapped_pdf_field_name: value } }))} />
                                <div style={{ display: "grid", gap: 6, paddingTop: 18 }}>
                                  <Btn variant="secondary" size="sm" disabled={!editable || index === 0} onClick={() => moveQuestion(version.id, question, -1)}>Up</Btn>
                                  <Btn variant="secondary" size="sm" disabled={!editable || index === versionQuestions.length - 1} onClick={() => moveQuestion(version.id, question, 1)}>Down</Btn>
                                  <Btn variant="primary" size="sm" disabled={!editable} onClick={() => saveQuestion(question)}>Save</Btn>
                                  <Btn variant="danger" size="sm" disabled={!editable} onClick={() => deleteQuestion(question)}>Delete</Btn>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {editable && (
                          <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr) 180px auto", gap: 8, alignItems: "end", marginTop: 10, padding: 10, border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                            <Inp label="Category" value={addDraft.category || ""} onChange={(value) => setNewQuestionDrafts((prev) => ({ ...prev, [version.id]: { ...addDraft, category: value } }))} />
                            <Inp label="New Question" value={addDraft.prompt || ""} onChange={(value) => setNewQuestionDrafts((prev) => ({ ...prev, [version.id]: { ...addDraft, prompt: value } }))} />
                            <Inp label="PDF Field" value={addDraft.mapped_pdf_field_name || ""} onChange={(value) => setNewQuestionDrafts((prev) => ({ ...prev, [version.id]: { ...addDraft, mapped_pdf_field_name: value } }))} />
                            <Btn variant="secondary" onClick={() => addQuestion(version)}>Add</Btn>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showNewInterview && (
        <Modal title="Add New Interview" onClose={() => setShowNewInterview(false)} wide>
          {templateOptions.length === 0 ? (
            <EmptyState title="No Published Templates" body="Upload Acrobat-prepared PDFs, verify fields, and publish a role template before creating interview records." />
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <CustomSelect
                value={newInterviewDraft.template_version_id}
                onChange={(value) => {
                  const version = versions.find((row) => row.id === value);
                  const template = templates.find((row) => row.id === version?.template_id);
                  setNewInterviewDraft((prev) => ({
                    ...prev,
                    template_version_id: value,
                    candidate_position: template?.role_label || prev.candidate_position,
                  }));
                }}
                options={templateOptions}
                placeholder="Select published role template"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Inp label="Candidate Name" required value={newInterviewDraft.candidate_full_name} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_full_name: value }))} autoFocus />
                <Inp label="Position" value={newInterviewDraft.candidate_position} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_position: value }))} />
                <Inp label="Email" value={newInterviewDraft.candidate_email} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_email: value }))} />
                <Inp label="Phone" value={newInterviewDraft.candidate_phone} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, candidate_phone: value }))} />
                <Inp label="Interview Date" type="date" value={newInterviewDraft.interview_date} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, interview_date: value }))} />
                <Inp label="Interview Time" type="time" value={newInterviewDraft.interview_time} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, interview_time: value }))} />
                <Inp label="Interviewer" value={newInterviewDraft.interviewer_name} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, interviewer_name: value }))} />
                <Inp label="Zoom Passcode" value={newInterviewDraft.zoom_passcode} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, zoom_passcode: value }))} />
              </div>
              <Inp label="Zoom Recording Link" value={newInterviewDraft.zoom_recording_url} onChange={(value) => setNewInterviewDraft((prev) => ({ ...prev, zoom_recording_url: value }))} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <Btn variant="secondary" onClick={() => setShowNewInterview(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={createNewInterview} disabled={savingNewInterview}>{savingNewInterview ? "Creating..." : "Create Interview"}</Btn>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
