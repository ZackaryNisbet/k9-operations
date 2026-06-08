import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, CustomSelect, Inp, Modal, LaborSearchBar, LaborIntro } from "../../shared/ui";
import { LABOR_INTRO_DEFAULTS } from "../laborIntros";
import {
  buildInterviewAudioPath,
  buildInterviewArtifactPath,
  buildInterviewResumePath,
  buildInterviewTemplatePdfPath,
  buildInterviewTranscriptPath,
  buildInterviewTemplateSnapshot,
  buildPdfResponseMap,
  cleanInterviewTranscriptText,
  countInterviewPdfPages,
  extractPdfFieldManifest,
  fillInterviewPdfBytes,
  formatInterviewPayRateRange,
  formatInterviewPayRateSummary,
  getInterviewDraftResponseText,
  getInterviewPdfFieldDisplayRect,
  getInterviewOfficialResponseText,
  getInterviewResponseState,
  getInterviewTranscriptTurns,
  getInterviewRecommendation,
  getInterviewRecommendationOption,
  getInterviewAudioContentType,
  getInterviewRoleLabel,
  sanitizeInterviewFileName,
  INTERVIEW_AI_REVIEW_MODES,
  INTERVIEW_AI_REVIEW_MODE_LABELS,
  INTERVIEW_AUDIO_ACCEPT,
  INTERVIEW_PDF_ACCEPT,
  INTERVIEW_RECOMMENDATION_OPTIONS,
  INTERVIEW_RESPONSE_STATES,
  INTERVIEW_RESUME_ACCEPT,
  INTERVIEW_TRANSCRIPT_ACCEPT,
  LABOR_INTERVIEW_DOCUMENT_BUCKET,
  LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS,
  canAccessInterviewIdentity,
  getInterviewCandidateContactLabel,
  getInterviewCandidateDisplayLabel,
  isInterviewResponseReviewed,
  normalizeInterviewCandidateDraft,
  normalizeInterviewPayRates,
  normalizeQuestionKey,
  pdfFieldsFromSnapshot,
  questionRowsFromSnapshot,
  redactInterviewRecordForIdentityAccess,
  shouldNormalizeInterviewAudioForStt,
  validateInterviewAudioFile,
  validateInterviewResumeFile,
} from "../interviewData";
import { normalizeOptionalUuid, resolveTrainingLocationId } from "../trainingData";
import {
  CUSTOM_SUMMARY_SECTION_PREFIX,
  DOCUMENT_PDF_INSTRUCTION_KEY,
  GUIDE_AI_WORK_STEPS,
  INTERVIEW_WAVEFORM_BAR_COUNT,
  INTERVIEW_WAVEFORM_DECODE_MAX_BYTES,
  INTERVIEW_WAVEFORM_DECODE_MAX_SECONDS,
  PDF_POINT_TO_CSS_PX,
  SUMMARY_SECTION_KEYS,
} from "./laborInterviews/constants";
import {
  buildExportPdfFieldMap,
  buildGuideAiCompletionBullets,
  buildInterviewSummaryPages,
  buildLegacyGuideFromRecord,
  buildLiveTranscriptLines,
  buildNewInterviewDraft,
  buildNewPositionDraft,
  buildPayRateMetadata,
  buildPdfReviewItems,
  buildTranscriptTimelineWaveBars,
  chunkProviderWords,
  compactDateTime,
  composePdfReviewItemValue,
  computeOverallScoreFromPdfMap,
  createCustomSummaryPageId,
  customSummarySectionKey,
  draftMapsEqual,
  extractAudioWaveformBars,
  extractPdfQuestionPromptMap,
  fieldKey,
  fieldValueRows,
  findActiveTranscriptLineIndex,
  fitPdfFieldValueForSlot,
  formatDuration,
  formatFileSize,
  formatPlaybackTime,
  getAutoScoreStorageKey,
  getInterviewAudioPlaybackCandidates,
  getPdfFieldOverlayStyle,
  getPdfFieldPageSize,
  getPdfFieldValueOverlayStyle,
  getPdfPageOverlayBox,
  getResponseDraft,
  getStoredCustomSummaryPages,
  getStoredSummaryEdits,
  getStoredTranscriptSummaryBullets,
  getTranscriptLineProgress,
  getTranscriptSearchResults,
  humanizePdfFieldName,
  isEditableSummarySectionKey,
  isInterviewRpcMissing,
  isPdfResumeArtifact,
  isSignedAudioUrlReadable,
  isTurnActive,
  mapResponsesByTarget,
  normalizeAiReviewMode,
  normalizeCustomSummaryPageId,
  normalizeInterviewAudioForSttOnServer,
  normalizeRpcArray,
  normalizeTranscriptSearch,
  paginateInterviewSummaryPreview,
  payRatesFromVersion,
  questionPartLabel,
  questionPartShortLabel,
  readAutoScoreSetting,
  readEdgeFunctionError,
  responseKeyForPdfField,
  responseKeyForQuestion,
  reviewModeDraftInstruction,
  safeUiError,
  seededWaveBars,
  shouldDecodeAudioWaveform,
  sleep,
  snapshotForGuide,
  splitPdfReviewItemValue,
  summaryBulletsToText,
  summarySectionKey,
  summaryTextToBullets,
  wordMatchesSearch,
  wordsFromProviderSegments,
} from "./laborInterviews/helpers";
import { InterviewStyles } from "./laborInterviews/components/InterviewStyles";
import { SectionHeading } from "./laborInterviews/components/SectionHeading";
import { EmptyState } from "./laborInterviews/components/EmptyState";
import { TranscriptWords } from "./laborInterviews/components/TranscriptWords";
import { IconButton } from "./laborInterviews/components/IconButton";
import { RecommendationBadge } from "./laborInterviews/components/RecommendationBadge";
import { InterviewSummaryPreviewPage } from "./laborInterviews/components/InterviewSummaryPreviewPage";
import { StaticField } from "./laborInterviews/components/StaticField";
import { InterviewWorkspaceTabs } from "./laborInterviews/components/InterviewWorkspaceTabs";
import { MergeTrace } from "./laborInterviews/components/MergeTrace";
import { SegmentedRecommendation } from "./laborInterviews/components/SegmentedRecommendation";
import { ResumePanel } from "./laborInterviews/components/ResumePanel";
import { InterviewRoster } from "./laborInterviews/components/InterviewRoster";
import { CandidateHeader } from "./laborInterviews/components/CandidateHeader";
import { RestrictedInterviewDetail } from "./laborInterviews/components/RestrictedInterviewDetail";
import { TranscriptModal } from "./laborInterviews/components/TranscriptModal";
import { PdfFieldClickLayer } from "./laborInterviews/components/PdfFieldClickLayer";
import { PdfFieldValueLayer } from "./laborInterviews/components/PdfFieldValueLayer";
import { PdfGuidePreview } from "./laborInterviews/components/PdfGuidePreview";
import { GuideAiAssistantPanel } from "./laborInterviews/components/GuideAiAssistantPanel";
import { NewInterviewModal } from "./laborInterviews/components/NewInterviewModal";
import { ResumeWorkspaceModal } from "./laborInterviews/components/ResumeWorkspaceModal";
import { LiveTranscriptPanel } from "./laborInterviews/components/LiveTranscriptPanel";
import { AudioUploadPanel } from "./laborInterviews/components/AudioUploadPanel";
import { ReviewGuideModal } from "./laborInterviews/components/ReviewGuideModal";
import { QuestionReviewModal } from "./laborInterviews/components/QuestionReviewModal";


function useStorageObjectPreviewUrl({ bucket, path, versionKey = "", setPreviewUrl, enabled = true }) {
  useEffect(() => {
    if (!enabled || !bucket || !path) {
      setPreviewUrl("");
      return undefined;
    }
    let active = true;
    let objectUrl = "";
    setPreviewUrl("");

    async function loadPreview() {
      try {
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (!active) return;
        if (error) throw error;
        if (!data || typeof URL === "undefined" || !URL.createObjectURL) {
          setPreviewUrl("");
          return;
        }
        objectUrl = URL.createObjectURL(data);
        setPreviewUrl(objectUrl);
      } catch (_) {
        if (active) setPreviewUrl("");
      }
    }

    loadPreview();
    return () => {
      active = false;
      if (objectUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [bucket, enabled, path, versionKey, setPreviewUrl]);
}

export default function LaborInterviewsPage({ data, profile, addGlobalToast, locationName, embedded = false, viewPreset = null, recordIdPreset = "", canManage = true, onViewChange = null, onRecordChange = null, onDetailChange = null, searchSlot = null, introValue = "", canEditIntro = false, onSaveIntro = null }) {
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const locationRef = profile?.location_id || data?.locationId || "";
  const [locationId, setLocationId] = useState("");
  const [view, setView] = useState(viewPreset || "records");
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [records, setRecords] = useState([]);
  const [guides, setGuides] = useState([]);
  const [responses, setResponses] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [selectedRecordId, setSelectedRecordIdState] = useState(() => String(recordIdPreset || ""));
  const [showNewInterview, setShowNewInterview] = useState(false);
  const [showCandidateEdit, setShowCandidateEdit] = useState(false);
  const [candidateEditDraft, setCandidateEditDraft] = useState(() => buildNewInterviewDraft());
  const [showActiveInterview, setShowActiveInterview] = useState(false);
  const [activeInterviewPane, setActiveInterviewPane] = useState("guide");
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState("");
  const [guideAttachVersionId, setGuideAttachVersionId] = useState("");
  const [aiReviewMode, setAiReviewMode] = useState("literal");
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [pdfReviewIndex, setPdfReviewIndex] = useState(0);
  const [configQuestionsOpen, setConfigQuestionsOpen] = useState(false);
  const [showNewPosition, setShowNewPosition] = useState(false);
  const [newPositionDraft, setNewPositionDraft] = useState(() => buildNewPositionDraft());
  const [dragQuestionId, setDragQuestionId] = useState("");
  const [newInterviewDraft, setNewInterviewDraft] = useState(() => buildNewInterviewDraft());
  const [newInterviewResumeFile, setNewInterviewResumeFile] = useState(null);
  const [savingNewInterview, setSavingNewInterview] = useState(false);
  const [recordSaving, setRecordSaving] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState({});
  const [savingResponseKey, setSavingResponseKey] = useState("");
  const [summaryDraftTextByKey, setSummaryDraftTextByKey] = useState({});
  const [customSummaryPages, setCustomSummaryPages] = useState([]);
  const [savingSummaryKey, setSavingSummaryKey] = useState("");
  const [payRateDrafts, setPayRateDrafts] = useState({});
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [newQuestionDrafts, setNewQuestionDrafts] = useState({});
  const [templateActionId, setTemplateActionId] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [resumePreviewUrl, setResumePreviewUrl] = useState("");
  const [audioFileName, setAudioFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioSources, setAudioSources] = useState([]);
  const [activeAudioSourceIndex, setActiveAudioSourceIndex] = useState(0);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [showConfigSettings, setShowConfigSettings] = useState(false);
  const [autoScoreCandidates, setAutoScoreCandidates] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [summaryDrafting, setSummaryDrafting] = useState(false);
  const [audioTranscribing, setAudioTranscribing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const pdfInputRefs = useRef({});
  const audioInputRef = useRef(null);
  const resumeInputRef = useRef(null);
  const newInterviewResumeInputRef = useRef(null);
  const transcriptInputRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const pendingAudioPlaybackRef = useRef(null);
  const pdfSaveTimersRef = useRef({});
  const questionSaveTimersRef = useRef({});
  const summarySaveTimerRef = useRef(null);
  const summaryRequestRef = useRef(new Set());

  const setSelectedRecordId = useCallback((nextRecordId) => {
    const cleanRecordId = String(typeof nextRecordId === "function" ? nextRecordId(selectedRecordId) : (nextRecordId || ""));
    setSelectedRecordIdState((current) => current === cleanRecordId ? current : cleanRecordId);
    onRecordChange?.(cleanRecordId);
  }, [onRecordChange, selectedRecordId]);

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
    return records.find((record) => record.id === selectedRecordId) || null;
  }, [records, selectedRecordId]);

  useEffect(() => {
    if (!loading && selectedRecordId && !selectedRecord) setSelectedRecordId("");
  }, [loading, selectedRecord, selectedRecordId, setSelectedRecordId]);

  const selectedGuides = useMemo(() => {
    if (!selectedRecord) return [];
    const rows = guides
      .filter((guide) => guide.interview_id === selectedRecord.id)
      .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
    return rows.length ? rows : [buildLegacyGuideFromRecord(selectedRecord)].filter(Boolean);
  }, [guides, selectedRecord]);

  const selectedGuide = useMemo(() => {
    if (!selectedGuides.length) return null;
    return selectedGuides.find((guide) => guide.id === activeGuideId) || selectedGuides[0];
  }, [activeGuideId, selectedGuides]);

  useEffect(() => {
    const nextRecordId = String(recordIdPreset || "");
    setSelectedRecordIdState((current) => current === nextRecordId ? current : nextRecordId);
  }, [recordIdPreset]);

  useEffect(() => {
    onDetailChange?.(!!selectedRecord);
    return () => onDetailChange?.(false);
  }, [onDetailChange, selectedRecord]);

  useEffect(() => {
    return () => {
      Object.values(pdfSaveTimersRef.current || {}).forEach((timer) => clearTimeout(timer));
      Object.values(questionSaveTimersRef.current || {}).forEach((timer) => clearTimeout(timer));
      if (summarySaveTimerRef.current) clearTimeout(summarySaveTimerRef.current);
    };
  }, []);

  const selectedSnapshot = useMemo(() => snapshotForGuide(selectedRecord, selectedGuide), [selectedGuide, selectedRecord]);
  const selectedQuestions = useMemo(() => questionRowsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const selectedPdfFields = useMemo(() => pdfFieldsFromSnapshot(selectedSnapshot), [selectedSnapshot]);
  const selectedPdfSourcePath = selectedSnapshot?.version?.source_pdf_path || "";
  const selectedPdfSourceBucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
  const responsesByTarget = useMemo(() => mapResponsesByTarget(responses, selectedGuide?.id || ""), [responses, selectedGuide?.id]);
  const autoScoreStorageKey = useMemo(() => getAutoScoreStorageKey(actorUserId), [actorUserId]);
  const selectedTranscriptTurns = useMemo(() => {
    const durationSeconds = Number(selectedRecord?.metadata?.audio_transcription?.duration_seconds || audioDuration || 0);
    return getInterviewTranscriptTurns(selectedRecord || {}, { durationSeconds });
  }, [audioDuration, selectedRecord]);
  const hasStoredTranscriptSummary = useMemo(() => getStoredTranscriptSummaryBullets(selectedRecord).length > 0, [selectedRecord]);

  const selectedTemplateVersion = useMemo(() => {
    return versions.find((version) => version.id === newInterviewDraft.template_version_id) || null;
  }, [newInterviewDraft.template_version_id, versions]);

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedTemplateVersion?.template_id) || null;
  }, [selectedTemplateVersion, templates]);

  const draftVersions = useMemo(() => versions.filter((version) => version.status === "draft"), [versions]);

  const sharedQuestionSourceVersion = useMemo(() => {
    return draftVersions[0] || publishedVersions[0] || versions[0] || null;
  }, [draftVersions, publishedVersions, versions]);

  const sharedQuestions = useMemo(() => {
    if (!sharedQuestionSourceVersion?.id) return [];
    return [...(questionsByVersion[sharedQuestionSourceVersion.id] || [])]
      .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
  }, [questionsByVersion, sharedQuestionSourceVersion]);

  const selectedPayRates = useMemo(() => payRatesFromVersion(selectedSnapshot?.version || {}), [selectedSnapshot]);
  const selectedPayRateSummary = useMemo(() => formatInterviewPayRateSummary(selectedPayRates), [selectedPayRates]);
  const selectedRecordCanAccessIdentity = useMemo(() => canAccessInterviewIdentity(selectedRecord, canManage), [canManage, selectedRecord]);
  const resumeArtifacts = useMemo(() => (
    selectedRecordCanAccessIdentity ? artifacts.filter((artifact) => artifact.artifact_type === "resume") : []
  ), [artifacts, selectedRecordCanAccessIdentity]);
  const selectedResumeArtifact = resumeArtifacts[0] || null;
  useStorageObjectPreviewUrl({
    bucket: selectedPdfSourceBucket,
    path: selectedPdfSourcePath,
    versionKey: selectedSnapshot?.version?.id || "",
    setPreviewUrl: setPdfPreviewUrl,
    enabled: selectedRecordCanAccessIdentity,
  });
  useStorageObjectPreviewUrl({
    bucket: selectedResumeArtifact?.storage_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
    path: selectedResumeArtifact?.storage_path || "",
    versionKey: selectedResumeArtifact?.id || selectedResumeArtifact?.created_at || "",
    setPreviewUrl: setResumePreviewUrl,
    enabled: selectedRecordCanAccessIdentity,
  });
  const selectedGuideReviewItems = useMemo(() => buildPdfReviewItems(selectedPdfFields), [selectedPdfFields]);
  const selectedGuideReviewedCount = useMemo(() => {
    return selectedGuideReviewItems.filter((item) => (
      !!item?.fields?.length && item.fields.every((field) => isInterviewResponseReviewed(responsesByTarget[responseKeyForPdfField(field)] || {}))
    )).length;
  }, [responsesByTarget, selectedGuideReviewItems]);
  const selectedQuestionReviewedCount = useMemo(() => {
    return selectedQuestions.filter((question) => isInterviewResponseReviewed(responsesByTarget[responseKeyForQuestion(question)] || {})).length;
  }, [responsesByTarget, selectedQuestions]);
  const workspaceTabs = useMemo(() => [
    { id: "resume", label: "Resume", detail: selectedResumeArtifact ? "Attached" : "Missing" },
    { id: "guide", label: "Interview Guide", detail: `${selectedGuideReviewedCount}/${selectedGuideReviewItems.length} items` },
    { id: "questions", label: "Custom Questions", detail: `${selectedQuestionReviewedCount}/${selectedQuestions.length} reviewed` },
  ], [selectedGuideReviewedCount, selectedGuideReviewItems.length, selectedQuestionReviewedCount, selectedQuestions.length, selectedResumeArtifact]);

  const showToast = useCallback((message, type = "success") => {
    addGlobalToast?.(message, type);
  }, [addGlobalToast]);

  const requireInterviewManagement = useCallback(() => {
    if (canManage) return true;
    showToast("You do not have permission to manage interviews", "error");
    return false;
  }, [canManage, showToast]);

  const changeView = useCallback((nextView) => {
    const normalizedView = nextView === "config" ? "config" : "records";
    if (normalizedView === "config" && !canManage) {
      showToast("You do not have permission to manage interview configuration", "error");
      return;
    }
    setView(normalizedView);
    if (normalizedView !== "records") setSelectedRecordIdState("");
    onViewChange?.(normalizedView);
  }, [canManage, onViewChange, showToast]);

  useEffect(() => {
    const nextView = viewPreset === "config" && !canManage ? "records" : viewPreset;
    if (nextView && nextView !== view) {
      setView(nextView);
      if (nextView !== "records") setSelectedRecordIdState("");
    }
  }, [canManage, view, viewPreset]);

  useEffect(() => {
    setPayRateDrafts((prev) => {
      const next = {};
      versions.forEach((version) => {
        next[version.id] = prev[version.id] || payRatesFromVersion(version);
      });
      return next;
    });
  }, [versions]);

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

      let recordRows = [];
      const recordRpcRes = await supabase.rpc("get_labor_interview_records_redacted", {
        p_location_id: resolvedLocationId,
      });
      if (recordRpcRes.error) {
        if (!isInterviewRpcMissing(recordRpcRes.error)) throw recordRpcRes.error;
        const fallbackRecordRes = canManage
          ? await supabase
              .from("labor_interview_records")
              .select("*")
              .eq("location_id", resolvedLocationId)
              .order("interview_date", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
          : await supabase
              .from("labor_interview_records")
              .select("id,location_id,template_id,template_version_id,candidate_position,interview_date,interview_time,status,metadata,created_at,updated_at")
              .eq("location_id", resolvedLocationId)
              .order("interview_date", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false });
        if (fallbackRecordRes.error) throw fallbackRecordRes.error;
        recordRows = (fallbackRecordRes.data || []).map((record, index) => (
          redactInterviewRecordForIdentityAccess({
            ...record,
            masked_candidate_label: `Candidate ${index + 1}`,
          }, { canAccessIdentity: canManage })
        ));
      } else {
        recordRows = normalizeRpcArray(recordRpcRes.data).map((record) => (
          redactInterviewRecordForIdentityAccess(record, {
            canAccessIdentity: canAccessInterviewIdentity(record, canManage),
          })
        ));
      }
      const recordIds = recordRows.map((record) => record.id).filter(Boolean);
      const guideRes = recordIds.length
        ? await supabase
            .from("labor_interview_record_guides")
            .select("*")
            .in("interview_id", recordIds)
            .order("sequence_order", { ascending: true })
            .order("created_at", { ascending: true })
        : { data: [], error: null };
      const guideMissing = guideRes.error?.code === "PGRST205" || /labor_interview_record_guides/i.test(guideRes.error?.message || "");
      if (guideRes.error && !guideMissing) throw guideRes.error;

      setTemplates(templateRows);
      setVersions(versionRows);
      setQuestions(questionRes.data || []);
      setRecords(recordRows);
      setGuides(guideMissing ? [] : (guideRes.data || []));
    } catch (error) {
      const missing = error?.code === "PGRST205" || /labor_interview_/i.test(error?.message || "");
      setSchemaError(missing ? "Interview database tables are not available in this environment yet." : (error?.message || "Unable to load interviews."));
    } finally {
      setLoading(false);
    }
  }, [canManage, locationId]);

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
    setAutoScoreCandidates(readAutoScoreSetting(autoScoreStorageKey));
  }, [autoScoreStorageKey]);

  useEffect(() => {
    if (!selectedRecord?.id) return;
    setAiReviewMode(normalizeAiReviewMode(selectedRecord?.metadata?.ai_review_mode));
  }, [selectedRecord?.id, selectedRecord?.metadata?.ai_review_mode]);

  const loadInterviewDetail = useCallback(async (interviewId) => {
    if (!interviewId) {
      setResponses([]);
      setArtifacts([]);
      return { responses: [], artifacts: [] };
    }
    const targetRecord = records.find((record) => record.id === interviewId) || null;
    if (!canAccessInterviewIdentity(targetRecord, canManage)) {
      setResponses([]);
      setArtifacts([]);
      return { responses: [], artifacts: [] };
    }
    const [responseRes, artifactRes] = await Promise.all([
      supabase.from("labor_interview_responses").select("*").eq("interview_id", interviewId).order("created_at"),
      supabase.from("labor_interview_artifacts").select("*").eq("interview_id", interviewId).order("created_at", { ascending: false }),
    ]);
    if (responseRes.error) throw responseRes.error;
    if (artifactRes.error) throw artifactRes.error;
    setResponses(responseRes.data || []);
    setArtifacts(artifactRes.data || []);
    return { responses: responseRes.data || [], artifacts: artifactRes.data || [] };
  }, [canManage, records]);

  useEffect(() => {
    const loadRecordDetail = async () => {
      if (!selectedRecord?.id) {
        setResponses([]);
        setArtifacts([]);
        return;
      }
      try {
        await loadInterviewDetail(selectedRecord.id);
      } catch (_) {
        showToast("Failed to load interview responses", "error");
      }
    };
    loadRecordDetail();
  }, [loadInterviewDetail, selectedRecord?.id, showToast]);

  useEffect(() => {
    setAudioFileName("");
    setPdfReviewIndex(0);
    setShowCandidateEdit(false);
    setShowActiveInterview(false);
    setActiveInterviewPane("guide");
    setShowTranscriptModal(false);
    setShowTranscriptInput(false);
    setTranscriptDraft("");
    setActiveGuideId("");
    setGuideAttachVersionId("");
    setResponseDrafts({});
    setSummaryDraftTextByKey({});
    setCustomSummaryPages([]);
    setSavingSummaryKey("");
    if (summarySaveTimerRef.current) {
      window.clearTimeout(summarySaveTimerRef.current);
      summarySaveTimerRef.current = null;
    }
    setAudioPlaying(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setAudioSources([]);
    setActiveAudioSourceIndex(0);
    pendingAudioPlaybackRef.current = null;
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
  }, [selectedRecord?.id]);

  useEffect(() => {
    if (!selectedRecord?.id) {
      setSummaryDraftTextByKey({});
      setCustomSummaryPages([]);
      return;
    }
    const edits = getStoredSummaryEdits(selectedRecord);
    const customPages = getStoredCustomSummaryPages(selectedRecord);
    const draftTextByKey = Object.fromEntries(
      Object.entries(edits).map(([key, bullets]) => [key, summaryBulletsToText(bullets)]),
    );
    customPages.forEach((page) => {
      if (!Object.prototype.hasOwnProperty.call(draftTextByKey, page.sectionKey)) {
        draftTextByKey[page.sectionKey] = summaryBulletsToText(page.bullets);
      }
    });
    setSummaryDraftTextByKey(draftTextByKey);
    setCustomSummaryPages(customPages.map((page) => ({
      id: page.id,
      sectionKey: page.sectionKey,
      title: page.title,
    })));
  }, [selectedRecord?.id]);

  useEffect(() => {
    if (!selectedRecord) return;
    setCandidateEditDraft({
      candidate_full_name: selectedRecord.candidate_full_name || "",
      candidate_email: selectedRecord.candidate_email || "",
      candidate_phone: selectedRecord.candidate_phone || "",
      candidate_position: selectedRecord.candidate_position || "",
      interview_date: selectedRecord.interview_date || "",
      interview_time: selectedRecord.interview_time || "",
      interviewer_name: selectedRecord.interviewer_name || actorName || "",
      zoom_recording_url: selectedRecord.zoom_recording_url || "",
      zoom_passcode: selectedRecord.zoom_passcode || "",
      template_version_id: selectedRecord.template_version_id || "",
    });
  }, [actorName, selectedRecord]);

  useEffect(() => {
    if (!selectedGuides.length) return;
    if (!selectedGuides.some((guide) => guide.id === activeGuideId)) {
      setActiveGuideId(selectedGuides[0]?.id || "");
    }
  }, [activeGuideId, selectedGuides]);

  useEffect(() => {
    const nextDrafts = {};
    Object.values(responsesByTarget || {}).forEach((response) => {
      if (response.response_type === "custom_question" && response.question_key) {
        nextDrafts[fieldKey("custom_question", response.question_key)] = getResponseDraft(response);
      }
      if (response.response_type === "pdf_field" && response.pdf_field_name) {
        nextDrafts[fieldKey("pdf_field", response.pdf_field_name)] = getResponseDraft(response);
      }
    });
    setResponseDrafts((prev) => {
      const preservedGroupedDrafts = Object.entries(prev || {}).reduce((next, [key, value]) => {
        if (key.startsWith("pdf_group:")) next[key] = value;
        return next;
      }, {});
      const mergedDrafts = { ...nextDrafts, ...preservedGroupedDrafts };
      return draftMapsEqual(prev, mergedDrafts) ? prev : mergedDrafts;
    });
  }, [responsesByTarget]);

  useEffect(() => {
    if (!selectedRecordCanAccessIdentity) {
      setAudioSources([]);
      setActiveAudioSourceIndex(0);
      setAudioUrl("");
      return undefined;
    }
    const sourceAudio = selectedRecord?.metadata?.audio_transcription?.source_audio || {};
    const candidates = getInterviewAudioPlaybackCandidates(sourceAudio);
    if (!candidates.length) {
      setAudioSources([]);
      setActiveAudioSourceIndex(0);
      setAudioUrl("");
      return;
    }
    let active = true;
    setAudioUrl("");
    setAudioSources([]);
    setActiveAudioSourceIndex(0);
    const signFirstReadableSource = async () => {
      const signedSources = [];
      for (const candidate of candidates) {
        const { data: signed, error } = await supabase.storage.from(candidate.bucket).createSignedUrl(candidate.path, 60 * 30);
        if (!active) return;
        const signedUrl = error ? "" : signed?.signedUrl || "";
        if (signedUrl && await isSignedAudioUrlReadable(signedUrl)) {
          signedSources.push({ ...candidate, url: signedUrl });
          if (signedSources.length === 1) {
            setAudioSources([...signedSources]);
            setActiveAudioSourceIndex(0);
            setAudioUrl(signedSources[0]?.url || "");
          }
        }
      }
      if (!active) return;
      setAudioSources(signedSources);
      setActiveAudioSourceIndex((index) => Math.min(index, Math.max(0, signedSources.length - 1)));
      setAudioUrl((currentUrl) => currentUrl || signedSources[0]?.url || "");
    };
    signFirstReadableSource();
    return () => { active = false; };
  }, [selectedRecord?.metadata?.audio_transcription?.source_audio, selectedRecordCanAccessIdentity]);

  const buildCurrentPdfResponseMap = useCallback((drafts = responseDrafts) => {
    const map = buildPdfResponseMap([], selectedRecord, selectedPdfFields, { includeDrafts: true });
    Object.entries(drafts || {}).forEach(([key, value]) => {
      if (!key.startsWith("pdf_field:")) return;
      const fieldName = key.replace(/^pdf_field:/, "");
      map[fieldName] = value || "";
    });
    const overallScoreField = selectedPdfFields.find((field) => /^overall_score$/i.test(field.name || ""));
    const overallScore = computeOverallScoreFromPdfMap(map, selectedPdfFields);
    if (overallScoreField && overallScore) map[overallScoreField.name] = overallScore;
    return map;
  }, [responseDrafts, selectedPdfFields, selectedRecord]);

  const guidePreviewFieldValues = useMemo(() => buildCurrentPdfResponseMap(responseDrafts), [buildCurrentPdfResponseMap, responseDrafts]);

  const buildSummaryEditsPayload = useCallback((draftTextByKey = {}, pages = []) => {
    const sections = Object.entries(draftTextByKey || {}).reduce((next, [key, text]) => {
      if (!isEditableSummarySectionKey(key)) return next;
      next[key] = summaryTextToBullets(text);
      return next;
    }, {});
    const custom_pages = (pages || []).map((page, index) => {
      const sectionKey = page.sectionKey || customSummarySectionKey(page.id, index);
      return {
        id: normalizeCustomSummaryPageId(page.id || sectionKey) || `page_${index + 1}`,
        section_key: sectionKey,
        title: String(page.title || "").trim() || `Custom Summary Page ${index + 1}`,
      };
    });
    return { sections, custom_pages };
  }, []);

  const reviewedSummaryPages = useMemo(() => {
    const guideResponses = Object.values(responsesByTarget || {});
    const finalMap = buildPdfResponseMap(guideResponses, selectedRecord, selectedPdfFields, { includeDrafts: false });
    const overallScoreField = selectedPdfFields.find((field) => /^overall_score$/i.test(field.name || ""));
    const overallScore = computeOverallScoreFromPdfMap(finalMap, selectedPdfFields);
    if (overallScoreField && overallScore) finalMap[overallScoreField.name] = overallScore;
    const liveSummaryEdits = Object.keys(summaryDraftTextByKey || {}).length || customSummaryPages.length
      ? buildSummaryEditsPayload(summaryDraftTextByKey, customSummaryPages)
      : selectedRecord;
    return buildInterviewSummaryPages({
      record: selectedRecord,
      guide: selectedGuide,
      fields: selectedPdfFields,
      questions: selectedQuestions,
      responsesByTarget,
      finalMap,
      summaryEdits: liveSummaryEdits,
    });
  }, [buildSummaryEditsPayload, customSummaryPages, responsesByTarget, selectedGuide, selectedPdfFields, selectedQuestions, selectedRecord, summaryDraftTextByKey]);

  const setAutoScorePreference = (enabled) => {
    if (!requireInterviewManagement()) return;
    setAutoScoreCandidates(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(autoScoreStorageKey, enabled ? "true" : "false");
    }
  };

  const findAudioSourceIndexForTime = (seconds) => {
    if (!audioSources.length) return 0;
    const target = Math.max(0, Number(seconds || 0));
    let index = 0;
    audioSources.forEach((source, sourceIndex) => {
      if (Number(source.startSeconds || 0) <= target) index = sourceIndex;
    });
    return index;
  };

  const seekAudioPlayback = (seconds, options = {}) => {
    const target = Math.max(0, Number(seconds || 0));
    setAudioCurrentTime(target);
    if (!audioSources.length) {
      if (audioPlayerRef.current) audioPlayerRef.current.currentTime = target;
      return;
    }
    const nextIndex = findAudioSourceIndexForTime(target);
    const nextSource = audioSources[nextIndex] || audioSources[0];
    const nextRelativeTime = Math.max(0, target - Number(nextSource?.startSeconds || 0));
    const shouldResume = options.play ?? audioPlaying;
    if (nextIndex !== activeAudioSourceIndex) {
      pendingAudioPlaybackRef.current = { currentTime: nextRelativeTime, play: shouldResume };
      setActiveAudioSourceIndex(nextIndex);
      setAudioUrl(nextSource?.url || "");
      return;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.currentTime = nextRelativeTime;
      if (shouldResume) {
        audioPlayerRef.current.play()
          .then(() => setAudioPlaying(true))
          .catch((error) => showToast(safeUiError(error, "Audio playback failed"), "error"));
      }
    }
  };

  useEffect(() => {
    const pending = pendingAudioPlaybackRef.current;
    const player = audioPlayerRef.current;
    if (!pending || !player || !audioUrl) return;
    pendingAudioPlaybackRef.current = null;
    player.currentTime = Math.max(0, Number(pending.currentTime || 0));
    if (pending.play) {
      player.play()
        .then(() => setAudioPlaying(true))
        .catch((error) => showToast(safeUiError(error, "Audio playback failed"), "error"));
    }
  }, [audioUrl, showToast]);

  const toggleAudioPlayback = async () => {
    const player = audioPlayerRef.current;
    if (!player || !audioUrl) return;
    try {
      if (audioPlaying) {
        player.pause();
        setAudioPlaying(false);
      } else {
        await player.play();
        setAudioPlaying(true);
      }
    } catch (error) {
      showToast(safeUiError(error, "Audio playback failed"), "error");
    }
  };

  const handleAudioPlaybackError = () => {
    setAudioPlaying(false);
    showToast("Audio file could not be loaded. Replace the audio if playback still fails.", "error");
  };

  const handleAudioTimeUpdate = (event) => {
    const offset = Number(audioSources[activeAudioSourceIndex]?.startSeconds || 0);
    setAudioCurrentTime(offset + (event.currentTarget.currentTime || 0));
  };

  const handleAudioLoadedMetadata = (event) => {
    if (audioSources.length <= 1) setAudioDuration(event.currentTarget.duration || 0);
  };

  const handleAudioEnded = () => {
    const nextIndex = activeAudioSourceIndex + 1;
    if (audioSources.length > 1 && nextIndex < audioSources.length) {
      const nextSource = audioSources[nextIndex];
      pendingAudioPlaybackRef.current = { currentTime: 0, play: true };
      setActiveAudioSourceIndex(nextIndex);
      setAudioUrl(nextSource?.url || "");
      setAudioCurrentTime(Number(nextSource?.startSeconds || 0));
      return;
    }
    setAudioPlaying(false);
  };

  const createNewInterview = async () => {
    if (!canManage) {
      showToast("You do not have permission to manage interviews", "error");
      return;
    }
    const normalized = normalizeInterviewCandidateDraft({
      ...newInterviewDraft,
      interviewer_name: newInterviewDraft.interviewer_name || actorName,
    });
    if (!normalized.candidate_full_name || !selectedTemplate || !selectedTemplateVersion) {
      showToast("Candidate name and a published role template are required.", "error");
      return;
    }
    if (newInterviewResumeFile) {
      const resumeValidation = validateInterviewResumeFile(newInterviewResumeFile);
      if (!resumeValidation.ok) {
        showToast(resumeValidation.error, "error");
        return;
      }
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
        metadata: {
          hiring_recommendation: "pending",
        },
        template_snapshot: snapshot,
        pdf_field_manifest_snapshot: selectedTemplateVersion.pdf_field_manifest || [],
        question_snapshot: snapshot.questions || [],
        created_by_user_id: actorUserId,
        updated_by_user_id: actorUserId,
      }).select("*").single();
      if (error) throw error;
      const { data: guide, error: guideError } = await supabase
        .from("labor_interview_record_guides")
        .insert({
          interview_id: created.id,
          location_id: locationId,
          template_id: selectedTemplate.id,
          template_version_id: selectedTemplateVersion.id,
          guide_label: selectedTemplate.role_label,
          role_key: selectedTemplate.role_key,
          role_label: selectedTemplate.role_label,
          guide_status: "draft",
          sequence_order: 10,
          template_snapshot: snapshot,
          pdf_field_manifest_snapshot: selectedTemplateVersion.pdf_field_manifest || [],
          question_snapshot: snapshot.questions || [],
          metadata: { primary: true },
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (guideError) throw guideError;
      let resumeArtifact = null;
      if (newInterviewResumeFile) {
        try {
          resumeArtifact = await createResumeArtifact(created.id, newInterviewResumeFile, "new_interview_creation");
        } catch (resumeError) {
          showToast(safeUiError(resumeError, "Interview created, but the resume failed to upload."), "error");
        }
      }
      setRecords((prev) => [created, ...prev]);
      setGuides((prev) => [guide, ...prev]);
      setArtifacts(resumeArtifact ? [resumeArtifact] : []);
      setSelectedRecordId(created.id);
      setActiveGuideId(guide.id);
      setShowNewInterview(false);
      setNewInterviewDraft(buildNewInterviewDraft());
      setNewInterviewResumeFile(null);
      showToast("Interview created");
    } catch (error) {
      showToast(error?.message || "Failed to create interview", "error");
    } finally {
      setSavingNewInterview(false);
    }
  };

  const saveRecordPatch = async (patch) => {
    if (!selectedRecord?.id) return;
    if (!canManage) {
      showToast("You do not have permission to manage interviews", "error");
      return null;
    }
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
      return updated;
    } catch (error) {
      showToast(safeUiError(error, "Failed to save interview"), "error");
      return null;
    } finally {
      setRecordSaving(false);
    }
  };

  const saveRecordMetadataPatch = async (metadataPatch) => {
    if (!selectedRecord?.id) return null;
    const previousRecord = selectedRecord;
    const nextMetadata = {
      ...(selectedRecord.metadata || {}),
      ...metadataPatch,
    };
    setRecords((prev) => prev.map((record) => (
      record.id === selectedRecord.id ? { ...record, metadata: nextMetadata } : record
    )));
    return saveRecordPatch({
      metadata: nextMetadata,
    }).then((updated) => {
      if (!updated) {
        setRecords((prev) => prev.map((record) => (
          record.id === previousRecord.id ? previousRecord : record
        )));
      }
      return updated;
    });
  };

  const saveSummaryDraftsToMetadata = async (draftTextByKey, activeKey = "", customPagesOverride = customSummaryPages) => {
    if (!selectedRecord?.id) return null;
    const summaryPayload = buildSummaryEditsPayload(draftTextByKey, customPagesOverride);
    setSavingSummaryKey(activeKey);
    try {
      return await saveRecordMetadataPatch({
        interview_summary_edits: {
          ...summaryPayload,
          updated_at: new Date().toISOString(),
          updated_by: actorName,
        },
      });
    } finally {
      setSavingSummaryKey("");
    }
  };

  const scheduleSummaryMetadataSave = (draftTextByKey, activeKey = "", customPagesOverride = customSummaryPages) => {
    if (summarySaveTimerRef.current) window.clearTimeout(summarySaveTimerRef.current);
    summarySaveTimerRef.current = window.setTimeout(() => {
      summarySaveTimerRef.current = null;
      saveSummaryDraftsToMetadata(draftTextByKey, activeKey, customPagesOverride);
    }, 650);
  };

  const setSummarySectionDraft = (sectionKey, value) => {
    if (!sectionKey) return;
    setSummaryDraftTextByKey((prev) => {
      const next = { ...(prev || {}), [sectionKey]: value };
      scheduleSummaryMetadataSave(next, sectionKey);
      return next;
    });
  };

  const addCustomSummaryPage = () => {
    if (!selectedRecord?.id) return;
    const id = createCustomSummaryPageId();
    const firstName = String(selectedRecord.candidate_full_name || "").trim().split(/\s+/)[0] || "Candidate";
    const page = {
      id,
      sectionKey: customSummarySectionKey(id),
      title: `Intended Role For ${firstName}`,
    };
    const nextPages = [...customSummaryPages, page];
    const nextDrafts = { ...(summaryDraftTextByKey || {}), [page.sectionKey]: "" };
    setCustomSummaryPages(nextPages);
    setSummaryDraftTextByKey(nextDrafts);
    setPdfReviewIndex(buildPdfReviewItems(selectedPdfFields).length);
    saveSummaryDraftsToMetadata(nextDrafts, page.sectionKey, nextPages);
  };

  const updateCustomSummaryPageTitle = (pageId, title) => {
    const nextPages = customSummaryPages.map((page) => (
      page.id === pageId ? { ...page, title } : page
    ));
    const activePage = nextPages.find((page) => page.id === pageId);
    setCustomSummaryPages(nextPages);
    scheduleSummaryMetadataSave(summaryDraftTextByKey, activePage?.sectionKey || "", nextPages);
  };

  const removeCustomSummaryPage = (pageId) => {
    const targetPage = customSummaryPages.find((page) => page.id === pageId);
    if (!targetPage) return;
    if (!window.confirm(`Remove custom page "${targetPage.title || "Custom Summary Page"}"?`)) return;
    const nextPages = customSummaryPages.filter((page) => page.id !== pageId);
    const nextDrafts = { ...(summaryDraftTextByKey || {}) };
    delete nextDrafts[targetPage.sectionKey];
    setCustomSummaryPages(nextPages);
    setSummaryDraftTextByKey(nextDrafts);
    saveSummaryDraftsToMetadata(nextDrafts, targetPage.sectionKey, nextPages);
  };

  const deleteSelectedInterview = async () => {
    if (!selectedRecord?.id) return;
    if (!canManage) {
      showToast("You do not have permission to manage interviews", "error");
      return;
    }
    if (!window.confirm(`Delete interview for ${selectedRecord.candidate_full_name}?`)) return;
    setRecordSaving(true);
    try {
      const { error } = await supabase
        .from("labor_interview_records")
        .delete()
        .eq("id", selectedRecord.id);
      if (error) throw error;
      setRecords((prev) => prev.filter((record) => record.id !== selectedRecord.id));
      setSelectedRecordId("");
      showToast("Interview deleted");
    } catch (error) {
      showToast(safeUiError(error, "Failed to delete interview"), "error");
    } finally {
      setRecordSaving(false);
    }
  };

  const saveCandidateEdit = async () => {
    if (!canManage) {
      showToast("You do not have permission to manage interviews", "error");
      return;
    }
    const normalized = normalizeInterviewCandidateDraft(candidateEditDraft);
    if (!normalized.candidate_full_name) {
      showToast("Candidate name is required.", "error");
      return;
    }
    const updated = await saveRecordPatch(normalized);
    if (updated) {
      setShowCandidateEdit(false);
      showToast("Candidate details saved");
    }
  };

  const saveResponse = async ({ responseType, key, prompt, value, metadataPatch = null, responseState = null }) => {
    if (!selectedRecord?.id || !key) return;
    if (!requireInterviewManagement()) return false;
    const targetKey = fieldKey(responseType, key);
    const existing = responsesByTarget[targetKey];
    const nextState = responseState || (String(value || "").trim() ? "manual" : "blank");
    setSavingResponseKey(targetKey);
    try {
      if (existing?.id) {
        const { data: updated, error } = await supabase
          .from("labor_interview_responses")
          .update({
            response_text: value || null,
            prompt_snapshot: prompt,
            interview_guide_id: responseType === "custom_question" ? null : (selectedGuide?.id || null),
            response_state: nextState,
            metadata: metadataPatch ? { ...(existing.metadata || {}), ...metadataPatch } : existing.metadata,
            reviewed_at: nextState === "ai_approved" || nextState === "manual" ? new Date().toISOString() : existing.reviewed_at,
            reviewed_by_user_id: nextState === "ai_approved" || nextState === "manual" ? actorUserId : existing.reviewed_by_user_id,
            reviewed_by_name: nextState === "ai_approved" || nextState === "manual" ? actorName : existing.reviewed_by_name,
            rejected_at: nextState === "rejected" ? new Date().toISOString() : existing.rejected_at,
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
          interview_guide_id: responseType === "custom_question" ? null : (selectedGuide?.id || null),
          response_type: responseType,
          question_key: responseType === "custom_question" ? key : null,
          pdf_field_name: responseType === "pdf_field" ? key : null,
          prompt_snapshot: prompt,
          response_text: value || null,
          response_state: nextState,
          metadata: metadataPatch || {},
          reviewed_at: nextState === "ai_approved" || nextState === "manual" ? new Date().toISOString() : null,
          reviewed_by_user_id: nextState === "ai_approved" || nextState === "manual" ? actorUserId : null,
          reviewed_by_name: nextState === "ai_approved" || nextState === "manual" ? actorName : null,
          rejected_at: nextState === "rejected" ? new Date().toISOString() : null,
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
      return true;
    } catch (error) {
      showToast(safeUiError(error, "Failed to save response"), "error");
      return false;
    } finally {
      setSavingResponseKey("");
    }
  };

  const draftInterview = async (interviewId = selectedRecord?.id, options = {}) => {
    const {
      requireLocalTranscript = true,
      localTranscriptText = "",
      quietStart = false,
      quietComplete = false,
      interviewGuideId = "",
      targetPdfFieldName = "",
      pdfPopulationInstruction = "",
      documentPdfInstruction = "",
      pdfOnly = false,
      customOnly = false,
      reviewModeOverride = "",
    } = options;
    if (!canManage) return null;
    const draftReviewMode = normalizeAiReviewMode(reviewModeOverride || aiReviewMode);
    if (!interviewId) return null;
    const transcriptForLocalCheck = String(localTranscriptText || selectedRecord?.transcript_text || "").trim();
    if (requireLocalTranscript && !transcriptForLocalCheck) {
      showToast("Upload interview audio or a transcript first.", "error");
      return null;
    }
    const activeDraftGuideId = String(interviewGuideId || selectedGuide?.id || "").trim();
    setAiDrafting(true);
    try {
      const pdfPopulationInstructions = targetPdfFieldName
        ? { [targetPdfFieldName]: pdfPopulationInstruction }
        : documentPdfInstruction
          ? { [DOCUMENT_PDF_INSTRUCTION_KEY]: documentPdfInstruction }
        : undefined;
      const { data: startResult, error: startError } = await supabase.functions.invoke("interview-ai-draft", {
        body: {
          interview_id: interviewId,
          interview_guide_id: activeDraftGuideId || undefined,
          action: "start",
          auto_score_candidate: autoScoreCandidates,
          review_mode: draftReviewMode,
          target_pdf_field_name: targetPdfFieldName || undefined,
          pdf_population_instructions: pdfPopulationInstructions,
          pdf_only: pdfOnly || !!documentPdfInstruction || undefined,
          custom_only: customOnly || undefined,
        },
      });
      if (startError) throw new Error(await readEdgeFunctionError(startError, "AI draft failed"));

      let result = startResult;
      if (startResult?.pending) {
        if (!quietStart) showToast(startResult.reused ? "Resuming AI draft" : "AI draft started");
        const requestId = startResult.request_id;
        let completed = false;
        for (let attempt = 0; attempt < 60; attempt += 1) {
          await sleep(attempt === 0 ? 5000 : 10000);
          const { data: pollResult, error: pollError } = await supabase.functions.invoke("interview-ai-draft", {
            body: {
              interview_id: interviewId,
              interview_guide_id: activeDraftGuideId || undefined,
              action: "poll",
              request_id: requestId,
              review_mode: draftReviewMode,
              custom_only: customOnly || undefined,
            },
          });
          if (pollError) throw new Error(await readEdgeFunctionError(pollError, "AI draft failed"));
          result = pollResult;
          if (!pollResult?.pending) {
            completed = true;
            break;
          }
        }
        if (!completed) {
          throw new Error("AI is still drafting. Reopen this interview in a minute to resume review without resending the transcript.");
        }
      }

      const populatedCount = Number(result?.populated_count ?? result?.saved_count ?? 0);
      if (!quietComplete) {
        showToast(targetPdfFieldName
          ? "AI updated field"
          : documentPdfInstruction
            ? `AI wrote guide text into ${populatedCount} field${populatedCount === 1 ? "" : "s"}`
            : `AI populated ${result?.saved_count || 0} response${result?.saved_count === 1 ? "" : "s"}`);
      }
      await loadAll(locationId);
      await loadInterviewDetail(interviewId);
      setSelectedRecordId(interviewId);
      return result;
    } catch (error) {
      showToast(safeUiError(error, "AI draft failed"), "error");
      return null;
    } finally {
      setAiDrafting(false);
    }
  };

  const draftAttachedGuides = async (options = {}) => {
    const {
      guidesToDraft = selectedGuides,
      onlyEmpty = false,
      localTranscriptText = "",
      reviewModeOverride = "",
      reason = "manual",
    } = options;
    if (!selectedRecord?.id) return null;
    const transcriptForDraft = String(localTranscriptText || selectedRecord?.transcript_text || "").trim();
    if (!transcriptForDraft) {
      showToast("Upload interview audio or a transcript first.", "error");
      return null;
    }
    const draftableGuides = (Array.isArray(guidesToDraft) ? guidesToDraft : [])
      .filter((guide) => guide?.id);
    if (!draftableGuides.length) {
      showToast("Attach a guide before drafting responses.", "error");
      return null;
    }
    const guidesNeedingDraft = onlyEmpty
      ? draftableGuides.filter((guide) => !responses.some((response) => {
          if (response.interview_guide_id !== guide.id) return false;
          return String(response.ai_draft_text || response.ai_merged_text || response.response_text || "").trim();
        }))
      : draftableGuides;
    if (!guidesNeedingDraft.length) return [];

    const mode = normalizeAiReviewMode(reviewModeOverride || aiReviewMode);
    const label = INTERVIEW_AI_REVIEW_MODE_LABELS[mode] || "AI";
    const instruction = reviewModeDraftInstruction(mode, label);
    const guideLabel = guidesNeedingDraft.length === 1
      ? (guidesNeedingDraft[0].guide_label || guidesNeedingDraft[0].role_label || "guide")
      : `${guidesNeedingDraft.length} attached guides`;

    if (!options.quietStart) {
      const prefix = reason === "mode" ? `${label} mode selected.` : "Transcript ready.";
      showToast(`${prefix} Drafting ${guideLabel} from the transcript.`);
    }

    const results = [];
    for (const guide of guidesNeedingDraft) {
      const result = await draftInterview(selectedRecord.id, {
        requireLocalTranscript: true,
        localTranscriptText: transcriptForDraft,
        quietStart: true,
        quietComplete: true,
        interviewGuideId: guide.id,
        reviewModeOverride: mode,
        documentPdfInstruction: instruction,
        pdfOnly: true,
      });
      if (result) results.push({ guide, result });
    }

    const populatedCount = results.reduce((sum, entry) => sum + Number(entry.result?.populated_count ?? entry.result?.saved_count ?? 0), 0);
    if (results.length) {
      showToast(`AI drafted ${populatedCount} field${populatedCount === 1 ? "" : "s"} across ${results.length} guide${results.length === 1 ? "" : "s"}`);
    }
    return results;
  };

  const draftTranscriptSummary = async (interviewId = selectedRecord?.id, options = {}) => {
    const { quiet = true } = options;
    if (!canManage) return null;
    if (!interviewId || !String(selectedRecord?.transcript_text || "").trim()) return null;
    setSummaryDrafting(true);
    try {
      const { data: startResult, error: startError } = await supabase.functions.invoke("interview-ai-draft", {
        body: {
          interview_id: interviewId,
          interview_guide_id: selectedGuide?.id || undefined,
          action: "start",
          summary_only: true,
          review_mode: normalizeAiReviewMode(aiReviewMode),
        },
      });
      if (startError) throw new Error(await readEdgeFunctionError(startError, "AI summary failed"));

      let result = startResult;
      if (startResult?.pending) {
        const requestId = startResult.request_id;
        let completed = false;
        for (let attempt = 0; attempt < 30; attempt += 1) {
          await sleep(attempt === 0 ? 3000 : 6000);
          const { data: pollResult, error: pollError } = await supabase.functions.invoke("interview-ai-draft", {
            body: {
              interview_id: interviewId,
              interview_guide_id: selectedGuide?.id || undefined,
              action: "poll",
              request_id: requestId,
              summary_only: true,
              review_mode: normalizeAiReviewMode(aiReviewMode),
            },
          });
          if (pollError) throw new Error(await readEdgeFunctionError(pollError, "AI summary failed"));
          result = pollResult;
          if (!pollResult?.pending) {
            completed = true;
            break;
          }
        }
        if (!completed) throw new Error("AI summary is still drafting. Reopen this guide in a minute to resume.");
      }

      await loadAll(locationId);
      await loadInterviewDetail(interviewId);
      setSelectedRecordId(interviewId);
      if (!quiet && Number(result?.transcript_summary_count || 0) > 0) showToast("Call summary updated");
      return result;
    } catch (error) {
      summaryRequestRef.current.delete(interviewId);
      if (!quiet) showToast(safeUiError(error, "AI summary failed"), "error");
      return null;
    } finally {
      setSummaryDrafting(false);
    }
  };

  useEffect(() => {
    if (!canManage) return;
    if (!showActiveInterview || activeInterviewPane !== "guide" || !selectedRecord?.id || !String(selectedRecord?.transcript_text || "").trim()) return;
    if (hasStoredTranscriptSummary || summaryDrafting || aiDrafting) return;
    if (summaryRequestRef.current.has(selectedRecord.id)) return;
    summaryRequestRef.current.add(selectedRecord.id);
    draftTranscriptSummary(selectedRecord.id, { quiet: true });
  }, [activeInterviewPane, canManage, showActiveInterview, selectedRecord?.id, selectedRecord?.transcript_text, hasStoredTranscriptSummary, summaryDrafting, aiDrafting]);

  const fillPdfDocumentWithAiInstruction = async (instruction) => {
    if (!requireInterviewManagement()) return null;
    if (!selectedRecord?.id || !String(instruction || "").trim()) return null;
    const result = await draftInterview(selectedRecord.id, {
      requireLocalTranscript: true,
      quietStart: true,
      documentPdfInstruction: instruction,
      pdfOnly: true,
    });
    return result;
  };

  const changeAiReviewMode = async (nextValue) => {
    if (!requireInterviewManagement()) return;
    const nextMode = normalizeAiReviewMode(nextValue);
    if (nextMode === aiReviewMode && selectedRecord?.metadata?.ai_review_mode === nextMode) return;
    setAiReviewMode(nextMode);
    await saveRecordMetadataPatch({ ai_review_mode: nextMode });
    const label = INTERVIEW_AI_REVIEW_MODE_LABELS[nextMode] || "AI";
    if (!selectedRecord?.id) return;
    if (!String(selectedRecord?.transcript_text || "").trim()) {
      showToast(`${label} mode selected. Upload interview audio or a transcript before drafting.`, "error");
      return;
    }
    await draftAttachedGuides({
      reviewModeOverride: nextMode,
      onlyEmpty: false,
      localTranscriptText: selectedRecord.transcript_text,
      reason: "mode",
    });
  };

  const waitForInterviewTranscript = async (interviewId) => {
    let latest = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await sleep(attempt === 0 ? 3000 : 5000);
      const { data, error } = await supabase
        .from("labor_interview_records")
        .select("*")
        .eq("id", interviewId)
        .single();
      if (error) throw error;
      latest = data;
      setRecords((prev) => prev.map((record) => record.id === data.id ? data : record));

      if (data?.transcript_status === "failed") {
        const message = data?.metadata?.audio_transcription_error?.message || "AI could not transcribe this audio.";
        throw new Error(message);
      }
      if (data?.transcript_status === "ready" && String(data?.transcript_text || "").trim()) {
        return data;
      }
    }
    throw new Error(latest?.transcript_status === "transcribing"
      ? "Audio is still transcribing. Refresh this interview in a few minutes."
      : "Timed out waiting for interview transcription.");
  };

  const isEmptyChunkTranscriptionMessage = (message) => /no usable transcript text|empty transcript|no transcript text/i.test(String(message || ""));

  const transcribeInterviewAudioChunks = async ({ interviewId, chunks, originalAudio }) => {
    const safeChunks = Array.isArray(chunks) ? chunks.filter((chunk) => chunk?.audio_file_path) : [];
    if (!safeChunks.length) return null;
    const startedAt = new Date().toISOString();
    const chunkResults = [];
    const skippedChunks = [];
    for (let index = 0; index < safeChunks.length; index += 1) {
      const chunk = safeChunks[index];
      showToast(`Transcribing audio ${index + 1}/${safeChunks.length}`);
      const { data, error } = await supabase.functions.invoke("interview-transcribe-audio", {
        body: {
          interview_id: interviewId,
          audio_file_bucket: chunk.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
          audio_file_path: chunk.audio_file_path,
          audio_file_name: chunk.audio_file_name,
          audio_mime_type: chunk.audio_mime_type || "audio/mpeg",
          audio_normalized_for_stt: true,
          original_audio_file_name: originalAudio?.original_audio_file_name,
          original_audio_mime_type: originalAudio?.original_audio_mime_type,
          original_audio_size_bytes: originalAudio?.original_audio_size_bytes,
          save_transcript: false,
          allow_empty_transcript: true,
        },
      });
      if (error) {
        const message = await readEdgeFunctionError(error, "Failed to transcribe audio");
        if (isEmptyChunkTranscriptionMessage(message)) {
          skippedChunks.push({
            chunk_index: index,
            file_name: chunk.audio_file_name,
            size_bytes: chunk.audio_size_bytes || null,
            reason: "empty_transcript",
          });
          continue;
        }
        throw new Error(message);
      }
      if (!String(data?.transcript_text || "").trim()) {
        skippedChunks.push({
          chunk_index: index,
          file_name: chunk.audio_file_name,
          size_bytes: chunk.audio_size_bytes || null,
          reason: data?.empty_transcript ? "empty_transcript" : "missing_transcript_text",
        });
        continue;
      }
      chunkResults.push({ ...data, chunk });
    }

    const transcriptText = chunkResults
      .map((result) => String(result.transcript_text || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (!transcriptText) throw new Error("AI found no usable speech in this audio.");

    const generatedAt = new Date().toISOString();
    const transcriptTurns = chunkResults.flatMap((result, resultIndex) => {
      const offset = Number(result.chunk?.start_seconds || 0) || 0;
      return (Array.isArray(result.transcript_turns) ? result.transcript_turns : []).map((turn, turnIndex) => ({
        ...turn,
        id: `chunk-${resultIndex + 1}-${turn.id || turnIndex + 1}`,
        start: Number.isFinite(Number(turn.start)) ? Number(turn.start) + offset : null,
        end: Number.isFinite(Number(turn.end)) ? Number(turn.end) + offset : null,
        chunk_index: resultIndex,
      }));
    });
    const segmentationSources = [...new Set(chunkResults
      .map((result) => String(result.segmentation_source || "").trim())
      .filter(Boolean))];
    const hasDiarization = transcriptTurns.some((turn) => turn?.speaker_id != null && turn.speaker_id !== "");
    const wordCount = chunkResults.reduce((sum, result) => sum + (Number(result.word_count) || 0), 0) || null;
    const durationSeconds = chunkResults.reduce((sum, result) => sum + (Number(result.duration_seconds) || 0), 0) || null;
    const updated = await saveRecordPatch({
      transcript_text: transcriptText,
      transcript_status: "ready",
      transcript_source: "audio",
      transcript_uploaded_at: generatedAt,
      status: selectedRecord?.status === "draft" ? "in_progress" : selectedRecord?.status,
      metadata: {
        ...(selectedRecord?.metadata || {}),
        audio_transcription: {
          provider: "xai",
          model: chunkResults[0]?.model || "grok-stt",
          generated_at: generatedAt,
          started_at: startedAt,
          language: chunkResults.find((result) => result.language)?.language || null,
          duration_seconds: durationSeconds,
          word_count: wordCount,
          diarization_enabled: hasDiarization,
          segmentation_source: segmentationSources.length === 1 ? segmentationSources[0] : "mixed_chunks",
          segmentation_sources: segmentationSources,
          transcript_turns: transcriptTurns,
          chunk_count: safeChunks.length,
          transcribed_chunk_count: chunkResults.length,
          skipped_chunk_count: skippedChunks.length,
          skipped_chunks: skippedChunks,
          source_audio: {
            bucket: originalAudio?.original_audio_file_bucket || originalAudio?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
            path: originalAudio?.original_audio_file_path || originalAudio?.audio_file_path || safeChunks[0]?.audio_file_path,
            file_name: originalAudio?.original_audio_file_name || originalAudio?.audio_file_name || safeChunks[0]?.audio_file_name,
            mime_type: originalAudio?.original_audio_mime_type || originalAudio?.audio_mime_type || safeChunks[0]?.audio_mime_type || "audio/mpeg",
            size_bytes: safeChunks.reduce((sum, chunk) => sum + (Number(chunk.audio_size_bytes) || 0), 0) || null,
            original_bucket: originalAudio?.original_audio_file_bucket || originalAudio?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
            original_path: originalAudio?.original_audio_file_path || null,
            original_file_name: originalAudio?.original_audio_file_name || originalAudio?.audio_file_name,
            original_mime_type: originalAudio?.original_audio_mime_type || null,
            original_size_bytes: originalAudio?.original_audio_size_bytes || null,
            normalized_for_stt: !originalAudio?.original_audio_file_path,
            chunks: safeChunks.map((chunk) => ({
              bucket: chunk.audio_file_bucket || originalAudio?.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
              path: chunk.audio_file_path,
              file_name: chunk.audio_file_name,
              size_bytes: chunk.audio_size_bytes || null,
              start_seconds: chunk.start_seconds || null,
            })),
          },
        },
      },
    });
    return updated;
  };

  const handleAudioUpload = async (file) => {
    if (!selectedRecord?.id || !file) return;
    if (!canManage) {
      showToast("You do not have permission to manage interviews", "error");
      return;
    }
    const validation = validateInterviewAudioFile(file);
    if (!validation.ok) {
      showToast(validation.error, "error");
      return;
    }
    setAudioTranscribing(true);
    try {
      const requiresServerNormalization = shouldNormalizeInterviewAudioForStt(file);
      if (requiresServerNormalization) {
        showToast("Uploading Voice Memos audio for server conversion");
      }
      const path = buildInterviewAudioPath({ locationId, interviewId: selectedRecord.id, fileName: file.name });
      const contentType = validation.contentType || getInterviewAudioContentType(file);
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(path, file, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      setAudioFileName(file.name);

      let transcriptionPayload = {
        interview_id: selectedRecord.id,
        audio_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
        audio_file_path: path,
        audio_file_name: file.name,
        audio_mime_type: contentType,
        audio_normalized_for_stt: false,
        original_audio_file_name: file.name || "interview-audio",
        original_audio_mime_type: contentType,
        original_audio_size_bytes: Number(file.size || 0) || null,
      };

      if (requiresServerNormalization) {
        showToast("Converting Voice Memos audio for transcription");
        const normalizedAudio = await normalizeInterviewAudioForSttOnServer(transcriptionPayload);
        transcriptionPayload = {
          interview_id: selectedRecord.id,
          audio_file_bucket: normalizedAudio.audio_file_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET,
          audio_file_path: normalizedAudio.audio_file_path,
          audio_file_name: normalizedAudio.audio_file_name,
          audio_mime_type: normalizedAudio.audio_mime_type,
          audio_normalized_for_stt: true,
          original_audio_file_name: normalizedAudio.original_audio_file_name || file.name,
          original_audio_mime_type: normalizedAudio.original_audio_mime_type || contentType,
          original_audio_size_bytes: normalizedAudio.original_audio_size_bytes || Number(file.size || 0) || null,
        };
        if (Array.isArray(normalizedAudio.audio_chunks) && normalizedAudio.audio_chunks.length > 1) {
          const transcriptRecord = await transcribeInterviewAudioChunks({
            interviewId: selectedRecord.id,
            chunks: normalizedAudio.audio_chunks,
            originalAudio: {
              ...normalizedAudio,
              original_audio_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
              original_audio_file_path: path,
              original_audio_file_name: normalizedAudio.original_audio_file_name || file.name,
              original_audio_mime_type: normalizedAudio.original_audio_mime_type || contentType,
              original_audio_size_bytes: normalizedAudio.original_audio_size_bytes || Number(file.size || 0) || null,
            },
          });
          if (!transcriptRecord?.transcript_text) throw new Error("AI returned no transcript text.");
          const durationSeconds = Number(transcriptRecord?.metadata?.audio_transcription?.duration_seconds || 0);
          const minutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null;
          showToast(minutes ? `Audio processed: ${minutes} min. Transcript ready.` : "Audio processed. Transcript ready.");
          await loadAll(locationId);
          setSelectedRecordId(selectedRecord.id);
          await draftAttachedGuides({
            onlyEmpty: true,
            localTranscriptText: transcriptRecord.transcript_text,
            reason: "transcript",
          });
          return;
        }
        showToast("Audio converted. Sending for transcription.");
      }

      const { data: result, error } = await supabase.functions.invoke("interview-transcribe-audio", {
        body: {
          ...transcriptionPayload,
          async: true,
        },
      });
      if (error) throw new Error(await readEdgeFunctionError(error, "Failed to transcribe audio"));
      const transcriptRecord = result?.transcript_text
        ? null
        : await waitForInterviewTranscript(selectedRecord.id);
      if (!result?.transcript_text && !transcriptRecord?.transcript_text) {
        throw new Error("AI returned no transcript text.");
      }

      const durationSeconds = Number(result?.duration_seconds || transcriptRecord?.metadata?.audio_transcription?.duration_seconds || 0);
      const minutes = durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds / 60)) : null;
      showToast(minutes ? `Audio processed: ${minutes} min. Transcript ready.` : "Audio processed. Transcript ready.");
      await loadAll(locationId);
      setSelectedRecordId(selectedRecord.id);
      await draftAttachedGuides({
        onlyEmpty: true,
        localTranscriptText: result?.transcript_text || transcriptRecord?.transcript_text || selectedRecord?.transcript_text || "",
        reason: "transcript",
      });
    } catch (error) {
      showToast(safeUiError(error, "Failed to process audio"), "error");
    } finally {
      setAudioTranscribing(false);
    }
  };

  const saveTranscriptText = async ({ text, fileName = "interview-transcript.txt", source = "upload" }) => {
    if (!selectedRecord?.id) return null;
    if (!canManage) {
      showToast("You do not have permission to manage interviews", "error");
      return null;
    }
    const cleaned = cleanInterviewTranscriptText(text);
    if (!cleaned) {
      showToast("Transcript text is empty.", "error");
      return null;
    }
    setSavingTranscript(true);
    try {
      const uploadedAt = new Date().toISOString();
      const transcriptPath = buildInterviewTranscriptPath({ locationId, interviewId: selectedRecord.id, fileName });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(transcriptPath, new Blob([cleaned], { type: "text/plain" }), { upsert: true, contentType: "text/plain" });
      if (uploadError) throw uploadError;
      const updated = await saveRecordPatch({
        transcript_text: cleaned,
        transcript_status: "ready",
        transcript_source: source,
        transcript_uploaded_at: uploadedAt,
        transcript_file_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
        transcript_file_path: transcriptPath,
        status: selectedRecord.status === "draft" ? "in_progress" : selectedRecord.status,
        metadata: {
          ...(selectedRecord.metadata || {}),
          transcript_upload: {
            source,
            uploaded_at: uploadedAt,
            file_name: fileName,
            storage_path: transcriptPath,
            character_count: cleaned.length,
          },
        },
      });
      if (updated) {
        setShowTranscriptInput(false);
        setTranscriptDraft("");
        showToast("Transcript ready for AI drafting");
        await draftAttachedGuides({
          onlyEmpty: true,
          localTranscriptText: cleaned,
          reason: "transcript",
        });
      }
      return updated;
    } catch (error) {
      showToast(safeUiError(error, "Failed to save transcript"), "error");
      return null;
    } finally {
      setSavingTranscript(false);
    }
  };

  const handleTranscriptUpload = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      await saveTranscriptText({ text, fileName: file.name || "interview-transcript.txt", source: "upload" });
    } catch (error) {
      showToast(safeUiError(error, "Failed to read transcript file"), "error");
    }
  };

  const savePastedTranscript = async () => {
    await saveTranscriptText({ text: transcriptDraft, fileName: "pasted-interview-transcript.txt", source: "paste" });
  };

  const exportFinalPdf = async () => {
    const path = selectedSnapshot?.version?.source_pdf_path;
    const bucket = selectedSnapshot?.version?.source_pdf_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET;
    if (!selectedRecord?.id || !path) return;
    const guideResponses = Object.values(responsesByTarget || {});
    const unreviewedDraftCount = guideResponses.filter((response) => {
      const state = getInterviewResponseState(response);
      return (state === "ai_draft" || state === "merged_draft") && !isInterviewResponseReviewed(response);
    }).length;
    if (unreviewedDraftCount > 0 && !window.confirm(`This guide has ${unreviewedDraftCount} unreviewed AI draft${unreviewedDraftCount === 1 ? "" : "s"}. Final PDF will include reviewed/manual content only. Continue?`)) {
      return;
    }
    setExportingPdf(true);
    try {
      const { data: sourceBlob, error: downloadError } = await supabase.storage.from(bucket).download(path);
      if (downloadError) throw downloadError;
      const bytes = await sourceBlob.arrayBuffer();
      const finalMap = buildPdfResponseMap(guideResponses, selectedRecord, selectedPdfFields, { includeDrafts: false });
      const overallScoreField = selectedPdfFields.find((field) => /^overall_score$/i.test(field.name || ""));
      const overallScore = computeOverallScoreFromPdfMap(finalMap, selectedPdfFields);
      if (overallScoreField && overallScore) finalMap[overallScoreField.name] = overallScore;
      const summaryPages = buildInterviewSummaryPages({
        record: selectedRecord,
        guide: selectedGuide,
        fields: selectedPdfFields,
        questions: selectedQuestions,
        responsesByTarget,
        finalMap,
        summaryEdits: Object.keys(summaryDraftTextByKey || {}).length || customSummaryPages.length
          ? buildSummaryEditsPayload(summaryDraftTextByKey, customSummaryPages)
          : selectedRecord,
      });
      const exportFinalMap = buildExportPdfFieldMap(finalMap, selectedPdfFields);
      const filledBytes = await fillInterviewPdfBytes(bytes, exportFinalMap, { flatten: true, summaryPages });
      const sourcePageCount = Number(selectedSnapshot?.version?.pdf_page_count || 0) || (await countInterviewPdfPages(bytes).catch(() => 0));
      const finalPageCount = await countInterviewPdfPages(filledBytes).catch(() => sourcePageCount);
      const summaryPageCount = Math.max(0, finalPageCount - sourcePageCount);
      const guideSlug = (selectedGuide?.guide_label || selectedGuide?.role_label || selectedRecord.candidate_position || "interview").replace(/[^a-z0-9]+/gi, "-");
      const outputName = `${selectedRecord.candidate_full_name.replace(/[^a-z0-9]+/gi, "-") || "candidate"}-${guideSlug}-interview.pdf`;
      const artifactPath = buildInterviewArtifactPath({ locationId, interviewId: selectedRecord.id, fileName: outputName });
      const { error: uploadError } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .upload(artifactPath, new Blob([filledBytes], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
      if (uploadError) throw uploadError;
      const { data: artifact, error: artifactError } = await supabase
        .from("labor_interview_artifacts")
        .insert({
          interview_id: selectedRecord.id,
          interview_guide_id: selectedGuide?.id || null,
          artifact_type: "final_pdf",
          file_name: outputName,
          storage_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
          storage_path: artifactPath,
          mime_type: "application/pdf",
          metadata: {
            guide_label: selectedGuide?.guide_label || selectedGuide?.role_label || null,
            reviewed_only: true,
            excluded_unreviewed_drafts: unreviewedDraftCount,
            summary_page_count: summaryPageCount,
          },
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        })
        .select("*")
        .single();
      if (artifactError) throw artifactError;
      setArtifacts((prev) => [artifact, ...prev]);
      await saveRecordPatch({ status: "completed" });
      const { data: signed } = await supabase.storage
        .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .createSignedUrl(artifactPath, 60 * 5, { download: outputName });
      if (signed?.signedUrl && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = signed.signedUrl;
        link.download = outputName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      showToast("Final PDF exported");
    } catch (error) {
      showToast(safeUiError(error, "Failed to export PDF"), "error");
    } finally {
      setExportingPdf(false);
    }
  };

  const downloadArtifact = async (artifact) => {
    if (!artifact?.storage_path) return;
    try {
      const { data: signed, error } = await supabase.storage
        .from(artifact.storage_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .createSignedUrl(artifact.storage_path, 60 * 5, { download: artifact.file_name || "interview-file" });
      if (error) throw error;
      if (signed?.signedUrl && typeof document !== "undefined") {
        const link = document.createElement("a");
        link.href = signed.signedUrl;
        link.download = artifact.file_name || "interview-file";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error) {
      showToast(safeUiError(error, "Failed to download file"), "error");
    }
  };

  const openArtifact = async (artifact) => {
    if (!artifact?.storage_path) return;
    try {
      const { data: signed, error } = await supabase.storage
        .from(artifact.storage_bucket || LABOR_INTERVIEW_DOCUMENT_BUCKET)
        .createSignedUrl(artifact.storage_path, 60 * 10);
      if (error) throw error;
      if (signed?.signedUrl && typeof window !== "undefined") {
        window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      showToast(safeUiError(error, "Failed to open file"), "error");
    }
  };

  const handleResumeUpload = async (file) => {
    if (!selectedRecord?.id || !locationId || !file) return;
    if (!canManage) {
      showToast("You do not have permission to manage interviews", "error");
      return;
    }
    setResumeUploading(true);
    try {
      const artifact = await createResumeArtifact(selectedRecord.id, file, "active_interview_workspace");
      setArtifacts((prev) => [artifact, ...prev]);
      showToast("Resume uploaded");
    } catch (error) {
      showToast(safeUiError(error, "Failed to upload resume"), "error");
    } finally {
      setResumeUploading(false);
    }
  };

  const createResumeArtifact = async (interviewId, file, source = "active_interview_workspace") => {
    if (!interviewId || !locationId || !file) return null;
    const validation = validateInterviewResumeFile(file);
    if (!validation.ok) throw new Error(validation.error);
    const path = buildInterviewResumePath({ locationId, interviewId, fileName: file.name });
    const contentType = validation.contentType || file.type || "application/octet-stream";
    const { error: uploadError } = await supabase.storage
      .from(LABOR_INTERVIEW_DOCUMENT_BUCKET)
      .upload(path, file, { upsert: true, contentType });
    if (uploadError) throw uploadError;
    const { data: artifact, error: artifactError } = await supabase
      .from("labor_interview_artifacts")
      .insert({
        interview_id: interviewId,
        interview_guide_id: null,
        artifact_type: "resume",
        file_name: sanitizeInterviewFileName(file.name || "resume"),
        storage_bucket: LABOR_INTERVIEW_DOCUMENT_BUCKET,
        storage_path: path,
        mime_type: contentType,
        metadata: {
          original_file_name: file.name || "resume",
          size_bytes: Number(file.size || 0) || null,
          source,
        },
        created_by_user_id: actorUserId,
        created_by_name: actorName,
      })
      .select("*")
      .single();
    if (artifactError) throw artifactError;
    return artifact;
  };

  const getPdfFieldValue = (field) => {
    const key = responseKeyForPdfField(field);
    const metadataValue = buildPdfResponseMap([], selectedRecord, [field])[field.name] || "";
    if (Object.prototype.hasOwnProperty.call(responseDrafts, key)) return responseDrafts[key] ?? "";
    return metadataValue;
  };

  const setPdfFieldDraft = (field, value, options = null) => {
    const key = responseKeyForPdfField(field);
    setResponseDrafts((prev) => ({
      ...prev,
      ...(options?.aggregateKey ? { [options.aggregateKey]: options.aggregateValue || "" } : {}),
      [key]: value,
    }));
    if (pdfSaveTimersRef.current[key]) clearTimeout(pdfSaveTimersRef.current[key]);
    pdfSaveTimersRef.current[key] = setTimeout(() => {
      savePdfFieldResponse(field, value);
    }, 650);
  };

  const setQuestionResponseDraft = (question, value) => {
    const key = responseKeyForQuestion(question);
    setResponseDrafts((prev) => ({ ...prev, [key]: value }));
    if (questionSaveTimersRef.current[key]) clearTimeout(questionSaveTimersRef.current[key]);
    questionSaveTimersRef.current[key] = setTimeout(() => {
      saveCustomQuestionResponse(question, value);
    }, 650);
  };

  const savePdfFieldResponse = (field, value) => saveResponse({
    responseType: "pdf_field",
    key: field.name,
    prompt: field.name,
    value,
  });

  const approvePdfField = (field, value) => saveResponse({
    responseType: "pdf_field",
    key: field.name,
    prompt: field.name,
    value,
    responseState: "ai_approved",
    metadataPatch: {
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: actorName,
    },
  });

  const rejectPdfField = (field) => saveResponse({
    responseType: "pdf_field",
    key: field.name,
    prompt: field.name,
    value: "",
    responseState: "rejected",
    metadataPatch: {
      approved: false,
      rejected_at: new Date().toISOString(),
      rejected_by: actorName,
    },
  });

  const saveCustomQuestionResponse = (question, value) => saveResponse({
    responseType: "custom_question",
    key: question.question_key,
    prompt: question.prompt,
    value,
  });

  const approveCustomQuestion = (question, value) => saveResponse({
    responseType: "custom_question",
    key: question.question_key,
    prompt: question.prompt,
    value,
    responseState: "ai_approved",
    metadataPatch: {
      approved: true,
      approved_at: new Date().toISOString(),
      approved_by: actorName,
    },
  });

  const rejectCustomQuestion = (question) => saveResponse({
    responseType: "custom_question",
    key: question.question_key,
    prompt: question.prompt,
    value: "",
    responseState: "rejected",
    metadataPatch: {
      approved: false,
      rejected_at: new Date().toISOString(),
      rejected_by: actorName,
    },
  });

  const saveTemplatePayRates = async (version) => {
    if (!version?.id) return;
    if (version.status !== "draft") {
      showToast("Create a draft template version before changing pay rates.", "error");
      return;
    }
    const draft = payRateDrafts[version.id] || payRatesFromVersion(version);
    setTemplateActionId(`pay-${version.id}`);
    try {
      const { data: updated, error } = await supabase
        .from("labor_interview_template_versions")
        .update({
          metadata: buildPayRateMetadata(version, draft, actorName),
        })
        .eq("id", version.id)
        .select("*")
        .single();
      if (error) throw error;
      setVersions((prev) => prev.map((row) => row.id === updated.id ? updated : row));
      setPayRateDrafts((prev) => ({ ...prev, [updated.id]: payRatesFromVersion(updated) }));
      showToast("Pay rates saved");
    } catch (error) {
      showToast(safeUiError(error, "Failed to save pay rates"), "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const uploadTemplatePdf = async (version, file) => {
    if (!requireInterviewManagement()) return;
    if (!version || !file || version.status !== "draft") return;
    setTemplateActionId(version.id);
    try {
      const bytes = await file.arrayBuffer();
      const verification = await extractPdfFieldManifest(bytes);
      let questionPrompts = {};
      try {
        questionPrompts = await extractPdfQuestionPromptMap(bytes);
      } catch (_) {
        questionPrompts = {};
      }
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
            ...(Object.keys(questionPrompts).length ? { pdf_question_prompts: questionPrompts } : {}),
            pdf_question_count: Object.keys(questionPrompts).length,
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
    if (!requireInterviewManagement()) return;
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
    if (!requireInterviewManagement()) return;
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
          metadata: baseVersion?.metadata || {},
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

  const createPositionType = async () => {
    if (!requireInterviewManagement()) return;
    const roleLabel = String(newPositionDraft.role_label || "").trim();
    if (!roleLabel) {
      showToast("Position name is required.", "error");
      return;
    }
    const roleKeyBase = normalizeQuestionKey(roleLabel).replace(/^question_1$/, "position");
    const roleKey = `${roleKeyBase}_${Date.now().toString(36)}`;
    setTemplateActionId("new-position");
    try {
      const { data: template, error: templateError } = await supabase
        .from("labor_interview_templates")
        .insert({
          location_id: locationId,
          role_key: roleKey,
          role_label: roleLabel,
          description: newPositionDraft.description || null,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (templateError) throw templateError;
      const { data: version, error: versionError } = await supabase
        .from("labor_interview_template_versions")
        .insert({
          template_id: template.id,
          version_no: 1,
          status: "draft",
          is_current: false,
          pdf_field_manifest: [],
          pdf_verification_status: "missing_pdf",
          metadata: buildPayRateMetadata({}, {
            min_rate: newPositionDraft.pay_rate_min,
            max_rate: newPositionDraft.pay_rate_max,
            notes: newPositionDraft.pay_rate_notes,
          }, actorName),
          created_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (versionError) throw versionError;
      if (sharedQuestions.length) {
        const rows = sharedQuestions.map((question, index) => ({
          template_version_id: version.id,
          question_key: normalizeQuestionKey(question.prompt, index),
          category: question.category || "Custom",
          prompt: question.prompt,
          helper_text: question.helper_text || null,
          sequence_order: question.sequence_order || ((index + 1) * 10),
          required: !!question.required,
          answer_format: question.answer_format || "long_text",
          mapped_pdf_field_name: question.mapped_pdf_field_name || null,
          metadata: question.metadata || {},
        }));
        const { error: questionError } = await supabase.from("labor_interview_template_questions").insert(rows);
        if (questionError) throw questionError;
      }
      setShowNewPosition(false);
      setNewPositionDraft(buildNewPositionDraft());
      await loadAll(locationId);
      showToast("Position type created");
    } catch (error) {
      showToast(safeUiError(error, "Failed to create position type"), "error");
    } finally {
      setTemplateActionId("");
    }
  };

  const getDraftQuestionMatches = (question) => {
    const draftIds = new Set(draftVersions.map((version) => version.id));
    return questions.filter((row) => {
      if (!draftIds.has(row.template_version_id)) return false;
      return row.sequence_order === question.sequence_order || row.question_key === question.question_key;
    });
  };

  const saveSharedQuestion = async (question, patch) => {
    if (!requireInterviewManagement()) return;
    const rows = getDraftQuestionMatches(question);
    if (!rows.length) {
      showToast("Create draft template versions before editing shared questions.", "error");
      return;
    }
    try {
      const updates = rows.map((row) => supabase
        .from("labor_interview_template_questions")
        .update({
          category: patch.category ?? row.category,
          prompt: patch.prompt ?? row.prompt,
          helper_text: patch.helper_text ?? row.helper_text,
          mapped_pdf_field_name: patch.mapped_pdf_field_name ?? row.mapped_pdf_field_name,
          required: patch.required ?? row.required,
        })
        .eq("id", row.id)
        .select("*")
        .single());
      const results = await Promise.all(updates);
      const errorResult = results.find((result) => result.error);
      if (errorResult?.error) throw errorResult.error;
      const updatedRows = results.map((result) => result.data);
      setQuestions((prev) => prev.map((row) => updatedRows.find((updated) => updated.id === row.id) || row));
    } catch (error) {
      showToast(safeUiError(error, "Failed to save shared question"), "error");
    }
  };

  const addSharedQuestion = async () => {
    if (!requireInterviewManagement()) return;
    const draft = newQuestionDrafts.shared || {};
    const prompt = String(draft.prompt || "").trim();
    if (!prompt) return;
    if (!draftVersions.length) {
      showToast("Create draft template versions before adding shared questions.", "error");
      return;
    }
    const sequence = Math.max(0, ...sharedQuestions.map((question) => Number(question.sequence_order || 0))) + 10;
    try {
      const rows = draftVersions.map((version, index) => ({
        template_version_id: version.id,
        question_key: normalizeQuestionKey(prompt, sharedQuestions.length + index),
        category: draft.category || "Custom",
        prompt,
        sequence_order: sequence,
        required: !!draft.required,
        answer_format: "long_text",
        mapped_pdf_field_name: draft.mapped_pdf_field_name || null,
      }));
      const { data: created, error } = await supabase
        .from("labor_interview_template_questions")
        .insert(rows)
        .select("*");
      if (error) throw error;
      setQuestions((prev) => [...prev, ...(created || [])]);
      setNewQuestionDrafts((prev) => ({ ...prev, shared: { category: draft.category || "Custom", prompt: "" } }));
      showToast("Shared question added");
    } catch (error) {
      showToast(safeUiError(error, "Failed to add shared question"), "error");
    }
  };

  const deleteSharedQuestion = async (question) => {
    if (!requireInterviewManagement()) return;
    if (!window.confirm("Delete this shared draft question from all draft templates?")) return;
    const rows = getDraftQuestionMatches(question);
    if (!rows.length) return;
    try {
      const ids = rows.map((row) => row.id);
      const { error } = await supabase.from("labor_interview_template_questions").delete().in("id", ids);
      if (error) throw error;
      setQuestions((prev) => prev.filter((row) => !ids.includes(row.id)));
      showToast("Shared question deleted");
    } catch (error) {
      showToast(safeUiError(error, "Failed to delete shared question"), "error");
    }
  };

  const reorderSharedQuestion = async (sourceId, targetId) => {
    if (!requireInterviewManagement()) return;
    if (!sourceId || !targetId || sourceId === targetId || !draftVersions.length) return;
    const sourceIndex = sharedQuestions.findIndex((question) => question.id === sourceId);
    const targetIndex = sharedQuestions.findIndex((question) => question.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...sharedQuestions];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    const orderMap = new Map(next.map((question, index) => [question.sequence_order, (index + 1) * 10]));
    const rowsToUpdate = questions.filter((row) => draftVersions.some((version) => version.id === row.template_version_id) && orderMap.has(row.sequence_order));
    try {
      await Promise.all(rowsToUpdate.map((row) => supabase
        .from("labor_interview_template_questions")
        .update({ sequence_order: orderMap.get(row.sequence_order) })
        .eq("id", row.id)));
      setQuestions((prev) => prev.map((row) => orderMap.has(row.sequence_order) ? { ...row, sequence_order: orderMap.get(row.sequence_order) } : row));
    } catch (error) {
      showToast(safeUiError(error, "Failed to reorder shared questions"), "error");
    }
  };

  const attachGuideToInterview = async () => {
    if (!requireInterviewManagement()) return;
    if (!selectedRecord?.id || !guideAttachVersionId) return;
    const version = publishedVersions.find((row) => row.id === guideAttachVersionId);
    const template = templates.find((row) => row.id === version?.template_id);
    if (!version || !template) {
      showToast("Choose a published guide to attach.", "error");
      return;
    }
    if (selectedGuides.some((guide) => guide.template_version_id === version.id)) {
      showToast("That guide is already attached to this interview.", "error");
      return;
    }
    const versionQuestions = questionsByVersion[version.id] || [];
    const snapshot = buildInterviewTemplateSnapshot({ template, version, questions: versionQuestions });
    const nextSequence = Math.max(0, ...selectedGuides.map((guide) => Number(guide.sequence_order || 0))) + 10;
    setRecordSaving(true);
    try {
      const { data: guide, error } = await supabase
        .from("labor_interview_record_guides")
        .insert({
          interview_id: selectedRecord.id,
          location_id: locationId,
          template_id: template.id,
          template_version_id: version.id,
          guide_label: template.role_label,
          role_key: template.role_key,
          role_label: template.role_label,
          guide_status: "draft",
          sequence_order: nextSequence,
          template_snapshot: snapshot,
          pdf_field_manifest_snapshot: version.pdf_field_manifest || [],
          question_snapshot: snapshot.questions || [],
          metadata: { attached_from_interview: true },
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      setGuides((prev) => [...prev, guide]);
      setActiveGuideId(guide.id);
      setGuideAttachVersionId("");
      showToast(`${template.role_label} guide attached`);
      if (String(selectedRecord?.transcript_text || "").trim()) {
        await draftAttachedGuides({
          guidesToDraft: [guide],
          onlyEmpty: false,
          localTranscriptText: selectedRecord.transcript_text,
          reason: "attach",
        });
      }
    } catch (error) {
      showToast(safeUiError(error, "Failed to attach guide"), "error");
    } finally {
      setRecordSaving(false);
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

  const attachGuideOptions = useMemo(() => {
    const attached = new Set(selectedGuides.map((guide) => guide.template_version_id));
    return templateOptions.filter((option) => !attached.has(option.value));
  }, [selectedGuides, templateOptions]);

  // When embedded in the Labor module, don't gate the whole view on loading or
  // location resolution — that empties the search slot above the tabs and makes
  // the search bar flash on tab switch. Render immediately (the search needs no
  // data); records fill in once loaded.
  if (loading && !embedded) {
    return <div style={{ textAlign: "center", padding: 50, color: C.textMut }}>Loading interviews...</div>;
  }

  if (!locationId && !loading) {
    return <EmptyState title="Location Required" body="Labor interviews need a resolved location before templates, records, and private PDFs can be loaded." />;
  }

  if (schemaError) {
    return <EmptyState title="Interview Tables Pending" body={schemaError} />;
  }

  const inInterviewDetail = view === "records" && !!selectedRecord;

  return (
    <div>
      <InterviewStyles />
      {!inInterviewDetail && !embedded && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "inline-flex", border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {[
              { id: "records", label: "Interviews" },
              canManage ? { id: "config", label: "Configuration" } : null,
            ].filter(Boolean).map((item) => (
              <button
                key={item.id}
                onClick={() => changeView(item.id)}
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
          {canManage && <Btn variant="primary" onClick={() => setShowNewInterview(true)} disabled={templateOptions.length === 0}>Add New Interview</Btn>}
        </div>
      )}

      {view === "records" && !selectedRecord && (
        <InterviewRoster records={records} onOpen={setSelectedRecordId} onAdd={() => setShowNewInterview(true)} canAdd={canManage && templateOptions.length > 0} searchSlot={searchSlot} introValue={introValue} canEditIntro={canEditIntro} onSaveIntro={onSaveIntro} />
      )}

      {view === "records" && selectedRecord && (
        <div className="interview-detail-shell">
          <CandidateHeader
            record={selectedRecord}
            recommendation={getInterviewRecommendation(selectedRecord)}
            payRateSummary={selectedPayRateSummary}
            onRecommendationChange={(value) => saveRecordMetadataPatch({ hiring_recommendation: value })}
            onEdit={() => setShowCandidateEdit(true)}
            onDelete={deleteSelectedInterview}
            onBack={() => setSelectedRecordId("")}
            saving={recordSaving}
            canManage={canManage}
          />

          {!selectedRecordCanAccessIdentity ? (
            <RestrictedInterviewDetail record={selectedRecord} />
          ) : (
            <>
          <input
            ref={resumeInputRef}
            type="file"
            accept={INTERVIEW_RESUME_ACCEPT}
            style={{ display: "none" }}
            onChange={(event) => {
              handleResumeUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <ResumePanel
            resumeArtifact={selectedResumeArtifact}
            resumeCount={resumeArtifacts.length}
            uploading={resumeUploading}
            onUploadClick={() => resumeInputRef.current?.click()}
            onOpen={openArtifact}
            onDownload={downloadArtifact}
            canUpload={canManage}
          />

          <div className="interview-detail-card" style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 14, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 950, color: C.text }}>Attached Guides</div>
                <div style={{ marginTop: 4, color: C.textMut, fontSize: 12 }}>One transcript can fill multiple role guides for this candidate.</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) auto", gap: 8, alignItems: "center" }}>
                <CustomSelect
                  value={guideAttachVersionId}
                  onChange={setGuideAttachVersionId}
                  options={attachGuideOptions}
                  placeholder={attachGuideOptions.length ? "Attach another guide" : "All guides attached"}
                  disabled={!canManage}
                />
                <Btn variant="secondary" size="sm" onClick={attachGuideToInterview} disabled={!canManage || !guideAttachVersionId || recordSaving}>Attach</Btn>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedGuides.map((guide) => {
                const active = guide === selectedGuide || guide.id === selectedGuide?.id;
                const guideResponses = responses.filter((response) => (guide.id ? response.interview_guide_id === guide.id : !response.interview_guide_id));
                const approved = guideResponses.filter(isInterviewResponseReviewed).length;
                const drafts = guideResponses.filter((response) => getInterviewResponseState(response) === "ai_draft" || getInterviewResponseState(response) === "merged_draft").length;
                return (
                  <button
                    type="button"
                    key={guide.id || "legacy-guide"}
                    onClick={() => setActiveGuideId(guide.id || "")}
                    style={{
                      border: `1px solid ${active ? C.pri : C.border}`,
                      background: active ? "#ecfdf5" : "#fff",
                      color: active ? C.pri : C.textSec,
                      borderRadius: 8,
                      padding: "9px 11px",
                      fontFamily: "inherit",
                      cursor: "pointer",
                      minWidth: 170,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 950, color: active ? C.pri : C.text }}>{guide.guide_label || guide.role_label}</div>
                    <div style={{ marginTop: 3, fontSize: 11, color: C.textMut }}>{approved} approved / {drafts} draft</div>
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
              <CustomSelect
                value={aiReviewMode}
                onChange={changeAiReviewMode}
                options={INTERVIEW_AI_REVIEW_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
                placeholder="AI strictness"
                disabled={!canManage || aiDrafting || recordSaving}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ color: C.textMut, fontSize: 12, lineHeight: 1.45, flex: "1 1 260px" }}>
                  {aiDrafting ? "AI is drafting responses with the selected strictness." : INTERVIEW_AI_REVIEW_MODES.find((mode) => mode.value === aiReviewMode)?.description}
                </div>
                <Btn
                  variant="secondary"
                  size="sm"
                  onClick={() => draftAttachedGuides({ onlyEmpty: false, reason: "manual" })}
                  disabled={!canManage || aiDrafting || recordSaving || !selectedGuides.length || !String(selectedRecord?.transcript_text || "").trim()}
                >
                  Draft Attached Guides
                </Btn>
              </div>
            </div>
          </div>

          <AudioUploadPanel
            record={selectedRecord}
            audioFileName={audioFileName}
            transcribing={audioTranscribing}
            drafting={aiDrafting}
            onUpload={handleAudioUpload}
            onTranscriptUpload={handleTranscriptUpload}
            onTranscriptPasteOpen={() => {
              setTranscriptDraft(selectedRecord.transcript_text || "");
              setShowTranscriptInput(true);
            }}
            onTranscriptClick={() => setShowTranscriptModal(true)}
            inputRef={audioInputRef}
            transcriptInputRef={transcriptInputRef}
            audioRef={audioPlayerRef}
            audioUrl={audioUrl}
            audioPlaying={audioPlaying}
            currentTime={audioCurrentTime}
            audioDuration={audioDuration}
            transcriptTurns={selectedTranscriptTurns}
            onPlayToggle={toggleAudioPlayback}
            onAudioSeek={seekAudioPlayback}
            onAudioTimeUpdate={handleAudioTimeUpdate}
            onAudioLoadedMetadata={handleAudioLoadedMetadata}
            onAudioEnded={handleAudioEnded}
            onAudioError={handleAudioPlaybackError}
            canUpload={canManage}
          />

          <div className="interview-detail-card" style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 18, display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 950, color: C.text }}>Active Interview Workspace</div>
                <div style={{ marginTop: 5, fontSize: 13, color: C.textMut, lineHeight: 1.45, maxWidth: 820 }}>
                  Resume, guide fields, custom responses, transcript artifacts, and pay context for this applicant.
                </div>
              </div>
              <Btn
                variant="primary"
                onClick={() => {
                  setActiveInterviewPane(selectedPdfFields.length ? "guide" : selectedResumeArtifact ? "resume" : "questions");
                  setShowActiveInterview(true);
                }}
              >
                Open Workspace
              </Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              <button
                type="button"
                className="interview-workspace-tile"
                onClick={() => {
                  setActiveInterviewPane("resume");
                  setShowActiveInterview(true);
                }}
                style={{ textAlign: "left", border: `1px solid ${C.borderLight}`, background: C.surfaceHover, borderRadius: 8, padding: 14, cursor: "pointer", fontFamily: "inherit", transition: "transform 160ms ease, box-shadow 160ms ease" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 950, color: C.text }}>Resume</div>
                  <Badge color={selectedResumeArtifact ? "success" : "default"}>{selectedResumeArtifact ? "Attached" : "Missing"}</Badge>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedResumeArtifact?.file_name || "Upload the candidate resume"}
                </div>
              </button>
              <button
                type="button"
                className="interview-workspace-tile"
                onClick={() => {
                  setActiveInterviewPane("guide");
                  setShowActiveInterview(true);
                }}
                style={{ textAlign: "left", border: `1px solid ${C.borderLight}`, background: C.surfaceHover, borderRadius: 8, padding: 14, cursor: "pointer", fontFamily: "inherit", transition: "transform 160ms ease, box-shadow 160ms ease" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 950, color: C.text }}>Interview Guide</div>
                  <Badge color={selectedGuideReviewItems.length ? "success" : "warning"}>{selectedGuideReviewedCount}/{selectedGuideReviewItems.length}</Badge>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: C.textMut }}>{pdfPreviewUrl ? selectedSnapshot?.version?.source_pdf_file_name || "Branded PDF ready" : "No published guide PDF"}</div>
              </button>
              <button
                type="button"
                className="interview-workspace-tile"
                onClick={() => {
                  setActiveInterviewPane("questions");
                  setShowActiveInterview(true);
                }}
                style={{ textAlign: "left", border: `1px solid ${C.borderLight}`, background: C.surfaceHover, borderRadius: 8, padding: 14, cursor: "pointer", fontFamily: "inherit", transition: "transform 160ms ease, box-shadow 160ms ease" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 950, color: C.text }}>Custom Questions</div>
                  <Badge color={selectedQuestions.length ? "info" : "default"}>{selectedQuestionReviewedCount}/{selectedQuestions.length}</Badge>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: C.textMut }}>Applicant-level answers shared across attached guides.</div>
              </button>
              <div style={{ border: `1px solid ${C.borderLight}`, background: C.surfaceHover, borderRadius: 8, padding: 14, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pay Reference</div>
                <div style={{ fontSize: 15, fontWeight: 950, color: C.text }}>{selectedPayRateSummary || "Not configured"}</div>
                <div style={{ fontSize: 12, color: C.textMut }}>Configured on the selected interview template.</div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      )}

      {view === "config" && canManage && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <SectionHeading title="Interview Configuration" detail="Role templates, position pay rates, and shared custom questions." />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Btn variant="secondary" onClick={() => setShowConfigSettings((prev) => !prev)}>Settings</Btn>
              <Btn variant="primary" onClick={() => setShowNewPosition(true)}>Create Position Type</Btn>
            </div>
          </div>

          {showConfigSettings && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 950, color: C.text }}>Automatically Score Candidates</div>
                <div style={{ marginTop: 4, fontSize: 13, color: C.textMut, lineHeight: 1.45, maxWidth: 720 }}>
                  When enabled, the interview guide scorecard is drafted from the structured transcript during the audio processing pass. The manager still reviews and approves every field.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoScorePreference(!autoScoreCandidates)}
                aria-pressed={autoScoreCandidates}
                style={{
                  width: 142,
                  height: 40,
                  borderRadius: 8,
                  border: `1px solid ${autoScoreCandidates ? C.pri : C.border}`,
                  background: autoScoreCandidates ? C.pri : C.surfaceHover,
                  color: autoScoreCandidates ? "#fff" : C.textSec,
                  fontFamily: "inherit",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {autoScoreCandidates ? "Scoring On" : "Scoring Off"}
              </button>
            </div>
          )}

          <div className="interview-config-grid">
            {templates.map((template) => {
              const templateVersions = versionsByTemplate[template.id] || [];
              const current = templateVersions.find((version) => version.is_current);
              const draft = templateVersions.find((version) => version.status === "draft");
              const editableVersion = draft || current || templateVersions[0];
              const pdfFields = Array.isArray(editableVersion?.pdf_field_manifest) ? editableVersion.pdf_field_manifest : [];
              const editable = editableVersion?.status === "draft";
              const payRateDraft = editableVersion ? (payRateDrafts[editableVersion.id] || payRatesFromVersion(editableVersion)) : {};
              const payRateSummary = formatInterviewPayRateSummary(payRateDraft);
              const versionLabel = editableVersion
                ? `${LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS[editableVersion.status] || editableVersion.status} v${editableVersion.version_no}`
                : "No template version";
              return (
                <div key={template.id} className="interview-config-row">
                  <div className="interview-config-role">
                    <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0, fontSize: 18, fontWeight: 950, color: C.text, lineHeight: 1.18 }}>{template.role_label}</div>
                      <Badge color={editableVersion?.pdf_verification_status === "verified_fields" ? "success" : "warning"}>{pdfFields.length} fields</Badge>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 12, color: C.textMut, fontWeight: 800 }}>{versionLabel}</div>
                  </div>
                  {editableVersion && (
                    <div className="interview-pay-editor">
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: C.text, fontWeight: 950 }}>Pay Rates</div>
                        <div style={{ minWidth: 0, fontSize: 11, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payRateSummary || "No pay range configured"}</div>
                      </div>
                      <div className="interview-pay-fields">
                        <Inp
                          label="Min"
                          value={payRateDraft.min_rate || ""}
                          disabled={!editable}
                          placeholder="18"
                          onChange={(value) => setPayRateDrafts((prev) => ({
                            ...prev,
                            [editableVersion.id]: { ...(prev[editableVersion.id] || payRatesFromVersion(editableVersion)), min_rate: value },
                          }))}
                        />
                        <Inp
                          label="Max"
                          value={payRateDraft.max_rate || ""}
                          disabled={!editable}
                          placeholder="20"
                          onChange={(value) => setPayRateDrafts((prev) => ({
                            ...prev,
                            [editableVersion.id]: { ...(prev[editableVersion.id] || payRatesFromVersion(editableVersion)), max_rate: value },
                          }))}
                        />
                        <Inp
                          label="Notes"
                          value={payRateDraft.notes || ""}
                          disabled={!editable}
                          placeholder="Optional notes"
                          onChange={(value) => setPayRateDrafts((prev) => ({
                            ...prev,
                            [editableVersion.id]: { ...(prev[editableVersion.id] || payRatesFromVersion(editableVersion)), notes: value },
                          }))}
                        />
                      </div>
                      {!editable && <div style={{ fontSize: 11, color: C.textMut }}>Create a draft version to edit pay rates.</div>}
                    </div>
                  )}
                  <div className="interview-config-actions">
                    {editableVersion && (
                      <Btn
                        variant="secondary"
                        size="sm"
                        onClick={() => saveTemplatePayRates(editableVersion)}
                        disabled={!editable || templateActionId === `pay-${editableVersion.id}`}
                      >
                        {templateActionId === `pay-${editableVersion.id}` ? "Saving..." : "Save"}
                      </Btn>
                    )}
                    {editableVersion && (
                      <input
                        ref={(node) => { if (node) pdfInputRefs.current[editableVersion.id] = node; }}
                        type="file"
                        accept={INTERVIEW_PDF_ACCEPT}
                        style={{ display: "none" }}
                        disabled={!editable}
                        onChange={(event) => {
                          uploadTemplatePdf(editableVersion, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    )}
                    <Btn variant="secondary" size="sm" onClick={() => editableVersion && pdfInputRefs.current[editableVersion.id]?.click()} disabled={!editable || templateActionId === editableVersion?.id}>Upload PDF</Btn>
                    <Btn variant="secondary" size="sm" onClick={() => createDraftVersion(template)} disabled={!!draft || templateActionId === template.id}>{draft ? "Draft Ready" : "New Draft"}</Btn>
                    <Btn variant="primary" size="sm" onClick={() => publishVersion(template, editableVersion)} disabled={!editable || editableVersion?.pdf_verification_status !== "verified_fields" || templateActionId === editableVersion?.id}>Publish</Btn>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setConfigQuestionsOpen((prev) => !prev)}
              style={{ width: "100%", padding: "15px 16px", border: "none", background: C.surfaceHover, borderBottom: configQuestionsOpen ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
            >
              <div>
                <div style={{ fontSize: 16, color: C.text, fontWeight: 950 }}>Shared Custom Questions</div>
                <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{sharedQuestions.length} questions</div>
              </div>
              <div style={{ color: C.pri, fontWeight: 950 }}>{configQuestionsOpen ? "Collapse" : "Expand"}</div>
            </button>

            {configQuestionsOpen && (
              <div style={{ padding: 16, display: "grid", gap: 14 }}>
                {Object.entries(sharedQuestions.reduce((groups, question) => {
                  const category = question.category || "Custom";
                  if (!groups[category]) groups[category] = [];
                  groups[category].push(question);
                  return groups;
                }, {})).map(([category, categoryQuestions]) => (
                  <div key={category} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", background: C.surfaceHover, borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ color: C.text, fontSize: 13, fontWeight: 950 }}>{category}</div>
                      <div style={{ color: C.textMut, fontSize: 12, fontWeight: 800 }}>{categoryQuestions.length} question{categoryQuestions.length === 1 ? "" : "s"}</div>
                    </div>
                    <div style={{ display: "grid" }}>
                      {categoryQuestions.map((question) => {
                        const draft = questionDrafts[question.id] || question;
                        const canEdit = draftVersions.length > 0;
                        return (
                          <div
                            key={question.id}
                            draggable={canEdit}
                            onDragStart={() => setDragQuestionId(question.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              reorderSharedQuestion(dragQuestionId, question.id);
                              setDragQuestionId("");
                            }}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "34px minmax(120px, 180px) minmax(0, 1fr) auto",
                              gap: 10,
                              alignItems: "center",
                              padding: "10px 12px",
                              borderBottom: `1px solid ${C.borderLight}`,
                              background: "#fff",
                            }}
                          >
                            <div style={{ color: C.textMut, fontWeight: 950, textAlign: "center", cursor: canEdit ? "grab" : "default" }}>::</div>
                            <input
                              value={draft.category || ""}
                              disabled={!canEdit}
                              aria-label="Question category"
                              onChange={(event) => setQuestionDrafts((prev) => ({ ...prev, [question.id]: { ...draft, category: event.target.value } }))}
                              onBlur={(event) => saveSharedQuestion(question, { category: event.target.value })}
                              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", color: C.text, background: canEdit ? "#fff" : C.surfaceHover }}
                            />
                            <input
                              value={draft.prompt || ""}
                              disabled={!canEdit}
                              aria-label="Question prompt"
                              onChange={(event) => setQuestionDrafts((prev) => ({ ...prev, [question.id]: { ...draft, prompt: event.target.value } }))}
                              onBlur={(event) => saveSharedQuestion(question, { prompt: event.target.value })}
                              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", color: C.text, background: canEdit ? "#fff" : C.surfaceHover }}
                            />
                            <Btn variant="danger" size="sm" disabled={!canEdit} onClick={() => deleteSharedQuestion(question)}>Delete</Btn>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {draftVersions.length === 0 && (
                  <div style={{ padding: 12, border: `1px solid ${C.borderLight}`, borderRadius: 8, background: C.surfaceHover, color: C.textMut, fontSize: 13 }}>Create a draft position template to edit shared questions.</div>
                )}

                {draftVersions.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) auto", gap: 10, alignItems: "end", padding: 12, border: `1.5px dashed ${C.border}`, borderRadius: 8, background: C.surfaceHover }}>
                    <Inp label="Category" value={newQuestionDrafts.shared?.category || "Custom"} onChange={(value) => setNewQuestionDrafts((prev) => ({ ...prev, shared: { ...(prev.shared || {}), category: value } }))} />
                    <Inp label="New Question" value={newQuestionDrafts.shared?.prompt || ""} onChange={(value) => setNewQuestionDrafts((prev) => ({ ...prev, shared: { ...(prev.shared || {}), prompt: value } }))} />
                    <Btn variant="secondary" onClick={addSharedQuestion}>Add</Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {canManage && showNewInterview && (
        <NewInterviewModal
          draft={newInterviewDraft}
          templateOptions={templateOptions}
          selectedTemplate={selectedTemplate}
          selectedTemplateVersion={selectedTemplateVersion}
          resumeFile={newInterviewResumeFile}
          resumeInputRef={newInterviewResumeInputRef}
          saving={savingNewInterview}
          onDraftChange={(patch) => setNewInterviewDraft((prev) => ({ ...prev, ...patch }))}
          onTemplateChange={(value) => {
            const version = versions.find((row) => row.id === value);
            const template = templates.find((row) => row.id === version?.template_id);
            setNewInterviewDraft((prev) => ({
              ...prev,
              template_version_id: value,
              candidate_position: template?.role_label || prev.candidate_position,
            }));
          }}
          onResumeChange={(file) => {
            if (!file) {
              setNewInterviewResumeFile(null);
              return;
            }
            const validation = validateInterviewResumeFile(file);
            if (!validation.ok) {
              showToast(validation.error, "error");
              return;
            }
            setNewInterviewResumeFile(file);
          }}
          onResumeRemove={() => setNewInterviewResumeFile(null)}
          onCreate={createNewInterview}
          onClose={() => setShowNewInterview(false)}
        />
      )}

      {canManage && showCandidateEdit && selectedRecord && (
        <Modal title="Edit Interview Details" onClose={() => setShowCandidateEdit(false)} wide>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Candidate Name" required value={candidateEditDraft.candidate_full_name} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_full_name: value }))} autoFocus />
              <Inp label="Position" value={candidateEditDraft.candidate_position} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_position: value }))} />
              <Inp label="Email" value={candidateEditDraft.candidate_email} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_email: value }))} />
              <Inp label="Phone" value={candidateEditDraft.candidate_phone} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, candidate_phone: value }))} />
              <Inp label="Interview Date" type="date" value={candidateEditDraft.interview_date} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, interview_date: value }))} />
              <Inp label="Interview Time" type="time" value={candidateEditDraft.interview_time} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, interview_time: value }))} />
              <Inp label="Zoom Passcode" value={candidateEditDraft.zoom_passcode} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, zoom_passcode: value }))} />
            </div>
            <Inp label="Zoom Recording Link" value={candidateEditDraft.zoom_recording_url} onChange={(value) => setCandidateEditDraft((prev) => ({ ...prev, zoom_recording_url: value }))} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setShowCandidateEdit(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveCandidateEdit} disabled={recordSaving}>{recordSaving ? "Saving..." : "Save Details"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {canManage && showTranscriptInput && selectedRecord && (
        <Modal title="Paste Interview Transcript" onClose={() => setShowTranscriptInput(false)} wide>
          <div style={{ display: "grid", gap: 12 }}>
            <textarea
              value={transcriptDraft}
              onChange={(event) => setTranscriptDraft(event.target.value)}
              placeholder="Paste the full interview transcript here"
              rows={16}
              style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 13, fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, color: C.text, resize: "vertical", outline: "none" }}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ color: C.textMut, fontSize: 12 }}>{cleanInterviewTranscriptText(transcriptDraft).length.toLocaleString()} characters</span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <Btn variant="secondary" onClick={() => setShowTranscriptInput(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={savePastedTranscript} disabled={savingTranscript || !cleanInterviewTranscriptText(transcriptDraft)}>{savingTranscript ? "Saving..." : "Save Transcript"}</Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {canManage && showNewPosition && (
        <Modal title="Create Position Type" onClose={() => setShowNewPosition(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <Inp label="Position Name" value={newPositionDraft.role_label} onChange={(value) => setNewPositionDraft((prev) => ({ ...prev, role_label: value }))} autoFocus />
            <Inp label="Description" value={newPositionDraft.description} onChange={(value) => setNewPositionDraft((prev) => ({ ...prev, description: value }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Pay Min" value={newPositionDraft.pay_rate_min} placeholder="18" onChange={(value) => setNewPositionDraft((prev) => ({ ...prev, pay_rate_min: value }))} />
              <Inp label="Pay Max" value={newPositionDraft.pay_rate_max} placeholder="20" onChange={(value) => setNewPositionDraft((prev) => ({ ...prev, pay_rate_max: value }))} />
            </div>
            <Inp label="Pay Notes" value={newPositionDraft.pay_rate_notes} placeholder="DOE, training rate, shift differential" onChange={(value) => setNewPositionDraft((prev) => ({ ...prev, pay_rate_notes: value }))} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="secondary" onClick={() => setShowNewPosition(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={createPositionType} disabled={templateActionId === "new-position"}>{templateActionId === "new-position" ? "Creating..." : "Create"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {showTranscriptModal && selectedRecord && (
        <TranscriptModal
          turns={selectedTranscriptTurns}
          currentTime={audioCurrentTime}
          segmentationSource={selectedRecord?.metadata?.audio_transcription?.segmentation_source || ""}
          onClose={() => setShowTranscriptModal(false)}
        />
      )}

      {selectedRecordCanAccessIdentity && showActiveInterview && activeInterviewPane === "resume" && selectedRecord && (
        <ResumeWorkspaceModal
          record={selectedRecord}
          resumeArtifact={selectedResumeArtifact}
          resumePreviewUrl={resumePreviewUrl}
          resumeCount={resumeArtifacts.length}
          uploading={resumeUploading}
          onUploadClick={() => resumeInputRef.current?.click()}
          onOpen={openArtifact}
          onDownload={downloadArtifact}
          workspaceTabs={workspaceTabs}
          activePane={activeInterviewPane}
          onPaneChange={setActiveInterviewPane}
          payRateSummary={selectedPayRateSummary}
          onClose={() => setShowActiveInterview(false)}
          canUpload={canManage}
        />
      )}

      {selectedRecordCanAccessIdentity && showActiveInterview && activeInterviewPane === "guide" && selectedRecord && (
        <ReviewGuideModal
          record={selectedRecord}
          fields={selectedPdfFields}
          artifacts={artifacts.filter((artifact) => !selectedGuide?.id || !artifact.interview_guide_id || artifact.interview_guide_id === selectedGuide.id)}
          pdfUrl={pdfPreviewUrl}
          loadingPdf={!!selectedSnapshot?.version?.source_pdf_path && !pdfPreviewUrl}
          responsesByTarget={responsesByTarget}
          responseDrafts={responseDrafts}
          pdfFieldValues={guidePreviewFieldValues}
          summaryPages={reviewedSummaryPages}
          summaryDraftTextByKey={summaryDraftTextByKey}
          summarySavingKey={savingSummaryKey}
          customSummaryPages={customSummaryPages}
          savingKey={savingResponseKey}
          exporting={exportingPdf}
          activeIndex={pdfReviewIndex}
          setActiveIndex={setPdfReviewIndex}
          getFieldValue={getPdfFieldValue}
          setFieldDraft={setPdfFieldDraft}
          onSummarySectionChange={setSummarySectionDraft}
          onAddCustomSummaryPage={addCustomSummaryPage}
          onCustomSummaryPageTitleChange={updateCustomSummaryPageTitle}
          onRemoveCustomSummaryPage={removeCustomSummaryPage}
          approveField={approvePdfField}
          rejectField={rejectPdfField}
          aiDrafting={aiDrafting}
          onAiFillDocument={fillPdfDocumentWithAiInstruction}
          exportFinalPdf={exportFinalPdf}
          downloadArtifact={downloadArtifact}
          workspaceTabs={workspaceTabs}
          activePane={activeInterviewPane}
          onPaneChange={setActiveInterviewPane}
          payRateSummary={selectedPayRateSummary}
          onClose={() => setShowActiveInterview(false)}
        />
      )}

      {selectedRecordCanAccessIdentity && showActiveInterview && activeInterviewPane === "questions" && selectedRecord && (
        <QuestionReviewModal
          record={selectedRecord}
          questions={selectedQuestions}
          responsesByTarget={responsesByTarget}
          responseDrafts={responseDrafts}
          savingKey={savingResponseKey}
          setQuestionDraft={setQuestionResponseDraft}
          approveQuestion={approveCustomQuestion}
          rejectQuestion={rejectCustomQuestion}
          onAiDraftQuestions={() => draftInterview(selectedRecord.id, { customOnly: true })}
          workspaceTabs={workspaceTabs}
          activePane={activeInterviewPane}
          onPaneChange={setActiveInterviewPane}
          payRateSummary={selectedPayRateSummary}
          onClose={() => setShowActiveInterview(false)}
        />
      )}
    </div>
  );
}
