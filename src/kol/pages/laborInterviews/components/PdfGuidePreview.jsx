import React, { useEffect, useMemo, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { C } from "../../../../shared/theme";
import { PDF_POINT_TO_CSS_PX } from "../constants";
import { paginateInterviewSummaryPreview } from "../helpers";
import { InterviewSummaryPreviewPage } from "./InterviewSummaryPreviewPage";
import { PdfFieldClickLayer } from "./PdfFieldClickLayer";
import { PdfFieldValueLayer } from "./PdfFieldValueLayer";

export function PdfGuidePreview({ pdfUrl, loadingPdf, fields, fieldValues, summaryPages, activePageNumber, activeKey, activeSummary = false, onSelectField, onSelectSummary }) {
  const containerRef = useRef(null);
  const pageCanvasRefs = useRef(new Map());
  const pageFrameRefs = useRef(new Map());
  const pdfDocRef = useRef(null);
  const renderRunRef = useRef(0);
  const lastAutoScrollTargetRef = useRef("");
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageState, setPageState] = useState({ loading: false, error: "", pages: [] });
  const summaryPreviewPages = useMemo(() => paginateInterviewSummaryPreview(summaryPages), [summaryPages]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const update = () => setContainerWidth(node.getBoundingClientRect().width || 0);
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfUrl || !containerWidth) return undefined;
    let cancelled = false;
    let loadingTask = null;
    setPageState({ loading: true, error: "", pages: [] });
    pageCanvasRefs.current = new Map();
    pageFrameRefs.current = new Map();
    renderRunRef.current += 1;
    lastAutoScrollTargetRef.current = "";
    if (pdfDocRef.current) {
      try { pdfDocRef.current.destroy?.(); } catch (_) {}
      pdfDocRef.current = null;
    }

    async function loadPdfPages() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;
        const maxWidth = Math.max(260, containerWidth - 28);
        const pages = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(PDF_POINT_TO_CSS_PX, maxWidth / baseViewport.width);
          const viewport = page.getViewport({ scale });
          pages.push({
            pageNumber,
            scale,
            pageSize: { width: baseViewport.width, height: baseViewport.height },
            renderSize: { width: viewport.width, height: viewport.height, pageAligned: true },
          });
        }

        if (cancelled) {
          await pdf.destroy?.();
          return;
        }
        pdfDocRef.current = pdf;
        setPageState({ loading: true, error: "", pages });
      } catch (error) {
        if (!cancelled) {
          setPageState({ loading: false, error: error?.message || "Unable to render PDF preview.", pages: [] });
        }
      }
    }

    loadPdfPages();
    return () => {
      cancelled = true;
      try { loadingTask?.destroy?.(); } catch (_) {}
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy?.(); } catch (_) {}
        pdfDocRef.current = null;
      }
    };
  }, [pdfUrl, containerWidth]);

  useEffect(() => {
    const pdf = pdfDocRef.current;
    const pages = pageState.pages;
    if (!pdf || !pages.length) return undefined;
    let cancelled = false;
    const runId = renderRunRef.current + 1;
    renderRunRef.current = runId;

    async function renderPages() {
      try {
        for (const pageInfo of pages) {
          if (cancelled || runId !== renderRunRef.current) return;
          const canvas = pageCanvasRefs.current.get(pageInfo.pageNumber);
          if (!canvas) continue;
          const page = await pdf.getPage(pageInfo.pageNumber);
          const viewport = page.getViewport({ scale: pageInfo.scale });
          const dpr = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          const context = canvas.getContext("2d", { alpha: false });
          context.save();
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.restore();
          await page.render({ canvasContext: context, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
        }
        if (!cancelled && runId === renderRunRef.current) {
          setPageState((prev) => ({ ...prev, loading: false }));
        }
      } catch (error) {
        if (!cancelled && runId === renderRunRef.current) {
          setPageState({ loading: false, error: error?.message || "Unable to render PDF preview.", pages: [] });
        }
      }
    }

    renderPages();
    return () => {
      cancelled = true;
    };
  }, [pageState.pages]);

  useEffect(() => {
    const pageNumber = Math.max(1, Number(activePageNumber || 1));
    const targetKey = activeSummary ? "summary" : `page:${pageNumber}`;
    if (lastAutoScrollTargetRef.current === targetKey) return;
    const node = activeSummary ? pageFrameRefs.current.get("summary-0") : pageFrameRefs.current.get(pageNumber);
    const scroller = containerRef.current;
    if (!node || !scroller) return;
    lastAutoScrollTargetRef.current = targetKey;
    scroller.scrollTo({
      top: Math.max(0, node.offsetTop - 14),
      behavior: "smooth",
    });
  }, [activePageNumber, activeSummary, pageState.pages.length]);

  return (
    <div ref={containerRef} style={{ position: "relative", height: "100%", minHeight: 560, overflow: "auto", borderRadius: 6, background: "#f8fafc", boxShadow: "0 10px 30px rgba(15,23,42,0.18)" }}>
      {pageState.error ? (
        <div style={{ minHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: C.textMut, fontSize: 13, fontWeight: 800, textAlign: "center" }}>
          PDF preview could not render here. Export will still use the filled PDF.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18, justifyItems: "center", padding: 0 }}>
          {pageState.pages.length ? (
            <>
              {pageState.pages.map((pageInfo) => (
                <div
                  key={pageInfo.pageNumber}
                  ref={(node) => {
                    if (node) pageFrameRefs.current.set(pageInfo.pageNumber, node);
                    else pageFrameRefs.current.delete(pageInfo.pageNumber);
                  }}
                  style={{
                    position: "relative",
                    width: pageInfo.renderSize?.width || 1,
                    minHeight: pageInfo.renderSize?.height || 540,
                    background: "#fff",
                    boxShadow: "0 1px 12px rgba(15,23,42,0.12)",
                  }}
                >
                  <canvas
                    ref={(node) => {
                      if (node) pageCanvasRefs.current.set(pageInfo.pageNumber, node);
                      else pageCanvasRefs.current.delete(pageInfo.pageNumber);
                    }}
                    style={{ display: "block", background: "#fff" }}
                  />
                  {pageInfo.pageSize && pageInfo.renderSize && (
                    <>
                      <PdfFieldValueLayer
                        fields={fields}
                        activePageNumber={pageInfo.pageNumber}
                        activeKey={activeKey}
                        containerSize={pageInfo.renderSize}
                        pageSize={pageInfo.pageSize}
                        fieldValues={fieldValues}
                      />
                      <PdfFieldClickLayer
                        fields={fields}
                        activePageNumber={pageInfo.pageNumber}
                        activeKey={activeKey}
                        containerSize={pageInfo.renderSize}
                        pageSize={pageInfo.pageSize}
                        onSelectField={onSelectField}
                      />
                    </>
                  )}
                </div>
              ))}
              {summaryPreviewPages.map((summaryPage, index) => (
                <button
                  type="button"
                  key={`summary-${index}`}
                  ref={(node) => {
                    if (node) pageFrameRefs.current.set(`summary-${index}`, node);
                    else pageFrameRefs.current.delete(`summary-${index}`);
                  }}
                  onClick={onSelectSummary}
                  style={{
                    border: `2px solid ${activeSummary && index === 0 ? C.pri : "transparent"}`,
                    borderRadius: 6,
                    padding: 0,
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <InterviewSummaryPreviewPage
                    page={summaryPage}
                    width={pageState.pages[0]?.renderSize?.width || Math.max(260, containerWidth - 28)}
                  />
                </button>
              ))}
            </>
          ) : (
            <div style={{ minHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, color: C.textMut, fontSize: 13, fontWeight: 800 }}>
              Loading PDF preview...
            </div>
          )}
        </div>
      )}
      {(loadingPdf || pageState.loading) && (
        <div style={{ position: "absolute", right: 14, top: 14, zIndex: 4, borderRadius: 999, background: "rgba(255,255,255,0.94)", border: `1px solid ${C.borderLight}`, color: C.textSec, fontSize: 11, fontWeight: 900, padding: "5px 9px", boxShadow: "0 8px 20px rgba(15,23,42,0.12)" }}>
          Updating
        </div>
      )}
    </div>
  );
}
