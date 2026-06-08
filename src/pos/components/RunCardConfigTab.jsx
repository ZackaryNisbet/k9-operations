import { C } from "../constants/colors";
import { useCallback, useEffect, useRef, useState } from "react";
import { uuid } from "../lib/ids";

function RunCardConfigTab({ data, save }) {
  // ═══════════════════════════════════════════════════════════════
  // VARIABLE DEFINITIONS — every piece of data available on a run card
  // ═══════════════════════════════════════════════════════════════
  const VARIABLES = [
    { id: "dogPhoto", label: "Dog Photo", category: "Dog", type: "photo", defaultW: 120, defaultH: 120 },
    { id: "dogName", label: "Dog Name", category: "Dog", type: "text", sample: "Buddy", defaultFontSize: 26, defaultBold: true },
    { id: "dogBreed", label: "Breed", category: "Dog", type: "text", sample: "Golden Retriever" },
    { id: "dogAge", label: "Age", category: "Dog", type: "text", sample: "3 Years" },
    { id: "dogWeight", label: "Weight", category: "Dog", type: "text", sample: "65 lbs" },
    { id: "dogSex", label: "Sex / Altered", category: "Dog", type: "text", sample: "Male / Neutered" },
    { id: "dogTags", label: "Dog Tags", category: "Dog", type: "tags", sample: "Private Play, Large Dog" },
    { id: "ownerName", label: "Owner Name", category: "Owner", type: "text", sample: "Jane Johnson", defaultFontSize: 14 },
    { id: "ownerPhone", label: "Owner Phone", category: "Owner", type: "text", sample: "(555) 123-4567" },
    { id: "emergencyName", label: "Emergency Contact", category: "Owner", type: "text", sample: "Hayden Johnson" },
    { id: "emergencyPhone", label: "Emergency Phone", category: "Owner", type: "text", sample: "(555) 987-6543" },
    { id: "resType", label: "Reservation Type", category: "Reservation", type: "text", sample: "Boarding" },
    { id: "roomType", label: "Room Type", category: "Reservation", type: "text", sample: "Standard Room" },
    { id: "roomNumber", label: "Room Number", category: "Reservation", type: "text", sample: "R5" },
    { id: "checkInDate", label: "Check-In Date", category: "Reservation", type: "text", sample: "Mon, 01/15" },
    { id: "checkInTime", label: "Check-In Time", category: "Reservation", type: "text", sample: "10:00 AM" },
    { id: "checkOutDate", label: "Check-Out Date", category: "Reservation", type: "text", sample: "Fri, 01/19", defaultBold: true },
    { id: "checkOutTime", label: "Check-Out Time", category: "Reservation", type: "text", sample: "2:00 PM", defaultBold: true },
    { id: "belongings", label: "Belongings", category: "Check-In", type: "text", sample: "Blue blanket, Kong toy, bag of kibble", defaultLabel: "Belongings:" },
    { id: "fedToday", label: "Fed Today?", category: "Check-In", type: "text", sample: "Yes, breakfast at 7am", defaultLabel: "Has your pet been fed today?" },
    { id: "medsToday", label: "Meds Today?", category: "Check-In", type: "text", sample: "Yes, Rimadyl at 8am", defaultLabel: "Has your pet had medications today?" },
    { id: "notes", label: "Notes", category: "Check-In", type: "text", sample: "Buddy is anxious during storms. Extra walks please.", defaultLabel: "Notes:", defaultW: 500 },
    { id: "feedingSchedule", label: "Feeding Schedule", category: "Services", type: "block", sample: "7:00 AM, 5:00 PM: 1 cup kibble — mix with warm water", defaultW: 500, defaultH: 50 },
    { id: "activityGrid", label: "Activity Grid", category: "Services", type: "grid", sample: "Day-by-day feeding table", defaultW: 500, defaultH: 90 },
    { id: "medications", label: "Medications", category: "Services", type: "grid", sample: "Rimadyl — 7:00 AM, 50mg tablet", defaultW: 500, defaultH: 80 },
    { id: "bathSchedule", label: "Bath Schedule", category: "Services", type: "grid", sample: "Standard Bath — last day", defaultW: 500, defaultH: 70 },
    { id: "labelCustom", label: "Custom Label", category: "Custom", type: "label", sample: "Custom Text Here", defaultFontSize: 12 },
    { id: "separator", label: "Separator Line", category: "Custom", type: "separator", defaultW: 500, defaultH: 2 },
  ];

  const CATEGORIES = ["Dog", "Owner", "Reservation", "Check-In", "Services", "Custom"];

  // ═══════════════════════════════════════════════════════════════
  // CANVAS DIMENSIONS
  // ═══════════════════════════════════════════════════════════════
  const CARD_W = 612; // 8.5" at 72dpi
  const CARD_H = 792; // 11" at 72dpi
  const SCALE = 0.85;
  const CANVAS_W = CARD_W * SCALE;
  const CANVAS_H = CARD_H * SCALE;
  const GRID_SIZE = 8;
  const snap = (v) => Math.round(v / GRID_SIZE) * GRID_SIZE;

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════
  const cfg = data.runCardConfig || {};
  const elements = cfg.elements || [];
  const templates = data.runCardTemplates || [];

  const [selected, setSelected] = useState(null); // element id
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [tplName, setTplName] = useState("");
  const [renamingTpl, setRenamingTpl] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [palCollapsed, setPalCollapsed] = useState({});
  const [showGrid, setShowGrid] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [guideLine, setGuideLine] = useState(null);
  const [dragPalette, setDragPalette] = useState(null); // dragging from palette
  const [dropPreview, setDropPreview] = useState(null); // preview position for palette drag
  const canvasRef = useRef(null);
  const [localElements, setLocalElements] = useState(elements);
  const elementsRef = useRef(elements);

  // Sync from data + auto-migrate old sectionLayout to new elements
  useEffect(() => {
    const rcCfg = data.runCardConfig || {};
    let els = rcCfg.elements || [];
    if (els.length === 0 && rcCfg.sectionLayout) {
      const sl = rcCfg.sectionLayout;
      const migrated = [];
      const placed = new Set();
      const mkId = () => uuid();
      const mkEl = (vid, ov) => {
        if (placed.has(vid) && vid !== "separator" && vid !== "labelCustom") return;
        placed.add(vid);
        const v = VARIABLES.find(x => x.id === vid);
        if (!v) return;
        migrated.push({ id: mkId(), varId: vid, x: ov?.x ?? 16, y: ov?.y ?? migrated.length * 28 + 16,
          w: ov?.w ?? v.defaultW ?? 500, h: ov?.h ?? v.defaultH ?? (v.type === "photo" ? 120 : v.type === "grid" ? 80 : 24),
          fontSize: ov?.fontSize ?? v.defaultFontSize ?? 12, bold: ov?.bold ?? v.defaultBold ?? false,
          italic: false, color: "#222", align: "left", label: ov?.label ?? v.defaultLabel ?? "", locked: false, visible: true, customText: "" });
      };
      const sorted = Object.entries(sl).sort((a, b) => (a[1].y || 0) - (b[1].y || 0));
      sorted.forEach(([secId, pos]) => {
        if (pos.enabled === false) return;
        const by = pos.y || migrated.length * 28 + 16;
        if (secId === "header") {
          mkEl("dogPhoto", { x: 16, y: by, w: 120, h: 120 });
          mkEl("dogName", { x: 148, y: by, w: 340, fontSize: 26, bold: true });
          mkEl("ownerName", { x: 148, y: by + 32, w: 340, fontSize: 14 });
          mkEl("ownerPhone", { x: 148, y: by + 56, w: 200 });
          mkEl("roomType", { x: 148, y: by + 80, w: 160, bold: true });
          mkEl("roomNumber", { x: 316, y: by + 80, w: 80, bold: true });
        } else if (secId === "dogInfo") { mkEl("dogBreed", { y: by }); mkEl("dogAge", { y: by + 24 }); mkEl("dogSex", { y: by + 48 }); }
        else if (secId === "ownerContact") { mkEl("ownerName", { y: by }); mkEl("ownerPhone", { y: by + 24 }); }
        else if (secId === "resDates") { mkEl("resType", { y: by, w: 120, bold: true }); mkEl("checkInDate", { x: 140, y: by, w: 100 }); mkEl("checkInTime", { x: 244, y: by, w: 80 }); mkEl("checkOutDate", { x: 340, y: by, w: 100, bold: true }); mkEl("checkOutTime", { x: 444, y: by, w: 80, bold: true }); }
        else if (secId === "belongings") mkEl("belongings", { y: by, w: 580, label: "Belongings:" });
        else if (secId === "fedToday") mkEl("fedToday", { y: by, w: 580, label: "Fed Today?" });
        else if (secId === "medsToday") mkEl("medsToday", { y: by, w: 580, label: "Meds Today?" });
        else if (secId === "tags") mkEl("dogTags", { y: by, w: 580 });
        else if (secId === "emergency") { mkEl("emergencyName", { y: by, w: 300, label: "Emergency:" }); mkEl("emergencyPhone", { x: 320, y: by, w: 200 }); }
        else if (secId === "notes") mkEl("notes", { y: by, w: 580, label: "Notes:" });
        else if (secId === "feeding") mkEl("feedingSchedule", { y: by, w: 580, h: 50 });
        else if (secId === "activityGrid") mkEl("activityGrid", { y: by, w: 580, h: 100 });
        else if (secId === "medications") mkEl("medications", { y: by, w: 580, h: 80 });
        else if (secId === "bath") mkEl("bathSchedule", { y: by, w: 580, h: 70 });
      });
      if (migrated.length > 0) {
        els = migrated;
        save({ ...data, runCardConfig: { ...rcCfg, elements: migrated } });
      }
    }
    setLocalElements(els);
    elementsRef.current = els;
  }, [data.runCardConfig]);

  // ═══════════════════════════════════════════════════════════════
  // SAVE WITH UNDO
  // ═══════════════════════════════════════════════════════════════
  const saveElements = useCallback(async (newEls, skipHistory) => {
    if (!skipHistory) {
      setHistory(prev => [...prev.slice(0, historyIdx + 1), elementsRef.current].slice(-30));
      setHistoryIdx(prev => prev + 1);
    }
    setLocalElements(newEls);
    elementsRef.current = newEls;
    await save({ ...data, runCardConfig: { ...cfg, elements: newEls, sectionLayout: cfg.sectionLayout } });
  }, [data, cfg, save, historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx < 0 || history.length === 0) return;
    const prev = history[historyIdx];
    setHistoryIdx(i => i - 1);
    setLocalElements(prev);
    elementsRef.current = prev;
    save({ ...data, runCardConfig: { ...cfg, elements: prev, sectionLayout: cfg.sectionLayout } });
  }, [history, historyIdx, data, cfg, save]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); undo(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          saveElements(localElements.filter(el => el.id !== selected));
          setSelected(null);
        }
      }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, localElements, undo, saveElements]);
  // ═══════════════════════════════════════════════════════════════
  // ADD ELEMENT FROM PALETTE
  // ═══════════════════════════════════════════════════════════════
  const addElement = useCallback((varDef, x, y) => {
    // If non-Custom variable already on canvas, don't add duplicate
    if (varDef.category !== "Custom" && localElements.some(el => el.varId === varDef.id)) return;
    const newEl = {
      id: uuid(),
      varId: varDef.id,
      x: snap(x || 20),
      y: snap(y || (localElements.length > 0 ? Math.max(...localElements.map(e => e.y + (e.h || 24))) + 8 : 20)),
      w: varDef.defaultW || 200,
      h: varDef.defaultH || (varDef.type === "photo" ? 120 : varDef.type === "grid" ? 80 : 24),
      fontSize: varDef.defaultFontSize || 12,
      bold: varDef.defaultBold || false,
      italic: false,
      color: "#222",
      align: "left",
      label: varDef.defaultLabel || "",
      locked: false,
      visible: true,
      customText: varDef.id === "labelCustom" ? "Custom Text" : "",
    };
    const newEls = [...localElements, newEl];
    saveElements(newEls);
    setSelected(newEl.id);
    return newEl;
  }, [localElements, saveElements]);

  // ═══════════════════════════════════════════════════════════════
  // DRAG — CANVAS ELEMENTS
  // ═══════════════════════════════════════════════════════════════
  const handleElementMouseDown = useCallback((e, elId) => {
    e.preventDefault();
    e.stopPropagation();
    const el = localElements.find(x => x.id === elId);
    if (!el || el.locked) { setSelected(elId); return; }
    setSelected(elId);
    setDragging(elId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = (e.clientX - rect.left) / SCALE;
    const mouseY = (e.clientY - rect.top) / SCALE;
    setDragOffset({ x: mouseX - el.x, y: mouseY - el.y });
  }, [localElements]);

  // Drag move + up via window events
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = (e.clientX - rect.left) / SCALE;
      const mouseY = (e.clientY - rect.top) / SCALE;
      let newX = mouseX - dragOffset.x;
      let newY = mouseY - dragOffset.y;
      if (snapEnabled) { newX = snap(newX); newY = snap(newY); }
      const el = elementsRef.current.find(x => x.id === dragging);
      if (!el) return;
      newX = Math.max(0, Math.min(CARD_W - (el.w || 100), newX));
      newY = Math.max(0, Math.min(CARD_H - (el.h || 24), newY));

      // Alignment guides
      let guide = null;
      const centerX = newX + (el.w || 100) / 2;
      const cardCenterX = CARD_W / 2;
      if (Math.abs(centerX - cardCenterX) < 6) {
        newX = cardCenterX - (el.w || 100) / 2;
        if (snapEnabled) newX = snap(newX);
        guide = { type: "vertical", pos: cardCenterX };
      }
      setGuideLine(guide);

      const updated = elementsRef.current.map(x => x.id === dragging ? { ...x, x: newX, y: newY } : x);
      setLocalElements(updated);
      elementsRef.current = updated;
    };
    const handleUp = () => {
      setDragging(null);
      setGuideLine(null);
      saveElements(elementsRef.current);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [dragging, dragOffset, snapEnabled, saveElements]);

  // ═══════════════════════════════════════════════════════════════
  // RESIZE HANDLES
  // ═══════════════════════════════════════════════════════════════
  const handleResizeMouseDown = useCallback((e, elId, corner) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({ elId, corner });
    const rect = canvasRef.current?.getBoundingClientRect();
    const el = elementsRef.current.find(x => x.id === elId);
    if (!rect || !el) return;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startW = el.w || 200;
    const startH = el.h || 24;
    const startX = el.x;
    const startY = el.y;

    const onMove = (me) => {
      const dx = (me.clientX - startMouseX) / SCALE;
      const dy = (me.clientY - startMouseY) / SCALE;
      let newW = startW, newH = startH, newX = startX, newY = startY;
      if (corner === "se") { newW = Math.max(40, snap(startW + dx)); newH = Math.max(16, snap(startH + dy)); }
      else if (corner === "e") { newW = Math.max(40, snap(startW + dx)); }
      else if (corner === "s") { newH = Math.max(16, snap(startH + dy)); }
      else if (corner === "sw") { newW = Math.max(40, snap(startW - dx)); newX = snap(startX + dx); newH = Math.max(16, snap(startH + dy)); }
      else if (corner === "ne") { newW = Math.max(40, snap(startW + dx)); newH = Math.max(16, snap(startH - dy)); newY = snap(startY + dy); }
      else if (corner === "nw") { newW = Math.max(40, snap(startW - dx)); newX = snap(startX + dx); newH = Math.max(16, snap(startH - dy)); newY = snap(startY + dy); }
      else if (corner === "n") { newH = Math.max(16, snap(startH - dy)); newY = snap(startY + dy); }
      else if (corner === "w") { newW = Math.max(40, snap(startW - dx)); newX = snap(startX + dx); }
      const updated = elementsRef.current.map(x => x.id === elId ? { ...x, x: newX, y: newY, w: newW, h: newH } : x);
      setLocalElements(updated);
      elementsRef.current = updated;
    };
    const onUp = () => {
      setResizing(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      saveElements(elementsRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [saveElements]);
  // ═══════════════════════════════════════════════════════════════
  // PALETTE DRAG → CANVAS DROP
  // ═══════════════════════════════════════════════════════════════
  const handlePaletteDragStart = useCallback((e, varDef) => {
    e.preventDefault();
    setDragPalette(varDef);
    const onMove = (me) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) { setDropPreview(null); return; }
      const x = (me.clientX - rect.left) / SCALE;
      const y = (me.clientY - rect.top) / SCALE;
      if (x >= 0 && x <= CARD_W && y >= 0 && y <= CARD_H) {
        setDropPreview({ x: snap(Math.max(0, x - 50)), y: snap(Math.max(0, y - 12)) });
      } else {
        setDropPreview(null);
      }
    };
    const onUp = (me) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (me.clientX - rect.left) / SCALE;
        const y = (me.clientY - rect.top) / SCALE;
        if (x >= 0 && x <= CARD_W && y >= 0 && y <= CARD_H) {
          addElement(varDef, Math.max(0, x - 50), Math.max(0, y - 12));
        }
      }
      setDragPalette(null);
      setDropPreview(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [addElement]);

  // ═══════════════════════════════════════════════════════════════
  // ELEMENT UPDATE HELPER
  // ═══════════════════════════════════════════════════════════════
  const updateElement = useCallback((elId, patch) => {
    const newEls = localElements.map(el => el.id === elId ? { ...el, ...patch } : el);
    saveElements(newEls);
  }, [localElements, saveElements]);

  const removeElement = useCallback((elId) => {
    saveElements(localElements.filter(el => el.id !== elId));
    if (selected === elId) setSelected(null);
  }, [localElements, selected, saveElements]);

  const duplicateElement = useCallback((elId) => {
    const el = localElements.find(x => x.id === elId);
    if (!el) return;
    const newEl = { ...el, id: uuid(), x: el.x + 16, y: el.y + 16 };
    saveElements([...localElements, newEl]);
    setSelected(newEl.id);
  }, [localElements, saveElements]);

  const moveToFront = useCallback((elId) => {
    const el = localElements.find(x => x.id === elId);
    if (!el) return;
    saveElements([...localElements.filter(x => x.id !== elId), el]);
  }, [localElements, saveElements]);

  const moveToBack = useCallback((elId) => {
    const el = localElements.find(x => x.id === elId);
    if (!el) return;
    saveElements([el, ...localElements.filter(x => x.id !== elId)]);
  }, [localElements, saveElements]);

  // ═══════════════════════════════════════════════════════════════
  // TEMPLATE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════
  const saveAsTemplate = async () => {
    if (!tplName.trim()) return;
    const newTpl = { id: uuid(), name: tplName.trim(), isDefault: templates.length === 0, config: { ...cfg, elements: [...localElements] } };
    await save({ ...data, runCardTemplates: [...templates, newTpl] });
    setTplName("");
  };
  const loadTemplate = async (tpl) => {
    const els = tpl.config?.elements || [];
    setLocalElements(els);
    elementsRef.current = els;
    await save({ ...data, runCardConfig: { ...cfg, elements: els } });
  };
  const setDefaultTemplate = async (tplId) => {
    await save({ ...data, runCardTemplates: templates.map(t => ({ ...t, isDefault: t.id === tplId })) });
  };
  const deleteTemplate = async (tplId) => {
    if (!window.confirm("Delete this template?")) return;
    await save({ ...data, runCardTemplates: templates.filter(t => t.id !== tplId) });
  };
  const renameTemplate = async (tplId) => {
    if (!renameVal.trim()) return;
    await save({ ...data, runCardTemplates: templates.map(t => t.id === tplId ? { ...t, name: renameVal.trim() } : t) });
    setRenamingTpl(null); setRenameVal("");
  };

  // Quick-start: generate default layout if no elements exist
  const generateDefaultLayout = useCallback(() => {
    const els = [];
    let y = 16;
    const addEl = (varId, overrides) => {
      const v = VARIABLES.find(x => x.id === varId);
      if (!v) return;
      const el = {
        id: uuid(),
        varId: v.id, x: overrides?.x ?? 20, y: overrides?.y ?? y,
        w: overrides?.w ?? v.defaultW ?? 200, h: overrides?.h ?? v.defaultH ?? (v.type === "photo" ? 120 : v.type === "grid" ? 80 : 24),
        fontSize: overrides?.fontSize ?? v.defaultFontSize ?? 12, bold: overrides?.bold ?? v.defaultBold ?? false,
        italic: false, color: "#222", align: overrides?.align ?? "left",
        label: overrides?.label ?? v.defaultLabel ?? "", locked: false, visible: true, customText: "",
      };
      els.push(el);
      if (!overrides?.y) y += (el.h || 24) + 6;
      return el;
    };
    addEl("dogPhoto", { x: 16, y: 16, w: 120, h: 120 });
    addEl("dogName", { x: 148, y: 16, w: 340, fontSize: 26, bold: true });
    addEl("ownerName", { x: 148, y: 48, w: 340, fontSize: 14 });
    addEl("ownerPhone", { x: 148, y: 72, w: 200 });
    addEl("roomType", { x: 148, y: 96, w: 160, bold: true });
    addEl("roomNumber", { x: 316, y: 96, w: 80, bold: true });
    y = 146;
    addEl("dogBreed"); addEl("dogAge"); addEl("dogSex");
    addEl("separator", { x: 16, w: 580, h: 2 });
    y += 6;
    addEl("resType", { x: 16, w: 120, bold: true });
    addEl("checkInDate", { x: 140, y: y - 30, w: 100 }); addEl("checkInTime", { x: 244, y: y - 30, w: 80 });
    addEl("checkOutDate", { x: 340, y: y - 30, w: 100, bold: true }); addEl("checkOutTime", { x: 444, y: y - 30, w: 80, bold: true });
    y += 6;
    addEl("belongings", { x: 16, w: 580, label: "Belongings:" });
    addEl("fedToday", { x: 16, w: 580, label: "Fed Today?" });
    addEl("medsToday", { x: 16, w: 580, label: "Meds Today?" });
    addEl("separator", { x: 16, w: 580, h: 2 });
    addEl("dogTags", { x: 16, w: 580 });
    addEl("emergencyName", { x: 16, w: 300, label: "Emergency:" });
    addEl("emergencyPhone", { x: 320, y: y - 30, w: 200 });
    addEl("notes", { x: 16, w: 580, label: "Notes:" });
    addEl("separator", { x: 16, w: 580, h: 2 });
    addEl("feedingSchedule", { x: 16, w: 580, h: 50 });
    addEl("activityGrid", { x: 16, w: 580, h: 100 });
    addEl("medications", { x: 16, w: 580, h: 80 });
    addEl("bathSchedule", { x: 16, w: 580, h: 70 });
    saveElements(els);
  }, [saveElements]);
  // ═══════════════════════════════════════════════════════════════
  // SAMPLE CONTENT RENDERER — for preview
  // ═══════════════════════════════════════════════════════════════
  const renderElementContent = (el) => {
    const varDef = VARIABLES.find(v => v.id === el.varId);
    if (!varDef) return null;
    const fs = el.fontSize || 12;
    const textStyle = { fontSize: fs, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? "italic" : "normal", color: el.color || "#222", textAlign: el.align || "left", lineHeight: 1.3, fontFamily: "Arial, sans-serif", width: "100%", overflow: "hidden", textOverflow: "ellipsis" };

    if (varDef.type === "photo") {
      return <div style={{width: "100%", height: "100%", borderRadius: 6, background: "#f0f0f0", border: "1px solid #ccc", display: "flex", alignItems: "center", justifyContent: "center"}}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
      </div>;
    }
    if (varDef.type === "separator") {
      return <div style={{width: "100%", height: 2, background: "#ccc", borderRadius: 1}} />;
    }
    if (varDef.type === "tags") {
      return <div style={{display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center"}}>
        {(varDef.sample || "").split(", ").map((t, i) => <span key={i} style={{fontSize: Math.max(8, fs - 2), background: "#eee", border: "1px solid #aaa", padding: "1px 6px", borderRadius: 3, fontWeight: 700}}>{t}</span>)}
      </div>;
    }
    if (varDef.type === "grid" || varDef.type === "block") {
      return <div style={{border: "1px solid #999", borderRadius: 3, padding: 4, fontSize: Math.max(8, fs - 2), width: "100%", height: "100%", boxSizing: "border-box", overflow: "hidden"}}>
        <div style={{fontWeight: 700, fontSize: Math.max(8, fs - 1), marginBottom: 2}}>{varDef.label}</div>
        <div style={{color: "#666", fontSize: Math.max(7, fs - 3)}}>{varDef.sample}</div>
      </div>;
    }
    // Text type
    const labelText = el.label ? el.label + " " : "";
    return <div style={textStyle}>
      {labelText && <span style={{fontWeight: 700}}>{labelText}</span>}
      <span>{el.customText || varDef.sample}</span>
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════
  // SELECTED ELEMENT
  // ═══════════════════════════════════════════════════════════════
  const selectedEl = selected ? localElements.find(x => x.id === selected) : null;
  const selectedVar = selectedEl ? VARIABLES.find(v => v.id === selectedEl.varId) : null;

  // Which palette variables are already placed?
  const placedVarIds = new Set(localElements.map(el => el.varId));

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{display: "flex", gap: 0, height: "calc(100vh - 180px)", minHeight: 600, overflow: "hidden"}}>
      {/* ──────────── LEFT SIDEBAR: Variable Palette ──────────── */}
      <div style={{width: 220, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden"}}>
        <div style={{padding: "14px 14px 8px", borderBottom: `1px solid ${C.border}`}}>
          <div style={{fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2}}>Variables</div>
          <div style={{fontSize: 10, color: C.textSec}}>Drag onto the card</div>
        </div>
        <div style={{flex: 1, overflowY: "auto", padding: "8px 10px"}}>
          {CATEGORIES.map(cat => {
            const vars = VARIABLES.filter(v => v.category === cat);
            const collapsed = palCollapsed[cat];
            return (
              <div key={cat} style={{marginBottom: 8}}>
                <div onClick={() => setPalCollapsed(p => ({...p, [cat]: !p[cat]}))} style={{fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", gap: 4, userSelect: "none"}}>
                  <svg width="8" height="8" viewBox="0 0 8 8" style={{transform: collapsed ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.15s"}}><path d="M2 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                  {cat}
                </div>
                {!collapsed && vars.map(v => {
                  const placed = v.category !== "Custom" && placedVarIds.has(v.id);
                  return (
                    <div
                      key={v.id}
                      onMouseDown={(e) => !placed && handlePaletteDragStart(e, v)}
                      onClick={() => !placed && addElement(v)}
                      style={{
                        padding: "5px 8px", margin: "2px 0", borderRadius: 6, fontSize: 11, fontWeight: 500,
                        background: placed ? C.bg : dragPalette?.id === v.id ? C.priLt : C.bg,
                        border: `1px solid ${placed ? "transparent" : C.border}`,
                        color: placed ? C.textMut : C.text,
                        cursor: placed ? "default" : "grab",
                        opacity: placed ? 0.5 : 1,
                        display: "flex", alignItems: "center", gap: 6,
                        transition: "background 0.1s",
                        userSelect: "none",
                      }}
                    >
                      {v.type === "photo" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
                      {v.type === "text" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>}
                      {v.type === "grid" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
                      {v.type === "block" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>}
                      {v.type === "tags" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
                      {v.type === "separator" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>}
                      {v.type === "label" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4v14a2 2 0 002 2h12a2 2 0 002-2v-5"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
                      <span>{v.label}</span>
                      {placed && <span style={{fontSize: 8, color: C.textMut, marginLeft: "auto"}}>placed</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {/* Quick start button */}
        {localElements.length === 0 && (
          <div style={{padding: "12px 14px", borderTop: `1px solid ${C.border}`}}>
            <button onClick={generateDefaultLayout} style={{width: "100%", padding: "8px 0", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"}}>
              Generate Default Layout
            </button>
          </div>
        )}
      </div>
      {/* ──────────── CENTER: Canvas ──────────── */}
      <div style={{flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: C.bg, overflow: "auto", padding: "16px 0"}}>
        {/* Toolbar */}
        <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap", justifyContent: "center"}}>
          <button onClick={undo} disabled={historyIdx < 0} style={{padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: historyIdx < 0 ? C.textMut : C.text, fontSize: 11, fontWeight: 600, cursor: historyIdx < 0 ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4, opacity: historyIdx < 0 ? 0.4 : 1}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h13a4 4 0 010 8H7"/><path d="M3 10l4-4M3 10l4 4"/></svg>Undo
          </button>
          <div style={{width: 1, height: 20, background: C.border}} />
          <label style={{fontSize: 11, color: C.textSec, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none"}}>
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} style={{accentColor: C.pri}} /> Grid
          </label>
          <label style={{fontSize: 11, color: C.textSec, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", userSelect: "none"}}>
            <input type="checkbox" checked={snapEnabled} onChange={e => setSnapEnabled(e.target.checked)} style={{accentColor: C.pri}} /> Snap
          </label>
          <div style={{width: 1, height: 20, background: C.border}} />
          <span style={{fontSize: 10, color: C.textMut}}>{localElements.length} element{localElements.length !== 1 ? "s" : ""}</span>
          {localElements.length > 0 && <button onClick={() => { if (window.confirm("Clear all elements from canvas?")) { saveElements([]); setSelected(null); } }} style={{padding: "4px 8px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.dan, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"}}>Clear All</button>}
        </div>

        {/* The Canvas */}
        <div
          ref={canvasRef}
          onClick={(e) => { if (e.target === e.currentTarget || e.target.dataset?.canvas) setSelected(null); }}
          style={{
            width: CANVAS_W, height: CANVAS_H, position: "relative", background: "#fff",
            border: `2px solid ${C.border}`, borderRadius: 4, overflow: "hidden",
            boxShadow: "0 8px 40px rgba(0,0,0,0.12)", userSelect: (dragging || resizing) ? "none" : "auto",
            flexShrink: 0, cursor: dragPalette ? "copy" : "default",
          }}
        >
          {/* Grid background */}
          {showGrid && <div data-canvas="1" style={{position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)`, backgroundSize: `${GRID_SIZE * SCALE}px ${GRID_SIZE * SCALE}px`, pointerEvents: "none", zIndex: 0}} />}

          {/* Center guide */}
          {guideLine && guideLine.type === "vertical" && <div style={{position: "absolute", left: guideLine.pos * SCALE, top: 0, bottom: 0, width: 1, background: C.dan, opacity: 0.6, zIndex: 999, pointerEvents: "none"}} />}

          {/* Drop preview from palette drag */}
          {dropPreview && dragPalette && (
            <div style={{position: "absolute", left: dropPreview.x * SCALE, top: dropPreview.y * SCALE, width: (dragPalette.defaultW || 200) * SCALE, height: (dragPalette.defaultH || 24) * SCALE, border: `2px dashed ${C.pri}`, borderRadius: 4, background: `${C.pri}15`, zIndex: 998, pointerEvents: "none"}} />
          )}

          {/* Elements */}
          {localElements.map((el, idx) => {
            if (!el.visible && el.visible !== undefined && el.visible === false) return null;
            const isSelected = selected === el.id;
            const isDragging = dragging === el.id;
            const varDef = VARIABLES.find(v => v.id === el.varId);
            return (
              <div
                key={el.id}
                onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                style={{
                  position: "absolute",
                  left: el.x * SCALE, top: el.y * SCALE,
                  width: (el.w || 200) * SCALE, height: varDef?.type === "text" || varDef?.type === "label" || varDef?.type === "tags" ? "auto" : (el.h || 24) * SCALE,
                  minHeight: varDef?.type === "text" || varDef?.type === "label" || varDef?.type === "tags" ? undefined : (el.h || 24) * SCALE,
                  border: isSelected ? `2px solid ${C.pri}` : "1.5px solid transparent",
                  borderRadius: 3,
                  background: isDragging ? `${C.pri}10` : isSelected ? `${C.pri}06` : "transparent",
                  zIndex: isDragging ? 1000 : isSelected ? 100 : idx + 1,
                  cursor: el.locked ? "default" : isDragging ? "grabbing" : "grab",
                  padding: `${1 * SCALE}px ${2 * SCALE}px`,
                  boxSizing: "border-box",
                  transition: isDragging ? "none" : "border 0.1s",
                  opacity: el.visible === false ? 0.25 : 1,
                }}
              >
                {/* Content */}
                <div style={{pointerEvents: "none", transform: `scale(${SCALE})`, transformOrigin: "top left", width: `${100/SCALE}%`}}>
                  {renderElementContent(el)}
                </div>

                {/* Lock indicator */}
                {el.locked && isSelected && (
                  <div style={{position: "absolute", top: -8, right: -8, width: 16, height: 16, borderRadius: 8, background: C.acc, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10}}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </div>
                )}

                {/* Resize handles (8 points) — only when selected and not locked */}
                {isSelected && !el.locked && (varDef?.type !== "text" || true) && (() => {
                  const handles = [
                    { corner: "nw", top: -4, left: -4, cursor: "nwse-resize" },
                    { corner: "ne", top: -4, right: -4, cursor: "nesw-resize" },
                    { corner: "sw", bottom: -4, left: -4, cursor: "nesw-resize" },
                    { corner: "se", bottom: -4, right: -4, cursor: "nwse-resize" },
                    { corner: "n", top: -4, left: "calc(50% - 4px)", cursor: "ns-resize" },
                    { corner: "s", bottom: -4, left: "calc(50% - 4px)", cursor: "ns-resize" },
                    { corner: "e", top: "calc(50% - 4px)", right: -4, cursor: "ew-resize" },
                    { corner: "w", top: "calc(50% - 4px)", left: -4, cursor: "ew-resize" },
                  ];
                  return handles.map(h => (
                    <div
                      key={h.corner}
                      onMouseDown={(e) => handleResizeMouseDown(e, el.id, h.corner)}
                      style={{
                        position: "absolute", width: 8, height: 8, background: "#fff", border: `2px solid ${C.pri}`, borderRadius: 2,
                        cursor: h.cursor, zIndex: 20,
                        ...(h.top !== undefined ? { top: h.top } : {}), ...(h.bottom !== undefined ? { bottom: h.bottom } : {}),
                        ...(h.left !== undefined ? { left: h.left } : {}), ...(h.right !== undefined ? { right: h.right } : {}),
                      }}
                    />
                  ));
                })()}
              </div>
            );
          })}
        </div>
      </div>
      {/* ──────────── RIGHT SIDEBAR: Properties + Templates ──────────── */}
      <div style={{width: 260, flexShrink: 0, background: C.surface, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden"}}>
        <div style={{flex: 1, overflowY: "auto"}}>
          {/* PROPERTIES PANEL */}
          {selectedEl && selectedVar ? (
            <div style={{padding: 14}}>
              <div style={{fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <span>{selectedVar.label}</span>
                <button onClick={() => removeElement(selectedEl.id)} style={{background: "none", border: "none", cursor: "pointer", color: C.dan, display: "flex", padding: 2}} title="Remove">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                </button>
              </div>

              {/* Position */}
              <div style={{fontSize: 10, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: "uppercase"}}>Position</div>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12}}>
                <div><label style={{fontSize: 9, color: C.textMut}}>X</label><input type="number" value={Math.round(selectedEl.x)} onChange={e => updateElement(selectedEl.id, {x: parseInt(e.target.value)||0})} style={{width: "100%", padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box"}} /></div>
                <div><label style={{fontSize: 9, color: C.textMut}}>Y</label><input type="number" value={Math.round(selectedEl.y)} onChange={e => updateElement(selectedEl.id, {y: parseInt(e.target.value)||0})} style={{width: "100%", padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box"}} /></div>
                <div><label style={{fontSize: 9, color: C.textMut}}>W</label><input type="number" value={Math.round(selectedEl.w||200)} onChange={e => updateElement(selectedEl.id, {w: parseInt(e.target.value)||40})} style={{width: "100%", padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box"}} /></div>
                <div><label style={{fontSize: 9, color: C.textMut}}>H</label><input type="number" value={Math.round(selectedEl.h||24)} onChange={e => updateElement(selectedEl.id, {h: parseInt(e.target.value)||16})} style={{width: "100%", padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box"}} /></div>
              </div>

              {/* Typography — only for text/label types */}
              {(selectedVar.type === "text" || selectedVar.type === "label" || selectedVar.type === "tags") && (<>
                <div style={{fontSize: 10, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: "uppercase"}}>Typography</div>
                <div style={{display: "flex", gap: 6, marginBottom: 8, alignItems: "center"}}>
                  <div style={{flex: 1}}><label style={{fontSize: 9, color: C.textMut}}>Size</label><input type="number" min="6" max="72" value={selectedEl.fontSize||12} onChange={e => updateElement(selectedEl.id, {fontSize: parseInt(e.target.value)||12})} style={{width: "100%", padding: "4px 6px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box"}} /></div>
                  <div style={{display: "flex", gap: 2, marginTop: 12}}>
                    <button onClick={() => updateElement(selectedEl.id, {bold: !selectedEl.bold})} style={{width: 28, height: 28, borderRadius: 4, border: `1px solid ${selectedEl.bold ? C.pri : C.border}`, background: selectedEl.bold ? C.priLt : "transparent", color: selectedEl.bold ? C.pri : C.textSec, fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "serif", display: "flex", alignItems: "center", justifyContent: "center"}}>B</button>
                    <button onClick={() => updateElement(selectedEl.id, {italic: !selectedEl.italic})} style={{width: 28, height: 28, borderRadius: 4, border: `1px solid ${selectedEl.italic ? C.pri : C.border}`, background: selectedEl.italic ? C.priLt : "transparent", color: selectedEl.italic ? C.pri : C.textSec, fontWeight: 400, fontSize: 13, cursor: "pointer", fontFamily: "serif", fontStyle: "italic", display: "flex", alignItems: "center", justifyContent: "center"}}><em>I</em></button>
                  </div>
                </div>
                {/* Alignment */}
                <div style={{display: "flex", gap: 2, marginBottom: 8}}>
                  {["left","center","right"].map(a => (
                    <button key={a} onClick={() => updateElement(selectedEl.id, {align: a})} style={{flex: 1, padding: "4px 0", borderRadius: 4, border: `1px solid ${selectedEl.align === a ? C.pri : C.border}`, background: selectedEl.align === a ? C.priLt : "transparent", color: selectedEl.align === a ? C.pri : C.textSec, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize"}}>{a}</button>
                  ))}
                </div>
                {/* Color */}
                <div style={{display: "flex", gap: 6, marginBottom: 12, alignItems: "center"}}>
                  <label style={{fontSize: 9, color: C.textMut}}>Color</label>
                  <input type="color" value={selectedEl.color||"#222222"} onChange={e => updateElement(selectedEl.id, {color: e.target.value})} style={{width: 28, height: 22, border: "none", borderRadius: 4, cursor: "pointer", padding: 0}} />
                  <span style={{fontSize: 10, color: C.textMut, fontFamily: "monospace"}}>{selectedEl.color||"#222"}</span>
                </div>
              </>)}

              {/* Label prefix */}
              {(selectedVar.type === "text" || selectedVar.type === "label") && (
                <div style={{marginBottom: 12}}>
                  <label style={{fontSize: 9, color: C.textMut}}>Label Prefix</label>
                  <input value={selectedEl.label||""} onChange={e => updateElement(selectedEl.id, {label: e.target.value})} placeholder="e.g. Belongings:" style={{width: "100%", padding: "5px 8px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", marginTop: 2}} />
                </div>
              )}

              {/* Custom text for label type */}
              {selectedVar.type === "label" && (
                <div style={{marginBottom: 12}}>
                  <label style={{fontSize: 9, color: C.textMut}}>Custom Text</label>
                  <input value={selectedEl.customText||""} onChange={e => updateElement(selectedEl.id, {customText: e.target.value})} placeholder="Enter text..." style={{width: "100%", padding: "5px 8px", borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", marginTop: 2}} />
                </div>
              )}

              {/* Actions */}
              <div style={{fontSize: 10, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: "uppercase"}}>Actions</div>
              <div style={{display: "flex", flexDirection: "column", gap: 4}}>
                <button onClick={() => updateElement(selectedEl.id, {locked: !selectedEl.locked})} style={{padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: selectedEl.locked ? C.acc + "20" : "transparent", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, textAlign: "left"}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d={selectedEl.locked ? "M7 11V7a5 5 0 0110 0v4" : "M7 11V7a5 5 0 019.9-1"}/></svg>
                  {selectedEl.locked ? "Unlock" : "Lock Position"}
                </button>
                <button onClick={() => updateElement(selectedEl.id, {visible: selectedEl.visible === false ? true : false})} style={{padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{selectedEl.visible !== false ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></> : <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></>}</svg>
                  {selectedEl.visible !== false ? "Hide" : "Show"}
                </button>
                <button onClick={() => duplicateElement(selectedEl.id)} style={{padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  Duplicate
                </button>
                <div style={{display: "flex", gap: 4}}>
                  <button onClick={() => moveToFront(selectedEl.id)} style={{flex: 1, padding: "5px 0", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"}}>Bring Front</button>
                  <button onClick={() => moveToBack(selectedEl.id)} style={{flex: 1, padding: "5px 0", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"}}>Send Back</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{padding: 14}}>
              <div style={{fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4}}>Properties</div>
              <div style={{fontSize: 11, color: C.textMut, lineHeight: 1.5}}>Click an element on the canvas to edit its properties, or drag a variable from the left palette onto the card.</div>
            </div>
          )}

          {/* TEMPLATES */}
          <div style={{padding: "0 14px 14px", borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 14}}>
            <div style={{fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4}}>Templates</div>
            <p style={{fontSize: 10, color: C.textSec, margin: "0 0 8px"}}>Save and load card layouts</p>
            {templates.length > 0 && (
              <div style={{display: "flex", flexDirection: "column", gap: 4, marginBottom: 8}}>
                {templates.map(tpl => (
                  <div key={tpl.id} style={{display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", borderRadius: 6, border: `1px solid ${tpl.isDefault ? C.pri : C.border}`, background: tpl.isDefault ? C.priLt : C.bg, fontSize: 11}}>
                    {renamingTpl === tpl.id ? (
                      <input value={renameVal} onChange={e => setRenameVal(e.target.value)} onKeyDown={e => e.key === "Enter" && renameTemplate(tpl.id)} onBlur={() => renameTemplate(tpl.id)} autoFocus style={{flex: 1, padding: "2px 4px", borderRadius: 3, border: `1px solid ${C.border}`, fontSize: 10, fontFamily: "inherit", background: C.surface, color: C.text}} />
                    ) : (
                      <span onDoubleClick={() => {setRenamingTpl(tpl.id); setRenameVal(tpl.name);}} style={{flex: 1, fontWeight: 600, color: C.text, cursor: "default"}} title="Double-click to rename">{tpl.isDefault ? "\u2605 " : ""}{tpl.name}</span>
                    )}
                    <button onClick={() => loadTemplate(tpl)} style={{padding: "2px 6px", borderRadius: 3, border: `1px solid ${C.pri}30`, background: C.priLt, color: C.pri, fontSize: 9, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"}}>Load</button>
                    <button onClick={() => setDefaultTemplate(tpl.id)} style={{padding: "2px 4px", borderRadius: 3, border: `1px solid ${tpl.isDefault ? C.suc : C.border}`, background: tpl.isDefault ? C.sucLt : "transparent", color: tpl.isDefault ? C.suc : C.textMut, fontSize: 9, cursor: "pointer", fontFamily: "inherit"}}>{"\u2605"}</button>
                    <button onClick={() => deleteTemplate(tpl.id)} style={{padding: "2px 4px", borderRadius: 3, border: `1px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 9, cursor: "pointer", fontFamily: "inherit"}}>x</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{display: "flex", gap: 4}}>
              <input value={tplName} onChange={e => setTplName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveAsTemplate()} placeholder="Template name..." style={{flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 10, fontFamily: "inherit", background: C.bg, color: C.text}} />
              <button onClick={saveAsTemplate} disabled={!tplName.trim()} style={{padding: "5px 10px", borderRadius: 6, border: "none", background: tplName.trim() ? C.pri : C.border, color: "#fff", fontSize: 10, fontWeight: 700, cursor: tplName.trim() ? "pointer" : "default", fontFamily: "inherit"}}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { RunCardConfigTab };
