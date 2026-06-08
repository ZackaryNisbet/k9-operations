import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, Card, MiniDatePicker } from "../components/ui";
import { C } from "../constants/colors";
import { DEFAULT_LIFECYCLE_BANNERS, LC_FILTER_FIELDS, LC_OP_LABELS, applyStructuredFilters } from "../lib/filters";
import { I } from "../icons";
import { fmtDate, fmtPhone, formatDogNames, gid, todayStr } from "../lib/format";
import { hasPermission } from "../lib/roles";
import { supabase } from "../../supabaseClient";

function ClientsPage({ data, save, nav, profile, addGlobalToast, lcFilters, setLcFilters, setLcFilterOpen, locationSlug }) {
  const [activeTab, setActiveTab] = useState("leads");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(new Set());
  const [logPopover, setLogPopover] = useState(null);
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState("");
  const [expandedUpdates, setExpandedUpdates] = useState(new Set());
  const [visibleColumns, setVisibleColumns] = useState(new Set(["totalRes","lastRes","daysSince","totalSpent","nextRes"]));
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [hoveredDogCount, setHoveredDogCount] = useState(null);
  const [expandedDogs, setExpandedDogs] = useState(new Set());
  const [expandedIgnite, setExpandedIgnite] = useState(new Set());
  const [showExtraCols, setShowExtraCols] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null); // which tab's banner is being edited
  const [bannerDraft, setBannerDraft] = useState("");
  const [showMassText, setShowMassText] = useState(false);
  const [massTextSelected, setMassTextSelected] = useState(new Set());
  const [massTextBody, setMassTextBody] = useState("");
  const [showMassTextHistory, setShowMassTextHistory] = useState(false);
  const logBtnRef = useRef({});
  const colToggleRef = useRef(null);

  // ── Client stats (reused from v1) ──
  const clientStats = useMemo(() => {
    const map = {};
    data.clients.forEach(c => {
      const cRes = data.reservations.filter(r => r.clientId === c.id);
      const dogs = data.dogs.filter(d => d.clientId === c.id);
      const daycareCount = cRes.filter(r => r.type === "daycare").length;
      const boardingCount = cRes.filter(r => r.type === "boarding").length;
      const evalCount = cRes.filter(r => r.type === "evaluation").length;
      const tourCount = cRes.filter(r => r.type === "tour").length;
      const sorted = [...cRes].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
      const lastRes = sorted.find(r => r.checkIn <= todayStr());
      const nextRes = sorted.filter(r => r.checkIn >= todayStr() && r.status === "upcoming").sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
      // totalSpent includes reservation pricing AND payment records (package purchases, deposits, etc.)
      const resSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
      const pmtSpent = (data.payments || []).filter(p => p.clientId === c.id && p.status === "completed" && p.type !== "refund").reduce((s, p) => s + (p.amount || 0), 0);
      const totalSpent = resSpent + pmtSpent;
      const daysSinceLast = lastRes ? Math.round((new Date(todayStr()+"T12:00:00") - new Date(lastRes.checkIn+"T12:00:00")) / 86400000) : null;
      const dogNames = dogs.map(d => d.fields.name || "Unknown");
      let postEvalAppts = 0;
      const evalsSorted = cRes.filter(r => r.type === "evaluation").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      if (evalsSorted.length > 0) { postEvalAppts = cRes.filter(r => r.checkIn > evalsSorted[0].checkIn).length; }
      let postTourAppts = 0;
      const toursSorted = cRes.filter(r => r.type === "tour").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      if (toursSorted.length > 0) { postTourAppts = cRes.filter(r => r.checkIn > toursSorted[0].checkIn).length; }
      map[c.id] = { dogCount: dogs.length, dogNames, daycareCount, boardingCount, evalCount, tourCount, lastRes, nextRes, totalSpent, totalRes: cRes.length, daysSinceLast, postEvalAppts, postTourAppts };
    });
    return map;
  }, [data.clients, data.reservations, data.dogs, data.payments]);

  // ── Tab membership ──
  const clientTabMap = useMemo(() => {
    const map = {};
    const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
    const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
    data.clients.forEach(c => {
      const s = clientStats[c.id] || {};
      const hasSpent = (s.totalSpent || 0) > 0;
      // hasUpcoming and hasBooking exclude tours/evals — only real services (boarding, daycare, etc.) count
      const cRes = (data.reservations || []).filter(r => r.clientId === c.id);
      const hasRealBooking = cRes.some(r => r.type !== "tour" && r.type !== "evaluation");
      const hasUpcoming = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation");
      const totalRes = s.totalRes || 0;
      const daysSince = s.daysSinceLast;
      const isCold = c.lifecycle?.cold === true;
      let isRetention = false;
      if (hasSpent && !hasUpcoming && totalRes > 0 && daysSince != null) {
        const dcPct = totalRes > 0 ? ((s.daycareCount || 0) / totalRes) : 0;
        const bdPct = totalRes > 0 ? ((s.boardingCount || 0) / totalRes) : 0;
        if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
        else if (dcPct >= 0.5 && daysSince >= dcThresh) isRetention = true;
        else if (dcPct < 0.5 && bdPct < 0.5 && daysSince >= dcThresh) isRetention = true;
      }
      // Conversion: no real bookings (excluding tours/evals), no money spent, not cold
      const isConversion = !hasSpent && !hasRealBooking && !isCold;
      // Active: has spent money OR has a real booking (not just tour/eval), and not in retention or cold
      const isActive = (hasSpent || hasRealBooking) && !isRetention && !isCold;
      if (isCold) isRetention = false;
      map[c.id] = { isConversion, isActive, isRetention: isRetention && !isCold, isCold, isAll: true };
    });
    return map;
  }, [data.clients, clientStats, data.resortPolicies?.retentionDaycareDays, data.resortPolicies?.retentionBoardingDays]);

  // ── Lifecycle event tracking ──
  const prevTabMapRef = useRef(null);
  useEffect(() => {
    if (!prevTabMapRef.current || !save) { prevTabMapRef.current = clientTabMap; return; }
    const prev = prevTabMapRef.current;
    let changed = false;
    const updatedClients = data.clients.map(c => {
      const oldM = prev[c.id]; const newM = clientTabMap[c.id];
      if (!oldM || !newM) return c;
      let event = null;
      if (oldM.isConversion && newM.isActive) event = { event: "moved_to_active", date: todayStr(), details: "Moved to Active Customers (first booking/payment)" };
      else if (oldM.isActive && newM.isRetention) event = { event: "moved_to_retention", date: todayStr(), details: "Moved to Retention (lapsed client)" };
      else if (oldM.isRetention && newM.isActive) event = { event: "moved_to_active", date: todayStr(), details: "Returned to Active Customers (re-engaged)" };
      if (event) {
        changed = true;
        let updated = { ...c, lifecycleEvents: [...(c.lifecycleEvents || []), event] };
        // When moving to retention, auto-set follow-up date to today
        if (event.event === "moved_to_retention") {
          const lc = updated.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
          updated = { ...updated, lifecycle: { ...lc, retention: { ...lc.retention, followUpDate: todayStr() } } };
        }
        return updated;
      }
      return c;
    });
    prevTabMapRef.current = clientTabMap;
    if (changed) save({ ...data, clients: updatedClients });
  }, [clientTabMap]);

  // ── Source lookup helpers ──
  const getClientSource = useCallback((client) => {
    const base = client.fields?.referral_source || "";
    const hasEval = (data.evaluations || []).some(e => e.clientId === client.id && e.locked);
    const evalRes = hasEval ? data.reservations.find(r => r.clientId === client.id && r.type === "evaluation" && (data.evaluations || []).some(e => e.reservationId === r.id && e.locked)) : null;
    const tourRes = data.reservations.filter(r => r.clientId === client.id && r.type === "tour" && r.status === "checked-out").sort((a,b) => b.checkIn.localeCompare(a.checkIn))[0] || null;
    return { base, hasEval, evalRes, hasTour: !!tourRes, tourRes };
  }, [data.evaluations, data.reservations]);

  // ── Filtered & sorted client lists ──
  const tabLists = useMemo(() => {
    const sq = search.toLowerCase().trim();
    const sqDigits = sq.replace(/\D/g, "");
    let all = data.clients;
    if (sq) {
      all = all.filter(c => {
        const fn = `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.toLowerCase();
        const ph = (c.fields.phone || "").replace(/\D/g, "");
        const dogNames = (clientStats[c.id]?.dogNames || []).join(" ").toLowerCase();
        return fn.includes(sq) || dogNames.includes(sq) || (sqDigits.length >= 3 && ph.includes(sqDigits));
      });
    }
    const conv = all.filter(c => clientTabMap[c.id]?.isConversion);
    const active = all.filter(c => clientTabMap[c.id]?.isActive);
    const ret = all.filter(c => clientTabMap[c.id]?.isRetention);
    const cold = all.filter(c => clientTabMap[c.id]?.isCold);
    return { leads: conv, active, lapsed: ret, cold, all };
  }, [data.clients, search, clientTabMap, clientStats, activeTab]);

  // ── Apply sub-filters (structured filters, source filter, overdue toggle) ──
  const activeFilterCount = Object.keys(lcFilters).length;
  const activeList = useMemo(() => {
    let list = tabLists[activeTab] || [];
    // Structured filters
    if (activeFilterCount > 0) {
      list = applyStructuredFilters(list, clientStats, clientTabMap, lcFilters);
    }
    // Source filter (Conversion tab only)
    if (activeTab === "leads" && sourceFilter.size > 0) {
      list = list.filter(c => {
        const src = getClientSource(c);
        if (sourceFilter.has("eval") && src.hasEval) return true;
        if (sourceFilter.has("tour") && src.hasTour) return true;
        if (sourceFilter.has("ignite") && c.lifecycle?.conversion?.source === "ignite") return true;
        if (sourceFilter.has("online") && (c.fields?.referral_source === "Online Booking" || c.lifecycle?.conversion?.source === "online_booking")) return true;
        return false;
      });
    }
    // Overdue toggle
    if (showOverdueOnly) {
      const today = todayStr();
      list = list.filter(c => {
        const tab = activeTab === "leads" ? "conversion" : activeTab === "lapsed" ? "retention" : null;
        if (!tab) return false;
        const fu = c.lifecycle?.[tab]?.followUpDate;
        return fu && fu < today;
      });
    }
    // Sort
    if (sortCol) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const sa = clientStats[a.id] || {};
        const sb = clientStats[b.id] || {};
        let va, vb;
        switch (sortCol) {
          case "name": case "last_name": va = (a.fields.last_name||"").toLowerCase(); vb = (b.fields.last_name||"").toLowerCase(); break;
          case "first_name": va = (a.fields.first_name||"").toLowerCase(); vb = (b.fields.first_name||"").toLowerCase(); break;
          case "phone": va = a.fields.phone||""; vb = b.fields.phone||""; break;
          case "dogCount": va = sa.dogCount||0; vb = sb.dogCount||0; break;
          case "totalRes": va = sa.totalRes||0; vb = sb.totalRes||0; break;
          case "lastRes": va = sa.lastRes?.checkIn||""; vb = sb.lastRes?.checkIn||""; break;
          case "daysSince": va = sa.daysSinceLast??9999; vb = sb.daysSinceLast??9999; break;
          case "totalSpent": va = sa.totalSpent||0; vb = sb.totalSpent||0; break;
          case "nextRes": va = sa.nextRes?.checkIn||"zzz"; vb = sb.nextRes?.checkIn||"zzz"; break;
          case "followUp": { const t = activeTab==="lapsed"?"retention":"conversion"; va = a.lifecycle?.[t]?.followUpDate||"zzz"; vb = b.lifecycle?.[t]?.followUpDate||"zzz"; break; }
          case "coldDate": va = a.lifecycle?.coldDate||""; vb = b.lifecycle?.coldDate||""; break;
          case "totalPaid": va = sa.totalSpent||0; vb = sb.totalSpent||0; break;
          case "totalAppts": va = sa.totalRes||0; vb = sb.totalRes||0; break;
          default: va = ""; vb = "";
        }
        if (typeof va === "number") return (va - vb) * dir;
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }
    return list;
  }, [tabLists, activeTab, sourceFilter, showOverdueOnly, sortCol, sortDir, clientStats, getClientSource, lcFilters, activeFilterCount, clientTabMap]);

  // ── Handlers ──
  const handleSort = (col) => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
  const SortIcon = ({ col }) => { if (sortCol !== col) return null; return <span style={{fontSize:10,marginLeft:2}}>{sortDir==="asc"?"▲":"▼"}</span>; };
  const colHeaderStyle = (col) => ({ display:"flex",alignItems:"center",gap:2,cursor:"pointer",userSelect:"none",color:sortCol===col?C.pri:C.textMut,fontWeight:sortCol===col?800:700 });
  const toggleSourceFilter = (type) => setSourceFilter(prev => { const n=new Set(prev); if(n.has(type))n.delete(type);else n.add(type); return n; });

  const today = todayStr();
  const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
  const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;

  // ── Log/Revive handler ──
  const handleSaveLog = async () => {
    if (!logPopover) return;
    if (!logNotes.trim() || !logDate) { addGlobalToast?.({ type: "error", message: "Notes and follow-up date are required" }); return; }
    const { clientId, tab: lcTab, isRevive } = logPopover;
    const newClients = data.clients.map(c => {
      if (c.id !== clientId) return c;
      const lc = c.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
      const tabKey = isRevive ? ((lc.coldFrom === "retention" || lc.coldFrom === "lapsed") ? "retention" : "conversion") : lcTab;
      const oldDate = lc[tabKey]?.followUpDate || "";
      const entry = { id: gid(), notes: logNotes, previousFollowUp: oldDate, newFollowUp: logDate, loggedBy: profile?.full_name || profile?.email || "Staff", loggedAt: new Date().toISOString() };
      const updatedTab = { ...(lc[tabKey]||{}), notes: "", followUpDate: logDate, updates: [entry, ...(lc[tabKey]?.updates||[])] };
      const evt = { event: isRevive ? "revived_from_cold" : "logged_outreach", date: today, details: isRevive ? `Revived back to ${tabKey}` : `Logged in ${tabKey}: "${logNotes.substring(0,50)}"` };
      return {
        ...c,
        lifecycle: { ...lc, [tabKey]: updatedTab, ...(isRevive ? { cold: false } : {}) },
        lifecycleEvents: [...(c.lifecycleEvents || []), evt]
      };
    });
    await save({ ...data, clients: newClients });
    setLogPopover(null); setLogNotes(""); setLogDate("");
    addGlobalToast?.({ message: isRevive ? "Client revived" : "Log saved" });
  };

  const markCold = async (clientId) => {
    const prevClient = data.clients.find(c => c.id === clientId);
    const prevLifecycle = prevClient ? JSON.parse(JSON.stringify(prevClient.lifecycle || {})) : {};
    const prevEvents = prevClient ? [...(prevClient.lifecycleEvents || [])] : [];
    const newClients = data.clients.map(c => {
      if (c.id !== clientId) return c;
      return {
        ...c,
        lifecycle: { ...(c.lifecycle||{}), cold: true, coldDate: today, coldFrom: activeTab === "lapsed" ? "lapsed" : "leads" },
        lifecycleEvents: [...(c.lifecycleEvents||[]), { event: "marked_cold", date: today, details: `Marked as cold from ${activeTab}` }]
      };
    });
    await save({ ...data, clients: newClients });
    addGlobalToast?.({
      message: "Client marked as cold",
      actionLabel: "Undo",
      onAction: async () => {
        const undoClients = data.clients.map(c => {
          if (c.id !== clientId) return c;
          return { ...c, lifecycle: prevLifecycle, lifecycleEvents: prevEvents };
        });
        await save({ ...data, clients: undoClients });
        addGlobalToast?.({ message: "Undo successful — client restored" });
      }
    });
  };

  // ── Mass Text handler (personalizes variables per client) ──
  const personalizeMsg = (body, clientId) => {
    const c = data.clients.find(cl => cl.id === clientId);
    const cDogs = (data.dogs || []).filter(d => d.clientId === clientId);
    let msg = body;
    msg = msg.replace(/\{clientName\}/g, c ? `${c.fields?.first_name || ""} ${c.fields?.last_name || ""}`.trim() || "Client" : "Client");
    msg = msg.replace(/\{dogName\}/g, formatDogNames(cDogs));
    msg = msg.replace(/\{checkInDate\}/g, "TBD");
    msg = msg.replace(/\{checkOutDate\}/g, "TBD");
    msg = msg.replace(/\{roomType\}/g, "TBD");
    msg = msg.replace(/\{totalPrice\}/g, "TBD");
    return msg;
  };

  const handleMassTextSend = async () => {
    if (!massTextBody.trim() || massTextSelected.size === 0) return;
    const now = new Date().toISOString();
    const newMsgs = [...massTextSelected].map(cid => ({
      id: gid(),
      clientId: cid,
      direction: "outbound",
      channel: "sms",
      body: personalizeMsg(massTextBody.trim(), cid),
      timestamp: now,
      status: "sent",
      twilioSid: null,
      templateId: null,
      readAt: null,
      isMassText: true
    }));
    const historyEntry = {
      id: gid(),
      sentAt: now,
      sentBy: profile?.full_name || profile?.email || "Unknown",
      body: massTextBody.trim(),
      recipientCount: massTextSelected.size,
      recipientIds: [...massTextSelected],
      recipientNames: [...massTextSelected].map(cid => {
        const c = data.clients.find(cl => cl.id === cid);
        return c ? `${c.fields?.first_name || ""} ${c.fields?.last_name || ""}`.trim() : "Unknown";
      })
    };
    await save({
      ...data,
      messages: [...(data.messages || []), ...newMsgs],
      massTextHistory: [...(data.massTextHistory || []), historyEntry]
    });
    setShowMassText(false);
    setMassTextBody("");
    setMassTextSelected(new Set());
    addGlobalToast?.({ message: `Mass text sent to ${massTextSelected.size} client${massTextSelected.size !== 1 ? "s" : ""}`, type: "success" });
  };

  // ── Tab config ──
  const tabDefs = [
    { id: "leads", label: "Leads", count: tabLists.leads.length, color: C.acc },
    { id: "active", label: "Active Customers", count: tabLists.active.length, color: C.pri },
    { id: "lapsed", label: "Lapsed", count: tabLists.lapsed.length, color: C.dan },
    { id: "cold", label: "Cold", count: tabLists.cold.length, color: C.textSec },
    { id: "all", label: "All", count: tabLists.all.length, color: C.info },
  ];

  // ── Toggleable columns for Active/All tabs ──
  const toggleCols = [
    { key: "daycare", label: "DC" }, { key: "boarding", label: "BD" },
    { key: "eval", label: "Eval" }, { key: "postEval", label: "P-Eval" },
    { key: "tours", label: "Tours" }, { key: "postTour", label: "P-Tour" },
  ];
  const baseCols = ["totalRes","lastRes","daysSince","totalSpent","nextRes"];
  const extraCols = ["daycare","boarding","eval","postEval","tours","postTour"];
  const shownDataCols = showExtraCols ? [...baseCols.slice(0,3), ...extraCols, ...baseCols.slice(3)] : baseCols;

  // ── Source cell renderer ──
  // Booking drafts state (for Online Booking source accordion)
  const [bookingDrafts, setBookingDrafts] = useState([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [expandedDraft, setExpandedDraft] = useState(null);

  // Load booking drafts when conversion tab is shown — refresh each time tab is opened
  useEffect(() => {
    if (activeTab === "leads" && locationSlug) {
      setDraftsLoaded(false);
      supabase.rpc("get_booking_drafts", { p_location_slug: locationSlug }).then(
        ({ data: d, error: e }) => {
          if (e) { console.log("get_booking_drafts error:", e.message); setDraftsLoaded(true); return; }
          if (d) setBookingDrafts(Array.isArray(d) ? d : []);
          setDraftsLoaded(true);
        },
        () => setDraftsLoaded(true) // network error
      );
    }
  }, [activeTab, locationSlug]);

  const renderSource = (client) => {
    const src = getClientSource(client);
    const isIgnite = client.lifecycle?.conversion?.source === "ignite";
    const isOnline = client.fields?.referral_source === "Online Booking" || client.lifecycle?.conversion?.source === "online_booking";
    const parts = [];
    if (isIgnite) parts.push({ label: "Ignite", type: "ignite" });
    if (isOnline) parts.push({ label: "Online Booking", type: "online" });
    if (src.base && (!isIgnite || src.base !== "Ignite") && src.base !== "Online Booking") parts.push({ label: src.base, type: "base" });
    if (src.hasEval) parts.push({ label: "Eval", type: "eval", res: src.evalRes });
    if (src.hasTour) parts.push({ label: "Tour", type: "tour", res: src.tourRes });
    if (parts.length === 0) return <span style={{color:C.textMut}}>—</span>;
    const igniteExpanded = expandedIgnite.has(client.id);
    return (
      <div style={{display:"flex",alignItems:"center",gap:0,flexWrap:"wrap",fontSize:11}}>
        {parts.map((p, i) => (
          <span key={i} style={{display:"inline-flex",alignItems:"center"}}>
            {i > 0 && <span style={{margin:"0 3px",color:C.textMut,fontSize:9}}>→</span>}
            {p.type === "ignite" ? (
              <span style={{display:"inline-flex",alignItems:"center",gap:1,background:igniteExpanded?`#F9731610`:"transparent",border:`1px solid ${igniteExpanded?"#F9731640":"transparent"}`,borderRadius:6,padding:"2px 4px 2px 7px",transition:"all 0.15s"}}>
                {client.igniteData?.igniteProfileId && client.igniteData?.leadId ? (
                  <a href={`https://leads.idigitalstrategies.com/profile/${client.igniteData.igniteProfileId}/leads?lid=${client.igniteData.leadId}`} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{fontWeight:700,color:"#F97316",textDecoration:"none",fontSize:11}}
                    onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
                    onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
                    Ignite ↗
                  </a>
                ) : (
                  <span style={{fontWeight:700,color:"#F97316",fontSize:11}}>Ignite</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedIgnite(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
                  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,background:"transparent",border:"none",cursor:"pointer",padding:0,color:"#F97316",fontFamily:"inherit"}}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:igniteExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </span>
            ) : p.type === "online" ? (
              <span style={{display:"inline-flex",alignItems:"center",gap:1,background:expandedDraft===client.id?`${C.pri}10`:"transparent",border:`1px solid ${expandedDraft===client.id?C.pri+"40":"transparent"}`,borderRadius:6,padding:"2px 4px 2px 7px",transition:"all 0.15s"}}>
                <span style={{fontWeight:700,color:C.pri,fontSize:11}}>Online</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedDraft(prev => prev === client.id ? null : client.id); }}
                  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,background:"transparent",border:"none",cursor:"pointer",padding:0,color:C.pri,fontFamily:"inherit"}}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:expandedDraft===client.id?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </span>
            ) : p.type === "eval" || p.type === "tour" ? (
              <span
                style={{fontWeight:700,color:p.type==="eval"?C.acc:C.info,cursor:"pointer",position:"relative"}}
                onMouseEnter={() => setHoveredSource(`${client.id}_${p.type}`)}
                onMouseLeave={() => setHoveredSource(null)}
              >
                {p.label}
                {hoveredSource === `${client.id}_${p.type}` && (
                  <div style={{position:"absolute",top:"100%",left:0,zIndex:999,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 14px",minWidth:180,boxShadow:"0 4px 16px rgba(0,0,0,0.10)",whiteSpace:"nowrap"}}>
                    {p.res && <div style={{fontSize:11,color:C.text,marginBottom:4}}>{fmtDate(p.res.checkIn)}</div>}
                    {p.type === "eval" && p.res && (() => {
                      const ev = (data.evaluations||[]).find(e => e.reservationId === p.res.id && e.locked);
                      if (!ev) return null;
                      const rc = ev.result === "green" ? C.suc : ev.result === "yellow" ? C.acc : C.dan;
                      return (
                        <>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                            <span style={{fontSize:10,fontWeight:700}}>Outcome:</span>
                            <span style={{fontSize:10,fontWeight:800,color:rc,textTransform:"uppercase"}}>{ev.result}</span>
                          </div>
                          <span onClick={(e) => { e.stopPropagation(); nav("evaluation-form", { reservationId: p.res.id }); }} style={{fontSize:10,fontWeight:700,color:C.pri,cursor:"pointer",textDecoration:"underline"}}>View Form</span>
                        </>
                      );
                    })()}
                    {p.type === "tour" && <div style={{fontSize:10,color:C.suc,fontWeight:600}}>Completed</div>}
                  </div>
                )}
              </span>
            ) : (
              <span style={{color:C.text,fontWeight:600}}>{p.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  // ── Dog count cell (clickable accordion trigger) ──
  const renderDogCount = (client) => {
    const s = clientStats[client.id] || {};
    const dogs = data.dogs.filter(d => d.clientId === client.id);
    const isExp = expandedDogs.has(client.id);
    return (
      <button onClick={(e) => { e.stopPropagation(); setExpandedDogs(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
        style={{display:"inline-flex",alignItems:"center",gap:4,background:isExp?`${C.pri}10`:"transparent",border:`1px solid ${isExp?C.pri+"40":"transparent"}`,borderRadius:6,padding:"2px 8px",cursor:dogs.length>0?"pointer":"default",fontFamily:"inherit",fontSize:12,fontWeight:700,color:isExp?C.pri:C.text,transition:"all 0.15s"}}>
        {s.dogCount || 0}
        {dogs.length > 0 && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:isExp?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>}
      </button>
    );
  };

  // ── Dog detail row (accordion expansion) ──
  const renderDogDetails = (client) => {
    if (!expandedDogs.has(client.id)) return null;
    const dogs = data.dogs.filter(d => d.clientId === client.id);
    if (dogs.length === 0) return null;
    const calcAge = (dob) => { if (!dob) return "—"; const b=new Date(dob+"T00:00:00"),now=new Date(); let y=now.getFullYear()-b.getFullYear(),m=now.getMonth()-b.getMonth(); if(m<0){y--;m+=12;} return y>0?`${y}y ${m}m`:`${m}m`; };
    return (
      <div style={{padding:"10px 20px 10px 28px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
        {dogs.map(dog => {
          const f = dog.fields || {};
          const sn = f.spayed_neutered || "Unknown";
          return (
            <div key={dog.id} style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 0.8fr 0.8fr 1fr",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.borderLight}`,fontSize:11,alignItems:"center"}}>
              <div><span style={{fontWeight:700,color:C.text}}>{f.name || "Unknown"}</span></div>
              <div style={{color:C.textSec}}>{f.breed || "—"}</div>
              <div style={{color:C.textSec}}>{calcAge(f.dob)}</div>
              <div style={{color:C.textSec}}>{f.weight ? `${f.weight} lbs` : "—"}</div>
              <div><span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:sn==="Neutered"||sn==="Spayed"?`${C.suc}15`:`${C.acc}15`,color:sn==="Neutered"||sn==="Spayed"?C.suc:C.acc}}>{sn}</span></div>
            </div>
          );
        })}
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 0.8fr 0.8fr 1fr",gap:10,padding:"4px 0 0",fontSize:9,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          <div>Name</div><div>Breed</div><div>Age</div><div>Weight</div><div>S/N</div>
        </div>
      </div>
    );
  };

  // ── Follow-up cell renderer ──
  const [expandedFollowUp, setExpandedFollowUp] = useState(new Set());
  const renderFollowUp = (client, tab) => {
    const fu = client.lifecycle?.[tab]?.followUpDate;
    if (!fu) return <span style={{color:C.textMut,fontSize:11}}>—</span>;
    const isOverdue = fu < today;
    const isToday = fu === today;
    const d = new Date(fu + "T12:00:00");
    const mmddyy = `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
    const dow = d.toLocaleDateString("en-US",{weekday:"long"});
    const isExpFu = expandedFollowUp.has(client.id);
    const toggleFu = (e) => { e.stopPropagation(); setExpandedFollowUp(prev => { const n = new Set(prev); if (n.has(client.id)) n.delete(client.id); else n.add(client.id); return n; }); };
    return (
      <div>
        <div onClick={toggleFu} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
          <div style={{lineHeight:1.3}}>
            <div style={{fontSize:12,fontWeight:600,color:isOverdue?C.dan:isToday?C.suc:C.text}}>{mmddyy}</div>
            <div style={{fontSize:10,color:isOverdue?C.dan:isToday?C.suc:C.textSec,fontWeight:500}}>{dow}</div>
          </div>
          {isOverdue && <span style={{fontSize:9,fontWeight:800,color:C.dan,background:`${C.dan}15`,padding:"1px 5px",borderRadius:4}}>OVERDUE</span>}
          {isToday && <span style={{fontSize:9,fontWeight:800,color:C.suc,background:`${C.suc}15`,padding:"1px 5px",borderRadius:4}}>TODAY</span>}
        </div>
        {isExpFu && client.createdAt && (
          <div style={{marginTop:4,padding:"3px 6px",borderRadius:4,background:C.bg,border:`1px solid ${C.borderLight}`,fontSize:10,color:C.textSec}}>
            <span style={{fontWeight:600}}>Created:</span> {fmtDate(client.createdAt.split("T")[0] || client.createdAt)}
          </div>
        )}
      </div>
    );
  };

  // ── Notes cell (shows last log note with date prefix) ──
  const renderNotes = (client, tab) => {
    const updates = client.lifecycle?.[tab]?.updates || [];
    if (updates.length === 0) {
      // For Ignite leads with no updates yet, show the received date from notes field
      if (client.lifecycle?.conversion?.source === "ignite" && client.fields?.notes) {
        return <span style={{fontSize:11,color:"#F97316",fontWeight:600,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{client.fields.notes}</span>;
      }
      return <span style={{color:C.textMut,fontSize:11}}>—</span>;
    }
    const last = updates[0]; // most recent
    const dateStr = last.loggedAt ? new Date(last.loggedAt).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : "";
    return <span style={{fontSize:11,color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{dateStr ? `${dateStr}: ` : ""}{last.notes}</span>;
  };

  // ── Updates/Log cell ──
  const renderUpdatesLog = (client, tab) => {
    const updates = client.lifecycle?.[tab]?.updates || [];
    const isExpanded = expandedUpdates.has(client.id);
    return (
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={(e) => { e.stopPropagation(); setExpandedUpdates(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:22,padding:"0 6px",borderRadius:8,fontSize:11,fontWeight:800,border:"none",cursor:"pointer",fontFamily:"inherit",
            background:updates.length>0?`${C.acc}20`:C.bg,color:updates.length>0?C.acc:C.textMut}}>
          {updates.length}
        </button>
        <button ref={el => { if(el) logBtnRef.current[client.id] = el; }}
          onClick={(e) => { e.stopPropagation(); const rect=e.currentTarget.getBoundingClientRect(); setLogPopover({ clientId:client.id, tab, x:rect.left, y:rect.bottom+4 }); setLogNotes(client.lifecycle?.[tab]?.notes||""); setLogDate(""); }}
          style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.pri}30`,background:`${C.pri}08`,color:C.pri,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
          Log
        </button>
      </div>
    );
  };

  // ── Cold button cell ──
  const renderColdBtn = (client) => (
    <button onClick={(e) => { e.stopPropagation(); markCold(client.id); }}
      style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.dan}30`,background:`${C.dan}08`,color:C.dan,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
      Cold
    </button>
  );

  // ── Revive button cell ──
  const renderReviveBtn = (client) => (
    <button onClick={(e) => { e.stopPropagation(); const rect=e.currentTarget.getBoundingClientRect(); setLogPopover({ clientId:client.id, tab:(client.lifecycle?.coldFrom === "retention" || client.lifecycle?.coldFrom === "lapsed") ? "retention" : "conversion", isRevive:true, x:rect.left, y:rect.bottom+4 }); setLogNotes(""); setLogDate(""); }}
      style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.suc}30`,background:`${C.suc}08`,color:C.suc,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
      Revive
    </button>
  );

  // ── Client name cell (clickable) ──
  const renderName = (client) => {
    const fn = client.fields.first_name || "";
    const ln = client.fields.last_name || "";
    return (
      <span onClick={(e) => { e.stopPropagation(); nav("client-detail",{clientId:client.id}); }}
        style={{fontWeight:700,color:C.pri,cursor:"pointer",fontSize:12}}
        onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
        onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
        {fn} {ln}
      </span>
    );
  };

  // ── Grid templates per tab ──
  const getGrid = () => {
    if (activeTab === "leads") return "minmax(120px,1.5fr) minmax(80px,1fr) 60px minmax(100px,1.2fr) minmax(90px,1fr) minmax(100px,1.5fr) 100px 60px";
    if (activeTab === "lapsed") return "minmax(110px,1.3fr) minmax(80px,1fr) 50px minmax(90px,1fr) minmax(85px,0.9fr) minmax(90px,1.3fr) 90px minmax(70px,0.8fr) minmax(65px,0.7fr) 55px 55px";
    if (activeTab === "cold") return "minmax(120px,1.5fr) minmax(80px,1fr) 60px minmax(100px,1.2fr) minmax(90px,1fr) minmax(120px,1.5fr) 70px";
    // Active / All
    const base = "minmax(80px,1fr) minmax(80px,1fr) minmax(80px,0.8fr) 50px";
    const dataCols = shownDataCols.map(k => {
      if (k==="lastRes"||k==="nextRes") return "minmax(70px,0.8fr)";
      return "minmax(50px,0.6fr)";
    }).join(" ");
    return `${base} ${dataCols}`;
  };

  // ── Render ──
  return (
    <div style={{padding:"24px 28px",maxWidth:1400,margin:"0 auto"}}>
      {/* Page Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,fontSize:24,fontWeight:800,color:C.text,letterSpacing:"-0.02em"}}>Customer Lifecycle</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:C.textSec}}>{data.clients.length} total clients{search?` — ${activeList.length} shown`:""}</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={() => setLcFilterOpen(v => !v)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:`1.5px solid ${activeFilterCount>0?C.pri:C.border}`,background:activeFilterCount>0?C.priLt:"transparent",color:activeFilterCount>0?C.pri:C.textSec,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filter{activeFilterCount>0 && <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:18,height:18,padding:"0 5px",borderRadius:9,fontSize:10,fontWeight:800,background:C.pri,color:"#fff"}}>{activeFilterCount}</span>}
          </button>
          <Btn variant="ghost" onClick={() => {
            setMassTextSelected(new Set(activeList.filter(c => c.fields?.phone).map(c => c.id)));
            setShowMassText(true);
          }}>
            <I.MessageSquare /> Mass Text ({activeList.filter(c => c.fields?.phone).length})
          </Btn>
          <Btn variant="ghost" onClick={() => {
            // Export current lifecycle tab to CSV
            const headers = activeTab === "leads"
              ? ["First Name","Last Name","Phone","Email","Dogs","Source","Follow-Up Date","Notes"]
              : activeTab === "active"
              ? ["First Name","Last Name","Phone","Email","Dogs","Reservations","Last Visit","Days Since","Total Spent"]
              : activeTab === "cold"
              ? ["First Name","Last Name","Phone","Email","Dogs","Cold Date","Previous Stage"]
              : ["First Name","Last Name","Phone","Email","Dogs"];
            const rows = activeList.map(c => {
              const f = c.fields || {};
              const dogs = (data.dogs || []).filter(d => d.clientId === c.id).map(d => d.fields?.name).join(", ");
              const base = [f.first_name||"", f.last_name||"", f.phone||"", f.email||"", dogs];
              if (activeTab === "leads") {
                const lc = c.lifecycle?.conversion || {};
                return [...base, c.referralSource || "", lc.followUpDate || "", lc.notes || ""];
              } else if (activeTab === "active") {
                const resCount = (data.reservations || []).filter(r => r.clientId === c.id).length;
                const lastRes = (data.reservations || []).filter(r => r.clientId === c.id).sort((a,b) => (b.checkIn||"").localeCompare(a.checkIn||""))[0];
                const daysSince = lastRes ? Math.floor((new Date(todayStr()+"T12:00:00") - new Date(lastRes.checkIn+"T12:00:00")) / 86400000) : "";
                const totalSpent = (data.payments || []).filter(p => p.clientId === c.id).reduce((s,p) => s + (p.amount||0), 0);
                return [...base, resCount, lastRes?.checkIn || "", daysSince, "$" + totalSpent.toFixed(2)];
              } else if (activeTab === "cold") {
                return [...base, c.lifecycle?.coldDate || "", c.lifecycle?.coldFrom || ""];
              }
              return base;
            });
            const csvContent = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `lifecycle-${activeTab}-${todayStr()}.csv`; a.click();
            URL.revokeObjectURL(url);
            addGlobalToast?.({ message: `Exported ${rows.length} clients to CSV`, type: "success" });
          }}>
            <I.Download /> Export CSV
          </Btn>
          <Btn onClick={() => nav("new-client")}>+ New Client</Btn>
        </div>
      </div>

      {/* Main Card */}
      <Card style={{padding:0,overflow:"hidden"}}>
        {/* Search Bar */}
        <div style={{borderBottom:`1.5px solid ${C.borderLight}`,background:C.bg,transition:"border-color 0.15s"}}
          onFocus={e=>e.currentTarget.style.borderBottomColor=C.pri} onBlur={e=>e.currentTarget.style.borderBottomColor=C.borderLight}>
          <div style={{display:"flex",alignItems:"center",padding:"0 16px"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={search?C.pri:C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by client name, dog name, or phone…"
              className="no-focus-ring"
              style={{border:"none",outline:"none",background:"transparent",fontSize:13,fontWeight:500,color:C.text,padding:"12px 10px",width:"100%",fontFamily:"inherit"}} />
            {search && <button onClick={()=>setSearch("")} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex"}} title="Clear"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
            {/* Filter pills area */}
            <div style={{display:"flex",gap:4,marginLeft:8,flexShrink:0}}>
              {activeTab === "leads" && <>
                {[{id:"eval",label:"Eval",color:C.acc},{id:"tour",label:"Tour",color:C.info},{id:"ignite",label:"Ignite",color:"#F97316"},{id:"online",label:"Online Booking",color:C.pri}].map(f => {
                  const on = sourceFilter.has(f.id);
                  return <button key={f.id} onClick={()=>toggleSourceFilter(f.id)} style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${on?f.color:C.border}`,background:on?f.color:"transparent",color:on?"#fff":C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>{f.label}</button>;
                })}
                {sourceFilter.size > 0 && <button onClick={()=>setSourceFilter(new Set())} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:"0 2px",display:"flex",alignItems:"center"}} title="Clear"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                <div style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}} />
              </>}
              {(activeTab === "leads" || activeTab === "lapsed") && (
                <button onClick={()=>setShowOverdueOnly(v=>!v)}
                  style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showOverdueOnly?C.dan:C.border}`,background:showOverdueOnly?`${C.dan}12`:"transparent",color:showOverdueOnly?C.dan:C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                  Overdue
                </button>
              )}
              {(activeTab === "active" || activeTab === "all") && (
                <button onClick={(e) => { e.stopPropagation(); setShowExtraCols(v=>!v); }}
                  style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showExtraCols?C.pri:C.border}`,background:showExtraCols?C.priLt:"transparent",color:showExtraCols?C.pri:C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.2s",textTransform:"uppercase",letterSpacing:"0.04em"}}>
                  {showExtraCols ? "Less Columns" : "More Columns"}
                </button>
              )}
            </div>
          </div>
          {/* Active structured filter summary */}
          {activeFilterCount > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 16px 8px",borderTop:`1px solid ${C.borderLight}`,flexWrap:"wrap"}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span style={{fontSize:11,fontWeight:600,color:C.pri}}>{activeFilterCount} filter{activeFilterCount!==1?"s":""}:</span>
              {Object.entries(lcFilters).map(([k, f]) => {
                const fd = LC_FILTER_FIELDS.find(x => x.key === k);
                return (
                  <span key={k} style={{fontSize:11,fontWeight:600,color:C.text,background:`${C.pri}10`,border:`1px solid ${C.pri}25`,padding:"2px 8px",borderRadius:6,display:"inline-flex",alignItems:"center",gap:4}}>
                    {fd?.label} {LC_OP_LABELS[f.op]||f.op} {f.val !== "" ? (fd?.type==="currency"?"$":"")+f.val : ""}
                    <button onClick={()=>{ const n={...lcFilters}; delete n[k]; setLcFilters(n); }} style={{border:"none",background:"none",cursor:"pointer",color:C.pri,padding:0,display:"flex",lineHeight:1}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </span>
                );
              })}
              <button onClick={()=>setLcFilters({})} style={{fontSize:10,fontWeight:600,color:C.textMut,border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",marginLeft:4}}>Clear all</button>
              <span style={{fontSize:11,color:C.textMut,marginLeft:"auto"}}>{activeList.length} result{activeList.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Tab Pills */}
        <div style={{display:"flex",borderBottom:`2px solid ${C.borderLight}`,background:C.bg}}>
          {tabDefs.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSortCol(null); setShowOverdueOnly(false); setSourceFilter(new Set()); setExpandedUpdates(new Set()); }}
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"14px 16px",border:"none",borderBottom:`3px solid ${active?tab.color:"transparent"}`,background:active?C.surface:"transparent",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",marginBottom:-2}}>
                <span style={{fontSize:14,fontWeight:active?700:600,color:active?C.text:C.textSec}}>{tab.label}</span>
                <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:24,height:24,padding:"0 8px",borderRadius:12,fontSize:13,fontWeight:800,background:active?tab.color:C.surfaceHover,color:active?"#fff":C.textSec,transition:"all 0.15s"}}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* Explainer Banner — per-tab, editable */}
        {(() => {
          const banners = data.lifecycleExplainers || {};
          const txt = banners[activeTab] || DEFAULT_LIFECYCLE_BANNERS[activeTab] || "";
          const canEdit = hasPermission(profile, data, "edit_lifecycle_banners");
          const isEditing = editingBanner === activeTab;
          return (
            <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.borderLight}`,background:`linear-gradient(135deg, ${C.priLt||C.pri+"08"}40, ${C.surface})`,fontSize:12,lineHeight:1.6,color:C.textSec,position:"relative"}}>
              {isEditing ? (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <textarea value={bannerDraft} onChange={e => setBannerDraft(e.target.value)} autoFocus
                    style={{width:"100%",minHeight:72,padding:"8px 10px",border:`1.5px solid ${C.pri}`,borderRadius:6,fontSize:12,lineHeight:1.6,fontFamily:"inherit",color:C.text,background:"#fff",resize:"vertical",outline:"none",boxSizing:"border-box"}}
                    placeholder="Enter banner text for this tab…" />
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                    <button onClick={() => setEditingBanner(null)} style={{padding:"5px 14px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,fontSize:11,fontWeight:600,color:C.textSec,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                    <button onClick={async () => {
                      const updated = { ...(data.lifecycleExplainers || {}), [activeTab]: bannerDraft.trim() || DEFAULT_LIFECYCLE_BANNERS[activeTab] };
                      await save({ ...data, lifecycleExplainers: updated });
                      setEditingBanner(null);
                      addGlobalToast?.({ message: "Banner updated" });
                    }} style={{padding:"5px 14px",border:"none",borderRadius:6,background:C.pri,fontSize:11,fontWeight:600,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                    {banners[activeTab] && (
                      <button onClick={async () => {
                        const updated = { ...(data.lifecycleExplainers || {}) };
                        delete updated[activeTab];
                        await save({ ...data, lifecycleExplainers: updated });
                        setEditingBanner(null);
                        setBannerDraft("");
                        addGlobalToast?.({ message: "Banner reset to default" });
                      }} style={{padding:"5px 14px",border:`1px solid ${C.dan}30`,borderRadius:6,background:`${C.dan}08`,fontSize:11,fontWeight:600,color:C.dan,cursor:"pointer",fontFamily:"inherit"}}>Reset Default</button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{txt}</div>
                  {canEdit && (
                    <button onClick={() => { setEditingBanner(activeTab); setBannerDraft(txt); }}
                      title="Edit banner text"
                      style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",color:C.textSec,transition:"all 0.15s",marginTop:-1}}
                      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.pri; }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.textSec; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ TABLE HEADER + ROWS ═══ */}
        {activeTab === "leads" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div></div>
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No leads{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.conversion?.updates || [];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div>{renderSource(c)}</div>
                    <div>{renderFollowUp(c, "conversion")}</div>
                    <div>{renderNotes(c, "conversion")}</div>
                    <div>{renderUpdatesLog(c, "conversion")}</div>
                    <div>{renderColdBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                  {expandedIgnite.has(c.id) && c.igniteData && (() => {
                    const igd = c.igniteData;
                    const fields = [
                      { label: "Source", val: igd.source },
                      { label: "First Name", val: igd.firstName },
                      { label: "Last Name", val: igd.lastName },
                      { label: "Caller Name", val: igd.callerName },
                      { label: "Email", val: igd.email },
                      { label: "Phone", val: igd.phone },
                      { label: "Tracking Number", val: igd.trackingNumber },
                      { label: "Call Duration", val: igd.callDuration },
                      { label: "Call Status", val: igd.callStatus },
                      { label: "Zip Code", val: igd.zip },
                      { label: "City", val: igd.city },
                      { label: "State", val: igd.state },
                      { label: "Reason for Contact", val: igd.reason },
                      { label: "Message", val: igd.message },
                      { label: "Profile", val: igd.profile },
                      { label: "Form Name", val: igd.formName },
                      { label: "Lead ID", val: igd.leadId },
                      { label: "Lead Page", val: igd.leadPage },
                      { label: "Landing Page", val: igd.landingPage },
                    ].filter(f => f.val);
                    return (
                      <div style={{padding:"12px 20px 12px 28px",background:`#FFF7ED`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:"3px solid #F97316"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F97316" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:"#F97316"}}>Ignite Lead Data</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Received {c.createdAt ? new Date(c.createdAt + "T12:00:00").toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : "—"}</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 24px"}}>
                          {fields.map((f, i) => (
                            <div key={i} style={{display:"flex",gap:6,fontSize:11,lineHeight:1.5}}>
                              <span style={{fontWeight:700,color:C.textSec,minWidth:110,flexShrink:0}}>{f.label}:</span>
                              <span style={{color:C.text,wordBreak:"break-word"}}>{f.val}</span>
                            </div>
                          ))}
                        </div>
                        {(igd.igniteProfileId && igd.leadId || igd.callRecordingUrl) && (
                          <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #F9731630",display:"flex",gap:8,flexWrap:"wrap"}}>
                            {igd.igniteProfileId && igd.leadId && (
                              <a href={`https://leads.idigitalstrategies.com/profile/${igd.igniteProfileId}/leads?lid=${igd.leadId}`} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:"#F97316",textDecoration:"none",padding:"4px 10px",borderRadius:6,border:"1px solid #F9731640",background:"white"}}
                                onMouseEnter={e=>e.currentTarget.style.background="#FFF7ED"}
                                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                                View in Ignite Dashboard ↗
                              </a>
                            )}
                            {igd.callRecordingUrl && (
                              <a href={igd.callRecordingUrl} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:C.pri,textDecoration:"none",padding:"4px 10px",borderRadius:6,border:`1px solid ${C.pri}40`,background:"white"}}
                                onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`}
                                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                                🎧 Listen to Call Recording ↗
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {expandedDraft === c.id && (() => {
                    const draft = bookingDrafts.find(d => {
                      const cd = d.client_data || {};
                      return (cd.phone && cd.phone === c.fields?.phone) || (cd.email && cd.email === c.fields?.email);
                    });
                    if (!draft) return (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <span style={{fontSize:12,color:C.textMut}}>No booking draft data found for this customer.</span>
                      </div>
                    );
                    const timeline = Array.isArray(draft.step_timeline) ? draft.step_timeline : [];
                    const stepNames = { splash:"Landing Page", avail_step_0:"Service Selection", avail_step_1:"Date Selection", avail_step_2:"Room / Time Selection", avail_step_3:"Room Recommendation", reg_step_0:"Client Info", reg_step_1:"Dog Info", reg_step_2:"Vaccine Records", reg_step_3:"Feeding & Care", reg_step_4:"Stay Details", reg_step_5:"Review & Book", confirmation:"Confirmed" };
                    return (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:C.pri}}>Online Booking Journey</span>
                          <span style={{fontSize:11,fontWeight:700,color:C.pri,background:`${C.pri}15`,padding:"2px 8px",borderRadius:8}}>{draft.completion_pct || 0}% complete</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Last activity {new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"})} {new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
                          {timeline.filter(s => s.step !== "splash").map((s, i) => {
                            const name = stepNames[s.step] || s.step;
                            const dur = s.duration || 0;
                            const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur/60)}m ${dur%60}s`;
                            const filtered = timeline.filter(st => st.step !== "splash");
                            const isLast = i === filtered.length - 1;
                            return (
                              <React.Fragment key={i}>
                                <span style={{fontSize:11,fontWeight:600,color:C.text,background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:8,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:4}}>
                                  {name}
                                  <span style={{fontSize:10,color:C.textMut,fontWeight:500}}>({durLabel})</span>
                                </span>
                                {!isLast && <span style={{color:C.textMut,fontSize:10}}>→</span>}
                                {isLast && !s.exitedAt && <span style={{fontSize:10,color:C.dan,fontWeight:600,marginLeft:4}}>stopped / closed tab</span>}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {draft.booking_data && (draft.booking_data.checkIn || draft.booking_data.tourDate) && (
                          <div style={{marginTop:8,fontSize:11,color:C.textSec}}>
                            {draft.service_type === "tour" ? `Tour: ${draft.booking_data.tourDate} at ${draft.booking_data.tourTime || "—"}`
                              : `Dates: ${draft.booking_data.checkIn || "—"} – ${draft.booking_data.checkOut || "—"}${draft.booking_data.selectedRoom ? ` · Room: ${draft.booking_data.selectedRoom}` : ""}`}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {isExp && updates.length > 0 && (
                    <div style={{padding:"12px 20px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.acc}`}}>
                      {updates.map(u => (
                        <div key={u.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.pri,marginBottom:3}}>{u.loggedBy} — {new Date(u.loggedAt).toLocaleDateString()} {new Date(u.loggedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                          <div style={{fontSize:12,color:C.text,marginBottom:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{u.notes}</div>
                          <div style={{fontSize:10,color:C.textSec}}>Target: {u.previousFollowUp ? fmtDate(u.previousFollowUp) : "—"} → Next: {fmtDate(u.newFollowUp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* ── Standalone booking draft entries (visitors not yet in system) ── */}
            {bookingDrafts.length > 0 && (() => {
              // Find drafts that don't match any existing client
              const clientPhones = new Set(data.clients.map(c => (c.fields?.phone || "").replace(/\D/g, "")).filter(Boolean));
              const clientEmails = new Set(data.clients.map(c => (c.fields?.email || "").toLowerCase()).filter(Boolean));
              const unmatchedDrafts = bookingDrafts.filter(d => {
                const cd = d.client_data || {};
                const dPhone = (cd.phone || "").replace(/\D/g, "");
                const dEmail = (cd.email || "").toLowerCase();
                const matchesClient = (dPhone && clientPhones.has(dPhone)) || (dEmail && clientEmails.has(dEmail));
                return !matchesClient;
              });
              // If "online" source filter is active but no other filter, show unmatched drafts
              // If any source filter is active that ISN'T "online", hide them
              if (sourceFilter.size > 0 && !sourceFilter.has("online")) return null;
              if (unmatchedDrafts.length === 0) return null;
              const stepNames = { splash:"Landing Page", avail_step_0:"Service Selection", avail_step_1:"Date Selection", avail_step_2:"Room / Time Selection", avail_step_3:"Room Recommendation", reg_step_0:"Client Info", reg_step_1:"Dog Info", reg_step_2:"Vaccine Records", reg_step_3:"Feeding & Care", reg_step_4:"Stay Details", reg_step_5:"Review & Book", confirmation:"Confirmed" };
              return unmatchedDrafts.map(draft => {
                const cd = draft.client_data || {};
                const dd = draft.dog_data || {};
                const draftName = [cd.firstName, cd.lastName].filter(Boolean).join(" ") || "Anonymous Visitor";
                const draftPhone = cd.phone || "";
                const draftDogName = dd.name || "";
                const timeline = Array.isArray(draft.step_timeline) ? draft.step_timeline : [];
                const isExpanded = expandedDraft === draft.id;
                return (
                  <div key={`draft-${draft.id}`}>
                    <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s",background:`${C.pri}04`}}
                      onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`} onMouseLeave={e=>e.currentTarget.style.background=`${C.pri}04`}>
                      <div style={{fontWeight:600,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        {draftName}
                      </div>
                      <div style={{fontSize:11}}>{draftPhone ? fmtPhone(draftPhone) : <span style={{color:C.textMut}}>—</span>}</div>
                      <div style={{fontSize:11}}>{draftDogName || <span style={{color:C.textMut}}>—</span>}</div>
                      <div>
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${C.pri}10`,border:`1px solid ${C.pri}30`,borderRadius:6,padding:"2px 8px",cursor:"pointer"}} onClick={() => setExpandedDraft(prev => prev === draft.id ? null : draft.id)}>
                          <span style={{fontWeight:700,color:C.pri,fontSize:11}}>Online</span>
                          <span style={{fontSize:10,color:C.pri,fontWeight:600}}>{draft.completion_pct||0}%</span>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" style={{transform:isExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                        </span>
                      </div>
                      <div style={{fontSize:10,color:C.textSec}}>{draft.updated_at ? new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric"}) + " " + new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "—"}</div>
                      <div style={{fontSize:10,color:C.textMut,fontStyle:"italic"}}>In-progress booking</div>
                      <div><span style={{color:C.textMut,fontSize:10}}>—</span></div>
                      <div></div>
                    </div>
                    {isExpanded && (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:C.pri}}>Online Booking Journey</span>
                          <span style={{fontSize:11,fontWeight:700,color:C.pri,background:`${C.pri}15`,padding:"2px 8px",borderRadius:8}}>{draft.completion_pct || 0}% complete</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Last activity {new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"})} {new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
                          {timeline.filter(s => s.step !== "splash").map((s, i) => {
                            const name = stepNames[s.step] || s.step;
                            const dur = s.duration || 0;
                            const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur/60)}m ${dur%60}s`;
                            const filtered = timeline.filter(st => st.step !== "splash");
                            const isLast = i === filtered.length - 1;
                            return (
                              <React.Fragment key={i}>
                                <span style={{fontSize:11,fontWeight:600,color:C.text,background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:8,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:4}}>
                                  {name}
                                  <span style={{fontSize:10,color:C.textMut,fontWeight:500}}>({durLabel})</span>
                                </span>
                                {!isLast && <span style={{color:C.textMut,fontSize:10}}>→</span>}
                                {isLast && !s.exitedAt && <span style={{fontSize:10,color:C.dan,fontWeight:600,marginLeft:4}}>stopped / closed tab</span>}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {draft.booking_data && (draft.booking_data.checkIn || draft.booking_data.tourDate) && (
                          <div style={{marginTop:8,fontSize:11,color:C.textSec}}>
                            {draft.service_type === "tour" ? `Tour: ${draft.booking_data.tourDate} at ${draft.booking_data.tourTime || "—"}`
                              : `Dates: ${draft.booking_data.checkIn || "—"} – ${draft.booking_data.checkOut || "—"}${draft.booking_data.selectedRoom ? ` · Room: ${draft.booking_data.selectedRoom}` : ""}`}
                          </div>
                        )}
                        {(cd.firstName || cd.email || cd.phone) && (
                          <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${C.pri}20`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px"}}>
                            {cd.firstName && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Name:</span> <span style={{color:C.text}}>{cd.firstName} {cd.lastName||""}</span></div>}
                            {cd.email && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Email:</span> <span style={{color:C.text}}>{cd.email}</span></div>}
                            {cd.phone && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Phone:</span> <span style={{color:C.text}}>{cd.phone}</span></div>}
                            {dd.name && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Dog:</span> <span style={{color:C.text}}>{dd.name}{dd.breed ? ` (${dd.breed})` : ""}</span></div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </>;
        })()}

        {activeTab === "lapsed" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div style={colHeaderStyle("lastRes")} onClick={()=>handleSort("lastRes")}>Last Res <SortIcon col="lastRes"/></div>
              <div style={colHeaderStyle("totalPaid")} onClick={()=>handleSort("totalPaid")}>Paid <SortIcon col="totalPaid"/></div>
              <div style={colHeaderStyle("totalAppts")} onClick={()=>handleSort("totalAppts")}>Appts <SortIcon col="totalAppts"/></div>
              <div></div>
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No lapsed clients{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const s = clientStats[c.id] || {};
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.retention?.updates || [];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div>{renderSource(c)}</div>
                    <div>{renderFollowUp(c, "retention")}</div>
                    <div>{renderNotes(c, "retention")}</div>
                    <div>{renderUpdatesLog(c, "retention")}</div>
                    <div style={{fontSize:11}}>{s.lastRes ? <><span>{fmtDate(s.lastRes.checkIn)}</span></> : <span style={{color:C.textMut}}>—</span>}</div>
                    <div style={{fontSize:11,fontWeight:600}}>${(s.totalSpent||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
                    <div style={{fontSize:11,fontWeight:600}}>{s.totalRes||0}</div>
                    <div>{renderColdBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                  {isExp && updates.length > 0 && (
                    <div style={{padding:"12px 20px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.acc}`}}>
                      {updates.map(u => (
                        <div key={u.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.pri,marginBottom:3}}>{u.loggedBy} — {new Date(u.loggedAt).toLocaleDateString()} {new Date(u.loggedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                          <div style={{fontSize:12,color:C.text,marginBottom:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{u.notes}</div>
                          <div style={{fontSize:10,color:C.textSec}}>Target: {u.previousFollowUp ? fmtDate(u.previousFollowUp) : "—"} → Next: {fmtDate(u.newFollowUp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>;
        })()}

        {activeTab === "cold" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("coldDate")} onClick={()=>handleSort("coldDate")}>Date Cold <SortIcon col="coldDate"/></div>
              <div>Last Notes</div>
              <div></div>
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No cold clients{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const fromTab = (c.lifecycle?.coldFrom === "retention" || c.lifecycle?.coldFrom === "lapsed") ? "retention" : "conversion";
              const lastUpdate = c.lifecycle?.[fromTab]?.updates?.[0];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div>{renderSource(c)}</div>
                    <div style={{fontSize:11}}>{c.lifecycle?.coldDate ? fmtDate(c.lifecycle.coldDate) : "—"}</div>
                    <div style={{fontSize:11,color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{lastUpdate?.notes || <span style={{color:C.textMut}}>—</span>}</div>
                    <div>{renderReviveBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                </div>
              );
            })}
          </>;
        })()}

        {(activeTab === "active" || activeTab === "all") && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("last_name")} onClick={()=>handleSort("last_name")}>Last <SortIcon col="last_name"/></div>
              <div style={colHeaderStyle("first_name")} onClick={()=>handleSort("first_name")}>First <SortIcon col="first_name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              {shownDataCols.map(k => {
                const labels = {totalRes:"Res",lastRes:"Last Res",daysSince:"Days",daycare:"DC",boarding:"BD",eval:"Eval",postEval:"P-Eval",tours:"Tours",postTour:"P-Tour",totalSpent:"Spent",nextRes:"Next"};
                return <div key={k} style={colHeaderStyle(k)} onClick={()=>handleSort(k)}>{labels[k]||k} <SortIcon col={k}/></div>;
              })}
              {/* Column toggle moved to search bar */}
            </div>
            {activeList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No clients{search?" matching search":""}</div></div>
            ) : activeList.map(c => {
              const s = clientStats[c.id] || {};
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div><span onClick={()=>nav("client-detail",{clientId:c.id})} style={{fontWeight:700,color:C.pri,cursor:"pointer",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{c.fields.last_name||""}</span></div>
                    <div style={{color:C.text}}>{c.fields.first_name||""}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{fmtPhone?.(c.fields.phone)||c.fields.phone||""}</div>
                    <div>{renderDogCount(c)}</div>
                    {shownDataCols.map(k => {
                      switch(k) {
                        case "totalRes": return <div key={k} style={{fontSize:11,fontWeight:600}}>{s.totalRes||0}</div>;
                        case "lastRes": return <div key={k} style={{fontSize:11}}>{s.lastRes ? fmtDate(s.lastRes.checkIn) : <span style={{color:C.textMut}}>—</span>}</div>;
                        case "daysSince": {
                          const d = s.daysSinceLast;
                          const col = d==null?C.textMut:d>180?C.dan:d>90?C.acc:d>60?C.text:C.suc;
                          return <div key={k} style={{fontSize:11,fontWeight:700,color:col}}>{d!=null?d:"—"}</div>;
                        }
                        case "daycare": return <div key={k} style={{fontSize:11}}>{s.daycareCount||0}</div>;
                        case "boarding": return <div key={k} style={{fontSize:11}}>{s.boardingCount||0}</div>;
                        case "eval": return <div key={k} style={{fontSize:11}}>{s.evalCount||0}</div>;
                        case "postEval": return <div key={k} style={{fontSize:11}}>{s.postEvalAppts||0}</div>;
                        case "tours": return <div key={k} style={{fontSize:11}}>{s.tourCount||0}</div>;
                        case "postTour": return <div key={k} style={{fontSize:11}}>{s.postTourAppts||0}</div>;
                        case "totalSpent": return <div key={k} style={{fontSize:11,fontWeight:600}}>${(s.totalSpent||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</div>;
                        case "nextRes": return <div key={k} style={{fontSize:11}}>{s.nextRes ? fmtDate(s.nextRes.checkIn) : <span style={{color:C.textMut}}>—</span>}</div>;
                        default: return <div key={k}></div>;
                      }
                    })}
                    <div></div>
                  </div>
                  {renderDogDetails(c)}
                </div>
              );
            })}
          </>;
        })()}
      </Card>

      {/* Mass Text Modal */}
      {showMassText && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10000}} onClick={() => setShowMassText(false)}>
          <div onClick={e => e.stopPropagation()} style={{background:C.surface,borderRadius:12,border:`1.5px solid ${C.border}`,width:"90%",maxWidth:700,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            {/* Header */}
            <div style={{padding:"20px 24px",borderBottom:`1.5px solid ${C.borderLight}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <h2 style={{margin:0,fontSize:18,fontWeight:800,color:C.text}}>Mass Text</h2>
                <p style={{margin:"4px 0 0",fontSize:12,color:C.textSec}}>{massTextSelected.size} client{massTextSelected.size !== 1 ? "s" : ""} selected</p>
              </div>
              <button onClick={() => setShowMassText(false)} style={{background:"none",border:"none",cursor:"pointer",padding:"4px 8px",color:C.textMut,fontSize:20,fontFamily:"inherit"}}>×</button>
            </div>

            {/* Body */}
            <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
              {/* Client List */}
              <div style={{flex:1,overflow:"auto",borderBottom:`1.5px solid ${C.borderLight}`,maxHeight:300}}>
                <div style={{padding:"12px 16px"}}>
                  <div style={{display:"flex",gap:8,marginBottom:12}}>
                    <Btn size="sm" variant="ghost" onClick={() => setMassTextSelected(new Set(activeList.filter(c => c.fields?.phone).map(c => c.id)))}>
                      Select All
                    </Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setMassTextSelected(new Set())}>
                      Deselect All
                    </Btn>
                  </div>
                  {activeList.filter(c => c.fields?.phone).map(client => (
                    <div key={client.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 8px",borderRadius:8,background:massTextSelected.has(client.id)?C.priLt:"transparent",marginBottom:8,cursor:"pointer"}} onClick={() => {
                      const n = new Set(massTextSelected);
                      if (n.has(client.id)) n.delete(client.id);
                      else n.add(client.id);
                      setMassTextSelected(n);
                    }}>
                      <input type="checkbox" checked={massTextSelected.has(client.id)} onChange={() => {}} style={{cursor:"pointer",width:18,height:18}} />
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:C.text}}>{client.fields?.first_name} {client.fields?.last_name}</div>
                        <div style={{fontSize:11,color:C.textSec}}>{client.fields?.phone}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Message Compose */}
              <div style={{padding:"16px 20px",borderBottom:`1.5px solid ${C.borderLight}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <label style={{fontSize:12,fontWeight:700,color:C.text}}>Message</label>
                  {(data.messageTemplates || []).filter(t => t.active !== false).length > 0 && (
                    <div style={{position:"relative"}}>
                      <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); const el = e.currentTarget; el.dataset.open = el.dataset.open === "1" ? "" : "1"; el.nextSibling.style.display = el.dataset.open === "1" ? "block" : "none"; }}>
                        <I.FileText /> Use Template
                      </Btn>
                      <div style={{display:"none",position:"absolute",right:0,top:"100%",zIndex:10,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.15)",minWidth:240,maxHeight:200,overflow:"auto"}}>
                        {(data.messageTemplates || []).filter(t => t.active !== false).map(tpl => (
                          <button key={tpl.id} onClick={e => { setMassTextBody(tpl.body); e.currentTarget.parentNode.style.display = "none"; e.currentTarget.parentNode.previousSibling.dataset.open = ""; }}
                            style={{display:"block",width:"100%",padding:"10px 14px",border:"none",borderBottom:`1px solid ${C.borderLight}`,background:"transparent",textAlign:"left",cursor:"pointer",fontFamily:"inherit",fontSize:12,color:C.text}}
                            onMouseEnter={e => e.currentTarget.style.background = C.priLt}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <div style={{fontWeight:600,marginBottom:2}}>{tpl.name}</div>
                            <div style={{color:C.textSec,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tpl.body.slice(0,80)}…</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <textarea
                  value={massTextBody}
                  onChange={e => setMassTextBody(e.target.value)}
                  placeholder="Type your message here or use a template..."
                  rows={4}
                  style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none",background:C.bg,boxSizing:"border-box"}}
                  onFocus={e => e.target.style.borderColor=C.pri}
                  onBlur={e => e.target.style.borderColor=C.border}
                />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,marginBottom:12}}>
                  <div style={{fontSize:11,color:C.textMut}}>Character count: {massTextBody.length}</div>
                  <div style={{fontSize:10,color:C.textSec}}>Variables will be personalized per client</div>
                </div>
                {/* Available Template Variables Reference (Item 18) */}
                <div style={{padding:12,background:C.bg,borderRadius:8,border:`1px solid ${C.borderLight}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.textMut,textTransform:"uppercase",marginBottom:8}}>Available Variables</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,fontSize:11,color:C.text}}>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{clientName}"}</code> — Client first &amp; last name</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{dogName}"}</code> — Dog's name</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{checkInDate}"}</code> — Check-in date</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{checkOutDate}"}</code> — Check-out date</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{roomType}"}</code> — Room type</div>
                    <div><code style={{background:C.surface,padding:"2px 6px",borderRadius:4,fontFamily:"monospace"}}>{"{totalPrice}"}</code> — Total cost</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{padding:"16px 20px",display:"flex",gap:10,justifyContent:"space-between",alignItems:"center"}}>
              <button onClick={() => setShowMassTextHistory(true)} style={{background:"none",border:"none",color:C.pri,cursor:"pointer",fontSize:12,fontWeight:600,textDecoration:"underline",padding:0,fontFamily:"inherit"}}>
                View History
              </button>
              <div style={{display:"flex",gap:8}}>
                <Btn variant="ghost" onClick={() => setShowMassText(false)}>Cancel</Btn>
                <Btn onClick={handleMassTextSend} disabled={!massTextBody.trim() || massTextSelected.size === 0}>
                  Send Mass Text
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mass Text History Modal */}
      {showMassTextHistory && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10001}} onClick={() => setShowMassTextHistory(false)}>
          <div onClick={e => e.stopPropagation()} style={{background:C.surface,borderRadius:12,border:`1.5px solid ${C.border}`,width:"90%",maxWidth:800,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            {/* Header */}
            <div style={{padding:"20px 24px",borderBottom:`1.5px solid ${C.borderLight}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:800,color:C.text}}>Mass Text History</h2>
              <button onClick={() => setShowMassTextHistory(false)} style={{background:"none",border:"none",cursor:"pointer",padding:"4px 8px",color:C.textMut,fontSize:20,fontFamily:"inherit"}}>×</button>
            </div>

            {/* Body */}
            <div style={{flex:1,overflow:"auto"}}>
              {(!data.massTextHistory || data.massTextHistory.length === 0) ? (
                <div style={{padding:"40px 24px",textAlign:"center"}}>
                  <p style={{color:C.textSec,fontSize:13}}>No mass texts sent yet</p>
                </div>
              ) : (
                <div>
                  {data.massTextHistory.map(entry => (
                    <div key={entry.id} style={{padding:"16px 20px",borderBottom:`1.5px solid ${C.borderLight}`,background:C.bg}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:C.text}}>
                            {entry.recipientCount} client{entry.recipientCount !== 1 ? "s" : ""}
                          </div>
                          <div style={{fontSize:11,color:C.textSec,marginTop:2}}>
                            {new Date(entry.sentAt).toLocaleDateString()} at {new Date(entry.sentAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} by {entry.sentBy}
                          </div>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:C.text,marginBottom:10,padding:"10px 12px",background:C.surface,borderRadius:6,borderLeft:`3px solid ${C.pri}`}}>
                        "{entry.body}"
                      </div>
                      <div style={{fontSize:11,color:C.textSec}}>
                        Recipients: {entry.recipientNames.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{padding:"16px 20px",borderTop:`1.5px solid ${C.borderLight}`,display:"flex",justifyContent:"flex-end"}}>
              <Btn variant="ghost" onClick={() => setShowMassTextHistory(false)}>Close</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Log Popover */}
      {logPopover && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9998}} onClick={()=>{setLogPopover(null);setLogNotes("");setLogDate("");}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",left:Math.min(logPopover.x||300,window.innerWidth-340),top:logPopover.y||200,zIndex:9999,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"16px 20px",width:310,boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>{logPopover.isRevive ? "Revive Client" : "Log Outreach"}</div>
            <textarea value={logNotes} onChange={e=>setLogNotes(e.target.value)} placeholder="Notes about this outreach..." rows={3}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,fontFamily:"inherit",resize:"vertical",outline:"none",background:C.bg,boxSizing:"border-box",marginBottom:10}}
              onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border} autoFocus />
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textSec,marginBottom:4}}>Next Follow-Up Date *</div>
              {(() => {
                const c = data.clients.find(cl => cl.id === logPopover.clientId);
                const src = c?.lifecycle?.conversion?.source;
                const isHighIntent = src === "eval" || src === "tour" || src === "ignite";
                const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
                const recDate = isHighIntent ? addD(1) : addD(2);
                const recHint = isHighIntent ? "Recommended: +1 day (high-intent lead). Use a further date if the client gave a specific callback date." : "Recommended: +2 days (standard follow-up). Use +1 day for high-intent leads or a further date if the client gave a specific callback date.";
                return <MiniDatePicker value={logDate} onChange={setLogDate} recommendedDate={recDate} recommendedHint={recHint} />;
              })()}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <Btn size="sm" variant="ghost" onClick={()=>{setLogPopover(null);setLogNotes("");setLogDate("");}}>Cancel</Btn>
              <Btn size="sm" onClick={handleSaveLog}>{logPopover.isRevive ? "Revive" : "Save Log"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ClientsPage };
