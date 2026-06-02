// Embedded Stripo v2 email editor for K9 Operations.
//
// Loads the Stripo UIEditor script once, initializes the editor in a container, and
// authenticates via the stripo-token edge function (the secret key never reaches the
// browser). The editor *chrome* is themed to K9 Operations; the content swatches
// (brandColorPalette) + merge tags are K9 Resorts so what marketers design is on-brand.
//
// Exposes an imperative handle: getDesign() → { html, css } (editable, to persist) and
// getCompiledHtml() → inlined send-ready HTML. The exact v2 API surface varies slightly
// by build, so the accessors probe the common shapes defensively.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { C } from "../shared/theme";
import { EDITOR_BRAND_PALETTE, MERGE_TAGS, K9_OPERATIONS_BRAND } from "./campaignsData";

const STRIPO_SCRIPT_SRC = "https://plugins.stripo.email/resources/uieditor/latest/UIEditor.js";
// Stripo's UIEditor.js locates itself by this exact script-tag id — it MUST be "UiEditorScript".
const SCRIPT_ID = "UiEditorScript";

// Load the Stripo module script exactly once; resolve when window.UIEditor is ready.
let scriptPromise = null;
function loadStripoScript() {
  if (typeof window !== "undefined" && window.UIEditor) return Promise.resolve(window.UIEditor);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const onReady = () => {
      // Module execution may lag the load event slightly; poll briefly for the global.
      const started = Date.now();
      const tick = () => {
        if (window.UIEditor) return resolve(window.UIEditor);
        if (Date.now() - started > 8000) return reject(new Error("Stripo editor failed to initialize"));
        setTimeout(tick, 60);
      };
      tick();
    };
    if (existing) { existing.addEventListener("load", onReady); if (window.UIEditor) onReady(); return; }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.type = "module";
    script.src = STRIPO_SCRIPT_SRC;
    script.onload = onReady;
    script.onerror = () => reject(new Error("Could not load the Stripo editor script"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Find the actions API across v2 shapes: the object returned by initEditor, a global
// StripoEditorApi, or methods hung off UIEditor itself.
function resolveActionsApi(initResult) {
  const candidates = [initResult, initResult?.actionsApi, window.StripoEditorApi, window.StripoEditorApi?.actionsApi, window.UIEditor, window.UIEditor?.actionsApi];
  for (const c of candidates) {
    if (c && (typeof c.compileEmail === "function" || typeof c.getTemplateData === "function")) return c;
  }
  return null;
}

const StripoEditor = forwardRef(function StripoEditor({ emailId, user, initialHtml, initialCss = "", onDirty }, ref) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  useImperativeHandle(ref, () => ({
    getDesign() {
      const actions = resolveActionsApi(apiRef.current);
      return new Promise((resolve, reject) => {
        if (!actions?.getTemplateData) return reject(new Error("Editor not ready"));
        try { actions.getTemplateData((data) => resolve({ html: data?.html || "", css: data?.css || "" })); }
        catch (e) { reject(e); }
      });
    },
    getCompiledHtml() {
      const actions = resolveActionsApi(apiRef.current);
      return new Promise((resolve, reject) => {
        if (!actions?.compileEmail) return reject(new Error("Editor not ready"));
        const done = (err, html) => (err ? reject(err) : resolve(html || ""));
        try { actions.compileEmail({ callback: done }); }      // v2 shape
        catch (_) { try { actions.compileEmail(done); } catch (e) { reject(e); } } // older shape
      });
    },
    isReady() { return status === "ready"; },
  }), [status]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    loadStripoScript()
      .then((UIEditor) => {
        if (cancelled || !containerRef.current) return;
        const config = {
          metadata: {
            emailId: emailId || `campaign-${Date.now()}`,
            userId: user?.id || "k9-user",
            username: user?.name || user?.email || "K9 Operations",
          },
          html: initialHtml || "",
          css: initialCss || "",
          locale: "en",
          // Content swatches stay on the K9 Resorts palette (what leads receive).
          brandColorPalette: EDITOR_BRAND_PALETTE,
          mergeTags: MERGE_TAGS,
          // Editor chrome accent matches the K9 Operations app.
          editorFonts: undefined,
          onTokenRefreshRequest(callback) {
            supabase.functions
              .invoke("stripo-token", { body: { role: "user" } })
              .then(({ data, error }) => {
                if (error || !data?.token) { setStatus("error"); setErrorMsg(error?.message || "Could not authorize the editor"); callback(null); }
                else callback(data.token);
              })
              .catch((e) => { setStatus("error"); setErrorMsg(String(e?.message || e)); callback(null); });
          },
          onDataChanged() { if (typeof onDirty === "function") onDirty(); },
        };
        try {
          const result = UIEditor.initEditor(containerRef.current, config);
          Promise.resolve(result).then((api) => { if (!cancelled) { apiRef.current = api || result; setStatus("ready"); } });
        } catch (e) {
          if (!cancelled) { setStatus("error"); setErrorMsg(String(e?.message || e)); }
        }
      })
      .catch((e) => { if (!cancelled) { setStatus("error"); setErrorMsg(String(e?.message || e)); } });

    return () => {
      cancelled = true;
      const api = resolveActionsApi(apiRef.current) || apiRef.current;
      try { if (api && typeof api.stop === "function") api.stop(); } catch (_) { /* noop */ }
      apiRef.current = null;
    };
    // Re-init only when the edited entity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 540 }}>
      {status === "error" ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: C.dan, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>The email editor couldn't load.</div>
          <div style={{ color: C.textMut }}>{errorMsg || "Check your connection and try again."}</div>
        </div>
      ) : null}
      {status === "loading" ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontSize: 13, background: K9_OPERATIONS_BRAND.surface, zIndex: 1 }}>
          Loading the editor…
        </div>
      ) : null}
      <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 540, display: status === "error" ? "none" : "block" }} />
    </div>
  );
});

export default StripoEditor;
