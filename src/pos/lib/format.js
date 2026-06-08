const gid = () => crypto.randomUUID();

// Smart dog name formatter for message templates
function formatDogNames(dogs) {
  const names = dogs.map(d => d.fields?.name || "your dog").filter(Boolean);
  if (names.length === 0) return "your dog";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}
const titleCase = (s) => (s || "").replace(/\b\w/g, c => c.toUpperCase());
const fmtPhone = (p) => { const d = (p||"").replace(/\D/g,""); return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:p||""; };
const _toDateStr = (d) => { if(!d) return null; const s=String(d); if(s.length===10 && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const m=s.match(/^(\d{4}-\d{2}-\d{2})/); return m?m[1]:null; };
const fmtDate = (d) => { const ds=_toDateStr(d); if(!ds) return ""; const dt=new Date(ds+"T00:00:00"); return isNaN(dt.getTime())?"":dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); };
const fmtDateFull = (d) => { const ds=_toDateStr(d); if(!ds) return ""; const dt=new Date(ds+"T00:00:00"); return isNaN(dt.getTime())?"":`${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };
const fmtDateShort = (d) => { const ds=_toDateStr(d); if(!ds) return ""; const dt=new Date(ds+"T00:00:00"); return isNaN(dt.getTime())?"":`${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${String(dt.getFullYear()).slice(2)}`; };
const fmtTime = (t) => { if(!t) return ""; const [h,m] = t.split(":").map(Number); const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2,"0")} ${ampm}`; };
const fmtInstr = (v) => Array.isArray(v) ? v.join(", ") : (v || "");
const summarizeFeeding = (schedules) => { if(!schedules||!schedules.length) return ""; return schedules.map(s => { const t = (s.times||[]).join("/"); const instr = fmtInstr(s.instruction); return `${s.amount||""} ${s.unit||""} ${t} ${s.foodType||""} ${instr}`.trim(); }).join("; "); };
const summarizeMeds = (schedules) => { if(!schedules||!schedules.length) return "None"; return schedules.map(s => { const timeStr = (s.times && s.times.length) ? s.times.join(", ") : (s.time || ""); return `${s.name||""} ${s.amount||""} ${s.unit||""} @ ${timeStr}`.trim(); }).join("; "); };

const todayStr = () => { const d = (window.__K9_TIME_TRAVEL__ ? new Date(window.__K9_TIME_TRAVEL__ + "T12:00:00") : new Date()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const getSimulatedNow = () => window.__K9_TIME_TRAVEL__ ? new Date(window.__K9_TIME_TRAVEL__ + "T12:00:00") : new Date();
const formatTime12hr = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); if (isNaN(h)) return t; const suffix = h >= 12 ? "PM" : "AM"; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m || 0).padStart(2, "0")} ${suffix}`; };
const addDays = (d, n) => { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() + n); return dt.toISOString().split("T")[0]; };
const getMonday = (d) => { const dt = new Date(d + "T12:00:00"); const day = dt.getDay(); const diff = day === 0 ? -6 : 1 - day; dt.setDate(dt.getDate() + diff); return dt.toISOString().split("T")[0]; };
const getWeekDays = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
const shortDay = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
const dayNum = (d) => new Date(d + "T12:00:00").getDate();

export { gid, formatDogNames, titleCase, fmtPhone, _toDateStr, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, summarizeFeeding, summarizeMeds, todayStr, getSimulatedNow, formatTime12hr, addDays, getMonday, getWeekDays, shortDay, dayNum };
