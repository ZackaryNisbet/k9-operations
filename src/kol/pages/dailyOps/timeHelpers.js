// K9 Operations — DailyOps time formatting helpers.
// Extracted verbatim from DailyOpsPage.jsx (pure functions, no page state).

export const formatTime = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
};

export const fmtTimeShort = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
};

export const ppNowTime = () => { const n = new Date(); return n.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
